"""Self-Critique Reflection Loop for the Adaptive Intelligence Engine (AIE Phase B4).

Runs after the regular reflection pass when engagement has been declining.
Asks the local LLM to review its own recent responses, identify improvement
areas, and apply small nudges to the stored user preference profile.

All processing is local — no user data leaves the machine.

Schema dependencies:
    - ``messages`` table with ``role``, ``content``, ``char_id`` columns.
    - ``user_profiles`` table with ``pref_*`` float columns and ``char_id``.
    - ``characters`` table with ``id``, ``name`` columns.
    - ``engagement_signals`` table (read by trend_analyzer).

Example:
    >>> from backend.adaptive.self_critique import build_critique_prompt, parse_critique_response
    >>> prompt = build_critique_prompt("Sakura", [{"role": "user", "content": "hi"}], {}, {})
    >>> isinstance(prompt, str) and len(prompt) > 0
    True
    >>> result = parse_critique_response('{"improvements": [{"issue": "x", "suggestion": "y", "priority": "low"}]}')
    >>> result["improvements"][0]["issue"]
    'x'
"""

from __future__ import annotations

import asyncio
import json
import logging
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)

# Number of recent messages fed to the critique prompt.
_CRITIQUE_WINDOW = 30

# Nudge size applied to pref_* values per "increase" / "decrease" instruction.
_NUDGE_STEP = 0.05

# Known pref_* column names that are safe to nudge.
_NUDGEABLE_PREFS: frozenset[str] = frozenset(
    {
        "pref_response_length",
        "pref_formality",
        "pref_humor",
        "pref_empathy",
        "pref_depth",
    }
)


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------


