"""Scene Bookmarks (F20) — private bookmark system for favorite moments.

Users can bookmark individual messages to create a personal gallery of
the relationship's best moments.  Bookmarks are stored as a flag on the
messages table (added via migration) with optional auto-categorization.

The bookmark categories are inferred from message content keywords.
Bookmarked messages can be retrieved with surrounding context (±2 messages)
for re-reading.

Example::

    >>> engine = BookmarkEngine()
    >>> engine.categorize_message("I love you so much *holds you tight*")
    'romantic'
    >>> engine.categorize_message("hahaha you're so funny!")
    'funny'
    >>> engine.categorize_message("That was incredible...")
    'intimate'
"""

from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Auto-category keywords — first match wins (checked in priority order).
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "emotional": [
        "crying", "tears", "vulnerable", "never told anyone",
        "scared", "afraid", "trust you", "mean everything",
    ],
    "intimate": [
        "incredible", "amazing", "breathless", "shiver",
        "closer", "skin", "warmth", "touch",
    ],
    "romantic": [
        "love you", "love", "heart", "forever",
        "beautiful", "gorgeous", "adore", "cherish",
    ],
    "funny": [
        "haha", "lol", "funny", "laugh", "giggle",
        "joke", "silly", "hilarious",
    ],
}

#: Number of surrounding messages to include for context.
CONTEXT_WINDOW: int = 2

#: Category priority order for classification.
_CATEGORY_ORDER: list[str] = ["emotional", "intimate", "romantic", "funny"]


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class BookmarkEngine:
    """Stateless engine for message bookmarking and categorization.

    Example::

        >>> engine = BookmarkEngine()
        >>> engine.get_context_window()
        2
        >>> engine.categorize_message("just a normal message")
        'general'
    """

    def get_context_window(self) -> int:
        """Return the number of surrounding messages to fetch for context.

        Returns:
            Context window size (default 2 messages before and after).

        Example::

            >>> BookmarkEngine().get_context_window()
            2
        """
        return CONTEXT_WINDOW

    def categorize_message(self, message_text: str) -> str:
        """Auto-categorize a message based on content keywords.

        Categories are checked in priority order: emotional → intimate →
        romantic → funny.  Falls back to ``"general"`` when no keywords
        match.

        Args:
            message_text: The message content to categorize.

        Returns:
            Category string: one of ``"emotional"``, ``"intimate"``,
            ``"romantic"``, ``"funny"``, or ``"general"``.

        Example::

            >>> engine = BookmarkEngine()
            >>> engine.categorize_message("I love you with all my heart")
            'romantic'
            >>> engine.categorize_message("That made me shiver")
            'intimate'
            >>> engine.categorize_message("hahaha that's so silly")
            'funny'
            >>> engine.categorize_message("hello")
            'general'
        """
        lowered = message_text.lower()
        for category in _CATEGORY_ORDER:
            keywords = CATEGORY_KEYWORDS[category]
            if any(kw in lowered for kw in keywords):
                return category
        return "general"

    def get_categories(self) -> list[str]:
        """Return all available bookmark categories.

        Returns:
            List of category strings including ``"general"``.

        Example::

            >>> engine = BookmarkEngine()
            >>> cats = engine.get_categories()
            >>> "romantic" in cats
            True
            >>> "general" in cats
            True
        """
        return _CATEGORY_ORDER + ["general"]

    def build_export_text(
        self, bookmarks: list[dict], char_name: str = ""
    ) -> str:
        """Format bookmarked messages for text export.

        Args:
            bookmarks: List of bookmark dicts with ``role``, ``content``,
                ``created_at``, and optionally ``category`` keys.
            char_name: Character name for labeling (optional).

        Returns:
            Formatted text string suitable for saving to a file.

        Example::

            >>> engine = BookmarkEngine()
            >>> text = engine.build_export_text([
            ...     {"role": "assistant", "content": "I love you", "created_at": "2026-03-30"},
            ... ], "Dae")
            >>> "Dae" in text or "I love you" in text
            True
        """
        header = f"Bookmarked Moments"
        if char_name:
            header += f" — {char_name}"
        header += "\n" + "=" * len(header) + "\n\n"

        lines: list[str] = [header]
        for bm in bookmarks:
            role = bm.get("role", "unknown")
            label = char_name if role == "assistant" and char_name else role.title()
            content = bm.get("content", "")
            date = bm.get("created_at", "")
            category = bm.get("category", "general")

            lines.append(f"[{date}] [{category}]")
            lines.append(f"{label}: {content}")
            lines.append("")

        return "\n".join(lines)
