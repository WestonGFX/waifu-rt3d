import { useMemo, useState } from 'react';
import { type ContextBudgetBreakdown, type ContextBudgetSegment } from '../../services/contextBudgetService.ts';

interface ContextBudgetSummaryProps {
  budget: ContextBudgetBreakdown;
  className?: string;
}

function buildChipStyle(color: string, active: boolean) {
  return {
    borderColor: `color-mix(in srgb, ${color} 44%, var(--control-border-soft) 56%)`,
    backgroundColor: active
      ? `color-mix(in srgb, ${color} 24%, var(--control-bg) 76%)`
      : 'color-mix(in srgb, var(--control-bg) 94%, white 6%)',
    color: active
      ? `color-mix(in srgb, ${color} 92%, var(--color-text-primary) 8%)`
      : `color-mix(in srgb, ${color} 82%, var(--color-text-secondary) 18%)`,
    boxShadow: active ? `0 8px 18px -16px ${color}` : undefined,
  };
}

function buildSummaryChipStyle(summaryGradient: string, active: boolean) {
  return {
    borderColor: 'color-mix(in srgb, var(--brand-gradient-mid) 42%, var(--control-border-soft) 58%)',
    backgroundImage: active
      ? `linear-gradient(90deg, color-mix(in srgb, white 58%, transparent 42%), color-mix(in srgb, white 42%, transparent 58%)), ${summaryGradient}`
      : undefined,
    backgroundColor: active
      ? 'color-mix(in srgb, var(--control-bg) 90%, white 10%)'
      : 'color-mix(in srgb, var(--control-bg) 94%, white 6%)',
    boxShadow: active
      ? 'inset 0 1px 0 rgba(255,255,255,0.34), 0 8px 18px -18px color-mix(in srgb, var(--brand-gradient-mid) 18%, transparent 82%)'
      : undefined,
    '--summary-chip-gradient': summaryGradient,
  };
}

function formatContextSummaryLabel(budget: ContextBudgetBreakdown) {
  return `${budget.usedInputTokens.toLocaleString()} / ${budget.contextWindow.toLocaleString()} context tokens`;
}

