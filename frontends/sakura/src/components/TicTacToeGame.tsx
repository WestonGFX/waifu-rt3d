/**
 * TicTacToeGame — Feature A2 expansion: Tic-Tac-Toe vs AI companion.
 *
 * 3×3 grid rendered as HTML divs (no canvas needed).  Player is always X;
 * AI responds immediately after each move.  Hard mode = unbeatable minimax;
 * easy mode = random valid moves.  Character reacts at game end via LLM.
 */

import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { GameState } from '../lib/types';

interface Props {
  sessionId: number;
  initialState: GameState;
  charName: string;
  difficulty: 'easy' | 'hard';
  onExit: () => void;
}

const WINS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function getWinLine(board: string[]): number[] | null {
  for (const [a,b,c] of WINS) {
    if (board[a] !== ' ' && board[a] === board[b] && board[b] === board[c]) {
      return [a, b, c];
    }
  }
  return null;
}

/**
 * Tic-Tac-Toe game UI with animated board.
 *
 * @example
 * <TicTacToeGame sessionId={6} initialState={s} charName="Rin" difficulty="hard" onExit={fn} />
 */
export function TicTacToeGame({ sessionId, initialState, charName, difficulty, onExit }: Props) {
  const [state, setState] = useState<GameState>(initialState);
  const [loading, setLoading] = useState(false);

  const board = state.board ?? Array(9).fill(' ');
  const winLine = getWinLine(board);
  const turn = state.turn;
  const finished = state.finished;
  const winner = state.winner;

  const handleCell = useCallback(async (cell: number) => {
    if (loading || finished || board[cell] !== ' ' || turn !== 'X') return;
    setLoading(true);
    try {
      const res = await api.gameMove(sessionId, { cell }) as { state: GameState };
      setState(res.state);
    } finally {
      setLoading(false);
    }
  }, [loading, finished, board, turn, sessionId]);

  return (
    <div className="ttt-panel">
      <div className="hangman-header">
        <span className="game-panel-title">Tic-Tac-Toe</span>
        <div className="ttt-meta">
          <span className="ttt-mode">{difficulty === 'hard' ? '💀 Hard' : '😊 Easy'}</span>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={onExit}>← Back</button>
      </div>

      {/* Turn indicator */}
      {!finished && (
        <p className="ttt-turn">
          {turn === 'X' ? '⬜ Your turn (X)' : `⬛ ${charName} is thinking…`}
        </p>
      )}

      {/* Board */}
      <div className="ttt-board" style={{ opacity: loading ? 0.7 : 1 }}>
        {board.map((cell, i) => {
          const isWinCell = winLine?.includes(i);
          return (
            <button
              key={i}
              className={`ttt-cell
                ${cell === 'X' ? 'ttt-cell--x' : ''}
                ${cell === 'O' ? 'ttt-cell--o' : ''}
                ${isWinCell ? 'ttt-cell--win' : ''}
                ${!finished && cell === ' ' && turn === 'X' ? 'ttt-cell--hover' : ''}
              `}
              onClick={() => handleCell(i)}
              disabled={cell !== ' ' || finished || loading || turn !== 'X'}
              aria-label={`Cell ${i + 1}: ${cell === ' ' ? 'empty' : cell}`}
            >
              {cell !== ' ' && cell}
            </button>
          );
        })}
      </div>

      {/* Result */}
      {finished && (
        <div className={`hangman-result hangman-result--${winner === 'X' ? 'win' : winner === 'draw' ? 'draw' : 'loss'}`}>
          <p className="hangman-result-title">
            {winner === 'X' ? '🎉 You won!' : winner === 'draw' ? '🤝 Draw!' : `${charName} wins!`}
          </p>
          {state.reaction && <p className="hangman-result-reaction">{charName}: "{state.reaction}"</p>}
          <button className="btn btn-accent btn-sm" onClick={onExit}>Play again</button>
        </div>
      )}
    </div>
  );
}
