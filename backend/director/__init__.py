"""Director mode package — structured scene control for AI companion sessions.

Provides pacing directives, involvement tags, style switching, and scene
transitions that are injected into the LLM context as a formatted director
block.  All state is serialised as JSON and persisted in the ``sessions``
table so it survives across turns.

Typical usage::

    from backend.director.structured import (
        DirectorState,
        parse_director_command,
        apply_command,
        build_director_prompt_block,
        advance_pacing,
        load_director_state,
        save_director_state,
    )
"""

from backend.director.structured import (
    DirectorCommand,
    DirectorState,
    advance_pacing,
    apply_command,
    build_director_prompt_block,
    load_director_state,
    parse_director_command,
    save_director_state,
)

__all__ = [
    "DirectorCommand",
    "DirectorState",
    "advance_pacing",
    "apply_command",
    "build_director_prompt_block",
    "load_director_state",
    "parse_director_command",
    "save_director_state",
]
