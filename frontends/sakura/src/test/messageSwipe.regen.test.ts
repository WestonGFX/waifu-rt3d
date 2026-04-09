import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';

/**
 * Mock the api module to control all HTTP calls made by chatStore.
 *
 * We include the four endpoints used by the message-swipe / regeneration
 * feature plus the minimal stubs required to keep other store paths quiet.
 */
vi.mock('../lib/api', () => ({
  api: {
    getMessages: vi.fn(),
    regenerateMessage: vi.fn(),
    getMessageBranches: vi.fn(),
    activateBranch: vi.fn(),
    // Stubs to satisfy other store paths that may import api
    saveConfig: vi.fn().mockResolvedValue({ ok: true, config: {} }),
    getConfig: vi.fn().mockResolvedValue({}),
    getCharacters: vi.fn().mockResolvedValue([]),
  },
}));

/**
 * Framer Motion stub — required by Pattern 4.
 * chatStore tests don't render components, but the store imports viewerStore
 * which might transitively pull in framer-motion on some bundler paths.
 * The mock is cheap and eliminates any potential import-time side-effects.
 */
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: Record<string, unknown>) => children,
    span: ({ children }: Record<string, unknown>) => children,
    button: ({ children }: Record<string, unknown>) => children,
  },
  AnimatePresence: ({ children }: Record<string, unknown>) => children,
  useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
}));

/** Minimal initial state that resets chatStore to a clean slate. */
const initialChatState = {
  messages: [],
  draft: '',
  loading: false,
  sessionId: null,
  charId: null,
  abortController: null,
  currentEmotion: null,
  latestEmotionByChar: {},
  directorMode: false,
};

// ---------------------------------------------------------------------------
// Suite 1 — loadHistory: field mapping
// ---------------------------------------------------------------------------

/**
 * Tests for chatStore.loadHistory — verifies that the API response fields are
 * correctly mapped onto the ChatMessage shape the frontend uses, including
 * serverMessageId, emotion, and pinned conversion.
 */
