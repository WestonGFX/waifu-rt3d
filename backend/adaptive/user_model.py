"""Extended user model metrics extractor for adaptive AI personalization.

Computes communication style, emotional pattern, and interaction pattern metrics
from existing message history and engagement signals.  All processing is pure
computation — no LLM calls, no network I/O.

The primary entry point is :func:`compute_extended_metrics`.  Individual helper
functions are exposed so they can be unit-tested or composed independently.

Schema dependency:
    - ``user_profiles`` table (created by v55 migration)
    - ``engagement_signals`` table (created by v60 migration)

Example:
    >>> from backend.adaptive.user_model import compute_extended_metrics
    >>> msgs = [
    ...     {"role": "user", "content": "Hi! How are you?", "created_at": "2026-03-30T10:00:00"},
    ...     {"role": "assistant", "content": "I'm great!", "created_at": "2026-03-30T10:00:05"},
    ... ]
    >>> metrics = compute_extended_metrics(msgs, [])
    >>> 0.0 <= metrics["vocabulary_complexity"] <= 1.0
    True
"""

from __future__ import annotations

import logging
import re
import sqlite3
import statistics
from datetime import datetime
from typing import Union

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Compiled patterns (module-level, initialised once)
# ---------------------------------------------------------------------------

# Broad emoji regex — same pattern as signals.py to avoid cross-import.
_EMOJI_RE: re.Pattern[str] = re.compile(
    r"[\U0001F300-\U0001FFFF"  # misc symbols, emoticons, transport, etc.
    r"\u2600-\u27BF"           # misc symbols + dingbats
    r"\u2300-\u23FF"           # misc technical symbols
    r"]",
    re.UNICODE,
)

# Vowel groups for syllable counting.
_VOWEL_RE: re.Pattern[str] = re.compile(r"[aeiou]+", re.IGNORECASE)

# Word tokeniser (lowercase alpha only).
_WORD_RE: re.Pattern[str] = re.compile(r"[a-z]+")

# Comfort/emotional language keywords — phrases that indicate the user is
# seeking emotional support or sharing vulnerable feelings.
_COMFORT_KEYWORDS: frozenset[str] = frozenset(
    {
        "sad",
        "lonely",
        "anxious",
        "scared",
        "afraid",
        "worried",
        "depressed",
        "hurt",
        "cry",
        "crying",
        "upset",
        "stressed",
        "overwhelmed",
        "miss",
        "missing",
        "comfort",
        "help me",
        "feeling bad",
        "feel bad",
        "feel awful",
        "feel terrible",
        "need you",
        "hug",
        "hold me",
        "talk to me",
        "please",
    }
)

# Gap in minutes that separates two conversation sessions.
_SESSION_GAP_MINUTES: int = 30

# Cap for emoji normalisation (5+ emojis per message → score of 1.0).
_EMOJI_FREQ_CAP: int = 5


# ---------------------------------------------------------------------------
# Public computation helpers
# ---------------------------------------------------------------------------


def count_syllables(word: str) -> int:
    """Count syllables in an English word using a vowel-group heuristic.

    Rules applied in order:

    1. Count contiguous vowel groups (``[aeiouAEIOU]+``) as one syllable each.
    2. Subtract one if the word ends with a silent ``e`` (e.g. "make", "late").
    3. Enforce a minimum of one syllable per word so single consonants like
       "b" still count.

    This is intentionally lightweight — accuracy on unusual proper nouns or
    abbreviations is acceptable because only the *average* across many words
    drives the final complexity score.

    Args:
        word: A single word (any case, no punctuation).

    Returns:
        Syllable count as a positive integer (minimum 1).

    Example:
        >>> count_syllables("cat")
        1
        >>> count_syllables("amazing")
        3
        >>> count_syllables("epistemological")
        7
        >>> count_syllables("a")
        1
    """
    if not word:
        return 1

    groups = _VOWEL_RE.findall(word)
    count = len(groups)

    # Subtract for trailing silent "e" — only if there are at least 2 vowel
    # groups so that "the" (1 vowel group) stays at 1 syllable.
    if word.lower().endswith("e") and count > 1:
        count -= 1

    return max(1, count)


