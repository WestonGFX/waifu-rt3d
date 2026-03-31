"""Blush & Arousal Visuals Engine (F19) — maps arousal levels to avatar parameters.

Converts a numeric arousal level (0.0–10.0) into visual parameter dicts that the
frontend viewer (VRM iframe or Live2D canvas) consumes to animate blush, eye
openness, and lip position.  The backend generates the parameter dict; the
frontend viewer applies it — this module has no knowledge of Three.js or PIXI.

The engine is stateless: no per-session state is held.  The caller (``server.py``
or any LLM turn handler) instantiates it cheaply, passes the current arousal
level, and receives a ready-to-dispatch message.

Five arousal tiers divide the 0–10 range:

* ``none``     (0–3)  — baseline expression
* ``light``    (4–5)  — visible blush begins
* ``moderate`` (6–7)  — half-lidded eyes, subtle lip part
* ``intense``  (8–9)  — heavily lidded, parted lips
* ``peak``     (10)   — near-closed eyes, full immersion

Values between tier boundaries are **linearly interpolated** so transitions
feel smooth rather than stepped.

Example::

    >>> engine = ArousalVisualsEngine()
    >>> engine.get_arousal_tier(0.0)
    'none'
    >>> engine.get_arousal_tier(10.0)
    'peak'
    >>> params = engine.get_visual_params(5.0)
    >>> params["tier"]
    'light'
    >>> params["transition_ms"]
    500
    >>> engine.should_update(previous_level=5.0, current_level=5.3)
    False
    >>> engine.should_update(previous_level=5.0, current_level=5.6)
    True
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Arousal tier → visual parameter mapping
# ---------------------------------------------------------------------------

#: Maps tier name to its range boundaries and target visual parameter values.
#: ``range`` is an inclusive ``(min, max)`` tuple on the 0–10 scale.
#: ``blush_intensity``  — 0.0 (none) to 1.0 (full).
#: ``eye_openness``     — 1.0 (fully open) to 0.0 (fully closed).
#: ``lip_part``         — 0.0 (closed) to 1.0 (wide open).
AROUSAL_VISUAL_MAP: dict[str, dict] = {
    "none": {
        "range": (0, 3),
        "blush_intensity": 0.0,
        "eye_openness": 1.0,
        "lip_part": 0.0,
        "description": "Normal expression, no visible arousal",
    },
    "light": {
        "range": (4, 5),
        "blush_intensity": 0.3,
        "eye_openness": 0.95,
        "lip_part": 0.05,
        "description": "Light blush, eyes slightly wider",
    },
    "moderate": {
        "range": (6, 7),
        "blush_intensity": 0.6,
        "eye_openness": 0.7,
        "lip_part": 0.2,
        "description": "Deeper blush, half-lidded eyes, subtle lip part",
    },
    "intense": {
        "range": (8, 9),
        "blush_intensity": 0.9,
        "eye_openness": 0.4,
        "lip_part": 0.5,
        "description": "Full blush, heavily lidded, parted lips",
    },
    "peak": {
        "range": (10, 10),
        "blush_intensity": 1.0,
        "eye_openness": 0.1,
        "lip_part": 0.8,
        "description": "Intense, closed eyes, full immersion",
    },
}

#: Ordered tier names used for interpolation lookups.
_TIER_ORDER: list[str] = ["none", "light", "moderate", "intense", "peak"]

#: Lerp duration sent to the viewer so it can animate smoothly between states.
TRANSITION_DURATION_MS: int = 500


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _clamp(value: float, lo: float, hi: float) -> float:
    """Clamp ``value`` to the inclusive range [``lo``, ``hi``].

    Args:
        value: The value to clamp.
        lo: Lower bound (inclusive).
        hi: Upper bound (inclusive).

    Returns:
        ``value`` clamped to ``[lo, hi]``.

    Example::

        >>> _clamp(-1.0, 0.0, 10.0)
        0.0
        >>> _clamp(11.0, 0.0, 10.0)
        10.0
        >>> _clamp(5.5, 0.0, 10.0)
        5.5
    """
    return max(lo, min(hi, value))


def _lerp(a: float, b: float, t: float) -> float:
    """Linearly interpolate between ``a`` and ``b`` by factor ``t``.

    Args:
        a: Start value (returned when ``t == 0.0``).
        b: End value (returned when ``t == 1.0``).
        t: Interpolation factor, expected in ``[0.0, 1.0]``.

    Returns:
        ``a + (b - a) * t``

    Example::

        >>> _lerp(0.0, 1.0, 0.5)
        0.5
        >>> _lerp(0.3, 0.9, 0.0)
        0.3
        >>> _lerp(0.3, 0.9, 1.0)
        0.9
    """
    return a + (b - a) * t


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------


class ArousalVisualsEngine:
    """Stateless engine that converts arousal levels to avatar visual parameters.

    Instantiate once and reuse freely — no mutable state is stored between calls.

    Example::

        >>> engine = ArousalVisualsEngine()
        >>> engine.get_arousal_tier(6.5)
        'moderate'
        >>> msg = engine.build_update_message(7.0)
        >>> msg["type"]
        'arousal_visual_update'
        >>> 0.0 <= msg["params"]["blush_intensity"] <= 1.0
        True
    """

    # ------------------------------------------------------------------
    # Tier lookup
    # ------------------------------------------------------------------

    def get_arousal_tier(self, arousal_level: float) -> str:
        """Map a numeric arousal level to its named tier.

        The level is clamped to ``[0.0, 10.0]`` before lookup, so out-of-range
        values are handled gracefully.

        Args:
            arousal_level: Arousal intensity on a 0.0–10.0 scale.

        Returns:
            One of ``"none"``, ``"light"``, ``"moderate"``, ``"intense"``,
            ``"peak"``.

        Example::

            >>> engine = ArousalVisualsEngine()
            >>> engine.get_arousal_tier(-5.0)
            'none'
            >>> engine.get_arousal_tier(3.0)
            'none'
            >>> engine.get_arousal_tier(3.5)
            'none'
            >>> engine.get_arousal_tier(4.0)
            'light'
            >>> engine.get_arousal_tier(7.0)
            'moderate'
            >>> engine.get_arousal_tier(10.0)
            'peak'
            >>> engine.get_arousal_tier(15.0)
            'peak'
        """
        level = _clamp(arousal_level, 0.0, 10.0)
        for tier_name in reversed(_TIER_ORDER):
            lo, _ = AROUSAL_VISUAL_MAP[tier_name]["range"]
            if level >= lo:
                return tier_name
        return "none"

    # ------------------------------------------------------------------
    # Interpolated visual params
    # ------------------------------------------------------------------

    def get_visual_params(self, arousal_level: float) -> dict:
        """Return smoothly interpolated visual parameters for an arousal level.

        Rather than snapping to tier boundaries, this method finds the two
        adjacent tiers and linearly interpolates their parameter values based
        on where ``arousal_level`` sits between them.  The result avoids the
        jarring step changes that tier-only lookup would produce.

        Args:
            arousal_level: Arousal intensity on a 0.0–10.0 scale.

        Returns:
            A dict with keys:

            * ``"blush_intensity"`` (float 0.0–1.0)
            * ``"eye_openness"``   (float 0.0–1.0)
            * ``"lip_part"``       (float 0.0–1.0)
            * ``"tier"``           (str — the dominant tier name)
            * ``"transition_ms"``  (int — always ``TRANSITION_DURATION_MS``)

        Example::

            >>> engine = ArousalVisualsEngine()
            >>> p = engine.get_visual_params(0.0)
            >>> p["blush_intensity"]
            0.0
            >>> p["eye_openness"]
            1.0
            >>> p["tier"]
            'none'
            >>> p = engine.get_visual_params(10.0)
            >>> p["blush_intensity"]
            1.0
            >>> p["tier"]
            'peak'
        """
        level = _clamp(arousal_level, 0.0, 10.0)
        tier_name = self.get_arousal_tier(level)
        tier_index = _TIER_ORDER.index(tier_name)

        current_tier = AROUSAL_VISUAL_MAP[tier_name]

        # If there is a next tier, interpolate toward it.
        if tier_index < len(_TIER_ORDER) - 1:
            next_tier_name = _TIER_ORDER[tier_index + 1]
            next_tier = AROUSAL_VISUAL_MAP[next_tier_name]

            current_lo = float(current_tier["range"][0])
            next_lo = float(next_tier["range"][0])
            # Guard against zero-width bands (e.g. "peak" range is (10,10)).
            band_width = next_lo - current_lo
            t = (level - current_lo) / band_width if band_width > 0.0 else 0.0
            t = _clamp(t, 0.0, 1.0)

            blush = _lerp(current_tier["blush_intensity"], next_tier["blush_intensity"], t)
            eye = _lerp(current_tier["eye_openness"], next_tier["eye_openness"], t)
            lip = _lerp(current_tier["lip_part"], next_tier["lip_part"], t)
        else:
            # Already at the highest tier — use values directly.
            blush = current_tier["blush_intensity"]
            eye = current_tier["eye_openness"]
            lip = current_tier["lip_part"]

        logger.debug(
            "arousal visuals: level=%.2f tier=%s blush=%.3f eye=%.3f lip=%.3f",
            level,
            tier_name,
            blush,
            eye,
            lip,
        )

        return {
            "blush_intensity": round(blush, 4),
            "eye_openness": round(eye, 4),
            "lip_part": round(lip, 4),
            "tier": tier_name,
            "transition_ms": TRANSITION_DURATION_MS,
        }

    # ------------------------------------------------------------------
    # VRM blend shapes
    # ------------------------------------------------------------------

    def get_blend_shapes(self, arousal_level: float) -> dict:
        """Return VRM-compatible blend shape values for an arousal level.

        Translates internal parameter names to the blend shape keys expected
        by ``@pixiv/three-vrm``'s expression manager:

        * ``"blushStrength"``  ← ``blush_intensity``
        * ``"eyeSquint"``      ← inverted ``eye_openness`` (closed = high squint)
        * ``"mouthOpen"``      ← ``lip_part``

        Args:
            arousal_level: Arousal intensity on a 0.0–10.0 scale.

        Returns:
            Dict mapping VRM blend shape names to float values in ``[0.0, 1.0]``.

        Example::

            >>> engine = ArousalVisualsEngine()
            >>> shapes = engine.get_blend_shapes(0.0)
            >>> shapes["blushStrength"]
            0.0
            >>> shapes["eyeSquint"]
            0.0
            >>> shapes = engine.get_blend_shapes(10.0)
            >>> shapes["blushStrength"]
            1.0
            >>> shapes["eyeSquint"]  # 1.0 - 0.1 = 0.9
            0.9
        """
        params = self.get_visual_params(arousal_level)
        # eyeSquint is the *inverse* of openness: fully open → 0 squint.
        eye_squint = round(1.0 - params["eye_openness"], 4)
        return {
            "blushStrength": params["blush_intensity"],
            "eyeSquint": eye_squint,
            "mouthOpen": params["lip_part"],
        }

    # ------------------------------------------------------------------
    # Live2D parameters
    # ------------------------------------------------------------------

    def get_live2d_params(self, arousal_level: float) -> dict:
        """Return Live2D-compatible parameter values for an arousal level.

        Maps internal parameters to the standard Cubism 4 parameter IDs used
        by ``pixi-live2d-display``:

        * ``"ParamCheekFlush"``  ← ``blush_intensity``
        * ``"ParamEyeLOpen"``    ← ``eye_openness``
        * ``"ParamEyeROpen"``    ← ``eye_openness`` (mirrored)
        * ``"ParamMouthOpenY"``  ← ``lip_part``

        Args:
            arousal_level: Arousal intensity on a 0.0–10.0 scale.

        Returns:
            Dict mapping Cubism 4 parameter IDs to float values in ``[0.0, 1.0]``.

        Example::

            >>> engine = ArousalVisualsEngine()
            >>> p = engine.get_live2d_params(0.0)
            >>> p["ParamCheekFlush"]
            0.0
            >>> p["ParamEyeLOpen"]
            1.0
            >>> p["ParamEyeROpen"]
            1.0
            >>> p["ParamMouthOpenY"]
            0.0
        """
        params = self.get_visual_params(arousal_level)
        return {
            "ParamCheekFlush": params["blush_intensity"],
            "ParamEyeLOpen": params["eye_openness"],
            "ParamEyeROpen": params["eye_openness"],
            "ParamMouthOpenY": params["lip_part"],
        }

    # ------------------------------------------------------------------
    # Update gating
    # ------------------------------------------------------------------

    def should_update(
        self,
        previous_level: float,
        current_level: float,
        threshold: float = 0.5,
    ) -> bool:
        """Decide whether the arousal change is large enough to warrant a viewer update.

        Prevents flooding the viewer with near-identical parameter dicts on
        every LLM turn.  Only changes that meet or exceed ``threshold`` on the
        0–10 scale are considered significant.

        Args:
            previous_level: The arousal level from the last update dispatched.
            current_level: The arousal level right now.
            threshold: Minimum absolute change required to trigger an update.
                Defaults to ``0.5``.

        Returns:
            ``True`` if ``abs(current_level - previous_level) >= threshold``;
            ``False`` otherwise.

        Example::

            >>> engine = ArousalVisualsEngine()
            >>> engine.should_update(5.0, 5.3)
            False
            >>> engine.should_update(5.0, 5.5)
            True
            >>> engine.should_update(5.0, 4.5)
            True
            >>> engine.should_update(5.0, 5.0)
            False
            >>> engine.should_update(5.0, 5.6, threshold=1.0)
            False
            >>> engine.should_update(5.0, 6.0, threshold=1.0)
            True
        """
        return abs(current_level - previous_level) >= threshold

    # ------------------------------------------------------------------
    # Complete WebSocket message builder
    # ------------------------------------------------------------------

    def build_update_message(self, arousal_level: float) -> dict:
        """Build the complete WebSocket message for the viewer iframe.

        This is the primary output method for production use.  ``server.py``
        calls this and forwards the result over the WebSocket connection (or
        queues it for the next SSE push) so the frontend viewer can animate
        the avatar in real time.

        The ``"params"`` sub-dict contains merged data from
        :meth:`get_visual_params`, :meth:`get_blend_shapes`, and
        :meth:`get_live2d_params` so the viewer can consume whichever keys it
        supports without a separate round-trip.

        Args:
            arousal_level: Arousal intensity on a 0.0–10.0 scale.

        Returns:
            A dict structured as::

                {
                    "type": "arousal_visual_update",
                    "params": {
                        # Internal visual params
                        "blush_intensity": float,
                        "eye_openness":    float,
                        "lip_part":        float,
                        "tier":            str,
                        # VRM blend shapes
                        "blushStrength":   float,
                        "eyeSquint":       float,
                        "mouthOpen":       float,
                        # Live2D parameters
                        "ParamCheekFlush": float,
                        "ParamEyeLOpen":   float,
                        "ParamEyeROpen":   float,
                        "ParamMouthOpenY": float,
                    },
                    "transition_ms": int,
                }

        Example::

            >>> engine = ArousalVisualsEngine()
            >>> msg = engine.build_update_message(6.0)
            >>> msg["type"]
            'arousal_visual_update'
            >>> msg["transition_ms"]
            500
            >>> "blushStrength" in msg["params"]
            True
            >>> "ParamCheekFlush" in msg["params"]
            True
        """
        visual = self.get_visual_params(arousal_level)
        blend = self.get_blend_shapes(arousal_level)
        live2d = self.get_live2d_params(arousal_level)

        # Merge all param dicts; transition_ms is promoted to the top level.
        params: dict = {**visual, **blend, **live2d}
        params.pop("transition_ms", None)  # lives at top level instead

        return {
            "type": "arousal_visual_update",
            "params": params,
            "transition_ms": TRANSITION_DURATION_MS,
        }
