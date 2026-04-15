import { supabase } from "@/lib/supabase";
import type {
  Category,
  Counterparty,
  CounterpartyInput,
  DashboardSummary,
  MonthlyStats,
  OverdueReceivable,
  Product,
  ProductInput,
  SupplierUnpaidTotal,
  TaxDeadlineInfo,
  TaxReportRow,
  TaxType,
  Transaction,
  TransactionInput,
  TransactionItem,
  TransactionTemplate,
  User,
} from "@/types";
import { splitVat } from "@/lib/tax";
import { uuid } from "@/lib/utils";
import { appendTransactionRow, ensureSheetHeader, readSheetRows, getSheetTabs, writeTabRows } from "@/lib/google";

function throwIf(error: { message: string } | null, context?: string): void {
  if (error) throw new Error(context ? `${context}: ${error.message}` : error.message);
}

function mapCategory(r: Record<string, unknown>): Category {
  return { ...(r as unknown as Category), tax_deductible: !!r.tax_deductible };
}

function mapTransaction(r: Record<string, unknown>): Transaction {
  return { ...(r as unknown as Transaction), synced_to_sheet: !!r.synced_to_sheet };
}

function mapProduct(r: Record<string, unknown>): Product {
  return { ...(r as unknown as Product), is_pending_delivery: !!r.is_pending_delivery };
}

// ---------- User ----------
export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);
  throwIf(error);
  return (data?.[0] as User) ?? null;
}

export async function updateUser(patch: Partial<Omit<User, "id" | "created_at">>): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("기본 사용자 정보를 찾을 수 없습니다.");
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("users").update(patch).eq("id", user.id);
  throwIf(error);
}

// ---------- Counterparty ----------
export async function listCounterparties(): Promise<Counterparty[]> {
  const { data, error } = await supabase
    .from("counterparties")
    .select("*")
    .eq("is_deleted", 0)
    .order("created_at", { ascending: false });
  throwIf(error);
  return (data ?? []) as Counterparty[];
}

export async function createCounterparty(input: CounterpartyInput): Promise<Counterparty> {
  const id = uuid("cp");
  const { error } = await supabase.from("counterparties").insert({
    id,
    name: input.name,
    type: input.type,
    phone: input.phone,
    commission_rate: input.commission_rate ?? 0,
    is_deleted: 0,
  });
  throwIf(error);
  const { data, error: selErr } = await supabase
    .from("counterparties")
    .select("*")
    .eq("id", id)
    .limit(1);
  throwIf(selErr);
  return (data?.[0] as Counterparty)!;
}

export async function updateCounterparty(
  id: string,
  patch: Partial<Omit<Counterparty, "id" | "created_at">>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("counterparties").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteCounterparty(id: string): Promise<void> {
  const { error } = await supabase.from("counterparties").update({ is_deleted: 1 }).eq("id", id);
  throwIf(error);
}

// ---------- Category ----------
export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("name", { ascending: true });
  throwIf(error);
  return (data ?? []).map((r) => mapCategory(r as Record<string, unknown>));
}

// ---------- Product ----------
export async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_deleted", 0)
    .order("created_at", { ascending: false });
  throwIf(error);
  return (data ?? []).map((r) => mapProduct(r as Record<string, unknown>));
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const id = uuid("prd");
  const { error } = await supabase.from("products").insert({
    id,
    name: input.name,
    color: input.color,
    purchase_price: Math.trunc(input.purchase_price),
    sale_price: Math.trunc(input.sale_price),
    stock: Math.trunc(input.stock),
    memo: input.memo,
    counterparty_id: input.counterparty_id ?? null,
    purchase_date: input.purchase_date ?? null,
    is_pending_delivery: input.is_pending_delivery ? 1 : 0,
    expected_arrival_date: input.expected_arrival_date ?? null,
    is_deleted: 0,
  });
  throwIf(error);
  const { data, error: selErr } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .limit(1);
  throwIf(selErr);
  return mapProduct((data?.[0] ?? {}) as Record<string, unknown>);
}

export async function updateProduct(
  id: string,
  patch: Partial<Omit<Product, "id" | "created_at">>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    normalized[k] = k === "is_pending_delivery" ? (v ? 1 : 0) : v;
  }
  const { error } = await supabase.from("products").update(normalized).eq("id", id);
  throwIf(error);
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from("products").update({ is_deleted: 1 }).eq("id", id);
  throwIf(error);
}

// ---------- Transaction Items ----------
export async function listTransactionItems(
  transactionId: string,
): Promise<TransactionItem[]> {
  const { data, error } = await supabase
    .from("transaction_items")
    .select("*, products(name, color)")
    .eq("transaction_id", transactionId);
  throwIf(error);
  return (data ?? []).map((r: Record<string, unknown>) => {
    const product = r.products as { name?: string | null; color?: string | null } | null;
    return {
      id: r.id as string,
      transaction_id: r.transaction_id as string,
      product_id: r.product_id as string,
      quantity: r.quantity as number,
      unit_price: r.unit_price as number,
      product_name: product?.name ?? undefined,
      product_color: product?.color ?? null,
    };
  });
}

