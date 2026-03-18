import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, X } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceCallOverlayProps {
  /** Whether the overlay is currently shown. */
  isActive: boolean;
  /** Current voice-pipeline phase driving visual state. */
  phase: 'idle' | 'listening' | 'capturing' | 'processing' | 'speaking' | 'cooldown';
  /** Display name for the active persona. */
  personaName: string;
  /** Most recent STT transcript — shown briefly then fades out. */
  lastTranscript: string;
  /** Called when the user taps the mic button to begin speaking. */
  onStart: () => void;
  /** Called when the user taps the mic button to stop / send. */
  onStop: () => void;
  /** Called when the user taps the mute toggle. */
  onMuteToggle: () => void;
  /** Whether the microphone is currently muted. */
  isMuted: boolean;
  /** Called when the user ends the call (X button or hang-up). */
  onEnd: () => void;
}

// ---------------------------------------------------------------------------
// Phase → display helpers
// ---------------------------------------------------------------------------

/** Maps pipeline phase to the ring color + animation variant. */
type RingVariant = 'idle' | 'listening' | 'processing' | 'speaking';

function getRingVariant(phase: VoiceCallOverlayProps['phase']): RingVariant {
  switch (phase) {
    case 'listening':
    case 'capturing':
      return 'listening';
    case 'processing':
      return 'processing';
    case 'speaking':
      return 'speaking';
    default:
      return 'idle';
  }
}

/**
 * Returns the status label shown below the avatar circle.
 *
 * @param phase - Current voice pipeline phase.
 * @param personaName - Persona display name used in the speaking state.
 */
function getStatusLabel(
  phase: VoiceCallOverlayProps['phase'],
  personaName: string,
): string {
  switch (phase) {
    case 'listening':
    case 'capturing':
      return 'Listening\u2026';
    case 'processing':
    case 'cooldown':
      return 'Thinking\u2026';
    case 'speaking':
      return `${personaName} is speaking`;
    default:
      return 'Tap to start';
  }
}

// ---------------------------------------------------------------------------
// Ring variant class maps
// These are hardcoded dark-palette values — the overlay is always dark for
// immersion, deliberately ignoring the app theme CSS variables.
// ---------------------------------------------------------------------------

const RING_BASE = 'absolute inset-0 rounded-full border-4';

const RING_CLASSES: Record<RingVariant, string> = {
  idle: cn(RING_BASE, 'border-white/20'),
  listening: cn(RING_BASE, 'border-emerald-400/80 animate-pulse'),
  processing: cn(RING_BASE, 'border-amber-400/80 animate-spin [animation-duration:1.4s]'),
  speaking: cn(RING_BASE, 'border-pink-400/80 animate-pulse'),
};

/** Outer halo ring — scaled up slightly, lower opacity, same animation. */
const HALO_CLASSES: Record<RingVariant, string> = {
  idle: 'absolute rounded-full border-2 border-white/8 inset-[-10px]',
  listening: 'absolute rounded-full border-2 border-emerald-400/30 animate-pulse inset-[-10px]',
  processing: 'absolute rounded-full border-2 border-amber-400/24 inset-[-10px]',
  speaking: 'absolute rounded-full border-2 border-pink-400/30 animate-pulse inset-[-10px]',
};

/** Glow color cast behind the avatar circle. */
const GLOW_CLASSES: Record<RingVariant, string> = {
  idle: 'opacity-0',
  listening: 'opacity-100 bg-emerald-500/12 blur-2xl',
  processing: 'opacity-100 bg-amber-500/12 blur-2xl',
  speaking: 'opacity-100 bg-pink-500/14 blur-2xl',
};

// ---------------------------------------------------------------------------
// Transcript fade hook
// ---------------------------------------------------------------------------

/** Returns whether the transcript text is currently visible (true for 3 s). */
function useTranscriptVisible(transcript: string): boolean {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!transcript) return;

    // New transcript — show immediately
    setVisible(true);

    // Cancel any previous fade timer
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    // Fade out after 3 seconds
    timerRef.current = setTimeout(() => {
      setVisible(false);
      timerRef.current = null;
    }, 3000);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [transcript]);

  return visible;
}

// ---------------------------------------------------------------------------
// VoiceCallOverlay
// ---------------------------------------------------------------------------

/**
 * Fullscreen overlay displayed during voice-call mode.
 *
 * Always renders with a dark theme for immersion regardless of the active app
 * theme. The overlay is `position: fixed` at `z-50` so it sits above all other
 * UI including the viewer chrome and settings panel.
 *
 * Phase-driven visual states:
 * - `idle`        — static gray ring, "Tap to start" label
 * - `listening` / `capturing` — green pulsing ring, "Listening…"
 * - `processing` / `cooldown` — amber spinning ring, "Thinking…"
 * - `speaking`    — pink pulsing ring, "{personaName} is speaking"
 */
