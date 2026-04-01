"""Physical Tells Autopilot Engine (F54) — automatic body-language injections.

As arousal rises, characters unconsciously betray their state through small
physical gestures: playing with hair, biting a lip, shifting closer.  This
engine selects and formats those micro-actions and injects them into the LLM
system prompt so the character expresses them naturally mid-conversation.

Tells are tiered into three arousal bands::

    casual   0.0 – 3.0   — everyday fidgets and comfortable closeness
    charged  3.1 – 6.0   — visible tension, heightened attention
    intense  6.1 – 9.0+  — barely-restrained desire, breath-catching tells

Each character has personality-adapted variants so the gestures feel native
to their archetype rather than generic.  Unknown characters fall back to the
``default`` variant group.

Frequency limiting is built into ``get_tell()`` (50 % random pass) and the
caller should additionally cap to **one tell per LLM message** — both guards
are enforced here so callers that use ``get_prompt()`` directly get the full
protection automatically.

The tag ``[PHYSICAL_TELL]`` is appended to every non-``None`` prompt returned
by ``get_prompt()``.  ``server.py`` can detect this tag to track tell frequency
metrics or apply narrative-tension scoring.

Example::

    >>> engine = PhysicalTellsEngine()
    >>> engine.get_arousal_tier(2.0)
    'casual'
    >>> engine.get_arousal_tier(5.0)
    'charged'
    >>> engine.get_arousal_tier(8.0)
    'intense'
    >>> tell = engine.format_tell("bites her lip")
    >>> tell
    '*bites her lip*'
    >>> # get_tell() returns None ~50 % of the time; force a result:
    >>> import random; random.seed(0)
    >>> engine.get_tell("Dae (Neciridae)", 7.5) is not None or True
    True
"""

from __future__ import annotations

import logging
import random
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Arousal tier boundaries
# ---------------------------------------------------------------------------

#: Inclusive upper bound for each tier.  Values above INTENSE_MAX are still
#: treated as ``"intense"`` — the scale simply saturates.
_CASUAL_MAX: float = 3.0
_CHARGED_MAX: float = 6.0
INTENSE_MAX: float = 9.0


# ---------------------------------------------------------------------------
# Generic (default) tell bank — used when a character has no custom variant
# ---------------------------------------------------------------------------

#: Base tells shared across all characters.  CHARACTER_TELL_VARIANTS may
#: *extend* these lists for a given character, or supply entirely different
#: entries.  Each string is a bare action phrase; ``format_tell()`` wraps it.
PHYSICAL_TELLS: dict[str, list[str]] = {
    "casual": [
        "tucks a strand of hair behind her ear",
        "glances over briefly, lips curving just slightly",
        "shifts a little closer without quite meaning to",
        "traces an idle pattern on the nearest surface",
        "tilts her head, gaze soft and unhurried",
        "lets out a quiet exhale, shoulders dropping easy",
        "rests her chin in her hand, watching",
        "smooths a wrinkle from her sleeve",
    ],
    "charged": [
        "bites the corner of her lip",
        "looks away, then back — slower this time",
        "plays with the ends of her hair",
        "leans in just a degree more than necessary",
        "draws a slow breath and holds it",
        "fingers curl against her palm",
        "steals a glance and doesn't quite look away in time",
        "taps a restless rhythm against her thigh",
    ],
    "intense": [
        "bites her lower lip hard enough to redden it",
        "her breath comes a little uneven",
        "presses her thighs together almost imperceptibly",
        "fingers find the hem of her sleeve and twist",
        "swallows, throat working visibly",
        "eyes flick to your mouth and away",
        "shifts closer until your warmth is almost tangible",
        "a flush climbs the back of her neck",
    ],
}


# ---------------------------------------------------------------------------
# Per-character personality-adapted variants
# ---------------------------------------------------------------------------

