/**
 * GamePanel — Feature A2: In-App Mini Games with AI Companion
 *
 * Top-level game launcher / hub.  Renders:
 *   1. A launcher screen showing available games + recent stats.
 *   2. The active game (TriviaGame or TwentyQGame) once started.
 *
 * This component is shown in the Sidebar under a "Games" entry.
 * It is fully self-contained: fetch game history, start a game, play, return.
 */

import { useState, useEffect, useCallback } from 'react';
import { Gamepad2, Trophy, Clock, RefreshCw, Dices, HelpCircle } from 'lucide-react';
import { api } from '../lib/api';
import { TriviaGame } from './TriviaGame';
import { TwentyQGame } from './TwentyQGame';
import type { GameSession, GameStartResponse, GameType } from '../lib/types';

interface Props {
  /** Active character's DB id. */
  characterId: number;
  /** Active character's name (for personalised copy). */
  charName: string;
}

interface ActiveGame {
  sessionId: number;
  gameType: GameType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
}

const GAME_CONFIGS: { type: GameType; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    type: 'trivia',
    label: 'Trivia Quiz',
    icon: <Dices size={22} />,
    desc: '10 questions on any topic. Beat the clock and challenge your knowledge!',
  },
  {
    type: 'twenty_questions',
    label: '20 Questions',
    icon: <HelpCircle size={22} />,
    desc: `${charName ?? 'Your companion'} thinks of something — ask yes/no questions to guess it!`,
  },
];

/**
 * Game launcher + active game renderer.
 *
 * @example
 * <GamePanel characterId={1} charName="Sakura" />
 */
export function GamePanel({ characterId, charName }: Props) {
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);
  const [history, setHistory] = useState<GameSession[]>([]);
  const [startingType, setStartingType] = useState<GameType | null>(null);
  const [topic, setTopic] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.getGameHistory(characterId) as { games: GameSession[] };
      setHistory(res.games ?? []);
    } catch {
      // Non-critical — just show empty history
    }
  }, [characterId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function startGame(type: GameType) {
    setStartingType(type);
    try {
      const res = await api.startGame(type, characterId, topic || undefined) as GameStartResponse;
      setActiveGame({ sessionId: res.session_id, gameType: type, state: res.state });
    } finally {
      setStartingType(null);
    }
  }

  function exitGame() {
    setActiveGame(null);
    loadHistory();
  }

  // --- Active game ---
  if (activeGame) {
    if (activeGame.gameType === 'trivia') {
      return (
        <TriviaGame
          sessionId={activeGame.sessionId}
          initialState={activeGame.state}
          charName={charName}
          onExit={exitGame}
        />
      );
    }
    return (
      <TwentyQGame
        sessionId={activeGame.sessionId}
        initialState={activeGame.state}
        charName={charName}
        onExit={exitGame}
      />
    );
  }

  // --- Launcher screen ---
  const wins = history.filter(g => g.result === 'win').length;
  const played = history.length;

  return (
    <div className="game-panel">
      <div className="game-panel-header">
        <Gamepad2 size={18} />
        <span>Games with {charName}</span>
      </div>

      {/* Quick stats */}
      {played > 0 && (
        <div className="game-stats-row">
          <span className="game-stat">
            <Trophy size={13} /> {wins}/{played} wins
          </span>
          <button className="btn btn-ghost btn-xs" onClick={loadHistory}>
            <RefreshCw size={12} />
          </button>
        </div>
      )}

      {/* Topic input */}
      <div className="game-topic-row">
        <input
          className="game-topic-input"
          placeholder="Topic (optional — e.g. anime, science…)"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          maxLength={60}
        />
      </div>

      {/* Game type cards */}
      <div className="game-card-grid">
        {GAME_CONFIGS.map(cfg => (
          <button
            key={cfg.type}
            className="game-card"
            onClick={() => startGame(cfg.type)}
            disabled={!!startingType}
          >
            <span className="game-card-icon">{cfg.icon}</span>
            <span className="game-card-label">{cfg.label}</span>
            <span className="game-card-desc">{cfg.desc}</span>
            {startingType === cfg.type && (
              <span className="game-card-loading">Starting…</span>
            )}
          </button>
        ))}
      </div>

      {/* Recent games */}
      {history.length > 0 && (
        <div className="game-history">
          <p className="game-history-title">Recent games</p>
          {history.slice(0, 5).map(g => (
            <div key={g.id} className="game-history-row">
              <span className={`game-history-result game-history-result--${g.result ?? 'none'}`}>
                {g.result === 'win' ? '✓' : g.result === 'loss' ? '✗' : '–'}
              </span>
              <span className="game-history-type">
                {g.game_type === 'trivia' ? 'Trivia' : '20Q'}
              </span>
              {g.score != null && g.max_score != null && (
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
