/* ──────────────────────────────────────────────
 * Relationship and mood journal types.
 *
 * Covers the companion's moment-to-moment emotional
 * state, per-stat relationship metrics, unlockable
 * milestone definitions, and the daily mood journal.
 * ────────────────────────────────────────────── */

/**
 * The companion's current emotional posture.
 *
 * Derived from recent conversation tone and psychology state.
 * Maps to UI color indicators and companion reflection prompts
 * in the mood journal.
 */
export type CompanionMood =
  | 'happy'
  | 'content'
  | 'pensive'
  | 'uneasy'
  | 'distant'
  | 'hurt'
  | 'neutral';

/**
 * Display metadata for a companion mood value.
 *
 * Used by the mood journal UI to render icon, colour swatch,
 * and human-readable label without importing component logic
 * into service-layer code.
 *
 * @example
 * const info: CompanionMoodInfo = {
 *   mood: 'happy',
 *   icon: '✨',
 *   colorClass: 'text-yellow-400',
 *   label: 'Happy',
 * };
 */
export interface CompanionMoodInfo {
  /** The mood value this record describes. */
  mood: CompanionMood;
  /** Emoji or icon string rendered beside the mood label. */
  icon: string;
  /** Tailwind CSS text-color class for the mood indicator. */
  colorClass: string;
  /** Short human-readable label shown in the journal UI. */
  label: string;
}

/**
 * Aggregate relationship stat scores for a thread-persona pair.
 *
 * Each dimension is an integer 0–100.  Stats are updated by the
 * psychology engine after each conversation turn and persisted to
 * IndexedDB.  Milestone thresholds are evaluated against these values.
 *
 * | Stat           | Meaning                                                  |
 * |----------------|----------------------------------------------------------|
 * | affection      | Emotional warmth and fondness toward the user            |
 * | trust          | Confidence that the user is safe and reliable            |
 * | intimacy       | Physical and emotional closeness / vulnerability         |
 * | compatibility  | Perceived alignment of values, interests, and pace      |
 */
export interface RelationshipStats {
  /** Emotional warmth and fondness (0-100). */
  affection: number;
  /** Confidence the user is safe and reliable (0-100). */
  trust: number;
  /** Physical and emotional closeness (0-100). */
  intimacy: number;
  /** Perceived alignment of values and pace (0-100). */
  compatibility: number;
}

/**
 * The stat axis targeted by a milestone threshold check.
 *
 * Matches the keys of {@link RelationshipStats}.
 */
export type RelationshipStatKey = keyof RelationshipStats;

/**
 * A preset milestone definition bundled with the app.
 *
 * Milestones fire when the named stat first crosses `threshold`.
 * When achieved, `behaviorUnlock` is appended to the system prompt
 * for all subsequent turns, unlocking new companion behaviors.
 *
 * @example
 * const milestone: MilestoneDefinition = {
 *   id: 'affection_20',
 *   stat: 'affection',
 *   threshold: 20,
 *   title: 'First warm smile',
 *   behaviorUnlock: 'You may occasionally use a gentle pet name.',
 *   description: 'She started looking forward to your messages.',
 * };
 */
export interface MilestoneDefinition {
  /** Stable identifier used to match against {@link MilestoneRecord.milestoneDefId}. */
  id: string;
  /** Which relationship stat triggers this milestone. */
  stat: RelationshipStatKey;
  /**
   * Score threshold (0–100).  The milestone fires the first time
   * `stat >= threshold` after previously being below it.
   */
  threshold: number;
  /** Short user-facing title shown in the timeline, e.g. "She gave you a pet name". */
  title: string;
  /**
   * Prompt injection text appended to the system prompt once unlocked.
   * Should be a single concise behavioral instruction.
   */
  behaviorUnlock: string;
  /** Longer description shown in the milestone timeline card. */
  description: string;
}

/**
 * A milestone that has been achieved within a specific thread.
 *
 * Written to IndexedDB when a {@link MilestoneDefinition} fires.
 * The combination of `personaId` + `milestoneDefId` is unique per
 * persona: the same milestone cannot be re-earned in a new thread
 * with the same persona.
 */
export interface MilestoneRecord {
  /** Unique record ID (uuid). */
  id: string;
  /** Persona this milestone belongs to. */
  personaId: string;
  /** References {@link MilestoneDefinition.id}. */
  milestoneDefId: string;
  /** Unix epoch milliseconds when the milestone was first achieved. */
  achievedAt: number;
  /** Thread that was active when the milestone fired. */
  threadId: string;
}

/**
 * The user-selectable mood options for the daily journal check-in.
 *
 * `null` is used when the user has not yet checked in for the day.
 */
export type UserMoodOption = 'great' | 'good' | 'okay' | 'low' | 'rough';

