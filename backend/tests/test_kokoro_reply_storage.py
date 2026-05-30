"""Regression tests for Kokoro reply persistence (chat-continuity corruption).

Bug (found 2026-05-30 audit): when ``kokoro_enabled`` is on, the streaming chat
path injects a JSON-envelope contract, so the model emits
``{"reply": "...", "emotion": ...}``.  The post-stream cleaner
``_parse_emotion_gesture`` only strips ``[tag]`` annotations — it does NOT parse
JSON — so the raw blob was persisted to ``messages.text``.  That blob then:

  1. shows as raw JSON in reloaded history, and
  2. is re-injected verbatim into every future turn by the context assembler
     (``context_assembler.py`` reads ``text`` WHERE is_active=1).

The fix extracts the ``reply`` field from the envelope *before* the existing
cleaning pipeline runs, via ``_strip_kokoro_envelope``, so all downstream
consumers (DB insert, vector memory, XP, TTS, done-event) receive clean text.
A plain-text (non-Kokoro) turn must pass through unchanged.
"""
from __future__ import annotations

import json

import backend.server as _server

_strip = _server._strip_kokoro_envelope
_parse = _server._parse_emotion_gesture


def _kokoro_blob(reply: str = "hey, missed you today") -> str:
    """Build a realistic Kokoro JSON envelope as the model would emit it."""
    return json.dumps(
        {
            "reply": reply,
            "innerThought": "he seems tired",
            "emotion": "soft",
            "facialExpression": "soft_smile",
            "gesture": "small_nod",
            "gaze": "user",
            "voiceStyle": "warm",
            "stateDelta": {"warmth": 0.02},
            "memoryWrite": {"shouldSave": False},
        }
    )


class TestStripKokoroEnvelope:
    """Unit coverage for the kokoro-aware reply extractor."""

    def test_extracts_reply_from_json_envelope_when_active(self) -> None:
        blob = _kokoro_blob("hey, missed you today")
        assert _strip(blob, kokoro_active=True) == "hey, missed you today"

    def test_passes_plain_text_through_when_active(self) -> None:
        # Model emitted plain text despite the contract — must not be mangled.
        assert _strip("just plain words", kokoro_active=True) == "just plain words"

    def test_no_op_when_kokoro_inactive(self) -> None:
        blob = _kokoro_blob("hi")
        # Non-kokoro turn: even if it happens to look like JSON, leave it alone
        # (the JSON contract was never injected, so this path is unreachable in
        # practice, but the helper must be a strict no-op when inactive).
        assert _strip(blob, kokoro_active=False) == blob

    def test_empty_reply_field_falls_back_to_raw(self) -> None:
        blob = json.dumps({"reply": "", "emotion": "neutral"})
        # An empty reply is useless; fall back to the raw text rather than
        # persisting an empty message.
        assert _strip(blob, kokoro_active=True) == blob


class TestReproducesBug:
    """Locks in the root-cause: the old cleaner did not strip JSON."""

    def test_parse_emotion_gesture_does_not_strip_json(self) -> None:
        blob = _kokoro_blob("hello")
        _emotion, _gesture, clean = _parse(blob)
        # The raw blob survives _parse_emotion_gesture unchanged — this is why
        # the envelope must be stripped *before* this stage.
        assert '"reply"' in clean

    def test_pipeline_order_yields_clean_text(self) -> None:
        # Mirror the server's fixed order: strip envelope, THEN tag-clean.
        blob = _kokoro_blob("see you tomorrow")
        stripped = _strip(blob, kokoro_active=True)
        _emotion, _gesture, clean = _parse(stripped)
        assert clean == "see you tomorrow"
        assert "{" not in clean
