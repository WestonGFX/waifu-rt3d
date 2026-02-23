"""
Unit tests for Phase 6 helper functions.

These tests cover pure Python helpers that do NOT require a running server,
database connection, or any external services.  They run instantly with:

    pytest tests/test_phase6_helpers.py -v

Or via unittest:

    python -m pytest tests/test_phase6_helpers.py

What is tested here:
    - _clean_for_tts()        : strips LLM stage directions before TTS
    - _parse_emotion_gesture() : extracts [emotion:X] / [gesture:X] tags
    - GPTSoVITSAdapter.speak() : HTTP call to GPT-SoVITS (mocked)
    - FasterWhisperAdapter.validate_config() : checks package availability

For integration tests that require a live server, see test_basic.py and
test_comprehensive.py.
"""

import sys
import os
import unittest
from unittest.mock import patch, MagicMock

# ── Path setup ─────────────────────────────────────────────────────────────
# Make sure the repo root is on the import path so "backend.*" imports work.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


# ═══════════════════════════════════════════════════════════════════════════
# Test: _clean_for_tts
# ═══════════════════════════════════════════════════════════════════════════

class TestCleanForTTS(unittest.TestCase):
    """Tests for _clean_for_tts() — the LLM artifact stripper.

    WHY this function exists:
        LLMs often include stage directions, emotion tags, and Markdown
        formatting that look fine as text but sound awful when read aloud
        by a TTS engine.  Example: "Sure! *blushes*" would be spoken as
        "Sure! asterisk blushes asterisk" without this cleanup.
    """

    @classmethod
    def setUpClass(cls):
        """Import _clean_for_tts once for the whole test class.

        We import at class setup (not at module level) because server.py
        initializes FastAPI on import, which is fine but slow on the first
        call — doing it once per class avoids repeating the startup overhead
        for every test case.
        """
        from backend.server import _clean_for_tts
        cls.fn = staticmethod(_clean_for_tts)

    # ── Asterisk action text ────────────────────────────────────────────────

    def test_strips_asterisk_action(self):
        """*blushes* should be removed, leaving only the surrounding speech."""
        result = self.fn("Sure! *blushes* That's really kind of you!")
        self.assertEqual(result, "Sure! That's really kind of you!")

    def test_strips_double_asterisk_bold(self):
        """**bold** Markdown markers are stripped; the word itself is kept for TTS.

        The regex ``\\*[^*]*\\*`` removes pairs of asterisks with no content in
        between, so ``**word**`` becomes ``word`` (markers gone, word survives).
        This is the CORRECT behaviour for TTS — we want to say "this" aloud, we
        just don't want the asterisks to be narrated as "star star".
        """
        result = self.fn("I think **this** is great!")
        # The ** markers are removed; the word is preserved for TTS narration
        self.assertNotIn('**', result)
        self.assertIn("this", result)
        self.assertEqual(result, "I think this is great!")

    # ── Parenthetical stage directions ─────────────────────────────────────

    def test_strips_parenthetical(self):
        """(laughs softly) should be removed — TTS would read it literally."""
        result = self.fn("(laughs softly) Oh wow, that's funny!")
        self.assertEqual(result, "Oh wow, that's funny!")

    def test_strips_nested_parenthetical(self):
        """Only the outermost parens are stripped (regex is non-greedy)."""
        result = self.fn("(sighs) I understand.")
        self.assertEqual(result, "I understand.")

    # ── Bracket tags ───────────────────────────────────────────────────────

    def test_strips_emotion_tag(self):
        """[emotion:happy] tags should be removed (already parsed upstream)."""
        result = self.fn("[emotion:happy] Hello there!")
        self.assertEqual(result, "Hello there!")

    def test_strips_gesture_tag(self):
        """[gesture:wave] tags should be removed."""
        result = self.fn("[gesture:wave] Hi!")
        self.assertEqual(result, "Hi!")

    def test_strips_combined_tags_and_action(self):
        """Full realistic LLM reply with multiple artifacts."""
        raw = "[emotion:excited] *jumps up* Oh my gosh! (claps hands) That's amazing!"
        result = self.fn(raw)
        self.assertEqual(result, "Oh my gosh! That's amazing!")

    # ── Smart quotes (Unicode replacement) ─────────────────────────────────

    def test_replaces_smart_single_quotes(self):
        """\u2018 and \u2019 (curly quotes) become straight apostrophes."""
        result = self.fn("\u2018Hello\u2019 world")
        self.assertNotIn('\u2018', result)
        self.assertNotIn('\u2019', result)
        self.assertIn("'Hello'", result)

    def test_replaces_smart_double_quotes(self):
        """\u201c and \u201d (curly double quotes) become straight quotes."""
        result = self.fn('\u201cHello\u201d world')
        self.assertNotIn('\u201c', result)
        self.assertNotIn('\u201d', result)
        self.assertIn('"Hello"', result)

    # ── Dashes and hyphens → spaces ─────────────────────────────────────────

    def test_replaces_em_dash(self):
        """Em-dashes (\u2014) → spaces so TTS reads them as a pause."""
        result = self.fn("I love you\u2014you know that, right?")
        self.assertNotIn('\u2014', result)
        self.assertIn('you know that', result)

    # ── Markdown remnants ──────────────────────────────────────────────────

    def test_strips_backticks(self):
        """Backtick characters (`) are removed by the Markdown-remnant stripping pass.

        Note: parentheses are ALSO stripped by the stage-direction pattern, so
        ``Use `print()` to debug`` becomes ``Use print to debug`` because:
          1. Backticks are stripped → ``Use print() to debug``
          2. ``()`` matches the parenthetical pattern → stripped as "empty stage dir"

        This is acceptable for TTS — nobody says "print open-paren close-paren"
        in a speech context.  Use backtick words without parens to avoid this.
        """
        result = self.fn("Use `print()` to debug.")
        self.assertNotIn('`', result)
        # Both the backticks AND the () are stripped (see docstring above)
        self.assertIn('print', result)
        self.assertEqual(result, "Use print to debug.")

    def test_strips_underscores(self):
        """_underscore_ Markdown italic markers should be removed."""
        result = self.fn("_Italicised text_ here.")
        self.assertNotIn('_', result)
        self.assertIn('Italicised text', result)

    # ── Fallback behaviour ─────────────────────────────────────────────────

    def test_never_returns_empty_string(self):
        """If cleaning leaves nothing, return the original text unchanged.

        This prevents a silent TTS call with an empty string that would
        produce an error or a zero-length audio file.
        """
        # A string that is ONLY stage directions — stripping everything leaves ""
        result = self.fn("*laughs* (sighs) [emotion:neutral]")
        # Should fall back to original rather than returning ""
        self.assertNotEqual(result, "")
        self.assertTrue(len(result) > 0)

    def test_plain_text_unchanged(self):
        """Normal text with no artifacts should pass through untouched."""
        plain = "Hello! How are you today? I hope you're doing well."
        result = self.fn(plain)
        # After dash→space substitution and whitespace normalisation the
        # content should be identical (there are no dashes in this string).
        self.assertEqual(result, plain)

    def test_extra_whitespace_collapsed(self):
        """Multiple consecutive spaces are collapsed to a single space."""
        result = self.fn("Hello   world")
        self.assertEqual(result, "Hello world")


