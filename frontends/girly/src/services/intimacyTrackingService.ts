/**
 * Intimacy tracking service — per-turn intimacy scoring and physical state parsing.
 *
 * Uses regex signal detection (same pattern as memoryHeuristicsService.ts)
 * to evaluate flirty/romantic/physical language in messages and adjust
 * the intimacy score accordingly. The score naturally decays toward
 * baseline when no signals are detected.
 */

import {
  type ContentRatingLevel,
  type IntimacyState,
  type PhysicalState,
  CONTENT_RATING_ORDER,
  DEFAULT_INTIMACY_THRESHOLDS,
} from '../types/content.ts';
import { type RelationshipPhase } from '../types/psychology.ts';

/* ── Signal patterns ── */

const FLIRTY_PATTERNS = [
  /\b(cute|adorable|beautiful|gorgeous|pretty|handsome|hot)\b/i,
  /\b(wink|blush|tease|flirt|smirk)\b/i,
  /\b(miss you|thinking about you|can't stop thinking)\b/i,
  /\*\s*(winks?|blush(es)?|smirks?|giggles?)\s*\*/i,
];

const ROMANTIC_PATTERNS = [
  /\b(love you|i love|my love|darling|sweetheart|baby|babe)\b/i,
  /\b(heart|hearts|heartbeat|butterflies)\b/i,
  /\b(kiss|kissed|kissing|cuddle|cuddling|embrace|hold me)\b/i,
  /\*\s*(kisses?|hugs?|embraces?|holds? (you|your|close))\s*\*/i,
];

const PHYSICAL_PATTERNS = [
  /\b(touch|touches|touching|caress|stroke|press(es)?)\b/i,
  /\b(body|skin|lips|neck|shoulder|waist|hip|thigh|chest)\b/i,
  /\b(closer|against|on top|beneath|between)\b/i,
  /\*\s*(leans?|pulls?|presses?|runs? (hand|finger)|places? (hand|palm))\s*\*/i,
  /\b(undress|remove|take off|unbutton|slip off)\b/i,
];

const EXPLICIT_PATTERNS = [
  /\b(moan|groan|gasp|pant|whimper|cry out)\b/i,
  /\b(thrust|grind|rock|arch|squeeze|grip)\b/i,
  /\b(naked|nude|bare|exposed|undressed)\b/i,
];

const COOLING_PATTERNS = [
  /\b(stop|don't|no|wait|slow down|not now|please don't)\b/i,
  /\b(friend|buddy|pal|just friends|platonic)\b/i,
  /\b(uncomfortable|weird|awkward|inappropriate)\b/i,
];

/** Maximum intimacy score a content ceiling allows. */
function getMaxIntimacyForCeiling(ceiling: ContentRatingLevel): number {
  const ceilingIndex = CONTENT_RATING_ORDER.indexOf(ceiling);
  const { flirty, suggestive, heavyPhysical } = DEFAULT_INTIMACY_THRESHOLDS;

  switch (ceilingIndex) {
    case 0: return flirty[1];      // general: cap at 30
    case 1: return suggestive[1];   // edgy: cap at 60
    case 2: return heavyPhysical[1]; // mature: cap at 85
    case 3: return 100;             // explicit: uncapped
    default: return flirty[1];
  }
}

/**
 * Counts how many patterns from a list match the given text.
 *
 * @param text - Message text to scan.
 * @param patterns - Regex patterns to test.
 * @returns Number of matching patterns.
 */
function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

/** Phases where relationship breakdown forces intimacy cooling. */
const COOLING_PHASES: ReadonlySet<RelationshipPhase> = new Set(['detaching', 'post_breakup']);
const PHASE_INTIMACY_CAP = 30;

/**
 * Evaluates intimacy shift for a conversation turn.
 *
 * Scans both user and assistant messages for signal patterns,
 * applies adjustments (+/-), and enforces the ceiling cap.
 * Also enforces a hard cap of 30 during detaching/post_breakup
 * relationship phases, regardless of content ceiling.
 *
 * @param state - Current intimacy state.
 * @param userMsg - The user's message content.
 * @param assistantMsg - The assistant's response content.
 * @param ceiling - Effective content ceiling (limits max intimacy).
 * @param psychologyPhase - Current relationship phase (optional). When
 *   'detaching' or 'post_breakup', intimacy is hard-capped at 30.
 * @returns Updated intimacy state.
 */
export function evaluateIntimacyShift(
  state: IntimacyState,
  userMsg: string,
  assistantMsg: string,
  ceiling: ContentRatingLevel,
  psychologyPhase?: RelationshipPhase,
): IntimacyState {
  const combinedText = `${userMsg}\n${assistantMsg}`;

  const flirtySignals = countMatches(combinedText, FLIRTY_PATTERNS);
  const romanticSignals = countMatches(combinedText, ROMANTIC_PATTERNS);
  const physicalSignals = countMatches(combinedText, PHYSICAL_PATTERNS);
  const explicitSignals = countMatches(combinedText, EXPLICIT_PATTERNS);
  const coolingSignals = countMatches(combinedText, COOLING_PATTERNS);

  let delta = 0;

  // Positive signals: weighted by intensity tier
  delta += flirtySignals * 2;
  delta += romanticSignals * 3;
  delta += physicalSignals * 4;
  delta += explicitSignals * 5;

  // Negative signals
  delta -= coolingSignals * 3;

  // Natural decay: -1 per turn when no positive signals detected
  const hasPositiveSignals = flirtySignals + romanticSignals + physicalSignals + explicitSignals > 0;
  if (!hasPositiveSignals) {
    delta -= 1;
  }

  // Clamp delta to prevent wild swings
  delta = Math.max(-5, Math.min(5, delta));

  // Phase-based hard cap: detaching/post_breakup forces cooling regardless of content ceiling
  const ceilingMax = getMaxIntimacyForCeiling(ceiling);
  const phaseMax = psychologyPhase && COOLING_PHASES.has(psychologyPhase) ? PHASE_INTIMACY_CAP : ceilingMax;
  const maxIntimacy = Math.min(ceilingMax, phaseMax);
  const nextLevel = Math.max(0, Math.min(maxIntimacy, state.level + delta));

  const trend: IntimacyState['trend'] =
    delta > 0 ? 'rising' :
    delta < 0 ? 'cooling' :
    'stable';

  return {
    level: nextLevel,
    trend,
    lastUpdateTurn: state.lastUpdateTurn + 1,
  };
}

/* ── Physical state tracking ── */

const ACTION_PATTERN = /\*([^*]+)\*/g;
const CLOTHING_CHANGE_PATTERNS = [
  /\b(takes? off|removes?|unbuttons?|slips? off|pulls? down|pulls? off|unzips?)\s+(?:(?:his|her|my|your|the)\s+)?(\w[\w\s]*)/i,
  /\b(puts? on|wears?|buttons?|zips?)\s+(?:(?:his|her|my|your|the)\s+)?(\w[\w\s]*)/i,
];
const POSITION_PATTERNS = [
  /\b(sit(?:s|ting)?|stand(?:s|ing)?|l(?:ies?|ying|ays?)|kneel(?:s|ing)?)\s+(?:on|in|at|beside|next to|against)\s+(?:the\s+)?(\w[\w\s]*)/i,
  /\b(moves? to|walks? to|goes? to|climbs? (?:on|into)|gets? (?:on|into|in))\s+(?:the\s+)?(\w[\w\s]*)/i,
];

/**
 * Detects physical actions described in a message.
 *
 * Looks for `*action*` markers and descriptive physical phrases.
 *
 * @param message - Message content to scan.
 * @returns Array of detected physical action descriptions.
 */
export function detectPhysicalActions(message: string): string[] {
  const actions: string[] = [];

  // Extract *action* markers
  let match: RegExpExecArray | null;
  const actionRegex = new RegExp(ACTION_PATTERN.source, ACTION_PATTERN.flags);
  while ((match = actionRegex.exec(message)) !== null) {
    const action = match[1].trim();
    if (action.length > 3 && action.length < 200) {
      actions.push(action);
    }
  }

  return actions;
}

/**
 * Updates the physical state based on user and assistant messages.
 *
 * Parses clothing changes, position changes, and physical actions
 * from both messages and merges them into the existing state.
 *
 * @param currentState - Current physical state.
 * @param userMsg - The user's message content.
 * @param assistantMsg - The assistant's response content.
 * @returns Updated physical state.
 */
export function updatePhysicalState(
  currentState: PhysicalState,
  userMsg: string,
  assistantMsg: string,
): PhysicalState {
  const nextState = { ...currentState };
  const combinedText = `${userMsg}\n${assistantMsg}`;

  // Detect clothing changes
  for (const pattern of CLOTHING_CHANGE_PATTERNS) {
    const match = combinedText.match(pattern);
    if (match) {
      const verb = match[1].toLowerCase();
      const garment = match[2].trim();
      const isRemoving = /takes?\s+off|removes?|unbuttons?|slips?\s+off|pulls?\s+(down|off)|unzips?/i.test(verb);

      // Heuristic: if the action is in the assistant's text, it's the companion's clothing
      if (assistantMsg.match(pattern)) {
        nextState.companionClothing = isRemoving
          ? `removed ${garment}`
          : garment;
      } else {
        nextState.userClothing = isRemoving
          ? `removed ${garment}`
          : garment;
      }
    }
  }

  // Detect position changes
  for (const pattern of POSITION_PATTERNS) {
    const match = combinedText.match(pattern);
    if (match) {
      nextState.physicalContext = match[0].trim();
    }
  }

  // Collect recent actions (keep last 5)
  const userActions = detectPhysicalActions(userMsg);
  const assistantActions = detectPhysicalActions(assistantMsg);
  const allNewActions = [...userActions, ...assistantActions];
  const mergedActions = [...currentState.recentActions, ...allNewActions].slice(-5);
  nextState.recentActions = mergedActions;

  // Update arousal based on explicit signals
  const explicitCount = countMatches(combinedText, EXPLICIT_PATTERNS);
  if (explicitCount > 0) {
    nextState.arousalLevel = Math.min(10, currentState.arousalLevel + explicitCount);
  } else {
    nextState.arousalLevel = Math.max(0, currentState.arousalLevel - 1);
  }

  nextState.lastUpdatedAt = Date.now();
  return nextState;
}
