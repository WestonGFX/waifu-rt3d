"""Auto-tuning engine for adaptive AI personalization.

Reads user_profiles and injects learned preferences into system prompts
so the character's behavior naturally adapts to what the user responds to.

Preference keys stored in ``user_profiles`` (all floats in [0.0, 1.0]):
    pref_response_length: 0 = ultra-brief, 1 = elaborate multi-paragraph.
    pref_formality: 0 = casual/slang, 1 = formal/polished.
    pref_humor: 0 = serious, 1 = playful/jokey.
    pref_empathy: 0 = matter-of-fact, 1 = emotionally attuned.
    pref_depth: 0 = surface-level, 1 = analytical/philosophical.

List fields (stored as JSON strings in SQLite TEXT columns):
    top_3_topics: JSON array of topic strings the user frequently raises.
    topics_to_avoid: JSON array of topics the user disengages from.
    personality_traits_user_likes: JSON array of trait strings.

Example:
    >>> from backend.adaptive.tuner import profile_to_prompt_instructions
    >>> profile = {
    ...     "pref_response_length": 0.8,
    ...     "pref_humor": 0.9,
    ...     "top_3_topics": '["anime", "music"]',
    ... }
    >>> instr = profile_to_prompt_instructions(profile)
    >>> "anime" in instr.lower()
    True
"""

from __future__ import annotations

import json
import logging
import sqlite3

logger = logging.getLogger(__name__)

# Thresholds for generating instructions — values in the "neutral zone"
# (between _LOW and _HIGH) produce no instruction to avoid over-prescribing.
_LOW = 0.3
_HIGH = 0.7

# Maximum number of top topics to mention in the injected instructions.
_MAX_TOPICS = 5


# ---------------------------------------------------------------------------
# Profile loading
# ---------------------------------------------------------------------------


def load_user_profile(char_id: int, cur: sqlite3.Cursor) -> dict | None:
    """Load the user preference profile for a character from the DB.

    Performs a ``SELECT *`` on ``user_profiles`` so all columns are returned,
    including any added by future migrations.  Returns ``None`` if no profile
    exists yet (character has not had a reflection pass run) or if the table
    has not been created by the schema migration yet.

    Args:
        char_id: Character ID whose profile should be fetched.
        cur: Active SQLite cursor (read-only access required).

    Returns:
        Dict of all ``user_profiles`` columns for *char_id*, or ``None``
        if no matching row exists or the table does not exist.

    Example:
        >>> import sqlite3
        >>> con = sqlite3.connect(":memory:")
        >>> cur = con.cursor()
        >>> load_user_profile(1, cur) is None
        True
    """
    try:
        row = cur.execute(
            "SELECT * FROM user_profiles WHERE char_id = ?",
            (char_id,),
        ).fetchone()

        if row is None:
            return None

        # Handle both sqlite3.Row (with .keys()) and plain tuple rows
        if hasattr(row, "keys"):
            return dict(row)

        # Fallback: reconstruct dict from cursor.description column names
        cols = [desc[0] for desc in (cur.description or [])]
        return dict(zip(cols, row)) if cols else None

    except sqlite3.OperationalError:
        # Table doesn't exist yet — harmless, migration not yet applied
        return None
    except Exception as exc:
        logger.debug("load_user_profile failed (non-fatal): %s", exc)
        return None


# ---------------------------------------------------------------------------
# Prompt instruction generation
# ---------------------------------------------------------------------------