// ---------- Transaction ----------
export async function listTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  throwIf(error);
  const txns = (data ?? []).map((r) => mapTransaction(r as Record<string, unknown>));
  if (txns.length === 0) return txns;
  const ids = txns.filter((t) => t.type !== "expense").map((t) => t.id);
  if (ids.length === 0) return txns;
  const { data: itemData, error: itemErr } = await supabase
    .from("transaction_items")
    .select("*, products(name, color)")
    .in("transaction_id", ids);
  throwIf(itemErr);
  const grouped = new Map<string, TransactionItem[]>();
  for (const r of (itemData ?? []) as Record<string, unknown>[]) {
    const product = r.products as { name?: string | null; color?: string | null } | null;
    const txnId = r.transaction_id as string;
    const list = grouped.get(txnId) ?? [];
    list.push({
      id: r.id as string,
      transaction_id: txnId,
      product_id: r.product_id as string,
      quantity: r.quantity as number,
      unit_price: r.unit_price as number,
      product_name: product?.name ?? undefined,
      product_color: product?.color ?? null,
    });
    grouped.set(txnId, list);
  }
  for (const t of txns) {
    if (t.type !== "expense") t.items = grouped.get(t.id) ?? [];
  }
  return txns;
}

export async function createTransaction(
  input: TransactionInput,
  taxType: TaxType,
): Promise<Transaction> {
  const txnId = uuid("txn");
  const insertedItemIds: string[] = [];
  const stockDeltas: { productId: string; delta: number }[] = [];

  const isItemized = input.type === "purchase" || input.type === "sale";
  if (isItemized && (!input.items || input.items.length === 0)) {
    throw new Error("상품 항목을 1개 이상 추가해 주세요.");
  }

  const commission = Math.trunc(input.commission_amount ?? 0);
  let amount = Math.trunc(input.amount);
  if (isItemized) {
    const itemsTotal = input.items.reduce(
      (sum, it) => sum + Math.trunc(it.quantity) * Math.trunc(it.unit_price),
      0,
    );
    amount = itemsTotal + commission;
  }

  try {
    const { error: txnErr } = await supabase.from("transactions").insert({
      id: txnId,
      date: input.date,
      type: input.type,
      amount,
      counterparty_id: input.counterparty_id,
      category_id: input.category_id,
      memo: input.memo,
      payment_status: input.payment_status,
      synced_to_sheet: 0,
      commission_amount: commission,
    });
    throwIf(txnErr);

    if (isItemized) {
      for (const it of input.items) {
        const itemId = uuid("ti");
        const qty = Math.trunc(it.quantity);
        const price = Math.trunc(it.unit_price);
        const { error: itemErr } = await supabase.from("transaction_items").insert({
          id: itemId,
          transaction_id: txnId,
          product_id: it.product_id,
          quantity: qty,
          unit_price: price,
        });
        throwIf(itemErr);
        insertedItemIds.push(itemId);
        const delta = input.type === "purchase" ? qty : -qty;
        // Fetch current stock, apply delta, update
        const { data: prodRows, error: prodErr } = await supabase
          .from("products")
          .select("stock")
          .eq("id", it.product_id)
          .limit(1);
        throwIf(prodErr);
        const currentStock = Number((prodRows?.[0] as { stock?: number } | undefined)?.stock ?? 0);
        const { error: updErr } = await supabase
          .from("products")
          .update({ stock: currentStock + delta })
          .eq("id", it.product_id);
        throwIf(updErr);
        stockDeltas.push({ productId: it.product_id, delta });
      }
    }

    // Auto-create TaxRecord
    const { supply_amount, vat_amount } = splitVat(amount, taxType);
    const { data: catRows, error: catErr } = await supabase
      .from("categories")
      .select("*")
      .eq("id", input.category_id)
      .limit(1);
    throwIf(catErr);
    const cat = catRows?.[0] ? mapCategory(catRows[0] as Record<string, unknown>) : null;
    const isRefundable = cat ? !!cat.tax_deductible && input.type === "purchase" : false;

    const { error: taxErr } = await supabase.from("tax_records").insert({
      id: uuid("tax"),
      transaction_id: txnId,
      supply_amount,
      vat_amount,
      is_refundable: isRefundable ? 1 : 0,
      tax_invoice_issued: 0,
    });
    throwIf(taxErr);
  } catch (err) {
    // Best-effort rollback.
    for (const s of stockDeltas) {
      try {
        const { data: prodRows } = await supabase
          .from("products")
          .select("stock")
          .eq("id", s.productId)
          .limit(1);
        const currentStock = Number((prodRows?.[0] as { stock?: number } | undefined)?.stock ?? 0);
        await supabase
          .from("products")
          .update({ stock: currentStock - s.delta })
          .eq("id", s.productId);
      } catch {
        // ignore
      }
    }
    for (const itemId of insertedItemIds) {
      try {
        await supabase.from("transaction_items").delete().eq("id", itemId);
      } catch {
        // ignore
      }
    }
    try {
      await supabase.from("tax_records").delete().eq("transaction_id", txnId);
    } catch {
      // ignore
    }
    try {
      await supabase.from("transactions").delete().eq("id", txnId);
    } catch {
      // ignore
    }
    throw err;
  }

  // Google Sheets 자동 append (실패해도 로컬 저장은 유지)
  try {
    const user = await getCurrentUser();
    if (user?.google_sheet_id) {
      await ensureSheetHeader({
        sheet_id: user.google_sheet_id,
        tab: input.date.slice(0, 7),
      });
      const cp = input.counterparty_id
        ? (await listCounterparties()).find((c) => c.id === input.counterparty_id)
        : null;
      const categoryAll = await listCategories();
      const category = categoryAll.find((c) => c.id === input.category_id);
      let itemsSummary = "";
      if (isItemized) {
        const products = await listProducts();
        const productMap = new Map(products.map((p) => [p.id, p]));
        itemsSummary = input.items
          .map((it) => {
            const p = productMap.get(it.product_id);
            const name = p?.name ?? it.product_id;
            const color = p?.color ? ` ${p.color}` : "";
            return `${name}${color}×${it.quantity}`;
          })
          .join(", ");
      }
      await appendTransactionRow(
        {
          sheet_id: user.google_sheet_id,
          tab: input.date.slice(0, 7),
        },
        {
          date: input.date,
          type: typeKo(input.type),
          counterparty: cp?.name ?? "",
          category: category?.name ?? "",
          items_summary: itemsSummary,
          commission_amount: commission,
          amount,
          payment_status: input.payment_status,
          memo: input.memo ?? "",
        },
      );
      await supabase.from("transactions").update({ synced_to_sheet: 1 }).eq("id", txnId);
    }
  } catch (e) {
    console.warn("[google] sheet append failed, will require manual retry:", e);
  }

  const { data: finalRows, error: finalErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", txnId)
    .limit(1);
  throwIf(finalErr);
  return mapTransaction((finalRows?.[0] ?? {}) as Record<string, unknown>);
}

export async function deleteTransaction(id: string): Promise<void> {
  const { data: txnRows, error: txnErr } = await supabase
    .from("transactions")
    .select("type")
    .eq("id", id)
    .limit(1);
  throwIf(txnErr);
  if (!txnRows || txnRows.length === 0) return;
  const type = (txnRows[0] as { type: string }).type;

  if (type === "purchase" || type === "sale") {
    const { data: items, error: itemsErr } = await supabase
      .from("transaction_items")
      .select("product_id, quantity")
      .eq("transaction_id", id);
    throwIf(itemsErr);
    for (const item of (items ?? []) as { product_id: string; quantity: number }[]) {
      const reverseDelta = type === "purchase" ? -item.quantity : item.quantity;
      const { data: prodRows } = await supabase
        .from("products")
        .select("stock")
        .eq("id", item.product_id)
        .limit(1);
      const currentStock = Number((prodRows?.[0] as { stock?: number } | undefined)?.stock ?? 0);
      await supabase
        .from("products")
        .update({ stock: currentStock + reverseDelta })
        .eq("id", item.product_id);
    }
  }

  await supabase.from("transaction_items").delete().eq("transaction_id", id);
  await supabase.from("tax_records").delete().eq("transaction_id", id);
  const { error: delErr } = await supabase.from("transactions").delete().eq("id", id);
  throwIf(delErr);
}

function typeKo(t: Transaction["type"]): string {
  switch (t) {
    case "purchase":
      return "구매";
    case "sale":
      return "판매";
    case "expense":
      return "지출";
    default:
      return t;
  }
}

export async function syncTransactionToSheet(txnId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.google_sheet_id) {
    throw new Error("구글시트가 설정되지 않았습니다.");
  }
  const { data: rows, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", txnId)
    .limit(1);
  throwIf(error);
  const raw = rows?.[0];
  if (!raw) throw new Error("거래를 찾을 수 없습니다.");
  const txn = mapTransaction(raw as Record<string, unknown>);
  const cp = txn.counterparty_id
    ? (await listCounterparties()).find((c) => c.id === txn.counterparty_id)
    : null;
  const category = (await listCategories()).find((c) => c.id === txn.category_id);
  const items = txn.type !== "expense" ? await listTransactionItems(txnId) : [];
  const itemsSummary = items
    .map((it) => {
      const name = it.product_name ?? it.product_id;
      const color = it.product_color ? ` ${it.product_color}` : "";
      return `${name}${color}×${it.quantity}`;
    })
    .join(", ");
  await appendTransactionRow(
    {
      sheet_id: user.google_sheet_id,
      tab: txn.date.slice(0, 7),
    },
    {
      date: txn.date,
      type: typeKo(txn.type),
      counterparty: cp?.name ?? "",
      category: category?.name ?? "",
      items_summary: itemsSummary,
      commission_amount: Math.trunc(txn.commission_amount),
      amount: Math.trunc(txn.amount),
      payment_status: txn.payment_status,
      memo: txn.memo ?? "",
    },
  );
  await supabase.from("transactions").update({ synced_to_sheet: 1 }).eq("id", txnId);
}

// ---------- Sheet Sync ----------
export async function resetSheetSync(): Promise<void> {
  // Supabase requires a filter for update; use a wide filter.
  const { error } = await supabase
    .from("transactions")
    .update({ synced_to_sheet: 0 })
    .neq("id", "__none__");
  throwIf(error);
}

export async function syncAllTransactions(
  onProgress?: (done: number, total: number) => void,
): Promise<{ success: number; failed: number }> {
  const user = await getCurrentUser();
  if (!user?.google_sheet_id) {
    throw new Error("구글시트가 설정되지 않았습니다.");
  }
  const sheetId = user.google_sheet_id;
  const HEADER = ["날짜", "유형", "거래처", "분류", "상품내역", "수수료", "금액", "결제상태", "메모"];

  const { data: txRows, error: txErr } = await supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: true });
  throwIf(txErr);
  const rows = (txRows ?? []).map((r) => mapTransaction(r as Record<string, unknown>));
  const total = rows.length;
  const counterparties = await listCounterparties();
  const categories = await listCategories();
  const cpMap = new Map(counterparties.map((c) => [c.id, c]));
  const catMap = new Map(categories.map((c) => [c.id, c]));

  // Batch-fetch items for all itemized transactions in one query
  const itemizedIds = rows.filter((t) => t.type !== "expense").map((t) => t.id);
  const itemsByTxn = new Map<string, TransactionItem[]>();
  if (itemizedIds.length > 0) {
    const { data: itemData, error: itemErr } = await supabase
      .from("transaction_items")
      .select("*, products(name, color)")
      .in("transaction_id", itemizedIds);
    throwIf(itemErr);
    for (const r of (itemData ?? []) as Record<string, unknown>[]) {
      const product = r.products as { name?: string | null; color?: string | null } | null;
      const txnId = r.transaction_id as string;
      const list = itemsByTxn.get(txnId) ?? [];
      list.push({
        id: r.id as string,
        transaction_id: txnId,
        product_id: r.product_id as string,
        quantity: r.quantity as number,
        unit_price: r.unit_price as number,
        product_name: product?.name ?? undefined,
        product_color: product?.color ?? null,
      });
      itemsByTxn.set(txnId, list);
    }
  }

  // 월별로 그룹화
  const byMonth = new Map<string, Transaction[]>();
  for (const txn of rows) {
    const month = txn.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(txn);
  }

  let success = 0;
  let failed = 0;
  let done = 0;

  for (const [month, monthRows] of byMonth) {
    const dataRows: string[][] = [];
    for (const txn of monthRows) {
      try {
        const items = txn.type !== "expense" ? itemsByTxn.get(txn.id) ?? [] : [];
        const itemsSummary = items
          .map((it) => {
            const name = it.product_name ?? it.product_id;
            const color = it.product_color ? ` ${it.product_color}` : "";
            return `${name}${color}×${it.quantity}`;
          })
          .join(", ");
        dataRows.push([
          txn.date,
          typeKo(txn.type),
          cpMap.get(txn.counterparty_id ?? "")?.name ?? "",
          catMap.get(txn.category_id)?.name ?? "",
          itemsSummary,
          String(Math.trunc(txn.commission_amount)),
          String(Math.trunc(txn.amount)),
          txn.payment_status === "paid" ? "완료" : "대납",
          txn.memo ?? "",
        ]);
        success++;
      } catch {
        failed++;
      }
      done++;
      onProgress?.(done, total);
    }
    await writeTabRows(sheetId, month, HEADER, dataRows);
    await supabase
      .from("transactions")
      .update({ synced_to_sheet: 1 })
      .like("date", `${month}%`);
  }
  return { success, failed };
}