def build_critique_prompt(
    char_name: str,
    messages: list[dict[str, Any]],
    behavior_modifiers: dict[str, Any],
    user_profile: dict[str, Any],
) -> str:
    """Construct the LLM prompt that asks it to critique its own recent responses.

    Formats the most recent ``_CRITIQUE_WINDOW`` messages into a conversation
    excerpt and asks the model to identify:

    - Responses that received low engagement (short replies, topic changes).
    - Missed cues from the user that went unaddressed.
    - Style mismatches (e.g., too formal when the user was being playful).

    The LLM is instructed to return a JSON object with ``improvements``,
    ``strengths``, and ``style_adjustments`` keys (see Returns).

    Args:
        char_name: Display name of the character (e.g. ``"Sakura"``).
        messages: Ordered list of message dicts (oldest first, newest last).
            Each dict is expected to have ``role`` and ``content`` keys.
        behavior_modifiers: Current behavioral configuration dict.  Included
            in the prompt for LLM context — may be empty.
        user_profile: User preferences row from ``user_profiles``.  Only
            ``pref_*`` float values are surfaced in the prompt.

    Returns:
        Ready-to-send prompt string.  The LLM is instructed to return JSON
        shaped like::

            {
                "improvements": [
                    {
                        "issue": "Too formal when user was being playful",
                        "suggestion": "Match casual tone",
                        "priority": "high"
                    }
                ],
                "strengths": ["Good emotional support during sad moment"],
                "style_adjustments": {
                    "pref_humor": "increase",
                    "pref_formality": "decrease"
                }
            }

    Example:
        >>> prompt = build_critique_prompt(
        ...     "Sakura",
        ...     [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "Hello!"}],
        ...     {},
        ...     {"pref_humor": 0.5},
        ... )
        >>> "Sakura" in prompt and "improvements" in prompt
        True
    """
    # Cap the conversation excerpt to the most recent window.
    window = messages[-_CRITIQUE_WINDOW:]

    convo_lines: list[str] = []
    for m in window:
        role = m.get("role", "user")
        label = "User" if role == "user" else char_name
        content = (m.get("content") or m.get("text") or "").strip()
        if content:
            excerpt = content[:400] + ("..." if len(content) > 400 else "")
            convo_lines.append(f"{label}: {excerpt}")

    convo_text = "\n".join(convo_lines) if convo_lines else "(no messages yet)"

    # Surface current preference values for context.
    pref_lines = [
        f"  {key}: {user_profile.get(key, 'unknown')}"
        for key in sorted(_NUDGEABLE_PREFS)
        if key in user_profile or True  # always show all known prefs
    ]
    pref_text = "\n".join(pref_lines)

    # Surface active behavior modifiers (may be empty).
    mod_text = (
        json.dumps(behavior_modifiers, indent=2)
        if behavior_modifiers
        else "  (none configured)"
    )

    prompt = (
        f"You are an expert conversation coach reviewing the performance of an AI companion "
        f"called {char_name}. Study the conversation below and identify where {char_name} "
        f"could have done better — focusing on engagement, missed emotional cues, and style "
        f"mismatches.\n\n"
        f"--- CURRENT USER PREFERENCE PROFILE (0.0–1.0) ---\n"
        f"{pref_text}\n\n"
        f"--- ACTIVE BEHAVIOR MODIFIERS ---\n"
        f"{mod_text}\n\n"
        f"--- RECENT CONVERSATION (oldest at top, newest at bottom) ---\n"
        f"{convo_text}\n\n"
        f"--- TASK ---\n"
        f"Identify specific problems in {char_name}'s responses and suggest targeted "
        f"improvements. Look for:\n"
        f"  1. Responses that likely got low engagement (user replied with very short "
        f"messages or abruptly changed topic immediately after).\n"
        f"  2. User emotional cues or questions that {char_name} ignored or under-addressed.\n"
        f"  3. Style mismatches (too formal / too casual, too long / too brief, wrong tone).\n\n"
        f"Output ONLY a single valid JSON object with these exact keys:\n"
        f"{{\n"
        f'  "improvements": [\n'
        f'    {{"issue": "<what went wrong>", "suggestion": "<how to fix it>", "priority": "<high|medium|low>"}}\n'
        f"  ],\n"
        f'  "strengths": ["<thing {char_name} did well>"],\n'
        f'  "style_adjustments": {{\n'
        f'    "<pref_key>": "<increase|decrease>"\n'
        f"  }}\n"
        f"}}\n\n"
        f"Rules:\n"
        f"  - The style_adjustments keys MUST be one of: "
        f"{', '.join(sorted(_NUDGEABLE_PREFS))}.\n"
        f"  - Only include a style_adjustment if the conversation strongly supports it.\n"
        f"  - Return ONLY the JSON object. No commentary, no markdown fences.\n"
    )
    return prompt


# ---------------------------------------------------------------------------
# Response parser
# ---------------------------------------------------------------------------


