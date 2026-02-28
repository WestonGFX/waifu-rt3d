import { useEffect, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** Props for the MilestoneCelebration overlay component. */
export interface MilestoneCelebrationProps {
  /** The tier name to celebrate, e.g. "Soulmate". Null = hidden. */
  tier: string | null;
  /** Character name shown in the celebration message. */
  charName: string;
  /** Called when the user clicks "Continue" or the overlay auto-closes. */
  onClose: () => void;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Affinity tiers in descending order.
 * Mirrors the AFFINITY_TIERS array in StatusBar.tsx.
 */
const AFFINITY_TIERS = [
  { min: 0.90, label: 'Soulmate' },
  { min: 0.70, label: 'Devoted'  },
  { min: 0.50, label: 'Close'    },
  { min: 0.30, label: 'Friendly' },
  { min: 0.00, label: 'Neutral'  },
] as const;

type TierLabel = (typeof AFFINITY_TIERS)[number]['label'];

/** Emoji assigned to each tier for the celebration modal. */
const TIER_EMOJI: Record<TierLabel, string> = {
  Soulmate: '✨',
  Devoted:  '💖',
  Close:    '🌸',
  Friendly: '😊',
  Neutral:  '👋',
};

/** Warm message shown below the tier title in the modal. */
const TIER_MESSAGES: Record<TierLabel, string> = {
  Soulmate: 'An unbreakable bond — you two are truly soulmates now.',
  Devoted:  'Your connection has deepened into something truly devoted and sincere.',
  Close:    'You\'ve grown close — a warm friendship is blossoming.',
  Friendly: 'You\'re officially on friendly terms. A great start!',
  Neutral:  'Every journey starts somewhere. Nice to meet you.',
};

/** Confetti particle colors — a cheerful mix that works on dark backgrounds. */
const CONFETTI_COLORS = [
  '#f472b6', // pink
  '#fb923c', // orange
  '#facc15', // yellow
  '#4ade80', // green
  '#60a5fa', // blue
  '#c084fc', // purple
  '#f9a8d4', // light pink
  '#86efac', // light green
  '#93c5fd', // light blue
];

/* ═══════════════════════════════════════════════════════════════════════
   Confetti canvas
   ═══════════════════════════════════════════════════════════════════════ */

/** Internal shape for a single confetti particle. */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  /** Width of the rectangular particle. */
  w: number;
  /** Height of the rectangular particle. */
  h: number;
  /** Current rotation angle in radians. */
  angle: number;
  /** Rotation speed in radians per frame. */
  spin: number;
  /** 0–1 opacity, fades out over lifetime. */
  opacity: number;
}

/** Total duration the confetti animation runs (ms). */
const CONFETTI_DURATION_MS = 3000;
/** Number of confetti particles to spawn. */
const CONFETTI_COUNT = 80;

/**
 * Renders an HTML5 canvas confetti burst that runs for ~3 seconds.
 * Uses gravity + gentle horizontal drift with no external dependencies.
 * The canvas is removed from the DOM when the animation ends.
 */
function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /** Resize canvas to fill the viewport. */
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const startTime = performance.now();

    // Spawn particles from a band across the top of the screen
    const particles: Particle[] = Array.from({ length: CONFETTI_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.3 - canvas.height * 0.1, // start above fold
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 1,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      w: Math.random() * 8 + 5,
      h: Math.random() * 4 + 3,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.15,
      opacity: 1,
    }));

    let rafId: number;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / CONFETTI_DURATION_MS, 1);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        // Physics
        p.vy += 0.08; // gravity
        p.vx *= 0.99; // slight air resistance
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        // Fade out in the final third of the animation
        p.opacity = Math.max(0, 1 - Math.max(0, (progress - 0.67) / 0.33));

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (elapsed < CONFETTI_DURATION_MS) {
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
   MilestoneCelebration component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Full-screen celebration overlay shown when the user's relationship tier
 * advances to a new level.
 *
 * Renders a canvas confetti burst (3 seconds) and a centered modal card
 * with a large emoji, tier name, and a personalised message. Auto-closes
 * after 6 seconds if the user does not click "Continue".
 *
 * @param tier     - The new tier name, e.g. "Soulmate". Pass null to hide.
 * @param charName - Character name shown in the message body.
 * @param onClose  - Callback invoked when the modal is dismissed.
 *
 * @example
 * <MilestoneCelebration
 *   tier={celebrationTier}
 *   charName="Aria"
 *   onClose={clearCelebration}
 * />
 */
export function MilestoneCelebration({ tier, charName, onClose }: MilestoneCelebrationProps) {
  // Auto-close timer
  useEffect(() => {
    if (!tier) return;
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [tier, onClose]);

  const emoji = TIER_EMOJI[tier as TierLabel] ?? '🎉';
  const message = TIER_MESSAGES[tier as TierLabel] ?? 'A new milestone reached!';

  return (
    <AnimatePresence>
      {tier && (
        <motion.div
          key="milestone-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.72)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // Let canvas sit behind the modal
            overflow: 'hidden',
          }}
          onClick={onClose}
        >
          {/* Confetti canvas — sits behind the modal card */}
          <ConfettiCanvas />

          {/* Modal card */}
          <motion.div
            key="milestone-card"
            initial={{ scale: 0.75, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280, delay: 0.05 }}
            onClick={e => e.stopPropagation()} // Don't close when clicking inside the card
            style={{
              position: 'relative',
              zIndex: 2,
              backgroundColor: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              borderRadius: '20px',
              padding: '40px 36px',
              maxWidth: '340px',
              width: '90vw',
              textAlign: 'center',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 40px color-mix(in srgb, var(--color-accent) 20%, transparent)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            {/* Decorative accent ring behind the emoji */}
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-accent-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.2rem',
                lineHeight: 1,
              }}
            >
              {emoji}
            </div>

            {/* Heading */}
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--color-accent)',
                  marginBottom: '6px',
                }}
              >
                New Milestone!
              </p>
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-display, "Fraunces"), serif',
                  fontStyle: 'italic',
                  fontWeight: 300,
                  fontSize: '2rem',
                  color: 'var(--color-text-primary)',
                  lineHeight: 1.15,
                  letterSpacing: '-0.01em',
                }}
              >
                {tier}
              </h2>
            </div>

            {/* Message */}
            <p
              style={{
                margin: 0,
                fontSize: '0.88rem',
                lineHeight: 1.7,
                color: 'var(--color-text-secondary)',
              }}
            >
              You've reached{' '}
              <span style={{ fontFamily: 'var(--font-display, "Fraunces"), serif', fontStyle: 'italic', color: 'var(--color-text-primary)' }}>{tier}</span>{' '}
              with{' '}
              <span style={{ fontFamily: 'var(--font-display, "Fraunces"), serif', fontStyle: 'italic', color: 'var(--color-accent)' }}>{charName}</span>!{' '}
              {message}
            </p>

            {/* Continue button */}
            <button
              onClick={onClose}
              className="send-btn"
              style={{
                marginTop: '8px',
                padding: '10px 28px',
                fontSize: '0.88rem',
                fontWeight: 600,
                borderRadius: '10px',
                border: 'none',
                background: 'var(--color-accent-gradient)',
                color: '#fff',
                cursor: 'pointer',
                letterSpacing: '0.04em',
                boxShadow: '0 4px 16px color-mix(in srgb, var(--color-accent) 40%, transparent)',
                transition: 'all 0.2s',
              }}
            >
              Continue
            </button>

            {/* Auto-close hint */}
            <p
              style={{
                margin: 0,
                fontSize: '0.65rem',
                color: 'var(--color-text-tertiary)',
                opacity: 0.55,
              }}
            >
              Closes automatically in a moment
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   useMilestoneDetection hook
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Converts a 0–1 affinity value to its tier label.
 *
 * @param affinity - Affinity score in the 0–1 range.
 * @returns Tier label string (e.g. "Soulmate"), or null when affinity is null.
 */
