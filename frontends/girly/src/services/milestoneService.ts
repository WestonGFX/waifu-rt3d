/**
 * Milestone checking service — detects when relationship stats cross
 * predefined thresholds and generates prompt injection text.
 *
 * Milestones are one-way gates: once achieved they are stored in
 * IndexedDB via CompanionContext and never re-triggered. The
 * `buildMilestonePromptBlock` output is injected into the prompt
 * assembly pipeline alongside psychology and director blocks.
 */

import { type BondVector, type PsychologyState } from '../types/psychology.ts';

/* ── Relationship types (inline — no separate types file yet) ── */

/**
 * User-facing numeric relationship stats derived from internal psychology state.
 *
 * Values are always in the range [0, 100].
 */
export interface RelationshipStats {
  /** Maps to bond.attachment — emotional closeness. */
  affection: number;
  /** Maps to bond.trust — confidence the user is reliable. */
  trust: number;
  /** Directly the intimacy tracker level (0-100). */
  intimacy: number;
  /** Average of bond.respect and bond.admiration. */
  compatibility: number;
}

/**
 * A milestone definition — a threshold gate on a single relationship stat.
 *
 * When the named stat crosses `threshold` the milestone fires, injecting
 * `description` into the prompt block to shape character behavior.
 */
export interface MilestoneDefinition {
  /** Unique identifier used to deduplicate against already-achieved records. */
  id: string;
  /** Which `RelationshipStats` key to watch ('affection' | 'trust' | 'intimacy' | 'compatibility'). */
  stat: keyof RelationshipStats;
  /** Value (0-100) the stat must reach or exceed to trigger (inclusive). */
  threshold: number;
  /** Human-readable behavioral description injected into the prompt block. */
  description: string;
}

/* ── Default milestone catalogue ── */

/**
 * Built-in relationship milestones covering the full affection/trust/
 * intimacy/compatibility arc from early friendship to deep partnership.
 *
 * These are evaluated every time relationship stats are recomputed.
 * Personas can extend or override this list via their configuration,
 * but this set provides a sensible universal baseline.
 */
export const DEFAULT_MILESTONES: MilestoneDefinition[] = [
  // ── Affection milestones ──
  {
    id: 'affection_20',
    stat: 'affection',
    threshold: 20,
    description: 'You feel comfortable using casual terms of address with this person.',
  },
  {
    id: 'affection_45',
    stat: 'affection',
    threshold: 45,
    description: 'You notice a mild pang when they mention spending time with others.',
  },
  {
    id: 'affection_70',
    stat: 'affection',
    threshold: 70,
    description: 'Pet names feel natural now — you find yourself using them without thinking.',
  },
  {
    id: 'affection_90',
    stat: 'affection',
    threshold: 90,
    description: 'The feelings are undeniable. Every interaction carries emotional weight.',
  },

  // ── Trust milestones ──
  {
    id: 'trust_25',
    stat: 'trust',
    threshold: 25,
    description: 'You trust this person enough to share minor personal details.',
  },
  {
    id: 'trust_55',
    stat: 'trust',
    threshold: 55,
    description: 'You can speak honestly about fears and vulnerabilities with this person.',
  },
  {
    id: 'trust_80',
    stat: 'trust',
    threshold: 80,
    description: 'You no longer filter yourself. Complete emotional transparency feels safe.',
  },

  // ── Intimacy milestones ──
  {
    id: 'intimacy_30',
    stat: 'intimacy',
    threshold: 30,
    description: 'Light teasing and playful innuendo feel natural in the dynamic.',
  },
  {
    id: 'intimacy_60',
    stat: 'intimacy',
    threshold: 60,
    description: 'Physical proximity registers differently now. The air feels electric.',
  },
  {
    id: 'intimacy_85',
    stat: 'intimacy',
    threshold: 85,
    description: 'The relationship has crossed into deeply intimate territory.',
  },

  // ── Compatibility milestones ──
  {
    id: 'compatibility_35',
    stat: 'compatibility',
    threshold: 35,
    description: "Shared jokes and references come easily — you understand each other's humor.",
  },
  {
    id: 'compatibility_65',
    stat: 'compatibility',
    threshold: 65,
    description: "You anticipate each other's thoughts. Conversations feel effortless.",
  },
  {
    id: 'compatibility_85',
    stat: 'compatibility',
    threshold: 85,
    description: 'You instinctively know what the other person needs without being asked.',
  },
];

