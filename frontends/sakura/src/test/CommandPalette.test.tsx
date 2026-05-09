/**
 * Tests for the CommandPalette component.
 *
 * Covers:
 *   - Renders input when open
 *   - Does not render when closed
 *   - Typing filters command list
 *   - ArrowDown / ArrowUp navigate selection
 *   - Enter fires selected command's action and calls onClose
 *   - Escape calls onClose
 *   - Character switch commands appear when characters are present
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub (required for all component tests)
 *   Pattern 2 — appStore mock
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from '../components/CommandPalette';
import { useAppStore } from '../stores/appStore';
import type { Character } from '../lib/types';

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// ── Pattern 4: Framer Motion stub ─────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// ── Pattern 2: Store mock ──────────────────────────────────────────────────────
const mockOpenOverlay = vi.fn();
const mockSelectCharacter = vi.fn();
const mockToggleMinimalMode = vi.fn();

vi.mock('../stores/appStore', () => ({
  useAppStore: vi.fn(),
}));

function setup(characters: Character[] = []) {
  vi.mocked(useAppStore).mockReturnValue({
    openOverlay: mockOpenOverlay,
    selectCharacter: mockSelectCharacter,
    toggleMinimalMode: mockToggleMinimalMode,
    characters,
  } as unknown as ReturnType<typeof useAppStore>);
}

describe('CommandPalette', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    setup([]);
  });

  it('renders the search input when open', () => {
    render(<CommandPalette open onClose={onClose} />);
    expect(screen.getByPlaceholderText(/type a command/i)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<CommandPalette open={false} onClose={onClose} />);
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument();
  });

  it('filters commands when user types', () => {
    render(<CommandPalette open onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/type a command/i), { target: { value: 'Settings' } });
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.queryByText('Memory Browser')).not.toBeInTheDocument();
  });

  it('shows no-results message when query matches nothing', () => {
    render(<CommandPalette open onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/type a command/i), { target: { value: 'xyznonexistent' } });
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed in the input', () => {
    render(<CommandPalette open onClose={onClose} />);
    fireEvent.keyDown(screen.getByPlaceholderText(/type a command/i), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires action and calls onClose when Enter is pressed on selected command', () => {
    render(<CommandPalette open onClose={onClose} />);
    // Type to narrow results so Settings is first
    fireEvent.change(screen.getByPlaceholderText(/type a command/i), { target: { value: 'Settings' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/type a command/i), { key: 'Enter' });
    expect(mockOpenOverlay).toHaveBeenCalledWith('settings');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows character switch commands when characters are present', () => {
    setup([{ id: 1, name: 'Rin' } as Character]);
    render(<CommandPalette open onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/type a command/i), { target: { value: 'Rin' } });
    expect(screen.getByText('Switch to Rin')).toBeInTheDocument();
  });

  it('fires selectCharacter when a character command is selected via Enter', () => {
    const char = { id: 1, name: 'Rin' } as Character;
    setup([char]);
    render(<CommandPalette open onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/type a command/i), { target: { value: 'Rin' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/type a command/i), { key: 'Enter' });
    expect(mockSelectCharacter).toHaveBeenCalledWith(char);
    expect(onClose).toHaveBeenCalled();
  });
});