def parse_critique_response(raw_response: str) -> dict[str, Any] | None:
    """Extract and validate a JSON critique object from a raw LLM response string.

    The LLM may wrap output in markdown fences or include prose before/after the
    JSON object.  This function locates the outermost ``{...}`` block, parses it,
    and validates the required structure.

    Args:
        raw_response: Raw text as returned by the LLM adapter.

    Returns:
        Validated critique dict with the following keys:

        - ``improvements`` (list[dict]): Each item must have ``issue``,
          ``suggestion``, and ``priority`` string keys.  Invalid items are
          silently dropped; if none remain the list is empty.
        - ``strengths`` (list[str]): Defaults to ``[]`` if absent.
        - ``style_adjustments`` (dict[str, str]): Maps ``pref_*`` keys to
          ``"increase"`` or ``"decrease"``.  Defaults to ``{}`` if absent.

        Returns ``None`` when the JSON cannot be parsed or ``improvements`` is
        not a list.

    Example:
        >>> raw = '{"improvements": [{"issue": "test", "suggestion": "fix", "priority": "low"}], "strengths": ["good"]}'
        >>> result = parse_critique_response(raw)
        >>> result["improvements"][0]["issue"]
        'test'
        >>> result["strengths"]
        ['good']
        >>> result["style_adjustments"]
        {}
    """
    if not raw_response:
        return None

    # Find outermost JSON object — skip any leading prose or markdown fences.
    start = raw_response.find("{")
    end = raw_response.rfind("}")
    if start == -1 or end == -1 or end <= start:
        logger.warning("parse_critique_response: no JSON object found in response")
        return None

    try:
        parsed: dict[str, Any] = json.loads(raw_response[start : end + 1])
    except json.JSONDecodeError as exc:
        logger.warning("parse_critique_response: JSON decode error: %s", exc)
        return None

    # Validate top-level structure.
    if not isinstance(parsed, dict):
        logger.warning("parse_critique_response: parsed value is not a dict")
        return None

    raw_improvements = parsed.get("improvements")
    if not isinstance(raw_improvements, list):
        logger.warning(
            "parse_critique_response: 'improvements' key missing or not a list"
        )
        return None

    # Validate and filter individual improvement items.
    improvements: list[dict[str, str]] = []
    for item in raw_improvements:
        if not isinstance(item, dict):
            continue
        issue = item.get("issue")
        suggestion = item.get("suggestion")
        priority = item.get("priority")
        if (
            isinstance(issue, str)
            and isinstance(suggestion, str)
            and isinstance(priority, str)
        ):
            improvements.append(
                {
                    "issue": issue.strip(),
                    "suggestion": suggestion.strip(),
                    "priority": priority.strip().lower(),
                }
            )

    # Apply defaults for optional keys.
    raw_strengths = parsed.get("strengths", [])
    strengths: list[str] = (
        [str(s) for s in raw_strengths if s]
        if isinstance(raw_strengths, list)
        else []
    )

    raw_adjustments = parsed.get("style_adjustments", {})
    style_adjustments: dict[str, str] = {}
    if isinstance(raw_adjustments, dict):
        for k, v in raw_adjustments.items():
            if (
                isinstance(k, str)
                and k in _NUDGEABLE_PREFS
                and isinstance(v, str)
                and v.lower() in {"increase", "decrease"}
            ):
                style_adjustments[k] = v.lower()

    return {
        "improvements": improvements,
        "strengths": strengths,
        "style_adjustments": style_adjustments,
    }


# ---------------------------------------------------------------------------
# Main async entry point
# ---------------------------------------------------------------------------


