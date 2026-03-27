"""Scenario template system for persistent situational backdrops.

Provides pre-defined and user-created scene contexts that frame every
interaction with a character.  Unlike the one-time greeting, a scenario
persists across all messages in a session, grounding the roleplay in a
specific situation (e.g. "Late night studio", "Coffee shop on a rainy
afternoon").

Usage::

    from backend.scenario.templates import (
        get_templates,
        get_active_template,
        activate_template,
        build_scenario_prompt,
    )

    templates = get_templates(char_id=1, conn=conn)
    active = get_active_template(char_id=1, session_id=5, conn=conn)
    if active:
        prompt_block = build_scenario_prompt(active, char_name="Dae")
"""
