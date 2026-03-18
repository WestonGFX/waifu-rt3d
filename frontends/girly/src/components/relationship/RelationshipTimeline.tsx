/**
 * RelationshipTimeline — chronological log of all relationship milestones.
 *
 * Fetches achieved milestone records from IndexedDB for the active persona,
 * maps each record to its definition for display text, and renders them as a
 * vertical timeline sorted newest-first.
 *
 * Each entry shows:
 *   - Date (left column)
 *   - Stat-colored icon badge + description + stat pill (right column)
 *
 * Self-contained: loads its own data on mount and re-loads when the active
 * persona changes. Works in both the floating shell and fullscreen modes.
 *
 * @example
 * // Embed inside a relationship settings tab:
 * <RelationshipTimeline />
 */

import { useEffect, useState } from 'react';
import { Award, Clock, TrendingUp } from 'lucide-react';
import { useCompanion } from '@/context/CompanionContext.tsx';
import { AppCard, AppSectionHeader } from '@/components/settings/SettingsPrimitives.tsx';
import { listMilestonesForPersona } from '@/services/appDb.ts';
import { DEFAULT_MILESTONES, type MilestoneDefinition } from '@/services/milestoneService.ts';
import { type MilestoneRecord } from '@/types/relationship.ts';
import { cn } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The four stat axes a milestone can belong to. */
type StatKey = 'affection' | 'trust' | 'intimacy' | 'compatibility';

