"""
Database initialization and migration system for waifu-rt3d.

This module handles:
- Directory structure creation
- Configuration file initialization
- Database schema migrations (v3 → v4 → … → v22)

Migration Strategy:
    - v3 → v4: Adds characters table and schema versioning
    - v4 → v5: Adds archived column to sessions table
    - v5 → v6: Separates 2D/3D avatar fields
    - v6 → v7: Phase 3 data foundation (branching, greetings, templates, docs, relationships)
    - v7 → v8: Token data persistence (generation stats on messages)
    - v8 → v9: Per-character LLM routing + world columns (Phase 5)
    - v9 → v10: GPT-SoVITS voice_sample_prompt column (Phase 6H)
    - v10 → v11: Per-character LLM temperature + mood persistence (Phase 7B)
    - v11 → v12: Expression portraits JSON column (Phase 8A)
    - v12 → v13: Anniversary tracking + per-character voice config (Phase 7D)
    - v13 → v14: Character diary column (Phase 7C #57)
    - v14 → v15: Capability-aware character profiles (Phase 9)
    - v15 → v16: Animation personality profiles (Phase 6F)
    - v16 → v17: Scheduled proactive messages — character_schedules table (Feature C)
    - v17 → v18: Scheduled proactive messages — scheduled_messages delivery queue (Feature C)
    - v18 → v19: Per-emotion TTS voice overrides — emotion_voice_overrides column (Feature H)
    - v19 → v20: Backstory generator, session tags, message pinning (Features 6/9/10)
    - v20 → v21: Message reactions table + day_off flag on characters (Features 22/29)
    - v21 → v22: Universe / Shared World Builder — universes table + universe_id FK on characters (#23)
    - v22 → v23: Character Mood Engine — mood_enabled + mood_intensity columns (Feature A4)
    - Idempotent migrations (safe to run multiple times)
    - Proper error handling and logging
"""

from pathlib import Path
import json
import sqlite3
import logging
import shutil
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT / "backend" / "config"
STORAGE = ROOT / "backend" / "storage"
AVATARS = STORAGE / "avatars"
AUDIO = STORAGE / "audio"
IMAGES = STORAGE / "images"
DB_PATH = STORAGE / "app.db"
LEGACY_DB_PATH = STORAGE / "waifu.db"
APP_JSON = CONFIG_DIR / "app.json"

DEFAULT_CFG = {
  "profile": "auto",
  "input_mode": "text",
  "output_mode": "text+voice",
  "llm": {"provider":"lmstudio","endpoint":"http://127.0.0.1:1234/v1","api_key":"lm-studio","model":""},
  "tts": {"provider":"fish_audio","endpoint":"https://api.fish.audio/v1","api_key":"",
          "voice_id":"8ef4a238714b45718ce04243307c57a7","format":"mp3","sample_rate":24000,
          "fallback_chain":["piper_local","xtts_server","elevenlabs"]},
  "asr": {"enabled":False,"provider":"browser","endpoint":"","api_key":"","model":"whisper-1","language":"en"},
  "vad_threshold": 0.015,
  "typewriter_enabled": False,
  "typewriter_speed": 15,
  "memory": {"max_history": 12},
  "image_gen": {
    "provider": "disabled",
    "endpoint": "http://localhost:8188",
    "model": "z-image-turbo",
    "width": 512,
    "height": 512,
    "steps": 9
  },
  "video_gen": {
    "provider": "disabled",
    "endpoint": "http://localhost:8188",
    "model": "wan2.2-ti2v-5b",
    "duration": 5
  }
}


def ensure_dirs():
    """Create required directory structure if it doesn't exist.

    Creates:
        - backend/config/: Configuration files
        - backend/storage/: Database and files
        - backend/storage/avatars/: VRM/GLB avatar files
        - backend/storage/audio/: Generated TTS audio files

    Example:
        >>> ensure_dirs()
        # Creates all directories with parents
    """
    for p in (CONFIG_DIR, STORAGE, AVATARS, AUDIO, IMAGES):
        p.mkdir(parents=True, exist_ok=True)
    logger.info("✅ Directory structure verified")


def _is_empty_db(path: Path) -> bool:
    """Return True when DB does not exist or is effectively empty."""
    if not path.exists():
        return True
    if path.stat().st_size == 0:
        return True
    return False


def _validate_db(path: Path) -> bool:
    """Validate that a SQLite DB contains the core tables required by the app."""
    if not path.exists() or path.stat().st_size == 0:
        return False
    con = sqlite3.connect(path)
    try:
        cur = con.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cur.fetchall()}
        required = {"sessions", "messages"}
        return required.issubset(tables)
    finally:
        con.close()


def migrate_legacy_db_if_needed():
    """Migrate legacy waifu.db to app.db when app.db is missing or empty."""
    if not _is_empty_db(DB_PATH):
        return

    if _is_empty_db(LEGACY_DB_PATH):
        logger.info("No legacy waifu.db found for migration; initializing fresh app.db")
        return

    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    backup_path = STORAGE / f"waifu.db.bak.{timestamp}"

    shutil.copy2(LEGACY_DB_PATH, backup_path)
    shutil.copy2(LEGACY_DB_PATH, DB_PATH)

    if not _validate_db(DB_PATH):
        raise RuntimeError("Legacy DB migration produced invalid app.db")

    logger.info(f"✅ Migrated legacy database to app.db; backup saved at {backup_path.name}")


def ensure_config():
    """Create default configuration file if it doesn't exist.

    Creates app.json with default LLM, TTS, and ASR settings.
    Will not overwrite existing configuration.

    Example:
        >>> ensure_config()
        # Creates backend/config/app.json if missing
    """
    if not APP_JSON.exists():
        APP_JSON.write_text(json.dumps(DEFAULT_CFG, indent=2), encoding="utf-8")
        logger.info("✅ Created default configuration file")
    else:
        logger.info("✅ Configuration file exists")


