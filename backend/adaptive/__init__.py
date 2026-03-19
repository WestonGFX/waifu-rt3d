"""Adaptive Intelligence Engine for waifu-rt3d.

Analyzes conversation history to learn user preferences and auto-tunes
character behavior via system prompt injection.  All processing runs
locally using the user's configured LLM — no data leaves the machine.

Sub-modules:
    reflector: Periodic conversation analysis and user_profiles DB updates.
    tuner: Converts learned profiles into system prompt instructions.
"""
