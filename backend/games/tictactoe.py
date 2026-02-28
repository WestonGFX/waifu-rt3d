"""Tic-Tac-Toe game engine for the In-App Mini Games feature (A2 expansion).

Architecture:
    - Pure deterministic state machine — no LLM for game logic.
    - Two difficulty modes: "easy" (random valid moves) and "hard" (minimax).
    - LLM is called only once, at game end, for a character reaction line.
    - Board is a flat list of 9 cells: " ", "X", or "O".
    - Player is always "X"; AI character is always "O".

State schema::

    {
        "board":      [" ", ...],    # 9 cells, row-major
        "turn":       "X"|"O",       # whose move is next
        "winner":     str|None,      # "X", "O", or "draw"
        "finished":   bool,
        "difficulty": "easy"|"hard",
        "reaction":   str|None,      # LLM reaction at game end
    }
"""

from __future__ import annotations

import logging
import random
from typing import Any

logger = logging.getLogger(__name__)

# Winning combinations (indices into the board flat list)
_WINS = [
    (0, 1, 2), (3, 4, 5), (6, 7, 8),  # rows
    (0, 3, 6), (1, 4, 7), (2, 5, 8),  # columns
    (0, 4, 8), (2, 4, 6),             # diagonals
]


def new_state(difficulty: str = "hard") -> dict[str, Any]:
    """Create a fresh Tic-Tac-Toe game state.

    Args:
        difficulty: "easy" (random AI) or "hard" (minimax AI, unbeatable).

    Returns:
        Initial game state dict with empty board.

    Example:
        >>> state = new_state("easy")
        >>> state["board"] == [" "] * 9
        True
    """
    return {
        "board": [" "] * 9,
        "turn": "X",  # player always goes first
        "winner": None,
        "finished": False,
        "difficulty": difficulty if difficulty in ("easy", "hard") else "hard",
        "reaction": None,
    }


def player_move(state: dict, cell: int, adapter, cfg: dict) -> dict:
    """Apply the player's move at the given cell index (0–8).

    If the move is valid and the game isn't over, the AI immediately plays its
    response move before returning.

    Args:
        state: Current game state (mutated in place).
        cell: 0-based cell index (0 = top-left, 8 = bottom-right).
        adapter: Active LLM adapter (for end-of-game reaction only).
        cfg: App config dict.

    Returns:
        Updated state dict.  If ``finished`` is True, ``winner`` and
        ``reaction`` are populated.

    Example:
        >>> state = player_move(state, 4, adapter, cfg)  # centre cell
        >>> state["turn"] in ("X", "O", None)
        True
    """
    if state["finished"]:
        return state
    if not (0 <= cell <= 8) or state["board"][cell] != " ":
        return state  # invalid move — silently ignore
    if state["turn"] != "X":
        return state

    state["board"][cell] = "X"
    state["turn"] = "O"
    _check_game_over(state, adapter, cfg)

    if not state["finished"]:
        _ai_move(state, adapter, cfg)

    return state


def _ai_move(state: dict, adapter, cfg: dict) -> None:
    """Apply the AI's move based on difficulty.

    Args:
        state: Current game state (mutated in place).
        adapter: Active LLM adapter (for end-of-game reaction only).
        cfg: App config dict.
    """
    if state["difficulty"] == "easy":
        cell = _random_move(state["board"])
    else:
        cell = _minimax_best_move(state["board"])

    if cell is not None:
        state["board"][cell] = "O"
        state["turn"] = "X"
        _check_game_over(state, adapter, cfg)


def _check_game_over(state: dict, adapter, cfg: dict) -> None:
    """Check win/draw conditions and populate winner + reaction.

    Args:
        state: Current game state (mutated in place).
        adapter: Active LLM adapter.
        cfg: App config dict.
    """
    winner = _detect_winner(state["board"])
    if winner:
        state["winner"] = winner
        state["finished"] = True
        state["turn"] = "done"
        _generate_reaction(state, winner, adapter, cfg)
    elif " " not in state["board"]:
        state["winner"] = "draw"
        state["finished"] = True
        state["turn"] = "done"
        _generate_reaction(state, "draw", adapter, cfg)


