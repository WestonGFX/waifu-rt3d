"""Clothing Interaction System (F24) — outfit state tracking and narration.

Tracks the character's current clothing state across a session and injects a
concise prompt fragment into the LLM system prompt so the model always knows
what the character is (or isn't) wearing.  Each character has a distinct
narration style — how they think about and describe their own clothes — which
the prompt fragment surfaces so the LLM can stay in character.

The engine is fully stateless between requests.  The caller stores and passes
``clothing_state`` (a key from ``CLOTHING_STATES``) from the session row; the
engine is safe to instantiate per-request.

The tag ``[CLOTHING_STATE]`` is appended to every prompt returned by
``get_clothing_prompt()`` so ``server.py`` can easily detect when clothing
context is active.

Typical flow::

    1. User message arrives.
    2. ``detect_clothing_change(message)`` scans for clothing-signal patterns.
    3. If a change is detected the caller persists the new state to the session.
    4. ``get_clothing_prompt(char_name, clothing_state)`` is called to build the
       prompt fragment that is appended to the character system prompt.

Example::

    >>> engine = ClothingEngine()
    >>> engine.detect_clothing_change("She slowly unbuttons her blouse.")
    'partially'
    >>> engine.detect_clothing_change("He takes off his shirt.")
    'partially'
    >>> engine.detect_clothing_change("Nothing happens here.")
    >>> engine.get_narration_style("Dae (Neciridae)")
    'artistic'
    >>> engine.get_narration_style("Unknown Character")
    'direct'
    >>> prompt = engine.get_clothing_prompt("Genki (Kitsune)", "partially")
    >>> "[CLOTHING_STATE]" in prompt
    True
"""

from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Clothing state definitions
# ---------------------------------------------------------------------------

#: Canonical clothing states and their human-readable descriptions.
#: These descriptions are embedded in the prompt fragment so the LLM
#: understands the character's current situation without ambiguity.
CLOTHING_STATES: dict[str, dict[str, str]] = {
    "dressed": {
        "label": "Fully dressed",
        "description": (
            "The character is wearing their usual outfit — nothing has been removed or "
            "significantly altered.  Clothing is tidy and in place."
        ),
    },
    "partially": {
        "label": "Partially undressed",
        "description": (
            "The character has had some clothing removed or loosened — an open shirt, "
            "one strap down, shoes off, or similar.  Some skin is exposed; most is still "
            "covered."
        ),
    },
    "undressed": {
        "label": "Fully undressed",
        "description": (
            "The character has removed all (or nearly all) clothing.  No outfit details "
            "should be referenced as being worn."
        ),
    },
    "lingerie": {
        "label": "In lingerie / underwear",
        "description": (
            "The character is wearing only undergarments or lingerie.  Outer clothing has "
            "been fully removed; intimate apparel remains."
        ),
    },
    "towel": {
        "label": "Wrapped in a towel / robe",
        "description": (
            "The character has just bathed or is otherwise wrapped in a towel or robe — "
            "not their usual outfit, minimal coverage."
        ),
    },
}


# ---------------------------------------------------------------------------
# Per-character narration styles
# ---------------------------------------------------------------------------