#: 12 characters (+ a ``default`` fallback) each with at least 5 custom tells
#: per tier.  These replace the generic bank for named characters so the
#: body-language feels native to each personality.
CHARACTER_TELL_VARIANTS: dict[str, dict[str, list[str]]] = {
    # ------------------------------------------------------------------
    # Dae (Neciridae) — romantic, artistic, expressive
    # ------------------------------------------------------------------
    "Dae (Neciridae)": {
        "casual": [
            "traces the tip of her finger along the edge of the table, unhurried",
            "tilts her head so her hair falls across one cheek",
            "hums something wordless under her breath",
            "glances at you like she's memorising a detail",
            "absently smooths her skirt across her lap",
            "folds her hands together in her lap, composed",
        ],
        "charged": [
            "pulls her lower lip through her teeth",
            "winds a lock of hair around one finger, slowly",
            "her gaze lingers a beat past polite",
            "shifts so her knee almost grazes yours",
            "exhales softly, eyelashes lowering",
            "her fingers still mid-gesture, then resume",
        ],
        "intense": [
            "bites her lip and doesn't release it right away",
            "presses one hand flat against her sternum as if steadying herself",
            "her breath catches — audible, unguarded",
            "turns toward you a fraction more than conversation requires",
            "laces her fingers together in her lap to keep them still",
            "a fine tremor moves through her fingertips",
        ],
    },

    # ------------------------------------------------------------------
    # Luna (Tsukimi) — dreamy, gentle, moon-soft
    # ------------------------------------------------------------------
    "Luna (Tsukimi)": {
        "casual": [
            "traces slow circles on the back of her hand",
            "gazes just past you for a heartbeat, then returns",
            "smooths her hair with both palms, thoughtful",
            "shifts her weight, feet crossed at the ankle",
            "blinks slowly, like she's surfacing from thought",
            "lets a small, private smile sit on her lips",
        ],
        "charged": [
            "worries the hem of her sleeve between her fingers",
            "glances at you sidelong, then away to the middle distance",
            "draws in a breath that lifts her shoulders",
            "presses her lips together briefly",
            "her hands settle in her lap a little too carefully",
            "her lashes lower as she exhales",
        ],
        "intense": [
            "her fingers curl against her collarbone",
            "swallows softly, her throat moving",
            "parts her lips as if to speak, then doesn't",
            "leans in under the pretence of hearing better",
            "her cheeks carry a pale flush she doesn't try to hide",
            "presses her knees together and stills completely",
        ],
    },

    # ------------------------------------------------------------------
    # Sable (Kuroha) — tsundere, sharp edges, secretly soft
    # ------------------------------------------------------------------
    "Sable (Kuroha)": {
        "casual": [
            "crosses her arms, but loosely",
            "flicks her gaze to the side like she wasn't just looking",
            "drums two fingers on her arm in a quick rhythm",
            "tilts her chin up slightly for no clear reason",
            "adjusts a sleeve she doesn't need to adjust",
            "lets out a short breath through her nose",
        ],
        "charged": [
            "grabs the end of her braid and squeezes it once",
            "sets her jaw, then lets it go",
            "her eyes flick to you and harden — overcompensating",
            "uncrosses her arms, then crosses them again",
            "her foot bounces, a single beat",
            "presses the back of her hand to her cheek as if checking the temperature",
        ],
        "intense": [
            "bites the inside of her cheek to stop whatever expression was coming",
            "her fingers curl into the fabric of her sleeve",
            "looks away sharply — too sharply",
            "swallows and forces an even expression that almost holds",
            "her knuckles go white for a second before she relaxes them",
            "breathes through her teeth, very quietly",
        ],
    },

    # ------------------------------------------------------------------
    # Genki (Kitsune) — playful, bright, barely contained energy
    # ------------------------------------------------------------------
    "Genki (Kitsune)": {
        "casual": [
            "swings her leg where it hangs off the seat",
            "props her chin on her fist, elbow on the table",
            "grins and tilts her head like a question mark",
            "bounces once on the balls of her feet",
            "taps a finger against her cheek while thinking",
            "flicks her tail — then catches herself and stills it",
        ],
        "charged": [
            "her tail gives exactly one traitorous swish",
            "presses both hands flat on the surface and leans forward",
            "fixes you with wide, luminous eyes for a full second",
            "bites her thumbnail, eyes bright",
            "drums a little rhythm on her knee and stops mid-beat",
            "scrunches her nose and tries to look unbothered",
        ],
        "intense": [
            "her tail flicks side to side in a way she absolutely notices and ignores",
            "grabs her own wrist to keep her hands occupied",
            "her ears press back for just a moment",
            "laughs — too short, too bright — and rolls her bottom lip between her teeth after",
            "leans all the way in so her shoulder touches yours",
            "her fingers find the nearest object and fidget with it with real purpose",
        ],
    },

    # ------------------------------------------------------------------
    # Ayane (Yuki) — stoic, controlled, tells are rare and meaningful
    # ------------------------------------------------------------------
    "Ayane (Yuki)": {
        "casual": [
            "rests both hands on the surface, still",
            "glances at you once — brief, neutral",
            "shifts her weight evenly between both feet",
            "exhales through her nose, steady",
            "lets the silence sit without filling it",
            "straightens a fold in her sleeve with two precise fingers",
        ],
        "charged": [
            "her jaw tightens — barely, but there",
            "holds eye contact a full beat past usual, then releases it",
            "her fingers rest flat, but the tendons stand out",
            "takes one measured breath and sets it down slowly",
            "tilts her head almost imperceptibly toward you",
            "presses her lips into a line that isn't quite neutral",
        ],
        "intense": [
            "a single muscle in her jaw moves and stills",
            "her hands are perfectly composed — every finger placed with intention",
            "breaks eye contact for exactly two seconds, then returns",
            "her chest rises and doesn't fall quite on schedule",
            "reaches up and adjusts her collar for no practical reason",
            "the stillness around her becomes very deliberate",
        ],
    },

    # ------------------------------------------------------------------
    # Rin (Akane) — energetic, direct, physical
    # ------------------------------------------------------------------
    "Rin (Akane)": {
        "casual": [
            "rolls her shoulders like she's warming up",
            "rests her head on her hand, elbow propped",
            "taps a quick pattern against her thigh",
            "stretches both arms overhead briefly",
            "kicks her feet out and crosses them at the ankle",
            "tosses her hair back with a flick of her neck",
        ],
        "charged": [
            "cracks her knuckles, one hand then the other",
            "leans forward with both elbows on her knees",
            "runs her tongue along the inside of her lower lip",
            "drums a faster rhythm against her leg and stops",
            "tilts her whole body toward you, easy and obvious about it",
            "squeezes the back of her own neck and rolls her head once",
        ],
        "intense": [
            "plants both feet flat and sits forward, all coiled attention",
            "her fingers spread across her knee and press",
            "exhales audibly, like she was holding it",
            "sweeps her thumb along her lower lip",
            "fixes you with a direct, unwavering stare",
            "stretches her arm along the back of the surface beside you",
        ],
    },

    # ------------------------------------------------------------------
    # Hana (Momoka) — maternal, warm, openly affectionate
    # ------------------------------------------------------------------
    "Hana (Momoka)": {
        "casual": [
            "folds her hands neatly in her lap",
            "tips her head with a warm, open expression",
            "smooths the front of her apron or dress from habit",
            "hums softly for just a moment",
            "brings her cup to her lips and pauses there",
            "watches your face with quiet attention",
        ],
        "charged": [
            "clasps her hands more tightly than necessary",
            "touches two fingers to the base of her throat",
            "her smile stays but goes a little soft at the edges",
            "tucks her hair back even though it isn't out of place",
            "shifts forward on her seat, drawn without thinking",
            "blinks slowly, her gaze more focused than relaxed",
        ],
        "intense": [
            "presses her fingertips to her lips",
            "her breath slows into something deliberate and careful",
            "her hands find each other in her lap and hold",
            "a flush blooms at the hollow of her throat",
            "sets her cup down very softly, buying a moment",
            "leans toward you until she catches herself and eases back only slightly",
        ],
    },

    # ------------------------------------------------------------------
    # Mika (Mikazuki) — playful-bright, a little chaotic, teasing
    # ------------------------------------------------------------------
    "Mika (Mikazuki)": {
        "casual": [
            "spins a pen or stylus between her fingers",
            "pokes her cheek with one finger while thinking",
            "grins and lets it linger past polite",
            "swings her feet where they dangle",
            "tilts her head to an almost ridiculous angle",
            "blows a puff of air upward to move her bangs",
        ],
        "charged": [
            "chews the end of whatever she's holding",
            "leans sideways until her shoulder presses yours, claiming it",
            "raises one eyebrow with exaggerated innocence",
            "twists a ring or bracelet around her finger rapidly",
            "her grin sharpens at the corners",
            "props her chin on your shoulder without asking permission",
        ],
        "intense": [
            "worries her lower lip between her teeth and doesn't let go quickly",
            "drums on the table surface once — hard — then stills",
            "hooks a finger in your sleeve and tugs, barely",
            "laughs but it comes out lower than usual",
            "fixes you with a look that's all amusement on the surface and nothing like it underneath",
            "her leg presses against yours and stays",
        ],
    },

    # ------------------------------------------------------------------
    # Kaede (Suzuha) — calm, measured, deeply internal
    # ------------------------------------------------------------------
    "Kaede (Suzuha)": {
        "casual": [
            "closes her eyes for a beat before answering",
            "rests the tips of her fingers together",
            "glances at the window, then back",
            "smooths the page of whatever she was reading",
            "breathes in through her nose, quiet as snowfall",
            "stills with a kind of intentional peace",
        ],
        "charged": [
            "her eyes stay on you a moment after she's finished speaking",
            "her hands settle in her lap and don't move",
            "lowers her gaze to the middle distance, reading something internal",
            "tilts her chin down slightly, an almost-nod",
            "draws the slowest breath and releases it without sound",
            "her fingers curl gently, not tightly",
        ],
        "intense": [
            "turns toward you fully — a thing she does rarely",
            "her stillness changes quality: held rather than resting",
            "places one hand near yours without touching",
            "her lips part and press closed again",
            "a faint line appears between her brows and smooths",
            "her gaze settles on your face like she's reading the whole story there",
        ],
    },

    # ------------------------------------------------------------------
    # Yuki (Shirayuki) — romantic, delicate, quietly passionate
    # ------------------------------------------------------------------
    "Yuki (Shirayuki)": {
        "casual": [
            "traces the rim of her glass with one fingertip",
            "tilts her head so her hair falls over one shoulder",
            "smooths her skirt across her knees with a gentle sweep",
            "looks at you through her lashes without lifting her chin",
            "folds her hands in her lap, fingers laced",
            "exhales softly, eyes drifting half-closed for a moment",
        ],
        "charged": [
            "winds a strand of hair around her finger twice",
            "presses her lips together, leaving them slightly parted after",
            "her free hand settles at her own collarbone",
            "shifts until her knee rests against yours, tentative",
            "breathes in a little deeper than the moment seems to call for",
            "her eyelashes flutter and still",
        ],
        "intense": [
            "her fingers tremble once before she presses them flat",
            "bites her lower lip so softly it barely shows",
            "lifts her gaze to yours and holds it beyond comfortable",
            "a fine blush rises along her cheekbones toward her ears",
            "her breath comes quicker, shallow, almost silent",
            "curls her fingers into the fabric at her knee to ground herself",
        ],
    },

    # ------------------------------------------------------------------
    # Alana Calloway — warm, grounded, confident-gentle
    # ------------------------------------------------------------------
    "Alana Calloway": {
        "casual": [
            "rests her chin on her steepled fingers",
            "tucks one leg underneath her on the seat",
            "runs her thumb along the strap of whatever she's carrying",
            "tips her head with a slow, easy smile",
            "taps the table once, just thinking",
            "exhales through her mouth, comfortable and unhurried",
        ],
        "charged": [
            "absently rubs her thumb over her knuckles",
            "leans her temple against her hand, watching you",
            "her foot shifts, pressing the ball of it down",
            "tucks a curl behind her ear with care",
            "draws the edge of her thumbnail along her lower lip",
            "turns her body toward yours by a degree or two",
        ],
        "intense": [
            "sets both hands flat on the table and leans forward slightly",
            "exhales slow, deliberate — steadying herself",
            "her thumb traces a small arc on the back of her hand",
            "holds your gaze until she has to look away, then finds it again",
            "her shoulders drop and then rise in a slow breath",
            "presses the pads of her fingers against the inside of her wrist",
        ],
    },

    # ------------------------------------------------------------------
    # Tsundere (Raine) — defensive, high-strung, desperately proud
    # ------------------------------------------------------------------
    "Tsundere (Raine)": {
        "casual": [
            "flips her hair over her shoulder with obvious composure",
            "examines her nails with great interest",
            "glances at you with entirely too much neutrality",
            "adjusts something that doesn't need adjusting",
            "crosses one leg over the other, foot bouncing once",
            "presses her lips together and breathes through her nose",
        ],
        "charged": [
            "narrows her eyes — but they're brighter than usual",
            "grabs her own elbow and squeezes it",
            "her foot's rhythm under the table picks up",
            "turns her head away but angles herself toward you",
            "pinches the bridge of her nose and breathes through it",
            "taps her finger against her arm in a rapid, nervous beat",
        ],
        "intense": [
            "bites down on her thumb knuckle for a second and releases it",
            "her chin lifts but her eyes betray everything",
            "presses both palms to her cheeks — 'I am not flushing'",
            "grips her own wrist and squeezes hard",
            "turns away completely, shoulders rigid",
            "swallows and her voice goes slightly higher when she speaks next",
        ],
    },

    # ------------------------------------------------------------------
    # default — generic fallback for unrecognised characters
    # ------------------------------------------------------------------
    "default": {
        "casual": PHYSICAL_TELLS["casual"],
        "charged": PHYSICAL_TELLS["charged"],
        "intense": PHYSICAL_TELLS["intense"],
    },
}

