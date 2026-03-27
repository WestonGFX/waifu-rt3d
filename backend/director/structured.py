"""Structured director mode for AI companion sessions.

Extends the base Director Mode (OOC note injection) with typed controls:

- **Pacing directives** — slow a scene over N messages or fast-forward past it.
- **Involvement tags** — track which characters are active, observing, or absent.
- **Style modes** — dialogue-heavy, narration-heavy, balanced, or action-focused.
- **Scene transitions** — fade-to-black, time-skip, and location-change markers.

State is held in a :class:`DirectorState` dataclass and JSON-serialised into
the ``sessions.director_state`` TEXT column.  The column is added on first
write if it doesn't exist yet, so no migration step is required.

Example::

    >>> state = DirectorState()
    >>> cmd = parse_director_command("/slow 3")
    >>> state = apply_command(state, cmd)
    >>> state.pacing
    'slow'
    >>> state.pacing_messages
    3
    >>> block = build_director_prompt_block(state, char_name="Dae")
    >>> "[Director Mode" in block
    True
"""

from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import asdict, dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class DirectorState:
    """Current director mode state for a session.

    Attributes:
        pacing: Narrative pacing mode — one of ``"slow"``, ``"normal"``,
            ``"fast"``, or ``"skip"``.
        style: Writing style mode — one of ``"dialogue"``, ``"narration"``,
            ``"balanced"``, or ``"action"``.
        pacing_messages: If > 0, the pacing mode lasts for this many
            assistant messages before reverting to ``"normal"``.
        pacing_counter: Counts assistant messages elapsed since the pacing
            directive was issued.  Compared against ``pacing_messages``.
        scene_transition: Active transition type (e.g. ``"fade-to-black"``,
            ``"time-skip"``, ``"location-change"``).  Empty string = none.
        involvement: Mapping of character name → role string.  Role is one
            of ``"active"``, ``"observing"``, or ``"absent"``.
        custom_notes: Persistent director notes injected on every turn until
            explicitly cleared.
    """

    pacing: str = "normal"
    style: str = "balanced"
    pacing_messages: int = 0
    pacing_counter: int = 0
    scene_transition: str = ""
    involvement: dict[str, str] = field(default_factory=dict)
    custom_notes: list[str] = field(default_factory=list)

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    def is_default(self) -> bool:
        """Return True if state is entirely default (no active directives).

        Used by :func:`build_director_prompt_block` to short-circuit token
        generation when no director controls are in effect.

        Returns:
            True only when every field holds its factory default value.

        Example:
            >>> DirectorState().is_default()
            True
            >>> s = DirectorState(pacing="slow")
            >>> s.is_default()
            False
        """
        return (
            self.pacing == "normal"
            and self.style == "balanced"
            and self.pacing_messages == 0
            and self.pacing_counter == 0
            and self.scene_transition == ""
            and not self.involvement
            and not self.custom_notes
        )

    def to_json(self) -> str:
        """Serialise state to a JSON string for DB storage.

        Returns:
            JSON-encoded representation of all fields.

        Example:
            >>> s = DirectorState(pacing="slow", pacing_messages=3)
            >>> import json; d = json.loads(s.to_json())
            >>> d["pacing"]
            'slow'
        """
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "DirectorState":
        """Deserialise state from a JSON string.

        Silently falls back to a default :class:`DirectorState` if ``raw``
        is empty, ``None``, or malformed JSON.

        Args:
            raw: JSON string previously produced by :meth:`to_json`, or an
                empty/null value when no state has been saved yet.

        Returns:
            A populated :class:`DirectorState` instance.

        Example:
            >>> s = DirectorState.from_json('{"pacing": "fast", "style": "balanced", '
            ...     '"pacing_messages": 0, "pacing_counter": 0, '
            ...     '"scene_transition": "", "involvement": {}, "custom_notes": []}')
            >>> s.pacing
            'fast'
            >>> DirectorState.from_json("").is_default()
            True
        """
        if not raw:
            return cls()
        try:
            data = json.loads(raw)
            return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
        except (json.JSONDecodeError, TypeError):
            return cls()


