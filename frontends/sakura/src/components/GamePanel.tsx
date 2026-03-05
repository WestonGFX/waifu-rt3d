/**
 * GamePanel — Feature A2: In-App Mini Games with AI Companion (expanded)
 *
 * Top-level game launcher / hub showing all available game types in tabs:
 *   - Text/AI games: Trivia, 20Q, Hangman, Word Association, Riddles
 *   - 2D Board/Canvas: Tic-Tac-Toe, Memory Match, Chess
 *
 * Shows personal best scores per game type and recent game history.
 * Renders the active game component when a game is started.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Gamepad2, Trophy, Clock, RefreshCw, Dices, HelpCircle,
  Type, Link, Lightbulb, Grid3x3, Layers, Crown, Monitor,
} from 'lucide-react';
import { api } from '../lib/api';
import { TriviaGame } from './TriviaGame';
import { TwentyQGame } from './TwentyQGame';
import { HangmanGame } from './HangmanGame';
import { WordAssociationGame } from './WordAssociationGame';
import { RiddlesGame } from './RiddlesGame';
import { TicTacToeGame } from './TicTacToeGame';
import { MemoryMatchGame } from './MemoryMatchGame';
import { ChessGame } from './ChessGame';
import { SpectatorPanel } from './SpectatorPanel';
import type { GameSession, GameStartResponse, GameType, GameBestScore } from '../lib/types';

interface Props {
  characterId: number;
  charName: string;
}

interface ActiveGame {
  sessionId: number;
  gameType: GameType | 'chess';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  difficulty?: 'easy' | 'hard';
  theme?: string;
}

type GameTab = 'text' | 'board' | 'spectator';

// ── Game catalogue ──────────────────────────────────────────────────────────

interface GameConfig {
  type: GameType | 'chess';
  label: string;
  icon: React.ReactNode;
  desc: string;
  tab: GameTab;
  /** Extra options to pass to startGame (difficulty, pairs, theme, etc.) */
  options?: Record<string, unknown>;
}

const GAME_CONFIGS: GameConfig[] = [
  {
    type: 'trivia',
    label: 'Trivia Quiz',
    icon: <Dices size={22} />,
    desc: '10 questions on any topic. Answer all to win!',
    tab: 'text',
  },
  {
    type: 'twenty_questions',
    label: '20 Questions',
    icon: <HelpCircle size={22} />,
    desc: 'AI thinks of something — ask yes/no questions to guess it!',
    tab: 'text',
  },
  {
    type: 'hangman',
    label: 'Hangman',
    icon: <Type size={22} />,
    desc: 'Guess the hidden word letter by letter before the gallows fill!',
    tab: 'text',
  },
  {
    type: 'word_association',
    label: 'Word Association',
    icon: <Link size={22} />,
    desc: 'Build a word chain with your companion. Keep the association going!',
    tab: 'text',
  },
  {
    type: 'riddles',
    label: 'Riddles',
    icon: <Lightbulb size={22} />,
    desc: 'Can you solve the riddle? Use hints if you get stuck.',
    tab: 'text',
  },
  {
    type: 'tictactoe',
    label: 'Tic-Tac-Toe',
    icon: <Grid3x3 size={22} />,
    desc: 'Classic 3×3 grid. Play Easy or Hard (unbeatable minimax AI).',
    tab: 'board',
  },
  {
    type: 'memory_match',
    label: 'Memory Match',
    icon: <Layers size={22} />,
    desc: 'Flip cards and find all emoji pairs. Fewer moves = higher score!',
    tab: 'board',
    options: { pairs: 8, theme: 'nature' },
  },
  {
    type: 'chess',
    label: 'Chess',
    icon: <Crown size={22} />,
    desc: 'Play chess against your AI companion. She knows her way around a board!',
    tab: 'board',
  },
];

const GAME_LABELS: Record<string, string> = {
  trivia: 'Trivia', twenty_questions: '20Q', hangman: 'Hangman',
  word_association: 'WordAssoc', riddles: 'Riddles',
  tictactoe: 'TicTacToe', memory_match: 'MemoryMatch', chess: 'Chess',
};

