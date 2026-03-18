import { useEffect, useRef, useState } from 'react';
import { Square, Volume2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { SOUNDSCAPE_FACTORIES, type AmbientController } from '../lib/ambientAudio';

/* ═══════════════════════════════════════════════════════════════════════
   Types & Constants
   ═══════════════════════════════════════════════════════════════════════ */

interface Soundscape {
  /** Display label shown on the selection button. */
  label: string;
  /** Emoji icon used in the button. */
  emoji: string;
}

/**
 * Catalogue of available ambient soundscape tracks.
 * Each label maps to a procedural audio factory in {@link SOUNDSCAPE_FACTORIES}.
 */
const SOUNDSCAPES: Soundscape[] = [
  { label: 'Café',   emoji: '☕' },
  { label: 'Rain',   emoji: '🌧' },
  { label: 'Lo-Fi',  emoji: '🎵' },
  { label: 'Forest', emoji: '🌲' },
  { label: 'City',   emoji: '🏙' },
];

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Ambient audio player dropdown, rendered at App root level.
 *
 * Controlled by the Music button in the StatusBar header via the
 * `soundscapeOpen` store flag. When open, displays a compact card
 * with five procedurally-generated soundscape options, a volume slider,
 * and a stop button.
 *
 * Audio is synthesized entirely via the Web Audio API — no audio files
 * are required. Each soundscape creates an AudioContext graph of
 * oscillators, noise generators, and filters.
 *
 * Only shown when a character is active (no character → returns null).
 */
export function SoundscapePlayer() {
  const { activeCharacter, soundscapeOpen } = useAppStore();

  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [volume, setVolume] = useState(60);
  const [playing, setPlaying] = useState(false);

  /** Current active ambient audio controller. */
  const controllerRef = useRef<AmbientController | null>(null);

  // Sync volume to the active controller whenever the slider changes.
  useEffect(() => {
    controllerRef.current?.setVolume(volume / 100);
  }, [volume]);

  // Cleanup: stop audio when the component unmounts.
  useEffect(() => {
    return () => {
      controllerRef.current?.stop();
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
    const factory = SOUNDSCAPE_FACTORIES[sc.label];
    if (!factory) return;

    // Toggle off if already playing this track.
    if (activeTrack === sc.label && playing) {
      controllerRef.current?.stop();
      controllerRef.current = null;
      setPlaying(false);
      setActiveTrack(null);
      return;
    }

    // Stop the current controller and create a new one.
    controllerRef.current?.stop();
    const controller = factory();
    controller.setVolume(volume / 100);
    controller.play();
    controllerRef.current = controller;

    setActiveTrack(sc.label);
    setPlaying(true);
  };

  /** Stop whatever is currently playing and clear state. */
  const handleStop = () => {
    controllerRef.current?.stop();
    controllerRef.current = null;
    setPlaying(false);
    setActiveTrack(null);
  };

  // Don't render anything when the dropdown is closed
  if (!soundscapeOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '48px',
        right: '120px',
        zIndex: 100,
      }}
    >
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
            return (
              <button
                key={sc.label}
                onClick={() => handleSelectTrack(sc)}
                title={sc.label}
                aria-pressed={isActive}
                aria-label={`${sc.label} ambient sound`}
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
                  cursor: 'pointer',
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
      </div>
    </div>
  );
}