export async function restoreFromSheet(
  onProgress?: (done: number, total: number) => void,
): Promise<{ restored: number; skipped: number }> {
  const user = await getCurrentUser();
  if (!user?.google_sheet_id) {
    throw new Error("구글시트가 설정되지 않았습니다.");
  }
  const sheetId = user.google_sheet_id;
  const allTabs = await getSheetTabs(sheetId);
  const monthTabs = allTabs.filter((t) => /^\d{4}-\d{2}$/.test(t)).sort();
  const fixedTab = user.google_sheet_tab || "Transactions";
  if (monthTabs.length === 0 && allTabs.includes(fixedTab)) {
    monthTabs.push(fixedTab);
  }

  const allRows: string[][] = [];
  for (const tab of monthTabs) {
    const rows = await readSheetRows({ sheet_id: sheetId, tab });
    allRows.push(...rows);
  }
  const sheetRows = allRows;
  const total = sheetRows.length;
  let restored = 0;
  let skipped = 0;

  const { data: existing, error: existingErr } = await supabase
    .from("transactions")
    .select("date, amount, type");
  throwIf(existingErr);
  const existingSet = new Set(
    ((existing ?? []) as { date: string; amount: number; type: string }[]).map(
      (e) => `${e.date}|${e.type}|${e.amount}`,
    ),
  );

  const counterparties = await listCounterparties();
  const categories = await listCategories();
  const cpByName = new Map(counterparties.map((c) => [c.name, c]));
  const catByName = new Map(categories.map((c) => [c.name, c]));

  for (let i = 0; i < sheetRows.length; i++) {
    const row = sheetRows[i]!;
    const date = row[0] ?? "";
    const typeKoVal = row[1] ?? "";
    const counterpartyName = row[2] ?? "";
    const categoryName = row[3] ?? "";
    const commission = Number(row[5]) || 0;
    const amount = Number(row[6]) || 0;
    const paymentStatus = (row[7] === "외상" || row[7] === "대납") ? "pending" : "paid";
    const memo = row[8] ?? "";

    if (!date) { skipped++; onProgress?.(i + 1, total); continue; }

    const type = typeKoVal === "구매" ? "purchase"
      : typeKoVal === "판매" ? "sale"
      : typeKoVal === "지출" ? "expense"
      : "";
    if (!type) { skipped++; onProgress?.(i + 1, total); continue; }

    const key = `${date}|${type}|${amount}`;
    if (existingSet.has(key)) {
      skipped++;
      onProgress?.(i + 1, total);
      continue;
    }

    const cp = counterpartyName ? cpByName.get(counterpartyName) : null;

    let cat = categoryName ? catByName.get(categoryName) : null;
    if (!cat) {
      cat = categories.find((c) => c.type === type) ?? null;
    }
    if (!cat) { skipped++; onProgress?.(i + 1, total); continue; }

    const txnId = uuid("txn");
    const { error: insErr } = await supabase.from("transactions").insert({
      id: txnId,
      date,
      type,
      amount,
      counterparty_id: cp?.id ?? null,
      category_id: cat.id,
      memo: memo || null,
      payment_status: paymentStatus,
      synced_to_sheet: 1,
      commission_amount: commission,
    });
    if (insErr) {
      skipped++;
    } else {
      existingSet.add(key);
      restored++;
    }
    onProgress?.(i + 1, total);
  }
  return { restored, skipped };
}