export default function ContextBudgetSummary({ budget, className = '' }: ContextBudgetSummaryProps) {
  const [focusedSegmentId, setFocusedSegmentId] = useState<ContextBudgetSegment['id'] | null>(null);
  const visibleSegments = useMemo(
    () => budget.segments
      .filter((segment) => segment.id !== 'response' && segment.tokens > 0)
      .sort((left, right) => {
        if (left.id === 'free') return 1;
        if (right.id === 'free') return -1;
        return right.tokens - left.tokens;
      }),
    [budget.segments],
  );
  const focusedSegment = visibleSegments.find((segment) => segment.id === focusedSegmentId) ?? null;
  const categorySegments = useMemo(
    () => visibleSegments.filter((segment) => segment.id !== 'free'),
    [visibleSegments],
  );
  const summaryChipGradient = useMemo(() => {
    const chipSegments = budget.segments.filter((segment) => segment.id !== 'free' && segment.id !== 'response' && segment.tokens > 0);
    if (chipSegments.length === 0) {
      return 'linear-gradient(90deg, rgba(226,232,240,0.95), rgba(226,232,240,0.78))';
    }

    const step = 100 / chipSegments.length;
    const stops = chipSegments.map((segment, index) => {
      const midpoint = Math.round(((index + 0.5) * step) * 10) / 10;
      return `${segment.colorHex} ${midpoint}%`;
    });

    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }, [budget.segments]);
  const softenedSummaryGradient = useMemo(
    () => summaryChipGradient.replaceAll(/(#[0-9a-fA-F]{6}|var\([^)]+\))/g, 'color-mix(in srgb, $1 72%, white 28%)'),
    [summaryChipGradient],
  );
  const summaryShowingFreeSpace = focusedSegmentId === 'free';
  const activeBarWidth = focusedSegment && focusedSegment.id !== 'free'
    ? Math.max(4, Math.round((focusedSegment.tokens / Math.max(budget.contextWindow, 1)) * 100))
    : 100;
  const headlineText = focusedSegment
    ? `${focusedSegment.label} · ${focusedSegment.tokens.toLocaleString()} tokens`
    : formatContextSummaryLabel(budget);
  const supportingText = focusedSegment
    ? focusedSegment.id === 'free'
      ? `${budget.remainingInputTokens.toLocaleString()} tokens still open before reply reserve`
      : `${Math.round((focusedSegment.tokens / Math.max(budget.contextWindow, 1)) * 100)}% of the full context window`
    : `${budget.remainingInputTokens.toLocaleString()} tokens still available before reply reserve`;
  const activeBarStyle = focusedSegment && focusedSegment.id !== 'free'
    ? {
      width: `${activeBarWidth}%`,
      background: `linear-gradient(90deg, ${focusedSegment.colorHex}, color-mix(in srgb, ${focusedSegment.colorHex} 72%, white 28%))`,
      boxShadow: `0 0 0 1px color-mix(in srgb, ${focusedSegment.colorHex} 38%, transparent 62%), 0 8px 18px -14px ${focusedSegment.colorHex}`,
    }
    : {
      width: `${Math.max(6, Math.round(budget.usageRatio * 100))}%`,
      background: softenedSummaryGradient,
      boxShadow: '0 0 0 1px color-mix(in srgb, white 32%, transparent 68%), 0 8px 18px -16px color-mix(in srgb, var(--brand-gradient-mid) 32%, transparent 68%)',
    };

  return (
    <div
      data-testid="context-budget-summary"
      className={`motion-content rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg-soft)] px-3 py-2 shadow-[var(--shell-shadow-soft)] ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Context summary</div>
        <div className="motion-content text-sm font-semibold text-text-primary">{headlineText}</div>
      </div>
      <div className="motion-content mt-0.5 text-[11px] leading-4.5 text-text-muted">{supportingText}</div>

      <div
        className="relative mt-2 h-3 overflow-hidden rounded-full border border-[color:var(--control-border-soft)]/80"
        style={{
          background: 'linear-gradient(90deg, color-mix(in srgb, var(--color-anime-100) 82%, white 18%), color-mix(in srgb, var(--brand-gradient-mid) 10%, var(--color-anime-50) 90%), color-mix(in srgb, var(--brand-gradient-start) 8%, var(--color-surface-base) 92%))',
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'linear-gradient(90deg, color-mix(in srgb, white 22%, transparent 78%), color-mix(in srgb, var(--color-anime-50) 32%, transparent 68%))',
          }}
        />
        <div
          className="relative h-full rounded-full transition-[width,box-shadow,background] duration-[var(--motion-duration-content)] ease-[var(--motion-ease-standard)]"
          style={activeBarStyle}
        />
      </div>

      {categorySegments.length > 0 ? (
        <div className="-mx-0.5 mt-2 overflow-x-auto overscroll-x-contain px-0.5 pb-0.5">
          <div className="flex w-max min-w-full items-center gap-1.25 whitespace-nowrap">
          <button
            type="button"
            onClick={() => setFocusedSegmentId((current) => (current === null ? 'free' : current === 'free' ? null : null))}
            className={[
              'motion-chip shrink-0 rounded-pill border px-2.5 py-0.75 text-[10px] leading-4 transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-micro)] ease-[var(--motion-ease-standard)]',
              'border-[color:var(--control-border-soft)]',
            ].join(' ')}
            style={buildSummaryChipStyle(summaryChipGradient, focusedSegment === null || summaryShowingFreeSpace)}
          >
            <span
              className="text-[11px] font-semibold leading-none"
              style={focusedSegment === null || summaryShowingFreeSpace
                ? {
                  color: 'rgba(53, 32, 96, 0.96)',
                  WebkitTextFillColor: 'rgba(53, 32, 96, 0.96)',
                  textShadow: '0 1px 1px rgba(255,255,255,0.28)',
                  WebkitTextStroke: '0',
                  fontWeight: 600,
                }
                : {
                  backgroundImage: 'var(--summary-chip-gradient)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  WebkitTextFillColor: 'transparent',
                }}
            >
              Summary
            </span>
          </button>
          {categorySegments.map((segment) => (
            <button
              key={segment.id}
              type="button"
              onClick={() => setFocusedSegmentId(segment.id)}
              className={[
                'motion-chip shrink-0 rounded-pill border px-2 py-0.5 text-[10px] leading-4 transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-micro)] ease-[var(--motion-ease-standard)]',
                'border-[color:var(--control-border-soft)]',
              ].join(' ')}
              style={buildChipStyle(segment.colorHex, focusedSegment?.id === segment.id)}
            >
              {segment.label}
            </button>
          ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