@dataclass
class DirectorCommand:
    """A parsed director command extracted from user input.

    Attributes:
        type: Command category — one of ``"pacing"``, ``"style"``,
            ``"transition"``, ``"involvement"``, or ``"note"``.
        value: The normalised command value (e.g. ``"slow"``, ``"narration"``,
            ``"fade-to-black"``).  For ``"involvement"`` commands this is a
            raw involvement string; for ``"note"`` it is the note text.
        raw: The original unmodified input string, preserved for logging.
    """

    type: str
    value: str
    raw: str


# ---------------------------------------------------------------------------
# Pacing and style prompt text maps
# ---------------------------------------------------------------------------

_PACING_INSTRUCTIONS: dict[str, str] = {
    "slow": (
        "Describe this moment in detail. "
        "Do not rush to the next plot point. "
        "Linger on sensory details, inner thoughts, and small gestures."
    ),
    "normal": "",
    "fast": (
        "Progress the scene quickly. "
        "Summarise routine actions and skip over downtime."
    ),
    "skip": (
        "Fast-forward past this scene. "
        "Summarise briefly what happens, then continue from the next meaningful moment."
    ),
}

_STYLE_INSTRUCTIONS: dict[str, str] = {
    "dialogue": (
        "Focus on character dialogue. "
        "Minimise narration to brief action beats between lines of speech."
    ),
    "narration": (
        "Write in descriptive prose. "
        "Dialogue should be sparse and carry significant weight when it appears."
    ),
    "balanced": "",
    "action": (
        "Focus on physical actions and movement. "
        "Use short, punchy sentences. "
        "Keep dialogue minimal and purposeful."
    ),
}

# Canonical transition names mapped from common shorthand / aliases
_TRANSITION_ALIASES: dict[str, str] = {
    "fade": "fade-to-black",
    "fade-to-black": "fade-to-black",
    "fadeout": "fade-to-black",
    "timeskip": "time-skip",
    "time-skip": "time-skip",
    "skip": "time-skip",
    "location": "location-change",
    "location-change": "location-change",
    "move": "location-change",
    "cut": "hard-cut",
    "hard-cut": "hard-cut",
}

# Canonical style aliases
_STYLE_ALIASES: dict[str, str] = {
    "dialogue": "dialogue",
    "dialogue-heavy": "dialogue",
    "dialog": "dialogue",
    "narration": "narration",
    "narration-heavy": "narration",
    "narrative": "narration",
    "narrate": "narration",
    "balanced": "balanced",
    "balance": "balanced",
    "action": "action",
    "action-focused": "action",
    "action-heavy": "action",
}

# Canonical pacing aliases
_PACING_ALIASES: dict[str, str] = {
    "slow": "slow",
    "slowly": "slow",
    "normal": "normal",
    "fast": "fast",
    "quick": "fast",
    "skip": "skip",
    "fastforward": "skip",
    "fast-forward": "skip",
}


# ---------------------------------------------------------------------------
# Command parser
# ---------------------------------------------------------------------------

# Structured keyword commands: "pace: slow over 3", "style: narration"
_RE_PACE_KEYWORD = re.compile(
    r"^(?:pace|pacing)\s*:\s*(?P<mode>\w[\w-]*)"
    r"(?:\s+over\s+(?P<n>\d+)\s+messages?)?",
    re.IGNORECASE,
)
_RE_STYLE_KEYWORD = re.compile(
    r"^style\s*:\s*(?P<style>[\w-]+)",
    re.IGNORECASE,
)
_RE_TRANSITION_KEYWORD = re.compile(
    r"^transition\s*:\s*(?P<trans>[\w-]+)(?:\s+(?P<detail>.+))?",
    re.IGNORECASE,
)
_RE_INVOLVE_KEYWORD = re.compile(
    r"^involve(?:ment)?\s*:\s*(?P<spec>.+)",
    re.IGNORECASE,
)
_RE_NOTE_KEYWORD = re.compile(
    r"^note\s*:\s*(?P<text>.+)",
    re.IGNORECASE,
)