// ---------- Dashboard ----------
export async function getCurrentMonthSummary(
  year: number,
  month: number,
): Promise<DashboardSummary> {
  const mm = String(month).padStart(2, "0");
  const prefix = `${year}-${mm}`;
  const { data, error } = await supabase
    .from("transactions")
    .select("type, amount")
    .like("date", `${prefix}%`);
  throwIf(error);
  let sales = 0;
  let expense = 0;
  let count = 0;
  for (const r of (data ?? []) as { type: string; amount: number }[]) {
    count++;
    if (r.type === "sale") sales += Number(r.amount);
    else if (r.type === "purchase" || r.type === "expense") expense += Number(r.amount);
  }
  return { sales, expense, netIncome: sales - expense, count };
}

export async function getOverdueReceivables(): Promise<OverdueReceivable[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("counterparty_id, amount, date")
    .eq("type", "sale")
    .eq("payment_status", "pending")
    .not("counterparty_id", "is", null);
  throwIf(error);
  const rows = (data ?? []) as { counterparty_id: string; amount: number; date: string }[];
  if (rows.length === 0) return [];
  const agg = new Map<string, { total: number; earliest: string }>();
  for (const r of rows) {
    const cur = agg.get(r.counterparty_id);
    if (!cur) {
      agg.set(r.counterparty_id, { total: Number(r.amount), earliest: r.date });
    } else {
      cur.total += Number(r.amount);
      if (r.date < cur.earliest) cur.earliest = r.date;
    }
  }
  const counterparties = await listCounterparties();
  const cpMap = new Map(counterparties.map((c) => [c.id, c]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const results: OverdueReceivable[] = [];
  const sorted = Array.from(agg.entries()).sort((a, b) =>
    a[1].earliest.localeCompare(b[1].earliest),
  );
  for (const [cpId, v] of sorted) {
    const cp = cpMap.get(cpId);
    if (!cp) continue;
    const earliest = new Date(v.earliest);
    earliest.setHours(0, 0, 0, 0);
    const daysPending = Math.floor((today.getTime() - earliest.getTime()) / 86_400_000);
    results.push({ counterparty: cp, total: v.total, earliestDate: v.earliest, daysPending });
  }
  return results;
}

export async function getLowStockProducts(threshold = 5): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_deleted", 0)
    .lte("stock", threshold)
    .order("stock", { ascending: true });
  throwIf(error);
  return (data ?? []).map((r) => mapProduct(r as Record<string, unknown>));
}

export async function getPendingDeliveryProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_deleted", 0)
    .eq("is_pending_delivery", 1)
    .order("expected_arrival_date", { ascending: true });
  throwIf(error);
  return (data ?? []).map((r) => mapProduct(r as Record<string, unknown>));
}