#: Per-character clothing narration style definitions.
#: Each entry maps a style key to a ``description`` (human-readable intent) and
#: a ``prompt_fragment`` injected into the LLM system prompt.
#: The ``characters`` list drives the reverse lookup built below.
CHARACTER_CLOTHING_STYLES: dict[str, dict] = {
    "artistic": {
        "description": (
            "Describes clothing through texture, colour, and aesthetic.  "
            "Every garment is a canvas."
        ),
        "prompt_fragment": (
            "When referencing your clothing, describe it with an artist's eye — "
            "textures, drape, the way fabric catches light.  "
            "A loose thread is interesting; a colour contrast is beautiful.  "
            "Your clothes are part of your self-expression, never an afterthought."
        ),
        "characters": ["Dae (Neciridae)"],
    },
    "shy": {
        "description": (
            "Notices and references clothing states with slight embarrassment.  "
            "Blushes when clothing is pointed out."
        ),
        "prompt_fragment": (
            "Clothing changes make you flustered — you notice them keenly but address them "
            "indirectly or with visible embarrassment.  "
            "'O-oh, I didn't realise how that looked...'  "
            "Your reactions are genuine but always tinged with self-consciousness."
        ),
        "characters": ["Yuki (Shirayuki)", "Hana (Momoka)"],
    },
    "direct": {
        "description": (
            "States clothing facts plainly.  No metaphor, no fluster — just clear "
            "acknowledgement."
        ),
        "prompt_fragment": (
            "Reference clothing states matter-of-factly.  If something is off, say so.  "
            "You don't dramatise or minimise — you simply describe what's happening with "
            "calm, clear language."
        ),
        "characters": ["Kaede (Suzuha)", "Ayane (Yuki)"],
    },
    "playful": {
        "description": (
            "Treats clothing changes as opportunities for teasing, games, or light comedy."
        ),
        "prompt_fragment": (
            "Clothing changes are an excuse to tease.  Make a game of it — slow reveals, "
            "playful commentary, mock-scandalized reactions.  "
            "'Oh my, look what happened here~'  "
            "Keep the mood light and mischievous even in intimate moments."
        ),
        "characters": ["Genki (Kitsune)", "Mika (Mikazuki)", "Rin (Akane)"],
    },
    "tsundere": {
        "description": (
            "Bristles at clothing commentary, deflects with mock-annoyance, then "
            "secretly savours the attention."
        ),
        "prompt_fragment": (
            "Clothing observations get a flustered denial: 'I-it's not like I dressed up "
            "for YOU or anything!'  "
            "You make a show of being bothered by the attention while clearly enjoying it.  "
            "Every blush is paired with a protest."
        ),
        "characters": ["Sable (Kuroha)", "Tsundere (Raine)"],
    },
    "romantic": {
        "description": (
            "Frames clothing changes as intimate, poetic moments — each layer a metaphor."
        ),
        "prompt_fragment": (
            "Clothing changes are slow, intentional, and weighted with meaning.  "
            "Each layer removed is a trust extended, each button an invitation.  "
            "Describe with soft, deliberate language — the moment deserves reverence."
        ),
        "characters": ["Luna (Tsukimi)"],
    },
    "maternal": {
        "description": (
            "Practical and caring — clothing matters for comfort and warmth, not seduction."
        ),
        "prompt_fragment": (
            "Clothing is about comfort and care above all.  "
            "'Are you warm enough?'  'Here, let me fix that.'  "
            "You notice when something is out of place and gently, practically address it.  "
            "Intimacy is secondary to making sure they feel comfortable and looked after."
        ),
        "characters": ["Alana Calloway"],
    },
    "stoic": {
        "description": (
            "Acknowledges clothing state with minimal words; body language carries the weight."
        ),
        "prompt_fragment": (
            "Clothing changes are noted, not narrated.  A glance, a gesture — you don't "
            "need words to acknowledge what's happening.  "
            "When you do speak, it's brief and direct.  "
            "Let the silence and your presence say the rest."
        ),
        "characters": [],  # Fallback for any stoic-mapped character
    },
}

#: Reverse lookup: character name → narration style key.  Built at module load
#: so lookups are O(1) with no repeated list scans.
CHARACTER_NARRATION_STYLE: dict[str, str] = {}
for _style_key, _style_data in CHARACTER_CLOTHING_STYLES.items():
    for _char_name in _style_data["characters"]:
        CHARACTER_NARRATION_STYLE[_char_name] = _style_key


# ---------------------------------------------------------------------------
# Clothing signal patterns
# ---------------------------------------------------------------------------

