-- claude-code-sessions — SQLite schema
-- Authoritative source for the index database layout.
-- Applied idempotently by src/lib/db/client.ts on startup.

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encoded_path TEXT UNIQUE NOT NULL,
  decoded_path TEXT NOT NULL,
  display_name TEXT NOT NULL,
  session_count INTEGER NOT NULL DEFAULT 0,
  last_active_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_projects_last_active ON projects(last_active_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL UNIQUE,
  cwd TEXT,
  git_branch TEXT,
  version TEXT,
  first_ts INTEGER,
  last_ts INTEGER,
  message_count INTEGER NOT NULL DEFAULT 0,
  user_message_count INTEGER NOT NULL DEFAULT 0,
  models TEXT NOT NULL DEFAULT '[]',
  primary_model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_create_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  last_input_tokens INTEGER,
  last_cache_create_tokens INTEGER,
  last_cache_read_tokens INTEGER,
  first_user_prompt TEXT,
  last_user_prompt TEXT,
  gist TEXT,
  duration_ms INTEGER,
  has_subagents INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_sessions_project_last ON sessions(project_id, last_ts DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_last_ts ON sessions(last_ts DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_primary_model ON sessions(primary_model);
CREATE INDEX IF NOT EXISTS idx_sessions_git_branch ON sessions(git_branch) WHERE git_branch IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_not_deleted ON sessions(deleted_at) WHERE deleted_at IS NULL;

-- Full-text search index. The porter tokenizer gives us stemmed keyword search.
CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
  session_id UNINDEXED,
  gist,
  first_user_prompt,
  last_user_prompt,
  cwd,
  git_branch,
  tokenize = 'porter unicode61 remove_diacritics 2'
);

-- Track where we left off on each file so incremental reads can resume.
CREATE TABLE IF NOT EXISTS index_state (
  file_path TEXT PRIMARY KEY,
  inode INTEGER,
  size_bytes INTEGER,
  byte_offset INTEGER NOT NULL DEFAULT 0,
  tentative_offset INTEGER,
  mtime_ms INTEGER,
  last_indexed_at INTEGER,
  content_hash TEXT,
  error TEXT
);

-- Key/value metadata (schema version, embedding model, last backfill timestamp, chosen port, etc.)
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- User-pinned sessions (P1 feature, schema ready).
CREATE TABLE IF NOT EXISTS session_pins (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  pinned_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  note TEXT
);
