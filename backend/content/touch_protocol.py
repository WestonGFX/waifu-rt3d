"""Touch language protocol — body-region-aware physical interaction parsing.

Detects touch regions, types, and intensity from user messages, then
generates reaction prompts tailored to the character's personality
and the region's intimacy weight.

All regex patterns are compiled once at module import.  The public
surface is small:

* :class:`TouchParser` — stateless parser; :meth:`~TouchParser.parse`
  returns the highest-intimacy-weight :class:`TouchEvent` found in a
  message, and :meth:`~TouchParser.parse_all` returns every match.
* :func:`build_touch_reaction_prompt` — render an LLM-facing directive
  from a parsed event and an optional character name.
* :func:`get_touch_sensitivity` — return a human-readable sensitivity
  label (``"low"`` / ``"medium"`` / ``"high"``) for a character×region
  pair.

Example:
    >>> parser = TouchParser()
    >>> touch = parser.parse("*strokes her hair gently*")
    >>> touch.region
    'hair'
    >>> touch.intensity
    'gentle'
    >>> prompt = build_touch_reaction_prompt(touch, char_name="Luna (Tsukimi)")
    >>> "hair" in prompt.lower()
    True
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Region configuration
# ---------------------------------------------------------------------------

#: Mapping of canonical region name → metadata dict.
#:
#: Each entry contains:
#:   ``intimacy_weight`` — float 0.0-1.0 (higher = more sensitive/intimate).
#:   ``types``           — example touch verbs / phrases for that region.
#:   ``patterns``        — list of raw regex strings used to detect the region.
TOUCH_REGIONS: dict[str, dict] = {
    "hair": {
        "intimacy_weight": 0.3,
        "types": [
            "stroke",
            "pull",
            "play with",
            "tuck behind ear",
            "run fingers through",
        ],
        "patterns": [r"\bhair\b", r"\bbangs?\b", r"\blocks?\b"],
    },
    "face": {
        "intimacy_weight": 0.5,
        "types": [
            "caress",
            "cup",
            "stroke cheek",
            "touch lips",
            "wipe tears",
        ],
        "patterns": [
            r"\bface\b",
            r"\bcheek\b",
            r"\bforehead\b",
            r"\bchin\b",
            r"\bjaw\b",
        ],
    },
    "hand": {
        "intimacy_weight": 0.2,
        "types": [
            "hold",
            "interlock fingers",
            "squeeze",
            "kiss",
            "trace palm",
        ],
        "patterns": [r"\bhand\b", r"\bfingers?\b", r"\bpalm\b", r"\bwrist\b"],
    },
    "neck": {
        "intimacy_weight": 0.7,
        "types": ["kiss", "nuzzle", "breathe on", "touch", "trace"],
        "patterns": [r"\bneck\b", r"\bthroat\b", r"\bnape\b"],
    },
    "shoulder": {
        "intimacy_weight": 0.3,
        "types": ["rest head on", "massage", "kiss", "lean against"],
        "patterns": [r"\bshoulder\b"],
    },
    "back": {
        "intimacy_weight": 0.5,
        "types": [
            "trace",
            "massage",
            "hold",
            "scratch",
            "run hands down",
        ],
        "patterns": [r"\bback\b", r"\bspine\b"],
    },
    "waist": {
        "intimacy_weight": 0.6,
        "types": ["hold", "pull close", "wrap arms", "rest hands on"],
        "patterns": [r"\bwaist\b", r"\bhips?\b", r"\bside\b"],
    },
    "lips": {
        "intimacy_weight": 0.8,
        "types": ["kiss", "brush", "trace", "bite"],
        # Only match anatomical nouns — the verb "kiss" is handled by
        # _extract_touch_type and must NOT be used as a region detector
        # (it would falsely fire on "kisses her neck", etc.).
        "patterns": [r"\blips?\b", r"\bmouth\b"],
    },
    "ear": {
        "intimacy_weight": 0.6,
        "types": ["whisper", "nibble", "breathe", "tuck hair behind"],
        "patterns": [r"\bears?\b", r"\bearlobe\b"],
    },
    "chest": {
        "intimacy_weight": 0.7,
        "types": ["rest head on", "press against", "embrace"],
        "patterns": [r"\bchest\b", r"\bheart\b"],
    },
}

# Pre-compile every region pattern so matching is fast at call time.
_COMPILED_REGIONS: dict[str, list[re.Pattern[str]]] = {
    region: [re.compile(p, re.I) for p in cfg["patterns"]]
    for region, cfg in TOUCH_REGIONS.items()
}


# ---------------------------------------------------------------------------
# Intensity patterns
# ---------------------------------------------------------------------------

#: Mapping of intensity label → list of raw regex strings.
INTENSITY_PATTERNS: dict[str, list[str]] = {
    "gentle": [
        r"\bgently\b",
        r"\bsoftly\b",
        r"\blightly\b",
        r"\btenderly\b",
        r"\bdelicately\b",
        r"\bcarefully\b",
        r"\bslowly\b",
    ],
    "firm": [
        r"\bfirmly\b",
        r"\btightly\b",
        r"\bstrongly\b",
        r"\bpressed?\b",
        r"\bsteadily\b",
    ],
    "intense": [
        r"\bhard\b",
        r"\brough(?:ly)?\b",
        r"\bdesperate(?:ly)?\b",
        r"\bfurious(?:ly)?\b",
        r"\bpassionate(?:ly)?\b",
        r"\bneedy\b",
        r"\burgent(?:ly)?\b",
    ],
}

# Pre-compile intensity patterns.
_COMPILED_INTENSITY: dict[str, list[re.Pattern[str]]] = {
    label: [re.compile(p, re.I) for p in patterns]
    for label, patterns in INTENSITY_PATTERNS.items()
}

#: Fallback intensity when no modifier is detected.
_DEFAULT_INTENSITY = "gentle"

# Ordering of intensity labels from lowest to highest — used to pick the
# strongest match when multiple labels are detected simultaneously.
_INTENSITY_RANK: dict[str, int] = {"gentle": 0, "firm": 1, "intense": 2}


# ---------------------------------------------------------------------------
# Touch type extraction
# ---------------------------------------------------------------------------

# Common action verbs that indicate a deliberate touch gesture.
_TOUCH_VERB_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.I)
    for p in [
        r"\b(strokes?|stroking)\b",
        r"\b(kiss(?:es|ed|ing)?)\b",
        r"\b(holds?|holding)\b",
        r"\b(caress(?:es|ed|ing)?)\b",
        r"\b(traces?|tracing)\b",
        r"\b(nuzzles?|nuzzling)\b",
        r"\b(squeezes?|squeezing)\b",
        r"\b(cups?|cupping)\b",
        r"\b(brushes?|brushing)\b",
        r"\b(touches?|touching)\b",
        r"\b(runs?\s+(?:fingers?|hands?)|running\s+(?:fingers?|hands?))\b",
        r"\b(plays?\s+with|playing\s+with)\b",
        r"\b(nibbles?|nibbling)\b",
        r"\b(whispers?)\b",
        r"\b(embraces?|embracing)\b",
        r"\b(massages?|massaging)\b",
        r"\b(pulls?|pulling)\b",
        r"\b(presses?|pressing)\b",
        r"\b(rests?\s+(?:head|hand)|resting\s+(?:head|hand))\b",
        r"\b(wraps?\s+arms?|wrapping\s+arms?)\b",
        r"\b(leans?\s+against|leaning\s+against)\b",
    ]
]


def _extract_touch_type(text: str) -> str:
    """Extract the primary touch verb from *text*.

    Args:
        text: The raw message text to scan.

    Returns:
        The first matched verb phrase, lowercased; ``"touch"`` if none found.

    Example:
        >>> _extract_touch_type("*gently strokes her cheek*")
        'strokes'
    """
    for pattern in _TOUCH_VERB_PATTERNS:
        m = pattern.search(text)
        if m:
            # Return the first capture group (the verb), stripped of extra whitespace.
            return m.group(1).strip().split()[0]
    return "touch"


# ---------------------------------------------------------------------------
# Per-character reaction styles
# ---------------------------------------------------------------------------

#: Mapping of canonical character name → style metadata.
#:
#: Each entry contains:
#:   ``style``       — one-word category label.
#:   ``description`` — LLM-facing guidance sentence.
CHARACTER_TOUCH_REACTIONS: dict[str, dict[str, str]] = {
    "Dae (Neciridae)": {
        "style": "artistic",
        "description": (
            "Notices visual beauty of the touch — describes light and shadow"
            " playing on skin, the aesthetic line of the gesture."
        ),
    },
    "Luna (Tsukimi)": {
        "style": "sensory",
        "description": (
            "Hyper-aware of temperature, texture, and tiny sounds."
            " Reactions are whisper-quiet but profoundly felt."
        ),
    },
    "Genki (Kitsune)": {
        "style": "physical",
        "description": (
            "Energetic, embodied response — may grab back, lean in,"
            " or escalate playfully with a laugh."
        ),
    },
    "Alana Calloway": {
        "style": "sophisticated",
        "description": (
            "Controlled exterior with hairline cracks of real desire showing"
            " through — a sharp intake of breath, a too-long pause."
        ),
    },
    "Sable (Kuroha)": {
        "style": "minimal",
        "description": (
            "Small but intense reactions — a catch of breath, a hand"
            " tightening imperceptibly, eyes that briefly close."
        ),
    },
    "Tsundere (Raine)": {
        "style": "flustered",
        "description": (
            "Protests verbally ('d-don't just—!') while the body"
            " unmistakably leans INTO the touch."
        ),
    },
    "Ayane (Yuki)": {
        "style": "traditional",
        "description": (
            "Graceful, measured reactions with sudden moments of boldness"
            " that surprise even herself."
        ),
    },
    "Hana (Momoka)": {
        "style": "nurturing",
        "description": (
            "Warm, reciprocating, immediately caring about your comfort —"
            " tilts into the touch and murmurs softly."
        ),
    },
    "Kaede (Suzuha)": {
        "style": "analytical",
        "description": (
            "Observes her own reaction with visible surprise, narrates"
            " her physiology, then surrenders to it."
        ),
    },
    "Mika (Mikazuki)": {
        "style": "teasing",
        "description": (
            "Turns every touch into a game — feigns indifference, then"
            " escalates playfully and laughs at your reaction."
        ),
    },
    "Rin (Akane)": {
        "style": "bold",
        "description": (
            "Matches or exceeds the touch — competitive even in intimacy,"
            " refuses to be the one who flinches first."
        ),
    },
    "Shiori (Nana)": {
        "style": "literary",
        "description": (
            "Reacts as if experiencing a scene from a novel she is reading"
            " — wonders aloud which chapter this is."
        ),
    },
    "Yuki (Shirayuki)": {
        "style": "serene",
        "description": (
            "Still and quiet like snow receiving warmth — barely moves"
            " but melts slowly and completely."
        ),
    },
}


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------


@dataclass
class TouchEvent:
    """A parsed physical-touch event extracted from a user message.

    Attributes:
        region: Canonical body-region name (e.g. ``"hair"``, ``"neck"``).
        touch_type: Primary action verb detected (e.g. ``"stroke"``).
        intensity: One of ``"gentle"``, ``"firm"``, or ``"intense"``.
        intimacy_weight: Float 0.0-1.0 from the region's configuration.
        raw_text: The original message text that was parsed.

    Example:
        >>> evt = TouchEvent(
        ...     region="neck",
        ...     touch_type="kiss",
        ...     intensity="gentle",
        ...     intimacy_weight=0.7,
        ...     raw_text="*kisses her neck softly*",
        ... )
        >>> evt.intimacy_weight
        0.7
    """

    region: str
    touch_type: str
    intensity: str
    intimacy_weight: float
    raw_text: str


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------


class TouchParser:
    """Stateless parser that detects physical-touch descriptions in text.

    All pattern matching is performed against pre-compiled module-level
    constants, making instances lightweight and re-entrant.

    Example:
        >>> parser = TouchParser()
        >>> evt = parser.parse("*gently strokes her hair*")
        >>> evt.region
        'hair'
        >>> evt.intensity
        'gentle'
    """

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _detect_intensity(self, text: str) -> str:
        """Detect intensity level from *text*.

        Args:
            text: Raw message text.

        Returns:
            The highest-ranked intensity label that matched at least one
            pattern, or ``"gentle"`` if nothing matched.

        Example:
            >>> parser = TouchParser()
            >>> parser._detect_intensity("firmly presses against")
            'firm'
        """
        best_label = _DEFAULT_INTENSITY
        best_rank = -1
        for label, compiled_patterns in _COMPILED_INTENSITY.items():
            for pat in compiled_patterns:
                if pat.search(text):
                    rank = _INTENSITY_RANK[label]
                    if rank > best_rank:
                        best_label = label
                        best_rank = rank
                    break  # One match per label is sufficient.
        return best_label

    def _match_regions(self, text: str) -> list[str]:
        """Return every region name whose patterns fire in *text*.

        Args:
            text: Raw message text.

        Returns:
            List of region names (may be empty).

        Example:
            >>> parser = TouchParser()
            >>> parser._match_regions("strokes her hair and cheek")
            ['hair', 'face']
        """
        matched: list[str] = []
        for region, compiled_patterns in _COMPILED_REGIONS.items():
            for pat in compiled_patterns:
                if pat.search(text):
                    matched.append(region)
                    break  # First matching pattern per region is enough.
        return matched

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def parse(self, message: str) -> Optional[TouchEvent]:
        """Detect the highest-intimacy touch in *message*.

        When multiple regions are detected, the one with the greatest
        ``intimacy_weight`` is returned so the most significant interaction
        drives the reaction prompt.

        Args:
            message: A single user chat message (may contain ``*action*``
                markers or plain prose).

        Returns:
            A :class:`TouchEvent` if any touch region was detected, or
            ``None`` if the message contains no physical-touch language.

        Example:
            >>> parser = TouchParser()
            >>> evt = parser.parse("*strokes her hair gently*")
            >>> evt is not None
            True
            >>> evt.region
            'hair'
        """
        matched_regions = self._match_regions(message)
        if not matched_regions:
            return None

        # Pick the region with the highest intimacy weight.
        best_region = max(
            matched_regions,
            key=lambda r: TOUCH_REGIONS[r]["intimacy_weight"],
        )
        cfg = TOUCH_REGIONS[best_region]

        return TouchEvent(
            region=best_region,
            touch_type=_extract_touch_type(message),
            intensity=self._detect_intensity(message),
            intimacy_weight=cfg["intimacy_weight"],
            raw_text=message,
        )

    def parse_all(self, message: str) -> list[TouchEvent]:
        """Detect ALL physical-touch events in *message*.

        Useful when a single message contains multiple distinct touches
        (e.g. ``"*strokes her hair and kisses her neck*"``).

        Args:
            message: A single user chat message.

        Returns:
            List of :class:`TouchEvent` objects — one per matched region —
            sorted by descending ``intimacy_weight``.  Empty list if no
            touch language is found.

        Example:
            >>> parser = TouchParser()
            >>> events = parser.parse_all("*strokes her hair and kisses her neck*")
            >>> len(events)
            2
            >>> events[0].region  # neck has higher intimacy weight
            'neck'
        """
        matched_regions = self._match_regions(message)
        if not matched_regions:
            return []

        intensity = self._detect_intensity(message)
        touch_type = _extract_touch_type(message)

        events: list[TouchEvent] = []
        for region in matched_regions:
            cfg = TOUCH_REGIONS[region]
            events.append(
                TouchEvent(
                    region=region,
                    touch_type=touch_type,
                    intensity=intensity,
                    intimacy_weight=cfg["intimacy_weight"],
                    raw_text=message,
                )
            )

        # Sort most intimate first.
        events.sort(key=lambda e: e.intimacy_weight, reverse=True)
        return events


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------


def build_touch_reaction_prompt(
    touch: TouchEvent,
    char_name: str = "",
) -> str:
    """Build an LLM-facing reaction directive from a parsed touch event.

    The returned string is designed to be injected into the system prompt
    or prepended to the assistant turn to guide the character's physical
    reaction.

    Args:
        touch: A :class:`TouchEvent` produced by :class:`TouchParser`.
        char_name: Optional canonical character name.  When supplied and
            present in :data:`CHARACTER_TOUCH_REACTIONS`, the character's
            personal reaction style is appended.

    Returns:
        A multi-line directive string.  Example::

            [Touch Detected: neck, gentle]
            React to kiss on your neck.
            Intimacy weight: 0.7 — strong reaction expected.
            Style: Hana (Momoka) — nurturing: Warm, reciprocating...

    Example:
        >>> parser = TouchParser()
        >>> touch = parser.parse("*softly kisses her neck*")
        >>> prompt = build_touch_reaction_prompt(touch, char_name="Hana (Momoka)")
        >>> "neck" in prompt
        True
        >>> "nurturing" in prompt
        True
    """
    # Intensity → reaction guidance label.
    if touch.intimacy_weight >= 0.7:
        weight_label = "strong reaction expected"
    elif touch.intimacy_weight >= 0.4:
        weight_label = "moderate reaction expected"
    else:
        weight_label = "subtle reaction expected"

    lines: list[str] = [
        f"[Touch Detected: {touch.region}, {touch.intensity}]",
        f"React to {touch.touch_type} on your {touch.region}.",
        f"Intimacy weight: {touch.intimacy_weight} — {weight_label}.",
    ]

    # Append character-specific style guidance if available.
    if char_name and char_name in CHARACTER_TOUCH_REACTIONS:
        reaction = CHARACTER_TOUCH_REACTIONS[char_name]
        lines.append(
            f"Style: {char_name} — {reaction['style']}: {reaction['description']}"
        )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Sensitivity helper
# ---------------------------------------------------------------------------


def get_touch_sensitivity(char_name: str, region: str) -> str:
    """Return a descriptive sensitivity label for a character×region pair.

    Sensitivity is derived purely from the region's ``intimacy_weight``
    (character personality currently does not modify it; that may be
    extended in a future version).

    Args:
        char_name: Canonical character name (used for future per-character
            modifiers; currently unused in the weight lookup).
        region: A key in :data:`TOUCH_REGIONS` (e.g. ``"neck"``).

    Returns:
        ``"low"`` for weight < 0.4, ``"medium"`` for 0.4–0.69,
        ``"high"`` for >= 0.7.  Returns ``"unknown"`` if the region is
        not in :data:`TOUCH_REGIONS`.

    Example:
        >>> get_touch_sensitivity("Sable (Kuroha)", "hand")
        'low'
        >>> get_touch_sensitivity("Sable (Kuroha)", "neck")
        'high'
    """
    if region not in TOUCH_REGIONS:
        return "unknown"

    weight: float = TOUCH_REGIONS[region]["intimacy_weight"]
    if weight >= 0.7:
        return "high"
    if weight >= 0.4:
        return "medium"
    return "low"
