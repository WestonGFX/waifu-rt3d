import { describe, it, expect } from 'vitest';
import {
  evaluateIntimacyShift,
  detectPhysicalActions,
  updatePhysicalState,
} from './intimacyTrackingService.ts';
import { DEFAULT_INTIMACY_STATE, DEFAULT_PHYSICAL_STATE } from '../types/content.ts';

describe('evaluateIntimacyShift', () => {
  it('increases intimacy on flirty signals', () => {
    const result = evaluateIntimacyShift(
      DEFAULT_INTIMACY_STATE,
      'You look so cute today!',
      '*blushes* Thank you, that means a lot!',
      'explicit',
    );
    expect(result.level).toBeGreaterThan(0);
    expect(result.trend).toBe('rising');
  });

  it('decreases intimacy on cooling signals', () => {
    const state = { ...DEFAULT_INTIMACY_STATE, level: 40 };
    const result = evaluateIntimacyShift(
      state,
      "Stop, I don't want this. We're just friends.",
      'I understand, I respect your boundaries.',
      'explicit',
    );
    expect(result.level).toBeLessThan(40);
    expect(result.trend).toBe('cooling');
  });

  it('decays naturally when no signals present', () => {
    const state = { ...DEFAULT_INTIMACY_STATE, level: 20 };
    const result = evaluateIntimacyShift(
      state,
      'What is the weather like today?',
      'It looks sunny and warm outside!',
      'explicit',
    );
    expect(result.level).toBeLessThan(20);
  });

  it('respects the ceiling cap', () => {
    const state = { ...DEFAULT_INTIMACY_STATE, level: 28 };
    const result = evaluateIntimacyShift(
      state,
      'I love you so much, you beautiful person',
      '*kisses your cheek* I love you too darling',
      'general',
    );
    expect(result.level).toBeLessThanOrEqual(30);
  });

  it('caps intimacy at 30 during detaching phase', () => {
    const state = { ...DEFAULT_INTIMACY_STATE, level: 28 };
    const result = evaluateIntimacyShift(
      state,
      'I love you so much, you beautiful darling sweetheart',
      '*kisses you passionately* I love you too my love',
      'explicit',
      'detaching',
    );
    expect(result.level).toBeLessThanOrEqual(30);
  });

  it('caps intimacy at 30 during post_breakup phase', () => {
    const state = { ...DEFAULT_INTIMACY_STATE, level: 25 };
    const result = evaluateIntimacyShift(
      state,
      'I miss you, you gorgeous person, I love you',
      '*blushes* I miss you too, my heart beats for you',
      'explicit',
      'post_breakup',
    );
    expect(result.level).toBeLessThanOrEqual(30);
  });

  it('does not cap during honeymoon phase', () => {
    const state = { ...DEFAULT_INTIMACY_STATE, level: 28 };
    const result = evaluateIntimacyShift(
      state,
      'I love you so much, you beautiful darling',
      '*kisses* I love you too sweetheart',
      'explicit',
      'honeymoon',
    );
    expect(result.level).toBeGreaterThan(28);
  });

  it('increments lastUpdateTurn', () => {
    const result = evaluateIntimacyShift(
      { ...DEFAULT_INTIMACY_STATE, lastUpdateTurn: 5 },
      'Hello',
      'Hi!',
      'general',
    );
    expect(result.lastUpdateTurn).toBe(6);
  });
});

describe('detectPhysicalActions', () => {
  it('detects *action* markers', () => {
    const actions = detectPhysicalActions('She smiles. *leans closer and whispers* Something private.');
    expect(actions).toContain('leans closer and whispers');
  });

  it('returns empty array when no actions found', () => {
    expect(detectPhysicalActions('Just a normal sentence.')).toEqual([]);
  });

  it('ignores very short actions', () => {
    expect(detectPhysicalActions('*hi*')).toEqual([]);
  });
});

describe('updatePhysicalState', () => {
  it('tracks recent actions from both messages', () => {
    const result = updatePhysicalState(
      DEFAULT_PHYSICAL_STATE,
      '*takes her hand gently*',
      '*squeezes back softly*',
    );
    expect(result.recentActions.length).toBeGreaterThan(0);
  });

  it('keeps only last 5 actions', () => {
    const state = {
      ...DEFAULT_PHYSICAL_STATE,
      recentActions: ['a1', 'a2', 'a3', 'a4', 'a5'],
    };
    const result = updatePhysicalState(
      state,
      '*new action one*',
      '*new action two*',
    );
    expect(result.recentActions.length).toBeLessThanOrEqual(5);
  });
});
