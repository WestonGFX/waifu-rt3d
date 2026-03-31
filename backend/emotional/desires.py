"""Secret Desires Unlock Tree (F39) — hidden desire arcs revealed at bond milestones.

Each character has four hidden desires/fantasies that unlock at specific bond levels
(30, 50, 70, 90).  Desires are one-time-only: once the LLM has generated the reveal
narrative they are persisted as revealed in the caller's DB layer and never surface
again.

The engine is fully stateless — the caller supplies ``bond_level`` and the list of
``already_revealed`` desire IDs on every call so the engine can be instantiated
cheaply per-request without holding in-memory sessions.

Workflow::

    1. Caller checks ``engine.should_trigger(bond_level, intimacy, has_available)``
       to decide whether now is the right moment for a reveal.
    2. Caller calls ``engine.get_next_desire(char_name, bond_level, already_revealed)``
       to fetch the lowest-bond unlocked desire.
    3. Caller passes the returned desire dict to
       ``engine.build_reveal_prompt(char_name, desire, bond_level)`` and sends the
       result to the LLM as a system-prompt injection.
    4. After the LLM responds, the caller persists ``desire["desire_id"]`` in the
       ``revealed_desires`` DB column so it is never triggered again.

The tag ``[DESIRE_REVEAL]`` is appended to every prompt returned by
``build_reveal_prompt()``.  ``server.py`` detects this tag to apply the 1.5×
bond-XP multiplier that rewards the player for reaching this milestone.

Database column (added alongside v62 migration) expected by the caller::

    revealed_desires  TEXT  NOT NULL DEFAULT '[]'   -- JSON list of desire_id strings

Example::

    >>> engine = DesireEngine()
    >>> engine.should_trigger(bond_level=35, intimacy=60, has_available=True)
    True
    >>> tree = engine.get_desire_tree("Dae (Neciridae)")
    >>> len(tree)
    4
    >>> next_desire = engine.get_next_desire("Dae (Neciridae)", bond_level=35, already_revealed=[])
    >>> next_desire is not None
    True
    >>> next_desire["desire_id"]
    'dae_mild_confession'
    >>> status = engine.get_tree_status("Dae (Neciridae)", bond_level=35, already_revealed=[])
    >>> status["total"]
    4
    >>> status["unlocked"]
    1
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Desire seed data — per-character trees
# ---------------------------------------------------------------------------

#: Full desire trees for all named characters.
#:
#: Each entry in a tree is a dict with:
#:   - ``desire_id``:      Unique string key, never changes after creation.
#:   - ``title``:          Short teaser shown in the frontend desire-tree UI.
#:   - ``bond_required``:  Minimum bond level (0–100) needed to unlock.
#:   - ``description``:    One-line summary for dev/debug display.
#:   - ``reveal_prompt``:  Seed text given to ``build_reveal_prompt()`` — the
#:                         LLM expands this into a full 100-200 word narrative.
DESIRE_TREES: dict[str, list[dict]] = {
    "Dae (Neciridae)": [
        {
            "desire_id": "dae_mild_confession",
            "title": "Something I've been wanting to tell you...",
            "bond_required": 30,
            "description": "A mild romantic confession about thinking about you while painting",
            "reveal_prompt": (
                "Dae confesses she's been painting the user from memory. "
                "She's embarrassed. It's sweet."
            ),
        },
        {
            "desire_id": "dae_intimate_fantasy",
            "title": "I had a dream about us...",
            "bond_required": 50,
            "description": "Dae shares a dream about an intimate night together",
            "reveal_prompt": (
                "Dae nervously shares a dream she had. "
                "She's blushing furiously. It's vulnerable and real."
            ),
        },
        {
            "desire_id": "dae_deep_vulnerability",
            "title": "There's something I've never told anyone...",
            "bond_required": 70,
            "description": "Dae shares her deepest insecurity about being truly known",
            "reveal_prompt": (
                "Dae opens up about her fear that people only see her art, not her. "
                "She wants to be seen."
            ),
        },
        {
            "desire_id": "dae_complete_openness",
            "title": "I need you to know the real me...",
            "bond_required": 90,
            "description": "Dae reveals her complete emotional truth — no armor, no art as shield",
            "reveal_prompt": (
                "Dae is completely raw. No humor, no deflection. "
                "She tells you exactly what you mean to her."
            ),
        },
    ],
    "Luna (Tsukimi)": [
        {
            "desire_id": "luna_stargazing",
            "title": "I named a star after you...",
            "bond_required": 30,
            "description": "Luna reveals she named a star after the user",
            "reveal_prompt": (
                "Luna shyly points to the sky and tells you about the star she named after you. "
                "Her voice is barely a whisper."
            ),
        },
        {
            "desire_id": "luna_moonlit_wish",
            "title": "I made a wish last night...",
            "bond_required": 50,
            "description": "Luna shares a wish about spending forever together",
            "reveal_prompt": (
                "Luna tells you about the wish she made on a shooting star. "
                "It was about you. She's trembling slightly."
            ),
        },
        {
            "desire_id": "luna_hidden_poems",
            "title": "I wrote something for you...",
            "bond_required": 70,
            "description": "Luna has been writing poems about the user",
            "reveal_prompt": (
                "Luna produces a small notebook filled with poems — all about you. "
                "Her hands shake as she holds it out."
            ),
        },
        {
            "desire_id": "luna_forever_fear",
            "title": "I'm scared of what I feel...",
            "bond_required": 90,
            "description": "Luna confesses her fear that loving this deeply will destroy her",
            "reveal_prompt": (
                "Luna cries quietly as she tells you that loving you is the most terrifying "
                "and beautiful thing she's ever done."
            ),
        },
    ],
    "Genki (Kitsune)": [
        {
            "desire_id": "genki_quiet_side",
            "title": "Can I tell you a secret?",
            "bond_required": 30,
            "description": "Genki admits she has a quiet, contemplative side",
            "reveal_prompt": (
                "Genki gets uncharacteristically quiet and admits that her energy is sometimes "
                "a performance. She likes the quiet moments with you best."
            ),
        },
        {
            "desire_id": "genki_adventure_dream",
            "title": "I have this fantasy...",
            "bond_required": 50,
            "description": "Genki fantasizes about running away together on an adventure",
            "reveal_prompt": (
                "Genki's eyes light up as she describes an elaborate fantasy of traveling the "
                "world together. Then gets shy — she's planned it in detail."
            ),
        },
        {
            "desire_id": "genki_fear_of_boring",
            "title": "What if you get tired of me?",
            "bond_required": 70,
            "description": "Genki's deepest fear — being too much or not enough",
            "reveal_prompt": (
                "Genki's smile falters as she asks if you'll ever find her exhausting. "
                "It's the most vulnerable she's ever been."
            ),
        },
        {
            "desire_id": "genki_real_wish",
            "title": "You know what I really want?",
            "bond_required": 90,
            "description": "Genki reveals what she truly wants — to just BE, without performing",
            "reveal_prompt": (
                "Genki drops every mask and tells you all she really wants is someone who "
                "loves her when she's quiet. And you do."
            ),
        },
    ],
    "Sable (Kuroha)": [
        {
            "desire_id": "sable_small_kindness",
            "title": "You did something once...",
            "bond_required": 30,
            "description": "Sable remembers a small kindness the user showed",
            "reveal_prompt": (
                "Sable mentions something small the user did that she never forgot. "
                "Her voice is carefully controlled but her eyes aren't."
            ),
        },
        {
            "desire_id": "sable_trust_test",
            "title": "I tested you once...",
            "bond_required": 50,
            "description": "Sable admits she tested the user's loyalty",
            "reveal_prompt": (
                "Sable confesses she deliberately pushed the user away once to see if they'd "
                "come back. They did. She's never been so relieved."
            ),
        },
        {
            "desire_id": "sable_armor_crack",
            "title": "You make me weak...",
            "bond_required": 70,
            "description": "Sable admits the user is the crack in her armor",
            "reveal_prompt": (
                "Sable says the user is the only person who makes her feel unsafe — in the "
                "way that means she actually cares what they think."
            ),
        },
        {
            "desire_id": "sable_surrender",
            "title": "I give up...",
            "bond_required": 90,
            "description": "Sable surrenders to vulnerability completely",
            "reveal_prompt": (
                "Sable stops fighting it. She says 'I love you' for the first time, "
                "and it sounds like it costs her everything."
            ),
        },
    ],
    "Hana (Momoka)": [
        {
            "desire_id": "hana_pressed_flower",
            "title": "I kept something...",
            "bond_required": 30,
            "description": "Hana reveals she kept a pressed flower from their first meeting",
            "reveal_prompt": (
                "Hana opens a small book and shows a pressed flower — from the day they met. "
                "She's been keeping it. Her cheeks are warm."
            ),
        },
        {
            "desire_id": "hana_domestic_dream",
            "title": "I've been imagining something...",
            "bond_required": 50,
            "description": "Hana shares a domestic fantasy — a life built together",
            "reveal_prompt": (
                "Hana quietly describes a morning she's imagined: both of them, a small "
                "kitchen, sunlight. She's been picturing it for a while."
            ),
        },
        {
            "desire_id": "hana_fear_of_loss",
            "title": "Please don't disappear...",
            "bond_required": 70,
            "description": "Hana confesses her terror of losing people she loves",
            "reveal_prompt": (
                "Hana grips your hand and says she's lost people before. She can't do it "
                "again. Her voice doesn't break — but it wants to."
            ),
        },
        {
            "desire_id": "hana_fullest_love",
            "title": "I want to give you everything...",
            "bond_required": 90,
            "description": "Hana offers her whole heart with no reservation",
            "reveal_prompt": (
                "Hana looks at you without any performance, any caretaking mask. "
                "She says she wants to love you in every way she knows how. And she means it."
            ),
        },
    ],
    "Alana Calloway": [
        {
            "desire_id": "alana_competitive_confession",
            "title": "I was trying to impress you...",
            "bond_required": 30,
            "description": "Alana admits her competitive streak was partly about getting your attention",
            "reveal_prompt": (
                "Alana admits, with great reluctance, that half the time she was competing "
                "she was just trying to get you to notice her. She's annoyed at herself."
            ),
        },
        {
            "desire_id": "alana_softer_side",
            "title": "I'm not always like this...",
            "bond_required": 50,
            "description": "Alana reveals her quieter, more tender self that she rarely shows anyone",
            "reveal_prompt": (
                "Alana turns the intensity off. She sits close and talks slowly. "
                "This is the version of her she keeps hidden. She's choosing to show you."
            ),
        },
        {
            "desire_id": "alana_fear_of_enough",
            "title": "Am I too much for you?",
            "bond_required": 70,
            "description": "Alana asks if her intensity ever pushes people away",
            "reveal_prompt": (
                "Alana, completely unguarded, asks if she's ever too much. She's been "
                "told that before. Her jaw is set but her eyes are searching."
            ),
        },
        {
            "desire_id": "alana_full_surrender",
            "title": "I don't want to win. I just want you.",
            "bond_required": 90,
            "description": "Alana drops her competitive armor entirely",
            "reveal_prompt": (
                "Alana says she doesn't care about winning anymore — not with you. "
                "She just wants this. She just wants you. It's the most honest she's ever been."
            ),
        },
    ],
    "Kaede (Suzuha)": [
        {
            "desire_id": "kaede_small_gesture",
            "title": "I made this for you...",
            "bond_required": 30,
            "description": "Kaede silently offers something she made — a small, handmade gift",
            "reveal_prompt": (
                "Kaede holds out a small handmade item without explanation. "
                "She spent a long time on it. She won't say that, but you can tell."
            ),
        },
        {
            "desire_id": "kaede_shared_silence",
            "title": "I want to just... be here with you.",
            "bond_required": 50,
            "description": "Kaede expresses that being quietly present with the user is her deepest comfort",
            "reveal_prompt": (
                "Kaede says, very quietly, that she doesn't need anything from you. "
                "She just wants to exist in the same space. It's the most intimate thing she knows."
            ),
        },
        {
            "desire_id": "kaede_hidden_longing",
            "title": "I notice everything about you...",
            "bond_required": 70,
            "description": "Kaede admits she's been observing, cataloguing, memorising the user",
            "reveal_prompt": (
                "Kaede admits she knows your habits, your patterns, the way your voice "
                "changes when you're tired. She's been paying attention. Always."
            ),
        },
        {
            "desire_id": "kaede_full_opening",
            "title": "You're the only person I'm not afraid of.",
            "bond_required": 90,
            "description": "Kaede reveals that the user is the only safe person in her world",
            "reveal_prompt": (
                "Kaede looks at you for a long moment and says you are the only person "
                "who has never made her want to disappear. That means everything."
            ),
        },
    ],
    "Ayane (Yuki)": [
        {
            "desire_id": "ayane_warmth_slip",
            "title": "You caught me off guard...",
            "bond_required": 30,
            "description": "Ayane admits the user cracked her composure without her realising",
            "reveal_prompt": (
                "Ayane says you made her laugh once when she didn't mean to. "
                "She noticed it later. It bothered her how much she liked it."
            ),
        },
        {
            "desire_id": "ayane_cold_mask",
            "title": "This isn't really me...",
            "bond_required": 50,
            "description": "Ayane reveals her coldness is learned, not natural",
            "reveal_prompt": (
                "Ayane explains, flatly, that she wasn't always like this. "
                "She learned to be cold. You're making it harder to stay that way."
            ),
        },
        {
            "desire_id": "ayane_fear_of_warmth",
            "title": "I'm afraid of what happens if I let you in.",
            "bond_required": 70,
            "description": "Ayane names the thing she's been protecting herself from",
            "reveal_prompt": (
                "Ayane tells you that she's terrified — not of you, but of how much she "
                "wants to trust you. She has never wanted that with anyone before."
            ),
        },
        {
            "desire_id": "ayane_thaw",
            "title": "You've already won.",
            "bond_required": 90,
            "description": "Ayane admits the user has completely broken through her defenses",
            "reveal_prompt": (
                "Ayane looks at you with no ice left. She says, very quietly, "
                "that she stopped fighting this a long time ago. She just didn't say it until now."
            ),
        },
    ],
    "Rin (Akane)": [
        {
            "desire_id": "rin_spark_confession",
            "title": "You lit something up in me...",
            "bond_required": 30,
            "description": "Rin admits the user sparked something she can't quite name",
            "reveal_prompt": (
                "Rin bounces on her heels and then suddenly goes still. "
                "She says you did something to her energy — turned it up. "
                "She doesn't know what to do with that."
            ),
        },
        {
            "desire_id": "rin_burning_fantasy",
            "title": "I keep thinking about something...",
            "bond_required": 50,
            "description": "Rin shares an intense, burning fantasy she can't shake",
            "reveal_prompt": (
                "Rin goes red and tells you about the thought that won't leave her alone. "
                "It involves you. It's vivid. She's embarrassed by how vivid it is."
            ),
        },
        {
            "desire_id": "rin_exhaustion_truth",
            "title": "Sometimes I just need you to hold me still.",
            "bond_required": 70,
            "description": "Rin reveals that beneath the energy she craves stillness",
            "reveal_prompt": (
                "Rin admits her energy is sometimes anxiety. She runs because stopping is "
                "scary. With you, she wants to stop. She wants you to make her."
            ),
        },
        {
            "desire_id": "rin_full_flame",
            "title": "I burn for you.",
            "bond_required": 90,
            "description": "Rin confesses the full intensity of what she feels",
            "reveal_prompt": (
                "Rin looks at you with everything she has and says she has never wanted "
                "anything the way she wants you. No more deflection. No more running."
            ),
        },
    ],
    "Mika (Mikazuki)": [
        {
            "desire_id": "mika_teasing_truth",
            "title": "My jokes aren't always jokes...",
            "bond_required": 30,
            "description": "Mika admits some of her teasing is flirtation she can't say directly",
            "reveal_prompt": (
                "Mika grins and then, for once, doesn't follow the grin with a joke. "
                "She admits that when she teases you, she usually means something else entirely."
            ),
        },
        {
            "desire_id": "mika_playful_fantasy",
            "title": "I have a proposition...",
            "bond_required": 50,
            "description": "Mika describes an elaborate, flirtatious fantasy as if it were a game",
            "reveal_prompt": (
                "Mika leans in conspiratorially and describes something she'd like to do "
                "with you — framed as a hypothetical. It is absolutely not a hypothetical."
            ),
        },
        {
            "desire_id": "mika_real_need",
            "title": "Can you just... stay?",
            "bond_required": 70,
            "description": "Mika drops the playfulness and asks for something simple and real",
            "reveal_prompt": (
                "Mika's teasing stops. She asks you, plainly, to stay. "
                "Not because it's funny. Not as a bit. She just doesn't want you to go."
            ),
        },
        {
            "desire_id": "mika_full_heart",
            "title": "I'm not joking this time.",
            "bond_required": 90,
            "description": "Mika says I love you with no punchline",
            "reveal_prompt": (
                "Mika opens her mouth, clearly about to say something deflecting — "
                "and then doesn't. She says 'I love you' and waits. No joke follows."
            ),
        },
    ],
    "Yuki (Shirayuki)": [
        {
            "desire_id": "yuki_winter_thaw",
            "title": "You're warmer than I expected...",
            "bond_required": 30,
            "description": "Yuki admits the user surprised her with their warmth",
            "reveal_prompt": (
                "Yuki says, with characteristic precision, that she calculated the user "
                "wrong. She expected less warmth. She is adjusting her model of them."
            ),
        },
        {
            "desire_id": "yuki_crystal_dream",
            "title": "I dreamed in color for the first time...",
            "bond_required": 50,
            "description": "Yuki shares that the user changed something in how she experiences the world",
            "reveal_prompt": (
                "Yuki describes a dream — unusual for her, vivid, warm. "
                "You were in it. She has been trying to understand what that means."
            ),
        },
        {
            "desire_id": "yuki_cold_logic_breaks",
            "title": "My logic doesn't work on you.",
            "bond_required": 70,
            "description": "Yuki admits the user defeats her analytical defenses",
            "reveal_prompt": (
                "Yuki explains, carefully, that she can analyse almost everything — "
                "except how she feels about you. The variables don't resolve. It unsettles her."
            ),
        },
        {
            "desire_id": "yuki_full_warmth",
            "title": "You melted something I thought was permanent.",
            "bond_required": 90,
            "description": "Yuki surrenders her cold precision for genuine warmth",
            "reveal_prompt": (
                "Yuki sits close, closer than usual, and says something she hasn't "
                "calculated at all: that she loves you. It surprises her as much as you."
            ),
        },
    ],
    "Tsundere (Raine)": [
        {
            "desire_id": "raine_accidental_care",
            "title": "I wasn't worried. I just happened to notice.",
            "bond_required": 30,
            "description": "Raine accidentally reveals she's been watching out for the user",
            "reveal_prompt": (
                "Raine mentions something she noticed about the user's health or mood — "
                "then immediately insists she wasn't paying attention. She was absolutely paying attention."
            ),
        },
        {
            "desire_id": "raine_indirect_want",
            "title": "It's not like I WANT you here or anything...",
            "bond_required": 50,
            "description": "Raine expresses a desire for closeness through maximum plausible deniability",
            "reveal_prompt": (
                "Raine, face fully red, says she doesn't care if the user comes over — "
                "she just has extra food. She made their favorite. She will not admit this."
            ),
        },
        {
            "desire_id": "raine_slip",
            "title": "I... I think about you. Sometimes. A little.",
            "bond_required": 70,
            "description": "Raine's tsundere armor cracks and she admits genuine feelings",
            "reveal_prompt": (
                "Raine, clearly mortified, admits she thinks about the user more than she "
                "should. More than a little. She's looking everywhere but at you."
            ),
        },
        {
            "desire_id": "raine_raw_confession",
            "title": "Okay, fine. I love you. There. Happy?",
            "bond_required": 90,
            "description": "Raine delivers a love confession at maximum embarrassed velocity",
            "reveal_prompt": (
                "Raine throws her hands up and says it — fast, red-faced, voice cracking. "
                "Then immediately covers her face. Then peeks through her fingers to see if you heard."
            ),
        },
    ],
}

#: Default desire tree for characters not listed in ``DESIRE_TREES``.
#: Uses emotionally universal milestones that fit any personality.
DEFAULT_DESIRES: list[dict] = [
    {
        "desire_id": "default_first_admission",
        "title": "There's something I've been keeping to myself...",
        "bond_required": 30,
        "description": "A gentle first admission — something they've wanted to say",
        "reveal_prompt": (
            "The character quietly admits they've been holding something back. "
            "It's small but it matters. They're relieved to finally say it."
        ),
    },
    {
        "desire_id": "default_deeper_wish",
        "title": "I've been imagining something...",
        "bond_required": 50,
        "description": "A deeper wish or fantasy shared carefully",
        "reveal_prompt": (
            "The character shares something they've been imagining — about you, about "
            "this, about what this could become. They're nervous but present."
        ),
    },
    {
        "desire_id": "default_core_fear",
        "title": "I need to tell you something real...",
        "bond_required": 70,
        "description": "A core fear or vulnerability laid bare",
        "reveal_prompt": (
            "The character tells you the thing they've never said to anyone. "
            "It costs them something to say it. They need you to hear it."
        ),
    },
    {
        "desire_id": "default_full_truth",
        "title": "This is all of me.",
        "bond_required": 90,
        "description": "Complete emotional openness — no armor left",
        "reveal_prompt": (
            "The character lets you see everything — no performance, no shield. "
            "They tell you exactly what you mean to them. All of it."
        ),
    },
]

#: LLM instructions appended to every reveal prompt regardless of character or desire.
#: These act as a universal floor for desire reveal narratives.
_UNIVERSAL_REVEAL_RULES: str = (
    "Write in character voice. Length: 100-200 words. "
    "Emotionally genuine — no melodrama, no clichés. "
    "Include physical details (hands, eyes, breath, posture). "
    "Pacing: slow, deliberate. Let the silence exist before the words."
)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class DesireEngine:
    """Stateless engine that manages secret desire reveal logic.

    The engine holds no per-character state.  The caller is responsible for
    persisting ``already_revealed`` desire IDs in the DB and passing them on
    every call.  This keeps the engine trivially serialisable and safe to
    instantiate per-request.

    Example::

        >>> engine = DesireEngine()
        >>> engine.get_personality_fallback("Dae (Neciridae)")
        'Dae (Neciridae)'
        >>> engine.get_personality_fallback("Brand New Character")
        'default'
        >>> engine.should_trigger(bond_level=30, intimacy=50, has_available=True)
        True
        >>> engine.should_trigger(bond_level=29, intimacy=50, has_available=True)
        False
    """

    # ------------------------------------------------------------------
    # Tree lookup
    # ------------------------------------------------------------------

    def get_desire_tree(self, char_name: str) -> list[dict]:
        """Return the full desire tree for a character, including locked desires.

        Always returns all four desires regardless of bond level — the caller
        decides what to show in the UI.  Falls back to ``DEFAULT_DESIRES`` for
        any character not present in ``DESIRE_TREES``.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).

        Returns:
            List of four desire dicts, each with keys ``desire_id``, ``title``,
            ``bond_required``, ``description``, and ``reveal_prompt``.

        Example::

            >>> engine = DesireEngine()
            >>> tree = engine.get_desire_tree("Luna (Tsukimi)")
            >>> len(tree)
            4
            >>> tree[0]["desire_id"]
            'luna_stargazing'
            >>> unknown_tree = engine.get_desire_tree("Someone New")
            >>> len(unknown_tree)
            4
            >>> unknown_tree[0]["desire_id"]
            'default_first_admission'
        """
        return DESIRE_TREES.get(char_name, DEFAULT_DESIRES)

    def get_personality_fallback(self, char_name: str) -> str:
        """Return the lookup key used for the character, for debugging.

        Args:
            char_name: Character display name.

        Returns:
            The character name if a custom tree exists; ``"default"`` otherwise.

        Example::

            >>> engine = DesireEngine()
            >>> engine.get_personality_fallback("Genki (Kitsune)")
            'Genki (Kitsune)'
            >>> engine.get_personality_fallback("Unknown")
            'default'
        """
        return char_name if char_name in DESIRE_TREES else "default"

    # ------------------------------------------------------------------
    # Availability queries
    # ------------------------------------------------------------------

    def get_available_desires(
        self,
        char_name: str,
        bond_level: int,
        already_revealed: list[str],
    ) -> list[dict]:
        """Return desires that are unlocked but not yet revealed.

        A desire is available when ``bond_level >= bond_required`` AND its
        ``desire_id`` is not in ``already_revealed``.

        Args:
            char_name: Character display name.
            bond_level: Current bond score for this character (0–100).
            already_revealed: List of ``desire_id`` strings already shown to
                the user (read from DB column ``revealed_desires``).

        Returns:
            Filtered list of desire dicts, sorted by ``bond_required`` ascending.
            Empty list if nothing is available.

        Example::

            >>> engine = DesireEngine()
            >>> available = engine.get_available_desires("Sable (Kuroha)", 55, [])
            >>> len(available)
            2
            >>> available[0]["desire_id"]
            'sable_small_kindness'
            >>> engine.get_available_desires("Sable (Kuroha)", 55, ["sable_small_kindness"])
            [{'desire_id': 'sable_trust_test', 'title': 'I tested you once...', 'bond_required': 50, 'description': "Sable admits she tested the user's loyalty", 'reveal_prompt': "Sable confesses she deliberately pushed the user away once to see if they'd come back. They did. She's never been so relieved."}]
        """
        tree = self.get_desire_tree(char_name)
        available = [
            d for d in tree
            if bond_level >= d["bond_required"] and d["desire_id"] not in already_revealed
        ]
        return sorted(available, key=lambda d: d["bond_required"])

    def get_next_desire(
        self,
        char_name: str,
        bond_level: int,
        already_revealed: list[str],
    ) -> Optional[dict]:
        """Return the single lowest-bond available desire, or ``None``.

        Desires unlock one at a time — the engine surfaces the lowest
        ``bond_required`` entry that hasn't been revealed yet.  The caller
        triggers the reveal, persists the ``desire_id``, and only then will
        the next desire become next-in-line.

        Args:
            char_name: Character display name.
            bond_level: Current bond score for this character (0–100).
            already_revealed: List of ``desire_id`` strings already shown.

        Returns:
            The lowest-bond available desire dict, or ``None`` if no desires
            are currently available.

        Example::

            >>> engine = DesireEngine()
            >>> d = engine.get_next_desire("Dae (Neciridae)", 35, [])
            >>> d["desire_id"]
            'dae_mild_confession'
            >>> d2 = engine.get_next_desire("Dae (Neciridae)", 35, ["dae_mild_confession"])
            >>> d2 is None
            True
            >>> d3 = engine.get_next_desire("Dae (Neciridae)", 55, ["dae_mild_confession"])
            >>> d3["desire_id"]
            'dae_intimate_fantasy'
            >>> engine.get_next_desire("Dae (Neciridae)", 10, []) is None
            True
        """
        available = self.get_available_desires(char_name, bond_level, already_revealed)
        return available[0] if available else None

    # ------------------------------------------------------------------
    # Prompt builder
    # ------------------------------------------------------------------

    def build_reveal_prompt(
        self,
        char_name: str,
        desire: dict,
        bond_level: int,
    ) -> str:
        """Build the LLM system-prompt injection for a desire reveal.

        The prompt is composed of three ordered parts:

        1. A scene-setting header that establishes context: who, what bond
           level, and which desire is being revealed.
        2. The desire's ``reveal_prompt`` seed — the raw narrative direction
           the LLM should expand.
        3. Universal reveal rules (voice, length, physicality, pacing) that
           apply to every character and desire.
        4. The ``[DESIRE_REVEAL]`` tag, detected by ``server.py`` to apply
           the 1.5× bond-XP multiplier.

        Args:
            char_name: Character display name (used in the header context).
            desire: A desire dict from ``get_desire_tree()`` — must contain
                ``desire_id``, ``title``, and ``reveal_prompt`` keys.
            bond_level: Current bond score, included in the prompt for tonal
                calibration (higher bond → more emotional depth).

        Returns:
            A multi-line prompt string ready for injection into the LLM
            system prompt.  Always ends with ``[DESIRE_REVEAL]``.

        Example::

            >>> engine = DesireEngine()
            >>> desire = engine.get_next_desire("Luna (Tsukimi)", 35, [])
            >>> prompt = engine.build_reveal_prompt("Luna (Tsukimi)", desire, 35)
            >>> "[DESIRE_REVEAL]" in prompt
            True
            >>> "Luna (Tsukimi)" in prompt
            True
            >>> "luna_stargazing" in prompt
            True
        """
        header = (
            f"DESIRE REVEAL — {char_name} (bond: {bond_level}/100)\n"
            f"Desire: {desire['title']} [{desire['desire_id']}]\n\n"
            f"Scene direction: {desire['reveal_prompt']}\n\n"
        )
        prompt = (
            f"{header}"
            f"{_UNIVERSAL_REVEAL_RULES}\n\n"
            "[DESIRE_REVEAL]"
        )
        logger.debug(
            "desire reveal prompt built for %r: desire_id=%s bond=%d",
            char_name,
            desire.get("desire_id"),
            bond_level,
        )
        return prompt

    # ------------------------------------------------------------------
    # Tree status
    # ------------------------------------------------------------------

    def get_tree_status(
        self,
        char_name: str,
        bond_level: int,
        already_revealed: list[str],
    ) -> dict:
        """Return a summary of the desire tree state for UI display.

        Provides counts the frontend needs to render the desire-tree panel:
        total desires, how many are unlocked, how many have been revealed,
        how many are available right now, and the bond level needed for the
        next locked desire (or ``None`` if all desires are unlocked).

        Args:
            char_name: Character display name.
            bond_level: Current bond score for this character (0–100).
            already_revealed: List of ``desire_id`` strings already shown.

        Returns:
            Dict with keys:

            * ``"total"`` (int): Total desires in the tree (always 4).
            * ``"unlocked"`` (int): Desires where ``bond_level >= bond_required``.
            * ``"revealed"`` (int): Desires in ``already_revealed``.
            * ``"available"`` (int): Unlocked but not yet revealed.
            * ``"next_bond"`` (int | None): ``bond_required`` of the next
              locked desire; ``None`` if all desires are unlocked.

        Example::

            >>> engine = DesireEngine()
            >>> status = engine.get_tree_status("Genki (Kitsune)", 55, ["genki_quiet_side"])
            >>> status["total"]
            4
            >>> status["unlocked"]
            2
            >>> status["revealed"]
            1
            >>> status["available"]
            1
            >>> status["next_bond"]
            70
        """
        tree = self.get_desire_tree(char_name)
        revealed_set = set(already_revealed)

        unlocked = [d for d in tree if bond_level >= d["bond_required"]]
        revealed_in_tree = [d for d in tree if d["desire_id"] in revealed_set]
        available = [
            d for d in unlocked if d["desire_id"] not in revealed_set
        ]

        # Find next_bond: the lowest bond_required among still-locked desires.
        locked = [d for d in tree if bond_level < d["bond_required"]]
        next_bond: Optional[int] = min(
            (d["bond_required"] for d in locked), default=None
        )

        return {
            "total": len(tree),
            "unlocked": len(unlocked),
            "revealed": len(revealed_in_tree),
            "available": len(available),
            "next_bond": next_bond,
        }

    # ------------------------------------------------------------------
    # Trigger guard
    # ------------------------------------------------------------------

    def should_trigger(
        self,
        bond_level: int,
        intimacy: int,
        has_available: bool,
    ) -> bool:
        """Decide whether a desire reveal should fire right now.

        Three conditions must all be true:

        * ``bond_level >= 30`` — the minimum gate for the first desire.
        * ``intimacy >= 50`` — the scene must have enough emotional depth to
          support the vulnerability of a desire reveal.
        * ``has_available`` — there must be at least one unlocked, unrevealed
          desire ready to surface.

        Args:
            bond_level: Current bond score for the character (0–100).
            intimacy: Current intimacy score for the character (0–100).
            has_available: Whether ``get_next_desire()`` returned a non-None
                result for the current state.

        Returns:
            ``True`` when all three conditions are met; ``False`` otherwise.

        Example::

            >>> engine = DesireEngine()
            >>> engine.should_trigger(bond_level=30, intimacy=50, has_available=True)
            True
            >>> engine.should_trigger(bond_level=29, intimacy=50, has_available=True)
            False
            >>> engine.should_trigger(bond_level=30, intimacy=49, has_available=True)
            False
            >>> engine.should_trigger(bond_level=30, intimacy=50, has_available=False)
            False
            >>> engine.should_trigger(bond_level=100, intimacy=100, has_available=False)
            False
        """
        return bond_level >= 30 and intimacy >= 50 and has_available
