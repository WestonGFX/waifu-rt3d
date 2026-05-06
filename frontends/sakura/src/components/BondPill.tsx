import { useEffect, useRef, useState } from 'react';
import { Heart, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

const TIER_BAR_COLORS: Record<string, string> = {
  stranger: 'var(--color-text-tertiary)',
  acquaintance: '#60a5fa',
  friend: '#34d399',
  close_friend: '#a78bfa',
  soulmate: '#fbbf24',
};

const TIER_LABELS: Record<string, string> = {
  stranger: 'Stranger',
  acquaintance: 'Acquaintance',
  friend: 'Friend',
  close_friend: 'Close Friend',
  soulmate: 'Soulmate',
};

const AFFINITY_TIERS = [
  { min: 0.90, label: 'Soulmate', color: 'var(--color-accent)' },
  { min: 0.70, label: 'Devoted',  color: 'var(--color-success)' },
  { min: 0.50, label: 'Close',    color: 'var(--color-accent)' },
  { min: 0.30, label: 'Friendly', color: 'var(--color-text-secondary)' },
  { min: 0.00, label: 'Neutral',  color: 'var(--color-text-tertiary)' },
] as const;

function getAffinityTier(affinity: number) {
  return AFFINITY_TIERS.find(t => affinity >= t.min) ?? AFFINITY_TIERS[AFFINITY_TIERS.length - 1];
}

function scoreColor(v: number): string {
  if (v >= 0.7) return 'var(--color-success)';
  if (v >= 0.4) return 'var(--color-accent)';
  return 'var(--color-text-tertiary)';
}

function fmtXp(n: number): string {
  return n.toLocaleString();
}

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface RelationshipData {
  affinity: number;
  mood: number;
  trust: number;
  interactions: number;
}

interface StreakData {
  streak: number;
  total_xp: number;
  tier: string;
  next_tier: string;
  xp_to_next: number;
}

interface XpPopup {
  id: number;
  delta: number;
}

export interface BondPillProps {
  charId: number;
  bondLevel: number;
  bondXp: number;
  xpToNext: number;
  tier: string;
  nextUnlock?: { level: number; label: string } | null;
  /** Triggers re-fetch of relationship + streak data. */
  messageCount: number;
  /** Optional idle-phrase line shown in the expanded panel. */
  idlePhrase?: string;
  /** When > 0 and changed, spawns a "+N XP" popup animation. */
  xpDelta?: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * BondPill — single-line bond strip for the chat header (HUD Tier 4).
 *
 * Replaces the previous 4-row block (idle phrase, RelationshipBar, BondProgressBar
 * card, level-tier badge) with one click-to-expand pill. Always-visible row shows
 * `♥ Lv N · Tier ▰▱▱ XP/XP_to_next · 🔥 streak`. Click toggles an inline detail
 * panel containing the 3 affinity mini-bars (♥ ✦ ◈), affinity sparkline, next-unlock
 * teaser, and idle phrase.
 *
 * All colors use CSS variables so the component works across the 18 themes; tier
 * accent colors are the only fixed-palette exception (per the BondProgressBar
 * convention this component supersedes).
 */
export function BondPill({
  charId,
  bondLevel,
  bondXp,
  xpToNext,
  tier,
  nextUnlock,
  messageCount,
  idlePhrase,
  xpDelta,
}: BondPillProps) {
  const [expanded, setExpanded] = useState(false);
  const [rel, setRel] = useState<RelationshipData | null>(null);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const affinityHistory = useRef<number[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-outside dismiss for the floating detail panel
  useEffect(() => {
    if (!expanded) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (e.target instanceof Node && !wrapRef.current.contains(e.target)) {
        setExpanded(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [expanded]);

  // ── XP popup queue (mirrors BondProgressBar) ─────────────────────────
  const [popups, setPopups] = useState<XpPopup[]>([]);
  const popupIdRef = useRef(0);
  const prevDeltaRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (
      xpDelta !== undefined &&
      xpDelta > 0 &&
      xpDelta !== prevDeltaRef.current
    ) {
      const id = ++popupIdRef.current;
      setPopups(prev => [...prev, { id, delta: xpDelta }]);
      const timer = setTimeout(() => {
        setPopups(prev => prev.filter(p => p.id !== id));
      }, 1900);
      prevDeltaRef.current = xpDelta;
      return () => clearTimeout(timer);
    }
  }, [xpDelta]);

  // ── Fetch relationship + streak whenever the chat advances ───────────
  useEffect(() => {
    api.getRelationship(charId)
      .then(data => {
        setRel(data);
        affinityHistory.current = [...affinityHistory.current.slice(-9), data.affinity];
      })
      .catch(() => {});
    api.getCharacterStreak(charId)
      .then(setStreak)
      .catch(() => setStreak(null));
  }, [charId, messageCount]);

  // ── Derived values ───────────────────────────────────────────────────
  // `xpToNext` is XP *remaining* until next level. The level threshold is
  // therefore bondXp + xpToNext. Displaying `{bondXp}/{xpToNext}` reads as
  // "138 of 12" when bondXp overshoots the remainder — confusing. Show
  // `{bondXp}/{threshold} XP · {xpToNext} to next` so both numbers tell a
  // consistent story.
  const levelThreshold = bondXp + Math.max(0, xpToNext);
  const fillPercent = levelThreshold > 0
    ? Math.min(100, Math.max(0, (bondXp / levelThreshold) * 100))
    : 0;
  const barColor = TIER_BAR_COLORS[tier] ?? 'var(--color-accent)';
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const streakCount = streak?.streak ?? 0;
  const showStreak = streakCount > 0;

  const collapsedAriaLabel = `Bond level ${bondLevel}, ${tierLabel}, ${fmtXp(bondXp)} of ${fmtXp(levelThreshold)} XP, ${fmtXp(xpToNext)} to next level${
    showStreak ? `, daily streak ${streakCount}` : ''
  }. Click to ${expanded ? 'collapse' : 'expand'} bond detail.`;

  const Caret = expanded ? ChevronUp : ChevronDown;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 10,
        userSelect: 'none',
      }}
    >
      {/* ── Always-visible single-line pill ── */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        aria-label={collapsedAriaLabel}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '7px 12px',
          backgroundColor: 'transparent',
          border: 'none',
          color: 'var(--color-text)',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: 13,
          lineHeight: 1.4,
        }}
      >
        <Heart size={14} style={{ color: barColor, flexShrink: 0 }} aria-hidden />

        <span style={{ fontWeight: 600, flexShrink: 0 }}>Lv {bondLevel}</span>

        <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400, flexShrink: 0 }} aria-hidden>·</span>

        <span style={{ color: barColor, fontWeight: 500, flexShrink: 0 }}>{tierLabel}</span>

        {/* Inline progress bar (80px) */}
        <div
          style={{
            position: 'relative',
            width: 80,
            height: 6,
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: 999,
            overflow: 'hidden',
            flexShrink: 0,
            margin: '0 2px',
          }}
          role="progressbar"
          aria-valuenow={bondXp}
          aria-valuemin={0}
          aria-valuemax={levelThreshold}
          aria-label="Bond XP progress"
        >
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

        <span
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          aria-hidden
        >
          {fmtXp(bondXp)}/{fmtXp(levelThreshold)} XP · {fmtXp(xpToNext)} to next
        </span>

        {showStreak && (
          <span
            title={`Daily streak: ${streakCount}${streak?.next_tier ? ` · ${streak.xp_to_next} XP to ${streak.next_tier}` : ''}`}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--color-warning, #f59e0b)',
              backgroundColor: 'color-mix(in srgb, var(--color-warning, #f59e0b) 12%, transparent)',
              padding: '2px 6px',
              borderRadius: 6,
              flexShrink: 0,
              lineHeight: 1.5,
            }}
          >
            🔥 {streakCount}
          </span>
        )}

        {/* Spacer pushes caret right */}
        <span style={{ flex: 1 }} aria-hidden />

        <Caret size={16} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} aria-hidden />
      </button>

      {/* ── XP delta popup (anchored to pill row) ── */}
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
              right: 30,
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

      {/* ── Expanded detail panel (floating popover, zero layout shift) ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              zIndex: 30,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 10,
              boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
            }}
          >
            <div
              style={{
                padding: '8px 10px 10px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {rel && (
                <div className="flex items-center gap-2" style={{ flexWrap: 'nowrap' }}>
                  {(() => {
                    const aff = getAffinityTier(rel.affinity);
                    return (
                      <span
                        title={`Affinity: ${Math.round(rel.affinity * 100)}%`}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 99,
                          border: `1px solid ${aff.color}`,
                          color: aff.color,
                          lineHeight: 1.6,
                          letterSpacing: '0.02em',
                          flexShrink: 0,
                        }}
                      >
                        {aff.label}
                      </span>
                    );
                  })()}

                  {([
                    { key: 'affinity' as const, emoji: '♥', label: 'Affinity' },
                    { key: 'mood'     as const, emoji: '✦', label: 'Mood' },
                    { key: 'trust'    as const, emoji: '◈', label: 'Trust' },
                  ]).map(({ key, emoji, label }) => (
                    <div
                      key={key}
                      className="flex items-center gap-1"
                      title={`${label}: ${(rel[key] * 100).toFixed(0)}%`}
                    >
                      <span style={{ fontSize: 10, color: scoreColor(rel[key]), lineHeight: 1 }}>{emoji}</span>
                      <div style={{ width: 28, height: 4, borderRadius: 99, backgroundColor: 'var(--color-border)' }}>
                        <div
                          style={{
                            width: `${Math.round(rel[key] * 100)}%`,
                            height: '100%',
                            borderRadius: 99,
                            backgroundColor: scoreColor(rel[key]),
                            transition: 'width 0.6s ease',
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                    {rel.interactions}×
                  </span>

                  {affinityHistory.current.length >= 3 && (() => {
                    const h = affinityHistory.current;
                    const W = 48, H = 14;
                    const minV = Math.min(...h);
                    const maxV = Math.max(...h);
                    const range = maxV - minV || 0.01;
                    const pts = h.map((v, i) => {
                      const x = (i / (h.length - 1)) * W;
                      const y = H - ((v - minV) / range) * (H - 2) - 1;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    }).join(' ');
                    const last = h[h.length - 1];
                    const lastY = H - ((last - minV) / range) * (H - 2) - 1;
                    return (
                      <svg
                        width={W} height={H} viewBox={`0 0 ${W} ${H}`}
                        style={{ flexShrink: 0, opacity: 0.75 }}
                        aria-label="Affinity trend" role="img"
                      >
                        <polyline
                          points={pts} fill="none"
                          stroke="var(--color-accent)" strokeWidth="1.5"
                          strokeLinecap="round" strokeLinejoin="round"
                        />
                        <circle cx={W} cy={lastY} r="2" fill="var(--color-accent)" />
                      </svg>
                    );
                  })()}
                </div>
              )}

              {nextUnlock && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.4,
                  }}
                >
                  Next: {nextUnlock.label}{' '}
                  <span style={{ color: 'var(--color-text-tertiary)' }}>(Lv {nextUnlock.level})</span>
                </div>
              )}

              {idlePhrase && (
                <div
                  style={{
                    fontSize: 11,
                    fontStyle: 'italic',
                    color: 'var(--color-text-tertiary)',
                    lineHeight: 1.4,
                  }}
                >
                  {idlePhrase}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
