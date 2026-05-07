"""Tests for AIE Phase C LoRA fine-tuning pipeline.

Covers four distinct layers:

1. **CorpusBuilder unit tests** — :func:`build_corpus` with an isolated
   in-memory SQLite DB.  All schema tables are created manually; preflight
   migrations are NOT run so the tests remain self-contained.

2. **Trainer import tests** — verify that :mod:`backend.adaptive.finetune.trainer`
   degrades gracefully on Mac (no CUDA) and that :class:`TrainingConfig` has the
   expected default values.

3. **EvalHarness import tests** — same graceful-degradation contract for
   :mod:`backend.adaptive.finetune.eval_harness`.

4. **PeftLocalAdapter import tests** — :class:`PeftLocalAdapter` raises
   :exc:`ImportError` at instantiation and via :meth:`from_db` when
   ``_PEFT_AVAILABLE`` is ``False``.

5. **Training API endpoint tests** — the three ``/api/training/*`` endpoints.
   These are skipped when the endpoints are not yet wired in ``server.py``.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Minimal DB DDL
# ---------------------------------------------------------------------------

_SCHEMA_DDL = """
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);
INSERT INTO schema_version (version) VALUES (77);

CREATE TABLE IF NOT EXISTS characters (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL,
    system_prompt TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL,
    char_id    INTEGER,
    role       TEXT    NOT NULL,
    text       TEXT
);

