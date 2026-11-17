-- 宝可梦学习平台 · 云端账号库（Cloudflare D1）
-- 在 Cloudflare 控制台 D1 的 Query 里执行本文件即可建表。
--
-- ⚠️ 本文件曾与 functions/api/*.js 不一致（旧版写 pw_hash，sessions 缺 expires_at 列），
--    现已按实际代码修正。已有数据库不能只跑本文件（CREATE TABLE IF NOT EXISTS 不会改列），
--    请改用文件末尾的 ALTER 迁移语句。

CREATE TABLE IF NOT EXISTS accounts (
  username      TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,   -- PBKDF2-SHA256 / 100000 轮：pbkdf2$sha256$100000$salt$hash
  progress      TEXT,            -- 整个 state 的 JSON 字符串（NULL = 从未同步）
  updated_at    INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,   -- (uuid + uuid) 去横线，64 位 hex
  username   TEXT NOT NULL,
  expires_at TEXT                -- datetime('now','+30 days')
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(username);

-- 已有库迁移（只跑一次；若报 duplicate column 说明已迁移过）：
-- ALTER TABLE accounts RENAME COLUMN pw_hash TO password_hash;
-- ALTER TABLE sessions ADD COLUMN expires_at TEXT;
