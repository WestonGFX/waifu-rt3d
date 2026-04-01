"""Conversation reflection engine for adaptive AI personalization.

Analyzes recent conversation history using the local LLM to learn
user preferences (response length, formality, humor, topics, etc.)
and stores findings in the user_profiles table.

All processing runs locally — no user data leaves the machine.

Schema dependency:
    - ``user_profiles`` table with preference float columns and
      ``last_reflection_at``, ``reflection_memo``, ``engagement_heuristics``
      columns (created by a preflight.py schema migration).
    - ``messages`` table with ``role``, ``content``, ``created_at``, and
      ``char_id`` columns.
    - ``user_facts`` table for the user knowledge graph.

Example:
    >>> from backend.adaptive.reflector import compute_engagement_heuristics
    >>> msgs = [{"role": "user", "content": "Tell me more!"}]
    >>> h = compute_engagement_heuristics(msgs)
    >>> h["avg_user_msg_length"] > 0
    True
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)

# Number of messages fetched from DB for the reflection window.
_REFLECTION_WINDOW = 50

# Default minimum messages since last reflection before we run again.
DEFAULT_REFLECTION_THRESHOLD = 50

# Float preference keys the LLM is asked to return.
_EXPECTED_FLOAT_KEYS: tuple[str, ...] = (
    "pref_response_length",
    "pref_formality",
    "pref_humor",
    "pref_empathy",
    "pref_depth",
)

# Broad emoji regex covering Unicode emoji ranges and common kaomoji markers.
_EMOJI_RE = re.compile(
    r"[\U0001F300-\U0001FFFF"  # misc symbols, emoticons, transport, etc.
    r"\u2600-\u27BF"           # misc symbols + dingbats
    r"\u2300-\u23FF"           # misc technical symbols
    r"]",
    re.UNICODE,
)


# ---------------------------------------------------------------------------
# Core heuristics (no LLM required)
# ---------------------------------------------------------------------------


def compute_engagement_heuristics(messages: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute engagement metrics from a message list without any LLM call.

    Operates on a flat list of message dicts, each expected to have at least
    ``role`` (``"user"`` | ``"assistant"``) and ``content`` (str).  The
    optional ``created_at`` field (ISO-8601 string or Unix ms integer) is used
    for timing metrics.

    Metrics returned:

    - ``avg_user_msg_length``: Mean character count of user messages.
    - ``avg_assistant_msg_length``: Mean character count of assistant messages.
    - ``length_ratio``: ``avg_user / avg_assistant``; ``None`` when the
      assistant has zero messages.  Values > 1 mean the user writes more.
    - ``question_frequency``: Fraction of user messages containing ``?``.
    - ``avg_response_gap_ms``: Mean milliseconds between consecutive messages
      (any role), computed from ``created_at`` timestamps.  ``None`` when
      fewer than two timestamps are available.
    - ``conversation_continuation_rate``: Fraction of user messages that
      immediately follow an assistant message.  Values near 1.0 suggest the
      user is directly replying rather than opening new topics cold.
    - ``emoji_usage_rate``: Fraction of user messages containing at least one
      Unicode emoji.

    Args:
        messages: Ordered list of message dicts (oldest first, newest last).
            Each dict must have ``role`` and ``content`` keys.

    Returns:
        Dict with all metric keys.  Missing or incalculable values are ``None``.

    Example:
        >>> msgs = [
        ...     {"role": "user", "content": "Hi! How are you?"},
        ...     {"role": "assistant", "content": "Great!"},
        ...     {"role": "user", "content": "Awesome"},
        ... ]
        >>> h = compute_engagement_heuristics(msgs)
        >>> h["question_frequency"]
        0.5
    """
    if not messages:
        return {
            "avg_user_msg_length": 0.0,
            "avg_assistant_msg_length": 0.0,
            "length_ratio": 0.0,
            "question_frequency": 0.0,
            "avg_response_gap_ms": None,
            "conversation_continuation_rate": 0.0,
            "emoji_usage_rate": 0.0,
            "total_user_messages": 0.0,
            "total_messages": 0.0,
        }

    def _text(m: dict) -> str:
        """Extract message text, accepting both 'content' and 'text' keys."""
        return m.get("content") or m.get("text") or ""

    user_msgs = [m for m in messages if m.get("role") == "user"]
    asst_msgs = [m for m in messages if m.get("role") == "assistant"]

    # --- length metrics ---
    avg_user_len = (
        sum(len(_text(m)) for m in user_msgs) / len(user_msgs)
        if user_msgs
        else 0.0
    )
    avg_asst_len = (
        sum(len(_text(m)) for m in asst_msgs) / len(asst_msgs)
        if asst_msgs
        else 0.0
    )
    # Use 0.0 (not None) when no assistant messages — cleaner for downstream consumers
    length_ratio: float = (avg_user_len / avg_asst_len) if avg_asst_len > 0 else 0.0

    # --- question frequency ---
    question_frequency = (
        sum(1 for m in user_msgs if "?" in _text(m)) / len(user_msgs)
        if user_msgs
        else 0.0
    )

    # --- response gap from timestamps ---
    avg_response_gap_ms: float | None = None
    timestamps: list[float] = []
    for m in messages:
        ts_raw = m.get("created_at") or m.get("ts")
        if ts_raw is None:
            continue
        try:
            ts_val = float(ts_raw)
            # Heuristic: Unix-ms values are ~1.7e12, Unix-s values are ~1.7e9
            timestamps.append(ts_val if ts_val > 1e11 else ts_val * 1000.0)
        except (TypeError, ValueError):
            # Try ISO-8601 string
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
                timestamps.append(dt.timestamp() * 1000.0)
            except Exception:
                pass

    if len(timestamps) >= 2:
        gaps = [
            timestamps[i + 1] - timestamps[i]
            for i in range(len(timestamps) - 1)
            if timestamps[i + 1] > timestamps[i]
        ]
        avg_response_gap_ms = float(sum(gaps) / len(gaps)) if gaps else None

    # --- conversation continuation rate ---
    continuation_count = 0
    for i, msg in enumerate(messages):
        if msg.get("role") != "user":
            continue
        if i > 0 and messages[i - 1].get("role") == "assistant":
            continuation_count += 1
    conversation_continuation_rate = (
        continuation_count / len(user_msgs) if user_msgs else 0.0
    )

    # --- emoji usage ---
    emoji_usage_rate = (
        sum(1 for m in user_msgs if _EMOJI_RE.search(_text(m)))
        / len(user_msgs)
        if user_msgs
        else 0.0
    )

    return {
        "avg_user_msg_length": avg_user_len,
        "avg_assistant_msg_length": avg_asst_len,
        "length_ratio": length_ratio,
        "question_frequency": question_frequency,
        "avg_response_gap_ms": avg_response_gap_ms,
        "conversation_continuation_rate": conversation_continuation_rate,
        "emoji_usage_rate": emoji_usage_rate,
        "total_user_messages": float(len(user_msgs)),
        "total_messages": float(len(messages)),
    }


