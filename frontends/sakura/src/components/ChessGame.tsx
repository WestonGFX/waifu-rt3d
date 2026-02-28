/**
 * ChessGame — Feature A2 expansion: Chess vs AI companion.
 *
 * Uses chess.js for game rules/validation. Renders a Unicode-piece board in
 * HTML/CSS (no canvas). AI opponent makes moves via a simple weighted strategy
 * (captures preferred, center control bonused). Character reacts via LLM
 * at key moments (captures, checks, game end).
 *
 * Player is always white; AI character is black.
 */

import { useState, useCallback, useEffect } from 'react';
import { Chess } from 'chess.js';

interface Props {
  charName: string;
  /** Called when user wants to exit the game. */
  onExit: () => void;
  /** Optional character ID for LLM reactions (passed to API). */
  characterId?: number;
}

const PIECE_UNICODE: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

// Piece values for simple AI evaluation
const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

// Center bonus squares
const CENTER = new Set(['e4','e5','d4','d5']);
const NEAR_CENTER = new Set(['c3','c4','c5','c6','d3','d6','e3','e6','f3','f4','f5','f6']);

/** Simple evaluation of a position from black's POV (negative = worse for black). */
function evaluateMove(chess: Chess, move: { from: string; to: string }): number {
  chess.move(move);
  let score = 0;

  // Material balance
  const board = chess.board();
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      const val = PIECE_VALUES[sq.type] ?? 0;
      score += sq.color === 'b' ? val : -val;
    }
  }

  // Center control bonus
  if (CENTER.has(move.to)) score += 30;
  else if (NEAR_CENTER.has(move.to)) score += 15;

  // Check bonus
  if (chess.inCheck()) score += 50;

  chess.undo();
  return score;
}

/** Pick AI move: find the best scoring move with slight randomness. */
function aiMove(chess: Chess): { from: string; to: string } | null {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;

  // Score all moves, pick best (with small random noise to avoid repetition)
  let best = -Infinity;
  let bestMove = moves[0];
  for (const m of moves) {
    const score = evaluateMove(chess, m) + (Math.random() * 10);
    if (score > best) { best = score; bestMove = m; }
  }
  return bestMove;
}

/**
 * Chess game UI powered by chess.js.
 *
 * @example
 * <ChessGame charName="Rin" onExit={fn} characterId={1} />
 */
