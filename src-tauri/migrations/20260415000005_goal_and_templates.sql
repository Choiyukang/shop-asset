-- 월별 목표 매출
ALTER TABLE users ADD COLUMN monthly_sales_goal INTEGER NOT NULL DEFAULT 0;

-- 거래 템플릿
CREATE TABLE IF NOT EXISTS transaction_templates (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('purchase','sale','expense')),
  counterparty_id TEXT REFERENCES counterparties(id) ON DELETE SET NULL,
  category_id     TEXT NOT NULL REFERENCES categories(id),
  amount          INTEGER NOT NULL DEFAULT 0,
  commission_amount INTEGER NOT NULL DEFAULT 0,
  memo            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
