/**
 * Tests for KokoroDebugPanel — Bundle D debug state tabs.
 *
 * Verifies the four-tab inspector (Mood / Memory / Relationship / Safety)
 * added by Bundle D.  The panel now fetches its own psychology snapshot via
 * api.getKokoroDebugState using charId/sessionId from chatStore.
 *
 * Testing conventions followed:
 *   Pattern 2 — Store + API Mock: mock the api module, stub chatStore
 *   Pattern 4 — framer-motion stub (required for all component tests)
 *
 * The component does NOT use framer-motion but Pattern 4 is applied
 * pre-emptively per project convention (testing-conventions.md).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { KokoroPayload } from '../lib/kokoro';
import type { KokoroDebugState } from '../lib/api';

// ---------------------------------------------------------------------------
// Pattern 4: framer-motion stub — required for ALL component tests
// ---------------------------------------------------------------------------
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
// Pattern 2: API mock — hoisted before component import
// ---------------------------------------------------------------------------
const mockGetKokoroDebugState = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    getKokoroDebugState: (...args: unknown[]) => mockGetKokoroDebugState(...args),
  },
}));

// ---------------------------------------------------------------------------
// chatStore mock — provides charId / sessionId
// ---------------------------------------------------------------------------
type ChatStoreSlice = { charId: number | null; sessionId: number | null };
let _mockCharId: number | null = 1;
let _mockSessionId: number | null = 5;

vi.mock('../stores/chatStore', () => ({
  useChatStore: (selector: (s: ChatStoreSlice) => unknown) =>
    selector({ charId: _mockCharId, sessionId: _mockSessionId }),
}));

// ---------------------------------------------------------------------------
// Component import — static, after all vi.mock() calls
// ---------------------------------------------------------------------------
import { KokoroDebugPanel } from '../components/KokoroDebugPanel';
import type { KokoroQaResponse } from '../components/KokoroDebugPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid KokoroPayload so the panel renders its full body. */
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

