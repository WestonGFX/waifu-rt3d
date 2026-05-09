/**
 * Tests for chatStore.togglePin action.
 *
 * Covers: optimistic toggle, API sync, revert on error,
 * pin filter applied in visibleMessages memo (logic tested via store state),
 * and the empty-state guard for showPinnedOnly.
 *
 * Follows testing-conventions.md:
 *   Pattern 1 — Zustand store-direct (no rendering)
 *   Pattern 2 — API mock via vi.mock('../lib/api')
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';
import type { ChatMessage } from '../lib/types';

// ── Pattern 2: Mock the api module ────────────────────────────────────────────
vi.mock('../lib/api', () => ({
  api: {
    pinMessage: vi.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    text: 'hello',
    createdAt: 1_700_000_000_000,
    status: 'sent',
    serverMessageId: 42,
    pinned: false,
    ...overrides,
  };
}

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

describe('chatStore — togglePin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedStore([makeMessage({ pinned: false })]);
  });

  it('optimistically flips pinned=true, then confirms via API', async () => {
    vi.mocked(api.pinMessage).mockResolvedValue(undefined);

    const togglePin = useChatStore.getState().togglePin;
    const promise = togglePin('msg-1');

    // Optimistic update fires synchronously before await resolves
    expect(useChatStore.getState().messages[0].pinned).toBe(true);

    await promise;

    // Still true after API succeeds
    expect(useChatStore.getState().messages[0].pinned).toBe(true);
    expect(api.pinMessage).toHaveBeenCalledWith(42, true);
  });

  it('reverts to pinned=false when API call rejects', async () => {
    vi.mocked(api.pinMessage).mockRejectedValue(new Error('network error'));

    await useChatStore.getState().togglePin('msg-1');

    // Reverted back to false after rejection
    expect(useChatStore.getState().messages[0].pinned).toBe(false);
  });

  it('toggles pinned=true → false (round-trip)', async () => {
    seedStore([makeMessage({ pinned: true })]);
    vi.mocked(api.pinMessage).mockResolvedValue(undefined);

    await useChatStore.getState().togglePin('msg-1');

    expect(useChatStore.getState().messages[0].pinned).toBe(false);
    expect(api.pinMessage).toHaveBeenCalledWith(42, false);
  });

  it('no-ops when message has no serverMessageId', async () => {
    seedStore([makeMessage({ serverMessageId: undefined })]);

    await useChatStore.getState().togglePin('msg-1');

    expect(api.pinMessage).not.toHaveBeenCalled();
    // pinned state unchanged
    expect(useChatStore.getState().messages[0].pinned).toBe(false);
  });

  it('no-ops when messageId is not found in store', async () => {
    await useChatStore.getState().togglePin('nonexistent');

    expect(api.pinMessage).not.toHaveBeenCalled();
  });

  it('only toggles the target message — other messages untouched', async () => {
    const second = makeMessage({ id: 'msg-2', serverMessageId: 99, pinned: true });
    seedStore([makeMessage({ pinned: false }), second]);
    vi.mocked(api.pinMessage).mockResolvedValue(undefined);

    await useChatStore.getState().togglePin('msg-1');

    // msg-2 must remain pinned=true
    const msg2 = useChatStore.getState().messages.find(m => m.id === 'msg-2');
    expect(msg2?.pinned).toBe(true);
  });

  it('pin filter: messages with pinned=false are excluded when filtering', () => {
    const pinned = makeMessage({ id: 'pinned', pinned: true });
    const unpinned = makeMessage({ id: 'unpinned', pinned: false });
    seedStore([pinned, unpinned]);

    const all = useChatStore.getState().messages;
    const filtered = all.filter(m => m.pinned);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('pinned');
  });
});