export async function getNextTaxDeadline(): Promise<TaxDeadlineInfo> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const y = today.getFullYear();

  const candidates = [
    { date: new Date(y, 3, 25), label: `${y}년 1기 예정`, start: `${y}-01-01`, end: `${y}-03-31` },
    { date: new Date(y, 6, 25), label: `${y}년 1기 확정`, start: `${y}-01-01`, end: `${y}-06-30` },
    { date: new Date(y, 9, 25), label: `${y}년 2기 예정`, start: `${y}-07-01`, end: `${y}-09-30` },
    { date: new Date(y + 1, 0, 25), label: `${y}년 2기 확정`, start: `${y}-07-01`, end: `${y}-12-31` },
  ];

  const chosen = candidates.find((c) => c.date >= today) ?? candidates[candidates.length - 1]!;
  const daysLeft = Math.ceil((chosen.date.getTime() - today.getTime()) / 86_400_000);

  // Fetch transactions in the period, then sum vat_amount from tax_records
  const { data: txnRows, error: txnErr } = await supabase
    .from("transactions")
    .select("id")
    .gte("date", chosen.start)
    .lte("date", chosen.end);
  throwIf(txnErr);
  const txnIds = ((txnRows ?? []) as { id: string }[]).map((r) => r.id);
  let totalVat = 0;
  if (txnIds.length > 0) {
    const { data: taxRows, error: taxErr } = await supabase
      .from("tax_records")
      .select("vat_amount, transaction_id")
      .in("transaction_id", txnIds);
    throwIf(taxErr);
    for (const t of (taxRows ?? []) as { vat_amount: number }[]) {
      totalVat += Number(t.vat_amount) || 0;
    }
  }

  return {
    deadlineDate: chosen.date.toISOString().slice(0, 10),
    daysLeft,
    periodLabel: chosen.label,
    estimatedVat: totalVat,
  };
}

