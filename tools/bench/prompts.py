"""Build the exact system prompts the benchmark sends.

Fidelity matters: the May-2026 failure was caused by the *real* persona
prompt (~13 KB) plus the explicit-RP style block drowning out the ~70-token
JSON contract that the app appends at the very end.  So instead of a toy
prompt we reuse the app's own pieces:

* the persona text from a ``docs/characters/<name>/03_prompt_pack.md`` file,
* ``backend.server._get_rp_style_injection`` (the app's RP style presets),
* ``backend.kokoro.prompt_fragment.build_kokoro_fragment`` with default dials.

The app also injects mood/memory/relationship sections; those are omitted —
persona + RP style + contract carry the weight that matters here.
"""
from __future__ import annotations

import re
from pathlib import Path

from backend.kokoro.mind_state import MindState, ThreadState, TraitVector
from backend.kokoro.prompt_fragment import build_kokoro_fragment
from backend.kokoro.response_schema import companion_response_json_schema

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PERSONA = ROOT / "docs" / "characters" / "rin" / "03_prompt_pack.md"

_HEADING_RE = re.compile(r"^#+\s.*_SYSTEM_PROMPT.*$", re.MULTILINE)
_FENCE_RE = re.compile(r"```[a-zA-Z]*\n(.*?)```", re.DOTALL)


def load_persona(path: Path | str = DEFAULT_PERSONA) -> str:
    """Load persona text from a prompt-pack markdown file.

    Looks for a ``## <NAME>_SYSTEM_PROMPT`` heading and returns the first
    fenced block after it.  Falls back to the whole file so any plain-text
    persona file also works.

    Args:
        path: Markdown (or plain text) file.

    Returns:
        The persona/system prompt text.

    Raises:
        FileNotFoundError: If ``path`` does not exist.
    """
    text = Path(path).read_text(encoding="utf-8")
    heading = _HEADING_RE.search(text)
    if heading:
        fence = _FENCE_RE.search(text, heading.end())
        if fence:
            return fence.group(1).strip()
    return text.strip()


def rp_style_text(preset: str) -> str:
    """Return the app's RP-style block for ``preset`` (``""`` for unknown/none).

    Imported lazily from ``backend.server`` (≈1 s import) so the harness uses
    the app's real wording rather than a copy that could drift.
    """
    from backend.server import _get_rp_style_injection  # noqa: PLC0415

    return _get_rp_style_injection(preset)


def kokoro_fragment() -> str:
    """The app's real Kokoro fragment (dials + JSON contract), default dials."""
    return build_kokoro_fragment(
        mind=MindState(character_id=1),
        traits=TraitVector(character_id=1),
        thread=ThreadState(session_id=1),
        nsfw_active=False,
    )


def build_system_prompts(persona: str, rp_style: str) -> dict[str, str]:
    """Return the system prompts the strategies need.

    Returns:
        ``{"with_contract": persona+rp+fragment, "plain": persona+rp}``.
        ``with_contract`` mirrors how ``context_assembler`` appends the
        fragment (``"\\n\\n"`` join, at the very end of the system prompt).
    """
    plain = persona + rp_style_text(rp_style)
    return {"plain": plain, "with_contract": plain + "\n\n" + kokoro_fragment()}


EXTRACTOR_SYSTEM = (
    "You are an annotation engine for an anime companion app. You are given what the user said and "
    "what the character replied. Output ONLY a single JSON object (no prose, no markdown) with:\n"
    '  "facialExpression": one of neutral|soft_smile|smile|concerned|surprised|smug|blush|sleepy|focused\n'
    '  "gesture": one of idle|wave|thinking|point|hands_clasped|heart|small_nod|tilt_head\n'
    '  "memoryWrite": {"shouldSave": bool, "summary": string, "importance": 0..1, "emotionalSalience": 0..1}\n'
    '  "stateDelta": object of dial_name -> number in [-0.05, 0.05] (only dials the exchange affected; '
    "{} if none)\n"
    "Pick the expression and gesture that best match the CHARACTER's reply. Save a memory only for facts "
    "that will matter in a later conversation."
)


def extractor_user(user_text: str, character_reply: str) -> str:
    """User-message body for the S2 annotation call."""
    return f"User said: {user_text}\n\nCharacter replied: {character_reply}"


def extractor_schema() -> dict:
    """Companion schema minus ``reply`` (the S2 reply comes from the first call)."""
    schema = companion_response_json_schema()
    schema["properties"].pop("reply", None)
    schema["required"] = [k for k in schema["required"] if k != "reply"]
    return schema


def estimate_tokens(text: str) -> int:
    """Rough token estimate (≈4 chars/token) for context-size warnings."""
    return max(1, len(text) // 4)
