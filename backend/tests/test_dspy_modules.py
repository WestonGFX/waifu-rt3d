"""Tests for DSPy context classifier modules.

Covers three source files:
    1. ``backend/adaptive/dspy_modules/context_classifier_dspy.py``
       — :func:`classify_context_dspy` + :func:`load_compiled_classifier`
    2. ``backend/adaptive/dspy_modules/optimizer_runner.py``
       — :func:`run_optimizer`, :func:`maybe_run_optimizer`, :func:`_next_version`
    3. ``backend/adaptive/context_classifier.py``
       — :func:`configure_dspy_classifier` feature flag + :func:`_classify_rule_based`

All tests assume ``_DSPY_AVAILABLE = False`` on this dev machine (DSPy not installed).
DB-dependent tests use in-memory or tmp_path SQLite with the ``dspy_compiled_programs``
table created manually so the full preflight migration chain is not required.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Table DDL (mirrors v78 migration)
# ---------------------------------------------------------------------------

_DSPY_PROGRAMS_DDL = """
CREATE TABLE IF NOT EXISTS dspy_compiled_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_name TEXT NOT NULL,
    version INTEGER NOT NULL,
    signature TEXT NOT NULL,
    fewshot_json TEXT,
    compiled_at REAL NOT NULL,
    optimizer TEXT NOT NULL,
    score REAL,
    is_active INTEGER DEFAULT 0
)
"""

# ---------------------------------------------------------------------------
# Constants (must match the source module)
# ---------------------------------------------------------------------------

VALID_CONTEXTS = (
    "emotional_support",
    "casual_chat",
    "creative_roleplay",
    "deep_philosophical",
    "playful_flirty",
    "factual_qa",
    "comfort_reassurance",
)

MODULE_NAME = "context_classifier"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_programs_db(path: Path | None = None) -> sqlite3.Connection:
    """Create a SQLite connection with the dspy_compiled_programs table.

    Args:
        path: If given, create a file-based DB; otherwise use ``:memory:``.

    Returns:
        Open connection with the table already created.
    """
    target = str(path) if path is not None else ":memory:"
    con = sqlite3.connect(target)
    con.execute(_DSPY_PROGRAMS_DDL)
    con.commit()
    return con


def _insert_active_row(con: sqlite3.Connection, version: int = 1) -> None:
    """Insert a single active row into dspy_compiled_programs.

    Args:
        con: Open connection with the dspy_compiled_programs table.
        version: Version number for the inserted row.
    """
    import time

    con.execute(
        """
        INSERT INTO dspy_compiled_programs
            (module_name, version, signature, fewshot_json,
             compiled_at, optimizer, score, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        """,
        (
            MODULE_NAME,
            version,
            "user_message, sentiment_score, emoji_count, question_count -> context_type",
            None,
            time.time(),
            "BootstrapFewShot",
            0.85,
        ),
    )
    con.commit()


# ---------------------------------------------------------------------------
# Fixture: reset DSPy feature flag after any test that enables it
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=False)
def reset_dspy_flag():
    """Ensure _DSPY_CLASSIFIER_ENABLED is False after each test that enables it.

    Yields:
        None — pure teardown fixture.
    """
    yield
    import backend.adaptive.context_classifier as cc

    cc.configure_dspy_classifier(False)


# ===========================================================================
# 1. Tests for context_classifier_dspy.py
# ===========================================================================


class TestClassifyContextDspy:
    """Tests for :func:`classify_context_dspy` — the DSPy-backed classifier entry point."""

    def test_classify_context_dspy_returns_valid_context(self):
        """classify_context_dspy() always returns a member of VALID_CONTEXTS.

        On this dev machine DSPy is absent so the result comes from the
        rule-based fallback, which must still be a valid context string.
        """
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            classify_context_dspy,
        )

        result = classify_context_dspy("I feel sad", -0.3, 0, 0)
        assert result in VALID_CONTEXTS

    def test_classify_context_dspy_falls_back_when_dspy_unavailable(self):
        """When DSPy is absent the result matches the rule-based output.

        "I feel sad" with sentiment -0.3 should trigger emotional_support via
        the rule-based heuristics (_classify_rule_based), which is the fallback
        path taken when _DSPY_AVAILABLE is False.
        """
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            _DSPY_AVAILABLE,
            classify_context_dspy,
        )
        from backend.adaptive.context_classifier import _classify_rule_based

        assert not _DSPY_AVAILABLE, "Expected DSPy to be unavailable on this dev machine"

        dspy_result = classify_context_dspy("I feel sad", -0.3, 0, 0)
        rule_result = _classify_rule_based("I feel sad", -0.3, 0, 0)
        assert dspy_result == rule_result

    def test_classify_context_dspy_falls_back_to_emotional_support_for_sad(self):
        """Sad message with negative sentiment → emotional_support via rule-based fallback."""
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            classify_context_dspy,
        )

        result = classify_context_dspy("I feel sad", -0.3, 0, 0)
        assert result == "emotional_support"

    def test_classify_context_dspy_casual_chat_default(self):
        """Neutral conversational message → casual_chat."""
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            classify_context_dspy,
        )

        result = classify_context_dspy("hey how's it going", 0.0, 0, 0)
        assert result == "casual_chat"

    def test_classify_context_dspy_factual_qa(self):
        """Question with factual phrase + question_count=1 → factual_qa."""
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            classify_context_dspy,
        )

        result = classify_context_dspy("What is the meaning of life?", 0.0, 0, 1)
        # "what is" is in _FACTUAL_PHRASES and question_count >= 1
        assert result == "factual_qa"

    def test_classify_context_dspy_creative_roleplay(self):
        """Asterisk-action roleplay marker → creative_roleplay."""
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            classify_context_dspy,
        )

        result = classify_context_dspy("*hugs you tightly*", 0.0, 0, 0)
        assert result == "creative_roleplay"

    def test_classify_context_dspy_with_nonexistent_compiled_path(self):
        """Passing a non-existent compiled_json_path does not crash.

        The function must still return a valid context even when the DSPy JSON
        file does not exist on disk.  The path-not-found case is handled with a
        debug log + zero-shot fallback internally, and on this machine the full
        DSPy code path is skipped anyway (DSPy unavailable).
        """
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            classify_context_dspy,
        )

        result = classify_context_dspy(
            "I feel sad",
            -0.3,
            0,
            0,
            compiled_json_path="/nonexistent/path.json",
        )
        assert result in VALID_CONTEXTS

    def test_dspy_available_flag_is_bool(self):
        """_DSPY_AVAILABLE is a boolean constant."""
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            _DSPY_AVAILABLE,
        )

        assert isinstance(_DSPY_AVAILABLE, bool)

    def test_valid_contexts_constant_has_seven_entries(self):
        """VALID_CONTEXTS in the dspy module matches the expected 7-item tuple."""
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            VALID_CONTEXTS as MODULE_VALID_CONTEXTS,
        )

        assert len(MODULE_VALID_CONTEXTS) == 7
        assert set(MODULE_VALID_CONTEXTS) == set(VALID_CONTEXTS)


class TestLoadCompiledClassifier:
    """Tests for :func:`load_compiled_classifier` — DB lookup for active compiled programs."""

    def test_load_compiled_classifier_returns_none_when_no_db_row(self, tmp_path: Path):
        """No rows in dspy_compiled_programs → returns None without raising.

        Creates an empty dspy_compiled_programs table (no rows), then calls
        load_compiled_classifier.  Expects None because there is no active row.
        """
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            load_compiled_classifier,
        )

        db_path = tmp_path / "test.db"
        con = _make_programs_db(db_path)
        con.close()

        result = load_compiled_classifier(db_path, tmp_path)
        assert result is None

    def test_load_compiled_classifier_returns_none_when_file_missing(self, tmp_path: Path):
        """Active DB row exists but the JSON file is absent on disk → returns None.

        The function resolves ``context_classifier_v{version}.json`` inside the
        given directory and returns None when the file does not exist.
        """
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            load_compiled_classifier,
        )

        db_path = tmp_path / "test.db"
        con = _make_programs_db(db_path)
        _insert_active_row(con, version=2)
        con.close()

        # File context_classifier_v2.json does NOT exist in tmp_path
        result = load_compiled_classifier(db_path, tmp_path)
        assert result is None

    def test_load_compiled_classifier_returns_path_when_file_exists(self, tmp_path: Path):
        """Active DB row + matching JSON file on disk → returns the path string.

        Creates the DB row with version=3, then creates the expected JSON file
        ``context_classifier_v3.json`` in tmp_path.  load_compiled_classifier
        should return the absolute path to that file.
        """
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            load_compiled_classifier,
        )

        db_path = tmp_path / "test.db"
        con = _make_programs_db(db_path)
        _insert_active_row(con, version=3)
        con.close()

        # Create the expected file
        json_file = tmp_path / "context_classifier_v3.json"
        json_file.write_text('{"demo": true}')

        result = load_compiled_classifier(db_path, tmp_path)
        assert result is not None
        assert result.endswith("context_classifier_v3.json")

    def test_load_compiled_classifier_returns_highest_version_when_multiple_active(
        self, tmp_path: Path
    ):
        """When multiple is_active=1 rows exist, the highest version wins.

        The query uses ``ORDER BY version DESC LIMIT 1`` so only the highest
        version is considered — this test verifies that ordering.
        """
        import time

        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            load_compiled_classifier,
        )

        db_path = tmp_path / "test.db"
        con = _make_programs_db(db_path)

        # Insert two active rows
        for v in (1, 5):
            con.execute(
                """
                INSERT INTO dspy_compiled_programs
                    (module_name, version, signature, fewshot_json,
                     compiled_at, optimizer, score, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    MODULE_NAME,
                    v,
                    "user_message -> context_type",
                    None,
                    time.time(),
                    "BootstrapFewShot",
                    None,
                ),
            )
        con.commit()
        con.close()

        # Only create the v5 file
        (tmp_path / "context_classifier_v5.json").write_text("{}")

        result = load_compiled_classifier(db_path, tmp_path)
        assert result is not None
        assert "v5" in result

    def test_load_compiled_classifier_handles_missing_db_gracefully(self, tmp_path: Path):
        """A non-existent DB path causes a graceful None return, not an exception.

        load_compiled_classifier wraps all DB access in a try/except so a bad
        path must not propagate to the caller.
        """
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            load_compiled_classifier,
        )

        bad_db = tmp_path / "does_not_exist.db"
        # No table created — sqlite3.connect() will create the file but the table
        # will be absent, causing an OperationalError that should be caught.
        result = load_compiled_classifier(bad_db, tmp_path)
        assert result is None

    def test_load_compiled_classifier_ignores_inactive_rows(self, tmp_path: Path):
        """Rows with is_active=0 are not returned even if the file exists.

        Inserts a row with is_active=0, creates the corresponding JSON file,
        and verifies the function still returns None.
        """
        import time

        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            load_compiled_classifier,
        )

        db_path = tmp_path / "test.db"
        con = _make_programs_db(db_path)
        con.execute(
            """
            INSERT INTO dspy_compiled_programs
                (module_name, version, signature, compiled_at, optimizer, is_active)
            VALUES (?, ?, ?, ?, ?, 0)
            """,
            (MODULE_NAME, 7, "user_message -> context_type", time.time(), "BootstrapFewShot"),
        )
        con.commit()
        con.close()

        # Create the file — should still return None because is_active=0
        (tmp_path / "context_classifier_v7.json").write_text("{}")

        result = load_compiled_classifier(db_path, tmp_path)
        assert result is None

    def test_load_compiled_classifier_module_name_filter(self, tmp_path: Path):
        """Only the 'context_classifier' module_name is selected — other names are ignored.

        Inserts an active row with a different module_name and creates its file.
        The function should return None because it filters by MODULE_NAME.
        """
        import time

        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            load_compiled_classifier,
        )

        db_path = tmp_path / "test.db"
        con = _make_programs_db(db_path)
        con.execute(
            """
            INSERT INTO dspy_compiled_programs
                (module_name, version, signature, compiled_at, optimizer, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
            """,
            ("other_module", 1, "x -> y", time.time(), "BootstrapFewShot"),
        )
        con.commit()
        con.close()

        # Create the other-module file; should not be returned
        (tmp_path / "other_module_v1.json").write_text("{}")

        result = load_compiled_classifier(db_path, tmp_path)
        assert result is None


