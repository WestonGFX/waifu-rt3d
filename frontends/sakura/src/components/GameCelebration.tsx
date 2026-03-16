/**
 * GameCelebration — confetti burst + animated banner for game wins.
 *
 * Reuses the confetti particle system from MilestoneCelebration but
 * scoped to the game panel overlay. Renders as an absolute overlay
 * within its parent container so confetti stays inside the game modal.
 *
 * Usage: wrap the game's finished screen:
 *   {state.finished && <GameCelebration won={state.won} />}
 *   {children}  // the existing result UI
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** Confetti particle colors — vibrant mix for celebration. */
const COLORS = [
  '#f472b6', '#fb923c', '#facc15', '#4ade80',
  '#60a5fa', '#c084fc', '#f9a8d4', '#86efac',
  '#fbbf24', '#a78bfa',
];

/** Win messages — randomly selected for variety. */
const WIN_MESSAGES = [
  'Amazing!',
  'You crushed it!',
  'Victory!',
  'Well played!',
  'Genius!',
  'Nailed it!',
  'Flawless!',
  'Champion!',
];

/** Loss encouragement messages. */
const LOSS_MESSAGES = [
  'Good effort!',
  'So close!',
  'Almost there!',
  'Next time!',
  'Keep going!',
];

/** Confetti particle shape. */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  w: number;
  h: number;
  angle: number;
  spin: number;
  opacity: number;
}

const CONFETTI_DURATION = 2500;
const CONFETTI_COUNT = 50;

/* ═══════════════════════════════════════════════════════════════════════
   Mini Confetti Canvas (scoped to parent)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Renders a confetti burst animation on an HTML5 canvas.
 * Scoped to its parent container via absolute positioning.
 */
function MiniConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resize();

    const startTime = performance.now();
    const w = canvas.width;
    const h = canvas.height;

    const particles: Particle[] = Array.from({ length: CONFETTI_COUNT }, () => ({
      x: w * 0.5 + (Math.random() - 0.5) * w * 0.6,
      y: h * 0.2 + (Math.random() - 0.5) * h * 0.2,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * -3 - 1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      w: Math.random() * 7 + 4,
      h: Math.random() * 4 + 2,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.2,
      opacity: 1,
    }));

    let rafId: number;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / CONFETTI_DURATION, 1);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.vy += 0.12;
        p.vx *= 0.98;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        p.opacity = Math.max(0, 1 - Math.max(0, (progress - 0.5) / 0.5));

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (elapsed < CONFETTI_DURATION) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
        borderRadius: 'inherit',
      }}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   GameCelebration Component
   ═══════════════════════════════════════════════════════════════════════ */

interface GameCelebrationProps {
  /** Whether the player won (true = confetti + win message, false = encouragement only). */
  won: boolean;
  /** Optional override message (e.g., score-based grade from trivia). */
  message?: string;
}

/**
 * Animated celebration overlay for game results.
 *
 * On win: confetti burst + animated banner with random win message.
 * On loss: subtle fade-in encouragement text (no confetti).
 *
 * Renders as an absolute overlay — place it inside the game panel's
 * result container with ``position: relative`` on the parent.
 *
 * @example
 * ```tsx
 * <div style={{ position: 'relative' }}>
 *   <GameCelebration won={state.won} />
 *   {existingResultUI}
 * </div>
 * ```
 */
export function GameCelebration({ won, message }: GameCelebrationProps) {
  const [displayMessage] = useState(() =>
    message ?? (won
      ? WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)]
      : LOSS_MESSAGES[Math.floor(Math.random() * LOSS_MESSAGES.length)]
    )
  );

  return (
    <>
      {/* Confetti on win only */}
      {won && <MiniConfetti />}

      {/* Animated banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 15,
          delay: 0.1,
        }}
        style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          padding: '6px 16px',
          borderRadius: 20,
          backgroundColor: won
            ? 'var(--color-accent)'
            : 'var(--color-bg-secondary)',
          color: won ? 'white' : 'var(--color-text-secondary)',
          fontSize: '0.8rem',
          fontWeight: 700,
          letterSpacing: '0.03em',
          boxShadow: won
            ? '0 4px 20px rgba(0,0,0,0.25)'
            : '0 2px 10px rgba(0,0,0,0.1)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {won ? '🎉 ' : ''}{displayMessage}{won ? ' 🎉' : ''}
      </motion.div>
    </>
  );
}
