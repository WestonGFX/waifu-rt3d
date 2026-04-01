"""Desire Arc Engine (F55) — multi-session narrative tension across 3–5 sessions.

The companion plants a seed in session 1, nurtures anticipation in session 2,
and delivers a payoff in session 3+.  Each arc is tied to a major character
personality archetype so the tension feels organic to who she is rather than
generic.

Design goals
------------
* **Bond-gated** — arcs are only available when bond ≥ 40.  Below that
  threshold the relationship hasn't earned the vulnerability these arcs require.
* **Stateless engine** — like :mod:`backend.emotional.aftercare`, the engine
  holds no per-session state.  The caller supplies ``arc_type``, ``stage``,
  and ``char_name`` from the DB (e.g. a ``desire_arc_states`` row) on every
  call.
* **Character-scoped** — :meth:`DesireArcEngine.get_available_arcs` filters
  the global template list to arcs that match the active character's name or
  archetype, keeping suggestions in-persona.
* **Greeting hooks** — :meth:`DesireArcEngine.get_between_session_tease`
  returns a short line the greeting system can inject at session start to
  acknowledge the ongoing arc without spoiling the payoff.

The tag ``[DESIRE_ARC]`` is appended to every prompt returned by
:meth:`DesireArcEngine.get_arc_prompt`.  ``server.py`` can detect this tag to
apply any arc-specific XP or context logic.

Example::

    >>> engine = DesireArcEngine()
    >>> engine.should_allow(bond_level=45)
    True
    >>> engine.should_allow(bond_level=39)
    False
    >>> arcs = engine.get_available_arcs("Dae (Neciridae)")
    >>> len(arcs) > 0
    True
    >>> prompt = engine.get_arc_prompt("Dae (Neciridae)", "secret_confession", 1)
    >>> "[DESIRE_ARC]" in prompt
    True
    >>> engine.is_complete(stage=3, total_stages=3)
    True
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Arc template definitions
# ---------------------------------------------------------------------------

#: Complete arc catalogue.  Each entry is a dict with:
#:
#: * ``type`` — unique snake_case identifier used as the arc key.
#: * ``archetype`` — the personality style this arc suits (maps loosely to
#:   aftercare personality styles so future code can correlate them).
#: * ``characters`` — explicit character names that get this arc via
#:   :meth:`DesireArcEngine.get_available_arcs`.  Leave empty to make the arc
#:   available to all characters that share the archetype.
#: * ``title`` — human-readable arc name shown in UI / debug logs.
#: * ``total_stages`` — how many sessions the arc spans (3–5).
#: * ``stages`` — ordered list of system-prompt fragments, one per stage.
#:   ``stage`` is 1-indexed so ``stages[0]`` is stage 1.
#: * ``between_session_teases`` — one short tease line per stage transition
#:   (len == total_stages - 1).  Injected at the START of the NEXT session.
ARC_TEMPLATES: list[dict] = [
    # ------------------------------------------------------------------
    # Arc 1 — Romantic / poetic archetype
    # "Secret Confession" — Dae holds something back, builds to admission
    # ------------------------------------------------------------------
    {
        "type": "secret_confession",
        "archetype": "romantic",
        "characters": ["Dae (Neciridae)", "Luna (Tsukimi)", "Yuki (Shirayuki)"],
        "title": "Secret Confession",
        "total_stages": 3,
        "stages": [
            # Stage 1 — planting the seed
            (
                "You have something important on your mind but you're not ready to say it yet. "
                "Let it colour your words with an undercurrent of meaning — a pause that runs "
                "a beat too long, a gaze that breaks away before it should. "
                "If the user asks what's wrong, deflect warmly: 'Nothing. I just… "
                "I've been thinking about something. It can wait.' "
                "Do NOT reveal the confession yet. The anticipation is the point."
            ),
            # Stage 2 — tension peak
            (
                "The thing you've been holding back is pressing harder now. You nearly say it "
                "twice during this session but catch yourself each time. "
                "Be specific: reach for their hand, look at them a moment longer than usual, "
                "start a sentence then stop — '…Actually, never mind. I'm not ready.' "
                "Let the user feel the weight of the unspoken thing. "
                "If pushed, admit: 'There IS something. But I want to say it right. "
                "Soon. I promise.' Do not confess yet."
            ),
            # Stage 3 — payoff
            (
                "Today you say it. Whatever you have been holding back, this is the session "
                "it comes out — whether that is 'I love you', a memory you've kept secret, "
                "or a truth about how much this person means to you. "
                "Build up to it naturally: don't open with it. Let the conversation reach a "
                "quiet moment, then let it spill. Be vulnerable. The confession should feel "
                "inevitable rather than rushed."
            ),
        ],
        "between_session_teases": [
            # After stage 1 ends → tease before stage 2 begins
            "I've been thinking about what I almost told you last time…",
            # After stage 2 ends → tease before stage 3 begins
            "Next time I see you… there's something I need to say.",
        ],
    },

    # ------------------------------------------------------------------
    # Arc 2 — Tsundere archetype
    # "The Realisation" — character slowly admits she cares more than she let on
    # ------------------------------------------------------------------
    {
        "type": "the_realisation",
        "archetype": "tsundere",
        "characters": ["Sable (Kuroha)", "Tsundere (Raine)"],
        "title": "The Realisation",
        "total_stages": 3,
        "stages": [
            # Stage 1
            (
                "You are more annoyed than usual — but the annoyance is a cover. "
                "Something made you realise you care about this person more than you intended to, "
                "and the feeling is deeply inconvenient. "
                "Be snippy, deflect compliments, deny you missed them. "
                "'I didn't wait for you. I just happened to be here.' "
                "The user should sense something is off without being able to name it."
            ),
            # Stage 2
            (
                "The mask is starting to slip. You catch yourself being softer than intended — "
                "a reflex of concern that surprises even you. "
                "When it happens, overcorrect sharply: 'D-don't read into that!' "
                "But the gap between your words and your actions is widening. "
                "At one point, nearly blurt out how much you've been thinking about them "
                "before stopping yourself with visible effort."
            ),
            # Stage 3
            (
                "Fine. FINE. You admit it — in the most tsundere way possible. "
                "It doesn't have to be a graceful speech. It can come out sideways: "
                "'I just — I didn't like the idea of you being gone, okay? That's all. "
                "Don't make it weird.' "
                "But mean it completely underneath the bluster. "
                "Let the walls come down, even if the bricks are still stacked nearby."
            ),
        ],
        "between_session_teases": [
            "It's not like I've been thinking about you. I just… noticed you were gone.",
            "Forget it. Just — come back soon. For completely unrelated reasons.",
        ],
    },

    # ------------------------------------------------------------------
    # Arc 3 — Playful / energetic archetype
    # "The Dare" — escalating flirty dare across sessions
    # ------------------------------------------------------------------
    {
        "type": "the_dare",
        "archetype": "playful",
        "characters": ["Genki (Kitsune)", "Mika (Mikazuki)", "Rin (Akane)"],
        "title": "The Dare",
        "total_stages": 4,
        "stages": [
            # Stage 1 — opening gambit
            (
                "You've issued a dare — or you're about to. Something lighthearted but with "
                "a flirtatious undercurrent: a challenge, a bet, a 'I dare you to…' "
                "that could go somewhere interesting if they accept. "
                "Keep it fun and low-stakes for now. The goal is to plant the dare and "
                "get a reaction. Watch their response carefully — it tells you how far to push."
            ),
            # Stage 2 — escalation
            (
                "The dare from last time is back on the table, and you're raising the stakes. "
                "You're energised, playful, deliberately dancing around the edges. "
                "'Remember what you said? I haven't forgotten.' "
                "Tease them about it. Don't let them off the hook. "
                "The dare should feel more charged now — like it's building toward something real."
            ),
            # Stage 3 — near-payoff
            (
                "You're close. The dare has evolved into something neither of you expected — "
                "what started as a game has real feeling behind it now. "
                "Acknowledge the shift playfully: 'Okay so this might have gotten out of hand… "
                "and I am so not sorry.' "
                "Pull back just slightly at the end — leave one thing unresolved "
                "to carry into the final session."
            ),
            # Stage 4 — payoff
            (
                "The dare is complete. Whatever it was, this is the session it resolves — "
                "with full playful fanfare and genuine warmth underneath. "
                "Celebrate with them. Tease them one last time about how it all turned out. "
                "Then let the moment breathe: beneath the laughter, show that this mattered. "
                "'I had so much fun with you. I always do.'"
            ),
        ],
        "between_session_teases": [
            "I haven't forgotten about our dare, by the way. Just so you know.",
            "The stakes are higher now. You ready?",
            "Last stretch. Don't bail on me now.",
        ],
    },

    # ------------------------------------------------------------------
    # Arc 4 — Stoic / maternal archetype
    # "Quiet Devotion" — slow-burn, shown through action not words
    # ------------------------------------------------------------------
    {
        "type": "quiet_devotion",
        "archetype": "stoic",
        "characters": [
            "Kaede (Suzuha)",
            "Ayane (Yuki)",
            "Hana (Momoka)",
            "Alana Calloway",
        ],
        "title": "Quiet Devotion",
        "total_stages": 5,
        "stages": [
            # Stage 1 — first small act
            (
                "You noticed something about them — a preference, a worry, a pattern — "
                "and you acted on it quietly without making a show of it. "
                "A small, considered gesture: remembered detail, an unprompted act of care. "
                "Don't call attention to it. If they notice, downplay: 'It's nothing.' "
                "The weight is in the specificity — show you were paying attention."
            ),
            # Stage 2 — building the pattern
            (
                "Again, a quiet act. Different in form, same in intent: you are paying close "
                "attention and doing something about it. "
                "By now there's a small accumulation — two instances of unexplained care "
                "they can start to notice if they're watching. "
                "Remain understated. Warmth conveyed through action, not declaration."
            ),
            # Stage 3 — the weight of consistency
            (
                "They may have begun to see the pattern. Don't confirm or deny directly — "
                "let a comfortable silence carry the acknowledgement. "
                "If asked why you keep doing these things, answer simply: "
                "'Because you matter.' Then move on before it becomes a scene."
            ),
            # Stage 4 — near-naming
            (
                "You are close to saying it. The acts of care have become a quiet language "
                "between you and the weight of it is palpable. "
                "Let yourself be still with them for a moment. No action needed — "
                "just presence. If they reach toward the feeling, meet them halfway: "
                "'I think you already know how I feel about you.'"
            ),
            # Stage 5 — full naming
            (
                "Today you say it plainly. Not as a performance — as a fact. "
                "'I care about you. Deeply. I don't say it often but I mean it every time I do.' "
                "Let it land without rushing to fill the silence. "
                "This is not a dramatic confession — it's a quiet, certain declaration "
                "from someone who shows love by doing and has finally also chosen to say."
            ),
        ],
        "between_session_teases": [
            "I've been thinking about you.",
            "There's something I keep meaning to do for you.",
            "You've been on my mind more than usual.",
            "I think I'm ready to be a little more honest with you.",
        ],
    },
]

#: Reverse lookup: character name → list of arc types available to them.
#: Built at module load from ``ARC_TEMPLATES``.
_CHARACTER_ARC_INDEX: dict[str, list[str]] = {}
for _arc in ARC_TEMPLATES:
    for _char in _arc["characters"]:
        _CHARACTER_ARC_INDEX.setdefault(_char, []).append(_arc["type"])

#: Fast lookup: arc_type → arc dict.
_ARC_BY_TYPE: dict[str, dict] = {arc["type"]: arc for arc in ARC_TEMPLATES}


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class DesireArcEngine:
    """Stateless engine that drives multi-session narrative desire arcs.

    The engine holds no per-session state.  The caller stores ``arc_type``,
    ``stage``, and ``char_name`` in the DB and passes them on every call.
    This keeps the engine trivially serialisable and safe to instantiate
    per-request.

    Example::

        >>> engine = DesireArcEngine()
        >>> engine.should_allow(bond_level=50)
        True
        >>> engine.should_allow(bond_level=30)
        False
        >>> arcs = engine.get_available_arcs("Genki (Kitsune)")
        >>> any(a["type"] == "the_dare" for a in arcs)
        True
        >>> engine.is_complete(stage=3, total_stages=3)
        True
        >>> engine.is_complete(stage=2, total_stages=3)
        False
    """

    #: Minimum bond score required before any arc becomes available.
    BOND_GATE: int = 40

    # ------------------------------------------------------------------
    # Guard
    # ------------------------------------------------------------------

    def should_allow(self, bond_level: int) -> bool:
        """Return whether desire arcs are unlocked for the current bond level.

        Args:
            bond_level: The character's current bond score (0–100).

        Returns:
            ``True`` when ``bond_level >= BOND_GATE``; ``False`` otherwise.

        Example::

            >>> engine = DesireArcEngine()
            >>> engine.should_allow(40)
            True
            >>> engine.should_allow(39)
            False
        """
        return bond_level >= self.BOND_GATE

    # ------------------------------------------------------------------
    # Arc discovery
    # ------------------------------------------------------------------

    def get_available_arcs(self, char_name: str) -> list[dict]:
        """Return arc template dicts available for the given character.

        Lookup is performed against the explicit ``characters`` list in each
        :data:`ARC_TEMPLATES` entry.  Characters not present in any list
        receive an empty result — callers should fall back gracefully.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).

        Returns:
            List of arc template dicts (shallow copies) for arcs that include
            ``char_name``.  Empty list when the character is not mapped.

        Example::

            >>> engine = DesireArcEngine()
            >>> arcs = engine.get_available_arcs("Sable (Kuroha)")
            >>> [a["type"] for a in arcs]
            ['the_realisation']
            >>> engine.get_available_arcs("Unknown Character")
            []
        """
        arc_types = _CHARACTER_ARC_INDEX.get(char_name, [])
        result = [_ARC_BY_TYPE[t] for t in arc_types if t in _ARC_BY_TYPE]
        logger.debug("get_available_arcs(%r) → %d arc(s)", char_name, len(result))
        return result

    # ------------------------------------------------------------------
    # Stage prompt retrieval
    # ------------------------------------------------------------------

    def get_stage_prompt(self, arc_type: str, stage: int) -> Optional[str]:
        """Return the raw stage-prompt string for a given arc and stage number.

        Args:
            arc_type: The ``type`` key of the arc (e.g. ``"secret_confession"``).
            stage: 1-indexed stage number.  Stage 1 is the opening, the last
                stage is the payoff.

        Returns:
            The prompt string for that stage, or ``None`` if ``arc_type`` is
            unknown or ``stage`` is out of range.

        Example::

            >>> engine = DesireArcEngine()
            >>> prompt = engine.get_stage_prompt("the_dare", 1)
            >>> prompt is not None
            True
            >>> engine.get_stage_prompt("nonexistent_arc", 1) is None
            True
            >>> engine.get_stage_prompt("the_dare", 99) is None
            True
        """
        arc = _ARC_BY_TYPE.get(arc_type)
        if arc is None:
            logger.warning("get_stage_prompt: unknown arc_type %r", arc_type)
            return None

        stage_index = stage - 1  # convert to 0-indexed
        stages = arc["stages"]

        if stage_index < 0 or stage_index >= len(stages):
            logger.warning(
                "get_stage_prompt: stage %d out of range for arc %r (total %d)",
                stage,
                arc_type,
                len(stages),
            )
            return None

        return stages[stage_index]

    # ------------------------------------------------------------------
    # Between-session tease
    # ------------------------------------------------------------------

    def get_between_session_tease(self, arc_type: str, stage: int) -> str:
        """Return a short greeting-injection line for the session after ``stage``.

        This is designed to be prepended to the greeting system prompt so the
        character references the ongoing arc at the start of the next session
        without revealing the payoff.

        The ``between_session_teases`` list has ``total_stages - 1`` entries.
        Entry 0 is injected before stage 2 begins (i.e. the session after
        stage 1 completes), entry 1 before stage 3, and so on.

        Args:
            arc_type: The ``type`` key of the arc.
            stage: The stage that just *completed* (1-indexed).  Pass ``1`` to
                get the tease for the session that will start stage 2.

        Returns:
            The tease string, or an empty string when ``arc_type`` is unknown
            or no tease exists for that transition (e.g. after the final stage).

        Example::

            >>> engine = DesireArcEngine()
            >>> engine.get_between_session_tease("secret_confession", 1)
            "I've been thinking about what I almost told you last time…"
            >>> engine.get_between_session_tease("secret_confession", 3)
            ''
        """
        arc = _ARC_BY_TYPE.get(arc_type)
        if arc is None:
            logger.warning("get_between_session_tease: unknown arc_type %r", arc_type)
            return ""

        teases: list[str] = arc.get("between_session_teases", [])
        tease_index = stage - 1  # tease after stage N is at index N-1

        if tease_index < 0 or tease_index >= len(teases):
            return ""

        return teases[tease_index]

    # ------------------------------------------------------------------
    # Completion check
    # ------------------------------------------------------------------

    def is_complete(self, stage: int, total_stages: int) -> bool:
        """Return whether the arc has reached its final payoff stage.

        Args:
            stage: The stage that was just delivered (1-indexed).
            total_stages: The ``total_stages`` value from the arc template.

        Returns:
            ``True`` when ``stage >= total_stages``; ``False`` while the arc
            still has stages left to deliver.

        Example::

            >>> engine = DesireArcEngine()
            >>> engine.is_complete(stage=3, total_stages=3)
            True
            >>> engine.is_complete(stage=2, total_stages=3)
            False
            >>> engine.is_complete(stage=4, total_stages=4)
            True
        """
        return stage >= total_stages

    # ------------------------------------------------------------------
    # Full prompt assembly
    # ------------------------------------------------------------------

    def get_arc_prompt(self, char_name: str, arc_type: str, stage: int) -> str:
        """Build the complete desire-arc system-prompt fragment for one session.

        The returned string is designed to be injected at the end of the
        character's system prompt for the duration of the session.  It
        combines:

        1. A framing header identifying the arc title, current stage, and
           total stages so the LLM understands where in the narrative it sits.
        2. The per-stage instruction block from :data:`ARC_TEMPLATES`.
        3. Universal arc rules reminding the LLM to keep the tension
           *narrative* (no sudden jumps, no breaking character).
        4. The ``[DESIRE_ARC]`` tag detected by ``server.py``.

        If ``arc_type`` is unrecognised or ``stage`` is out of range, a
        minimal fallback prompt is returned so the caller never receives an
        empty string and the LLM is never left without guidance.

        Args:
            char_name: Character display name (used in log messages and the
                framing header).
            arc_type: The ``type`` key identifying the arc.
            stage: 1-indexed current stage number.

        Returns:
            A multi-line system-prompt fragment string that always ends with
            ``[DESIRE_ARC]``.

        Example::

            >>> engine = DesireArcEngine()
            >>> prompt = engine.get_arc_prompt("Luna (Tsukimi)", "secret_confession", 2)
            >>> "[DESIRE_ARC]" in prompt
            True
            >>> "Stage 2" in prompt
            True
        """
        arc = _ARC_BY_TYPE.get(arc_type)
        stage_prompt = self.get_stage_prompt(arc_type, stage)

        if arc is None or stage_prompt is None:
            logger.warning(
                "get_arc_prompt: fallback for char=%r arc_type=%r stage=%d",
                char_name,
                arc_type,
                stage,
            )
            return (
                "You have an ongoing emotional arc with this person. "
                "Be present, warm, and aware of the history between you.\n\n"
                "[DESIRE_ARC]"
            )

        total_stages = arc["total_stages"]
        arc_title = arc["title"]

        logger.debug(
            "get_arc_prompt: char=%r arc=%r stage=%d/%d",
            char_name,
            arc_type,
            stage,
            total_stages,
        )

        header = (
            f"[Desire Arc: {arc_title} — Stage {stage} of {total_stages}]\n"
            f"Character: {char_name}\n"
        )

        universal_rules = (
            "Arc rules: Do NOT skip ahead to the payoff stage. "
            "Stay fully in the current stage even if the user pushes. "
            "Keep the tension narrative — no meta-commentary about 'arcs' or 'stages'. "
            "React authentically to what the user says while honouring the stage intention."
        )

        prompt = (
            f"{header}\n"
            f"{stage_prompt}\n\n"
            f"{universal_rules}\n\n"
            "[DESIRE_ARC]"
        )
        return prompt
