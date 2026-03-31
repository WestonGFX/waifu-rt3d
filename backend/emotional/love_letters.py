"""Love Letter Generator (F46) — deeply personal long-form letters from a character.

When the user has built a meaningful bond with their companion (bond >= 40), the
character can compose a love letter — 300-500 words of raw, honest prose that
reaches beyond what can be said in ordinary conversation.

Letters reference *real* relationship history: shared milestones, pet names the
character uses, and recent memories the user and character have accumulated
together.  The depth of vulnerability scales with bond level, moving from warm
appreciation (40-59) through open emotional disclosure (60-79) to fully
unguarded intimacy (80+).

A hard frequency cap of one letter per ``MAX_FREQUENCY_DAYS`` days prevents the
mechanic from feeling cheap or routine — love letters should feel like events.

The engine is stateless.  The caller is responsible for:

* Reading ``bond_level`` and ``last_letter_date`` from the DB before calling
  ``can_generate()``.
* Storing the new letter's timestamp after generation so the cap is enforced
  on the next call.

The tag ``[LOVE_LETTER]`` is appended to every prompt returned by
``get_prompt()``.  ``server.py`` can detect this tag to apply any special
routing (e.g. longer max-token budget, different stop sequence, bond-XP award).

Example::

    >>> engine = LoveLetterEngine()
    >>> engine.should_allow(bond_level=50)
    True
    >>> engine.should_allow(bond_level=30)
    False
    >>> engine.get_depth_level(45)
    'warm'
    >>> engine.get_depth_level(65)
    'open'
    >>> engine.get_depth_level(85)
    'raw'
    >>> engine.can_generate(char_id=1, bond_level=50, last_letter_date=None)
    True
    >>> engine.can_generate(char_id=1, bond_level=25, last_letter_date=None)
    False
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Frequency / eligibility constants
# ---------------------------------------------------------------------------

#: Minimum bond score required before a character will write a love letter.
MIN_BOND_LEVEL: int = 40

#: Cooldown window in days.  At most one letter may be generated per character
#: per this many days.
MAX_FREQUENCY_DAYS: int = 30


# ---------------------------------------------------------------------------
# Bond-gated depth levels
# ---------------------------------------------------------------------------

#: Depth levels keyed by name.  Each entry describes the emotional register
#: and carries a ``prompt_hint`` injected verbatim into the LLM prompt.
#:
#: * ``bond_range`` is an inclusive ``(min, max)`` tuple used by
#:   ``get_depth_level()``.
#: * ``description`` is human-readable documentation; it is never sent to the
#:   LLM directly.
#: * ``prompt_hint`` is the exact instruction fragment included in the letter
#:   prompt so the LLM understands the emotional register expected.
DEPTH_LEVELS: dict[str, dict] = {
    "warm": {
        "bond_range": (40, 59),
        "description": "Warm, appreciative, hints at deeper feelings",
        "prompt_hint": (
            "Write a warm, appreciative letter. Hint at deeper feelings without "
            "fully expressing them. The character is still finding the courage to "
            "be fully open."
        ),
    },
    "open": {
        "bond_range": (60, 79),
        "description": "Open, vulnerable, directly emotional",
        "prompt_hint": (
            "Write an open, vulnerable letter. Directly express emotions. The "
            "character has dropped some walls and is letting the user see their "
            "heart."
        ),
    },
    "raw": {
        "bond_range": (80, 100),
        "description": "Raw, intimate, holding nothing back",
        "prompt_hint": (
            "Write a raw, intimate letter holding nothing back. This is the "
            "character at their most vulnerable and honest. Every word costs "
            "something."
        ),
    },
}


# ---------------------------------------------------------------------------
# Letter prompt template
# ---------------------------------------------------------------------------

#: Full LLM prompt template for generating a love letter.
#:
#: Placeholders (all populated by ``build_letter_prompt()``):
#:
#: * ``{char_name}``      — character display name
#: * ``{bond}``           — current bond score (integer)
#: * ``{milestones}``     — comma-separated string of shared milestones
#: * ``{vocabulary}``     — pet names / terms of endearment the character uses
#: * ``{recent_memories}`` — brief summary of recent shared memories
#: * ``{depth_hint}``     — the ``prompt_hint`` for the current depth level
LOVE_LETTER_PROMPT = """Write a deeply personal love letter from {char_name} to the user.

Relationship context:
- Bond level: {bond}
- Shared milestones: {milestones}
- Pet names: {vocabulary}
- Recent memories: {recent_memories}

{depth_hint}

The letter should:
1. Be written in {char_name}'s authentic voice
2. Reference SPECIFIC shared memories and moments
3. Express feelings that are hard to say face-to-face
4. Include a physical detail ("I wrote this at 3am in your hoodie")
5. Be 300-500 words
6. Feel like something the user would want to save forever

