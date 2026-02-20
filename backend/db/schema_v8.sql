-- Schema v8: Token data persistence for message generation stats
-- Adds columns to track token counts, generation timing, and throughput
-- so historical messages can display generation statistics.

ALTER TABLE messages ADD COLUMN token_count INTEGER;
ALTER TABLE messages ADD COLUMN input_token_count INTEGER;
ALTER TABLE messages ADD COLUMN generation_time_ms INTEGER;
ALTER TABLE messages ADD COLUMN tokens_per_second REAL;

INSERT OR REPLACE INTO schema_version (version) VALUES (8);
