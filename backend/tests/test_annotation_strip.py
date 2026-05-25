"""Tests for _parse_emotion_gesture() annotation stripping and incognito DB skip.

Group 1 covers the internal ``_parse_emotion_gesture()`` helper in
``backend/server.py``.  It strips bracket-style stage-direction annotations
(``[emotion:X]``, ``[gesture:X]``, ``[emotional expression: ...]``, etc.)
that LLMs sometimes emit in place of the canonical tags.

Group 2 covers the ``/api/chat/stream`` endpoint's incognito behaviour:
when ``incognito=True`` the user message must NOT be written to the database.
These tests use the ``server_module`` / ``client`` fixtures from
``conftest.py`` so every test gets a fresh, isolated SQLite database.
"""

from __future__ import annotations

import sqlite3
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Import the private helper directly from the server module.
# ``backend.server`` is heavy — importing it pulls in the FastAPI app, but
# conftest already does this at collection time so there is no extra cost.
import backend.server as _server

_parse = _server._parse_emotion_gesture


# ---------------------------------------------------------------------------
# Group 1 — _parse_emotion_gesture() unit tests
# ---------------------------------------------------------------------------


class TestParseEmotionGesture:
    """Unit tests for the annotation-stripping helper."""

    # ── Return type ────────────────────────────────────────────────────────

    def test_returns_three_tuple(self):
        """Return value is always a 3-tuple of (str, str|None, str).

        The caller in every chat endpoint unpacks exactly three values; a
        wrong arity would raise a ValueError at runtime.
        """
        result = _parse("Hello there!")
        assert isinstance(result, tuple)
        assert len(result) == 3

    # ── Canonical [emotion:X] / [gesture:X] stripping ─────────────────────

    def test_strips_canonical_emotion_tag(self):
        """[emotion:happy] is removed from the visible reply text."""
        _, _, clean = _parse("[emotion:happy] Hello there!")
        assert "[emotion:" not in clean
        assert "Hello there!" in clean

    def test_strips_canonical_gesture_tag(self):
        """[gesture:wave] is removed from the visible reply text."""
        _, _, clean = _parse("[gesture:wave] Nice to meet you.")
        assert "[gesture:" not in clean
        assert "Nice to meet you." in clean

    def test_extracts_canonical_emotion_value(self):
        """Emotion value from [emotion:happy] is captured as 'happy'."""
        emotion, _, _ = _parse("[emotion:happy] Good morning!")
        assert emotion == "happy"

    def test_extracts_canonical_gesture_value(self):
        """Gesture value from [gesture:wave] is captured."""
        _, gesture, _ = _parse("[gesture:wave] Hi!")
        assert gesture == "wave"

    def test_defaults_to_neutral_emotion_when_absent(self):
        """Emotion defaults to 'neutral' when no tag is present."""
        emotion, _, _ = _parse("Plain text with no tags.")
        assert emotion == "neutral"

    def test_defaults_to_none_gesture_when_absent(self):
        """Gesture defaults to None when no [gesture:X] tag is present."""
        _, gesture, _ = _parse("Plain text with no tags.")
        assert gesture is None

    # ── Descriptive bracket annotations ────────────────────────────────────

    def test_strips_emotional_expression_annotation(self):
        """[emotional expression: soft smile] is stripped from reply text."""
        _, _, clean = _parse("[emotional expression: soft smile] Hello there!")
        assert "[emotional expression:" not in clean
        assert "Hello there!" in clean

    def test_strips_gesture_descriptive_annotation(self):
        """[gesture: nodding gently] is stripped from reply text."""
        _, _, clean = _parse("[gesture: nodding gently] Of course!")
        assert "[gesture:" not in clean
        assert "Of course!" in clean

    def test_strips_action_annotation(self):
        """[action: she reaches out] is stripped from reply text."""
        _, _, clean = _parse("[action: she reaches out] Take my hand.")
        assert "[action:" not in clean
        assert "Take my hand." in clean

    def test_strips_mood_annotation(self):
        """[mood: contemplative] is stripped from reply text."""
        _, _, clean = _parse("[mood: contemplative] I've been thinking...")
        assert "[mood:" not in clean
        assert "I've been thinking..." in clean

    def test_strips_facial_annotation(self):
        """[facial: warm grin] is stripped from reply text."""
        _, _, clean = _parse("[facial: warm grin] That's wonderful!")
        assert "[facial:" not in clean
        assert "That's wonderful!" in clean

    def test_strips_emotion_descriptive_annotation(self):
        """[emotion: happy] (with space, descriptive style) is stripped."""
        _, _, clean = _parse("[emotion: happy] Great to see you!")
        assert "Great to see you!" in clean
        # The bracket annotation must not leak into clean text
        assert "[emotion:" not in clean

    # ── Multiple annotations in one pass ──────────────────────────────────

    def test_strips_multiple_annotations_in_one_pass(self):
        """All bracket annotations in a reply are stripped in a single call.

        Session-46 produced replies with both a canonical [emotion:X] tag and a
        descriptive [emotional expression: ...] tag in the same message.
        """
        text = "[emotion:happy] [gesture: nodding gently] [mood: warm] Hello!"
        _, _, clean = _parse(text)
        assert "[emotion:" not in clean
        assert "[gesture:" not in clean
        assert "[mood:" not in clean
        assert "Hello!" in clean

    # ── No annotations ─────────────────────────────────────────────────────

    def test_plain_text_passes_through_unchanged(self):
        """Text with no bracket annotations is returned verbatim."""
        original = "Just a normal reply with no tags at all."
        _, _, clean = _parse(original)
        assert clean == original

    # ── Text before and after annotation ──────────────────────────────────

    def test_strips_mid_sentence_annotation(self):
        """Annotation embedded between text on both sides is stripped cleanly.

        Some models place the stage direction in the middle of the reply rather
        than at the start.
        """
        text = "I smiled [gesture: reaching forward] and offered my hand."
        _, _, clean = _parse(text)
        assert "[gesture:" not in clean
        assert "I smiled" in clean
        assert "and offered my hand." in clean

    # ── Empty / boundary inputs ────────────────────────────────────────────

    def test_empty_string_returns_neutral_no_gesture(self):
        """Empty string input returns neutral emotion, None gesture, empty text.

        ``clean or text`` means both branches produce ``""`` for empty input
        (``"" or ""`` == ``""``).
        """
        emotion, gesture, clean = _parse("")
        assert emotion == "neutral"
        assert gesture is None
        assert clean == ""

    def test_annotation_only_input_fallback(self):
        """Input that is purely a bracket annotation falls back to the original text.

        Per the ``return emotion, gesture, clean or text`` contract: stripping
        all annotations from ``"[emotion:happy]"`` leaves an empty string, so
        the function returns the original *text* rather than an empty string.
        This prevents the chat UI from showing a blank bubble.
        """
        original = "[emotion:happy]"
        emotion, gesture, clean = _parse(original)
        assert emotion == "happy"
        assert clean == original  # fallback: non-empty original preferred over ""

    # ── Case-insensitive matching ──────────────────────────────────────────

    def test_case_insensitive_descriptive_tag(self):
        """[EMOTIONAL EXPRESSION: ...] (upper-case) is also stripped.

        The regex uses ``re.IGNORECASE`` so mixed-case variants from models
        that follow prompt phrasing rather than exact capitalisation still get
        stripped.
        """
        _, _, clean = _parse("[EMOTIONAL EXPRESSION: Soft Smile] Hello!")
        assert "[EMOTIONAL EXPRESSION:" not in clean
        assert "Hello!" in clean

    # ── ALL-CAPS footer artifact stripping ─────────────────────────────────

    def test_strips_all_caps_emotion_footer(self):
        """Trailing 'EMOTION: X INTENSITY: Y' footer from prompt-following models is removed.

        Some models append a structured metadata footer when the system prompt
        asks them to declare emotion at the end.
        """
        text = "It's lovely to chat with you. EMOTION: Curiosity INTENSITY: Mild"
        _, _, clean = _parse(text)
        assert "EMOTION:" not in clean
        assert "INTENSITY:" not in clean
        assert "It's lovely to chat with you." in clean