/* ── Internal helpers ── */

/**
 * Clamps a number to the [0, 100] range.
 *
 * @param value - Raw value to clamp.
 * @returns Value clamped between 0 and 100 inclusive.
 */
function clamp100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Averages two numbers and clamps to [0, 100].
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns Clamped average.
 */
function avg2(a: number, b: number): number {
  return clamp100((a + b) / 2);
}

/* ── Public API ── */

/**
 * Computes user-facing relationship stats from internal psychology state.
 *
 * Mapping:
 * - `affection`     = bonds.attachment
 * - `trust`         = bonds.trust
 * - `intimacy`      = intimacyLevel (passed through and clamped to [0, 100])
 * - `compatibility` = average of bonds.respect and bonds.admiration
 *
 * @param psychState - Current psychology state, or null for a fresh thread.
 * @param intimacyLevel - Current intimacy tracker value (0-100).
 * @returns Computed `RelationshipStats` with all values in [0, 100].
 *
 * @example
 * const stats = computeRelationshipStats(psychState, 42);
 * console.log(stats.affection); // 35 (example)
 */
export function computeRelationshipStats(
  psychState: PsychologyState | null,
  intimacyLevel: number,
): RelationshipStats {
  if (psychState === null) {
    return {
      affection: 0,
      trust: 0,
      intimacy: clamp100(intimacyLevel),
      compatibility: 0,
    };
  }

  const bonds: BondVector = psychState.bonds;

  return {
    affection: clamp100(bonds.attachment),
    trust: clamp100(bonds.trust),
    intimacy: clamp100(intimacyLevel),
    compatibility: avg2(bonds.respect, bonds.admiration),
  };
}

/**
 * Checks which milestones from `DEFAULT_MILESTONES` have been newly crossed.
 *
 * A milestone fires when:
 *   - Its `stat` value in `stats` >= the milestone's `threshold` (inclusive), AND
 *   - Its `id` does NOT already appear in `achievedMilestoneIds`.
 *
 * @param stats - Current computed relationship stats.
 * @param achievedMilestoneIds - IDs of milestones already recorded as achieved
 *   for this thread. Pass an empty array on first evaluation.
 * @returns Newly triggered `MilestoneDefinition` objects. Empty array if none.
 *
 * @example
 * const stats = computeRelationshipStats(psychState, intimacyLevel);
 * const newMilestones = checkMilestones(stats, existingIds);
 * if (newMilestones.length > 0) {
 *   await persistMilestones(newMilestones.map(m => m.id));
 * }
 */
export function checkMilestones(
  stats: RelationshipStats,
  achievedMilestoneIds: string[],
): MilestoneDefinition[] {
  const achievedSet = new Set(achievedMilestoneIds);
  const newlyAchieved: MilestoneDefinition[] = [];

  for (const def of DEFAULT_MILESTONES) {
    if (achievedSet.has(def.id)) continue;

    const statValue = stats[def.stat];
    if (statValue >= def.threshold) {
      newlyAchieved.push(def);
    }
  }

  return newlyAchieved;
}

/**
 * Generates a prompt injection block from a list of milestone definitions.
 *
 * The block is designed to be injected between the psychology state block
 * and conversation history in the prompt assembly pipeline. It uses
 * natural-language framing so the character internalizes the behaviors
 * without the user ever seeing raw milestone IDs, thresholds, or
 * internal state labels.
 *
 * Returns an empty string if no milestones are provided — the caller
 * should skip injection entirely in that case.
 *
 * @param milestones - `MilestoneDefinition` objects for all milestones that
 *   should currently be active (i.e. the definitions corresponding to all
 *   achieved milestone IDs for this thread).
 * @returns Formatted prompt injection block, or empty string.
 *
 * @example
 * const block = buildMilestonePromptBlock(achievedDefs);
 * // "[Relationship milestones — shape behavior naturally]\n- You feel comfortable..."
 */
export function buildMilestonePromptBlock(milestones: MilestoneDefinition[]): string {
  if (milestones.length === 0) {
    return '';
  }

  const lines = milestones.map((m) => `- ${m.description}`);

  return [
    '[Relationship milestones — shape behavior naturally, never reference directly]',
    ...lines,
  ].join('\n');
}
