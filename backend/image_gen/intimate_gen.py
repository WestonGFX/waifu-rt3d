"""Contextual Intimate Image Generation Engine (F29).

Builds Stable Diffusion prompt pairs (positive + negative) from scene context
for intimate image generation.  Content is bond-gated: the requested level
must be reachable given the current bond score and the global NSFW toggle.

Three content tiers are defined:

* **sfw** — cute, romantic imagery; available at any bond level regardless of
  the NSFW toggle.
* **suggestive** — implied intimacy; requires bond ≥ 50 and NSFW enabled.
* **explicit** — full NSFW content; requires bond ≥ 80 and NSFW enabled.

The engine is stateless — all context (character name, mood, clothing state,
bond level) is supplied by the caller on each invocation.

Example::

    >>> engine = IntimateImageEngine()
    >>> engine.should_allow(bond_level=85, nsfw_enabled=True, requested_level="explicit")
    True
    >>> engine.should_allow(bond_level=85, nsfw_enabled=False, requested_level="suggestive")
    False
    >>> engine.should_allow(bond_level=30, nsfw_enabled=True, requested_level="sfw")
    True
    >>> level = engine.get_content_level(bond_level=60, nsfw_enabled=True)
    >>> level
    'suggestive'
    >>> prompts = engine.get_prompt_for_level("Dae (Neciridae)", "sfw", "romantic")
    >>> "positive" in prompts and "negative" in prompts
    True
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Content-level constants
# ---------------------------------------------------------------------------

#: Bond thresholds and human-readable descriptions for each content tier.
#: ``bond_required`` is the *minimum* bond score needed to access the level
#: when NSFW is enabled.
CONTENT_LEVELS: dict[str, dict] = {
    "sfw": {
        "bond_required": 0,
        "description": "Safe for work — cute, romantic",
    },
    "suggestive": {
        "bond_required": 50,
        "description": "Suggestive — implied intimacy",
    },
    "explicit": {
        "bond_required": 80,
        "description": "Explicit — full NSFW content",
    },
}

#: Ordered tier names from least to most explicit.  Used when selecting the
#: highest level the user qualifies for.
_LEVEL_ORDER: list[str] = ["sfw", "suggestive", "explicit"]


# ---------------------------------------------------------------------------
# Lighting constants
# ---------------------------------------------------------------------------

#: Mood → lighting descriptor injected into the positive prompt.
#: The values are crafted to guide SD towards the right atmosphere without
#: competing with character or clothing descriptors.
MOOD_LIGHTING: dict[str, str] = {
    "romantic": "warm golden hour lighting, candlelight, soft shadows",
    "passionate": "dramatic red lighting, high contrast, intense shadows",
    "tender": "soft natural light, gentle diffused glow, morning light",
    "playful": "bright colorful lighting, fun atmosphere, natural daylight",
    "mysterious": "blue moonlight, dim ambient, silhouette lighting",
}

#: Fallback lighting used when the caller provides an unrecognised mood.
_DEFAULT_LIGHTING: str = "soft studio lighting, pleasant ambient"


# ---------------------------------------------------------------------------
# Character LoRA hints
# ---------------------------------------------------------------------------

#: Per-character appearance keywords fed into the positive prompt.
#: These act as lightweight LoRA-style hints to nudge SD toward the character's
#: visual identity even without a trained LoRA file loaded.
CHARACTER_LORA_HINTS: dict[str, str] = {
    "Dae (Neciridae)": "purple hair, artistic, paint-stained fingers, creative",
    "Luna (Tsukimi)": "silver hair, ethereal, stargazer, gentle expression",
    "Genki (Kitsune)": "fox ears, energetic, bright eyes, playful grin",
    "Sable (Kuroha)": "dark hair, intense gaze, elegant, commanding presence",
    "Hana (Momoka)": "warm brown hair, nurturing smile, soft features, motherly",
    "Alana Calloway": "auburn hair, freckles, confident smile, sporty build",
    "Kaede (Suzuha)": "black hair, calm expression, traditional aesthetic, stoic",
    "Ayane (Yuki)": "white hair, ice-blue eyes, cool demeanor, slender",
    "Rin (Akane)": "red hair, bright energy, athletic, spirited expression",
    "Mika (Mikazuki)": "pastel blue hair, dreamy eyes, soft smile, gentle aura",
    "Tsundere (Raine)": "twin tails, defiant expression, rosy cheeks, sharp eyes",
    "Yuki (Shirayuki)": "snow-white hair, delicate features, poetic presence",
}

#: Fallback hint used when the character is not listed in ``CHARACTER_LORA_HINTS``.
_DEFAULT_LORA_HINT: str = "anime girl, detailed features, expressive eyes"


# ---------------------------------------------------------------------------
# Quality prompt fragments
# ---------------------------------------------------------------------------

#: Universal positive quality tags appended to every prompt.
_QUALITY_POSITIVE: str = (
    "masterpiece, best quality, highly detailed, 8k, sharp focus, "
    "professional lighting, beautiful composition"
)

#: Universal negative quality tags used to suppress common SD artefacts.
_QUALITY_NEGATIVE: str = (
    "lowres, bad anatomy, bad hands, text, error, missing fingers, "
    "extra digit, fewer digits, cropped, worst quality, low quality, "
    "normal quality, jpeg artifacts, signature, watermark, blurry, "
    "deformed, ugly, mutilated"
)

#: Additional negative tags applied to SFW and suggestive levels to keep
#: content within their respective tiers.
_SFW_CONTENT_NEGATIVE: str = "nsfw, explicit content, nudity, sexual content"
_SUGGESTIVE_CONTENT_NEGATIVE: str = "explicit nudity, graphic sexual content, pornographic"


# ---------------------------------------------------------------------------
# Clothing state descriptors
# ---------------------------------------------------------------------------

#: Human-readable clothing state → SD prompt fragment.
#: These are deliberately neutral so they combine cleanly with character hints
#: and lighting descriptors at every content tier.
CLOTHING_STATE_DESCRIPTORS: dict[str, str] = {
    "dressed": "fully clothed, casual outfit",
    "partially_undressed": "partially undressed, disheveled clothing",
    "undressed": "undressed, unclothed",
    "lingerie": "wearing lingerie, intimate clothing",
    "casual": "casual comfortable clothing, relaxed attire",
    "formal": "elegant formal attire, dressed up",
}

#: Fallback clothing descriptor.
_DEFAULT_CLOTHING: str = "appropriate attire"


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class IntimateImageEngine:
    """Stateless engine that builds SD prompt pairs for intimate image generation.

    No per-session state is held — the caller supplies bond level, NSFW toggle,
    character name, and scene context on every call.  This makes the engine
    cheap to instantiate per-request and trivially serialisable.

    Example::

        >>> engine = IntimateImageEngine()
        >>> engine.get_content_level(90, True)
        'explicit'
        >>> engine.get_content_level(60, True)
        'suggestive'
        >>> engine.get_content_level(60, False)
        'sfw'
        >>> engine.get_content_level(10, True)
        'sfw'
    """

    # ------------------------------------------------------------------
    # Content-level resolution
    # ------------------------------------------------------------------

    def get_content_level(self, bond_level: int, nsfw_enabled: bool) -> str:
        """Return the highest content tier the user currently qualifies for.

        Walks ``_LEVEL_ORDER`` from highest to lowest and returns the first
        level whose bond requirement is met.  If ``nsfw_enabled`` is ``False``
        the result is clamped to ``"sfw"`` regardless of bond score.

        Args:
            bond_level: Current bond score for the active character (0–100).
            nsfw_enabled: Global NSFW toggle from user settings.

        Returns:
            One of ``"sfw"``, ``"suggestive"``, or ``"explicit"``.

        Example::

            >>> engine = IntimateImageEngine()
            >>> engine.get_content_level(100, True)
            'explicit'
            >>> engine.get_content_level(50, True)
            'suggestive'
            >>> engine.get_content_level(50, False)
            'sfw'
            >>> engine.get_content_level(0, True)
            'sfw'
        """
        if not nsfw_enabled:
            return "sfw"

        for level in reversed(_LEVEL_ORDER):
            required = CONTENT_LEVELS[level]["bond_required"]
            if bond_level >= required:
                return level

        return "sfw"

    # ------------------------------------------------------------------
    # Permission guard
    # ------------------------------------------------------------------

    def should_allow(
        self,
        bond_level: int,
        nsfw_enabled: bool,
        requested_level: str,
    ) -> bool:
        """Check whether the caller may access a specific content tier.

        A request is allowed when the bond score meets the tier's threshold
        AND the NSFW toggle permits it.  ``"sfw"`` is always allowed regardless
        of toggle state.

        Args:
            bond_level: Current bond score for the active character (0–100).
            nsfw_enabled: Global NSFW toggle from user settings.
            requested_level: One of ``"sfw"``, ``"suggestive"``, ``"explicit"``.
                Unknown values are treated as denied.

        Returns:
            ``True`` when the request is permitted; ``False`` otherwise.

        Example::

            >>> engine = IntimateImageEngine()
            >>> engine.should_allow(85, True, "explicit")
            True
            >>> engine.should_allow(85, False, "explicit")
            False
            >>> engine.should_allow(40, True, "suggestive")
            False
            >>> engine.should_allow(0, False, "sfw")
            True
        """
        if requested_level not in CONTENT_LEVELS:
            logger.warning("Unknown content level requested: %r", requested_level)
            return False

        # SFW is gated by bond only, never by the NSFW toggle.
        if requested_level == "sfw":
            return True

        if not nsfw_enabled:
            return False

        required = CONTENT_LEVELS[requested_level]["bond_required"]
        return bond_level >= required

    # ------------------------------------------------------------------
    # Full scene prompt builder
    # ------------------------------------------------------------------

    def build_intimate_prompt(
        self,
        char_name: str,
        scene_context: str,
        intimacy: int,
        clothing_state: str,
        mood: str,
    ) -> dict[str, str]:
        """Build a positive/negative prompt pair from full scene context.

        The positive prompt is assembled from five ordered parts:

        1. Universal quality tags.
        2. Character appearance hints (from ``CHARACTER_LORA_HINTS`` or default).
        3. Mood lighting descriptor (from ``MOOD_LIGHTING`` or default).
        4. Clothing state descriptor.
        5. Scene context string supplied by the caller.

        The negative prompt is always the universal quality negatives plus
        content-level exclusions appropriate for the derived tier.

        The tier is derived from ``intimacy`` (used as a proxy for bond level)
        and the assumption that NSFW is enabled — the caller is responsible for
        calling :meth:`should_allow` before invoking this method when the NSFW
        toggle matters.

        Args:
            char_name: Character display name (e.g. ``"Dae (Neciridae)"``).
            scene_context: Free-text description of the current scene setting
                (e.g. ``"bedroom at night, soft music playing"``).
            intimacy: Current intimacy score (0–100), used to determine tier.
            clothing_state: One of the keys in ``CLOTHING_STATE_DESCRIPTORS``
                or any free-text fallback.
            mood: One of the keys in ``MOOD_LIGHTING`` or any free-text value.

        Returns:
            A dict with keys ``"positive"`` and ``"negative"``, each containing
            a comma-separated SD prompt string.

        Example::

            >>> engine = IntimateImageEngine()
            >>> result = engine.build_intimate_prompt(
            ...     char_name="Luna (Tsukimi)",
            ...     scene_context="moonlit balcony",
            ...     intimacy=70,
            ...     clothing_state="casual",
            ...     mood="tender",
            ... )
            >>> isinstance(result["positive"], str)
            True
            >>> isinstance(result["negative"], str)
            True
            >>> "Luna" in result["positive"] or "silver hair" in result["positive"]
            True
        """
        char_hint = CHARACTER_LORA_HINTS.get(char_name, _DEFAULT_LORA_HINT)
        lighting = MOOD_LIGHTING.get(mood, _DEFAULT_LIGHTING)
        clothing = CLOTHING_STATE_DESCRIPTORS.get(clothing_state, clothing_state or _DEFAULT_CLOTHING)

        # Derive content level from intimacy score (NSFW assumed enabled here).
        content_level = self.get_content_level(bond_level=intimacy, nsfw_enabled=True)

        positive_parts = [
            _QUALITY_POSITIVE,
            char_hint,
            lighting,
            clothing,
        ]
        if scene_context:
            positive_parts.append(scene_context)

        positive = ", ".join(part for part in positive_parts if part)

        # Build content-appropriate negative prompt.
        if content_level == "sfw":
            content_negative = _SFW_CONTENT_NEGATIVE
        elif content_level == "suggestive":
            content_negative = _SUGGESTIVE_CONTENT_NEGATIVE
        else:
            content_negative = ""

        negative_parts = [_QUALITY_NEGATIVE]
        if content_negative:
            negative_parts.append(content_negative)
        negative = ", ".join(negative_parts)

        logger.debug(
            "build_intimate_prompt: char=%r level=%s mood=%s clothing=%s",
            char_name,
            content_level,
            mood,
            clothing_state,
        )

        return {"positive": positive, "negative": negative}

    # ------------------------------------------------------------------
    # Simplified level-specific prompt builder
    # ------------------------------------------------------------------

    def get_prompt_for_level(
        self,
        char_name: str,
        content_level: str,
        mood: str,
        scene_context: Optional[str] = None,
    ) -> dict[str, str]:
        """Build a prompt pair for an explicitly specified content level.

        A simplified alternative to :meth:`build_intimate_prompt` when the
        caller has already resolved the permitted tier (e.g. from
        :meth:`get_content_level`) and wants a prompt without needing to
        supply clothing or intimacy state.

        Args:
            char_name: Character display name (e.g. ``"Genki (Kitsune)"``).
            content_level: One of ``"sfw"``, ``"suggestive"``, ``"explicit"``.
                Unknown values fall back to ``"sfw"`` behaviour.
            mood: Lighting/atmosphere key from ``MOOD_LIGHTING`` or free text.
            scene_context: Optional free-text scene description appended to
                the positive prompt when provided.

        Returns:
            A dict with keys ``"positive"`` and ``"negative"``, each a
            comma-separated SD prompt string calibrated to the requested tier.

        Example::

            >>> engine = IntimateImageEngine()
            >>> result = engine.get_prompt_for_level(
            ...     char_name="Genki (Kitsune)",
            ...     content_level="sfw",
            ...     mood="playful",
            ... )
            >>> "positive" in result
            True
            >>> "nsfw" in result["negative"].lower()
            True
            >>> result2 = engine.get_prompt_for_level(
            ...     char_name="Unknown Char",
            ...     content_level="suggestive",
            ...     mood="romantic",
            ...     scene_context="cozy living room",
            ... )
            >>> "cozy living room" in result2["positive"]
            True
        """
        if content_level not in CONTENT_LEVELS:
            logger.warning(
                "get_prompt_for_level: unknown level %r, falling back to sfw", content_level
            )
            content_level = "sfw"

        char_hint = CHARACTER_LORA_HINTS.get(char_name, _DEFAULT_LORA_HINT)
        lighting = MOOD_LIGHTING.get(mood, _DEFAULT_LIGHTING)

        # Choose a clothing state appropriate for the tier.
        if content_level == "explicit":
            clothing = CLOTHING_STATE_DESCRIPTORS["undressed"]
        elif content_level == "suggestive":
            clothing = CLOTHING_STATE_DESCRIPTORS["lingerie"]
        else:
            clothing = CLOTHING_STATE_DESCRIPTORS["casual"]

        positive_parts = [_QUALITY_POSITIVE, char_hint, lighting, clothing]
        if scene_context:
            positive_parts.append(scene_context)

        positive = ", ".join(part for part in positive_parts if part)

        # Negative prompt calibrated to tier.
        if content_level == "sfw":
            content_negative = _SFW_CONTENT_NEGATIVE
        elif content_level == "suggestive":
            content_negative = _SUGGESTIVE_CONTENT_NEGATIVE
        else:
            content_negative = ""

        negative_parts = [_QUALITY_NEGATIVE]
        if content_negative:
            negative_parts.append(content_negative)
        negative = ", ".join(negative_parts)

        logger.debug(
            "get_prompt_for_level: char=%r level=%s mood=%s",
            char_name,
            content_level,
            mood,
        )

        return {"positive": positive, "negative": negative}
