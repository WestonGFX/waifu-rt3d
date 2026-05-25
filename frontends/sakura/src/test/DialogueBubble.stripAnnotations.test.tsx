/**
 * Regression lock: bracket annotations visible in chat (fixed in commit 2080240).
 *
 * Fix commits (oldest -> newest):
 *   2080240  fix: bracket annotations visible in chat (DialogueBubble.tsx)
 *
 * Bug path: LLM produces bracket annotations like `[emotional expression: soft smile]`
 * in older DB messages. Without stripAnnotations(), these render verbatim in the chat
 * bubble text, polluting the user-facing UI with raw LLM metadata.
 *
 * The fix added a `stripAnnotations()` function (lines 15-24 of DialogueBubble.tsx)
 * that strips six bracket patterns before passing text to MarkdownText:
 *   - [emotional expression: ...]
 *   - [gesture: ...]
 *   - [action: ...]
 *   - [mood: ...]
 *   - [facial: ...]
 *   - [emotion: ...]
 *
 * This test renders DialogueBubble with annotated text and asserts the bracket
 * content is absent from the DOM. It cannot test stripAnnotations() directly
 * (private function) — it exercises the rendering pipeline, which is the
 * actual regression surface.
 *
 * If this test fails, check:
 *   1. The `stripAnnotations()` function in DialogueBubble.tsx still exists
 *   2. The six regex patterns still cover the annotation variants
 *   3. `stripAnnotations(message.text)` is still called before MarkdownText
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub (REQUIRED for all component tests)
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

// ── Mock api calls made inside DialogueBubble (branches, expression portraits) ─
vi.mock('../lib/api', () => ({
  api: {
    getMessageBranches: vi.fn().mockResolvedValue({ branches: [], active_index: 0, total: 1 }),
    listExpressionPortraits: vi.fn().mockResolvedValue({ ok: true, portraits: {} }),
    pinMessage: vi.fn().mockResolvedValue({ ok: true }),
    editMessage: vi.fn(),
  },
}));

// ── Mock useAppStore (DialogueBubble reads thinkingIndicatorMode + openSettingsTab) ─
vi.mock('../stores/appStore', () => ({
  useAppStore: (selector: (s: { thinkingIndicatorMode: 'skeleton' | 'stages'; openSettingsTab: () => void }) => unknown) =>
    selector({ thinkingIndicatorMode: 'skeleton', openSettingsTab: vi.fn() }),
}));

// ── Mock useChatStore (TimeoutActionCard uses retryLastTimeout + dismissTimeout) ─
vi.mock('../stores/chatStore', () => ({
  useChatStore: (selector: (s: { retryLastTimeout: () => void; dismissTimeout: () => void }) => unknown) =>
    selector({ retryLastTimeout: vi.fn(), dismissTimeout: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal sent ChatMessage for rendering.
 * Defaults to a sent assistant message so text goes through the MarkdownText path.
 */
function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'test-msg-strip',
    role: 'assistant',
    text: 'Hello',
    createdAt: 1_700_000_000_000,
    status: 'sent',
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('DialogueBubble — stripAnnotations regression (fix: 2080240)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('strips [emotional expression: ...] from assistant message text', () => {
    render(
      <DialogueBubble
        message={makeMsg({ text: 'Hello there[emotional expression: soft smile]' })}
      />,
    );
    // The visible text must not contain the bracket annotation
    expect(screen.queryByText(/\[emotional expression:/)).toBeNull();
    // The clean word "Hello" must still be present
    expect(screen.getByText(/Hello there/)).toBeTruthy();
  });

  it('strips [gesture: ...] from assistant message text', () => {
    render(
      <DialogueBubble
        message={makeMsg({ text: 'Right[gesture: nodding gently]' })}
      />,
    );
    expect(screen.queryByText(/\[gesture:/)).toBeNull();
    expect(screen.getByText(/Right/)).toBeTruthy();
  });

  it('strips [action: ...] from assistant message text', () => {
    render(
      <DialogueBubble
        message={makeMsg({ text: 'Sure[action: waves hand]' })}
      />,
    );
    expect(screen.queryByText(/\[action:/)).toBeNull();
    expect(screen.getByText(/Sure/)).toBeTruthy();
  });

  it('strips [mood: ...] from assistant message text', () => {
    render(
      <DialogueBubble
        message={makeMsg({ text: 'Of course[mood: cheerful]' })}
      />,
    );
    expect(screen.queryByText(/\[mood:/)).toBeNull();
    expect(screen.getByText(/Of course/)).toBeTruthy();
  });

  it('strips [facial: ...] from assistant message text', () => {
    render(
      <DialogueBubble
        message={makeMsg({ text: 'Indeed[facial: slight blush]' })}
      />,
    );
    expect(screen.queryByText(/\[facial:/)).toBeNull();
    expect(screen.getByText(/Indeed/)).toBeTruthy();
  });

  it('strips [emotion: ...] from assistant message text', () => {
    render(
      <DialogueBubble
        message={makeMsg({ text: 'Okay[emotion: happy]' })}
      />,
    );
    expect(screen.queryByText(/\[emotion:/)).toBeNull();
    expect(screen.getByText(/Okay/)).toBeTruthy();
  });

  it('strips multiple bracket annotation types from a single message', () => {
    const annotated =
      'I understand[emotional expression: warm smile][gesture: tilts head][mood: attentive] — tell me more.';
    render(
      <DialogueBubble message={makeMsg({ text: annotated })} />,
    );
    expect(screen.queryByText(/\[emotional expression:/)).toBeNull();
    expect(screen.queryByText(/\[gesture:/)).toBeNull();
    expect(screen.queryByText(/\[mood:/)).toBeNull();
    // The surrounding prose should survive stripping
    expect(screen.getByText(/tell me more/)).toBeTruthy();
  });

  it('passes through text with no annotations unchanged', () => {
    render(
      <DialogueBubble
        message={makeMsg({ text: 'Just a normal reply with no annotations.' })}
      />,
    );
    expect(screen.getByText(/Just a normal reply with no annotations\./)).toBeTruthy();
  });

  it('strips annotations from user-role messages too', () => {
    // The fix applies stripAnnotations() in both the user and assistant render branches.
    render(
      <DialogueBubble
        message={makeMsg({
          role: 'user',
          text: 'I smiled[emotional expression: nervous grin]',
        })}
      />,
    );
    expect(screen.queryByText(/\[emotional expression:/)).toBeNull();
    expect(screen.getByText(/I smiled/)).toBeTruthy();
  });

  it('is case-insensitive — strips UPPERCASE annotation keywords', () => {
    // The regexes in stripAnnotations() use the /gi flag.
    render(
      <DialogueBubble
        message={makeMsg({ text: 'Hmm[EMOTIONAL EXPRESSION: pensive]' })}
      />,
    );
    expect(screen.queryByText(/\[EMOTIONAL EXPRESSION:/)).toBeNull();
    expect(screen.getByText(/Hmm/)).toBeTruthy();
  });
});
