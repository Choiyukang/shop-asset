import Database from "@tauri-apps/plugin-sql";
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

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:mallbook.db");
  }
  return dbPromise;
}

type RawCategory = Omit<Category, "tax_deductible"> & { tax_deductible: number };
type RawTransaction = Omit<Transaction, "synced_to_sheet" | "items"> & {
  synced_to_sheet: number;
};

function mapCategory(r: RawCategory): Category {
  return { ...r, tax_deductible: !!r.tax_deductible };
}

function mapTransaction(r: RawTransaction): Transaction {
  return { ...r, synced_to_sheet: !!r.synced_to_sheet };
}

type RawProduct = Omit<Product, "is_pending_delivery"> & { is_pending_delivery: number };
function mapProduct(r: RawProduct): Product {
  return { ...r, is_pending_delivery: !!r.is_pending_delivery };
}

// ---------- User ----------
export async function getCurrentUser(): Promise<User | null> {
  const db = await getDb();
  const rows = await db.select<User[]>(
    "SELECT * FROM users ORDER BY created_at ASC LIMIT 1",
  );
  return rows[0] ?? null;
}

export async function updateUser(patch: Partial<Omit<User, "id" | "created_at">>): Promise<void> {
  const db = await getDb();
  const user = await getCurrentUser();
  if (!user) throw new Error("기본 사용자 정보를 찾을 수 없습니다.");
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (fields.length === 0) return;
  values.push(user.id);
  await db.execute(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
}

// ---------- Counterparty ----------
export async function listCounterparties(): Promise<Counterparty[]> {
  const db = await getDb();
  return db.select<Counterparty[]>(
    "SELECT * FROM counterparties WHERE is_deleted = 0 OR is_deleted IS NULL ORDER BY created_at DESC",
  );
}

export async function createCounterparty(input: CounterpartyInput): Promise<Counterparty> {
  const db = await getDb();
  const id = uuid("cp");
  await db.execute(
    "INSERT INTO counterparties (id, name, type, phone, commission_rate) VALUES (?, ?, ?, ?, ?)",
    [id, input.name, input.type, input.phone, input.commission_rate ?? 0],
  );
  const rows = await db.select<Counterparty[]>(
    "SELECT * FROM counterparties WHERE id = ?",
    [id],
  );
  return rows[0]!;
}

export async function updateCounterparty(
  id: string,
  patch: Partial<Omit<Counterparty, "id" | "created_at">>,
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (fields.length === 0) return;
  values.push(id);
  await db.execute(
    `UPDATE counterparties SET ${fields.join(", ")} WHERE id = ?`,
    values,
  );
}

export async function deleteCounterparty(id: string): Promise<void> {
  const db = await getDb();
  // 소프트 삭제: 거래내역에서 거래처명이 유지되도록 is_deleted만 1로 설정
  await db.execute("UPDATE counterparties SET is_deleted = 1 WHERE id = ?", [id]);
}

// ---------- Category ----------
export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.select<RawCategory[]>(
    "SELECT * FROM categories ORDER BY name ASC",
  );
  return rows.map(mapCategory);
}