/** A resolved milestone record merged with its definition for display. */
interface ResolvedMilestone {
  /** The unique record ID from IndexedDB. */
  id: string;
  /** Unix epoch milliseconds when achieved. */
  achievedAt: number;
  /** Human-readable description from the milestone definition. */
  description: string;
  /** Which stat this milestone belongs to. */
  stat: StatKey;
  /** The threshold that was crossed (used in the stat pill). */
  threshold: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Tailwind utility classes and display labels for each stat axis.
 *
 * Colors intentionally avoid hardcoded hex values — all use Tailwind scale
 * classes that resolve to the correct hue regardless of theme.
 */
const STAT_META: Record<
  StatKey,
  { label: string; dotClass: string; badgeClass: string; iconBgClass: string; iconClass: string }
> = {
  affection: {
    label: 'Affection',
    dotClass: 'bg-pink-400',
    badgeClass: 'bg-pink-50 text-pink-600',
    iconBgClass: 'bg-pink-100',
    iconClass: 'text-pink-500',
  },
  trust: {
    label: 'Trust',
    dotClass: 'bg-emerald-400',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    iconBgClass: 'bg-emerald-100',
    iconClass: 'text-emerald-600',
  },
  intimacy: {
    label: 'Intimacy',
    dotClass: 'bg-rose-400',
    badgeClass: 'bg-rose-50 text-rose-600',
    iconBgClass: 'bg-rose-100',
    iconClass: 'text-rose-500',
  },
  compatibility: {
    label: 'Compatibility',
    dotClass: 'bg-violet-400',
    badgeClass: 'bg-violet-50 text-violet-700',
    iconBgClass: 'bg-violet-100',
    iconClass: 'text-violet-600',
  },
};

/** Build a lookup map from milestone def IDs to their definitions. */
const MILESTONE_MAP: ReadonlyMap<string, MilestoneDefinition> = new Map(
  DEFAULT_MILESTONES.map((def) => [def.id, def]),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a Unix epoch timestamp as a short, human-readable date string.
 *
 * Renders "Today" or "Yesterday" for recent dates, otherwise falls back
 * to a locale-formatted date (e.g. "Mar 14").
 *
 * @param timestamp - Unix epoch milliseconds.
 * @returns Display string for use in the timeline date column.
 *
 * @example
 * formatTimelineDate(Date.now()); // "Today"
 * formatTimelineDate(Date.now() - 86_400_000); // "Yesterday"
 */
function formatTimelineDate(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;

  if (timestamp >= todayStart) return 'Today';
  if (timestamp >= yesterdayStart) return 'Yesterday';

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Merges raw MilestoneRecord rows with their definitions, filtering out any
 * records whose `milestoneDefId` no longer exists in the catalogue.
 *
 * Results are sorted newest-first (descending `achievedAt`).
 *
 * @param records - Raw records from IndexedDB.
 * @returns Resolved, filtered, and sorted milestone entries.
 */
function resolveAndSort(records: MilestoneRecord[]): ResolvedMilestone[] {
  const resolved: ResolvedMilestone[] = [];

  for (const record of records) {
    const def = MILESTONE_MAP.get(record.milestoneDefId);
    if (!def) continue;

    resolved.push({
      id: record.id,
      achievedAt: record.achievedAt,
      description: def.description,
      stat: def.stat as StatKey,
      threshold: def.threshold,
    });
  }

  return resolved.sort((a, b) => b.achievedAt - a.achievedAt);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * A single row in the vertical timeline.
 *
 * Renders the date column on the left, a connector line + dot in the middle,
 * and the milestone detail card on the right.
 *
 * @param milestone - The resolved milestone to display.
 * @param isLast - When true, suppresses the connector line below the dot.
 */
function TimelineRow({
  milestone,
  isLast,
}: {
  milestone: ResolvedMilestone;
  isLast: boolean;
}) {
  const meta = STAT_META[milestone.stat];
  const dateLabel = formatTimelineDate(milestone.achievedAt);

  return (
    <div className="flex gap-3" aria-label={`Milestone: ${milestone.description}`}>
      {/* Date column — fixed width so the connector aligns cleanly */}
      <div className="flex w-16 shrink-0 flex-col items-end pt-1.5">
        <span className="text-[11px] leading-4 text-text-muted">{dateLabel}</span>
      </div>

      {/* Connector column */}
      <div className="relative flex flex-col items-center">
        {/* Dot */}
        <span
          className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', meta.dotClass)}
          aria-hidden="true"
        />
        {/* Line below dot — hidden on the last item */}
        {!isLast && (
          <span
            className="mt-1.5 w-px grow bg-[color:var(--shell-divider)]"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Milestone card */}
      <div
        className={cn(
          'mb-3 flex min-w-0 flex-1 items-start gap-2.5 rounded-[18px]',
          'border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] p-2.5',
          'shadow-[var(--shell-shadow-soft)]',
        )}
      >
        {/* Stat icon */}
        <span
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            meta.iconBgClass,
          )}
          aria-hidden="true"
        >
          <Award className={cn('h-3.5 w-3.5', meta.iconClass)} />
        </span>

        {/* Description + stat badge */}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs leading-5 text-text-secondary">{milestone.description}</p>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Stat badge */}
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]',
                meta.badgeClass,
              )}
            >
              <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" />
              {meta.label}
            </span>

            {/* Threshold badge */}
            <span className="inline-flex items-center rounded-pill bg-[color:var(--control-bg-soft)] px-1.5 py-0.5 text-[10px] font-mono text-text-muted">
              {milestone.threshold}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state shown when the persona has no achieved milestones.
 */
function EmptyState() {
  return (
    <AppCard>
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--control-bg-soft)]"
          aria-hidden="true"
        >
          <Clock className="h-5 w-5 text-text-muted" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-text-secondary">No milestones yet</p>
          <p className="text-xs leading-5 text-text-muted">
            Start chatting to unlock relationship milestones.
          </p>
        </div>
      </div>
    </AppCard>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * RelationshipTimeline component.
 *
 * Renders a vertical timeline of all relationship milestones achieved with
 * the active persona, newest first. Loads its own data directly from IndexedDB
 * via `listMilestonesForPersona` and re-fetches when the active persona changes.
 *
 * Stat-specific accent colors (pink for affection, emerald for trust, rose for
 * intimacy, violet for compatibility) help the user quickly scan which dimension
 * each milestone represents.
 *
 * @returns A React element containing the timeline section, or null while the
 *   companion context is still loading.
 *
 * @example
 * // Inside a relationship settings tab or panel:
 * <RelationshipTimeline />
 */
export default function RelationshipTimeline() {
  const { activePersona } = useCompanion();

  const [milestones, setMilestones] = useState<ResolvedMilestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!activePersona) {
      setMilestones([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    listMilestonesForPersona(activePersona.id)
      .then((records) => {
        if (cancelled) return;
        setMilestones(resolveAndSort(records));
      })
      .catch(() => {
        if (cancelled) return;
        setMilestones([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePersona]);

  return (
    <div className="space-y-4">
      <AppSectionHeader
        eyebrow="Relationship"
        title="Milestone timeline"
        description="Key moments in your bond, from the very beginning."
      />

      {isLoading ? (
        /* Skeleton shimmer — matches card shape so layout doesn't jump */
        <AppCard>
          <div className="space-y-3 p-3.5" aria-busy="true" aria-label="Loading milestones">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-[14px] bg-[color:var(--control-bg-soft)]"
              />
            ))}
          </div>
        </AppCard>
      ) : milestones.length === 0 ? (
        <EmptyState />
      ) : (
        <AppCard>
          <div className="p-3.5 pb-1">
            {milestones.map((milestone, index) => (
              <TimelineRow
                key={milestone.id}
                milestone={milestone}
                isLast={index === milestones.length - 1}
              />
            ))}
          </div>
        </AppCard>
      )}
    </div>
  );
}