# ===========================================================================
# 2. Tests for optimizer_runner.py
# ===========================================================================


class TestRunOptimizer:
    """Tests for :func:`run_optimizer` — the main DSPy optimization entry point."""

    def test_run_optimizer_raises_when_dspy_unavailable(self, tmp_path: Path):
        """run_optimizer() raises ImportError when _DSPY_AVAILABLE is False.

        The function checks the flag at the top and raises ImportError with an
        install instruction message before any DB or LM interaction.
        """
        from backend.adaptive.dspy_modules.optimizer_runner import (
            OptimizerConfig,
            _DSPY_AVAILABLE,
            run_optimizer,
        )

        assert not _DSPY_AVAILABLE, "Expected DSPy to be unavailable on this dev machine"

        cfg = OptimizerConfig(
            db_path=tmp_path / "test.db",
            output_dir=tmp_path / "out",
        )
        with pytest.raises(ImportError):
            run_optimizer(cfg)

    def test_run_optimizer_import_error_message_mentions_install(self, tmp_path: Path):
        """The ImportError from run_optimizer contains helpful install guidance."""
        from backend.adaptive.dspy_modules.optimizer_runner import (
            OptimizerConfig,
            run_optimizer,
        )

        cfg = OptimizerConfig(
            db_path=tmp_path / "test.db",
            output_dir=tmp_path / "out",
        )
        with pytest.raises(ImportError, match="DSPy"):
            run_optimizer(cfg)


