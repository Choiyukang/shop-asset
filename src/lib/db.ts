import Database from "@tauri-apps/plugin-sql";
import type {
  Category,
  Counterparty,
  CounterpartyInput,
  DashboardSummary,
  TaxType,
  Transaction,
  TransactionInput,
  User,
} from "@/types";
import { splitVat } from "@/lib/tax";
import { uuid } from "@/lib/utils";

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:mallbook.db");
  }
  return dbPromise;
}

type RawCategory = Omit<Category, "tax_deductible"> & { tax_deductible: number };
type RawTransaction = Omit<Transaction, "synced_to_sheet"> & { synced_to_sheet: number };

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
    "INSERT INTO counterparties (id, name, type, phone) VALUES (?, ?, ?, ?)",
    [id, input.name, input.type, input.phone],
  );
  const rows = await db.select<Counterparty[]>(
    "SELECT * FROM counterparties WHERE id = ?",
    [id],
  );
  return rows[0]!;
}

// ---------- Category ----------
export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.select<RawCategory[]>(
    "SELECT * FROM categories ORDER BY name ASC",
  );
  return rows.map(mapCategory);
}

// ---------- Transaction ----------
export async function listTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  const rows = await db.select<RawTransaction[]>(
    "SELECT * FROM transactions ORDER BY date DESC, created_at DESC",
  );
  return rows.map(mapTransaction);
}

export async function createTransaction(
  input: TransactionInput,
  taxType: TaxType,
): Promise<Transaction> {
  const db = await getDb();
  const txnId = uuid("txn");
  await db.execute(
    `INSERT INTO transactions
      (id, date, type, amount, counterparty_id, category_id, memo, payment_status, synced_to_sheet)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      txnId,
      input.date,
      input.type,
      Math.trunc(input.amount),
      input.counterparty_id,
      input.category_id,
      input.memo,
      input.payment_status,
    ],
  );

  // Auto-create TaxRecord
  const { supply_amount, vat_amount } = splitVat(input.amount, taxType);
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

  const rows = await db.select<RawTransaction[]>(
    "SELECT * FROM transactions WHERE id = ?",
    [txnId],
  );
  return mapTransaction(rows[0]!);
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
