"""Tests for AIE Phase C feedback subsystem.

Covers two distinct layers:

1. **Pure unit tests** for :mod:`backend.adaptive.feedback.scorer` — no I/O,
   no HTTP.  These verify the numeric formulas in isolation.

2. **API integration tests** using :class:`fastapi.testclient.TestClient` for
   the three feedback endpoints added to :mod:`backend.server`:

   - ``POST /api/feedback/explicit/{message_id}``
   - ``GET  /api/feedback/preferences``
   - ``PATCH /api/feedback/preferences``

Each API test builds on the shared ``server_module`` fixture from
``conftest.py``, which monkeypatches ``DB_PATH`` to a fresh ``tmp_path``
database for complete isolation.

A local ``feedback_client`` fixture extends that database with the three v76
tables (``message_feedback``, ``aie_signal_weights``) and the two new columns
on ``privacy_settings`` that the feedback endpoints require.
"""

from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# DDL helpers — v76 schema additions
# ---------------------------------------------------------------------------

_MESSAGE_FEEDBACK_DDL = """
CREATE TABLE IF NOT EXISTS message_feedback (
    message_id      INTEGER PRIMARY KEY,
    explicit_signal INTEGER,
    implicit_score  REAL,
    final_score     REAL,
    computed_at     TEXT    DEFAULT (strftime('%s', 'now')),
    signal_version  INTEGER DEFAULT 1
);
"""

_AIE_SIGNAL_WEIGHTS_DDL = """
CREATE TABLE IF NOT EXISTS aie_signal_weights (
    signal_name TEXT PRIMARY KEY,
    weight      REAL NOT NULL
);
INSERT OR IGNORE INTO aie_signal_weights (signal_name, weight) VALUES
    ('regenerate',            -0.5),
    ('reply_length',           0.1),
    ('voice_toggle',           0.15),
    ('session_continuation',   0.1),
    ('abrupt_close',          -0.05),
    ('llm_judge',              0.2);
"""

_PRIVACY_SETTINGS_DDL = """
CREATE TABLE IF NOT EXISTS privacy_settings (
    id                       INTEGER PRIMARY KEY DEFAULT 1
                                 CHECK (id = 1),
    signal_collection        INTEGER DEFAULT 1,
    preference_learning      INTEGER DEFAULT 1,
    behavior_adaptation      INTEGER DEFAULT 1,
    topic_tracking           INTEGER DEFAULT 1,
    intimacy_tracking        INTEGER DEFAULT 1,
    explicit_signals_enabled INTEGER DEFAULT 1,
    implicit_signals_enabled INTEGER DEFAULT 1,
    updated_at               TEXT    DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO privacy_settings (id) VALUES (1);
"""

_V76_SCHEMA = _MESSAGE_FEEDBACK_DDL + _AIE_SIGNAL_WEIGHTS_DDL + _PRIVACY_SETTINGS_DDL


# ---------------------------------------------------------------------------
# DB setup helpers
# ---------------------------------------------------------------------------


def _add_v76_tables(db_path: Path) -> None:
    """Extend an existing test DB with the v76 feedback tables and columns.

    Args:
        db_path: Path to the SQLite database file used by the test server.
    """
    con = sqlite3.connect(db_path)
    try:
        con.executescript(_V76_SCHEMA)
        con.commit()
    finally:
        con.close()


def _seed_message(db_path: Path, message_id: int = 10) -> None:
    """Insert a minimal assistant message row so FK checks pass.

    The ``conftest.py`` schema seeds session id=1 via the characters row but
    does NOT pre-create a session row.  We insert session 1 then message.

    Args:
        db_path: SQLite database path.
        message_id: ID to use for the new message row.
    """
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            "INSERT OR IGNORE INTO sessions (id, title) VALUES (1, 'test session')"
        )
        con.execute(
            """INSERT OR IGNORE INTO messages
               (id, session_id, role, text)
               VALUES (?, 1, 'assistant', 'Hello!')""",
            (message_id,),
        )
        con.commit()
    finally:
        con.close()


# ---------------------------------------------------------------------------
# No-op lifespan (same pattern as test_privacy_api.py)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def _noop_lifespan(app):
    """No-op lifespan that bypasses real startup for API tests.

    Yields:
        Nothing — simply enters and exits.
    """
    yield


# ---------------------------------------------------------------------------
# Fixture: feedback_client
# ---------------------------------------------------------------------------


