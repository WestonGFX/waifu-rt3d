import { describe, it, expect } from 'vitest';
import {
  createInitialPsychologyState,
  evaluateConversationTurn,
  evaluateBehavioralRules,
  computeActiveDereWeights,
  buildPsychologyPromptBlock,
} from './psychologyEngineService.ts';
import { type PersonaProfile } from '../types/companion.ts';
import { type BehavioralRule, type DereWeightEntry } from '../types/psychology.ts';

const mockPersona: PersonaProfile = {
  id: 'test-persona',
  name: 'Asami',
  archetype: 'deredere',
  dereTypes: ['deredere', 'kuudere'],
  tagline: 'test',
  shortBio: 'test',
  backstory: 'test',
  characterFacts: [],
  worldSetting: 'test',
  relationshipPremise: 'test',
  toneGuide: 'test',
  initiativeLevel: 5,
  affectionLevel: 5,
  flirtLevel: 5,
  memoryPriorities: [],
  generatedSystemPrompt: 'Stay in character.',
  createdAt: 1,
  updatedAt: 1,
};

describe('createInitialPsychologyState', () => {
  it('creates state with defaults from persona dere types', () => {
    const state = createInitialPsychologyState('thread-1', mockPersona);
    expect(state.threadId).toBe('thread-1');
    expect(state.personaId).toBe('test-persona');
    expect(state.phase).toBe('honeymoon');
    expect(state.dereWeights['deredere']).toBeDefined();
    expect(state.dereWeights['kuudere']).toBeDefined();
    expect(state.stateHistory.length).toBe(1);
  });

  it('uses persona config initial phase when available', () => {
    const persona = {
      ...mockPersona,
      psychologyConfig: {
        behavioralRules: [],
        triggerMap: [],
        canonConstraints: [],
        dereWeights: [],
        initialPhase: 'stable' as const,
        phaseTransitionThresholds: {
          honeymoonToStable: 60,
          stableToStrained: 55,
          strainedToDetaching: 70,
          detachingToPostBreakup: 85,
          recoveryThreshold: 50,
        },
      },
    };
    const state = createInitialPsychologyState('thread-1', persona);
    expect(state.phase).toBe('stable');
  });
});

describe('evaluateConversationTurn', () => {
  it('increases admiration on compliments', () => {
    const state = createInitialPsychologyState('thread-1', mockPersona);
    const { state: updated } = evaluateConversationTurn(
      state,
      "You're amazing and so talented!",
      'That means so much to me!',
      mockPersona,
    );
    expect(updated.bonds.admiration).toBeGreaterThan(state.bonds.admiration);
  });

  it('increases trust on vulnerability', () => {
    const state = createInitialPsychologyState('thread-1', mockPersona);
    const { state: updated } = evaluateConversationTurn(
      state,
      "I've never told anyone this but I trust you completely",
      'I will always be here for you.',
      mockPersona,
    );
    expect(updated.bonds.trust).toBeGreaterThan(state.bonds.trust);
  });

  it('increases threat.rival when other people are mentioned', () => {
    const state = createInitialPsychologyState('thread-1', mockPersona);
    const { state: updated } = evaluateConversationTurn(
      state,
      'I was hanging out with my friend yesterday, she was fun',
      '*pouts* Oh, is that so...',
      mockPersona,
    );
    expect(updated.threats.rival).toBeGreaterThan(state.threats.rival);
  });

  it('detects boundary violation flags', () => {
    const state = createInitialPsychologyState('thread-1', mockPersona);
    const { state: updated } = evaluateConversationTurn(
      state,
      'I said stop! Respect my boundaries.',
      'I... I understand.',
      mockPersona,
    );
    expect(updated.flags['boundaryViolation']).toBe(true);
  });

  it('increments turn counter', () => {
    const state = createInitialPsychologyState('thread-1', mockPersona);
    const { state: updated } = evaluateConversationTurn(
      state,
      'Hello',
      'Hi there!',
      mockPersona,
    );
    expect(updated.turnsSinceLastShift).toBe(1);
  });
});

describe('evaluateBehavioralRules', () => {
  it('collects effects from matching rules', () => {
    const state = createInitialPsychologyState('thread-1', mockPersona);
    state.bonds.trust = 80;

    const rules: BehavioralRule[] = [{
      id: 'rule-1',
      label: 'High trust unlock',
      priority: 1,
      enabled: true,
      conditions: [{ field: 'bonds.trust', operator: 'gte', value: 70 }],
      operator: 'AND',
      effects: [{ type: 'inject_prompt', value: 'Show deeper vulnerability.' }],
    }];

    const effects = evaluateBehavioralRules(state, rules);
    expect(effects).toHaveLength(1);
    expect(effects[0].value).toBe('Show deeper vulnerability.');
  });

  it('skips disabled rules', () => {
    const state = createInitialPsychologyState('thread-1', mockPersona);
    const rules: BehavioralRule[] = [{
      id: 'rule-1',
      label: 'Disabled',
      priority: 1,
      enabled: false,
      conditions: [{ field: 'phase', operator: 'eq', value: 'honeymoon' }],
      operator: 'AND',
      effects: [{ type: 'inject_prompt', value: 'test' }],
    }];

    expect(evaluateBehavioralRules(state, rules)).toHaveLength(0);
  });
});

describe('computeActiveDereWeights', () => {
  it('applies phase modifiers and normalizes to 100', () => {
    const weights: DereWeightEntry[] = [
      { dereType: 'deredere', baseWeight: 50, phaseModifiers: { stable: 10 } },
      { dereType: 'kuudere', baseWeight: 50, phaseModifiers: { stable: -10 } },
    ];
    const result = computeActiveDereWeights(weights, 'stable');
    expect(result['deredere']).toBe(60);
    expect(result['kuudere']).toBe(40);
    expect(result['deredere'] + result['kuudere']).toBe(100);
  });
});

describe('buildPsychologyPromptBlock', () => {
  it('produces non-empty prompt text', () => {
    const state = createInitialPsychologyState('thread-1', mockPersona);
    const block = buildPsychologyPromptBlock(state, mockPersona);
    expect(block).toContain('Relationship phase: honeymoon');
    expect(block).toContain('Current mask:');
    expect(block).toContain('Dere blend:');
  });
});