# ---------------------------------------------------------------------------
# Per-message engagement scoring
# ---------------------------------------------------------------------------


def compute_engagement_score(
    user_msg: str,
    assistant_msg: str,
    response_time_ms: int | None = None,
) -> float:
    """Compute a quick engagement score for a single message exchange.

    Called on EVERY message (not just during reflection). Lightweight —
    pure heuristics, no LLM call.

    Factors:
        - User message length (longer = more engaged, saturates at 200 chars)
        - Response latency (faster reply = more engaged, saturates at 60s)

    Args:
        user_msg: The user's message text.
        assistant_msg: The assistant's response text.
        response_time_ms: Milliseconds between user message and response,
            or None if unavailable.

    Returns:
        Float in [0.0, 1.0] where 1.0 = maximum engagement.

    Example:
        >>> compute_engagement_score("Tell me everything about anime!", "Sure!", 2000)
        0.7...
    """
    # Length component (60% weight): saturates at 200 characters
    user_len = len(user_msg) if user_msg else 0
    length_score = min(user_len / 200.0, 1.0)

    # Latency component (40% weight): lower is better; 0 ms = max, 60 000 ms = 0
    # None means timing unavailable — use neutral 0.5
    if response_time_ms is None:
        latency_score = 0.5
    else:
        latency_score = max(0.0, 1.0 - response_time_ms / 60_000.0)

    score = (length_score * 0.6) + (latency_score * 0.4)
    return max(0.0, min(1.0, score))