@pytest.fixture()
def feedback_client(server_module, tmp_path):
    """TestClient with the v76 feedback tables in the test DB.

    Extends the shared ``server_module`` fixture (which monkeypatches
    ``DB_PATH`` to a fresh tmp_path DB) with the three v76 tables and a
    seeded assistant message for endpoint tests that require a valid
    ``message_id``.

    Args:
        server_module: Pytest fixture from ``conftest.py``.
        tmp_path: Pytest built-in (for explicit dependency documentation).

    Yields:
        :class:`fastapi.testclient.TestClient` connected to the test DB.
    """
    _add_v76_tables(server_module.DB_PATH)
    _seed_message(server_module.DB_PATH, message_id=10)

    original_lifespan = server_module.app.router.lifespan_context
    server_module.app.router.lifespan_context = _noop_lifespan
    try:
        with TestClient(server_module.app) as test_client:
            yield test_client
    finally:
        server_module.app.router.lifespan_context = original_lifespan


# ===========================================================================
# SECTION 1: Pure unit tests for scorer.py
# ===========================================================================


class TestComputeImplicitScore:
    """Unit tests for :func:`backend.adaptive.feedback.scorer.compute_implicit_score`."""

    def test_compute_implicit_score_returns_clamped_value(self):
        """Weighted sum is clamped to [-1.0, 1.0].

        With weights = {"regenerate": -0.5} and signals = {"regenerate": 0.5}:
            raw = 0.5 * (-0.5) = -0.25
        No clamp needed — result is -0.25.
        """
        from backend.adaptive.feedback.scorer import compute_implicit_score

        weights = {"regenerate": -0.5}
        signals = {"regenerate": 0.5}
        score = compute_implicit_score(signals, weights)
        assert score == pytest.approx(-0.25)

    def test_compute_implicit_score_clamps_above_one(self):
        """Raw weighted sum > 1.0 is clamped to exactly 1.0."""
        from backend.adaptive.feedback.scorer import compute_implicit_score

        weights = {"session_continuation": 1.0}
        signals = {"session_continuation": 5.0}
        score = compute_implicit_score(signals, weights)
        assert score == pytest.approx(1.0)

    def test_compute_implicit_score_clamps_below_negative_one(self):
        """Raw weighted sum < -1.0 is clamped to exactly -1.0."""
        from backend.adaptive.feedback.scorer import compute_implicit_score

        weights = {"regenerate": -1.0}
        signals = {"regenerate": 3.0}
        score = compute_implicit_score(signals, weights)
        assert score == pytest.approx(-1.0)

    def test_compute_implicit_score_empty_signals_returns_zero(self):
        """Empty signals dict returns 0.0 — no division error, no key errors."""
        from backend.adaptive.feedback.scorer import compute_implicit_score

        weights = {"regenerate": -0.5, "session_continuation": 0.1}
        score = compute_implicit_score({}, weights)
        assert score == pytest.approx(0.0)

    def test_compute_implicit_score_unknown_signal_ignored(self):
        """Signal keys absent from weights contribute 0.0 to the sum."""
        from backend.adaptive.feedback.scorer import compute_implicit_score

        weights = {"regenerate": -0.5}
        signals = {"regenerate": 0.0, "unknown_signal": 99.0}
        score = compute_implicit_score(signals, weights)
        # unknown_signal not in weights → only regenerate contributes 0 * -0.5 = 0.0
        assert score == pytest.approx(0.0)

    def test_compute_implicit_score_multiple_signals(self):
        """Multiple contributing signals are summed correctly before clamping."""
        from backend.adaptive.feedback.scorer import compute_implicit_score

        # regenerate: 0.5 * (-0.5) = -0.25
        # session_continuation: 1.0 * 0.1 = 0.10
        # sum = -0.15
        weights = {"regenerate": -0.5, "session_continuation": 0.1}
        signals = {"regenerate": 0.5, "session_continuation": 1.0}
        score = compute_implicit_score(signals, weights)
        assert score == pytest.approx(-0.15)


# ---------------------------------------------------------------------------