export async function getTodayUnpaidBySupplier(): Promise<SupplierUnpaidTotal[]> {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const dateStr = `${y}-${m}-${d}`;
  const { data, error } = await supabase
    .from("transactions")
    .select("counterparty_id, amount")
    .eq("date", dateStr)
    .eq("type", "purchase")
    .eq("payment_status", "pending")
    .not("counterparty_id", "is", null);
  throwIf(error);
  const rows = (data ?? []) as { counterparty_id: string; amount: number }[];
  if (rows.length === 0) return [];
  const agg = new Map<string, number>();
  for (const r of rows) {
    agg.set(r.counterparty_id, (agg.get(r.counterparty_id) ?? 0) + Number(r.amount));
  }
  const counterparties = await listCounterparties();
  const cpMap = new Map(counterparties.map((c) => [c.id, c]));
  const results: SupplierUnpaidTotal[] = [];
  for (const [cpId, total] of agg) {
    const cp = cpMap.get(cpId);
    if (cp) results.push({ counterparty: cp, total });
  }
  return results;
}

// ---------- Cashflow Prediction ----------
export async function getMonthlyStats(months = 6): Promise<MonthlyStats[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("transactions")
    .select("date, type, amount")
    .gte("date", sinceStr);
  throwIf(error);
  const monthMap = new Map<string, MonthlyStats>();
  for (const r of (data ?? []) as { date: string; type: string; amount: number }[]) {
    const month = r.date.slice(0, 7);
    const entry = monthMap.get(month) ?? { month, sales: 0, expense: 0 };
    if (r.type === "sale") entry.sales += Number(r.amount);
    else if (r.type === "purchase" || r.type === "expense") entry.expense += Number(r.amount);
    monthMap.set(month, entry);
  }
  return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export async function getMonthlyStatsByRange(
  startDate: string,
  endDate: string,
): Promise<MonthlyStats[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("date, type, amount")
    .gte("date", startDate)
    .lte("date", endDate);
  throwIf(error);
  const monthMap = new Map<string, MonthlyStats>();
  for (const r of (data ?? []) as { date: string; type: string; amount: number }[]) {
    const month = r.date.slice(0, 7);
    const entry = monthMap.get(month) ?? { month, sales: 0, expense: 0 };
    if (r.type === "sale") entry.sales += Number(r.amount);
    else if (r.type === "purchase" || r.type === "expense") entry.expense += Number(r.amount);
    monthMap.set(month, entry);
  }
  return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
}

// ---------- Tax Report ----------
export async function getTaxReport(
  startDate: string,
  endDate: string,
): Promise<TaxReportRow[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "date, type, amount, memo, counterparties(name), categories(name), tax_records(supply_amount, vat_amount, is_refundable)",
    )
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });
  throwIf(error);
  const rows = (data ?? []) as Record<string, unknown>[];
  const results: TaxReportRow[] = [];
  for (const r of rows) {
    const cp = r.counterparties as { name?: string | null } | null;
    const cat = r.categories as { name?: string | null } | null;
    const taxArr = r.tax_records as
      | { supply_amount: number; vat_amount: number; is_refundable: number }[]
      | { supply_amount: number; vat_amount: number; is_refundable: number }
      | null;
    const tax = Array.isArray(taxArr) ? taxArr[0] : taxArr;
    if (!tax) continue;
    results.push({
      date: r.date as string,
      transactionType: r.type as string,
      counterparty: cp?.name ?? "",
      category: cat?.name ?? "",
      amount: Number(r.amount),
      supplyAmount: Number(tax.supply_amount),
      vatAmount: Number(tax.vat_amount),
      isRefundable: !!tax.is_refundable,
      memo: (r.memo as string) ?? "",
    });
  }
  return results;
}