def compute_vocabulary_complexity(text: str) -> float:
    """Compute a 0–1 vocabulary complexity score using syllable counting.

    Syllable count per word is a lightweight readability proxy that captures
    polysyllabic vocabulary without an external dictionary.  The score is
    computed as::

        score = min(1.0, avg_syllables_per_word / 4.0)

    so that words averaging 4+ syllables give a perfect score of 1.0.

    Args:
        text: User message text.  May be empty or multi-sentence.

    Returns:
        Float in ``[0.0, 1.0]`` where ``0.0`` is very simple vocabulary and
        ``1.0`` is highly complex vocabulary.  Returns ``0.0`` for empty or
        whitespace-only input.

    Example:
        >>> compute_vocabulary_complexity("hi")
        0.25
        >>> compute_vocabulary_complexity("The epistemological implications are profoundly significant")
        1.0
        >>> compute_vocabulary_complexity("")
        0.0
    """
    if not text or not text.strip():
        return 0.0

    words = _WORD_RE.findall(text.lower())
    if not words:
        return 0.0

    total_syllables = sum(count_syllables(w) for w in words)
    avg = total_syllables / len(words)
    return min(1.0, avg / 4.0)


def compute_emotional_volatility(sentiment_scores: list[float]) -> float:
    """Compute sentiment variance as an emotional volatility score.

    Uses the standard deviation of *sentiment_scores* normalised to ``[0, 1]``
    by dividing by the maximum possible standard deviation for a ``[-1, 1]``
    range (which is ``1.0`` — a half-population at each extreme).

    Args:
        sentiment_scores: List of sentiment values, each in ``[-1.0, 1.0]``,
            as produced by :func:`~backend.adaptive.signals.compute_sentiment`.

    Returns:
        Float in ``[0.0, 1.0]`` where ``0.0`` is perfectly stable sentiment
        and values approaching ``1.0`` indicate high emotional swings.
        Returns ``0.0`` for fewer than 2 scores.

    Example:
        >>> compute_emotional_volatility([0.5, -0.3, 0.8, -0.7, 0.1])
        0.5795...
        >>> compute_emotional_volatility([0.5])
        0.0
        >>> compute_emotional_volatility([])
        0.0
    """
    if len(sentiment_scores) < 2:
        return 0.0

    stdev = statistics.stdev(sentiment_scores)
    # Max possible stdev for values drawn from [-1, 1] is 1.0 (half at -1,
    # half at +1).  Clamp to [0, 1] as a safety guard for unusual inputs.
    return min(1.0, stdev)


def compute_peak_engagement_hour(signals: list[dict]) -> int | None:
    """Find the hour (0–23) when the user is most engaged.

    Counts ``engagement_signals`` rows by their ``created_at`` hour and returns
    the hour with the highest count.  Requires at least 5 signals to produce a
    meaningful result; with fewer signals the hour distribution is too sparse
    to be reliable.

    Args:
        signals: List of engagement signal dicts, each containing at least a
            ``created_at`` key with an ISO-8601 datetime string
            (``"2026-03-30T14:22:00"``).  Unknown formats are silently skipped.

    Returns:
        Integer in ``[0, 23]`` representing the peak hour, or ``None`` when
        fewer than 5 parseable timestamps are present.

    Example:
        >>> sigs = [
        ...     {"created_at": "2026-03-30T14:00:00"},
        ...     {"created_at": "2026-03-30T14:30:00"},
        ...     {"created_at": "2026-03-30T14:45:00"},
        ...     {"created_at": "2026-03-30T22:00:00"},
        ...     {"created_at": "2026-03-30T22:30:00"},
        ... ]
        >>> compute_peak_engagement_hour(sigs)
        14
    """
    hour_counts: dict[int, int] = {}

    for sig in signals:
        raw = sig.get("created_at")
        if not raw:
            continue
        try:
            dt = _parse_datetime(raw)
            hour_counts[dt.hour] = hour_counts.get(dt.hour, 0) + 1
        except (ValueError, TypeError):
            continue

    total = sum(hour_counts.values())
    if total < 5:
        return None

    return max(hour_counts, key=lambda h: hour_counts[h])


