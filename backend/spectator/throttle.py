"""Reaction throttle — frequency control for game spectator reactions.

Prevents the AI from spamming reactions every frame by enforcing cooldowns
based on configurable frequency presets.  High-urgency reactions bypass the
normal cooldown but have their own shorter timer to avoid constant shouting.

Frequency presets:
    quiet  — 1 reaction per 45 seconds (background commentary)
    normal — 1 reaction per 15 seconds (engaged watching)
    hyped  — 1 reaction per 6 seconds (boss fights, clutch moments)

Anti-spam: After 3 consecutive reactions within 60s, forces a 30s quiet period.
"""

import time
import logging
from dataclasses import dataclass, field

logger = logging.getLogger("waifu.spectator.throttle")

# Frequency presets: (normal_cooldown_seconds, urgent_cooldown_seconds)
PRESETS: dict[str, tuple[float, float]] = {
    "quiet": (45.0, 15.0),
    "normal": (15.0, 5.0),
    "hyped": (6.0, 2.0),
}

# Urgency threshold — reactions above this bypass normal cooldown
URGENCY_THRESHOLD = 0.6

# Anti-spam: max consecutive reactions before forced quiet
MAX_CONSECUTIVE = 3
CONSECUTIVE_WINDOW = 60.0  # seconds
FORCED_QUIET_DURATION = 30.0  # seconds


@dataclass
class ReactionThrottle:
    """Controls reaction frequency to prevent AI spam during game spectating.

    Maintains timing state and enforces cooldowns between reactions.
    Supports urgency-based bypass for important game events.

    Args:
        preset: Frequency preset name (``"quiet"``, ``"normal"``, ``"hyped"``).

    Example:
        >>> throttle = ReactionThrottle(preset="normal")
        >>> throttle.should_react(urgency=0.3)  # False if within cooldown
        False
        >>> # ... 15 seconds later ...
        >>> throttle.should_react(urgency=0.3)  # True, cooldown elapsed
        True
    """

    preset: str = "normal"
    _last_reaction_time: float = field(default=0.0, init=False, repr=False)
    _last_urgent_time: float = field(default=0.0, init=False, repr=False)
    _recent_reaction_times: list[float] = field(default_factory=list, init=False, repr=False)
    _forced_quiet_until: float = field(default=0.0, init=False, repr=False)

    def set_preset(self, preset: str) -> None:
        """Change the frequency preset.

        Args:
            preset: One of ``"quiet"``, ``"normal"``, ``"hyped"``.

        Raises:
            ValueError: If preset name is not recognized.
        """
        if preset not in PRESETS:
            raise ValueError(f"Unknown preset '{preset}', expected one of {list(PRESETS.keys())}")
        self.preset = preset
        logger.info(f"[Throttle] Preset changed to '{preset}'")

    def should_react(self, urgency: float = 0.5) -> bool:
        """Determine whether a reaction should be emitted now.

        Checks cooldown timers, urgency bypass, and anti-spam limits.

        Args:
            urgency: Reaction urgency score (0.0–1.0).  Values above
                ``URGENCY_THRESHOLD`` (0.6) use a shorter cooldown.

        Returns:
            True if a reaction is allowed right now.
        """
        now = time.monotonic()

        # Forced quiet period from anti-spam
        if now < self._forced_quiet_until:
            return False

        normal_cd, urgent_cd = PRESETS.get(self.preset, PRESETS["normal"])

        if urgency >= URGENCY_THRESHOLD:
            # High urgency — use shorter cooldown
            if now - self._last_urgent_time < urgent_cd:
                return False
        else:
            # Normal urgency — use standard cooldown
            if now - self._last_reaction_time < normal_cd:
                return False

        return True

    def record_reaction(self) -> None:
        """Record that a reaction was emitted.  Updates cooldown timers
        and checks for anti-spam triggers.

        Call this immediately after emitting a reaction.
        """
        now = time.monotonic()
        self._last_reaction_time = now
        self._last_urgent_time = now

        # Track recent reactions for anti-spam
        self._recent_reaction_times.append(now)

        # Prune old entries outside the window
        cutoff = now - CONSECUTIVE_WINDOW
        self._recent_reaction_times = [
            t for t in self._recent_reaction_times if t > cutoff
        ]

        # Check anti-spam: too many consecutive reactions
        if len(self._recent_reaction_times) >= MAX_CONSECUTIVE:
            self._forced_quiet_until = now + FORCED_QUIET_DURATION
            self._recent_reaction_times.clear()
            logger.info("[Throttle] Anti-spam triggered — forced quiet for 30s")

    def reset(self) -> None:
        """Reset all timers.  Useful when starting a new spectator session."""
        self._last_reaction_time = 0.0
        self._last_urgent_time = 0.0
        self._recent_reaction_times.clear()
        self._forced_quiet_until = 0.0
