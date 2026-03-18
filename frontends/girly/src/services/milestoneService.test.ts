import { describe, it, expect } from 'vitest';
import {
  computeRelationshipStats,
  checkMilestones,
  buildMilestonePromptBlock,
  DEFAULT_MILESTONES,
  type RelationshipStats,
} from './milestoneService.ts';
import { createInitialPsychologyState } from './psychologyEngineService.ts';
import { type PersonaProfile } from '../types/companion.ts';

const mockPersona: PersonaProfile = {
  id: 'test',
  name: 'Test',
  archetype: 'deredere',
  dereTypes: ['deredere'],
  tagline: '',
  shortBio: '',
  backstory: '',
  characterFacts: [],
  worldSetting: '',
  relationshipPremise: '',
  toneGuide: '',
  initiativeLevel: 5,
  affectionLevel: 5,
  flirtLevel: 5,
  memoryPriorities: [],
  generatedSystemPrompt: '',
  createdAt: 1,
  updatedAt: 1,
};

/**
 * Build a full RelationshipStats object from partial values.
 * Fields not provided default to 0 so tests can focus on the stat under test.
 */
function makeStats(partial: Partial<RelationshipStats>): RelationshipStats {
  return { affection: 0, trust: 0, intimacy: 0, compatibility: 0, ...partial };
}

// ── computeRelationshipStats ──────────────────────────────────────────────────

describe('computeRelationshipStats', () => {
  it('maps bond dimensions to stats correctly', () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 70, trust: 60, respect: 50, admiration: 40 };

    // intimacyLevel is a pass-through; use 0 so it does not affect bond assertions.
    const stats = computeRelationshipStats(state, 0);

    // affection = bonds.attachment
    expect(stats.affection).toBe(70);
    // trust = bonds.trust
    expect(stats.trust).toBe(60);
    // compatibility = average(bonds.respect, bonds.admiration) = (50+40)/2
    expect(stats.compatibility).toBe(45);
  });

  it('returns zeros for all bond-derived stats when psychState is null', () => {
    const stats = computeRelationshipStats(null, 0);

    expect(stats.affection).toBe(0);
    expect(stats.trust).toBe(0);
    expect(stats.compatibility).toBe(0);
  });

  it('passes intimacy level through even when psychState is null', () => {
    const stats = computeRelationshipStats(null, 42);

    expect(stats.intimacy).toBe(42);
  });

  it('handles maximum bond values correctly', () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 100, trust: 100, respect: 100, admiration: 100 };

    const stats = computeRelationshipStats(state, 100);

    expect(stats.affection).toBe(100);
    expect(stats.trust).toBe(100);
    expect(stats.compatibility).toBe(100);
  });

  it('compatibility is the average of respect and admiration, not a single value', () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 0, trust: 0, respect: 100, admiration: 0 };

    const stats = computeRelationshipStats(state, 0);

    // (100 + 0) / 2 = 50
    expect(stats.compatibility).toBe(50);
  });

  it('handles edge case where respect and admiration are both zero', () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 50, trust: 50, respect: 0, admiration: 0 };

    const stats = computeRelationshipStats(state, 0);

    expect(stats.compatibility).toBe(0);
  });

  it('clamps out-of-range intimacy level to 100', () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 50, trust: 50, respect: 50, admiration: 50 };

    const stats = computeRelationshipStats(state, 150);

    expect(stats.intimacy).toBe(100);
  });
});

// ── checkMilestones ───────────────────────────────────────────────────────────

