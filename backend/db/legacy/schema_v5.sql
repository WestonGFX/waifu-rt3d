PRAGMA journal_mode=WAL;

-- Schema v5: Voice Fine-Tuning
-- Adds explicit pitch and rate controls for characters

ALTER TABLE characters ADD COLUMN tts_pitch REAL DEFAULT 1.0;
ALTER TABLE characters ADD COLUMN tts_rate REAL DEFAULT 1.0;

-- Ensure schema version is updated
INSERT OR REPLACE INTO schema_version (version) VALUES (5);
