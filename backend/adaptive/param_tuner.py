"""Dynamic LLM sampling-parameter tuner for the emotional AI companion.

Selects ``temperature``, ``min_p``, ``top_p``, and ``repetition_penalty``
based on the detected conversation context type, then optionally blends in a
character-specific base temperature and nudges all values according to the
current engagement trend.

All functions are **pure** — no database access, no side effects, no I/O.
The module imports only stdlib (``copy``, ``logging``).

Typical usage in ``server.py``::

    from backend.adaptive.param_tuner import get_tuned_params

    params = get_tuned_params(
        context="creative_roleplay",
        char_temperature=char.get("temperature"),
        engagement_trend=rolling_avg.get("sentiment_score", 0.0),
    )
    payload = {**base_payload, **params}

Example:
    >>> from backend.adaptive.param_tuner import get_tuned_params
    >>> p = get_tuned_params("factual_qa")
    >>> p["temperature"]
    0.3
    >>> p["repetition_penalty"]
    1.15
"""

from __future__ import annotations

import copy
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Presets and safe ranges
# ---------------------------------------------------------------------------

#: Sampling-parameter presets keyed by conversation context type.
#: Each preset is a complete set of the four tunable parameters.
CONTEXT_PARAM_PRESETS: dict[str, dict[str, float]] = {
    "emotional_support":   {"temperature": 0.7, "min_p": 0.05, "top_p": 0.90, "repetition_penalty": 1.05},
    "casual_chat":         {"temperature": 0.8, "min_p": 0.08, "top_p": 0.92, "repetition_penalty": 1.10},
    "creative_roleplay":   {"temperature": 1.0, "min_p": 0.05, "top_p": 0.95, "repetition_penalty": 1.02},
    "deep_philosophical":  {"temperature": 0.6, "min_p": 0.10, "top_p": 0.85, "repetition_penalty": 1.08},
    "playful_flirty":      {"temperature": 0.9, "min_p": 0.06, "top_p": 0.93, "repetition_penalty": 1.05},
    "factual_qa":          {"temperature": 0.3, "min_p": 0.15, "top_p": 0.80, "repetition_penalty": 1.15},
    "comfort_reassurance": {"temperature": 0.5, "min_p": 0.08, "top_p": 0.88, "repetition_penalty": 1.05},
}

#: Inclusive ``[min, max]`` safe ranges for each tunable parameter.
#: Values outside these ranges are clamped before being returned.
PARAM_RANGES: dict[str, tuple[float, float]] = {
    "temperature":        (0.1, 1.5),
    "min_p":              (0.01, 0.3),
    "top_p":              (0.5, 1.0),
    "repetition_penalty": (1.0, 1.5),
}

#: Fallback preset used when an unrecognised context string is supplied.
_DEFAULT_CONTEXT: str = "casual_chat"

#: Temperature delta applied per 0.1 unit of ``|engagement_trend|``.
_ENGAGEMENT_TEMP_STEP: float = 0.05

