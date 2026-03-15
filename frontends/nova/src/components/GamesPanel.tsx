import { useState, useCallback, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle, Hash, Type, Link2, Lightbulb, Grid3X3, LayoutGrid,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import type { GameType, GameState, GameStartResponse, GameMoveResponse } from '../lib/types';
import styles from './GamesPanel.module.css';

// ── Game type definitions ───────────────────────────────────────────────────

/** Configuration for each available game type in the selector grid. */
interface GameDef {
  /** API game type identifier. */
  type: GameType;
  /** Display label shown on the pill button. */
  label: string;
  /** Icon component for the pill button. */
  Icon: typeof HelpCircle;
  /** Whether this game type accepts an optional topic input. */
  hasTopic: boolean;
}

const GAMES: GameDef[] = [
  { type: 'trivia',           label: 'Trivia',        Icon: HelpCircle, hasTopic: true },
  { type: 'twenty_questions',  label: '20 Questions',  Icon: Hash,       hasTopic: true },
  { type: 'hangman',          label: 'Hangman',       Icon: Type,       hasTopic: true },
  { type: 'word_association', label: 'Word Assoc.',   Icon: Link2,      hasTopic: true },
  { type: 'riddles',          label: 'Riddles',       Icon: Lightbulb,  hasTopic: true },
  { type: 'tictactoe',        label: 'Tic-Tac-Toe',  Icon: Grid3X3,    hasTopic: false },
  { type: 'memory_match',     label: 'Memory Match',  Icon: LayoutGrid, hasTopic: false },
];

/** Spring config for expand/collapse transitions. */
const expandSpring = { type: 'spring' as const, stiffness: 300, damping: 28 };

/**
 * Glass-styled mini-games panel for Nova's Focused mode IconRail.
 *
 * Provides a game type selector grid, optional topic input, and renders
 * game-specific UIs for each supported mini-game type. Communicates
 * with the backend via `api.startGame()` and `api.gameMove()`.
 *
 * Supported games: Trivia, 20 Questions, Hangman, Word Association,
 * Riddles, Tic-Tac-Toe, and Memory Match.
 *
 * @example
 * ```tsx
 * // Rendered inside IconRail's panelContent map
 * <GamesPanel />
 * ```
 */
export function GamesPanel() {
  const activeCharacter = useAppStore((s) => s.activeCharacter);

  // Selection state
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [topic, setTopic] = useState('');

  // Active game state
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  // Text input for text-based games (20Q, word association, riddles)
  const [textInput, setTextInput] = useState('');

  // Hangman letter input
  const [letterInput, setLetterInput] = useState('');

  const charId = activeCharacter?.id ?? 0;

  /**
   * Start a new game session with the selected game type.
   * Calls POST /api/games/start and initializes local game state.
   */
  const handleStart = useCallback(async () => {
    if (!selectedGame || !charId) return;
    setLoading(true);
    try {
      const opts: Record<string, unknown> = {};
      if (topic.trim()) opts.topic = topic.trim();
      const resp = await api.startGame(selectedGame, charId, opts) as GameStartResponse;
      setSessionId(resp.session_id);
      setGameState(resp.state);
      setIsPlaying(true);
      setTextInput('');
      setLetterInput('');
    } catch (e) {
      console.error('[GamesPanel] Failed to start game:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedGame, charId, topic]);

  /**
   * Submit a move to the active game session.
   * Calls POST /api/games/{sessionId}/move and updates local state.
   *
   * @param move - Game-specific move payload.
   */
  const handleMove = useCallback(async (move: Record<string, unknown>) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const resp = await api.gameMove(sessionId, move) as GameMoveResponse;
      setGameState(resp.state);
      if (resp.state.finished) {
        setIsPlaying(false);
      }
    } catch (e) {
      console.error('[GamesPanel] Failed to submit move:', e);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  /**
   * Reset all game state to return to the game selector.
   */
  const handlePlayAgain = useCallback(() => {
    setSessionId(null);
    setGameState(null);
    setIsPlaying(false);
    setTextInput('');
    setLetterInput('');
  }, []);

  /**
   * Handle Enter key submission for text-based inputs.
   *
   * @param e - Keyboard event from the input field.
   * @param submitFn - Function to call on Enter.
   */
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>, submitFn: () => void) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitFn();
    }
  }, []);

  const selectedDef = GAMES.find((g) => g.type === selectedGame);

  // ── Game-specific renderers ─────────────────────────────────────────────

  /**
   * Render the trivia game UI: question text + 4 clickable option buttons.
   */
  const renderTrivia = () => {
    if (!gameState) return null;
    const q = gameState.current_question;
    if (!q) return null;

    return (
      <>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Question</span>
          <span className={styles.infoValue}>
            {(gameState.current ?? 0) + 1} / {gameState.questions?.length ?? '?'}
          </span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Score</span>
          <span className={styles.infoValue}>{gameState.score ?? 0}</span>
        </div>
        <div className={styles.questionText}>{q.q}</div>
        <div className={styles.optionGrid}>
          {q.options.map((opt, i) => (
            <button
              key={i}
              className={styles.optionButton}
              onClick={() => handleMove({ choice: i })}
              disabled={loading}
            >
              {opt}
            </button>
          ))}
        </div>
      </>
    );
  };

  /**
   * Render the Tic-Tac-Toe game UI: 3x3 grid with X/O markers.
   */
  const renderTicTacToe = () => {
    if (!gameState?.board) return null;
    const myTurn = gameState.turn === 'X';

    return (
      <>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Your mark</span>
          <span className={styles.infoValue}>X</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Turn</span>
          <span className={styles.infoValue}>{gameState.turn}</span>
        </div>
        <div className={styles.tttBoard}>
          {gameState.board.map((cell, i) => (
            <button
              key={i}
              className={`${styles.tttCell} ${cell === 'X' ? styles.tttCellX : ''} ${cell === 'O' ? styles.tttCellO : ''}`}
              onClick={() => cell === ' ' && myTurn && handleMove({ cell: i })}
              disabled={loading || cell !== ' ' || !myTurn}
            >
              {cell === ' ' ? '' : cell}
            </button>
          ))}
        </div>
      </>
    );
  };

  /**
   * Render the Hangman game UI: word display, guessed letters, letter input.
   */
  const renderHangman = () => {
    if (!gameState) return null;

    const submitLetter = () => {
      const l = letterInput.trim().toLowerCase();
      if (l.length === 1 && /[a-z]/.test(l)) {
        handleMove({ letter: l });
        setLetterInput('');
      }
    };

    return (
      <>
        <div className={styles.hangmanDisplay}>
          <div className={styles.hangmanWord}>{gameState.display ?? ''}</div>
          <div className={styles.hangmanInfo}>
            Wrong: {gameState.wrong?.length ?? 0} / {gameState.max_wrong ?? 6}
          </div>
        </div>
        {(gameState.guessed?.length ?? 0) > 0 && (
          <div className={styles.hangmanGuessed}>
            {gameState.guessed?.map((l) => (
              <span
                key={l}
                className={`${styles.letterPill} ${gameState.wrong?.includes(l) ? styles.letterPillWrong : ''}`}
              >
                {l.toUpperCase()}
              </span>
            ))}
          </div>
        )}
        <div className={styles.submitRow}>
          <input
            className={styles.letterInput}
            value={letterInput}
            onChange={(e) => setLetterInput(e.target.value.slice(0, 1))}
            onKeyDown={(e) => handleKeyDown(e, submitLetter)}
            placeholder="A"
            maxLength={1}
            disabled={loading}
          />
          <button className={styles.submitButton} onClick={submitLetter} disabled={loading}>
            Guess
          </button>
        </div>
      </>
    );
  };

  /**
   * Render the Memory Match game UI: grid of face-down/face-up cards.
   */
  const renderMemoryMatch = () => {
    if (!gameState?.cards) return null;
    const size = gameState.size ?? 4;
    const cols = size <= 4 ? size : Math.ceil(Math.sqrt(gameState.cards.length));

    return (
      <>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Pairs found</span>
          <span className={styles.infoValue}>{gameState.pairs_found ?? 0}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Moves</span>
          <span className={styles.infoValue}>{gameState.moves ?? 0}</span>
        </div>
        <div
          className={styles.memoryGrid}
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, maxWidth: cols * 48 }}
        >
          {gameState.cards.map((card) => {
            const isFlipped = gameState.flipped?.includes(card.id) ?? false;
            return (
              <button
                key={card.id}
                className={`${styles.memoryCard} ${card.matched ? styles.memoryCardMatched : ''} ${isFlipped ? styles.memoryCardFlipped : ''}`}
                onClick={() => !card.matched && !isFlipped && handleMove({ card_index: card.id })}
                disabled={loading || card.matched}
              >
                {card.emoji}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  /**
   * Render the Word Association game UI: chain display + word input.
   */
  const renderWordAssociation = () => {
    if (!gameState) return null;

    const submitWord = () => {
      const w = textInput.trim();
      if (w) {
        handleMove({ word: w });
        setTextInput('');
      }
    };

    return (
      <>
        {gameState.chain && gameState.chain.length > 0 && (
          <div className={styles.chainList}>
            {gameState.chain.map((entry, i) => (
              <span
                key={i}
                className={`${styles.chainWord} ${entry.by === 'player' ? styles.chainWordPlayer : styles.chainWordAi}`}
              >
                {entry.word}
              </span>
            ))}
          </div>
        )}
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Chain</span>
          <span className={styles.infoValue}>
            {gameState.chain?.length ?? 0} / {gameState.min_win ?? 10} to win
          </span>
        </div>
        <div className={styles.submitRow}>
          <input
            className={styles.textInput}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, submitWord)}
            placeholder="Type a word..."
            disabled={loading}
          />
          <button className={styles.submitButton} onClick={submitWord} disabled={loading}>
            Send
          </button>
        </div>
      </>
    );
  };

  /**
   * Render the Riddles game UI: riddle text, hints, and guess input.
   */
  const renderRiddles = () => {
    if (!gameState) return null;

    const submitGuess = () => {
      const g = textInput.trim();
      if (g) {
        handleMove({ guess: g });
        setTextInput('');
      }
    };

    return (
      <>
        <div className={styles.questionText}>{gameState.riddle ?? ''}</div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Guesses</span>
          <span className={styles.infoValue}>
            {gameState.guesses?.length ?? 0} / {gameState.max_guesses ?? 5}
          </span>
        </div>
        {(gameState.hints?.length ?? 0) > 0 && (
          <div className={styles.hintList}>
            {gameState.hints?.map((h, i) => (
              <div key={i} className={styles.hint}>{h}</div>
            ))}
          </div>
        )}
        <button
          className={styles.hintButton}
          onClick={() => handleMove({ action: 'hint' })}
          disabled={loading}
        >
          Request Hint
        </button>
        <div className={styles.submitRow}>
          <input
            className={styles.textInput}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, submitGuess)}
            placeholder="Your guess..."
            disabled={loading}
          />
          <button className={styles.submitButton} onClick={submitGuess} disabled={loading}>
            Guess
          </button>
        </div>
      </>
    );
  };

  /**
   * Render the 20 Questions game UI: question list, question/guess input.
   */
  const renderTwentyQuestions = () => {
    if (!gameState) return null;

    const submitQuestion = () => {
      const q = textInput.trim();
      if (q) {
        handleMove({ question: q });
        setTextInput('');
      }
    };

    const submitFinalGuess = () => {
      const g = textInput.trim();
      if (g) {
        handleMove({ guess: g });
        setTextInput('');
      }
    };

    return (
      <>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Questions left</span>
          <span className={styles.infoValue}>{gameState.remaining ?? '?'}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Category</span>
          <span className={styles.infoValue}>{gameState.category ?? '?'}</span>
        </div>
        {(gameState.questions_list?.length ?? 0) > 0 && (
          <div className={styles.hintList}>
            {gameState.questions_list?.map((qa, i) => (
              <div key={i} className={styles.hint}>
                <strong>Q:</strong> {qa.q} — <strong>A:</strong> {qa.a}
              </div>
            ))}
          </div>
        )}
        <div className={styles.submitRow}>
          <input
            className={styles.textInput}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, submitQuestion)}
            placeholder="Ask a yes/no question..."
            disabled={loading}
          />
          <button className={styles.submitButton} onClick={submitQuestion} disabled={loading}>
            Ask
          </button>
        </div>
        <button
          className={styles.startButton}
          onClick={submitFinalGuess}
          disabled={loading || !textInput.trim()}
          style={{ fontSize: 12, padding: '6px 12px' }}
        >
          Final Guess
        </button>
      </>
    );
  };

  /**
   * Dispatch to the correct game renderer based on the selected game type.
   */
  const renderActiveGame = () => {
    if (!gameState || !selectedGame) return null;

    switch (selectedGame) {
      case 'trivia': return renderTrivia();
      case 'tictactoe': return renderTicTacToe();
      case 'hangman': return renderHangman();
      case 'memory_match': return renderMemoryMatch();
      case 'word_association': return renderWordAssociation();
      case 'riddles': return renderRiddles();
      case 'twenty_questions': return renderTwentyQuestions();
      default: return null;
    }
  };

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* Game finished — result banner */}
      <AnimatePresence>
        {gameState?.finished && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={expandSpring}
          >
            <div className={styles.resultBanner}>
              <div className={styles.resultEmoji}>
                {gameState.won === true ? '🎉' : gameState.won === false ? '😅' : '🤝'}
              </div>
              <div className={styles.resultText}>
                {gameState.won === true ? 'You Won!' : gameState.won === false ? 'You Lost' : 'Draw'}
              </div>
              {gameState.score != null && (
                <div className={styles.resultScore}>
                  Score: {gameState.score}
                  {gameState.reveal ? ` — ${gameState.reveal}` : ''}
                </div>
              )}
              {gameState.reaction && (
                <div className={styles.reaction}>{gameState.reaction}</div>
              )}
              <button className={styles.startButton} onClick={handlePlayAgain}>
                Play Again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active game area */}
      <AnimatePresence>
        {isPlaying && gameState && !gameState.finished && (
          <motion.div
            key="game"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={expandSpring}
          >
            <div className={styles.gameArea}>
              <div className={styles.gameLabel}>{selectedDef?.label ?? 'Game'}</div>
              {gameState.reaction && (
                <div className={styles.reaction}>{gameState.reaction}</div>
              )}
              {renderActiveGame()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game selector (hidden while playing) */}
      {!isPlaying && !gameState?.finished && (
        <>
          <div className={styles.gameGrid}>
            {GAMES.map((g) => (
              <button
                key={g.type}
                className={`${styles.gamePill} ${selectedGame === g.type ? styles.gamePillActive : ''}`}
                onClick={() => setSelectedGame(selectedGame === g.type ? null : g.type)}
              >
                <g.Icon size={14} strokeWidth={1.5} />
                {g.label}
              </button>
            ))}
          </div>

          {/* Topic input (for games that support it) */}
          <AnimatePresence>
            {selectedGame && selectedDef?.hasTopic && (
              <motion.div
                key="topic"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={expandSpring}
                style={{ overflow: 'hidden' }}
              >
                <input
                  className={styles.topicInput}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Enter a topic..."
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Start button */}
          <button
            className={styles.startButton}
            onClick={handleStart}
            disabled={!selectedGame || !charId || loading}
          >
            {loading ? 'Starting...' : 'Start Game'}
          </button>
        </>
      )}
    </div>
  );
}
