-- Phase 1: Google Sheets 연동을 위한 사용자 설정 확장
-- google_email 컬럼은 init 마이그레이션에 이미 있으므로 여기서는 추가하지 않음.

ALTER TABLE users ADD COLUMN google_sheet_id TEXT;
ALTER TABLE users ADD COLUMN google_sheet_tab TEXT NOT NULL DEFAULT 'Transactions';
