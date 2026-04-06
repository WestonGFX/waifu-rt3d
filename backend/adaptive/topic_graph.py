"""Topic graph with sentiment tracking for AIE Phase B.

Extracts topics from conversation text using keyword/bigram analysis (no LLM),
maintains per-character topic frequency and sentiment in the ``topic_tracking``
table, and exposes helpers for building compact context blocks injected into
the LLM prompt.

All processing is local and synchronous — no user data leaves the machine.

Schema dependency:
    - ``topic_tracking`` table (created by v66 migration)::

        CREATE TABLE IF NOT EXISTS topic_tracking (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            char_id         INTEGER NOT NULL,
            topic           TEXT NOT NULL,
            mention_count   INTEGER DEFAULT 1,
            total_sentiment REAL DEFAULT 0.0,
            avg_sentiment   REAL DEFAULT 0.0,
            first_seen_at   TEXT DEFAULT (datetime('now')),
            last_seen_at    TEXT DEFAULT (datetime('now')),
            is_emerging     INTEGER DEFAULT 0,
            UNIQUE(char_id, topic)
        )

Example:
    >>> from backend.adaptive.topic_graph import extract_topics
    >>> extract_topics("I love watching anime and cooking Japanese food")
    ['anime', 'cooking', 'japanese food']
"""

from __future__ import annotations

import logging
import re
import sqlite3
from collections import Counter
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Compiled patterns (module-level, initialised once)
# ---------------------------------------------------------------------------

# Splits text into lowercase alphabetic word tokens (strips punctuation/digits).
_WORD_RE: re.Pattern[str] = re.compile(r"[a-z]+")

# ---------------------------------------------------------------------------
# Stop words (~150 common English words) — topics containing only stop words
# are filtered out entirely.
# ---------------------------------------------------------------------------

STOP_WORDS: frozenset[str] = frozenset(
    {
        # articles / determiners
        "a", "an", "the", "this", "that", "these", "those", "some", "any",
        "all", "each", "every", "both", "few", "more", "most", "other",
        "such", "no", "nor",
        # pronouns
        "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
        "you", "your", "yours", "yourself", "yourselves",
        "he", "him", "his", "himself", "she", "her", "hers", "herself",
        "it", "its", "itself", "they", "them", "their", "theirs",
        "themselves", "what", "which", "who", "whom", "whose",
        # prepositions
        "in", "on", "at", "by", "for", "with", "about", "against",
        "between", "into", "through", "during", "before", "after",
        "above", "below", "to", "from", "up", "down", "out", "off",
        "over", "under", "again", "further", "then", "once",
        # conjunctions
        "and", "but", "or", "nor", "so", "yet", "as", "if", "although",
        "because", "since", "unless", "until", "while", "though",
        "whether", "both", "either", "neither",
        # auxiliary verbs
        "is", "am", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would",
        "shall", "should", "may", "might", "must", "can", "could",
        # common adverbs / filler
        "not", "just", "very", "quite", "really", "also", "too",
        "so", "here", "there", "now", "then", "always", "never",
        "often", "sometimes", "usually", "already", "still", "yet",
        "well", "even", "back", "way", "get", "got", "let", "like",
        "know", "think", "want", "see", "come", "said", "say", "make",
        "go", "going", "take", "time", "one", "two", "new", "good",
        "old", "great", "big", "little", "own", "right", "same",
        "much", "many", "more", "also", "how", "when", "where", "why",
        "use", "used", "using", "thing", "things", "bit", "lot",
        "kind", "look", "ask", "feel", "try", "put", "need", "keep",
        "work", "give", "something", "nothing", "everything", "anything",
        "someone", "anyone", "everyone", "however", "therefore",
        "although", "meanwhile", "actually", "basically", "literally",
        "obviously", "definitely", "probably", "maybe", "perhaps",
        "really", "seriously", "honestly", "totally", "completely",
        "especially", "particularly", "specifically", "generally",
    }
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def extract_topics(text: str, max_topics: int = 3) -> list[str]:
    """Extract the most relevant topic keywords and bigrams from free text.

    Uses pure keyword extraction — no LLM call required.  Stop words and
    short tokens are filtered out before counting.  Bigrams (adjacent 2-word
    pairs) that contain no stop words are weighted 1.5× relative to single
    words so that meaningful phrases rank above generic nouns.

    Args:
        text: Free-form text to analyse (any length; empty string returns ``[]``).
        max_topics: Maximum number of topics to return.  Defaults to ``3``.

    Returns:
        Deduplicated list of lowercase topic strings (single words and
        2-word phrases), sorted by relevance, capped at *max_topics*.

    Example:
        >>> extract_topics("I really love watching anime and cooking Japanese food")
        ['anime', 'cooking', 'japanese food']
        >>> extract_topics("", max_topics=5)
        []
        >>> extract_topics("the a an is", max_topics=3)
        []
    """
    if not text:
        return []

    words = _WORD_RE.findall(text.lower())
    # Filter: remove stop words and words shorter than 3 characters.
    filtered = [w for w in words if len(w) >= 3 and w not in STOP_WORDS]

    if not filtered:
        return []

    # --- Single-word frequency ---
    single_counts: Counter[str] = Counter(filtered)

    # --- Bigram extraction from the *original* filtered sequence ---
    # A bigram is valid only when both tokens survive the stop-word filter
    # (already guaranteed since we built `filtered` from the stop-word pass).
    # Bigrams must appear at least twice to be included — single adjacency is
    # noise (e.g. "anime cooking" from "watching anime and cooking" is not a
    # real phrase).  The 1.5× weight multiplier applies once the minimum
    # frequency threshold is cleared.
    bigram_counts: Counter[str] = Counter()
    for i in range(len(filtered) - 1):
        bigram = filtered[i] + " " + filtered[i + 1]
        bigram_counts[bigram] += 1

    # Merge into a unified score dict.
    # Bigrams receive a 1.5× weight multiplier; single words get 1.0×.
    scores: dict[str, float] = {}
    for word, count in single_counts.items():
        scores[word] = float(count) * 1.0

    for bigram, count in bigram_counts.items():
        if count >= 2:  # require at least two occurrences before promoting
            scores[bigram] = float(count) * 1.5

    if not scores:
        return []

    # Sort by descending score, then alphabetically for deterministic tiebreaking.
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))

    # Remove single-word entries whose words are already covered by a
    # higher-ranked bigram to avoid redundancy.
    seen_words: set[str] = set()
    result: list[str] = []
    for topic, _score in ranked:
        tokens = topic.split()
        # Skip if any constituent word is already captured by a bigram in results.
        if any(t in seen_words for t in tokens):
            continue
        result.append(topic)
        seen_words.update(tokens)
        if len(result) >= max_topics:
            break

    return result


