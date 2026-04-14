import Database from "@tauri-apps/plugin-sql";
import type {
  Category,
  Counterparty,
  CounterpartyInput,
  DashboardSummary,
  Product,
  ProductInput,
  SupplierUnpaidTotal,
  TaxType,
  Transaction,
  TransactionInput,
  TransactionItem,
  User,
} from "@/types";
import { splitVat } from "@/lib/tax";
import { uuid } from "@/lib/utils";
import { appendTransactionRow } from "@/lib/google";

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
    "SELECT * FROM counterparties ORDER BY created_at DESC",
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
  return db.select<Product[]>(
    "SELECT * FROM products ORDER BY created_at DESC",
  );
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const db = await getDb();
  const id = uuid("prd");
  await db.execute(
    `INSERT INTO products (id, name, color, purchase_price, sale_price, stock, memo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.color,
      Math.trunc(input.purchase_price),
      Math.trunc(input.sale_price),
      Math.trunc(input.stock),
      input.memo,
    ],
  );
  const rows = await db.select<Product[]>(
    "SELECT * FROM products WHERE id = ?",
    [id],
  );
  return rows[0]!;
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
    values.push(v);
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
  // ON DELETE RESTRICT will throw if referenced by transaction_items.
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
          tab: user.google_sheet_tab || "Transactions",
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
      tab: user.google_sheet_tab || "Transactions",
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
