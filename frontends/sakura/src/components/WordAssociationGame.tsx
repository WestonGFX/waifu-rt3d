/**
 * WordAssociationGame — Feature A2 expansion: Word Association with AI companion.
 *
 * Turn-based: player types a word, the AI responds with a related word.
 * The chain is displayed visually (player = right, AI = left). Game ends
 * when a word repeats, the chain breaks, or the player ends it.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { GameCelebration } from './GameCelebration';
import type { GameState, WaChainEntry } from '../lib/types';

interface Props {
  sessionId: number;
  initialState: GameState;
  charName: string;
  onExit: () => void;
}

/**
 * Word Association game UI.
 *
 * @example
 * <WordAssociationGame sessionId={4} initialState={s} charName="Hana" onExit={fn} />
 */
export function WordAssociationGame({ sessionId, initialState, charName, onExit }: Props) {
  const [state, setState] = useState<GameState>(initialState);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const chainRef = useRef<HTMLDivElement>(null);

  const chain: WaChainEntry[] = (state.chain as WaChainEntry[]) ?? [];

  // Auto-scroll chain to bottom
  useEffect(() => {
    chainRef.current?.scrollTo({ top: chainRef.current.scrollHeight, behavior: 'smooth' });
  }, [chain.length]);

  const submitWord = useCallback(async () => {
    const word = input.trim().toLowerCase();
    if (!word || loading || state.finished) return;
    setInput('');
    setLoading(true);
    try {
      const res = await api.gameMove(sessionId, { word }) as { state: GameState; reaction: string | null };
      setState(res.state);
      if (!res.state.finished) {
        // Show AI "typing" briefly
        setAiTyping(true);
        setTimeout(() => setAiTyping(false), 600);
      }
    } finally {
      setLoading(false);
    }
  }, [input, loading, state.finished, sessionId]);

  const endGame = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.gameMove(sessionId, { action: 'end' }) as { state: GameState };
      setState(res.state);
    } finally {
      setLoading(false);
    }
  }, [loading, sessionId]);

  const finished = state.finished;
  const chainLength = chain.length;
  const score = state.score ?? 0;
  const bonus = state.bonus ?? 0;

  return (
    <div className="wa-panel">
      <div className="hangman-header">
        <span className="game-panel-title">Word Association</span>
        <button className="btn btn-ghost btn-xs" onClick={onExit}>← Back</button>
      </div>

      {/* Topic + score */}
      <div className="wa-meta">
        <span className="wa-topic">Theme: <em>{state.topic ?? 'open'}</em></span>
        <span className="wa-score">Chain: {chainLength}</span>
      </div>

      {/* Chain display */}
      <div className="wa-chain" ref={chainRef}>
        {chain.length === 0 && (
          <p className="wa-empty">Start by typing your first word below!</p>
        )}
        {chain.map((entry, i) => (
          <div key={i} className={`wa-entry wa-entry--${entry.by}`}>
            <span className="wa-entry-label">{entry.by === 'player' ? 'You' : charName}</span>
            <span className="wa-entry-word">{entry.word}</span>
          </div>
        ))}
        {aiTyping && (
          <div className="wa-entry wa-entry--ai">
            <span className="wa-entry-label">{charName}</span>
            <span className="wa-entry-word wa-typing">…</span>
          </div>
        )}
      </div>

      {/* Input */}
      {!finished && (
        <div className="tq-input-row">
          <input
            className="tq-input"
            placeholder="Your word…"
            value={input}
            onChange={e => setInput(e.target.value.replace(/[^a-zA-Z]/g, ''))}
            onKeyDown={e => e.key === 'Enter' && submitWord()}
            disabled={loading}
            maxLength={30}
            autoFocus
          />
          <button className="btn btn-accent btn-sm" onClick={submitWord} disabled={loading || !input.trim()}>
            →
          </button>
          <button className="btn btn-ghost btn-xs" onClick={endGame} disabled={loading}>
            End
          </button>
        </div>
      )}

      {/* Result */}
      {finished && (
        <div className={`hangman-result hangman-result--${state.won ? 'win' : 'loss'}`} style={{ position: 'relative', overflow: 'hidden' }}>
          <GameCelebration won={!!state.won} />
          <p className="hangman-result-title">
            {state.won ? `Chain complete! 🎉` : `Chain broken`}
          </p>
          <p className="wa-result-stats">
            Length: {chainLength} words{bonus > 0 ? ` + ${bonus} creativity bonus` : ''} = <strong>{score} pts</strong>
          </p>
          {state.reason && <p className="wa-result-reason">{state.reason}</p>}
          {state.reaction && <p className="hangman-result-reaction">{charName}: "{state.reaction}"</p>}
          <button className="btn btn-accent btn-sm" onClick={onExit}>Play again</button>
        </div>
      )}
    </div>
  );
}
