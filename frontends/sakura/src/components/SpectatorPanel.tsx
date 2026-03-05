/**
 * SpectatorPanel — Game Companion tab for the GamePanel overlay.
 *
 * Provides controls for starting/stopping screen capture, configuring
 * game tag and reaction frequency, and showing a live reaction feed.
 * Integrates with the useGameSpectator hook for WebSocket + capture lifecycle.
 *
 * @module components/SpectatorPanel
 */

import { useState, useCallback } from 'react';
import {
  Monitor, Play, Square, Volume2, VolumeX,
  Zap, Coffee, Flame, Eye, Gamepad2,
} from 'lucide-react';
import { useGameSpectator } from '../hooks/useGameSpectator';
import type {
  SpectatorConfig,
  SpectatorFrequency,
  SpectatorMode,
  SpectatorReaction,
} from '../lib/types';

interface Props {
  /** Character ID for spectator reactions. */
  characterId: number;
  /** Character name for display. */
  charName: string;
  /** User's display name. */
  userName?: string;
}

/** Frequency preset labels and icons. */
const FREQ_OPTIONS: { value: SpectatorFrequency; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'quiet', label: 'Quiet', icon: <Coffee size={14} />, desc: '~1 reaction per 45s' },
  { value: 'normal', label: 'Normal', icon: <Volume2 size={14} />, desc: '~1 reaction per 15s' },
  { value: 'hyped', label: 'Hyped', icon: <Flame size={14} />, desc: '~1 reaction per 6s' },
];

/**
 * Game Companion panel — spectator mode controls and reaction feed.
 *
 * @param props - Component props with character info.
 * @returns Spectator panel UI.
 *
 * @example
 * ```tsx
 * <SpectatorPanel characterId={1} charName="Kitsune" userName="Chris" />
 * ```
 */
