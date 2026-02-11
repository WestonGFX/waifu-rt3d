import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VoiceVisualizer } from './VoiceVisualizer';

function installMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
    addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)
  } as unknown as MediaQueryList;

  vi.stubGlobal('matchMedia', vi.fn(() => media));
}

describe('VoiceVisualizer', () => {
  beforeEach(() => {
    installMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('falls back to bars when reduced motion is preferred', async () => {
    installMatchMedia(true);

    render(<VoiceVisualizer level={0.25} source="mic" />);

    const fallback = await screen.findByLabelText('Voice activity fallback bars');
    expect(fallback).toBeInTheDocument();
  });

  it('falls back to bars when canvas context is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);

    const { container } = render(<VoiceVisualizer level={0.42} source="tts" />);

    await waitFor(() => expect(container.querySelectorAll('.v2-visualizer-bars')).toHaveLength(1));

    expect(container.querySelector('.v2-visualizer-shell')?.getAttribute('data-source')).toBe('tts');
  });
});