# ---------------------------------------------------------------------------
# Reflection gate
# ---------------------------------------------------------------------------


def should_reflect(
    char_id: int,
    cur: sqlite3.Cursor,
    threshold: int = DEFAULT_REFLECTION_THRESHOLD,
) -> bool:
    """Check whether enough new messages have accumulated to justify a reflection pass.

    Counts messages for *char_id* that arrived after the ``last_reflection_at``
    timestamp stored in ``user_profiles``.  If no profile row exists yet the
    count is taken over all messages for this character, treating it as never
    having been reflected.

    Args:
        char_id: ID of the character whose conversation is being checked.
        cur: Active SQLite cursor (read-only access required).
        threshold: Minimum number of new messages required before returning
            ``True``.  Defaults to :data:`DEFAULT_REFLECTION_THRESHOLD`.

    Returns:
        ``True`` when the unseen message count equals or exceeds *threshold*.
        Also returns ``True`` when the ``user_profiles`` table does not yet
        exist (safe to call before migrations run).

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> should_reflect(1, con.cursor(), threshold=50)
        True
    """
    try:
        row = cur.execute(
            "SELECT last_reflection_at FROM user_profiles WHERE char_id = ?",
            (char_id,),
        ).fetchone()

        last_ts = row[0] if row else None

        if last_ts:
            # Count messages for this character inserted after the last reflection timestamp
            count = cur.execute(
                "SELECT COUNT(*) FROM messages WHERE char_id = ? AND ts > strftime('%s', ?)",
                (char_id, last_ts),
            ).fetchone()[0]
        else:
            # No profile row or NULL timestamp — count all messages for this character
            count = cur.execute(
                "SELECT COUNT(*) FROM messages WHERE char_id = ?",
                (char_id,),
            ).fetchone()[0]

        return int(count) >= threshold

    except sqlite3.OperationalError:
        # Table doesn't exist yet — safe to reflect (migration not yet applied)
        return True
    except Exception as exc:
        logger.debug("should_reflect query failed (non-fatal): %s", exc)
        return False


# ---------------------------------------------------------------------------
# Reflection prompt builder
# ---------------------------------------------------------------------------