# Slash shorthand commands
_RE_SLASH_SLOW = re.compile(r"^/slow(?:\s+(?P<n>\d+))?", re.IGNORECASE)
_RE_SLASH_FAST = re.compile(r"^/fast", re.IGNORECASE)
_RE_SLASH_SKIP = re.compile(r"^/skip", re.IGNORECASE)
_RE_SLASH_NORMAL = re.compile(r"^/normal", re.IGNORECASE)
_RE_SLASH_STYLE = re.compile(
    r"^/(?P<style>narrate|narration|dialogue|dialog|action|balanced)",
    re.IGNORECASE,
)
_RE_SLASH_FADE = re.compile(r"^/fade", re.IGNORECASE)
_RE_SLASH_CUT = re.compile(r"^/cut", re.IGNORECASE)


def parse_director_command(text: str) -> Optional[DirectorCommand]:
    """Parse structured director commands from user input.

    Supports natural language keyword commands:

    - ``"pace: slow over 3 messages"`` — slow pacing for 3 turns
    - ``"pace: fast"`` — fast pacing indefinitely
    - ``"style: narration-heavy"`` — switch to prose style
    - ``"transition: time-skip to next morning"`` — scene transition
    - ``"involve: Dae active, Luna observing"`` — character involvement
    - ``"note: She should seem distracted"`` — persistent director note

    And shorthand slash commands:

    - ``"/slow 3"`` → pacing slow for 3 messages
    - ``"/slow"`` → pacing slow indefinitely
    - ``"/fast"`` → pacing fast
    - ``"/skip"`` → pacing skip (fast-forward)
    - ``"/normal"`` → reset pacing to normal
    - ``"/narrate"`` → style narration
    - ``"/dialogue"`` → style dialogue
    - ``"/action"`` → style action
    - ``"/balanced"`` → style balanced
    - ``"/fade"`` → transition fade-to-black
    - ``"/cut"`` → transition hard-cut

    Args:
        text: Raw user input string.

    Returns:
        A :class:`DirectorCommand` if the input matches a recognised pattern,
        or ``None`` if it should be treated as a plain conversational message.

    Example:
        >>> cmd = parse_director_command("pace: slow over 3 messages")
        >>> cmd.type
        'pacing'
        >>> cmd.value
        'slow|3'

        >>> cmd = parse_director_command("/narrate")
        >>> cmd.type
        'style'
        >>> cmd.value
        'narration'

        >>> parse_director_command("hello there") is None
        True
    """
    stripped = text.strip()

    # --- slash shorthand -------------------------------------------------

    m = _RE_SLASH_SLOW.match(stripped)
    if m:
        n = int(m.group("n")) if m.group("n") else 0
        value = f"slow|{n}" if n else "slow|0"
        return DirectorCommand(type="pacing", value=value, raw=text)

    if _RE_SLASH_FAST.match(stripped):
        return DirectorCommand(type="pacing", value="fast|0", raw=text)

    if _RE_SLASH_SKIP.match(stripped):
        return DirectorCommand(type="pacing", value="skip|0", raw=text)

    if _RE_SLASH_NORMAL.match(stripped):
        return DirectorCommand(type="pacing", value="normal|0", raw=text)

    m = _RE_SLASH_STYLE.match(stripped)
    if m:
        raw_style = m.group("style").lower()
        style = _STYLE_ALIASES.get(raw_style, "balanced")
        return DirectorCommand(type="style", value=style, raw=text)

    if _RE_SLASH_FADE.match(stripped):
        return DirectorCommand(type="transition", value="fade-to-black", raw=text)

    if _RE_SLASH_CUT.match(stripped):
        return DirectorCommand(type="transition", value="hard-cut", raw=text)

    # --- keyword commands -------------------------------------------------

    m = _RE_PACE_KEYWORD.match(stripped)
    if m:
        raw_mode = m.group("mode").lower()
        mode = _PACING_ALIASES.get(raw_mode, "normal")
        n = int(m.group("n")) if m.group("n") else 0
        return DirectorCommand(type="pacing", value=f"{mode}|{n}", raw=text)

    m = _RE_STYLE_KEYWORD.match(stripped)
    if m:
        raw_style = m.group("style").lower()
        style = _STYLE_ALIASES.get(raw_style, "balanced")
        return DirectorCommand(type="style", value=style, raw=text)

    m = _RE_TRANSITION_KEYWORD.match(stripped)
    if m:
        raw_trans = m.group("trans").lower()
        canonical = _TRANSITION_ALIASES.get(raw_trans, raw_trans)
        detail = m.group("detail") or ""
        value = f"{canonical}|{detail.strip()}" if detail.strip() else canonical
        return DirectorCommand(type="transition", value=value, raw=text)

    m = _RE_INVOLVE_KEYWORD.match(stripped)
    if m:
        return DirectorCommand(type="involvement", value=m.group("spec").strip(), raw=text)

    m = _RE_NOTE_KEYWORD.match(stripped)
    if m:
        return DirectorCommand(type="note", value=m.group("text").strip(), raw=text)

    return None


