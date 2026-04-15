ALTER TABLE products ADD COLUMN is_pending_delivery INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN expected_arrival_date TEXT;
