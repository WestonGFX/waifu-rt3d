/**
 * Tests for chatStore.editMessage action.
 *
 * Covers: happy-path patch, no-op guards (unchanged text, empty trim),
 * isolation (other messages untouched), error propagation (API rejection).
 *
 * Follows testing-conventions.md:
 *   Pattern 1 — Zustand store-direct testing (no React rendering)
 *   Pattern 2 — API mock via vi.mock('../lib/api')
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';
import type { ChatMessage } from '../lib/types';
import type { MessageOut } from '../lib/api';

// ── Pattern 2: Mock the api module ────────────────────────────────────────────
vi.mock('../lib/api', () => ({
  api: {
    editMessage: vi.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal ChatMessage suitable for seeding the store.
 * Only the fields that editMessage logic touches are required.
 */
function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    text: 'original text',
    createdAt: 1_700_000_000_000,
    status: 'sent',
    serverMessageId: 42,
    ...overrides,
  };
}

/**
 * Build a minimal MessageOut as the API would return it.
 */
function makeMessageOut(overrides: Partial<MessageOut> = {}): MessageOut {
  return {
    id: 42,
    role: 'user',
    text: 'new text',
    edited_at: 1_234_567_890,
    edit_history: [{ ts: 1_234_567_890, prev_content: 'original text' }],
    ...overrides,
  };
}

/**
 * Seed the store with the given messages and reset loading state.
 * Called in beforeEach and in individual tests that need custom seeds.
 */
function seedStore(messages: ChatMessage[]) {
  useChatStore.setState({
    messages,
    sessionId: 1,
    charId: 99,
    loading: false,
    draft: '',
    abortController: null,
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('chatStore — editMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedStore([makeMessage()]);
  });

  it('patches text + editedAt in store on success', async () => {
    vi.mocked(api.editMessage).mockResolvedValue(makeMessageOut({
      text: 'new text',
      edited_at: 1_234_567_890,
      edit_history: [{ ts: 1_234_567_890, prev_content: 'original text' }],
    }));

    await useChatStore.getState().editMessage('msg-1', 'new text');

    const patched = useChatStore.getState().messages.find(m => m.id === 'msg-1');
    expect(patched?.text).toBe('new text');
    expect(patched?.editedAt).toBe(1_234_567_890);
    // edit_history entries are mapped to camelCase prevContent
    expect(patched?.editHistory).toEqual([{ ts: 1_234_567_890, prevContent: 'original text' }]);
  });

  it('calls api.editMessage with the correct serverMessageId and trimmed text', async () => {
    vi.mocked(api.editMessage).mockResolvedValue(makeMessageOut({ text: 'trimmed' }));

    await useChatStore.getState().editMessage('msg-1', '  trimmed  ');

    expect(api.editMessage).toHaveBeenCalledWith(42, 'trimmed');
  });

  it('no-ops when text is unchanged after trim', async () => {
    // Store message has text 'original text'; sending the same text should short-circuit.
    await useChatStore.getState().editMessage('msg-1', 'original text');

    expect(api.editMessage).not.toHaveBeenCalled();
    // Store message is still the original
    expect(useChatStore.getState().messages[0].text).toBe('original text');
  });

  it('no-ops when text is empty after trim', async () => {
    await useChatStore.getState().editMessage('msg-1', '   ');

    expect(api.editMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().messages[0].text).toBe('original text');
  });

  it('no-ops when text trims to empty string (tabs and newlines)', async () => {
    await useChatStore.getState().editMessage('msg-1', '\t\n\r  ');

    expect(api.editMessage).not.toHaveBeenCalled();
  });

  it('does not mutate other messages in the store', async () => {
    const secondMsg = makeMessage({
      id: 'msg-2',
      text: 'second message text',
      serverMessageId: 99,
    });
    seedStore([makeMessage(), secondMsg]);

    vi.mocked(api.editMessage).mockResolvedValue(makeMessageOut({ text: 'edited first' }));

    await useChatStore.getState().editMessage('msg-1', 'edited first');

    const second = useChatStore.getState().messages.find(m => m.id === 'msg-2');
    expect(second?.text).toBe('second message text');
    // Ensure editedAt was NOT applied to the untouched message
    expect(second?.editedAt).toBeUndefined();
  });

  it('throws + leaves store text unchanged on API error', async () => {
    const apiError = new Error('500 Internal Server Error');
    vi.mocked(api.editMessage).mockRejectedValue(apiError);

    await expect(
      useChatStore.getState().editMessage('msg-1', 'attempted edit')
    ).rejects.toThrow('500 Internal Server Error');

    // Store must remain unchanged after the failed edit
    const msg = useChatStore.getState().messages.find(m => m.id === 'msg-1');
    expect(msg?.text).toBe('original text');
    expect(msg?.editedAt).toBeUndefined();
  });

  it('no-ops silently when message id is not found in store', async () => {
    // 'nonexistent' is not in the store — should return without calling the API
    await useChatStore.getState().editMessage('nonexistent', 'some text');

    expect(api.editMessage).not.toHaveBeenCalled();
  });

  it('no-ops when message exists but has no serverMessageId', async () => {
    seedStore([makeMessage({ serverMessageId: undefined })]);

    await useChatStore.getState().editMessage('msg-1', 'some text');

    expect(api.editMessage).not.toHaveBeenCalled();
  });

  it('maps null edit_history from API to empty editHistory array on store', async () => {
    vi.mocked(api.editMessage).mockResolvedValue(makeMessageOut({
      text: 'new text',
      edited_at: 1_000,
      edit_history: null,
    }));

    await useChatStore.getState().editMessage('msg-1', 'new text');

    const patched = useChatStore.getState().messages.find(m => m.id === 'msg-1');
    // (undefined ?? []).map(...) produces [] — not an error
    expect(Array.isArray(patched?.editHistory)).toBe(true);
    expect(patched?.editHistory).toHaveLength(0);
  });

  it('sets editedAt to undefined when API returns null edited_at', async () => {
    vi.mocked(api.editMessage).mockResolvedValue(makeMessageOut({
      text: 'updated',
      edited_at: null,
    }));

    await useChatStore.getState().editMessage('msg-1', 'updated');

    const patched = useChatStore.getState().messages.find(m => m.id === 'msg-1');
    // null ?? undefined → undefined
    expect(patched?.editedAt).toBeUndefined();
  });
});
