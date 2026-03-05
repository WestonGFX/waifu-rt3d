"""Voice Parameter Modulation — Feature A7.

Maps detected emotion + intensity to TTS delivery parameter overrides.
The user always controls **which voice** is used; this module only adjusts
**how** that voice delivers the line (speed, pitch delta, energy).

Emotion → parameter map philosophy:
    - Parameters stay within human-sounding ranges (no cartoonish effects).
    - Adjustments are mild — these are nudges, not transformations.
    - "neutral" maps to zero-delta (no change from user's preferred settings).

Supported TTS providers and their parameter fields:
    - Kokoro (kokoro-fastapi): speed, pitch
    - Edge-TTS: rate (CSS duration value e.g. "+10%"), pitch (e.g. "+5Hz")
    - ElevenLabs: speed, stability, similarity_boost
    - Piper: speaking_rate, sentence_silence
    - GPT-SoVITS / Fish Audio: speed_factor

Usage::

    from backend.tts.voice_modulator import VoiceModulator
    mod = VoiceModulator()
    overrides = mod.get_params("happy", intensity=0.8, provider="kokoro")
    # overrides = {"speed": 1.15, "pitch": 2}
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Emotion parameter profiles
# ---------------------------------------------------------------------------
# Each entry defines relative deltas from neutral delivery (0 = no change).
#
# Keys:
#   speed_delta   — fraction added to base speed (e.g. +0.1 = 10% faster)
#   pitch_delta   — semitone-equivalent nudge (positive = higher pitch)
#   energy_delta  — volume / expressiveness nudge (0.0–1.0 scale)
#   pause_before  — ms of silence to add before speaking (for dramatic effect)

_PROFILES: dict[str, dict[str, float]] = {
    # --- Core (Ekman+) ---
    "neutral":      {"speed_delta":  0.00, "pitch_delta":  0.0, "energy_delta":  0.0, "pause_before":  0},
    "happy":        {"speed_delta":  0.10, "pitch_delta":  2.0, "energy_delta":  0.2, "pause_before":  0},
    "sad":          {"speed_delta": -0.12, "pitch_delta": -2.0, "energy_delta": -0.2, "pause_before": 120},
    "angry":        {"speed_delta":  0.12, "pitch_delta": -1.0, "energy_delta":  0.3, "pause_before":  0},
    "surprised":    {"speed_delta":  0.05, "pitch_delta":  3.0, "energy_delta":  0.2, "pause_before": 40},
    "fearful":      {"speed_delta":  0.15, "pitch_delta":  2.0, "energy_delta": -0.1, "pause_before": 40},
    "disgusted":    {"speed_delta": -0.05, "pitch_delta": -1.5, "energy_delta":  0.1, "pause_before":  0},
    # --- Social ---
    "embarrassed":  {"speed_delta": -0.08, "pitch_delta":  1.5, "energy_delta": -0.15,"pause_before": 100},
    "shy":          {"speed_delta": -0.10, "pitch_delta":  1.0, "energy_delta": -0.2, "pause_before": 80},
    "proud":        {"speed_delta":  0.05, "pitch_delta": -0.5, "energy_delta":  0.15,"pause_before":  0},
    "confident":    {"speed_delta":  0.06, "pitch_delta": -0.3, "energy_delta":  0.15,"pause_before":  0},
    "jealous":      {"speed_delta":  0.04, "pitch_delta": -0.5, "energy_delta":  0.1, "pause_before": 40},
    "grateful":     {"speed_delta": -0.04, "pitch_delta":  1.0, "energy_delta":  0.1, "pause_before": 60},
    # --- Cognitive ---
    "confused":     {"speed_delta": -0.06, "pitch_delta":  1.0, "energy_delta": -0.1, "pause_before": 60},
    "curious":      {"speed_delta":  0.04, "pitch_delta":  1.5, "energy_delta":  0.1, "pause_before": 30},
    "thoughtful":   {"speed_delta": -0.08, "pitch_delta": -0.5, "energy_delta": -0.1, "pause_before": 100},
    "nostalgic":    {"speed_delta": -0.10, "pitch_delta": -1.0, "energy_delta": -0.1, "pause_before": 120},
    "awe":          {"speed_delta": -0.04, "pitch_delta":  2.5, "energy_delta":  0.15,"pause_before": 60},
    # --- Romantic ---
    "love":         {"speed_delta": -0.06, "pitch_delta":  1.0, "energy_delta":  0.1, "pause_before": 60},
    "flirty":       {"speed_delta":  0.04, "pitch_delta":  2.0, "energy_delta":  0.15,"pause_before": 30},
    "longing":      {"speed_delta": -0.10, "pitch_delta": -0.5, "energy_delta": -0.1, "pause_before": 140},
    # --- Energy ---
    "excited":      {"speed_delta":  0.18, "pitch_delta":  3.5, "energy_delta":  0.3, "pause_before":  0},
    "tired":        {"speed_delta": -0.14, "pitch_delta": -1.5, "energy_delta": -0.25,"pause_before": 100},
    "relieved":     {"speed_delta": -0.06, "pitch_delta":  0.5, "energy_delta": -0.05,"pause_before": 80},
    # --- Playful ---
    "smug":         {"speed_delta":  0.04, "pitch_delta": -0.5, "energy_delta":  0.05,"pause_before":  0},
    "mischievous":  {"speed_delta":  0.08, "pitch_delta":  2.5, "energy_delta":  0.2, "pause_before":  0},
}

# Legacy aliases — old profile names that map to canonical emotions.
# These are checked at lookup time so existing code using the old names
# still gets a valid profile without any code changes elsewhere.
_PROFILE_ALIASES: dict[str, str] = {
    "playful":      "mischievous",
    "affectionate": "love",
    "loving":       "love",
    "calm":         "neutral",
    "nervous":      "fearful",
}

# Fallback for unknown emotions
_NEUTRAL = _PROFILES["neutral"]


class VoiceModulator:
    """Maps emotion + intensity to TTS provider-specific parameter overrides.

    Args:
        base_speed: The user's preferred base speech rate (default 1.0).
        intensity_scale: Global multiplier for all emotion effects (0.0–1.0).
            Set to 0.0 to disable modulation entirely.

    Example:
        >>> mod = VoiceModulator(base_speed=1.0, intensity_scale=0.8)
        >>> mod.get_params("happy", intensity=0.9, provider="kokoro")
        {'speed': 1.13, 'pitch': 2}
    """

    def __init__(self, base_speed: float = 1.0, intensity_scale: float = 0.7):
        self.base_speed = base_speed
        self.intensity_scale = max(0.0, min(1.0, intensity_scale))

    def get_params(
        self,
        emotion: str,
        intensity: float = 0.7,
        provider: str = "kokoro",
    ) -> dict[str, Any]:
        """Return TTS parameter overrides for the given emotion.

        Parameters are provider-specific (see module docstring) and should
        be merged into the base TTS request payload.

        Args:
            emotion: Emotion name (e.g. "happy", "sad").  Unknown emotions
                fall back to neutral (no modification).
            intensity: How strongly to apply the emotion effect (0.0–1.0).
                At 0.0 all deltas collapse to zero.
            provider: TTS provider name — determines output key format.

        Returns:
            Dict of parameter overrides ready to merge into a TTS request.

        Example:
            >>> mod = VoiceModulator()
            >>> mod.get_params("excited", 0.9, "edge-tts")
            {'rate': '+14%', 'pitch': '+3Hz'}
        """
        key = emotion.lower()
        key = _PROFILE_ALIASES.get(key, key)
        profile = _PROFILES.get(key, _NEUTRAL)
        scale = intensity * self.intensity_scale

        # Compute scaled deltas
        speed_delta = profile["speed_delta"] * scale
        pitch_delta = profile["pitch_delta"] * scale
        energy_delta = profile["energy_delta"] * scale

        speed = round(max(0.5, min(2.0, self.base_speed + speed_delta)), 2)
        pitch = round(pitch_delta, 1)
        energy = round(max(0.0, min(1.0, 0.5 + energy_delta)), 2)

        logger.debug(
            "[VoiceModulator] emotion=%s intensity=%.1f → speed=%.2f pitch=%.1f energy=%.2f",
            emotion, intensity, speed, pitch, energy,
        )

        return self._format_for_provider(provider, speed, pitch, energy)

    def _format_for_provider(
        self, provider: str, speed: float, pitch: float, energy: float
    ) -> dict[str, Any]:
        """Translate abstract parameters to provider-specific field names.

        Args:
            provider: TTS backend name (kokoro, edge-tts, elevenlabs,
                piper, gptsovits, fish_audio).
            speed: Absolute speech rate (1.0 = normal).
            pitch: Relative pitch in semitones (0 = no change).
            energy: Expressiveness/volume level (0–1 scale).

        Returns:
            Provider-specific parameter dict.
        """
        p = provider.lower().replace("-", "_")

        if p == "kokoro":
            out: dict[str, Any] = {"speed": speed}
            if abs(pitch) > 0.1:
                out["pitch"] = int(round(pitch))
            return out

        if p == "edge_tts":
            # Edge-TTS uses CSS duration strings
            rate_pct = int((speed - 1.0) * 100)
            rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"
            out = {"rate": rate_str}
            if abs(pitch) > 0.3:
                pitch_hz = int(round(pitch * 2))  # rough semitone → Hz
                out["pitch"] = f"+{pitch_hz}Hz" if pitch_hz >= 0 else f"{pitch_hz}Hz"
            return out

        if p == "elevenlabs":
            out = {"speed": speed}
            if abs(energy) > 0.05:
                out["stability"] = round(max(0.1, 0.75 - energy * 0.2), 2)
                out["similarity_boost"] = round(min(1.0, 0.75 + energy * 0.15), 2)
            return out

        if p == "piper_local":
            return {"speaking_rate": speed}

        if p in ("gptsovits", "fish_audio", "chatterbox"):
            return {"speed_factor": speed}

        # Unknown provider — return speed only as a safe universal key
        return {"speed": speed}


# Module-level singleton for convenience
_default_modulator: VoiceModulator | None = None


def get_default_modulator(
    base_speed: float = 1.0,
    intensity_scale: float = 0.7,
) -> VoiceModulator:
    """Return (or create) the default module-level modulator.

    Args:
        base_speed: User's preferred base rate.
        intensity_scale: Global effect multiplier.

    Returns:
        Cached VoiceModulator instance.

    Example:
        >>> mod = get_default_modulator(base_speed=1.1)
        >>> mod.get_params("happy", 0.8, "kokoro")
        {'speed': 1.22}
    """
    global _default_modulator
    if _default_modulator is None:
        _default_modulator = VoiceModulator(
            base_speed=base_speed,
            intensity_scale=intensity_scale,
        )
    return _default_modulator
