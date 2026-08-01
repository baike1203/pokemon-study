-- 宝可梦学习平台 · 云端账号库（Cloudflare D1）
-- 在 Cloudflare 控制台 D1 的 Query 里执行本文件即可建表。
CREATE TABLE IF NOT EXISTS accounts (
  username   TEXT PRIMARY KEY,
  pw_hash    TEXT NOT NULL,
  progress   TEXT,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(username);
