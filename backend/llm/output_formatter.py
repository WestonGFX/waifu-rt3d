"""User-defined regex output formatting rules.

Applies per-character regex pattern/replacement pairs to LLM output
before it's displayed. Common uses:
- Strip ``*narrator voice*`` action text
- Remove OOC markers like ``(OOC: ...)``
- Clean up double asterisks or unwanted formatting

Rules are stored in the ``output_format_rules`` table (schema v48)
and applied in priority order (lower priority = applied first).
"""

import re
import logging

logger = logging.getLogger(__name__)


def apply_format_rules(text: str, rules: list[dict]) -> str:
    """Apply user-defined regex rules to LLM output text.

    Iterates through rules sorted by priority, applying each enabled
    rule's regex pattern and replacement. Invalid regex patterns are
    silently skipped (logged at warning level).

    Args:
        text: Raw LLM output (after emotion/gesture extraction).
        rules: List of rule dicts, each with keys:
            - ``pattern`` (str): Regex pattern to match.
            - ``replacement`` (str): Replacement string (supports
              ``\\1`` backreferences).
            - ``is_enabled`` (int/bool): Whether the rule is active.

    Returns:
        Formatted text with all enabled rules applied, stripped of
        leading/trailing whitespace.

    Example:
        >>> rules = [{"pattern": r"\\*[^*]+\\*", "replacement": "", "is_enabled": 1}]
        >>> apply_format_rules("Hello *waves* friend!", rules)
        'Hello  friend!'
    """
    if not rules:
        return text

    for rule in rules:
        if not rule.get("is_enabled"):
            continue
        pattern = rule.get("pattern", "")
        replacement = rule.get("replacement", "")
        if not pattern:
            continue
        try:
            text = re.sub(pattern, replacement, text)
        except re.error as e:
            logger.warning(f"[FormatRule] Invalid regex '{pattern}': {e}")
            continue

    return text.strip()


def load_format_rules(cur, character_id: int) -> list[dict]:
    """Load enabled format rules for a character from the database.

    Args:
        cur: SQLite cursor.
        character_id: Character whose rules to load.

    Returns:
        List of rule dicts sorted by priority (ascending), filtered
        to only enabled rules. Empty list if table doesn't exist or
        character has no rules.
    """
    try:
        rows = cur.execute(
            "SELECT pattern, replacement, is_enabled FROM output_format_rules "
            "WHERE character_id = ? AND is_enabled = 1 ORDER BY priority ASC",
            (character_id,)
        ).fetchall()
        return [{"pattern": r[0], "replacement": r[1], "is_enabled": r[2]} for r in rows]
    except Exception:
        return []