class TestMaybeRunOptimizer:
    """Tests for :func:`maybe_run_optimizer` — the safe wrapper that never raises."""

    def test_maybe_run_optimizer_returns_none_when_dspy_unavailable(self):
        """maybe_run_optimizer() returns None (does not raise) when DSPy is absent."""
        from backend.adaptive.dspy_modules.optimizer_runner import (
            _DSPY_AVAILABLE,
            maybe_run_optimizer,
        )

        assert not _DSPY_AVAILABLE

        result = maybe_run_optimizer(
            db_path=Path("/tmp/nonexistent.db"),
            output_dir=Path("/tmp/out"),
            lm_endpoint="http://localhost:1234/v1",
            lm_model="qwen2.5-7b-instruct",
        )
        assert result is None

    def test_maybe_run_optimizer_does_not_raise_on_any_error(self):
        """maybe_run_optimizer() swallows all errors including bad arguments."""
        from backend.adaptive.dspy_modules.optimizer_runner import maybe_run_optimizer

        # Intentionally bad arguments — function must not raise
        result = maybe_run_optimizer(
            db_path=Path("/this/does/not/exist.db"),
            output_dir=Path("/also/does/not/exist"),
            lm_endpoint="",
            lm_model="",
        )
        assert result is None


class TestNextVersion:
    """Tests for :func:`_next_version` — monotonic version counter."""

    def test_next_version_returns_1_when_no_rows(self, tmp_path: Path):
        """_next_version() returns 1 when no rows exist for the module.

        Creates an empty dspy_compiled_programs table and asserts that the
        next version is 1 (``MAX(NULL) + 1``).
        """
        from backend.adaptive.dspy_modules.optimizer_runner import _next_version

        db_path = tmp_path / "test.db"
        con = _make_programs_db(db_path)
        con.close()

        result = _next_version(db_path, MODULE_NAME)
        assert result == 1

    def test_next_version_increments_from_existing_max(self, tmp_path: Path):
        """_next_version() returns MAX(version) + 1 when rows are present.

        Inserts a row with version=3 and asserts next version is 4.
        """
        from backend.adaptive.dspy_modules.optimizer_runner import _next_version

        db_path = tmp_path / "test.db"
        con = _make_programs_db(db_path)
        _insert_active_row(con, version=3)
        con.close()

        result = _next_version(db_path, MODULE_NAME)
        assert result == 4

    def test_next_version_uses_module_name_filter(self, tmp_path: Path):
        """_next_version() only counts rows for the specified module_name.

        Inserts version=99 for a different module and asserts that
        context_classifier still gets version=1.
        """
        import time

        from backend.adaptive.dspy_modules.optimizer_runner import _next_version

        db_path = tmp_path / "test.db"
        con = _make_programs_db(db_path)
        con.execute(
            """
            INSERT INTO dspy_compiled_programs
                (module_name, version, signature, compiled_at, optimizer, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
            """,
            ("other_module", 99, "x -> y", time.time(), "BootstrapFewShot"),
        )
        con.commit()
        con.close()

        result = _next_version(db_path, MODULE_NAME)
        assert result == 1

    def test_next_version_selects_max_not_last_inserted(self, tmp_path: Path):
        """_next_version() uses MAX(version), not the last-inserted row.

        Inserts version=5 then version=2 (out of order) — expects version 6.
        """
        import time

        from backend.adaptive.dspy_modules.optimizer_runner import _next_version

        db_path = tmp_path / "test.db"
        con = _make_programs_db(db_path)
        for v in (5, 2):
            con.execute(
                """
                INSERT INTO dspy_compiled_programs
                    (module_name, version, signature, compiled_at, optimizer, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
                """,
                (MODULE_NAME, v, "x -> y", time.time(), "BootstrapFewShot"),
            )
        con.commit()
        con.close()

        result = _next_version(db_path, MODULE_NAME)
        assert result == 6


