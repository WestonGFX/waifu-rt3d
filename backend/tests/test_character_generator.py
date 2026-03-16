"""Tests for the AI character generator (backend/characters/generator.py).

Tests cover:
- Happy-path generation returning all required fields
- Custom name propagation through the prompt and result
- Fallback handling for malformed / non-JSON LLM responses
- Fallback handling when the LLM adapter raises an exception
- Markdown code-fence stripping before JSON parse
- Trait inclusion in the prompt sent to the adapter
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from backend.characters.generator import CharacterGenerator

# ── Constants ─────────────────────────────────────────────────────────────────

REQUIRED_FIELDS = {
    "name",
    "system_prompt",
    "personality",
    "greeting_message",
    "backstory",
    "example_messages",
    "suggested_avatar_prompt",
}

# Minimal config forwarded to the adapter; matches the legacy flat structure
# that _extract_llm_params() recognises.
_TEST_CFG = {
    "llm": {
        "model": "test-model",
        "endpoint": "http://localhost:1234",
        "api_key": "test-key",
    }
}

# ── Helpers ───────────────────────────────────────────────────────────────────


def _valid_payload(name: str = "Luna Ashford") -> dict:
    """Return a dict representing a complete, valid generator LLM response.

    Args:
        name: Character name to embed in the payload.

    Returns:
        Dict with all required fields populated.
    """
    return {
        "name": name,
        "system_prompt": f"You are {name}, a thoughtful scholar.",
        "personality": "A shy bookworm who opens up to people she trusts.",
        "greeting_message": "Oh, hello there… I didn't hear you come in.",
        "backstory": f"{name} grew up in a small coastal library town.",
        "example_messages": [
            {"user": "Hi", "char": "H-hello… nice to meet you."},
            {"user": "What are you reading?", "char": "Oh, this? Just a bit of mythology…"},
        ],
        "suggested_avatar_prompt": "anime girl, brown hair, round glasses, soft smile",
    }


def _make_adapter(payload: dict | str) -> MagicMock:
    """Create a mock LLM adapter whose ``chat`` method returns a successful result.

    The generator calls ``adapter.chat(messages, model=…, endpoint=…, …)`` and
    expects ``{"ok": True, "reply": <json string>}``.

    Args:
        payload: Either a dict (will be JSON-encoded) or a raw string to return
            verbatim as the ``reply`` value.

    Returns:
        Configured MagicMock instance.
    """
    reply_text = json.dumps(payload) if isinstance(payload, dict) else payload
    adapter = MagicMock()
    adapter.chat.return_value = {"ok": True, "reply": reply_text}
    return adapter


# ── Test class ────────────────────────────────────────────────────────────────


class TestCharacterGenerator:
    """Unit tests for CharacterGenerator.generate()."""

    # ------------------------------------------------------------------
    # 1. Happy path — all fields present
    # ------------------------------------------------------------------

    def test_generate_returns_all_fields(self):
        """generate() with a valid adapter response returns all required keys.

        The returned dict must contain every field defined in REQUIRED_FIELDS
        so that downstream character-creation code can rely on their presence.
        """
        adapter = _make_adapter(_valid_payload())
        gen = CharacterGenerator()

        result = gen.generate(
            adapter=adapter,
            cfg=_TEST_CFG,
            traits=["bookworm", "shy", "kind"],
        )

        missing = REQUIRED_FIELDS - set(result.keys())
        assert not missing, f"Result is missing fields: {missing}"

    # ------------------------------------------------------------------
    # 2. Custom name is honoured
    # ------------------------------------------------------------------

    def test_generate_with_custom_name(self):
        """When a name is supplied, the returned character should use that name.

        The generator either forwards the provided name directly or instructs
        the LLM to use it; either way the final ``name`` field in the result
        must match the value passed in.
        """
        provided_name = "Rei Hoshino"
        adapter = _make_adapter(_valid_payload(name=provided_name))
        gen = CharacterGenerator()

        result = gen.generate(
            adapter=adapter,
            cfg=_TEST_CFG,
            traits=["stoic", "loyal"],
            name=provided_name,
        )

        assert result.get("name") == provided_name

    # ------------------------------------------------------------------
    # 3. Malformed JSON — fallback must not raise
    # ------------------------------------------------------------------

    def test_generate_handles_malformed_json(self):
        """When the adapter returns non-JSON garbage, generate() should not raise.

        The fallback should return a dict that still contains at least the
        ``name`` key so the caller always gets a usable (if minimal) profile.
        """
        adapter = _make_adapter("Sure! Here is a character: definitely not JSON {{{{")
        gen = CharacterGenerator()

        result = gen.generate(
            adapter=adapter,
            cfg=_TEST_CFG,
            traits=["energetic"],
        )

        # Must not raise — must return a dict
        assert isinstance(result, dict)
        # The fallback dict must have a name (even if it's the built-in default)
        assert "name" in result

    # ------------------------------------------------------------------
    # 4. Adapter raises exception — fallback must not propagate
    # ------------------------------------------------------------------

    def test_generate_handles_adapter_failure(self):
        """When the adapter raises an exception, generate() should catch it.

        A connection error or timeout from the LLM backend must not crash the
        character-creation flow; a fallback dict should be returned instead.
        """
        adapter = MagicMock()
        adapter.chat.side_effect = ConnectionError("LLM backend unreachable")
        gen = CharacterGenerator()

        result = gen.generate(
            adapter=adapter,
            cfg=_TEST_CFG,
            traits=["cheerful"],
        )

        assert isinstance(result, dict)
        assert "name" in result

    # ------------------------------------------------------------------
    # 5. Markdown fences stripped before JSON parse
    # ------------------------------------------------------------------

    def test_generate_strips_markdown_fences(self):
        """Adapter output wrapped in ```json … ``` fences should parse correctly.

        Many LLMs wrap JSON output in Markdown code fences. The generator
        must strip those fences before attempting JSON.loads() so that all
        required fields are still extracted.
        """
        raw_json = json.dumps(_valid_payload())
        fenced_reply = f"```json\n{raw_json}\n```"
        adapter = _make_adapter(fenced_reply)  # passes the string verbatim as reply
        gen = CharacterGenerator()

        result = gen.generate(
            adapter=adapter,
            cfg=_TEST_CFG,
            traits=["playful", "mischievous"],
        )

        missing = REQUIRED_FIELDS - set(result.keys())
        assert not missing, f"Fenced JSON parse left missing fields: {missing}"
        assert result["name"] == "Luna Ashford"

    # ------------------------------------------------------------------
    # 6. Traits appear in the prompt sent to the adapter
    # ------------------------------------------------------------------

    def test_traits_included_in_prompt(self):
        """Each trait string must appear somewhere in the prompt sent to the adapter.

        The generator is responsible for embedding the caller-supplied traits in
        the LLM request so that the resulting character reflects those qualities.
        This test inspects the arguments passed to ``adapter.chat`` and verifies
        every trait is present in at least one message or prompt string.
        """
        traits = ["tsundere", "pianist", "secretly-kind"]
        adapter = _make_adapter(_valid_payload())
        gen = CharacterGenerator()

        gen.generate(
            adapter=adapter,
            cfg=_TEST_CFG,
            traits=traits,
        )

        assert adapter.chat.called, "adapter.chat was never called"

        # Collect all text from positional + keyword args forwarded to the adapter
        all_text: list[str] = []
        for c in adapter.chat.call_args_list:
            for arg in c.args:
                if isinstance(arg, str):
                    all_text.append(arg)
                elif isinstance(arg, list):
                    # messages list — serialise each entry
                    for item in arg:
                        if isinstance(item, dict):
                            all_text.append(json.dumps(item))
                        elif isinstance(item, str):
                            all_text.append(item)
            for val in c.kwargs.values():
                if isinstance(val, str):
                    all_text.append(val)

        combined = " ".join(all_text)
        for trait in traits:
            assert trait in combined, (
                f"Trait '{trait}' was not found in any argument passed to adapter.chat. "
                f"Captured text (first 500 chars): {combined[:500]!r}"
            )
