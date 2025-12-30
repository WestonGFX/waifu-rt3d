"""
Database initialization and migration system for waifu-rt3d.

This module handles:
- Directory structure creation
- Configuration file initialization
- Database schema migrations (v3 → v4 → v5)

Migration Strategy:
    - v3 → v4: Adds characters table and schema versioning
    - v4 → v5: Adds archived column to sessions table
    - Idempotent migrations (safe to run multiple times)
    - Proper error handling and logging
"""

from pathlib import Path
import json
import sqlite3
import logging

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
DB_PATH = STORAGE / "app.db"
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
    for p in (CONFIG_DIR, STORAGE, AVATARS, AUDIO):
        p.mkdir(parents=True, exist_ok=True)
    logger.info("✅ Directory structure verified")


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
        ...     print("Already at v4+")
    """
    cur = con.cursor()

    # Check if already at v4+ (characters table exists)
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='characters'"
    )
    if cur.fetchone():
        logger.info("Schema v4 already applied (characters table exists)")
        return False

    logger.info("Applying schema v4 migration...")
    schema_v4 = ROOT / 'backend' / 'db' / 'schema_v4.sql'

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
        logger.info("Schema v5 already applied (archived column exists)")
        return False

    logger.info("Applying schema v5 migration...")
    schema_v5 = ROOT / 'backend' / 'db' / 'schema_v5.sql'

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


def ensure_db():
    """Initialize or upgrade database to latest schema version.

    Migration Paths:
        - v0 (empty) → v4 → v5
        - v3 → v4 → v5
        - v4 → v5
        - v5 → no-op (already current)

    The function is idempotent - safe to run multiple times.
    Will log all migration steps and verify final state.

    Raises:
        RuntimeError: If migration fails or final version is incorrect
        FileNotFoundError: If required schema files are missing
        sqlite3.Error: If database operations fail

    Example:
        >>> ensure_db()
        # Automatically detects current version and applies necessary migrations
        INFO:__main__:Current schema version: v3
        INFO:__main__:Upgrading from v3 to v4...
        INFO:__main__:✅ Schema v4 migration complete
        INFO:__main__:Upgrading from v4 to v5...
        INFO:__main__:✅ Schema v5 migration complete
        INFO:__main__:✅ Database ready (schema v5)
    """
    logger.info("Initializing database...")
    con = sqlite3.connect(DB_PATH)

    try:
        version = get_schema_version(con)
        logger.info(f"Current database schema version: v{version}")

        # Handle brand new database
        if version == 0:
            logger.info("Creating new database with schema v4...")
            migrate_to_v4(con)
            version = 4

        # Upgrade from v3 to v4
        if version < 4:
            logger.info("Upgrading from v3 to v4...")
            if migrate_to_v4(con):
                version = 4

        # Upgrade from v4 to v5
        if version < 5:
            logger.info("Upgrading from v4 to v5...")
            if migrate_to_v5(con):
                version = 5

        # Verify final state
        final_version = get_schema_version(con)
        if final_version != 5:
            raise RuntimeError(
                f"Migration failed: expected v5, got v{final_version}"
            )

        logger.info(f"✅ Database ready (schema v{final_version})")

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


if __name__ == "__main__":
    run()
