/**
 * Tests for LLMProbeAside + useLLMProbe.
 *
 * Covers:
 *   - Hidden while probe loading
 *   - Hidden when warning === null
 *   - Renders character-voiced copy for each warning code
 *   - Dismiss button hides aside + persists across remount via localStorage
 *   - Re-arms when model changes (different storage key)
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub
 *   Pattern 2 — api module mock
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LLMProbeAside } from '../components/LLMProbeAside';
import { copyForWarning, __resetLLMProbeCacheForTests } from '../hooks/useLLMProbe';
import { api } from '../lib/api';

// ── Pattern 4: framer-motion stub ─────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div {...p}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// ── Pattern 2: api module mock ────────────────────────────────────────────────
vi.mock('../lib/api', () => ({
  api: {
    llmProbe: vi.fn(),
  },
}));

beforeEach(() => {
  __resetLLMProbeCacheForTests();
  localStorage.clear();
  vi.mocked(api.llmProbe).mockReset();
  cleanup();
});

function mockProbe(warning: string | null, model = 'llama-3.2-1b-instruct') {
  vi.mocked(api.llmProbe).mockResolvedValue({
    ok: true,
    model,
    endpoint: 'http://localhost:1234/v1',
    latency_ms: 120,
    content_received: warning === null,
    reasoning_only: warning === 'reasoning_only',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    warning: warning as any,
    hint: warning ? `clinical hint for ${warning}` : null,
  });
}

describe('LLMProbeAside', () => {
  it('renders nothing while probe is loading', () => {
    vi.mocked(api.llmProbe).mockReturnValue(new Promise(() => { /* never resolves */ }));
    render(<LLMProbeAside />);
    expect(screen.queryByTestId('llm-probe-aside')).toBeNull();
  });

  it('renders nothing when probe returns no warning', async () => {
    mockProbe(null);
    render(<LLMProbeAside />);
    await waitFor(() => expect(vi.mocked(api.llmProbe)).toHaveBeenCalled());
    expect(screen.queryByTestId('llm-probe-aside')).toBeNull();
  });

  it('renders character-voiced copy for reasoning_only', async () => {
    mockProbe('reasoning_only');
    render(<LLMProbeAside />);
    const aside = await screen.findByTestId('llm-probe-aside');
    expect(aside.textContent).toContain('thinks out loud');
  });

  it('renders character-voiced copy for slow_first_token', async () => {
    mockProbe('slow_first_token');
    render(<LLMProbeAside />);
    const aside = await screen.findByTestId('llm-probe-aside');
    expect(aside.textContent).toContain('Replies might come slower');
  });

  it('renders character-voiced copy for endpoint_unreachable', async () => {
    mockProbe('endpoint_unreachable');
    render(<LLMProbeAside />);
    const aside = await screen.findByTestId('llm-probe-aside');
    expect(aside.textContent).toContain("can't quite reach the model server");
  });

  it('dismiss button hides the aside and persists via localStorage', async () => {
    mockProbe('slow_first_token');
    const { unmount } = render(<LLMProbeAside />);
    await screen.findByTestId('llm-probe-aside');

    fireEvent.click(screen.getByTestId('llm-probe-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('llm-probe-aside')).toBeNull());

    // localStorage now records the dismissal for this warning+model.
    const stored = Object.keys(localStorage).find((k) =>
      k.includes('slow_first_token') && k.includes('llama-3.2-1b-instruct'),
    );
    expect(stored).toBeDefined();

    // Remount: the session cache + localStorage flag combine to keep it hidden.
    unmount();
    render(<LLMProbeAside />);
    await waitFor(() => {
      expect(screen.queryByTestId('llm-probe-aside')).toBeNull();
    });
  });

  it('re-arms when the model name changes (per-model dismissal)', async () => {
    // Dismiss for model A.
    mockProbe('reasoning_only', 'qwen3-9b');
    render(<LLMProbeAside />);
    await screen.findByTestId('llm-probe-aside');
    fireEvent.click(screen.getByTestId('llm-probe-dismiss'));
    cleanup();

    // Reset module cache so a NEW probe runs returning a different model.
    __resetLLMProbeCacheForTests();
    mockProbe('reasoning_only', 'r1-llama-distill');
    render(<LLMProbeAside />);
    // Different model → no dismissal yet → aside re-appears.
    const aside = await screen.findByTestId('llm-probe-aside');
    expect(aside.textContent).toContain('thinks out loud');
  });
});

describe('copyForWarning', () => {
  it('returns distinct copy for each warning code', () => {
    const codes = [
      'reasoning_only',
      'slow_first_token',
      'endpoint_unreachable',
      'endpoint_error',
      'probe_failed',
    ] as const;
    const texts = codes.map((c) => copyForWarning(c));
    expect(new Set(texts).size).toBe(codes.length);
    // All start with an italic action cue in asterisks (session-46 baseline).
    for (const t of texts) {
      expect(t.startsWith('*')).toBe(true);
    }
  });
});
