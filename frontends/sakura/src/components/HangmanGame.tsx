/**
 * HangmanGame — Feature A2 expansion: Hangman with AI companion.
 *
 * Shows the classic gallows drawing (SVG), a display of the hidden word
 * with blanks, a keyboard for letter input, and the wrong-guess list.
 * The character reacts via the ``reaction`` field when the game ends.
 */

import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { GameState } from '../lib/types';

const KEYBOARD_ROWS = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l'],
  ['z','x','c','v','b','n','m'],
];

interface Props {
  sessionId: number;
  initialState: GameState;
  charName: string;
  onExit: () => void;
}

/** SVG gallows drawing — reveals parts based on wrong count. */
function Gallows({ wrongCount }: { wrongCount: number }) {
  return (
    <svg viewBox="0 0 120 130" className="hangman-gallows" aria-label={`Hangman: ${wrongCount} wrong guesses`}>
      {/* Structure */}
      <line x1="10" y1="125" x2="110" y2="125" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <line x1="30" y1="125" x2="30" y2="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <line x1="30" y1="10" x2="75" y2="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
      <line x1="75" y1="10" x2="75" y2="25" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      {/* Head */}
      {wrongCount >= 1 && <circle cx="75" cy="33" r="8" stroke="currentColor" strokeWidth="2" fill="none"/>}
      {/* Body */}
      {wrongCount >= 2 && <line x1="75" y1="41" x2="75" y2="75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>}
      {/* Left arm */}
      {wrongCount >= 3 && <line x1="75" y1="50" x2="58" y2="65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>}
      {/* Right arm */}
      {wrongCount >= 4 && <line x1="75" y1="50" x2="92" y2="65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>}
      {/* Left leg */}
      {wrongCount >= 5 && <line x1="75" y1="75" x2="58" y2="95" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>}
      {/* Right leg */}
      {wrongCount >= 6 && <line x1="75" y1="75" x2="92" y2="95" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>}
    </svg>
  );
}

/**
 * Hangman game UI.
 *
 * @example
 * <HangmanGame sessionId={3} initialState={state} charName="Rin" onExit={fn} />
 */
export function HangmanGame({ sessionId, initialState, charName, onExit }: Props) {
  const [state, setState] = useState<GameState>(initialState);
  const [loading, setLoading] = useState(false);

  const guessed = new Set(state.guessed ?? []);
  const wrong = state.wrong ?? [];
  const maxWrong = state.max_wrong ?? 6;

  const handleLetter = useCallback(async (letter: string) => {
    if (loading || guessed.has(letter) || state.finished) return;
    setLoading(true);
    try {
      const res = await api.gameMove(sessionId, { letter }) as { state: GameState };
      setState(res.state);
    } finally {
      setLoading(false);
    }
  }, [loading, guessed, state.finished, sessionId]);

  const finished = state.finished;
  const won = state.won;
  const display = state.display ?? '';

  return (
    <div className="hangman-panel">
      <div className="hangman-header">
        <span className="game-panel-title">Hangman</span>
        <button className="btn btn-ghost btn-xs" onClick={onExit}>← Back</button>
      </div>

      <div className="hangman-main">
        {/* Gallows */}
        <Gallows wrongCount={wrong.length} />

        {/* Category + word display */}
        <div className="hangman-center">
          <p className="hangman-category">Category: <em>{state.category ?? 'general'}</em></p>
          <div className="hangman-word">
            {display.split(' ').map((chunk, i) => (
              <span key={i} className="hangman-letter-group">
                {chunk.split('').map((ch, j) => (
                  <span key={j} className={`hangman-cell ${ch !== '_' ? 'hangman-cell--revealed' : ''}`}>
                    {ch === '_' ? '' : ch}
                  </span>
                ))}
              </span>
            ))}
          </div>

          {/* Wrong count */}
          <p className="hangman-wrong-count">
            {wrong.length} / {maxWrong} wrong {wrong.length > 0 && `(${wrong.join(', ')})`}
          </p>
        </div>
      </div>

      {/* Keyboard */}
      {!finished && (
        <div className="hangman-keyboard">
          {KEYBOARD_ROWS.map((row, ri) => (
            <div key={ri} className="hangman-key-row">
              {row.map(letter => (
                <button
                  key={letter}
                  className={`hangman-key
                    ${guessed.has(letter) && !wrong.includes(letter) ? 'hangman-key--hit' : ''}
                    ${wrong.includes(letter) ? 'hangman-key--miss' : ''}
                  `}
                  disabled={guessed.has(letter) || loading}
                  onClick={() => handleLetter(letter)}
                >
                  {letter}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Result */}
      {finished && (
        <div className={`hangman-result hangman-result--${won ? 'win' : 'loss'}`}>
          <p className="hangman-result-title">{won ? '🎉 You won!' : '💀 Game over'}</p>
          {!won && <p className="hangman-result-word">The word was: <strong>{state.word}</strong></p>}
          {state.reveal && <p className="hangman-result-reaction">{charName}: "{state.reveal}"</p>}
          <button className="btn btn-accent btn-sm" onClick={onExit}>Play again</button>
        </div>
      )}
    </div>
  );
}
