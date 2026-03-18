/**
 * Mood derivation service — maps internal psychology state to a
 * user-facing companion mood.
 *
 * Reads bond/threat averages, emotional fatigue, relationship phase,
 * and behavioral flags to produce a single `CompanionMood` value with
 * display metadata (icon, color class, label). This is surfaced in the
 * UI as a status indicator and optionally injected into prompt context.
 */

import { type BondVector, type PsychologyState, type ThreatVector } from '../types/psychology.ts';

/* ── Relationship types (inline — no separate types file yet) ── */

/**
 * Seven discrete companion mood states surfaced to the user.
 * Ordered roughly from most-positive to most-negative, with neutral
 * as the safe fallback when no other condition is conclusive.
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
 * Display metadata for a single companion mood.
 */
export interface CompanionMoodInfo {
  /** The canonical mood identifier. */
  mood: CompanionMood;
  /** Emoji icon for compact UI surfaces. */
  icon: string;
  /** Tailwind CSS color utility class (text color). */
  colorClass: string;
  /** Human-readable label for tooltips and settings panels. */
  label: string;
}

/* ── Static mood metadata map ── */

/**
 * Canonical display metadata for every possible companion mood.
 *
 * Import this when you need to render mood chips, legend rows, or
 * any UI that shows all moods at once.
 *
 * @example
 * const info = MOOD_INFO_MAP['happy'];
 * console.log(info.icon); // '✨'
 */
export const MOOD_INFO_MAP: Record<CompanionMood, CompanionMoodInfo> = {
  happy: {
    mood: 'happy',
    icon: '✨',
    colorClass: 'text-yellow-400',
    label: 'Happy',
  },
  content: {
    mood: 'content',
    icon: '🌸',
    colorClass: 'text-pink-400',
    label: 'Content',
  },
  pensive: {
    mood: 'pensive',
    icon: '🌙',
    colorClass: 'text-indigo-400',
    label: 'Pensive',
  },
  uneasy: {
    mood: 'uneasy',
    icon: '⚡',
    colorClass: 'text-amber-500',
    label: 'Uneasy',
  },
  distant: {
    mood: 'distant',
    icon: '❄️',
    colorClass: 'text-sky-400',
    label: 'Distant',
  },
  hurt: {
    mood: 'hurt',
    icon: '💔',
    colorClass: 'text-red-400',
    label: 'Hurt',
  },
  neutral: {
    mood: 'neutral',
    icon: '🌿',
    colorClass: 'text-slate-400',
    label: 'Neutral',
  },
};

/* ── Internal helpers ── */

/**
 * Computes the arithmetic mean of all values in a numeric record.
 *
 * @param vec - A flat object whose values are all numbers (0-100).
 * @returns Average value, or 0 if the record is empty.
 */
function vectorAverage(vec: BondVector | ThreatVector): number {
  const values = Object.values(vec) as number[];
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/* ── Public API ── */

/**
 * Derives the companion's current mood from her psychology state.
 *
 * Decision rules (evaluated in priority order — first match wins):
 * 1. `neutral`  — psychState is null (fresh thread, no data)
 * 2. `hurt`     — flags.lied OR flags.boundaryViolation are set
 * 3. `distant`  — phase is 'detaching' OR 'post_breakup' (not strained —
 *                  strained still resolves via bonds/threats below)
 * 4. `uneasy`   — threat average >= 40 (regardless of bonds/phase)
 * 5. `happy`    — bond average > 60 AND threat average < 20
 * 6. `content`  — bond average in [40, 60] AND threat average < 30
 * 7. `pensive`  — emotional fatigue > 40 OR threat average in [20, 40)
 * 8. `neutral`  — fallback
 *
 * Note: happy/content are evaluated before pensive so that moderate bonds
 * with a threat average of exactly 20 resolve to `content` rather than
 * `pensive` when bond levels are in the content range.
 *
 * @param psychState - Current psychology state, or null for a fresh thread.
 * @returns Full `CompanionMoodInfo` including icon, colorClass, and label.
 *
 * @example
 * const info = deriveCompanionMood(psychState);
 * console.log(`${info.icon} ${info.label}`); // '✨ Happy'
 */
export function deriveCompanionMood(psychState: PsychologyState | null): CompanionMoodInfo {
  if (psychState === null) {
    return MOOD_INFO_MAP['neutral'];
  }

  const { bonds, threats, fatigue, flags, phase } = psychState;

  const bondAvg = vectorAverage(bonds);
  const threatAvg = vectorAverage(threats);
  const fatigueLvl = fatigue.emotionalLabor;

  // 1. Hurt — flagged events override almost everything
  if (flags['lied'] === true || flags['boundaryViolation'] === true) {
    return MOOD_INFO_MAP['hurt'];
  }

  // 2. Distant — relationship has fully broken down (detaching / post_breakup).
  //    'strained' is intentionally excluded: it still resolves via threat/bond
  //    signals below so the user sees 'uneasy' rather than the harsher 'distant'.
  if (phase === 'detaching' || phase === 'post_breakup') {
    return MOOD_INFO_MAP['distant'];
  }

  // 3. Uneasy — significant threat perception dominates over positive bonds
  if (threatAvg >= 40) {
    return MOOD_INFO_MAP['uneasy'];
  }

  // 4. Happy — strong bonds, low threats (before pensive so a high-bond state
  //    with mild threat avg doesn't incorrectly fall into pensive)
  if (bondAvg > 60 && threatAvg < 20) {
    return MOOD_INFO_MAP['happy'];
  }

  // 5. Content — moderate bonds, low threats (checked before pensive for the
  //    same reason: bonds in [40,60] with threatAvg=20 should read as content)
  if (bondAvg >= 40 && bondAvg <= 60 && threatAvg < 30) {
    return MOOD_INFO_MAP['content'];
  }

  // 6. Pensive — emotionally drained or mildly threatened but not content/happy
  if (fatigueLvl > 40 || (threatAvg >= 20 && threatAvg < 40)) {
    return MOOD_INFO_MAP['pensive'];
  }

  // 7. Neutral — no conclusive state
  return MOOD_INFO_MAP['neutral'];
}