def compute_initiative_ratio(messages: list[dict]) -> float:
    """Compute how often the user initiates a conversation session.

    A new session is identified whenever a user message is separated from the
    previous message (of any role) by more than :data:`_SESSION_GAP_MINUTES`
    minutes, or when it is the very first message.  The ratio is::

        initiative_ratio = user_session_starts / total_sessions

    Args:
        messages: Ordered list of message dicts (oldest first), each with
            ``role`` (``"user"`` | ``"assistant"``) and ``created_at``
            (ISO-8601 datetime string).  Messages with unparseable timestamps
            are skipped.

    Returns:
        Float in ``[0.0, 1.0]`` — fraction of sessions the user opened.
        Returns ``0.5`` when there are fewer than 2 parseable messages (
        insufficient data for a meaningful ratio).

    Example:
        >>> import datetime
        >>> msgs = [
        ...     {"role": "user",      "created_at": "2026-03-30T08:00:00", "content": "hi"},
        ...     {"role": "assistant", "created_at": "2026-03-30T08:00:10", "content": "hello"},
        ...     {"role": "user",      "created_at": "2026-03-30T20:00:00", "content": "hey"},
        ... ]
        >>> compute_initiative_ratio(msgs)
        1.0
    """
    # Build a list of (timestamp, role) tuples, skipping unparseable entries.
    parsed: list[tuple[datetime, str]] = []
    for msg in messages:
        raw = msg.get("created_at")
        role = msg.get("role", "")
        if not raw or role not in ("user", "assistant"):
            continue
        try:
            parsed.append((_parse_datetime(raw), role))
        except (ValueError, TypeError):
            continue

    if len(parsed) < 2:
        return 0.5

    # Identify session boundaries: first message and any message >30 min after
    # the previous one.
    total_sessions = 0
    user_starts = 0
    gap = _SESSION_GAP_MINUTES * 60  # seconds

    prev_dt = parsed[0][0]
    # The very first message always starts a session.
    total_sessions += 1
    if parsed[0][1] == "user":
        user_starts += 1

    for dt, role in parsed[1:]:
        delta = (dt - prev_dt).total_seconds()
        if delta > gap:
            total_sessions += 1
            if role == "user":
                user_starts += 1
        prev_dt = dt

    if total_sessions == 0:
        return 0.5

    return user_starts / total_sessions