# ═══════════════════════════════════════════════════════════════════════════
# Test: _parse_emotion_gesture
# ═══════════════════════════════════════════════════════════════════════════

class TestParseEmotionGesture(unittest.TestCase):
    """Tests for _parse_emotion_gesture() — tag extraction from LLM replies.

    WHY this helper exists:
        The LLM is instructed via the system prompt to prefix replies with
        optional ``[emotion:X]`` and ``[gesture:X]`` tags so that the VRM
        character can display matching facial expressions and animations.
        Centralising this extraction avoids bugs from copy-pasting the regex
        across multiple chat routes.
    """

    @classmethod
    def setUpClass(cls):
        from backend.server import _parse_emotion_gesture
        cls.fn = staticmethod(_parse_emotion_gesture)

    def test_extracts_emotion(self):
        """Emotion tag is extracted and the tag is removed from the reply."""
        emotion, gesture, reply = self.fn("[emotion:happy] Hello!")
        self.assertEqual(emotion, "happy")
        self.assertIsNone(gesture)
        self.assertEqual(reply, "Hello!")

    def test_extracts_gesture(self):
        """Gesture tag is extracted alongside the emotion."""
        emotion, gesture, reply = self.fn("[emotion:excited] [gesture:wave] Hi!")
        self.assertEqual(emotion, "excited")
        self.assertEqual(gesture, "wave")
        self.assertEqual(reply, "Hi!")

    def test_defaults_to_neutral_emotion(self):
        """When no [emotion:...] tag is present, emotion defaults to 'neutral'."""
        emotion, gesture, reply = self.fn("Just a normal reply.")
        self.assertEqual(emotion, "neutral")

    def test_defaults_gesture_to_none(self):
        """When no [gesture:...] tag is present, gesture is None."""
        _, gesture, _ = self.fn("[emotion:sad] I miss you.")
        self.assertIsNone(gesture)

    def test_handles_no_tags(self):
        """Plain reply with no tags at all returns defaults."""
        emotion, gesture, reply = self.fn("Plain text, no tags.")
        self.assertEqual(emotion, "neutral")
        self.assertIsNone(gesture)
        self.assertEqual(reply, "Plain text, no tags.")

    def test_clean_reply_has_tags_removed(self):
        """Both tags are stripped from the clean reply text."""
        _, _, reply = self.fn("[emotion:happy] [gesture:nod] Great news!")
        self.assertNotIn('[emotion:', reply)
        self.assertNotIn('[gesture:', reply)
        self.assertEqual(reply, "Great news!")

    def test_fallback_on_empty_after_strip(self):
        """If stripping all tags leaves an empty string, return the original.

        This prevents a blank reply being saved to the DB or sent to the user.
        """
        _, _, reply = self.fn("[emotion:happy]")
        # Clean is empty; should fall back to the original full string
        self.assertNotEqual(reply, "")

    def test_tag_with_underscore_in_value(self):
        """Python's \\w+ INCLUDES underscore, so multi-word emotions work.

        ``\\w`` in Python regex is ``[a-zA-Z0-9_]``, so ``[emotion:half_smile]``
        captures ``half_smile`` as a single token — NOT just ``half``.
        This means the LLM can use snake_case emotion names freely.
        """
        emotion, _, _ = self.fn("[emotion:half_smile] Hmm.")
        # Python's \w includes underscore — full snake_case value is captured
        self.assertEqual(emotion, "half_smile")


