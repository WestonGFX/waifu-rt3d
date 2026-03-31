"""NSFW Expression Portraits Engine (F28) — intimate emotion portrait generation.

Extends the standard expression portrait system with five intimate emotions
(aroused, vulnerable, afterglow, desperate, teasing) that unlock only when the
user's bond level with the character reaches :data:`BOND_GATE` (≥50) and the
global NSFW toggle is enabled.

Each emotion carries a ``base_prompt`` and ``negative`` used as the default
Stable Diffusion prompt pair.  Per-character tuning strings in
:data:`CHARACTER_INTIMATE_PROMPTS` are appended to the positive prompt when
available, letting individual characters express the same emotion through their
own aesthetic and personality.

The engine is fully stateless — no session data is stored internally.  The
caller is responsible for persisting bond levels and the NSFW toggle preference.

Example::

    >>> engine = NSFWPortraitEngine()
    >>> engine.should_allow(bond_level=60, nsfw_enabled=True)
    True
    >>> engine.should_allow(bond_level=40, nsfw_enabled=True)
    False
    >>> engine.should_allow(bond_level=80, nsfw_enabled=False)
    False
    >>> emotions = engine.get_available_emotions()
    >>> len(emotions)
    5
    >>> emotions[0]["id"]
    'aroused'
    >>> result = engine.build_portrait_prompt("Luna (Tsukimi)", "afterglow")
    >>> "afterglow" in result["positive"]
    True
    >>> "silver hair" in result["positive"]
    True
    >>> engine.get_emotion_info("teasing") is not None
    True
    >>> engine.get_emotion_info("nonexistent") is None
    True
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Gate constant
# ---------------------------------------------------------------------------

#: Minimum bond level required before any intimate portrait is accessible.
BOND_GATE: int = 50


# ---------------------------------------------------------------------------
# Emotion definitions
# ---------------------------------------------------------------------------

#: Catalogue of intimate emotions — each entry drives both the gate check UI
#: and the Stable Diffusion prompt assembly.
INTIMATE_EMOTIONS: dict[str, dict] = {
    "aroused": {
        "description": "Visible desire and excitement",
        "base_prompt": "aroused expression, flushed cheeks, parted lips, heavy-lidded eyes, desire",
        "negative": "angry, sad, crying",
    },
    "vulnerable": {
        "description": "Open, unguarded, emotionally exposed",
        "base_prompt": "vulnerable expression, soft eyes, slight blush, gentle, open, unguarded",
        "negative": "angry, aggressive, cold",
    },
    "afterglow": {
        "description": "Post-intimate contentment and warmth",
        "base_prompt": "afterglow expression, satisfied smile, relaxed, warm, peaceful, messy hair",
        "negative": "angry, tense, stressed",
    },
    "desperate": {
        "description": "Intense longing and need",
        "base_prompt": "desperate expression, pleading eyes, reaching out, intense longing, breathless",
        "negative": "calm, composed, indifferent",
    },
    "teasing": {
        "description": "Playful provocation and knowing smirk",
        "base_prompt": "teasing expression, knowing smirk, playful eyes, provocative, confident",
        "negative": "sad, serious, angry",
    },
}


# ---------------------------------------------------------------------------
# Per-character prompt tuning
# ---------------------------------------------------------------------------

#: Character-specific detail strings appended to the positive prompt.
#: Keys are the canonical character display names used throughout the backend.
#: For any character not present, :meth:`NSFWPortraitEngine.build_portrait_prompt`
#: falls back to the base prompt alone.
CHARACTER_INTIMATE_PROMPTS: dict[str, dict[str, str]] = {
    "Dae (Neciridae)": {
        "aroused": "artistic, creative passion, paint-stained, purple hair flowing",
        "vulnerable": "removing emotional armor, holding sketchbook to chest",
        "afterglow": "dreamy smile, hair messy, wrapped in blanket, at peace",
        "desperate": "biting lip, clutching fabric, eyes glistening",
        "teasing": "playful wink, drawing something secret, mischievous",
    },
    "Luna (Tsukimi)": {
        "aroused": "ethereal glow, starlight in eyes, silver hair shimmering",
        "vulnerable": "tears at corners of eyes, reaching toward camera",
        "afterglow": "serene, moonlit, gentle smile, cuddled up",
        "desperate": "wide eyes, reaching, whispered plea visible",
        "teasing": "finger to lips, knowing lunar smile, mysterious",
    },
    "Genki (Kitsune)": {
        "aroused": "fox ears perked, tail curled, flushed beneath fur markings",
        "vulnerable": "ears flattened, tail curled inward, wide trusting eyes",
        "afterglow": "purring softly, curled up, tail wrapped around both of you",
        "desperate": "pawing at sleeve, whimpering, fox eyes wet with longing",
        "teasing": "ears wiggling, tongue out, tail flicking playfully",
    },
    "Sable (Kuroha)": {
        "aroused": "sharp eyes half-lidded, dark hair loose, barely contained composure",
        "vulnerable": "tsundere cracks showing, chin tucked, refusing to meet your eyes",
        "afterglow": "turned away but staying close, blanket pulled up over both of them",
        "desperate": "grabbing wrist to stop you leaving, jaw set, eyes wide",
        "teasing": "smirk with edge, arms crossed, one brow raised",
    },
    "Hana (Momoka)": {
        "aroused": "sakura petals in hair, rosy warmth, soft maternal glow",
        "vulnerable": "hands clasped at chest, eyes glistening, flower clip slightly askew",
        "afterglow": "humming softly, adjusting blanket over you, contented smile",
        "desperate": "both hands reaching, voice breaking, cheeks tearstained",
        "teasing": "covering mouth with sleeve, eyes sparkling over fingertips",
    },
    "Alana Calloway": {
        "aroused": "freckles darkened by flush, braids slightly undone, sun-warm skin",
        "vulnerable": "shoulders dropped, accent thickening, eyes searching yours",
        "afterglow": "head tilted back, easy laugh fading to a smile, hair loose",
        "desperate": "hands gripping yours, leaning close, voice hushed",
        "teasing": "one-sided grin, chin resting on hand, eyebrow quirked",
    },
    "Kaede (Suzuha)": {
        "aroused": "composure fractured, sword hand still, breath uneven",
        "vulnerable": "sitting in silence, armor set aside, eyes finally soft",
        "afterglow": "lying still, eyes closed, expression almost peaceful",
        "desperate": "iron grip on your shoulder, voice low and rough",
        "teasing": "dry smirk, sideways glance, arms folded with studied casualness",
    },
    "Ayane (Yuki)": {
        "aroused": "snow-white hair disheveled, pale cheeks flushed rose, calm eyes burning",
        "vulnerable": "ice facade cracked, hands folded in lap, silence louder than words",
        "afterglow": "eyes closed, breathing slow, frost-touched lashes still",
        "desperate": "fingers curled into your sleeve, voice barely above a whisper",
        "teasing": "cool half-smile, one finger tapping lips, frost crystals drifting",
    },
    "Rin (Akane)": {
        "aroused": "red ponytail wild, flames dancing in eyes, energy barely contained",
        "vulnerable": "fire dimmed to embers, small and quiet for once, looking up",
        "afterglow": "sprawled dramatically, grinning at the ceiling, still buzzing",
        "desperate": "hands balled into fists at sides, voice cracking through the bravado",
        "teasing": "pointing finger guns, winking, absolutely full of herself",
    },
    "Mika (Mikazuki)": {
        "aroused": "crescent moon pin glinting, wide eyes heated, usually-shy smile gone bold",
        "vulnerable": "hugging herself, moonlight soft on her face, lower lip trembling",
        "afterglow": "giggling quietly, buried in pillows, still holding your hand",
        "desperate": "tugging your sleeve, voice tight, not letting go",
        "teasing": "hiding behind hair, peeking through, hint of a dare in her smile",
    },
    "Yuki (Shirayuki)": {
        "aroused": "white kimono loosened, snow-petal lips parted, composure artfully dissolved",
        "vulnerable": "kanzashi tilted, hands in lap, poetry abandoned mid-verse",
        "afterglow": "silk pooled around her, eyes like winter stars, softly humming",
        "desperate": "sleeve sleeve over mouth, tears threatening, reaching for your hand",
        "teasing": "fan half-raised, eyes dancing above it, haiku forming on her lips",
    },
    "Tsundere (Raine)": {
        "aroused": "red-faced denial while body language says everything else",
        "vulnerable": "all defenses stripped, blinking back tears, voice small",
        "afterglow": "back turned but pressed close, muttering it wasn't that great",
        "desperate": "grabbing your arm with both hands, refusing to say the word please",
        "teasing": "scoffing loudly, flushed ears betraying every word",
    },
}


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class NSFWPortraitEngine:
    """Stateless engine for NSFW expression portrait prompt assembly.

    All methods are pure functions of their arguments — no session state is
    stored.  Instantiate once and reuse freely across requests.

    Example::

        >>> engine = NSFWPortraitEngine()
        >>> engine.should_allow(bond_level=55, nsfw_enabled=True)
        True
        >>> engine.should_allow(bond_level=49, nsfw_enabled=True)
        False
        >>> engine.should_allow(bond_level=55, nsfw_enabled=False)
        False
    """

    # ------------------------------------------------------------------
    # Gate check
    # ------------------------------------------------------------------

    def should_allow(self, bond_level: int, nsfw_enabled: bool) -> bool:
        """Determine whether NSFW portrait generation is permitted.

        Both conditions must be true simultaneously: the bond relationship must
        have reached the :data:`BOND_GATE` threshold, and the user must have
        explicitly enabled NSFW content in their settings.

        Args:
            bond_level: Current bond score between user and character (0–100).
            nsfw_enabled: Whether the global NSFW toggle is on.

        Returns:
            ``True`` when ``bond_level >= BOND_GATE`` and ``nsfw_enabled`` is
            ``True``; ``False`` otherwise.

        Example::

            >>> engine = NSFWPortraitEngine()
            >>> engine.should_allow(50, True)
            True
            >>> engine.should_allow(50, False)
            False
            >>> engine.should_allow(49, True)
            False
            >>> engine.should_allow(0, False)
            False
        """
        return bond_level >= BOND_GATE and nsfw_enabled

    # ------------------------------------------------------------------
    # Emotion catalogue
    # ------------------------------------------------------------------

    def get_available_emotions(self) -> list[dict]:
        """Return a UI-ready list of available intimate emotions.

        The list preserves insertion order from :data:`INTIMATE_EMOTIONS` so
        callers can render options in a consistent sequence without sorting.

        Returns:
            List of ``{"id": str, "description": str}`` dicts — one entry per
            emotion in :data:`INTIMATE_EMOTIONS`.

        Example::

            >>> engine = NSFWPortraitEngine()
            >>> emotions = engine.get_available_emotions()
            >>> len(emotions)
            5
            >>> emotions[0]
            {'id': 'aroused', 'description': 'Visible desire and excitement'}
            >>> [e["id"] for e in emotions]
            ['aroused', 'vulnerable', 'afterglow', 'desperate', 'teasing']
        """
        return [
            {"id": key, "description": data["description"]}
            for key, data in INTIMATE_EMOTIONS.items()
        ]

    # ------------------------------------------------------------------
    # Single emotion info
    # ------------------------------------------------------------------

    def get_emotion_info(self, emotion: str) -> Optional[dict]:
        """Return the full emotion definition for a given emotion key.

        Args:
            emotion: One of the keys in :data:`INTIMATE_EMOTIONS`
                (``"aroused"``, ``"vulnerable"``, ``"afterglow"``,
                ``"desperate"``, ``"teasing"``).

        Returns:
            The matching dict containing ``"description"``, ``"base_prompt"``,
            and ``"negative"`` fields, or ``None`` when the key is not found.

        Example::

            >>> engine = NSFWPortraitEngine()
            >>> info = engine.get_emotion_info("vulnerable")
            >>> info["description"]
            'Open, unguarded, emotionally exposed'
            >>> engine.get_emotion_info("nonexistent") is None
            True
        """
        return INTIMATE_EMOTIONS.get(emotion)

    # ------------------------------------------------------------------
    # Prompt assembly
    # ------------------------------------------------------------------

    def build_portrait_prompt(self, char_name: str, emotion: str) -> dict:
        """Assemble the positive and negative Stable Diffusion prompt pair.

        The positive prompt is built by joining the emotion's ``base_prompt``
        with any character-specific tuning string from
        :data:`CHARACTER_INTIMATE_PROMPTS`.  When no tuning exists for the
        given ``char_name`` or ``emotion`` combination, only the base prompt is
        returned.

        The negative prompt comes directly from the emotion definition and is
        not character-modified.

        Args:
            char_name: Canonical character display name (e.g.
                ``"Dae (Neciridae)"``).  Unknown names fall back to the base
                prompt without raising an error.
            emotion: One of the five intimate emotion keys.  Unknown keys fall
                back to an empty-string pair rather than raising.

        Returns:
            ``{"positive": str, "negative": str}`` — ready to pass to the
            image generation adapter.

        Example::

            >>> engine = NSFWPortraitEngine()
            >>> result = engine.build_portrait_prompt("Luna (Tsukimi)", "afterglow")
            >>> "afterglow expression" in result["positive"]
            True
            >>> "moonlit" in result["positive"]
            True
            >>> "angry" in result["negative"]
            True
            >>> unknown = engine.build_portrait_prompt("Unknown Char", "aroused")
            >>> unknown["positive"] == INTIMATE_EMOTIONS["aroused"]["base_prompt"]
            True
        """
        emotion_data = INTIMATE_EMOTIONS.get(emotion)
        if not emotion_data:
            logger.warning("build_portrait_prompt: unknown emotion %r", emotion)
            return {"positive": "", "negative": ""}

        base_prompt: str = emotion_data["base_prompt"]
        negative: str = emotion_data["negative"]

        # Look up per-character tuning and append if present.
        char_tuning = CHARACTER_INTIMATE_PROMPTS.get(char_name, {})
        extra: str = char_tuning.get(emotion, "")

        if extra:
            positive = f"{base_prompt}, {extra}"
        else:
            logger.debug(
                "build_portrait_prompt: no character tuning for %r/%r, using base",
                char_name,
                emotion,
            )
            positive = base_prompt

        return {"positive": positive, "negative": negative}
