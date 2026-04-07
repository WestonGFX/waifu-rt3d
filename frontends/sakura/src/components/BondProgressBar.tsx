import { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Maps bond tier keys to their progress bar fill colors.
 * Tiers with no theme-variable equivalent use a fixed accent so they
 * remain visually distinct across all 18 themes.
 */
const TIER_BAR_COLORS: Record<string, string> = {
  stranger: 'var(--color-text-tertiary)',
  acquaintance: '#60a5fa',
  friend: '#34d399',
  close_friend: '#a78bfa',
  soulmate: '#fbbf24',
};

/**
 * Human-readable display labels for each bond tier key.
 */
const TIER_LABELS: Record<string, string> = {
  stranger: 'Stranger',
  acquaintance: 'Acquaintance',
  friend: 'Friend',
  close_friend: 'Close Friend',
  soulmate: 'Soulmate',
};

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Formats a raw XP integer as a locale string (e.g. 1847 → "1,847").
 *
 * @param n - The integer to format.
 * @returns A locale-formatted string.
 */
function fmtXp(n: number): string {
  return n.toLocaleString();
}

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** A pending XP gain popup, keyed so multiple rapid gains can stack. */
interface XpPopup {
  id: number;
  delta: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════════════════ */

export interface BondProgressBarProps {
  /** Current bond level (e.g. 23). */
  bondLevel: number;
  /** Current XP within this level. */
  bondXp: number;
  /** Total XP required to reach the next level. */
  xpToNext: number;
  /**
   * Bond tier key from the backend.
   * One of: stranger | acquaintance | friend | close_friend | soulmate
   */
  tier: string;
  /** Optional upcoming unlock teaser displayed below the bar. */
  nextUnlock?: { level: number; label: string } | null;
  /**
   * When provided and > 0, triggers a "+N XP" popup animation.
   * The parent should update this prop each time XP is awarded.
   * The component manages its own popup queue internally.
   */
  xpDelta?: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * BondProgressBar — animated XP bar for the character/bond panel.
 *
 * Renders a compact card showing the character's current bond level, tier,
 * XP progress, and an optional next-unlock teaser. When `xpDelta` changes
 * to a positive value, a "+N XP" badge floats up and fades out.
 *
 * All colors use CSS variables so the component works across all 18 themes.
 * The tier accent color is the only hardcoded exception (fixed palette per
 * design spec so tiers are visually distinct regardless of active theme).
 *
 * @example
 * ```tsx
 * <BondProgressBar
 *   bondLevel={23}
 *   bondXp={1847}
 *   xpToNext={2350}
 *   tier="friend"
 *   nextUnlock={{ level: 25, label: 'Expression unlock' }}
 *   xpDelta={recentDelta}
 * />
 * ```
 */
export function BondProgressBar({
  bondLevel,
  bondXp,
  xpToNext,
  tier,
  nextUnlock,
  xpDelta,
}: BondProgressBarProps) {
  // ── XP popup queue ────────────────────────────────────────────────────
  const [popups, setPopups] = useState<XpPopup[]>([]);
  const popupIdRef = useRef(0);
  const prevDeltaRef = useRef<number | undefined>(undefined);

  // Spawn a new popup whenever xpDelta changes to a positive value.
  useEffect(() => {
    if (
      xpDelta !== undefined &&
      xpDelta > 0 &&
      xpDelta !== prevDeltaRef.current
    ) {
      const id = ++popupIdRef.current;
      setPopups(prev => [...prev, { id, delta: xpDelta }]);

      // Auto-remove after the animation completes (1.5s display + 0.4s exit).
      const timer = setTimeout(() => {
        setPopups(prev => prev.filter(p => p.id !== id));
      }, 1900);

      prevDeltaRef.current = xpDelta;
      return () => clearTimeout(timer);
    }
  }, [xpDelta]);

  // ── Derived values ────────────────────────────────────────────────────
  const fillPercent = xpToNext > 0
    ? Math.min(100, Math.max(0, (bondXp / xpToNext) * 100))
    : 0;

  const barColor = TIER_BAR_COLORS[tier] ?? 'var(--color-accent)';
  const tierLabel = TIER_LABELS[tier] ?? tier;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'relative',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 10,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        userSelect: 'none',
      }}
      aria-label={`Bond level ${bondLevel}, ${tierLabel}, ${fmtXp(bondXp)} of ${fmtXp(xpToNext)} XP`}
    >
      {/* ── Level + tier row ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: 'var(--color-text)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <Heart
            size={13}
            style={{ color: barColor, flexShrink: 0 }}
            aria-hidden
          />
          <span>Level {bondLevel}</span>
          <span
            style={{
              color: 'var(--color-text-tertiary)',
              fontWeight: 400,
              fontSize: 12,
            }}
            aria-hidden
          >
            ·
          </span>
          <span
            style={{
              color: barColor,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {tierLabel}
          </span>
        </div>

        {/* XP numbers — right-aligned */}
        <span
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
          aria-hidden
        >
          {fmtXp(bondXp)} / {fmtXp(xpToNext)} XP
        </span>
      </div>

      {/* ── Progress bar track ── */}
      <div
        style={{
          position: 'relative',
          height: 7,
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: 999,
          overflow: 'hidden',
        }}
        role="progressbar"
        aria-valuenow={bondXp}
        aria-valuemin={0}
        aria-valuemax={xpToNext}
        aria-label="Bond XP progress"
      >
        {/* Animated fill */}
        <motion.div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            backgroundColor: barColor,
            borderRadius: 999,
            transformOrigin: 'left center',
          }}
          animate={{ width: `${fillPercent}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        />
      </div>

      {/* ── Next unlock teaser ── */}
      {nextUnlock && (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            textAlign: 'center',
            letterSpacing: '0.01em',
          }}
        >
          Next: {nextUnlock.label} (Lv {nextUnlock.level})
        </p>
      )}

      {/* ── XP delta popup ── */}
      <AnimatePresence>
        {popups.map(popup => (
          <motion.div
            key={popup.id}
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -8 }}
            exit={{ opacity: 0, y: -28 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 4,
              right: 12,
              pointerEvents: 'none',
              backgroundColor: barColor,
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 8,
              padding: '2px 7px',
              lineHeight: 1.4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              zIndex: 10,
            }}
            aria-live="polite"
            aria-label={`+${popup.delta} XP`}
          >
            +{fmtXp(popup.delta)} XP
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
