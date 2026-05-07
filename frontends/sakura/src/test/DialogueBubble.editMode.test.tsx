/**
 * Tests for DialogueBubble edit-mode behaviour.
 *
 * Covers: pencil button visibility (hover + role + status guards), textarea
 * pre-fill on open, Enter-to-save vs Shift+Enter pass-through, Escape-to-cancel,
 * and the (edited) badge for messages with editedAt set.
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub (REQUIRED for all component tests)
 *
 * Notes:
 *   - The pencil button appears in the action toolbar that is gated by BOTH
 *     `hovered` AND `message.status === 'sent'`. Streaming messages do not show it.
 *   - The (edited) badge is rendered only for assistant messages in the header row.
 *     The user-message branch does not currently render a badge (source confirmed).
 *   - Hover is triggered via fireEvent.mouseEnter on the outermost wrapper div.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

// ── Mock api calls made inside DialogueBubble (branches, expression portraits) ─
vi.mock('../lib/api', () => ({
  api: {
    getMessageBranches: vi.fn().mockResolvedValue({ branches: [], active_index: 0, total: 1 }),
    listExpressionPortraits: vi.fn().mockResolvedValue({ ok: true, portraits: {} }),
    pinMessage: vi.fn().mockResolvedValue({ ok: true }),
    editMessage: vi.fn(),
  },
}));

// ── Mock useAppStore (DialogueBubble reads thinkingIndicatorMode) ──────────────
vi.mock('../stores/appStore', () => ({
  useAppStore: (selector: (s: { thinkingIndicatorMode: 'skeleton' | 'stages' }) => unknown) =>
    selector({ thinkingIndicatorMode: 'skeleton' }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal ChatMessage for rendering.
 * Defaults to a sent user message so the action toolbar appears after hover.
 */
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

/**
 * Render the DialogueBubble and trigger a mouseEnter on the outermost wrapper
 * so that the hovered state becomes true and action buttons appear.
 *
 * Returns the render result for further assertions.
 */
