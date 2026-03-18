/**
 * RelationshipStatsPanel — Player-facing summary of the companion relationship.
 *
 * Presents four key stats (Affection, Trust, Intimacy, Compatibility) as
 * gradient progress bars, a mood + phase header, and a recent milestones list.
 * Data is derived inline from CompanionContext rather than imported services
 * so this component has zero external service dependencies.
 *
 * Designed to be embedded in the settings sidebar or shown as a standalone
 * panel. Works at any width from 240 px to fullscreen.
 */

import { Heart, Shield, Flame, Star, Award } from 'lucide-react';
import { useCompanion } from '@/context/CompanionContext.tsx';
import { AppCard, AppSectionHeader } from '@/components/settings/SettingsPrimitives.tsx';
import MoodIndicator, { type CompanionMood } from './MoodIndicator.tsx';
import { type PsychologyState } from '@/types/psychology.ts';
import { type IntimacyState } from '@/types/content.ts';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

/** The four user-facing relationship dimensions. */
interface RelationshipStats {
  /** Derived from bonds.attachment (0-100). */
  affection: number;
  /** Derived from bonds.trust (0-100). */
  trust: number;
  /** Derived from IntimacyState.level (0-100). */
  intimacy: number;
  /** Average of bonds.respect + bonds.admiration (0-100). */
  compatibility: number;
}

/** A milestone record used for the recents list. */
interface MilestoneRecord {
  id: string;
  label: string;
  /** Timestamp (ms since epoch). */
  achievedAt: number;
}

