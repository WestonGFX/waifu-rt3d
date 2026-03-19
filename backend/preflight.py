"""
Database initialization and migration system for waifu-rt3d.

This module handles:
- Directory structure creation
- Configuration file initialization
- Database schema migrations (v3 → v4 → … → v55)

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
    - v51 → v52: system_prompt_lite for tiered character prompts
    - v52 → v53: Proactive AI messages — proactive columns on characters + proactive_milestones table
    - v53 → v54: Hierarchical summarization — meta_summary_id on session_summaries
    - v54 → v55: Adaptive Intelligence — user_profiles table + engagement columns on messages
    - v55 → v56: Bond Progression System — bond_stories, character_gifts, gift_history tables
                  + bond_level/bond_xp/relationship_mode/covenant_date on character_relationships
                  + active_outfit_id on characters
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


def migrate_to_v28(con: sqlite3.Connection) -> bool:
    """Apply schema v28 migration (Feature B4: Author's Note / Soft Prompt Injection).

    Adds three columns to the ``sessions`` table:

    - ``author_note`` (TEXT): The director's note text, injected silently.
    - ``author_note_position`` (TEXT): Injection position; one of
      ``before_system``, ``after_system``, ``before_last``, ``after_last2``.
    - ``author_note_enabled`` (INTEGER 0/1): Toggle without clearing the note.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v28.

    Example:
        >>> if migrate_to_v28(con):
        ...     print("author_note columns added to sessions")
    """
    columns = {row[1] for row in con.execute("PRAGMA table_info(sessions)")}
    if "author_note" in columns:
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (28)")
        con.commit()
        return False
    try:
        logger.info("Applying schema v28 migration (Feature B4: author's note)...")
        for stmt in (
            "ALTER TABLE sessions ADD COLUMN author_note TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE sessions ADD COLUMN author_note_position TEXT NOT NULL DEFAULT 'after_system'",
            "ALTER TABLE sessions ADD COLUMN author_note_enabled INTEGER NOT NULL DEFAULT 0",
        ):
            con.execute(stmt)
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (28)")
        con.commit()
        logger.info("✅ Schema v28 migration complete (author_note on sessions)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v28 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v29(con: sqlite3.Connection) -> bool:
    """Apply schema v29 migration (Feature A2: In-App Mini Games).

    Creates the ``game_sessions`` table which stores per-character game history.
    Each row captures one complete game: type (trivia, twenty_questions, etc.),
    result (win/loss/draw), score, and duration.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v29.

    Example:
        >>> if migrate_to_v29(con):
        ...     print("game_sessions table created")
    """
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "game_sessions" in tables:
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (29)")
        con.commit()
        return False
    try:
        logger.info("Applying schema v29 migration (Feature A2: mini games)...")
        con.execute("""
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
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_game_sessions_char ON game_sessions(character_id)")
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (29)")
        con.commit()
        logger.info("✅ Schema v29 migration complete (game_sessions table)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v29 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v30(con: sqlite3.Connection) -> bool:
    """Apply schema v30 migration (Feature A3: Tiered Episodic Memory).

    Creates the ``memories`` table for structured per-tier memory storage.
    The sqlite-vec ``memories_vec`` virtual table is created at runtime by
    ``TieredMemoryManager`` (after loading the extension) — not here, because
    sqlite-vec requires the extension to be loaded first which is not possible
    during a bare sqlite3 connection in preflight.

    Adds ``memory_decay_mode`` and ``memory_top_k`` to the config via the
    app.json config file (handled by the application layer, not DB schema).

    Schema additions:
        ``memories`` table with columns:
            id, character_id, session_id, role, text, tier, salience,
            created_at, promoted_at.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v30.

    Example:
        >>> if migrate_to_v30(con):
        ...     print("memories table created")
    """
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "memories" in tables:
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (30)")
        con.commit()
        return False
    try:
        logger.info("Applying schema v30 migration (Feature A3: tiered memory)...")
        con.execute("""
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
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_memories_char ON memories(character_id)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier)")
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (30)")
        con.commit()
        logger.info("✅ Schema v30 migration complete (memories table — sqlite-vec vec table created at runtime)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v30 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v31(con: sqlite3.Connection) -> bool:
    """Apply schema v31 migration (Phase 15: Enhanced Emotion Portraits).

    Adds the ``emotion_portraits_mode`` column to the ``characters`` table.
    This integer column controls how per-message emotion portraits are
    displayed:
        0 = off (static avatar everywhere)
        1 = chat bubbles only (per-message emotion portraits)
        2 = chat bubbles + sidebar indicator

    Also creates the ``expr_portraits/`` directory structure for per-character
    portrait files (moving away from flat files in ``images/``).

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v31.

    Example:
        >>> if migrate_to_v31(con):
        ...     print("emotion_portraits_mode column added")
    """
    # Check if column already exists
    cols = {row[1] for row in con.execute("PRAGMA table_info(characters)")}
    if "emotion_portraits_mode" in cols:
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (31)")
        con.commit()
        return False
    try:
        logger.info("Applying schema v31 migration (Phase 15: emotion portraits mode)...")
        con.execute("ALTER TABLE characters ADD COLUMN emotion_portraits_mode INTEGER NOT NULL DEFAULT 0")
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (31)")
        con.commit()

        # Create per-character portrait directory
        portraits_dir = Path(__file__).resolve().parent / "storage" / "images" / "expr_portraits"
        portraits_dir.mkdir(parents=True, exist_ok=True)

        logger.info("✅ Schema v31 migration complete (emotion_portraits_mode column)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v31 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v32(con: sqlite3.Connection) -> bool:
    """Apply schema v32 migration (Phase 16: Character Bible v1.2 Restoration).

    Renames 4 built-in characters to match the Character Bible v1.2 naming
    and upgrades their system prompts from 1-2 sentences to full multi-paragraph
    Bible-level prompts.  Also inserts 2 new characters (Shiori, Mika).

    Character changes:
        - ``Fox (Rin)`` → ``Rin (Akane)`` (tsundere, Bible prompt)
        - ``Kuudere (Nyx)`` → ``Ayane (Yuki)`` (kuudere, human — no android)
        - ``Onee-san (Seraph)`` → ``Hana (Momoka)`` (deredere, replaces Seraph)
        - ``Goth (Viper)`` → ``Sable (Kuroha)`` (sadodere, Bible prompt)
        - NEW: ``Shiori (Nana)`` (dandere)
        - NEW: ``Mika (Mikazuki)`` (hiyakasudere)

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v32.

    Example:
        >>> if migrate_to_v32(con):
        ...     print("Character roster upgraded to Bible v1.2")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 32:
        return False

    try:
        logger.info("Applying schema v32 migration (Phase 16: Character Bible v1.2 Restoration)...")

        # Import the Bible-level prompts from init_personas
        import sys
        sys.path.insert(0, str(ROOT / "tools"))
        from init_personas import (
            RIN_SYSTEM_PROMPT, AYANE_SYSTEM_PROMPT, HANA_SYSTEM_PROMPT,
            SABLE_SYSTEM_PROMPT, SHIORI_SYSTEM_PROMPT, MIKA_SYSTEM_PROMPT,
        )

        # --- Rename + upgrade existing characters ---
        renames = [
            ("Fox (Rin)", "Rin (Akane)", RIN_SYSTEM_PROMPT, "rin_v1", 1.1, 1.2),
            ("Kuudere (Nyx)", "Ayane (Yuki)", AYANE_SYSTEM_PROMPT, "ayane_v1", 0.9, 1.0),
            ("Onee-san (Seraph)", "Hana (Momoka)", HANA_SYSTEM_PROMPT, "hana_v1", 1.0, 1.0),
            ("Goth (Viper)", "Sable (Kuroha)", SABLE_SYSTEM_PROMPT, "sable_v1", 0.85, 0.95),
        ]
        for old_name, new_name, prompt, voice_id, pitch, rate in renames:
            con.execute(
                """UPDATE characters
                   SET name = ?, system_prompt = ?, voice_id = ?,
                       tts_pitch = ?, tts_rate = ?
                   WHERE name = ?""",
                (new_name, prompt, voice_id, pitch, rate, old_name),
            )
            if con.execute("SELECT changes()").fetchone()[0] > 0:
                logger.info(f"  Renamed '{old_name}' → '{new_name}'")
            else:
                logger.info(f"  '{old_name}' not found (already renamed or deleted)")

        # --- Insert new characters (skip if name already exists) ---
        new_chars = [
            ("Shiori (Nana)", SHIORI_SYSTEM_PROMPT, "/files/avatars/Kitsune.vrm",
             "shiori_v1", 0.95, 0.85),
            ("Mika (Mikazuki)", MIKA_SYSTEM_PROMPT, "/files/avatars/Kitsune.vrm",
             "mika_v1", 1.2, 1.15),
        ]
        for name, prompt, avatar, voice_id, pitch, rate in new_chars:
            existing = con.execute(
                "SELECT id FROM characters WHERE name = ?", (name,)
            ).fetchone()
            if existing:
                logger.info(f"  '{name}' already exists (id={existing[0]}), skipping insert")
            else:
                con.execute(
                    """INSERT INTO characters
                       (name, system_prompt, avatar_url, voice_id, tts_pitch, tts_rate)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (name, prompt, avatar, voice_id, pitch, rate),
                )
                logger.info(f"  Inserted new character '{name}'")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (32)")
        con.commit()
        logger.info("✅ Schema v32 migration complete (Character Bible v1.2 restoration)")
        return True
    except Exception as e:
        logger.error(f"Schema v32 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v33(con: sqlite3.Connection) -> bool:
    """Add GLB/Unity model columns to characters table.

    Adds:
        - glb_model_url (TEXT): URL/path to a GLB/GLTF 3D model
        - unity_scene_url (TEXT): URL/path to a Unity WebGL scene

    These support the 3D Pipeline Expansion (GLB support + Unity WebGL).

    Args:
        con: Active SQLite connection

    Returns:
        True if migration was applied, False if already at v33

    Example:
        >>> if migrate_to_v33(con):
        ...     logger.info("GLB + Unity columns added")
    """
    cols = {row[1] for row in con.execute("PRAGMA table_info(characters)")}
    if "glb_model_url" in cols and "unity_scene_url" in cols:
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (33)")
        con.commit()
        return False
    try:
        logger.info("Applying schema v33 migration (3D Pipeline: GLB + Unity columns)...")
        if "glb_model_url" not in cols:
            con.execute("ALTER TABLE characters ADD COLUMN glb_model_url TEXT")
        if "unity_scene_url" not in cols:
            con.execute("ALTER TABLE characters ADD COLUMN unity_scene_url TEXT")
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (33)")
        con.commit()
        logger.info("✅ Schema v33 migration complete (glb_model_url + unity_scene_url)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v33 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v34(con: sqlite3.Connection) -> bool:
    """Add entrance/exit animation style columns to characters table.

    Adds:
        - entrance_style (TEXT DEFAULT 'walk'): Animation style for character entrance
          Options: walk, run, jump, fade, teleport
        - exit_style (TEXT DEFAULT 'fade'): Animation style for character exit
          Options: walk, fade, teleport

    These support multi-style entrance/exit animations in the 3D viewer.

    Args:
        con: Active SQLite connection

    Returns:
        True if migration was applied, False if already at v34

    Example:
        >>> if migrate_to_v34(con):
        ...     logger.info("Entrance/exit style columns added")
    """
    cols = {row[1] for row in con.execute("PRAGMA table_info(characters)")}
    if "entrance_style" in cols and "exit_style" in cols:
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (34)")
        con.commit()
        return False
    try:
        logger.info("Applying schema v34 migration (entrance_style + exit_style)...")
        if "entrance_style" not in cols:
            con.execute("ALTER TABLE characters ADD COLUMN entrance_style TEXT DEFAULT 'walk'")
        if "exit_style" not in cols:
            con.execute("ALTER TABLE characters ADD COLUMN exit_style TEXT DEFAULT 'fade'")
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (34)")
        con.commit()
        logger.info("✅ Schema v34 migration complete (entrance_style + exit_style)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v34 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v35(con: sqlite3.Connection) -> bool:
    """Add rolling summary chain and message importance scoring (v35).

    Creates:
        - session_summaries table: Rolling summary chain per session, allowing
          incremental compression instead of monolithic summarization.
        - importance_score column on messages: 0.0–1.0 float used by the
          context assembler to recall high-importance archived messages.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v35.

    Example:
        >>> if migrate_to_v35(con):
        ...     logger.info("Rolling summaries + importance scoring ready")
    """
    # Check if session_summaries table already exists
    tables = {row[0] for row in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    cols = {row[1] for row in con.execute("PRAGMA table_info(messages)")}

    if "session_summaries" in tables and "importance_score" in cols:
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (35)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v35 migration (session_summaries + importance_score)...")

        if "session_summaries" not in tables:
            con.execute("""
                CREATE TABLE IF NOT EXISTS session_summaries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    summary_text TEXT NOT NULL,
                    msg_range_start INTEGER NOT NULL,
                    msg_range_end INTEGER NOT NULL,
                    msg_count INTEGER NOT NULL,
                    token_count INTEGER,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id)
                )
            """)

        if "importance_score" not in cols:
            con.execute(
                "ALTER TABLE messages ADD COLUMN importance_score REAL DEFAULT 0.5"
            )

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (35)")
        con.commit()
        logger.info("✅ Schema v35 migration complete (session_summaries + importance_score)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v35 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v36(con: sqlite3.Connection) -> bool:
    """Add character bible integration columns (v36).

    Adds three columns to ``characters``:
        - ``bible_path`` (TEXT): Relative path to the character's markdown bible file.
        - ``bible_sections`` (TEXT): JSON list of section numbers to inject (e.g. ``[2,3,4]``).
        - ``bible_enabled`` (INTEGER): Toggle for bible injection (0 = off, 1 = on).

    Also auto-populates ``bible_path`` for all existing characters by matching
    character names to files in ``docs/characters/``.

    Returns:
        True if migration was applied, False if already at v36.

    Example:
        >>> if migrate_to_v36(con):
        ...     logger.info("Character bible integration ready")
    """
    cols = {r[1] for r in con.execute("PRAGMA table_info(characters)").fetchall()}
    if "bible_path" in cols and "bible_sections" in cols and "bible_enabled" in cols:
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (36)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v36 migration (character bible integration)...")

        for col, typedef in [
            ("bible_path", "TEXT DEFAULT NULL"),
            ("bible_sections", "TEXT DEFAULT NULL"),
            ("bible_enabled", "INTEGER DEFAULT 0"),
        ]:
            if col not in cols:
                con.execute(f"ALTER TABLE characters ADD COLUMN {col} {typedef}")
                logger.info(f"  + characters.{col}")

        # Auto-populate bible_path for existing characters by name matching
        import os
        _docs_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "characters")
        if os.path.isdir(_docs_dir):
            _name_to_file = {}
            for f in os.listdir(_docs_dir):
                if f.startswith("character_") and f.endswith(".md") and f != "character_bible_master.md":
                    _name_to_file[f] = f"docs/characters/{f}"

            rows = con.execute("SELECT id, name FROM characters").fetchall()
            for char_id, char_name in rows:
                # Try matching: "Rin (Akane)" → "character_rin_akane.md"
                # Also try: "Tsundere (Raine)" → "character_tsundere_raine.md"
                # Also try: "Genki (Kitsune)" → "character_genki_kitsune.md"
                _base = char_name.lower().replace(" ", "_").replace("(", "").replace(")", "")
                _candidate = f"character_{_base}.md"
                if _candidate in _name_to_file:
                    con.execute(
                        "UPDATE characters SET bible_path=?, bible_enabled=1 WHERE id=?",
                        (_name_to_file[_candidate], char_id)
                    )
                    logger.info(f"  → Linked {char_name} → {_name_to_file[_candidate]}")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (36)")
        con.commit()
        logger.info("✅ Schema v36 migration complete (character bible integration)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v36 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v37(con: sqlite3.Connection) -> bool:
    """Add game companion session and reaction tracking tables (v37).

    Creates two tables for the game spectator/coach feature:

    ``game_companion_sessions``:
        Tracks individual spectator sessions (game tag, mode, duration,
        reaction count, memorable moments, outcome).

    ``game_companion_reactions``:
        Individual character reactions within a session (text, emotion,
        urgency, frame hash, action taken).

    Returns:
        True if migration was applied, False if already at v37.

    Example:
        >>> if migrate_to_v37(con):
        ...     logger.info("Game companion tables ready")
    """
    tables = {r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()}

    if "game_companion_sessions" in tables and "game_companion_reactions" in tables:
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (37)")
        con.commit()
        return False

    try:
        logger.info("Applying schema v37 migration (game companion tables)...")

        if "game_companion_sessions" not in tables:
            con.execute("""
                CREATE TABLE game_companion_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                    game_tag TEXT NOT NULL,
                    mode TEXT NOT NULL DEFAULT 'watch',
                    started_at TEXT NOT NULL DEFAULT (datetime('now')),
                    ended_at TEXT,
                    duration_seconds INTEGER,
                    reaction_count INTEGER NOT NULL DEFAULT 0,
                    memorable_moments TEXT,
                    outcome TEXT,
                    notes TEXT
                )
            """)
            logger.info("  + game_companion_sessions table")

        if "game_companion_reactions" not in tables:
            con.execute("""
                CREATE TABLE game_companion_reactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL REFERENCES game_companion_sessions(id) ON DELETE CASCADE,
                    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                    reaction_text TEXT NOT NULL,
                    emotion TEXT NOT NULL DEFAULT 'neutral',
                    urgency REAL NOT NULL DEFAULT 0.5,
                    frame_hash TEXT,
                    action_taken TEXT
                )
            """)
            logger.info("  + game_companion_reactions table")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (37)")
        con.commit()
        logger.info("✅ Schema v37 migration complete (game companion tables)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v37 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v38(con: sqlite3.Connection) -> bool:
    """Rename character 'Nyx (Ayane)' to 'Ayane (Yuki)' and update voice_id (v38).

    The Character Bible v1.2 uses the name "Ayane (Yuki)" for the kuudere
    archetype.  The old "Nyx" name is being reclaimed for a new Chuunibyou
    character (Nyx Dae), so this migration corrects the display name and
    voice_id in the database to match the canonical bible naming.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v38+.

    Example:
        >>> if migrate_to_v38(con):
        ...     logger.info("Nyx (Ayane) renamed to Ayane (Yuki)")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 38:
        return False

    try:
        logger.info("Applying schema v38 migration (rename Nyx→Ayane)...")

        # Rename character display name
        con.execute(
            "UPDATE characters SET name = 'Ayane (Yuki)' WHERE name = 'Nyx (Ayane)'"
        )
        logger.info("  ~ Nyx (Ayane) → Ayane (Yuki)")

        # Update voice_id to match new name
        con.execute(
            "UPDATE characters SET voice_id = 'ayane_v1' "
            "WHERE name = 'Ayane (Yuki)' AND voice_id = 'nyx_v1'"
        )
        logger.info("  ~ voice_id nyx_v1 → ayane_v1")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (38)")
        con.commit()
        logger.info("✅ Schema v38 migration complete (rename Nyx→Ayane)")
        return True
    except sqlite3.Error as e:
        logger.error(f"Schema v38 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v39(con: sqlite3.Connection) -> bool:
    """Insert new character 'Dae (Neciridae)' into the characters table (v39).

    Adds the 12th built-in character: Dae, a hybrid kuudere/erodere/ojoudere
    emo gamer psych major. Her parenthetical alias 'Neciridae' is globally
    unique and derives to ``neciridae_pixel_portrait.png``.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v39+.

    Example:
        >>> if migrate_to_v39(con):
        ...     logger.info("Dae (Neciridae) added to roster")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 39:
        return False

    try:
        logger.info("Applying schema v39 migration (add Dae (Neciridae))...")

        # Import Dae's system prompt from init_personas
        import sys
        sys.path.insert(0, str(ROOT / "tools"))
        from init_personas import DAE_SYSTEM_PROMPT

        # Insert only if not already present (idempotent)
        existing = con.execute(
            "SELECT id FROM characters WHERE name = 'Dae (Neciridae)'"
        ).fetchone()

        if existing:
            logger.info(f"  'Dae (Neciridae)' already exists (id={existing[0]}), skipping insert")
        else:
            con.execute(
                """INSERT INTO characters
                   (name, system_prompt, avatar_url, voice_id, tts_pitch, tts_rate)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                ("Dae (Neciridae)", DAE_SYSTEM_PROMPT,
                 "/files/avatars/Kitsune.vrm", "dae_v1", 0.85, 0.95),
            )
            logger.info("  Inserted new character 'Dae (Neciridae)'")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (39)")
        con.commit()
        logger.info("✅ Schema v39 migration complete (Dae (Neciridae) added)")
        return True
    except Exception as e:
        logger.error(f"Schema v39 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v40(con: sqlite3.Connection) -> bool:
    """Insert new character 'Alana Calloway' into the characters table (v40).

    Adds the 13th built-in character: Alana Calloway, a warm-hearted deredere
    rebel — nursing student, waitress, beer-league soccer player. Irish Catholic
    middle child who wears her heart on her sleeve.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v40+.

    Example:
        >>> if migrate_to_v40(con):
        ...     logger.info("Alana Calloway added to roster")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 40:
        return False

    try:
        logger.info("Applying schema v40 migration (add Alana Calloway)...")

        # Import Alana's system prompt from init_personas
        import sys
        sys.path.insert(0, str(ROOT / "tools"))
        from init_personas import ALANA_SYSTEM_PROMPT

        # Insert only if not already present (idempotent)
        existing = con.execute(
            "SELECT id FROM characters WHERE name = 'Alana Calloway'"
        ).fetchone()

        if existing:
            logger.info(f"  'Alana Calloway' already exists (id={existing[0]}), skipping insert")
        else:
            con.execute(
                """INSERT INTO characters
                   (name, system_prompt, avatar_url, voice_id, tts_pitch, tts_rate)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                ("Alana Calloway", ALANA_SYSTEM_PROMPT,
                 "/files/avatars/Kitsune.vrm", "alana_v1", 1.05, 1.1),
            )
            logger.info("  Inserted new character 'Alana Calloway'")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (40)")
        con.commit()
        logger.info("✅ Schema v40 migration complete (Alana Calloway added)")
        return True
    except Exception as e:
        logger.error(f"Schema v40 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v41(con: sqlite3.Connection) -> bool:
    """Update Yuki (Shirayuki) system prompt with expanded character spec (v41).

    Replaces the original 45-line system prompt with the upgraded ~150-line
    prompt derived from the full 10-file character spec: 5 behavioral loops,
    inverted trust ramp, family constellation, social circle, and 5 specific
    fears.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v41+.

    Example:
        >>> if migrate_to_v41(con):
        ...     logger.info("Yuki system prompt upgraded")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 41:
        return False

    try:
        logger.info("Applying schema v41 migration (upgrade Yuki system prompt)...")

        # Import Yuki's expanded system prompt from init_personas
        import sys
        sys.path.insert(0, str(ROOT / "tools"))
        from init_personas import YUKI_SYSTEM_PROMPT

        # Update Yuki's system prompt in the characters table
        result = con.execute(
            "UPDATE characters SET system_prompt = ? WHERE name = 'Yuki (Shirayuki)'",
            (YUKI_SYSTEM_PROMPT,),
        )

        if result.rowcount == 0:
            logger.warning("  'Yuki (Shirayuki)' not found in characters table, skipping prompt update")
        else:
            logger.info(f"  Updated Yuki system prompt ({len(YUKI_SYSTEM_PROMPT)} chars)")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (41)")
        con.commit()
        logger.info("✅ Schema v41 migration complete (Yuki prompt upgraded)")
        return True
    except Exception as e:
        logger.error(f"Schema v41 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v42(con: sqlite3.Connection) -> bool:
    """Update Rin, Raine, and Hana system prompts with expanded character specs (v42).

    Batch 1 of the character quality audit. Replaces the original ~25-50 line
    system prompts with expanded ~100-150 line prompts derived from full 10-file
    character specs.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v42+.

    Example:
        >>> if migrate_to_v42(con):
        ...     logger.info("Rin/Raine/Hana prompts upgraded")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 42:
        return False

    try:
        logger.info("Applying schema v42 migration (upgrade Rin, Raine, Hana prompts)...")

        import sys
        sys.path.insert(0, str(ROOT / "tools"))
        from init_personas import RIN_SYSTEM_PROMPT, RAINE_SYSTEM_PROMPT, HANA_SYSTEM_PROMPT

        updates = [
            ("Rin (Akane)", RIN_SYSTEM_PROMPT),
            ("Raine", RAINE_SYSTEM_PROMPT),
            ("Hana (Momoka)", HANA_SYSTEM_PROMPT),
        ]

        for name, prompt in updates:
            result = con.execute(
                "UPDATE characters SET system_prompt = ? WHERE name = ?",
                (prompt, name),
            )
            if result.rowcount == 0:
                logger.warning(f"  '{name}' not found in characters table, skipping")
            else:
                logger.info(f"  Updated {name} system prompt ({len(prompt)} chars)")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (42)")
        con.commit()
        logger.info("✅ Schema v42 migration complete (Rin/Raine/Hana prompts upgraded)")
        return True
    except Exception as e:
        logger.error(f"Schema v42 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v43(con: sqlite3.Connection) -> bool:
    """Update Shiori, Mika, Luna, Sable, Kaede, Ayane system prompts (v43).

    Batch 2 of the character quality audit. Replaces the original ~25-50 line
    system prompts with expanded ~130+ line prompts derived from full 10-file
    character specs.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v43+.

    Example:
        >>> if migrate_to_v43(con):
        ...     logger.info("Batch 2 prompts upgraded")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 43:
        return False

    try:
        logger.info("Applying schema v43 migration (upgrade Shiori, Mika, Luna, Sable, Kaede, Ayane prompts)...")

        import sys
        sys.path.insert(0, str(ROOT / "tools"))
        from init_personas import (
            SHIORI_SYSTEM_PROMPT,
            MIKA_SYSTEM_PROMPT,
            LUNA_SYSTEM_PROMPT,
            SABLE_SYSTEM_PROMPT,
            KAEDE_SYSTEM_PROMPT,
            AYANE_SYSTEM_PROMPT,
        )

        updates = [
            ("Shiori (Nana)", SHIORI_SYSTEM_PROMPT),
            ("Mika (Mikazuki)", MIKA_SYSTEM_PROMPT),
            ("Luna (Tsukimi)", LUNA_SYSTEM_PROMPT),
            ("Sable (Kuroha)", SABLE_SYSTEM_PROMPT),
            ("Kaede (Suzuha)", KAEDE_SYSTEM_PROMPT),
            ("Ayane (Yuki)", AYANE_SYSTEM_PROMPT),
        ]

        for name, prompt in updates:
            result = con.execute(
                "UPDATE characters SET system_prompt = ? WHERE name = ?",
                (prompt, name),
            )
            if result.rowcount == 0:
                logger.warning(f"  '{name}' not found in characters table, skipping")
            else:
                logger.info(f"  Updated {name} system prompt ({len(prompt)} chars)")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (43)")
        con.commit()
        logger.info("✅ Schema v43 migration complete (batch 2: 6 character prompts upgraded)")
        return True
    except Exception as e:
        logger.error(f"Schema v43 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v44(con: sqlite3.Connection) -> bool:
    """Add conversation forking columns to sessions table (v44).

    Adds two columns that track fork lineage:
    - forked_from_session_id: the source session this was forked from
    - forked_at_message_id: the message ID where the fork diverged

    Together these allow the UI to show fork history and let users
    navigate back to the original conversation at the branch point.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v44+.

    Example:
        >>> if migrate_to_v44(con):
        ...     logger.info("Conversation forking columns added")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 44:
        return False

    try:
        logger.info("Applying schema v44 migration (conversation forking columns)...")

        try:
            con.execute(
                "ALTER TABLE sessions ADD COLUMN forked_from_session_id INTEGER REFERENCES sessions(id)"
            )
        except Exception:
            pass  # Column already exists

        try:
            con.execute(
                "ALTER TABLE sessions ADD COLUMN forked_at_message_id INTEGER"
            )
        except Exception:
            pass  # Column already exists

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (44)")
        con.commit()
        logger.info("✅ Schema v44 migration complete (conversation forking columns added)")
        return True
    except Exception as e:
        logger.error(f"Schema v44 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v45(con: sqlite3.Connection) -> bool:
    """Add FTS5 full-text search index on messages table (v45).

    Creates a content-synced FTS5 virtual table backed by the ``messages``
    table's ``content`` column.  Three triggers keep the index in sync with
    INSERT, DELETE, and UPDATE operations on ``messages``.

    The FTS table enables the ``/api/search/messages`` endpoint to use
    ranked, snippet-highlighted full-text search instead of falling back
    to a slow ``LIKE`` scan.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v45+.

    Example:
        >>> if migrate_to_v45(con):
        ...     logger.info("FTS5 search index created")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 45:
        return False

    try:
        logger.info("Applying schema v45 migration (FTS5 full-text search index on messages)...")

        # Create the FTS5 virtual table backed by messages.content
        con.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                content,
                content='messages',
                content_rowid='id',
                tokenize='unicode61'
            )
        """)

        # Populate from existing messages
        con.execute("""
            INSERT INTO messages_fts(rowid, content)
            SELECT id, content FROM messages
        """)

        # Trigger: keep FTS in sync on INSERT
        con.execute("""
            CREATE TRIGGER IF NOT EXISTS messages_fts_insert
            AFTER INSERT ON messages BEGIN
                INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
            END
        """)

        # Trigger: keep FTS in sync on DELETE
        con.execute("""
            CREATE TRIGGER IF NOT EXISTS messages_fts_delete
            AFTER DELETE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, content)
                VALUES('delete', old.id, old.content);
            END
        """)

        # Trigger: keep FTS in sync on UPDATE
        con.execute("""
            CREATE TRIGGER IF NOT EXISTS messages_fts_update
            AFTER UPDATE OF content ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, content)
                VALUES('delete', old.id, old.content);
                INSERT INTO messages_fts(rowid, content)
                VALUES (new.id, new.content);
            END
        """)

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (45)")
        con.commit()
        logger.info("✅ Schema v45 migration complete (FTS5 index + sync triggers)")
        return True
    except Exception as e:
        logger.error(f"Schema v45 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v46(con: sqlite3.Connection) -> bool:
    """Add connection_profiles table for quick LLM backend switching (v46).

    Creates the ``connection_profiles`` table which stores named presets for
    LLM server configurations.  Each profile contains a server URL, model
    identifier, context size, and generation parameters.  Only one profile
    can be active at a time (``is_active = 1``).

    When a profile is activated via ``POST /api/profiles/{id}/activate``,
    the app's live config (``llm.endpoint``, ``llm.model``, etc.) is
    updated to match the profile's settings, enabling one-click switching
    between different LLM backends.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v46+.

    Raises:
        sqlite3.Error: If migration fails.

    Example:
        >>> if migrate_to_v46(con):
        ...     logger.info("Connection profiles table created")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 46:
        return False

    try:
        logger.info("Applying schema v46 migration (connection_profiles table for LLM backend switching)...")

        con.execute("""
            CREATE TABLE IF NOT EXISTS connection_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                server_url TEXT NOT NULL DEFAULT 'http://localhost:1234/v1',
                model TEXT DEFAULT '',
                context_size INTEGER DEFAULT 4096,
                temperature REAL DEFAULT 0.8,
                top_p REAL DEFAULT 0.95,
                repeat_penalty REAL DEFAULT 1.1,
                is_active INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (46)")
        con.commit()
        logger.info("\u2705 Schema v46 migration complete (connection_profiles table added)")
        return True
    except Exception as e:
        logger.error(f"Schema v46 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v47(con: sqlite3.Connection) -> bool:
    """Add bookmarks table for starring/saving chat messages (v47).

    Creates the ``bookmarks`` table which lets users star specific messages
    for easy retrieval later.  Each bookmark references a message and its
    session, with an optional character scope and freeform label.

    Two indexes are created:
    - ``idx_bookmarks_session`` for fast per-session bookmark listing.
    - ``idx_bookmarks_character`` for filtering bookmarks by character.

    The ``message_id`` and ``session_id`` foreign keys cascade on delete
    so bookmarks are automatically cleaned up when a message or session
    is removed.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v47+.

    Raises:
        sqlite3.Error: If migration fails.

    Example:
        >>> if migrate_to_v47(con):
        ...     logger.info("Bookmarks table created")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 47:
        return False

    try:
        logger.info("Applying schema v47 migration (bookmarks table for message starring)...")

        con.execute("""
            CREATE TABLE IF NOT EXISTS bookmarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL,
                session_id INTEGER NOT NULL,
                character_id INTEGER,
                label TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_bookmarks_session ON bookmarks(session_id)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_bookmarks_character ON bookmarks(character_id)")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (47)")
        con.commit()
        logger.info("\u2705 Schema v47 migration complete (bookmarks table + indexes)")
        return True
    except Exception as e:
        logger.error(f"Schema v47 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v48(con: sqlite3.Connection) -> bool:
    """Add output_format_rules table for user-defined regex output cleaning (v48).

    Creates the ``output_format_rules`` table which stores per-character
    regex pattern/replacement pairs applied to LLM output before display.
    Rules are applied in priority order (lower = first).

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v48+.

    Example:
        >>> if migrate_to_v48(con):
        ...     logger.info("Format rules table created")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 48:
        return False

    try:
        logger.info("Applying schema v48 migration (output_format_rules table)...")

        con.execute("""
            CREATE TABLE IF NOT EXISTS output_format_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
                rule_name TEXT NOT NULL,
                pattern TEXT NOT NULL,
                replacement TEXT NOT NULL DEFAULT '',
                is_enabled INTEGER DEFAULT 1,
                priority INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_format_rules_char ON output_format_rules(character_id, is_enabled)")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (48)")
        con.commit()
        logger.info("\u2705 Schema v48 migration complete (output_format_rules table)")
        return True
    except Exception as e:
        logger.error(f"Schema v48 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v49(con: sqlite3.Connection) -> bool:
    """Add interaction_rewards table and character streak/XP columns (v49).

    Enables daily interaction tracking, streak counting, XP accumulation,
    and relationship milestone detection per character.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v49+.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 49:
        return False

    try:
        logger.info("Applying schema v49 migration (interaction rewards + streaks)...")

        con.execute("""
            CREATE TABLE IF NOT EXISTS interaction_rewards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                interaction_date TEXT NOT NULL,
                message_count INTEGER DEFAULT 0,
                xp_earned INTEGER DEFAULT 0,
                streak_day INTEGER DEFAULT 1,
                milestone_hit TEXT,
                UNIQUE(character_id, interaction_date)
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_rewards_char_date ON interaction_rewards(character_id, interaction_date DESC)")

        # Add streak/XP columns to characters (safe to re-run)
        for col, default in [("current_streak", "0"), ("total_xp", "0"), ("relationship_tier", "'stranger'")]:
            try:
                con.execute(f"ALTER TABLE characters ADD COLUMN {col} {'INTEGER' if col != 'relationship_tier' else 'TEXT'} DEFAULT {default}")
            except sqlite3.OperationalError:
                pass  # Column already exists

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (49)")
        con.commit()
        logger.info("\u2705 Schema v49 migration complete (interaction_rewards + character streaks)")
        return True
    except Exception as e:
        logger.error(f"Schema v49 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v50(con: sqlite3.Connection) -> bool:
    """Add scene_context and scene_enabled columns to sessions table (v50).

    Enables per-session scene/setting descriptions that ground the RP in a
    specific place and mood without the user describing it every message.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v50+.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 50:
        return False

    try:
        logger.info("Applying schema v50 migration (scene context on sessions)...")

        for col, ctype, default in [
            ("scene_context", "TEXT", "''"),
            ("scene_enabled", "INTEGER", "0"),
        ]:
            try:
                con.execute(f"ALTER TABLE sessions ADD COLUMN {col} {ctype} NOT NULL DEFAULT {default}")
            except sqlite3.OperationalError:
                pass  # Column already exists

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (50)")
        con.commit()
        logger.info("\u2705 Schema v50 migration complete (scene_context + scene_enabled on sessions)")
        return True
    except Exception as e:
        logger.error(f"Schema v50 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v51(con: sqlite3.Connection) -> bool:
    """Add screenshots table for Photo Mode gallery (v51).

    Creates the screenshots table with indexes for character filtering,
    favorites, and chronological sorting. Stores metadata for captured
    screenshots alongside filesystem paths.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v51+.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 51:
        return False

    try:
        logger.info("Applying schema v51 migration (screenshots table for Photo Mode)...")

        con.execute("""
            CREATE TABLE IF NOT EXISTS screenshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT NOT NULL UNIQUE,
                character_id INTEGER,
                character_name TEXT,
                emotion TEXT,
                gesture TEXT,
                quality INTEGER DEFAULT 1,
                transparent INTEGER DEFAULT 0,
                width INTEGER,
                height INTEGER,
                file_size INTEGER,
                file_path TEXT NOT NULL,
                caption TEXT DEFAULT '',
                favorite INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_screenshots_char ON screenshots(character_id)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_screenshots_fav ON screenshots(favorite)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_screenshots_created ON screenshots(created_at DESC)")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (51)")
        con.commit()
        logger.info("\u2705 Schema v51 migration complete (screenshots table)")
        return True
    except Exception as e:
        logger.error(f"Schema v51 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v52(con: sqlite3.Connection) -> bool:
    """Add system_prompt_lite column for small-context-window character prompts (v52).

    When the user's model has a small context window (≤8K tokens), the backend
    uses this shorter prompt instead of the full system_prompt. This prevents
    the personality from consuming all available context budget.

    The lite prompt contains only CORE personality: identity, voice, 3 key rules.
    The full system_prompt adds: trust ramp, behavioral loops, family, dialogue examples.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v52+.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 52:
        return False

    try:
        logger.info("Applying schema v52 migration (system_prompt_lite for tiered prompts)...")

        cols = {r[1] for r in con.execute("PRAGMA table_info(characters)").fetchall()}
        if "system_prompt_lite" not in cols:
            con.execute("ALTER TABLE characters ADD COLUMN system_prompt_lite TEXT DEFAULT NULL")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (52)")
        con.commit()
        logger.info("✅ Schema v52 migration complete (system_prompt_lite column)")
        return True
    except Exception as e:
        logger.error(f"Schema v52 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v53(con: sqlite3.Connection) -> bool:
    """Add proactive messaging columns and milestones table (v53).

    Introduces the scaffolding for the proactive AI messages feature:
    - ``proactive_enabled``: per-character toggle for proactive messages.
    - ``proactive_frequency``: message frequency preset ('quiet', 'normal', 'chatty').
    - ``proactive_hours``: hour-range string (e.g. '9-22') restricting when messages
      may be sent.
    - ``scheduled_messages.trigger_type``: distinguishes schedule-driven messages from
      milestone- or event-driven ones.
    - ``proactive_milestones`` table: records which milestone events (e.g.
      'first_week', 'affinity_50') have already fired so they are not re-triggered.

    All ALTER TABLE statements are guarded by a column-existence check so this
    migration is safe to apply more than once.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v53+.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 53:
        return False

    try:
        logger.info("Applying schema v53 migration (proactive messaging)...")

        # --- characters table new columns ---
        char_cols = {r[1] for r in con.execute("PRAGMA table_info(characters)").fetchall()}
        if "proactive_enabled" not in char_cols:
            con.execute("ALTER TABLE characters ADD COLUMN proactive_enabled INTEGER DEFAULT 0")
        if "proactive_frequency" not in char_cols:
            con.execute("ALTER TABLE characters ADD COLUMN proactive_frequency TEXT DEFAULT 'normal'")
        if "proactive_hours" not in char_cols:
            con.execute("ALTER TABLE characters ADD COLUMN proactive_hours TEXT DEFAULT '9-22'")

        # --- scheduled_messages.trigger_type ---
        sched_cols = {r[1] for r in con.execute("PRAGMA table_info(scheduled_messages)").fetchall()}
        if "trigger_type" not in sched_cols:
            con.execute("ALTER TABLE scheduled_messages ADD COLUMN trigger_type TEXT DEFAULT 'schedule'")

        # --- proactive_milestones table ---
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS proactive_milestones (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id      INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                milestone_type TEXT NOT NULL,
                triggered_at TEXT,
                created_at   TEXT DEFAULT (datetime('now'))
            )
            """
        )

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (53)")
        con.commit()
        logger.info("✅ Schema v53 migration complete (proactive messaging columns + milestones table)")
        return True
    except Exception as e:
        logger.error(f"Schema v53 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v54(con: sqlite3.Connection) -> bool:
    """Add meta_summary_id to session_summaries for hierarchical summarization (v54).

    When multiple rolling summaries accumulate (>5), they can be distilled
    into a meta-summary.  Child summaries that have been rolled up point to
    the parent via ``meta_summary_id`` and are skipped by the context assembler.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v54+.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 54:
        return False

    try:
        logger.info("Applying schema v54 migration (hierarchical summarization)...")

        # Add meta_summary_id column to session_summaries
        ss_cols = {r[1] for r in con.execute("PRAGMA table_info(session_summaries)").fetchall()}
        if "meta_summary_id" not in ss_cols:
            con.execute(
                "ALTER TABLE session_summaries ADD COLUMN meta_summary_id INTEGER DEFAULT NULL"
            )

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (54)")
        con.commit()
        logger.info("\u2705 Schema v54 migration complete (meta_summary_id on session_summaries)")
        return True
    except Exception as e:
        logger.error(f"Schema v54 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v55(con: sqlite3.Connection) -> bool:
    """Add Adaptive Intelligence tables and engagement columns (v55).

    Introduces per-character user preference profiles and per-message engagement
    tracking so the AI can learn each user's communication style over time.

    Schema changes:
        New table ``user_profiles``:
            - ``id``: primary key
            - ``char_id``: FK → characters(id) ON DELETE CASCADE
            - ``pref_response_length`` (REAL DEFAULT 0.5): 0=terse … 1=verbose
            - ``pref_formality`` (REAL DEFAULT 0.5): 0=casual … 1=formal
            - ``pref_humor`` (REAL DEFAULT 0.5): 0=serious … 1=very humorous
            - ``pref_empathy`` (REAL DEFAULT 0.5): 0=direct … 1=highly empathetic
            - ``pref_depth`` (REAL DEFAULT 0.5): 0=surface … 1=deep/intellectual
            - ``topic_affinities`` (TEXT DEFAULT '{}'): JSON map of topic→weight
            - ``trait_weights`` (TEXT DEFAULT '{}'): JSON map of personality trait→weight
            - ``preferred_active_hours`` (TEXT): JSON array of hour ints user is typically active
            - ``preferred_greeting_style`` (TEXT): e.g. 'formal' | 'casual' | 'playful'
            - ``last_reflection_at`` (TEXT): ISO datetime of last profile reflection
            - ``reflection_memo`` (TEXT): short LLM-written summary of last reflection
            - ``total_reflections`` (INTEGER DEFAULT 0): cumulative reflection count
            - ``created_at`` / ``updated_at`` (TEXT): ISO datetimes

        New columns on ``messages``:
            - ``engagement_score`` (REAL): 0.0–1.0 signal derived from reply length/timing
            - ``detected_mood`` (TEXT): mood label inferred at send time (e.g. 'happy')
            - ``response_time_ms`` (INTEGER): milliseconds from send → LLM first-token

    All ALTER TABLE statements are guarded by a column-existence check.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v55+.

    Example:
        >>> if migrate_to_v55(con):
        ...     print("Adaptive Intelligence schema applied")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 55:
        return False

    try:
        logger.info("Applying schema v55 migration (Adaptive Intelligence)...")

        # --- user_profiles table ---
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS user_profiles (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id                 INTEGER NOT NULL
                                            REFERENCES characters(id) ON DELETE CASCADE,
                pref_response_length    REAL    DEFAULT 0.5,
                pref_formality          REAL    DEFAULT 0.5,
                pref_humor              REAL    DEFAULT 0.5,
                pref_empathy            REAL    DEFAULT 0.5,
                pref_depth              REAL    DEFAULT 0.5,
                topic_affinities        TEXT    DEFAULT '{}',
                trait_weights           TEXT    DEFAULT '{}',
                preferred_active_hours  TEXT,
                preferred_greeting_style TEXT,
                last_reflection_at      TEXT,
                reflection_memo         TEXT,
                total_reflections       INTEGER DEFAULT 0,
                created_at              TEXT    DEFAULT (datetime('now')),
                updated_at              TEXT    DEFAULT (datetime('now'))
            )
            """
        )

        # Index for fast per-character profile lookup
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_profiles_char ON user_profiles(char_id)"
        )

        # --- engagement columns on messages ---
        msg_cols = {r[1] for r in con.execute("PRAGMA table_info(messages)").fetchall()}
        if "engagement_score" not in msg_cols:
            con.execute("ALTER TABLE messages ADD COLUMN engagement_score REAL")
        if "detected_mood" not in msg_cols:
            con.execute("ALTER TABLE messages ADD COLUMN detected_mood TEXT DEFAULT ''")
        if "response_time_ms" not in msg_cols:
            con.execute("ALTER TABLE messages ADD COLUMN response_time_ms INTEGER")

        # Index for querying high-engagement messages per session
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_engagement "
            "ON messages(session_id, engagement_score)"
        )

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (55)")
        con.commit()
        logger.info(
            "\u2705 Schema v55 migration complete "
            "(user_profiles table + engagement columns on messages)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v55 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v56(con: sqlite3.Connection) -> bool:
    """Add Bond Progression System tables and columns (v56).

    Introduces the full data layer for tracking relationship depth between a
    user and each character via experience points, milestones, gift-giving, and
    unlockable story scenes.

    Schema changes:

        New table ``bond_stories``:
            - ``id``: primary key
            - ``char_id``: FK → characters(id) ON DELETE CASCADE
            - ``bond_level_required`` (INTEGER NOT NULL): minimum bond level to unlock
            - ``title`` (TEXT NOT NULL): short scene title
            - ``scene_text`` (TEXT NOT NULL): full scene prose / dialogue
            - ``scene_type`` (TEXT DEFAULT 'dialogue'): 'dialogue' | 'flashback' | 'confession' etc.
            - ``choices`` (TEXT): optional JSON array of branching choices
            - ``unlocked`` (INTEGER DEFAULT 0): 1 once the level threshold is met
            - ``viewed`` (INTEGER DEFAULT 0): 1 after the player has read the scene
            - ``created_at`` (TEXT): ISO datetime

        New table ``character_gifts``:
            - ``id``: primary key
            - ``char_id``: FK → characters(id) ON DELETE CASCADE
            - ``gift_name`` (TEXT NOT NULL): human-readable gift name
            - ``gift_category`` (TEXT NOT NULL): e.g. 'food' | 'accessory' | 'book'
            - ``affinity_boost`` (REAL DEFAULT 1.0): XP multiplier when gifted
            - ``is_favorite`` (INTEGER DEFAULT 0): 1 if this is a favourite gift
            - ``description`` (TEXT): optional flavour text

        New table ``gift_history``:
            - ``id``: primary key
            - ``char_id`` (INTEGER NOT NULL): which character received the gift
            - ``gift_id`` (INTEGER NOT NULL): FK-style reference to character_gifts.id
            - ``given_at`` (TEXT): ISO datetime of gift event
            - ``reaction`` (TEXT): optional LLM-generated reaction snippet

        New columns on ``character_relationships``:
            - ``bond_level`` (INTEGER DEFAULT 0): current tier (0 = Stranger … N = Soulbound)
            - ``bond_xp`` (INTEGER DEFAULT 0): XP within the current tier
            - ``relationship_mode`` (TEXT DEFAULT 'friend'): active relationship archetype
            - ``covenant_date`` (TEXT): ISO date when a covenant/commitment was made

        New column on ``characters``:
            - ``active_outfit_id`` (INTEGER): future outfit system — FK slot reserved now

    All ALTER TABLE statements are guarded by a PRAGMA column-existence check so
    the migration is idempotent.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v56+.

    Example:
        >>> if migrate_to_v56(con):
        ...     print("Bond Progression schema applied")
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 56:
        return False

    try:
        logger.info("Applying schema v56 migration (Bond Progression System)...")

        # ------------------------------------------------------------------ #
        # bond_stories — scripted scenes unlocked at bond milestones
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS bond_stories (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id              INTEGER NOT NULL
                                         REFERENCES characters(id) ON DELETE CASCADE,
                bond_level_required  INTEGER NOT NULL,
                title                TEXT    NOT NULL,
                scene_text           TEXT    NOT NULL,
                scene_type           TEXT    DEFAULT 'dialogue',
                choices              TEXT,
                unlocked             INTEGER DEFAULT 0,
                viewed               INTEGER DEFAULT 0,
                created_at           TEXT    DEFAULT (datetime('now'))
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_bond_stories_char "
            "ON bond_stories(char_id)"
        )
        # Fast lookup of unlocked-but-unread scenes per character
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_bond_stories_char_level "
            "ON bond_stories(char_id, bond_level_required)"
        )

        # ------------------------------------------------------------------ #
        # character_gifts — gift definitions with per-character preferences
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS character_gifts (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id         INTEGER NOT NULL
                                    REFERENCES characters(id) ON DELETE CASCADE,
                gift_name       TEXT    NOT NULL,
                gift_category   TEXT    NOT NULL,
                affinity_boost  REAL    DEFAULT 1.0,
                is_favorite     INTEGER DEFAULT 0,
                description     TEXT
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_character_gifts_char "
            "ON character_gifts(char_id)"
        )

        # ------------------------------------------------------------------ #
        # gift_history — audit log of every gift given
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS gift_history (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id  INTEGER NOT NULL,
                gift_id  INTEGER NOT NULL,
                given_at TEXT    DEFAULT (datetime('now')),
                reaction TEXT
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_gift_history_char "
            "ON gift_history(char_id)"
        )

        # ------------------------------------------------------------------ #
        # character_relationships — bond progression columns
        # ------------------------------------------------------------------ #
        rel_cols = {r[1] for r in con.execute("PRAGMA table_info(character_relationships)").fetchall()}
        if "bond_level" not in rel_cols:
            con.execute(
                "ALTER TABLE character_relationships ADD COLUMN bond_level INTEGER DEFAULT 0"
            )
        if "bond_xp" not in rel_cols:
            con.execute(
                "ALTER TABLE character_relationships ADD COLUMN bond_xp INTEGER DEFAULT 0"
            )
        if "relationship_mode" not in rel_cols:
            con.execute(
                "ALTER TABLE character_relationships ADD COLUMN relationship_mode TEXT DEFAULT 'friend'"
            )
        if "covenant_date" not in rel_cols:
            con.execute(
                "ALTER TABLE character_relationships ADD COLUMN covenant_date TEXT"
            )

        # ------------------------------------------------------------------ #
        # characters — active_outfit_id slot (future outfit system)
        # ------------------------------------------------------------------ #
        char_cols = {r[1] for r in con.execute("PRAGMA table_info(characters)").fetchall()}
        if "active_outfit_id" not in char_cols:
            con.execute(
                "ALTER TABLE characters ADD COLUMN active_outfit_id INTEGER"
            )

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (56)")
        con.commit()
        logger.info(
            "\u2705 Schema v56 migration complete "
            "(bond_stories + character_gifts + gift_history tables; "
            "bond_level/bond_xp/relationship_mode/covenant_date on character_relationships; "
            "active_outfit_id on characters)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v56 migration failed: {e}")
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

        # Upgrade from v27 to v28 (Feature B4: Author's Note / Soft Prompt Injection)
        if version < 28:
            logger.info("Upgrading database schema from v27 to v28...")
            logger.info("  - Adding author_note columns to sessions (Feature B4: author's note)")
            if migrate_to_v28(con):
                version = 28

        # Upgrade from v28 to v29 (Feature A2: In-App Mini Games)
        if version < 29:
            logger.info("Upgrading database schema from v28 to v29...")
            logger.info("  - Creating game_sessions table (Feature A2: mini games)")
            if migrate_to_v29(con):
                version = 29

        # Upgrade from v29 to v30 (Feature A3: Tiered Episodic Memory — sqlite-vec)
        if version < 30:
            logger.info("Upgrading database schema from v29 to v30...")
            logger.info("  - Creating memories table and memories_vec virtual table (Feature A3)")
            if migrate_to_v30(con):
                version = 30

        # Upgrade from v30 to v31 (Phase 15: Enhanced Emotion Portraits)
        if version < 31:
            logger.info("Upgrading database schema from v30 to v31...")
            logger.info("  - Adding emotion_portraits_mode to characters (Phase 15)")
            if migrate_to_v31(con):
                version = 31

        # Upgrade from v31 to v32 (Phase 16: Character Bible v1.2 Restoration)
        if version < 32:
            logger.info("Upgrading database schema from v31 to v32...")
            logger.info("  - Renaming 4 characters to Bible v1.2 names + upgrading prompts")
            logger.info("  - Inserting 2 new characters (Shiori, Mika)")
            if migrate_to_v32(con):
                version = 32

        # Upgrade from v32 to v33 (3D Pipeline: GLB + Unity columns)
        if version < 33:
            logger.info("Upgrading database schema from v32 to v33...")
            logger.info("  - Adding glb_model_url + unity_scene_url to characters")
            if migrate_to_v33(con):
                version = 33

        # Upgrade from v33 to v34 (Entrance/Exit animation styles)
        if version < 34:
            logger.info("Upgrading database schema from v33 to v34...")
            logger.info("  - Adding entrance_style + exit_style to characters")
            if migrate_to_v34(con):
                version = 34

        # Upgrade from v34 to v35 (Rolling summaries + importance scoring)
        if version < 35:
            logger.info("Upgrading database schema from v34 to v35...")
            logger.info("  - Creating session_summaries table (rolling summary chain)")
            logger.info("  - Adding importance_score to messages (context-aware pruning)")
            if migrate_to_v35(con):
                version = 35

        # Upgrade from v35 to v36 (Character bible integration)
        if version < 36:
            logger.info("Upgrading database schema from v35 to v36...")
            logger.info("  - Adding bible_path, bible_sections, bible_enabled to characters")
            if migrate_to_v36(con):
                version = 36

        # Upgrade from v36 to v37 (Game companion tables)
        if version < 37:
            logger.info("Upgrading database schema from v36 to v37...")
            logger.info("  - Creating game_companion_sessions + game_companion_reactions tables")
            if migrate_to_v37(con):
                version = 37

        # Upgrade from v37 to v38 (Rename Nyx→Ayane)
        if version < 38:
            logger.info("Upgrading database schema from v37 to v38...")
            logger.info("  - Renaming Nyx (Ayane) → Ayane (Yuki), updating voice_id")
            if migrate_to_v38(con):
                version = 38

        # Upgrade from v38 to v39 (Add Dae (Neciridae))
        if version < 39:
            logger.info("Upgrading database schema from v38 to v39...")
            logger.info("  - Adding new character Dae (Neciridae)")
            if migrate_to_v39(con):
                version = 39

        # Upgrade from v39 to v40 (Add Alana Calloway)
        if version < 40:
            logger.info("Upgrading database schema from v39 to v40...")
            logger.info("  - Adding new character Alana Calloway")
            if migrate_to_v40(con):
                version = 40

        # Upgrade from v40 to v41 (Upgrade Yuki system prompt)
        if version < 41:
            logger.info("Upgrading database schema from v40 to v41...")
            logger.info("  - Upgrading Yuki (Shirayuki) system prompt with expanded character spec")
            if migrate_to_v41(con):
                version = 41

        # Upgrade from v41 to v42 (Upgrade Rin, Raine, Hana prompts)
        if version < 42:
            logger.info("Upgrading database schema from v41 to v42...")
            logger.info("  - Upgrading Rin, Raine, Hana system prompts with expanded character specs")
            if migrate_to_v42(con):
                version = 42

        # Upgrade from v42 to v43 (Upgrade Shiori, Mika, Luna, Sable, Kaede, Ayane prompts)
        if version < 43:
            logger.info("Upgrading database schema from v42 to v43...")
            logger.info("  - Upgrading Shiori, Mika, Luna, Sable, Kaede, Ayane system prompts")
            if migrate_to_v43(con):
                version = 43

        # Upgrade from v43 to v44 (Conversation forking columns)
        if version < 44:
            logger.info("Upgrading database schema from v43 to v44...")
            logger.info("  - Adding forked_from_session_id and forked_at_message_id to sessions")
            if migrate_to_v44(con):
                version = 44

        # Upgrade from v44 to v45 (FTS5 full-text search index)
        if version < 45:
            logger.info("Upgrading database schema from v44 to v45...")
            logger.info("  - Creating messages_fts FTS5 virtual table + sync triggers")
            if migrate_to_v45(con):
                version = 45

        # Upgrade from v45 to v46 (Connection profiles for LLM backend switching)
        if version < 46:
            logger.info("Upgrading database schema from v45 to v46...")
            logger.info("  - Creating connection_profiles table for one-click LLM backend switching")
            if migrate_to_v46(con):
                version = 46

        # Upgrade from v46 to v47 (Bookmarks table for message starring)
        if version < 47:
            logger.info("Upgrading database schema from v46 to v47...")
            logger.info("  - Creating bookmarks table for starring messages")
            if migrate_to_v47(con):
                version = 47

        if version < 48:
            logger.info("Upgrading database schema from v47 to v48...")
            logger.info("  - Creating output_format_rules table for regex output cleaning")
            if migrate_to_v48(con):
                version = 48

        if version < 49:
            logger.info("Upgrading database schema from v48 to v49...")
            logger.info("  - Creating interaction_rewards table + character streak columns")
            if migrate_to_v49(con):
                version = 49

        if version < 50:
            logger.info("Upgrading database schema from v49 to v50...")
            logger.info("  - Adding scene_context + scene_enabled columns to sessions")
            if migrate_to_v50(con):
                version = 50

        if version < 51:
            logger.info("Upgrading database schema from v50 to v51...")
            logger.info("  - Adding screenshots table for Photo Mode gallery")
            if migrate_to_v51(con):
                version = 51

        if version < 52:
            logger.info("Upgrading database schema from v51 to v52...")
            logger.info("  - Adding system_prompt_lite for tiered character prompts")
            if migrate_to_v52(con):
                version = 52

        if version < 53:
            logger.info("Upgrading database schema from v52 to v53...")
            logger.info("  - Adding proactive messaging columns + milestones table")
            if migrate_to_v53(con):
                version = 53

        if version < 54:
            logger.info("Upgrading database schema from v53 to v54...")
            logger.info("  - Adding meta_summary_id for hierarchical summarization")
            if migrate_to_v54(con):
                version = 54

        if version < 55:
            logger.info("Upgrading database schema from v54 to v55...")
            logger.info("  - Creating user_profiles table (Adaptive Intelligence)")
            logger.info("  - Adding engagement_score, detected_mood, response_time_ms to messages")
            if migrate_to_v55(con):
                version = 55

        if version < 56:
            logger.info("Upgrading database schema from v55 to v56...")
            logger.info("  - Creating bond_stories, character_gifts, gift_history tables")
            logger.info("  - Adding bond_level/bond_xp/relationship_mode/covenant_date to character_relationships")
            logger.info("  - Adding active_outfit_id to characters")
            if migrate_to_v56(con):
                version = 56

        # Verify final state
        final_version = get_schema_version(con)

        if final_version < 56:
            raise RuntimeError(f"Database initialization failed: Expected v56, got v{final_version}")

        if final_version > 56:
            logger.warning(f"Database is newer than application (v{final_version} > v56). Some features might be unused.")

        # Sync PRAGMA user_version with our schema_version table so external
        # tools (DB Browser, etc.) can see the version without querying tables.
        con.execute(f"PRAGMA user_version = {final_version}")
        con.commit()

        logger.info(f"✅ Database ready (schema v{final_version} active — v56 adds Bond Progression System)")

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
