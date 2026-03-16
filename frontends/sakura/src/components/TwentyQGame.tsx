/**
 * TwentyQGame — Feature A2: Mini Games
 *
 * UI for the 20 Questions mini-game.  The AI secretly picks a thing;
 * the player asks yes/no questions or submits a final guess.
 *
 * State contract (from backend/games/twenty_questions.py):
 *   - questions: [{q, a}]  — history of Q&A pairs
 *   - remaining: number    — questions left
 *   - finished: boolean
 *   - won: boolean | null
 *   - reveal: string | null  — character reaction on game end
 *   - thing: "???" while in progress
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Lightbulb, Trophy, XCircle, RotateCcw } from 'lucide-react';
import { GameCelebration } from './GameCelebration';
import { api } from '../lib/api';
import type { GameState, GameMoveResponse } from '../lib/types';

interface Props {
  sessionId: number;
  initialState: GameState;
  charName: string;
  onExit: () => void;
}

/**
 * 20 Questions game UI — ask yes/no questions, then guess the secret thing.
 *
 * @example
 * <TwentyQGame sessionId={4} initialState={state} charName="Sakura" onExit={close} />
 */
export function TwentyQGame({ sessionId, initialState, charName, onExit }: Props) {
  const [state, setState] = useState<GameState>(initialState);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'question' | 'guess'>('question');
  const [loading, setLoading] = useState(false);
  const [lastReaction, setLastReaction] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Scroll Q&A history to bottom on new entry
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [state.questions]);

  async function submit() {
    const text = input.trim();
    if (!text || loading || state.finished) return;
    setInput('');
    setLoading(true);
    try {
      const move = mode === 'question' ? { question: text } : { guess: text };
      const res = await api.gameMove(sessionId, move) as GameMoveResponse;
      setState(res.state);
      if (res.reaction) setLastReaction(res.reaction);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const qaHistory = (state.questions as { q: string; a: string }[] | undefined) ?? [];
  const remaining = state.remaining ?? 20;

  // --- Finished screen ---
  if (state.finished) {
    const won = state.won;
    return (
      <div className="tq-panel tq-result" style={{ position: 'relative', overflow: 'hidden' }}>
        <GameCelebration won={!!won} />
        {won ? (
          <Trophy size={40} style={{ color: 'var(--color-accent)', margin: '0 auto 12px' }} />
        ) : (
          <XCircle size={40} style={{ color: 'var(--color-error, #e57)', margin: '0 auto 12px' }} />
        )}
        <h3 className="tq-result-title">
          {won ? `You got it!` : `Out of questions!`}
        </h3>
        {lastReaction && <p className="tq-result-reveal">{lastReaction}</p>}
        <p className="tq-result-stat">
          Asked {20 - remaining} / 20 questions
        </p>
        <div className="trivia-actions">
          <button className="btn btn-secondary btn-sm" onClick={onExit}>
            <RotateCcw size={14} /> Play Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tq-panel">
      {/* Header */}
      <div className="tq-header">
        <span className="tq-title">
          <Lightbulb size={15} /> {charName} is thinking of a {state.category ?? 'thing'}…
        </span>
        <span className="tq-remaining">
          {remaining} question{remaining !== 1 ? 's' : ''} left
        </span>
      </div>

      {/* Q&A history */}
      <div className="tq-history" ref={historyRef}>
        {qaHistory.length === 0 && (
          <p className="tq-hint">Ask yes/no questions to figure out what {charName} is thinking of!</p>
        )}
        {qaHistory.map((entry, i) => (
          <div key={i} className="tq-entry">
            <p className="tq-entry-q">
              <span className="tq-entry-num">{i + 1}.</span> {entry.q}
            </p>
            <p className="tq-entry-a">{entry.a}</p>
          </div>
        ))}
        {loading && <p className="tq-thinking">{charName} is thinking…</p>}
      </div>

      {/* Last reaction inline (non-final) */}
      {lastReaction && !state.finished && (
        <p className="tq-inline-reaction">{lastReaction}</p>
      )}

      {/* Mode toggle */}
      <div className="tq-mode-toggle">
        <button
          className={`tq-mode-btn ${mode === 'question' ? 'tq-mode-btn--active' : ''}`}
          onClick={() => setMode('question')}
        >
          Ask a question
        </button>
        <button
          className={`tq-mode-btn ${mode === 'guess' ? 'tq-mode-btn--active' : ''}`}
          onClick={() => setMode('guess')}
        >
          Make a guess!
        </button>
      </div>

      {/* Input */}
      <div className="tq-input-row">
        <input
          className="tq-input"
          placeholder={mode === 'question' ? 'Is it bigger than a house?' : 'I think it is...'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading || state.finished}
          maxLength={120}
        />
        <button
          className="btn btn-primary btn-sm tq-send"
          onClick={submit}
          disabled={!input.trim() || loading || state.finished}
        >
          <Send size={14} />
        </button>
      </div>

      <button className="btn btn-ghost btn-xs trivia-exit" onClick={onExit}>
        Exit game
      </button>
    </div>
  );
}