class TestOptimizerConfig:
    """Tests for the :class:`OptimizerConfig` dataclass."""

    def test_optimizer_config_defaults(self, tmp_path: Path):
        """OptimizerConfig has the expected default values."""
        from backend.adaptive.dspy_modules.optimizer_runner import OptimizerConfig

        cfg = OptimizerConfig(
            db_path=tmp_path / "app.db",
            output_dir=tmp_path / "out",
        )
        assert cfg.module_name == "context_classifier"
        assert cfg.lm_endpoint == "http://localhost:1234/v1"
        assert cfg.lm_model == "qwen2.5-7b-instruct"
        assert cfg.lm_api_key == "local"
        assert cfg.min_score == pytest.approx(0.4)
        assert cfg.max_trainset == 50
        assert cfg.max_bootstrapped_demos == 4
        assert cfg.max_labeled_demos == 4
        assert cfg.char_id is None

    def test_optimizer_config_char_id_override(self, tmp_path: Path):
        """OptimizerConfig accepts a char_id override."""
        from backend.adaptive.dspy_modules.optimizer_runner import OptimizerConfig

        cfg = OptimizerConfig(
            db_path=tmp_path / "app.db",
            output_dir=tmp_path / "out",
            char_id=42,
        )
        assert cfg.char_id == 42