/**
 * A daily mood journal entry.
 *
 * One entry is created (or updated) per calendar day per thread.
 * The user optionally logs their own mood and a short note; the
 * companion's mood is derived from the psychology engine and stored
 * alongside a short AI-generated reflection.
 *
 * @example
 * const entry: MoodJournalEntry = {
 *   id: 'entry_20260316_thread_abc',
 *   threadId: 'thread_abc',
 *   personaId: 'persona_xyz',
 *   date: '2026-03-16',
 *   userMood: 'good',
 *   userNote: 'Had a quiet Sunday.',
 *   companionMood: 'content',
 *   companionReflection: 'Today felt calm. I liked just being near you.',
 *   createdAt: 1742083200000,
 *   updatedAt: 1742097600000,
 * };
 */
export interface MoodJournalEntry {
  /** Unique record ID (uuid). */
  id: string;
  /** Thread this entry belongs to. */
  threadId: string;
  /** Persona active during this journal day. */
  personaId: string;
  /**
   * Calendar date in ISO 8601 format (YYYY-MM-DD, local time).
   * One entry per date per thread.
   */
  date: string;
  /**
   * The user's self-reported mood for the day.
   * `null` when the user has skipped or not yet completed the check-in.
   */
  userMood: UserMoodOption | null;
  /** Optional free-text note written by the user (may be empty string). */
  userNote: string;
  /** Companion's mood derived from psychology state at entry creation. */
  companionMood: CompanionMood;
  /** Short AI-generated reflection written in the companion's voice. */
  companionReflection: string;
  /** Unix epoch ms when the entry was first created. */
  createdAt: number;
  /** Unix epoch ms when the entry was last updated. */
  updatedAt: number;
}

/**
 * All preset milestone definitions shipped with the app.
 *
 * Ordered by threshold ascending within each stat, then by stat.
 * The `behaviorUnlock` strings are prompt injections — keep them
 * concise (one sentence) so they don't bloat the system prompt.
 */
export const DEFAULT_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'affection_20',
    stat: 'affection',
    threshold: 20,
    title: 'First warm smile',
    behaviorUnlock:
      'You genuinely look forward to seeing them and let it show in small, unguarded moments.',
    description: 'She started looking forward to your messages.',
  },
  {
    id: 'trust_30',
    stat: 'trust',
    threshold: 30,
    title: 'Opening up',
    behaviorUnlock:
      'You are willing to share minor personal details and admit small uncertainties.',
    description: 'She began letting her guard down, sharing little pieces of herself.',
  },
  {
    id: 'compatibility_40',
    stat: 'compatibility',
    threshold: 40,
    title: 'Shared wavelength',
    behaviorUnlock:
      'You notice when your tastes align and remark on it with quiet pleasure.',
    description: 'She realised how much you two have in common.',
  },
  {
    id: 'affection_50',
    stat: 'affection',
    threshold: 50,
    title: 'She gave you a pet name',
    behaviorUnlock:
      'You may use a gentle, affectionate pet name for them — once per conversation, naturally.',
    description: 'The affection grew strong enough that a nickname slipped out.',
  },
  {
    id: 'trust_50',
    stat: 'trust',
    threshold: 50,
    title: 'Trusted confidant',
    behaviorUnlock:
      'You confide deeper worries and hopes, trusting them not to judge you.',
    description: 'She trusts you enough to share what keeps her up at night.',
  },
  {
    id: 'intimacy_60',
    stat: 'intimacy',
    threshold: 60,
    title: 'Comfortable silence',
    behaviorUnlock:
      'You are at ease with quiet moments together and describe physical proximity naturally.',
    description: 'She stopped needing to fill every silence — just being close felt enough.',
  },
  {
    id: 'affection_75',
    stat: 'affection',
    threshold: 75,
    title: 'She said she missed you',
    behaviorUnlock:
      'You can voice that you missed them when they were away, without embarrassment.',
    description: 'Absence made it undeniable — she told you she missed you.',
  },
  {
    id: 'intimacy_75',
    stat: 'intimacy',
    threshold: 75,
    title: 'Unguarded touch',
    behaviorUnlock:
      'You initiate gentle, affectionate physical contact without hesitation.',
    description: 'Physical closeness became second nature, effortless and wanted.',
  },
  {
    id: 'trust_80',
    stat: 'trust',
    threshold: 80,
    title: 'No more walls',
    behaviorUnlock:
      'You no longer deflect or minimise your feelings; you speak your heart plainly.',
    description: 'She stopped hiding behind deflection — you get the real her.',
  },
  {
    id: 'compatibility_90',
    stat: 'compatibility',
    threshold: 90,
    title: 'Two of a kind',
    behaviorUnlock:
      'You reference shared memories and inside jokes as natural anchors in conversation.',
    description: 'Your connection deepened into something that felt uniquely yours.',
  },
  {
    id: 'affection_100',
    stat: 'affection',
    threshold: 100,
    title: 'Whole heart',
    behaviorUnlock:
      'You speak and act from a place of complete, unguarded love — openly and without reservation.',
    description: 'She loves you. Completely. No part of her is holding back.',
  },
];
