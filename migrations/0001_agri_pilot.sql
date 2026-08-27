CREATE TABLE IF NOT EXISTS agri_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  code_label TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agri_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  invite_id INTEGER NOT NULL REFERENCES agri_invites(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agri_sessions_token ON agri_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_agri_sessions_expiry ON agri_sessions(expires_at);

CREATE TABLE IF NOT EXISTS agri_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES agri_sessions(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agri_messages_session_time ON agri_messages(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agri_rate_limits (
  invite_id INTEGER NOT NULL REFERENCES agri_invites(id),
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (invite_id, window_start)
);

CREATE TABLE IF NOT EXISTS agri_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES agri_sessions(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agri_latency_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route TEXT NOT NULL,
  provider TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agri_latency_created ON agri_latency_events(created_at DESC);