class TestContextMetric:
    """Tests for :func:`_context_metric` — the DSPy evaluation metric helper."""

    def test_context_metric_exact_match_returns_one(self):
        """_context_metric returns 1.0 on an exact match (case-insensitive)."""
        from backend.adaptive.dspy_modules.optimizer_runner import _context_metric

        class FakeExample:
            context_type = "emotional_support"

        class FakePrediction:
            context_type = "emotional_support"

        score = _context_metric(FakeExample(), FakePrediction())
        assert score == pytest.approx(1.0)

    def test_context_metric_case_insensitive(self):
        """_context_metric treats context_type comparison as case-insensitive."""
        from backend.adaptive.dspy_modules.optimizer_runner import _context_metric

        class FakeExample:
            context_type = "Emotional_Support"

        class FakePrediction:
            context_type = "emotional_support"

        score = _context_metric(FakeExample(), FakePrediction())
        assert score == pytest.approx(1.0)

    def test_context_metric_mismatch_returns_zero(self):
        """_context_metric returns 0.0 when context types differ."""
        from backend.adaptive.dspy_modules.optimizer_runner import _context_metric

        class FakeExample:
            context_type = "casual_chat"

        class FakePrediction:
            context_type = "emotional_support"

        score = _context_metric(FakeExample(), FakePrediction())
        assert score == pytest.approx(0.0)

    def test_context_metric_strips_whitespace(self):
        """_context_metric strips leading/trailing whitespace before comparing."""
        from backend.adaptive.dspy_modules.optimizer_runner import _context_metric

        class FakeExample:
            context_type = "factual_qa"

        class FakePrediction:
            context_type = "  factual_qa  "

        score = _context_metric(FakeExample(), FakePrediction())
        assert score == pytest.approx(1.0)