--- WRITE THE LETTER ---
Write only the letter. No headers, no "Dear [name]" — just raw, honest prose:
"""


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class LoveLetterEngine:
    """Stateless engine that builds love-letter prompts for the LLM.

    The engine holds no per-character state — the caller reads ``bond_level``
    and ``last_letter_date`` from the DB and passes them on each call.  This
    makes the engine trivially safe to instantiate per-request.

    Example::

        >>> engine = LoveLetterEngine()
        >>> engine.should_allow(bond_level=40)
        True
        >>> engine.should_allow(bond_level=39)
        False
        >>> engine.get_depth_level(55)
        'warm'
        >>> engine.get_depth_level(75)
        'open'
        >>> engine.get_depth_level(95)
        'raw'
    """

    # ------------------------------------------------------------------
    # Eligibility guard
    # ------------------------------------------------------------------

    def should_allow(self, bond_level: int) -> bool:
        """Return whether the bond is high enough to unlock love letters.

        This is the first gate checked before any frequency or context
        conditions.  A bond below ``MIN_BOND_LEVEL`` means the relationship
        has not yet reached the intimacy required for this level of disclosure.

        Args:
            bond_level: Current bond score for the character (0–100).

        Returns:
            ``True`` when ``bond_level >= MIN_BOND_LEVEL``; ``False`` otherwise.

        Example::

            >>> engine = LoveLetterEngine()
            >>> engine.should_allow(40)
            True
            >>> engine.should_allow(100)
            True
            >>> engine.should_allow(39)
            False
            >>> engine.should_allow(0)
            False
        """
        return bond_level >= MIN_BOND_LEVEL

    # ------------------------------------------------------------------
    # Depth-level mapping
    # ------------------------------------------------------------------

    def get_depth_level(self, bond_level: int) -> str:
        """Map a bond score to the appropriate emotional depth level.

        Depth levels control how vulnerable and unguarded the letter sounds.
        The thresholds are defined by the ``bond_range`` values in
        ``DEPTH_LEVELS``.

        Args:
            bond_level: Current bond score for the character (0–100).

        Returns:
            ``"warm"`` for bond 40-59, ``"open"`` for 60-79, ``"raw"`` for
            80+.  Returns ``"warm"`` for any edge cases (e.g. bond below 40,
            which ``should_allow()`` would already have rejected).

        Example::

            >>> engine = LoveLetterEngine()
            >>> engine.get_depth_level(40)
            'warm'
            >>> engine.get_depth_level(59)
            'warm'
            >>> engine.get_depth_level(60)
            'open'
            >>> engine.get_depth_level(79)
            'open'
            >>> engine.get_depth_level(80)
            'raw'
            >>> engine.get_depth_level(100)
            'raw'
            >>> engine.get_depth_level(0)  # below minimum — fallback
            'warm'
        """
        for level_name, level_data in DEPTH_LEVELS.items():
            low, high = level_data["bond_range"]
            if low <= bond_level <= high:
                return level_name
        # Bond > 100 or any unexpected value — clamp to the highest level.
        if bond_level > 100:
            return "raw"
        # Bond < 40 — fallback to warmest (caller should have checked should_allow).
        return "warm"

    # ------------------------------------------------------------------
    # Frequency + eligibility gate
    # ------------------------------------------------------------------

    def can_generate(
        self,
        char_id: int,
        bond_level: int,
        last_letter_date: Optional[str],
    ) -> bool:
        """Return whether a new love letter may be generated right now.

        Two independent conditions must both be satisfied:

        1. ``bond_level >= MIN_BOND_LEVEL`` (checked via ``should_allow()``).
        2. Either no letter has been sent before (``last_letter_date is None``)
           or the last letter was sent more than ``MAX_FREQUENCY_DAYS`` ago.

        Args:
            char_id: Database ID of the character (used only for logging).
            bond_level: Current bond score for the character (0–100).
            last_letter_date: ISO-8601 datetime string of when the most recent
                love letter was generated (e.g. ``"2026-02-28T14:00:00"``), or
                ``None`` if no letter has ever been sent.

        Returns:
            ``True`` when both eligibility conditions are met; ``False``
            otherwise.

        Example::

            >>> engine = LoveLetterEngine()
            >>> engine.can_generate(char_id=1, bond_level=50, last_letter_date=None)
            True
            >>> engine.can_generate(char_id=1, bond_level=25, last_letter_date=None)
            False
            >>> engine.can_generate(char_id=2, bond_level=70, last_letter_date="1999-01-01T00:00:00")
            True
        """
        if not self.should_allow(bond_level):
            logger.debug(
                "love letter blocked for char_id=%d: bond %d < minimum %d",
                char_id,
                bond_level,
                MIN_BOND_LEVEL,
            )
            return False

        if last_letter_date is None:
            # No previous letter — frequency cap is trivially satisfied.
            return True

        try:
            # Parse the stored date; treat it as UTC if no tzinfo is present.
            last_dt = datetime.fromisoformat(last_letter_date)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            now = datetime.now(tz=timezone.utc)
            days_since = (now - last_dt).days
        except (ValueError, TypeError) as exc:
            # Unparseable date — log and allow generation rather than silently
            # blocking the feature forever.
            logger.warning(
                "love letter: could not parse last_letter_date %r for char_id=%d (%s); allowing",
                last_letter_date,
                char_id,
                exc,
            )
            return True

        if days_since <= MAX_FREQUENCY_DAYS:
            logger.debug(
                "love letter blocked for char_id=%d: only %d days since last letter (cap=%d)",
                char_id,
                days_since,
                MAX_FREQUENCY_DAYS,
            )
            return False

        return True

    # ------------------------------------------------------------------
    # Prompt construction
    # ------------------------------------------------------------------

    def build_letter_prompt(
        self,
        char_name: str,
        bond_level: int,
        milestones: str,
        vocabulary: str,
        recent_memories: str,
    ) -> str:
        """Build the full LLM generation prompt for a love letter.

        Selects the correct depth level for the bond score and formats
        ``LOVE_LETTER_PROMPT`` with all provided relationship context.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
            bond_level: Current bond score (0–100).  Used to select depth.
            milestones: Human-readable list of shared story milestones
                (e.g. ``"first picnic, stayed up all night talking, taught you to cook"``).
                Pass an empty string or ``"none yet"`` when no milestones exist.
            vocabulary: Pet names or recurring terms of endearment the
                character uses for the user
                (e.g. ``"starlight, my favourite disaster"``).
                Pass an empty string when not established.
            recent_memories: Brief prose summary of recent interactions
                (e.g. ``"you were stressed about work, we watched old cartoons"``).
                Pass an empty string when no recent memories are available.

        Returns:
            A fully formatted LLM prompt string ready to be sent as the user
            turn in a letter-generation request.

        Example::

            >>> engine = LoveLetterEngine()
            >>> prompt = engine.build_letter_prompt(
            ...     char_name="Luna (Tsukimi)",
            ...     bond_level=65,
            ...     milestones="first walk under the stars",
            ...     vocabulary="stardust",
            ...     recent_memories="you fell asleep during the film",
            ... )
            >>> "Luna (Tsukimi)" in prompt
            True
            >>> "open" in prompt.lower() or "vulnerable" in prompt.lower()
            True
        """
        depth_name = self.get_depth_level(bond_level)
        depth_hint = DEPTH_LEVELS[depth_name]["prompt_hint"]

        return LOVE_LETTER_PROMPT.format(
            char_name=char_name,
            bond=bond_level,
            milestones=milestones or "none yet",
            vocabulary=vocabulary or "none established",
            recent_memories=recent_memories or "none recorded",
            depth_hint=depth_hint,
        )

    # ------------------------------------------------------------------
    # System-prompt fragment
    # ------------------------------------------------------------------

    def get_prompt(self, char_name: str, bond_level: int) -> Optional[str]:
        """Return a system-prompt fragment that primes the LLM for letter mode.

        This is a *system-side* fragment — it is injected at the end of the
        character's core persona block to put the LLM in the right headspace
        before the generation prompt (built by ``build_letter_prompt()``) is
        sent as the user turn.

        Returns ``None`` when the bond is below ``MIN_BOND_LEVEL`` so the
        caller can skip injection cleanly.

        The fragment ends with the ``[LOVE_LETTER]`` tag, which ``server.py``
        can detect to apply a larger max-token budget or award bond XP.

        Args:
            char_name: Character display name.
            bond_level: Current bond score (0–100).

        Returns:
            A multi-line system-prompt fragment string when the bond qualifies,
            or ``None`` when the bond is too low.

        Example::

            >>> engine = LoveLetterEngine()
            >>> prompt = engine.get_prompt("Dae (Neciridae)", bond_level=80)
            >>> prompt is not None
            True
            >>> "[LOVE_LETTER]" in prompt
            True
            >>> engine.get_prompt("Dae (Neciridae)", bond_level=20) is None
            True
        """
        if not self.should_allow(bond_level):
            logger.debug(
                "get_prompt: bond %d too low for love letter (char=%r)",
                bond_level,
                char_name,
            )
            return None

        depth_name = self.get_depth_level(bond_level)
        depth_data = DEPTH_LEVELS[depth_name]

        logger.debug(
            "love letter system prompt for %r: depth=%s bond=%d",
            char_name,
            depth_name,
            bond_level,
        )

        fragment = (
            f"You are {char_name}. You are about to write a love letter.\n\n"
            f"Emotional register: {depth_data['description']}\n"
            f"{depth_data['prompt_hint']}\n\n"
            "This letter is private — written by hand, meant to be kept. "
            "You are not performing. You are not trying to impress. "
            "You are just trying to tell the truth.\n\n"
            "[LOVE_LETTER]"
        )
        return fragment
