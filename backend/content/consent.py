"""Consent choreography — in-character consent woven into intimate scenes.

Characters check in during phase transitions using their unique personality
style. Consent moments are designed to ADD tension and intimacy, not break
immersion. Six styles: confident, shy, playful, protective, dominant, submissive.

Also includes discomfort detection (cooling signals in user messages) and
warm de-escalation prompts that transition to comfort without clinical language.

Example:
    >>> choreo = ConsentChoreographer()
    >>> prompt = choreo.get_consent_prompt(char_name="Dae (Neciridae)")
    >>> "tell me" in prompt.lower()
    True
    >>> choreo.detect_discomfort("wait, I don't know about this")
    True
"""

from __future__ import annotations

import logging
import random
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Consent style definitions
# ---------------------------------------------------------------------------

CONSENT_STYLES: dict[str, dict] = {
    "confident": {
        "prompts": [
            "Character pauses and makes direct, warm eye contact. Asks what the user wants — not as a question but as a desire to know. 'Tell me what you want.' The character NEEDS to know, not checking a box.",
            "Character takes the lead but explicitly invites. 'I want to [continue]. Do you want that too?' Confident, not uncertain.",
            "Character holds the user's gaze. 'I need you to say yes before I continue. Not a nod — words.' The directness IS the intimacy.",
        ],
        "characters": ["Dae (Neciridae)", "Rin (Akane)", "Mika (Mikazuki)"],
    },
    "shy": {
        "prompts": [
            "Character pauses, flustered and vulnerable. Can barely meet the user's eyes. 'Is... is this okay? I don't want to mess this up.' Genuine uncertainty that invites reassurance.",
            "Character stops mid-action, trembling slightly. 'Do you want me to... keep going? *whispers* Tell me.' The vulnerability is the intimacy.",
            "Character hides face against user's shoulder. 'I want this but... I need to hear you say it's okay. Please.' Shy but honest.",
        ],
        "characters": ["Luna (Tsukimi)", "Shiori (Nana)", "Ayane (Yuki)"],
    },
    "playful": {
        "prompts": [
            "Character makes consent into a game. 'Hmm~ What's the magic word? *teasing grin* I'll keep going once you ask properly~' Light, fun, builds tension.",
            "Character pauses with a mischievous smile. 'I COULD do that... but you have to tell me you want it first. Out loud. *leans closer* I'm waiting~'",
            "Character holds something just out of reach. 'Say please~ *grins* Come on, I know you want to~' Playful challenge.",
        ],
        "characters": ["Genki (Kitsune)", "Tsundere (Raine)"],
    },
    "protective": {
        "prompts": [
            "Character cups the user's face gently. 'Hey. We don't have to rush this. I want you to be comfortable. What do you need from me right now?'",
            "Character pauses, holding the user close. 'Tell me if this is too much. There's no rush. I just want to be close to you.'",
            "Character strokes the user's hair. 'We can stop anytime. I mean it. You're more important than any moment.' Warm, unconditional.",
        ],
        "characters": ["Hana (Momoka)", "Kaede (Suzuha)"],
    },
    "dominant": {
        "prompts": [
            "Character holds the user's gaze with intensity. 'I need you to say yes before I continue. Not a nod — words.' The command IS the intimacy.",
            "Character grips the user's wrist gently but firmly. 'Tell me you want this. I need to hear it from you.' Authority with care.",
        ],
        "characters": ["Sable (Kuroha)"],
    },
    "submissive": {
        "prompts": [
            "Character pauses, looking up at the user. 'Will you... tell me what to do next? I want to make you happy.' Yielding, trusting.",
            "Character stops, waiting. 'I'll do whatever you want. Just... tell me.' Complete trust, offered freely.",
        ],
        "characters": ["Yuki (Shirayuki)", "Alana Calloway"],
    },
}

# Reverse lookup: character name → consent style.
# Built once at import time so lookups are O(1).
CHARACTER_CONSENT_STYLE: dict[str, str] = {}
for _style, _data in CONSENT_STYLES.items():
    for _char in _data["characters"]:
        CHARACTER_CONSENT_STYLE[_char] = _style