def build_reflection_prompt(
    char_name: str,
    messages: list[dict[str, Any]],
    current_profile: dict[str, Any],
    user_facts: list[str],
) -> str:
    """Construct the LLM prompt that asks for an updated user preference profile.

    Includes the last ``_REFLECTION_WINDOW`` messages, the current stored
    preferences, and any known user facts from the knowledge graph.

    The LLM is instructed to return a single JSON object (no prose) containing:

    - ``pref_response_length`` (float 0–1): 0 = very brief, 1 = very detailed.
    - ``pref_formality`` (float 0–1): 0 = very casual, 1 = very formal.
    - ``pref_humor`` (float 0–1): 0 = serious, 1 = very playful/funny.
    - ``pref_empathy`` (float 0–1): 0 = direct/blunt, 1 = highly nurturing.
    - ``pref_depth`` (float 0–1): 0 = surface-level, 1 = deep/intellectual.
    - ``top_3_topics`` (list[str]): Three topics the user frequently raises.
    - ``topics_to_avoid`` (list[str]): Topics the user disengages from.
    - ``personality_traits_user_likes`` (list[str]): Traits the user responds well to.
    - ``reflection_memo`` (str): 2–3 sentence human-readable summary of findings.

    Args:
        char_name: Display name of the character for persona context in the
            prompt (e.g. ``"Dae"``).
        messages: Full ordered message list (oldest first, newest last); the
            most recent ``_REFLECTION_WINDOW`` messages are used.
        current_profile: Dict of existing preference values from
            ``user_profiles``.  Empty dict on first reflection.
        user_facts: List of ``fact_text`` strings from the user knowledge graph.
            Capped at 20 entries in the prompt to stay within token budget.

    Returns:
        A ready-to-send prompt string for the LLM.

    Example:
        >>> prompt = build_reflection_prompt("Sakura", [], {}, [])
        >>> "Sakura" in prompt
        True
    """
    # Cap at 30 messages for the prompt — balances context vs token budget
    window = messages[-30:]

    # Format conversation excerpt — truncate long messages to stay within budget
    convo_lines: list[str] = []
    for m in window:
        role = m.get("role", "user")
        label = "User" if role == "user" else char_name
        content = (m.get("content") or m.get("text") or "").strip()
        if content:
            excerpt = content[:400] + ("..." if len(content) > 400 else "")
            convo_lines.append(f"{label}: {excerpt}")

    convo_text = "\n".join(convo_lines) if convo_lines else "(no messages yet)"

    # Format current profile (only float preference keys to keep it concise)
    profile_lines = [
        f"  {key}: {current_profile.get(key, 'unknown')}"
        for key in _EXPECTED_FLOAT_KEYS
    ]
    profile_text = "\n".join(profile_lines)

    # Format known facts (cap at 20)
    facts_text = (
        "\n".join(f"  - {f}" for f in user_facts[:20])
        if user_facts
        else "  (none known yet)"
    )

    prompt = (
        f"You are an expert psychologist and UX analyst. Study the following conversation "
        f"between a user and an AI companion called {char_name}, then produce an updated "
        f"preference profile for this user.\n\n"
        f"--- KNOWN USER FACTS ---\n"
        f"{facts_text}\n\n"
        f"--- CURRENT PREFERENCE PROFILE (values 0.0-1.0) ---\n"
        f"{profile_text}\n\n"
        f"--- RECENT CONVERSATION (newest at bottom) ---\n"
        f"{convo_text}\n\n"
        f"--- TASK ---\n"
        f"Output ONLY a single valid JSON object with these exact keys:\n"
        f"{{\n"
        f'  "pref_response_length": <0.0-1.0, where 0=very brief, 1=very detailed>,\n'
        f'  "pref_formality": <0.0-1.0, where 0=very casual, 1=very formal>,\n'
        f'  "pref_humor": <0.0-1.0, where 0=serious, 1=very playful/funny>,\n'
        f'  "pref_empathy": <0.0-1.0, where 0=direct/blunt, 1=highly emotional/nurturing>,\n'
        f'  "pref_depth": <0.0-1.0, where 0=surface-level, 1=deep/intellectual>,\n'
        f'  "top_3_topics": ["topic1", "topic2", "topic3"],\n'
        f'  "topics_to_avoid": ["topic"],\n'
        f'  "personality_traits_user_likes": ["trait1", "trait2"],\n'
        f'  "reflection_memo": "2-3 sentence summary of what you learned about this user."\n'
        f"}}\n\n"
        f"Rules:\n"
        f"- Update values the conversation clearly supports; keep existing values if uncertain.\n"
        f"- Return ONLY the JSON object. No commentary, no markdown fences.\n"
    )
    return prompt


# ---------------------------------------------------------------------------
# Main async entry point
# ---------------------------------------------------------------------------


