/**
 * viewerStore — Stage 2a loadEnvironment dispatch.
 *
 * Locks the contract:
 *   - non-null url   → posts { type:'loadEnvironment', payload:{ url } } to the iframe
 *   - null url       → still posts type:'loadEnvironment' with payload.url === null
 *                      (the viewer treats a null url as "clear"); lastCommand.kind
 *                      flips to 'clearEnvironment'
 *   - Live2D mode    → no postMessage (environments are VRM-only)
 *
 * Pattern 1 (store-direct) + a fake iframe capturing postMessage payloads.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useViewerStore } from '../stores/viewerStore';

type Posted = { type: string; payload?: { url: string | null }; [key: string]: unknown };

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

describe('viewerStore loadEnvironment', () => {
  let posted: Posted[];

  beforeEach(() => {
    vi.restoreAllMocks();
    const made = makeIframe();
    posted = made.posted;
    useViewerStore.setState({ mode: 'vrm', iframeRef: made.iframe });
    posted.length = 0;
  });

  it('posts loadEnvironment with the url when given a room GLB', () => {
    useViewerStore.getState().dispatchLoadEnvironment('/files/environments/cafe.glb');

    const msg = posted.find((m) => m.type === 'loadEnvironment');
    expect(msg).toBeDefined();
    expect(msg?.payload).toMatchObject({ url: '/files/environments/cafe.glb' });
    expect(useViewerStore.getState().lastCommand?.kind).toBe('loadEnvironment');
  });

  it('clears the environment when url is null (lastCommand kind = clearEnvironment)', () => {
    useViewerStore.getState().dispatchLoadEnvironment(null);

    const msg = posted.find((m) => m.type === 'loadEnvironment');
    expect(msg).toBeDefined();
    expect(msg?.payload?.url).toBeNull();
    expect(useViewerStore.getState().lastCommand?.kind).toBe('clearEnvironment');
  });

  it('does not post in Live2D mode (environments are VRM-only)', () => {
    useViewerStore.setState({ mode: 'live2d' });
    useViewerStore.getState().dispatchLoadEnvironment('/files/environments/cafe.glb');

    expect(posted.some((m) => m.type === 'loadEnvironment')).toBe(false);
    // The command is still recorded for state-machine consistency.
    expect(useViewerStore.getState().lastCommand?.kind).toBe('loadEnvironment');
  });
});
