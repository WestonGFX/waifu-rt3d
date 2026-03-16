/**
 * TriviaGame — Feature A2: Mini Games
 *
 * Renders a single trivia game session.  The game logic lives on the server
 * (backend/games/trivia.py); this component is purely presentational + input.
 *
 * Flow:
 *  1. Receives an active `sessionId` and initial `state` from GamePanel.
 *  2. Displays the current question + four answer options.
 *  3. On option click → POST /api/games/{id}/move → show correct/wrong reveal.
 *  4. Auto-advances after 1.5 s, or immediately on next-click.
 *  5. When `state.finished`, shows score summary.
 */

import { useState } from 'react';
import { CheckCircle, XCircle, Trophy, RotateCcw } from 'lucide-react';
import { GameCelebration } from './GameCelebration';
import { api } from '../lib/api';
import type { GameState, GameMoveResponse } from '../lib/types';

interface Props {
  /** DB id of the active game_sessions row. */
  sessionId: number;
  /** Initial game state from POST /api/games/start. */
  initialState: GameState;
  /** Character name for personalised copy. */
  charName: string;
  /** Called when the user wants to go back to the game launcher. */
  onExit: () => void;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

/**
 * Multiple-choice trivia game UI.
 *
 * @example
 * <TriviaGame sessionId={3} initialState={state} charName="Sakura" onExit={close} />
 */
export function TriviaGame({ sessionId, initialState, charName, onExit }: Props) {
  const [state, setState] = useState<GameState>(initialState);
  const [selected, setSelected] = useState<number | null>(null);
  const [lastEvent, setLastEvent] = useState<'correct' | 'wrong' | null>(null);
  const [loading, setLoading] = useState(false);

  const q = state.current_question;
  const total = state.questions?.length ?? 10;
  const current = (state.current ?? 0);

  async function handleChoice(idx: number) {
    if (selected !== null || loading || state.finished) return;
    setSelected(idx);
    setLoading(true);
    try {
      const res = await api.gameMove(sessionId, { choice: idx }) as GameMoveResponse;
      setLastEvent(res.event as 'correct' | 'wrong');
      // Wait for the reveal to render before updating state
      setTimeout(() => {
        setState(res.state);
        setSelected(null);
        setLastEvent(null);
        setLoading(false);
      }, 1500);
    } catch {
      setLoading(false);
    }
  }

  // --- Finished screen ---
  if (state.finished) {
    const score = state.score ?? 0;
    const pct = Math.round((score / total) * 100);
    const grade = pct >= 80 ? '🌸 Excellent!' : pct >= 50 ? '👍 Not bad!' : '😅 Keep trying!';
    return (
      <div className="trivia-panel trivia-result" style={{ position: 'relative', overflow: 'hidden' }}>
        <GameCelebration won={pct >= 50} message={grade.replace(/^[^\s]+ /, '')} />
        <Trophy size={40} style={{ color: 'var(--color-accent)', margin: '0 auto 12px' }} />
        <h3 className="trivia-result-title">{charName}'s Trivia Challenge</h3>
        <p className="trivia-result-score">{score} / {total}</p>
        <p className="trivia-result-grade">{grade}</p>
        <div className="trivia-result-bar">
          <div className="trivia-result-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="trivia-actions">
          <button className="btn btn-secondary btn-sm" onClick={onExit}>
            <RotateCcw size={14} /> Play Again
          </button>
        </div>
      </div>
    );
  }

  if (!q) return null;

  return (
    <div className="trivia-panel">
      {/* Progress bar */}
      <div className="trivia-progress-row">
        <span className="trivia-progress-label">Q {current + 1} / {total}</span>
        <div className="trivia-progress-track">
          <div
            className="trivia-progress-fill"
            style={{ width: `${((current) / total) * 100}%` }}
          />
        </div>
        <span className="trivia-score-badge">
          ★ {state.score ?? 0}
        </span>
      </div>

      {/* Question */}
      <p className="trivia-question">{q.q}</p>

      {/* Options */}
      <div className="trivia-options">
        {q.options.map((opt, i) => {
          let cls = 'trivia-option';
          if (selected !== null) {
            // Reveal correct answer after submission
            const correctIdx = state.last_answer ?? -1;
            if (i === correctIdx) cls += ' trivia-option--correct';
            else if (i === selected && lastEvent === 'wrong') cls += ' trivia-option--wrong';
            else cls += ' trivia-option--dim';
          }
          return (
            <button
              key={i}
              className={cls}
              onClick={() => handleChoice(i)}
              disabled={selected !== null || loading}
            >
              <span className="trivia-option-label">{OPTION_LABELS[i]}</span>
              <span className="trivia-option-text">{opt}</span>
              {selected !== null && i === (state.last_answer ?? -1) && (
                <CheckCircle size={16} className="trivia-option-icon trivia-option-icon--correct" />
              )}
              {selected !== null && i === selected && lastEvent === 'wrong' && (
                <XCircle size={16} className="trivia-option-icon trivia-option-icon--wrong" />
              )}
            </button>
          );
        })}
      </div>

      {/* Reaction feedback */}
      {lastEvent && (
        <p className={`trivia-feedback trivia-feedback--${lastEvent}`}>
          {lastEvent === 'correct' ? '✓ Correct!' : '✗ Wrong'}
        </p>
      )}

      <button className="btn btn-ghost btn-xs trivia-exit" onClick={onExit}>
        Exit game
      </button>
    </div>
  );
}
