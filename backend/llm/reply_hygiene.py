"""Keep the app's internal prompt labels out of stored replies.

The context assembler prefixes recalled memories with ``[Memory] `` and asks the
model to append a ``<quick_replies>`` block. Small models copy those markers into
their answer; the answer is then stored (and re-labelled on recall), so the junk
compounds turn after turn. Everything that persists or displays a reply should
pass it through :func:`strip_internal_labels`.
"""

from __future__ import annotations

import re

# A label only counts at the start of a line (any number of stacked copies), so a
# sentence that happens to mention "[Memory]" mid-line is left alone.
_LEADING_MEMORY_LABELS = re.compile(r"^(?:[ \t]*\[memory\][ \t]*)+", re.IGNORECASE | re.MULTILINE)
# An opening quick_replies tag with no closing tag: drop it and everything after.
_DANGLING_QUICK_REPLIES = re.compile(r"<quick_replies>(?!.*</quick_replies>).*\Z", re.IGNORECASE | re.DOTALL)


def strip_internal_labels(text: str | None) -> str:
    """Remove leaked ``[Memory]`` line prefixes and unterminated ``<quick_replies>`` tags.

    Args:
        text: A model reply or recalled memory text. May be empty or None.

    Returns:
        The text without internal labels, stripped of surrounding whitespace.

    Example:
        >>> strip_internal_labels("[Memory] [Memory] hi")
        'hi'
    """
    if not text:
        return ""
    cleaned = _DANGLING_QUICK_REPLIES.sub("", text)
    cleaned = _LEADING_MEMORY_LABELS.sub("", cleaned)
    return cleaned.strip()