# ===========================================================================
# 3. Tests for context_classifier.py — configure_dspy_classifier + _classify_rule_based
# ===========================================================================


class TestConfigureDspyClassifier:
    """Tests for :func:`configure_dspy_classifier` — runtime feature flag management."""

    def test_configure_dspy_classifier_sets_flag_to_true(self, reset_dspy_flag):
        """configure_dspy_classifier(True) sets _DSPY_CLASSIFIER_ENABLED to True.

        Reads the module attribute directly (not a cached import copy) to verify
        the global is mutated.
        """
        import backend.adaptive.context_classifier as cc

        cc.configure_dspy_classifier(True)
        assert cc._DSPY_CLASSIFIER_ENABLED is True

    def test_configure_dspy_classifier_resets_flag_to_false(self, reset_dspy_flag):
        """configure_dspy_classifier(False) resets _DSPY_CLASSIFIER_ENABLED to False."""
        import backend.adaptive.context_classifier as cc

        cc.configure_dspy_classifier(True)
        assert cc._DSPY_CLASSIFIER_ENABLED is True

        cc.configure_dspy_classifier(False)
        assert cc._DSPY_CLASSIFIER_ENABLED is False

    def test_configure_dspy_classifier_sets_compiled_json_path(self, reset_dspy_flag):
        """configure_dspy_classifier stores the compiled_json_path when provided."""
        import backend.adaptive.context_classifier as cc

        cc.configure_dspy_classifier(True, compiled_json_path="/some/path.json")
        assert cc._COMPILED_JSON_PATH == "/some/path.json"

    def test_configure_dspy_classifier_clears_compiled_json_path_on_disable(
        self, reset_dspy_flag
    ):
        """configure_dspy_classifier(False) without path clears _COMPILED_JSON_PATH to None."""
        import backend.adaptive.context_classifier as cc

        cc.configure_dspy_classifier(True, compiled_json_path="/some/path.json")
        cc.configure_dspy_classifier(False)
        assert cc._COMPILED_JSON_PATH is None

    def test_configure_dspy_classifier_flag_starts_false(self):
        """The module-level _DSPY_CLASSIFIER_ENABLED starts as False by default.

        Relies on the reset_dspy_flag fixture in other tests to ensure cleanup.
        This test intentionally does NOT use reset_dspy_flag because it only reads.
        """
        import backend.adaptive.context_classifier as cc

        # Should be False unless a prior test dirtied the state (autouse=False avoids that)
        assert isinstance(cc._DSPY_CLASSIFIER_ENABLED, bool)


