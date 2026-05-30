/**
 * Tests for Kokoro gaze → VRM LookAt wiring.
 *
 * Covers:
 *   1. The pure mapping `kokoroGazeToLookAt` (no store, no DOM).
 *   2. `viewerStore.dispatchGaze` command emission (store-direct, Pattern 1).
 *   3. `dispatchKokoroEmbodiment` forwarding `payload.gaze` to `dispatchGaze`.
 *
 * Follows testing-conventions.md Pattern 1 (store-direct). No avatar assets or
 * browser are required — we assert on the dispatched `lastCommand`, not on any
 * rendered result.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useViewerStore } from '../stores/viewerStore';
import {
  kokoroGazeToLookAt,
  KOKORO_GAZE_TO_LOOKAT,
  type KokoroGaze,
  type KokoroPayload,
} from '../lib/kokoro';

const ALL_GAZES: KokoroGaze[] = ['user', 'away', 'thinking', 'object', 'camera'];

function payload(overrides: Partial<KokoroPayload> = {}): KokoroPayload {
  return {
    reply: 'hi',
    innerThought: '',
    emotion: 'neutral',
    facialExpression: 'neutral',
    gesture: 'idle',
    gaze: 'user',
    voiceStyle: 'calm',
    voiceParams: {},
    memoryWrite: { shouldSave: false, summary: '', importance: 0, emotionalSalience: 0 },
    stateDelta: {},
    nsfw: {
      active: false,
      innerArousalShift: null,
      suggestiveBid: null,
      selfConsentCheck: false,
      boundaryReinforcement: false,
    },
    diagnostics: { parseOk: true, bondLevel: 5, kokoroEnabled: true },
    ...overrides,
  };
}

describe('kokoroGazeToLookAt (pure mapping)', () => {
  it('maps every valid gaze to a defined instruction', () => {
    for (const gaze of ALL_GAZES) {
      expect(kokoroGazeToLookAt(gaze)).toEqual(KOKORO_GAZE_TO_LOOKAT[gaze]);
    }
  });

  it("'user' returns to cursor-follow (preserves procedural idle motion)", () => {
    expect(kokoroGazeToLookAt('user')).toEqual({ mode: 'cursor' });
  });

  it('non-cursor gazes produce a world-space target', () => {
    for (const gaze of ALL_GAZES.filter((g) => g !== 'user')) {
      const r = kokoroGazeToLookAt(gaze);
      expect('target' in r).toBe(true);
      if ('target' in r) {
        expect(typeof r.target.x).toBe('number');
        expect(typeof r.target.y).toBe('number');
        expect(typeof r.target.z).toBe('number');
      }
    }
  });

  it("'thinking' looks up and to the side", () => {
    const r = kokoroGazeToLookAt('thinking');
    expect('target' in r).toBe(true);
    if ('target' in r) {
      expect(r.target.y).toBeGreaterThan(1.3); // above eye level
      expect(r.target.x).toBeLessThan(0); // to one side
    }
  });

  it("'away' glances aside and slightly down", () => {
    const r = kokoroGazeToLookAt('away');
    expect('target' in r).toBe(true);
    if ('target' in r) {
      expect(Math.abs(r.target.x)).toBeGreaterThan(0); // off-axis
      expect(r.target.y).toBeLessThan(1.3); // a touch downward
    }
  });

  it('unknown gaze defaults to cursor-follow (never freezes the gaze)', () => {
    // Force a value outside the enum to simulate a malformed/extended payload.
    expect(kokoroGazeToLookAt('elsewhere' as KokoroGaze)).toEqual({ mode: 'cursor' });
  });
});

describe('viewerStore.dispatchGaze', () => {
  beforeEach(() => {
    useViewerStore.setState({ mode: 'vrm', lastCommand: null });
  });

  it("emits a 'gaze' command carrying the gaze token + mapping", () => {
    useViewerStore.getState().dispatchGaze('thinking');
    const cmd = useViewerStore.getState().lastCommand;
    expect(cmd?.kind).toBe('gaze');
    expect(cmd?.payload.gaze).toBe('thinking');
    // Mapping is spread onto the command payload.
    const mapped = KOKORO_GAZE_TO_LOOKAT.thinking;
    expect('target' in mapped).toBe(true);
    if ('target' in mapped) expect(cmd?.payload.target).toEqual(mapped.target);
  });

  it("'user' command carries cursor mode, not a target", () => {
    useViewerStore.getState().dispatchGaze('user');
    const cmd = useViewerStore.getState().lastCommand;
    expect(cmd?.kind).toBe('gaze');
    expect(cmd?.payload.mode).toBe('cursor');
    expect(cmd?.payload.target).toBeUndefined();
  });

  it('bumps the _seq counter so subscribers always see a fresh reference', () => {
    const before = useViewerStore.getState()._seq;
    useViewerStore.getState().dispatchGaze('away');
    expect(useViewerStore.getState()._seq).toBe(before + 1);
  });
});

describe('dispatchKokoroEmbodiment → gaze forwarding', () => {
  let gazeSpy: ReturnType<typeof vi.fn>;
  let originalGaze: ReturnType<typeof useViewerStore.getState>['dispatchGaze'];

  beforeEach(() => {
    const state = useViewerStore.getState();
    originalGaze = state.dispatchGaze;
    gazeSpy = vi.fn();
    useViewerStore.setState({ dispatchGaze: gazeSpy as unknown as typeof originalGaze });
  });

  afterEach(() => {
    useViewerStore.setState({ dispatchGaze: originalGaze });
  });

  it('forwards payload.gaze to dispatchGaze when the gate is open', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(payload({ gaze: 'away' }));
    expect(gazeSpy).toHaveBeenCalledWith('away');
  });

  it('does not steer gaze when kokoroEnabled is false', () => {
    useViewerStore.getState().dispatchKokoroEmbodiment(
      payload({ gaze: 'thinking', diagnostics: { parseOk: true, bondLevel: 5, kokoroEnabled: false } }),
    );
    expect(gazeSpy).not.toHaveBeenCalled();
  });
});

describe('viewerStore.dispatchSetEyeGaze', () => {
  beforeEach(() => {
    useViewerStore.setState({ mode: 'vrm', lastCommand: null });
  });

  it('emits a setEyeGaze command carrying the enabled flag', () => {
    useViewerStore.getState().dispatchSetEyeGaze(false);
    const cmd = useViewerStore.getState().lastCommand;
    expect(cmd?.kind).toBe('setEyeGaze');
    expect(cmd?.payload.enabled).toBe(false);
  });

  it('round-trips enable=true', () => {
    useViewerStore.getState().dispatchSetEyeGaze(true);
    expect(useViewerStore.getState().lastCommand?.payload.enabled).toBe(true);
  });

  it('bumps _seq so subscribers re-fire', () => {
    const before = useViewerStore.getState()._seq;
    useViewerStore.getState().dispatchSetEyeGaze(true);
    expect(useViewerStore.getState()._seq).toBe(before + 1);
  });
});

describe('viewerStore.dispatchListeningState', () => {
  beforeEach(() => {
    useViewerStore.setState({ mode: 'vrm', lastCommand: null });
  });

  it('emits a listeningState command with the active flag', () => {
    useViewerStore.getState().dispatchListeningState(true);
    const cmd = useViewerStore.getState().lastCommand;
    expect(cmd?.kind).toBe('listeningState');
    expect(cmd?.payload.active).toBe(true);
  });

  it('round-trips release (active=false)', () => {
    useViewerStore.getState().dispatchListeningState(false);
    expect(useViewerStore.getState().lastCommand?.payload.active).toBe(false);
  });

  it('bumps _seq', () => {
    const before = useViewerStore.getState()._seq;
    useViewerStore.getState().dispatchListeningState(true);
    expect(useViewerStore.getState()._seq).toBe(before + 1);
  });
});