# ---------------------------------------------------------------------------
# State mutation
# ---------------------------------------------------------------------------


def apply_command(state: DirectorState, command: DirectorCommand) -> DirectorState:
    """Apply a director command to the current state, returning updated state.

    Creates a copy of ``state`` with the relevant fields mutated.  The
    original state is not modified (dataclass copy via ``asdict`` + rebuild).

    Args:
        state: The current :class:`DirectorState`.
        command: A :class:`DirectorCommand` from :func:`parse_director_command`.

    Returns:
        A new :class:`DirectorState` reflecting the command.

    Example:
        >>> from backend.director.structured import DirectorState, DirectorCommand, apply_command
        >>> s = DirectorState()
        >>> cmd = DirectorCommand(type="pacing", value="slow|3", raw="/slow 3")
        >>> s2 = apply_command(s, cmd)
        >>> s2.pacing, s2.pacing_messages
        ('slow', 3)
        >>> s2.pacing_counter
        0
    """
    data = asdict(state)

    if command.type == "pacing":
        parts = command.value.split("|", 1)
        mode = parts[0]
        n = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
        data["pacing"] = mode
        data["pacing_messages"] = n
        data["pacing_counter"] = 0

    elif command.type == "style":
        data["style"] = command.value

    elif command.type == "transition":
        # Store the transition name only (strip optional detail suffix for display)
        trans_parts = command.value.split("|", 1)
        data["scene_transition"] = trans_parts[0]

    elif command.type == "involvement":
        involvement: dict[str, str] = dict(data["involvement"])
        # Parse "Dae active, Luna observing, Rei absent"
        for segment in re.split(r"\s*,\s*", command.value):
            segment = segment.strip()
            if not segment:
                continue
            # Match "CharName role" — role is optional, defaults to "active"
            role_match = re.match(
                r"^(?P<name>.+?)\s+(?P<role>active|observing|absent)$",
                segment,
                re.IGNORECASE,
            )
            if role_match:
                char = role_match.group("name").strip()
                role = role_match.group("role").lower()
                if role == "absent":
                    involvement.pop(char, None)
                else:
                    involvement[char] = role
            else:
                # Bare name with no role — default to active
                involvement[segment] = "active"
        data["involvement"] = involvement

    elif command.type == "note":
        notes: list[str] = list(data["custom_notes"])
        notes.append(command.value)
        data["custom_notes"] = notes

    return DirectorState(**data)


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

_PACING_LABEL: dict[str, str] = {
    "slow": "Slow",
    "normal": "Normal",
    "fast": "Fast",
    "skip": "Skip (fast-forward)",
}

_STYLE_LABEL: dict[str, str] = {
    "dialogue": "Dialogue-heavy",
    "narration": "Narration-heavy",
    "balanced": "Balanced",
    "action": "Action-focused",
}

