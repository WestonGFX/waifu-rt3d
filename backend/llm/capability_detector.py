"""
CapabilityDetector — determines the tool use protocol for a given model ID.

Uses a two-step approach:
1. Known model family patterns (fast, no network).
2. SQLite cache lookup (returns previously resolved result).

Results are persisted in the ``model_capability_cache`` table so detection
only runs once per model. Manual overrides stored in the same table take
highest priority.

Protocol values:
    ``openai_functions``  -- Model reliably uses OpenAI-format tool schemas.
    ``xml_fallback``      -- Inject XML tool descriptions; model may ignore native protocol.
    ``none``              -- Disable tools entirely (model is too small / incapable).
"""
from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from typing import Literal

ToolProtocol = Literal["openai_functions", "xml_fallback", "none"]

# ── Known model family → protocol mapping ────────────────────────────────────
# Patterns are matched case-insensitively against the model ID / name string.
# Order matters: first match wins.
_KNOWN_PATTERNS: list[tuple[str, ToolProtocol]] = [
    # Cloud APIs — always native
    (r"claude-", "openai_functions"),
    (r"gpt-[34]", "openai_functions"),
    # Qwen 2.5+ — very reliable native tool calling
    (r"qwen2\.5", "openai_functions"),
    (r"qwen3", "openai_functions"),
    # Llama 3.1 / 3.2 / 3.3 — reliable tool calling
    (r"llama-?3\.[123]", "openai_functions"),
    (r"llama-?3\.[123]-instruct", "openai_functions"),
    # Phi-4 — capable of structured output
    (r"phi-?4", "openai_functions"),
    # Mistral Nemo / Large — reliable
    (r"mistral-nemo", "openai_functions"),
    (r"mistral-large", "openai_functions"),
    # DeepSeek R1 / V3
    (r"deepseek-r1", "openai_functions"),
    (r"deepseek-v3", "openai_functions"),
    # Gemma 2 / 3 — xml fallback (instruction following ok but tool schema unreliable)
    (r"gemma-?[23]", "xml_fallback"),
    # Older Llama 2 / 1 — xml fallback
    (r"llama-?[12]\.", "xml_fallback"),
    # Mistral 7B — xml fallback
    (r"mistral-7b", "xml_fallback"),
    # SmolLM / Phi-2 / TinyLlama — too small, disable tools
    (r"smollm", "none"),
    (r"phi-2", "none"),
    (r"tinyllama", "none"),
]

_compiled = [(re.compile(pat, re.IGNORECASE), proto) for pat, proto in _KNOWN_PATTERNS]


def _protocol_from_pattern(model_id: str) -> ToolProtocol | None:
    """Return the tool protocol for a known model family, or None if unknown.

    Args:
        model_id: Model identifier string (e.g. "qwen2.5-72b-instruct-q4").

    Returns:
        Matching protocol, or None if no pattern matches.
    """
    for regex, proto in _compiled:
        if regex.search(model_id):
            return proto
    return None


def get_tool_protocol(
    model_id: str,
    conn: sqlite3.Connection | None = None,
    default: ToolProtocol = "xml_fallback",
) -> ToolProtocol:
    """Resolve the tool protocol for a model, using cache then pattern matching.

    Priority order:
    1. Manual override in ``model_capability_cache`` (manual_override = 1)
    2. Cached result from previous detection
    3. Known pattern match (fast, no network)
    4. ``default`` fallback (xml_fallback is safe for unknown models)

    Args:
        model_id: The model identifier string.
        conn: SQLite connection for cache lookup. If None, skips cache.
        default: Fallback protocol when nothing else matches.

    Returns:
        One of "openai_functions", "xml_fallback", or "none".

    Example:
        >>> proto = get_tool_protocol("qwen2.5-14b-instruct")
        >>> proto
        'openai_functions'
        >>> proto = get_tool_protocol("some-unknown-model")
        >>> proto
        'xml_fallback'
    """
    if not model_id:
        return default

    # 1. Check cache (manual override takes highest priority)
    if conn is not None:
        try:
            row = conn.execute(
                "SELECT tool_protocol, manual_override FROM model_capability_cache WHERE model_id = ?",
                (model_id,),
            ).fetchone()
            if row:
                return row[0]  # type: ignore[return-value]
        except Exception:
            pass  # cache failure is non-fatal

    # 2. Known pattern match
    proto = _protocol_from_pattern(model_id)
    if proto is not None:
        # Persist to cache for future lookups
        if conn is not None:
            _cache_protocol(conn, model_id, proto, source="pattern")
        return proto

    # 3. Default
    return default


def set_manual_override(
    conn: sqlite3.Connection,
    model_id: str,
    protocol: ToolProtocol,
) -> None:
    """Store a manual protocol override for a model in the cache.

    Manual overrides survive automatic re-detection and take highest priority.

    Args:
        conn: Active SQLite connection.
        model_id: Model identifier string.
        protocol: The protocol to force for this model.

    Example:
        >>> set_manual_override(conn, "my-custom-model", "openai_functions")
    """
    conn.execute(
        """INSERT OR REPLACE INTO model_capability_cache
           (model_id, tool_protocol, manual_override, source, cached_at)
           VALUES (?, ?, 1, 'manual', ?)""",
        (model_id, protocol, datetime.now().isoformat()),
    )
    conn.commit()


def _cache_protocol(
    conn: sqlite3.Connection,
    model_id: str,
    protocol: ToolProtocol,
    source: str = "pattern",
) -> None:
    """Persist a detected protocol to the cache (non-override).

    Does not overwrite manual overrides.

    Args:
        conn: Active SQLite connection.
        model_id: Model identifier string.
        protocol: Detected protocol.
        source: Detection source label ("pattern", "hf_tag", etc.).
    """
    conn.execute(
        """INSERT INTO model_capability_cache (model_id, tool_protocol, source, cached_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(model_id) DO UPDATE SET
               tool_protocol = excluded.tool_protocol,
               source = excluded.source,
               cached_at = excluded.cached_at
           WHERE manual_override = 0""",
        (model_id, protocol, source, datetime.now().isoformat()),
    )
    conn.commit()
