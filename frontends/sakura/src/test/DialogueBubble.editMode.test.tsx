/**
 * Tests for DialogueBubble edit-mode UI.
 *
 * NOTE: The hover-gated edit toolbar (pencil button) was removed in the
 * "no hover popups" refactor. The editing textarea logic remains in the
 * component but has no UI entry point yet. Once a replacement trigger is
 * added (e.g. double-click, context menu), re-add the interaction tests.
 *
 * Current coverage:
 *   - (edited) badge rendering and attributes
 *   - No-edit-button assertions (pencil never appears without hover entry point)
 *
 * Follows testing-conventions.md — Pattern 4 (framer-motion stub required).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DialogueBubble } from '../components/DialogueBubble';
import type { ChatMessage } from '../lib/types';

// ── Pattern 4: Framer Motion stub ─────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...p}>{children}</div>,
    span: ({ children, ...p }: React.HTMLAttributes<HTMLSpanElement> & { children?: React.ReactNode }) =>
      <span {...p}>{children}</span>,
    button: ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) =>
      <button {...p}>{children}</button>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

vi.mock('../lib/api', () => ({
  api: {
    getMessageBranches: vi.fn().mockResolvedValue({ branches: [], active_index: 0, total: 1 }),
    listExpressionPortraits: vi.fn().mockResolvedValue({ ok: true, portraits: {} }),
    pinMessage: vi.fn().mockResolvedValue({ ok: true }),
    editMessage: vi.fn(),
  },
}));

vi.mock('../stores/appStore', () => ({
  useAppStore: (selector: (s: { thinkingIndicatorMode: 'skeleton' | 'stages' }) => unknown) =>
    selector({ thinkingIndicatorMode: 'skeleton' }),
}));

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'test-msg-1',
    role: 'user',
    text: 'Hello world',
    createdAt: 1_700_000_000_000,
    status: 'sent',
    ...overrides,
  };
}

describe('DialogueBubble — edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Edit button never appears (hover toolbar was removed) ──────────────────

  it('does not show Edit button for user messages (hover toolbar removed)', () => {
    render(<DialogueBubble message={makeMsg({ role: 'user', status: 'sent' })} onEdit={vi.fn()} />);
    expect(screen.queryByTitle('Edit')).toBeNull();
  });

  it('does not show Edit button for assistant messages (hover toolbar removed)', () => {
    render(<DialogueBubble message={makeMsg({ role: 'assistant', status: 'sent' })} onEdit={vi.fn()} />);
    expect(screen.queryByTitle('Edit message')).toBeNull();
  });

  it('no edit button without onEdit prop either', () => {
    render(<DialogueBubble message={makeMsg({ role: 'user', status: 'sent' })} />);
    expect(screen.queryByTitle('Edit')).toBeNull();
  });

  // ── (edited) badge ─────────────────────────────────────────────────────────

  it('renders (edited) badge when editedAt is set on an assistant message', () => {
    render(
      <DialogueBubble
        message={makeMsg({ role: 'assistant', status: 'sent', text: 'I said something', editedAt: 1_234_567_890 })}
      />,
    );
    expect(screen.getByText('(edited)')).toBeTruthy();
  });

  it('does NOT render (edited) badge when editedAt is absent', () => {
    render(<DialogueBubble message={makeMsg({ role: 'assistant', status: 'sent', text: 'Never edited' })} />);
    expect(screen.queryByText('(edited)')).toBeNull();
  });

  it('does NOT render (edited) badge when editedAt is zero (falsy)', () => {
    render(<DialogueBubble message={makeMsg({ role: 'assistant', status: 'sent', text: 'Edge case', editedAt: 0 })} />);
    expect(screen.queryByText('(edited)')).toBeNull();
  });

  it('badge title contains a human-readable date derived from editedAt', () => {
    render(
      <DialogueBubble
        message={makeMsg({ role: 'assistant', status: 'sent', text: 'Edited message', editedAt: 1_700_000_000_000 })}
      />,
    );
    const badge = screen.getByText('(edited)');
    expect(badge.getAttribute('title')).toMatch(/^Edited /);
    expect(badge.getAttribute('title')).toContain('2023');
  });
});
