ALTER TABLE products ADD COLUMN counterparty_id TEXT REFERENCES counterparties(id) ON DELETE SET NULL;
