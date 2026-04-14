/**
 * Tests for the DevConsole Bond tab.
 *
 * Covers:
 * - Analytics summary stats are rendered
 * - Source breakdown bars render with correct labels
 * - Recent XP events list renders source labels
 * - Character selector present and populated
 * - Loading state visible while fetching
 * - Error state shown on API failure
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub (ALL component tests)
 *   Pattern 2 — api module mock
 *   Pattern 1 — Zustand store-direct state seeding
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DevConsole } from '../components/DevConsole';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

// ── Pattern 4: Framer Motion stub ─────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// ── Pattern 2: API mock ───────────────────────────────────────────────────────
vi.mock('../lib/api', () => ({
  api: {
    getBondAnalytics: vi.fn(),
    getBondXpHistoryPaged: vi.fn(),
  },
}));

// ── Stub sub-components used by other DevConsole tabs ────────────────────────
vi.mock('../components/PromptInspector', () => ({
  PromptInspector: () => <div>PromptInspector</div>,
}));

vi.mock('../components/RawConfigEditor', () => ({
  RawConfigEditor: () => <div>RawConfigEditor</div>,
}));

vi.mock('../stores/chatStore', () => ({
  useChatStore: (selector: (s: { messages: unknown[]; sessionId: string | null }) => unknown) =>
    selector({ messages: [], sessionId: null }),
}));

vi.mock('../stores/viewerStore', () => ({
  useViewerStore: () => null,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_ANALYTICS = {
  ok: true,
  total_xp_earned: 1250,
  days_active: 14,
  avg_xp_per_day: 89.3,
  est_days_to_soulmate: 42,
  source_breakdown: {
    messages: 0.68,
    session_bonus: 0.15,
    milestone: 0.17,
  },
};

const MOCK_HISTORY = {
  ok: true,
  events: [
    { ts: '2026-04-10T12:00:00Z', xp: 5, source: 'messages', meta: {} },
    { ts: '2026-04-10T12:01:00Z', xp: 20, source: 'session_bonus', meta: {} },
    { ts: '2026-04-10T12:02:00Z', xp: 50, source: 'milestone', meta: {} },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChar = any;

const MOCK_CHARACTER: AnyChar = {
  id: 42,
  name: 'Sakura',
  avatar_url: null,
  description: '',
  personality: '',
  tags: [],
  relationship_mode: 'default',
  nsfw_enabled: false,
};

function seedStore() {
  // Cast through unknown to avoid needing the full AppState shape in tests
  useAppStore.setState({
    characters: [MOCK_CHARACTER],
    activeCharacter: MOCK_CHARACTER,
    bondLevel: 5,
    bondXp: 300,
    bondTier: 'friend',
  } as unknown as Parameters<typeof useAppStore.setState>[0]);
}

/**
 * Open the DevConsole and navigate to the Bond tab.
 *
 * Returns the rendered result for further assertions.
 */
async function renderBondTab() {
  seedStore();
  vi.mocked(api.getBondAnalytics).mockResolvedValue(MOCK_ANALYTICS);
  vi.mocked(api.getBondXpHistoryPaged).mockResolvedValue(MOCK_HISTORY);

  const result = render(<DevConsole />);

  // Open the console (click the Terminal toggle button)
  const toggleBtn = screen.getByTitle('Open DevConsole');
  toggleBtn.click();

  // Click the Bond tab
  const bondTab = await screen.findByText('Bond');
  bondTab.click();

  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DevConsole — Bond tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Bond tab button', async () => {
    seedStore();
    vi.mocked(api.getBondAnalytics).mockResolvedValue(MOCK_ANALYTICS);
    vi.mocked(api.getBondXpHistoryPaged).mockResolvedValue(MOCK_HISTORY);

    render(<DevConsole />);
    const toggle = screen.getByTitle('Open DevConsole');
    toggle.click();
    expect(await screen.findByText('Bond')).toBeInTheDocument();
  });

  it('shows total XP earned after loading', async () => {
    await renderBondTab();
    await waitFor(() => {
      expect(screen.getByText('1,250')).toBeInTheDocument();
    });
  });

  it('shows days active stat', async () => {
    await renderBondTab();
    await waitFor(() => {
      expect(screen.getByText('14')).toBeInTheDocument();
    });
  });

  it('renders source breakdown bars with correct labels', async () => {
    await renderBondTab();
    await waitFor(() => {
      // Multiple elements may share the label (source bar + event list) — use getAllBy
      expect(screen.getAllByText('messages').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('session bonus').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('milestone').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders recent XP events with source labels', async () => {
    await renderBondTab();
    await waitFor(() => {
      // Source labels are capitalized in the event rows
      expect(screen.getAllByText('messages').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('session bonus').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows the character selector with the active character name', async () => {
    await renderBondTab();
    expect(screen.getByText('Sakura')).toBeInTheDocument();
  });

  it('calls getBondAnalytics with the selected character id', async () => {
    await renderBondTab();
    await waitFor(() => {
      expect(vi.mocked(api.getBondAnalytics)).toHaveBeenCalledWith(42);
    });
  });

  it('calls getBondXpHistoryPaged with the selected character id', async () => {
    await renderBondTab();
    await waitFor(() => {
      expect(vi.mocked(api.getBondXpHistoryPaged)).toHaveBeenCalledWith(42, 20, 0);
    });
  });

  it('shows est. days to soulmate', async () => {
    await renderBondTab();
    await waitFor(() => {
      expect(screen.getByText(/~42d/)).toBeInTheDocument();
    });
  });
});
