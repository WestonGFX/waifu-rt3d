/**
 * MemoryMatchGame — Feature A2 expansion: Memory Card Match.
 *
 * A grid of face-down emoji cards. Player flips two at a time; matched
 * pairs stay revealed.  Score = pairs found in fewest moves.  The AI
 * character reacts warmly when all pairs are found.
 */

import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import { GameCelebration } from './GameCelebration';
import type { GameState, MemoryCard } from '../lib/types';

interface Props {
  sessionId: number;
  initialState: GameState;
  charName: string;
  onExit: () => void;
}

/**
 * Memory Card Match game UI.
 *
 * @example
 * <MemoryMatchGame sessionId={7} initialState={s} charName="Hana" onExit={fn} />
 */
export function MemoryMatchGame({ sessionId, initialState, charName, onExit }: Props) {
  const [state, setState] = useState<GameState>(initialState);
  const [loading, setLoading] = useState(false);
  const [flippedAnim, setFlippedAnim] = useState<Set<number>>(new Set());

  const cards: MemoryCard[] = (state.cards as MemoryCard[]) ?? [];
  const gridCols = Math.ceil(Math.sqrt(cards.length));
  const pairs = state.size ?? 8;
  const found = state.pairs_found ?? 0;
  const moves = state.moves ?? 0;
  const currentFlipped = state.flipped ?? [];

  const handleFlip = useCallback(async (cardId: number) => {
    if (loading || state.finished) return;
    const card = cards.find(c => c.id === cardId);
    if (!card || card.matched || currentFlipped.includes(cardId)) return;

    setFlippedAnim(prev => new Set([...prev, cardId]));
    setLoading(true);
    try {
      const res = await api.gameMove(sessionId, { card_index: cardId }) as { state: GameState };
      const newState = res.state;
      setState(newState);

      // If no match, briefly show both then hide
      if (!newState.matched && (newState.match_indices ?? []).length === 2) {
        setTimeout(() => {
          setFlippedAnim(new Set());
          setLoading(false);
        }, 900);
        return;
      }
    } finally {
      if (loading) {
        // Will be set by timeout above if no match
        setLoading(false);
      }
    }
    setLoading(false);
  }, [loading, state.finished, cards, currentFlipped, sessionId]);

  // Determine which cards to show face-up
  const faceUp = new Set<number>([
    ...cards.filter(c => c.matched).map(c => c.id),
    ...currentFlipped,
    ...flippedAnim,
  ]);

  return (
    <div className="mm-panel">
      <div className="hangman-header">
        <span className="game-panel-title">Memory Match</span>
        <div className="mm-stats">
          <span>{found}/{pairs} pairs</span>
          <span>{moves} moves</span>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={onExit}>← Back</button>
      </div>

      {/* Card grid */}
      <div
        className="mm-grid"
        style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}
      >
        {cards.map(card => {
          const isUp = faceUp.has(card.id) || card.matched;
          const isMatched = card.matched;
          return (
            <button
              key={card.id}
              className={`mm-card
                ${isUp ? 'mm-card--face-up' : 'mm-card--face-down'}
                ${isMatched ? 'mm-card--matched' : ''}
              `}
              onClick={() => handleFlip(card.id)}
              disabled={loading || isMatched || isUp}
              aria-label={isUp ? card.emoji : 'Hidden card'}
            >
              <span className="mm-card-face">
                {isUp ? card.emoji : '❓'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Result */}
      {state.finished && (
        <div className="hangman-result hangman-result--win" style={{ position: 'relative', overflow: 'hidden' }}>
          <GameCelebration won={true} />
          <p className="hangman-result-title">🎉 You found all pairs!</p>
          <p className="wa-result-stats">{pairs} pairs in {moves} moves</p>
          {state.reaction && <p className="hangman-result-reaction">{charName}: "{state.reaction}"</p>}
          <button className="btn btn-accent btn-sm" onClick={onExit}>Play again</button>
        </div>
      )}
    </div>
  );
}
