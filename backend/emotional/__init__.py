"""Emotional subsystem for the waifu-rt3d companion platform.

Modules:
    dreams: Character dream sequence generator — generates surreal,
        memory-woven dream narratives delivered between sessions.

Public API (re-exported for convenience)::

    from backend.emotional import (
        should_generate_dream,
        build_dream_prompt,
        generate_dream,
        get_undelivered_dreams,
        mark_dream_delivered,
        get_dream_history,
        DreamEntry,
        DREAM_MOODS,
        FALLBACK_DREAMS,
    )
"""

from backend.emotional.dreams import (
    DREAM_MOODS,
    FALLBACK_DREAMS,
    DreamEntry,
    build_dream_prompt,
    generate_dream,
    get_dream_history,
    get_undelivered_dreams,
    mark_dream_delivered,
    should_generate_dream,
)

__all__ = [
    "DreamEntry",
    "DREAM_MOODS",
    "FALLBACK_DREAMS",
    "should_generate_dream",
    "build_dream_prompt",
    "generate_dream",
    "get_undelivered_dreams",
    "mark_dream_delivered",
    "get_dream_history",
]