/** Minimal KokoroDebugState returned by the mocked API. */
function makeDebugState(overrides: Partial<KokoroDebugState> = {}): KokoroDebugState {
  return {
    ok: true,
    char_id: 1,
    session_id: 5,
    mind_dials: { mood: 0.7, energy: 0.8, curiosity: 0.6 },
    traits: { warmth: 0.7, openness: 0.6, dominance: 0.4, mischief: 0.5, melancholy_tendency: 0.3 },
    parse_ok_rate: 0.9,
    parse_ok_total: 20,
    relationship_block: '[Relationship State with User]\nBond: Close Friend (Level 45/100)',
    rituals_block: '[SHARED RITUALS WITH THE USER]\n- (recurring) late-night coding',
    retrieved_memories: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('KokoroDebugPanel — Bundle D debug state tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: charId=1, sessionId=5
    _mockCharId = 1;
    _mockSessionId = 5;
    // Default: API resolves with a populated debug state
    mockGetKokoroDebugState.mockResolvedValue(makeDebugState());
  });

  // ------------------------------------------------------------------
  // 1. Waiting state when payload is null
  // ------------------------------------------------------------------

  it('shows "waiting" placeholder when payload is null', () => {
    // When charId is null, the panel renders null-payload path cleanly.
    _mockCharId = null;
    render(<KokoroDebugPanel payload={null} />);
    expect(screen.getByText(/waiting for first turn/i)).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // 2. Tab bar renders all four tabs
  // ------------------------------------------------------------------

  it('renders all four tab buttons', async () => {
    render(<KokoroDebugPanel payload={makePayload()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^mood$/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^memory$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^relationship$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^safety$/i })).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // 3. Default tab is Mood — shows Tier A/B dials
  // ------------------------------------------------------------------

  it('default active tab is Mood and shows Tier A section', async () => {
    render(<KokoroDebugPanel payload={makePayload()} />);
    await waitFor(() => expect(screen.getByText(/Tier A/)).toBeInTheDocument());
    expect(screen.getByText(/Tier B/)).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // 4. Mood tab shows parse diagnostics line
  // ------------------------------------------------------------------

  it('Mood tab shows parse diagnostics', () => {
    render(<KokoroDebugPanel payload={makePayload()} />);
    expect(screen.getByText(/parse=ok/)).toBeInTheDocument();
    expect(screen.getByText(/bond=10/)).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // 5. Switching to Relationship tab shows relationship block text
  // ------------------------------------------------------------------

  it('Relationship tab shows relationship block text when debug state loaded', async () => {
    render(<KokoroDebugPanel payload={makePayload()} />);
    // Wait for the async fetch to complete
    await waitFor(() => expect(mockGetKokoroDebugState).toHaveBeenCalledOnce());

    const relTab = screen.getByRole('button', { name: /^relationship$/i });
    act(() => { fireEvent.click(relTab); });

    await waitFor(() => {
      expect(screen.getByText(/Close Friend/)).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // 6. Relationship tab shows rituals block
  // ------------------------------------------------------------------

  it('Relationship tab shows rituals block text', async () => {
    render(<KokoroDebugPanel payload={makePayload()} />);
    await waitFor(() => expect(mockGetKokoroDebugState).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: /^relationship$/i }));

    await waitFor(() => {
      expect(screen.getByText(/late-night coding/)).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // 7. Relationship tab shows empty-state message when no bond data
  // ------------------------------------------------------------------

  it('Relationship tab shows empty-state when relationship_block is empty', async () => {
    mockGetKokoroDebugState.mockResolvedValue(
      makeDebugState({ relationship_block: '', rituals_block: '' }),
    );
    render(<KokoroDebugPanel payload={makePayload()} />);
    await waitFor(() => expect(mockGetKokoroDebugState).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: /^relationship$/i }));

    await waitFor(() => {
      expect(screen.getByText(/No bond data/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/No established rituals/i)).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // 8. Memory tab renders search input
  // ------------------------------------------------------------------

  it('Memory tab renders a query input and Search button', async () => {
    render(<KokoroDebugPanel payload={makePayload()} />);
    // Wait for loading to settle so the button shows "Search" not "…"
    await waitFor(() => expect(mockGetKokoroDebugState).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: /^memory$/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/what does she remember/i)).toBeInTheDocument();
    });
    // Button should show "Search" (not loading spinner "…") after fetch completes
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Search/ })).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // 9. Memory tab shows empty-state when no query
  // ------------------------------------------------------------------

  it('Memory tab shows "Type a query" message when no query entered', async () => {
    render(<KokoroDebugPanel payload={makePayload()} />);
    fireEvent.click(screen.getByRole('button', { name: /^memory$/i }));
    expect(screen.getByText(/Type a query above/i)).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // 10. Memory search triggers API call with query
  // ------------------------------------------------------------------

  it('Memory Search button calls api.getKokoroDebugState with the query', async () => {
    render(<KokoroDebugPanel payload={makePayload()} />);
    // Wait for initial fetch to complete so loading=false and button shows "Search"
    await waitFor(() => expect(mockGetKokoroDebugState).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: /^memory$/i }));

    const input = await screen.findByPlaceholderText(/what does she remember/i);
    fireEvent.change(input, { target: { value: 'ramen' } });

    // Find the Search button (loading is false after initial fetch)
    const searchBtn = await screen.findByRole('button', { name: /Search/ });
    fireEvent.click(searchBtn);

    await waitFor(() => {
      // API was called with the query string — check the most recent call
      const calls = mockGetKokoroDebugState.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall).toContain('ramen');
    });
  });

  // ------------------------------------------------------------------
  // 11. Memory search results render
  // ------------------------------------------------------------------

  it('Memory tab shows retrieved memory text after search', async () => {
    mockGetKokoroDebugState.mockResolvedValue(
      makeDebugState({
        retrieved_memories: [
          {
            id: '7',
            text: 'My favourite food is ramen',
            role: 'user',
            tier: 1,
            salience: 0.9,
            dist: 0.05,
            status: 'active',
            privacy_level: 'normal',
            created_at: '2026-05-01T12:00:00',
          },
        ],
      }),
    );
    render(<KokoroDebugPanel payload={makePayload()} />);
    await waitFor(() => expect(mockGetKokoroDebugState).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: /^memory$/i }));

    await waitFor(() => {
      expect(screen.getByText(/My favourite food is ramen/)).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // 12. Safety tab shows parse diagnostics and boundary info
  // ------------------------------------------------------------------

  it('Safety tab shows parse diagnostics fields and boundary count', async () => {
    const qaData: KokoroQaResponse = {
      ok: true,
      boundary_count: 3,
      parse_ok_total: 15,
      parse_ok_count: 12,
      parse_ok_rate: 0.8,
      window_hours: 48,
    };
    render(<KokoroDebugPanel payload={makePayload()} qa={qaData} />);
    await waitFor(() => expect(mockGetKokoroDebugState).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: /^safety$/i }));

    // Safety tab shows boundary count from the qa prop
    await waitFor(() => {
      expect(screen.getByText(/boundary events: 3/)).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // 13. API not called when charId is null
  // ------------------------------------------------------------------

  it('does not call api when charId is null', () => {
    _mockCharId = null;
    render(<KokoroDebugPanel payload={makePayload()} />);

    // No fetch should happen when charId is missing.
    expect(mockGetKokoroDebugState).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 14. ParseOkBadge still renders on Mood tab via qa prop
  // ------------------------------------------------------------------

  it('ParseOkBadge renders on Mood tab when qa prop is provided', async () => {
    const qaData: KokoroQaResponse = {
      ok: true,
      boundary_count: 0,
      parse_ok_total: 50,
      parse_ok_count: 45,
      parse_ok_rate: 0.9,
      window_hours: 48,
    };
    render(<KokoroDebugPanel payload={makePayload()} qa={qaData} />);

    // Default tab is Mood — badge should appear.
    await waitFor(() => {
      expect(screen.getByText(/Parse ✓ 90%/)).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // 15. API error — panel still renders (graceful degradation)
  // ------------------------------------------------------------------

  it('renders gracefully when api.getKokoroDebugState rejects', async () => {
    mockGetKokoroDebugState.mockRejectedValue(new Error('network error'));
    render(<KokoroDebugPanel payload={makePayload()} />);

    // Panel should still render without crashing.
    await waitFor(() => {
      expect(screen.getByText(/Kokoro · debug/i)).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // 16. Existing prop contract: dialValues flows into Mood tab dials
  // ------------------------------------------------------------------

  it('dialValues prop still flows into DialRow values on Mood tab', async () => {
    render(
      <KokoroDebugPanel
        payload={makePayload({ stateDelta: { mood: 0.04 } })}
        dialValues={{ mood: 0.62, curiosity: 0.81 }}
      />,
    );

    // Mood tab is default — dial values should appear.
    await waitFor(() => {
      expect(screen.getByText('0.62')).toBeInTheDocument();
    });
    expect(screen.getByText('0.81')).toBeInTheDocument();
  });
});
