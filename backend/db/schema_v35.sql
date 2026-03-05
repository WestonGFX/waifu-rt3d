CREATE TABLE sessions(
  id INTEGER PRIMARY KEY,
  title TEXT,
  created_ts REAL DEFAULT (strftime('%s','now'))
, archived INTEGER DEFAULT 0, summary TEXT, is_pinned INTEGER DEFAULT 0, is_archived INTEGER DEFAULT 0, tags TEXT DEFAULT '[]', author_note TEXT NOT NULL DEFAULT '', author_note_position TEXT NOT NULL DEFAULT 'after_system', author_note_enabled INTEGER NOT NULL DEFAULT 0);
CREATE TABLE messages(
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  role TEXT CHECK(role IN ('user','assistant','system')) NOT NULL,
  text TEXT NOT NULL,
  ts REAL DEFAULT (strftime('%s','now')), parent_id INTEGER REFERENCES messages(id), is_active INTEGER DEFAULT 1, emotion TEXT, char_id INTEGER, token_count INTEGER, input_token_count INTEGER, generation_time_ms INTEGER, tokens_per_second REAL, pinned INTEGER DEFAULT 0, importance_score REAL DEFAULT 0.5,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE VIRTUAL TABLE messages_fts USING fts5(text, content='messages', content_rowid='id')
/* messages_fts(text) */;
CREATE TABLE IF NOT EXISTS 'messages_fts_data'(id INTEGER PRIMARY KEY, block BLOB);
CREATE TABLE IF NOT EXISTS 'messages_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS 'messages_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB);
CREATE TABLE IF NOT EXISTS 'messages_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID;
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES('delete', old.id, old.text);
END;
CREATE TABLE characters(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  avatar_url TEXT,
  voice_id TEXT,
  tts_provider TEXT,
  personality_traits TEXT,  -- JSON array as text
  created_ts REAL DEFAULT (strftime('%s','now'))
, tts_pitch REAL DEFAULT 1.0, tts_rate REAL DEFAULT 1.0, live2d_model TEXT DEFAULT '', model_type TEXT DEFAULT '3d', avatar_2d_url TEXT, vrm_model_url TEXT, greeting_text TEXT, greeting_animation TEXT, background_url TEXT, background_mode TEXT DEFAULT 'transparent', voice_sample_path TEXT, vocab_categories TEXT, llm_endpoint TEXT, llm_model TEXT, world_video_url TEXT, world_description TEXT, voice_sample_prompt TEXT, llm_temperature REAL, last_emotion TEXT DEFAULT 'neutral', last_chat_date TEXT, expr_portraits TEXT, first_chat_date TEXT, voice_config TEXT, diary TEXT, diary_date TEXT, capability_profile TEXT, animation_profile TEXT, emotion_voice_overrides TEXT DEFAULT NULL, backstory TEXT DEFAULT NULL, day_off INTEGER DEFAULT 0, universe_id INTEGER DEFAULT NULL, mood_enabled INTEGER DEFAULT 1, mood_intensity REAL DEFAULT 0.8, greeting_enabled INTEGER DEFAULT 1, greeting_intensity REAL DEFAULT 0.8, emotion_portraits_mode INTEGER NOT NULL DEFAULT 0, glb_model_url TEXT, unity_scene_url TEXT, entrance_style TEXT DEFAULT 'walk', exit_style TEXT DEFAULT 'fade');
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE schema_version(
  version INTEGER PRIMARY KEY,
  applied_ts REAL DEFAULT (strftime('%s','now'))
);
CREATE TABLE prompt_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'custom',
    system_prompt TEXT NOT NULL,
    description TEXT,
    created_ts REAL DEFAULT (strftime('%s','now'))
);
CREATE TABLE character_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_count INTEGER DEFAULT 0,
    created_ts REAL DEFAULT (strftime('%s','now'))
);
CREATE TABLE character_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    affinity REAL DEFAULT 0.5,
    mood REAL DEFAULT 0.5,
    trust REAL DEFAULT 0.5,
    interactions INTEGER DEFAULT 0,
    last_updated REAL DEFAULT (strftime('%s','now'))
);
CREATE TABLE character_schedules (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id       INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                schedule_type TEXT    NOT NULL DEFAULT 'morning',
                time_of_day   TEXT,
                hours_away    REAL    DEFAULT 4.0,
                enabled       INTEGER NOT NULL DEFAULT 1,
                last_triggered TEXT,
                created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
            );