class TestComputeFinalScore:
    """Unit tests for :func:`backend.adaptive.feedback.scorer.compute_final_score`."""

    def test_compute_final_score_with_explicit_thumbs_up(self):
        """explicit=1, implicit=0.2 → 0.7*1 + 0.3*0.2 = 0.76."""
        from backend.adaptive.feedback.scorer import compute_final_score

        score = compute_final_score(explicit_signal=1, implicit_score=0.2)
        assert score == pytest.approx(0.76)

    def test_compute_final_score_with_explicit_thumbs_down(self):
        """explicit=-1, implicit=0.0 → 0.7*(-1) + 0.3*0.0 = -0.70."""
        from backend.adaptive.feedback.scorer import compute_final_score

        score = compute_final_score(explicit_signal=-1, implicit_score=0.0)
        assert score == pytest.approx(-0.70)

    def test_compute_final_score_no_explicit_uses_implicit_only(self):
        """explicit=None, implicit=0.5 → alpha_implicit=1.0 → result = 0.5."""
        from backend.adaptive.feedback.scorer import compute_final_score

        score = compute_final_score(explicit_signal=None, implicit_score=0.5)
        assert score == pytest.approx(0.5)

    def test_compute_final_score_no_explicit_negative_implicit(self):
        """explicit=None, implicit=-0.3 → result = -0.3 (implicit carries full weight)."""
        from backend.adaptive.feedback.scorer import compute_final_score

        score = compute_final_score(explicit_signal=None, implicit_score=-0.3)
        assert score == pytest.approx(-0.3)

    def test_compute_final_score_invalid_explicit_treated_as_none(self):
        """explicit=2 (out of range) is treated the same as None — implicit carries full weight."""
        from backend.adaptive.feedback.scorer import compute_final_score

        score_invalid = compute_final_score(explicit_signal=2, implicit_score=0.4)
        score_none = compute_final_score(explicit_signal=None, implicit_score=0.4)
        assert score_invalid == pytest.approx(score_none)

    def test_compute_final_score_result_within_bounds(self):
        """Final score always stays in [-1.0, 1.0] for any valid inputs."""
        from backend.adaptive.feedback.scorer import compute_final_score

        for explicit in (1, -1, None):
            for implicit in (-1.0, -0.5, 0.0, 0.5, 1.0):
                score = compute_final_score(explicit_signal=explicit, implicit_score=implicit)
                assert -1.0 <= score <= 1.0, (
                    f"Score {score} out of bounds for explicit={explicit}, implicit={implicit}"
                )

    def test_compute_final_score_blending_formula_explicit_present(self):
        """With explicit present, formula is 0.7*explicit + 0.3*implicit (alphas sum to 1)."""
        from backend.adaptive.feedback.scorer import compute_final_score

        # Verify docstring example: explicit=1, implicit=0.4 → 0.7*1 + 0.3*0.4 = 0.82
        score = compute_final_score(explicit_signal=1, implicit_score=0.4)
        assert score == pytest.approx(0.82)


# ---------------------------------------------------------------------------


class TestGetSignalWeights:
    """Unit tests for :func:`backend.adaptive.feedback.scorer.get_signal_weights`."""

    def test_get_signal_weights_falls_back_to_defaults_for_memory_db(self):
        """Passing ':memory:' (no table) returns a copy of DEFAULT_WEIGHTS.

        The ':memory:' URI is a read-only open that will fail gracefully since
        :memory: databases cannot be opened via URI in read-only mode — the
        function should catch this and return defaults.
        """
        from backend.adaptive.feedback.scorer import DEFAULT_WEIGHTS, get_signal_weights

        weights = get_signal_weights(":memory:")
        # Must contain at least all default keys with correct default values.
        for key, default_val in DEFAULT_WEIGHTS.items():
            assert key in weights, f"Key {key!r} missing from fallback weights"
            assert weights[key] == pytest.approx(default_val), (
                f"Weight for {key!r}: expected {default_val}, got {weights[key]}"
            )

    def test_get_signal_weights_falls_back_for_missing_table(self, tmp_path):
        """DB with no aie_signal_weights table returns DEFAULT_WEIGHTS."""
        from backend.adaptive.feedback.scorer import DEFAULT_WEIGHTS, get_signal_weights

        db_path = tmp_path / "empty.db"
        # Create an empty DB (no tables at all).
        con = sqlite3.connect(db_path)
        con.close()

        weights = get_signal_weights(str(db_path))
        assert set(DEFAULT_WEIGHTS.keys()) <= set(weights.keys())
        for key, default_val in DEFAULT_WEIGHTS.items():
            assert weights[key] == pytest.approx(default_val)

    def test_get_signal_weights_reads_overrides_from_db(self, tmp_path):
        """Values in aie_signal_weights override the defaults for matching keys."""
        from backend.adaptive.feedback.scorer import get_signal_weights

        db_path = tmp_path / "weights.db"
        con = sqlite3.connect(db_path)
        try:
            con.execute(
                "CREATE TABLE aie_signal_weights (signal_name TEXT PRIMARY KEY, weight REAL)"
            )
            # Override one key to a completely different value.
            con.execute(
                "INSERT INTO aie_signal_weights VALUES ('regenerate', 0.99)"
            )
            con.commit()
        finally:
            con.close()

        weights = get_signal_weights(str(db_path))
        assert weights["regenerate"] == pytest.approx(0.99)

    def test_get_signal_weights_returns_dict_not_none(self):
        """Return value is always a dict, never None."""
        from backend.adaptive.feedback.scorer import get_signal_weights

        result = get_signal_weights(":memory:")
        assert isinstance(result, dict)

    def test_get_signal_weights_db_adds_keys_to_defaults(self, tmp_path):
        """DB rows for new signal names are merged on top of DEFAULT_WEIGHTS."""
        from backend.adaptive.feedback.scorer import DEFAULT_WEIGHTS, get_signal_weights

        db_path = tmp_path / "extra.db"
        con = sqlite3.connect(db_path)
        try:
            con.execute(
                "CREATE TABLE aie_signal_weights (signal_name TEXT PRIMARY KEY, weight REAL)"
            )
            con.execute("INSERT INTO aie_signal_weights VALUES ('brand_new_signal', 0.42)")
            con.commit()
        finally:
            con.close()

        weights = get_signal_weights(str(db_path))
        # All default keys still present.
        assert set(DEFAULT_WEIGHTS.keys()) <= set(weights.keys())
        # New key also present.
        assert "brand_new_signal" in weights
        assert weights["brand_new_signal"] == pytest.approx(0.42)