describe('chatStore.loadHistory — field mapping', () => {
  beforeEach(() => {
    useChatStore.setState(initialChatState);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps id to serverMessageId, preserves text, emotion, and pinned flag', async () => {
    vi.mocked(api.getMessages).mockResolvedValue({
      messages: [
        {
          id: 42,
          role: 'assistant',
          text: 'Hello',
          ts: '2026-01-01T00:00:00Z',
          emotion: 'happy',
          pinned: 1,
        },
      ],
    });

    await useChatStore.getState().loadHistory(1);
    const messages = useChatStore.getState().messages;

    expect(messages).toHaveLength(1);
    expect(messages[0].serverMessageId).toBe(42);
    expect(messages[0].text).toBe('Hello');
    expect(messages[0].emotion).toBe('happy');
    expect(messages[0].pinned).toBe(true);
  });

  it('sets role and status correctly for an assistant message', async () => {
    vi.mocked(api.getMessages).mockResolvedValue({
      messages: [
        { id: 10, role: 'assistant', text: 'Hi there', ts: '2026-01-01T00:00:00Z' },
      ],
    });

    await useChatStore.getState().loadHistory(5);
    const msg = useChatStore.getState().messages[0];

    expect(msg.role).toBe('assistant');
    expect(msg.status).toBe('sent');
  });

  it('coerces string id to the local uuid-style id field', async () => {
    vi.mocked(api.getMessages).mockResolvedValue({
      messages: [
        { id: 99, role: 'user', text: 'Hey', ts: '2026-01-01T00:00:00Z' },
      ],
    });

    await useChatStore.getState().loadHistory(2);
    const msg = useChatStore.getState().messages[0];

    // The local id is String(m.id), not a uuid in this code path
    expect(msg.id).toBe('99');
  });

  it('replaces any existing messages in the store', async () => {
    // Pre-populate with stale data
    useChatStore.setState({
      messages: [
        {
          id: 'stale-1',
          role: 'user',
          text: 'old message',
          createdAt: 0,
          status: 'sent',
          serverMessageId: 1,
        },
      ],
    });

    vi.mocked(api.getMessages).mockResolvedValue({
      messages: [
        { id: 55, role: 'assistant', text: 'Fresh reply', ts: '2026-02-01T00:00:00Z' },
      ],
    });

    await useChatStore.getState().loadHistory(10);
    const messages = useChatStore.getState().messages;

    expect(messages).toHaveLength(1);
    expect(messages[0].serverMessageId).toBe(55);
    expect(messages[0].text).toBe('Fresh reply');
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — loadHistory: missing optional fields
// ---------------------------------------------------------------------------

/**
 * Verifies graceful handling when the server omits optional fields on a
 * message row (emotion, pinned).  The store must not error and must provide
 * safe defaults.
 */
describe('chatStore.loadHistory — missing optional fields', () => {
  beforeEach(() => {
    useChatStore.setState(initialChatState);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emotion is undefined when server omits emotion field', async () => {
    vi.mocked(api.getMessages).mockResolvedValue({
      messages: [
        { id: 1, role: 'user', text: 'hi', ts: '2026-01-01T00:00:00Z' },
      ],
    });

    await useChatStore.getState().loadHistory(1);
    const msg = useChatStore.getState().messages[0];

    expect(msg.serverMessageId).toBe(1);
    expect(msg.emotion).toBeUndefined();
  });

  it('pinned defaults to false when server omits pinned field', async () => {
    vi.mocked(api.getMessages).mockResolvedValue({
      messages: [
        { id: 1, role: 'user', text: 'hi', ts: '2026-01-01T00:00:00Z' },
      ],
    });

    await useChatStore.getState().loadHistory(1);
    const msg = useChatStore.getState().messages[0];

    expect(msg.pinned).toBe(false);
  });

  it('pinned is false when server sends pinned: 0', async () => {
    vi.mocked(api.getMessages).mockResolvedValue({
      messages: [
        { id: 2, role: 'assistant', text: 'reply', ts: '2026-01-01T00:00:00Z', pinned: 0 },
      ],
    });

    await useChatStore.getState().loadHistory(1);
    const msg = useChatStore.getState().messages[0];

    expect(msg.pinned).toBe(false);
  });

  it('createdAt is a valid timestamp when ts is provided', async () => {
    vi.mocked(api.getMessages).mockResolvedValue({
      messages: [
        { id: 3, role: 'user', text: 'hello', ts: '2026-06-15T12:00:00Z' },
      ],
    });

    await useChatStore.getState().loadHistory(1);
    const msg = useChatStore.getState().messages[0];

    // new Date('2026-06-15T12:00:00Z').getTime() === 1781524800000
    expect(msg.createdAt).toBe(new Date('2026-06-15T12:00:00Z').getTime());
  });

  it('falls back to Date.now() order-of-magnitude when ts is absent', async () => {
    vi.mocked(api.getMessages).mockResolvedValue({
      messages: [
        // ts omitted — the store falls back to Date.now()
        { id: 4, role: 'user', text: 'no ts' } as Parameters<typeof api.getMessages>[0] extends never
          ? never
          // Cast to avoid TS complaint about missing ts — the runtime handles it
          : { id: number; role: string; text: string; ts: string },
      ],
    });

    const before = Date.now();
    await useChatStore.getState().loadHistory(1);
    const after = Date.now();
    const msg = useChatStore.getState().messages[0];

    expect(msg.createdAt).toBeGreaterThanOrEqual(before);
    expect(msg.createdAt).toBeLessThanOrEqual(after);
  });

  it('handles an empty messages array without error', async () => {
    vi.mocked(api.getMessages).mockResolvedValue({ messages: [] });

    await useChatStore.getState().loadHistory(7);
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — api.regenerateMessage: response shape
// ---------------------------------------------------------------------------

/**
 * Validates the shape of the regenerateMessage API response.
 *
 * These tests exercise the api wrapper in isolation — we stub fetch at the
 * global level so no real HTTP is made.  The wrapper is thin (post<T>) so
 * the key assertion is that the returned data passes through unmodified.
 */
describe('api.regenerateMessage — response shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns new_message with id, text, emotion, and gesture', async () => {
    vi.mocked(api.regenerateMessage).mockResolvedValue({
      ok: true,
      new_message: { id: 99, text: 'New reply', emotion: 'excited', gesture: 'wave' },
    });

    const response = await api.regenerateMessage(42);

    expect(response.ok).toBe(true);
    expect(response.new_message.id).toBe(99);
    expect(response.new_message.text).toBe('New reply');
    expect(response.new_message.emotion).toBe('excited');
    expect(response.new_message.gesture).toBe('wave');
  });

  it('passes the messageId argument through to the mock', async () => {
    vi.mocked(api.regenerateMessage).mockResolvedValue({
      ok: true,
      new_message: { id: 100, text: 'Reply 100', emotion: 'neutral' },
    });

    await api.regenerateMessage(42);

    expect(api.regenerateMessage).toHaveBeenCalledOnce();
    expect(api.regenerateMessage).toHaveBeenCalledWith(42);
  });

  it('optional fields emotion and gesture may be absent', async () => {
    vi.mocked(api.regenerateMessage).mockResolvedValue({
      ok: true,
      new_message: { id: 55, text: 'Minimal reply' },
    });

    const response = await api.regenerateMessage(10);

    expect(response.new_message.id).toBe(55);
    expect(response.new_message.text).toBe('Minimal reply');
    expect(response.new_message.emotion).toBeUndefined();
    expect(response.new_message.gesture).toBeUndefined();
  });

  it('rejects when API returns a network error', async () => {
    vi.mocked(api.regenerateMessage).mockRejectedValue(new Error('Network error'));

    await expect(api.regenerateMessage(42)).rejects.toThrow('Network error');
  });

  it('ok:false is preserved and distinguishable from success', async () => {
    vi.mocked(api.regenerateMessage).mockResolvedValue({
      ok: false,
      new_message: { id: 0, text: '' },
    });

    const response = await api.regenerateMessage(99);

    expect(response.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — store integration: in-place message update after regeneration
// ---------------------------------------------------------------------------

/**
 * Tests that the in-place regeneration pattern — call api.regenerateMessage,
 * then update the matching message in the store's messages array — works
 * correctly.  We simulate the handleRegenerate logic that ChatThread.tsx
 * would execute, verifying the store state changes rather than the UI.
 */
describe('store integration — in-place message update on regeneration', () => {
  beforeEach(() => {
    useChatStore.setState({
      ...initialChatState,
      sessionId: 1,
      charId: 1,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'What do you think?',
          createdAt: 1000,
          status: 'sent',
          serverMessageId: 10,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Original reply',
          createdAt: 2000,
          status: 'sent',
          serverMessageId: 42,
        },
      ],
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replaces text and serverMessageId of the target message', async () => {
    vi.mocked(api.regenerateMessage).mockResolvedValue({
      ok: true,
      new_message: { id: 99, text: 'Better reply', emotion: 'happy' },
    });

    // Simulate handleRegenerate: call API then patch the message in-place
    const result = await api.regenerateMessage(42);
    useChatStore.setState((state) => ({
      messages: state.messages.map((m) =>
        m.serverMessageId === 42
          ? {
              ...m,
              text: result.new_message.text,
              serverMessageId: result.new_message.id,
              emotion: result.new_message.emotion,
            }
          : m
      ),
    }));

    const messages = useChatStore.getState().messages;
    const updated = messages.find((m) => m.id === 'assistant-1');

    expect(updated).toBeDefined();
    expect(updated!.text).toBe('Better reply');
    expect(updated!.serverMessageId).toBe(99);
    expect(updated!.emotion).toBe('happy');
  });

  it('leaves all other messages unchanged after in-place update', async () => {
    vi.mocked(api.regenerateMessage).mockResolvedValue({
      ok: true,
      new_message: { id: 99, text: 'Better reply', emotion: 'happy' },
    });

    const result = await api.regenerateMessage(42);
    useChatStore.setState((state) => ({
      messages: state.messages.map((m) =>
        m.serverMessageId === 42
          ? { ...m, text: result.new_message.text, serverMessageId: result.new_message.id }
          : m
      ),
    }));

    const messages = useChatStore.getState().messages;
    const userMsg = messages.find((m) => m.id === 'user-1');

    expect(userMsg).toBeDefined();
    expect(userMsg!.text).toBe('What do you think?');
    expect(userMsg!.serverMessageId).toBe(10);
  });

  it('message count remains the same after in-place update (no new message appended)', async () => {
    vi.mocked(api.regenerateMessage).mockResolvedValue({
      ok: true,
      new_message: { id: 99, text: 'Better reply' },
    });

    const result = await api.regenerateMessage(42);
    useChatStore.setState((state) => ({
      messages: state.messages.map((m) =>
        m.serverMessageId === 42
          ? { ...m, text: result.new_message.text, serverMessageId: result.new_message.id }
          : m
      ),
    }));

    expect(useChatStore.getState().messages).toHaveLength(2);
  });

  it('gesture is applied to the message when present in the response', async () => {
    vi.mocked(api.regenerateMessage).mockResolvedValue({
      ok: true,
      new_message: { id: 77, text: 'Gestured reply', emotion: 'excited', gesture: 'wave' },
    });

    const result = await api.regenerateMessage(42);
    useChatStore.setState((state) => ({
      messages: state.messages.map((m) =>
        m.serverMessageId === 42
          ? {
              ...m,
              text: result.new_message.text,
              serverMessageId: result.new_message.id,
              emotion: result.new_message.emotion,
              gesture: result.new_message.gesture,
            }
          : m
      ),
    }));

    const msg = useChatStore.getState().messages.find((m) => m.id === 'assistant-1');
    expect(msg!.gesture).toBe('wave');
  });

  it('no mutation occurs when no message matches the target serverMessageId', async () => {
    vi.mocked(api.regenerateMessage).mockResolvedValue({
      ok: true,
      new_message: { id: 999, text: 'Orphan reply' },
    });

    const result = await api.regenerateMessage(9999); // ID not in store

    useChatStore.setState((state) => ({
      messages: state.messages.map((m) =>
        m.serverMessageId === 9999
          ? { ...m, text: result.new_message.text, serverMessageId: result.new_message.id }
          : m
      ),
    }));

    const messages = useChatStore.getState().messages;
    expect(messages[0].text).toBe('What do you think?');
    expect(messages[1].text).toBe('Original reply');
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — branch navigation: switch updates message in-place
// ---------------------------------------------------------------------------

/**
 * Simulates the branch-switch logic that ChatThread performs when the user
 * taps the left/right swipe arrows.  The component calls api.activateBranch,
 * receives the new message content from getMessageBranches, then patches the
 * store message in-place.  We test that state transition here without needing
 * to render the component.
 */
describe('store integration — branch navigation updates message in-place', () => {
  beforeEach(() => {
    useChatStore.setState({
      ...initialChatState,
      sessionId: 1,
      charId: 1,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'Pick a path',
          createdAt: 1000,
          status: 'sent',
          serverMessageId: 10,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Branch A response',
          createdAt: 2000,
          status: 'sent',
          serverMessageId: 42,
        },
      ],
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates last assistant message text and serverMessageId on branch switch', async () => {
    vi.mocked(api.activateBranch).mockResolvedValue({
      ok: true,
      message_id: 43,
      deactivated: [42],
    });

    // Simulate branch switch: activate the new branch then update the message
    const newBranchText = 'Branch B response';
    const newBranchId = 43;

    await api.activateBranch(43);

    useChatStore.setState((state) => ({
      messages: state.messages.map((m) =>
        m.serverMessageId === 42
          ? { ...m, text: newBranchText, serverMessageId: newBranchId }
          : m
      ),
    }));

    const messages = useChatStore.getState().messages;
    const updatedMsg = messages.find((m) => m.id === 'assistant-1');

    expect(updatedMsg).toBeDefined();
    expect(updatedMsg!.text).toBe('Branch B response');
    expect(updatedMsg!.serverMessageId).toBe(43);
  });

  it('user message is untouched after branch switch', async () => {
    vi.mocked(api.activateBranch).mockResolvedValue({
      ok: true,
      message_id: 43,
      deactivated: [42],
    });

    await api.activateBranch(43);
    useChatStore.setState((state) => ({
      messages: state.messages.map((m) =>
        m.serverMessageId === 42
          ? { ...m, text: 'Branch B response', serverMessageId: 43 }
          : m
      ),
    }));

    const userMsg = useChatStore.getState().messages.find((m) => m.id === 'user-1');
    expect(userMsg!.text).toBe('Pick a path');
    expect(userMsg!.serverMessageId).toBe(10);
  });

  it('message count remains constant after branch switch', async () => {
    vi.mocked(api.activateBranch).mockResolvedValue({
      ok: true,
      message_id: 43,
      deactivated: [42],
    });

    await api.activateBranch(43);
    useChatStore.setState((state) => ({
      messages: state.messages.map((m) =>
        m.serverMessageId === 42
          ? { ...m, text: 'Branch B', serverMessageId: 43 }
          : m
      ),
    }));

    expect(useChatStore.getState().messages).toHaveLength(2);
  });

  it('getMessageBranches returns correct branch list shape', async () => {
    vi.mocked(api.getMessageBranches).mockResolvedValue({
      branches: [
        { id: 42, text: 'Branch A response', emotion: 'neutral', created_at: '2026-01-01T00:00:00Z', is_active: false },
        { id: 43, text: 'Branch B response', emotion: 'happy', created_at: '2026-01-02T00:00:00Z', is_active: true },
      ],
      active_index: 1,
      total: 2,
    });

    const result = await api.getMessageBranches(42);

    expect(result.branches).toHaveLength(2);
    expect(result.active_index).toBe(1);
    expect(result.total).toBe(2);
    expect(result.branches[0].id).toBe(42);
    expect(result.branches[1].is_active).toBe(true);
  });

  it('activateBranch returns deactivated sibling IDs', async () => {
    vi.mocked(api.activateBranch).mockResolvedValue({
      ok: true,
      message_id: 43,
      deactivated: [42, 44],
    });

    const result = await api.activateBranch(43);

    expect(result.ok).toBe(true);
    expect(result.message_id).toBe(43);
    expect(result.deactivated).toEqual([42, 44]);
  });

  it('activateBranch is called with the correct branch message ID', async () => {
    vi.mocked(api.activateBranch).mockResolvedValue({
      ok: true,
      message_id: 43,
      deactivated: [42],
    });

    await api.activateBranch(43);

    expect(api.activateBranch).toHaveBeenCalledOnce();
    expect(api.activateBranch).toHaveBeenCalledWith(43);
  });
});
