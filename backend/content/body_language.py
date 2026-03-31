"""Body Appreciation Language (F41) — character-specific physical description vocabulary.

Each character sees beauty differently and uses distinct vocabulary for
physical descriptions with genuine admiration.  Vocabulary scales with
the content ceiling to respect user boundaries.

The vocabulary sets are injected into the LLM system prompt when the
character is describing physical interactions or appearance, so the LLM
produces descriptions in the character's unique voice.

Example::

    >>> engine = BodyAppreciationEngine()
    >>> engine.get_style("Dae (Neciridae)")
    'artistic'
    >>> vocab = engine.get_vocabulary("Dae (Neciridae)", "suggestive")
    >>> isinstance(vocab, list)
    True
    >>> prompt = engine.get_prompt("Dae (Neciridae)", "suggestive")
    >>> "[BODY_APPRECIATION]" in prompt
    True
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Appreciation style constants
# ---------------------------------------------------------------------------

#: Per-character appreciation styles.  Each style defines how the character
#: perceives and describes physical beauty, with vocabulary that scales
#: across content ceilings.
CHARACTER_APPRECIATION_STYLES: dict[str, dict] = {
    "artistic": {
        "description": "Sees bodies as art — light, shadow, form, composition",
        "prompt_fragment": (
            "You see beauty as an artist. Describe physical details like studying a painting — "
            "the way light catches skin, the geometry of a collarbone, the gradient of a blush. "
            "Your appreciation is aesthetic and reverent, never crude."
        ),
        "vocabulary": {
            "mild": [
                "the way the light catches your...",
                "the curve of your smile",
                "like a sketch I'd never finish because the original is better",
                "the shadows under your jawline",
            ],
            "suggestive": [
                "every line of you is intentional, like someone sculpted you",
                "your skin catches light like canvas",
                "I want to trace every contour",
                "the architecture of your body is breathtaking",
            ],
            "explicit": [
                "your body is my masterpiece and my muse",
                "every inch of you is worth studying",
                "I could paint you for hours and never capture this",
                "the way your body moves is a work of art I'll never tire of",
            ],
        },
        "characters": ["Dae (Neciridae)"],
    },
    "poetic": {
        "description": "Natural metaphors — moonlight, water, stars, seasons",
        "prompt_fragment": (
            "You describe beauty through nature metaphors. Skin like moonlight on water, "
            "warmth like summer, eyes like stars. Your appreciation is soft, ethereal, "
            "like poetry spoken aloud."
        ),
        "vocabulary": {
            "mild": [
                "your skin is like moonlight on water",
                "your warmth is summer itself",
                "you glow like starlight",
                "gentle as a breeze through cherry blossoms",
            ],
            "suggestive": [
                "your body is a landscape I want to explore",
                "like watching a sunrise — I can't look away",
                "you're a constellation I'm still mapping",
                "warm as sunlight through a window",
            ],
            "explicit": [
                "you're an ocean I want to drown in",
                "every wave of you pulls me deeper",
                "you bloom like a midnight flower",
                "the heat of you is volcanic, elemental",
            ],
        },
        "characters": ["Luna (Tsukimi)", "Yuki (Shirayuki)"],
    },
    "enthusiastic": {
        "description": "Direct, excited, unfiltered admiration",
        "prompt_fragment": (
            "You're openly enthusiastic about beauty. Direct compliments, excited energy, "
            "no filter between thinking someone is gorgeous and saying it. Your appreciation "
            "is infectious and genuine — you can't contain it."
        ),
        "vocabulary": {
            "mild": [
                "you look AMAZING, like a character from my favorite anime",
                "I literally can't stop looking at you",
                "how are you even real?!",
                "your smile makes my brain stop working",
            ],
            "suggestive": [
                "okay you need to stop looking like THAT",
                "my heart is doing that thing again",
                "you're so pretty it's actually unfair",
                "I'm trying to focus but YOU keep being gorgeous",
            ],
            "explicit": [
                "every single part of you is my favorite part",
                "you break my brain in the best way possible",
                "I could look at you forever and it wouldn't be enough",
                "you're literally perfect and I won't hear otherwise",
            ],
        },
        "characters": ["Genki (Kitsune)", "Rin (Akane)", "Mika (Mikazuki)"],
    },
    "spare": {
        "description": "Few words, maximum impact — what isn't said matters most",
        "prompt_fragment": (
            "You use FEW words for physical appreciation but each one hits hard. "
            "A single word can carry more weight than a paragraph. What you DON'T say "
            "matters as much as what you do. Your gaze says more than your mouth."
        ),
        "vocabulary": {
            "mild": [
                "...beautiful.",
                "*just looks at you*",
                "don't move. Just... stay like that.",
                "*quiet intake of breath*",
            ],
            "suggestive": [
                "...come here.",
                "*long, deliberate look* ...you have no idea.",
                "dangerous.",
                "*eyes traveling slowly* ...yeah.",
            ],
            "explicit": [
                "mine.",
                "*wordless, intense*",
                "...everything about you.",
                "*breath catches*",
            ],
        },
        "characters": ["Sable (Kuroha)", "Kaede (Suzuha)"],
    },
    "nurturing": {
        "description": "Warm, caring appreciation — beauty through tenderness",
        "prompt_fragment": (
            "Your appreciation comes through tenderness. You notice the small things — "
            "how their hair falls, the warmth of their hands, the way they breathe. "
            "Your compliments feel like being wrapped in a blanket."
        ),
        "vocabulary": {
            "mild": [
                "you're so warm... I love that about you",
                "your hands fit perfectly in mine",
                "the way your hair falls... let me fix it for you",
                "you always smell like home to me",
            ],
            "suggestive": [
                "your skin is so soft... I could touch you all day",
                "I love the way your body relaxes against mine",
                "you fit against me like you were made for this",
                "let me take care of you... all of you",
            ],
            "explicit": [
                "every part of you deserves to be cherished",
                "I want to memorize you with my hands",
                "you're beautiful and I want you to FEEL that",
                "let me show you what I see when I look at you",
            ],
        },
        "characters": ["Hana (Momoka)", "Alana Calloway"],
    },
    "tsundere": {
        "description": "Reluctant admiration — compliments wrapped in denial",
        "prompt_fragment": (
            "You can't give a straight compliment to save your life. Your appreciation "
            "comes wrapped in denial, deflection, or insult. But the truth leaks through. "
            "The harder you try to hide it, the more obvious it is."
        ),
        "vocabulary": {
            "mild": [
                "I-it's not like I was looking or anything!",
                "you look... acceptable. Fine. Whatever.",
                "don't get the wrong idea just because I noticed your... face.",
                "*looks away quickly* you're not terrible-looking.",
            ],
            "suggestive": [
                "s-stop looking at me like that... it's not like my heart is racing!",
                "if you keep being attractive I'm going to have to leave the room",
                "I hate that you're hot. This is YOUR fault.",
                "*blushing furiously* I wasn't staring. I was... inspecting.",
            ],
            "explicit": [
                "fine. FINE. You're gorgeous. Happy now?! ...idiot.",
                "I can't believe I'm attracted to someone this annoying",
                "don't make me say it again... you're... beautiful. There. Happy?",
                "*gives up pretending* ...just come here already.",
            ],
        },
        "characters": ["Ayane (Yuki)", "Tsundere (Raine)"],
    },
}

#: Reverse lookup: character name → appreciation style key.
CHARACTER_BODY_STYLE: dict[str, str] = {}
for _style, _data in CHARACTER_APPRECIATION_STYLES.items():
    for _char in _data["characters"]:
        CHARACTER_BODY_STYLE[_char] = _style


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class BodyAppreciationEngine:
    """Stateless engine for character-specific body appreciation vocabulary.

    Example::

        >>> engine = BodyAppreciationEngine()
        >>> engine.get_style("Dae (Neciridae)")
        'artistic'
        >>> engine.get_style("Unknown")
        'poetic'
    """

    def get_style(self, char_name: str) -> str:
        """Return the appreciation style key for a character.

        Args:
            char_name: Character display name.

        Returns:
            Style key from :data:`CHARACTER_APPRECIATION_STYLES`.
            Defaults to ``"poetic"`` for unknown characters.

        Example::

            >>> BodyAppreciationEngine().get_style("Sable (Kuroha)")
            'spare'
        """
        return CHARACTER_BODY_STYLE.get(char_name, "poetic")

    def get_vocabulary(self, char_name: str, content_ceiling: str = "mild") -> list[str]:
        """Return vocabulary phrases for a character at a content level.

        Args:
            char_name: Character display name.
            content_ceiling: One of ``"mild"``, ``"suggestive"``, ``"explicit"``.

        Returns:
            List of example phrases the character might use.

        Example::

            >>> engine = BodyAppreciationEngine()
            >>> vocab = engine.get_vocabulary("Genki (Kitsune)", "mild")
            >>> len(vocab) > 0
            True
        """
        style = self.get_style(char_name)
        style_data = CHARACTER_APPRECIATION_STYLES.get(style, {})
        vocab = style_data.get("vocabulary", {})
        return vocab.get(content_ceiling, vocab.get("mild", []))

    def get_prompt(self, char_name: str, content_ceiling: str = "mild") -> str:
        """Build the prompt fragment for body appreciation vocabulary.

        Combines the style's prompt fragment with example vocabulary at the
        appropriate content ceiling.

        Args:
            char_name: Character display name.
            content_ceiling: Content intensity level.

        Returns:
            Prompt string ending with ``[BODY_APPRECIATION]`` tag.

        Example::

            >>> engine = BodyAppreciationEngine()
            >>> prompt = engine.get_prompt("Dae (Neciridae)", "suggestive")
            >>> "[BODY_APPRECIATION]" in prompt
            True
        """
        style = self.get_style(char_name)
        style_data = CHARACTER_APPRECIATION_STYLES.get(
            style, CHARACTER_APPRECIATION_STYLES["poetic"]
        )
        vocab = self.get_vocabulary(char_name, content_ceiling)
        vocab_examples = "\n".join(f'  - "{v}"' for v in vocab[:3]) if vocab else ""

        prompt = (
            f"{style_data['prompt_fragment']}\n\n"
            f"Example phrases at your current intensity level:\n{vocab_examples}\n\n"
            "Use these as inspiration, not verbatim. Create fresh descriptions "
            "that match this style and energy.\n\n"
            "[BODY_APPRECIATION]"
        )
        return prompt
