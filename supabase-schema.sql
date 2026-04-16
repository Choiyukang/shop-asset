-- MallBook Supabase Schema
-- Supabase SQL Editor에서 전체 복사 후 Run 클릭

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    business_number TEXT,
    tax_type TEXT NOT NULL DEFAULT '일반과세자',
    google_email TEXT,
    google_sheet_url TEXT,
    google_sheet_id TEXT,
    google_sheet_tab TEXT NOT NULL DEFAULT 'Transactions',
    bot_telegram_token TEXT,
    monthly_sales_goal INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS counterparties (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('supplier','customer','personal')),
    phone TEXT,
    business_number TEXT,
    memo TEXT,
    commission_rate INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('purchase','sale','expense')),
    tax_deductible INTEGER NOT NULL DEFAULT 1,
    default_tax_rate INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    purchase_price INTEGER NOT NULL DEFAULT 0,
    sale_price INTEGER NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    memo TEXT,
    counterparty_id TEXT REFERENCES counterparties(id) ON DELETE SET NULL,
    purchase_date TEXT,
    is_pending_delivery INTEGER NOT NULL DEFAULT 0,
    expected_arrival_date TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('purchase','sale','expense')),
    amount INTEGER NOT NULL,
    counterparty_id TEXT REFERENCES counterparties(id) ON DELETE SET NULL,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    memo TEXT,
    payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid','pending')),
    synced_to_sheet INTEGER NOT NULL DEFAULT 0,
    commission_amount INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS tax_records (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
    supply_amount INTEGER NOT NULL,
    vat_amount INTEGER NOT NULL,
    is_refundable INTEGER NOT NULL DEFAULT 0,
    tax_invoice_issued INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transaction_items (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('purchase','sale','expense')),
    counterparty_id TEXT REFERENCES counterparties(id) ON DELETE SET NULL,
    category_id TEXT NOT NULL REFERENCES categories(id),
    amount INTEGER NOT NULL DEFAULT 0,
    commission_amount INTEGER NOT NULL DEFAULT 0,
    memo TEXT,
    created_at TEXT NOT NULL DEFAULT (to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS cashflow_items (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    expected_date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('incoming','outgoing')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','overdue'))
);

-- 기본 분류 데이터
INSERT INTO categories (id, name, type, tax_deductible, default_tax_rate) VALUES
    ('cat-purchase-goods', '상품매입', 'purchase', 1, 10),
    ('cat-sale-goods', '판매', 'sale', 1, 10),
    ('cat-expense-rent', '임대료', 'expense', 1, 10),
    ('cat-expense-shipping', '운송비', 'expense', 1, 10),
    ('cat-expense-other', '기타', 'expense', 0, 10)
ON CONFLICT (id) DO NOTHING;

-- 기본 사용자
INSERT INTO users (id, name, tax_type) VALUES
    ('usr-default', '사장님', '일반과세자')
ON CONFLICT (id) DO NOTHING;

-- 재고 원자적 조정 함수 (Race Condition 방지)
-- Supabase SQL Editor에서 실행 필요
CREATE OR REPLACE FUNCTION adjust_stock(p_id TEXT, p_delta INT)
RETURNS void AS $$
  UPDATE products SET stock = stock + p_delta WHERE id = p_id;
$$ LANGUAGE sql;

-- RLS 활성화 (단일 사용자 앱 — 앱 계정 UID만 접근 허용)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE counterparties ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_items ENABLE ROW LEVEL SECURITY;

-- 단일 사용자 정책 (앱 전용 계정 UID)
-- ⚠️  아래 UID는 Supabase Dashboard > Authentication > Users 에서 확인 후 교체
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "app user only" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "app user only" ON %I FOR ALL TO authenticated
       USING (auth.uid() = ''02cef440-91d4-42d5-95f5-4bd9d1730bae'')
       WITH CHECK (auth.uid() = ''02cef440-91d4-42d5-95f5-4bd9d1730bae'')',
    t);
  END LOOP;
END $$;
