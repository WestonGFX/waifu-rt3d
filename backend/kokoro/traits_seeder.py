"""Seed Tier C identity traits from character bibles.

The Tier C vector (``openness, warmth, dominance, mischief,
melancholy_tendency``) is "almost constant" — it should reflect the
character's underlying personality, not the moment-to-moment state.

A character bible is a markdown file referenced by ``characters.bible_path``;
``characters.bible_sections`` is a JSON list of section indices that the
context assembler injects when chatting.  This module reads the bible text
(if any) and produces a 5-axis vector via keyword counting on personality
descriptors.

Rules:

  * Missing bible → all-neutral defaults (0.5, with ``melancholy_tendency=0.3``).
  * Malformed bible (file missing on disk, bad encoding) → neutral defaults.
  * The seeder is idempotent and side-effect-free — callers persist the
    result via :func:`backend.kokoro.mind_state.save_traits`-style upsert.

We deliberately do not use the LLM for seeding — keyword counting is
deterministic, fast, and doesn't need credits.  Authors who want a
specific vector can hand-edit via the upcoming ``KokoroTraitsPanel`` UI.
"""
from __future__ import annotations

import logging
import re
import sqlite3
from dataclasses import replace
from pathlib import Path
from typing import Optional

from .mind_state import TraitVector, clamp01

logger = logging.getLogger(__name__)


# Keyword banks per dial.  Counts of matching words in the bible text shift
# the dial from neutral toward the indicated direction.  Weights are tuned
# small (±0.04 per match) so noisy descriptors don't wildly skew the vector;
# the final value is clamped to [0,1].
_TRAIT_KEYWORDS: dict[str, tuple[list[str], list[str]]] = {
    # (positive direction words, negative direction words)
    "openness": (
        ["curious", "open", "creative", "imaginative", "explore", "novel",
         "adventurous", "wonder", "experimental", "fascin"],
        ["routine", "tradition", "conventional", "guarded", "predictable",
         "closed"],
    ),
    "warmth": (
        ["warm", "kind", "tender", "gentle", "caring", "affection", "loving",
         "compassion", "nurtur", "soft-hearted", "soft hearted"],
        ["cold", "distant", "aloof", "harsh", "cynical", "abrasive",
         "standoffish"],
    ),
    "dominance": (
        ["confident", "assertive", "commanding", "leader", "decisive",
         "bold", "dominant", "controlling", "forward", "take charge"],
        ["submissive", "shy", "meek", "hesitant", "deferent", "timid",
         "passive"],
    ),
    "mischief": (
        ["playful", "mischievous", "teasing", "prankster", "tease", "sly",
         "trickster", "naughty", "cheeky", "impish"],
        ["serious", "solemn", "earnest", "stoic", "humorless", "grave"],
    ),
    "melancholy_tendency": (
        ["melancholy", "sad", "wistful", "lonely", "longing", "mournful",
         "regret", "sorrow", "introspective", "brooding", "pensive"],
        ["cheerful", "upbeat", "sunny", "optimistic", "bubbly", "bright",
         "joyful"],
    ),
}

# Per-match weight (positive shift; negative bank is mirrored).  Small so
# even bibles dense with descriptors stay within sane bounds.
_KEYWORD_WEIGHT = 0.04

# Neutral baselines.  Match the defaults in the v83 migration.
_BASELINES = {
    "openness": 0.50,
    "warmth": 0.50,
    "dominance": 0.50,
    "mischief": 0.50,
    "melancholy_tendency": 0.30,
}


def _count_keywords(text: str, words: list[str]) -> int:
    """Case-insensitive whole-word-ish keyword count.

    Uses substring matching rather than strict word boundaries because many
    descriptor stems are partial (``"nurtur"`` matches ``nurturing``,
    ``nurturer``, ``nurtured``).  False positives are dampened by the small
    per-match weight.
    """
    lower = text.lower()
    return sum(lower.count(w) for w in words)


def infer_traits_from_text(text: str, *, character_id: int) -> TraitVector:
    """Infer a Tier C vector from raw bible text.

    Args:
        text: Concatenated bible/persona text.  Empty/None → neutral.
        character_id: The character id (preserved in the result).

    Returns:
        A ``TraitVector`` with each dial nudged from baseline by net
        keyword evidence and clamped to ``[0, 1]``.

    Example:
        >>> v = infer_traits_from_text(
        ...     "She is warm and playful, a curious explorer.",
        ...     character_id=1,
        ... )
        >>> v.warmth > 0.5
        True
        >>> v.openness > 0.5
        True
    """
    result = TraitVector(character_id=character_id, **_BASELINES)
    if not text:
        return result
    updates: dict[str, float] = {}
    for dial, (pos_words, neg_words) in _TRAIT_KEYWORDS.items():
        pos_hits = _count_keywords(text, pos_words)
        neg_hits = _count_keywords(text, neg_words)
        if pos_hits == 0 and neg_hits == 0:
            continue
        net = (pos_hits - neg_hits) * _KEYWORD_WEIGHT
        updates[dial] = clamp01(_BASELINES[dial] + net)
    if updates:
        result = replace(result, **updates)
    return result


def _load_bible_text(
    con: sqlite3.Connection,
    character_id: int,
    *,
    storage_root: Optional[Path] = None,
) -> str:
    """Read the bible markdown for ``character_id``, returning '' on any error.

    The bible lives at ``backend/storage/bibles/<bible_path>`` per the
    convention established by the existing v37 migration.  Some bibles may
    have been moved or deleted; we never raise here.
    """
    try:
        row = con.execute(
            "SELECT bible_path, bible_sections, system_prompt FROM characters WHERE id = ?",
            (character_id,),
        ).fetchone()
    except sqlite3.Error:
        return ""
    if not row:
        return ""

    bible_path, _sections, system_prompt = row
    snippets: list[str] = []
    if system_prompt:
        snippets.append(str(system_prompt))

    if bible_path:
        root = storage_root or Path(__file__).resolve().parents[1] / "storage" / "bibles"
        candidate = root / str(bible_path)
        try:
            if candidate.exists() and candidate.is_file():
                snippets.append(candidate.read_text(encoding="utf-8", errors="ignore"))
        except OSError as e:
            logger.warning("traits_seeder: bible read failed for char %s: %s",
                           character_id, e)
    return "\n".join(snippets)


def seed_traits_for_character(
    con: sqlite3.Connection,
    character_id: int,
    *,
    storage_root: Optional[Path] = None,
) -> TraitVector:
    """End-to-end: read the bible, infer the vector, and upsert the row.

    Idempotent — calling this twice produces the same persisted row.

    Args:
        con: Open SQLite connection.
        character_id: Character whose traits to seed.
        storage_root: Optional override for ``backend/storage/bibles/``.
            Useful in tests.

    Returns:
        The persisted ``TraitVector``.
    """
    from .mind_state import _upsert  # type: ignore  # internal helper
    from dataclasses import asdict

    text = _load_bible_text(con, character_id, storage_root=storage_root)
    vec = infer_traits_from_text(text, character_id=character_id)
    payload = asdict(vec)
    payload.pop("updated_at", None)
    _upsert(con, "character_traits", "character_id", payload)
    return vec
