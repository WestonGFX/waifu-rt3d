"""Tests for backend.adaptive.self_critique — Self-Critique Reflection Loop (AIE Phase B4).

Covers:
    - build_critique_prompt: non-empty output, char_name inclusion, message
      content inclusion, preference key surfacing, and empty-message tolerance.
    - parse_critique_response: valid JSON parsing, improvement field validation,
      invalid JSON rejection, markdown-fence stripping, optional-field defaults,
      invalid improvement item filtering, and empty improvements acceptance.
    - run_self_critique (async): import check and coroutine-function verification
      only — no LLM is invoked.

All tests are synchronous pure-function calls except the two signature tests
for run_self_critique.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import unittest

from backend.adaptive.self_critique import (
    build_critique_prompt,
    parse_critique_response,
    run_self_critique,
)

# ---------------------------------------------------------------------------
# Shared fixture helpers
# ---------------------------------------------------------------------------


def _msg(role: str, content: str) -> dict:
    """Build a minimal message dict for use in test inputs.

    Args:
        role: Either "user" or "assistant".
        content: Message text content.

    Returns:
        Dict with ``role`` and ``content`` keys.
    """
    return {"role": role, "content": content}


def _valid_improvement(
    issue: str = "Too formal",
    suggestion: str = "Be more casual",
    priority: str = "medium",
) -> dict:
    """Build a valid improvement item dict.

    Args:
        issue: Description of the identified problem.
        suggestion: How to fix it.
        priority: Severity level — "high", "medium", or "low".

    Returns:
        Dict with issue, suggestion, and priority keys.
    """
    return {"issue": issue, "suggestion": suggestion, "priority": priority}


def _wrap_json(data: dict) -> str:
    """Serialize *data* to a JSON string.

    Args:
        data: Python dict to serialize.

    Returns:
        JSON string.
    """
    return json.dumps(data)


# ---------------------------------------------------------------------------
# Tests: build_critique_prompt
# ---------------------------------------------------------------------------


class TestBuildCritiquePrompt(unittest.TestCase):
    """Tests for build_critique_prompt()."""

    def test_returns_nonempty_prompt(self):
        """Valid inputs return a non-empty string prompt."""
        prompt = build_critique_prompt(
            "Sakura",
            [_msg("user", "hi"), _msg("assistant", "Hello!")],
            {},
            {},
        )
        self.assertIsInstance(prompt, str)
        self.assertGreater(len(prompt), 0)

    def test_includes_char_name(self):
        """The character name appears at least once in the generated prompt."""
        prompt = build_critique_prompt(
            "Haruka",
            [_msg("user", "how are you?")],
            {},
            {},
        )
        self.assertIn("Haruka", prompt)

    def test_includes_messages(self):
        """Message content from the input list appears in the generated prompt."""
        prompt = build_critique_prompt(
            "Sakura",
            [_msg("user", "tell me about quantum entanglement")],
            {},
            {},
        )
        self.assertIn("quantum entanglement", prompt)

    def test_includes_preference_keys(self):
        """Known pref_* keys are surfaced in the prompt regardless of user_profile values."""
        prompt = build_critique_prompt(
            "Sakura",
            [_msg("user", "hi")],
            {},
            {"pref_humor": 0.5, "pref_depth": 0.3},
        )
        # The prompt always lists all known preference keys for context.
        self.assertIn("pref_humor", prompt)
        self.assertIn("pref_depth", prompt)

    def test_handles_empty_messages(self):
        """Empty message list produces a valid (non-empty) prompt without raising."""
        prompt = build_critique_prompt("Sakura", [], {}, {})
        self.assertIsInstance(prompt, str)
        self.assertGreater(len(prompt), 0)

    def test_assistant_messages_labeled_with_char_name(self):
        """Assistant role messages are labeled with the character name, not 'assistant'."""
        prompt = build_critique_prompt(
            "Miyuki",
            [_msg("assistant", "That sounds wonderful!")],
            {},
            {},
        )
        # The label should use the char name, not the raw role string.
        self.assertIn("Miyuki:", prompt)

    def test_long_message_truncated(self):
        """Messages longer than 400 characters are truncated with an ellipsis in the prompt."""
        long_content = "x" * 500
        prompt = build_critique_prompt(
            "Sakura",
            [_msg("user", long_content)],
            {},
            {},
        )
        self.assertIn("...", prompt)
        # The full 500-char string must not appear verbatim.
        self.assertNotIn(long_content, prompt)

    def test_behavior_modifiers_included(self):
        """Non-empty behavior_modifiers dict is serialized and included in the prompt."""
        modifiers = {"style": "playful", "verbosity": "high"}
        prompt = build_critique_prompt("Sakura", [], modifiers, {})
        self.assertIn("playful", prompt)


# ---------------------------------------------------------------------------
# Tests: parse_critique_response
# ---------------------------------------------------------------------------


class TestParseCritiqueResponse(unittest.TestCase):
    """Tests for parse_critique_response()."""

    def test_valid_json_parsed(self):
        """Well-formed JSON with a valid improvements list returns a dict."""
        raw = _wrap_json({
            "improvements": [_valid_improvement()],
            "strengths": ["Good emotional support"],
            "style_adjustments": {},
        })
        result = parse_critique_response(raw)
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)

    def test_improvements_validated(self):
        """Each improvement in the result has issue, suggestion, and priority keys."""
        raw = _wrap_json({
            "improvements": [
                _valid_improvement("Too formal", "Be casual", "high"),
                _valid_improvement("Missed cue", "Acknowledge emotion", "medium"),
            ],
        })
        result = parse_critique_response(raw)
        self.assertIsNotNone(result)
        for item in result["improvements"]:
            self.assertIn("issue", item)
            self.assertIn("suggestion", item)
            self.assertIn("priority", item)

    def test_invalid_json_returns_none(self):
        """Non-JSON input returns None."""
        result = parse_critique_response("not json at all")
        self.assertIsNone(result)

    def test_markdown_wrapped_json_handled(self):
        """JSON wrapped in markdown code fences is extracted and parsed successfully."""
        data = {
            "improvements": [_valid_improvement()],
        }
        raw = f"```json\n{json.dumps(data)}\n```"
        result = parse_critique_response(raw)
        self.assertIsNotNone(result)
        self.assertEqual(len(result["improvements"]), 1)

    def test_missing_optional_fields_defaulted(self):
        """When 'strengths' is absent the result defaults to an empty list."""
        raw = _wrap_json({"improvements": []})
        result = parse_critique_response(raw)
        self.assertIsNotNone(result)
        self.assertEqual(result["strengths"], [])
        self.assertEqual(result["style_adjustments"], {})

    def test_invalid_improvement_items_dropped(self):
        """Improvement items missing required 'issue' key are silently dropped."""
        raw = _wrap_json({
            "improvements": [
                {"suggestion": "no issue key here", "priority": "low"},  # invalid
                _valid_improvement("real issue", "real suggestion", "high"),
            ],
        })
        result = parse_critique_response(raw)
        self.assertIsNotNone(result)
        # Only the valid item should remain.
        self.assertEqual(len(result["improvements"]), 1)
        self.assertEqual(result["improvements"][0]["issue"], "real issue")

    def test_empty_improvements_accepted(self):
        """A valid JSON object with an empty improvements list is accepted."""
        raw = _wrap_json({"improvements": []})
        result = parse_critique_response(raw)
        self.assertIsNotNone(result)
        self.assertEqual(result["improvements"], [])

    def test_empty_string_returns_none(self):
        """Empty string input returns None."""
        result = parse_critique_response("")
        self.assertIsNone(result)

    def test_improvements_not_list_returns_none(self):
        """When 'improvements' is not a list (e.g. a string), returns None."""
        raw = _wrap_json({"improvements": "should be a list"})
        result = parse_critique_response(raw)
        self.assertIsNone(result)

    def test_style_adjustments_filtered_to_known_prefs(self):
        """style_adjustments keys not in _NUDGEABLE_PREFS are silently ignored."""
        raw = _wrap_json({
            "improvements": [],
            "style_adjustments": {
                "pref_humor": "increase",
                "unknown_field": "increase",  # should be dropped
            },
        })
        result = parse_critique_response(raw)
        self.assertIsNotNone(result)
        self.assertIn("pref_humor", result["style_adjustments"])
        self.assertNotIn("unknown_field", result["style_adjustments"])

    def test_prose_before_json_handled(self):
        """Leading prose text before the JSON object is skipped during extraction."""
        data = {"improvements": [_valid_improvement()]}
        raw = f"Here is my analysis:\n\n{json.dumps(data)}"
        result = parse_critique_response(raw)
        self.assertIsNotNone(result)
        self.assertEqual(len(result["improvements"]), 1)

    def test_priority_lowercased(self):
        """Priority values are normalized to lowercase in the result."""
        raw = _wrap_json({
            "improvements": [
                {"issue": "test", "suggestion": "fix", "priority": "HIGH"},
            ],
        })
        result = parse_critique_response(raw)
        self.assertIsNotNone(result)
        self.assertEqual(result["improvements"][0]["priority"], "high")


# ---------------------------------------------------------------------------
# Tests: run_self_critique (signature / import only — no LLM)
# ---------------------------------------------------------------------------


class TestRunSelfCritique(unittest.TestCase):
    """Minimal tests for run_self_critique() — verifies signature without calling the LLM."""

    def test_import_succeeds(self):
        """run_self_critique can be imported from the module without errors."""
        # The import at the top of this file already verifies this.
        self.assertTrue(callable(run_self_critique))

    def test_function_is_async(self):
        """run_self_critique is a coroutine function (defined with async def)."""
        self.assertTrue(inspect.iscoroutinefunction(run_self_critique))

    def test_function_accepts_expected_parameters(self):
        """run_self_critique has char_id, db_path, and llm_config parameters."""
        sig = inspect.signature(run_self_critique)
        param_names = set(sig.parameters.keys())
        self.assertIn("char_id", param_names)
        self.assertIn("db_path", param_names)
        self.assertIn("llm_config", param_names)
