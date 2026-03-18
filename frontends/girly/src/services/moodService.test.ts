import { describe, it, expect } from 'vitest';
import { deriveCompanionMood, type CompanionMood } from './moodService.ts';
import { createInitialPsychologyState } from './psychologyEngineService.ts';
import { type PersonaProfile } from '../types/companion.ts';

/** Minimal persona required by createInitialPsychologyState. */
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

/** Convenience wrapper — tests care about the mood token, not the full info object. */
function mood(state: Parameters<typeof deriveCompanionMood>[0]): CompanionMood {
  return deriveCompanionMood(state).mood;
}

describe('deriveCompanionMood', () => {
  it("returns 'happy' when bond average is above 60 and threat average is below 20", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 70, respect: 70, admiration: 70, trust: 70 };
    state.threats = { status: 10, abandonment: 10, controlLoss: 10, rival: 10 };

    expect(mood(state)).toBe('happy');
  });

  it("returns 'content' when bond average is 40-60 and threats are below 20", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 50, respect: 50, admiration: 50, trust: 50 };
    state.threats = { status: 15, abandonment: 15, controlLoss: 15, rival: 15 };

    // threatAvg = 15 — below pensive threshold (20), bonds in content range
    expect(mood(state)).toBe('content');
  });

  it("returns 'content' at the lower bond boundary (avg 40) with low threats", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 40, respect: 40, admiration: 40, trust: 40 };
    state.threats = { status: 5, abandonment: 5, controlLoss: 5, rival: 5 };

    expect(mood(state)).toBe('content');
  });

  it("returns 'pensive' when emotional fatigue is above 40", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    // Moderate bonds with no threat so the fatigue rule is the dominant signal.
    state.bonds = { attachment: 30, respect: 30, admiration: 30, trust: 30 };
    state.threats = { status: 5, abandonment: 5, controlLoss: 5, rival: 5 };
    state.fatigue = { emotionalLabor: 50 };

    expect(mood(state)).toBe('pensive');
  });

  it("returns 'pensive' at fatigue of 41 (just above threshold)", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 30, respect: 30, admiration: 30, trust: 30 };
    state.threats = { status: 5, abandonment: 5, controlLoss: 5, rival: 5 };
    state.fatigue = { emotionalLabor: 41 };

    expect(mood(state)).toBe('pensive');
  });

  it("does not return 'pensive' for fatigue of exactly 40 (boundary is exclusive)", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 30, respect: 30, admiration: 30, trust: 30 };
    state.threats = { status: 5, abandonment: 5, controlLoss: 5, rival: 5 };
    state.fatigue = { emotionalLabor: 40 };

    // Should fall through to neutral (bonds avg ~30 < 40).
    expect(mood(state)).not.toBe('pensive');
  });

  it("returns 'uneasy' when threat average is at or above 40", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 20, respect: 20, admiration: 20, trust: 20 };
    state.threats = { status: 50, abandonment: 50, controlLoss: 50, rival: 50 };

    expect(mood(state)).toBe('uneasy');
  });

  it("returns 'uneasy' at the exact threat average boundary of 40", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 20, respect: 20, admiration: 20, trust: 20 };
    state.threats = { status: 40, abandonment: 40, controlLoss: 40, rival: 40 };

    expect(mood(state)).toBe('uneasy');
  });

  it("returns 'distant' when phase is 'detaching'", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.phase = 'detaching';
    state.bonds = { attachment: 25, respect: 25, admiration: 25, trust: 25 };
    state.threats = { status: 15, abandonment: 15, controlLoss: 15, rival: 15 };

    expect(mood(state)).toBe('distant');
  });

  it("returns 'distant' when phase is 'post_breakup'", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.phase = 'post_breakup';
    state.bonds = { attachment: 25, respect: 25, admiration: 25, trust: 25 };
    state.threats = { status: 15, abandonment: 15, controlLoss: 15, rival: 15 };

    expect(mood(state)).toBe('distant');
  });

  it("returns 'distant' when phase is 'strained' via uneasy → ... (no: strained is not directly distant)", () => {
    // The service maps 'strained' by not having a direct distant rule for it —
    // but 'strained' phases often carry elevated threats that produce 'uneasy'.
    // Test that strained with high threats resolves to uneasy (NOT distant).
    const state = createInitialPsychologyState('t1', mockPersona);
    state.phase = 'strained';
    state.bonds = { attachment: 25, respect: 25, admiration: 25, trust: 25 };
    state.threats = { status: 55, abandonment: 55, controlLoss: 55, rival: 55 };

    // Threat avg = 55 → uneasy wins before any phase check for 'strained'.
    expect(mood(state)).toBe('uneasy');
  });

  it("returns 'hurt' when flags.lied is true", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 30, respect: 30, admiration: 30, trust: 30 };
    state.threats = { status: 10, abandonment: 10, controlLoss: 10, rival: 10 };
    state.flags = { lied: true };

    expect(mood(state)).toBe('hurt');
  });

  it("returns 'hurt' when flags.boundaryViolation is true", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 30, respect: 30, admiration: 30, trust: 30 };
    state.threats = { status: 10, abandonment: 10, controlLoss: 10, rival: 10 };
    state.flags = { boundaryViolation: true };

    expect(mood(state)).toBe('hurt');
  });

  it("returns 'neutral' when psychState is null", () => {
    expect(mood(null)).toBe('neutral');
  });

  it("returns 'neutral' as default for moderate values with no strong signals", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    // Default bonds: attachment=20, respect=30, admiration=25, trust=25 → avg=25
    // Default threats: all 0 → avg=0
    // fatigue=0, no flags, phase=honeymoon
    // bondAvg 25 < 40, threatAvg 0 < 20 → falls to neutral
    expect(mood(state)).toBe('neutral');
  });

  it("returns 'neutral' when all dimensions are at zero", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 0, respect: 0, admiration: 0, trust: 0 };
    state.threats = { status: 0, abandonment: 0, controlLoss: 0, rival: 0 };
    state.fatigue = { emotionalLabor: 0 };
    state.flags = {};

    expect(mood(state)).toBe('neutral');
  });

  it("'hurt' flag takes precedence over high positive bond scores", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    // Bonds strong enough to earn 'happy', but lied flag should win.
    state.bonds = { attachment: 80, respect: 80, admiration: 80, trust: 80 };
    state.threats = { status: 5, abandonment: 5, controlLoss: 5, rival: 5 };
    state.flags = { lied: true };

    expect(mood(state)).toBe('hurt');
  });

  it("'distant' phase overrides threat signals for detaching phase", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.phase = 'detaching';
    // Even with threat avg >= 40 the phase check fires first.
    state.bonds = { attachment: 20, respect: 20, admiration: 20, trust: 20 };
    state.threats = { status: 50, abandonment: 50, controlLoss: 50, rival: 50 };

    expect(mood(state)).toBe('distant');
  });

  it("returns a full CompanionMoodInfo object with icon, colorClass, and label", () => {
    const state = createInitialPsychologyState('t1', mockPersona);
    state.bonds = { attachment: 70, respect: 70, admiration: 70, trust: 70 };
    state.threats = { status: 5, abandonment: 5, controlLoss: 5, rival: 5 };

    const info = deriveCompanionMood(state);

    expect(info.mood).toBe('happy');
    expect(typeof info.icon).toBe('string');
    expect(info.icon.length).toBeGreaterThan(0);
    expect(typeof info.colorClass).toBe('string');
    expect(typeof info.label).toBe('string');
  });
});