function getTierLabel(affinity: number | null): TierLabel | null {
  if (affinity === null) return null;
  return (AFFINITY_TIERS.find(t => affinity >= t.min) ?? AFFINITY_TIERS[AFFINITY_TIERS.length - 1]).label;
}

/**
 * Return value of useMilestoneDetection.
 */
export interface MilestoneDetectionResult {
  /**
   * The tier name to celebrate if a tier-up just occurred, e.g. "Soulmate".
   * Null when there is no active celebration.
   */
  celebrationTier: TierLabel | null;
  /** Call this to dismiss the celebration (pass to MilestoneCelebration.onClose). */
  clearCelebration: () => void;
}

/**
 * Tracks the active character's affinity score and triggers a celebration
 * whenever the tier advances upward (e.g. Friendly → Close).
 *
 * Internal logic:
 * 1. On mount (or when `affinity` is first non-null), stores the initial tier
 *    in a ref without triggering a celebration — this prevents showing the
 *    overlay on every page load.
 * 2. On subsequent changes, compares the new tier's index against the
 *    previous one. A lower index means a higher tier (AFFINITY_TIERS is
 *    ordered descending). Only tier-ups trigger a celebration.
 *
 * @param affinity - Current affinity score (0–1) or null if unknown.
 * @param charName - Character name forwarded to the celebration modal.
 * @returns `{ celebrationTier, clearCelebration }`
 *
 * @example
 * const { celebrationTier, clearCelebration } = useMilestoneDetection(rel?.affinity, char.name);
 * return (
 *   <MilestoneCelebration tier={celebrationTier} charName={char.name} onClose={clearCelebration} />
 * );
 */
export function useMilestoneDetection(
  affinity: number | null,
  charName: string
): MilestoneDetectionResult {
  const [celebrationTier, setCelebrationTier] = useState<TierLabel | null>(null);

  /**
   * Index of the previous tier in AFFINITY_TIERS.
   * -1 means we haven't seen any affinity value yet (prevents false positives on mount).
   */
  const prevTierIndexRef = useRef<number>(-1);

  const clearCelebration = useCallback(() => {
    setCelebrationTier(null);
  }, []);

  useEffect(() => {
    if (affinity === null) return;

    const currentLabel = getTierLabel(affinity);
    if (!currentLabel) return;

    const currentIndex = AFFINITY_TIERS.findIndex(t => t.label === currentLabel);

    if (prevTierIndexRef.current === -1) {
      // First time we see an affinity — record it but don't celebrate.
      prevTierIndexRef.current = currentIndex;
      return;
    }

    // A lower index = a higher tier (array is ordered descending)
    if (currentIndex < prevTierIndexRef.current) {
      setCelebrationTier(currentLabel);
    }

    prevTierIndexRef.current = currentIndex;
  }, [affinity]);

  // Reset the tracked tier index when the character changes (charName acts as a proxy)
  useEffect(() => {
    prevTierIndexRef.current = -1;
    setCelebrationTier(null);
  }, [charName]);

  return { celebrationTier, clearCelebration };
}