CREATE TABLE IF NOT EXISTS message_feedback (
    message_id     INTEGER PRIMARY KEY,
    explicit_signal INTEGER,
    implicit_score  REAL,
    final_score     REAL,
    computed_at     TEXT    DEFAULT (strftime('%s', 'now')),
    signal_version  INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS character_loras (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id      INTEGER NOT NULL,
    base_model   TEXT    NOT NULL DEFAULT 'unsloth/Qwen2.5-7B-Instruct',
    adapter_path TEXT    NOT NULL,
    trained_at   REAL    NOT NULL DEFAULT (unixepoch()),
    eval_score   REAL,
    is_active    INTEGER DEFAULT 0,
    meta         TEXT
);
"""


def _make_db(path: Path) -> Path:
    """Create and seed a minimal test database at *path*.

    Args:
        path: Destination SQLite file path.

    Returns:
        The same *path* for convenience.
    """
    con = sqlite3.connect(str(path))
    try:
        con.executescript(_SCHEMA_DDL)
        con.commit()
    finally:
        con.close()
    return path


def _insert_character(
    db_path: Path,
    name: str = "Sakura",
    system_prompt: str | None = "You are Sakura.",
    char_id: int = 1,
) -> int:
    """Insert a character row and return its id.

    Args:
        db_path: Path to the test SQLite database.
        name: Character display name.
        system_prompt: Optional system prompt text.
        char_id: Primary key to use.

    Returns:
        The character id that was inserted.
    """
    con = sqlite3.connect(str(db_path))
    try:
        con.execute(
            "INSERT OR REPLACE INTO characters (id, name, system_prompt) VALUES (?, ?, ?)",
            (char_id, name, system_prompt),
        )
        con.commit()
    finally:
        con.close()
    return char_id


def _insert_message(
    db_path: Path,
    session_id: str,
    character_id: int,
    role: str,
    content: str,
    msg_id: int | None = None,
) -> int:
    """Insert a message row and return its autoincrement id.

    Args:
        db_path: Path to the test SQLite database.
        session_id: Session identifier string.
        character_id: Foreign key to characters.id (stored as char_id).
        role: 'user' or 'assistant'.
        content: Message body text (stored as text column).
        msg_id: Explicit primary key; ``None`` lets AUTOINCREMENT assign one.

    Returns:
        The rowid of the inserted message.
    """
    con = sqlite3.connect(str(db_path))
    try:
        if msg_id is not None:
            con.execute(
                "INSERT INTO messages (id, session_id, char_id, role, text)"
                " VALUES (?, ?, ?, ?, ?)",
                (msg_id, session_id, character_id, role, content),
            )
        else:
            con.execute(
                "INSERT INTO messages (session_id, char_id, role, text)"
                " VALUES (?, ?, ?, ?)",
                (session_id, character_id, role, content),
            )
        con.commit()
        return con.execute("SELECT last_insert_rowid()").fetchone()[0]
    finally:
        con.close()


def _insert_feedback(
    db_path: Path,
    message_id: int,
    final_score: float,
) -> None:
    """Insert a message_feedback row for quality-filter tests.

    Args:
        db_path: Path to the test SQLite database.
        message_id: FK to messages.id.
        final_score: The quality score to store.
    """
    con = sqlite3.connect(str(db_path))
    try:
        con.execute(
            "INSERT OR REPLACE INTO message_feedback (message_id, final_score)"
            " VALUES (?, ?)",
            (message_id, final_score),
        )
        con.commit()
    finally:
        con.close()


def _insert_session(db_path: Path, session_id: str) -> None:
    """Insert a sessions row so FK constraints pass.

    Args:
        db_path: Path to the test SQLite database.
        session_id: Session identifier to insert.
    """
    con = sqlite3.connect(str(db_path))
    try:
        con.execute(
            "INSERT OR IGNORE INTO sessions (id) VALUES (?)",
            (session_id,),
        )
        con.commit()
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Shared imports
# ---------------------------------------------------------------------------

from backend.adaptive.finetune.corpus_builder import (  # noqa: E402
    CorpusConfig,
    CorpusStats,
    build_corpus,
)


# ===========================================================================
# SECTION 1: CorpusBuilder tests
# ===========================================================================


class TestCorpusConfigDefaults:
    """Tests for :class:`CorpusConfig` default field values."""

    def test_corpus_config_defaults(self) -> None:
        """CorpusConfig constructed with required fields only uses correct defaults.

        Verifies:
            - ``min_final_score`` defaults to ``0.0``
            - ``min_assistant_length`` defaults to ``20``
            - ``max_session_messages`` defaults to ``100``
            - ``system_prompt_override`` defaults to ``None``
        """
        cfg = CorpusConfig(
            char_name="TestChar",
            db_path=Path("/tmp/fake.db"),
            output_path=Path("/tmp/out.jsonl"),
        )
        assert cfg.min_final_score == 0.0
        assert cfg.min_assistant_length == 20
        assert cfg.max_session_messages == 100
        assert cfg.system_prompt_override is None


class TestCorpusStatsFields:
    """Tests for :class:`CorpusStats` field initialization."""

    def test_corpus_stats_fields(self, tmp_path: Path) -> None:
        """After build_corpus, CorpusStats has all expected fields populated.

        Creates a character with one valid user+assistant exchange and checks
        that CorpusStats is fully populated with non-negative integer counts.
        """
        db = _make_db(tmp_path / "test.db")
        _insert_character(db, "Rosie", "I am Rosie.")
        _insert_session(db, "s1")
        _insert_message(db, "s1", 1, "user", "Hello Rosie!")
        _insert_message(db, "s1", 1, "assistant", "Hello! I am so glad you are here today.")

        out = tmp_path / "out.jsonl"
        cfg = CorpusConfig(char_name="Rosie", db_path=db, output_path=out)
        stats = build_corpus(cfg)

        assert isinstance(stats, CorpusStats)
        assert hasattr(stats, "total_sessions")
        assert hasattr(stats, "total_messages")
        assert hasattr(stats, "included_messages")
        assert hasattr(stats, "excluded_low_score")
        assert hasattr(stats, "excluded_too_short")
        assert hasattr(stats, "output_path")

        # Sanity — all counts are non-negative.
        assert stats.total_sessions >= 0
        assert stats.total_messages >= 0
        assert stats.included_messages >= 0
        assert stats.excluded_low_score >= 0
        assert stats.excluded_too_short >= 0


class TestBuildCorpusUnknownCharacter:
    """Tests for ValueError when the character is missing."""

    def test_build_corpus_unknown_character_raises(self, tmp_path: Path) -> None:
        """build_corpus raises ValueError for a char_name not in the DB.

        The characters table exists but contains no row named 'Ghost'.
        ValueError message should mention the character name.
        """
        db = _make_db(tmp_path / "test.db")
        out = tmp_path / "out.jsonl"
        cfg = CorpusConfig(char_name="Ghost", db_path=db, output_path=out)

        with pytest.raises(ValueError, match="Ghost"):
            build_corpus(cfg)


class TestBuildCorpusEmptyDB:
    """Tests for empty corpus when a character exists but has no messages."""

    def test_build_corpus_empty_db_returns_zero_messages(self, tmp_path: Path) -> None:
        """Character exists but no messages → stats.included_messages == 0 and empty file.

        The output JSONL file must be created (no FileNotFoundError) but
        must contain zero lines.
        """
        db = _make_db(tmp_path / "test.db")
        _insert_character(db)  # name='Sakura', no messages
        out = tmp_path / "out.jsonl"
        cfg = CorpusConfig(char_name="Sakura", db_path=db, output_path=out)

        stats = build_corpus(cfg)

        assert stats.included_messages == 0
        assert out.exists()
        lines = [ln for ln in out.read_text(encoding="utf-8").splitlines() if ln.strip()]
        assert len(lines) == 0


class TestBuildCorpusBasicConversation:
    """Tests for the happy-path one-session conversation."""

    def test_build_corpus_basic_conversation(self, tmp_path: Path) -> None:
        """One session with user + assistant messages → stats.included_messages == 1.

        Each session with at least one valid (user, assistant) exchange produces
        one JSONL line containing a ShareGPT conversations list.
        """
        db = _make_db(tmp_path / "test.db")
        _insert_character(db, "Sakura", None)  # No system prompt for simplicity
        _insert_session(db, "s1")
        _insert_message(db, "s1", 1, "user", "Hi Sakura!")
        _insert_message(db, "s1", 1, "assistant", "Hello! It's wonderful to see you today!")

        out = tmp_path / "out.jsonl"
        cfg = CorpusConfig(char_name="Sakura", db_path=db, output_path=out)
        stats = build_corpus(cfg)

        assert stats.included_messages == 1

        lines = [ln for ln in out.read_text(encoding="utf-8").splitlines() if ln.strip()]
        assert len(lines) == 1

        obj = json.loads(lines[0])
        assert "conversations" in obj
        assert isinstance(obj["conversations"], list)
        # Must have at least a human and gpt turn.
        roles = [t["from"] for t in obj["conversations"]]
        assert "human" in roles
        assert "gpt" in roles


class TestBuildCorpusFiltersShortMessages:
    """Tests for min_assistant_length filter."""

    def test_build_corpus_filters_short_assistant_messages(self, tmp_path: Path) -> None:
        """Assistant reply shorter than min_assistant_length is excluded.

        'Ok!' is 3 characters — shorter than the default 20 — so it should be
        counted in excluded_too_short and NOT appear in included_messages.
        """
        db = _make_db(tmp_path / "test.db")
        _insert_character(db)
        _insert_session(db, "s1")
        _insert_message(db, "s1", 1, "user", "What do you think?")
        _insert_message(db, "s1", 1, "assistant", "Ok!")

        out = tmp_path / "out.jsonl"
        cfg = CorpusConfig(char_name="Sakura", db_path=db, output_path=out)
        stats = build_corpus(cfg)

        assert stats.excluded_too_short == 1
        assert stats.included_messages == 0


class TestBuildCorpusFiltersLowScore:
    """Tests for min_final_score filter."""

    def test_build_corpus_filters_low_score_messages(self, tmp_path: Path) -> None:
        """Message with final_score below min_final_score is excluded.

        A feedback row with final_score=0.1 and min_final_score=0.5 should
        cause excluded_low_score == 1 and included_messages == 0.
        """
        db = _make_db(tmp_path / "test.db")
        _insert_character(db)
        _insert_session(db, "s1")
        _insert_message(db, "s1", 1, "user", "Tell me something.", msg_id=10)
        _insert_message(db, "s1", 1, "assistant", "A long enough reply to pass the length filter.", msg_id=11)
        _insert_feedback(db, message_id=11, final_score=0.1)

        out = tmp_path / "out.jsonl"
        cfg = CorpusConfig(
            char_name="Sakura",
            db_path=db,
            output_path=out,
            min_final_score=0.5,
        )
        stats = build_corpus(cfg)

        assert stats.excluded_low_score == 1
        assert stats.included_messages == 0


class TestBuildCorpusIncludesNoFeedback:
    """Tests that messages without a feedback row bypass score filtering."""

    def test_build_corpus_includes_messages_without_feedback(self, tmp_path: Path) -> None:
        """Message with no feedback row is always included regardless of min_final_score.

        Pre-v76 messages have no feedback row.  The LEFT JOIN means final_score
        is NULL, which the implementation treats as 'always include'.
        """
        db = _make_db(tmp_path / "test.db")
        _insert_character(db)
        _insert_session(db, "s1")
        _insert_message(db, "s1", 1, "user", "Hello there!")
        # Assistant message with NO feedback row at all.
        _insert_message(db, "s1", 1, "assistant", "I have no feedback but I should still be included.")

        out = tmp_path / "out.jsonl"
        cfg = CorpusConfig(
            char_name="Sakura",
            db_path=db,
            output_path=out,
            min_final_score=0.9,  # Strict threshold — should NOT affect this message.
        )
        stats = build_corpus(cfg)

        assert stats.included_messages == 1
        assert stats.excluded_low_score == 0


class TestBuildCorpusSystemPrompt:
    """Tests for system prompt inclusion in JSONL output."""

    def test_build_corpus_includes_system_prompt(self, tmp_path: Path) -> None:
        """When character has a system_prompt, the JSONL conversation starts with a system turn.

        The system turn must have ``"from": "system"`` as the first element.
        """
        db = _make_db(tmp_path / "test.db")
        _insert_character(db, "Sakura", "You are Sakura, a cheerful AI companion.")
        _insert_session(db, "s1")
        _insert_message(db, "s1", 1, "user", "Hey Sakura!")
        _insert_message(db, "s1", 1, "assistant", "Hey! I'm so happy to see you here today!")

        out = tmp_path / "out.jsonl"
        cfg = CorpusConfig(char_name="Sakura", db_path=db, output_path=out)
        stats = build_corpus(cfg)

        assert stats.included_messages == 1
        lines = [ln for ln in out.read_text(encoding="utf-8").splitlines() if ln.strip()]
        obj = json.loads(lines[0])
        first_turn = obj["conversations"][0]
        assert first_turn["from"] == "system"
        assert "Sakura" in first_turn["value"]

    def test_build_corpus_system_prompt_override(self, tmp_path: Path) -> None:
        """system_prompt_override in CorpusConfig replaces the DB value.

        Even when the character's system_prompt column has a value, the
        override string should appear in the JSONL system turn.
        """
        db = _make_db(tmp_path / "test.db")
        _insert_character(db, "Sakura", "DB system prompt — should be replaced.")
        _insert_session(db, "s1")
        _insert_message(db, "s1", 1, "user", "Hello!")
        _insert_message(db, "s1", 1, "assistant", "Hello from the override system prompt version!")

        override = "CUSTOM OVERRIDE PROMPT for testing"
        out = tmp_path / "out.jsonl"
        cfg = CorpusConfig(
            char_name="Sakura",
            db_path=db,
            output_path=out,
            system_prompt_override=override,
        )
        stats = build_corpus(cfg)

        assert stats.included_messages == 1
        lines = [ln for ln in out.read_text(encoding="utf-8").splitlines() if ln.strip()]
        obj = json.loads(lines[0])
        first_turn = obj["conversations"][0]
        assert first_turn["from"] == "system"
        assert first_turn["value"] == override


# ===========================================================================
# SECTION 2: Trainer import / graceful-degradation tests
# ===========================================================================


class TestTrainerImport:
    """Tests for :mod:`backend.adaptive.finetune.trainer` graceful degradation."""

    def test_trainer_ml_available_flag(self) -> None:
        """_ML_AVAILABLE is a bool (True on CUDA rigs, False on Mac).

        This test is intentionally agnostic about which value it holds — we
        only assert the type so the test suite is green on both machines.
        """
        from backend.adaptive.finetune.trainer import _ML_AVAILABLE

        assert isinstance(_ML_AVAILABLE, bool)

    def test_train_lora_raises_import_error_when_ml_unavailable(
        self, tmp_path: Path
    ) -> None:
        """train_lora raises ImportError with a helpful message when ML deps are absent.

        Skipped automatically when _ML_AVAILABLE is True (i.e. on the
        Windows training rig where torch/unsloth are installed).
        """
        from backend.adaptive.finetune.trainer import TrainingConfig, _ML_AVAILABLE, train_lora

        if _ML_AVAILABLE:
            pytest.skip("ML deps are available on this machine — skip degradation test")

        cfg = TrainingConfig(
            corpus_path=tmp_path / "corpus.jsonl",
            output_dir=tmp_path / "output",
            char_name="Sakura",
        )
        with pytest.raises(ImportError, match="pip install"):
            train_lora(cfg)

    def test_training_config_defaults(self, tmp_path: Path) -> None:
        """TrainingConfig constructed with required fields uses documented defaults.

        Verifies:
            - ``base_model`` points to Qwen 2.5 7B Instruct
            - ``lora_r`` == 16
            - ``num_epochs`` == 3
            - ``seed`` == 42
            - ``bf16`` == True (default for RTX 5080)
        """
        from backend.adaptive.finetune.trainer import TrainingConfig

        cfg = TrainingConfig(
            corpus_path=tmp_path / "corpus.jsonl",
            output_dir=tmp_path / "out",
            char_name="TestChar",
        )
        assert "Qwen2.5-7B" in cfg.base_model
        assert cfg.lora_r == 16
        assert cfg.num_epochs == 3
        assert cfg.seed == 42
        assert cfg.bf16 is True


# ===========================================================================
# SECTION 3: EvalHarness import / graceful-degradation tests
# ===========================================================================


class TestEvalHarnessImport:
    """Tests for :mod:`backend.adaptive.finetune.eval_harness` graceful degradation."""

    def test_eval_harness_ml_available_flag(self) -> None:
        """_ML_AVAILABLE from eval_harness is a bool.

        Expected to be False on Mac (no CUDA/unsloth).
        """
        from backend.adaptive.finetune.eval_harness import _ML_AVAILABLE

        assert isinstance(_ML_AVAILABLE, bool)

    def test_evaluate_lora_raises_import_error_when_ml_unavailable(
        self, tmp_path: Path
    ) -> None:
        """evaluate_lora raises ImportError when ML deps are absent.

        Skipped when _ML_AVAILABLE is True.
        """
        from backend.adaptive.finetune.eval_harness import EvalConfig, _ML_AVAILABLE, evaluate_lora

        if _ML_AVAILABLE:
            pytest.skip("ML deps are available on this machine — skip degradation test")

        cfg = EvalConfig(
            adapter_path=tmp_path / "adapter",
            char_name="Sakura",
        )
        with pytest.raises(ImportError, match="pip install"):
            evaluate_lora(cfg)

    def test_default_eval_prompts_has_sakura_key(self) -> None:
        """DEFAULT_EVAL_PROMPTS has 'sakura' key with at least 5 prompts.

        The Sakura character is the primary test target for the eval harness
        and must have a dedicated prompt set.
        """
        from backend.adaptive.finetune.eval_harness import DEFAULT_EVAL_PROMPTS

        assert "sakura" in DEFAULT_EVAL_PROMPTS
        assert len(DEFAULT_EVAL_PROMPTS["sakura"]) >= 5


# ===========================================================================
# SECTION 4: PeftLocalAdapter import tests
# ===========================================================================


class TestPeftLocalAdapterImport:
    """Tests for :class:`PeftLocalAdapter` graceful degradation."""

    def test_peft_local_import_ok(self) -> None:
        """Module imports without error even when torch/peft are absent."""
        import backend.llm.adapters.peft_local  # noqa: F401 — import-only check

    def test_peft_available_flag(self) -> None:
        """_PEFT_AVAILABLE is a bool (False on Mac, True on training rig)."""
        from backend.llm.adapters.peft_local import _PEFT_AVAILABLE

        assert isinstance(_PEFT_AVAILABLE, bool)

    def test_peft_adapter_instantiation_raises_import_error(self) -> None:
        """PeftLocalAdapter("some/path") raises ImportError when _PEFT_AVAILABLE is False.

        Skipped when _PEFT_AVAILABLE is True (Windows training rig).
        """
        from backend.llm.adapters.peft_local import PeftLocalAdapter, _PEFT_AVAILABLE

        if _PEFT_AVAILABLE:
            pytest.skip("PEFT deps available on this machine — skip degradation test")

        with pytest.raises(ImportError, match="pip install"):
            PeftLocalAdapter("some/path")

    def test_peft_from_db_raises_import_error(self, tmp_path: Path) -> None:
        """PeftLocalAdapter.from_db raises ImportError when _PEFT_AVAILABLE is False.

        The ImportError is expected to propagate up from __init__, which is
        called by from_db after a successful DB lookup.

        Skipped when _PEFT_AVAILABLE is True.
        """
        from backend.llm.adapters.peft_local import PeftLocalAdapter, _PEFT_AVAILABLE

        if _PEFT_AVAILABLE:
            pytest.skip("PEFT deps available on this machine — skip degradation test")

        # Create a minimal DB with a character_loras row so the DB query
        # succeeds and the ImportError is raised by __init__, not ValueError.
        db = tmp_path / "app.db"
        con = sqlite3.connect(str(db))
        try:
            con.executescript("""
                CREATE TABLE character_loras (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    char_id INTEGER NOT NULL,
                    adapter_path TEXT NOT NULL,
                    base_model TEXT NOT NULL,
                    is_active INTEGER DEFAULT 0
                );
                INSERT INTO character_loras
                    (char_id, adapter_path, base_model, is_active)
                    VALUES (1, '/tmp/fake_adapter', 'Qwen/Qwen2.5-7B-Instruct', 1);
            """)
            con.commit()
        finally:
            con.close()

        with pytest.raises(ImportError, match="pip install"):
            PeftLocalAdapter.from_db(str(db), char_id=1)


# ===========================================================================
# SECTION 5: Training API endpoint tests
# ===========================================================================

# These tests exercise the /api/training/* endpoints that are planned for
# backend/server.py.  They are skipped when the endpoints are not yet wired.

from contextlib import asynccontextmanager  # noqa: E402 — already imported above; re-imported for clarity


@asynccontextmanager
async def _noop_lifespan(app):
    """No-op lifespan that bypasses real startup/shutdown for API tests.

    Yields:
        Nothing — simply enters and exits.
    """
    yield


# DDL additions needed for the training endpoints.
_TRAINING_DDL = """
CREATE TABLE IF NOT EXISTS character_loras (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id      INTEGER NOT NULL,
    base_model   TEXT    NOT NULL DEFAULT 'unsloth/Qwen2.5-7B-Instruct',
    adapter_path TEXT    NOT NULL,
    trained_at   REAL    NOT NULL DEFAULT (unixepoch()),
    eval_score   REAL,
    is_active    INTEGER DEFAULT 0,
    meta         TEXT
);

CREATE TABLE IF NOT EXISTS message_feedback (
    message_id      INTEGER PRIMARY KEY,
    explicit_signal INTEGER,
    implicit_score  REAL,
    final_score     REAL,
    computed_at     TEXT    DEFAULT (strftime('%s', 'now')),
    signal_version  INTEGER DEFAULT 1
);
"""


def _setup_training_tables(db_path: Path) -> None:
    """Add character_loras to an existing test DB.

    Args:
        db_path: Path to the SQLite database file used by the test server.
    """
    con = sqlite3.connect(str(db_path))
    try:
        con.executescript(_TRAINING_DDL)
        con.commit()
    finally:
        con.close()


def _seed_character_for_api(db_path: Path, char_id: int = 2) -> int:
    """Insert a character row via the test DB directly.

    The conftest already seeds character id=1.  We use id=2 to avoid
    collisions and to test endpoints against a freshly inserted character.

    Args:
        db_path: SQLite database path (monkeypatched to tmp_path).
        char_id: Primary key for the new character row.

    Returns:
        The char_id that was inserted.
    """
    con = sqlite3.connect(str(db_path))
    try:
        con.execute(
            """INSERT OR REPLACE INTO characters
               (id, name, system_prompt, model_type, background_mode)
               VALUES (?, ?, ?, ?, ?)""",
            (char_id, "TestChar", "You are TestChar.", "3d", "transparent"),
        )
        con.commit()
    finally:
        con.close()
    return char_id


def _seed_lora_row(
    db_path: Path,
    char_id: int,
    adapter_path: str = "/tmp/test_adapter",
    is_active: int = 1,
    eval_score: float | None = 0.72,
) -> int:
    """Insert an active character_loras row.

    Args:
        db_path: SQLite database path.
        char_id: FK to characters.id.
        adapter_path: Path string for the LoRA adapter directory.
        is_active: 1 for active, 0 for inactive.
        eval_score: Evaluation score (or None).

    Returns:
        The rowid of the inserted row.
    """
    con = sqlite3.connect(str(db_path))
    try:
        cur = con.execute(
            """INSERT INTO character_loras
               (char_id, adapter_path, base_model, is_active, eval_score)
               VALUES (?, ?, ?, ?, ?)""",
            (char_id, adapter_path, "unsloth/Qwen2.5-7B-Instruct", is_active, eval_score),
        )
        con.commit()
        return cur.lastrowid
    finally:
        con.close()


@pytest.fixture()
def training_client(server_module, tmp_path):
    """TestClient with character_loras table added to the test DB.

    Extends the shared ``server_module`` fixture with the character_loras
    table so the /api/training/* endpoints have their schema available.

    Args:
        server_module: Shared fixture from ``conftest.py`` (monkeypatched server).
        tmp_path: Pytest built-in for temporary directories.

    Yields:
        :class:`fastapi.testclient.TestClient` connected to the test DB.
    """
    _setup_training_tables(server_module.DB_PATH)

    original_lifespan = server_module.app.router.lifespan_context
    server_module.app.router.lifespan_context = _noop_lifespan
    try:
        with __import__("fastapi").testclient.TestClient(server_module.app) as test_client:
            yield test_client
    finally:
        server_module.app.router.lifespan_context = original_lifespan


def _endpoints_wired(client) -> bool:
    """Return True if the training endpoints are registered in the app.

    Issues a probe request to check.  A 404 from FastAPI's default handler
    means the route is absent (the route is not wired).  Any other status
    code (including 404 from our own handler) means it is present.

    Args:
        client: A :class:`fastapi.testclient.TestClient` instance.

    Returns:
        True when the endpoint exists; False otherwise.
    """
    resp = client.get("/api/training/status/99999")
    # FastAPI returns 404 with detail "Not Found" for unknown routes,
    # and our handler would return 404 with detail "Character not found".
    if resp.status_code == 404:
        body = resp.json()
        # Route-level 404 has generic {"detail": "Not Found"}.
        if body.get("detail") == "Not Found":
            return False
    return True


class TestGetTrainingStatus:
    """Tests for ``GET /api/training/status/{char_id}``."""


    def test_get_training_status_unknown_character_returns_404(
        self, training_client
    ) -> None:
        """GET /api/training/status/99999 returns 404 for an unknown character."""
        resp = training_client.get("/api/training/status/99999")
        assert resp.status_code == 404


    def test_get_training_status_no_active_lora(
        self, training_client, server_module
    ) -> None:
        """Character with no LoRA row → 200, has_active_lora: false."""
        char_id = _seed_character_for_api(server_module.DB_PATH, char_id=2)
        resp = training_client.get(f"/api/training/status/{char_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_active_lora"] is False


    def test_get_training_status_with_active_lora(
        self, training_client, server_module
    ) -> None:
        """Character with active LoRA row → 200, has_active_lora: true, adapter_path and eval_score present."""
        char_id = _seed_character_for_api(server_module.DB_PATH, char_id=3)
        _seed_lora_row(server_module.DB_PATH, char_id=3, eval_score=0.85)

        resp = training_client.get(f"/api/training/status/{char_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["has_active_lora"] is True
        assert "adapter_path" in data
        assert "eval_score" in data


class TestDeleteTrainingLoras:
    """Tests for ``DELETE /api/training/loras/{char_id}``."""


    def test_delete_training_loras_unknown_character_returns_404(
        self, training_client
    ) -> None:
        """DELETE /api/training/loras/99999 returns 404."""
        resp = training_client.delete("/api/training/loras/99999")
        assert resp.status_code == 404


    def test_delete_training_loras_no_loras(
        self, training_client, server_module
    ) -> None:
        """Character exists but has no LoRAs → 200, deleted == 0."""
        char_id = _seed_character_for_api(server_module.DB_PATH, char_id=4)
        resp = training_client.delete(f"/api/training/loras/{char_id}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 0


    def test_delete_training_loras_with_active_lora(
        self, training_client, server_module
    ) -> None:
        """Character with one active LoRA row → DELETE returns deleted == 1 and row is gone."""
        char_id = _seed_character_for_api(server_module.DB_PATH, char_id=5)
        _seed_lora_row(server_module.DB_PATH, char_id=5)

        resp = training_client.delete(f"/api/training/loras/{char_id}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 1

        # Verify the row is actually gone from the DB.
        con = sqlite3.connect(str(server_module.DB_PATH))
        try:
            row = con.execute(
                "SELECT id FROM character_loras WHERE char_id = ?", (char_id,)
            ).fetchone()
        finally:
            con.close()
        assert row is None


class TestTriggerRetrain:
    """Tests for ``POST /api/training/retrain/{char_id}``."""


    def test_trigger_retrain_unknown_character_returns_404(
        self, training_client
    ) -> None:
        """POST /api/training/retrain/99999 returns 404."""
        resp = training_client.post("/api/training/retrain/99999")
        assert resp.status_code == 404


    def test_trigger_retrain_returns_corpus_stats_and_cli_command(
        self, training_client, server_module
    ) -> None:
        """POST /api/training/retrain/{char_id} → 200 with corpus_stats and cli_command.

        Inserts a character and a few messages, then checks that the endpoint
        response includes both expected top-level keys.
        """
        char_id = _seed_character_for_api(server_module.DB_PATH, char_id=6)

        # Add some messages for the corpus builder.
        con = sqlite3.connect(str(server_module.DB_PATH))
        try:
            con.execute("INSERT OR IGNORE INTO sessions (id) VALUES (42)")
            con.execute(
                "INSERT INTO messages (session_id, char_id, role, text)"
                " VALUES (42, ?, 'user', 'Hello!')",
                (char_id,),
            )
            con.execute(
                "INSERT INTO messages (session_id, char_id, role, text)"
                " VALUES (42, ?, 'assistant',"
                " 'Hello! I am so happy to chat with you today!')",
                (char_id,),
            )
            con.commit()
        finally:
            con.close()

        resp = training_client.post(f"/api/training/retrain/{char_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "corpus_stats" in data
        assert "cli_command" in data