// ---------- JSON Backup / Restore ----------
export async function exportAllData(): Promise<string> {
  const [users, counterparties, categories, products, transactions, transactionItems, taxRecords] =
    await Promise.all([
      supabase.from("users").select("*"),
      supabase.from("counterparties").select("*"),
      supabase.from("categories").select("*"),
      supabase.from("products").select("*"),
      supabase.from("transactions").select("*").order("date", { ascending: true }),
      supabase.from("transaction_items").select("*"),
      supabase.from("tax_records").select("*"),
    ]);
  for (const res of [users, counterparties, categories, products, transactions, transactionItems, taxRecords]) {
    throwIf(res.error);
  }
  return JSON.stringify(
    {
      version: 1,
      exported_at: new Date().toISOString(),
      users: users.data ?? [],
      counterparties: counterparties.data ?? [],
      categories: categories.data ?? [],
      products: products.data ?? [],
      transactions: transactions.data ?? [],
      transaction_items: transactionItems.data ?? [],
      tax_records: taxRecords.data ?? [],
    },
    null,
    2,
  );
}

export async function importAllData(
  json: string,
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const data = JSON.parse(json) as {
    version?: number;
    counterparties?: unknown[];
    products?: unknown[];
    transactions?: unknown[];
    transaction_items?: unknown[];
    tax_records?: unknown[];
  };

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  async function upsertRows(table: string, rows: unknown[]) {
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      try {
        const { data: existing, error: selErr } = await supabase
          .from(table)
          .select("id")
          .eq("id", r.id as string)
          .limit(1);
        if (selErr) {
          errors.push(`${table}: ${selErr.message}`);
          skipped++;
          continue;
        }
        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }
        const { error: insErr } = await supabase.from(table).insert(r);
        if (insErr) {
          errors.push(`${table}: ${insErr.message}`);
          skipped++;
        } else {
          imported++;
        }
      } catch (e) {
        errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
        skipped++;
      }
    }
  }

  if (data.counterparties?.length) await upsertRows("counterparties", data.counterparties);
  if (data.products?.length) await upsertRows("products", data.products);
  if (data.transactions?.length) await upsertRows("transactions", data.transactions);
  if (data.transaction_items?.length) await upsertRows("transaction_items", data.transaction_items);
  if (data.tax_records?.length) await upsertRows("tax_records", data.tax_records);

  return { imported, skipped, errors };
}

// ---------- Counterparty Debt Ledger ----------
export async function getCounterpartyPendingTransactions(
  counterpartyId: string,
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("counterparty_id", counterpartyId)
    .eq("payment_status", "pending")
    .order("date", { ascending: true });
  throwIf(error);
  return (data ?? []).map((r) => mapTransaction(r as Record<string, unknown>));
}

export async function settleTransaction(transactionId: string): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .update({ payment_status: "paid" })
    .eq("id", transactionId);
  throwIf(error);
}

// ---------- Counterparty Statement ----------
export interface StatementRow {
  date: string;
  type: string;
  category: string;
  amount: number;
  commission_amount: number;
  payment_status: string;
  memo: string;
}

export async function getCounterpartyStatement(
  counterpartyId: string,
  startDate: string,
  endDate: string,
): Promise<StatementRow[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("date, type, amount, commission_amount, payment_status, memo, category_id")
    .eq("counterparty_id", counterpartyId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });
  throwIf(error);
  const categories = await listCategories();
  const catMap = new Map(categories.map((c) => [c.id, c]));
  return ((data ?? []) as {
    date: string;
    type: string;
    amount: number;
    commission_amount: number;
    payment_status: string;
    memo: string | null;
    category_id: string;
  }[]).map((r) => ({
    date: r.date,
    type: r.type,
    category: catMap.get(r.category_id)?.name ?? "",
    amount: Number(r.amount),
    commission_amount: Number(r.commission_amount),
    payment_status: r.payment_status,
    memo: r.memo ?? "",
  }));
}