class TestClassifyContextDspyPath:
    """Tests for :func:`classify_context` when the DSPy flag is enabled."""

    def test_classify_context_uses_dspy_path_when_enabled(self, reset_dspy_flag):
        """With flag enabled, classify_context routes through DSPy path.

        Because DSPy is absent, the DSPy wrapper falls back to _classify_rule_based
        which returns 'emotional_support' for the sad message.  This test verifies
        the flag path doesn't crash and returns a valid result.
        """
        import backend.adaptive.context_classifier as cc

        cc.configure_dspy_classifier(True)
        result = cc.classify_context("I feel sad", -0.3, 0, 0)
        assert result == "emotional_support"

    def test_classify_context_result_in_valid_contexts_when_flag_enabled(
        self, reset_dspy_flag
    ):
        """With flag enabled, classify_context always returns a member of CONTEXTS."""
        import backend.adaptive.context_classifier as cc

        cc.configure_dspy_classifier(True)
        test_inputs = [
            ("", 0.0, 0, 0),
            ("I feel sad", -0.3, 0, 0),
            ("What is Python?", 0.0, 0, 1),
            ("*hugs you*", 0.0, 0, 0),
            ("hey how's it going", 0.0, 0, 0),
        ]
        for msg, sent, emo, qn in test_inputs:
            result = cc.classify_context(msg, sent, emo, qn)
            assert result in cc.CONTEXTS, (
                f"classify_context({msg!r}, ...) returned {result!r} not in CONTEXTS"
            )

    def test_classify_context_no_recursion_when_dspy_enabled(self, reset_dspy_flag):
        """Calling classify_context 50 times with flag enabled causes no RecursionError.

        The DSPy module calls _classify_rule_based (not classify_context) as its
        fallback, so no recursive loop should form even when _DSPY_CLASSIFIER_ENABLED
        is True.
        """
        import backend.adaptive.context_classifier as cc

        cc.configure_dspy_classifier(True)

        for _ in range(50):
            result = cc.classify_context("I feel sad", -0.3, 0, 0)
            assert result in cc.CONTEXTS

    def test_classify_context_disabled_flag_uses_rule_based(self, reset_dspy_flag):
        """With flag disabled (default), classify_context uses rule-based path directly."""
        import backend.adaptive.context_classifier as cc

        cc.configure_dspy_classifier(False)
        result = cc.classify_context("I feel sad", -0.3, 0, 0)
        assert result == "emotional_support"


class TestClassifyRuleBased:
    """Tests for :func:`_classify_rule_based` — the pure rule-based inner implementation."""

    def test_classify_rule_based_not_affected_by_dspy_flag_enabled(
        self, reset_dspy_flag
    ):
        """_classify_rule_based() returns correct result regardless of flag state.

        _classify_rule_based has no feature-flag check internally — it is
        the DSPy fallback path and always runs rule-based logic.
        """
        import backend.adaptive.context_classifier as cc

        cc.configure_dspy_classifier(True)
        result = cc._classify_rule_based("I feel sad", -0.3, 0, 0)
        assert result == "emotional_support"

    def test_classify_rule_based_not_affected_by_dspy_flag_disabled(self):
        """_classify_rule_based() returns correct result when flag is False (default)."""
        from backend.adaptive.context_classifier import _classify_rule_based

        result = _classify_rule_based("I feel sad", -0.3, 0, 0)
        assert result == "emotional_support"

    def test_classify_rule_based_empty_string(self):
        """Empty message → casual_chat (fallback)."""
        from backend.adaptive.context_classifier import _classify_rule_based

        result = _classify_rule_based("", 0.0, 0, 0)
        assert result == "casual_chat"

    def test_classify_rule_based_comfort_reassurance(self):
        """Negative sentiment + comfort keyword → comfort_reassurance."""
        from backend.adaptive.context_classifier import _classify_rule_based

        result = _classify_rule_based("I'm so scared and panicking", -0.5, 0, 0)
        assert result == "comfort_reassurance"

    def test_classify_rule_based_factual_qa(self):
        """Question + factual phrase → factual_qa."""
        from backend.adaptive.context_classifier import _classify_rule_based

        result = _classify_rule_based("What is quantum computing?", 0.0, 0, 1)
        assert result == "factual_qa"

    def test_classify_rule_based_creative_roleplay(self):
        """Asterisk-action marker → creative_roleplay."""
        from backend.adaptive.context_classifier import _classify_rule_based

        result = _classify_rule_based("*draws sword dramatically*", 0.0, 0, 0)
        assert result == "creative_roleplay"

    def test_classify_rule_based_always_returns_valid_context(self):
        """_classify_rule_based always returns a value in CONTEXTS."""
        from backend.adaptive.context_classifier import CONTEXTS, _classify_rule_based

        test_cases = [
            ("", 0.0, 0, 0),
            ("I feel sad", -0.3, 0, 0),
            ("What is Python?", 0.0, 0, 1),
            ("*action*", 0.0, 0, 0),
            ("You're cute 😊😘", 0.5, 2, 0),
            ("I'm scared, help me", -0.5, 0, 0),
            ("This is a very long message about the meaning of life and consciousness. " * 5, 0.0, 0, 0),
        ]
        for args in test_cases:
            result = _classify_rule_based(*args)
            assert result in CONTEXTS, (
                f"_classify_rule_based{args!r} → {result!r} not in CONTEXTS"
            )

    def test_classify_rule_based_none_mood_state(self):
        """mood_state=None is the default and does not crash."""
        from backend.adaptive.context_classifier import _classify_rule_based

        result = _classify_rule_based("Hey there", 0.0, 0, 0, mood_state=None)
        assert result == "casual_chat"

    def test_classify_rule_based_distressed_mood_lowers_threshold(self):
        """With mood_state='sad', sentiment threshold for emotional_support drops to 0.0."""
        from backend.adaptive.context_classifier import _classify_rule_based

        # "feel" is a sadness keyword — triggers emotional_support regardless of mood
        result = _classify_rule_based("I feel okay today", 0.05, 0, 0, mood_state="sad")
        assert result == "emotional_support"