export default function VoiceCallOverlay({
  isActive,
  phase,
  personaName,
  lastTranscript,
  onStart,
  onStop,
  onMuteToggle,
  isMuted,
  onEnd,
}: VoiceCallOverlayProps) {
  const ringVariant = getRingVariant(phase);
  const statusLabel = getStatusLabel(phase, personaName);
  const transcriptVisible = useTranscriptVisible(lastTranscript);

  // Whether the primary mic button action is "stop" (user already talking)
  const isCapturing = phase === 'listening' || phase === 'capturing';

  // ---------------------------------------------------------------------------
  // Mount / unmount animation — the overlay fades + scales in when active
  // ---------------------------------------------------------------------------
  const overlayClass = cn(
    'fixed inset-0 z-50 flex flex-col items-center justify-center',
    'bg-black/72 backdrop-blur-xl',
    'transition-[opacity,transform] ease-[cubic-bezier(0.22,1,0.36,1)]',
    isActive
      ? 'pointer-events-auto opacity-100 duration-300'
      : 'pointer-events-none opacity-0 duration-200',
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Voice call mode"
      className={overlayClass}
    >
      {/* ------------------------------------------------------------------ */}
      {/* End call — top-right corner                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="absolute right-4 top-4">
        <button
          type="button"
          onClick={onEnd}
          aria-label="End voice call"
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-full',
            'border border-white/14 bg-white/8 text-white/60',
            'transition-[background-color,border-color,color,transform] duration-150',
            'hover:border-white/28 hover:bg-white/16 hover:text-white/90',
            'active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
          )}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Persona name — top center                                            */}
      {/* ------------------------------------------------------------------ */}
      <p className="absolute top-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
        {personaName}
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* Avatar circle + rings                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative flex items-center justify-center">
        {/* Ambient glow blob */}
        <div
          aria-hidden="true"
          className={cn(
            'absolute h-48 w-48 rounded-full transition-opacity duration-500',
            GLOW_CLASSES[ringVariant],
          )}
        />

        {/* Outer halo ring */}
        <div
          aria-hidden="true"
          className={cn(
            'transition-[border-color,opacity] duration-500',
            HALO_CLASSES[ringVariant],
            // inset-[-10px] expands the ring 10px beyond the avatar circle
            'h-[calc(10rem+20px)] w-[calc(10rem+20px)]',
          )}
        />

        {/* Avatar circle */}
        <div
          className={cn(
            'relative h-40 w-40 rounded-full',
            'bg-gradient-to-br from-white/12 to-white/4',
            'border border-white/16',
          )}
        >
          {/* Inner active ring */}
          <div
            aria-hidden="true"
            className={cn(
              RING_CLASSES[ringVariant],
              'transition-[border-color] duration-500',
            )}
          />

          {/* Avatar initial / placeholder */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              aria-hidden="true"
              className="select-none text-4xl font-bold text-white/28"
            >
              {personaName.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Status text                                                           */}
      {/* ------------------------------------------------------------------ */}
      <p
        className={cn(
          'mt-8 text-sm font-medium text-white/70',
          'transition-[color,opacity] duration-300',
          phase === 'idle' ? 'text-white/40' : 'text-white/80',
        )}
        aria-live="polite"
        aria-atomic="true"
      >
        {statusLabel}
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* Transcript pill — last user speech, fades out after 3s               */}
      {/* ------------------------------------------------------------------ */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          'mt-4 max-w-xs px-4 text-center text-xs leading-5 text-white/60',
          'transition-opacity duration-500',
          transcriptVisible && lastTranscript ? 'opacity-100' : 'opacity-0',
        )}
      >
        {lastTranscript && (
          <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
            {lastTranscript}
          </span>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Controls row — bottom of overlay                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="absolute bottom-10 flex w-full max-w-xs items-center justify-between px-6">
        {/* Mute toggle — bottom left */}
        <button
          type="button"
          onClick={onMuteToggle}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-pressed={isMuted}
          className={cn(
            'inline-flex h-12 w-12 items-center justify-center rounded-full',
            'border transition-[background-color,border-color,color,transform] duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            'active:scale-95',
            isMuted
              ? 'border-rose-400/50 bg-rose-500/20 text-rose-300 hover:bg-rose-500/32'
              : 'border-white/16 bg-white/8 text-white/60 hover:border-white/28 hover:bg-white/16 hover:text-white/90',
          )}
        >
          {isMuted ? (
            <MicOff className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Mic className="h-5 w-5" aria-hidden="true" />
          )}
        </button>

        {/* Primary mic button — large, center */}
        <button
          type="button"
          onClick={isCapturing ? onStop : onStart}
          aria-label={isCapturing ? 'Stop speaking' : 'Start speaking'}
          disabled={phase === 'processing' || phase === 'cooldown' || phase === 'speaking'}
          className={cn(
            'inline-flex h-20 w-20 items-center justify-center rounded-full',
            'border-2 transition-[background-color,border-color,box-shadow,color,transform] duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black/80',
            'active:scale-95 disabled:pointer-events-none disabled:opacity-40',
            isCapturing
              ? [
                  'border-emerald-400/70 bg-emerald-500/28 text-emerald-300',
                  'shadow-[0_0_0_6px_rgba(52,211,153,0.12),0_0_32px_rgba(52,211,153,0.22)]',
                  'hover:bg-emerald-500/40',
                ].join(' ')
              : [
                  'border-white/24 bg-white/12 text-white/80',
                  'shadow-[0_0_0_6px_rgba(255,255,255,0.06)]',
                  'hover:border-white/40 hover:bg-white/20 hover:text-white',
                ].join(' '),
          )}
        >
          <Mic className="h-8 w-8" aria-hidden="true" />
        </button>

        {/* End call — bottom right (alternative to top-right X for thumb reach) */}
        <button
          type="button"
          onClick={onEnd}
          aria-label="End voice call"
          className={cn(
            'inline-flex h-12 w-12 items-center justify-center rounded-full',
            'border border-rose-400/40 bg-rose-500/18 text-rose-300',
            'transition-[background-color,border-color,color,transform] duration-150',
            'hover:border-rose-400/60 hover:bg-rose-500/30 hover:text-rose-200',
            'active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40',
          )}
        >
          <PhoneOff className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