CREATE INDEX idx_schedules_char ON character_schedules (char_id);
CREATE TABLE scheduled_messages (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id      INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                text         TEXT    NOT NULL,
                triggered_at INTEGER NOT NULL,
                delivered    INTEGER NOT NULL DEFAULT 0,
                created_at   INTEGER NOT NULL DEFAULT (unixepoch())
            );
CREATE INDEX idx_scheduled_messages_char ON scheduled_messages (char_id, delivered);
CREATE TABLE message_reactions (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
                    emoji      TEXT    NOT NULL,
                    ts         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
                );
CREATE INDEX idx_reactions_message ON message_reactions(message_id);
CREATE TABLE universes (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    name       TEXT    NOT NULL,
                    lore       TEXT    DEFAULT '',
                    created_at TEXT    DEFAULT (datetime('now'))
                );
CREATE TABLE lore_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                keywords TEXT NOT NULL DEFAULT '[]',
                injection_position TEXT NOT NULL DEFAULT 'after_system_prompt',
                priority INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
CREATE TABLE model_capability_cache (
                model_id TEXT PRIMARY KEY,
                tool_protocol TEXT NOT NULL DEFAULT 'xml_fallback',
                reasoning_capable INTEGER NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'pattern',
                manual_override INTEGER NOT NULL DEFAULT 0,
                cached_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
CREATE TABLE user_facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                category TEXT NOT NULL DEFAULT 'general',
                fact_text TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'auto',
                confidence REAL NOT NULL DEFAULT 0.8,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
CREATE INDEX idx_user_facts_char ON user_facts(character_id);
CREATE TABLE game_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                game_type TEXT NOT NULL,
                result TEXT NOT NULL DEFAULT 'in_progress',
                score INTEGER NOT NULL DEFAULT 0,
                max_score INTEGER NOT NULL DEFAULT 0,
                duration_seconds INTEGER,
                game_state TEXT,
                played_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
CREATE INDEX idx_game_sessions_char ON game_sessions(character_id);
CREATE TABLE memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                session_id INTEGER,
                role TEXT NOT NULL DEFAULT 'user',
                text TEXT NOT NULL,
                tier INTEGER NOT NULL DEFAULT 1,
                salience REAL NOT NULL DEFAULT 0.5,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                promoted_at TEXT
            );
CREATE INDEX idx_memories_char ON memories(character_id);
CREATE INDEX idx_memories_tier ON memories(tier);
CREATE VIRTUAL TABLE memories_vec
                USING vec0(
                    memory_id INTEGER PRIMARY KEY,
                    embedding FLOAT[384]
                );
CREATE TABLE IF NOT EXISTS "memories_vec_info" (key text primary key, value any);
CREATE TABLE IF NOT EXISTS "memories_vec_chunks"(chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,size INTEGER NOT NULL,validity BLOB NOT NULL,rowids BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS "memories_vec_rowids"(rowid INTEGER PRIMARY KEY AUTOINCREMENT,id,chunk_id INTEGER,chunk_offset INTEGER);
CREATE TABLE IF NOT EXISTS "memories_vec_vector_chunks00"(rowid PRIMARY KEY,vectors BLOB NOT NULL);
CREATE TABLE session_summaries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    summary_text TEXT NOT NULL,
                    msg_range_start INTEGER NOT NULL,
                    msg_range_end INTEGER NOT NULL,
                    msg_count INTEGER NOT NULL,
                    token_count INTEGER,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id)
                );