export function SpectatorPanel({ characterId, charName, userName = 'Player' }: Props) {
  const [gameTag, setGameTag] = useState('');
  const [mode, setMode] = useState<SpectatorMode>('watch');
  const [frequency, setFrequency] = useState<SpectatorFrequency>('normal');
  const [error, setError] = useState<string | null>(null);

  const {
    state,
    isActive,
    reactions,
    start,
    stop,
    setFrequency: updateFrequency,
  } = useGameSpectator({
    charId: characterId,
    onReaction: () => setError(null),
    onError: (msg) => setError(msg),
  });

  const handleStart = useCallback(async () => {
    if (!gameTag.trim()) {
      setError('Enter a game name first');
      return;
    }
    setError(null);
    const config: SpectatorConfig = {
      charId: characterId,
      gameTag: gameTag.trim(),
      mode,
      frequency,
      userName,
    };
    await start(config);
  }, [gameTag, mode, frequency, characterId, userName, start]);

  const handleFrequencyChange = useCallback((freq: SpectatorFrequency) => {
    setFrequency(freq);
    if (isActive) updateFrequency(freq);
  }, [isActive, updateFrequency]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.9 }}>
        <Monitor size={18} />
        <span style={{ fontWeight: 600, fontSize: '14px' }}>
          Game Companion
        </span>
        <span style={{ fontSize: '11px', opacity: 0.6, marginLeft: 'auto' }}>
          {charName} reacts to your gameplay
        </span>
      </div>

      {/* Game Tag Input */}
      <div>
        <label style={{ fontSize: '12px', opacity: 0.7, display: 'block', marginBottom: '4px' }}>
          Game Name
        </label>
        <input
          type="text"
          value={gameTag}
          onChange={(e) => setGameTag(e.target.value)}
          placeholder="e.g. PokeRogue, Balatro, Vampire Survivors..."
          disabled={isActive}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.06)',
            color: 'inherit',
            fontSize: '13px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Mode Toggle */}
      <div>
        <label style={{ fontSize: '12px', opacity: 0.7, display: 'block', marginBottom: '6px' }}>
          Mode
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <ModeButton
            active={mode === 'watch'}
            onClick={() => !isActive && setMode('watch')}
            disabled={isActive}
            icon={<Eye size={14} />}
            label="Watch Me Play"
          />
          <ModeButton
            active={mode === 'play'}
            onClick={() => !isActive && setMode('play')}
            disabled={isActive}
            icon={<Gamepad2 size={14} />}
            label="Watch AI Play"
            badge="Soon"
          />
        </div>
      </div>

      {/* Frequency Selector */}
      <div>
        <label style={{ fontSize: '12px', opacity: 0.7, display: 'block', marginBottom: '6px' }}>
          Reaction Frequency
        </label>
        <div style={{ display: 'flex', gap: '6px' }}>
          {FREQ_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleFrequencyChange(opt.value)}
              title={opt.desc}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '8px',
                border: `1px solid ${frequency === opt.value ? 'var(--accent, #7c3aed)' : 'rgba(255,255,255,0.12)'}`,
                background: frequency === opt.value ? 'rgba(124, 58, 237, 0.15)' : 'rgba(255,255,255,0.04)',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: frequency === opt.value ? 600 : 400,
                transition: 'all 0.2s',
              }}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Start/Stop Button */}
      <button
        onClick={isActive ? stop : handleStart}
        disabled={state === 'connecting'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '10px 16px',
          borderRadius: '10px',
          border: 'none',
          background: isActive
            ? 'linear-gradient(135deg, #e74c3c, #c0392b)'
            : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
          color: '#fff',
          cursor: state === 'connecting' ? 'wait' : 'pointer',
          fontSize: '14px',
          fontWeight: 600,
          transition: 'all 0.2s',
          opacity: state === 'connecting' ? 0.7 : 1,
        }}
      >
        {isActive ? (
          <>
            <Square size={16} /> Stop Spectating
          </>
        ) : state === 'connecting' ? (
          <>
            <Zap size={16} style={{ animation: 'pulse 1s infinite' }} /> Connecting...
          </>
        ) : (
          <>
            <Play size={16} /> Start Spectating
          </>
        )}
      </button>

      {/* Error Display */}
      {error && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            background: 'rgba(231, 76, 60, 0.15)',
            border: '1px solid rgba(231, 76, 60, 0.3)',
            color: '#e74c3c',
            fontSize: '12px',
          }}
        >
          {error}
        </div>
      )}

      {/* Status */}
      {isActive && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            background: 'rgba(46, 204, 113, 0.1)',
            border: '1px solid rgba(46, 204, 113, 0.2)',
            fontSize: '12px',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#2ecc71',
              animation: 'pulse 2s infinite',
            }}
          />
          Capturing screen — {charName} is watching {gameTag}
        </div>
      )}

      {/* Reaction Feed */}
      {reactions.length > 0 && (
        <div>
          <label style={{ fontSize: '12px', opacity: 0.7, display: 'block', marginBottom: '6px' }}>
            Recent Reactions ({reactions.length})
          </label>
          <div
            style={{
              maxHeight: '240px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {reactions.slice(0, 10).map((reaction, i) => (
              <ReactionCard key={reaction.timestamp + i} reaction={reaction} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

/**
 * Mode toggle button (Watch / Play).
 */
function ModeButton({
  active,
  onClick,
  disabled,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '8px 12px',
        borderRadius: '8px',
        border: `1px solid ${active ? 'var(--accent, #7c3aed)' : 'rgba(255,255,255,0.12)'}`,
        background: active ? 'rgba(124, 58, 237, 0.15)' : 'rgba(255,255,255,0.04)',
        color: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '13px',
        fontWeight: active ? 600 : 400,
        opacity: disabled && !active ? 0.5 : 1,
        transition: 'all 0.2s',
        position: 'relative',
      }}
    >
      {icon} {label}
      {badge && (
        <span
          style={{
            fontSize: '9px',
            padding: '1px 4px',
            borderRadius: '4px',
            background: 'rgba(255,165,0,0.2)',
            color: '#ffa500',
            fontWeight: 700,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/** Emotion → color map for reaction cards. */
const EMOTION_COLORS: Record<string, string> = {
  excited: '#ff6b35',
  worried: '#ffa500',
  amused: '#ff69b4',
  surprised: '#9b59b6',
  proud: '#2ecc71',
  disappointed: '#95a5a6',
  neutral: '#7f8c8d',
  angry: '#e74c3c',
  scared: '#8e44ad',
  happy: '#f1c40f',
  sad: '#3498db',
  curious: '#1abc9c',
};

/**
 * Single reaction card in the feed.
 */
function ReactionCard({ reaction }: { reaction: SpectatorReaction }) {
  const color = EMOTION_COLORS[reaction.emotion] || EMOTION_COLORS.neutral;
  const time = new Date(reaction.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.04)',
        borderLeft: `3px solid ${color}`,
        fontSize: '12px',
        lineHeight: 1.4,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color,
            fontWeight: 600,
          }}
        >
          {reaction.emotion}
        </span>
        <span style={{ fontSize: '10px', opacity: 0.4 }}>{time}</span>
      </div>
      <div style={{ opacity: 0.9 }}>{reaction.text}</div>
    </div>
  );
}