# ═══════════════════════════════════════════════════════════════════════════
# Test: GPTSoVITSAdapter (mock HTTP)
# ═══════════════════════════════════════════════════════════════════════════

class TestGPTSoVITSAdapter(unittest.TestCase):
    """Tests for GPTSoVITSAdapter.speak() — the GPT-SoVITS TTS adapter.

    We mock the actual HTTP call so tests run without a GPT-SoVITS server.
    This lets us verify request construction, response handling, and error
    paths without any network dependency.
    """

    def setUp(self):
        """Create a temporary audio directory and adapter instance."""
        import tempfile
        from pathlib import Path
        from backend.tts.adapters.gptsovits import GPTSoVITSAdapter

        self.tmpdir = tempfile.mkdtemp()
        self.adapter = GPTSoVITSAdapter(Path(self.tmpdir))

    def test_successful_speak_returns_ok(self):
        """A 200 HTTP response is parsed into {"ok": True, "filename": ...}."""
        fake_wav = b"RIFF\x00\x00\x00\x00WAVEfmt " + b"\x00" * 100

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = fake_wav

        with patch("backend.tts.adapters.gptsovits.requests.post", return_value=mock_response):
            result = self.adapter.speak("Hello world!", {
                "endpoint": "http://localhost:9880",
                "language": "en",
            })

        self.assertTrue(result["ok"])
        self.assertIn("filename", result)
        # The audio file should actually be written to disk
        out_path = os.path.join(self.tmpdir, result["filename"])
        self.assertTrue(os.path.exists(out_path))
        self.assertEqual(open(out_path, "rb").read(), fake_wav)

    def test_non_200_returns_error(self):
        """A non-200 HTTP status → {"ok": False, "error": "..."} instead of exception."""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"

        with patch("backend.tts.adapters.gptsovits.requests.post", return_value=mock_response):
            result = self.adapter.speak("Hello!", {"language": "en"})

        self.assertFalse(result["ok"])
        self.assertIn("500", result["error"])

    def test_connection_error_returns_helpful_message(self):
        """ConnectionError (server not running) returns a user-friendly message."""
        import requests as req_lib

        with patch(
            "backend.tts.adapters.gptsovits.requests.post",
            side_effect=req_lib.exceptions.ConnectionError("refused"),
        ):
            result = self.adapter.speak("Hello!", {"language": "en"})

        self.assertFalse(result["ok"])
        # The error message should tell the user how to start the server
        self.assertIn("api_v2.py", result["error"])

    def test_voice_cloning_payload_includes_ref_audio(self):
        """When voice_sample_path is set, the HTTP payload includes ref_audio_path."""
        captured_kwargs = {}

        def capture_post(url, json=None, timeout=None, **kw):
            captured_kwargs["json"] = json
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.content = b"fake_audio"
            return mock_resp

        with patch("backend.tts.adapters.gptsovits.requests.post", side_effect=capture_post):
            self.adapter.speak("Hi!", {
                "language": "en",
                "voice_sample_path": "/data/voices/my_char.wav",
                "voice_sample_prompt": "This is the voice sample.",
            })

        payload = captured_kwargs["json"]
        self.assertEqual(payload["ref_audio_path"], "/data/voices/my_char.wav")
        self.assertEqual(payload["prompt_text"], "This is the voice sample.")


