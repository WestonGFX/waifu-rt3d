/**
 * Tests for MemoryBrowser component (full 4-tab + integration coverage).
 *
 * Covers the top-level overlay (open/close, tab switching, empty-character guard,
 * close button, tab reset on reopen), the Overview tab (stats rendering,
 * category breakdown, journal preview, error state), the Facts tab (empty state,
 * add form flow, create, delete, source badges, category grouping), the Memories
 * tab (list pagination, search mode, delete, promote, fetch error, empty state),
 * and the Journal tab (entries render, expand/collapse, empty state).
 *
 * Sessions: Overview + Facts coverage landed session 16. Memories + Journal +
 * integration coverage added session 17.
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub (ALL component tests)
 *   Pattern 2 — api module mock
 *   Pattern 1 — direct zustand store seeding via useAppStore.setState
 *   Memories tab uses raw fetch — stubbed per-test via vi.stubGlobal('fetch', ...).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryBrowser } from '../components/MemoryBrowser';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import type { UserFact } from '../lib/types';

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
    getMemoryOverview: vi.fn(),
    getUserFacts: vi.fn(),
    createUserFact: vi.fn(),
    deleteUserFact: vi.fn(),
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChar = any;

const MOCK_CHARACTER: AnyChar = {
  id: 42,
  name: 'Alana',
  system_prompt: '',
  avatar_url: null,
};

const OVERVIEW_FACTS: UserFact[] = [
  { id: 1, character_id: 42, category: 'identity',    fact_text: 'Named Chris',        source: 'manual', confidence: 1.0,  created_at: '2026-01-01' },
  { id: 2, character_id: 42, category: 'preferences', fact_text: 'Loves ramen',        source: 'auto',   confidence: 0.85, created_at: '2026-01-02' },
  { id: 3, character_id: 42, category: 'preferences', fact_text: 'Drinks black coffee', source: 'manual', confidence: 1.0,  created_at: '2026-01-03' },
  { id: 4, character_id: 42, category: 'history',     fact_text: 'Born in 1989',       source: 'auto',   confidence: 0.70, created_at: '2026-01-04' },
];

const OVERVIEW_JOURNAL = [
  { id: 10, session_id: 3, entry_text: 'Today we talked about favorite foods and he mentioned ramen again.', created_at: '2026-04-10T12:00:00Z' },
];

const OVERVIEW_RESPONSE = {
  ok: true as const,
  user_facts: OVERVIEW_FACTS,
  journal_entries: OVERVIEW_JOURNAL,
  profile: { communication_style: 'playful' },
  stats: {
    total_messages: 1234,
    total_facts: OVERVIEW_FACTS.length,
    total_journal_entries: OVERVIEW_JOURNAL.length,
    has_profile: true,
  },
};

/** Seed zustand store to the "memorybrowser overlay open" state. */
function openBrowser(charOverride?: AnyChar | null) {
  useAppStore.setState({
    activeOverlay: 'memorybrowser',
    activeCharacter: charOverride === null ? null : (charOverride ?? MOCK_CHARACTER),
    characters: [MOCK_CHARACTER],
  } as unknown as Parameters<typeof useAppStore.setState>[0]);
}

