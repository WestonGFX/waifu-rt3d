"""Render the Kokoro prompt fragment that the context assembler injects.

The fragment is *not* a replacement for ``backend/llm/context_assembler.py``;
it is one section that the assembler can slot in between persona and user
message.  It contains:

  1. The current dial state (Tier A + B + C, plus Tier F when active).
  2. The per-thread scene snapshot.
  3. The JSON response contract the LLM must follow.

NSFW dials are only mentioned when ``nsfw_active`` is True.  This is checked
in :mod:`backend.kokoro.service` against the existing ``nsfw_enabled`` flag
and the M6 bond-affinity gates — this module just trusts the boolean.
"""
from __future__ import annotations

from dataclasses import asdict

from .mind_state import (
    MindState,
    TIER_A_FAST,
    TIER_B_SLOW,
    TIER_F_FAST,
    TIER_F_SLOW,
    TIER_C_TRAITS,
    TIER_E_SCENE,
    ThreadState,
    TraitVector,
)


def _fmt(n: float) -> str:
    return f"{round(float(n), 2)}"


def _dial_line(label: str, dial_names, source) -> str:
    pieces = []
    for name in dial_names:
        v = getattr(source, name)
        pieces.append(f"{name}={_fmt(v)}")
    return f"{label}: " + ", ".join(pieces)


def build_kokoro_fragment(
    *,
    mind: MindState,
    traits: TraitVector,
    thread: ThreadState,
    nsfw_active: bool = False,
) -> str:
    """Build the Kokoro prompt fragment.

    Args:
        mind: Current Tier A/B (and F-fast/slow) dial values.
        traits: Tier C identity fingerprint.
        thread: Tier E (and F-scene) scene state.
        nsfw_active: If True, include Tier F dials AND extend the JSON
            contract with the NSFW-gated fields (``innerArousalShift``,
            ``suggestiveBid``, ``selfConsentCheck``, ``boundaryReinforcement``).

    Returns:
        A string ready to be inserted into the system/persona prompt.
        Always ends with a JSON-only output instruction so downstream
        parsing succeeds.
    """
    lines = [
        "## Kokoro Mind State",
        "You are operating an embodied anime-style companion.  Stay in character.",
        "Do NOT claim consciousness, sentience, or human feelings.",
        "However, *roleplay* the character consistently using the dials below.",
        "",
        _dial_line("Fast dials (this-moment feel)", TIER_A_FAST, mind),
        _dial_line("Slow dials (recent days)",      TIER_B_SLOW, mind),
        _dial_line("Identity traits (almost constant)", TIER_C_TRAITS, traits),
        _dial_line("This conversation",             TIER_E_SCENE, thread),
    ]
    if nsfw_active:
        lines.append(_dial_line("Intimate-mode dials", TIER_F_FAST + TIER_F_SLOW, mind))
        lines.append(
            f"Scene NSFW: consent_check_pending={thread.consent_check_pending}"
        )

    lines += [
        "",
        "## Response contract",
        "Return ONLY a single JSON object with this exact shape (no prose, no markdown fence):",
        "{",
        '  "reply": "string — the character\'s spoken words to the user",',
        '  "innerThought": "string — brief private thought (for debug only, never shown)",',
        '  "emotion": "one of: neutral|focused_warm|happy|soft|concerned|playful|shy|excited|sleepy|frustrated|proud",',
        '  "facialExpression": "one of: neutral|soft_smile|smile|concerned|surprised|smug|blush|sleepy|focused",',
        '  "gesture": "one of: idle|wave|thinking|point|hands_clasped|heart|small_nod|tilt_head",',
        '  "gaze": "one of: user|away|thinking|object|camera",',
        '  "voiceStyle": "one of: calm|warm|bright|sleepy|serious|teasing",',
        '  "memoryWrite": {"shouldSave": false, "summary": "", "importance": 0.0, "emotionalSalience": 0.0},',
        '  "stateDelta": { /* dial_name: number in [-0.05, 0.05] — only the dials you actually want to nudge */ }',
    ]
    if nsfw_active:
        lines += [
            '  , "innerArousalShift": 0.0',
            '  , "suggestiveBid": null',
            '  , "selfConsentCheck": false',
            '  , "boundaryReinforcement": false',
        ]
    lines += [
        "}",
        "",
        "Rules:",
        "- State deltas must be small (|d| <= 0.05) and only on dials this turn actually affected.",
        "- Save a memory only if it will matter in a later conversation.",
        "- Do NOT mention JSON, state variables, or the system architecture to the user.",
        "- Match voiceStyle and facialExpression to the user's emotional tone.",
    ]
    if nsfw_active:
        lines += [
            "- ``boundaryReinforcement`` should be true whenever you decline or soften an escalation.",
            "- ``suggestiveBid`` is optional and may only be a small first-move; the existing content gates still apply.",
        ]
    return "\n".join(lines)