def profile_to_prompt_instructions(profile: dict) -> str:
    """Convert a user preference profile into system prompt instruction text.

    Generates a concise block of natural-language instructions derived from
    the stored preference values.  Only dimensions that deviate meaningfully
    from the neutral midpoint (outside the 0.3–0.7 range) produce visible
    instructions, so an all-neutral profile yields an empty string.

    List fields (``top_3_topics``, ``topics_to_avoid``) are expected as JSON
    strings (the format stored by the reflector) or plain Python lists — both
    are handled gracefully.

    The output is designed to stay under ~150 tokens to minimise context
    budget impact.

    Args:
        profile: Dict from ``user_profiles`` (or ``load_user_profile()``).
            Recognised keys:

            - ``pref_response_length`` (float, optional, default 0.5)
            - ``pref_formality`` (float, optional, default 0.5)
            - ``pref_humor`` (float, optional, default 0.5)
            - ``pref_empathy`` (float, optional, default 0.5)
            - ``pref_depth`` (float, optional, default 0.5)
            - ``top_3_topics`` (JSON str or list[str], optional)
            - ``topics_to_avoid`` (JSON str or list[str], optional)

    Returns:
        Multi-line instruction string, or empty string if all preferences are
        neutral and no high-affinity topics exist.

    Example:
        >>> profile = {"pref_response_length": 0.2}
        >>> instr = profile_to_prompt_instructions(profile)
        >>> "brief" in instr.lower() or "short" in instr.lower()
        True
    """
    instructions: list[str] = []

    def _pref(key: str) -> float:
        """Extract a float preference value, defaulting to neutral 0.5."""
        val = profile.get(key)
        if val is None:
            return 0.5
        try:
            return float(val)
        except (TypeError, ValueError):
            return 0.5

    length = _pref("pref_response_length")
    formality = _pref("pref_formality")
    humor = _pref("pref_humor")
    empathy = _pref("pref_empathy")
    depth = _pref("pref_depth")

    # --- Response length ---
    if length <= _LOW:
        instructions.append("Keep responses brief (2-3 sentences max).")
    elif length >= _HIGH:
        instructions.append(
            "Provide detailed, multi-paragraph responses when the topic warrants it."
        )

    # --- Formality ---
    if formality <= _LOW:
        instructions.append(
            "Be very casual. Use contractions, slang, and emoji freely."
        )
    elif formality >= _HIGH:
        instructions.append("Maintain a polished and formal tone throughout.")

    # --- Humor ---
    if humor <= _LOW:
        instructions.append("Keep the tone serious; avoid jokes or playful tangents.")
    elif humor >= _HIGH:
        instructions.append(
            "Use playful humor and wordplay frequently — banter is welcome."
        )

    # --- Empathy ---
    if empathy <= _LOW:
        instructions.append("Focus on facts and solutions; minimal emotional commentary.")
    elif empathy >= _HIGH:
        instructions.append(
            "Be especially emotionally attuned — acknowledge feelings before offering advice."
        )

    # --- Depth ---
    if depth <= _LOW:
        instructions.append(
            "Stick to surface-level explanations; avoid long analytical tangents."
        )
    elif depth >= _HIGH:
        instructions.append(
            "Go deep — this user enjoys analytical, philosophical, or technical discussion."
        )

    # --- Topic affinities (from top_3_topics JSON or topic_affinities dict) ---
    top_topics = _parse_json_list(profile.get("top_3_topics"))
    topic_affinities: dict = profile.get("topic_affinities") or {}
    if isinstance(topic_affinities, str):
        try:
            topic_affinities = json.loads(topic_affinities)
        except (json.JSONDecodeError, TypeError):
            topic_affinities = {}

    # Merge: top_3_topics takes priority, fall back to high-affinity topics
    if not top_topics and topic_affinities:
        # Filter to topics above threshold and take top N
        _TOPIC_THRESHOLD = 0.65
        hot = sorted(
            [(t, s) for t, s in topic_affinities.items() if s >= _TOPIC_THRESHOLD],
            key=lambda x: x[1], reverse=True,
        )[:_MAX_TOPICS]
        top_topics = [t for t, _ in hot]

    if top_topics:
        topic_list = ", ".join(str(t) for t in top_topics[:_MAX_TOPICS])
        instructions.append(
            f"This user loves discussing: {topic_list}. "
            "Bring these up naturally when relevant."
        )

    # --- Topics to avoid ---
    avoid = _parse_json_list(profile.get("topics_to_avoid"))
    if avoid:
        avoid_list = ", ".join(str(t) for t in avoid[:5])
        instructions.append(f"Avoid steering the conversation toward: {avoid_list}.")

    return "\n".join(instructions)


# ---------------------------------------------------------------------------
# Per-message engagement scoring
# ---------------------------------------------------------------------------


def compute_engagement_score(
    user_msg: str,
    assistant_msg: str,
    response_time_ms: int | None = None,
) -> float:
    """Compute a quick per-message engagement score (0.0–1.0).

    This lightweight heuristic is called on every message exchange, not only
    during a full reflection pass.  It combines three signals:

    - **User message length** (55% weight): Longer messages indicate deeper
      engagement.  Saturates to 1.0 at 200 characters.
    - **Response speed** (30% weight): Faster replies (lower *response_time_ms*)
      suggest the user was eager.  Saturates to 0.0 at 60 seconds.  When
      *response_time_ms* is ``None``, a neutral 0.5 is used.
    - **Question presence** (15% bonus): A ``?`` in the user message suggests
      the user wants more engagement.

    Args:
        user_msg: The user's message text.
        assistant_msg: The assistant's reply text.  Currently unused but
            reserved for future sentiment or quality analysis.
        response_time_ms: Milliseconds between the user sending their message
            and the assistant replying.  Pass ``None`` to apply a neutral
            latency score.

    Returns:
        Float in [0.0, 1.0] representing estimated engagement for this
        exchange.  Returns 0.0 for empty user messages.

    Example:
        >>> score = compute_engagement_score("Tell me everything about this!", "Sure!")
        >>> 0.0 <= score <= 1.0
        True
        >>> compute_engagement_score("", "", 0)
        0.0
    """
    text = (user_msg or "").strip()
    if not text:
        return 0.0

    # Length component: 0 chars → 0.0, 200+ chars → 1.0
    length_score = min(len(text) / 200.0, 1.0)

    # Latency component: 0 ms → 1.0, 60 000 ms → 0.0
    if response_time_ms is not None:
        latency_score = max(0.0, 1.0 - response_time_ms / 60_000.0)
    else:
        latency_score = 0.5  # Neutral when timing is unavailable

    # Question bonus: user asking a question signals desire for more interaction
    question_bonus = 0.15 if "?" in text else 0.0

    raw = length_score * 0.55 + latency_score * 0.30 + question_bonus
    return float(max(0.0, min(1.0, raw)))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _parse_json_list(value: object) -> list:
    """Safely parse a JSON-encoded list from a SQLite TEXT value or pass through a list.

    Handles three cases: a JSON string (e.g. ``'["anime","music"]'``), a plain
    Python list, and ``None``.

    Args:
        value: A JSON string, a Python list, or ``None``.

    Returns:
        A list (possibly empty) regardless of input type or errors.
    """
    if value is None:
        return []
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(str(value))
        return parsed if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []
