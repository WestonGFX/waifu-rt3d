"""Persistence + clamping for Kokoro dial vectors.

The three vectors:

- ``MindState``    — Tier A (fast, per-turn) + Tier B (slow drift) + Tier F-fast
                     NSFW columns (always loaded; injected into prompt only
                     when the NSFW gate opens, see ``service.py``).
- ``TraitVector``  — Tier C (identity fingerprint, almost constant).
- ``ThreadState``  — Tier E (per-conversation scene) + Tier F-scene columns.

All numeric fields are floats in ``[0, 1]`` and are clamped on every write
via :func:`apply_state_delta`.  ``kink_alignment_vector`` is stored as a
JSON string per the v84 migration; consumers should ``json.loads`` it.

Functions in this module never read or write outside the three tables created
by migrations v83/v84.
"""
from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import asdict, dataclass, field, fields
from typing import Optional

logger = logging.getLogger(__name__)


# --- Dial tier definitions -------------------------------------------------
# These constants drive both the prompt-fragment renderer and the
# ``apply_state_delta`` clamp logic.  Order matters for the prompt builder.

TIER_A_FAST = (
    "mood", "arousal", "energy", "curiosity", "playfulness",
    "confidence", "vulnerability", "agency", "coherence",
    "focus", "tenderness", "humor_charge", "awe",
)
TIER_B_SLOW = (
    "loneliness", "restedness", "boredom_with_topic",
    "anticipation", "nostalgia",
)
TIER_F_FAST = ("desire_for_user", "inhibition", "boldness", "modesty")
TIER_F_SLOW = ("tension_buildup", "afterglow")

ALL_MIND_DIALS = TIER_A_FAST + TIER_B_SLOW + TIER_F_FAST + TIER_F_SLOW

TIER_C_TRAITS = (
    "openness", "warmth", "dominance", "mischief", "melancholy_tendency",
)

TIER_E_SCENE = ("tension", "intimacy_level", "comedic_energy")


# --- Dataclasses -----------------------------------------------------------


@dataclass
class MindState:
    """Tier A + B + F-fast/slow dials for a single character.

    All dials are floats in ``[0, 1]``.  Defaults match the row-defaults from
    the v83/v84 migrations so an unrowed character renders identically to
    a freshly-inserted one.
    """
    character_id: int
    # Tier A
    mood: float = 0.55
    arousal: float = 0.25
    energy: float = 0.75
    curiosity: float = 0.65
    playfulness: float = 0.45
    confidence: float = 0.55
    vulnerability: float = 0.25
    agency: float = 0.50
    coherence: float = 0.80
    focus: float = 0.55
    tenderness: float = 0.50
    humor_charge: float = 0.45
    awe: float = 0.40
    # Tier B
    loneliness: float = 0.30
    restedness: float = 0.75
    boredom_with_topic: float = 0.20
    anticipation: float = 0.40
    nostalgia: float = 0.30
    # Tier F-fast (NSFW, gated)
    desire_for_user: float = 0.0
    inhibition: float = 0.85
    boldness: float = 0.20
    modesty: float = 0.65
    # Tier F-slow (NSFW, gated)
    tension_buildup: float = 0.0
    afterglow: float = 0.0
    updated_at: Optional[str] = None


@dataclass
class TraitVector:
    """Tier C identity fingerprint (almost constant)."""
    character_id: int
    openness: float = 0.50
    warmth: float = 0.50
    dominance: float = 0.50
    mischief: float = 0.50
    melancholy_tendency: float = 0.30
    updated_at: Optional[str] = None


@dataclass
class ThreadState:
    """Tier E per-conversation scene state + Tier F-scene NSFW columns."""
    session_id: int
    tension: float = 0.20
    intimacy_level: float = 0.20
    comedic_energy: float = 0.40
    last_callback_memory_id: Optional[int] = None
    consent_check_pending: int = 0          # 0 / 1
    kink_alignment_vector: Optional[str] = None  # JSON string, see v84
    updated_at: Optional[str] = None


# --- Utilities -------------------------------------------------------------


def clamp01(n: float) -> float:
    """Clamp ``n`` to ``[0.0, 1.0]``.

    Non-finite values (``NaN``, ``inf``) collapse to ``0.0``.  This makes the
    function safe to apply to LLM-supplied deltas where the model may halucinate
    a non-numeric or out-of-range value.

    Args:
        n: Any float-like value.

    Returns:
        A float in ``[0.0, 1.0]``.

    Example:
        >>> clamp01(0.5)
        0.5
        >>> clamp01(1.7)
        1.0
        >>> clamp01(float('nan'))
        0.0
    """
    try:
        f = float(n)
    except (TypeError, ValueError):
        return 0.0
    if f != f:  # NaN
        return 0.0
    if f == float("inf") or f == float("-inf"):
        return 0.0
    if f < 0.0:
        return 0.0
    if f > 1.0:
        return 1.0
    return f


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys()}


# --- Load --------------------------------------------------------------------


def load_mind_state(con: sqlite3.Connection, character_id: int) -> MindState:
    """Load mind state for a character, returning defaults if no row exists.

    The function never inserts; persistence happens in :func:`save_mind_state`.
    This keeps reads cheap and lets callers decide whether a missing row
    should become a real row.

    Args:
        con: Open SQLite connection.
        character_id: Target character.

    Returns:
        ``MindState`` populated from the row, or all-defaults if absent.
    """
    con.row_factory = sqlite3.Row
    row = con.execute(
        "SELECT * FROM character_mind_state WHERE character_id = ?",
        (character_id,),
    ).fetchone()
    if row is None:
        return MindState(character_id=character_id)
    data = _row_to_dict(row)
    valid_keys = {f.name for f in fields(MindState)}
    return MindState(**{k: v for k, v in data.items() if k in valid_keys})


def load_traits(con: sqlite3.Connection, character_id: int) -> TraitVector:
    """Load Tier C identity traits, returning defaults if no row exists."""
    con.row_factory = sqlite3.Row
    row = con.execute(
        "SELECT * FROM character_traits WHERE character_id = ?",
        (character_id,),
    ).fetchone()
    if row is None:
        return TraitVector(character_id=character_id)
    data = _row_to_dict(row)
    valid_keys = {f.name for f in fields(TraitVector)}
    return TraitVector(**{k: v for k, v in data.items() if k in valid_keys})


def load_thread_state(con: sqlite3.Connection, session_id: int) -> ThreadState:
    """Load Tier E scene state for a session, returning defaults if absent."""
    con.row_factory = sqlite3.Row
    row = con.execute(
        "SELECT * FROM thread_state WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    if row is None:
        return ThreadState(session_id=session_id)
    data = _row_to_dict(row)
    valid_keys = {f.name for f in fields(ThreadState)}
    return ThreadState(**{k: v for k, v in data.items() if k in valid_keys})


# --- Save (upsert) ---------------------------------------------------------


def _upsert(con: sqlite3.Connection, table: str, key_col: str, payload: dict) -> None:
    """Generic ``INSERT ... ON CONFLICT DO UPDATE`` helper."""
    cols = list(payload.keys())
    placeholders = ", ".join("?" for _ in cols)
    set_clause = ", ".join(f"{c}=excluded.{c}" for c in cols if c != key_col)
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) "
        f"VALUES ({placeholders}) "
        f"ON CONFLICT({key_col}) DO UPDATE SET {set_clause}, "
        f"updated_at = datetime('now')"
    )
    con.execute(sql, tuple(payload[c] for c in cols))


def save_mind_state(con: sqlite3.Connection, state: MindState) -> None:
    """Upsert clamped mind state.  All dials clamped to ``[0, 1]`` on write."""
    payload = asdict(state)
    payload.pop("updated_at", None)
    for dial in ALL_MIND_DIALS:
        payload[dial] = clamp01(payload[dial])
    _upsert(con, "character_mind_state", "character_id", payload)


def save_thread_state(con: sqlite3.Connection, state: ThreadState) -> None:
    """Upsert thread scene state.  Tier E floats clamped; non-floats passed through."""
    payload = asdict(state)
    payload.pop("updated_at", None)
    for dial in TIER_E_SCENE:
        payload[dial] = clamp01(payload[dial])
    # consent_check_pending is INTEGER 0/1
    payload["consent_check_pending"] = 1 if int(payload.get("consent_check_pending") or 0) else 0
    _upsert(con, "thread_state", "session_id", payload)


# --- Apply delta -----------------------------------------------------------


def apply_state_delta(state: MindState, delta: dict) -> MindState:
    """Add bounded LLM-supplied deltas to a ``MindState``.

    The LLM is instructed to keep per-turn deltas small (-0.05..+0.05).  We
    additionally hard-cap each delta to that range here so a misbehaving model
    can't swing a dial wildly in a single turn.  All resulting values are
    clamped to ``[0, 1]``.

    Args:
        state: Current mind state (untouched).
        delta: Dict keyed by dial name.  Unknown keys are ignored.

    Returns:
        A new ``MindState`` with deltas applied.  The original is not mutated.

    Example:
        >>> s = MindState(character_id=1)
        >>> s2 = apply_state_delta(s, {"mood": 0.04, "garbage": 99})
        >>> round(s2.mood - s.mood, 3)
        0.04
    """
    PER_TURN_CAP = 0.05
    payload = asdict(state)
    for dial in ALL_MIND_DIALS:
        raw = delta.get(dial)
        if raw is None:
            continue
        try:
            d = float(raw)
        except (TypeError, ValueError):
            continue
        if d != d:  # NaN
            continue
        if d > PER_TURN_CAP:
            d = PER_TURN_CAP
        elif d < -PER_TURN_CAP:
            d = -PER_TURN_CAP
        payload[dial] = clamp01(payload[dial] + d)
    return MindState(**{k: v for k, v in payload.items() if k in {f.name for f in fields(MindState)}})


def parse_kink_vector(state: ThreadState) -> dict:
    """Return the parsed kink_alignment_vector as a dict (empty if missing/bad)."""
    raw = state.kink_alignment_vector
    if not raw:
        return {}
    try:
        v = json.loads(raw)
        return v if isinstance(v, dict) else {}
    except (json.JSONDecodeError, TypeError):
        logger.warning("kink_alignment_vector is not valid JSON for session %s", state.session_id)
        return {}