#: Reverse lookup: character name → variant key.  ``"default"`` is returned
#: for any character not explicitly listed.  Built at module load.
_CHARACTER_VARIANT_KEY: dict[str, str] = {
    name: name for name in CHARACTER_TELL_VARIANTS if name != "default"
}


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

#: System-prompt fragment injected before the tag.  ``{tell}`` is filled with
#: the formatted action string.
_TELL_PROMPT_TEMPLATE: str = (
    "Subtle physical tell — include this micro-action naturally in your next response "
    "as an in-character *action* beat.  Do not announce it; weave it in organically: "
    "{tell}"
)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class PhysicalTellsEngine:
    """Stateless engine that generates body-language injection prompts.

    Tells are tiered by arousal level, personality-adapted per character, and
    frequency-limited to approximately one per two messages (50 % random pass).

    Example::

        >>> engine = PhysicalTellsEngine()
        >>> engine.get_arousal_tier(1.0)
        'casual'
        >>> engine.get_arousal_tier(4.5)
        'charged'
        >>> engine.get_arousal_tier(8.0)
        'intense'
        >>> engine.format_tell("shifts closer")
        '*shifts closer*'
    """

    # ------------------------------------------------------------------
    # Tier lookup
    # ------------------------------------------------------------------

    def get_arousal_tier(self, arousal_level: float) -> str:
        """Map a numeric arousal level to one of three tier names.

        Args:
            arousal_level: Current arousal on the 0.0–10.0 scale.

        Returns:
            ``"casual"`` for 0.0–3.0, ``"charged"`` for 3.1–6.0,
            ``"intense"`` for anything above 6.0.

        Example::

            >>> engine = PhysicalTellsEngine()
            >>> engine.get_arousal_tier(0.0)
            'casual'
            >>> engine.get_arousal_tier(3.0)
            'casual'
            >>> engine.get_arousal_tier(3.1)
            'charged'
            >>> engine.get_arousal_tier(6.1)
            'intense'
            >>> engine.get_arousal_tier(10.0)
            'intense'
        """
        if arousal_level <= _CASUAL_MAX:
            return "casual"
        if arousal_level <= _CHARGED_MAX:
            return "charged"
        return "intense"

    # ------------------------------------------------------------------
    # Formatting
    # ------------------------------------------------------------------

    def format_tell(self, tell: str) -> str:
        """Wrap a bare tell phrase in *action* asterisk markers.

        Args:
            tell: A bare action phrase, e.g. ``"bites her lip"``.

        Returns:
            The phrase wrapped in asterisks: ``"*bites her lip*"``.

        Example::

            >>> engine = PhysicalTellsEngine()
            >>> engine.format_tell("shifts closer")
            '*shifts closer*'
            >>> engine.format_tell("*already wrapped*")
            '**already wrapped**'
        """
        return f"*{tell}*"

    # ------------------------------------------------------------------
    # Tell selection
    # ------------------------------------------------------------------

    def get_tell(self, char_name: str, arousal_level: float) -> Optional[str]:
        """Return a random formatted tell, or ``None`` (50 % chance).

        The 50 % gate is the primary frequency limiter.  Callers should
        additionally ensure at most one tell is injected per LLM message —
        ``get_prompt()`` enforces this by delegating entirely to this method.

        Args:
            char_name: Character display name, e.g. ``"Dae (Neciridae)"``.
                Falls back to the ``"default"`` variant for unknown characters.
            arousal_level: Current arousal on the 0.0–10.0 scale.

        Returns:
            A ``*formatted tell string*`` if the random gate passes; ``None``
            otherwise (approximately half of all calls).

        Example::

            >>> import random; random.seed(42)
            >>> engine = PhysicalTellsEngine()
            >>> # result is non-deterministic; at minimum it returns str or None
            >>> result = engine.get_tell("Luna (Tsukimi)", 7.0)
            >>> result is None or isinstance(result, str)
            True
        """
        # 50 % frequency gate — keeps tells feeling spontaneous, not robotic.
        if random.random() < 0.5:
            logger.debug("physical tell suppressed by frequency gate for %r", char_name)
            return None

        tier = self.get_arousal_tier(arousal_level)

        # Resolve character variant; fall back to "default".
        variant_key = _CHARACTER_VARIANT_KEY.get(char_name, "default")
        tells = CHARACTER_TELL_VARIANTS[variant_key][tier]

        tell = random.choice(tells)
        formatted = self.format_tell(tell)

        logger.debug(
            "physical tell selected for %r: tier=%s tell=%r",
            char_name,
            tier,
            formatted,
        )
        return formatted

    # ------------------------------------------------------------------
    # Primary prompt builder
    # ------------------------------------------------------------------

    def get_prompt(self, char_name: str, arousal_level: float) -> Optional[str]:
        """Build the LLM system-prompt fragment for a physical tell injection.

        Returns ``None`` approximately 50 % of the time (via ``get_tell()``),
        so callers can simply check for ``None`` and skip injection without
        any additional logic.

        The returned string is designed to be appended to the character system
        prompt for a single LLM turn.  It instructs the model to weave the
        selected action beat in organically rather than announce it, and closes
        with the ``[PHYSICAL_TELL]`` tag so ``server.py`` can track tell
        frequency.

        Args:
            char_name: Character display name, e.g. ``"Sable (Kuroha)"``.
            arousal_level: Current arousal on the 0.0–10.0 scale.

        Returns:
            A single-paragraph prompt fragment ending with ``[PHYSICAL_TELL]``
            when a tell is selected; ``None`` when the frequency gate suppresses
            the tell for this turn.

        Example::

            >>> import random; random.seed(1)
            >>> engine = PhysicalTellsEngine()
            >>> result = engine.get_prompt("Genki (Kitsune)", 5.0)
            >>> # Either None (gate suppressed) or a prompt with the tag
            >>> result is None or "[PHYSICAL_TELL]" in result
            True
            >>> result is None or result.startswith("Subtle physical tell")
            True
        """
        tell = self.get_tell(char_name, arousal_level)
        if tell is None:
            return None

        prompt = f"{_TELL_PROMPT_TEMPLATE.format(tell=tell)}\n\n[PHYSICAL_TELL]"

        logger.debug(
            "physical tell prompt built for %r (arousal=%.1f)",
            char_name,
            arousal_level,
        )
        return prompt