# ===========================================================================
# SECTION 2: API endpoint tests
# ===========================================================================


class TestGetFeedbackPreferences:
    """Tests for ``GET /api/feedback/preferences``."""

    def test_get_feedback_preferences_defaults(self, feedback_client):
        """Both feedback flags default to True after v76 table creation."""
        resp = feedback_client.get("/api/feedback/preferences")
        assert resp.status_code == 200
        data = resp.json()
        assert data["explicit_signals_enabled"] is True
        assert data["implicit_signals_enabled"] is True

    def test_get_feedback_preferences_returns_exactly_two_keys(self, feedback_client):
        """Response contains exactly the two documented preference keys."""
        resp = feedback_client.get("/api/feedback/preferences")
        assert resp.status_code == 200
        assert set(resp.json().keys()) == {"explicit_signals_enabled", "implicit_signals_enabled"}

    def test_get_feedback_preferences_no_table_returns_true_defaults(self, server_module):
        """When privacy_settings lacks the feedback columns, defaults are True (safe fallback)."""
        # Use base server_module without adding v76 tables.
        original_lifespan = server_module.app.router.lifespan_context
        server_module.app.router.lifespan_context = _noop_lifespan
        try:
            with TestClient(server_module.app) as client:
                resp = client.get("/api/feedback/preferences")
                assert resp.status_code == 200
                data = resp.json()
                assert data["explicit_signals_enabled"] is True
                assert data["implicit_signals_enabled"] is True
        finally:
            server_module.app.router.lifespan_context = original_lifespan


# ---------------------------------------------------------------------------