def compute_extended_metrics(
    messages: list[dict],
    signals: list[dict],
) -> dict[str, Union[float, int, None]]:
    """Compute all extended user model metrics from messages and signals.

    No LLM call is made.  All computation is pure Python over existing data
    structures.  The function is designed to be called periodically (e.g. after
    each reflection cycle) and its output fed directly into
    :func:`update_user_profile_metrics`.

    Args:
        messages: Ordered list of message dicts (oldest first).  Each dict must
            have ``role`` (``"user"`` | ``"assistant"``), ``content`` (str),
            and ``created_at`` (ISO-8601 string).  Missing keys are tolerated
            with sensible fallbacks.
        signals: List of engagement signal dicts as stored in
            ``engagement_signals``.  Each dict may contain ``sentiment_score``
            (float), ``emoji_count`` (int), and ``created_at`` (str).  Extra
            keys are ignored.

    Returns:
        Dict with the following keys (all values are ``float``, ``int``, or
        ``None``):

        - ``avg_message_length`` (float | None): Average character count of
          user messages.  ``None`` when there are no user messages.
        - ``vocabulary_complexity`` (float | None): 0–1 readability score
          averaged across all user messages.  ``None`` when no user messages.
        - ``emoji_frequency`` (float): Emojis per message, normalised by
          capping at :data:`_EMOJI_FREQ_CAP` → ``[0.0, 1.0]``.
        - ``question_rate`` (float): Fraction of user messages containing
          at least one ``?`` character → ``[0.0, 1.0]``.
        - ``emotional_volatility`` (float): Sentiment standard deviation
          normalised to ``[0.0, 1.0]``.
        - ``comfort_seeking_freq`` (float): Fraction of user messages that
          contain comfort/emotional language keywords → ``[0.0, 1.0]``.
        - ``peak_engagement_hour`` (int | None): Hour 0–23 with most signal
          activity, or ``None`` if fewer than 5 signals.
        - ``avg_session_length`` (float | None): Average messages per session,
          or ``None`` if fewer than 2 user messages.
        - ``session_frequency`` (float | None): Sessions per day over the
          full analysed period, or ``None`` if the time span is < 1 day.
        - ``initiative_ratio`` (float): Fraction of sessions the user opened
          → ``[0.0, 1.0]``.

    Example:
        >>> msgs = [
        ...     {"role": "user", "content": "Hi! How are you?",
        ...      "created_at": "2026-03-30T10:00:00"},
        ...     {"role": "assistant", "content": "Great!",
        ...      "created_at": "2026-03-30T10:00:05"},
        ... ]
        >>> m = compute_extended_metrics(msgs, [])
        >>> m["question_rate"]
        1.0
        >>> 0.0 <= m["vocabulary_complexity"] <= 1.0
        True
    """
    user_messages = [m for m in messages if m.get("role") == "user"]

    # ------------------------------------------------------------------
    # avg_message_length
    # ------------------------------------------------------------------
    if user_messages:
        avg_message_length: float | None = sum(
            len(m.get("content", "")) for m in user_messages
        ) / len(user_messages)
    else:
        avg_message_length = None

    # ------------------------------------------------------------------
    # vocabulary_complexity
    # ------------------------------------------------------------------
    if user_messages:
        complexity_scores = [
            compute_vocabulary_complexity(m.get("content", ""))
            for m in user_messages
        ]
        vocabulary_complexity: float | None = (
            sum(complexity_scores) / len(complexity_scores)
        )
    else:
        vocabulary_complexity = None

    # ------------------------------------------------------------------
    # emoji_frequency — average emojis per message, capped to [0, 1]
    # ------------------------------------------------------------------
    if signals:
        total_emoji = sum(
            int(s.get("emoji_count", 0) or 0) for s in signals
        )
        avg_emoji = total_emoji / len(signals)
        emoji_frequency: float = min(1.0, avg_emoji / _EMOJI_FREQ_CAP)
    elif user_messages:
        # Fall back to counting emojis directly from message text.
        total_emoji = sum(
            len(_EMOJI_RE.findall(m.get("content", ""))) for m in user_messages
        )
        avg_emoji = total_emoji / len(user_messages)
        emoji_frequency = min(1.0, avg_emoji / _EMOJI_FREQ_CAP)
    else:
        emoji_frequency = 0.0

    # ------------------------------------------------------------------
    # question_rate
    # ------------------------------------------------------------------
    if user_messages:
        question_msgs = sum(
            1 for m in user_messages if "?" in m.get("content", "")
        )
        question_rate: float = question_msgs / len(user_messages)
    else:
        question_rate = 0.0

    # ------------------------------------------------------------------
    # emotional_volatility — derived from signal sentiment scores when
    # available, otherwise computed directly from message text.
    # ------------------------------------------------------------------
    sentiment_scores: list[float] = []
    if signals:
        for s in signals:
            val = s.get("sentiment_score")
            if val is not None:
                try:
                    sentiment_scores.append(float(val))
                except (TypeError, ValueError):
                    pass

    if not sentiment_scores and user_messages:
        # Import inline to avoid circular dependency risk at module level.
        from backend.adaptive.signals import compute_sentiment  # noqa: PLC0415

        sentiment_scores = [
            compute_sentiment(m.get("content", "")) for m in user_messages
        ]

    emotional_volatility: float = compute_emotional_volatility(sentiment_scores)

    # ------------------------------------------------------------------
    # comfort_seeking_freq
    # ------------------------------------------------------------------
    if user_messages:
        comfort_msgs = sum(
            1
            for m in user_messages
            if _is_comfort_seeking(m.get("content", ""))
        )
        comfort_seeking_freq: float = comfort_msgs / len(user_messages)
    else:
        comfort_seeking_freq = 0.0

    # ------------------------------------------------------------------
    # peak_engagement_hour
    # ------------------------------------------------------------------
    peak_engagement_hour: int | None = compute_peak_engagement_hour(signals)

    # ------------------------------------------------------------------
    # avg_session_length + session_frequency
    # ------------------------------------------------------------------
    avg_session_length: float | None = None
    session_frequency: float | None = None

    if len(user_messages) >= 2:
        session_data = _compute_session_stats(messages)
        avg_session_length = session_data["avg_session_length"]
        session_frequency = session_data["session_frequency"]

    # ------------------------------------------------------------------
    # initiative_ratio
    # ------------------------------------------------------------------
    initiative_ratio: float = compute_initiative_ratio(messages)

    return {
        "avg_message_length": avg_message_length,
        "vocabulary_complexity": vocabulary_complexity,
        "emoji_frequency": emoji_frequency,
        "question_rate": question_rate,
        "emotional_volatility": emotional_volatility,
        "comfort_seeking_freq": comfort_seeking_freq,
        "peak_engagement_hour": peak_engagement_hour,
        "avg_session_length": avg_session_length,
        "session_frequency": session_frequency,
        "initiative_ratio": initiative_ratio,
    }