describe('checkMilestones', () => {
  it('returns a milestone when a stat crosses its threshold', () => {
    // affection_20 threshold is 20; stat value of 25 should cross it.
    const stats = makeStats({ affection: 25 });

    const result = checkMilestones(stats, []);

    const ids = result.map((def) => def.id);
    expect(ids).toContain('affection_20');
  });

  it('does not return already-achieved milestones', () => {
    const stats = makeStats({ affection: 80 });
    // First call — collect everything that would fire.
    const first = checkMilestones(stats, []);
    const firstIds = first.map((def) => def.id);

    // Second call — pass all first-run IDs as already achieved.
    const second = checkMilestones(stats, firstIds);

    expect(second).toHaveLength(0);
  });

  it('returns empty array when no thresholds are crossed', () => {
    // All stats below the lowest threshold in DEFAULT_MILESTONES (affection_20 = 20).
    const stats = makeStats({ affection: 5, trust: 5, intimacy: 5, compatibility: 5 });

    const result = checkMilestones(stats, []);

    expect(result).toHaveLength(0);
  });

  it('returns multiple milestones at once when multiple thresholds are crossed simultaneously', () => {
    // Cross top-end thresholds for all four stat buckets.
    const stats = makeStats({ affection: 95, trust: 85, intimacy: 90, compatibility: 90 });

    const result = checkMilestones(stats, []);

    expect(result.length).toBeGreaterThan(1);
    const ids = result.map((def) => def.id);
    expect(ids).toContain('affection_90');
    expect(ids).toContain('trust_80');
    expect(ids).toContain('intimacy_85');
    expect(ids).toContain('compatibility_85');
  });

  it('only returns milestones not yet achieved when some are already done', () => {
    // affection 75 crosses affection_20, affection_45, and affection_70.
    const stats = makeStats({ affection: 75 });

    const result = checkMilestones(stats, ['affection_20', 'affection_45']);

    const ids = result.map((def) => def.id);
    expect(ids).not.toContain('affection_20');
    expect(ids).not.toContain('affection_45');
    expect(ids).toContain('affection_70');
  });

  it('returns empty array when all milestones are already achieved', () => {
    const stats = makeStats({ affection: 100, trust: 100, intimacy: 100, compatibility: 100 });
    const allIds = DEFAULT_MILESTONES.map((def) => def.id);

    const result = checkMilestones(stats, allIds);

    expect(result).toHaveLength(0);
  });

  it('treats a stat value equal to the threshold as crossed (inclusive boundary)', () => {
    // affection_20 has threshold 20; stat exactly at 20 must fire.
    const stats = makeStats({ affection: 20 });

    const result = checkMilestones(stats, []);
    const ids = result.map((def) => def.id);

    expect(ids).toContain('affection_20');
  });

  it('returns empty array when all stats are one point below every threshold', () => {
    // Lowest threshold is affection_20 = 20, so 19 should produce zero results.
    const stats = makeStats({ affection: 19, trust: 19, intimacy: 19, compatibility: 19 });

    const result = checkMilestones(stats, []);

    expect(result).toHaveLength(0);
  });
});

// ── buildMilestonePromptBlock ─────────────────────────────────────────────────

describe('buildMilestonePromptBlock', () => {
  it('returns empty string when there are no milestones', () => {
    expect(buildMilestonePromptBlock([])).toBe('');
  });

  it('returns behavioral instruction text when milestones are present', () => {
    const defs = DEFAULT_MILESTONES.filter((m) => m.id === 'affection_70');

    const block = buildMilestonePromptBlock(defs);

    expect(block.length).toBeGreaterThan(0);
    // The prompt header should contain the framing word 'milestone'.
    expect(block).toContain('milestone');
  });

  it('includes description text for every provided milestone definition', () => {
    const afDef = DEFAULT_MILESTONES.find((m) => m.id === 'affection_70')!;
    const trDef = DEFAULT_MILESTONES.find((m) => m.id === 'trust_80')!;

    const block = buildMilestonePromptBlock([afDef, trDef]);

    // Both description strings must appear in the output.
    expect(block).toContain(afDef.description);
    expect(block).toContain(trDef.description);
  });

  it('does not expose internal milestone IDs in the prompt block', () => {
    const milestone = DEFAULT_MILESTONES.find((m) => m.id === 'affection_20')!;

    const block = buildMilestonePromptBlock([milestone]);

    // Raw ID strings should not appear in the user-facing prompt text.
    expect(block).not.toContain('affection_20');
  });

  it('produces a multi-line block with a header framing the behavioral descriptions', () => {
    const milestone = DEFAULT_MILESTONES.find((m) => m.id === 'trust_25')!;

    const block = buildMilestonePromptBlock([milestone]);
    const lines = block.split('\n');

    // At minimum: one header line + one description line.
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0].length).toBeGreaterThan(0);
  });

  it('integrates with checkMilestones: returns non-empty block for crossed thresholds', () => {
    const stats = makeStats({ affection: 50, trust: 30 });
    const achieved = checkMilestones(stats, []);

    const block = buildMilestonePromptBlock(achieved);

    // Every achieved definition's description must appear in the block.
    for (const def of achieved) {
      expect(block).toContain(def.description);
    }
  });
});
