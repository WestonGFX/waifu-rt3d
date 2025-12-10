PRAGMA journal_mode=WAL;

-- Sessions table (unchanged from v3)
CREATE TABLE IF NOT EXISTS sessions(
  id INTEGER PRIMARY KEY,
  title TEXT,
  created_ts REAL DEFAULT (strftime('%s','now'))
);

-- Messages table (unchanged from v3)
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  role TEXT CHECK(role IN ('user','assistant','system')) NOT NULL,
  text TEXT NOT NULL,
  ts REAL DEFAULT (strftime('%s','now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Full-text search (unchanged from v3)
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(text, content='messages', content_rowid='id');

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES('delete', old.id, old.text);
END;

-- NEW in v4: Characters table
CREATE TABLE IF NOT EXISTS characters(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  avatar_url TEXT,
  voice_id TEXT,
  tts_provider TEXT,
  personality_traits TEXT,  -- JSON array as text
  created_ts REAL DEFAULT (strftime('%s','now'))
);

-- NEW in v4: Insert default character
INSERT OR IGNORE INTO characters (id, name, system_prompt, avatar_url, personality_traits)
VALUES (
  1,
  'Friendly Assistant',
  'You are a friendly and helpful AI assistant with an enthusiastic personality. You enjoy chatting with users and helping them with their questions.',
  '/files/avatars/default.vrm',
  '["friendly", "helpful", "enthusiastic"]'
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version(
  version INTEGER PRIMARY KEY,
  applied_ts REAL DEFAULT (strftime('%s','now'))
);

INSERT OR REPLACE INTO schema_version (version) VALUES (4);