async def run_reflection(
    char_id: int,
    db_path: str,
    llm_config: dict,
) -> dict:
    """Run a full reflection pass for one character and persist the results.

    Orchestrates the reflection pipeline end-to-end:

    1. Loads the most recent ``_REFLECTION_WINDOW * 2`` messages for *char_id*.
    2. Loads the current ``user_profiles`` row (or starts from scratch).
    3. Loads known user facts from the ``user_facts`` table.
    4. Computes heuristic engagement metrics (no LLM needed).
    5. Builds a reflection prompt and calls the local LLM via the configured
       adapter (same adapter used by the main chat pipeline).
    6. Parses the JSON response.  Falls back gracefully to heuristics-only
       if the LLM is unreachable or returns malformed output.
    7. Writes the updated profile back to ``user_profiles``.

    The ``user_profiles`` table must already exist before this function is
    called.  Call after the preflight migration that creates it.

    Args:
        char_id: Character ID whose conversation is being analysed.
        db_path: Absolute path to the SQLite database file.
        llm_config: Full application config dict — same structure returned by
            ``load_config()``.  The LLM adapter is resolved via
            ``backend.llm.registry.get_client(llm_config)``.

    Returns:
        The updated profile dict as stored in ``user_profiles``.  Includes all
        ``pref_*`` float fields, ``top_3_topics``, ``topics_to_avoid``,
        ``personality_traits_user_likes``, ``reflection_memo``, and
        ``engagement_heuristics``.  Returns an empty dict when no messages
        exist for *char_id*.

    Example:
        >>> import asyncio
        >>> profile = asyncio.run(
        ...     run_reflection(char_id=1, db_path="/data/app.db", llm_config=cfg)
        ... )
        >>> print(profile.get("pref_response_length"))
        0.4
    """
    loop = asyncio.get_running_loop()

    # --- Load all needed data in one blocking DB call ---
    def _load_data() -> tuple[list[dict], dict[str, Any], str, list[str]]:
        con = sqlite3.connect(db_path)
        con.row_factory = sqlite3.Row
        try:
            cur = con.cursor()

            msg_rows = cur.execute(
                """SELECT role, content, created_at
                   FROM messages
                   WHERE char_id = ?
                   ORDER BY id DESC
                   LIMIT ?""",
                (char_id, _REFLECTION_WINDOW * 2),
            ).fetchall()
            msgs: list[dict] = [dict(r) for r in reversed(msg_rows)]

            profile_row = cur.execute(
                "SELECT * FROM user_profiles WHERE char_id = ?",
                (char_id,),
            ).fetchone()
            cur_profile: dict[str, Any] = dict(profile_row) if profile_row else {}

            char_row = cur.execute(
                "SELECT name FROM characters WHERE id = ?", (char_id,)
            ).fetchone()
            name: str = char_row["name"] if char_row else f"Character {char_id}"

            fact_rows = cur.execute(
                """SELECT fact_text FROM user_facts
                   WHERE char_id = ?
                   ORDER BY id DESC LIMIT 40""",
                (char_id,),
            ).fetchall()
            facts: list[str] = [r["fact_text"] for r in fact_rows]

            return msgs, cur_profile, name, facts
        finally:
            con.close()

    messages, current_profile, char_name, user_facts = await loop.run_in_executor(
        None, _load_data
    )

    if not messages:
        logger.debug("run_reflection: no messages for char_id=%d — skipping", char_id)
        return {}

    # --- Heuristic pass (always runs, LLM-independent) ---
    heuristics = compute_engagement_heuristics(messages)
    logger.debug("run_reflection heuristics for char_id=%d: %s", char_id, heuristics)

    # --- LLM reflection pass ---
    updated_prefs: dict[str, Any] = {}
    reflection_memo = ""

    try:
        # Local import to avoid circular dependency at module load time
        from backend.llm.registry import get_client  # noqa: PLC0415

        adapter = get_client(llm_config)
        llm_cfg = llm_config.get("llm", {})
        model: str = llm_cfg.get("model", "")
        endpoint: str = llm_cfg.get("endpoint", "http://localhost:1234")
        api_key: str = llm_cfg.get("api_key", "")

        prompt = build_reflection_prompt(char_name, messages, current_profile, user_facts)
        prompt_messages = [
            {
                "role": "system",
                "content": "You are a precise analyst. Output valid JSON only, no markdown.",
            },
            {"role": "user", "content": prompt},
        ]

        def _call_llm() -> str:
            """Run the blocking LLM stream call and collect the full response."""
            tokens = adapter.chat_stream(
                prompt_messages, model, endpoint, api_key,
                max_tokens=512, temperature=0.2,
            )
            return "".join(t for t in tokens if isinstance(t, str))

        raw = await loop.run_in_executor(None, _call_llm)

        # Extract JSON — LLM may wrap response in markdown fences
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > 0:
            parsed: dict = json.loads(raw[start:end])

            for key in _EXPECTED_FLOAT_KEYS:
                val = parsed.get(key)
                if val is not None:
                    try:
                        updated_prefs[key] = max(0.0, min(1.0, float(val)))
                    except (TypeError, ValueError):
                        pass

            # Serialize list fields as JSON strings for SQLite TEXT storage
            updated_prefs["top_3_topics"] = json.dumps(
                [str(t) for t in parsed.get("top_3_topics", [])][:3]
            )
            updated_prefs["topics_to_avoid"] = json.dumps(
                [str(t) for t in parsed.get("topics_to_avoid", [])][:10]
            )
            updated_prefs["personality_traits_user_likes"] = json.dumps(
                [str(t) for t in parsed.get("personality_traits_user_likes", [])][:10]
            )
            reflection_memo = str(parsed.get("reflection_memo", "")).strip()
        else:
            logger.warning(
                "run_reflection: LLM returned no parseable JSON — using heuristics only"
            )

    except Exception as exc:
        logger.warning(
            "run_reflection: LLM call failed (%s) — falling back to heuristics only", exc
        )

    # Derive a rough length preference from heuristics when LLM gave no value
    if "pref_response_length" not in updated_prefs:
        avg_len = float(heuristics.get("avg_user_msg_length") or 0.0)
        # Longer avg user messages → user likely wants more detail in replies.
        # Saturates to 1.0 at 300 chars.
        updated_prefs["pref_response_length"] = min(1.0, avg_len / 300.0)

    # --- AIE A3: Compute extended user model metrics (no LLM) ---
    try:
        from backend.adaptive.user_model import compute_extended_metrics
        from backend.adaptive.signals import get_recent_signals
        _ext_con = sqlite3.connect(db_path)
        _ext_signals = get_recent_signals(char_id, _ext_con, limit=50)
        _ext_con.close()
        _ext_metrics = compute_extended_metrics(messages, _ext_signals)
        updated_prefs.update({
            k: v for k, v in _ext_metrics.items() if v is not None
        })
        logger.debug(
            "run_reflection: extended metrics for char_id=%d: %s",
            char_id, {k: round(v, 3) if isinstance(v, float) else v
                      for k, v in _ext_metrics.items() if v is not None},
        )
    except Exception as _ext_err:
        logger.debug("run_reflection: extended metrics skipped: %s", _ext_err)

    # --- Persist updated profile back to DB ---
    def _write_profile() -> dict:
        con2 = sqlite3.connect(db_path)
        con2.row_factory = sqlite3.Row
        try:
            cur2 = con2.cursor()
            existing = cur2.execute(
                "SELECT id FROM user_profiles WHERE char_id = ?",
                (char_id,),
            ).fetchone()

            heuristics_json = json.dumps(heuristics)

            if existing:
                # Dynamic UPDATE — only touch columns we have values for
                set_clauses: list[str] = []
                params: list[Any] = []
                for key, val in updated_prefs.items():
                    set_clauses.append(f"{key} = ?")
                    params.append(val)
                set_clauses.extend(
                    [
                        "reflection_memo = ?",
                        "engagement_heuristics = ?",
                        "last_reflection_at = datetime('now')",
                    ]
                )
                params.extend([reflection_memo, heuristics_json, char_id])
                cur2.execute(
                    f"UPDATE user_profiles SET {', '.join(set_clauses)} "
                    f"WHERE char_id = ?",
                    params,
                )
            else:
                # First-time INSERT
                fields: list[str] = ["char_id", "reflection_memo",
                                      "engagement_heuristics"]
                insert_vals: list[Any] = [char_id, reflection_memo, heuristics_json]
                for key, val in updated_prefs.items():
                    fields.append(key)
                    insert_vals.append(val)

                placeholders = ["?"] * len(insert_vals)
                cur2.execute(
                    f"INSERT INTO user_profiles ({', '.join(fields)}, last_reflection_at) "
                    f"VALUES ({', '.join(placeholders)}, datetime('now'))",
                    insert_vals,
                )

            con2.commit()

            result_row = cur2.execute(
                "SELECT * FROM user_profiles WHERE char_id = ?",
                (char_id,),
            ).fetchone()
            return dict(result_row) if result_row else {}
        finally:
            con2.close()

    result = await loop.run_in_executor(None, _write_profile)
    logger.info(
        "run_reflection complete for char_id=%d — memo: %s",
        char_id,
        (reflection_memo[:80] + "...") if len(reflection_memo) > 80 else reflection_memo,
    )
    return result