def _detect_winner(board: list[str]) -> str | None:
    """Return "X", "O", or None based on the current board.

    Args:
        board: Flat list of 9 cell values.

    Returns:
        Winning player or None.
    """
    for a, b, c in _WINS:
        if board[a] != " " and board[a] == board[b] == board[c]:
            return board[a]
    return None


def _random_move(board: list[str]) -> int | None:
    """Pick a random empty cell.

    Args:
        board: Flat board list.

    Returns:
        Cell index or None if board is full.
    """
    empty = [i for i, v in enumerate(board) if v == " "]
    return random.choice(empty) if empty else None


def _minimax_best_move(board: list[str]) -> int | None:
    """Return the best cell for "O" using minimax with alpha-beta pruning.

    The minimax algorithm exhaustively searches all possible game outcomes,
    making the AI unbeatable in "hard" mode.

    Args:
        board: Flat board list.

    Returns:
        Best cell index for "O", or None if board is full.
    """
    best_score = -float("inf")
    best_cell: int | None = None
    for i, v in enumerate(board):
        if v == " ":
            board[i] = "O"
            score = _minimax(board, depth=0, is_max=False, alpha=-float("inf"), beta=float("inf"))
            board[i] = " "
            if score > best_score:
                best_score = score
                best_cell = i
    return best_cell


def _minimax(board: list[str], depth: int, is_max: bool, alpha: float, beta: float) -> float:
    """Minimax search with alpha-beta pruning.

    Args:
        board: Current board state.
        depth: Current search depth (used for score preference of faster wins).
        is_max: True when it's O's turn (maximiser).
        alpha: Alpha bound for pruning.
        beta: Beta bound for pruning.

    Returns:
        Score from O's perspective (positive = O winning).
    """
    winner = _detect_winner(board)
    if winner == "O":
        return 10 - depth
    if winner == "X":
        return depth - 10
    if " " not in board:
        return 0

    if is_max:
        best = -float("inf")
        for i, v in enumerate(board):
            if v == " ":
                board[i] = "O"
                best = max(best, _minimax(board, depth + 1, False, alpha, beta))
                board[i] = " "
                alpha = max(alpha, best)
                if beta <= alpha:
                    break
        return best
    else:
        best = float("inf")
        for i, v in enumerate(board):
            if v == " ":
                board[i] = "X"
                best = min(best, _minimax(board, depth + 1, True, alpha, beta))
                board[i] = " "
                beta = min(beta, best)
                if beta <= alpha:
                    break
        return best


def _generate_reaction(state: dict, result: str, adapter, cfg: dict) -> None:
    """Generate a short LLM reaction for game end.

    Args:
        state: Game state (``reaction`` populated in place).
        result: "X" (player won), "O" (AI won), or "draw".
        adapter: Active LLM adapter.
        cfg: App config dict.
    """
    if result == "X":
        prompt = "The player just beat you at Tic-Tac-Toe! React with genuine surprise and congratulations in 1-2 short sentences as a playful companion."
    elif result == "O":
        prompt = "You just won a game of Tic-Tac-Toe against the player! React with gentle playful gloating in 1-2 sentences as a companion — be fun, not mean."
    else:
        prompt = "You and the player just tied at Tic-Tac-Toe! React with surprised amusement in 1-2 short sentences."

    try:
        state["reaction"] = adapter.complete(
            prompt,
            system="You are a playful AI companion. React briefly.",
            **cfg.get("llm_kwargs", {}),
        ).strip()
    except Exception as exc:
        logger.warning("[TicTacToe] LLM reaction failed: %s", exc)
        if result == "X":
            state["reaction"] = "You beat me! That was impressive~ Well done! 🎉"
        elif result == "O":
            state["reaction"] = "I won! Don't worry, you'll get me next time~ 😊"
        else:
            state["reaction"] = "A draw! We're perfectly matched, it seems~"