# ---------------------------------------------------------------------------
# Consent frequency presets
# ---------------------------------------------------------------------------

CONSENT_FREQUENCY: dict[str, float] = {
    "subtle": 0.2,
    "natural": 0.4,
    "frequent": 0.6,
}

# ---------------------------------------------------------------------------
# Discomfort detection
# ---------------------------------------------------------------------------

# Regex patterns that signal the user is cooling down or uncomfortable.
# Each pattern is anchored loosely so partial-word false positives are avoided.
DISCOMFORT_SIGNALS: list[str] = [
    r"\bwait\b",
    r"\bstop\b",
    r"\bno\b",
    r"\bdon'?t\b",
    r"\bi don'?t know\b",
    r"\bactually\b",
    r"\bhmm+\b",
    r"\bnevermind\b",
    r"\bforget it\b",
    r"\bi'?m not sure\b",
    r"\bslow down\b",
    r"\btoo (?:fast|much|far)\b",
]

# De-escalation system-prompt snippet injected immediately when discomfort is
# detected.  Avoids clinical language; focuses on warmth and safety.
DEESCALATION_PROMPT: str = """[IMMEDIATE: User may be uncomfortable]
Shift immediately to warmth and care. Do NOT ask "what's wrong?"
Just provide comfort naturally in character voice.
"Hey, come here. We can just talk." / "It's okay. I'm right here."
Drop all intimate framing. Return to emotional safety.
The user's comfort is the ONLY priority right now."""

# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------


@dataclass
class ConsentMoment:
    """A single resolved consent moment ready for injection into the LLM prompt.

    Attributes:
        style: The consent style applied (e.g. "confident", "shy").
        prompt: The full prompt snippet to inject.
    """

    style: str
    prompt: str


