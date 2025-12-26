PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS sessions(
  id INTEGER PRIMARY KEY,
  title TEXT,
  created_ts REAL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  role TEXT CHECK(role IN ('user','assistant','system')) NOT NULL,
  text TEXT NOT NULL,
  ts REAL DEFAULT (strftime('%s','now'))
);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(text, content='messages', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES('delete', old.id, old.text);
END;
