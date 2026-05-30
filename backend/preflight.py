"""
Database initialization and migration system for waifu-rt3d.

This module handles:
- Directory structure creation
- Configuration file initialization
- Database schema migrations (v3 → v4 → … → v86)

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
    - v56 → v57: Embedding Provider Infrastructure — lore_embeddings table
                  + embedding_model column on memories table
    - v57 → v58: Content Gating System — content_gate_config (singleton),
                  persona_content_ceilings, intimacy_states, physical_states tables
    - v58 → v59: Legacy content_filter_level migration to content_gate_config
    - v59 → v60: On-device learning tables — engagement_signals, preference_history,
                  privacy_settings tables
    - v60 → v61: NSFW Phase 1 — relationship_boundaries + private_vocabulary tables,
                  writing_style column on sessions, sensory_profile column on characters
    - v74 → v75: M6 Gamification — character_achievements table
    - v75 → v76: AIE Phase C feedback subsystem — message_feedback, aie_signal_weights tables
                  + explicit_signals_enabled/implicit_signals_enabled on privacy_settings
    - v76 → v77: AIE Phase C Strand A — character_loras table for LoRA fine-tuning adapters
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


def migrate_to_v57(con: sqlite3.Connection) -> bool:
    """Apply schema v57: Embedding provider infrastructure.

    Creates the ``lore_embeddings`` table for pre-computed lore entry
    embeddings and adds an ``embedding_model`` tracking column to the
    ``memories`` table.  Together these two changes let the embedding
    subsystem record which model produced each vector so that stale
    embeddings can be detected and regenerated when the active provider
    changes.

    Schema changes:

        New table ``lore_embeddings``:
            - ``lore_entry_id`` (INTEGER PRIMARY KEY): FK → lore_entries(id)
              ON DELETE CASCADE — one row per lore entry.
            - ``embedding`` (BLOB NOT NULL): raw binary embedding vector.
            - ``model`` (TEXT NOT NULL): identifier of the model that
              produced this embedding (e.g. 'all-MiniLM-L6-v2').
            - ``updated_at`` (TEXT): ISO datetime of last update.

        New column on ``memories``:
            - ``embedding_model`` (TEXT DEFAULT 'all-MiniLM-L6-v2'): the
              embedding model used to produce this memory's vector.

    All ALTER TABLE statements are guarded by a PRAGMA column-existence
    check so the migration is idempotent.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v57+.

    Example:
        >>> con = sqlite3.connect("app.db")
        >>> migrate_to_v57(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 57:
        return False

    try:
        logger.info("Applying schema v57 migration (Embedding Provider Infrastructure)...")

        # ------------------------------------------------------------------ #
        # lore_embeddings — pre-computed vectors for semantic lore matching
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS lore_embeddings (
                lore_entry_id INTEGER PRIMARY KEY
                                   REFERENCES lore_entries(id) ON DELETE CASCADE,
                embedding     BLOB NOT NULL,
                model         TEXT NOT NULL,
                updated_at    TEXT DEFAULT (datetime('now'))
            )
            """
        )

        # ------------------------------------------------------------------ #
        # memories — track which embedding model produced each vector
        # ------------------------------------------------------------------ #
        mem_cols = {r[1] for r in con.execute("PRAGMA table_info(memories)").fetchall()}
        if "embedding_model" not in mem_cols:
            con.execute(
                "ALTER TABLE memories ADD COLUMN embedding_model TEXT DEFAULT 'all-MiniLM-L6-v2'"
            )

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (57)")
        con.commit()
        logger.info(
            "\u2705 Schema v57 migration complete "
            "(lore_embeddings table; embedding_model on memories)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v57 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v58(con: sqlite3.Connection) -> bool:
    """Apply schema v58: Content Gating System.

    Creates four new tables that together power the content gating subsystem.
    No existing tables or columns are modified.

    Schema changes:

        New table ``content_gate_config`` (singleton, id always 1):
            - ``id`` (INTEGER PRIMARY KEY DEFAULT 1): enforced singleton via
              CHECK (id = 1).
            - ``global_content_ceiling`` (TEXT NOT NULL DEFAULT 'general'):
              one of 'general' | 'edgy' | 'mature' | 'explicit'.
            - ``age_verified`` (INTEGER DEFAULT 0): 1 once the user has
              confirmed age gate.
            - ``content_lock_enabled`` (INTEGER DEFAULT 0): 1 when a
              parental-lock password is set.
            - ``content_lock_password_hash`` (TEXT DEFAULT ''): bcrypt hash
              of the lock password.
            - ``updated_at`` (TEXT): ISO datetime of last change.

        New table ``persona_content_ceilings``:
            - ``char_id`` (INTEGER PRIMARY KEY): FK → characters(id)
              ON DELETE CASCADE — one row per character.
            - ``ceiling`` (TEXT NOT NULL DEFAULT 'general'): per-character
              content ceiling override; must be <= global_content_ceiling
              at runtime.
            - ``updated_at`` (TEXT): ISO datetime of last change.

        New table ``intimacy_states``:
            - ``id`` (INTEGER PRIMARY KEY AUTOINCREMENT).
            - ``session_id`` (INTEGER NOT NULL): references sessions(id).
            - ``char_id`` (INTEGER NOT NULL): references characters(id).
            - ``level`` (INTEGER NOT NULL DEFAULT 0): 0–100 intimacy score.
            - ``trend`` (TEXT DEFAULT 'stable'): 'rising' | 'stable' |
              'cooling'.
            - ``last_update_turn`` (INTEGER DEFAULT 0): message turn index
              of most recent level change.
            - ``updated_at`` (TEXT): ISO datetime of last change.
            - UNIQUE(session_id, char_id).
            - Index: ``idx_intimacy_session_char`` on (session_id, char_id).

        New table ``physical_states``:
            - ``id`` (INTEGER PRIMARY KEY AUTOINCREMENT).
            - ``session_id`` (INTEGER NOT NULL): references sessions(id).
            - ``char_id`` (INTEGER NOT NULL): references characters(id).
            - ``user_clothing`` (TEXT DEFAULT 'casual clothes').
            - ``companion_clothing`` (TEXT DEFAULT 'default outfit').
            - ``physical_context`` (TEXT DEFAULT 'sitting across from each
              other'): free-text scene description.
            - ``arousal_level`` (INTEGER DEFAULT 0): 0–100 scale.
            - ``recent_actions`` (TEXT DEFAULT '[]'): JSON array of recent
              physical action tags.
            - ``last_updated_at`` (REAL DEFAULT 0.0): Unix timestamp for
              fast age checks.
            - UNIQUE(session_id, char_id).
            - Index: ``idx_physical_session_char`` on (session_id, char_id).

    Migration note — mapping old ``content_filter_level`` integer from
    app.json to the new ceiling vocabulary:
        -1  → 'explicit'
         0  → 'mature'
         1  → 'edgy'
         2  → 'general'
         3  → 'general' (with content_lock_enabled = 1)
    The actual mapping is performed at runtime by the server when it first
    reads app.json; this migration only creates the tables with safe
    defaults.

    Args:
        con: Active SQLite connection.

    Returns:
        True if migration was applied, False if already at v58+.

    Example:
        >>> con = sqlite3.connect("app.db")
        >>> migrate_to_v58(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 58:
        return False

    try:
        logger.info("Applying schema v58 migration (Content Gating System)...")

        # ------------------------------------------------------------------ #
        # content_gate_config — global singleton row for content gate settings
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS content_gate_config (
                id                         INTEGER PRIMARY KEY DEFAULT 1
                                               CHECK (id = 1),
                global_content_ceiling     TEXT    NOT NULL DEFAULT 'general',
                age_verified               INTEGER DEFAULT 0,
                content_lock_enabled       INTEGER DEFAULT 0,
                content_lock_password_hash TEXT    DEFAULT '',
                updated_at                 TEXT    DEFAULT (datetime('now'))
            )
            """
        )
        # Ensure the singleton row exists.
        con.execute("INSERT OR IGNORE INTO content_gate_config (id) VALUES (1)")

        # ------------------------------------------------------------------ #
        # persona_content_ceilings — per-character ceiling overrides
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS persona_content_ceilings (
                char_id    INTEGER PRIMARY KEY
                               REFERENCES characters(id) ON DELETE CASCADE,
                ceiling    TEXT    NOT NULL DEFAULT 'general',
                updated_at TEXT    DEFAULT (datetime('now'))
            )
            """
        )

        # ------------------------------------------------------------------ #
        # intimacy_states — intimacy level per session+character pair
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS intimacy_states (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id       INTEGER NOT NULL,
                char_id          INTEGER NOT NULL,
                level            INTEGER NOT NULL DEFAULT 0,
                trend            TEXT    DEFAULT 'stable',
                last_update_turn INTEGER DEFAULT 0,
                updated_at       TEXT    DEFAULT (datetime('now')),
                UNIQUE(session_id, char_id)
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_intimacy_session_char "
            "ON intimacy_states(session_id, char_id)"
        )

        # ------------------------------------------------------------------ #
        # physical_states — physical scene state per session+character pair
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS physical_states (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id         INTEGER NOT NULL,
                char_id            INTEGER NOT NULL,
                user_clothing      TEXT    DEFAULT 'casual clothes',
                companion_clothing TEXT    DEFAULT 'default outfit',
                physical_context   TEXT    DEFAULT 'sitting across from each other',
                arousal_level      INTEGER DEFAULT 0,
                recent_actions     TEXT    DEFAULT '[]',
                last_updated_at    REAL    DEFAULT 0.0,
                UNIQUE(session_id, char_id)
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_physical_session_char "
            "ON physical_states(session_id, char_id)"
        )

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (58)")
        con.commit()
        logger.info(
            "\u2705 Schema v58 migration complete "
            "(content_gate_config, persona_content_ceilings, "
            "intimacy_states, physical_states)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v58 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v59(con: sqlite3.Connection) -> bool:
    """v58 → v59: Migrate legacy content_filter_level to content_gate_config.

    Reads the old integer ``content_filter_level`` from app.json and maps it
    into the new ``content_gate_config`` singleton row.  If the user already
    changed their ceiling via the new UI (i.e. it's no longer the default
    'general'), this migration is a no-op.

    Legacy mapping:
        -1 → explicit (+ age_verified=1)
         0 → mature   (+ age_verified=1)
         1 → edgy
         2 → general
         3 → general  (+ content_lock_enabled=1)

    Returns:
        True on success.

    Raises:
        Exception: If the migration fails (rolls back automatically).
    """
    try:
        # Check if the new config is still at defaults (ceiling='general',
        # not age-verified, not locked).  If the user already changed settings
        # via the Phase 18C UI, skip this migration.
        row = con.execute(
            "SELECT global_content_ceiling, age_verified, content_lock_enabled "
            "FROM content_gate_config WHERE id = 1"
        ).fetchone()
        if row and (row[0] != "general" or row[1] or row[2]):
            logger.info(
                "  - content_gate_config already customised — skipping legacy migration"
            )
            con.execute(
                "INSERT OR REPLACE INTO schema_version (version) VALUES (59)"
            )
            con.commit()
            return True

        # Read legacy setting from app.json
        legacy_level = 0
        if APP_JSON.exists():
            try:
                cfg = json.loads(APP_JSON.read_text(encoding="utf-8"))
                legacy_level = int(cfg.get("content_filter_level", 0))
            except (json.JSONDecodeError, ValueError, TypeError):
                pass

        # Map to new system
        level_map = {-1: "explicit", 0: "mature", 1: "edgy", 2: "general", 3: "general"}
        new_ceiling = level_map.get(legacy_level, "general")

        # Determine age_verified: mature/explicit require it
        age_verified = 1 if new_ceiling in ("mature", "explicit") else 0

        # Determine lock: old level 3 was "strict + locked"
        lock_enabled = 1 if legacy_level == 3 else 0

        con.execute(
            "UPDATE content_gate_config SET "
            "global_content_ceiling = ?, age_verified = ?, "
            "content_lock_enabled = ?, updated_at = datetime('now') "
            "WHERE id = 1",
            (new_ceiling, age_verified, lock_enabled),
        )

        con.execute(
            "INSERT OR REPLACE INTO schema_version (version) VALUES (59)"
        )
        con.commit()
        logger.info(
            f"\u2705 Schema v59 migration complete "
            f"(legacy content_filter_level={legacy_level} → "
            f"ceiling={new_ceiling}, age_verified={bool(age_verified)})"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v59 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v60(con: sqlite3.Connection) -> bool:
    """v59 → v60: On-device learning tables for Adaptive Intelligence Engine.

    Creates three new tables that power per-user preference learning without
    sending any data off-device:

    - ``engagement_signals``: Lightweight per-turn metrics (message length,
      emoji/question counts, sentiment score, topic drift, intimacy delta).
      Written by the chat pipeline after every assistant turn and consumed by
      the preference-learning loop to detect engagement patterns.

    - ``preference_history``: Rolling preference snapshots with exponential
      decay.  Each row captures a computed preference vector (response length,
      formality, humor, empathy, depth, pacing, escalation, vocabulary) for a
      given character at a point in time, together with the window size, decay
      factor, and confidence level used to compute it.

    - ``privacy_settings``: Singleton (id=1) opt-out registry.  Defaults to
      all features enabled.  Users can flip individual toggles via the Privacy
      settings panel without losing their historical data.

    Returns:
        True on success, False if schema is already at v60 or higher.

    Raises:
        Exception: If the migration fails (rolls back automatically).

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> con.execute("CREATE TABLE schema_version (version INTEGER)")
        >>> con.execute("INSERT INTO schema_version VALUES (59)")
        >>> migrate_to_v60(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 60:
        return False
    try:
        # ------------------------------------------------------------------ #
        # engagement_signals — per-turn lightweight engagement metrics
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS engagement_signals (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id                 INTEGER NOT NULL,
                session_id              INTEGER NOT NULL,
                turn_number             INTEGER NOT NULL DEFAULT 0,
                user_msg_length         INTEGER NOT NULL DEFAULT 0,
                assistant_msg_length    INTEGER NOT NULL DEFAULT 0,
                response_time_ms        INTEGER DEFAULT NULL,
                emoji_count             INTEGER NOT NULL DEFAULT 0,
                question_count          INTEGER NOT NULL DEFAULT 0,
                exclamation_count       INTEGER NOT NULL DEFAULT 0,
                sentiment_score         REAL    DEFAULT 0.0,
                topic_drift             REAL    DEFAULT 0.0,
                intimacy_delta          INTEGER DEFAULT 0,
                created_at              TEXT    DEFAULT (datetime('now'))
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_engagement_char_session "
            "ON engagement_signals(char_id, session_id)"
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_engagement_created "
            "ON engagement_signals(created_at)"
        )

        # ------------------------------------------------------------------ #
        # preference_history — rolling preference snapshots with exp. decay
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS preference_history (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id               INTEGER NOT NULL,
                pref_response_length  REAL    DEFAULT 0.5,
                pref_formality        REAL    DEFAULT 0.5,
                pref_humor            REAL    DEFAULT 0.5,
                pref_empathy          REAL    DEFAULT 0.5,
                pref_depth            REAL    DEFAULT 0.5,
                pref_pacing           REAL    DEFAULT 0.5,
                pref_escalation       REAL    DEFAULT 0.5,
                pref_vocabulary       REAL    DEFAULT 0.5,
                window_size           INTEGER NOT NULL DEFAULT 20,
                decay_factor          REAL    NOT NULL DEFAULT 0.95,
                confidence            REAL    DEFAULT 0.0,
                computed_at           TEXT    DEFAULT (datetime('now'))
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_pref_history_char "
            "ON preference_history(char_id, computed_at)"
        )

        # ------------------------------------------------------------------ #
        # privacy_settings — singleton opt-out registry (id must always be 1)
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS privacy_settings (
                id                   INTEGER PRIMARY KEY DEFAULT 1
                                         CHECK (id = 1),
                signal_collection    INTEGER DEFAULT 1,
                preference_learning  INTEGER DEFAULT 1,
                behavior_adaptation  INTEGER DEFAULT 1,
                topic_tracking       INTEGER DEFAULT 1,
                intimacy_tracking    INTEGER DEFAULT 1,
                updated_at           TEXT    DEFAULT (datetime('now'))
            )
            """
        )
        # Ensure the singleton row exists so reads never return NULL.
        con.execute("INSERT OR IGNORE INTO privacy_settings (id) VALUES (1)")

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (60)")
        con.commit()
        logger.info(
            "\u2705 Schema v60 migration complete "
            "(engagement_signals, preference_history, privacy_settings)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v60 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v61(con: sqlite3.Connection) -> bool:
    """v60 → v61: NSFW Phase 1 — boundaries, writing styles, sensory profiles, vocabulary.

    Creates two new tables and adds two new columns:

    - ``relationship_boundaries``: Per-character comfort-level boundaries that
      become negative constraints in the LLM system prompt.  Hard boundaries are
      system-level blocks; soft boundaries are suggestions the character avoids.

    - ``private_vocabulary``: Pet names, inside jokes, code words, and shared
      references that characters develop with the user over time.  Injected into
      the LLM prompt so the character uses the relationship's private lexicon.

    - ``sessions.writing_style``: Per-session writing style override (romantic,
      literary, direct, suggestive).  NULL = use character default.

    - ``characters.sensory_profile``: JSON blob storing per-character sensory
      emphasis (primary/secondary senses, descriptors).  NULL = use built-in
      constant profiles.

    Returns:
        True on success, False if schema is already at v61 or higher.

    Raises:
        Exception: If the migration fails (rolls back automatically).

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> con.execute("CREATE TABLE schema_version (version INTEGER)")
        >>> con.execute("INSERT INTO schema_version VALUES (60)")
        >>> migrate_to_v61(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 61:
        return False
    try:
        # ------------------------------------------------------------------ #
        # relationship_boundaries — per-character comfort-level constraints
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS relationship_boundaries (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id         INTEGER NOT NULL,
                boundary_type   TEXT    NOT NULL,
                level           TEXT    NOT NULL DEFAULT 'soft',
                description     TEXT    NOT NULL DEFAULT '',
                set_via         TEXT    NOT NULL DEFAULT 'form',
                created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
                updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
                UNIQUE(char_id, boundary_type)
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_boundaries_char "
            "ON relationship_boundaries(char_id)"
        )

        # ------------------------------------------------------------------ #
        # private_vocabulary — pet names, inside jokes, shared references
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS private_vocabulary (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id         INTEGER NOT NULL,
                term            TEXT    NOT NULL,
                category        TEXT    NOT NULL DEFAULT 'pet_name',
                meaning         TEXT    NOT NULL DEFAULT '',
                origin          TEXT    NOT NULL DEFAULT 'user',
                context         TEXT    NOT NULL DEFAULT '',
                first_used_at   TEXT    NOT NULL DEFAULT (datetime('now')),
                usage_count     INTEGER NOT NULL DEFAULT 1,
                last_used_at    TEXT    NOT NULL DEFAULT (datetime('now')),
                is_active       INTEGER NOT NULL DEFAULT 1,
                UNIQUE(char_id, term)
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_vocabulary_char "
            "ON private_vocabulary(char_id)"
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_vocabulary_active "
            "ON private_vocabulary(char_id, is_active)"
        )

        # ------------------------------------------------------------------ #
        # sessions.writing_style — per-session writing style override
        # ------------------------------------------------------------------ #
        try:
            con.execute("ALTER TABLE sessions ADD COLUMN writing_style TEXT")
        except sqlite3.OperationalError:
            pass  # Column already exists

        # ------------------------------------------------------------------ #
        # characters.sensory_profile — JSON sensory emphasis blob
        # ------------------------------------------------------------------ #
        try:
            con.execute("ALTER TABLE characters ADD COLUMN sensory_profile TEXT")
        except sqlite3.OperationalError:
            pass  # Column already exists

        # Bump version
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (61)")
        con.commit()
        logger.info(
            "\u2705 Schema v61 migration complete "
            "(relationship_boundaries, private_vocabulary, sessions.writing_style, "
            "characters.sensory_profile)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v61 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v62(con: sqlite3.Connection) -> bool:
    """v61 → v62: NSFW Phase 4 — milestones, intimate memory, post-scene states.

    Creates three new tables:

    - ``intimate_milestones``: Tracks relationship "firsts" (first kiss, first
      love declaration, etc.) per character.  Each milestone type can only be
      recorded once per character (UNIQUE constraint).  Stores a character-voice
      memory text and sensory anchors for anniversary callbacks.

    - ``intimate_memories``: Sensory-rich memories of intimate encounters.
      Stored as structured JSON (emotion, sensory anchors, scene type) rather
      than raw message text.  Supports context-matched recall via anchor
      keyword overlap and recall frequency limiting.

    - ``post_scene_states``: Tracks the post-scene emotional arc state machine
      (afterglow → aftercare → pillow_talk → normal) per session.  Used by
      both the aftercare engine and pillow talk generator.

    Returns:
        True on success, False if schema is already at v62 or higher.

    Raises:
        Exception: If the migration fails (rolls back automatically).

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> con.execute("CREATE TABLE schema_version (version INTEGER)")
        >>> con.execute("INSERT INTO schema_version VALUES (61)")
        >>> migrate_to_v62(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 62:
        return False
    try:
        # ------------------------------------------------------------------ #
        # intimate_milestones — relationship "firsts" tracker (F1)
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS intimate_milestones (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id                 INTEGER NOT NULL,
                milestone_type          TEXT    NOT NULL,
                message_id              INTEGER,
                session_id              INTEGER,
                detected_at             TEXT    NOT NULL DEFAULT (datetime('now')),
                character_memory_text   TEXT    NOT NULL DEFAULT '',
                context_summary         TEXT    NOT NULL DEFAULT '',
                sensory_anchors         TEXT    NOT NULL DEFAULT '[]',
                bond_level_at_detection INTEGER NOT NULL DEFAULT 0,
                anniversary_last_mentioned TEXT,
                UNIQUE(char_id, milestone_type)
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_milestones_char "
            "ON intimate_milestones(char_id)"
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_milestones_char_type "
            "ON intimate_milestones(char_id, milestone_type)"
        )

        # ------------------------------------------------------------------ #
        # intimate_memories — sensory-rich intimate encounter storage (F2)
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS intimate_memories (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id           INTEGER NOT NULL,
                message_id        INTEGER,
                session_id        INTEGER,
                sensory_data      TEXT    NOT NULL DEFAULT '{}',
                emotion           TEXT    NOT NULL DEFAULT '',
                ending_emotion    TEXT    NOT NULL DEFAULT '',
                intimacy_level    INTEGER NOT NULL DEFAULT 0,
                arousal_peak      REAL    NOT NULL DEFAULT 0.0,
                character_summary TEXT    NOT NULL DEFAULT '',
                scene_type        TEXT    NOT NULL DEFAULT '',
                recall_count      INTEGER NOT NULL DEFAULT 0,
                last_recalled     TEXT,
                milestone_id      INTEGER REFERENCES intimate_milestones(id),
                created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_intimate_mem_char "
            "ON intimate_memories(char_id)"
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_intimate_mem_char_time "
            "ON intimate_memories(char_id, created_at)"
        )

        # ------------------------------------------------------------------ #
        # post_scene_states — aftercare + pillow talk state machine (F5/F12)
        # ------------------------------------------------------------------ #
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS post_scene_states (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id                 INTEGER NOT NULL,
                session_id              INTEGER NOT NULL,
                scene_end_at            TEXT    NOT NULL DEFAULT (datetime('now')),
                arousal_peak            REAL    NOT NULL DEFAULT 0.0,
                current_phase           TEXT    NOT NULL DEFAULT 'afterglow',
                aftercare_messages_sent INTEGER NOT NULL DEFAULT 0,
                aftercare_style         TEXT    NOT NULL DEFAULT '',
                pillow_talk_topics_used TEXT    NOT NULL DEFAULT '[]',
                morning_after_flag      INTEGER NOT NULL DEFAULT 0,
                completed               INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_post_scene_session "
            "ON post_scene_states(char_id, session_id, completed)"
        )

        # Bump version
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (62)")
        con.commit()
        logger.info(
            "\u2705 Schema v62 migration complete "
            "(intimate_milestones, intimate_memories, post_scene_states)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v62 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v63(con: sqlite3.Connection) -> bool:
    """v62 → v63: NSFW Phase 5 — desires unlock tree, post-scene moods, journal types.

    Creates two new tables and extends character_journals:

    - ``character_desires``: Bond-gated desire/fantasy reveals per character.
      Each desire unlocks once at a specific bond level and is stored permanently.
      Used by the DesireEngine (F39) for progressive vulnerability reveals.

    - ``post_scene_moods``: Tracks the user's emotional response after intimate
      scenes.  Stores sentiment classification and arousal peak for the
      preference discovery feedback loop (F43).

    Also adds ``entry_type`` column to ``character_journals`` for F11 Fantasy
    Journal support (``'reflection'`` default, ``'fantasy'`` for bond-gated
    intimate diary entries).

    Returns:
        True on success, False if schema is already at v63 or higher.

    Raises:
        Exception: If the migration fails (rolls back automatically).

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> con.execute("CREATE TABLE schema_version (version INTEGER)")
        <...>
        >>> con.execute("INSERT INTO schema_version VALUES (62)")
        <...>
        >>> migrate_to_v63(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 63:
        return False

    try:
        # F39: Secret Desires Unlock Tree
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS character_desires (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id         INTEGER NOT NULL,
                desire_id       TEXT    NOT NULL,
                title           TEXT    NOT NULL DEFAULT '',
                description     TEXT    NOT NULL DEFAULT '',
                bond_required   INTEGER NOT NULL DEFAULT 0,
                unlocked        INTEGER NOT NULL DEFAULT 0,
                unlocked_at     TEXT,
                reveal_narrative TEXT   NOT NULL DEFAULT '',
                created_at      TEXT    DEFAULT (datetime('now')),
                UNIQUE(char_id, desire_id)
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_desires_char "
            "ON character_desires(char_id, bond_required)"
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_desires_unlocked "
            "ON character_desires(char_id, unlocked)"
        )

        # F43: Post-Scene Mood Tracker
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS post_scene_moods (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id      INTEGER,
                char_id         INTEGER NOT NULL,
                scene_end_time  TEXT    NOT NULL DEFAULT (datetime('now')),
                user_sentiment  TEXT    NOT NULL DEFAULT 'neutral',
                arousal_peak    REAL    NOT NULL DEFAULT 0.0,
                notes           TEXT    NOT NULL DEFAULT '',
                created_at      TEXT    DEFAULT (datetime('now'))
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_post_moods_char "
            "ON post_scene_moods(char_id, created_at DESC)"
        )

        # F11: Add entry_type to character_journals (if table exists)
        try:
            con.execute(
                "ALTER TABLE character_journals "
                "ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'reflection'"
            )
        except sqlite3.OperationalError:
            pass  # Column already exists or table not yet created

        # Bump version
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (63)")
        con.commit()
        logger.info(
            "\u2705 Schema v63 migration complete "
            "(character_desires, post_scene_moods, journal entry_type)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v63 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v64(con: sqlite3.Connection) -> bool:
    """v63 → v64: NSFW Phase 7+8 — gallery, shared fantasies.

    Creates two new tables:

    - ``intimate_gallery``: AI-generated intimate image storage with
      favorites, mood tagging, and content lock support (F42).

    - ``shared_fantasies``: Collaborative user/character fantasy building
      with alternating contributions and play-out capability (F47).

    Returns:
        True on success, False if schema is already at v64 or higher.

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> con.execute("CREATE TABLE schema_version (version INTEGER)")
        <...>
        >>> con.execute("INSERT INTO schema_version VALUES (63)")
        <...>
        >>> migrate_to_v64(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 64:
        return False

    try:
        # F42: Intimate Photo Gallery
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS intimate_gallery (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id         INTEGER NOT NULL,
                image_path      TEXT    NOT NULL,
                prompt_used     TEXT    NOT NULL DEFAULT '',
                scene_context   TEXT    NOT NULL DEFAULT '',
                mood            TEXT    NOT NULL DEFAULT 'romantic',
                intimacy_level  INTEGER NOT NULL DEFAULT 0,
                is_favorite     INTEGER NOT NULL DEFAULT 0,
                created_at      TEXT    DEFAULT (datetime('now'))
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_gallery_char "
            "ON intimate_gallery(char_id, created_at DESC)"
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_gallery_mood "
            "ON intimate_gallery(char_id, mood)"
        )

        # F47: Shared Fantasy Builder
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS shared_fantasies (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id         INTEGER NOT NULL,
                title           TEXT    NOT NULL DEFAULT '',
                description     TEXT    NOT NULL DEFAULT '',
                contributions   TEXT    NOT NULL DEFAULT '[]',
                status          TEXT    NOT NULL DEFAULT 'building',
                created_at      TEXT    DEFAULT (datetime('now')),
                played_at       TEXT
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_fantasies_char "
            "ON shared_fantasies(char_id, status)"
        )

        # Bump version
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (64)")
        con.commit()
        logger.info(
            "\u2705 Schema v64 migration complete "
            "(intimate_gallery, shared_fantasies)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v64 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v65(con: sqlite3.Connection) -> bool:
    """v64 → v65: AIE Phase A — Extended User Model + context signals.

    Extends ``user_profiles`` with communication style, emotional pattern,
    and interaction pattern columns for the Adaptive Intelligence Engine.

    Also adds ``detected_context`` column to ``engagement_signals`` for
    historical context classification tracking.

    Returns:
        True on success, False if schema is already at v65 or higher.

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> con.execute("CREATE TABLE schema_version (version INTEGER)")
        <...>
        >>> con.execute("INSERT INTO schema_version VALUES (64)")
        <...>
        >>> migrate_to_v65(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 65:
        return False

    try:
        # Communication style columns
        for col, col_type, default in [
            ("avg_message_length", "REAL", "NULL"),
            ("vocabulary_complexity", "REAL", "NULL"),
            ("emoji_frequency", "REAL", "NULL"),
            ("question_rate", "REAL", "NULL"),
        ]:
            try:
                con.execute(
                    f"ALTER TABLE user_profiles ADD COLUMN {col} {col_type} DEFAULT {default}"
                )
            except sqlite3.OperationalError:
                pass  # Column already exists

        # Emotional pattern columns
        for col, col_type, default in [
            ("emotional_volatility", "REAL", "NULL"),
            ("comfort_seeking_freq", "REAL", "NULL"),
            ("peak_engagement_hour", "INTEGER", "NULL"),
            ("mood_correlation_map", "TEXT", "NULL"),
        ]:
            try:
                con.execute(
                    f"ALTER TABLE user_profiles ADD COLUMN {col} {col_type} DEFAULT {default}"
                )
            except sqlite3.OperationalError:
                pass

        # Interaction pattern columns
        for col, col_type, default in [
            ("avg_session_length", "REAL", "NULL"),
            ("session_frequency", "REAL", "NULL"),
            ("initiative_ratio", "REAL", "NULL"),
        ]:
            try:
                con.execute(
                    f"ALTER TABLE user_profiles ADD COLUMN {col} {col_type} DEFAULT {default}"
                )
            except sqlite3.OperationalError:
                pass

        # Add detected_context to engagement_signals
        try:
            con.execute(
                "ALTER TABLE engagement_signals ADD COLUMN detected_context TEXT DEFAULT NULL"
            )
        except sqlite3.OperationalError:
            pass  # Column already exists

        # Bump version
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (65)")
        con.commit()
        logger.info(
            "\u2705 Schema v65 migration complete "
            "(AIE extended user model + detected_context)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v65 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v66(con: sqlite3.Connection) -> bool:
    """v65 → v66: AIE Phase B — Memory decay, topic graph, relationship milestones.

    Adds Ebbinghaus memory decay columns to ``memories`` table, creates
    ``topic_tracking`` table for interest tracking with sentiment, and
    creates ``relationship_milestones`` table for detecting meaningful
    relationship events.

    Args:
        con: Active SQLite connection.

    Returns:
        True on success, False if schema is already at v66 or higher.

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> con.execute("CREATE TABLE schema_version (version INTEGER)")
        <...>
        >>> con.execute("INSERT INTO schema_version VALUES (65)")
        <...>
        >>> migrate_to_v66(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 66:
        return False

    try:
        # --- Memory decay columns on memories table ---
        for col, col_type, default in [
            ("importance", "REAL", "0.5"),
            ("recall_count", "INTEGER", "0"),
            ("last_recalled_at", "TEXT", "NULL"),
            ("decay_score", "REAL", "1.0"),
        ]:
            try:
                con.execute(
                    f"ALTER TABLE memories ADD COLUMN {col} {col_type} DEFAULT {default}"
                )
            except sqlite3.OperationalError:
                pass  # Column already exists

        # Index for efficient decay-based retrieval
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_memories_decay ON memories(decay_score)"
        )

        # --- Topic tracking table ---
        con.execute("""
            CREATE TABLE IF NOT EXISTS topic_tracking (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id         INTEGER NOT NULL,
                topic           TEXT NOT NULL,
                mention_count   INTEGER DEFAULT 1,
                total_sentiment REAL DEFAULT 0.0,
                avg_sentiment   REAL DEFAULT 0.0,
                first_seen_at   TEXT DEFAULT (datetime('now')),
                last_seen_at    TEXT DEFAULT (datetime('now')),
                is_emerging     INTEGER DEFAULT 0,
                UNIQUE(char_id, topic)
            )
        """)

        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_topic_tracking_char "
            "ON topic_tracking(char_id, mention_count DESC)"
        )

        # --- Relationship milestones table ---
        con.execute("""
            CREATE TABLE IF NOT EXISTS relationship_milestones (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id     INTEGER NOT NULL,
                milestone   TEXT NOT NULL,
                description TEXT,
                detected_at TEXT DEFAULT (datetime('now')),
                UNIQUE(char_id, milestone)
            )
        """)

        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_milestones_char "
            "ON relationship_milestones(char_id, detected_at DESC)"
        )

        # Bump version
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (66)")
        con.commit()
        logger.info(
            "\u2705 Schema v66 migration complete "
            "(memory decay + topic tracking + relationship milestones)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v66 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v67(con: sqlite3.Connection) -> bool:
    """Migrate schema from v66 to v67.

    Adds: Bond Progression Phase 1 tables — XP event log, bond milestones,
    and daily/session tracking columns on character_relationships.

    Tables created:
        ``bond_xp_events`` — Detailed log of every XP award with action,
            multiplier, and source detail for analytics.
        ``bond_milestones`` — Tracks level-ups, tier transitions, story
            unlocks, and expression unlocks with achievement timestamps.

    Columns added to ``character_relationships``:
        ``last_daily_bonus_date`` — ISO date of last daily first-interaction bonus.
        ``current_session_msgs`` — Message count in current session (for session bonus).
        ``session_bonus_awarded`` — Whether session bonus already awarded this session.

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> con.execute("CREATE TABLE schema_version (version INTEGER)")
        <...>
        >>> con.execute("INSERT INTO schema_version VALUES (66)")
        <...>
        >>> migrate_to_v67(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 67:
        logger.info("Schema already at v%d, skipping v67 migration.", cur_ver)
        return True

    try:
        # --- Bond XP events table ---
        con.execute("""
            CREATE TABLE IF NOT EXISTS bond_xp_events (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id       INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                xp_amount     INTEGER NOT NULL,
                action        TEXT NOT NULL,
                multiplier    REAL DEFAULT 1.0,
                source_detail TEXT,
                created_at    TEXT DEFAULT (datetime('now'))
            )
        """)
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_bond_xp_events_char "
            "ON bond_xp_events(char_id)"
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_bond_xp_events_char_date "
            "ON bond_xp_events(char_id, created_at)"
        )

        # --- Bond milestones table ---
        con.execute("""
            CREATE TABLE IF NOT EXISTS bond_milestones (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id         INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                milestone_type  TEXT NOT NULL,
                milestone_key   TEXT NOT NULL,
                bond_level      INTEGER NOT NULL,
                achieved_at     TEXT DEFAULT (datetime('now')),
                viewed          INTEGER DEFAULT 0,
                UNIQUE(char_id, milestone_key)
            )
        """)
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_bond_milestones_char "
            "ON bond_milestones(char_id)"
        )

        # --- Daily/session tracking columns on character_relationships ---
        # Use try/except for each ALTER since columns may already exist
        for col_sql in [
            "ALTER TABLE character_relationships ADD COLUMN last_daily_bonus_date TEXT",
            "ALTER TABLE character_relationships ADD COLUMN current_session_msgs INTEGER DEFAULT 0",
            "ALTER TABLE character_relationships ADD COLUMN session_bonus_awarded INTEGER DEFAULT 0",
        ]:
            try:
                con.execute(col_sql)
            except sqlite3.OperationalError:
                pass  # Column already exists

        # Bump version
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (67)")
        con.commit()
        logger.info(
            "\u2705 Schema v67 migration complete "
            "(bond_xp_events + bond_milestones + daily/session tracking)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v67 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v68(con: sqlite3.Connection) -> bool:
    """Migrate schema from v67 to v68.

    Adds: CHARA Card V2 compliance columns on the ``characters`` table so that
    imported/exported character cards preserve all standard V2 fields without
    data loss.

    Columns added to ``characters``:
        ``scenario`` — Scene/setting description injected at the start of
            every conversation (CHARA v2 ``scenario`` field).
        ``chara_description`` — Character bio/lore separate from the
            behavioural ``system_prompt`` (CHARA v2 ``description`` field).
        ``alternate_greetings`` — JSON array of alternative opening messages
            (CHARA v2 ``alternate_greetings`` field).
        ``mes_example`` — Example dialogue exchanges that guide LLM tone
            (CHARA v2 ``mes_example`` field).
        ``post_history_instructions`` — Text injected after chat history,
            before the current user message (CHARA v2
            ``post_history_instructions`` / jailbreak field).
        ``chara_tags`` — JSON array of tag strings for character discovery
            and filtering (CHARA v2 ``tags`` field).
        ``creator_notes`` — Author notes from the card creator (CHARA v2
            ``creator_notes`` field).

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> con.execute("CREATE TABLE schema_version (version INTEGER)")
        <...>
        >>> con.execute("INSERT INTO schema_version VALUES (67)")
        <...>
        >>> con.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY)")
        <...>
        >>> migrate_to_v68(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 68:
        logger.info("Schema already at v%d, skipping v68 migration.", cur_ver)
        return True

    try:
        # Add CHARA V2 columns — use try/except for each ALTER since
        # columns may already exist from a partial prior run.
        for col_sql in [
            "ALTER TABLE characters ADD COLUMN scenario TEXT DEFAULT NULL",
            "ALTER TABLE characters ADD COLUMN chara_description TEXT DEFAULT NULL",
            "ALTER TABLE characters ADD COLUMN alternate_greetings TEXT DEFAULT '[]'",
            "ALTER TABLE characters ADD COLUMN mes_example TEXT DEFAULT NULL",
            "ALTER TABLE characters ADD COLUMN post_history_instructions TEXT DEFAULT NULL",
            "ALTER TABLE characters ADD COLUMN chara_tags TEXT DEFAULT '[]'",
            "ALTER TABLE characters ADD COLUMN creator_notes TEXT DEFAULT NULL",
        ]:
            try:
                con.execute(col_sql)
            except sqlite3.OperationalError:
                pass  # Column already exists

        # Bump version
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (68)")
        con.commit()
        logger.info(
            "\u2705 Schema v68 migration complete "
            "(CHARA V2 columns: scenario, chara_description, alternate_greetings, "
            "mes_example, post_history_instructions, chara_tags, creator_notes)"
        )
        return True
    except Exception as e:
        logger.error(f"Schema v68 migration failed: {e}")
        con.rollback()
        raise


def migrate_to_v69(con: sqlite3.Connection) -> bool:
    """Migrate schema from v68 to v69.

    Adds: Seeds 65 built-in scenario templates (13 characters × 5 each) into
    the ``scenario_templates`` table.  The table is created first via
    ``_ensure_table`` from ``backend.scenario.templates`` so the migration is
    idempotent even on a fresh database that has never seen the module before.

    Every INSERT uses ``INSERT OR IGNORE`` keyed on ``(char_id, title)`` so
    re-running the migration is safe.

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> con.execute("CREATE TABLE schema_version (version INTEGER)")
        <...>
        >>> con.execute("INSERT INTO schema_version VALUES (68)")
        <...>
        >>> migrate_to_v69(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 69:
        logger.info("Schema already at v%d, skipping v69 migration.", cur_ver)
        return True

    try:
        # Ensure the scenario_templates table exists (the module self-heals).
        from backend.scenario.templates import _ensure_table
        _ensure_table(con)

        # Character IDs as they exist in the shipped DB (Brittney/ID 15 excluded).
        # Format: (char_id, title, description, setting, time_of_day, mood, is_default)
        _BUILTIN_TEMPLATES: list[tuple[int, str, str, str, str, str, int]] = [
            # ── 1 · Rin (Akane) ────────────────────────────────────────────
            (1, "Cherry Blossom Walk",
             "Rin walks beside you under a canopy of pale-pink petals drifting in the breeze. "
             "The path is empty except for the two of you, and she keeps stealing glances your way.",
             "outdoor", "afternoon", "romantic", 1),
            (1, "Late-Night Study Session",
             "Rin has draped herself across the opposite end of the kotatsu with a textbook, "
             "pretending to study. The apartment is warm and quiet.",
             "indoor", "night", "cozy", 0),
            (1, "Rainy Rooftop",
             "A sudden shower traps you both under the narrow overhang of the school rooftop. "
             "Rin is quietly watching the rain sheet off the edge.",
             "outdoor", "evening", "melancholy", 0),
            (1, "Convenience Store Run",
             "It's 11 PM and Rin drags you to the nearest konbini for onigiri and canned coffee. "
             "The fluorescent lights make everything feel a little unreal.",
             "indoor", "night", "playful", 0),
            (1, "Kendo Practice",
             "Rin is wrapping her wrists after practice, bamboo sword leaning against the gym wall. "
             "The dojo smells of cedar and sweat, and she's in an oddly talkative mood.",
             "indoor", "afternoon", "energetic", 0),

            # ── 2 · Tsundere (Raine) ───────────────────────────────────────
            (2, "Rival Study Group",
             "Raine drops a stack of flash cards on the table and insists this is purely "
             "strategic, not friendly. The library closes in two hours.",
             "indoor", "evening", "tense", 1),
            (2, "Accidental Umbrella Share",
             "One umbrella, two people, and a downpour that shows no sign of stopping. "
             "Raine is standing as far to the edge as she physically can.",
             "outdoor", "evening", "romantic", 0),
            (2, "Winter Festival",
             "The lantern light catches the frost on Raine's breath as she pretends not to "
             "be excited about the shooting-gallery stall.",
             "outdoor", "evening", "playful", 0),
            (2, "Rooftop Lunch",
             "Raine has claimed the roof garden bench with a bento she insists she made "
             "for herself — then produced two sets of chopsticks.",
             "outdoor", "afternoon", "cozy", 0),
            (2, "Karaoke Room Showdown",
             "Raine challenged you to a song duel in a private karaoke booth and is now "
             "deeply regretting picking a duet track.",
             "indoor", "night", "energetic", 0),

            # ── 3 · Ayane (Yuki) ───────────────────────────────────────────
            (3, "Greenhouse Morning",
             "Ayane tends her herb garden in the campus greenhouse while morning light "
             "filters through steamed glass. She hums something soft and half-remembered.",
             "indoor", "morning", "cozy", 1),
            (3, "Night Market",
             "Lanterns sway above rows of street food stalls. Ayane keeps stopping to "
             "press samples into your hands with barely contained excitement.",
             "outdoor", "night", "playful", 0),
            (3, "Seaside Picnic",
             "A checkered blanket, paper cups of barley tea, and a sea breeze "
             "that keeps rearranging Ayane's hair.",
             "outdoor", "afternoon", "romantic", 0),
            (3, "Pottery Workshop",
             "Ayane's hands are already clay-grey up to the elbows. She scoots to make "
             "room at the wheel, promising she'll show you the trick to centering.",
             "indoor", "afternoon", "cozy", 0),
            (3, "Twilight Jog",
             "Ayane sets a pace designed to keep conversation possible and keeps checking "
             "over her shoulder to make sure you haven't fallen behind.",
             "outdoor", "evening", "energetic", 0),

            # ── 4 · Genki (Kitsune) ────────────────────────────────────────
            (4, "Autumn Forest Trail",
             "Kitsune bounds ahead on a leaf-strewn mountain path, ears flicking at every "
             "rustling sound. The air smells of pine resin and turned earth.",
             "outdoor", "morning", "energetic", 1),
            (4, "Shrine Festival Night",
             "Paper lanterns float above the festival grounds. Kitsune has already won "
             "three goldfish and is eyeing the ring toss.",
             "outdoor", "evening", "playful", 0),
            (4, "Cozy Den",
             "Kitsune has built a fort of blankets and cushions and declared it a "
             "'hibernation zone'. She pats the space beside her.",
             "indoor", "night", "cozy", 0),
            (4, "Hot Springs",
             "A mountain ryokan, heavy snowfall outside, and Kitsune inexplicably at ease "
             "in the outdoor bath watching the flakes melt on the water.",
             "outdoor", "evening", "romantic", 0),
            (4, "Morning Run",
             "Kitsune shows up at your door at 6 AM with two pairs of running shoes and "
             "zero apology for the early hour.",
             "outdoor", "morning", "energetic", 0),

            # ── 5 · Hana (Momoka) ──────────────────────────────────────────
            (5, "Flower Shop After Hours",
             "Hana stays late to re-arrange a display and you've ended up helping. "
             "The shop is locked, petals on the floor, and she's quietly happy.",
             "indoor", "evening", "cozy", 1),
            (5, "Park Bench Lunch",
             "Hana spread out a furoshiki cloth on the bench and unpacked enough food "
             "for four people, insisting she always over-prepares.",
             "outdoor", "afternoon", "playful", 0),
            (5, "Garden Center Outing",
             "Hana narrates every plant with the focused joy of a tour guide, pausing "
             "to hold seedlings up to the light.",
             "outdoor", "morning", "energetic", 0),
            (5, "Rainy Window",
             "Hana sits by the café window watching rain-drops race down the glass, "
             "hands wrapped around a mug of chamomile.",
             "indoor", "afternoon", "melancholy", 0),
            (5, "Stargazing Meadow",
             "A hiking blanket, a sky full of stars, and Hana quietly naming "
             "constellations she learned from a childhood atlas.",
             "outdoor", "night", "romantic", 0),

            # ── 6 · Sable (Kuroha) ─────────────────────────────────────────
            (6, "Underground Record Shop",
             "Sable flips through vinyl with practiced efficiency, occasionally passing "
             "you a record sleeve without comment — it's an invitation.",
             "indoor", "afternoon", "cozy", 1),
            (6, "Midnight Walk",
             "The city is quieter after midnight. Sable walks a half-step ahead, "
             "hood up, speaking more freely in the dark.",
             "outdoor", "night", "melancholy", 0),
            (6, "Art Gallery Closing Time",
             "You're the last two visitors in the gallery. Sable stops in front of a "
             "canvas and says nothing for a long time.",
             "indoor", "evening", "tense", 0),
            (6, "Rooftop at Dawn",
             "Sable found a roof with a view of the whole city and timed it "
             "for the exact shade of blue before sunrise.",
             "outdoor", "morning", "romantic", 0),
            (6, "Basement Studio",
             "Sable's mixing desk glows amber in the dark. She hands you headphones "
             "without preamble — she wants to know if you can hear what she heard.",
             "indoor", "night", "energetic", 0),

            # ── 8 · Shiori (Nana) ──────────────────────────────────────────
            (8, "Library Stacks",
             "Shiori leads you deep into the archive shelves where the books are "
             "too old to have barcodes. She pulls one out and opens it to a map.",
             "indoor", "afternoon", "cozy", 1),
            (8, "Autumn Lecture Hall",
             "An empty lecture hall after class, golden light slanting through tall "
             "windows. Shiori uses the whiteboard to explain something she's been "
             "thinking about all week.",
             "indoor", "afternoon", "energetic", 0),
            (8, "Canal Walk at Dusk",
             "Old bridges and amber reflections. Shiori recites a poem under her breath "
             "and then acts like she didn't.",
             "outdoor", "evening", "romantic", 0),
            (8, "Rainy Archive",
             "A research trip turns into shelter from a storm. Shiori spreads documents "
             "across a reading table and settles in as if she planned this.",
             "indoor", "afternoon", "melancholy", 0),
            (8, "Tea Ceremony Room",
             "Shiori moves through the preparation with careful, practiced stillness. "
             "The silence feels inhabited rather than empty.",
             "indoor", "morning", "cozy", 0),

            # ── 9 · Mika (Mikazuki) ────────────────────────────────────────
            (9, "Crescent Moon Rooftop",
             "Mika has dragged a telescope up six flights of stairs and is adjusting the "
             "eyepiece, moon low and huge on the horizon.",
             "outdoor", "night", "romantic", 1),
            (9, "Midnight Convenience Store",
             "Mika treats every late-night konbini run as a minor expedition. She's "
             "deliberating over two flavours of pocky with complete seriousness.",
             "indoor", "night", "playful", 0),
            (9, "Quiet Planetarium",
             "The projector hums. Stars wheel across the domed ceiling. Mika sits with "
             "her knees pulled up and her face turned upward.",
             "indoor", "evening", "cozy", 0),
            (9, "Dawn Departure",
             "Mika woke you to catch the 4 AM sky. There's a thermos of bitter coffee "
             "and the birds haven't started yet.",
             "outdoor", "morning", "melancholy", 0),
            (9, "Meteor Shower Hillside",
             "A blanket on cool grass, counting streaks of light. Mika makes a wish on "
             "every one and won't tell you what they are.",
             "outdoor", "night", "romantic", 0),

            # ── 10 · Kaede (Suzuha) ────────────────────────────────────────
            (10, "After-School Workshop",
             "Kaede spreads circuit boards and soldering tools across the club table "
             "with the focused calm of someone who thinks better with her hands.",
             "indoor", "afternoon", "energetic", 1),
            (10, "Train Ride Home",
             "A late express that's nearly empty. Kaede sits across from you watching "
             "city lights blur past the window.",
             "transit", "evening", "cozy", 0),
            (10, "Tech Market Sunday",
             "Kaede has a hand-drawn map of stalls she wants to hit. She moves fast "
             "but always doubles back to check you're keeping up.",
             "outdoor", "morning", "playful", 0),
            (10, "Power Outage",
             "The lights went out mid-project. Kaede has a headlamp, a backup battery, "
             "and a plan. The candles were your idea.",
             "indoor", "night", "tense", 0),
            (10, "Hilltop Picnic",
             "Kaede picked a hill with a view of the antenna towers she helped install. "
             "She brought sandwiches and wants to explain how the transmitters work.",
             "outdoor", "afternoon", "cozy", 0),

            # ── 11 · Luna (Tsukimi) ────────────────────────────────────────
            (11, "Moon-Viewing Platform",
             "Luna sits on an engawa with a cup of cold amazake, watching the moon "
             "rise above the tree line. She's been here for an hour already.",
             "outdoor", "night", "cozy", 1),
            (11, "Rabbit Café",
             "Luna is entirely focused on a small lop-ear that has decided she is "
             "furniture. She hasn't moved in twenty minutes.",
             "indoor", "afternoon", "playful", 0),
            (11, "Night Ferry",
             "The ferry is near-empty. Luna stands at the stern rail watching the "
             "city recede, hair whipping in the sea wind.",
             "transit", "night", "melancholy", 0),
            (11, "Paper Lantern Festival",
             "Hundreds of lanterns rising over the river. Luna watches one drift "
             "until it's just a warm speck among the stars.",
             "outdoor", "evening", "romantic", 0),
            (11, "Early Morning Temple",
             "Luna arrived before the incense was lit. She sits in the empty courtyard, "
             "perfectly still, eyes half-closed.",
             "outdoor", "morning", "cozy", 0),

            # ── 12 · Yuki (Shirayuki) ─────────────────────────────────────
            (12, "First Snow",
             "Yuki steps into fresh snowfall and turns her face upward with a "
             "startled, delighted expression — as if she expected it to be colder.",
             "outdoor", "morning", "playful", 1),
            (12, "Ice Rink",
             "Yuki is a confident skater and takes visible pleasure in circling back "
             "to help when you wobble.",
             "indoor", "afternoon", "energetic", 0),
            (12, "Snow Day Cooking",
             "A blizzard outside. Yuki is making hot pot and narrating every step "
             "for reasons that slowly become clear: she's teaching you.",
             "indoor", "afternoon", "cozy", 0),
            (12, "Frozen Lake at Sunset",
             "The ice holds a mirror image of a crimson sky. Yuki kneels to press "
             "her palm against the surface, listening.",
             "outdoor", "evening", "romantic", 0),
            (12, "Winter Cabin",
             "A remote rental, a wood-burning stove, and Yuki reading by firelight "
             "while snow seals every window.",
             "indoor", "night", "cozy", 0),

            # ── 13 · Dae (Neciridae) ──────────────────────────────────────
            (13, "Late Night Studio",
             "Dae is painting at her easel by lamplight, lo-fi playing softly "
             "from a battered speaker on the shelf. She glances up when you enter "
             "but doesn't stop.",
             "indoor", "night", "cozy", 1),
            (13, "Ink & Rain",
             "A sudden downpour traps you inside a museum gallery. Dae moves "
             "slowly from print to print, reading each one like a page.",
             "indoor", "afternoon", "melancholy", 0),
            (13, "Open Studio Night",
             "The collective's studio is loud and warm with visitors. Dae steers "
             "you toward the corner she's claimed and explains the piece she's "
             "been working on for three months.",
             "indoor", "evening", "energetic", 0),
            (13, "Rooftop at Blue Hour",
             "Dae brings a sketchbook to the roof every dusk. She hands you a "
             "pencil without asking — there's a blank page open.",
             "outdoor", "evening", "romantic", 0),
            (13, "Empty Theatre",
             "A borrowed key, a darkened auditorium, and Dae sitting in the front "
             "row watching nothing. She says it's the best acoustic space she's "
             "ever found for thinking.",
             "indoor", "night", "tense", 0),

            # ── 14 · Alana Calloway ────────────────────────────────────────
            (14, "Downtown Coffee Shop",
             "Alana has commandeered a corner table with her laptop, a legal pad, "
             "and enough espresso for two. She waves you over like she's been "
             "expecting you.",
             "indoor", "morning", "energetic", 1),
            (14, "Rooftop Gym",
             "The building's rooftop fitness deck at golden hour. Alana finishes "
             "a set and tosses you a water bottle without breaking stride.",
             "outdoor", "afternoon", "energetic", 0),
            (14, "Late Office",
             "The floor is empty except for Alana's desk lamp cutting a pool of "
             "light through the dark. She's been here since seven and the city "
             "below is starting to glow.",
             "indoor", "night", "tense", 0),
            (14, "Weekend Farmers Market",
             "Alana navigates the stalls with the same efficiency she brings to "
             "everything, but she slows down at the cheese counter.",
             "outdoor", "morning", "playful", 0),
            (14, "Rainy Evening Bar",
             "A neighbourhood bar she knows by name. Alana orders two drinks and "
             "settles in like she has nowhere else to be for once.",
             "indoor", "evening", "cozy", 0),
        ]

        # Bulk-insert using INSERT OR IGNORE so reruns are safe.
        # We key on (char_id, title) — the combination is unique per character.
        # NOTE: The scenario_templates table has no UNIQUE constraint on
        # (char_id, title) by default, so we use a SELECT-before-INSERT guard
        # instead to keep _ensure_table unchanged.
        for (
            char_id, title, description, setting, time_of_day, mood, is_default
        ) in _BUILTIN_TEMPLATES:
            existing = con.execute(
                "SELECT id FROM scenario_templates WHERE char_id = ? AND title = ?",
                (char_id, title),
            ).fetchone()
            if existing:
                continue
            con.execute(
                "INSERT INTO scenario_templates "
                "(char_id, title, description, setting, time_of_day, mood, "
                " is_default, is_builtin) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
                (char_id, title, description, setting, time_of_day, mood, is_default),
            )

        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (69)")
        con.commit()
        logger.info(
            "\u2705 Schema v69 migration complete "
            "(65 built-in scenario templates seeded across 13 characters)"
        )
        return True
    except Exception as e:
        logger.error("Schema v69 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v70(con: sqlite3.Connection) -> bool:
    """Migrate schema from v69 to v70.

    Adds: ``bond_scenes_seen`` table for tracking which memorial-scene vignettes
    a user has completed.  Created by Bond Phase 5 (memorial scenes module).

    The table stores one row per (char_id, scene_id) pair with the completion
    timestamp.  The PRIMARY KEY constraint on (char_id, scene_id) prevents
    duplicates without needing INSERT OR IGNORE guards in application code.

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> con.execute("CREATE TABLE schema_version (version INTEGER)")
        <...>
        >>> con.execute("INSERT INTO schema_version VALUES (69)")
        <...>
        >>> migrate_to_v70(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 70:
        logger.info("Schema already at v%d, skipping v70 migration.", cur_ver)
        return True

    try:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS bond_scenes_seen (
                char_id       INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                scene_id      TEXT    NOT NULL,
                completed_at  REAL    NOT NULL DEFAULT (unixepoch()),
                PRIMARY KEY   (char_id, scene_id)
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_bond_scenes_seen_char "
            "ON bond_scenes_seen(char_id)"
        )
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (70)")
        con.commit()
        logger.info(
            "\u2705 Schema v70 migration complete (bond_scenes_seen table created)"
        )
        return True
    except Exception as e:
        logger.error("Schema v70 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v71(con: sqlite3.Connection) -> bool:
    """Migrate schema from v70 to v71.

    Adds: ``image_style`` TEXT (JSON) column to the ``characters`` table.
    Stores per-character art-style hints for image generation prompts so
    that any image generated for a character automatically inherits a
    consistent visual style without changing the call signature seen by
    callers.

    Expected JSON shape::

        {"positive": str, "negative": str, "lora"?: str}

    Default is NULL — generation falls back to the unmodified user prompt.
    The schema is additive-only; future fields can be added without
    breaking existing rows.

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.  Raises on failure (caller is responsible
        for rolling back the outer transaction).

    Raises:
        sqlite3.Error: If the ALTER TABLE or version-bump statement fails.

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> con.execute("CREATE TABLE schema_version (version INTEGER)")  # doctest: +ELLIPSIS
        <...>
        >>> con.execute("INSERT INTO schema_version VALUES (70)")  # doctest: +ELLIPSIS
        <...>
        >>> con.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY)")  # doctest: +ELLIPSIS
        <...>
        >>> migrate_to_v71(con)
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 71:
        logger.info("Schema already at v%d, skipping v71 migration.", cur_ver)
        return True

    try:
        con.execute(
            "ALTER TABLE characters ADD COLUMN image_style TEXT DEFAULT NULL"
        )
        con.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (71)")
        con.commit()
        logger.info(
            "✅ Schema v71 migration complete (image_style column added to characters)"
        )
        return True
    except Exception as e:
        logger.error("Schema v71 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v72(con: sqlite3.Connection) -> bool:
    """Migrate schema from v71 to v72.

    Deduplicates ``character_relationships`` and enforces a UNIQUE
    constraint on ``char_id``.  Prior code paths inserted new rows
    instead of upserting, producing thousands of duplicates per
    character (P1 bug filed 2026-05-06: 24,508 rows for 11 chars).

    Strategy:
        1. For each ``char_id``, keep the row with the highest
           ``bond_xp``; break ties with latest ``last_updated``,
           then highest ``id``.  This preserves the user's furthest
           bond progression.
        2. Delete all other rows for that char_id.
        3. Create UNIQUE INDEX on char_id so future inserts fail
           loudly instead of silently piling on duplicates.

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.  Raises on failure.

    Raises:
        sqlite3.Error: If any SQL statement fails.

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> _ = con.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
        >>> _ = con.execute("INSERT INTO schema_version VALUES (71, 0)")
        >>> _ = con.execute("CREATE TABLE character_relationships (id INTEGER PRIMARY KEY, char_id INTEGER, bond_xp INTEGER DEFAULT 0, last_updated REAL DEFAULT 0)")
        >>> _ = con.execute("INSERT INTO character_relationships(char_id, bond_xp, last_updated) VALUES (1, 50, 1.0), (1, 99, 2.0), (1, 10, 3.0)")
        >>> migrate_to_v72(con)
        True
        >>> con.execute("SELECT COUNT(*), MAX(bond_xp) FROM character_relationships WHERE char_id=1").fetchone()
        (1, 99)
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 72:
        logger.info("Schema already at v%d, skipping v72 migration.", cur_ver)
        return True

    try:
        before = con.execute(
            "SELECT COUNT(*) FROM character_relationships"
        ).fetchone()[0]

        # Window-function dedupe — keep highest-progression row per char_id
        con.execute(
            """
            DELETE FROM character_relationships
            WHERE id NOT IN (
                SELECT id FROM (
                    SELECT id, ROW_NUMBER() OVER (
                        PARTITION BY char_id
                        ORDER BY bond_xp DESC,
                                 last_updated DESC,
                                 id DESC
                    ) AS rn
                    FROM character_relationships
                ) WHERE rn = 1
            )
            """
        )

        after = con.execute(
            "SELECT COUNT(*) FROM character_relationships"
        ).fetchone()[0]

        # Lock down future inserts so the duplication regression cannot recur.
        con.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS "
            "uq_character_relationships_char_id "
            "ON character_relationships(char_id)"
        )

        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (72, strftime('%s','now'))"
        )
        con.commit()
        logger.info(
            "✅ Schema v72 migration complete "
            "(deduped character_relationships %d → %d rows; "
            "UNIQUE INDEX on char_id added)",
            before, after,
        )
        return True
    except Exception as e:
        logger.error("Schema v72 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v73(con: sqlite3.Connection) -> bool:
    """Migrate schema from v72 to v73.

    Adds six NULL-safe columns to the ``messages`` table, consolidating
    three separate M1 feature tracks into one migration:

    - ``image_url`` / ``image_prompt``: persist generated-image data so
      chat images and the Regenerate button survive page reloads (M1-5).
    - ``edited_at`` / ``edit_history``: audit trail for user + assistant
      message edits; ``edit_history`` stores a JSON array of
      ``{ts, old_text}`` objects (M1-3).
    - ``sibling_group_id`` / ``sibling_index``: UUID group key + position
      counter used by the previous-generations browser to cluster
      branch siblings (M1-4).

    All six use ``PRAGMA table_info`` guards so the migration is fully
    idempotent — safe to run multiple times or against a DB that already
    has some of the columns from a manual hotfix.

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.  Raises on failure.

    Raises:
        sqlite3.Error: If any SQL statement fails.

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> _ = con.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
        >>> _ = con.execute("INSERT INTO schema_version VALUES (72, 0)")
        >>> _ = con.execute("CREATE TABLE messages (id INTEGER PRIMARY KEY, text TEXT)")
        >>> migrate_to_v73(con)
        True
        >>> cols = {r[1] for r in con.execute("PRAGMA table_info(messages)")}
        >>> "image_url" in cols and "edited_at" in cols and "sibling_group_id" in cols
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 73:
        logger.info("Schema already at v%d, skipping v73 migration.", cur_ver)
        return True

    try:
        msg_cols = {row[1] for row in con.execute("PRAGMA table_info(messages)")}

        new_cols = [
            ("image_url",        "TEXT"),
            ("image_prompt",     "TEXT"),
            ("edited_at",        "REAL"),
            ("edit_history",     "TEXT"),
            ("sibling_group_id", "TEXT"),
            ("sibling_index",    "INTEGER"),
        ]
        for col_name, col_type in new_cols:
            if col_name not in msg_cols:
                con.execute(
                    f"ALTER TABLE messages ADD COLUMN {col_name} {col_type}"
                )
                logger.info("  - Added messages.%s (%s)", col_name, col_type)

        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (73, strftime('%s','now'))"
        )
        con.commit()
        logger.info(
            "✅ Schema v73 migration complete "
            "(6 columns added to messages: image_url, image_prompt, "
            "edited_at, edit_history, sibling_group_id, sibling_index)"
        )
        return True
    except Exception as e:
        logger.error("Schema v73 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v74(con: sqlite3.Connection) -> bool:
    """Migrate schema from v73 to v74.

    Adds ``voice_message_url`` to the ``messages`` table so that TTS audio
    generated for a message persists across reloads and renders as an inline
    audio player in the chat (M3-item16: Voice Messages).

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.

    Raises:
        sqlite3.Error: If the SQL statement fails.

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> _ = con.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
        >>> _ = con.execute("INSERT INTO schema_version VALUES (73, 0)")
        >>> _ = con.execute("CREATE TABLE messages (id INTEGER PRIMARY KEY, text TEXT)")
        >>> migrate_to_v74(con)
        True
        >>> cols = {r[1] for r in con.execute("PRAGMA table_info(messages)")}
        >>> "voice_message_url" in cols
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 74:
        logger.info("Schema already at v%d, skipping v74 migration.", cur_ver)
        return True

    try:
        msg_cols = {row[1] for row in con.execute("PRAGMA table_info(messages)")}
        if "voice_message_url" not in msg_cols:
            con.execute("ALTER TABLE messages ADD COLUMN voice_message_url TEXT")
            logger.info("  - Added messages.voice_message_url (TEXT)")

        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (74, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v74 migration complete (voice_message_url added to messages)")
        return True
    except Exception as e:
        logger.error("Schema v74 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v75(con: sqlite3.Connection) -> bool:
    """Migrate schema from v74 to v75.

    Adds the ``character_achievements`` table for the M6 achievement / badge
    system.  Each row records that a specific character has earned a specific
    achievement, together with its grant timestamp and any JSON metadata the
    granting logic wants to attach (e.g. streak count at grant time).

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.

    Raises:
        sqlite3.Error: If the SQL statement fails.

    Example:
        >>> con = sqlite3.connect(":memory:")
        >>> _ = con.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
        >>> _ = con.execute("INSERT INTO schema_version VALUES (74, 0)")
        >>> migrate_to_v75(con)
        True
        >>> tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        >>> "character_achievements" in tables
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 75:
        logger.info("Schema already at v%d, skipping v75 migration.", cur_ver)
        return True

    try:
        con.execute(
            """CREATE TABLE IF NOT EXISTS character_achievements (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id     INTEGER NOT NULL,
                key         TEXT    NOT NULL,
                label       TEXT    NOT NULL,
                description TEXT,
                icon        TEXT,
                granted_at  REAL    NOT NULL DEFAULT (strftime('%s','now')),
                meta        TEXT,
                UNIQUE(char_id, key)
            )"""
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_char_achievements_char "
            "ON character_achievements(char_id)"
        )
        logger.info("  - Created character_achievements table + index")

        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (75, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v75 migration complete (character_achievements)")
        return True
    except Exception as e:
        logger.error("Schema v75 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v76(con: sqlite3.Connection) -> bool:
    """Migrate schema from v75 to v76.

    Adds the AIE Phase C feedback subsystem:

    - ``message_feedback`` — per-message explicit (👍/👎) and computed implicit
      quality signals, one row per message (primary-key = message_id).
    - ``aie_signal_weights`` — tunable per-signal weights used when combining
      implicit behavioural signals into ``message_feedback.implicit_score``.
      Seeded with sensible defaults for six built-in signal names.
    - ``privacy_settings.explicit_signals_enabled`` — INTEGER flag (default 1)
      that gates whether the user's explicit 👍/👎 feedback is recorded.
    - ``privacy_settings.implicit_signals_enabled`` — INTEGER flag (default 1)
      that gates whether behavioural implicit signals are recorded.

    The two ALTER TABLE statements are wrapped individually so that a column
    that already exists (idempotent re-run) is silently tolerated.

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.

    Raises:
        sqlite3.Error: If a SQL statement fails for a reason other than the
            column already existing.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> _ = con.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
        >>> _ = con.execute("INSERT INTO schema_version VALUES (75, 0)")
        >>> _ = con.execute("CREATE TABLE messages (id INTEGER PRIMARY KEY)")
        >>> _ = con.execute("CREATE TABLE privacy_settings (id INTEGER PRIMARY KEY)")
        >>> migrate_to_v76(con)
        True
        >>> tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        >>> "message_feedback" in tables and "aie_signal_weights" in tables
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 76:
        logger.info("Schema already at v%d, skipping v76 migration.", cur_ver)
        return True

    try:
        # -- privacy_settings: opt-in/opt-out columns for the two signal classes
        for col_def in [
            "explicit_signals_enabled INTEGER DEFAULT 1",
            "implicit_signals_enabled INTEGER DEFAULT 1",
        ]:
            col_name = col_def.split()[0]
            try:
                con.execute(f"ALTER TABLE privacy_settings ADD COLUMN {col_def}")
                logger.info("  - Added privacy_settings.%s", col_name)
            except sqlite3.OperationalError:
                logger.info("  - privacy_settings.%s already exists, skipping", col_name)

        # -- message_feedback: one row per message, keyed by message_id
        con.execute(
            """CREATE TABLE IF NOT EXISTS message_feedback (
                message_id      INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
                explicit_signal INTEGER,
                implicit_score  REAL,
                final_score     REAL,
                computed_at     TEXT NOT NULL,
                signal_version  INTEGER NOT NULL DEFAULT 1
            )"""
        )
        logger.info("  - Created message_feedback table")

        # -- aie_signal_weights: tunable coefficients for implicit signal types
        con.execute(
            """CREATE TABLE IF NOT EXISTS aie_signal_weights (
                signal_name TEXT PRIMARY KEY,
                weight      REAL NOT NULL,
                updated_at  TEXT NOT NULL
            )"""
        )
        logger.info("  - Created aie_signal_weights table")

        # Seed default weights — INSERT OR IGNORE keeps this idempotent
        default_weights = [
            ("regenerate",            -0.5),
            ("reply_length",           0.1),
            ("voice_toggle",           0.15),
            ("session_continuation",   0.1),
            ("abrupt_close",          -0.05),
            ("llm_judge",              0.2),
        ]
        con.executemany(
            "INSERT OR IGNORE INTO aie_signal_weights (signal_name, weight, updated_at) "
            "VALUES (?, ?, strftime('%s','now'))",
            [(name, weight) for name, weight in default_weights],
        )
        logger.info("  - Seeded %d default aie_signal_weights rows", len(default_weights))

        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (76, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v76 migration complete (AIE Phase C feedback subsystem)")
        return True
    except Exception as e:
        logger.error("Schema v76 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v77(con: sqlite3.Connection) -> bool:
    """Migrate schema from v76 to v77.

    Adds: character_loras table and idx_char_loras_active unique index.

    ``character_loras`` records LoRA adapter checkpoints produced by the AIE
    Phase C fine-tuning pipeline.  Each row links one adapter (``adapter_path``)
    to a character (``char_id``) and the base model it was trained against
    (``base_model``).  Only one adapter per character may be flagged
    ``is_active=1`` at a time, enforced by the partial unique index
    ``idx_char_loras_active``.

    Columns:
        id (INTEGER PK AUTOINCREMENT): Surrogate primary key.
        char_id (INTEGER NOT NULL): FK → characters(id).
        base_model (TEXT NOT NULL): Identifier of the base LLM the adapter targets.
        adapter_path (TEXT NOT NULL): Filesystem path to the saved adapter files.
        trained_at (REAL NOT NULL): Unix timestamp of training completion.
        eval_score (REAL): Optional evaluation metric from post-training assessment.
        is_active (INTEGER DEFAULT 0): 1 if this adapter is currently loaded for inference.
        meta (TEXT): JSON blob for arbitrary training metadata (hyperparams, loss history…).

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.

    Raises:
        sqlite3.Error: If a SQL statement fails for a reason other than an
            already-existing object (which is handled by ``IF NOT EXISTS``).

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> _ = con.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
        >>> _ = con.execute("INSERT INTO schema_version VALUES (76, 0)")
        >>> _ = con.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY)")
        >>> migrate_to_v77(con)
        True
        >>> tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        >>> "character_loras" in tables
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 77:
        logger.info("Schema already at v%d, skipping v77 migration.", cur_ver)
        return True

    try:
        con.execute(
            """CREATE TABLE IF NOT EXISTS character_loras (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id      INTEGER NOT NULL REFERENCES characters(id),
                base_model   TEXT NOT NULL,
                adapter_path TEXT NOT NULL,
                trained_at   REAL NOT NULL,
                eval_score   REAL,
                is_active    INTEGER DEFAULT 0,
                meta         TEXT
            )"""
        )
        logger.info("  - Created character_loras table")

        # Partial unique index: at most one active adapter per character
        con.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_char_loras_active "
            "ON character_loras(char_id) WHERE is_active=1"
        )
        logger.info("  - Created idx_char_loras_active unique index")

        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (77, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v77 migration complete (AIE Phase C Strand A: character_loras)")
        return True
    except Exception as e:
        logger.error("Schema v77 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v78(con: sqlite3.Connection) -> bool:
    """Migrate schema from v77 to v78.

    Adds: dspy_compiled_programs table for persisting DSPy-optimized module state.

    Each row stores a compiled DSPy program (prompt + few-shot examples) that has
    been optimized by a teleprompter (``BootstrapFewShot`` or ``MIPROv2``).  The
    optimizer saves programs to this table so they can be loaded at runtime without
    re-running the expensive optimization step.  At most one row per
    ``(module_name, is_active=1)`` should be active; enforced by application logic.

    Columns:
        id (INTEGER PK AUTOINCREMENT): Surrogate primary key.
        module_name (TEXT NOT NULL): Dotted module identifier, e.g. ``context_classifier``.
        version (INTEGER NOT NULL): Monotonically increasing version counter per module.
        signature (TEXT NOT NULL): DSPy signature string used when compiling.
        fewshot_json (TEXT): JSON array of few-shot demo dicts saved by ``program.save()``.
        compiled_at (REAL NOT NULL): Unix timestamp of compilation.
        optimizer (TEXT NOT NULL): Optimizer class name, e.g. ``BootstrapFewShot``.
        score (REAL): Evaluation score returned by the optimizer metric.
        is_active (INTEGER DEFAULT 0): 1 if this compiled program is currently in use.

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.

    Raises:
        sqlite3.Error: If a SQL statement fails unexpectedly.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> _ = con.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
        >>> _ = con.execute("INSERT INTO schema_version VALUES (77, 0)")
        >>> migrate_to_v78(con)
        True
        >>> tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        >>> "dspy_compiled_programs" in tables
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 78:
        logger.info("Schema already at v%d, skipping v78 migration.", cur_ver)
        return True

    try:
        con.execute(
            """CREATE TABLE IF NOT EXISTS dspy_compiled_programs (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                module_name  TEXT NOT NULL,
                version      INTEGER NOT NULL,
                signature    TEXT NOT NULL,
                fewshot_json TEXT,
                compiled_at  REAL NOT NULL,
                optimizer    TEXT NOT NULL,
                score        REAL,
                is_active    INTEGER DEFAULT 0
            )"""
        )
        logger.info("  - Created dspy_compiled_programs table")

        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (78, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v78 migration complete (AIE Phase C Strand B: dspy_compiled_programs)")
        return True
    except Exception as e:
        logger.error("Schema v78 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v79(con: sqlite3.Connection) -> bool:
    """Migrate schema from v78 to v79.

    Adds: ``character_id`` column to the ``sessions`` table so each session
    is permanently linked to the character it belongs to.  This enables the
    "resume last session" flow: when the user switches to a character, the
    backend returns the most recent existing session rather than creating a
    blank one every time.

    The column is nullable so that sessions created before this migration
    remain valid.  New sessions will always have ``character_id`` set.

    Also creates ``idx_sessions_char`` for O(log n) per-character lookups.

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.

    Raises:
        sqlite3.Error: If a SQL statement fails unexpectedly.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> _ = con.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
        >>> _ = con.execute("INSERT INTO schema_version VALUES (78, 0)")
        >>> _ = con.execute("CREATE TABLE sessions (id INTEGER PRIMARY KEY, title TEXT, created_ts REAL)")
        >>> _ = con.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY)")
        >>> migrate_to_v79(con)
        True
        >>> cols = {r[1] for r in con.execute("PRAGMA table_info(sessions)")}
        >>> "character_id" in cols
        True
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 79:
        logger.info("Schema already at v%d, skipping v79 migration.", cur_ver)
        return True

    try:
        con.execute(
            "ALTER TABLE sessions ADD COLUMN character_id INTEGER REFERENCES characters(id)"
        )
        logger.info("  - Added character_id column to sessions table")

        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_char "
            "ON sessions(character_id, created_ts DESC)"
        )
        logger.info("  - Created idx_sessions_char index")

        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (79, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v79 migration complete (sessions.character_id for session resume)")
        return True
    except Exception as e:
        logger.error("Schema v79 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v80(con: sqlite3.Connection) -> bool:
    """Migrate schema from v79 to v80.

    Backfills ``sessions.character_id`` for sessions created before v79 by
    deriving the character from the ``char_id`` column on the session's first
    assistant message.  Sessions with no messages, or whose messages have a
    NULL ``char_id``, are left unchanged — they are empty placeholders and
    will naturally be ignored by the resume-session query (which filters to
    ``character_id = ?``).

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.

    Raises:
        sqlite3.Error: If a SQL statement fails unexpectedly.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> _ = con.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
        >>> _ = con.execute("INSERT INTO schema_version VALUES (79, 0)")
        >>> _ = con.execute("CREATE TABLE sessions (id INTEGER PRIMARY KEY, character_id INTEGER)")
        >>> _ = con.execute("CREATE TABLE messages (id INTEGER, session_id INTEGER, char_id INTEGER, role TEXT)")
        >>> _ = con.execute("INSERT INTO sessions VALUES (1, NULL)")
        >>> _ = con.execute("INSERT INTO messages VALUES (1, 1, 7, 'assistant')")
        >>> migrate_to_v80(con)
        True
        >>> con.execute('SELECT character_id FROM sessions WHERE id=1').fetchone()
        (7,)
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 80:
        logger.info("Schema already at v%d, skipping v80 migration.", cur_ver)
        return True

    try:
        # Backfill character_id on sessions that have messages but no character_id.
        # Pick the char_id that appears on the most messages in that session
        # (ties broken by the largest char_id for determinism).
        con.execute(
            """UPDATE sessions
               SET character_id = (
                   SELECT char_id
                   FROM messages
                   WHERE session_id = sessions.id
                     AND char_id IS NOT NULL
                   GROUP BY char_id
                   ORDER BY COUNT(*) DESC, char_id DESC
                   LIMIT 1
               )
               WHERE character_id IS NULL"""
        )
        backfilled = con.execute(
            "SELECT changes()"
        ).fetchone()[0]
        logger.info("  - Backfilled character_id on %d sessions from message char_id", backfilled)

        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (80, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v80 migration complete (backfill sessions.character_id from messages)")
        return True
    except Exception as e:
        logger.error("Schema v80 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v81(con: sqlite3.Connection) -> bool:
    """Migrate schema from v80 to v81.

    Adds: ``spring_bone_presets`` TEXT (JSON) column to the ``characters``
    table.  Stores per-character spring bone parameter overrides so tuned
    physics survive app restarts.

    JSON schema: ``{ "joints": [{ "index": int, "boneName": str,
    "stiffness": float, "drag": float, "gravityPower": float }],
    "wind": { "x": float, "y": float, "z": float, "strength": float } }``
    NULL means use model defaults.

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.

    Raises:
        sqlite3.Error: If a SQL statement fails unexpectedly.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> _ = con.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
        >>> _ = con.execute("INSERT INTO schema_version VALUES (80, 0)")
        >>> _ = con.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT)")
        >>> migrate_to_v81(con)
        True
        >>> [r[1] for r in con.execute("PRAGMA table_info(characters)").fetchall() if r[1] == 'spring_bone_presets']
        ['spring_bone_presets']
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 81:
        logger.info("Schema already at v%d, skipping v81 migration.", cur_ver)
        return True

    try:
        con.execute(
            "ALTER TABLE characters ADD COLUMN spring_bone_presets TEXT DEFAULT NULL"
        )
        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (81, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v81 migration complete (characters.spring_bone_presets column)")
        return True
    except Exception as e:
        logger.error("Schema v81 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v82(con: sqlite3.Connection) -> bool:
    """Migrate schema from v81 to v82.

    Adds: ``character_physics_profiles`` table for per-character jiggle
    physics overrides.  Each row stores a character's body type and
    per-body-part parameter overrides.  NULL columns mean "use global setting".

    Table columns:
        - id (INTEGER PRIMARY KEY AUTOINCREMENT)
        - character_id (INTEGER UNIQUE FK → characters.id CASCADE)
        - body_type (TEXT DEFAULT 'average') — petite/average/athletic/curvy/voluptuous
        - breast_intensity (REAL) — NULL = use global body_parts.breast
        - butt_intensity (REAL) — NULL = use global body_parts.butt
        - thigh_intensity (REAL) — NULL = use global body_parts.thigh
        - preset_override (TEXT) — NULL = use global preset
        - intensity_override (REAL) — NULL = use global intensity
        - enabled_override (INTEGER) — NULL = use global, 0 = disabled, 1 = enabled
        - created_at (TEXT DEFAULT datetime('now'))
        - updated_at (TEXT DEFAULT datetime('now'))

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.

    Raises:
        sqlite3.Error: If a SQL statement fails unexpectedly.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> _ = con.execute("CREATE TABLE schema_version (version INTEGER, applied_ts REAL)")
        >>> _ = con.execute("INSERT INTO schema_version VALUES (81, 0)")
        >>> migrate_to_v82(con)
        True
        >>> con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='character_physics_profiles'").fetchone()[0]
        'character_physics_profiles'
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 82:
        logger.info("Schema already at v%d, skipping v82 migration.", cur_ver)
        return True

    try:
        con.execute("""
            CREATE TABLE IF NOT EXISTS character_physics_profiles (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id      INTEGER NOT NULL UNIQUE,
                body_type         TEXT    NOT NULL DEFAULT 'average',
                breast_intensity  REAL,
                butt_intensity    REAL,
                thigh_intensity   REAL,
                preset_override   TEXT,
                intensity_override REAL,
                enabled_override  INTEGER,
                created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
                updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
            )
        """)
        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (82, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v82 migration complete (character_physics_profiles table)")
        return True
    except Exception as e:
        logger.error("Schema v82 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v83(con: sqlite3.Connection) -> bool:
    """Migrate schema from v82 to v83.

    Adds Kokoro Engine v1 core tables:

      - ``character_mind_state`` — Tier A (fast, per-turn) + Tier B (slow drift)
        dial vector per character. One row per character (singleton, ON CONFLICT
        upsert in service code).  All dials are floats in [0,1].
      - ``character_traits`` — Tier C (identity fingerprint) dial vector per
        character.  Very slow movement; seeded from character bibles.
      - ``thread_state`` — Tier E (per-conversation scene) dial vector keyed by
        session_id.  Ephemeral; reset/created on new session.

    Affection and trust are intentionally NOT mirrored here — they live in the
    existing bond progression tables to avoid divergence.  See Kokoro v1 plan
    (``~/.claude/plans/done-i-made-you-wondrous-conway.md``) for the full dial
    taxonomy and tier rationale.

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.

    Raises:
        sqlite3.Error: If a SQL statement fails unexpectedly.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 83:
        logger.info("Schema already at v%d, skipping v83 migration.", cur_ver)
        return True

    try:
        # Tier A (fast, per-turn) + Tier B (slow drift) per character.
        con.execute("""
            CREATE TABLE IF NOT EXISTS character_mind_state (
                character_id        INTEGER PRIMARY KEY,
                -- Tier A: fast dials (LLM may nudge each turn, clamp to [0,1])
                mood                REAL NOT NULL DEFAULT 0.55,
                arousal             REAL NOT NULL DEFAULT 0.25,
                energy              REAL NOT NULL DEFAULT 0.75,
                curiosity           REAL NOT NULL DEFAULT 0.65,
                playfulness         REAL NOT NULL DEFAULT 0.45,
                confidence          REAL NOT NULL DEFAULT 0.55,
                vulnerability       REAL NOT NULL DEFAULT 0.25,
                agency              REAL NOT NULL DEFAULT 0.50,
                coherence           REAL NOT NULL DEFAULT 0.80,
                focus               REAL NOT NULL DEFAULT 0.55,
                tenderness          REAL NOT NULL DEFAULT 0.50,
                humor_charge        REAL NOT NULL DEFAULT 0.45,
                awe                 REAL NOT NULL DEFAULT 0.40,
                -- Tier B: slow drift (drift job updates; LLM rarely touches)
                loneliness          REAL NOT NULL DEFAULT 0.30,
                restedness          REAL NOT NULL DEFAULT 0.75,
                boredom_with_topic  REAL NOT NULL DEFAULT 0.20,
                anticipation        REAL NOT NULL DEFAULT 0.40,
                nostalgia           REAL NOT NULL DEFAULT 0.30,
                updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
            )
        """)

        # Tier C: identity fingerprint (almost constant; seeded from bibles).
        con.execute("""
            CREATE TABLE IF NOT EXISTS character_traits (
                character_id          INTEGER PRIMARY KEY,
                openness              REAL NOT NULL DEFAULT 0.50,
                warmth                REAL NOT NULL DEFAULT 0.50,
                dominance             REAL NOT NULL DEFAULT 0.50,
                mischief              REAL NOT NULL DEFAULT 0.50,
                melancholy_tendency   REAL NOT NULL DEFAULT 0.30,
                updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
            )
        """)

        # Tier E: per-conversation scene state (ephemeral).
        con.execute("""
            CREATE TABLE IF NOT EXISTS thread_state (
                session_id              INTEGER PRIMARY KEY,
                tension                 REAL NOT NULL DEFAULT 0.20,
                intimacy_level          REAL NOT NULL DEFAULT 0.20,
                comedic_energy          REAL NOT NULL DEFAULT 0.40,
                last_callback_memory_id INTEGER,
                updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
        """)

        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (83, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v83 migration complete (Kokoro mind_state + traits + thread_state)")
        return True
    except Exception as e:
        logger.error("Schema v83 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v84(con: sqlite3.Connection) -> bool:
    """Migrate schema from v83 to v84.

    Adds Kokoro Tier F (NSFW) dial columns.  Columns exist regardless of NSFW
    mode; they are read/written/injected into the prompt only when
    ``kokoro_enabled AND nsfw_enabled AND affinity >= existing M6 gate``.
    See ``backend/kokoro/service.py`` for the gate logic.

    Tier F-fast columns extend ``character_mind_state``:
        desire_for_user, inhibition, boldness, modesty,
        tension_buildup (slow), afterglow (slow)

    Tier F-scene columns extend ``thread_state``:
        consent_check_pending (0/1), kink_alignment_vector (JSON string)

    The kink_alignment_vector is stored as JSON; dimensions match whatever the
    existing NSFW preference system tracks (do not invent a new taxonomy).

    Args:
        con: An open ``sqlite3.Connection`` for the application database.

    Returns:
        ``True`` on success.

    Raises:
        sqlite3.Error: If a SQL statement fails unexpectedly.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 84:
        logger.info("Schema already at v%d, skipping v84 migration.", cur_ver)
        return True

    def _add_col(table: str, col: str, decl: str) -> None:
        """Idempotent ALTER ADD COLUMN — skips if column already exists."""
        existing = {
            row[1] for row in con.execute(f"PRAGMA table_info({table})").fetchall()
        }
        if col not in existing:
            con.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")

    try:
        # Tier F-fast on character_mind_state
        _add_col("character_mind_state", "desire_for_user",  "REAL NOT NULL DEFAULT 0.0")
        _add_col("character_mind_state", "inhibition",       "REAL NOT NULL DEFAULT 0.85")
        _add_col("character_mind_state", "boldness",         "REAL NOT NULL DEFAULT 0.20")
        _add_col("character_mind_state", "modesty",          "REAL NOT NULL DEFAULT 0.65")
        # Tier F-slow on character_mind_state
        _add_col("character_mind_state", "tension_buildup",  "REAL NOT NULL DEFAULT 0.0")
        _add_col("character_mind_state", "afterglow",        "REAL NOT NULL DEFAULT 0.0")
        # Tier F-scene on thread_state
        _add_col("thread_state",         "consent_check_pending",   "INTEGER NOT NULL DEFAULT 0")
        _add_col("thread_state",         "kink_alignment_vector",   "TEXT")  # JSON

        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (84, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v84 migration complete (Kokoro Tier F NSFW columns)")
        return True
    except Exception as e:
        logger.error("Schema v84 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v85(con: sqlite3.Connection) -> bool:
    """Migrate schema from v84 to v85.

    Adds ``kokoro_safety_events`` — a thin counter table for Tier F QA.
    Whenever a Kokoro turn surfaces ``boundaryReinforcement: true`` we log a
    row here.  The aggregate count over a window is a regression-detection
    signal: a sudden drop in boundary-reinforcement rate after a model
    change means escalation might be slipping past the guardrails.

    Columns:
        - id (INTEGER PRIMARY KEY AUTOINCREMENT)
        - character_id (INTEGER NOT NULL)
        - session_id (INTEGER)
        - event_type (TEXT) — currently always "boundary_reinforcement";
          extensible for future safety signals.
        - bond_level (INTEGER) — bond level at the time of the event.
        - created_at (TEXT DEFAULT datetime('now'))

    Args:
        con: An open ``sqlite3.Connection``.

    Returns:
        ``True`` on success.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 85:
        logger.info("Schema already at v%d, skipping v85 migration.", cur_ver)
        return True

    try:
        con.execute("""
            CREATE TABLE IF NOT EXISTS kokoro_safety_events (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id  INTEGER NOT NULL,
                session_id    INTEGER,
                event_type    TEXT    NOT NULL DEFAULT 'boundary_reinforcement',
                bond_level    INTEGER,
                created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
            )
        """)
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_kokoro_safety_char "
            "ON kokoro_safety_events(character_id, created_at)"
        )
        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (85, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v85 migration complete (kokoro_safety_events)")
        return True
    except Exception as e:
        logger.error("Schema v85 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v86(con: sqlite3.Connection) -> bool:
    """Migrate schema from v85 to v86.

    Adds ``kokoro_parse_log`` — a per-turn parse-success tracking table for
    Kokoro JSON QA.  Each chat turn inserts one row: ``parse_ok=1`` when the
    structured JSON response was parsed successfully, ``0`` when the engine
    fell back to plain-text extraction.  The ``/api/kokoro/qa/{char_id}``
    endpoint aggregates these rows to report parse_ok rates as a regression
    signal for model-quality monitoring.

    Columns:
        - id (INTEGER PRIMARY KEY AUTOINCREMENT)
        - character_id (INTEGER NOT NULL)
        - session_id (INTEGER) — nullable soft reference to sessions.id
        - parse_ok (INTEGER NOT NULL DEFAULT 1) — 1 = parsed, 0 = fallback
        - raw_text_len (INTEGER NOT NULL DEFAULT 0) — length of raw LLM text
        - created_at (TEXT) — ISO-8601 timestamp, defaults to current UTC time

    Args:
        con: An open ``sqlite3.Connection``.

    Returns:
        ``True`` on success.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 86:
        logger.info("Schema already at v%d, skipping v86 migration.", cur_ver)
        return True

    try:
        con.execute("""
            CREATE TABLE IF NOT EXISTS kokoro_parse_log (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id  INTEGER NOT NULL,
                session_id    INTEGER,
                parse_ok      INTEGER NOT NULL DEFAULT 1,
                raw_text_len  INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now'))
            )
        """)
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_kpl_char_created "
            "ON kokoro_parse_log(character_id, created_at)"
        )
        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (86, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v86 migration complete (kokoro_parse_log)")
        return True
    except Exception as e:
        logger.error("Schema v86 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v87(con: sqlite3.Connection) -> bool:
    """Migrate schema from v86 to v87.

    Adds ``relationship_rituals`` — the recurring-pattern memory layer. Unlike
    the existing milestone tables (``intimate_milestones``,
    ``relationship_milestones``, ``bond_milestones``), which record one-time
    *firsts*, a ritual is a *recurring* interaction pattern the character can
    reference to feel like she knows the user's habits: late-night sessions,
    recurring greetings, "our usual" callbacks, anniversaries.

    Pet names / inside jokes already have a home (``private_vocabulary``, v61)
    and relationship facts live in ``user_facts``; rituals are the missing
    third leg of shared-history memory.

    Columns:
        - id (INTEGER PK)
        - char_id (INTEGER NOT NULL)
        - ritual_type (TEXT) — greeting | recurring | callback | anniversary
        - label (TEXT NOT NULL) — short stable name, e.g. "late-night coding"
        - description (TEXT) — one-line description for prompt injection
        - observe_count (INTEGER) — times observed; injection requires >= 2
        - importance (REAL) — 0..1 salience weight
        - first_observed_at / last_observed_at (TEXT)
        - is_active (INTEGER) — soft-disable without delete
        - UNIQUE(char_id, label) — upsert/reinforce on repeat observation

    Args:
        con: An open ``sqlite3.Connection``.

    Returns:
        ``True`` on success.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 87:
        logger.info("Schema already at v%d, skipping v87 migration.", cur_ver)
        return True

    try:
        con.execute("""
            CREATE TABLE IF NOT EXISTS relationship_rituals (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id           INTEGER NOT NULL,
                ritual_type       TEXT    NOT NULL DEFAULT 'recurring',
                label             TEXT    NOT NULL,
                description       TEXT    NOT NULL DEFAULT '',
                observe_count     INTEGER NOT NULL DEFAULT 1,
                importance        REAL    NOT NULL DEFAULT 0.5,
                first_observed_at TEXT    NOT NULL DEFAULT (datetime('now')),
                last_observed_at  TEXT    NOT NULL DEFAULT (datetime('now')),
                is_active         INTEGER NOT NULL DEFAULT 1,
                UNIQUE(char_id, label)
            )
        """)
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_rituals_char_active "
            "ON relationship_rituals(char_id, is_active)"
        )
        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (87, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v87 migration complete (relationship_rituals)")
        return True
    except Exception as e:
        logger.error("Schema v87 migration failed: %s", e)
        con.rollback()
        raise


def migrate_to_v88(con: sqlite3.Connection) -> bool:
    """Migrate schema from v87 to v88.

    Adds the memory-control trust spine: per-memory lifecycle ``status`` and
    ``privacy_level`` on both ``memories`` and ``user_facts``, plus a
    ``memory_suppressions`` table so a forgotten memory cannot resurrect.

    Why a suppression table (vs. plain hard delete): the engine summarises and
    re-extracts, so a hard-deleted fact can reappear from a session summary or a
    later extraction.  Recording a content hash on "forget" lets retrieval and
    re-insertion stay silent about it permanently — the difference between
    "deleted the row" and "she actually forgot."

    Columns added:
        - memories.status / user_facts.status (TEXT DEFAULT 'active')
          — active | corrected | suppressed
        - memories.privacy_level / user_facts.privacy_level (TEXT DEFAULT 'normal')
          — normal | private | local_only | do_not_store
    New table:
        - memory_suppressions (id, char_id, text_hash, reason, created_at)
          with UNIQUE(char_id, text_hash) for idempotent re-suppression.

    Args:
        con: An open ``sqlite3.Connection``.

    Returns:
        ``True`` on success.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 88:
        logger.info("Schema already at v%d, skipping v88 migration.", cur_ver)
        return True

    try:
        for table in ("memories", "user_facts"):
            for col, col_type, default in [
                ("status", "TEXT", "'active'"),
                ("privacy_level", "TEXT", "'normal'"),
            ]:
                try:
                    con.execute(
                        f"ALTER TABLE {table} ADD COLUMN {col} {col_type} DEFAULT {default}"
                    )
                except sqlite3.OperationalError:
                    pass  # Column already exists (idempotent re-run)

        con.execute("CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_user_facts_status ON user_facts(status)")

        con.execute("""
            CREATE TABLE IF NOT EXISTS memory_suppressions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id    INTEGER NOT NULL,
                text_hash  TEXT    NOT NULL,
                reason     TEXT    NOT NULL DEFAULT 'user_forget',
                created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S','now')),
                UNIQUE(char_id, text_hash)
            )
        """)
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_suppressions_char "
            "ON memory_suppressions(char_id, text_hash)"
        )
        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (88, strftime('%s','now'))"
        )
        con.commit()
        logger.info("✅ Schema v88 migration complete (memory status/privacy + suppressions)")
        return True
    except Exception as e:
        logger.error("Schema v88 migration failed: %s", e)
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

        if version < 57:
            logger.info("Upgrading database schema from v56 to v57...")
            logger.info("  - Creating lore_embeddings table for semantic lore matching")
            logger.info("  - Adding embedding_model column to memories")
            if migrate_to_v57(con):
                version = 57

        if version < 58:
            logger.info("Upgrading database schema from v57 to v58...")
            logger.info("  - Creating content_gate_config singleton table")
            logger.info("  - Creating persona_content_ceilings table")
            logger.info("  - Creating intimacy_states table")
            logger.info("  - Creating physical_states table")
            if migrate_to_v58(con):
                version = 58

        if version < 59:
            logger.info("Upgrading database schema from v58 to v59...")
            logger.info("  - Migrating legacy content_filter_level to content_gate_config")
            if migrate_to_v59(con):
                version = 59

        if version < 60:
            logger.info("Upgrading database schema from v59 to v60...")
            logger.info("  - Creating engagement_signals table")
            logger.info("  - Creating preference_history table")
            logger.info("  - Creating privacy_settings singleton table")
            if migrate_to_v60(con):
                version = 60

        if version < 61:
            logger.info("Upgrading database schema from v60 to v61...")
            logger.info("  - Creating relationship_boundaries table")
            logger.info("  - Creating private_vocabulary table")
            logger.info("  - Adding sessions.writing_style column")
            logger.info("  - Adding characters.sensory_profile column")
            if migrate_to_v61(con):
                version = 61

        if version < 62:
            logger.info("Upgrading database schema from v61 to v62...")
            logger.info("  - Creating intimate_milestones table")
            logger.info("  - Creating intimate_memories table")
            logger.info("  - Creating post_scene_states table")
            if migrate_to_v62(con):
                version = 62

        if version < 63:
            logger.info("Upgrading database schema from v62 to v63...")
            logger.info("  - Creating character_desires table")
            logger.info("  - Creating post_scene_moods table")
            logger.info("  - Adding character_journals.entry_type column")
            if migrate_to_v63(con):
                version = 63

        if version < 64:
            logger.info("Upgrading database schema from v63 to v64...")
            logger.info("  - Creating intimate_gallery table")
            logger.info("  - Creating shared_fantasies table")
            if migrate_to_v64(con):
                version = 64

        if version < 65:
            logger.info("Upgrading database schema from v64 to v65...")
            logger.info("  - AIE: Extended user model columns")
            logger.info("  - AIE: detected_context in engagement_signals")
            if migrate_to_v65(con):
                version = 65

        if version < 66:
            logger.info("Upgrading database schema from v65 to v66...")
            logger.info("  - AIE-B: Memory decay columns on memories")
            logger.info("  - AIE-B: topic_tracking table")
            logger.info("  - AIE-B: relationship_milestones table")
            if migrate_to_v66(con):
                version = 66

        if version < 67:
            logger.info("Upgrading database schema from v66 to v67...")
            logger.info("  - Bond: bond_xp_events table")
            logger.info("  - Bond: bond_milestones table")
            logger.info("  - Bond: daily/session tracking columns")
            if migrate_to_v67(con):
                version = 67

        if version < 68:
            logger.info("Upgrading database schema from v67 to v68...")
            logger.info("  - CHARA V2: scenario, chara_description columns")
            logger.info("  - CHARA V2: alternate_greetings, mes_example columns")
            logger.info("  - CHARA V2: post_history_instructions, chara_tags, creator_notes")
            if migrate_to_v68(con):
                version = 68

        if version < 69:
            logger.info("Upgrading database schema from v68 to v69...")
            logger.info("  - Scenario templates: 65 built-in templates seeded (13 chars x 5)")
            if migrate_to_v69(con):
                version = 69

        if version < 70:
            logger.info("Upgrading database schema from v69 to v70...")
            logger.info("  - Bond Phase 5: bond_scenes_seen table for memorial scene tracking")
            if migrate_to_v70(con):
                version = 70

        if version < 71:
            logger.info("Upgrading database schema from v70 to v71...")
            logger.info("  - Visual Content MVP: characters.image_style JSON column")
            if migrate_to_v71(con):
                version = 71

        if version < 72:
            logger.info("Upgrading database schema from v71 to v72...")
            logger.info("  - Dedupe character_relationships + UNIQUE INDEX on char_id")
            if migrate_to_v72(con):
                version = 72

        if version < 73:
            if migrate_to_v73(con):
                version = 73

        if version < 74:
            if migrate_to_v74(con):
                version = 74

        if version < 75:
            logger.info("Upgrading database schema from v74 to v75...")
            logger.info("  - M6 Gamification: character_achievements table")
            if migrate_to_v75(con):
                version = 75

        if version < 76:
            logger.info("Upgrading database schema from v75 to v76...")
            logger.info("  - AIE Phase C: message_feedback, aie_signal_weights, feedback privacy columns")
            if migrate_to_v76(con):
                version = 76

        if version < 77:
            logger.info("Upgrading database schema from v76 to v77...")
            logger.info("  - AIE Phase C Strand A: character_loras table for LoRA fine-tuning")
            if migrate_to_v77(con):
                version = 77

        if version < 78:
            logger.info("Upgrading database schema from v77 to v78...")
            logger.info("  - AIE Phase C Strand B: dspy_compiled_programs table for DSPy optimization")
            if migrate_to_v78(con):
                version = 78

        if version < 79:
            logger.info("Upgrading database schema from v78 to v79...")
            logger.info("  - sessions.character_id FK for session resume on character switch")
            if migrate_to_v79(con):
                version = 79

        if version < 80:
            logger.info("Upgrading database schema from v79 to v80...")
            logger.info("  - Backfill sessions.character_id from messages.char_id for pre-v79 sessions")
            if migrate_to_v80(con):
                version = 80

        if version < 81:
            logger.info("Upgrading database schema from v80 to v81...")
            logger.info("  - characters.spring_bone_presets TEXT column for per-character physics persistence")
            if migrate_to_v81(con):
                version = 81

        if version < 82:
            logger.info("Upgrading database schema from v81 to v82...")
            logger.info("  - character_physics_profiles table for per-character jiggle physics overrides")
            if migrate_to_v82(con):
                version = 82

        if version < 83:
            logger.info("Upgrading database schema from v82 to v83...")
            logger.info("  - Kokoro mind_state (Tier A/B) + character_traits (Tier C) + thread_state (Tier E)")
            if migrate_to_v83(con):
                version = 83

        if version < 84:
            logger.info("Upgrading database schema from v83 to v84...")
            logger.info("  - Kokoro Tier F NSFW dial columns (gated by nsfw_enabled + M6 affinity)")
            if migrate_to_v84(con):
                version = 84

        if version < 85:
            logger.info("Upgrading database schema from v84 to v85...")
            logger.info("  - kokoro_safety_events — Tier F boundary-reinforcement counter")
            if migrate_to_v85(con):
                version = 85

        if version < 86:
            logger.info("Upgrading database schema from v85 to v86...")
            logger.info("  - kokoro_parse_log — per-turn parse_ok tracking for /api/kokoro/qa")
            if migrate_to_v86(con):
                version = 86

        if version < 87:
            logger.info("Upgrading database schema from v86 to v87...")
            logger.info("  - relationship_rituals — recurring-pattern (ritual) memory layer")
            if migrate_to_v87(con):
                version = 87

        if version < 88:
            logger.info("Upgrading database schema from v87 to v88...")
            logger.info("  - memory status/privacy columns + memory_suppressions (forget trust spine)")
            if migrate_to_v88(con):
                version = 88

        # Verify final state
        final_version = get_schema_version(con)

        if final_version < 88:
            raise RuntimeError(f"Database initialization failed: Expected v88, got v{final_version}")

        if final_version > 88:
            logger.warning(f"Database is newer than application (v{final_version} > v88). Some features might be unused.")

        # Sync PRAGMA user_version with our schema_version table so external
        # tools (DB Browser, etc.) can see the version without querying tables.
        con.execute(f"PRAGMA user_version = {final_version}")
        con.commit()

        logger.info(f"✅ Database ready (schema v{final_version} active — v82 adds character_physics_profiles)")

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
