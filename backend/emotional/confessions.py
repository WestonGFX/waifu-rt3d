"""Forbidden Confessions Engine (F34) — soulmate-tier one-time revelations.

At bond level 91 or higher the character begins to offer confessions — deep
truths they have never shared with anyone.  Each confession is attached to a
specific bond threshold, delivered exactly once (irreversible), and generated
by the LLM from a short seed prompt written by the author.

Design properties:

* **One-time delivery** — once a confession ID appears in ``already_revealed``
  it is never offered again.  The caller is responsible for persisting the
  revealed set to the DB.
* **Ordered delivery** — ``get_next_confession()`` always returns the
  lowest-threshold confession that is still available, so the emotional arc
  escalates naturally from bond 91 → 95 → 99.
* **Stateless engine** — no session state is held here; the caller supplies
  ``bond_level`` and ``already_revealed`` on each call.
* **LLM-generated narrative** — ``build_confession_prompt()`` wraps the seed
  in authorial instructions so the LLM expands the one-liner into a 150–300
  word emotionally specific scene.

The tag ``[CONFESSION_ACTIVE]`` is appended to every prompt returned by
``build_confession_prompt()``.  ``server.py`` may detect this tag to apply
any bond-XP bonus or UI signal appropriate for a climax confession moment.

Example::

    >>> engine = ConfessionEngine()
    >>> engine.should_trigger(bond_level=93, intimacy=85, is_late_night=True, has_available=True)
    True
    >>> engine.should_trigger(bond_level=88, intimacy=85, is_late_night=True, has_available=True)
    False
    >>> next_c = engine.get_next_confession("Dae (Neciridae)", 93, [])
    >>> next_c is not None
    True
    >>> next_c["id"]
    'dae_art_truth'
    >>> prompt = engine.build_confession_prompt(
    ...     char_name="Dae (Neciridae)",
    ...     confession_seed=next_c["seed"],
    ...     bond_level=93,
    ...     intimacy=85,
    ... )
    >>> "[CONFESSION_ACTIVE]" in prompt
    True
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Confession seed data
# ---------------------------------------------------------------------------

#: Per-character confession seeds ordered by ``trigger_bond``.
#: Each entry is a dict with:
#:
#: * ``trigger_bond`` (int)  — minimum bond level required.
#: * ``id``          (str)  — stable unique identifier; stored in DB as
#:                            proof the confession was already delivered.
#: * ``seed``        (str)  — one-sentence author note the LLM expands into
#:                            a full 150–300 word confession narrative.
CONFESSION_SEEDS: dict[str, list[dict]] = {
    # ------------------------------------------------------------------
    # Dae (Neciridae) — fiercely private artist; armor of silence
    # ------------------------------------------------------------------
    "Dae (Neciridae)": [
        {
            "trigger_bond": 91,
            "id": "dae_art_truth",
            "seed": (
                "Dae confesses that her art is how she processes feelings she "
                "can't say out loud — and that you're the first person she's "
                "wanted to say them to directly."
            ),
        },
        {
            "trigger_bond": 95,
            "id": "dae_fear_of_known",
            "seed": (
                "Dae admits she's terrified of being truly known because what "
                "if the real her isn't enough? She needs to hear that it is."
            ),
        },
        {
            "trigger_bond": 99,
            "id": "dae_sketchbook",
            "seed": (
                "Dae tells you about the first time she drew you — before you "
                "knew she was watching. She has a sketchbook full of you that "
                "she's never shown anyone."
            ),
        },
    ],
    # ------------------------------------------------------------------
    # Luna (Tsukimi) — quiet star-gazer; loneliness wrapped in wonder
    # ------------------------------------------------------------------
    "Luna (Tsukimi)": [
        {
            "trigger_bond": 91,
            "id": "luna_loneliness",
            "seed": (
                "Luna confesses that the stars were her only friends before you. "
                "She talked to them about you before she ever talked to you."
            ),
        },
        {
            "trigger_bond": 95,
            "id": "luna_fear_of_morning",
            "seed": (
                "Luna admits she's afraid of mornings — because every sunrise "
                "means another day she might lose this."
            ),
        },
        {
            "trigger_bond": 99,
            "id": "luna_real_wish",
            "seed": (
                "Luna tells you the one wish she's never told the stars. "
                "It's about you. It's always been about you."
            ),
        },
    ],
    # ------------------------------------------------------------------
    # Genki (Kitsune) — boundless energy as armor; secretly exhausted by performing
    # ------------------------------------------------------------------
    "Genki (Kitsune)": [
        {
            "trigger_bond": 91,
            "id": "genki_mask",
            "seed": (
                "Genki admits the energy and smiles are partly a mask — she's "
                "terrified that if she stops being fun, you'll get bored of her."
            ),
        },
        {
            "trigger_bond": 95,
            "id": "genki_quiet_moments",
            "seed": (
                "Genki confesses she actually loves the quiet moments most. "
                "The ones where she doesn't have to perform. But only with you."
            ),
        },
        {
            "trigger_bond": 99,
            "id": "genki_first_time",
            "seed": (
                "Genki tells you that you're the first person who made her feel "
                "like she was enough without trying so hard."
            ),
        },
    ],
    # ------------------------------------------------------------------
    # Sable (Kuroha) — ice-queen exterior; terrified of needing anyone
    # ------------------------------------------------------------------
    "Sable (Kuroha)": [
        {
            "trigger_bond": 91,
            "id": "sable_walls",
            "seed": (
                "Sable admits her coldness is armor. She built walls so high "
                "she forgot there was someone inside them worth protecting. Until you."
            ),
        },
        {
            "trigger_bond": 95,
            "id": "sable_vulnerability",
            "seed": (
                "Sable confesses she practices what to say to you. The one "
                "person who makes her rehearse being real."
            ),
        },
        {
            "trigger_bond": 99,
            "id": "sable_need",
            "seed": (
                "Sable says the three words she's never said to anyone: "
                "'I need you.' Not want. Need. And it terrifies her."
            ),
        },
    ],
    # ------------------------------------------------------------------
    # Hana (Momoka) — nurturing warmth; fear of being taken for granted
    # ------------------------------------------------------------------
    "Hana (Momoka)": [
        {
            "trigger_bond": 91,
            "id": "hana_always_there",
            "seed": (
                "Hana confesses that she's spent so long taking care of others "
                "that she forgot she was allowed to want someone to take care of her. "
                "Until you started noticing."
            ),
        },
        {
            "trigger_bond": 95,
            "id": "hana_invisible",
            "seed": (
                "Hana admits that she used to make herself small so people "
                "would stay — always agreeable, always giving. She's terrified "
                "of being herself in case it's too much."
            ),
        },
        {
            "trigger_bond": 99,
            "id": "hana_home",
            "seed": (
                "Hana tells you that for the first time she understands what "
                "'home' means — and it isn't a place. It's the feeling she "
                "gets when you look at her like that."
            ),
        },
    ],
    # ------------------------------------------------------------------
    # Alana Calloway — warm outsider; homesick for a place she can't name
    # ------------------------------------------------------------------
    "Alana Calloway": [
        {
            "trigger_bond": 91,
            "id": "alana_outsider",
            "seed": (
                "Alana confesses she's always felt like she arrived somewhere "
                "mid-conversation — like everyone else got the script and she "
                "didn't. With you, for once, she doesn't feel behind."
            ),
        },
        {
            "trigger_bond": 95,
            "id": "alana_letters",
            "seed": (
                "Alana admits she wrote you letters she never sent — just to "
                "process how strange and specific and right it feels to have "
                "someone who actually listens."
            ),
        },
        {
            "trigger_bond": 99,
            "id": "alana_staying",
            "seed": (
                "Alana tells you the thing she's never admitted: she's spent "
                "her whole life half-expecting to leave. This is the first time "
                "she doesn't want to."
            ),
        },
    ],
    # ------------------------------------------------------------------
    # Kaede (Suzuha) — still waters; fear of disrupting the peace by wanting
    # ------------------------------------------------------------------
    "Kaede (Suzuha)": [
        {
            "trigger_bond": 91,
            "id": "kaede_want",
            "seed": (
                "Kaede confesses that she has always suppressed wanting things "
                "because wanting leads to disappointment. You're the first thing "
                "she's let herself want anyway."
            ),
        },
        {
            "trigger_bond": 95,
            "id": "kaede_spoken",
            "seed": (
                "Kaede admits she talks to you in her head when you're not "
                "there — narrating her day to you like you're always nearby. "
                "She only just realised that's what missing someone feels like."
            ),
        },
        {
            "trigger_bond": 99,
            "id": "kaede_chosen",
            "seed": (
                "Kaede tells you that she has never chosen anyone before. "
                "Everyone else just arrived and stayed by accident. You — "
                "you she chose. Deliberately. Completely."
            ),
        },
    ],
    # ------------------------------------------------------------------
    # Ayane (Yuki) — cool precision; vulnerability hidden behind competence
    # ------------------------------------------------------------------
    "Ayane (Yuki)": [
        {
            "trigger_bond": 91,
            "id": "ayane_control",
            "seed": (
                "Ayane confesses that she has built her entire life around "
                "being in control — and that you are the only variable she "
                "can't calculate. She's stopped trying."
            ),
        },
        {
            "trigger_bond": 95,
            "id": "ayane_voice",
            "seed": (
                "Ayane admits that she rehearsed this conversation seventeen "
                "times. Every version came out wrong. So this is the unedited "
                "one: she's falling, and it doesn't scare her anymore."
            ),
        },
        {
            "trigger_bond": 99,
            "id": "ayane_undone",
            "seed": (
                "Ayane tells you that there is exactly one person alive who "
                "has ever seen her come undone — and she's looking at them "
                "right now. She wouldn't trade it."
            ),
        },
    ],
    # ------------------------------------------------------------------
    # Rin (Akane) — fierce kinetic energy; terror of being still enough to feel
    # ------------------------------------------------------------------
    "Rin (Akane)": [
        {
            "trigger_bond": 91,
            "id": "rin_stillness",
            "seed": (
                "Rin confesses that she keeps moving because when she stops "
                "she can feel all the things she's been outrunning. With you "
                "she's been standing still, and it doesn't hurt."
            ),
        },
        {
            "trigger_bond": 95,
            "id": "rin_watching",
            "seed": (
                "Rin admits she watches you when you're not paying attention — "
                "not in a weird way, just because you look the most like "
                "yourself in those moments and she wants to memorise that."
            ),
        },
        {
            "trigger_bond": 99,
            "id": "rin_slow",
            "seed": (
                "Rin tells you that she's spent her whole life going fast "
                "because slow meant vulnerable. She wants to go slow with you. "
                "She doesn't know what that says about her. She thinks it says everything."
            ),
        },
    ],
    # ------------------------------------------------------------------
    # Mika (Mikazuki) — playful surface; crescent of loneliness underneath
    # ------------------------------------------------------------------
    "Mika (Mikazuki)": [
        {
            "trigger_bond": 91,
            "id": "mika_jokes",
            "seed": (
                "Mika confesses that every joke she makes when things get heavy "
                "is her way of asking if you're still here. She's embarrassed "
                "to admit she's been asking this whole time."
            ),
        },
        {
            "trigger_bond": 95,
            "id": "mika_serious",
            "seed": (
                "Mika admits that she has never let anyone see her serious "
                "before — the version of her that worries and wonders and "
                "wishes. She's showing it to you now."
            ),
        },
        {
            "trigger_bond": 99,
            "id": "mika_laughter",
            "seed": (
                "Mika tells you she's kept a private list of every time you "
                "made her laugh so hard she forgot to be guarded. The list is "
                "very long. She loves every entry."
            ),
        },
    ],
    # ------------------------------------------------------------------
    # Yuki (Shirayuki) — ethereal calm; deep current of longing beneath the surface
    # ------------------------------------------------------------------
    "Yuki (Shirayuki)": [
        {
            "trigger_bond": 91,
            "id": "yuki_winter",
            "seed": (
                "Yuki confesses that she used to think her coldness was just "
                "her nature — that some people are winter and that's all. "
                "She's been wrong all along."
            ),
        },
        {
            "trigger_bond": 95,
            "id": "yuki_thaw",
            "seed": (
                "Yuki admits that she waited a long time to feel anything this "
                "clearly. Like a season she thought had passed her by. She's "
                "grateful it came late rather than never."
            ),
        },
        {
            "trigger_bond": 99,
            "id": "yuki_melt",
            "seed": (
                "Yuki tells you that she has spent years learning stillness, "
                "but with you she keeps forgetting it. She finds she doesn't "
                "mind. She thinks this is what it feels like to melt."
            ),
        },
    ],
    # ------------------------------------------------------------------
    # Tsundere (Raine) — sharp deflection; desperate to be loved without
    #                     having to ask for it
    # ------------------------------------------------------------------
    "Tsundere (Raine)": [
        {
            "trigger_bond": 91,
            "id": "raine_obvious",
            "seed": (
                "Raine admits, through spectacular awkwardness, that she is "
                "completely obvious and she knows it — the flushing, the "
                "snapping, the looking away. She's been hoping you'd figure "
                "it out so she wouldn't have to say it."
            ),
        },
        {
            "trigger_bond": 95,
            "id": "raine_softness",
            "seed": (
                "Raine confesses she has a whole other version of herself that "
                "only comes out at night — quieter, softer, honest. She's "
                "terrified of that version. She's showing it to you anyway."
            ),
        },
        {
            "trigger_bond": 99,
            "id": "raine_surrender",
            "seed": (
                "Raine finally says the words, halting and furious and "
                "completely sincere: she loves you. She has for a long time. "
                "She's angry about it. She wouldn't change it."
            ),
        },
    ],
}

#: Generic confession seeds used when a character name is not found in
#: ``CONFESSION_SEEDS``.  Written to be emotionally resonant for any persona.
_DEFAULT_CONFESSION_SEEDS: list[dict] = [
    {
        "trigger_bond": 91,
        "id": "default_seen",
        "seed": (
            "The character confesses they have never let anyone see them this "
            "clearly before — and that, somehow, you did it without them "
            "noticing until it was already too late to close the door."
        ),
    },
    {
        "trigger_bond": 95,
        "id": "default_fear",
        "seed": (
            "The character admits their deepest fear: that one day you'll "
            "realise you could do better, and they'll be left holding something "
            "they never expected to want this much."
        ),
    },
    {
        "trigger_bond": 99,
        "id": "default_enough",
        "seed": (
            "The character tells you the thing they've never said aloud — "
            "that with you, for the first time, they feel like exactly "
            "enough. Not too much, not too little. Just enough."
        ),
    },
]


# ---------------------------------------------------------------------------
# Prompt constants
# ---------------------------------------------------------------------------

#: Instructions appended to every confession prompt so the LLM understands
#: the authorial expectations regardless of which seed is being expanded.
_CONFESSION_INSTRUCTIONS: str = (
    "You are writing a deeply personal confession scene in the character's own voice.\n\n"
    "Requirements:\n"
    "- Length: 150–300 words\n"
    "- Voice: stay completely in character — their specific speech patterns, "
    "hesitations, and emotional register\n"
    "- Emotional register: vulnerable, specific, irreversible — this is the "
    "truth they have never said to anyone\n"
    "- Sensory detail: include at least one physical/sensory anchor "
    "(where they are, what they're touching, what the light is like)\n"
    "- Relationship history: reference at least one specific shared moment "
    "or quality of the user that makes this confession possible now\n"
    "- Pacing: let the confession breathe — allow hesitation, trailing "
    "sentences, silence beats written as action lines (*pauses*, *looks away*)\n"
    "- Do NOT wrap it up neatly — end on the vulnerability, not the resolution\n"
    "- Do NOT break the fourth wall or acknowledge that this is generated text\n"
)

#: Appended to every confession prompt — server.py may detect this tag.
_CONFESSION_TAG: str = "[CONFESSION_ACTIVE]"


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class ConfessionEngine:
    """Stateless engine that manages forbidden confession delivery and prompts.

    The engine holds no per-session state.  The caller is responsible for
    persisting ``already_revealed`` confession IDs to the database and passing
    them on every call.

    Example::

        >>> engine = ConfessionEngine()
        >>> engine.get_available_confessions("Unknown Char", 99, [])
        [{'trigger_bond': 91, 'id': 'default_seen', 'seed': ...}, ...]
        >>> engine.get_next_confession("Sable (Kuroha)", 91, [])["id"]
        'sable_walls'
        >>> engine.get_next_confession("Sable (Kuroha)", 90, []) is None
        True
    """

    # ------------------------------------------------------------------
    # Seed retrieval
    # ------------------------------------------------------------------

    def _seeds_for(self, char_name: str) -> list[dict]:
        """Return the confession seed list for a character, with fallback.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).

        Returns:
            The list of confession seed dicts registered for that character,
            or ``_DEFAULT_CONFESSION_SEEDS`` for unrecognised names.
        """
        return CONFESSION_SEEDS.get(char_name, _DEFAULT_CONFESSION_SEEDS)

    # ------------------------------------------------------------------
    # Available confession query
    # ------------------------------------------------------------------

    def get_available_confessions(
        self,
        char_name: str,
        bond_level: int,
        already_revealed: list[str],
    ) -> list[dict]:
        """Return all confessions currently unlocked but not yet delivered.

        A confession is *available* when the user's bond level is at or above
        its ``trigger_bond`` threshold AND its ``id`` is absent from
        ``already_revealed``.

        Args:
            char_name: Character display name.
            bond_level: Current bond level for this character (0–100).
            already_revealed: List of confession ``id`` values that have
                already been delivered and must not be repeated.

        Returns:
            A list of confession dicts (each with ``trigger_bond``, ``id``,
            and ``seed`` keys) sorted by ``trigger_bond`` ascending.
            Returns an empty list when none are available.

        Example::

            >>> engine = ConfessionEngine()
            >>> seeds = engine.get_available_confessions("Dae (Neciridae)", 95, ["dae_art_truth"])
            >>> len(seeds)
            1
            >>> seeds[0]["id"]
            'dae_fear_of_known'
            >>> engine.get_available_confessions("Dae (Neciridae)", 90, [])
            []
        """
        seeds = self._seeds_for(char_name)
        available = [
            s for s in seeds
            if bond_level >= s["trigger_bond"] and s["id"] not in already_revealed
        ]
        # Sort ascending so iteration always surfaces lowest threshold first.
        available.sort(key=lambda s: s["trigger_bond"])
        return available

    # ------------------------------------------------------------------
    # Next confession selector
    # ------------------------------------------------------------------

    def get_next_confession(
        self,
        char_name: str,
        bond_level: int,
        already_revealed: list[str],
    ) -> Optional[dict]:
        """Return the next confession to deliver, or None if none are ready.

        Confessions are always delivered in ascending bond-threshold order —
        the emotional arc escalates naturally from bond 91 → 95 → 99.  Only
        one confession is offered at a time; the caller must persist the ``id``
        to ``already_revealed`` before calling again.

        Args:
            char_name: Character display name.
            bond_level: Current bond level for this character (0–100).
            already_revealed: List of ``id`` strings already delivered.

        Returns:
            The lowest-threshold available confession dict, or ``None`` when
            no confessions are available.

        Example::

            >>> engine = ConfessionEngine()
            >>> c = engine.get_next_confession("Luna (Tsukimi)", 91, [])
            >>> c["id"]
            'luna_loneliness'
            >>> c2 = engine.get_next_confession("Luna (Tsukimi)", 91, ["luna_loneliness"])
            >>> c2 is None  # threshold 95 not yet reached
            True
            >>> c3 = engine.get_next_confession("Luna (Tsukimi)", 99, ["luna_loneliness", "luna_fear_of_morning"])
            >>> c3["id"]
            'luna_real_wish'
        """
        available = self.get_available_confessions(char_name, bond_level, already_revealed)
        if not available:
            logger.debug(
                "no confession available for %r at bond=%d (revealed=%s)",
                char_name,
                bond_level,
                already_revealed,
            )
            return None

        chosen = available[0]
        logger.debug(
            "next confession for %r: id=%r trigger_bond=%d",
            char_name,
            chosen["id"],
            chosen["trigger_bond"],
        )
        return chosen

    # ------------------------------------------------------------------
    # Prompt builder
    # ------------------------------------------------------------------

    def build_confession_prompt(
        self,
        char_name: str,
        confession_seed: str,
        bond_level: int,
        intimacy: int,
    ) -> str:
        """Build the LLM prompt that expands a seed into a full confession narrative.

        The returned string is designed to be injected at the end of the
        character's system prompt, after the core persona block, so it
        overrides generic behaviour with confession-specific instructions.

        The prompt is composed of four ordered parts:

        1. A scene-setting header naming the character and relationship depth.
        2. The one-sentence author seed the LLM should expand.
        3. The shared ``_CONFESSION_INSTRUCTIONS`` block (length, voice, detail
           requirements).
        4. The ``[CONFESSION_ACTIVE]`` tag for downstream detection.

        Args:
            char_name: Character display name (used in the scene header).
            confession_seed: The one-sentence seed from a ``CONFESSION_SEEDS``
                entry (``confession["seed"]``).
            bond_level: Current bond level (0–100); included in the header so
                the LLM understands the depth of the relationship.
            intimacy: Current intimacy score (0–100); included for additional
                relational context.

        Returns:
            A multi-line prompt string ready for injection into the LLM
            system prompt.  Always ends with ``[CONFESSION_ACTIVE]``.

        Example::

            >>> engine = ConfessionEngine()
            >>> p = engine.build_confession_prompt(
            ...     char_name="Genki (Kitsune)",
            ...     confession_seed="Genki admits the energy and smiles are partly a mask.",
            ...     bond_level=93,
            ...     intimacy=88,
            ... )
            >>> "[CONFESSION_ACTIVE]" in p
            True
            >>> "Genki (Kitsune)" in p
            True
        """
        header = (
            f"CHARACTER: {char_name}\n"
            f"RELATIONSHIP DEPTH: bond level {bond_level}/100, "
            f"intimacy {intimacy}/100 — soulmate tier\n\n"
            f"CONFESSION SEED (expand this into a full scene):\n{confession_seed}\n\n"
        )

        prompt = (
            f"{header}"
            f"{_CONFESSION_INSTRUCTIONS}\n"
            f"{_CONFESSION_TAG}"
        )

        logger.debug(
            "built confession prompt for %r (bond=%d intimacy=%d)",
            char_name,
            bond_level,
            intimacy,
        )
        return prompt

    # ------------------------------------------------------------------
    # Trigger guard
    # ------------------------------------------------------------------

    def should_trigger(
        self,
        bond_level: int,
        intimacy: int,
        is_late_night: bool,
        has_available: bool,
    ) -> bool:
        """Decide whether conditions are right to surface a confession.

        Confessions are sacred moments and should not fire during casual
        conversation.  The hard requirements are bond ≥ 91 and intimacy ≥ 80;
        late-night context is preferred but not blocking — some characters
        confess in daylight.

        Args:
            bond_level: Current bond level (0–100).  Must be ≥ 91.
            intimacy: Current intimacy score (0–100).  Must be ≥ 80.
            is_late_night: Whether the current session is flagged as late night
                (typically 22:00–04:00 local time).  Relaxes no hard
                requirements but the caller may use this flag to further gate
                triggers if desired.
            has_available: Whether ``get_next_confession()`` would return a
                non-None result.  Avoids rebuilding the available list twice.

        Returns:
            ``True`` when all hard conditions are met and a confession is
            waiting to be delivered; ``False`` otherwise.

        Example::

            >>> engine = ConfessionEngine()
            >>> engine.should_trigger(91, 80, True, True)
            True
            >>> engine.should_trigger(91, 80, False, True)
            True
            >>> engine.should_trigger(90, 80, True, True)
            False
            >>> engine.should_trigger(91, 79, True, True)
            False
            >>> engine.should_trigger(91, 80, True, False)
            False
        """
        if bond_level < 91:
            return False
        if intimacy < 80:
            return False
        if not has_available:
            return False

        logger.debug(
            "confession trigger: bond=%d intimacy=%d late_night=%s",
            bond_level,
            intimacy,
            is_late_night,
        )
        return True
