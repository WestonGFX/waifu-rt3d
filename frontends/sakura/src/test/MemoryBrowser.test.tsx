/**
 * Tests for MemoryBrowser component (Session 16 coverage — Overview + Facts tabs).
 *
 * Covers the top-level overlay (open/close, tab switching, empty-character guard),
 * the Overview tab (stats rendering, category breakdown, journal preview, error state),
 * and the Facts tab (empty state, add form flow, create, delete, source badges,
 * category grouping).
 *
 * Memories + Journal tabs are covered in session 17 (require additional fetch stubs).
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub (ALL component tests)
 *   Pattern 2 — api module mock
 *   Pattern 1 — direct zustand store seeding via useAppStore.setState
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
});