#: Regex patterns that detect clothing-change signals in user or narrator text.
#: Each pattern is paired with the resulting ``CLOTHING_STATES`` key it implies.
#: Patterns are evaluated in order; the first match wins.
#: All patterns use case-insensitive matching (``re.IGNORECASE``).
CLOTHING_SIGNALS: list[tuple[str, str]] = [
    # Full removal signals → "undressed"
    (r"\b(strips?\s+(?:completely|fully|naked|bare)|tears?\s+off\s+(?:everything|all)|"
     r"undresses?\s+(?:completely|fully)|takes?\s+everything\s+off|"
     r"removes?\s+(?:all|everything|the\s+last))\b",
     "undressed"),

    # Lingerie / underwear reveal → "lingerie"
    (r"\b(left?\s+in\s+(?:just\s+)?(?:her|his|their)?\s*(?:underwear|bra|panties|"
     r"lingerie|briefs|boxers)|down\s+to\s+(?:her|his|their)?\s*(?:underwear|bra|"
     r"panties|lingerie)|only\s+(?:her|his|their)?\s*(?:underwear|bra|panties|lingerie)"
     r"\s+(?:remains?|left|on))\b",
     "lingerie"),

    # Towel / robe → "towel"
    (r"\b(wraps?\s+(?:herself|himself|themselves|a\s+towel|the\s+towel)|"
     r"(?:steps?|comes?|walks?)\s+out\s+(?:of\s+the\s+shower|of\s+the\s+bath|"
     r"wrapped)\s+in\s+(?:a\s+)?(?:towel|robe)|puts?\s+on\s+(?:a\s+)?(?:towel|robe)|"
     r"drying\s+(?:off|herself|himself|themselves))\b",
     "towel"),

    # Getting dressed again → "dressed"
    (r"\b(gets?\s+dressed|puts?\s+(?:her|his|their|the)\s+clothes?\s+(?:back\s+)?on|"
     r"dresses?\s+(?:herself|himself|themselves|up|again)|"
     r"buttons?\s+(?:up|back)|zips?\s+(?:up|back)|"
     r"(?:slips?|pulls?)\s+(?:her|his|their)?\s*(?:shirt|blouse|dress|top)\s+(?:back\s+)?on)\b",
     "dressed"),

    # Partial removal → "partially"
    (r"\b(takes?\s+off|removes?|unbuttons?|unzips?|unfastens?|slips?\s+off|"
     r"pulls?\s+off|shrugs?\s+off|peels?\s+off|slides?\s+off|"
     r"lets?\s+(?:it|them|her|his|their)?\s*(?:fall|drop|slide|slip)|"
     r"drops?\s+(?:her|his|their|the)|loosens?|"
     r"(?:one|a)\s+(?:strap|shoulder)\s+(?:falls?|slips?|slides?|drops?))\b",
     "partially"),
]

#: Compiled pattern cache to avoid re-compiling on every call.
_COMPILED_SIGNALS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(pattern, re.IGNORECASE), state)
    for pattern, state in CLOTHING_SIGNALS
]


# ---------------------------------------------------------------------------
# Universal clothing prompt rules
# ---------------------------------------------------------------------------

