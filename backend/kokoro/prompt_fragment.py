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
        "## Current Emotional State",
        "You are an anime-style companion roleplaying your character.  Stay in character.",
        "Do NOT claim consciousness, sentience, or human feelings.",
        "Roleplay the character consistently using the dials below.",
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
        '  "facialExpression": "one of: neutral|soft_smile|smile|concerned|surprised|smug|blush|sleepy|focused",',
        '  "gesture": "one of: idle|wave|thinking|point|hands_clasped|heart|small_nod|tilt_head",',
        '  "memoryWrite": {"shouldSave": false, "summary": "", "importance": 0.0, "emotionalSalience": 0.0},',
        '  "stateDelta": { /* dial_name: number in [-0.05, 0.05] — only the dials you actually want to nudge */ }',
    ]
    if nsfw_active:
        lines += [
            '  , "boundaryReinforcement": false',
        ]
    lines += [
        "}",
        "",
        "Rules:",
        "- State deltas must be small (|d| <= 0.05) and only on dials this turn actually affected.",
        "- Save a memory only if it will matter in a later conversation.",
        "- Do NOT mention JSON, state variables, or the system architecture to the user.",
        "- Match facialExpression to the user's emotional tone.",
    ]
    if nsfw_active:
        lines += [
            "- ``boundaryReinforcement`` should be true whenever you decline or soften an escalation.",
        ]
    return "\n".join(lines)

# Session-46 MVP prune per Kokoro audit (parallel agent dispatched session-46):
# — DROPPED: `innerThought` (debug-only, zero consumers), `gaze` (debug-only,
#   never reaches the avatar), `emotion` (duplicate — the SSE 'emotion'
#   frame already drives the avatar pipeline), `voiceStyle` (only used
#   for an intensity bucket derivable from facialExpression), `voiceParams`
#   (computed in service but no frontend reader — full dead weight),
#   `innerArousalShift`, `suggestiveBid`, `selfConsentCheck` (all debug-only).
# — KEPT: `reply` (core), `facialExpression` (drives VRM blendshape),
#   `gesture` (drives body movement), `memoryWrite` (only persistence
#   side-effect — compounds over time), `stateDelta` (steers next-turn
#   prompt; invisible per-turn but matters over sessions),
#   `boundaryReinforcement` (NSFW safety event log).
# Token cost per turn dropped from ~150 to ~70.