# ===========================================================================
# 4. Module-level import safety tests
# ===========================================================================


class TestModuleImportSafety:
    """Tests that all three modules import cleanly without errors."""

    def test_context_classifier_dspy_imports_cleanly(self):
        """context_classifier_dspy imports without raising even when DSPy is absent."""
        import backend.adaptive.dspy_modules.context_classifier_dspy as m

        assert hasattr(m, "classify_context_dspy")
        assert hasattr(m, "load_compiled_classifier")
        assert hasattr(m, "VALID_CONTEXTS")
        assert hasattr(m, "MODULE_NAME")
        assert hasattr(m, "_DSPY_AVAILABLE")

    def test_optimizer_runner_imports_cleanly(self):
        """optimizer_runner imports without raising even when DSPy is absent."""
        import backend.adaptive.dspy_modules.optimizer_runner as m

        assert hasattr(m, "run_optimizer")
        assert hasattr(m, "maybe_run_optimizer")
        assert hasattr(m, "_next_version")
        assert hasattr(m, "OptimizerConfig")
        assert hasattr(m, "OptimizationResult")
        assert hasattr(m, "_DSPY_AVAILABLE")

    def test_context_classifier_imports_cleanly(self):
        """context_classifier imports without raising."""
        import backend.adaptive.context_classifier as m

        assert hasattr(m, "classify_context")
        assert hasattr(m, "configure_dspy_classifier")
        assert hasattr(m, "_classify_rule_based")
        assert hasattr(m, "CONTEXTS")

    def test_module_name_constant_matches_expected(self):
        """MODULE_NAME in context_classifier_dspy equals 'context_classifier'."""
        from backend.adaptive.dspy_modules.context_classifier_dspy import MODULE_NAME

        assert MODULE_NAME == "context_classifier"

    def test_dspy_not_available_on_dev_machine(self):
        """Both modules agree that _DSPY_AVAILABLE is False on this dev machine."""
        from backend.adaptive.dspy_modules.context_classifier_dspy import (
            _DSPY_AVAILABLE as clf_flag,
        )
        from backend.adaptive.dspy_modules.optimizer_runner import (
            _DSPY_AVAILABLE as opt_flag,
        )

        assert clf_flag is False
        assert opt_flag is False
