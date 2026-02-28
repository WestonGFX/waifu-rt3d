"""FactExtractor — extracts structured user facts from conversation exchanges.

After each LLM exchange, a lightweight secondary LLM call analyses the user's
most recent message to pull out any stable facts about the user: their name,
preferences, life events, or relationship details.

Only facts that are new (not already present in the DB) and above a confidence
threshold are stored.  Extraction is best-effort — failures are silently
swallowed so they never break the chat pipeline.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)

# Categories we recognise (used as DB `category` values)
CATEGORIES = ("identity", "preferences", "history", "relationship", "general")

# Minimum confidence for a fact to be stored
_CONFIDENCE_THRESHOLD = 0.65

_EXTRACT_PROMPT = """\
Analyze the user's message below and extract any stable personal facts about the user.
Return a JSON array of objects with keys: category, fact, confidence (0-1).

Categories: identity (name/age/location), preferences (food/media/hobbies/opinions),
history (life events/past experiences), relationship (inside jokes/shared memories),
general (anything else worth remembering).

Only include facts that are clearly stated or strongly implied, NOT speculative.
Return [] if nothing worth storing.

User message:
{message}

JSON array only, no commentary:"""


def extract_facts(
    user_message: str,
    char_id: int,
    conn: sqlite3.Connection,
    adapter: Any,
    cfg: dict,
) -> int:
    """Run fact extraction on a user message and persist new facts to the DB.

    This is called as a fire-and-forget background step after each exchange.
    Errors are caught and logged, never propagated.

    Args:
        user_message: The raw user message text to analyse.
        char_id: Character ID — facts are scoped per character.
        conn: Active SQLite connection for writing.
        adapter: LLM adapter instance (needs ``chat_stream()``).
        cfg: App config dict.

    Returns:
        Number of new facts stored (0 on any error).

    Example:
        >>> n = extract_facts("My name is Alex and I love ramen", 1, conn, adapter, cfg)
        >>> n
        2
    """
    if not user_message or not user_message.strip():
        return 0

    try:
        prompt = _EXTRACT_PROMPT.format(message=user_message[:800])
        messages = [
            {"role": "system", "content": "You are a precise fact extractor. Output JSON only."},
            {"role": "user", "content": prompt},
        ]

        # Quick single-turn call — we collect the full response
        llm_cfg = cfg.get("llm", {})
        stream = adapter.chat_stream(
            messages,
            llm_cfg.get("model", ""),
            llm_cfg.get("endpoint", ""),
            llm_cfg.get("api_key", ""),
            max_tokens=300,
            temperature=0.1,
        )
        raw = "".join(t for t in stream if isinstance(t, str))

        # Parse JSON from the response
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start == -1 or end == 0:
            return 0
        facts = json.loads(raw[start:end])
        if not isinstance(facts, list):
            return 0

        return _store_new_facts(facts, char_id, conn)

    except Exception as exc:
        logger.debug("Fact extraction failed (non-fatal): %s", exc)
        return 0


def _store_new_facts(
    facts: list[dict],
    char_id: int,
    conn: sqlite3.Connection,
) -> int:
    """Persist extracted facts that exceed the confidence threshold.

    Skips facts that are semantically duplicates of existing ones (exact text
    match after lowercasing).

    Args:
        facts: List of dicts with keys ``category``, ``fact``, ``confidence``.
        char_id: Character ID to scope the insert.
        conn: Active SQLite connection.

    Returns:
        Number of new rows inserted.
    """
    # Load existing fact texts for this character (for dedup)
    existing = {
        row[0].lower()
        for row in conn.execute(
            "SELECT fact_text FROM user_facts WHERE character_id = ?", (char_id,)
        )
    }

    inserted = 0
    for item in facts:
        try:
            category = str(item.get("category", "general")).lower()
            if category not in CATEGORIES:
                category = "general"
            fact_text = str(item.get("fact", "") or item.get("fact_text", "")).strip()
            confidence = float(item.get("confidence", 0.8))

            if not fact_text or confidence < _CONFIDENCE_THRESHOLD:
                continue
            if fact_text.lower() in existing:
                continue  # already known

            conn.execute(
                """INSERT INTO user_facts (character_id, category, fact_text, source, confidence)
                   VALUES (?, ?, ?, 'auto', ?)""",
                (char_id, category, fact_text, confidence),
            )
            existing.add(fact_text.lower())
            inserted += 1
        except Exception as exc:
            logger.debug("Skipping malformed fact item: %s", exc)

    if inserted:
        conn.commit()
    return inserted
