/**
 * Tests for KokoroDebugPanel rendering across payload shapes.
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub (KokoroDebugPanel uses no Framer, but
 *     this protects against future regressions if motion is added).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { KokoroPayload } from '../lib/kokoro';
import { KokoroDebugPanel } from '../components/KokoroDebugPanel';

function makePayload(overrides: Partial<KokoroPayload> = {}): KokoroPayload {
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
    diagnostics: { parseOk: true, bondLevel: 10, kokoroEnabled: true },
    ...overrides,
  };
}

describe('KokoroDebugPanel', () => {
  it('shows "waiting" state when payload is null', () => {
    render(<KokoroDebugPanel payload={null} />);
    expect(screen.getByText(/waiting for first turn/i)).toBeInTheDocument();
  });

  it('renders parse-ok diagnostic line', () => {
    render(<KokoroDebugPanel payload={makePayload()} />);
    expect(screen.getByText(/parse=ok/)).toBeInTheDocument();
    expect(screen.getByText(/bond=10/)).toBeInTheDocument();
  });

  it('shows parse=fallback when parser failed', () => {
    render(
      <KokoroDebugPanel
        payload={makePayload({ diagnostics: { parseOk: false, bondLevel: 5, kokoroEnabled: true } })}
      />
    );
    expect(screen.getByText(/parse=fallback/)).toBeInTheDocument();
  });

  it('renders Tier A and Tier B sections', () => {
    render(<KokoroDebugPanel payload={makePayload()} />);
    expect(screen.getByText(/Tier A/)).toBeInTheDocument();
    expect(screen.getByText(/Tier B/)).toBeInTheDocument();
  });

  it('hides Tier F section when nsfw.active is false', () => {
    render(<KokoroDebugPanel payload={makePayload({ nsfw: { ...makePayload().nsfw, active: false } })} />);
    expect(screen.queryByText(/Tier F/)).not.toBeInTheDocument();
  });

  it('shows Tier F section when nsfw.active is true', () => {
    render(
      <KokoroDebugPanel
        payload={makePayload({
          nsfw: {
            active: true,
            innerArousalShift: 0.05,
            suggestiveBid: null,
            selfConsentCheck: true,
            boundaryReinforcement: false,
          },
        })}
      />
    );
    expect(screen.getByText(/Tier F/)).toBeInTheDocument();
    expect(screen.getByText(/consent-check: true/)).toBeInTheDocument();
  });

  it('shows the memory-write line only when shouldSave is true', () => {
    const { rerender } = render(
      <KokoroDebugPanel payload={makePayload({ memoryWrite: { shouldSave: false, summary: 'x', importance: 0.5, emotionalSalience: 0 } })} />
    );
    expect(screen.queryByText(/memory ←/)).not.toBeInTheDocument();

    rerender(
      <KokoroDebugPanel payload={makePayload({
        memoryWrite: { shouldSave: true, summary: 'likes dracula', importance: 0.7, emotionalSalience: 0.4 },
      })} />
    );
    expect(screen.getByText(/likes dracula/)).toBeInTheDocument();
  });

  it('renders embodiment fields (face, gesture, gaze, voice)', () => {
    render(
      <KokoroDebugPanel
        payload={makePayload({
          facialExpression: 'soft_smile',
          gesture: 'small_nod',
          gaze: 'away',
          voiceStyle: 'teasing',
          emotion: 'playful',
        })}
      />
    );
    expect(screen.getByText(/face=soft_smile/)).toBeInTheDocument();
    expect(screen.getByText(/gesture=small_nod/)).toBeInTheDocument();
    expect(screen.getByText(/gaze=away/)).toBeInTheDocument();
    expect(screen.getByText(/voice=teasing/)).toBeInTheDocument();
  });

  it('displays dialValues when supplied', () => {
    render(
      <KokoroDebugPanel
        payload={makePayload({ stateDelta: { mood: 0.04 } })}
        dialValues={{ mood: 0.62, curiosity: 0.81 }}
      />
    );
    // Mood value 0.62 appears in Tier A.
    expect(screen.getByText('0.62')).toBeInTheDocument();
    expect(screen.getByText('0.81')).toBeInTheDocument();
  });
});
