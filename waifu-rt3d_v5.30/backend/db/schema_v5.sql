PRAGMA journal_mode=WAL;

-- Update Sessions table with archived column
ALTER TABLE sessions ADD COLUMN archived INTEGER DEFAULT 0;

-- Update schema version
INSERT OR REPLACE INTO schema_version (version) VALUES (5);