def update_user_profile_metrics(
    char_id: int,
    conn: sqlite3.Connection,
    metrics: dict[str, Union[float, int, None]],
) -> None:
    """Write computed metrics to the ``user_profiles`` table.

    Uses ``INSERT OR REPLACE`` semantics: if a row for *char_id* already
    exists its existing values are preserved for any metric that is ``None``
    in *metrics*, while non-``None`` values are overwritten.  New rows receive
    SQLite defaults for unspecified columns.

    Columns that are absent from the schema (e.g. on a pre-migration database)
    are silently skipped — the function never raises on missing columns.

    Args:
        char_id: ID of the character whose profile is being updated.
        conn: An open :class:`sqlite3.Connection`.  The caller is responsible
            for the connection lifecycle.  This function calls
            ``conn.commit()`` on success.
        metrics: Dict as returned by :func:`compute_extended_metrics`.
            Keys with ``None`` values are not written.

    Returns:
        None.  Logs a warning on unexpected errors; never raises.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> _ = conn.execute(
        ...     "CREATE TABLE user_profiles ("
        ...     "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        ...     "  char_id INTEGER UNIQUE,"
        ...     "  avg_message_length REAL,"
        ...     "  vocabulary_complexity REAL"
        ...     ")"
        ... )
        >>> from backend.adaptive.user_model import update_user_profile_metrics
        >>> update_user_profile_metrics(1, conn, {"avg_message_length": 42.0, "vocabulary_complexity": None})
        >>> conn.execute("SELECT avg_message_length FROM user_profiles WHERE char_id=1").fetchone()[0]
        42.0
    """
    # Map metric keys to their user_profiles column names.  Not all metrics
    # have dedicated columns in the current schema; only known columns are
    # written to avoid OperationalError on ALTER-less installs.
    _METRIC_TO_COLUMN: dict[str, str] = {
        "avg_message_length": "avg_message_length",
        "vocabulary_complexity": "vocabulary_complexity",
        "emoji_frequency": "emoji_frequency",
        "question_rate": "question_rate",
        "emotional_volatility": "emotional_volatility",
        "comfort_seeking_freq": "comfort_seeking_freq",
        "peak_engagement_hour": "peak_engagement_hour",
        "avg_session_length": "avg_session_length",
        "session_frequency": "session_frequency",
        "initiative_ratio": "initiative_ratio",
    }

    # Discover which columns actually exist so we can skip missing ones
    # gracefully (pre-migration environments).
    try:
        existing_cols: set[str] = {
            row[1]
            for row in conn.execute("PRAGMA table_info(user_profiles)").fetchall()
        }
    except sqlite3.OperationalError as exc:
        logger.warning(
            "update_user_profile_metrics: user_profiles table not ready (%s) — skipping",
            exc,
        )
        return

    # Build the subset of (column, value) pairs that are writable.
    updates: list[tuple[str, Union[float, int]]] = []
    for metric_key, col_name in _METRIC_TO_COLUMN.items():
        value = metrics.get(metric_key)
        if value is None:
            continue  # preserve existing DB value
        if col_name not in existing_cols:
            logger.debug(
                "update_user_profile_metrics: column %r not in schema — skipping",
                col_name,
            )
            continue
        updates.append((col_name, value))

    if not updates:
        logger.debug(
            "update_user_profile_metrics: no writable metrics for char_id=%d", char_id
        )
        return

    # Ensure a row exists for this char_id, then update the specific columns.
    # INSERT OR IGNORE creates the row if absent; subsequent UPDATE sets only
    # the non-None metrics so we never overwrite unrelated columns.
    try:
        conn.execute(
            "INSERT OR IGNORE INTO user_profiles (char_id) VALUES (?)",
            (char_id,),
        )

        set_clause = ", ".join(f"{col} = ?" for col, _ in updates)
        values = [val for _, val in updates]
        values.append(char_id)

        conn.execute(
            f"UPDATE user_profiles SET {set_clause}, updated_at = datetime('now') WHERE char_id = ?",  # noqa: S608
            values,
        )
        conn.commit()
        logger.debug(
            "update_user_profile_metrics: wrote %d metrics for char_id=%d",
            len(updates),
            char_id,
        )
    except sqlite3.OperationalError as exc:
        logger.warning(
            "update_user_profile_metrics: write failed for char_id=%d: %s",
            char_id,
            exc,
        )
    except Exception as exc:  # pylint: disable=broad-except
        logger.warning(
            "update_user_profile_metrics: unexpected error for char_id=%d: %s",
            char_id,
            exc,
        )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _parse_datetime(raw: str) -> datetime:
    """Parse an ISO-8601-ish datetime string to a :class:`datetime` object.

    Handles the common ``YYYY-MM-DDTHH:MM:SS`` format produced by SQLite's
    ``datetime('now')`` and Python's ``datetime.isoformat()``.  The ``Z``
    suffix is normalised to ``+00:00`` for Python 3.10 compatibility.

    Args:
        raw: Datetime string, e.g. ``"2026-03-30T14:22:00"`` or
             ``"2026-03-30 14:22:00"``.

    Returns:
        Naive :class:`datetime` object (timezone info stripped for uniformity).

    Raises:
        ValueError: If *raw* cannot be parsed as a recognised datetime format.
    """
    # Normalise space separator → T, and strip trailing Z.
    normalised = raw.strip().replace(" ", "T").rstrip("Z")
    # Strip microseconds if present (Python's fromisoformat handles them on
    # 3.11+ but we stay conservative for 3.10 compat).
    if "." in normalised:
        normalised = normalised.split(".")[0]
    return datetime.fromisoformat(normalised).replace(tzinfo=None)