def get_schema_version(con: sqlite3.Connection) -> int:
    """Get current database schema version.

    Args:
        con: Active SQLite database connection

    Returns:
        int: Current schema version (0, 3, 4, or 5)
            - 0: Brand new database (no tables)
            - 3: Has tables but no schema_version table
            - 4: Has characters table
            - 5: Has archived column in sessions

    Raises:
        sqlite3.Error: If database is corrupted or inaccessible

    Example:
        >>> con = sqlite3.connect('app.db')
        >>> version = get_schema_version(con)
        >>> print(f"Current version: {version}")
        Current version: 4
    """
    cur = con.cursor()

    try:
        # Check if schema_version table exists
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
        )
        if not cur.fetchone():
            # No version table - check if any tables exist
            cur.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
            table_count = cur.fetchone()[0]

            if table_count == 0:
                logger.info("Empty database detected (v0)")
                return 0  # Brand new database
            else:
                logger.info("Legacy database without versioning detected (v3)")
                return 3  # Has tables but no versioning (v3)

        # Version table exists - get latest version
        cur.execute("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
        result = cur.fetchone()
        version = result[0] if result else 0
        logger.info(f"Current schema version: v{version}")
        return version

    except sqlite3.Error as e:
        logger.error(f"Failed to get schema version: {e}")
        raise


def migrate_to_v4(con: sqlite3.Connection) -> bool:
    """Upgrade database from v3 to v4 (adds characters table).

    Changes in v4:
        - Adds characters table with id, name, system_prompt, avatar_url, etc.
        - Adds schema_version table for migration tracking
        - Adds FOREIGN KEY constraint on messages.session_id
        - Inserts default character (id=1)

    Args:
        con: Active SQLite database connection

    Returns:
        bool: True if migration was applied, False if already at v4+

    Raises:
        FileNotFoundError: If schema_v4.sql file is missing
        sqlite3.Error: If migration SQL execution fails

    Example:
        >>> con = sqlite3.connect('app.db')
        >>> if migrate_to_v4(con):
        ...     print("Migrated to v4")
        ... else:
            print("Already at v4+")
    """
    cur = con.cursor()

    # Check if already at v4+ (schema_version table exists)
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    if cur.fetchone():
        logger.info("Schema v4 already applied (schema_version table exists)")
        return False

    logger.info("Applying schema v4 migration...")
    schema_v4 = ROOT / 'backend' / 'db' / 'legacy' / 'schema_v4.sql'

    if not schema_v4.exists():
        raise FileNotFoundError(f"Migration file not found: {schema_v4}")

    # Apply migration
    try:
        sql = schema_v4.read_text(encoding='utf-8')
        con.executescript(sql)
        con.commit()
        logger.info("✅ Schema v4 migration complete")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v4 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v5(con: sqlite3.Connection) -> bool:
    """Upgrade database from v4 to v5 (adds archived column to sessions).

    Changes in v5:
        - Adds archived INTEGER column to sessions table (default 0)
        - Updates schema_version to 5

    Args:
        con: Active SQLite database connection

    Returns:
        bool: True if migration was applied, False if already at v5

    Raises:
        FileNotFoundError: If schema_v5.sql file is missing
        sqlite3.Error: If migration SQL execution fails

    Example:
        >>> con = sqlite3.connect('app.db')
        >>> if migrate_to_v5(con):
        ...     print("Migrated to v5")
        ... else:
        ...     print("Already at v5")
    """
    cur = con.cursor()

    # Check if archived column already exists
    cur.execute("PRAGMA table_info(sessions)")
    columns = [row[1] for row in cur.fetchall()]

    if 'archived' in columns:
        logger.info("Schema v5 logic: 'archived' column exists. Ensuring version is 5.")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (5)")
        con.commit()
        return False

    logger.info("Applying schema v5 migration...")
    schema_v5 = ROOT / 'backend' / 'db' / 'legacy' / 'schema_v5.sql'

    if not schema_v5.exists():
        raise FileNotFoundError(f"Migration file not found: {schema_v5}")

    # Apply migration
    try:
        sql = schema_v5.read_text(encoding='utf-8')
        con.executescript(sql)
        con.commit()
        logger.info("✅ Schema v5 migration complete")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v5 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v6(con: sqlite3.Connection) -> bool:
    """Upgrade database from v5 to v6 (separates 2D/3D avatar fields).

    Changes in v6:
        - Adds avatar_2d_url TEXT column to characters table
        - Adds vrm_model_url TEXT column to characters table
        - Migrates existing avatar_url data to appropriate new field
        - Updates schema_version to 6

    Args:
        con: Active SQLite database connection

    Returns:
        bool: True if migration was applied, False if already at v6

    Raises:
        FileNotFoundError: If schema_v6.sql file is missing
        sqlite3.Error: If migration SQL execution fails

    Example:
        >>> con = sqlite3.connect('app.db')
        >>> if migrate_to_v6(con):
        ...     print("Migrated to v6")
        ... else:
        ...     print("Already at v6")
    """
    cur = con.cursor()

    # Check if new columns already exist
    cur.execute("PRAGMA table_info(characters)")
    columns = [row[1] for row in cur.fetchall()]

    if 'avatar_2d_url' in columns and 'vrm_model_url' in columns:
        logger.info("Schema v6 logic: avatar_2d_url and vrm_model_url columns exist. Ensuring version is 6.")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (6)")
        con.commit()
        return False

    logger.info("Applying schema v6 migration...")
    schema_v6 = ROOT / 'backend' / 'db' / 'schema_v6.sql'

    if not schema_v6.exists():
        raise FileNotFoundError(f"Migration file not found: {schema_v6}")

    # Apply migration
    try:
        sql = schema_v6.read_text(encoding='utf-8')
        con.executescript(sql)
        con.commit()
        logger.info("✅ Schema v6 migration complete (separated 2D/3D avatar fields)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v6 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v7(con: sqlite3.Connection) -> bool:
    """Upgrade database from v6 to v7 (Phase 3 data foundation).

    Changes in v7:
        - Characters: greeting_text, greeting_animation, background_url, background_mode, voice_sample_path
        - Messages: parent_id, is_active, emotion, char_id (branching + emotion tracking)
        - Sessions: summary column
        - New tables: prompt_templates, character_docs, character_relationships
        - Seeds relationship rows for existing characters

    Args:
        con: Active SQLite database connection

    Returns:
        bool: True if migration was applied, False if already at v7

    Raises:
        FileNotFoundError: If schema_v7.sql file is missing
        sqlite3.Error: If migration SQL execution fails

    Example:
        >>> con = sqlite3.connect('app.db')
        >>> if migrate_to_v7(con):
        ...     print("Migrated to v7")
        ... else:
        ...     print("Already at v7")
    """
    cur = con.cursor()

    # Check if v7 columns already exist (use greeting_text as sentinel)
    cur.execute("PRAGMA table_info(characters)")
    columns = [row[1] for row in cur.fetchall()]

    if 'greeting_text' in columns:
        logger.info("Schema v7 logic: greeting_text column exists. Ensuring version is 7.")
        # Ensure Phase 3E columns exist (added after initial v7 migration)
        if 'vocab_categories' not in columns:
            logger.info("  - Adding vocab_categories to characters (Phase 3E)")
            cur.execute("ALTER TABLE characters ADD COLUMN vocab_categories TEXT")

        # Check sessions table for Phase 3E columns (chat thread manager)
        cur.execute("PRAGMA table_info(sessions)")
        session_cols = [row[1] for row in cur.fetchall()]
        if 'is_pinned' not in session_cols:
            logger.info("  - Adding is_pinned, is_archived to sessions (Phase 3E)")
            cur.execute("ALTER TABLE sessions ADD COLUMN is_pinned INTEGER DEFAULT 0")
            cur.execute("ALTER TABLE sessions ADD COLUMN is_archived INTEGER DEFAULT 0")

        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (7)")
        con.commit()
        return False

    logger.info("Applying schema v7 migration...")
    schema_v7 = ROOT / 'backend' / 'db' / 'schema_v7.sql'

    if not schema_v7.exists():
        raise FileNotFoundError(f"Migration file not found: {schema_v7}")

    try:
        sql = schema_v7.read_text(encoding='utf-8')
        con.executescript(sql)
        con.commit()
        logger.info("✅ Schema v7 migration complete (Phase 3 data foundation)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v7 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v8(con: sqlite3.Connection) -> bool:
    """Upgrade database from v7 to v8 (token data persistence).

    Changes in v8:
        - Messages: token_count, input_token_count, generation_time_ms, tokens_per_second
        - Enables historical messages to display generation statistics

    Args:
        con: Active SQLite database connection

    Returns:
        bool: True if migration was applied, False if already at v8

    Raises:
        FileNotFoundError: If schema_v8.sql file is missing
        sqlite3.Error: If migration SQL execution fails

    Example:
        >>> con = sqlite3.connect('app.db')
        >>> if migrate_to_v8(con):
        ...     print("Migrated to v8")
        ... else:
        ...     print("Already at v8")
    """
    cur = con.cursor()

    # Check if token_count column already exists (idempotent sentinel)
    cur.execute("PRAGMA table_info(messages)")
    columns = [row[1] for row in cur.fetchall()]

    if 'token_count' in columns:
        logger.info("Schema v8 logic: token_count column exists. Ensuring version is 8.")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (8)")
        con.commit()
        return False

    logger.info("Applying schema v8 migration...")
    schema_v8 = ROOT / 'backend' / 'db' / 'schema_v8.sql'

    if not schema_v8.exists():
        raise FileNotFoundError(f"Migration file not found: {schema_v8}")

    try:
        sql = schema_v8.read_text(encoding='utf-8')
        con.executescript(sql)
        con.commit()
        logger.info("✅ Schema v8 migration complete (token data persistence)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v8 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v9(con: sqlite3.Connection) -> bool:
    """Upgrade database from v8 to v9 (Phase 5: per-character LLM + world support).

    Changes in v9:
        - Characters: llm_endpoint, llm_model (per-character LLM routing for TinyAya etc.)
        - Characters: world_video_url, world_description (Phase 5D living world backgrounds)
        - Updates schema_version to 9

    Args:
        con: Active SQLite database connection

    Returns:
        bool: True if migration was applied, False if already at v9

    Raises:
        sqlite3.Error: If database operations fail

    Example:
        >>> con = sqlite3.connect('app.db')
        >>> if migrate_to_v9(con):
        ...     print("Migrated to v9")
        ... else:
        ...     print("Already at v9")
    """
    cur = con.cursor()

    # Use llm_endpoint as the idempotent sentinel column
    cur.execute("PRAGMA table_info(characters)")
    columns = [row[1] for row in cur.fetchall()]

    if 'llm_endpoint' in columns:
        logger.info("Schema v9 logic: llm_endpoint column exists. Ensuring version is 9.")
        # Ensure all v9 columns are present (safe to re-run)
        for col, typedef in [
            ('llm_model', 'TEXT'),
            ('world_video_url', 'TEXT'),
            ('world_description', 'TEXT'),
        ]:
            if col not in columns:
                logger.info(f"  - Adding {col} to characters (v9 catch-up)")
                cur.execute(f"ALTER TABLE characters ADD COLUMN {col} {typedef}")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (9)")
        con.commit()
        return False

    logger.info("Applying schema v9 migration (Phase 5: per-character LLM + world)...")
    try:
        cur.execute("ALTER TABLE characters ADD COLUMN llm_endpoint TEXT")
        cur.execute("ALTER TABLE characters ADD COLUMN llm_model TEXT")
        cur.execute("ALTER TABLE characters ADD COLUMN world_video_url TEXT")
        cur.execute("ALTER TABLE characters ADD COLUMN world_description TEXT")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (9)")
        con.commit()
        logger.info("✅ Schema v9 migration complete (per-character LLM routing + world columns)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v9 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v11(con: sqlite3.Connection) -> bool:
    """Upgrade database from v10 to v11 (Phase 7B: per-character temperature, mood persistence).

    Changes in v11:
        - Characters: llm_temperature (REAL) — per-character LLM temperature override.
          NULL means "use global config temperature". Allows fine-tuning creativity
          per character without affecting global settings.
        - Characters: last_emotion (TEXT) — persists the character's last detected
          emotion across sessions, enabling mood continuity on next open.
        - Characters: last_chat_date (TEXT) — stores the date of the last chat
          (YYYY-MM-DD) for daily greeting detection.

    Args:
        con: Active SQLite database connection.

    Returns:
        bool: True if migration was applied, False if already at v11.

    Raises:
        sqlite3.Error: If database operations fail.

    Example:
        >>> con = sqlite3.connect('app.db')
        >>> if migrate_to_v11(con):
        ...     print("Migrated to v11")
    """
    cur = con.cursor()

    cur.execute("PRAGMA table_info(characters)")
    columns = [row[1] for row in cur.fetchall()]

    # Use llm_temperature as sentinel for v11
    if 'llm_temperature' in columns:
        # Ensure all v11 columns exist (idempotent)
        for col, typedef in [('last_emotion', 'TEXT'), ('last_chat_date', 'TEXT')]:
            if col not in columns:
                cur.execute(f"ALTER TABLE characters ADD COLUMN {col} {typedef}")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (11)")
        con.commit()
        return False

    logger.info("Applying schema v11 migration (Phase 7B: temperature + mood persistence)...")
    try:
        cur.execute("ALTER TABLE characters ADD COLUMN llm_temperature REAL")
        cur.execute("ALTER TABLE characters ADD COLUMN last_emotion TEXT DEFAULT 'neutral'")
        cur.execute("ALTER TABLE characters ADD COLUMN last_chat_date TEXT")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (11)")
        con.commit()
        logger.info("✅ Schema v11 migration complete (llm_temperature, last_emotion, last_chat_date)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v11 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v10(con: sqlite3.Connection) -> bool:
    """Upgrade database from v9 to v10 (Phase 6H: GPT-SoVITS voice_sample_prompt).

    Changes in v10:
        - Characters: voice_sample_prompt (TEXT) — transcript of the reference
          audio clip used by GPT-SoVITS for voice conditioning.

    Args:
        con: Active SQLite database connection

    Returns:
        bool: True if migration was applied, False if already at v10

    Raises:
        sqlite3.Error: If database operations fail

    Example:
        >>> con = sqlite3.connect('app.db')
        >>> if migrate_to_v10(con):
        ...     print("Migrated to v10")
    """
    cur = con.cursor()

    cur.execute("PRAGMA table_info(characters)")
    columns = [row[1] for row in cur.fetchall()]

    if 'voice_sample_prompt' in columns:
        logger.info("Schema v10 logic: voice_sample_prompt column exists. Ensuring version is 10.")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (10)")
        con.commit()
        return False

    logger.info("Applying schema v10 migration (Phase 6H: GPT-SoVITS voice_sample_prompt)...")
    try:
        cur.execute("ALTER TABLE characters ADD COLUMN voice_sample_prompt TEXT")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (10)")
        con.commit()
        logger.info("✅ Schema v10 migration complete (voice_sample_prompt added)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v10 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v12(con: sqlite3.Connection) -> bool:
    """Upgrade database from v11 to v12 (Phase 8A: expression portraits).

    Changes in v12:
        - Characters: expr_portraits (TEXT) — JSON map of emotion names to
          image URLs, e.g. ``{"happy": "/files/images/rin_expr_happy.png"}``.
          Populated by the AI art expression pack generator; used by
          ChatInterface to display 2D portrait reactions during chat.

    Args:
        con: Active SQLite database connection.

    Returns:
        bool: True if migration was applied, False if already at v12.

    Raises:
        sqlite3.Error: If database operations fail.

    Example:
        >>> con = sqlite3.connect('app.db')
        >>> if migrate_to_v12(con):
        ...     print("Migrated to v12")
    """
    cur = con.cursor()

    cur.execute("PRAGMA table_info(characters)")
    columns = [row[1] for row in cur.fetchall()]

    if 'expr_portraits' in columns:
        logger.info("Schema v12 logic: expr_portraits column exists. Ensuring version is 12.")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (12)")
        con.commit()
        return False

    logger.info("Applying schema v12 migration (Phase 8A: expression portraits)...")
    try:
        cur.execute("ALTER TABLE characters ADD COLUMN expr_portraits TEXT")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (12)")
        con.commit()
        logger.info("✅ Schema v12 migration complete (expr_portraits column added)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v12 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v13(con: sqlite3.Connection) -> bool:
    """Apply schema v13 migration (Phase 7D: anniversary tracking + voice config).

    Adds:
        - ``first_chat_date`` (TEXT) — ISO date of the very first conversation
          with this character. Used for anniversary milestone detection (#109).
        - ``voice_config`` (TEXT) — JSON blob for additional voice settings
          (e.g. ElevenLabs stability, SSML style, pitch preset) beyond the
          existing tts_pitch / tts_rate columns (#77).

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration succeeded, False if columns already existed (idempotent).

    Raises:
        sqlite3.Error: If migration fails.
    """
    cur = con.cursor()
    cur.execute("PRAGMA table_info(characters)")
    columns = {row[1] for row in cur.fetchall()}

    # Idempotent: first_chat_date is the sentinel for v13
    if 'first_chat_date' in columns:
        for col, typedef in [('voice_config', 'TEXT')]:
            if col not in columns:
                logger.info(f"  - Adding {col} to characters (v13 catch-up)")
                cur.execute(f"ALTER TABLE characters ADD COLUMN {col} {typedef}")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (13)")
        con.commit()
        return False

    logger.info("Applying schema v13 migration (Phase 7D: anniversary tracking + voice config)...")
    try:
        cur.execute("ALTER TABLE characters ADD COLUMN first_chat_date TEXT")
        cur.execute("ALTER TABLE characters ADD COLUMN voice_config TEXT")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (13)")
        con.commit()
        logger.info("✅ Schema v13 migration complete (first_chat_date, voice_config)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v13 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v14(con: sqlite3.Connection) -> bool:
    """Upgrade database from v13 to v14 (Phase 7C #57: character diary).

    Changes in v14:
        - ``diary`` (TEXT) — Latest diary entry written by the character LLM after
          a session. Stored as plain text; injected into system prompt on next session.
        - ``diary_date`` (TEXT) — ISO date the diary was last written.

    Args:
        con: Active SQLite connection with the database.

    Returns:
        bool: True if migration was applied, False if already at v14.

    Example:
        >>> if migrate_to_v14(con):
        ...     print("Migrated to v14")
    """
    columns = {row[1] for row in con.execute("PRAGMA table_info(characters)")}
    if 'diary' in columns:
        logger.info("Schema v14 logic: diary column exists. Ensuring version is 14.")
        cur = con.cursor()
        for col, typedef in [('diary_date', 'TEXT')]:
            if col not in columns:
                cur.execute(f"ALTER TABLE characters ADD COLUMN {col} {typedef}")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (14)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v14 migration (Phase 7C: character diary)...")
        cur = con.cursor()
        cur.execute("ALTER TABLE characters ADD COLUMN diary TEXT")
        cur.execute("ALTER TABLE characters ADD COLUMN diary_date TEXT")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (14)")
        con.commit()
        logger.info("✅ Schema v14 migration complete (diary, diary_date added)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v14 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v15(con: sqlite3.Connection) -> bool:
    """Apply schema v15 migration (Phase 9: Capability-Aware Characters).

    Adds:
        - ``capability_profile`` (TEXT) — JSON blob storing per-character LLM
          capability metadata: model tier requirement, context budget, feature
          flags (tool use, thinking, vision), prompt style, penalties, and notes.
          NULL = use global defaults (backward-compatible, zero disruption).

    The capability profile allows the chat pipeline to adapt system prompts,
    gate features, budget context windows, and warn users when there's a
    mismatch between persona requirements and the loaded model.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if column already existed.

    Raises:
        sqlite3.Error: If migration fails.

    Example:
        >>> if migrate_to_v15(con):
        ...     print("Migrated to v15")
    """
    columns = {row[1] for row in con.execute("PRAGMA table_info(characters)")}
    if 'capability_profile' in columns:
        logger.info("Schema v15 logic: capability_profile column exists. Ensuring version is 15.")
        cur = con.cursor()
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (15)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v15 migration (Phase 9: capability profiles)...")
        cur = con.cursor()
        cur.execute("ALTER TABLE characters ADD COLUMN capability_profile TEXT")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (15)")
        con.commit()
        logger.info("✅ Schema v15 migration complete (capability_profile column added)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v15 migration failed: {e}")
        con.rollback()
        raise



def migrate_to_v16(con: sqlite3.Connection) -> bool:
    """Apply schema v16 migration (Phase 6F: Layered Animation Personality).

    Adds:
        - ``animation_profile`` (TEXT) — JSON blob storing per-character animation
          personality parameters: energy, confidence, nervousness, expressiveness,
          playfulness (each 0–1). NULL = use defaults (backward-compatible).

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if column already existed.

    Raises:
        sqlite3.Error: If migration fails.

    Example:
        >>> if migrate_to_v16(con):
        ...     print("Migrated to v16")
    """
    columns = {row[1] for row in con.execute("PRAGMA table_info(characters)")}
    if 'animation_profile' in columns:
        logger.info("Schema v16 logic: animation_profile column exists. Ensuring version is 16.")
        cur = con.cursor()
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (16)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v16 migration (Phase 6F: animation personality profiles)...")
        cur = con.cursor()
        cur.execute("ALTER TABLE characters ADD COLUMN animation_profile TEXT")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (16)")
        con.commit()
        logger.info("✅ Schema v16 migration complete (animation_profile column added)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v16 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v17(con: sqlite3.Connection) -> bool:
    """Apply schema v17 migration (Feature C: Scheduled Proactive Messages).

    Adds the ``character_schedules`` table which stores per-character rules for
    autonomous proactive messages.  Each row defines when the character should
    reach out unprompted — either at a fixed time of day (morning/evening) or
    after a configurable period of inactivity (away trigger).

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if table already existed (idempotent).

    Raises:
        sqlite3.Error: If migration fails.

    Example:
        >>> if migrate_to_v17(con):
        ...     print("Migrated to v17")
    """
    cur = con.cursor()
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='character_schedules'"
    )
    if cur.fetchone():
        logger.info("Schema v17 logic: character_schedules table exists. Ensuring version is 17.")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (17)")
        con.commit()
        return False

    logger.info("Applying schema v17 migration (Feature C: scheduled proactive messages)...")
    try:
        cur.execute("""
            CREATE TABLE character_schedules (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id       INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                schedule_type TEXT    NOT NULL DEFAULT 'morning',
                time_of_day   TEXT,
                hours_away    REAL    DEFAULT 4.0,
                enabled       INTEGER NOT NULL DEFAULT 1,
                last_triggered TEXT,
                created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
            )
        """)
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_schedules_char ON character_schedules (char_id)"
        )
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (17)")
        con.commit()
        logger.info("✅ Schema v17 migration complete (character_schedules table added)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v17 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v18(con: sqlite3.Connection) -> bool:
    """Apply schema v18 migration (Feature C: Scheduled Messages Delivery Queue).

    Adds the ``scheduled_messages`` table which stores AI-generated proactive
    messages that the background scheduler has queued for delivery to the
    frontend.  The frontend polls ``GET /api/scheduler/pending`` for unread
    rows and acknowledges them via ``POST /api/scheduler/acknowledge``.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if table already existed (idempotent).

    Raises:
        sqlite3.Error: If migration fails.

    Example:
        >>> if migrate_to_v18(con):
        ...     print("Migrated to v18")
    """
    cur = con.cursor()
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_messages'"
    )
    if cur.fetchone():
        logger.info("Schema v18 logic: scheduled_messages table exists. Ensuring version is 18.")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (18)")
        con.commit()
        return False

    logger.info("Applying schema v18 migration (Feature C: scheduled messages delivery queue)...")
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS scheduled_messages (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id      INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                text         TEXT    NOT NULL,
                triggered_at INTEGER NOT NULL,
                delivered    INTEGER NOT NULL DEFAULT 0,
                created_at   INTEGER NOT NULL DEFAULT (unixepoch())
            )
        """)
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_scheduled_messages_char "
            "ON scheduled_messages (char_id, delivered)"
        )
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (18)")
        con.commit()
        logger.info("✅ Schema v18 migration complete (scheduled_messages table added)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v18 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v19(con: sqlite3.Connection) -> bool:
    """Apply schema v19 migration (Feature H: Voice Per Emotion).

    Adds:
        - ``emotion_voice_overrides`` (TEXT) — JSON blob mapping emotion names
          to TTS voice IDs.  When the character expresses a specific emotion,
          the corresponding voice is used instead of the default ``voice_id``.
          Schema: ``{"happy": "af_nicole", "sad": "bm_lewis", "angry": "af_sky"}``.
          NULL = no overrides; the character always uses its default voice.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if column already existed (idempotent).

    Raises:
        sqlite3.Error: If migration fails.

    Example:
        >>> if migrate_to_v19(con):
        ...     print("Migrated to v19")
    """
    columns = {row[1] for row in con.execute("PRAGMA table_info(characters)")}
    if 'emotion_voice_overrides' in columns:
        logger.info("Schema v19 logic: emotion_voice_overrides column exists. Ensuring version is 19.")
        cur = con.cursor()
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (19)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v19 migration (Feature H: per-emotion TTS voice overrides)...")
        cur = con.cursor()
        cur.execute("ALTER TABLE characters ADD COLUMN emotion_voice_overrides TEXT DEFAULT NULL")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (19)")
        con.commit()
        logger.info("✅ Schema v19 migration complete (emotion_voice_overrides column added)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v19 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v20(con: sqlite3.Connection) -> bool:
    """Apply schema v20 migration (Features 6/9/10: backstory, session tags, message pinning).

    Adds:
        - ``backstory`` (TEXT) on ``characters`` — LLM-generated character backstory text.
          NULL = no backstory generated yet.
        - ``tags`` (TEXT) on ``sessions`` — JSON array of string labels (e.g. ``["roleplay"]``).
          Defaults to the empty JSON array ``'[]'``.
        - ``pinned`` (INTEGER) on ``messages`` — 1 if the message is pinned, 0 otherwise.
          Defaults to 0.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if all columns already existed (idempotent).

    Raises:
        sqlite3.Error: If migration fails.

    Example:
        >>> if migrate_to_v20(con):
        ...     print("Migrated to v20")
    """
    char_cols = {row[1] for row in con.execute("PRAGMA table_info(characters)")}
    sess_cols = {row[1] for row in con.execute("PRAGMA table_info(sessions)")}
    msg_cols  = {row[1] for row in con.execute("PRAGMA table_info(messages)")}

    already_done = (
        'backstory' in char_cols
        and 'tags'      in sess_cols
        and 'pinned'    in msg_cols
    )
    if already_done:
        logger.info("Schema v20 logic: all columns exist. Ensuring version is 20.")
        cur = con.cursor()
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (20)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v20 migration (Features 6/9/10: backstory, tags, pinning)...")
        cur = con.cursor()

        if 'backstory' not in char_cols:
            cur.execute("ALTER TABLE characters ADD COLUMN backstory TEXT DEFAULT NULL")
            logger.info("  - Added characters.backstory")

        if 'tags' not in sess_cols:
            cur.execute("ALTER TABLE sessions ADD COLUMN tags TEXT DEFAULT '[]'")
            logger.info("  - Added sessions.tags")

        if 'pinned' not in msg_cols:
            cur.execute("ALTER TABLE messages ADD COLUMN pinned INTEGER DEFAULT 0")
            logger.info("  - Added messages.pinned")

        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (20)")
        con.commit()
        logger.info("✅ Schema v20 migration complete (backstory, tags, pinned columns added)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v20 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v21(con: sqlite3.Connection) -> bool:
    """Apply schema v21 migration (Features 22/29: message reactions + day_off mode).

    Adds:
        - ``message_reactions`` table — stores emoji reactions attached to individual
          messages.  Cascade-deletes when the parent message is removed.
        - ``idx_reactions_message`` index on ``message_reactions(message_id)`` —
          keeps reaction look-ups fast when fetching all reactions for a message.
        - ``day_off`` (INTEGER) on ``characters`` — boolean flag (0/1).  When 1, the
          background scheduler will skip all proactive/scheduled messages for that
          character.  Defaults to 0 (normal scheduling).

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if all structures already existed
        (idempotent).

    Raises:
        sqlite3.Error: If migration fails.

    Example:
        >>> if migrate_to_v21(con):
        ...     print("Migrated to v21")
    """
    char_cols = {row[1] for row in con.execute("PRAGMA table_info(characters)")}
    tables = {
        row[0]
        for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }

    already_done = (
        "message_reactions" in tables
        and "day_off" in char_cols
    )
    if already_done:
        logger.info("Schema v21 logic: message_reactions table and day_off column exist. Ensuring version is 21.")
        cur = con.cursor()
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (21)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v21 migration (Features 22/29: reactions, day_off)...")
        cur = con.cursor()

        if "message_reactions" not in tables:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS message_reactions (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
                    emoji      TEXT    NOT NULL,
                    ts         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_reactions_message "
                "ON message_reactions(message_id)"
            )
            logger.info("  - Created message_reactions table + idx_reactions_message index")

        if "day_off" not in char_cols:
            cur.execute("ALTER TABLE characters ADD COLUMN day_off INTEGER DEFAULT 0")
            logger.info("  - Added characters.day_off (Feature 29: Day Off Mode)")

        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (21)")
        con.commit()
        logger.info("✅ Schema v21 migration complete (message_reactions, day_off added)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v21 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v22(con: sqlite3.Connection) -> bool:
    """Apply schema v22 migration (Feature #23: Universe / Shared World Builder).

    Adds:
        - ``universes`` table — stores named universes, each with a ``lore`` text
          document that is prepended to every member character's system prompt.
          Columns: ``id``, ``name``, ``lore``, ``created_at``.
        - ``universe_id`` (INTEGER) on ``characters`` — nullable FK referencing
          ``universes(id) ON DELETE SET NULL``.  NULL means the character belongs to
          no universe (backward-compatible, no disruption).

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if all structures already existed
        (idempotent).

    Raises:
        sqlite3.Error: If migration fails.

    Example:
        >>> if migrate_to_v22(con):
        ...     print("Migrated to v22")
    """
    tables = {
        row[0]
        for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    char_cols = {row[1] for row in con.execute("PRAGMA table_info(characters)")}

    already_done = "universes" in tables and "universe_id" in char_cols
    if already_done:
        logger.info("Schema v22 logic: universes table and universe_id column exist. Ensuring version is 22.")
        cur = con.cursor()
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (22)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v22 migration (Feature #23: Universe / Shared World Builder)...")
        cur = con.cursor()

        if "universes" not in tables:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS universes (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    name       TEXT    NOT NULL,
                    lore       TEXT    DEFAULT '',
                    created_at TEXT    DEFAULT (datetime('now'))
                )
            """)
            logger.info("  - Created universes table")

        if "universe_id" not in char_cols:
            # SQLite does not support adding a FK inline via ALTER TABLE, but we can
            # add a plain INTEGER column and enforce the relationship at the app layer.
            # ON DELETE SET NULL semantics are enforced by the delete_universe endpoint.
            cur.execute("ALTER TABLE characters ADD COLUMN universe_id INTEGER DEFAULT NULL")
            logger.info("  - Added characters.universe_id (Feature #23: Universe membership)")

        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (22)")
        con.commit()
        logger.info("✅ Schema v22 migration complete (universes table + universe_id column added)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v22 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v23(con: sqlite3.Connection) -> bool:
    """Apply schema v23 migration (Feature A4: Character Mood Engine).

    Adds two columns to the ``characters`` table:
        - ``mood_enabled`` (INTEGER, default 1) -- whether time-of-day mood
          injection is active for this character.
        - ``mood_intensity`` (REAL, default 0.8) -- 0.0--1.0 scale factor
          controlling how strongly the mood prefix influences the system prompt.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if columns already existed
        (idempotent).

    Raises:
        sqlite3.Error: If migration fails.

    Example:
        >>> if migrate_to_v23(con):
        ...     print("Migrated to v23")
    """
    char_cols = {row[1] for row in con.execute("PRAGMA table_info(characters)")}

    already_done = "mood_enabled" in char_cols and "mood_intensity" in char_cols
    if already_done:
        logger.info("Schema v23 logic: mood columns already exist. Ensuring version is 23.")
        cur = con.cursor()
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (23)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v23 migration (Feature A4: Character Mood Engine)...")
        cur = con.cursor()

        if "mood_enabled" not in char_cols:
            cur.execute("ALTER TABLE characters ADD COLUMN mood_enabled INTEGER DEFAULT 1")
            logger.info("  - Added characters.mood_enabled (Feature A4: mood toggle)")

        if "mood_intensity" not in char_cols:
            cur.execute("ALTER TABLE characters ADD COLUMN mood_intensity REAL DEFAULT 0.8")
            logger.info("  - Added characters.mood_intensity (Feature A4: mood strength 0.0-1.0)")

        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (23)")
        con.commit()
        logger.info("✅ Schema v23 migration complete (mood_enabled + mood_intensity columns)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v23 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v24(con: sqlite3.Connection) -> bool:
    """Apply schema v24 migration (Feature C4: Companion Opening Greeting).

    Adds two columns to the ``characters`` table:
        - ``greeting_enabled`` (INTEGER, default 1) -- whether the contextual
          opening greeting is shown when the user selects this character.
        - ``greeting_intensity`` (REAL, default 0.8) -- 0.0 (brief) to 1.0 (full)
          controls how much context is woven into the greeting.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v24.

    Example:
        >>> if migrate_to_v24(con):
        ...     print("Migrated to v24")
    """
    char_cols = {row[1] for row in con.execute("PRAGMA table_info(characters)")}
    already_done = "greeting_enabled" in char_cols and "greeting_intensity" in char_cols
    if already_done:
        cur = con.cursor()
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (24)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v24 migration (Feature C4: Opening Greeting)...")
        cur = con.cursor()
        if "greeting_enabled" not in char_cols:
            cur.execute("ALTER TABLE characters ADD COLUMN greeting_enabled INTEGER DEFAULT 1")
            logger.info("  - Added characters.greeting_enabled (Feature C4)")
        if "greeting_intensity" not in char_cols:
            cur.execute("ALTER TABLE characters ADD COLUMN greeting_intensity REAL DEFAULT 0.8")
            logger.info("  - Added characters.greeting_intensity (Feature C4)")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (24)")
        con.commit()
        logger.info("✅ Schema v24 migration complete (greeting_enabled + greeting_intensity)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v24 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v25(con: sqlite3.Connection) -> bool:
    """Apply schema v25 migration (Feature A6: Lorebook / World Info Injection).

    Creates the ``lore_entries`` table for keyword-triggered context injection.
    Each entry belongs to a character and contains trigger keywords (JSON array),
    content text, an injection position, and a priority for ordering.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v25.

    Example:
        >>> if migrate_to_v25(con):
        ...     print("Migrated to v25")
    """
    tables = {row[0] for row in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    already_done = "lore_entries" in tables
    if already_done:
        cur = con.cursor()
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (25)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v25 migration (Feature A6: Lorebook / World Info)...")
        cur = con.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS lore_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                keywords TEXT NOT NULL DEFAULT '[]',
                injection_position TEXT NOT NULL DEFAULT 'after_system_prompt',
                priority INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        logger.info("  - Created lore_entries table (Feature A6)")
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (25)")
        con.commit()
        logger.info("Schema v25 migration complete (lore_entries table)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v25 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v26(con: sqlite3.Connection) -> bool:
    """Apply schema v26 migration (Feature C2: Smart Tool Use Protocol Cache).

    Creates the ``model_capability_cache`` table used by CapabilityDetector to
    store the resolved tool protocol (openai_functions / xml_fallback / none)
    per model ID so detection only runs once per model.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v26.
    """
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "model_capability_cache" in tables:
        cur = con.cursor()
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (26)")
        con.commit()
        return False
    try:
        logger.info("Applying schema v26 migration (Feature C2: model capability cache)...")
        con.execute("""
            CREATE TABLE model_capability_cache (
                model_id TEXT PRIMARY KEY,
                tool_protocol TEXT NOT NULL DEFAULT 'xml_fallback',
                reasoning_capable INTEGER NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'pattern',
                manual_override INTEGER NOT NULL DEFAULT 0,
                cached_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (26)")
        con.commit()
        logger.info("✅ Schema v26 migration complete (model_capability_cache table)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v26 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v27(con: sqlite3.Connection) -> bool:
    """Apply schema v27 migration (Feature C3: Companion User Knowledge Graph).

    Creates the ``user_facts`` table which stores structured facts the character
    has learned about the user — their name, preferences, life events, and
    running jokes.  Facts are either auto-extracted by the LLM (source='auto')
    or manually added by the user (source='manual').

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v27.

    Example:
        >>> if migrate_to_v27(con):
        ...     print("user_facts table created")
    """
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "user_facts" in tables:
        cur = con.cursor()
        cur.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (27)")
        con.commit()
        return False
    try:
        logger.info("Applying schema v27 migration (Feature C3: user knowledge graph)...")
        con.execute("""
            CREATE TABLE user_facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                category TEXT NOT NULL DEFAULT 'general',
                fact_text TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'auto',
                confidence REAL NOT NULL DEFAULT 0.8,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_user_facts_char ON user_facts(character_id)")
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (27)")
        con.commit()
        logger.info("✅ Schema v27 migration complete (user_facts table)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v27 migration failed: {e}")
        con.rollback()
        raise


def ensure_db():
    """Initialize or upgrade database to latest schema version.

    Migration Paths:
        - v0 (empty) → v4 → ... → v26
        - v3 → v4 → ... → v26
        - v11 → v12 → v13 → v26
        - v21 → v22 → v23 → v24 → v25 → v26
        - v26 → no-op (already current)

    The function is idempotent - safe to run multiple times.
    Will log all migration steps and verify final state.

    Raises:
        RuntimeError: If migration fails or final version is incorrect
        FileNotFoundError: If required schema files are missing
        sqlite3.Error: If database operations fail

    Example:
        >>> ensure_db()
        # Automatically detects current version and applies necessary migrations
        INFO:__main__:Current schema version: v6
        INFO:__main__:Upgrading from v6 to v7...
        INFO:__main__:✅ Schema v7 migration complete
        INFO:__main__:✅ Database ready (schema v7)
    """
    logger.info("Initializing database...")
    migrate_legacy_db_if_needed()
    con = sqlite3.connect(DB_PATH)

    try:
        version = get_schema_version(con)
        logger.info(f"Current database schema version: v{version}")

        # Handle brand new database
        if version == 0:
            logger.info("Creating new database with schema v4...")
            migrate_to_v4(con)
            version = 4

        # Upgrade from v3 to v4 (Adds characters table)
        if version < 4:
            logger.info("Upgrading database schema from v3 to v4...")
            logger.info("  - Creating 'characters' table")
            logger.info("  - Adding default character 'Rin'")
            if migrate_to_v4(con):
                version = 4

        # Upgrade from v4 to v5 (Adds TTS pitch/rate controls)
        if version < 5:
            logger.info("Upgrading database schema from v4 to v5...")
            logger.info("  - Adding tts_pitch and tts_rate to characters")
            if migrate_to_v5(con):
                version = 5

        # Upgrade from v5 to v6 (Separates 2D/3D avatar fields)
        if version < 6:
            logger.info("Upgrading database schema from v5 to v6...")
            logger.info("  - Separating avatar_2d_url and vrm_model_url fields")
            if migrate_to_v6(con):
                version = 6

        # Upgrade from v6 to v7 (Phase 3 data foundation)
        if version < 7:
            logger.info("Upgrading database schema from v6 to v7...")
            logger.info("  - Adding message branching (parent_id, is_active)")
            logger.info("  - Adding emotion tracking, character greetings")
            logger.info("  - Creating prompt_templates, character_docs, character_relationships tables")
            if migrate_to_v7(con):
                version = 7

        # Upgrade from v7 to v8 (Token data persistence)
        if version < 8:
            logger.info("Upgrading database schema from v7 to v8...")
            logger.info("  - Adding token_count, input_token_count to messages")
            logger.info("  - Adding generation_time_ms, tokens_per_second to messages")
            if migrate_to_v8(con):
                version = 8

        # Upgrade from v8 to v9 (Phase 5: per-character LLM routing + world columns)
        if version < 9:
            logger.info("Upgrading database schema from v8 to v9...")
            logger.info("  - Adding llm_endpoint, llm_model to characters (TinyAya/Ollama routing)")
            logger.info("  - Adding world_video_url, world_description to characters")
            if migrate_to_v9(con):
                version = 9

        # Upgrade from v9 to v10 (Phase 6H: GPT-SoVITS voice_sample_prompt)
        if version < 10:
            logger.info("Upgrading database schema from v9 to v10...")
            logger.info("  - Adding voice_sample_prompt to characters (GPT-SoVITS conditioning text)")
            if migrate_to_v10(con):
                version = 10

        # Upgrade from v10 to v11 (Phase 7B: per-character temperature + mood persistence)
        if version < 11:
            logger.info("Upgrading database schema from v10 to v11...")
            logger.info("  - Adding llm_temperature to characters (per-character creativity override)")
            logger.info("  - Adding last_emotion to characters (mood persistence between sessions)")
            logger.info("  - Adding last_chat_date to characters (daily greeting detection)")
            if migrate_to_v11(con):
                version = 11

        # Upgrade from v11 to v12 (Phase 8A: expression portraits)
        if version < 12:
            logger.info("Upgrading database schema from v11 to v12...")
            logger.info("  - Adding expr_portraits to characters (AI-generated expression portrait URLs)")
            if migrate_to_v12(con):
                version = 12

        # Upgrade from v12 to v13 (Phase 7D: anniversary tracking + voice config)
        if version < 13:
            logger.info("Upgrading database schema from v12 to v13...")
            logger.info("  - Adding first_chat_date to characters (anniversary milestone tracking)")
            logger.info("  - Adding voice_config to characters (extended per-character voice settings)")
            if migrate_to_v13(con):
                version = 13

        # Upgrade from v13 to v14 (Phase 7C #57: character diary)
        if version < 14:
            logger.info("Upgrading database schema from v13 to v14...")
            logger.info("  - Adding diary to characters (LLM-written session diary entry)")
            logger.info("  - Adding diary_date to characters (date of latest diary entry)")
            if migrate_to_v14(con):
                version = 14

        # Upgrade from v14 to v15 (Phase 9: capability-aware characters)
        if version < 15:
            logger.info("Upgrading database schema from v14 to v15...")
            logger.info("  - Adding capability_profile to characters (per-character LLM capability metadata)")
            if migrate_to_v15(con):
                version = 15


        # Upgrade from v15 to v16 (Phase 6F: animation personality profiles)
        if version < 16:
            logger.info("Upgrading database schema from v15 to v16...")
            logger.info("  - Adding animation_profile to characters (layered animation personality)")
            if migrate_to_v16(con):
                version = 16

        # Upgrade from v16 to v17 (Feature C: scheduled proactive messages)
        if version < 17:
            logger.info("Upgrading database schema from v16 to v17...")
            logger.info("  - Creating character_schedules table (proactive message scheduling)")
            if migrate_to_v17(con):
                version = 17

        # Upgrade from v17 to v18 (Feature C: scheduled messages delivery queue)
        if version < 18:
            logger.info("Upgrading database schema from v17 to v18...")
            logger.info("  - Creating scheduled_messages table (pending message delivery queue)")
            if migrate_to_v18(con):
                version = 18

        # Upgrade from v18 to v19 (Feature H: per-emotion TTS voice overrides)
        if version < 19:
            logger.info("Upgrading database schema from v18 to v19...")
            logger.info("  - Adding emotion_voice_overrides to characters (per-emotion TTS voice selection)")
            if migrate_to_v19(con):
                version = 19

        # Upgrade from v19 to v20 (Features 6/9/10: backstory, session tags, message pinning)
        if version < 20:
            logger.info("Upgrading database schema from v19 to v20...")
            logger.info("  - Adding backstory to characters (LLM-generated character backstory)")
            logger.info("  - Adding tags to sessions (JSON array of string labels)")
            logger.info("  - Adding pinned to messages (message pinning flag)")
            if migrate_to_v20(con):
                version = 20

        # Upgrade from v20 to v21 (Features 22/29: message reactions + day_off mode)
        if version < 21:
            logger.info("Upgrading database schema from v20 to v21...")
            logger.info("  - Creating message_reactions table (Feature 22: Message Reactions)")
            logger.info("  - Adding day_off to characters (Feature 29: Day Off Mode)")
            if migrate_to_v21(con):
                version = 21

        # Upgrade from v21 to v22 (Feature #23: Universe / Shared World Builder)
        if version < 22:
            logger.info("Upgrading database schema from v21 to v22...")
            logger.info("  - Creating universes table (Feature #23: Universe Builder)")
            logger.info("  - Adding universe_id to characters (Feature #23: Universe membership FK)")
            if migrate_to_v22(con):
                version = 22

        # Upgrade from v22 to v23 (Feature A4: Character Mood Engine)
        if version < 23:
            logger.info("Upgrading database schema from v22 to v23...")
            logger.info("  - Adding mood_enabled to characters (Feature A4: mood toggle)")
            logger.info("  - Adding mood_intensity to characters (Feature A4: mood strength)")
            if migrate_to_v23(con):
                version = 23

        # Upgrade from v23 to v24 (Feature C4: Companion Opening Greeting)
        if version < 24:
            logger.info("Upgrading database schema from v23 to v24...")
            logger.info("  - Adding greeting_enabled to characters (Feature C4)")
            logger.info("  - Adding greeting_intensity to characters (Feature C4)")
            if migrate_to_v24(con):
                version = 24

        # Upgrade from v24 to v25 (Feature A6: Lorebook / World Info Injection)
        if version < 25:
            logger.info("Upgrading database schema from v24 to v25...")
            logger.info("  - Creating lore_entries table (Feature A6: Lorebook)")
            if migrate_to_v25(con):
                version = 25

        # Upgrade from v25 to v26 (Feature C2: Smart Tool Use Protocol Cache)
        if version < 26:
            logger.info("Upgrading database schema from v25 to v26...")
            if migrate_to_v26(con):
                version = 26

        # Upgrade from v26 to v27 (Feature C3: User Knowledge Graph)
        if version < 27:
            logger.info("Upgrading database schema from v26 to v27...")
            logger.info("  - Creating user_facts table (Feature C3: user knowledge graph)")
            if migrate_to_v27(con):
                version = 27

        # Verify final state
        final_version = get_schema_version(con)

        if final_version < 27:
            raise RuntimeError(f"Database initialization failed: Expected v27, got v{final_version}")

        if final_version > 27:
            logger.warning(f"Database is newer than application (v{final_version} > v27). Some features might be unused.")

        # Sync PRAGMA user_version with our schema_version table so external
        # tools (DB Browser, etc.) can see the version without querying tables.
        con.execute(f"PRAGMA user_version = {final_version}")
        con.commit()

        logger.info(f"✅ Database ready (schema v{final_version} active — v27 adds user knowledge graph)")

    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        con.rollback()
        raise
    finally:
        con.close()


def run():
    """Run all preflight checks and initialization.

    Executes in order:
        1. ensure_dirs(): Create directory structure
        2. ensure_config(): Create default configuration
        3. ensure_db(): Initialize/upgrade database

    This is the main entry point called by the FastAPI server
    on startup and can also be run standalone.

    Example:
        >>> run()
        INFO:__main__:✅ Directory structure verified
        INFO:__main__:✅ Configuration file exists
        INFO:__main__:Initializing database...
        INFO:__main__:Current database schema version: v5
        INFO:__main__:✅ Database ready (schema v5)
    """
    logger.info("Running preflight checks...")
    ensure_dirs()
    ensure_config()
    ensure_db()
    logger.info("✅ All preflight checks complete")


def init_db_v4(db_path: Path):
    """Initialize database explicitly to Schema v4 (Revert/Upgrade)."""
    logger.info(f"Ensuring Schema v4 on {db_path}...")
    con = sqlite3.connect(db_path)
    try:
        version = get_schema_version(con)
        if version < 4:
            migrate_to_v4(con)
        elif version > 4:
            logger.warning(f"Downgrade from v{version} to v4 requested. This is risky.")
            # In a real scenario, we might drop tables or alter columns back.
            # For now, we just log it as the user explicitly asked for v4 logic.
        logger.info("✅ Database init complete (Schema v4 logic active)")
    finally:
        con.close()

if __name__ == "__main__":
    run()
