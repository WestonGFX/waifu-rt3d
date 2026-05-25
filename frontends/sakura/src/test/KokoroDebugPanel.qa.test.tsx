/**
 * Tests for KokoroDebugPanel — ParseOkBadge / `qa` prop coverage.
 *
 * Verifies the four display states of the parse-ok rate badge:
 *   - qa absent / null        → no badge rendered
 *   - parse_ok_total === 0    → "Parse n/a" (muted)
 *   - rate ≥ 0.8              → "Parse ✓ NN%"  (green)
 *   - 0.5 ≤ rate < 0.8        → "Parse ⚠ NN%"  (yellow)
 *   - rate < 0.5              → "Parse ✗ NN%"  (red)
 *
 * Pattern 4 (framer-motion stub) is applied even though KokoroDebugPanel
 * currently contains no Framer Motion — this protects against future
 * regressions if motion is added and matches project convention.
 *
 * No store mocks are needed: KokoroDebugPanel is a pure presentational
 * component that imports only type definitions from ../lib/kokoro.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { KokoroPayload } from '../lib/kokoro';
import { KokoroDebugPanel } from '../components/KokoroDebugPanel';
import type { KokoroQaResponse } from '../components/KokoroDebugPanel';

// Pattern 4: framer-motion stub — required for ALL component tests.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
      <div {...props}>{children}</div>
    ),
    span: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLSpanElement>>) => (
      <span {...props}>{children}</span>
    ),
    button: ({ children, ...props }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
      <button {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a minimal valid KokoroPayload so the panel renders its full body
 * rather than the "waiting for first turn…" placeholder.
 */
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

/**
 * Builds a KokoroQaResponse with sensible defaults that can be overridden
 * per test.
 */
function makeQa(overrides: Partial<KokoroQaResponse> = {}): KokoroQaResponse {
  return {
    ok: true,
    boundary_count: 0,
    parse_ok_total: 100,
    parse_ok_count: 96,
    parse_ok_rate: 0.96,
    window_hours: 24,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('KokoroDebugPanel — qa / ParseOkBadge', () => {
  /**
   * test_qa_null_renders_no_badge
   *
   * When qa is null the {qa && <div>…</div>} guard at line 166 short-circuits,
   * so none of the four badge labels should appear.
   *
   * NOTE: The diagnostics line also contains lowercase "parse" (e.g. "parse=ok").
   * All four badge label regexes use a capital "P" and a space/symbol after
   * "Parse" to avoid colliding with that text.
   */
  it('test_qa_null_renders_no_badge — qa=null does not render a parse badge', () => {
    render(<KokoroDebugPanel payload={makePayload()} qa={null} />);

    // None of the four possible badge labels should be present.
    expect(screen.queryByText(/^Parse n\/a$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Parse ✓/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Parse ⚠/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Parse ✗/)).not.toBeInTheDocument();
  });

  /**
   * test_qa_no_data_renders_na
   *
   * parse_ok_total === 0 triggers the "no data" branch → label "Parse n/a".
   */
  it('test_qa_no_data_renders_na — parse_ok_total=0 shows "Parse n/a"', () => {
    const qa = makeQa({ parse_ok_total: 0, parse_ok_count: 0, parse_ok_rate: 0 });
    render(<KokoroDebugPanel payload={makePayload()} qa={qa} />);

    expect(screen.getByText('Parse n/a')).toBeInTheDocument();
  });

  /**
   * test_qa_high_rate_renders_green_check
   *
   * rate=0.96 → Math.round(0.96*100)=96 → "Parse ✓ 96%".
   */
  it('test_qa_high_rate_renders_green_check — rate=0.96 shows "Parse ✓ 96%"', () => {
    const qa = makeQa({ parse_ok_total: 100, parse_ok_count: 96, parse_ok_rate: 0.96 });
    render(<KokoroDebugPanel payload={makePayload()} qa={qa} />);

    expect(screen.getByText('Parse ✓ 96%')).toBeInTheDocument();
  });

  /**
   * test_qa_exact_80_threshold_is_green
   *
   * The condition is `>= 0.8` (inclusive), so 0.8 must map to green "✓".
   */
  it('test_qa_exact_80_threshold_is_green — rate=0.8 shows "Parse ✓ 80%"', () => {
    const qa = makeQa({ parse_ok_total: 10, parse_ok_count: 8, parse_ok_rate: 0.8 });
    render(<KokoroDebugPanel payload={makePayload()} qa={qa} />);

    expect(screen.getByText('Parse ✓ 80%')).toBeInTheDocument();
    expect(screen.queryByText(/Parse ⚠/)).not.toBeInTheDocument();
  });

  /**
   * test_qa_yellow_warning_zone
   *
   * 0.5 ≤ rate < 0.8 → yellow "⚠".  At 0.65, Math.round(65)=65.
   */
  it('test_qa_yellow_warning_zone — rate=0.65 shows "Parse ⚠ 65%"', () => {
    const qa = makeQa({ parse_ok_total: 20, parse_ok_count: 13, parse_ok_rate: 0.65 });
    render(<KokoroDebugPanel payload={makePayload()} qa={qa} />);

    expect(screen.getByText('Parse ⚠ 65%')).toBeInTheDocument();
  });

  /**
   * test_qa_red_below_50
   *
   * rate < 0.5 → red "✗".  At 0.3, Math.round(30)=30.
   */
  it('test_qa_red_below_50 — rate=0.3 shows "Parse ✗ 30%"', () => {
    const qa = makeQa({ parse_ok_total: 10, parse_ok_count: 3, parse_ok_rate: 0.3 });
    render(<KokoroDebugPanel payload={makePayload()} qa={qa} />);

    expect(screen.getByText('Parse ✗ 30%')).toBeInTheDocument();
  });

  /**
   * test_qa_rate_100_percent
   *
   * Perfect parse rate: 1.0 → Math.round(100)=100 → "Parse ✓ 100%".
   */
  it('test_qa_rate_100_percent — rate=1.0 shows "Parse ✓ 100%"', () => {
    const qa = makeQa({ parse_ok_total: 50, parse_ok_count: 50, parse_ok_rate: 1.0 });
    render(<KokoroDebugPanel payload={makePayload()} qa={qa} />);

    expect(screen.getByText('Parse ✓ 100%')).toBeInTheDocument();
  });

  /**
   * test_qa_rate_0_percent_shows_red
   *
   * parse_ok_total > 0 but parse_ok_count = 0, rate = 0 → falls through to
   * red branch (rate < 0.5).  Math.round(0)=0 → "Parse ✗ 0%".
   */
  it('test_qa_rate_0_percent_shows_red — parse_ok_count=0/total=5 shows "Parse ✗ 0%"', () => {
    const qa = makeQa({ parse_ok_total: 5, parse_ok_count: 0, parse_ok_rate: 0 });
    render(<KokoroDebugPanel payload={makePayload()} qa={qa} />);

    expect(screen.getByText('Parse ✗ 0%')).toBeInTheDocument();
  });
});
