import { useEffect, useRef, useState } from 'react';
import { Music, Square, Volume2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface Soundscape {
  /** Display label shown on the selection button. */
  label: string;
  /** Emoji icon used in the button. */
  emoji: string;
  /**
   * URL to the audio file, or null when audio assets are not yet installed.
   * When null the button is disabled and shows a tooltip.
   */
  src: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Catalogue of available ambient soundscape tracks.
 * `src` is null for all entries until CDN assets are provisioned.
 * The UI gracefully disables unavailable tracks.
 */
const SOUNDSCAPES: Soundscape[] = [
  { label: 'Café',   emoji: '☕', src: null },
  { label: 'Rain',   emoji: '🌧', src: null },
  { label: 'Lo-Fi',  emoji: '🎵', src: null },
  { label: 'Forest', emoji: '🌲', src: null },
  { label: 'City',   emoji: '🏙', src: null },
];

/* ═══════════════════════════════════════════════════════════════════════
   Pulse animation CSS (injected once at runtime)
   ═══════════════════════════════════════════════════════════════════════ */

const PULSE_CSS = `
@keyframes soundscape-pulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent) 45%, transparent); }
  70%  { box-shadow: 0 0 0 7px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
`;

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Persistent floating ambient audio player, rendered at App root level.
 *
 * Collapsed state: a small Music icon button fixed at bottom-right.
 * The button pulses with a CSS animation when audio is playing.
 *
 * Expanded state: a compact card above the button offering:
 * - Row of five soundscape selector buttons
 * - Volume slider (0–100, default 60)
 * - Stop button
 *
 * Audio is driven by a single HTMLAudioElement held in a ref. When a track's
 * src is null the corresponding button is disabled and shows a tooltip.
 * Only shown when a character is active (no character → component returns null).
 */
export function SoundscapePlayer() {
  const { activeCharacter } = useAppStore();

  const [expanded, setExpanded] = useState(false);
  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [volume, setVolume] = useState(60);
  const [playing, setPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Tracks whether the CSS keyframe has been injected into the document. */
  const cssInjectedRef = useRef(false);

  // Inject pulse animation CSS once on first render.
  useEffect(() => {
    if (cssInjectedRef.current) return;
    cssInjectedRef.current = true;
    const style = document.createElement('style');
    style.textContent = PULSE_CSS;
    document.head.appendChild(style);
  }, []);

  // Sync volume to the audio element whenever the slider changes.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  // Cleanup: stop audio when the component unmounts.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Do not render when no character is selected.
  if (!activeCharacter) return null;

  /**
   * Select and play a soundscape by label.
   * If the same track is already playing, stop it (toggle off).
   * Stops any currently playing track before starting the new one.
   *
   * @param sc - The soundscape object selected by the user.
   */
  const handleSelectTrack = (sc: Soundscape) => {
    if (sc.src === null) return; // Unavailable track — no-op.

    // Toggle off if already playing this track.
    if (activeTrack === sc.label && playing) {
      audioRef.current?.pause();
      setPlaying(false);
      setActiveTrack(null);
      return;
    }

    // Stop the current audio element and swap in the new source.
    if (audioRef.current) {
      audioRef.current.pause();
    } else {
      audioRef.current = new Audio();
    }

    audioRef.current.src = sc.src;
    audioRef.current.loop = true;
    audioRef.current.volume = volume / 100;
    audioRef.current.play().catch(err => {
      console.warn('[SoundscapePlayer] Playback failed:', err);
    });

    setActiveTrack(sc.label);
    setPlaying(true);
  };

  /** Stop whatever is currently playing and clear state. */
  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setPlaying(false);
    setActiveTrack(null);
  };

  /** Pulse animation style applied to the toggle button while audio plays. */
  const pulsingStyle: React.CSSProperties = playing
    ? { animation: 'soundscape-pulse 1.8s ease-out infinite' }
    : {};

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '56px',
        right: '16px',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px',
      }}
    >
      {/* ── Expanded card ── */}
      {expanded && (
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            padding: '12px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
            width: '220px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {/* Soundscape selector row */}
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'space-between' }}>
            {SOUNDSCAPES.map(sc => {
              const isActive = activeTrack === sc.label;
              const unavailable = sc.src === null;
              return (
                <button
                  key={sc.label}
                  onClick={() => handleSelectTrack(sc)}
                  disabled={unavailable}
                  title={unavailable ? 'Audio files not yet installed' : sc.label}
                  aria-pressed={isActive}
                  aria-label={`${sc.label} ambient sound${unavailable ? ' (coming soon)' : ''}`}
                  style={{
                    flex: 1,
                    aspectRatio: '1',
                    borderRadius: '8px',
                    border: isActive
                      ? '2px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    backgroundColor: isActive
                      ? 'color-mix(in srgb, var(--color-accent) 15%, var(--color-surface))'
                      : 'var(--color-background)',
                    cursor: unavailable ? 'not-allowed' : 'pointer',
                    opacity: unavailable ? 0.45 : 1,
                    fontSize: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    transition: 'border-color 0.15s, background-color 0.15s',
                  }}
                >
                  {sc.emoji}
                </button>
              );
            })}
          </div>

          {/* Volume row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Volume2 size={13} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={e => setVolume(Number(e.target.value))}
              aria-label="Volume"
              style={{
                flex: 1,
                accentColor: 'var(--color-accent)',
                cursor: 'pointer',
              }}
            />
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)', width: '24px', textAlign: 'right' }}>
              {volume}
            </span>
          </div>

          {/* Stop button — only visible while playing */}
          {playing && (
            <button
              onClick={handleStop}
              aria-label="Stop ambient audio"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '5px 0',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 500,
              }}
            >
              <Square size={11} />
              Stop
            </button>
          )}

          {/* Coming-soon notice when all tracks are unavailable */}
          {SOUNDSCAPES.every(sc => sc.src === null) && (
            <p style={{
              margin: 0,
              fontSize: '0.62rem',
              color: 'var(--color-text-tertiary)',
              textAlign: 'center',
              lineHeight: 1.4,
            }}>
              Audio files not yet installed
            </p>
          )}
        </div>
      )}

      {/* ── Toggle button ── */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        aria-label={expanded ? 'Close soundscape player' : 'Open soundscape player'}
        aria-expanded={expanded}
        title={playing ? `Playing: ${activeTrack}` : 'Ambient sounds'}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          border: '1px solid var(--color-border)',
          backgroundColor: playing
            ? 'color-mix(in srgb, var(--color-accent) 20%, var(--color-surface))'
            : 'var(--color-surface)',
          color: playing ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          transition: 'background-color 0.2s, color 0.2s',
          ...pulsingStyle,
        }}
      >
        <Music size={16} />
      </button>
    </div>
  );
}