#: Scaling denominator that maps engagement_trend → step multiplier.
#: engagement_trend of ±0.1 → one step; ±1.0 → ten steps.
_ENGAGEMENT_SCALE: float = 0.1


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_tuned_params(
    context: str,
    user_overrides: dict[str, float] | None = None,
    engagement_trend: float = 0.0,
    char_temperature: float | None = None,
) -> dict[str, float]:
    """Return LLM sampling parameters for the detected conversation context.

    Resolution priority (highest → lowest):

    1. **user_overrides** — any key present here is applied last and wins
       outright; only the supplied keys are overridden, not the whole dict.
    2. **char_temperature blend** — when *char_temperature* is provided the
       preset temperature is blended 50 / 50 with it via
       :func:`blend_with_character`.
    3. **engagement drift** — :func:`apply_engagement_drift` nudges the
       temperature (and only the temperature) based on *engagement_trend*
       before user overrides are applied.
    4. **context preset** — the base ``CONTEXT_PARAM_PRESETS[context]`` entry.

    Unrecognised *context* strings fall back to ``"casual_chat"`` and log a
    debug message.  All returned values are clamped to :data:`PARAM_RANGES`.

    Args:
        context: Conversation context key.  Must be one of the keys in
            :data:`CONTEXT_PARAM_PRESETS`; unknown values fall back to
            ``"casual_chat"``.
        user_overrides: Optional dict of per-parameter overrides supplied by
            the user or the calling API.  Keys not present in
            :data:`PARAM_RANGES` are silently ignored.
        engagement_trend: Signed float summarising recent engagement momentum.
            Positive values (rising engagement) nudge temperature up; negative
            values nudge it down.  Typical range ``[-1.0, 1.0]``.
            Defaults to ``0.0`` (no nudge).
        char_temperature: Optional base temperature configured on the
            character.  When provided it is blended 50 / 50 with the context
            preset temperature.

    Returns:
        Dict with keys ``temperature``, ``min_p``, ``top_p``, and
        ``repetition_penalty`` — all floats clamped to their safe ranges.

    Example:
        >>> p = get_tuned_params("creative_roleplay")
        >>> p["temperature"]
        1.0
        >>> p["top_p"]
        0.95
        >>> p2 = get_tuned_params("factual_qa", engagement_trend=-0.5)
        >>> p2["temperature"] < 0.3
        True
        >>> p3 = get_tuned_params("casual_chat", user_overrides={"temperature": 1.2})
        >>> p3["temperature"]
        1.2
    """
    # 1. Resolve base preset.
    if context not in CONTEXT_PARAM_PRESETS:
        logger.debug(
            "get_tuned_params: unknown context %r — falling back to %r",
            context,
            _DEFAULT_CONTEXT,
        )
        context = _DEFAULT_CONTEXT

    params: dict[str, float] = copy.copy(CONTEXT_PARAM_PRESETS[context])

    # 2. Blend character temperature if provided.
    if char_temperature is not None:
        params = blend_with_character(params, char_temperature)

    # 3. Apply engagement drift.
    if engagement_trend != 0.0:
        params = apply_engagement_drift(params, engagement_trend)

    # 4. Apply user overrides (only recognised param keys).
    if user_overrides:
        for key, value in user_overrides.items():
            if key in PARAM_RANGES:
                params[key] = float(value)
            else:
                logger.debug(
                    "get_tuned_params: ignoring unknown override key %r", key
                )

    # 5. Final clamp pass — guarantees safe ranges regardless of path taken.
    return _clamp_params(params)


def apply_engagement_drift(
    base_params: dict[str, float],
    engagement_trend: float,
) -> dict[str, float]:
    """Nudge sampling parameters based on engagement momentum.

    Rising engagement (positive *engagement_trend*) slightly increases
    ``temperature`` to produce more varied, energetic responses.  Falling
    engagement (negative *engagement_trend*) slightly decreases it to produce
    steadier, more grounded responses.

    The magnitude of the nudge is ``0.05`` per ``0.1`` unit of trend, so a
    trend of ``+0.5`` adds ``+0.25`` to temperature.  All four parameters are
    returned but only ``temperature`` is currently modified; the remaining
    three pass through unchanged (they are still clamped).

    Args:
        base_params: Dict of sampling parameters to start from.  Must contain
            at least ``temperature``; keys for ``min_p``, ``top_p``, and
            ``repetition_penalty`` are passed through if present.
        engagement_trend: Signed engagement trend value.  Positive = rising,
            negative = falling.  Values beyond ``[-1.0, 1.0]`` are accepted
            but produce larger (still clamped) adjustments.

    Returns:
        New dict with adjusted (and clamped) parameter values.  The input
        dict is not mutated.

    Example:
        >>> base = {"temperature": 0.8, "min_p": 0.08, "top_p": 0.92, "repetition_penalty": 1.10}
        >>> drifted = apply_engagement_drift(base, engagement_trend=0.2)
        >>> round(drifted["temperature"], 4)
        0.9
        >>> drifted2 = apply_engagement_drift(base, engagement_trend=-0.4)
        >>> round(drifted2["temperature"], 4)
        0.6
        >>> drifted3 = apply_engagement_drift(base, engagement_trend=0.0)
        >>> drifted3["temperature"] == base["temperature"]
        True
    """
    params = copy.copy(base_params)

    # Compute how many discrete 0.1-unit steps the trend represents.
    steps = engagement_trend / _ENGAGEMENT_SCALE  # e.g. 0.5 / 0.1 → 5.0
    delta = steps * _ENGAGEMENT_TEMP_STEP         # 5.0 * 0.05 → +0.25

    params["temperature"] = params.get("temperature", 0.7) + delta

    return _clamp_params(params)