def update_topic_tracking(
    char_id: int,
    topics: list[str],
    sentiment: float,
    conn: sqlite3.Connection,
) -> None:
    """Upsert topic mention counts and sentiment into ``topic_tracking``.

    For each topic in *topics*, either creates a new row or increments the
    existing row's ``mention_count`` and recalculates ``avg_sentiment``.
    After all upserts, rows that look "emerging" (recently high growth) are
    flagged with ``is_emerging = 1``.

    Emerging topic heuristic: a topic is considered emerging when it has been
    seen more than 3 times AND was first tracked within the last 14 days.
    This is a lightweight proxy that avoids needing a historical count snapshot
    while still surfacing genuinely new topics gaining traction.

    Args:
        char_id: Character ID that owns the conversation.
        topics: List of topic strings produced by :func:`extract_topics`.
        sentiment: Sentiment score in ``[-1.0, 1.0]`` for this turn, used to
            update the running average for each topic.
        conn: Open :class:`sqlite3.Connection`.  The caller is responsible for
            the connection lifecycle; this function commits internally.

    Returns:
        None.  Logs a warning when the table is absent and skips gracefully.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> conn.execute(
        ...     "CREATE TABLE topic_tracking ("
        ...     "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        ...     "  char_id INTEGER NOT NULL,"
        ...     "  topic TEXT NOT NULL,"
        ...     "  mention_count INTEGER DEFAULT 1,"
        ...     "  total_sentiment REAL DEFAULT 0.0,"
        ...     "  avg_sentiment REAL DEFAULT 0.0,"
        ...     "  first_seen_at TEXT DEFAULT (datetime('now')),"
        ...     "  last_seen_at TEXT DEFAULT (datetime('now')),"
        ...     "  is_emerging INTEGER DEFAULT 0,"
        ...     "  UNIQUE(char_id, topic)"
        ...     ")"
        ... )
        <sqlite3.Cursor object at ...>
        >>> from backend.adaptive.topic_graph import update_topic_tracking
        >>> update_topic_tracking(1, ["anime", "cooking"], 0.5, conn)
        >>> conn.execute(
        ...     "SELECT mention_count FROM topic_tracking WHERE topic='anime'"
        ... ).fetchone()[0]
        1
    """
    if not topics:
        return

    try:
        for topic in topics:
            # Attempt to INSERT; on conflict UPDATE the running totals.
            conn.execute(
                """INSERT INTO topic_tracking
                       (char_id, topic, mention_count, total_sentiment, avg_sentiment,
                        first_seen_at, last_seen_at, is_emerging)
                   VALUES (?, ?, 1, ?, ?, datetime('now'), datetime('now'), 0)
                   ON CONFLICT(char_id, topic) DO UPDATE SET
                       mention_count   = mention_count + 1,
                       total_sentiment = total_sentiment + excluded.total_sentiment,
                       avg_sentiment   = (total_sentiment + excluded.total_sentiment)
                                         / (mention_count + 1),
                       last_seen_at    = datetime('now')
                """,
                (char_id, topic, sentiment, sentiment),
            )

        # Flag emerging topics: mention_count > 3 AND first_seen within 14 days.
        conn.execute(
            """UPDATE topic_tracking
               SET is_emerging = 1
               WHERE char_id = ?
                 AND mention_count > 3
                 AND first_seen_at >= datetime('now', '-14 days')
            """,
            (char_id,),
        )

        # Clear the emerging flag for topics that have grown too old (> 14 days
        # since first seen) — they are established interests, not emerging ones.
        conn.execute(
            """UPDATE topic_tracking
               SET is_emerging = 0
               WHERE char_id = ?
                 AND first_seen_at < datetime('now', '-14 days')
            """,
            (char_id,),
        )

        conn.commit()

    except sqlite3.OperationalError as exc:
        logger.warning(
            "update_topic_tracking: topic_tracking table not ready (%s) — skipping",
            exc,
        )
    except Exception as exc:
        logger.warning(
            "update_topic_tracking: unexpected error for char_id=%d: %s", char_id, exc
        )