# ---------------------------------------------------------------------------
# Group 2 — /api/chat/stream incognito DB skip
# ---------------------------------------------------------------------------


class TestIncognitoDBSkip:
    """Integration tests for incognito mode in /api/chat/stream.

    When ``incognito=True``, the endpoint must NOT insert the user message
    into the ``messages`` table.  Uses the ``client`` + ``db_path`` fixtures
    from conftest so each test gets a fully isolated database.
    """

    def test_normal_chat_writes_user_message(self, client, db_path):
        """Non-incognito request inserts a user message row into the DB.

        Baseline: confirms the test harness wires up DB writes correctly so
        that the incognito-skip test is meaningful.
        """
        payload = {
            "text": "Hello baseline",
            "session_id": 101,
            "char_id": 1,
            "incognito": False,
        }
        # StreamingResponse — consume the body so the DB write completes.
        response = client.post("/api/chat/stream", json=payload)
        assert response.status_code == 200

        con = sqlite3.connect(db_path)
        try:
            rows = con.execute(
                "SELECT role, text FROM messages WHERE session_id = 101 AND role = 'user'"
            ).fetchall()
        finally:
            con.close()

        assert len(rows) >= 1, "Expected at least one user message row for non-incognito chat"
        texts = [r[1] for r in rows]
        assert any("Hello baseline" in t for t in texts)

    def test_incognito_skips_user_message_write(self, client, db_path):
        """incognito=True suppresses user message insertion into the DB.

        The session-level guard at line 5570 of server.py wraps the user
        INSERT in ``if not incognito:``.  This test verifies that branch is
        taken: after an incognito request, zero user rows exist for the session.
        """
        payload = {
            "text": "Secret whisper",
            "session_id": 202,
            "char_id": 1,
            "incognito": True,
        }
        response = client.post("/api/chat/stream", json=payload)
        assert response.status_code == 200

        con = sqlite3.connect(db_path)
        try:
            rows = con.execute(
                "SELECT role, text FROM messages WHERE session_id = 202"
            ).fetchall()
        finally:
            con.close()

        user_rows = [r for r in rows if r[0] == "user"]
        assert len(user_rows) == 0, (
            f"incognito=True should prevent user message DB write, "
            f"but found {len(user_rows)} row(s): {user_rows}"
        )

    def test_incognito_skips_assistant_message_write(self, client, db_path):
        """incognito=True also suppresses assistant reply insertion into the DB.

        The assistant INSERT is also guarded by ``if not incognito:`` (line 6082),
        so the session should remain empty after a full round-trip.
        """
        payload = {
            "text": "Another secret",
            "session_id": 303,
            "char_id": 1,
            "incognito": True,
        }
        response = client.post("/api/chat/stream", json=payload)
        assert response.status_code == 200

        con = sqlite3.connect(db_path)
        try:
            rows = con.execute(
                "SELECT COUNT(*) FROM messages WHERE session_id = 303"
            ).fetchone()
        finally:
            con.close()

        assert rows[0] == 0, (
            f"incognito session should have 0 DB rows but found {rows[0]}"
        )

    def test_incognito_false_explicitly_still_writes(self, client, db_path):
        """Passing incognito=False explicitly behaves identically to omitting it.

        Guards against a regression where the boolean coercion treats an
        explicit False differently from the default-missing-key path.
        """
        payload = {
            "text": "Explicit non-incognito message",
            "session_id": 404,
            "char_id": 1,
            "incognito": False,
        }
        response = client.post("/api/chat/stream", json=payload)
        assert response.status_code == 200

        con = sqlite3.connect(db_path)
        try:
            count = con.execute(
                "SELECT COUNT(*) FROM messages WHERE session_id = 404 AND role = 'user'"
            ).fetchone()[0]
        finally:
            con.close()

        assert count >= 1, "explicit incognito=False should still write the user message"
