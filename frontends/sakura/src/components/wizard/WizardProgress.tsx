import { motion } from 'framer-motion';

interface WizardProgressProps {
  /** Zero-based index of the current step. */
  current: number;
  /** Total number of steps. */
  total: number;
  /** Optional step labels for the labeled bar variant (used when total > 6). */
  labels?: string[];
}

/**
 * Wizard progress indicator.
 *
 * - For 6 or fewer steps: expanding pill dots (active = wider pill).
 * - For more than 6 steps: labeled progress bar with step names.
 */
export function WizardProgress({ current, total, labels }: WizardProgressProps) {
  if (total > 6 && labels) {
    return <LabeledBar current={current} total={total} labels={labels} />;
  }
  return <DotIndicator current={current} total={total} />;
}

/* ── Dot variant (≤6 steps) ───────────────────────────────────────────── */

function DotIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          animate={{
            width: i === current ? 20 : 8,
            height: 8,
            backgroundColor: i <= current
              ? 'var(--color-accent)'
              : 'var(--color-border)',
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/* ── Labeled bar variant (>6 steps) ───────────────────────────────────── */

function LabeledBar({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  const pct = ((current + 1) / total) * 100;

  return (
    <div className="w-full max-w-sm">
      {/* Progress bar track */}
      <div
        className="h-1.5 rounded-full overflow-hidden mb-2"
        style={{ backgroundColor: 'var(--color-border)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'var(--color-accent-gradient)' }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        />
      </div>
      {/* Step label */}
      <p className="text-[10px] text-center" style={{ color: 'var(--color-text-tertiary)' }}>
        Step {current + 1} of {total}: {labels[current] || ''}
      </p>
    </div>
  );
}