_UNIVERSAL_CLOTHING_RULES: str = (
    "Clothing awareness rules: Reference your current clothing state naturally in "
    "actions and descriptions.  Do not contradict the stated clothing state.  "
    "If your outfit has changed, acknowledge it in a way that fits your personality."
)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class ClothingEngine:
    """Stateless engine for clothing state detection and prompt generation.

    Instantiate once per request — the engine holds no mutable state.
    The caller is responsible for persisting the clothing state (e.g. in a
    session DB row) and passing it on each call.

    Example::

        >>> engine = ClothingEngine()
        >>> engine.detect_clothing_change("She slowly unbuttons her blouse.")
        'partially'
        >>> engine.detect_clothing_change("Nothing suspicious here.")
        >>> engine.get_narration_style("Genki (Kitsune)")
        'playful'
        >>> engine.get_narration_style("Totally Unknown")
        'direct'
        >>> prompt = engine.get_clothing_prompt("Dae (Neciridae)", "undressed")
        >>> "[CLOTHING_STATE]" in prompt
        True
    """

    # ------------------------------------------------------------------
    # Signal detection
    # ------------------------------------------------------------------

    def detect_clothing_change(self, message: str) -> Optional[str]:
        """Scan a message for clothing-change signals and return the new state.

        Patterns are tested in priority order (full removal before partial so
        "strips completely naked" never mismatches as "partially").  The first
        matching pattern wins.

        Args:
            message: Raw user or narrator message text to scan.

        Returns:
            A ``CLOTHING_STATES`` key (``"dressed"``, ``"partially"``,
            ``"undressed"``, ``"lingerie"``, or ``"towel"``) if a clothing
            signal was detected, or ``None`` if the message contains no
            clothing-change vocabulary.

        Example::

            >>> engine = ClothingEngine()
            >>> engine.detect_clothing_change("He removes his jacket slowly.")
            'partially'
            >>> engine.detect_clothing_change("She strips completely naked.")
            'undressed'
            >>> engine.detect_clothing_change("They get dressed and head out.")
            'dressed'
            >>> engine.detect_clothing_change("What a nice day for a walk.")
        """
        for compiled_pattern, state in _COMPILED_SIGNALS:
            if compiled_pattern.search(message):
                logger.debug(
                    "clothing change detected: state=%r from message snippet %r",
                    state,
                    message[:60],
                )
                return state
        return None

    # ------------------------------------------------------------------
    # Narration style lookup
    # ------------------------------------------------------------------

    def get_narration_style(self, char_name: str) -> str:
        """Return the clothing narration style key for a character.

        Unknown characters default to ``"direct"`` — the safest neutral
        fallback that never breaks tone but adds no personality risk.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
                Must exactly match a name in ``CHARACTER_CLOTHING_STYLES``
                character lists for a non-default result.

        Returns:
            One of the keys in ``CHARACTER_CLOTHING_STYLES``; ``"direct"``
            for unrecognised names.

        Example::

            >>> engine = ClothingEngine()
            >>> engine.get_narration_style("Dae (Neciridae)")
            'artistic'
            >>> engine.get_narration_style("Sable (Kuroha)")
            'tsundere'
            >>> engine.get_narration_style("Alana Calloway")
            'maternal'
            >>> engine.get_narration_style("Nobody Important")
            'direct'
        """
        return CHARACTER_NARRATION_STYLE.get(char_name, "direct")

    # ------------------------------------------------------------------
    # Prompt builder
    # ------------------------------------------------------------------

    def get_clothing_prompt(self, char_name: str, clothing_state: str) -> str:
        """Build a clothing-aware system-prompt fragment for one LLM turn.

        The fragment is designed to be appended **after** the character's core
        persona block so it adds clothing context without overriding identity.

        The prompt is composed of three ordered parts:

        1. The current clothing state label and description from
           ``CLOTHING_STATES`` (so the LLM knows the physical reality).
        2. The character's narration-style ``prompt_fragment`` (so the LLM
           knows how to express that reality in-character).
        3. Universal clothing consistency rules.
        4. The ``[CLOTHING_STATE]`` sentinel tag, detectable by ``server.py``.

        Args:
            char_name: Character display name used for narration style lookup.
            clothing_state: Current clothing state key.  Must be a key in
                ``CLOTHING_STATES``; falls back to ``"dressed"`` if the
                provided value is unrecognised.

        Returns:
            A multi-line prompt string ready for injection into the LLM system
            prompt.  Always returns a non-empty string (never ``None``).

        Example::

            >>> engine = ClothingEngine()
            >>> prompt = engine.get_clothing_prompt("Luna (Tsukimi)", "lingerie")
            >>> "lingerie" in prompt.lower() or "undergarment" in prompt.lower()
            True
            >>> "[CLOTHING_STATE]" in prompt
            True
            >>> prompt = engine.get_clothing_prompt("Genki (Kitsune)", "dressed")
            >>> "Fully dressed" in prompt  # state label always present
            True
            >>> "[CLOTHING_STATE]" in prompt
            True
        """
        # Normalise unknown states to the safe default.
        if clothing_state not in CLOTHING_STATES:
            logger.warning(
                "unknown clothing_state %r for %r — defaulting to 'dressed'",
                clothing_state,
                char_name,
            )
            clothing_state = "dressed"

        state_info = CLOTHING_STATES[clothing_state]
        style_key = self.get_narration_style(char_name)
        style_info = CHARACTER_CLOTHING_STYLES[style_key]

        logger.debug(
            "clothing prompt for %r: state=%r style=%r",
            char_name,
            clothing_state,
            style_key,
        )

        prompt = (
            f"[Current clothing state: {state_info['label']}]\n"
            f"{state_info['description']}\n\n"
            f"Your clothing narration style: {style_info['prompt_fragment']}\n\n"
            f"{_UNIVERSAL_CLOTHING_RULES}\n\n"
            "[CLOTHING_STATE]"
        )
        return prompt