_TRANSITION_LABEL: dict[str, str] = {
    "fade-to-black": "Fade-to-black transition in progress",
    "time-skip": "Time-skip transition in progress",
    "location-change": "Location-change transition in progress",
    "hard-cut": "Hard-cut transition in progress",
}


def build_director_prompt_block(state: DirectorState, char_name: str = "") -> str:
    """Build a system prompt block from the current director state.

    Returns an empty string when ``state`` is entirely default — no wasted
    tokens are injected into an unmodified session.

    The returned block is intended to be appended to the character system
    prompt (or injected as a late system note) by the context assembler.

    Args:
        state: Current :class:`DirectorState` to render.
        char_name: Optional character name used in involvement display.
            Has no functional effect; reserved for future personalisation.

    Returns:
        A formatted multi-line string beginning with
        ``[Director Mode — Active]``, or an empty string if state is default.

    Example:
        >>> from backend.director.structured import DirectorState, build_director_prompt_block
        >>> s = DirectorState(pacing="slow", pacing_messages=3, pacing_counter=1,
        ...                   style="narration",
        ...                   custom_notes=["She should seem distracted"])
        >>> block = build_director_prompt_block(s)
        >>> block.startswith("[Director Mode")
        True
        >>> "2/3 messages remaining" in block
        True
        >>> "Narration-heavy" in block
        True
        >>> "She should seem distracted" in block
        True

        >>> build_director_prompt_block(DirectorState())
        ''
    """
    if state.is_default():
        return ""

    lines: list[str] = ["[Director Mode — Active]"]

    # Pacing line
    if state.pacing != "normal":
        label = _PACING_LABEL.get(state.pacing, state.pacing.title())
        if state.pacing_messages > 0:
            remaining = max(0, state.pacing_messages - state.pacing_counter)
            lines.append(f"Pacing: {label} ({remaining}/{state.pacing_messages} messages remaining)")
        else:
            lines.append(f"Pacing: {label}")
        instruction = _PACING_INSTRUCTIONS.get(state.pacing, "")
        if instruction:
            lines.append(f"  → {instruction}")

    # Style line
    if state.style != "balanced":
        label = _STYLE_LABEL.get(state.style, state.style.title())
        instruction = _STYLE_INSTRUCTIONS.get(state.style, "")
        if instruction:
            lines.append(f"Style: {label} — {instruction}")
        else:
            lines.append(f"Style: {label}")

    # Scene transition
    if state.scene_transition:
        trans_label = _TRANSITION_LABEL.get(
            state.scene_transition,
            f"{state.scene_transition.replace('-', ' ').title()} transition in progress",
        )
        lines.append(f"Scene: {trans_label}")

    # Involvement
    if state.involvement:
        parts = [f"{name} ({role})" for name, role in state.involvement.items()]
        lines.append("Characters: " + ", ".join(parts))

    # Notes
    if state.custom_notes:
        lines.append("Notes:")
        for note in state.custom_notes:
            lines.append(f"  → {note}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Pacing advancement
# ---------------------------------------------------------------------------


def advance_pacing(state: DirectorState) -> DirectorState:
    """Advance the pacing counter after each assistant message.

    When ``pacing_messages`` > 0 and ``pacing_counter`` has reached
    ``pacing_messages``, the pacing resets to ``"normal"`` and the counter
    and limit are both cleared.

    This should be called once per assistant turn while director mode is
    active.  If pacing is already ``"normal"`` or ``pacing_messages`` is
    zero (indefinite), the state is returned unchanged.

    Args:
        state: The current :class:`DirectorState`.

    Returns:
        Updated :class:`DirectorState` with pacing counter incremented or
        pacing reset to normal upon completion.

    Example:
        >>> from backend.director.structured import DirectorState, advance_pacing
        >>> s = DirectorState(pacing="slow", pacing_messages=2, pacing_counter=0)
        >>> s = advance_pacing(s)
        >>> s.pacing_counter
        1
        >>> s = advance_pacing(s)
        >>> s.pacing
        'normal'
        >>> s.pacing_messages
        0
    """
    if state.pacing == "normal" or state.pacing_messages == 0:
        return state

    new_counter = state.pacing_counter + 1
    if new_counter >= state.pacing_messages:
        # Pacing directive fulfilled — reset to defaults
        data = asdict(state)
        data["pacing"] = "normal"
        data["pacing_messages"] = 0
        data["pacing_counter"] = 0
        return DirectorState(**data)

    data = asdict(state)
    data["pacing_counter"] = new_counter
    return DirectorState(**data)


# ---------------------------------------------------------------------------
# DB persistence
# ---------------------------------------------------------------------------

_ENSURE_COLUMN_SQL = "ALTER TABLE sessions ADD COLUMN director_state TEXT DEFAULT ''"


def _ensure_director_column(conn: sqlite3.Connection) -> None:
    """Add ``director_state`` column to sessions table if absent.

    Performs a harmless probe SELECT first; only issues the ALTER TABLE
    when the column is genuinely missing.  Both the probe failure and the
    ALTER TABLE failure are silently swallowed — the latter covers the race
    where two concurrent writers both detect the missing column.

    Args:
        conn: Active SQLite connection.
    """
    try:
        conn.execute("SELECT director_state FROM sessions LIMIT 0")
    except sqlite3.OperationalError:
        try:
            conn.execute(_ENSURE_COLUMN_SQL)
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Already added by a concurrent writer, or table missing


def load_director_state(session_id: int, conn: sqlite3.Connection) -> DirectorState:
    """Load director state from the sessions table.

    Reads the ``director_state`` TEXT column for ``session_id`` and
    deserialises it.  If the column doesn't exist it is created.  If the
    row has no saved state (NULL or empty string) a default
    :class:`DirectorState` is returned.

    Args:
        session_id: Primary key of the session row.
        conn: Active SQLite connection (read access required).

    Returns:
        Deserialised :class:`DirectorState`, or a default instance if no
        state has been saved yet.

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> _ = conn.execute("CREATE TABLE sessions (id INTEGER PRIMARY KEY, director_state TEXT DEFAULT '')")
        >>> _ = conn.execute("INSERT INTO sessions (id) VALUES (1)")
        >>> conn.commit()
        >>> from backend.director.structured import load_director_state
        >>> state = load_director_state(1, conn)
        >>> state.is_default()
        True
    """
    _ensure_director_column(conn)
    try:
        row = conn.execute(
            "SELECT director_state FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
    except sqlite3.OperationalError:
        return DirectorState()

    if row is None:
        return DirectorState()

    raw: str = row[0] or ""
    return DirectorState.from_json(raw)


def save_director_state(
    session_id: int,
    state: DirectorState,
    conn: sqlite3.Connection,
) -> None:
    """Save director state to the sessions table as JSON.

    Upserts the ``director_state`` column for the given ``session_id``.
    If the column doesn't exist it is created first.

    Args:
        session_id: Primary key of the session row to update.
        state: The :class:`DirectorState` to persist.
        conn: Active SQLite connection (write access required).

    Example:
        >>> import sqlite3
        >>> conn = sqlite3.connect(":memory:")
        >>> _ = conn.execute("CREATE TABLE sessions (id INTEGER PRIMARY KEY, director_state TEXT DEFAULT '')")
        >>> _ = conn.execute("INSERT INTO sessions (id) VALUES (1)")
        >>> conn.commit()
        >>> from backend.director.structured import DirectorState, save_director_state, load_director_state
        >>> s = DirectorState(pacing="fast")
        >>> save_director_state(1, s, conn)
        >>> loaded = load_director_state(1, conn)
        >>> loaded.pacing
        'fast'
    """
    _ensure_director_column(conn)
    conn.execute(
        "UPDATE sessions SET director_state = ? WHERE id = ?",
        (state.to_json(), session_id),
    )
    conn.commit()
