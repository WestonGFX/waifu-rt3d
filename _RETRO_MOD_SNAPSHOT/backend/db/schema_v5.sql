-- DATA MIGRATION v4 -> v5
-- Adds archive functionality to sessions

-- Add 'archived' column to sessions if not exists
ALTER TABLE sessions ADD COLUMN archived INTEGER DEFAULT 0;

-- Update schema version
INSERT OR REPLACE INTO schema_version (version, updated_at) 
VALUES (5, CURRENT_TIMESTAMP);