export function ChessGame({ charName, onExit, characterId }: Props) {
  const [chess] = useState(() => new Chess());
  const [board, setBoard] = useState(() => chess.board());
  const [selected, setSelected] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<'playing' | 'white_win' | 'black_win' | 'draw'>('playing');
  const [reaction, setReaction] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [promotionPending, setPromotionPending] = useState<string | null>(null);

  const updateStatus = useCallback(() => {
    if (chess.isCheckmate()) {
      setStatus(chess.turn() === 'w' ? 'black_win' : 'white_win');
    } else if (chess.isDraw() || chess.isStalemate()) {
      setStatus('draw');
    }
    setBoard([...chess.board()]);
  }, [chess]);

  const fetchReaction = useCallback(async (prompt: string) => {
    if (!characterId) return;
    try {
      // Quick LLM call via API — we'll reuse the game move API for reactions
      // by sending a dummy "reaction" action (gracefully handled by backend)
      const res = await fetch('/api/chat/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character_id: characterId, message: prompt, system_only: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setReaction(data.response ?? null);
      }
    } catch { /* non-critical */ }
  }, [characterId]);

  const doAiMove = useCallback(async () => {
    if (chess.turn() !== 'b' || status !== 'playing') return;
    setAiThinking(true);
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400)); // thinking delay

    const move = aiMove(chess);
    if (move) {
      const result = chess.move(move);
      setLastMove({ from: result.from, to: result.to });

      // React to check
      if (chess.inCheck()) {
        fetchReaction(`You just put the player in check in chess! React briefly in 1-2 playful sentences.`);
      }
    }
    updateStatus();
    setAiThinking(false);
  }, [chess, status, fetchReaction, updateStatus]);

  const handleSquareClick = useCallback(async (sq: string) => {
    if (chess.turn() !== 'w' || status !== 'playing' || aiThinking) return;

    if (selected) {
      if (legalMoves.has(sq)) {
        // Check if pawn promotion needed
        const piece = chess.get(selected as Parameters<typeof chess.get>[0]);
        if (piece?.type === 'p' && sq[1] === '8') {
          setPromotionPending(sq);
          return;
        }
        const result = chess.move({ from: selected, to: sq });
        if (result) {
          setLastMove({ from: result.from, to: result.to });
          setSelected(null);
          setLegalMoves(new Set());
          updateStatus();
          if (chess.turn() === 'b' && !chess.isGameOver()) {
            await doAiMove();
          }
        }
      } else {
        setSelected(null);
        setLegalMoves(new Set());
      }
      return;
    }

    // Select a piece
    const piece = chess.get(sq as Parameters<typeof chess.get>[0]);
    if (piece && piece.color === 'w') {
      setSelected(sq);
      const moves = chess.moves({ square: sq as Parameters<typeof chess.moves>[0]['square'], verbose: true });
      setLegalMoves(new Set(moves.map(m => m.to)));
    }
  }, [chess, selected, legalMoves, status, aiThinking, updateStatus, doAiMove]);

  const handlePromotion = useCallback(async (piece: string) => {
    if (!selected || !promotionPending) return;
    const result = chess.move({ from: selected, to: promotionPending, promotion: piece });
    if (result) {
      setLastMove({ from: result.from, to: result.to });
    }
    setSelected(null);
    setLegalMoves(new Set());
    setPromotionPending(null);
    updateStatus();
    if (chess.turn() === 'b' && !chess.isGameOver()) {
      await doAiMove();
    }
  }, [chess, selected, promotionPending, updateStatus, doAiMove]);

  // React to game end
  useEffect(() => {
    if (status === 'white_win') {
      fetchReaction('The player just beat you at chess! React with genuine congratulations in 1-2 short sentences. Be a good sport.');
    } else if (status === 'black_win') {
      fetchReaction('You just won a game of chess against the player! React with gentle, playful satisfaction in 1-2 sentences.');
    } else if (status === 'draw') {
      fetchReaction('You and the player just drew at chess! React with amused surprise in 1-2 sentences.');
    }
  }, [status, fetchReaction]);

  return (
    <div className="chess-panel">
      <div className="hangman-header">
        <span className="game-panel-title">Chess vs {charName}</span>
        <span className="ttt-mode">{aiThinking ? `${charName} is thinking…` : chess.turn() === 'w' ? 'Your move (♔)' : ''}</span>
        <button className="btn btn-ghost btn-xs" onClick={onExit}>← Back</button>
      </div>

      {/* Board */}
      <div className="chess-board">
        {/* Rank labels */}
        {RANKS.map((rank, ri) => (
          <div key={rank} className="chess-rank">
            <span className="chess-coord chess-coord--rank">{rank}</span>
            {FILES.map((file, fi) => {
              const sq = `${file}${rank}`;
              const piece = board[ri][fi];
              const isLight = (ri + fi) % 2 === 0;
              const isSelected = selected === sq;
              const isLegal = legalMoves.has(sq);
              const isLastMove = lastMove?.from === sq || lastMove?.to === sq;
              const isCheck = chess.inCheck() && piece?.type === 'k' && piece.color === chess.turn();

              return (
                <button
                  key={sq}
                  className={`chess-sq
                    ${isLight ? 'chess-sq--light' : 'chess-sq--dark'}
                    ${isSelected ? 'chess-sq--selected' : ''}
                    ${isLegal ? 'chess-sq--legal' : ''}
                    ${isLastMove ? 'chess-sq--last' : ''}
                    ${isCheck ? 'chess-sq--check' : ''}
                  `}
                  onClick={() => handleSquareClick(sq)}
                  aria-label={`${sq}: ${piece ? PIECE_UNICODE[piece.color + piece.type.toUpperCase()] : 'empty'}`}
                >
                  {piece && (
                    <span className={`chess-piece chess-piece--${piece.color}`}>
                      {PIECE_UNICODE[piece.color + piece.type.toUpperCase()] ?? '?'}
                    </span>
                  )}
                  {isLegal && !piece && <span className="chess-legal-dot" />}
                  {isLegal && piece && <span className="chess-legal-ring" />}
                </button>
              );
            })}
          </div>
        ))}
        {/* File labels */}
        <div className="chess-file-row">
          <span className="chess-coord" />
          {FILES.map(f => <span key={f} className="chess-coord chess-coord--file">{f}</span>)}
        </div>
      </div>

      {/* Promotion picker */}
      {promotionPending && (
        <div className="chess-promotion">
          <p>Promote pawn to:</p>
          {['q','r','b','n'].map(p => (
            <button key={p} className="chess-promo-btn" onClick={() => handlePromotion(p)}>
              {PIECE_UNICODE['w' + p.toUpperCase()]}
            </button>
          ))}
        </div>
      )}

      {/* Reaction / status */}
      {reaction && (
        <div className="hangman-result-reaction chess-reaction">
          {charName}: "{reaction}"
        </div>
      )}

      {/* Game end */}
      {status !== 'playing' && (
        <div className={`hangman-result hangman-result--${status === 'white_win' ? 'win' : status === 'draw' ? 'draw' : 'loss'}`}>
          <p className="hangman-result-title">
            {status === 'white_win' ? '🎉 You win!' : status === 'draw' ? '🤝 Draw!' : `${charName} wins!`}
          </p>
          <button className="btn btn-accent btn-sm" onClick={onExit}>Play again</button>
        </div>
      )}
    </div>
  );
}
