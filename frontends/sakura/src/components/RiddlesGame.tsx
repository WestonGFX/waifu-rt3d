/**
 * RiddlesGame — Feature A2 expansion: Riddles with AI companion.
 *
 * AI poses a riddle, player submits text guesses.  Progressive hints can
 * be unlocked (cost: 1 hint token).  Score = 3 minus hints used if won.
 */

import { useState, useCallback } from 'react';
import { Lightbulb, Send } from 'lucide-react';
import { api } from '../lib/api';
import { GameCelebration } from './GameCelebration';
import type { GameState } from '../lib/types';

interface Props {
  sessionId: number;
  initialState: GameState;
  charName: string;
  onExit: () => void;
}

/**
 * Riddles game UI.
 *
 * @example
 * <RiddlesGame sessionId={5} initialState={s} charName="Mei" onExit={fn} />
 */
export function RiddlesGame({ sessionId, initialState, charName, onExit }: Props) {
  const [state, setState] = useState<GameState>(initialState);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  const revealedHints: string[] = state.hints ?? [];
  const guesses: string[] = state.guesses ?? [];
  const hintsAvailable = 3 - (state.hints_used ?? 0);
  const guessesLeft = (state.max_guesses ?? 3) - guesses.length;

  const submitGuess = useCallback(async () => {
    const g = input.trim();
    if (!g || loading || state.finished) return;
    setInput('');
    setLoading(true);
    try {
      const res = await api.gameMove(sessionId, { guess: g }) as { event: string; state: GameState };
      setState(res.state);
      setLastEvent(res.event);
    } finally {
      setLoading(false);
    }
  }, [input, loading, state.finished, sessionId]);

  const takeHint = useCallback(async () => {
    if (loading || hintsAvailable <= 0 || state.finished) return;
    setLoading(true);
    try {
      const res = await api.gameMove(sessionId, { action: 'hint' }) as { state: GameState };
      setState(res.state);
      setLastEvent('hint');
    } finally {
      setLoading(false);
    }
  }, [loading, hintsAvailable, state.finished, sessionId]);

  return (
    <div className="riddles-panel">
      <div className="hangman-header">
        <span className="game-panel-title">Riddles</span>
        <button className="btn btn-ghost btn-xs" onClick={onExit}>← Back</button>
      </div>

      {/* Riddle card */}
      <div className="riddle-card">
        <p className="riddle-text">"{state.riddle}"</p>
        <span className="riddle-difficulty">{state.category ?? 'medium'}</span>
      </div>

      {/* Hints */}
      {revealedHints.length > 0 && (
        <div className="riddle-hints">
          {revealedHints.map((h, i) => (
            <div key={i} className="riddle-hint">
              <Lightbulb size={12} />
              <span>Hint {i + 1}: {h}</span>
            </div>
          ))}
        </div>
      )}

      {/* Previous guesses */}
      {guesses.length > 0 && (
        <div className="riddle-guesses">
          {guesses.map((g, i) => (
            <span key={i} className={`riddle-guess-chip ${i === guesses.length - 1 && lastEvent === 'wrong' ? 'riddle-guess-chip--wrong' : ''}`}>
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Input row */}
      {!state.finished && (
        <div className="riddle-input-row">
          <button
            className="btn btn-ghost btn-xs riddle-hint-btn"
            onClick={takeHint}
            disabled={loading || hintsAvailable <= 0}
            title="Get a hint (costs 1 point)"
          >
            <Lightbulb size={13} /> Hint ({hintsAvailable})
          </button>
          <input
            className="tq-input"
            placeholder={`Your guess… (${guessesLeft} left)`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitGuess()}
            disabled={loading}
            maxLength={60}
            autoFocus
          />
          <button className="btn btn-accent btn-sm" onClick={submitGuess} disabled={loading || !input.trim()}>
            <Send size={14} />
          </button>
        </div>
      )}

      {/* Result */}
      {state.finished && (
        <div className={`hangman-result hangman-result--${state.won ? 'win' : 'loss'}`} style={{ position: 'relative', overflow: 'hidden' }}>
          <GameCelebration won={!!state.won} />
          <p className="hangman-result-title">{state.won ? '🎉 Correct!' : 'Not quite…'}</p>
          {!state.won && <p className="hangman-result-word">The answer: <strong>{state.answer}</strong></p>}
          {state.reveal && <p className="hangman-result-reaction">{charName}: "{state.reveal}"</p>}
          <button className="btn btn-accent btn-sm" onClick={onExit}>Next riddle</button>
        </div>
      )}
    </div>
  );
}
