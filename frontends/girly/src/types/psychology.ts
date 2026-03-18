/* ──────────────────────────────────────────────
 * Psychology engine types for advanced
 * character behavioral simulation.
 * ────────────────────────────────────────────── */

/** Relationship lifecycle phase. */
export type RelationshipPhase =
  | 'honeymoon'
  | 'stable'
  | 'strained'
  | 'detaching'
  | 'post_breakup';

/**
 * Mask contexts determine which behavioral "face" the character shows.
 * Different contexts unlock different vulnerability levels and speech patterns.
 */
export type MaskContext = 'public' | 'friends' | 'romantic' | 'authority' | 'intimate';

/**
 * Threat vector — perceived dangers to the relationship.
 * Each dimension is scored 0-100.
 */
export interface ThreatVector {
  /** Fear of losing social standing or being seen as lesser. */
  status: number;
  /** Fear of being left behind or forgotten. */
  abandonment: number;
  /** Fear of losing autonomy or independence. */
  controlLoss: number;
  /** Perceived threat from other people competing for attention. */
  rival: number;
}

/**
 * Bond vector — positive attachment dimensions.
 * Each dimension is scored 0-100.
 */
export interface BondVector {
  /** Emotional closeness and dependency. */
  attachment: number;
  /** Esteem for the user's character and decisions. */
  respect: number;
  /** Appreciation for the user's qualities and achievements. */
  admiration: number;
  /** Confidence that the user is reliable and honest. */
  trust: number;
}

/**
 * Full psychology state for a thread-persona pair.
 *
 * This is the core mutable state that evolves turn-by-turn as the
 * conversation progresses. It is persisted to IndexedDB and used
 * to generate behavioral prompt injections.
 */
export interface PsychologyState {
  /** Thread this state belongs to. */
  threadId: string;
  /** Persona this state belongs to. */
  personaId: string;
  /** Current relationship lifecycle phase. */
  phase: RelationshipPhase;
  /** Current threat perception levels. */
  threats: ThreatVector;
  /** Current bond strength levels. */
  bonds: BondVector;
  /** Emotional fatigue tracking. */
  fatigue: { emotionalLabor: number };
  /** Boolean flags for notable events (lied, relapse, boundaryViolation, etc.). */
  flags: Record<string, boolean>;
  /** Which behavioral mask is currently active. */
  activeMask: MaskContext;
  /** Labels of currently triggered behavioral modes. */
  activeTriggeredModes: string[];
  /** Current dere-type blend weights (keyed by DereType, values 0-100). */
  dereWeights: Record<string, number>;
  /** Turns since the last significant state change (for natural pacing). */
  turnsSinceLastShift: number;
  /** Timestamp of last evaluation. */
  lastEvaluatedAt: number;
  /** Rolling history of state snapshots for dev-mode visualization. */
  stateHistory: PsychologyHistoryEntry[];
}

/** A single snapshot in the psychology state history timeline. */
export interface PsychologyHistoryEntry {
  timestamp: number;
  phase: RelationshipPhase;
  threats: ThreatVector;
  bonds: BondVector;
  /** Optional label describing what triggered this snapshot. */
  triggerLabel?: string;
}

/**
 * A behavioral rule that fires when conditions are met.
 *
 * Rules are evaluated in priority order each turn. When a rule's
 * conditions match, its effects are applied to the psychology state
 * and/or injected into the prompt.
 */
export interface BehavioralRule {
  id: string;
  label: string;
  /** Lower number = higher priority. */
  priority: number;
  enabled: boolean;
  /** Conditions that must be met for this rule to fire. */
  conditions: BehavioralCondition[];
  /** How to combine conditions: all must match (AND) or any (OR). */
  operator: 'AND' | 'OR';
  /** Effects to apply when this rule fires. */
  effects: BehavioralEffect[];
}

/** A single condition within a behavioral rule. */
export interface BehavioralCondition {
  /** Dot-path into PsychologyState, e.g. "bonds.trust" or "phase". */
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'neq' | 'is' | 'isNot';
  value: number | string | boolean;
}

/**
 * An effect produced by a behavioral rule or trigger map entry.
 *
 * Effects can modify the psychology state directly, shift dere weights,
 * or inject prompt text that shapes the character's behavior.
 */
export interface BehavioralEffect {
  /** What kind of modification to make. */
  type:
    | 'inject_prompt'
    | 'shift_dere_weight'
    | 'set_mask'
    | 'set_flag'
    | 'modify_bond'
    | 'modify_threat';
  /** Target field or dere type (depends on effect type). */
  target?: string;
  /** Value to set, add, or inject (depends on effect type). */
  value: string | number | boolean;
}

/**
 * A trigger map entry defines a pattern-based behavioral mode.
 *
 * When user or assistant messages match the detection patterns,
 * the trigger activates for a limited number of turns, applying
 * its effects each turn while active.
 */
export interface TriggerMapEntry {
  id: string;
  label: string;
  /** Regex patterns for activation detection. */
  detectionPatterns: string[];
  /** Simple keywords that contribute to activation score. */
  signalKeywords: string[];
  /** Score threshold (0-1) required to activate. */
  activationThreshold: number;
  /** Effects applied while this trigger is active. */
  effects: BehavioralEffect[];
  /** Minimum turns between re-activations. */
  cooldownTurns: number;
  /** Maximum turns this trigger stays active. */
  maxDurationTurns: number;
}

/**
 * A canon constraint — immutable character facts the AI must respect.
 *
 * Hard constraints are never violated; soft constraints can bend
 * under extreme relationship pressure.
 */
export interface CanonConstraint {
  id: string;
  /** The constraint text, e.g. "She NEVER chases. She never begs." */
  text: string;
  /** Hard = always enforced. Soft = can bend in extreme states. */
  priority: 'hard' | 'soft';
}

/**
 * Dere weight entry for persona configuration.
 *
 * Defines the base weight of a dere type and how it shifts
 * across relationship phases.
 */
export interface DereWeightEntry {
  dereType: string;
  /** Base weight (0-100) before phase modifiers. */
  baseWeight: number;
  /** Additive modifiers per relationship phase. */
  phaseModifiers: Partial<Record<RelationshipPhase, number>>;
}

/**
 * Phase transition thresholds.
 *
 * Bond/threat averages that trigger transitions between
 * relationship phases. Higher values = harder to transition.
 */
export interface PhaseTransitionThresholds {
  /** Average bond score to transition from honeymoon → stable. */
  honeymoonToStable: number;
  /** Average threat score to transition from stable → strained. */
  stableToStrained: number;
  /** Average threat score to transition from strained → detaching. */
  strainedToDetaching: number;
  /** Average threat score to transition from detaching → post_breakup. */
  detachingToPostBreakup: number;
  /** Average bond score required to recover from strained → stable. */
  recoveryThreshold: number;
}

/** Default phase transition thresholds. */
export const DEFAULT_PHASE_THRESHOLDS: PhaseTransitionThresholds = {
  honeymoonToStable: 60,
  stableToStrained: 55,
  strainedToDetaching: 70,
  detachingToPostBreakup: 85,
  recoveryThreshold: 50,
};

/** Default empty threat vector. */
export const DEFAULT_THREATS: ThreatVector = {
  status: 0,
  abandonment: 0,
  controlLoss: 0,
  rival: 0,
};

/** Default starting bond vector. */
export const DEFAULT_BONDS: BondVector = {
  attachment: 20,
  respect: 30,
  admiration: 25,
  trust: 25,
};

/** Per-thread psychology state record for IndexedDB. */
export interface PsychologyStateRecord {
  threadId: string;
  personaId: string;
  state: PsychologyState;
}
