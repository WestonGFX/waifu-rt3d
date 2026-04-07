import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Sparkles, Heart, Gift, Award } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** A single unlock gained at a bond level. */
export interface LevelUnlock {
  /** Semantic category determining which icon is displayed. */
  type: 'story' | 'expression' | 'dialogue' | 'feature' | 'ceremony' | string;
  /** Human-readable description of the unlock. */
  label: string;
}

/**
 * Props for the LevelUpCelebration overlay.
 *
 * @example
 * <LevelUpCelebration
 *   newLevel={5}
 *   characterName="Aria"
 *   tier="friend"
 *   previousTier="acquaintance"
 *   unlocks={[{ type: 'story', label: 'New memory unlocked' }]}
 *   onDismiss={handleDismiss}
 * />
 */
export interface LevelUpCelebrationProps {
  /** The new bond level just reached (displayed as the hero number). */
  newLevel: number;
  /** Character name used in the congratulation headline. */
  characterName: string;
  /** Current tier key after the level-up. */
  tier: string;
  /**
   * Previous tier key.
   * When this differs from `tier` a "prevTier → tier" transition banner
   * is displayed beneath the level number.
   */
  previousTier?: string;
  /** Ordered list of unlocks to show in the unlocks grid. */
  unlocks: LevelUnlock[];
  /**
   * Invoked when the user clicks "Continue" or the 10-second auto-dismiss
   * timer fires — whichever comes first.
   */
  onDismiss: () => void;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** Auto-dismiss delay in milliseconds. */
const AUTO_DISMISS_MS = 10_000;

/** Accent color per bond tier — mirrors the BondProgressBar mapping. */
const TIER_COLORS: Record<string, string> = {
  stranger:     'var(--color-text-tertiary)',
  acquaintance: '#60a5fa',
  friend:       '#34d399',
  close_friend: '#a78bfa',
  soulmate:     '#fbbf24',
};

/** Display label per bond tier. */
const TIER_LABELS: Record<string, string> = {
  stranger:     'Stranger',
  acquaintance: 'Acquaintance',
  friend:       'Friend',
  close_friend: 'Close Friend',
  soulmate:     'Soulmate',
};

/** Stagger delay between successive unlock card animations (seconds). */
const UNLOCK_STAGGER = 0.08;

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Returns the resolved display label for a tier key.
 * Falls back to a title-cased version of the raw key when unmapped.
 *
 * @param tier - Internal tier key (e.g. "close_friend").
 * @returns Human-readable label (e.g. "Close Friend").
 */
function tierLabel(tier: string): string {
  return TIER_LABELS[tier] ?? tier.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Returns the accent color string for a tier key.
 *
 * @param tier - Internal tier key.
 * @returns CSS color value or CSS variable string.
 */
function tierColor(tier: string): string {
  return TIER_COLORS[tier] ?? 'var(--color-accent)';
}

/* ═══════════════════════════════════════════════════════════════════════
   UnlockIcon sub-component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Renders the Lucide icon that corresponds to an unlock type.
 *
 * Mapping:
 * - story       → Star
 * - expression  → Sparkles
 * - dialogue    → Heart
 * - feature     → Gift
 * - ceremony    → Award
 * - (fallback)  → Star
 *
 * @param type - Unlock type string.
 * @param size - Icon size in pixels (default 14).
 */
function UnlockIcon({ type, size = 14 }: { type: string; size?: number }) {
  switch (type) {
    case 'story':      return <Star      size={size} />;
    case 'expression': return <Sparkles  size={size} />;
    case 'dialogue':   return <Heart     size={size} />;
    case 'feature':    return <Gift      size={size} />;
    case 'ceremony':   return <Award     size={size} />;
    default:           return <Star      size={size} />;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Particle canvas
   ═══════════════════════════════════════════════════════════════════════ */

/** Internal representation of a single star / sparkle particle. */
interface SparkleParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** 0–1 opacity, fades out over particle lifetime. */
  opacity: number;
  color: string;
}

/** How long the sparkle burst animates (ms). */
const SPARKLE_DURATION_MS = 3_500;
/** Number of particles in the burst. */
const SPARKLE_COUNT = 60;

/** Soft colors that read well on both light and dark surfaces. */
const SPARKLE_COLORS = [
  '#fde68a', // warm gold
  '#f9a8d4', // soft pink
  '#c4b5fd', // lavender
  '#6ee7b7', // mint
  '#93c5fd', // sky blue
  '#fca5a5', // rose
  '#fbcfe8', // petal pink
  '#a5f3fc', // cyan
];

/**
 * Canvas overlay that emits a brief sparkle burst from the screen center.
 * Uses requestAnimationFrame — cleans up automatically when the animation ends.
 */
function SparkleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;

    // Radial burst from center
    const particles: SparkleParticle[] = Array.from({ length: SPARKLE_COUNT }, () => {
      const angle  = Math.random() * Math.PI * 2;
      const speed  = Math.random() * 5 + 2;
      return {
        x:       cx + (Math.random() - 0.5) * 40,
        y:       cy + (Math.random() - 0.5) * 40,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed,
        radius:  Math.random() * 3 + 1.5,
        opacity: 1,
        color:   SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
      };
    });

    const startTime = performance.now();
    let rafId: number;

    const animate = (now: number) => {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / SPARKLE_DURATION_MS, 1);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.vy += 0.07; // gentle gravity
        p.vx *= 0.98;
        p.x  += p.vx;
        p.y  += p.vy;
        // Fade out over the last 40% of the animation
        p.opacity = Math.max(0, 1 - Math.max(0, (progress - 0.6) / 0.4));

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.restore();
      }

      if (elapsed < SPARKLE_DURATION_MS) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   LevelUpCelebration
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Full-screen overlay celebrating a bond level-up.
 *
 * Displays the new level number with a glowing ring, an optional tier
 * transition banner (previousTier → tier), a staggered list of unlocks,
 * and a "Continue" call-to-action. Auto-dismisses after 10 seconds.
 *
 * All colors are resolved through CSS variables so the overlay works
 * correctly across all 18 built-in themes.
 *
 * @param newLevel      - The bond level just reached.
 * @param characterName - Character name shown in the headline.
 * @param tier          - Current tier key after level-up.
 * @param previousTier  - Optional previous tier key; triggers transition banner.
 * @param unlocks       - Ordered array of unlock objects to display.
 * @param onDismiss     - Callback fired on "Continue" click or auto-dismiss.
 *
 * @example
 * <LevelUpCelebration
 *   newLevel={10}
 *   characterName="Aria"
 *   tier="close_friend"
 *   previousTier="friend"
 *   unlocks={[
 *     { type: 'story',   label: 'Shared Memory: Rainy Day' },
 *     { type: 'feature', label: 'Voice Note Replies' },
 *   ]}
 *   onDismiss={() => setShowCelebration(false)}
 * />
 */
export function LevelUpCelebration({
  newLevel,
  characterName,
  tier,
  previousTier,
  unlocks,
  onDismiss,
}: LevelUpCelebrationProps) {
  const isTierUp = Boolean(previousTier && previousTier !== tier);

  // Stable dismiss ref so the timer closure never captures a stale callback
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  // Auto-dismiss after 10 s
  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  const accentColor = tierColor(tier);

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="levelup-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.60)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
        onClick={handleDismiss}
      >
        {/* Sparkle canvas sits behind the card */}
        <SparkleCanvas />

        {/* Card */}
        <motion.div
          key="levelup-card"
          initial={{ scale: 0.80, opacity: 0, y: 24 }}
          animate={{ scale: 1,    opacity: 1, y: 0  }}
          exit={{    scale: 0.88, opacity: 0, y: -16 }}
          transition={{ type: 'spring', damping: 20, stiffness: 260, delay: 0.05 }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative',
            zIndex: 2,
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '20px',
            padding: '36px 32px 28px',
            maxWidth: '420px',
            width: '90vw',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
            boxShadow: `0 24px 80px rgba(0,0,0,0.55), 0 0 48px color-mix(in srgb, ${accentColor} 18%, transparent)`,
            textAlign: 'center',
          }}
        >

          {/* ── Level ring ─────────────────────────────────────────────── */}
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1,   opacity: 1  }}
            transition={{ type: 'spring', damping: 14, stiffness: 320, delay: 0.15 }}
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              // Double ring via box-shadow
              boxShadow: `0 0 0 3px ${accentColor}, 0 0 24px color-mix(in srgb, ${accentColor} 45%, transparent), 0 0 60px color-mix(in srgb, ${accentColor} 22%, transparent)`,
              backgroundColor: 'var(--color-bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
            }}
          >
            <span
              style={{
                fontSize: '0.55rem',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: accentColor,
                lineHeight: 1,
                marginBottom: '2px',
              }}
            >
              Bond
            </span>
            <span
              style={{
                fontSize: '2.2rem',
                fontWeight: 800,
                lineHeight: 1,
                color: 'var(--color-text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {newLevel}
            </span>
          </motion.div>

          {/* ── Headline ──────────────────────────────────────────────── */}
          <p
            style={{
              margin: '0 0 4px',
              fontSize: '0.60rem',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--color-accent)',
            }}
          >
            Level Up!
          </p>
          <h2
            style={{
              margin: '0 0 6px',
              fontFamily: 'var(--font-display, "Fraunces"), serif',
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: '1.55rem',
              color: 'var(--color-text)',
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
            }}
          >
            {characterName}
          </h2>
          <p
            style={{
              margin: '0 0 20px',
              fontSize: '0.84rem',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            Your bond has deepened to level{' '}
            <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{newLevel}</span>.
          </p>

          {/* ── Tier transition banner ────────────────────────────────── */}
          {isTierUp && previousTier && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '12px',
                padding: '8px 16px',
                marginBottom: '20px',
                fontSize: '0.80rem',
                fontWeight: 600,
              }}
            >
              <span style={{ color: tierColor(previousTier), opacity: 0.75 }}>
                {tierLabel(previousTier)}
              </span>
              {/* Animated arrow */}
              <motion.span
                initial={{ x: -4, opacity: 0 }}
                animate={{ x: 0,  opacity: 1 }}
                transition={{ delay: 0.55, duration: 0.3 }}
                style={{ color: 'var(--color-text-tertiary)', fontSize: '0.75rem' }}
              >
                →
              </motion.span>
              <span style={{ color: tierColor(tier) }}>
                {tierLabel(tier)}
              </span>
            </motion.div>
          )}

          {/* ── Unlocks list ──────────────────────────────────────────── */}
          {unlocks.length > 0 && (
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                marginBottom: '24px',
              }}
            >
              <p
                style={{
                  margin: '0 0 6px',
                  fontSize: '0.60rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                  textAlign: 'left',
                }}
              >
                Unlocked
              </p>
              {unlocks.map((unlock, i) => (
                <motion.div
                  key={`${unlock.type}-${i}`}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0   }}
                  transition={{ delay: 0.40 + i * UNLOCK_STAGGER, duration: 0.3 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    textAlign: 'left',
                  }}
                >
                  {/* Icon badge */}
                  <span
                    style={{
                      flexShrink: 0,
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--color-accent-soft)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-accent)',
                    }}
                  >
                    <UnlockIcon type={unlock.type} size={13} />
                  </span>
                  <span
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--color-text-secondary)',
                      lineHeight: 1.4,
                    }}
                  >
                    {unlock.label}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {/* ── Continue button ───────────────────────────────────────── */}
          <button
            type="button"
            onClick={handleDismiss}
            style={{
              padding: '10px 36px',
              fontSize: '0.88rem',
              fontWeight: 600,
              borderRadius: '12px',
              border: 'none',
              background: 'var(--color-accent-gradient, var(--color-accent))',
              color: '#fff',
              cursor: 'pointer',
              letterSpacing: '0.04em',
              boxShadow: `0 4px 16px color-mix(in srgb, ${accentColor} 38%, transparent)`,
              transition: 'all 0.15s',
              width: '100%',
              maxWidth: '200px',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.88';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            }}
          >
            Continue
          </button>

          {/* ── Auto-dismiss hint ─────────────────────────────────────── */}
          <p
            style={{
              margin: '10px 0 0',
              fontSize: '0.62rem',
              color: 'var(--color-text-tertiary)',
              opacity: 0.50,
            }}
          >
            Closes automatically in a moment
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