/** Config for one stat bar row. */
interface StatConfig {
  key: keyof RelationshipStats;
  label: string;
  /** Gradient class applied to the filled portion. */
  gradientClass: string;
  /** Icon component (Lucide). */
  icon: React.ElementType;
  /** Icon color utility. */
  iconColorClass: string;
  /** The label of the next milestone threshold, keyed by rough score band. */
  milestones: Array<{ threshold: number; label: string }>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STAT_CONFIGS: StatConfig[] = [
  {
    key: 'affection',
    label: 'Affection',
    gradientClass: 'bg-gradient-to-r from-pink-400 to-rose-400',
    icon: Heart,
    iconColorClass: 'text-pink-400',
    milestones: [
      { threshold: 25,  label: 'First warmth'    },
      { threshold: 50,  label: 'Growing fond'     },
      { threshold: 75,  label: 'Deeply attached'  },
      { threshold: 100, label: 'Undying devotion' },
    ],
  },
  {
    key: 'trust',
    label: 'Trust',
    gradientClass: 'bg-gradient-to-r from-emerald-400 to-teal-400',
    icon: Shield,
    iconColorClass: 'text-emerald-400',
    milestones: [
      { threshold: 25,  label: 'Tentative faith'   },
      { threshold: 50,  label: 'Open secrets'       },
      { threshold: 75,  label: 'Unshakeable belief' },
      { threshold: 100, label: 'Absolute trust'     },
    ],
  },
  {
    key: 'intimacy',
    label: 'Intimacy',
    gradientClass: 'bg-gradient-to-r from-rose-400 to-pink-500',
    icon: Flame,
    iconColorClass: 'text-rose-400',
    milestones: [
      { threshold: 30,  label: 'Flirty vibes'    },
      { threshold: 60,  label: 'Suggestive spark' },
      { threshold: 85,  label: 'Deep closeness'   },
      { threshold: 100, label: 'Total surrender'  },
    ],
  },
  {
    key: 'compatibility',
    label: 'Compatibility',
    gradientClass: 'bg-gradient-to-r from-violet-400 to-purple-500',
    icon: Star,
    iconColorClass: 'text-violet-400',
    milestones: [
      { threshold: 25,  label: 'Finding common ground' },
      { threshold: 50,  label: 'Natural rapport'       },
      { threshold: 75,  label: 'Perfect harmony'       },
      { threshold: 100, label: 'Soulmates'             },
    ],
  },
];

/** Readable labels for each relationship phase. */
const PHASE_LABELS: Record<string, string> = {
  honeymoon:    'Honeymoon phase',
  stable:       'Stable & comfortable',
  strained:     'Under strain',
  detaching:    'Growing distant',
  post_breakup: 'Broken connection',
};

// ---------------------------------------------------------------------------
// Inline derivation helpers (replace with service imports when available)
// ---------------------------------------------------------------------------

/**
 * Compute the four user-facing stats from raw psychology + intimacy state.
 *
 * @param psych - Current psychology state or null.
 * @param intimacy - Current intimacy level or null.
 * @returns Clamped 0-100 values for each stat dimension.
 */
function computeStats(
  psych: PsychologyState | null,
  intimacy: IntimacyState | null,
): RelationshipStats {
  if (!psych) {
    return { affection: 0, trust: 0, intimacy: 0, compatibility: 0 };
  }

  const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

  return {
    affection:     clamp(psych.bonds.attachment),
    trust:         clamp(psych.bonds.trust),
    intimacy:      clamp(intimacy?.level ?? 0),
    compatibility: clamp((psych.bonds.respect + psych.bonds.admiration) / 2),
  };
}

/**
 * Derive the companion's current mood from the psychology state.
 *
 * Maps the relationship phase + average bond/threat levels to one of the
 * seven CompanionMood values. Falls back to 'neutral' when no state exists.
 *
 * @param psych - Current psychology state or null.
 * @returns The best-matching CompanionMood value.
 */
function deriveCompanionMood(psych: PsychologyState | null): CompanionMood {
  if (!psych) return 'neutral';

  const avgBond = (
    psych.bonds.attachment +
    psych.bonds.trust +
    psych.bonds.respect +
    psych.bonds.admiration
  ) / 4;

  const avgThreat = (
    psych.threats.status +
    psych.threats.abandonment +
    psych.threats.controlLoss +
    psych.threats.rival
  ) / 4;

  if (psych.phase === 'post_breakup') return 'hurt';
  if (psych.phase === 'detaching') return 'distant';
  if (psych.phase === 'strained' || avgThreat > 60) return 'uneasy';
  if (avgBond > 70) return 'happy';
  if (avgBond > 45) return 'content';
  if (avgThreat > 35) return 'pensive';
  return 'neutral';
}

/**
 * Return the next milestone label + threshold for a given stat value.
 *
 * @param milestones - Ordered list of milestone configs.
 * @param value - Current stat value (0-100).
 * @returns The first milestone the stat has not yet reached, or the last one.
 */
function nextMilestone(
  milestones: StatConfig['milestones'],
  value: number,
): { label: string; threshold: number } {
  return milestones.find((m) => value < m.threshold) ?? milestones[milestones.length - 1];
}

/**
 * Build a lightweight mock milestones list from the psychology state history.
 * Replace with a real MilestoneRecord[] from the DB once the service exists.
 *
 * @param psych - Current psychology state or null.
 * @returns Up to three milestone-like records drawn from state history.
 */
function deriveMilestones(psych: PsychologyState | null): MilestoneRecord[] {
  if (!psych || psych.stateHistory.length === 0) return [];

  return psych.stateHistory
    .filter((entry) => entry.triggerLabel)
    .slice(-3)
    .reverse()
    .map((entry, i) => ({
      id: `history-${i}`,
      label: entry.triggerLabel!,
      achievedAt: entry.timestamp,
    }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * A single stat row: icon, label, gradient bar, numeric value, next milestone.
 */
function StatBar({ config, value }: { config: StatConfig; value: number }) {
  const IconComponent = config.icon;
  const next = nextMilestone(config.milestones, value);
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div className="space-y-1.5">
      {/* Label row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <IconComponent
            className={`h-3.5 w-3.5 shrink-0 ${config.iconColorClass}`}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-text-secondary">{config.label}</span>
        </div>
        <span className="font-mono text-[11px] text-text-muted">{Math.round(value)}</span>
      </div>

      {/* Progress track */}
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--control-bg-soft)]"
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${config.label}: ${Math.round(value)} out of 100`}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-soft)] ${config.gradientClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Next milestone hint */}
      <p className="text-[10px] leading-3.5 text-text-muted">
        Next: <span className="font-medium text-text-secondary">{next.label}</span>
        {value < next.threshold && (
          <span> at {next.threshold}</span>
        )}
      </p>
    </div>
  );
}

/**
 * A single row in the recent milestones list.
 */
function MilestoneRow({ milestone }: { milestone: MilestoneRecord }) {
  const elapsed = Date.now() - milestone.achievedAt;
  const days = Math.floor(elapsed / 86_400_000);
  const timeLabel =
    days === 0 ? 'today'
    : days === 1 ? 'yesterday'
    : `${days}d ago`;

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-anime-100">
        <Award className="h-3 w-3 text-anime-500" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{milestone.label}</span>
      <span className="shrink-0 text-[10px] text-text-muted">{timeLabel}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Full relationship stats panel.
 *
 * Pull from CompanionContext and renders the companion's mood header, four
 * stat bars, and a recent milestones list. When no psychology state exists
 * (new conversation), a soft placeholder encourages the user to start chatting.
 *
 * @example
 * // Inside a settings sub-panel or dedicated relationship tab:
 * <RelationshipStatsPanel />
 */
export default function RelationshipStatsPanel() {
  const { currentPsychologyState, currentIntimacyState, activePersona, currentThread } =
    useCompanion();

  const psychState = currentPsychologyState;
  const intimacyLevel = currentIntimacyState?.intimacy ?? null;
  const stats = computeStats(psychState, intimacyLevel);
  const mood = deriveCompanionMood(psychState);
  const milestones = deriveMilestones(psychState);

  // Day count: approximate from thread creation date if available.
  const dayCount = currentThread
    ? Math.max(1, Math.floor((Date.now() - currentThread.createdAt) / 86_400_000))
    : null;

  const phase = psychState?.phase ?? null;

  return (
    <div className="space-y-4">
      <AppSectionHeader
        eyebrow="Relationship"
        title="Connection status"
        description="How your bond has grown."
      />

      {/* Companion header — mood + phase + day count */}
      <AppCard>
        <div className="flex items-center gap-3 p-3.5">
          {/* Avatar initial placeholder */}
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-anime-200 to-rose-pastel-200"
            aria-hidden="true"
          >
            <span className="text-sm font-semibold text-anime-600">
              {activePersona?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-text-primary">
                {activePersona?.name ?? 'Your companion'}
              </span>
              <MoodIndicator mood={mood} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {phase && (
                <span className="text-[11px] text-text-muted">
                  {PHASE_LABELS[phase] ?? phase.replace('_', ' ')}
                </span>
              )}
              {dayCount !== null && (
                <>
                  <span className="text-[11px] text-text-muted" aria-hidden="true">·</span>
                  <span className="text-[11px] text-text-muted">
                    Day {dayCount}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </AppCard>

      {/* Stat bars or empty state */}
      {psychState ? (
        <AppCard>
          <div className="space-y-4 p-3.5">
            {STAT_CONFIGS.map((config) => (
              <StatBar
                key={config.key}
                config={config}
                value={stats[config.key]}
              />
            ))}
          </div>
        </AppCard>
      ) : (
        <AppCard>
          <div className="flex flex-col items-center gap-2 p-5 text-center">
            <Heart className="h-8 w-8 text-pink-300" aria-hidden="true" />
            <p className="text-sm font-medium text-text-secondary">
              No data yet
            </p>
            <p className="text-xs leading-5 text-text-muted">
              Start chatting to see your relationship grow.
            </p>
          </div>
        </AppCard>
      )}

      {/* Recent milestones */}
      {milestones.length > 0 && (
        <>
          <AppSectionHeader
            eyebrow="Milestones"
            title="Recent moments"
          />
          <AppCard>
            <div className="divide-y divide-[color:var(--shell-divider)] px-3.5">
              {milestones.map((milestone) => (
                <MilestoneRow key={milestone.id} milestone={milestone} />
              ))}
            </div>
          </AppCard>
        </>
      )}
    </div>
  );
}
