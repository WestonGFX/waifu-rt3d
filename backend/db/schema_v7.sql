PRAGMA journal_mode=WAL;

-- Schema v7: Phase 3 Data Foundation
-- Adds: message branching, emotion tracking, character greetings,
--        prompt templates, character knowledge docs, relationship tracking,
--        session summaries, and multi-character message support.

-- ── Characters extensions ──────────────────────────────────────
ALTER TABLE characters ADD COLUMN greeting_text TEXT;
ALTER TABLE characters ADD COLUMN greeting_animation TEXT;
ALTER TABLE characters ADD COLUMN background_url TEXT;
ALTER TABLE characters ADD COLUMN background_mode TEXT DEFAULT 'transparent';
ALTER TABLE characters ADD COLUMN voice_sample_path TEXT;

-- ── Messages extensions (branching, emotion, multi-char) ──────
ALTER TABLE messages ADD COLUMN parent_id INTEGER REFERENCES messages(id);
ALTER TABLE messages ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE messages ADD COLUMN emotion TEXT;
ALTER TABLE messages ADD COLUMN char_id INTEGER;

-- ── Sessions extensions ───────────────────────────────────────
ALTER TABLE sessions ADD COLUMN summary TEXT;

-- ── Prompt Templates ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'custom',
    system_prompt TEXT NOT NULL,
    description TEXT,
    created_ts REAL DEFAULT (strftime('%s','now'))
);

-- ── Character Knowledge Docs (RAG per-character) ──────────────
CREATE TABLE IF NOT EXISTS character_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_count INTEGER DEFAULT 0,
    created_ts REAL DEFAULT (strftime('%s','now'))
);

-- ── Relationship Tracking ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS character_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    affinity REAL DEFAULT 0.5,
    mood REAL DEFAULT 0.5,
    trust REAL DEFAULT 0.5,
    interactions INTEGER DEFAULT 0,
    last_updated REAL DEFAULT (strftime('%s','now'))
);

-- Seed relationship rows for existing characters
INSERT OR IGNORE INTO character_relationships (char_id)
    SELECT id FROM characters;

-- ── Version stamp ─────────────────────────────────────────────
INSERT OR REPLACE INTO schema_version (version) VALUES (7);
