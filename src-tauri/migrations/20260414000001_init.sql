-- Initial schema for 쇼핑몰 자산관리 (MallBook)
-- Phase 1: User, Counterparty, Category, Transaction, TaxRecord, CashflowItem

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    business_number TEXT,
    tax_type TEXT NOT NULL DEFAULT '일반과세자',
    google_email TEXT,
    google_sheet_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS counterparties (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('supplier','customer','personal')),
    phone TEXT,
    business_number TEXT,
    memo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('purchase','sale','expense')),
    tax_deductible INTEGER NOT NULL DEFAULT 1,
    default_tax_rate INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('purchase','sale','expense')),
    amount INTEGER NOT NULL,
    counterparty_id TEXT,
    category_id TEXT NOT NULL,
    memo TEXT,
    payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid','pending')),
    synced_to_sheet INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_counterparty ON transactions(counterparty_id);

CREATE TABLE IF NOT EXISTS tax_records (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL UNIQUE,
    supply_amount INTEGER NOT NULL,
    vat_amount INTEGER NOT NULL,
    is_refundable INTEGER NOT NULL DEFAULT 0,
    tax_invoice_issued INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cashflow_items (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    expected_date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('incoming','outgoing')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','overdue')),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cashflow_expected_date ON cashflow_items(expected_date);

-- Seed default categories
INSERT OR IGNORE INTO categories (id, name, type, tax_deductible, default_tax_rate) VALUES
    ('cat-purchase-goods', '상품매입', 'purchase', 1, 10),
    ('cat-sale-goods', '판매', 'sale', 1, 10),
    ('cat-expense-rent', '임대료', 'expense', 1, 10),
    ('cat-expense-shipping', '운송비', 'expense', 1, 10),
    ('cat-expense-other', '기타', 'expense', 0, 10);

-- Seed initial user
INSERT OR IGNORE INTO users (id, name, tax_type) VALUES
    ('usr-default', '사장님', '일반과세자');
