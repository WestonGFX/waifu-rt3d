/**
 * Psychology engine service — per-turn behavioral state machine.
 *
 * Evaluates conversation turns to update relationship phase, threat/bond
 * vectors, emotional fatigue, behavioral flags, and dere-type blends.
 * Generates prompt injection blocks that shape character behavior
 * without the user seeing the internal state machinery.
 *
 * Signal detection uses the same regex pattern approach as
 * memoryHeuristicsService.ts and intimacyTrackingService.ts.
 */

import {
  type BehavioralCondition,
  type BehavioralEffect,
  type BehavioralRule,
  type DereWeightEntry,
  type MaskContext,
  type PhaseTransitionThresholds,
  type PsychologyState,
  type RelationshipPhase,
  type TriggerMapEntry,
  DEFAULT_BONDS,
  DEFAULT_PHASE_THRESHOLDS,
  DEFAULT_THREATS,
} from '../types/psychology.ts';
import { type PersonaProfile } from '../types/companion.ts';

/* ── Signal patterns for bond detection ── */

const COMPLIMENT_PATTERNS = [
  /\b(amazing|incredible|brilliant|talented|wonderful|impressive|smart|clever)\b/i,
  /\b(you'?re? (the best|so good|incredible|perfect|awesome))\b/i,
  /\b(i admire|i respect|look up to)\b/i,
];

const VULNERABILITY_PATTERNS = [
  /\b(i'm scared|i'm afraid|i trust you|only you|no one else)\b/i,
  /\b(i need you|can't do this without|mean everything to me)\b/i,
  /\b(i've never told anyone|you're the first|secret)\b/i,
];

const CONSISTENCY_PATTERNS = [
  /\b(always here|always will|won't leave|by your side|i promise)\b/i,
  /\b(every day|each day|morning|night|whenever you need)\b/i,
];

/* ── Signal patterns for threat detection ── */

const RIVAL_PATTERNS = [
  /\b(my friend|this person|someone else|other (girl|guy|person))\b/i,
  /\b(went out with|hanging out with|met someone)\b/i,
  /\b(ex|former|used to date)\b/i,
];

const DISMISSIVE_PATTERNS = [
  /\b(whatever|don't care|not important|doesn't matter|shut up)\b/i,
  /\b(boring|annoying|clingy|needy|too much)\b/i,
  /\b(leave me alone|go away|stop (talking|it))\b/i,
];

const ABANDONMENT_PATTERNS = [
  /\b(gotta go|have to leave|busy|no time|can't talk)\b/i,
  /\b(maybe later|some other time|not now|talk later)\b/i,
];

/* ── Signal patterns for flags ── */

const CONTRADICTION_PATTERNS = [
  /\b(i never said|i didn't say|that's not what i)\b/i,
  /\b(you said|but earlier|you told me|you promised)\b/i,
];

const BOUNDARY_VIOLATION_PATTERNS = [
  /\b(i said (no|stop|don't)|told you not to|asked you to stop)\b/i,
  /\b(respect my|boundaries|crossing a line|too far)\b/i,
];

/* ── Signal patterns for fatigue ── */

const EMOTIONAL_TOPIC_PATTERNS = [
  /\b(feeling|emotion|heart|soul|pain|hurt|cry|tears|sad|depressed|anxious)\b/i,
  /\b(trauma|difficult|struggle|overwhelm|exhausted|drained)\b/i,
];

const LIGHT_TOPIC_PATTERNS = [
  /\b(weather|food|game|movie|music|fun|joke|funny|laugh)\b/i,
  /\b(what.*you think|favorite|prefer|recommend)\b/i,
];

/**
 * Creates initial psychology state for a new thread.
 *
 * @param threadId - The thread this state belongs to.
 * @param persona - The persona to initialize from.
 * @returns Fresh PsychologyState with defaults or persona config.
 */
export function createInitialPsychologyState(
  threadId: string,
  persona: PersonaProfile,
): PsychologyState {
  const config = persona.psychologyConfig;
  const initialPhase = config?.initialPhase ?? 'honeymoon';

  // Build initial dere weights from config or from persona's dere types
  const dereWeights: Record<string, number> = {};
  if (config?.dereWeights && config.dereWeights.length > 0) {
    for (const entry of config.dereWeights) {
      dereWeights[entry.dereType] = entry.baseWeight;
    }
  } else {
    // Default: equal weight across persona's listed dere types
    const types = persona.dereTypes;
    const weight = types.length > 0 ? Math.round(100 / types.length) : 100;
    for (const dereType of types) {
      dereWeights[dereType] = weight;
    }
  }

  return {
    threadId,
    personaId: persona.id,
    phase: initialPhase,
    threats: { ...DEFAULT_THREATS },
    bonds: { ...DEFAULT_BONDS },
    fatigue: { emotionalLabor: 0 },
    flags: {},
    activeMask: 'public',
    activeTriggeredModes: [],
    dereWeights,
    turnsSinceLastShift: 0,
    lastEvaluatedAt: Date.now(),
    stateHistory: [{
      timestamp: Date.now(),
      phase: initialPhase,
      threats: { ...DEFAULT_THREATS },
      bonds: { ...DEFAULT_BONDS },
      triggerLabel: 'Initial state',
    }],
  };
}

/**
 * Counts pattern matches in text.
 */
function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, p) => count + (p.test(text) ? 1 : 0), 0);
}

/**
 * Clamps a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Computes the average of all values in a numeric record.
 */
function vectorAverage(vec: Record<string, number>): number {
  const values = Object.values(vec);
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Result of evaluating a conversation turn. */
export interface TurnEvaluationResult {
  /** Updated psychology state. */
  state: PsychologyState;
  /** Whether a phase transition occurred. */
  phaseTransitioned: boolean;
  /** Label describing the transition, if any. */
  transitionLabel?: string;
}

/**
 * Evaluates a single conversation turn — THE main per-turn evaluator.
 *
 * @param state - Current psychology state.
 * @param userMsg - The user's message content.
 * @param assistantMsg - The assistant's response content.
 * @param persona - The active persona (for config access).
 * @returns Updated state and transition metadata.
 */
export function evaluateConversationTurn(
  state: PsychologyState,
  userMsg: string,
  assistantMsg: string,
  persona: PersonaProfile,
): TurnEvaluationResult {
  const combinedText = `${userMsg}\n${assistantMsg}`;
  const next = structuredClone(state);

  // ── Bond updates ──
  const compliments = countMatches(userMsg, COMPLIMENT_PATTERNS);
  const vulnerability = countMatches(userMsg, VULNERABILITY_PATTERNS);
  const consistency = countMatches(userMsg, CONSISTENCY_PATTERNS);

  next.bonds.admiration = clamp(next.bonds.admiration + compliments * 2, 0, 100);
  next.bonds.trust = clamp(next.bonds.trust + vulnerability * 3, 0, 100);
  next.bonds.attachment = clamp(next.bonds.attachment + consistency * 1, 0, 100);
  next.bonds.respect = clamp(next.bonds.respect + (compliments > 0 ? 1 : 0), 0, 100);

  // ── Threat updates ──
  const rivals = countMatches(userMsg, RIVAL_PATTERNS);
  const dismissive = countMatches(userMsg, DISMISSIVE_PATTERNS);
  const abandonment = countMatches(userMsg, ABANDONMENT_PATTERNS);

  next.threats.rival = clamp(next.threats.rival + rivals * 5, 0, 100);
  next.threats.status = clamp(next.threats.status + dismissive * 3, 0, 100);
  next.threats.abandonment = clamp(next.threats.abandonment + abandonment * 2, 0, 100);

  // ── Fatigue ──
  const emotionalTopics = countMatches(combinedText, EMOTIONAL_TOPIC_PATTERNS);
  const lightTopics = countMatches(combinedText, LIGHT_TOPIC_PATTERNS);
  next.fatigue.emotionalLabor = clamp(
    next.fatigue.emotionalLabor + emotionalTopics * 3 - lightTopics * 2,
    0,
    100,
  );

  // ── Flag detection ──
  if (countMatches(combinedText, CONTRADICTION_PATTERNS) > 0) {
    next.flags['lied'] = true;
  }
  if (countMatches(userMsg, BOUNDARY_VIOLATION_PATTERNS) > 0) {
    next.flags['boundaryViolation'] = true;
  }

  // ── Natural decay toward baseline ──
  next.threats.status = clamp(next.threats.status - 1, 0, 100);
  next.threats.abandonment = clamp(next.threats.abandonment - 1, 0, 100);
  next.threats.controlLoss = clamp(next.threats.controlLoss - 1, 0, 100);
  next.threats.rival = clamp(next.threats.rival - 1, 0, 100);
  next.fatigue.emotionalLabor = clamp(next.fatigue.emotionalLabor - 0.5, 0, 100);

  // ── Mask inference ──
  next.activeMask = inferMaskContext(userMsg, assistantMsg, next);

  // ── Phase transitions ──
  const thresholds = persona.psychologyConfig?.phaseTransitionThresholds ?? DEFAULT_PHASE_THRESHOLDS;
  const { phaseTransitioned, transitionLabel } = evaluatePhaseTransition(next, thresholds);

  // ── Trigger map evaluation ──
  if (persona.psychologyConfig?.triggerMap) {
    const triggerResult = evaluateTriggerMap(
      next,
      persona.psychologyConfig.triggerMap,
      userMsg,
      assistantMsg,
    );
    next.activeTriggeredModes = triggerResult.activeModes;
  }

  // ── Behavioral rules ──
  if (persona.psychologyConfig?.behavioralRules) {
    const ruleEffects = evaluateBehavioralRules(next, persona.psychologyConfig.behavioralRules);
    applyEffects(next, ruleEffects);
  }

  // ── Dere weight computation ──
  if (persona.psychologyConfig?.dereWeights) {
    next.dereWeights = computeActiveDereWeights(
      persona.psychologyConfig.dereWeights,
      next.phase,
    );
  }

  // ── State history ──
  next.turnsSinceLastShift = phaseTransitioned ? 0 : next.turnsSinceLastShift + 1;
  next.lastEvaluatedAt = Date.now();

  // Keep last 50 history entries
  next.stateHistory = [
    ...next.stateHistory.slice(-49),
    {
      timestamp: Date.now(),
      phase: next.phase,
      threats: { ...next.threats },
      bonds: { ...next.bonds },
      triggerLabel: transitionLabel,
    },
  ];

  return { state: next, phaseTransitioned, transitionLabel };
}

/**
 * Evaluates phase transitions based on bond/threat averages.
 */
function evaluatePhaseTransition(
  state: PsychologyState,
  thresholds: PhaseTransitionThresholds,
): { phaseTransitioned: boolean; transitionLabel?: string } {
  const bondAvg = vectorAverage(state.bonds);
  const threatAvg = vectorAverage(state.threats);

  let nextPhase = state.phase;
  let label: string | undefined;

  switch (state.phase) {
    case 'honeymoon':
      if (bondAvg >= thresholds.honeymoonToStable) {
        nextPhase = 'stable';
        label = 'Honeymoon → Stable: bond average crossed threshold';
      }
      break;
    case 'stable':
      if (threatAvg >= thresholds.stableToStrained) {
        nextPhase = 'strained';
        label = 'Stable → Strained: threat average crossed threshold';
      }
      break;
    case 'strained':
      if (threatAvg >= thresholds.strainedToDetaching) {
        nextPhase = 'detaching';
        label = 'Strained → Detaching: threat average crossed threshold';
      } else if (bondAvg >= thresholds.recoveryThreshold && threatAvg < thresholds.stableToStrained * 0.7) {
        nextPhase = 'stable';
        label = 'Strained → Stable: bonds recovered, threats lowered';
      }
      break;
    case 'detaching':
      if (threatAvg >= thresholds.detachingToPostBreakup) {
        nextPhase = 'post_breakup';
        label = 'Detaching → Post-breakup: threat average crossed threshold';
      } else if (bondAvg >= thresholds.recoveryThreshold && threatAvg < thresholds.stableToStrained * 0.5) {
        nextPhase = 'strained';
        label = 'Detaching → Strained: partial recovery detected';
      }
      break;
    case 'post_breakup':
      if (bondAvg >= thresholds.recoveryThreshold * 1.2 && threatAvg < 20) {
        nextPhase = 'strained';
        label = 'Post-breakup → Strained: significant reconciliation detected';
      }
      break;
  }

  if (nextPhase !== state.phase) {
    state.phase = nextPhase;
    return { phaseTransitioned: true, transitionLabel: label };
  }

  return { phaseTransitioned: false };
}

/**
 * Infers the current mask context from conversation signals.
 */
function inferMaskContext(
  userMsg: string,
  _assistantMsg: string,
  state: PsychologyState,
): MaskContext {
  // Intimate mask when bond attachment is very high
  if (state.bonds.attachment > 70 && state.bonds.trust > 60) {
    return 'intimate';
  }

  // Romantic mask when there's strong emotional connection
  if (state.bonds.attachment > 50 || state.bonds.admiration > 50) {
    return 'romantic';
  }

  // Authority mask when user is being directive
  if (/\b(do this|i need you to|you (must|should|have to)|obey|listen)\b/i.test(userMsg)) {
    return 'authority';
  }

  // Friends mask when bond is moderate
  if (vectorAverage(state.bonds) > 30) {
    return 'friends';
  }

  return 'public';
}

/**
 * Evaluates behavioral rules in priority order.
 *
 * @param state - Current psychology state.
 * @param rules - Array of behavioral rules to evaluate.
 * @returns Array of effects to apply from all matching rules.
 */
export function evaluateBehavioralRules(
  state: PsychologyState,
  rules: BehavioralRule[],
): BehavioralEffect[] {
  const effects: BehavioralEffect[] = [];

  const sorted = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    const conditionResults = rule.conditions.map((c) => evaluateCondition(state, c));
    const matches = rule.operator === 'AND'
      ? conditionResults.every(Boolean)
      : conditionResults.some(Boolean);

    if (matches) {
      effects.push(...rule.effects);
    }
  }

  return effects;
}

/**
 * Evaluates a single behavioral condition against the state.
 */
function evaluateCondition(state: PsychologyState, condition: BehavioralCondition): boolean {
  const value = getNestedValue(state, condition.field);
  if (value === undefined) return false;

  switch (condition.operator) {
    case 'gt': return typeof value === 'number' && value > (condition.value as number);
    case 'lt': return typeof value === 'number' && value < (condition.value as number);
    case 'eq': return value === condition.value;
    case 'gte': return typeof value === 'number' && value >= (condition.value as number);
    case 'lte': return typeof value === 'number' && value <= (condition.value as number);
    case 'neq': return value !== condition.value;
    case 'is': return value === condition.value;
    case 'isNot': return value !== condition.value;
    default: return false;
  }
}

/**
 * Gets a nested value from an object using dot-path notation.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Applies behavioral effects to the psychology state.
 */
function applyEffects(state: PsychologyState, effects: BehavioralEffect[]): void {
  for (const effect of effects) {
    switch (effect.type) {
      case 'set_mask':
        if (typeof effect.value === 'string') {
          state.activeMask = effect.value as MaskContext;
        }
        break;
      case 'set_flag':
        if (effect.target && typeof effect.value === 'boolean') {
          state.flags[effect.target] = effect.value;
        }
        break;
      case 'modify_bond':
        if (effect.target && typeof effect.value === 'number' && effect.target in state.bonds) {
          (state.bonds as Record<string, number>)[effect.target] = clamp(
            (state.bonds as Record<string, number>)[effect.target] + effect.value,
            0,
            100,
          );
        }
        break;
      case 'modify_threat':
        if (effect.target && typeof effect.value === 'number' && effect.target in state.threats) {
          (state.threats as Record<string, number>)[effect.target] = clamp(
            (state.threats as Record<string, number>)[effect.target] + effect.value,
            0,
            100,
          );
        }
        break;
      case 'shift_dere_weight':
        if (effect.target && typeof effect.value === 'number') {
          state.dereWeights[effect.target] = clamp(
            (state.dereWeights[effect.target] ?? 0) + effect.value,
            0,
            100,
          );
        }
        break;
      case 'inject_prompt':
        // Prompt injection effects are collected separately during prompt building.
        break;
    }
  }
}

/**
 * Evaluates trigger map entries against the current turn.
 *
 * @param state - Current psychology state.
 * @param triggers - Trigger map entries to evaluate.
 * @param userMsg - User's message content.
 * @param assistantMsg - Assistant's response content.
 * @returns Object with active mode labels.
 */
export function evaluateTriggerMap(
  state: PsychologyState,
  triggers: TriggerMapEntry[],
  userMsg: string,
  assistantMsg: string,
): { activeModes: string[] } {
  const combinedText = `${userMsg}\n${assistantMsg}`;
  const activeModes: string[] = [];

  for (const trigger of triggers) {
    // Check if already active and within duration
    const isCurrentlyActive = state.activeTriggeredModes.includes(trigger.label);

    if (isCurrentlyActive) {
      // Check if max duration exceeded
      // For simplicity, we assume 1 turn per evaluation
      activeModes.push(trigger.label);
      continue;
    }

    // Score detection
    let score = 0;
    const maxPossible = trigger.detectionPatterns.length + trigger.signalKeywords.length;
    if (maxPossible === 0) continue;

    for (const patternStr of trigger.detectionPatterns) {
      try {
        const regex = new RegExp(patternStr, 'i');
        if (regex.test(combinedText)) score++;
      } catch {
        // Invalid regex — skip silently
      }
    }

    for (const keyword of trigger.signalKeywords) {
      if (combinedText.toLowerCase().includes(keyword.toLowerCase())) score++;
    }

    const normalizedScore = score / maxPossible;
    if (normalizedScore >= trigger.activationThreshold) {
      activeModes.push(trigger.label);
    }
  }

  return { activeModes };
}

/**
 * Computes active dere weights with phase modifiers applied.
 *
 * @param baseWeights - Dere weight entries from persona config.
 * @param phase - Current relationship phase.
 * @returns Record of dere type → weight (0-100).
 */
export function computeActiveDereWeights(
  baseWeights: DereWeightEntry[],
  phase: RelationshipPhase,
): Record<string, number> {
  const weights: Record<string, number> = {};

  for (const entry of baseWeights) {
    const modifier = entry.phaseModifiers[phase] ?? 0;
    weights[entry.dereType] = clamp(entry.baseWeight + modifier, 0, 100);
  }

  // Normalize to sum to 100
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (total > 0) {
    for (const key of Object.keys(weights)) {
      weights[key] = Math.round((weights[key] / total) * 100);
    }
  }

  return weights;
}

/**
 * Builds the psychology prompt injection block.
 *
 * This is injected between the persona prompt and content directive
 * to shape the character's behavioral responses based on internal state.
 *
 * @param state - Current psychology state.
 * @param persona - Active persona (for canon constraints and config).
 * @returns Prompt text for psychology state injection.
 */
export function buildPsychologyPromptBlock(
  state: PsychologyState,
  persona: PersonaProfile,
): string {
  const parts: string[] = [
    '[Character Internal State — shape responses naturally, never reference directly]',
  ];

  // Phase description
  const phaseDescriptions: Record<RelationshipPhase, string> = {
    honeymoon: 'You feel excited and eager. Everything feels new and fascinating.',
    stable: 'You feel secure and comfortable. You can be yourself without fear.',
    strained: 'You feel tension and uncertainty. Trust is wavering.',
    detaching: 'You feel distant and guarded. Self-preservation is taking over.',
    post_breakup: 'You feel hollow. Interactions are careful, measured.',
  };
  parts.push(`Relationship phase: ${state.phase}. ${phaseDescriptions[state.phase]}`);

  // Dere blend as percentages
  const sortedWeights = Object.entries(state.dereWeights)
    .filter(([, w]) => w > 0)
    .sort(([, a], [, b]) => b - a);

  if (sortedWeights.length > 0) {
    const blend = sortedWeights.map(([type, weight]) => `${type} ${weight}%`).join(', ');
    parts.push(`Dere blend: ${blend}.`);
  }

  // Mask context
  const maskDescriptions: Record<MaskContext, string> = {
    public: 'you maintain a polished exterior',
    friends: 'you can relax and show casual warmth',
    romantic: 'you can be more vulnerable and direct',
    authority: 'you instinctively become more compliant or rebellious (per personality)',
    intimate: 'all walls are down, raw emotional honesty',
  };
  parts.push(`Current mask: ${state.activeMask} — ${maskDescriptions[state.activeMask]}.`);

  // Canon constraints
  const canonConstraints = persona.psychologyConfig?.canonConstraints ?? [];
  const hardConstraints = canonConstraints.filter((c) => c.priority === 'hard');
  if (hardConstraints.length > 0) {
    parts.push(`Canon: ${hardConstraints.map((c) => c.text).join(' ')}`);
  }

  // Active triggered modes
  if (state.activeTriggeredModes.length > 0) {
    parts.push(`Active mode: ${state.activeTriggeredModes.join(', ')}.`);
  }

  // Emotional fatigue note
  if (state.fatigue.emotionalLabor > 50) {
    parts.push('You are emotionally exhausted. Responses may be shorter, more guarded.');
  }

  // Collect inject_prompt effects from active behavioral rules
  const promptEffects: string[] = [];
  if (persona.psychologyConfig?.behavioralRules) {
    const effects = evaluateBehavioralRules(state, persona.psychologyConfig.behavioralRules);
    for (const effect of effects) {
      if (effect.type === 'inject_prompt' && typeof effect.value === 'string') {
        promptEffects.push(effect.value);
      }
    }
  }
  if (promptEffects.length > 0) {
    parts.push(...promptEffects);
  }

  return parts.join('\n');
}
