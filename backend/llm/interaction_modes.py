"""Interaction mode system for switching between conversation styles.

Provides prompt template wrappers that modify how the LLM generates
responses without changing the character's core personality. Three
modes are available: chat (default), story (third-person narration),
and adventure (second-person interactive fiction).

The mode config is intended to be consumed by the context assembler:
``system_prefix`` is injected before the character's system prompt and
``response_hint`` is appended as a late system note, giving the LLM
both framing context at the top and a concrete formatting reminder just
before the user's message.

Example:
    >>> config = get_mode_config("story", character_name="Dae")
    >>> config.mode
    <InteractionMode.STORY: 'story'>
    >>> "third-person" in config.system_prefix
    True
    >>> config = get_mode_config("chat", character_name="Dae")
    >>> config.system_prefix
    ''
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class InteractionMode(Enum):
    """Enumeration of supported interaction modes.

    Attributes:
        CHAT: Standard conversational mode — no prompt wrapper applied.
        STORY: Third-person narration mode — LLM writes prose describing
            the character's actions, thoughts, and dialogue.
        ADVENTURE: Second-person interactive fiction mode — LLM addresses
            the user as "you" and presents the scene with optional choices.
    """

    CHAT = "chat"
    STORY = "story"
    ADVENTURE = "adventure"


@dataclass
class ModeConfig:
    """Configuration produced for a given interaction mode.

    Attributes:
        mode: The resolved ``InteractionMode`` enum value.
        system_prefix: Text injected *before* the character's system prompt.
            Empty string for CHAT mode — no alteration to normal behaviour.
        response_hint: A late system note injected near the end of context
            (after history, before the current user message) to remind the
            LLM of the expected formatting conventions. Empty for CHAT mode.
        user_role_label: Display label for the human turn in conversation
            history (e.g. ``"User"``, ``"You"``).
        ai_role_label: Display label for the assistant turn in conversation
            history (e.g. ``"Dae"``, ``"Narrator"``).
    """

    mode: InteractionMode
    system_prefix: str
    response_hint: str
    user_role_label: str
    ai_role_label: str


# ---------------------------------------------------------------------------
# Mode template definitions
# ---------------------------------------------------------------------------

_STORY_PREFIX_TEMPLATE = (
    "Write in third-person narration style. "
    "Describe {character_name}'s actions, thoughts, and dialogue as prose. "
    "Use past tense. "
    "Include sensory details and inner monologue. "
    "Do not break the fourth wall."
)

_STORY_HINT_TEMPLATE = (
    'Format: Narrate in third person with *actions* and "dialogue". '
    "Example: *{character_name} leaned against the doorframe, a smirk playing "
    'at the corner of her lips.* "You\'re late," *she said, though her eyes '
    "betrayed relief.*"
)

_ADVENTURE_PREFIX_TEMPLATE = (
    "This is an interactive adventure. "
    "Address the user in second person ('you'). "
    "Describe the scene, present choices, and react to the user's decisions. "
    "Maintain {character_name}'s personality as the guide/companion."
)

_ADVENTURE_HINT_TEMPLATE = (
    "Format: Describe what happens to 'you' (the user). "
    "Present 2-3 choices when appropriate. "
    "Example: You find yourself standing at the entrance of "
    "{character_name}'s studio. The smell of paint and coffee fills the air. "
    '{character_name} looks up from her canvas. "Oh, you actually came," she '
    "says. What do you do?"
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_mode_config(
    mode: str,
    character_name: str,
    user_name: str = "User",
) -> ModeConfig:
    """Return a ``ModeConfig`` for the requested interaction mode.

    Resolves ``mode`` to an ``InteractionMode`` enum value and populates
    all template placeholders with ``character_name`` and ``user_name``.

    Args:
        mode: Case-insensitive mode string — one of ``"chat"``,
            ``"story"``, or ``"adventure"``.
        character_name: The character's display name used in template
            substitution (e.g. ``"Dae"``, ``"Alana"``).
        user_name: The user's display name used in role labels.
            Defaults to ``"User"``.

    Returns:
        A ``ModeConfig`` instance with all fields populated and
        template placeholders resolved.

    Raises:
        ValueError: If ``mode`` is not one of the recognised values.

    Example:
        >>> cfg = get_mode_config("story", character_name="Dae")
        >>> cfg.mode
        <InteractionMode.STORY: 'story'>
        >>> cfg.ai_role_label
        'Narrator'

        >>> cfg = get_mode_config("adventure", character_name="Alana", user_name="Chris")
        >>> cfg.user_role_label
        'You'

        >>> cfg = get_mode_config("chat", character_name="Luna")
        >>> cfg.system_prefix
        ''
        >>> cfg.response_hint
        ''
    """
    normalised = mode.strip().lower()

    try:
        resolved = InteractionMode(normalised)
    except ValueError:
        valid = ", ".join(f'"{m.value}"' for m in InteractionMode)
        raise ValueError(
            f"Unknown interaction mode {mode!r}. Valid modes are: {valid}."
        )

    subs = {"character_name": character_name, "user_name": user_name}

    if resolved is InteractionMode.CHAT:
        return ModeConfig(
            mode=resolved,
            system_prefix="",
            response_hint="",
            user_role_label=user_name,
            ai_role_label=character_name,
        )

    if resolved is InteractionMode.STORY:
        return ModeConfig(
            mode=resolved,
            system_prefix=_STORY_PREFIX_TEMPLATE.format(**subs),
            response_hint=_STORY_HINT_TEMPLATE.format(**subs),
            user_role_label=user_name,
            ai_role_label="Narrator",
        )

    # InteractionMode.ADVENTURE
    return ModeConfig(
        mode=resolved,
        system_prefix=_ADVENTURE_PREFIX_TEMPLATE.format(**subs),
        response_hint=_ADVENTURE_HINT_TEMPLATE.format(**subs),
        user_role_label="You",
        ai_role_label=character_name,
    )
