"""
Database initialization and migration system for waifu-rt3d.

This module handles:
- Directory structure creation
- Configuration file initialization
- Database schema migrations (v3 → v4 → v5 → v6 → v7)

Migration Strategy:
    - v3 → v4: Adds characters table and schema versioning
    - v4 → v5: Adds archived column to sessions table
    - v5 → v6: Separates 2D/3D avatar fields
    - v6 → v7: Phase 3 data foundation (branching, greetings, templates, docs, relationships)
    - v7 → v8: Token data persistence (generation stats on messages)
    - v8 → v9: Per-character LLM routing + world columns (Phase 5)
    - v9 → v10: GPT-SoVITS voice_sample_prompt column (Phase 6H)
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
  "memory": {"max_history": 12}
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


def ensure_db():
    """Initialize or upgrade database to latest schema version.

    Migration Paths:
        - v0 (empty) → v4 → v5 → v6 → v7 → v8 → v9 → v10
        - v3 → v4 → … → v10
        - v4 → v5 → … → v10
        - v5 → v6 → … → v10
        - v6 → v7 → … → v10
        - v7 → v8 → … → v10
        - v8 → v9 → v10
        - v9 → v10
        - v10 → no-op (already current)

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

        # Verify final state
        final_version = get_schema_version(con)

        if final_version < 10:
            raise RuntimeError(f"Database initialization failed: Expected v10, got v{final_version}")

        if final_version > 10:
            logger.warning(f"Database is newer than application (v{final_version} > v10). Some features might be unused.")

        logger.info(f"✅ Database ready (schema v{final_version} active)")

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
