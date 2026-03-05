"""Accurate token counting with tiktoken, falling back to chars // 4.

This module wraps OpenAI's tiktoken library to provide exact token counts
for context budget calculations. When tiktoken is unavailable (not installed),
it degrades gracefully to the legacy ``len(text) // 4`` heuristic.

The ``cl100k_base`` encoding is used because it closely matches the
tokenisation used by most modern LLMs (GPT-4, Claude, Llama-3, etc.).

Example:
    >>> from backend.llm.token_counter import count_tokens, is_tiktoken_available
    >>> count_tokens("Hello, world!")
    4
    >>> is_tiktoken_available()
    True
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_encoder = None
_tiktoken_available = False

try:
    import tiktoken
    _encoder = tiktoken.get_encoding("cl100k_base")
    _tiktoken_available = True
    logger.info("tiktoken cl100k_base encoder loaded — exact token counting enabled")
except ImportError:
    logger.warning("tiktoken not installed — falling back to chars // 4 estimation")
except Exception as exc:
    logger.warning(f"tiktoken failed to initialise: {exc} — falling back to chars // 4")


def is_tiktoken_available() -> bool:
    """Check whether tiktoken is loaded and functional.

    Returns:
        True if tiktoken is available and the encoder was initialised
        successfully, False otherwise.

    Example:
        >>> is_tiktoken_available()
        True
    """
    return _tiktoken_available


def count_tokens(text: str, model: str = "") -> int:
    """Count the number of tokens in *text*.

    Uses tiktoken ``cl100k_base`` when available; otherwise falls back to
    ``len(text) // 4`` (approximately 4 characters per English token).

    Args:
        text: The string to tokenise.
        model: Optional model identifier (reserved for future per-model
            encoding selection).

    Returns:
        Estimated or exact token count (always >= 0).

    Example:
        >>> count_tokens("The quick brown fox jumps over the lazy dog.")
        10
    """
    if not text:
        return 0
    if _encoder is not None:
        return len(_encoder.encode(text))
    return max(1, len(text) // 4)


# Per-message framing overhead: role name + delimiters add ~4 tokens per msg
_MSG_OVERHEAD = 4


def count_messages_tokens(messages: list[dict], model: str = "") -> int:
    """Count the total tokens across a list of chat messages.

    Each message contributes its content tokens plus a fixed framing
    overhead (~4 tokens for role/delimiters), matching the convention
    used by OpenAI's token counting guide.

    Args:
        messages: List of ``{"role": str, "content": str, ...}`` dicts.
        model: Optional model identifier (reserved for future use).

    Returns:
        Total estimated token count across all messages.

    Example:
        >>> msgs = [
        ...     {"role": "system", "content": "You are helpful."},
        ...     {"role": "user", "content": "Hi!"},
        ... ]
        >>> count_messages_tokens(msgs)
        12
    """
    total = 0
    for msg in messages:
        content = msg.get("content", "") or ""
        total += count_tokens(content, model) + _MSG_OVERHEAD
    return total
