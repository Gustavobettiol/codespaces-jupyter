PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

INSERT OR IGNORE INTO counters (name, value) VALUES ('alias', 0);

CREATE TABLE IF NOT EXISTS subscribers (
  telegram_id INTEGER PRIMARY KEY,
  username TEXT,
  alias TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  plan_code TEXT,
  pending_plan_code TEXT,
  requested_at INTEGER NOT NULL,
  expires_at INTEGER,
  warned_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_subscribers_status_expiry
  ON subscribers (status, expires_at);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL REFERENCES subscribers (telegram_id),
  plan_code TEXT NOT NULL,
  proof_text TEXT,
  proof_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_payments_user_status
  ON payments (telegram_id, status);

CREATE TABLE IF NOT EXISTS threads (
  admin_chat_id INTEGER NOT NULL,
  admin_message_id INTEGER NOT NULL,
  telegram_id INTEGER NOT NULL,
  PRIMARY KEY (admin_chat_id, admin_message_id)
);