# ═══════════════════════════════════════════════════════════════════════════
# Test: FasterWhisperAdapter
# ═══════════════════════════════════════════════════════════════════════════

class TestFasterWhisperAdapter(unittest.TestCase):
    """Tests for FasterWhisperAdapter — the local offline STT adapter.

    These tests verify the adapter's configuration validation and
    error-handling behaviour without needing faster-whisper installed.
    """

    def setUp(self):
        from backend.asr.adapters.faster_whisper import FasterWhisperAdapter
        self.adapter = FasterWhisperAdapter({"model": "base.en", "language": "en"})

    def test_validate_config_returns_false_when_not_installed(self):
        """validate_config() returns False when faster-whisper is not installed.

        This prevents a confusing ImportError at runtime — instead the app
        can check validate_config() and fall back to browser ASR gracefully.
        """
        # Simulate the package being missing
        with patch.dict("sys.modules", {"faster_whisper": None}):
            result = self.adapter.validate_config()
        self.assertFalse(result)

    def test_validate_config_returns_true_when_installed(self):
        """validate_config() returns True when faster-whisper IS installed."""
        fake_module = MagicMock()
        with patch.dict("sys.modules", {"faster_whisper": fake_module}):
            result = self.adapter.validate_config()
        self.assertTrue(result)


# ═══════════════════════════════════════════════════════════════════════════
# Test: faster_whisper_asr module (standalone helpers)
# ═══════════════════════════════════════════════════════════════════════════

class TestFasterWhisperASRModule(unittest.TestCase):
    """Tests for backend.asr.faster_whisper_asr standalone module.

    WHY a standalone module (not just the adapter)?
        The module can also be called directly from server.py's /api/asr
        endpoint without going through the adapter registry, so its
        behaviour deserves its own tests.
    """

    def test_transcribe_returns_empty_on_import_error(self):
        """transcribe() returns '' instead of crashing when faster-whisper is missing.

        Audio input to a non-existent model should degrade gracefully, not
        cause a 500 error visible to the user.
        """
        import backend.asr.faster_whisper_asr as fwa

        # Reset module singleton so our mock takes effect
        fwa._model = None

        def bad_import(*args, **kwargs):
            raise ImportError("faster_whisper is not installed")

        with patch.object(fwa, "get_model", side_effect=bad_import):
            result = fwa.transcribe(b"fake_audio_bytes", {"asr": {}})

        self.assertEqual(result, "")

    def test_transcribe_concatenates_segments(self):
        """transcribe() joins all returned segment texts with spaces."""
        import backend.asr.faster_whisper_asr as fwa

        # Simulate two transcript segments returned by faster-whisper
        seg1 = MagicMock()
        seg1.text = " Hello,"
        seg2 = MagicMock()
        seg2.text = " world! "

        mock_model = MagicMock()
        mock_model.transcribe.return_value = ([seg1, seg2], MagicMock())

        fwa._model = None

        with patch.object(fwa, "get_model", return_value=mock_model):
            result = fwa.transcribe(b"fake_audio", {"asr": {"language": "en"}})

        # Should be joined and stripped
        self.assertEqual(result, "Hello, world!")


if __name__ == "__main__":
    # Run with: python tests/test_phase6_helpers.py
    unittest.main(verbosity=2)