/** Seed zustand store to closed state. */
function closeBrowser() {
  useAppStore.setState({
    activeOverlay: null,
    activeCharacter: null,
    characters: [],
  } as unknown as Parameters<typeof useAppStore.setState>[0]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MemoryBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeBrowser();
    // Default Overview response — individual tests can override
    vi.mocked(api.getMemoryOverview).mockResolvedValue(OVERVIEW_RESPONSE);
    vi.mocked(api.getUserFacts).mockResolvedValue({ ok: true, facts: OVERVIEW_FACTS });
  });

  // ── Top-level overlay behavior ─────────────────────────────────────────────

  describe('top-level overlay', () => {
    it('does not render panel when activeOverlay is not memorybrowser', () => {
      render(<MemoryBrowser />);
      expect(screen.queryByText('Memory Browser')).not.toBeInTheDocument();
    });

    it('renders panel header when activeOverlay === "memorybrowser"', () => {
      openBrowser();
      render(<MemoryBrowser />);
      expect(screen.getByText('Memory Browser')).toBeInTheDocument();
    });

    it('renders all 4 tab buttons', () => {
      openBrowser();
      render(<MemoryBrowser />);
      expect(screen.getByRole('button', { name: /Overview/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /About You/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Memories/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Journal/ })).toBeInTheDocument();
    });

    it('shows "Select a character" when no active character', () => {
      openBrowser(null);
      render(<MemoryBrowser />);
      expect(screen.getByText(/Select a character to browse their memory/)).toBeInTheDocument();
    });

    it('starts on Overview tab by default', async () => {
      openBrowser();
      render(<MemoryBrowser />);
      // Overview fetch should fire — confirms Overview tab mounted
      await waitFor(() => expect(vi.mocked(api.getMemoryOverview)).toHaveBeenCalledWith(42));
    });
  });

  // ── Overview tab ───────────────────────────────────────────────────────────

  describe('Overview tab', () => {
    it('calls getMemoryOverview with active character id', async () => {
      openBrowser();
      render(<MemoryBrowser />);
      await waitFor(() => expect(vi.mocked(api.getMemoryOverview)).toHaveBeenCalledWith(42));
    });

    it('renders stat card values from response', async () => {
      openBrowser();
      render(<MemoryBrowser />);
      await waitFor(() => {
        expect(screen.getByText('1,234')).toBeInTheDocument(); // messages
        expect(screen.getByText('4')).toBeInTheDocument();      // facts count
      });
      expect(screen.getByText('Messages exchanged')).toBeInTheDocument();
      expect(screen.getByText('Facts learned')).toBeInTheDocument();
      expect(screen.getByText('Journal entries')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument(); // has_profile
    });

    it('renders character name in heading', async () => {
      openBrowser();
      render(<MemoryBrowser />);
      await waitFor(() => expect(screen.getByText("Alana's Memory")).toBeInTheDocument());
    });

    it('renders category breakdown bars when facts present', async () => {
      openBrowser();
      render(<MemoryBrowser />);
      await waitFor(() => expect(screen.getByText('Knowledge by category')).toBeInTheDocument());
      // 3 categories represented in fixture: identity, preferences, history
      expect(screen.getByText('Identity')).toBeInTheDocument();
      expect(screen.getByText('Preferences')).toBeInTheDocument();
      expect(screen.getByText('History')).toBeInTheDocument();
    });

    it('renders latest journal preview when entries present', async () => {
      openBrowser();
      render(<MemoryBrowser />);
      await waitFor(() => {
        expect(screen.getByText('Latest journal entry')).toBeInTheDocument();
        expect(screen.getByText(/favorite foods/)).toBeInTheDocument();
      });
    });

    it('shows "Building..." when has_profile is false', async () => {
      vi.mocked(api.getMemoryOverview).mockResolvedValueOnce({
        ...OVERVIEW_RESPONSE,
        stats: { ...OVERVIEW_RESPONSE.stats, has_profile: false },
      });
      openBrowser();
      render(<MemoryBrowser />);
      await waitFor(() => expect(screen.getByText('Building...')).toBeInTheDocument());
    });

    it('shows fallback message on fetch error', async () => {
      vi.mocked(api.getMemoryOverview).mockRejectedValueOnce(new Error('500'));
      openBrowser();
      render(<MemoryBrowser />);
      await waitFor(() =>
        expect(screen.getByText(/Could not load memory overview/)).toBeInTheDocument()
      );
    });
  });

  // ── Facts tab ──────────────────────────────────────────────────────────────

  describe('Facts (About You) tab', () => {
    async function switchToFactsTab() {
      openBrowser();
      render(<MemoryBrowser />);
      // Wait for initial Overview fetch to settle so subsequent tab mount is clean
      await waitFor(() => expect(vi.mocked(api.getMemoryOverview)).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: /About You/ }));
      await waitFor(() => expect(vi.mocked(api.getUserFacts)).toHaveBeenCalledWith(42));
    }

    it('calls getUserFacts when Facts tab is activated', async () => {
      await switchToFactsTab();
    });

    it('renders facts grouped by category', async () => {
      await switchToFactsTab();
      await waitFor(() => {
        expect(screen.getByText('Named Chris')).toBeInTheDocument();
        expect(screen.getByText('Loves ramen')).toBeInTheDocument();
        expect(screen.getByText('Drinks black coffee')).toBeInTheDocument();
        expect(screen.getByText('Born in 1989')).toBeInTheDocument();
      });
    });

    it('renders fact count in subheading', async () => {
      await switchToFactsTab();
      await waitFor(() =>
        expect(screen.getByText(`${OVERVIEW_FACTS.length} facts learned`)).toBeInTheDocument()
      );
    });

    it('renders empty state when no facts', async () => {
      vi.mocked(api.getUserFacts).mockResolvedValueOnce({ ok: true, facts: [] });
      await switchToFactsTab();
      await waitFor(() => expect(screen.getByText('No facts yet.')).toBeInTheDocument());
    });

    it('shows "you" badge for manual facts and "AI" badge for auto facts', async () => {
      await switchToFactsTab();
      await waitFor(() => expect(screen.getByText('Named Chris')).toBeInTheDocument());
      // Two manual + two auto in fixture — badge texts appear once per row
      const manualBadges = screen.getAllByText('you');
      const aiBadges = screen.getAllByText(/^AI \d+%$/);
      expect(manualBadges.length).toBe(2);
      expect(aiBadges.length).toBe(2);
      expect(screen.getByText('AI 85%')).toBeInTheDocument();
      expect(screen.getByText('AI 70%')).toBeInTheDocument();
    });

    it('toggles the Add form open on Add button click', async () => {
      await switchToFactsTab();
      await waitFor(() => expect(screen.getByText('Named Chris')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /Add/i }));
      expect(screen.getByPlaceholderText(/Enter a fact about yourself/)).toBeInTheDocument();
    });

    it('calls createUserFact and prepends the returned fact on submit', async () => {
      const newFact: UserFact = {
        id: 99, character_id: 42, category: 'general',
        fact_text: 'Favourite season is autumn', source: 'manual', confidence: 1.0,
        created_at: '2026-04-20',
      };
      vi.mocked(api.createUserFact).mockResolvedValueOnce({ ok: true, fact: newFact });

      await switchToFactsTab();
      await waitFor(() => expect(screen.getByText('Named Chris')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: /Add/i }));

      const input = screen.getByPlaceholderText(/Enter a fact about yourself/) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Favourite season is autumn' } });

      // Form's inline submit button also reads "Add" — grab the last one (the one inside the form)
      const addButtons = screen.getAllByRole('button', { name: 'Add' });
      const submitBtn = addButtons[addButtons.length - 1];
      fireEvent.click(submitBtn);

      await waitFor(() =>
        expect(vi.mocked(api.createUserFact)).toHaveBeenCalledWith(42, 'general', 'Favourite season is autumn')
      );
      await waitFor(() =>
        expect(screen.getByText('Favourite season is autumn')).toBeInTheDocument()
      );
    });

    it('calls deleteUserFact and removes the fact from the list', async () => {
      vi.mocked(api.deleteUserFact).mockResolvedValueOnce({ ok: true, deleted: 1 });
      await switchToFactsTab();
      await waitFor(() => expect(screen.getByText('Named Chris')).toBeInTheDocument());

      // Hover-reveal buttons are opacity-only, still in DOM — find delete button by title
      const deleteButtons = screen.getAllByTitle('Delete this fact');
      // First row is first in fixture (id=1, "Named Chris" under Identity)
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => expect(vi.mocked(api.deleteUserFact)).toHaveBeenCalledWith(42, 1));
      await waitFor(() =>
        expect(screen.queryByText('Named Chris')).not.toBeInTheDocument()
      );
    });
  });

  // ── Memories tab ───────────────────────────────────────────────────────────
  //
  // The Memories tab uses raw `fetch()` calls against /api/v2/memory/* (NOT the
  // typed `api` client). Each test stubs `global.fetch` with a router that
  // dispatches by URL + method. When session 18 unifies these calls into the
  // `api` client, these tests should be migrated to Pattern 2 (api mocks).

  describe('Memories tab', () => {
    /** Build a fetch stub that routes by URL substring + method. */
    function makeFetchStub(handlers: {
      list?: (url: string) => unknown;
      search?: (url: string) => unknown;
      delete?: (id: string) => unknown;
      promote?: (id: string) => unknown;
    }) {
      return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method ?? 'GET').toUpperCase();
        let payload: unknown = { ok: true };
        let ok = true;

        if (url.includes('/api/v2/memory/list')) {
          payload = handlers.list ? handlers.list(url) : { memories: [], total: 0 };
        } else if (url.includes('/api/v2/memory/search')) {
          payload = handlers.search ? handlers.search(url) : { results: [] };
        } else if (method === 'DELETE' && url.match(/\/api\/v2\/memory\/[^/]+$/)) {
          const idMatch = url.match(/\/api\/v2\/memory\/([^/?]+)$/);
          payload = handlers.delete ? handlers.delete(idMatch?.[1] ?? '') : { ok: true };
        } else if (method === 'PATCH' && url.includes('/promote')) {
          const idMatch = url.match(/\/api\/v2\/memory\/([^/]+)\/promote$/);
          payload = handlers.promote ? handlers.promote(idMatch?.[1] ?? '') : { ok: true };
        } else {
          ok = false;
        }

        return new Response(JSON.stringify(payload), {
          status: ok ? 200 : 404,
          headers: { 'Content-Type': 'application/json' },
        });
      });
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /** Switch to the Memories tab and wait for first list fetch to settle. */
    async function switchToMemoriesTab(fetchStub: ReturnType<typeof vi.fn>) {
      vi.stubGlobal('fetch', fetchStub);
      openBrowser();
      render(<MemoryBrowser />);
      await waitFor(() => expect(vi.mocked(api.getMemoryOverview)).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: /Memories/ }));
      await waitFor(() =>
        expect(fetchStub.mock.calls.some(([u]) =>
          String(u).includes('/api/v2/memory/list')
        )).toBe(true)
      );
    }

    const SAMPLE_MEMORIES = [
      { id: 'm1', text: 'User loves ramen and discusses it often.', role: 'user', tier: 1, created_at: '2026-04-10' },
      { id: 'm2', text: 'User mentioned working in Tokyo.',         role: 'knowledge', tier: 2, created_at: '2026-04-11' },
      { id: 'm3', text: 'Permanent memory: birthday is April 5.',    role: 'knowledge', tier: 3, created_at: '2026-04-12' },
    ];

    it('fetches /api/v2/memory/list with char_id when activated', async () => {
      const stub = makeFetchStub({
        list: () => ({ memories: SAMPLE_MEMORIES, total: SAMPLE_MEMORIES.length }),
      });
      await switchToMemoriesTab(stub);
      const listCall = stub.mock.calls.find(([u]) => String(u).includes('/api/v2/memory/list'));
      expect(listCall).toBeDefined();
      expect(String(listCall![0])).toContain('char_id=42');
      expect(String(listCall![0])).toContain('page=0');
    });

    it('renders memory text and role/tier badges', async () => {
      const stub = makeFetchStub({
        list: () => ({ memories: SAMPLE_MEMORIES, total: 3 }),
      });
      await switchToMemoriesTab(stub);
      await waitFor(() => {
        expect(screen.getByText(/User loves ramen/)).toBeInTheDocument();
        expect(screen.getByText(/Working in Tokyo/i)).toBeInTheDocument();
      });
      // Tier labels render (T1 Fleeting, T2 Recent, T3 Permanent)
      expect(screen.getByText(/T1 Fleeting/)).toBeInTheDocument();
      expect(screen.getByText(/T2 Recent/)).toBeInTheDocument();
      expect(screen.getByText(/T3 Permanent/)).toBeInTheDocument();
    });

    it('renders empty state when list returns no memories', async () => {
      const stub = makeFetchStub({ list: () => ({ memories: [], total: 0 }) });
      await switchToMemoriesTab(stub);
      await waitFor(() =>
        expect(screen.getByText('No memories stored yet.')).toBeInTheDocument()
      );
    });

    it('renders error message when list fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v2/memory/list')) {
          return new Response('boom', { status: 500 });
        }
        return new Response('{}', { status: 200 });
      }));
      openBrowser();
      render(<MemoryBrowser />);
      await waitFor(() => expect(vi.mocked(api.getMemoryOverview)).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: /Memories/ }));
      await waitFor(() =>
        expect(screen.getByText(/Failed to load: 500/)).toBeInTheDocument()
      );
    });

    it('switches to search mode and calls /api/v2/memory/search on Go click', async () => {
      const stub = makeFetchStub({
        list: () => ({ memories: SAMPLE_MEMORIES, total: 3 }),
        search: () => ({ results: [SAMPLE_MEMORIES[0]] }),
      });
      await switchToMemoriesTab(stub);
      await waitFor(() => expect(screen.getByText(/User loves ramen/)).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText(/Semantic search/), {
        target: { value: 'ramen' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Go$/ }));

      await waitFor(() => {
        const searchCall = stub.mock.calls.find(([u]) => String(u).includes('/api/v2/memory/search'));
        expect(searchCall).toBeDefined();
        expect(String(searchCall![0])).toContain('query=ramen');
      });
      // Search-mode footer shows result count + clear button
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Clear search/ })).toBeInTheDocument()
      );
    });

    it('calls DELETE /api/v2/memory/{id} when delete button clicked', async () => {
      const stub = makeFetchStub({
        list: () => ({ memories: SAMPLE_MEMORIES, total: 3 }),
        delete: () => ({ ok: true }),
      });
      await switchToMemoriesTab(stub);
      await waitFor(() => expect(screen.getByText(/User loves ramen/)).toBeInTheDocument());

      const deleteBtns = screen.getAllByTitle('Delete memory');
      fireEvent.click(deleteBtns[0]);

      await waitFor(() => {
        const deleteCall = stub.mock.calls.find(([u, init]) =>
          String(u).match(/\/api\/v2\/memory\/m1$/) && (init as RequestInit | undefined)?.method === 'DELETE'
        );
        expect(deleteCall).toBeDefined();
      });
    });

    it('calls PATCH /api/v2/memory/{id}/promote for tier-1/2 memories only', async () => {
      const stub = makeFetchStub({
        list: () => ({ memories: SAMPLE_MEMORIES, total: 3 }),
        promote: () => ({ ok: true }),
      });
      await switchToMemoriesTab(stub);
      await waitFor(() => expect(screen.getByText(/User loves ramen/)).toBeInTheDocument());

      // Promote button title is "Promote to Permanent" — only rendered for tier < 3
      const promoteBtns = screen.getAllByTitle('Promote to Permanent');
      // 2 of 3 fixture memories are tier 1 + tier 2 → 2 promote buttons expected
      expect(promoteBtns.length).toBe(2);

      fireEvent.click(promoteBtns[0]);
      await waitFor(() => {
        const promoteCall = stub.mock.calls.find(([u, init]) =>
          String(u).includes('/promote') && (init as RequestInit | undefined)?.method === 'PATCH'
        );
        expect(promoteCall).toBeDefined();
      });
    });

    it('renders pagination controls when total exceeds page size', async () => {
      const stub = makeFetchStub({
        list: () => ({ memories: SAMPLE_MEMORIES, total: 30 }), // 30 items, PAGE_SIZE=12 → 3 pages
      });
      await switchToMemoriesTab(stub);
      await waitFor(() => expect(screen.getByText(/Page 1 \/ 3 \(30 memories\)/)).toBeInTheDocument());
    });
  });

  // ── Journal tab ────────────────────────────────────────────────────────────

  describe('Journal tab', () => {
    /** Switch to the Journal tab; reuses the file-level api.getMemoryOverview mock. */
    async function switchToJournalTab() {
      openBrowser();
      render(<MemoryBrowser />);
      await waitFor(() => expect(vi.mocked(api.getMemoryOverview)).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: /Journal/ }));
    }

    it('renders journal entry text from getMemoryOverview', async () => {
      await switchToJournalTab();
      await waitFor(() =>
        // entry preview shows up (first 120 chars — fixture entry is short, so full text)
        expect(screen.getByText(/favorite foods and he mentioned ramen/)).toBeInTheDocument()
      );
    });

    it('renders entry count in heading', async () => {
      await switchToJournalTab();
      await waitFor(() =>
        // 1 entry → singular "entry written"
        expect(screen.getByText(/1 entry written/)).toBeInTheDocument()
      );
    });

    it('shows empty state when no journal entries exist', async () => {
      // Override response to have empty journal_entries on BOTH calls (Overview + Journal)
      vi.mocked(api.getMemoryOverview).mockResolvedValue({
        ...OVERVIEW_RESPONSE,
        journal_entries: [],
        stats: { ...OVERVIEW_RESPONSE.stats, total_journal_entries: 0 },
      });
      await switchToJournalTab();
      await waitFor(() =>
        expect(screen.getByText('No journal entries yet.')).toBeInTheDocument()
      );
    });

    it('expands long entries when card clicked, collapses on second click', async () => {
      // Long entry > 120 chars → expandable
      const longText =
        'Today we had a deep conversation about life, dreams, the weight of choices, ' +
        'and the small things that bring joy. He admitted he had been feeling tired ' +
        'lately, and we decided to plan a small ramen night for the weekend.';
      vi.mocked(api.getMemoryOverview).mockResolvedValue({
        ...OVERVIEW_RESPONSE,
        journal_entries: [{ id: 99, session_id: 7, entry_text: longText, created_at: '2026-04-15T12:00:00Z' }],
        stats: { ...OVERVIEW_RESPONSE.stats, total_journal_entries: 1 },
      });
      await switchToJournalTab();
      await waitFor(() => expect(screen.getByText(/read more/i)).toBeInTheDocument());

      // Click the card — full text now visible
      fireEvent.click(screen.getByText(/read more/i).closest('div')!);
      await waitFor(() => expect(screen.getByText(/plan a small ramen night/)).toBeInTheDocument());
      // "read more" indicator gone after expand
      expect(screen.queryByText(/read more/i)).not.toBeInTheDocument();
    });

    it('renders session number for each entry', async () => {
      await switchToJournalTab();
      await waitFor(() => expect(screen.getByText(/Session #3/)).toBeInTheDocument());
    });
  });

  // ── Top-level integration ──────────────────────────────────────────────────

  describe('top-level integration', () => {
    it('clicking close button calls closeOverlay and unmounts panel', async () => {
      openBrowser();
      const { rerender } = render(<MemoryBrowser />);
      expect(screen.getByText('Memory Browser')).toBeInTheDocument();

      // The X close button is the only standalone icon-button in the header — find by parent
      const closeButton = screen
        .getByText('Memory Browser')
        .closest('div')!
        .parentElement!
        .querySelector('button')!;
      fireEvent.click(closeButton);

      // Store should have cleared activeOverlay
      expect(useAppStore.getState().activeOverlay).toBeNull();
      // Re-render to flush AnimatePresence
      rerender(<MemoryBrowser />);
      await waitFor(() => expect(screen.queryByText('Memory Browser')).not.toBeInTheDocument());
    });

    it('preserves selected tab while overlay stays open', async () => {
      openBrowser();
      render(<MemoryBrowser />);
      await waitFor(() => expect(vi.mocked(api.getMemoryOverview)).toHaveBeenCalledTimes(1));

      // Switch to Facts — Overview should not refetch
      fireEvent.click(screen.getByRole('button', { name: /About You/ }));
      await waitFor(() => expect(vi.mocked(api.getUserFacts)).toHaveBeenCalled());
      expect(vi.mocked(api.getMemoryOverview)).toHaveBeenCalledTimes(1);
    });

    it('resets to Overview tab when overlay is closed and reopened', async () => {
      openBrowser();
      render(<MemoryBrowser />);
      await waitFor(() => expect(vi.mocked(api.getMemoryOverview)).toHaveBeenCalledTimes(1));

      // Switch to Facts tab
      fireEvent.click(screen.getByRole('button', { name: /About You/ }));
      await waitFor(() => expect(vi.mocked(api.getUserFacts)).toHaveBeenCalled());

      // Close, flush, then reopen — separate act() blocks ensure the
      // `open` boolean genuinely transitions true→false→true, firing the
      // reset effect. A single batched setState pair would skip the
      // intermediate render and the effect's dep would not re-fire.
      await act(async () => {
        useAppStore.setState({ activeOverlay: null } as unknown as Parameters<typeof useAppStore.setState>[0]);
      });
      await waitFor(() => expect(screen.queryByText('Memory Browser')).not.toBeInTheDocument());

      await act(async () => {
        useAppStore.setState({ activeOverlay: 'memorybrowser' } as unknown as Parameters<typeof useAppStore.setState>[0]);
      });

      // Overview should refetch (tab reset effect fires on `open` -> true)
      await waitFor(() => expect(vi.mocked(api.getMemoryOverview)).toHaveBeenCalledTimes(2));
    });
  });
});