// ---------- Transaction Templates ----------
export async function listTransactionTemplates(): Promise<TransactionTemplate[]> {
  const { data, error } = await supabase
    .from("transaction_templates")
    .select("*")
    .order("name", { ascending: true });
  throwIf(error);
  return (data ?? []) as TransactionTemplate[];
}

export async function saveTransactionTemplate(
  name: string,
  input: Pick<TransactionInput, "type" | "counterparty_id" | "category_id" | "memo"> & {
    amount: number;
    commission_amount: number;
  },
): Promise<void> {
  const id = uuid("tpl");
  const { error } = await supabase.from("transaction_templates").upsert(
    {
      id,
      name,
      type: input.type,
      counterparty_id: input.counterparty_id,
      category_id: input.category_id,
      amount: input.amount,
      commission_amount: input.commission_amount,
      memo: input.memo ?? null,
    },
    { onConflict: "name" },
  );
  throwIf(error);
}

export async function deleteTransactionTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("transaction_templates").delete().eq("id", id);
  throwIf(error);
}

// ---------- Sheet: 재고 탭 동기화 ----------
export async function syncStockToSheet(): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.google_sheet_id) throw new Error("구글시트가 설정되지 않았습니다.");
  const products = await listProducts();
  const HEADER = ["상품명", "색상", "재고", "사입가", "판매가", "마진율", "미송여부", "입고예정일"];
  const dataRows: string[][] = products.map((p) => {
    const margin =
      p.sale_price && p.purchase_price && p.purchase_price > 0
        ? `${Math.round(((p.sale_price - p.purchase_price) / p.purchase_price) * 100)}%`
        : "";
    return [
      p.name,
      p.color ?? "",
      String(p.stock),
      p.purchase_price != null ? String(p.purchase_price) : "",
      p.sale_price != null ? String(p.sale_price) : "",
      margin,
      p.is_pending_delivery ? "미송" : "",
      p.expected_arrival_date ?? "",
    ];
  });
  await writeTabRows(user.google_sheet_id, "재고", HEADER, dataRows);
}

// ---------- Sheet: 거래처 요약 탭 ----------
export async function syncSummaryToSheet(): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.google_sheet_id) throw new Error("구글시트가 설정되지 않았습니다.");

  const counterparties = await listCounterparties();
  const { data: txData, error } = await supabase
    .from("transactions")
    .select("counterparty_id, type, amount, payment_status");
  throwIf(error);
  const txns = (txData ?? []) as {
    counterparty_id: string | null;
    type: string;
    amount: number;
    payment_status: string;
  }[];

  type SummaryRow = { name: string; total_sales: number; total_purchase: number; pending: number };
  const summaries: SummaryRow[] = counterparties.map((c) => {
    let total_sales = 0;
    let total_purchase = 0;
    let pending = 0;
    for (const t of txns) {
      if (t.counterparty_id !== c.id) continue;
      const amt = Number(t.amount);
      if (t.type === "sale") total_sales += amt;
      if (t.type === "purchase") total_purchase += amt;
      if (t.type === "sale" && t.payment_status === "pending") pending += amt;
    }
    return { name: c.name, total_sales, total_purchase, pending };
  });
  summaries.sort((a, b) => b.total_sales - a.total_sales);

  const HEADER = ["거래처", "총 판매", "총 구매", "미수금"];
  const dataRows: string[][] = summaries.map((r) => [
    r.name,
    String(Math.trunc(r.total_sales)),
    String(Math.trunc(r.total_purchase)),
    String(Math.trunc(r.pending)),
  ]);
  await writeTabRows(user.google_sheet_id, "요약", HEADER, dataRows);
}

// ---------- Sheet: 정산서 탭 내보내기 ----------
export async function exportStatementToSheet(
  counterpartyId: string,
  year: number,
  month: number,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.google_sheet_id) throw new Error("구글시트가 설정되지 않았습니다.");
  const mm = String(month).padStart(2, "0");
  const monthStr = `${year}-${mm}`;
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${monthStr}-01`;
  const endDate = `${monthStr}-${String(lastDay).padStart(2, "0")}`;
  const rows = await getCounterpartyStatement(counterpartyId, startDate, endDate);
  const counterparties = await listCounterparties();
  const cpName = counterparties.find((c) => c.id === counterpartyId)?.name ?? counterpartyId;
  const tabName = `정산-${cpName}-${monthStr}`;

  const HEADER = ["날짜", "유형", "상품내역", "금액", "결제상태"];
  const dataRows: string[][] = rows.map((r) => [
    r.date,
    r.type === "purchase" ? "구매" : r.type === "sale" ? "판매" : "지출",
    r.memo,
    String(Math.trunc(r.amount)),
    r.payment_status === "paid" ? "완료" : "대납",
  ]);
  await writeTabRows(user.google_sheet_id, tabName, HEADER, dataRows);
}
