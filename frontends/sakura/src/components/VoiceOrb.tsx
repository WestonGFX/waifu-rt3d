import { motion } from 'framer-motion';
import type { VoiceSessionState } from '../hooks/useFullDuplexVoice';

// ── Types ───────────────────────────────────────────────────────────────────────

interface VoiceOrbProps {
  /** Current state of the voice session — drives animation variant. */
  state: VoiceSessionState;
  /** Mic input level (0-1) — scales the listening rings. */
  inputLevel: number;
  /** TTS output level (0-1) — scales the speaking glow. Defaults to 0.5 if not provided. */
  outputLevel?: number;
  /** Size of the orb in pixels. */
  size?: number;
}

// ── Component ───────────────────────────────────────────────────────────────────

/**
 * Animated voice state indicator orb.
 *
 * Visual states:
 *   - disconnected: dim, no animation
 *   - idle: gentle breathing pulse
 *   - listening: input-reactive expanding rings
 *   - processing: spinning/morphing glow
 *   - speaking: output-reactive pulsing glow
 *   - error: slow red pulse (intentionally hardcoded — semantic, not theme-colored)
 *
 * Uses CSS custom properties from the theme system (--color-accent)
 * so it adapts to all 18 themes automatically. The error state is the only
 * exception: red is universally understood as an error signal regardless of theme.
 *
 * @param props - State, input level, and optional size.
 *
 * @example
 * <VoiceOrb state="listening" inputLevel={0.6} size={64} />
 */
export function VoiceOrb({ state, inputLevel, outputLevel = 0.5, size = 64 }: VoiceOrbProps) {
  // Ring scale based on input level (for listening state)
  const ringScale = 1 + inputLevel * 0.4;

  // Speaking glow intensity based on output audio level
  const speakingGlow = 10 + outputLevel * 40;

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Outer ring — visible during listening, scales with input */}
      {state === 'listening' && (
        <motion.div
          animate={{
            scale: [ringScale, ringScale * 1.1, ringScale],
            opacity: [0.3, 0.15, 0.3],
          }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            width: size * 1.6,
            height: size * 1.6,
            borderRadius: '50%',
            border: '2px solid var(--color-accent)',
            opacity: 0.3,
          }}
        />
      )}

      {/* Middle ring — visible during listening */}
      {state === 'listening' && (
        <motion.div
          animate={{
            scale: [1, 1 + inputLevel * 0.2, 1],
            opacity: [0.4, 0.2, 0.4],
          }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
          style={{
            position: 'absolute',
            width: size * 1.3,
            height: size * 1.3,
            borderRadius: '50%',
            border: '1.5px solid var(--color-accent)',
            opacity: 0.4,
          }}
        />
      )}

      {/* Core orb */}
      <motion.div
        animate={
          state === 'disconnected'
            ? { scale: 0.9, opacity: 0.3 }
            : state === 'idle'
              ? { scale: [1, 1.05, 1], opacity: 0.7 }
              : state === 'listening'
                ? { scale: [1, 1 + inputLevel * 0.15, 1], opacity: 1 }
                : state === 'processing'
                  ? { scale: [1, 1.1, 1], rotate: [0, 180, 360], opacity: 0.9 }
                  : state === 'speaking'
                    ? { scale: [1, 1 + outputLevel * 0.15, 1], opacity: 1 }
                    : state === 'error'
                      ? { scale: [1, 1.08, 1], opacity: [0.8, 0.4, 0.8] }
                      : { scale: 1, opacity: 0.5 }
        }
        transition={
          state === 'idle'
            ? { duration: 3, repeat: Infinity, ease: 'easeInOut' }
            : state === 'listening'
              ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' }
              : state === 'processing'
                ? { duration: 2, repeat: Infinity, ease: 'linear' }
                : state === 'speaking'
                  ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' }
                  : state === 'error'
                    ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.3 }
        }
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          // Error state uses hardcoded red — semantic signal that must not adapt to theme accent.
          background: state === 'error'
            ? 'radial-gradient(circle at 35% 35%, #ff6b6b 0%, #e03131 100%)'
            : state === 'disconnected'
              ? 'var(--color-border)'
              : `radial-gradient(circle at 35% 35%,
                  color-mix(in srgb, var(--color-accent) 80%, white) 0%,
                  var(--color-accent) 50%,
                  color-mix(in srgb, var(--color-accent) 70%, black) 100%)`,
          boxShadow: state === 'error'
            ? '0 0 15px rgba(224,49,49,0.4), 0 0 30px rgba(224,49,49,0.2)'
            : state === 'disconnected'
              ? 'none'
              : state === 'speaking'
                ? `0 0 ${speakingGlow}px color-mix(in srgb, var(--color-accent) ${Math.round(30 + outputLevel * 30)}%, transparent),
                   0 0 ${speakingGlow * 2}px color-mix(in srgb, var(--color-accent) ${Math.round(15 + outputLevel * 15)}%, transparent)`
                : state === 'processing'
                  ? `0 0 15px color-mix(in srgb, var(--color-accent) 40%, transparent),
                     0 0 30px color-mix(in srgb, var(--color-accent) 20%, transparent)`
                  : `0 0 ${10 + inputLevel * 15}px color-mix(in srgb, var(--color-accent) 35%, transparent)`,
        }}
      />

      {/* State label */}
      <div
        style={{
          position: 'absolute',
          bottom: -20,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.6rem',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: state === 'error'
            ? '#e03131'
            : state === 'disconnected'
              ? 'var(--color-text-muted)'
              : 'var(--color-accent)',
          whiteSpace: 'nowrap',
        }}
      >
        {state === 'disconnected' ? 'offline' : state}
      </div>
    </div>
  );
}