class TestUpdateFeedbackPreferences:
    """Tests for ``PATCH /api/feedback/preferences``."""

    def test_update_feedback_preferences_explicit_off(self, feedback_client):
        """PATCH with explicit_signals_enabled=false returns preferences with that flag False."""
        resp = feedback_client.patch(
            "/api/feedback/preferences",
            json={"explicit_signals_enabled": False},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["preferences"]["explicit_signals_enabled"] is False

    def test_update_feedback_preferences_implicit_off(self, feedback_client):
        """PATCH with implicit_signals_enabled=false reflects in the response."""
        resp = feedback_client.patch(
            "/api/feedback/preferences",
            json={"implicit_signals_enabled": False},
        )
        assert resp.status_code == 200
        assert resp.json()["preferences"]["implicit_signals_enabled"] is False

    def test_update_feedback_preferences_persists_to_get(self, feedback_client):
        """PATCH change is visible in a subsequent GET call."""
        feedback_client.patch(
            "/api/feedback/preferences",
            json={"explicit_signals_enabled": False},
        )
        resp = feedback_client.get("/api/feedback/preferences")
        assert resp.status_code == 200
        assert resp.json()["explicit_signals_enabled"] is False

    def test_update_feedback_preferences_re_enable(self, feedback_client):
        """A disabled flag can be re-enabled by a second PATCH."""
        feedback_client.patch(
            "/api/feedback/preferences",
            json={"explicit_signals_enabled": False},
        )
        feedback_client.patch(
            "/api/feedback/preferences",
            json={"explicit_signals_enabled": True},
        )
        resp = feedback_client.get("/api/feedback/preferences")
        assert resp.json()["explicit_signals_enabled"] is True

    def test_update_feedback_preferences_both_flags(self, feedback_client):
        """Both flags can be updated in a single PATCH request."""
        resp = feedback_client.patch(
            "/api/feedback/preferences",
            json={"explicit_signals_enabled": False, "implicit_signals_enabled": False},
        )
        assert resp.status_code == 200
        prefs = resp.json()["preferences"]
        assert prefs["explicit_signals_enabled"] is False
        assert prefs["implicit_signals_enabled"] is False

    def test_update_feedback_preferences_invalid_keys_returns_400(self, feedback_client):
        """PATCH with only unknown keys returns 400 — no valid keys supplied."""
        resp = feedback_client.patch(
            "/api/feedback/preferences",
            json={"garbage_key": True},
        )
        assert resp.status_code == 400

    def test_update_feedback_preferences_empty_body_returns_400(self, feedback_client):
        """PATCH with an empty JSON body returns 400."""
        resp = feedback_client.patch("/api/feedback/preferences", json={})
        assert resp.status_code == 400


# ---------------------------------------------------------------------------


class TestRecordExplicitFeedback:
    """Tests for ``POST /api/feedback/explicit/{message_id}``."""

    def test_record_explicit_thumbs_up(self, feedback_client):
        """signal=1 on a valid message returns 200 with signal=1."""
        resp = feedback_client.post(
            "/api/feedback/explicit/10",
            json={"signal": 1},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["message_id"] == 10
        assert data["signal"] == 1

    def test_record_explicit_thumbs_down(self, feedback_client):
        """signal=-1 on a valid message returns 200 with signal=-1."""
        resp = feedback_client.post(
            "/api/feedback/explicit/10",
            json={"signal": -1},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["signal"] == -1

    def test_record_explicit_clear(self, feedback_client):
        """signal=null clears a previous vote and returns signal=null."""
        # First record a thumbs-up.
        feedback_client.post("/api/feedback/explicit/10", json={"signal": 1})
        # Now clear it.
        resp = feedback_client.post(
            "/api/feedback/explicit/10",
            json={"signal": None},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["signal"] is None

    def test_record_explicit_invalid_signal_returns_422(self, feedback_client):
        """signal=2 (not in {-1, 1, null}) returns 422 — Pydantic Literal validation."""
        resp = feedback_client.post(
            "/api/feedback/explicit/10",
            json={"signal": 2},
        )
        assert resp.status_code == 422

    def test_record_explicit_missing_message_returns_404(self, feedback_client):
        """POST on a non-existent message_id returns 404."""
        resp = feedback_client.post(
            "/api/feedback/explicit/99999",
            json={"signal": 1},
        )
        assert resp.status_code == 404

    def test_record_explicit_idempotent_overwrite(self, feedback_client):
        """Recording feedback twice for the same message updates rather than duplicating."""
        feedback_client.post("/api/feedback/explicit/10", json={"signal": 1})
        resp = feedback_client.post("/api/feedback/explicit/10", json={"signal": -1})
        assert resp.status_code == 200
        assert resp.json()["signal"] == -1

    def test_record_explicit_signal_zero_returns_422(self, feedback_client):
        """signal=0 is not a valid vote value — Pydantic Literal rejects it with 422."""
        resp = feedback_client.post(
            "/api/feedback/explicit/10",
            json={"signal": 0},
        )
        assert resp.status_code == 422

    def test_record_explicit_large_negative_invalid(self, feedback_client):
        """signal=-2 (not in {-1, 1}) returns 422 — Pydantic Literal validation."""
        resp = feedback_client.post(
            "/api/feedback/explicit/10",
            json={"signal": -2},
        )
        assert resp.status_code == 422

    def test_record_explicit_persists_to_db(self, feedback_client, server_module):
        """After a successful POST, the row appears in message_feedback."""
        feedback_client.post("/api/feedback/explicit/10", json={"signal": 1})

        con = sqlite3.connect(server_module.DB_PATH)
        try:
            row = con.execute(
                "SELECT explicit_signal FROM message_feedback WHERE message_id = 10"
            ).fetchone()
        finally:
            con.close()

        assert row is not None, "Expected a row in message_feedback after POST"
        assert row[0] == 1