// ── Component ───────────────────────────────────────────────────────────────

/**
 * Games hub with all mini-game launchers, history, and best scores.
 *
 * @example
 * <GamePanel characterId={1} charName="Sakura" />
 */
export function GamePanel({ characterId, charName }: Props) {
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);
  const [history, setHistory] = useState<GameSession[]>([]);
  const [bestScores, setBestScores] = useState<Record<string, GameBestScore>>({});
  const [startingType, setStartingType] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [tab, setTab] = useState<GameTab>('text');
  const [tttDifficulty, setTttDifficulty] = useState<'easy' | 'hard'>('hard');
  const [mmTheme, setMmTheme] = useState('nature');

  const loadHistory = useCallback(async () => {
    try {
      const [histRes, bsRes] = await Promise.all([
        api.getGameHistory(characterId) as Promise<{ games: GameSession[] }>,
        api.getGameBestScores(characterId) as Promise<{ best_scores: Record<string, GameBestScore> }>,
      ]);
      setHistory(histRes.games ?? []);
      setBestScores(bsRes.best_scores ?? {});
    } catch { /* non-critical */ }
  }, [characterId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function startGame(cfg: GameConfig) {
    if (cfg.type === 'chess') {
      // Chess is fully client-side — no backend session needed
      setActiveGame({ sessionId: -1, gameType: 'chess', state: null });
      return;
    }

    setStartingType(cfg.type);
    try {
      const options: Record<string, unknown> = { topic: topic || 'general' };
      if (cfg.type === 'tictactoe') options.difficulty = tttDifficulty;
      if (cfg.type === 'memory_match') { options.pairs = 8; options.theme = mmTheme; }
      if (cfg.type === 'riddles') options.difficulty = 'medium';
      Object.assign(options, cfg.options ?? {});

      const res = await api.startGame(cfg.type, characterId, options) as GameStartResponse;
      setActiveGame({
        sessionId: res.session_id,
        gameType: cfg.type,
        state: res.state,
        difficulty: cfg.type === 'tictactoe' ? tttDifficulty : undefined,
        theme: cfg.type === 'memory_match' ? mmTheme : undefined,
      });
    } finally {
      setStartingType(null);
    }
  }

  function exitGame() {
    setActiveGame(null);
    loadHistory();
  }

  // ── Active game render ──────────────────────────────────────────────────

  if (activeGame) {
    switch (activeGame.gameType) {
      case 'trivia':
        return <TriviaGame sessionId={activeGame.sessionId} initialState={activeGame.state} charName={charName} onExit={exitGame} />;
      case 'twenty_questions':
        return <TwentyQGame sessionId={activeGame.sessionId} initialState={activeGame.state} charName={charName} onExit={exitGame} />;
      case 'hangman':
        return <HangmanGame sessionId={activeGame.sessionId} initialState={activeGame.state} charName={charName} onExit={exitGame} />;
      case 'word_association':
        return <WordAssociationGame sessionId={activeGame.sessionId} initialState={activeGame.state} charName={charName} onExit={exitGame} />;
      case 'riddles':
        return <RiddlesGame sessionId={activeGame.sessionId} initialState={activeGame.state} charName={charName} onExit={exitGame} />;
      case 'tictactoe':
        return <TicTacToeGame sessionId={activeGame.sessionId} initialState={activeGame.state} charName={charName} difficulty={activeGame.difficulty ?? 'hard'} onExit={exitGame} />;
      case 'memory_match':
        return <MemoryMatchGame sessionId={activeGame.sessionId} initialState={activeGame.state} charName={charName} onExit={exitGame} />;
      case 'chess':
        return <ChessGame charName={charName} onExit={exitGame} characterId={characterId} />;
    }
  }

  // ── Launcher screen ──────────────────────────────────────────────────────

  const wins = history.filter(g => g.result === 'win').length;
  const played = history.length;
  const visibleGames = GAME_CONFIGS.filter(g => g.tab === tab);

  return (
    <div className="game-panel">
      <div className="game-panel-header">
        <Gamepad2 size={18} />
        <span>Games with {charName}</span>
        <button className="btn btn-ghost btn-xs" onClick={loadHistory} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Quick stats */}
      {played > 0 && (
        <div className="game-stats-row">
          <span className="game-stat">
            <Trophy size={13} /> {wins}/{played} wins
          </span>
        </div>
      )}

      {/* Tab selector */}
      <div className="game-tab-row">
        <button
          className={`game-tab-btn ${tab === 'text' ? 'game-tab-btn--active' : ''}`}
          onClick={() => setTab('text')}
        >
          AI Text Games
        </button>
        <button
          className={`game-tab-btn ${tab === 'board' ? 'game-tab-btn--active' : ''}`}
          onClick={() => setTab('board')}
        >
          Board &amp; 2D Games
        </button>
        <button
          className={`game-tab-btn ${tab === 'spectator' ? 'game-tab-btn--active' : ''}`}
          onClick={() => setTab('spectator')}
        >
          <Monitor size={13} style={{ marginRight: '4px', verticalAlign: '-2px' }} />
          Game Companion
        </button>
      </div>

      {/* Spectator tab — Game Companion */}
      {tab === 'spectator' && (
        <SpectatorPanel characterId={characterId} charName={charName} />
      )}

      {/* Topic input (for applicable games) */}
      {tab === 'text' && (
        <div className="game-topic-row">
          <input
            className="game-topic-input"
            placeholder="Topic (optional — e.g. anime, science…)"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            maxLength={60}
          />
        </div>
      )}

      {/* Tic-Tac-Toe difficulty (only visible in board tab) */}
      {tab === 'board' && (
        <div className="game-options-row">
          <label className="game-option-label">
            TicTacToe difficulty:
            <select
              className="game-option-select"
              value={tttDifficulty}
              onChange={e => setTttDifficulty(e.target.value as 'easy' | 'hard')}
            >
              <option value="hard">Hard (unbeatable)</option>
              <option value="easy">Easy (random moves)</option>
            </select>
          </label>
          <label className="game-option-label">
            Memory theme:
            <select
              className="game-option-select"
              value={mmTheme}
              onChange={e => setMmTheme(e.target.value)}
            >
              <option value="nature">🌸 Nature</option>
              <option value="food">🍣 Food</option>
              <option value="animals">🦊 Animals</option>
              <option value="japan">⛩️ Japan</option>
              <option value="space">🚀 Space</option>
            </select>
          </label>
        </div>
      )}

      {/* Game cards — hidden when spectator tab is active */}
      {tab !== 'spectator' && <div className="game-card-grid">
        {visibleGames.map(cfg => {
          const bs = bestScores[cfg.type];
          return (
            <button
              key={cfg.type}
              className="game-card"
              onClick={() => startGame(cfg)}
              disabled={!!startingType}
            >
              <span className="game-card-icon">{cfg.icon}</span>
              <span className="game-card-label">{cfg.label}</span>
              <span className="game-card-desc">{cfg.desc}</span>
              {bs && (
                <span className="game-card-best">
                  <Trophy size={10} /> Best: {Math.round(bs.best * 100)}% · {bs.wins}/{bs.plays} wins
                </span>
              )}
              {startingType === cfg.type && (
                <span className="game-card-loading">Starting…</span>
              )}
            </button>
          );
        })}
      </div>}

      {/* Recent games */}
      {tab !== 'spectator' && history.length > 0 && (
        <div className="game-history">
          <p className="game-history-title">Recent games</p>
          {history.slice(0, 6).map(g => (
            <div key={g.id} className="game-history-row">
              <span className={`game-history-result game-history-result--${g.result ?? 'none'}`}>
                {g.result === 'win' ? '✓' : g.result === 'loss' ? '✗' : '–'}
              </span>
              <span className="game-history-type">
                {GAME_LABELS[g.game_type] ?? g.game_type}
              </span>
              {g.score != null && g.max_score != null && g.max_score > 0 && (
                <span className="game-history-score">{g.score}/{g.max_score}</span>
              )}
              {g.duration_seconds != null && (
                <span className="game-history-time">
                  <Clock size={11} /> {Math.round(g.duration_seconds)}s
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