async def run_self_critique(
    char_id: int,
    db_path: str,
    llm_config: dict[str, Any],
) -> dict[str, Any] | None:
    """Run the full self-critique pipeline for one character.

    Orchestrates end-to-end:

    1. Calls :func:`~backend.adaptive.trend_analyzer.check_engagement_regression`
       to confirm a regression is present.  Returns ``None`` immediately when no
       regression is detected.
    2. Loads the last :data:`_CRITIQUE_WINDOW` messages for *char_id* from the DB.
    3. Loads the current ``user_profiles`` row.
    4. Loads the character display name.
    5. Builds the critique prompt via :func:`build_critique_prompt`.
    6. Calls the local LLM using the same adapter pattern as
       :func:`~backend.adaptive.reflector.run_reflection`.
    7. Parses the JSON response with :func:`parse_critique_response`.
    8. Applies ``style_adjustments`` as small nudges (±:data:`_NUDGE_STEP`) to
       the matching ``pref_*`` columns in ``user_profiles``.  Values are clamped
       to ``[0.0, 1.0]``.
    9. Returns the full critique dict (including any applied adjustments).

    If the LLM call fails or returns unparseable output, a warning is logged and
    ``None`` is returned.

    Args:
        char_id: ID of the character whose conversation is being critiqued.
        db_path: Absolute path to the SQLite database file.
        llm_config: Full application config dict (same structure as
            ``load_config()``).  The LLM adapter is resolved via
            ``backend.llm.registry.get_client(llm_config)``.

    Returns:
        The critique result dict on success, with the following keys:

        - ``improvements`` (list[dict]): Issues + suggestions with priority.
        - ``strengths`` (list[str]): Things that worked well.
        - ``style_adjustments`` (dict[str, str]): Requested pref nudges.
        - ``regression`` (dict): The regression descriptor that triggered this run.
        - ``adjustments_applied`` (dict[str, float]): Actual new pref values
          written to DB (only keys that were changed).

        Returns ``None`` when there is no regression, when the DB has no
        messages, or when the LLM call / JSON parse fails.

    Example:
        >>> import asyncio
        >>> # With a real DB path and LLM config:
        >>> # result = asyncio.run(run_self_critique(char_id=1, db_path="/data/app.db", llm_config=cfg))
        >>> # result is None or isinstance(result, dict)
        True
    """
    loop = asyncio.get_running_loop()

    # Step 1: Check for engagement regression — bail out early if none detected.
    def _check_regression() -> dict[str, Any] | None:
        """Query engagement_signals and return regression descriptor or None."""
        try:
            con = sqlite3.connect(db_path)
            try:
                from backend.adaptive.trend_analyzer import (  # noqa: PLC0415
                    check_engagement_regression,
                )

                return check_engagement_regression(char_id, con)
            finally:
                con.close()
        except sqlite3.OperationalError as exc:
            logger.debug(
                "run_self_critique: DB error during regression check for char_id=%d: %s",
                char_id,
                exc,
            )
            return None
        except Exception as exc:
            logger.warning(
                "run_self_critique: unexpected error in regression check "
                "for char_id=%d: %s",
                char_id,
                exc,
            )
            return None

    regression = await loop.run_in_executor(None, _check_regression)
    if regression is None:
        logger.debug(
            "run_self_critique: no engagement regression for char_id=%d — skipping",
            char_id,
        )
        return None

    logger.info(
        "run_self_critique: regression detected for char_id=%d "
        "(metric=%s, delta=%.3f) — running critique",
        char_id,
        regression.get("metric"),
        regression.get("delta", 0.0),
    )

    # Steps 2-4: Load messages, profile, and character name in one DB round-trip.
    def _load_data() -> tuple[list[dict[str, Any]], dict[str, Any], str]:
        """Fetch messages, user profile, and character name from the DB."""
        con = sqlite3.connect(db_path)
        con.row_factory = sqlite3.Row
        try:
            cur = con.cursor()

            # Recent messages (oldest first after reversing).
            msg_rows = cur.execute(
                """SELECT role, content
                   FROM messages
                   WHERE char_id = ?
                   ORDER BY id DESC
                   LIMIT ?""",
                (char_id, _CRITIQUE_WINDOW),
            ).fetchall()
            msgs: list[dict[str, Any]] = [dict(r) for r in reversed(msg_rows)]

            # User preference profile.
            profile_row = cur.execute(
                "SELECT * FROM user_profiles WHERE char_id = ?",
                (char_id,),
            ).fetchone()
            profile: dict[str, Any] = dict(profile_row) if profile_row else {}

            # Character display name.
            char_row = cur.execute(
                "SELECT name FROM characters WHERE id = ?",
                (char_id,),
            ).fetchone()
            name: str = char_row["name"] if char_row else f"Character {char_id}"

            return msgs, profile, name
        except sqlite3.OperationalError as exc:
            logger.debug(
                "run_self_critique: _load_data OperationalError for char_id=%d: %s",
                char_id,
                exc,
            )
            return [], {}, f"Character {char_id}"
        finally:
            con.close()

    messages, user_profile, char_name = await loop.run_in_executor(None, _load_data)

    if not messages:
        logger.debug(
            "run_self_critique: no messages for char_id=%d — skipping", char_id
        )
        return None

    # Step 5: Build the critique prompt.
    prompt = build_critique_prompt(char_name, messages, {}, user_profile)

    # Step 6: Call the LLM.
    raw_response: str = ""
    try:
        from backend.llm.registry import get_client  # noqa: PLC0415

        adapter = get_client(llm_config)
        llm_cfg = llm_config.get("llm", {})
        model: str = llm_cfg.get("model", "")
        endpoint: str = llm_cfg.get("endpoint", "http://localhost:1234")
        api_key: str = llm_cfg.get("api_key", "")

        prompt_messages = [
            {
                "role": "system",
                "content": (
                    "You are a precise conversation coach. "
                    "Output valid JSON only, no markdown."
                ),
            },
            {"role": "user", "content": prompt},
        ]

        def _call_llm() -> str:
            """Run the blocking LLM stream call and collect the full response."""
            tokens = adapter.chat_stream(
                prompt_messages,
                model,
                endpoint,
                api_key,
                max_tokens=512,
                temperature=0.3,
            )
            return "".join(t for t in tokens if isinstance(t, str))

        raw_response = await loop.run_in_executor(None, _call_llm)

    except Exception as exc:
        logger.warning(
            "run_self_critique: LLM call failed for char_id=%d: %s",
            char_id,
            exc,
        )
        return None

    # Step 7: Parse the JSON critique response.
    critique = parse_critique_response(raw_response)
    if critique is None:
        logger.warning(
            "run_self_critique: could not parse LLM response for char_id=%d",
            char_id,
        )
        return None

    # Step 8: Apply style_adjustments as nudges to user_profiles.
    adjustments_applied: dict[str, float] = {}
    style_adjustments = critique.get("style_adjustments", {})

    if style_adjustments and user_profile:
        def _apply_nudges() -> dict[str, float]:
            """Write pref nudges to user_profiles and return new values."""
            applied: dict[str, float] = {}
            con = sqlite3.connect(db_path)
            try:
                cur = con.cursor()

                # Verify the profile row exists; we will not INSERT here —
                # run_reflection owns the upsert lifecycle.
                existing = cur.execute(
                    "SELECT id FROM user_profiles WHERE char_id = ?",
                    (char_id,),
                ).fetchone()
                if not existing:
                    logger.debug(
                        "run_self_critique: no user_profiles row for char_id=%d "
                        "— skipping nudges",
                        char_id,
                    )
                    return applied

                for pref_key, direction in style_adjustments.items():
                    if pref_key not in _NUDGEABLE_PREFS:
                        continue

                    current_val = user_profile.get(pref_key)
                    if current_val is None:
                        # Column exists in schema but no value recorded yet — start at 0.5
                        current_val = 0.5

                    try:
                        current_float = float(current_val)
                    except (TypeError, ValueError):
                        continue

                    if direction == "increase":
                        new_val = min(1.0, current_float + _NUDGE_STEP)
                    else:  # "decrease"
                        new_val = max(0.0, current_float - _NUDGE_STEP)

                    # Only write if the value actually changed.
                    if abs(new_val - current_float) > 1e-9:
                        cur.execute(
                            f"UPDATE user_profiles SET {pref_key} = ? WHERE char_id = ?",  # noqa: S608
                            (round(new_val, 4), char_id),
                        )
                        applied[pref_key] = round(new_val, 4)

                con.commit()
                return applied

            except sqlite3.OperationalError as exc:
                logger.debug(
                    "run_self_critique: _apply_nudges OperationalError for "
                    "char_id=%d: %s",
                    char_id,
                    exc,
                )
                return applied
            finally:
                con.close()

        adjustments_applied = await loop.run_in_executor(None, _apply_nudges)
        if adjustments_applied:
            logger.info(
                "run_self_critique: nudges applied for char_id=%d: %s",
                char_id,
                adjustments_applied,
            )

    # Step 9: Return the full result.
    result: dict[str, Any] = {
        **critique,
        "regression": regression,
        "adjustments_applied": adjustments_applied,
    }

    logger.info(
        "run_self_critique: complete for char_id=%d — "
        "%d improvements, %d strengths, %d adjustments",
        char_id,
        len(critique.get("improvements", [])),
        len(critique.get("strengths", [])),
        len(adjustments_applied),
    )

    return result