// ---------- Product ----------
export async function listProducts(): Promise<Product[]> {
  const db = await getDb();
  const rows = await db.select<RawProduct[]>(
    "SELECT * FROM products ORDER BY created_at DESC",
  );
  return rows.map(mapProduct);
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const db = await getDb();
  const id = uuid("prd");
  await db.execute(
    `INSERT INTO products (id, name, color, purchase_price, sale_price, stock, memo, counterparty_id, purchase_date, is_pending_delivery, expected_arrival_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.color,
      Math.trunc(input.purchase_price),
      Math.trunc(input.sale_price),
      Math.trunc(input.stock),
      input.memo,
      input.counterparty_id ?? null,
      input.purchase_date ?? null,
      input.is_pending_delivery ? 1 : 0,
      input.expected_arrival_date ?? null,
    ],
  );
  const rows = await db.select<RawProduct[]>(
    "SELECT * FROM products WHERE id = ?",
    [id],
  );
  return mapProduct(rows[0]!);
}

export async function updateProduct(
  id: string,
  patch: Partial<Omit<Product, "id" | "created_at">>,
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    // SQLite stores booleans as integers; convert explicitly
    values.push(k === "is_pending_delivery" ? (v ? 1 : 0) : v);
  }
  if (fields.length === 0) return;
  values.push(id);
  await db.execute(
    `UPDATE products SET ${fields.join(", ")} WHERE id = ?`,
    values,
  );
}

export async function deleteProduct(id: string): Promise<void> {
  const db = await getDb();
  // 거래에 연결된 상품 항목을 먼저 제거 (거래 금액은 이미 저장돼 있으므로 금액 기록 유지)
  await db.execute("DELETE FROM transaction_items WHERE product_id = ?", [id]);
  await db.execute("DELETE FROM products WHERE id = ?", [id]);
}

// ---------- Transaction Items ----------
export async function listTransactionItems(
  transactionId: string,
): Promise<TransactionItem[]> {
  const db = await getDb();
  const rows = await db.select<
    {
      id: string;
      transaction_id: string;
      product_id: string;
      quantity: number;
      unit_price: number;
      product_name: string | null;
      product_color: string | null;
    }[]
  >(
    `SELECT ti.id, ti.transaction_id, ti.product_id, ti.quantity, ti.unit_price,
            p.name AS product_name, p.color AS product_color
       FROM transaction_items ti
       LEFT JOIN products p ON p.id = ti.product_id
      WHERE ti.transaction_id = ?`,
    [transactionId],
  );
  return rows.map((r) => ({
    id: r.id,
    transaction_id: r.transaction_id,
    product_id: r.product_id,
    quantity: r.quantity,
    unit_price: r.unit_price,
    product_name: r.product_name ?? undefined,
    product_color: r.product_color,
  }));
}

// ---------- Transaction ----------
export async function listTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  const rows = await db.select<RawTransaction[]>(
    "SELECT * FROM transactions ORDER BY date DESC, created_at DESC",
  );
  const txns = rows.map(mapTransaction);
  // Best-effort: attach items for purchase/sale transactions in one query.
  if (txns.length === 0) return txns;
  const ids = txns.filter((t) => t.type !== "expense").map((t) => t.id);
  if (ids.length === 0) return txns;
  const placeholders = ids.map(() => "?").join(",");
  const itemRows = await db.select<
    {
      id: string;
      transaction_id: string;
      product_id: string;
      quantity: number;
      unit_price: number;
      product_name: string | null;
      product_color: string | null;
    }[]
  >(
    `SELECT ti.id, ti.transaction_id, ti.product_id, ti.quantity, ti.unit_price,
            p.name AS product_name, p.color AS product_color
       FROM transaction_items ti
       LEFT JOIN products p ON p.id = ti.product_id
      WHERE ti.transaction_id IN (${placeholders})`,
    ids,
  );
  const grouped = new Map<string, TransactionItem[]>();
  for (const r of itemRows) {
    const list = grouped.get(r.transaction_id) ?? [];
    list.push({
      id: r.id,
      transaction_id: r.transaction_id,
      product_id: r.product_id,
      quantity: r.quantity,
      unit_price: r.unit_price,
      product_name: r.product_name ?? undefined,
      product_color: r.product_color,
    });
    grouped.set(r.transaction_id, list);
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
  const db = await getDb();
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

  // tauri-plugin-sql lacks a clean BEGIN/COMMIT across select/execute,
  // so we use try/catch with manual rollback for inserted rows.
  try {
    await db.execute(
      `INSERT INTO transactions
        (id, date, type, amount, counterparty_id, category_id, memo, payment_status, synced_to_sheet, commission_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        txnId,
        input.date,
        input.type,
        amount,
        input.counterparty_id,
        input.category_id,
        input.memo,
        input.payment_status,
        commission,
      ],
    );

    if (isItemized) {
      for (const it of input.items) {
        const itemId = uuid("ti");
        const qty = Math.trunc(it.quantity);
        const price = Math.trunc(it.unit_price);
        await db.execute(
          `INSERT INTO transaction_items (id, transaction_id, product_id, quantity, unit_price)
           VALUES (?, ?, ?, ?, ?)`,
          [itemId, txnId, it.product_id, qty, price],
        );
        insertedItemIds.push(itemId);
        const delta = input.type === "purchase" ? qty : -qty;
        await db.execute(
          "UPDATE products SET stock = stock + ? WHERE id = ?",
          [delta, it.product_id],
        );
        stockDeltas.push({ productId: it.product_id, delta });
      }
    }

    // Auto-create TaxRecord
    const { supply_amount, vat_amount } = splitVat(amount, taxType);
    const categories = await db.select<RawCategory[]>(
      "SELECT * FROM categories WHERE id = ?",
      [input.category_id],
    );
    const cat = categories[0];
    const isRefundable = cat ? !!cat.tax_deductible && input.type === "purchase" : false;

    await db.execute(
      `INSERT INTO tax_records
        (id, transaction_id, supply_amount, vat_amount, is_refundable, tax_invoice_issued)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [uuid("tax"), txnId, supply_amount, vat_amount, isRefundable ? 1 : 0],
    );
  } catch (err) {
    // Best-effort rollback.
    for (const s of stockDeltas) {
      try {
        await db.execute(
          "UPDATE products SET stock = stock - ? WHERE id = ?",
          [s.delta, s.productId],
        );
      } catch {
        // ignore
      }
    }
    for (const itemId of insertedItemIds) {
      try {
        await db.execute("DELETE FROM transaction_items WHERE id = ?", [itemId]);
      } catch {
        // ignore
      }
    }
    try {
      await db.execute("DELETE FROM tax_records WHERE transaction_id = ?", [txnId]);
    } catch {
      // ignore
    }
    try {
      await db.execute("DELETE FROM transactions WHERE id = ?", [txnId]);
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
      await db.execute(
        "UPDATE transactions SET synced_to_sheet = 1 WHERE id = ?",
        [txnId],
      );
    }
  } catch (e) {
    console.warn("[google] sheet append failed, will require manual retry:", e);
    // 로컬 저장은 이미 성공했으므로 throw 하지 않음
  }

  const rows = await db.select<RawTransaction[]>(
    "SELECT * FROM transactions WHERE id = ?",
    [txnId],
  );
  return mapTransaction(rows[0]!);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDb();
  const txns = await db.select<{ type: string }[]>(
    "SELECT type FROM transactions WHERE id = ?",
    [id],
  );
  if (txns.length === 0) return;
  const type = txns[0].type;

  if (type === "purchase" || type === "sale") {
    const items = await db.select<{ product_id: string; quantity: number }[]>(
      "SELECT product_id, quantity FROM transaction_items WHERE transaction_id = ?",
      [id],
    );
    for (const item of items) {
      // 재고 역산: 구매는 입고였으므로 취소 시 차감, 판매는 출고였으므로 취소 시 증가
      const reverseDelta = type === "purchase" ? -item.quantity : item.quantity;
      await db.execute("UPDATE products SET stock = stock + ? WHERE id = ?", [
        reverseDelta,
        item.product_id,
      ]);
    }
  }

  await db.execute("DELETE FROM transaction_items WHERE transaction_id = ?", [id]);
  await db.execute("DELETE FROM tax_records WHERE transaction_id = ?", [id]);
  await db.execute("DELETE FROM transactions WHERE id = ?", [id]);
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
  const db = await getDb();
  const user = await getCurrentUser();
  if (!user?.google_sheet_id) {
    throw new Error("구글시트가 설정되지 않았습니다.");
  }
  const rows = await db.select<RawTransaction[]>(
    "SELECT * FROM transactions WHERE id = ?",
    [txnId],
  );
  const raw = rows[0];
  if (!raw) throw new Error("거래를 찾을 수 없습니다.");
  const txn = mapTransaction(raw);
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
  await db.execute(
    "UPDATE transactions SET synced_to_sheet = 1 WHERE id = ?",
    [txnId],
  );
}

// ---------- Sheet Sync ----------
export async function resetSheetSync(): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE transactions SET synced_to_sheet = 0");
}

export async function syncAllTransactions(
  onProgress?: (done: number, total: number) => void,
): Promise<{ success: number; failed: number }> {
  const db = await getDb();
  const user = await getCurrentUser();
  if (!user?.google_sheet_id) {
    throw new Error("구글시트가 설정되지 않았습니다.");
  }
  const sheetId = user.google_sheet_id;
  const HEADER = ["날짜", "유형", "거래처", "분류", "상품내역", "수수료", "금액", "결제상태", "메모"];

  const rows = await db.select<RawTransaction[]>(
    "SELECT * FROM transactions ORDER BY date ASC",
  );
  const total = rows.length;
  const counterparties = await listCounterparties();
  const categories = await listCategories();
  const cpMap = new Map(counterparties.map((c) => [c.id, c]));
  const catMap = new Map(categories.map((c) => [c.id, c]));

  // 월별로 그룹화
  const byMonth = new Map<string, RawTransaction[]>();
  for (const raw of rows) {
    const month = raw.date.slice(0, 7); // "2026-04"
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(raw);
  }

  let success = 0;
  let failed = 0;
  let done = 0;

  for (const [month, monthRows] of byMonth) {
    const dataRows: string[][] = [];
    for (const raw of monthRows) {
      const txn = mapTransaction(raw);
      try {
        const items = txn.type !== "expense" ? await listTransactionItems(txn.id) : [];
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
    await db.execute(
      "UPDATE transactions SET synced_to_sheet = 1 WHERE date LIKE ?",
      [`${month}%`],
    );
  }
  return { success, failed };
}

export async function restoreFromSheet(
  onProgress?: (done: number, total: number) => void,
): Promise<{ restored: number; skipped: number }> {
  const db = await getDb();
  const user = await getCurrentUser();
  if (!user?.google_sheet_id) {
    throw new Error("구글시트가 설정되지 않았습니다.");
  }
  const sheetId = user.google_sheet_id;
  // YYYY-MM 패턴 탭 모두 읽기
  const allTabs = await getSheetTabs(sheetId);
  const monthTabs = allTabs.filter((t) => /^\d{4}-\d{2}$/.test(t)).sort();
  // 레거시: YYYY-MM 탭이 없으면 기존 고정 탭에서도 읽기
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

  // 기존 거래 날짜+금액+유형으로 중복 체크용 세트
  const existing = await db.select<{ date: string; amount: number; type: string }[]>(
    "SELECT date, amount, type FROM transactions",
  );
  const existingSet = new Set(
    existing.map((e) => `${e.date}|${e.type}|${e.amount}`),
  );

  // 거래처/분류 캐시
  const counterparties = await listCounterparties();
  const categories = await listCategories();
  const cpByName = new Map(counterparties.map((c) => [c.name, c]));
  const catByName = new Map(categories.map((c) => [c.name, c]));

  for (let i = 0; i < sheetRows.length; i++) {
    const row = sheetRows[i]!;
    // [날짜, 유형, 거래처, 분류, 상품내역, 수수료, 금액, 결제상태, 메모]
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

    // 중복 체크
    const key = `${date}|${type}|${amount}`;
    if (existingSet.has(key)) {
      skipped++;
      onProgress?.(i + 1, total);
      continue;
    }

    // 거래처 찾기 (없으면 null)
    const cp = counterpartyName ? cpByName.get(counterpartyName) : null;

    // 분류 찾기 (없으면 해당 타입의 첫 분류 사용)
    let cat = categoryName ? catByName.get(categoryName) : null;
    if (!cat) {
      cat = categories.find((c) => c.type === type) ?? null;
    }
    if (!cat) { skipped++; onProgress?.(i + 1, total); continue; }

    const txnId = uuid("txn");
    try {
      await db.execute(
        `INSERT INTO transactions
          (id, date, type, amount, counterparty_id, category_id, memo, payment_status, synced_to_sheet, commission_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [txnId, date, type, amount, cp?.id ?? null, cat.id, memo || null, paymentStatus, commission],
      );
      existingSet.add(key);
      restored++;
    } catch {
      skipped++;
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
  const db = await getDb();
  const mm = String(month).padStart(2, "0");
  const prefix = `${year}-${mm}`;
  const rows = await db.select<{ type: string; total: number; cnt: number }[]>(
    `SELECT type, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt
     FROM transactions
     WHERE substr(date, 1, 7) = ?
     GROUP BY type`,
    [prefix],
  );
  let sales = 0;
  let expense = 0;
  let count = 0;
  for (const r of rows) {
    count += Number(r.cnt);
    if (r.type === "sale") sales += Number(r.total);
    else if (r.type === "purchase" || r.type === "expense") expense += Number(r.total);
  }
  return { sales, expense, netIncome: sales - expense, count };
}

export async function getOverdueReceivables(): Promise<OverdueReceivable[]> {
  const db = await getDb();
  const rows = await db.select<
    { counterparty_id: string; total: number; earliest_date: string }[]
  >(
    `SELECT counterparty_id,
            COALESCE(SUM(amount), 0) AS total,
            MIN(date) AS earliest_date
       FROM transactions
      WHERE type = 'sale'
        AND payment_status = 'pending'
        AND counterparty_id IS NOT NULL
      GROUP BY counterparty_id
      ORDER BY earliest_date ASC`,
  );
  if (rows.length === 0) return [];
  const counterparties = await listCounterparties();
  const cpMap = new Map(counterparties.map((c) => [c.id, c]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const results: OverdueReceivable[] = [];
  for (const r of rows) {
    const cp = cpMap.get(r.counterparty_id);
    if (!cp) continue;
    const earliest = new Date(r.earliest_date);
    earliest.setHours(0, 0, 0, 0);
    const daysPending = Math.floor((today.getTime() - earliest.getTime()) / 86_400_000);
    results.push({ counterparty: cp, total: Number(r.total), earliestDate: r.earliest_date, daysPending });
  }
  return results;
}

export async function getLowStockProducts(threshold = 5): Promise<Product[]> {
  const db = await getDb();
  const rows = await db.select<RawProduct[]>(
    "SELECT * FROM products WHERE stock <= ? ORDER BY stock ASC",
    [threshold],
  );
  return rows.map(mapProduct);
}

export async function getPendingDeliveryProducts(): Promise<Product[]> {
  const db = await getDb();
  const rows = await db.select<RawProduct[]>(
    "SELECT * FROM products WHERE is_pending_delivery = 1 OR LOWER(CAST(is_pending_delivery AS TEXT)) = 'true' ORDER BY expected_arrival_date ASC",
  );
  return rows.map(mapProduct);
}

export async function getNextTaxDeadline(): Promise<TaxDeadlineInfo> {
  const db = await getDb();
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

  const rows = await db.select<{ total_vat: number }[]>(
    `SELECT COALESCE(SUM(tr.vat_amount), 0) AS total_vat
       FROM tax_records tr
       JOIN transactions t ON t.id = tr.transaction_id
      WHERE t.date BETWEEN ? AND ?`,
    [chosen.start, chosen.end],
  );

  return {
    deadlineDate: chosen.date.toISOString().slice(0, 10),
    daysLeft,
    periodLabel: chosen.label,
    estimatedVat: Number(rows[0]?.total_vat ?? 0),
  };
}

export async function getTodayUnpaidBySupplier(): Promise<SupplierUnpaidTotal[]> {
  const db = await getDb();
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const dateStr = `${y}-${m}-${d}`;
  const rows = await db.select<
    { counterparty_id: string; total: number }[]
  >(
    `SELECT counterparty_id, COALESCE(SUM(amount), 0) AS total
       FROM transactions
      WHERE date = ?
        AND type = 'purchase'
        AND payment_status = 'pending'
        AND counterparty_id IS NOT NULL
      GROUP BY counterparty_id`,
    [dateStr],
  );
  if (rows.length === 0) return [];
  const counterparties = await listCounterparties();
  const cpMap = new Map(counterparties.map((c) => [c.id, c]));
  const results: SupplierUnpaidTotal[] = [];
  for (const r of rows) {
    const cp = cpMap.get(r.counterparty_id);
    if (cp) results.push({ counterparty: cp, total: Number(r.total) });
  }
  return results;
}

// ---------- Cashflow Prediction ----------
export async function getMonthlyStats(months = 6): Promise<MonthlyStats[]> {
  const db = await getDb();
  const rows = await db.select<{ month: string; type: string; total: number }[]>(
    `SELECT substr(date, 1, 7) AS month,
            type,
            COALESCE(SUM(amount), 0) AS total
       FROM transactions
      WHERE date >= date('now', ? || ' months')
      GROUP BY month, type
      ORDER BY month ASC`,
    [`-${months}`],
  );
  const monthMap = new Map<string, MonthlyStats>();
  for (const r of rows) {
    const entry = monthMap.get(r.month) ?? { month: r.month, sales: 0, expense: 0 };
    if (r.type === "sale") entry.sales += Number(r.total);
    else if (r.type === "purchase" || r.type === "expense") entry.expense += Number(r.total);
    monthMap.set(r.month, entry);
  }
  return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
}

// ---------- Tax Report ----------
export async function getTaxReport(
  startDate: string,
  endDate: string,
): Promise<TaxReportRow[]> {
  const db = await getDb();
  type RawTaxRow = {
    date: string;
    transaction_type: string;
    counterparty: string;
    category: string;
    amount: number;
    supply_amount: number;
    vat_amount: number;
    is_refundable: number;
    memo: string;
  };
  const rows = await db.select<RawTaxRow[]>(
    `SELECT t.date,
            t.type        AS transaction_type,
            COALESCE(cp.name, '') AS counterparty,
            COALESCE(cat.name, '') AS category,
            t.amount,
            tr.supply_amount,
            tr.vat_amount,
            tr.is_refundable,
            COALESCE(t.memo, '') AS memo
       FROM transactions t
       JOIN tax_records tr ON tr.transaction_id = t.id
       LEFT JOIN counterparties cp ON cp.id = t.counterparty_id
       LEFT JOIN categories cat ON cat.id = t.category_id
      WHERE t.date BETWEEN ? AND ?
      ORDER BY t.date ASC`,
    [startDate, endDate],
  );
  return rows.map((r) => ({
    date: r.date,
    transactionType: r.transaction_type,
    counterparty: r.counterparty,
    category: r.category,
    amount: Number(r.amount),
    supplyAmount: Number(r.supply_amount),
    vatAmount: Number(r.vat_amount),
    isRefundable: !!r.is_refundable,
    memo: r.memo,
  }));
}

// ---------- JSON Backup / Restore ----------
export async function exportAllData(): Promise<string> {
  const db = await getDb();
  const [users, counterparties, categories, products, transactions, transactionItems, taxRecords] =
    await Promise.all([
      db.select<unknown[]>("SELECT * FROM users"),
      db.select<unknown[]>("SELECT * FROM counterparties"),
      db.select<unknown[]>("SELECT * FROM categories"),
      db.select<unknown[]>("SELECT * FROM products"),
      db.select<unknown[]>("SELECT * FROM transactions ORDER BY date ASC"),
      db.select<unknown[]>("SELECT * FROM transaction_items"),
      db.select<unknown[]>("SELECT * FROM tax_records"),
    ]);
  return JSON.stringify(
    {
      version: 1,
      exported_at: new Date().toISOString(),
      users,
      counterparties,
      categories,
      products,
      transactions,
      transaction_items: transactionItems,
      tax_records: taxRecords,
    },
    null,
    2,
  );
}

export async function importAllData(
  json: string,
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const db = await getDb();
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

  async function upsertRows(
    table: string,
    rows: unknown[],
    idField = "id",
  ) {
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const keys = Object.keys(r);
      const placeholders = keys.map(() => "?").join(", ");
      const cols = keys.join(", ");
      const vals = keys.map((k) => r[k]);
      try {
        const existing = await db.select<{ id: string }[]>(
          `SELECT id FROM ${table} WHERE ${idField} = ?`,
          [r[idField]],
        );
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        await db.execute(
          `INSERT OR IGNORE INTO ${table} (${cols}) VALUES (${placeholders})`,
          vals,
        );
        imported++;
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
  const db = await getDb();
  const rows = await db.select<RawTransaction[]>(
    `SELECT * FROM transactions
      WHERE counterparty_id = ?
        AND payment_status = 'pending'
      ORDER BY date ASC`,
    [counterpartyId],
  );
  return rows.map(mapTransaction);
}

export async function settleTransaction(transactionId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE transactions SET payment_status = 'paid' WHERE id = ?",
    [transactionId],
  );
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
  const db = await getDb();
  const rows = await db.select<{
    date: string;
    type: string;
    category: string;
    amount: number;
    commission_amount: number;
    payment_status: string;
    memo: string;
  }[]>(
    `SELECT t.date,
            t.type,
            COALESCE(cat.name, '') AS category,
            t.amount,
            t.commission_amount,
            t.payment_status,
            COALESCE(t.memo, '') AS memo
       FROM transactions t
       LEFT JOIN categories cat ON cat.id = t.category_id
      WHERE t.counterparty_id = ?
        AND t.date BETWEEN ? AND ?
      ORDER BY t.date ASC`,
    [counterpartyId, startDate, endDate],
  );
  return rows.map((r) => ({
    date: r.date,
    type: r.type,
    category: r.category,
    amount: Number(r.amount),
    commission_amount: Number(r.commission_amount),
    payment_status: r.payment_status,
    memo: r.memo,
  }));
}

// ---------- Transaction Templates ----------
export async function listTransactionTemplates(): Promise<TransactionTemplate[]> {
  const db = await getDb();
  return db.select<TransactionTemplate[]>(
    "SELECT * FROM transaction_templates ORDER BY name ASC",
  );
}

export async function saveTransactionTemplate(
  name: string,
  input: Pick<TransactionInput, "type" | "counterparty_id" | "category_id" | "memo"> & {
    amount: number;
    commission_amount: number;
  },
): Promise<void> {
  const db = await getDb();
  const id = uuid("tpl");
  await db.execute(
    `INSERT OR REPLACE INTO transaction_templates
      (id, name, type, counterparty_id, category_id, amount, commission_amount, memo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, input.type, input.counterparty_id, input.category_id, input.amount, input.commission_amount, input.memo ?? null],
  );
}

export async function deleteTransactionTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM transaction_templates WHERE id = ?", [id]);
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
  const db = await getDb();

  type SummaryRow = { name: string; total_sales: number; total_purchase: number; pending: number };
  const rows = await db.select<SummaryRow[]>(`
    SELECT
      c.name,
      COALESCE(SUM(CASE WHEN t.type = 'sale' THEN t.amount ELSE 0 END), 0) AS total_sales,
      COALESCE(SUM(CASE WHEN t.type = 'purchase' THEN t.amount ELSE 0 END), 0) AS total_purchase,
      COALESCE(SUM(CASE WHEN t.type = 'sale' AND t.payment_status = 'pending' THEN t.amount ELSE 0 END), 0) AS pending
    FROM counterparties c
    LEFT JOIN transactions t ON t.counterparty_id = c.id
    GROUP BY c.id, c.name
    ORDER BY total_sales DESC
  `);

  const HEADER = ["거래처", "총 판매", "총 구매", "미수금"];
  const dataRows: string[][] = rows.map((r) => [
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