def blend_with_character(
    context_params: dict[str, float],
    char_temperature: float,
    blend_weight: float = 0.5,
) -> dict[str, float]:
    """Blend context-derived temperature with a character's configured temperature.

    The blended temperature is a weighted average::

        blended = context_temp * (1 - blend_weight) + char_temperature * blend_weight

    Only ``temperature`` is affected; ``min_p``, ``top_p``, and
    ``repetition_penalty`` pass through unchanged.

    Args:
        context_params: Dict of sampling parameters from a context preset.
            Must contain ``temperature``; other keys are passed through.
        char_temperature: The character's base temperature setting (e.g. from
            ``characters.temperature`` column).
        blend_weight: Weight given to *char_temperature* in the blend.
            ``0.0`` returns the pure context temperature; ``1.0`` returns the
            pure character temperature.  Defaults to ``0.5`` (equal blend).

    Returns:
        New dict with the blended ``temperature`` and unchanged other params.
        The input dict is not mutated.  The returned temperature is **not**
        clamped here — callers are expected to pass the result through
        :func:`get_tuned_params` or :func:`_clamp_params`.

    Raises:
        ValueError: If *blend_weight* is not in ``[0.0, 1.0]``.

    Example:
        >>> ctx = {"temperature": 1.0, "min_p": 0.05, "top_p": 0.95, "repetition_penalty": 1.02}
        >>> blended = blend_with_character(ctx, char_temperature=0.6)
        >>> blended["temperature"]
        0.8
        >>> blended["top_p"]
        0.95
        >>> blended2 = blend_with_character(ctx, char_temperature=0.6, blend_weight=0.0)
        >>> blended2["temperature"]
        1.0
    """
    if not (0.0 <= blend_weight <= 1.0):
        raise ValueError(
            f"blend_weight must be in [0.0, 1.0], got {blend_weight!r}"
        )

    params = copy.copy(context_params)
    context_temp = params.get("temperature", 0.7)
    params["temperature"] = context_temp * (1.0 - blend_weight) + char_temperature * blend_weight
    return params


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _clamp_params(params: dict[str, float]) -> dict[str, float]:
    """Return a copy of *params* with all known keys clamped to their safe ranges.

    Only keys that appear in :data:`PARAM_RANGES` are clamped; unknown keys
    are passed through unmodified.  The input dict is not mutated.

    Args:
        params: Dict of sampling parameter values to clamp.

    Returns:
        New dict with values clamped to :data:`PARAM_RANGES` bounds.

    Example:
        >>> _clamp_params({"temperature": 2.5, "min_p": 0.0, "top_p": 0.4, "repetition_penalty": 1.8})
        {'temperature': 1.5, 'min_p': 0.01, 'top_p': 0.5, 'repetition_penalty': 1.5}
    """
    result = copy.copy(params)
    for key, (lo, hi) in PARAM_RANGES.items():
        if key in result:
            result[key] = max(lo, min(hi, result[key]))
    return result