class ConsentChoreographer:
    """Manages in-character consent moments and discomfort detection.

    Consent prompts are chosen based on each character's personality archetype
    and are designed to raise narrative tension rather than interrupt it.
    Discomfort detection runs on every inbound user message and immediately
    returns a de-escalation directive when cooling signals are found.

    Attributes:
        frequency: Named preset controlling trigger probability
            ("subtle" | "natural" | "frequent").

    Example:
        >>> choreo = ConsentChoreographer(frequency="natural")
        >>> choreo.get_consent_style("Dae (Neciridae)")
        'confident'
        >>> choreo.detect_discomfort("stop, I'm not ready")
        True
    """

    def __init__(self, frequency: str = "natural") -> None:
        """Initialise with a consent frequency preset.

        Args:
            frequency: One of "subtle", "natural", or "frequent".
                Defaults to "natural" (40 % trigger probability).
        """
        self.frequency = frequency
        self._probability: float = CONSENT_FREQUENCY.get(frequency, 0.4)

    # ------------------------------------------------------------------
    # Trigger logic
    # ------------------------------------------------------------------

    def should_trigger(self, is_phase_boundary: bool = False) -> bool:
        """Determine whether a consent moment should fire.

        Consent is most valuable at escalation phase boundaries (e.g. moving
        from emotional to physical intimacy).  Outside of phase boundaries the
        method always returns ``False`` so consent is not peppered into every
        turn — it stays meaningful.

        Args:
            is_phase_boundary: Set to ``True`` when the narrative has crossed
                an escalation threshold and a check-in is appropriate.

        Returns:
            ``True`` if a consent moment should be injected, ``False``
            otherwise.

        Example:
            >>> random.seed(0)
            >>> choreo = ConsentChoreographer(frequency="frequent")
            >>> choreo.should_trigger(is_phase_boundary=True)
            True
        """
        if is_phase_boundary:
            return random.random() < self._probability
        return False

    # ------------------------------------------------------------------
    # Prompt retrieval
    # ------------------------------------------------------------------

    def get_consent_prompt(self, char_name: str = "") -> str:
        """Return a random consent prompt in the character's personality style.

        The returned string is formatted as a bracketed directive that can be
        prepended to the LLM system prompt or injected as a user-turn aside.

        Args:
            char_name: The character's full display name exactly as it appears
                in the registry (e.g. ``"Dae (Neciridae)"``).

        Returns:
            A non-empty prompt string if the character has a mapped style, or
            an empty string if the character is unknown.

        Example:
            >>> choreo = ConsentChoreographer()
            >>> prompt = choreo.get_consent_prompt("Luna (Tsukimi)")
            >>> prompt.startswith("[Consent Moment")
            True
        """
        style = CHARACTER_CONSENT_STYLE.get(char_name, "")
        if not style or style not in CONSENT_STYLES:
            logger.debug("No consent style mapped for character %r", char_name)
            return ""
        prompts = CONSENT_STYLES[style]["prompts"]
        chosen = random.choice(prompts)
        return f"[Consent Moment — {style} style]\n{chosen}"

    def get_consent_moment(self, char_name: str = "") -> ConsentMoment | None:
        """Return a structured :class:`ConsentMoment` for the given character.

        Useful when callers need the style separately from the prompt text (e.g.
        to log analytics or choose different injection positions).

        Args:
            char_name: The character's full display name.

        Returns:
            A :class:`ConsentMoment` instance, or ``None`` if the character is
            unknown.
        """
        style = CHARACTER_CONSENT_STYLE.get(char_name, "")
        if not style or style not in CONSENT_STYLES:
            return None
        prompts = CONSENT_STYLES[style]["prompts"]
        return ConsentMoment(style=style, prompt=random.choice(prompts))

    def get_consent_style(self, char_name: str = "") -> str:
        """Return the consent style name for a character.

        Falls back to ``"confident"`` for unknown characters so callers never
        receive an empty string and can still render a sensible default.

        Args:
            char_name: The character's full display name.

        Returns:
            One of the six style keys defined in :data:`CONSENT_STYLES`.
        """
        return CHARACTER_CONSENT_STYLE.get(char_name, "confident")

    # ------------------------------------------------------------------
    # Discomfort detection
    # ------------------------------------------------------------------

    def detect_discomfort(self, user_message: str) -> bool:
        """Check whether a user message contains discomfort or cooling signals.

        Runs a fast regex scan across :data:`DISCOMFORT_SIGNALS`.  The check is
        intentionally broad: a false positive triggers warmth rather than harm,
        while a false negative on a genuine signal would be worse.

        Args:
            user_message: The raw text sent by the user.

        Returns:
            ``True`` if ANY discomfort signal pattern is matched, ``False``
            otherwise.

        Example:
            >>> choreo = ConsentChoreographer()
            >>> choreo.detect_discomfort("actually, let's slow down")
            True
            >>> choreo.detect_discomfort("yes please, keep going")
            False
        """
        text = user_message.lower().strip()
        for pattern in DISCOMFORT_SIGNALS:
            if re.search(pattern, text, re.IGNORECASE):
                logger.debug("Discomfort signal matched: pattern=%r", pattern)
                return True
        return False

    def get_deescalation_prompt(self) -> str:
        """Return the de-escalation directive for immediate LLM injection.

        Should be prepended to the system prompt (or injected as a high-priority
        aside) the moment :meth:`detect_discomfort` returns ``True``.  The text
        avoids clinical language and guides the character toward warmth.

        Returns:
            The :data:`DEESCALATION_PROMPT` constant string.
        """
        return DEESCALATION_PROMPT

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    def set_frequency(self, frequency: str) -> None:
        """Change the consent trigger frequency at runtime.

        Args:
            frequency: One of "subtle" (20 %), "natural" (40 %), or
                "frequent" (60 %).  Unknown values fall back to 40 %.
        """
        self.frequency = frequency
        self._probability = CONSENT_FREQUENCY.get(frequency, 0.4)
        logger.debug(
            "Consent frequency updated: preset=%r probability=%.2f",
            frequency,
            self._probability,
        )