def get_emerging_topics(
    char_id: int,
    conn: sqlite3.Connection,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Fetch topics flagged as emerging for a character.

    Queries the ``topic_tracking`` table for rows where ``is_emerging = 1``,
    ordered by ``mention_count`` descending (most-discussed first).

    Args:
        char_id: Character ID to query.
        conn: Open :class:`sqlite3.Connection`.
        limit: Maximum number of rows to return.  Defaults to ``5``.

    Returns:
        List of dicts, each with keys: ``topic``, ``mention_count``,
        ``avg_sentiment``, ``first_seen_at``, ``last_seen_at``.
        Returns an empty list when the table is absent or no emerging topics
        are found.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> conn.execute(
        ...     "CREATE TABLE topic_tracking ("
        ...     "  id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER,"
        ...     "  topic TEXT, mention_count INTEGER DEFAULT 1,"
        ...     "  total_sentiment REAL DEFAULT 0.0, avg_sentiment REAL DEFAULT 0.0,"
        ...     "  first_seen_at TEXT, last_seen_at TEXT, is_emerging INTEGER DEFAULT 0,"
        ...     "  UNIQUE(char_id, topic))"
        ... )
        <sqlite3.Cursor object at ...>
        >>> from backend.adaptive.topic_graph import get_emerging_topics
        >>> get_emerging_topics(1, conn)
        []
    """
    try:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT topic, mention_count, avg_sentiment, first_seen_at, last_seen_at
               FROM topic_tracking
               WHERE char_id = ? AND is_emerging = 1
               ORDER BY mention_count DESC
               LIMIT ?""",
            (char_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    except sqlite3.OperationalError:
        return []
    except Exception as exc:
        logger.warning(
            "get_emerging_topics: query failed for char_id=%d: %s", char_id, exc
        )
        return []


def get_topic_affinities(
    char_id: int,
    conn: sqlite3.Connection,
) -> dict[str, float]:
    """Compute normalised affinity scores for all tracked topics.

    Affinity combines frequency and sentiment::

        affinity = mention_count * (0.5 + avg_sentiment * 0.5)

    A topic mentioned 10 times with avg_sentiment=1.0 scores 10.0; the same
    topic with avg_sentiment=-1.0 scores 0.0.  Results are normalised so the
    highest-affinity topic maps to ``1.0``.

    Only topics with ``mention_count > 2`` are included — singletons and
    first-mention topics are too noisy to trust.

    Args:
        char_id: Character ID to query.
        conn: Open :class:`sqlite3.Connection`.

    Returns:
        Dict mapping topic string → normalised affinity float in ``[0.0, 1.0]``.
        Returns an empty dict when the table is absent or no qualifying rows
        are found.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> conn.execute(
        ...     "CREATE TABLE topic_tracking ("
        ...     "  id INTEGER PRIMARY KEY AUTOINCREMENT, char_id INTEGER,"
        ...     "  topic TEXT, mention_count INTEGER DEFAULT 1,"
        ...     "  total_sentiment REAL DEFAULT 0.0, avg_sentiment REAL DEFAULT 0.0,"
        ...     "  first_seen_at TEXT, last_seen_at TEXT, is_emerging INTEGER DEFAULT 0,"
        ...     "  UNIQUE(char_id, topic))"
        ... )
        <sqlite3.Cursor object at ...>
        >>> from backend.adaptive.topic_graph import get_topic_affinities
        >>> get_topic_affinities(1, conn)
        {}
    """
    try:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT topic, mention_count, avg_sentiment
               FROM topic_tracking
               WHERE char_id = ? AND mention_count > 2
               ORDER BY mention_count DESC""",
            (char_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        return {}
    except Exception as exc:
        logger.warning(
            "get_topic_affinities: query failed for char_id=%d: %s", char_id, exc
        )
        return {}

    if not rows:
        return {}

    # Compute raw affinities.
    raw: dict[str, float] = {}
    for row in rows:
        topic: str = row["topic"]
        count: int = int(row["mention_count"])
        avg_sent: float = float(row["avg_sentiment"] or 0.0)
        raw[topic] = float(count) * (0.5 + avg_sent * 0.5)

    max_affinity = max(raw.values(), default=0.0)
    if max_affinity <= 0.0:
        # Avoid division by zero; return equal weights.
        equal = 1.0 / len(raw) if raw else 0.0
        return {t: equal for t in raw}

    return {topic: score / max_affinity for topic, score in raw.items()}


def build_topic_context_block(
    char_id: int,
    conn: sqlite3.Connection,
    max_tokens: int = 60,
) -> str:
    """Build a compact topic-context string for LLM prompt injection.

    Combines high-affinity interests with emerging topics into a single line
    that can be prepended to the system prompt, keeping the token budget tight.

    Format example::

        [User interests: anime (strong positive), cooking (moderate),
         philosophy (emerging)] [Avoid: politics (negative sentiment)]

    Args:
        char_id: Character ID to build context for.
        conn: Open :class:`sqlite3.Connection`.
        max_tokens: Approximate token budget for the output string.  The
            implementation uses a word-count proxy (1 token ≈ 0.75 words) and
            truncates the interests list to stay within budget.  Defaults to
            ``60``.

    Returns:
        Formatted context string, or an empty string when no topics are
        tracked yet or all tables are absent.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> from backend.adaptive.topic_graph import build_topic_context_block
        >>> build_topic_context_block(1, conn)
        ''
    """
    affinities = get_topic_affinities(char_id, conn)
    emerging = get_emerging_topics(char_id, conn, limit=3)
    emerging_names: set[str] = {e["topic"] for e in emerging}

    if not affinities and not emerging_names:
        return ""

    # Split topics into positive/neutral (affinity >= 0.3) and negative (< 0.3
    # AND avg_sentiment is negative) buckets for the avoid list.
    positive_topics: list[tuple[str, float]] = []
    avoid_topics: list[str] = []

    try:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT topic, avg_sentiment
               FROM topic_tracking
               WHERE char_id = ? AND mention_count > 2
               ORDER BY mention_count DESC""",
            (char_id,),
        ).fetchall()
        sentiment_map: dict[str, float] = {
            r["topic"]: float(r["avg_sentiment"] or 0.0) for r in rows
        }
    except sqlite3.OperationalError:
        sentiment_map = {}

    # Approximate token budget: 1 token ~ 0.75 words ~ 4 chars.
    budget_chars = max_tokens * 4
    chars_used = 0

    for topic, affinity in sorted(affinities.items(), key=lambda kv: -kv[1]):
        avg_sent = sentiment_map.get(topic, 0.0)
        if avg_sent < -0.2 and affinity < 0.3:
            avoid_topics.append(topic)
        else:
            positive_topics.append((topic, affinity))

    # Build interests segment — cap at top 5 by affinity.
    interest_parts: list[str] = []
    for topic, affinity in positive_topics[:5]:
        if topic in emerging_names:
            label = "emerging"
        elif affinity >= 0.75:
            avg_sent = sentiment_map.get(topic, 0.0)
            if avg_sent >= 0.4:
                label = "strong positive"
            elif avg_sent <= -0.3:
                label = "conflicted"
            else:
                label = "high interest"
        else:
            label = "moderate"

        entry = f"{topic} ({label})"
        chars_used += len(entry) + 2  # +2 for ", "
        if chars_used > budget_chars:
            break
        interest_parts.append(entry)

    # Append any emerging topics not already in the affinity list.
    for emerg in emerging:
        t = emerg["topic"]
        if t not in affinities and t not in {p for p, _ in positive_topics}:
            entry = f"{t} (emerging)"
            chars_used += len(entry) + 2
            if chars_used > budget_chars:
                break
            interest_parts.append(entry)

    parts: list[str] = []

    if interest_parts:
        parts.append("[User interests: " + ", ".join(interest_parts) + "]")

    if avoid_topics:
        avoid_str = ", ".join(f"{t} (negative sentiment)" for t in avoid_topics[:3])
        parts.append("[Avoid: " + avoid_str + "]")

    return " ".join(parts)