function renderAndHover(msg: ChatMessage, onEdit?: (id: string, text: string) => void) {
  const result = render(
    <DialogueBubble message={msg} onEdit={onEdit} />,
  );
  // The outermost element for both user and assistant branches handles onMouseEnter
  fireEvent.mouseEnter(result.container.firstChild as HTMLElement);
  return result;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('DialogueBubble — edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Pencil button visibility ───────────────────────────────────────────────

  it('shows pencil button on hover for a sent user message when onEdit is provided', () => {
    renderAndHover(makeMsg({ role: 'user', status: 'sent' }), vi.fn());
    // The button has title="Edit" in the user message branch
    expect(screen.getByTitle('Edit')).toBeTruthy();
  });

  it('shows pencil button on hover for a sent assistant message when onEdit is provided', () => {
    renderAndHover(makeMsg({ role: 'assistant', status: 'sent' }), vi.fn());
    // The button has title="Edit message" in the assistant branch
    expect(screen.getByTitle('Edit message')).toBeTruthy();
  });

  it('does not show pencil button when onEdit prop is absent', () => {
    renderAndHover(makeMsg({ role: 'user', status: 'sent' }));
    // No onEdit → no Edit button rendered at all
    expect(screen.queryByTitle('Edit')).toBeNull();
  });

  it('hides pencil button while message is streaming (user message)', () => {
    renderAndHover(makeMsg({ role: 'user', status: 'streaming' }), vi.fn());
    // Action toolbar is gated by status === 'sent', so pencil must not appear
    expect(screen.queryByTitle('Edit')).toBeNull();
  });

  it('hides pencil button while message is streaming (assistant message)', () => {
    renderAndHover(makeMsg({ role: 'assistant', status: 'streaming' }), vi.fn());
    // Both the secondary action bar AND edit button are gated by status === 'sent'
    expect(screen.queryByTitle('Edit message')).toBeNull();
  });

  it('hides pencil button while message is pending', () => {
    renderAndHover(makeMsg({ role: 'user', status: 'pending' }), vi.fn());
    expect(screen.queryByTitle('Edit')).toBeNull();
  });

  // ── Opening edit mode ──────────────────────────────────────────────────────

  it('opens textarea with prefilled text on pencil click (user message)', () => {
    renderAndHover(makeMsg({ role: 'user', status: 'sent', text: 'Hello world' }), vi.fn());
    fireEvent.click(screen.getByTitle('Edit'));
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('Hello world');
  });

  it('opens textarea with prefilled text on pencil click (assistant message)', () => {
    renderAndHover(makeMsg({ role: 'assistant', status: 'sent', text: 'Hi there' }), vi.fn());
    fireEvent.click(screen.getByTitle('Edit message'));
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('Hi there');
  });

  // ── Enter key saves, Shift+Enter does not ─────────────────────────────────

  it('calls onEdit on Enter key and closes textarea', () => {
    const onEdit = vi.fn();
    renderAndHover(makeMsg({ role: 'user', status: 'sent', text: 'Hello world' }), onEdit);
    fireEvent.click(screen.getByTitle('Edit'));

    const textarea = screen.getByRole('textbox');
    // Change the textarea content
    fireEvent.change(textarea, { target: { value: 'Updated text' } });
    // Press Enter without Shift
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith('test-msg-1', 'Updated text');
    // Textarea should be gone (editing state back to false)
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('does NOT call onEdit on Shift+Enter — should allow multiline input', () => {
    const onEdit = vi.fn();
    renderAndHover(makeMsg({ role: 'user', status: 'sent', text: 'Hello world' }), onEdit);
    fireEvent.click(screen.getByTitle('Edit'));

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Line 1\nLine 2' } });
    // Shift+Enter must NOT trigger confirm
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onEdit).not.toHaveBeenCalled();
    // Textarea stays open
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('does NOT call onEdit when Enter is pressed but text is unchanged', () => {
    const onEdit = vi.fn();
    renderAndHover(makeMsg({ role: 'user', status: 'sent', text: 'Hello world' }), onEdit);
    fireEvent.click(screen.getByTitle('Edit'));

    const textarea = screen.getByRole('textbox');
    // Text is not changed from original — handleEditConfirm checks trimmed !== message.text
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onEdit).not.toHaveBeenCalled();
  });

  // ── Escape cancels ─────────────────────────────────────────────────────────

  it('cancels on Escape and restores original text', () => {
    const onEdit = vi.fn();
    renderAndHover(makeMsg({ role: 'user', status: 'sent', text: 'Original' }), onEdit);
    fireEvent.click(screen.getByTitle('Edit'));

    const textarea = screen.getByRole('textbox');
    // Type some new text...
    fireEvent.change(textarea, { target: { value: 'Typed something' } });
    // ...then press Escape
    fireEvent.keyDown(textarea, { key: 'Escape' });

    // Editing mode should be closed
    expect(screen.queryByRole('textbox')).toBeNull();
    // onEdit must NOT have been called
    expect(onEdit).not.toHaveBeenCalled();
    // The original message text should still render
    expect(screen.getByText('Original')).toBeTruthy();
  });

  it('cancels on clicking the X button and closes textarea', () => {
    const onEdit = vi.fn();
    renderAndHover(makeMsg({ role: 'user', status: 'sent', text: 'Original' }), onEdit);
    fireEvent.click(screen.getByTitle('Edit'));

    // Cancel button has title="Cancel"
    fireEvent.click(screen.getByTitle('Cancel'));

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('saves on clicking the Save (Check) button', () => {
    const onEdit = vi.fn();
    renderAndHover(makeMsg({ role: 'user', status: 'sent', text: 'Old text' }), onEdit);
    fireEvent.click(screen.getByTitle('Edit'));

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'New text via button' } });
    fireEvent.click(screen.getByTitle('Save'));

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith('test-msg-1', 'New text via button');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  // ── (edited) badge ─────────────────────────────────────────────────────────

  it('renders (edited) badge when editedAt is set on an assistant message', () => {
    render(
      <DialogueBubble
        message={makeMsg({
          role: 'assistant',
          status: 'sent',
          text: 'I said something',
          editedAt: 1_234_567_890,
        })}
      />,
    );
    // The badge text is literally "(edited)" in a span
    expect(screen.getByText('(edited)')).toBeTruthy();
  });

  it('does NOT render (edited) badge when editedAt is absent', () => {
    render(
      <DialogueBubble
        message={makeMsg({ role: 'assistant', status: 'sent', text: 'Never edited' })}
      />,
    );
    expect(screen.queryByText('(edited)')).toBeNull();
  });

  it('does NOT render (edited) badge when editedAt is zero (falsy)', () => {
    render(
      <DialogueBubble
        message={makeMsg({ role: 'assistant', status: 'sent', text: 'Edge case', editedAt: 0 })}
      />,
    );
    // 0 is falsy — the badge conditional is `{message.editedAt && ...}` so it won't render
    expect(screen.queryByText('(edited)')).toBeNull();
  });

  it('badge title contains a human-readable date derived from editedAt', () => {
    render(
      <DialogueBubble
        message={makeMsg({
          role: 'assistant',
          status: 'sent',
          text: 'Edited message',
          editedAt: 1_700_000_000_000,
        })}
      />,
    );
    const badge = screen.getByText('(edited)');
    // The title attribute is set to `Edited ${new Date(editedAt).toLocaleString()}`
    expect(badge.getAttribute('title')).toMatch(/^Edited /);
    expect(badge.getAttribute('title')).toContain('2023');
  });

  // ── Additional interaction guards ──────────────────────────────────────────

  it('hides action toolbar again after mouseLeave', () => {
    const { container } = render(
      <DialogueBubble
        message={makeMsg({ role: 'user', status: 'sent' })}
        onEdit={vi.fn()}
      />,
    );
    const wrapper = container.firstChild as HTMLElement;
    // Hover in
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByTitle('Edit')).toBeTruthy();
    // Hover out
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByTitle('Edit')).toBeNull();
  });
});
