/**
 * viewerStore — Kokoro gesture → baked mocap clip dispatch (Phase C).
 *
 * Locks in the load-once / play-after / procedural-fallback contract:
 *   1st mapped gesture  → loadAnimation (normalized clip, retarget:true)
 *                         + trigger_gesture (procedural covers this turn)
 *   2nd mapped gesture  → playAnimation only (clip now in viewer library)
 *   unmapped gesture    → trigger_gesture only (e.g. tilt_head stays procedural)
 *   model reload        → clip cache cleared, next gesture re-loads
 *
 * Pattern 1 (store-direct) + a fake iframe capturing postMessage payloads.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useViewerStore } from '../stores/viewerStore';

type Posted = { type: string; [key: string]: unknown };

function makeIframe(): { iframe: HTMLIFrameElement; posted: Posted[] } {
  const posted: Posted[] = [];
  const iframe = {
    contentWindow: {
      postMessage: (msg: Posted) => {
        posted.push(msg);
      },
    },
  } as unknown as HTMLIFrameElement;
  return { iframe, posted };
}

describe('viewerStore Kokoro gesture clips', () => {
  let posted: Posted[];

  beforeEach(() => {
    vi.restoreAllMocks();
    const made = makeIframe();
    posted = made.posted;
    useViewerStore.setState({ mode: 'vrm', iframeRef: made.iframe });
    // Reset the module-level clip cache between tests via the public seam.
    useViewerStore.getState().dispatchLoadModel('/files/avatars/Test.vrm');
    posted.length = 0;
  });

  it('first mapped gesture loads the normalized clip AND falls back to procedural', () => {
    useViewerStore.getState().dispatchGesture('wave', 'smile', 1.0);

    const load = posted.find((m) => m.type === 'loadAnimation');
    expect(load).toBeDefined();
    expect(load?.payload).toMatchObject({
      url: '/files/animations/vrm-baked/waving.normalized.glb',
      name: 'waving',
      retarget: true,
    });
    // Procedural gesture still fires — the clip is not loaded yet this turn.
    expect(posted.some((m) => m.type === 'trigger_gesture')).toBe(true);
    expect(posted.some((m) => m.type === 'playAnimation')).toBe(false);
  });

  it('second occurrence plays the clip instead of the procedural gesture', () => {
    const store = useViewerStore.getState();
    store.dispatchGesture('wave', 'smile', 1.0);
    posted.length = 0;

    store.dispatchGesture('wave', 'smile', 1.0);
    const play = posted.find((m) => m.type === 'playAnimation');
    expect(play?.payload).toMatchObject({ name: 'waving', loop: false });
    expect(posted.some((m) => m.type === 'loadAnimation')).toBe(false);
    expect(posted.some((m) => m.type === 'trigger_gesture')).toBe(false);
  });

  it('unmapped gesture (tilt_head) stays purely procedural', () => {
    useViewerStore.getState().dispatchGesture('tilt_head', 'neutral', 0.8);

    expect(posted.some((m) => m.type === 'trigger_gesture')).toBe(true);
    expect(posted.some((m) => m.type === 'loadAnimation')).toBe(false);
    expect(posted.some((m) => m.type === 'playAnimation')).toBe(false);
  });

  it('each mapped gesture resolves to its own clip stem', () => {
    const store = useViewerStore.getState();
    const expected: Record<string, string> = {
      thinking: 'thinking',
      point: 'pointing',
      hands_clasped: 'hands_forward_gesture',
      heart: 'blow_a_kiss',
      small_nod: 'head_nod_yes',
    };
    for (const [gesture, clip] of Object.entries(expected)) {
      posted.length = 0;
      store.dispatchGesture(gesture, 'neutral', 1.0);
      const load = posted.find((m) => m.type === 'loadAnimation');
      expect(load?.payload, gesture).toMatchObject({ name: clip });
    }
  });

  it('model reload clears the clip cache so the next gesture re-loads', () => {
    const store = useViewerStore.getState();
    store.dispatchGesture('wave', 'smile', 1.0);
    store.dispatchLoadModel('/files/avatars/Another.vrm');
    posted.length = 0;

    store.dispatchGesture('wave', 'smile', 1.0);
    // Back to load + procedural (new viewer clip library is empty).
    expect(posted.some((m) => m.type === 'loadAnimation')).toBe(true);
    expect(posted.some((m) => m.type === 'trigger_gesture')).toBe(true);
  });
});