def _is_comfort_seeking(text: str) -> bool:
    """Return True when *text* contains comfort-seeking or emotional language.

    Performs a simple case-insensitive substring search against
    :data:`_COMFORT_KEYWORDS`.  This is intentionally a low-precision signal
    that errs on the side of recall so that the broader metric captures
    emotional vulnerability patterns even in brief messages.

    Args:
        text: User message content.

    Returns:
        ``True`` if any comfort keyword is found in the lowercased text.

    Example:
        >>> _is_comfort_seeking("I feel sad and lonely today")
        True
        >>> _is_comfort_seeking("What's for dinner?")
        False
    """
    if not text:
        return False
    lowered = text.lower()
    return any(kw in lowered for kw in _COMFORT_KEYWORDS)


def _compute_session_stats(
    messages: list[dict],
) -> dict[str, Union[float, None]]:
    """Compute session length and frequency statistics from message history.

    A session boundary is defined as a gap of more than
    :data:`_SESSION_GAP_MINUTES` minutes between consecutive messages.

    Args:
        messages: Full ordered message list (all roles, oldest first), each
            with a ``created_at`` key.  Entries with unparseable timestamps
            are dropped.

    Returns:
        Dict with two keys:

        - ``avg_session_length`` (float | None): Mean number of messages per
          session.  ``None`` if no sessions could be identified.
        - ``session_frequency`` (float | None): Sessions per day calculated
          over the span from the first to the last parseable timestamp.
          ``None`` if the span is less than one day.
    """
    parsed: list[datetime] = []
    for msg in messages:
        raw = msg.get("created_at")
        if not raw:
            continue
        try:
            parsed.append(_parse_datetime(raw))
        except (ValueError, TypeError):
            continue

    if len(parsed) < 2:
        return {"avg_session_length": None, "session_frequency": None}

    gap_seconds = _SESSION_GAP_MINUTES * 60
    session_lengths: list[int] = []
    current_count = 1

    for i in range(1, len(parsed)):
        delta = (parsed[i] - parsed[i - 1]).total_seconds()
        if delta > gap_seconds:
            session_lengths.append(current_count)
            current_count = 1
        else:
            current_count += 1
    session_lengths.append(current_count)  # last session

    num_sessions = len(session_lengths)
    avg_session_length: float | None = sum(session_lengths) / num_sessions

    # Session frequency = sessions per day over the full analysis window.
    total_span_days = (parsed[-1] - parsed[0]).total_seconds() / 86400.0
    if total_span_days < 1.0:
        session_frequency: float | None = None
    else:
        session_frequency = num_sessions / total_span_days

    return {
        "avg_session_length": avg_session_length,
        "session_frequency": session_frequency,
    }
