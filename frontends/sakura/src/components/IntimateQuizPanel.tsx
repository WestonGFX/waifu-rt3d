/**
 * IntimateQuizPanel — Feature F22: Intimate Discovery Quiz
 *
 * Overlay panel showing the character's intimate quiz progress.
 * The quiz itself happens naturally in conversation — the character
 * asks questions organically. This panel shows which categories
 * have been explored, overall progress, and bond eligibility.
 *
 * API surface:
 *   GET /api/characters/{id}/intimate-quiz/progress
 *       → { ok, progress: { total, answered, percentage, by_category },
 *           eligible, categories, bond_level }
 *
 * @module IntimateQuizPanel
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, HelpCircle, Loader2, Lock, CheckCircle, Circle,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** Quiz progress returned by the backend. */
interface QuizProgress {
  total: number;
  answered: number;
  percentage: number;
  by_category: Record<string, { total: number; answered: number }>;
}

/** Quiz category info. */
interface QuizCategory {
  id: string;
  name: string;
  description: string;
  question_count: number;
}

interface IntimateQuizPanelProps {
  /** Whether the panel is visible. */
  isOpen: boolean;
  /** Callback to close the panel. */
  onClose: () => void;
  /** Character database ID. */
  characterId: number;
  /** Character display name. */
  characterName: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

const CATEGORY_COLORS: Record<string, string> = {
  romantic:   '#ef4444',
  physical:   '#a855f7',
  emotional:  '#3b82f6',
  playful:    '#fbbf24',
  fantasy:    '#8b5cf6',
  boundaries: '#22c55e',
};

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Progress tracker for the intimate discovery quiz. Shows a visual
 * breakdown of which question categories have been explored and the
 * overall completion percentage. The quiz questions themselves are
 * woven into natural conversation by the character.
 *
 * @param props - See {@link IntimateQuizPanelProps}.
 *
 * @example
 * <IntimateQuizPanel
 *   isOpen={showQuiz}
 *   onClose={() => setShowQuiz(false)}
 *   characterId={5}
 *   characterName="Luna"
 * />
 */
export function IntimateQuizPanel({
  isOpen,
  onClose,
  characterId,
  characterName,
}: IntimateQuizPanelProps) {
  const [progress, setProgress] = useState<QuizProgress | null>(null);
  const [categories, setCategories] = useState<QuizCategory[]>([]);
  const [eligible, setEligible] = useState(false);
  const [bondLevel, setBondLevel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Fetch progress ──────────────────────────────────────────────── */

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/intimate-quiz/progress`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProgress(data.progress ?? null);
      setCategories(data.categories ?? []);
      setEligible(data.eligible ?? false);
      setBondLevel(data.bond_level ?? 0);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    if (isOpen && characterId) fetchProgress();
  }, [isOpen, characterId, fetchProgress]);

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[200]"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed inset-y-4 right-4 z-[201] flex flex-col overflow-hidden"
            style={{
              width: 400,
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-elevated)',
              border: '1px solid var(--color-border-subtle)',
            }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            {/* ── Header ──────────────────────────────────────────── */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <HelpCircle size={16} style={{ color: 'var(--color-accent)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Discovery Quiz
                </h2>
                {progress && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'var(--color-accent-soft)',
                      color: 'var(--color-accent)',
                      fontSize: '0.65rem',
                    }}
                  >
                    {progress.percentage}%
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:opacity-80 transition-opacity"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Close quiz progress"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Body ────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
                </div>
              )}

              {error && (
                <div className="text-xs text-center py-8" style={{ color: 'var(--color-danger)' }}>
                  Failed to load quiz progress
                </div>
              )}

              {!loading && !error && !eligible && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Lock size={28} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
                  <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                    {characterName} will start asking discovery questions<br />
                    as your bond grows deeper
                  </p>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'rgba(251, 191, 36, 0.08)',
                      color: '#f59e0b',
                      fontSize: '0.6rem',
                    }}
                  >
                    Current bond: {bondLevel}
                  </span>
                </div>
              )}

              {!loading && !error && eligible && progress && (
                <div className="space-y-4">
                  {/* Overall progress bar */}
                  <div
                    className="rounded-lg p-4"
                    style={{
                      backgroundColor: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        Overall Progress
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {progress.answered} / {progress.total}
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'var(--color-border)' }}
                    >
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: 'var(--color-accent)' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress.percentage}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                    <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                      {characterName} weaves these questions naturally into your conversations
                    </p>
                  </div>

                  {/* Category breakdown */}
                  <div>
                    <h3
                      className="text-xs font-semibold uppercase tracking-wider mb-2"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      Categories
                    </h3>
                    {categories.map((cat) => {
                      const catProgress = progress.by_category[cat.id];
                      const answered = catProgress?.answered ?? 0;
                      const total = catProgress?.total ?? cat.question_count;
                      const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
                      const color = CATEGORY_COLORS[cat.id] ?? 'var(--color-accent)';
                      const complete = answered >= total;

                      return (
                        <div
                          key={cat.id}
                          className="mb-2 rounded-lg p-3"
                          style={{
                            backgroundColor: 'var(--color-surface-raised)',
                            border: '1px solid var(--color-border-subtle)',
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {complete
                                ? <CheckCircle size={13} style={{ color }} />
                                : <Circle size={13} style={{ color: 'var(--color-border)' }} />}
                              <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                {cat.name}
                              </span>
                            </div>
                            <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                              {answered}/{total}
                            </span>
                          </div>
                          <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                            {cat.description}
                          </p>
                          <div
                            className="h-1.5 rounded-full overflow-hidden"
                            style={{ backgroundColor: 'var(--color-border)' }}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
