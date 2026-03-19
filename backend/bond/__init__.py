"""Bond Progression System — relationship depth tracking for AI companions.

This module implements the Bond Progression System, the primary long-term
retention mechanic for the platform.  Users build a relationship with each
character through conversation, gift-giving, and daily engagement.  Bond
levels (0–100) gate narrative story scenes and subtly shift character
behaviour (tone, callbacks, intimacy).

Inspired by mechanics in Blue Archive, Girls' Frontline 2, and Azur Lane.

Modules:
    progression: Core XP accumulation, level calculation, tier labelling,
                 and bond-story unlock gating.
    gifts:       Gift catalogue, gift-giving transactions, and gift history.

Example:
    >>> import sqlite3
    >>> from backend.bond.progression import get_bond_level
    >>> con = sqlite3.connect(":memory:")
    >>> # … (schema set up) …
    >>> cur = con.cursor()
    >>> info = get_bond_level(char_id=1, cur=cur)
    >>> info["tier"]
    'stranger'
"""
