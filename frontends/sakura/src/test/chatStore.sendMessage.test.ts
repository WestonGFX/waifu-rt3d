import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';

/**
 * Mock the entire api module to prevent real network calls.
 * kokoroFinalize is included because the 'done' SSE event fires
 * finalizeKokoroTurn fire-and-forget — we suppress it to keep tests clean.
 */
vi.mock('../lib/api', () => ({
  api: {
    llmGenerate: vi.fn(),
    updateSession: vi.fn().mockResolvedValue({ ok: true }),
    saveConfig: vi.fn().mockResolvedValue({ ok: true, config: {} }),
    getConfig: vi.fn().mockResolvedValue({}),
    getCharacters: vi.fn().mockResolvedValue([]),
    kokoroFinalize: vi.fn().mockResolvedValue({ ok: false, payload: null }),
  },
}));

/**
 * Mock viewerStore to prevent postMessage calls to a non-existent iframe in
 * jsdom. setCurrentEmotion dispatches into viewerStore; without this mock the
 * dispatchExpression / dispatchSetPersonality calls throw and can shadow
 * assertion failures in tests that emit emotion data.
 */
vi.mock('../stores/viewerStore', () => ({
  useViewerStore: {
    getState: () => ({
      dispatchExpression: vi.fn(),
      dispatchSetPersonality: vi.fn(),
      dispatchSetJiggleEmotionMultiplier: vi.fn(),
      dispatchTriggerSequence: vi.fn(),
      dispatchKokoroEmbodiment: vi.fn(),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/**
 * Build a minimal SSE Response that emits the standard generating → token(s)
 * → done sequence.
 *
 * @param tokenChunks - Array of token strings emitted as individual 'token'
 *   events.  The final 'done' event sets `reply` to `cleanReply`, which may
 *   differ from the concatenated `tokenChunks` to exercise the clean_reply
 *   precedence logic.
 * @param cleanReply - The `reply` field in the `done` event payload.  The
 *   store should always prefer this over the accumulated fullText.
 */
function makeStreamResponse(tokenChunks: string[], cleanReply?: string): Response {
  const finalReply = cleanReply ?? tokenChunks.join('');
  const chunks: string[] = [
    'event: generating\ndata: {}\n\n',
    ...tokenChunks.map(t => `event: token\ndata: ${JSON.stringify({ t })}\n\n`),
    `event: done\ndata: ${JSON.stringify({
      reply: finalReply,
      token_count: tokenChunks.length,
      assistant_message_id: 42,
    })}\n\n`,
  ];

  let i = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/**
 * Build a fetch stub that returns the given Response for /api/chat/stream and
 * a harmless stub for the fire-and-forget /api/context-budget/<id> call that
 * sendMessage fires after every stream completes.
 */
function makeFetchStub(chatResponse: Response) {
  return vi.fn((url: string) => {
    if (typeof url === 'string' && url.includes('context-budget')) {
      // Return usage_pct below the 85% threshold so auto-compact doesn't fire.
      return Promise.resolve(
        new Response(JSON.stringify({ usage_pct: 10 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
    return Promise.resolve(chatResponse);
  });
}

/**
 * Shared baseline store state.  Pre-populates one existing message so that
 * isFirstExchange is false, suppressing auto-title in tests that don't care
 * about it.  Tests that need first-exchange behaviour reset `messages: []`
 * themselves.
 */
const BASE_STATE = {
  sessionId: 1,
  charId: 99,
  messages: [
    {
      id: 'existing-1',
      role: 'assistant' as const,
      text: 'Hi there!',
      createdAt: Date.now() - 10_000,
      status: 'sent' as const,
    },
  ],
  loading: false,
  draft: '',
  abortController: null,
  currentEmotion: null,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('chatStore — sendMessage SSE flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState(BASE_STATE);
    vi.mocked(api.llmGenerate).mockResolvedValue({ text: 'Auto title' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // 1. Normal SSE happy path
  // -------------------------------------------------------------------------

  it('adds user and assistant messages and sets loading=true, then loading=false after completion', async () => {
    vi.stubGlobal('fetch', makeFetchStub(makeStreamResponse(['Hello ', 'there'])));

    // Snapshot loading state right after calling sendMessage (before await)
    const sendPromise = useChatStore.getState().sendMessage('Hello!');

    // State is updated synchronously before the first await in sendMessage
    // (the set() call happens before the fetch), so we can check it immediately.
    expect(useChatStore.getState().loading).toBe(true);
    const msgs = useChatStore.getState().messages;
    // BASE_STATE has 1 existing message; should now have 3 (existing + user + assistant)
    expect(msgs).toHaveLength(3);
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].text).toBe('Hello!');
    expect(msgs[2].role).toBe('assistant');
    expect(msgs[2].status).toBe('pending');

    await sendPromise;

    // After completion, loading should be false
    expect(useChatStore.getState().loading).toBe(false);
  });

  it('assistant message starts as pending and ends as sent after stream completes', async () => {
    // The store sets status='pending' synchronously before fetch, then 'streaming'
    // during token events, then 'sent' on 'done'. We verify the initial pending
    // state synchronously and the final sent state after await.
    vi.stubGlobal(
      'fetch',
      makeFetchStub(makeStreamResponse(['hi'], 'hi'))
    );

    const sendPromise = useChatStore.getState().sendMessage('ping');

    // Synchronously: assistant message should be 'pending' right after the
    // set() call that happens before the first await in sendMessage.
    const msgsBefore = useChatStore.getState().messages;
    const asstBefore = msgsBefore.find(m => m.role === 'assistant' && m.text === '')!;
    expect(asstBefore.status).toBe('pending');

    await sendPromise;

    // After completion the message should be 'sent' with the reply text.
    const finalMsgs = useChatStore.getState().messages;
    // Find by serverMessageId since text may have been updated
    const finalAsst = finalMsgs.find(m => m.role === 'assistant' && m.serverMessageId === 42)!;
    expect(finalAsst.status).toBe('sent');
    expect(finalAsst.text).toBe('hi');
  });

  it('final status is sent, loading is false after stream completes', async () => {
    vi.stubGlobal('fetch', makeFetchStub(makeStreamResponse(['Hello ', 'world'])));

    await useChatStore.getState().sendMessage('Hi');

    expect(useChatStore.getState().loading).toBe(false);
    const msgs = useChatStore.getState().messages;
    const asst = msgs.find(m => m.role === 'assistant' && m.text !== 'Hi there!')!;
    expect(asst.status).toBe('sent');
    expect(asst.serverMessageId).toBe(42);
  });

  it('posts the correct JSON body to /api/chat/stream', async () => {
    const fetchSpy = makeFetchStub(makeStreamResponse(['response text']));
    vi.stubGlobal('fetch', fetchSpy);

    await useChatStore.getState().sendMessage('Test message');

    const chatCall = fetchSpy.mock.calls.find(([url]) => url === '/api/chat/stream') as [string, RequestInit] | undefined;
    expect(chatCall).toBeTruthy();
    const body = JSON.parse(chatCall![1].body as string);
    expect(body.text).toBe('Test message');
    expect(body.session_id).toBe(1);
    expect(body.character_id).toBe(99);
  });

  // -------------------------------------------------------------------------
  // 2. done event uses clean_reply over streamed fullText
  // -------------------------------------------------------------------------

  it('uses clean_reply from done event, not the raw accumulated token text', async () => {
    // Tokens stream 'raw streamed text', but done overrides with 'clean reply'
    vi.stubGlobal(
      'fetch',
      makeFetchStub(makeStreamResponse(['raw ', 'streamed ', 'text'], 'clean reply'))
    );

    await useChatStore.getState().sendMessage('Tell me something');

    const msgs = useChatStore.getState().messages;
    const asst = msgs.find(m => m.role === 'assistant' && m.text !== 'Hi there!')!;
    expect(asst.text).toBe('clean reply');
  });

  it('falls back to accumulated fullText when done.reply is absent', async () => {
    // Build a stream where done has no reply field
    const chunks = [
      'event: generating\ndata: {}\n\n',
      `event: token\ndata: ${JSON.stringify({ t: 'token one ' })}\n\n`,
      `event: token\ndata: ${JSON.stringify({ t: 'token two' })}\n\n`,
      // done without reply
      `event: done\ndata: ${JSON.stringify({ token_count: 2, assistant_message_id: 77 })}\n\n`,
    ];
    let i = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
        else controller.close();
      },
    });

    vi.stubGlobal('fetch', makeFetchStub(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })));

    await useChatStore.getState().sendMessage('Fallback test');

    const msgs = useChatStore.getState().messages;
    const asst = msgs.find(m => m.role === 'assistant' && m.serverMessageId === 77)!;
    expect(asst.text).toBe('token one token two');
  });

  // -------------------------------------------------------------------------
  // 3. incognito=true — userMsg NOT added to store
  // -------------------------------------------------------------------------

  it('incognito=true does not add user message, only assistant message', async () => {
    vi.stubGlobal('fetch', makeFetchStub(makeStreamResponse(['Incognito reply'])));

    const before = useChatStore.getState().messages.length; // 1 (existing)

    await useChatStore.getState().sendMessage('Secret thought', true, true);

    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(before + 1); // N+1, not N+2
    // The new message should be the assistant reply
    const newMsg = msgs[msgs.length - 1];
    expect(newMsg.role).toBe('assistant');
    expect(newMsg.status).toBe('sent');
  });

  it('incognito=false adds both user and assistant messages', async () => {
    vi.stubGlobal('fetch', makeFetchStub(makeStreamResponse(['Normal reply'])));

    const before = useChatStore.getState().messages.length; // 1 (existing)

    await useChatStore.getState().sendMessage('Visible thought', true, false);

    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(before + 2); // N+2
    expect(msgs[msgs.length - 2].role).toBe('user');
    expect(msgs[msgs.length - 1].role).toBe('assistant');
  });

  it('incognito does not include a visible user bubble with the sent text', async () => {
    vi.stubGlobal('fetch', makeFetchStub(makeStreamResponse(['reply'])));

    await useChatStore.getState().sendMessage('Hidden text', true, true);

    const msgs = useChatStore.getState().messages;
    const userBubble = msgs.find(m => m.role === 'user' && m.text === 'Hidden text');
    expect(userBubble).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 4. Abort mid-stream
  // -------------------------------------------------------------------------

  it('abort marks assistant message as sent with partial/cancelled text, loading=false', async () => {
    // Use a fetch that hangs at the network level — never resolves — so we
    // can call abortMessage() while sendMessage is waiting for the response.
    // The AbortController's signal will cause fetch to reject with AbortError.
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: RequestInit) => {
        if (typeof url === 'string' && url.includes('context-budget')) {
          return Promise.resolve(new Response(JSON.stringify({ usage_pct: 10 }), { status: 200 }));
        }
        // Return a promise that rejects with AbortError when the signal fires
        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const err = new DOMException('The user aborted a request.', 'AbortError');
            reject(err);
          });
        });
      })
    );

    const sendPromise = useChatStore.getState().sendMessage('Will be aborted');

    // sendMessage is now hung waiting for fetch — loading should be true
    expect(useChatStore.getState().loading).toBe(true);
    expect(useChatStore.getState().abortController).not.toBeNull();

    // Abort mid-flight
    useChatStore.getState().abortMessage();

    await sendPromise;

    expect(useChatStore.getState().loading).toBe(false);
    const msgs = useChatStore.getState().messages;
    const asst = msgs.find(m => m.role === 'assistant' && m.text !== 'Hi there!')!;
    // Per the actual implementation: AbortError sets status='sent' with text=fullText||'(cancelled)'
    expect(asst.status).toBe('sent');
    // fullText is empty since we never got tokens, so text is '(cancelled)'
    expect(asst.text).toBe('(cancelled)');
  });

  it('abortMessage clears abortController and sets loading=false immediately', async () => {
    // Same hanging-fetch approach — abort while waiting for the response.
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: RequestInit) => {
        if (typeof url === 'string' && url.includes('context-budget')) {
          return Promise.resolve(new Response(JSON.stringify({ usage_pct: 10 }), { status: 200 }));
        }
        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The user aborted a request.', 'AbortError'));
          });
        });
      })
    );

    const sendPromise = useChatStore.getState().sendMessage('Test abort');

    // Synchronously, loading=true and abortController is set
    expect(useChatStore.getState().loading).toBe(true);
    expect(useChatStore.getState().abortController).not.toBeNull();

    // abortMessage() sets loading=false and clears the controller synchronously
    useChatStore.getState().abortMessage();

    expect(useChatStore.getState().abortController).toBeNull();
    expect(useChatStore.getState().loading).toBe(false);

    await sendPromise;
  });

  // -------------------------------------------------------------------------
  // 5. Error handling — fetch rejects
  // -------------------------------------------------------------------------

  it('when fetch rejects, loading goes false and assistant message gets failed status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));

    await useChatStore.getState().sendMessage('Will fail');

    expect(useChatStore.getState().loading).toBe(false);
    const msgs = useChatStore.getState().messages;
    const asst = msgs.find(m => m.role === 'assistant' && m.text !== 'Hi there!')!;
    expect(asst.status).toBe('failed');
    expect(asst.text).toContain('Failed to get response');
    expect(asst.text).toContain('Network down');
  });

  it('when server returns non-200, loading goes false and message gets failed status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 }))
    );

    await useChatStore.getState().sendMessage('Bad server');

    expect(useChatStore.getState().loading).toBe(false);
    const msgs = useChatStore.getState().messages;
    const asst = msgs.find(m => m.role === 'assistant' && m.text !== 'Hi there!')!;
    expect(asst.status).toBe('failed');
  });

  it('SSE error event sets assistant message to failed status', async () => {
    const chunks = [
      'event: generating\ndata: {}\n\n',
      `event: error\ndata: ${JSON.stringify({ error: 'Model not loaded' })}\n\n`,
    ];
    let i = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
        else controller.close();
      },
    });

    vi.stubGlobal('fetch', makeFetchStub(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })));

    await useChatStore.getState().sendMessage('Error test');

    const msgs = useChatStore.getState().messages;
    const asst = msgs.find(m => m.role === 'assistant' && m.text !== 'Hi there!')!;
    expect(asst.status).toBe('failed');
    expect(asst.text).toContain('Model not loaded');
  });

  // -------------------------------------------------------------------------
  // 6. Guard conditions — early exit
  // -------------------------------------------------------------------------

  it('does nothing when sessionId is null', async () => {
    useChatStore.setState({ sessionId: null });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await useChatStore.getState().sendMessage('Should not send');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useChatStore.getState().loading).toBe(false);
  });

  it('does nothing when charId is null', async () => {
    useChatStore.setState({ charId: null });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await useChatStore.getState().sendMessage('Should not send');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does nothing when already loading', async () => {
    useChatStore.setState({ loading: true });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await useChatStore.getState().sendMessage('Should not send');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('trims whitespace and ignores blank messages', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await useChatStore.getState().sendMessage('   ');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sets draft to empty string when message is sent', async () => {
    useChatStore.setState({ draft: 'Some in-progress text' });
    vi.stubGlobal('fetch', makeFetchStub(makeStreamResponse(['reply'])));

    await useChatStore.getState().sendMessage('Actual message');

    expect(useChatStore.getState().draft).toBe('');
  });

  // -------------------------------------------------------------------------
  // 7. Token accumulation and serverMessageId
  // -------------------------------------------------------------------------

  it('accumulates streamed tokens in assistant message text', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchStub(makeStreamResponse(['Hello', ', ', 'world', '!'], 'Hello, world!'))
    );

    await useChatStore.getState().sendMessage('Multi-token message');

    const msgs = useChatStore.getState().messages;
    const asst = msgs.find(m => m.role === 'assistant' && m.serverMessageId === 42)!;
    expect(asst.text).toBe('Hello, world!');
  });

  it('stores serverMessageId from done event payload', async () => {
    vi.stubGlobal('fetch', makeFetchStub(makeStreamResponse(['text'], 'text')));

    await useChatStore.getState().sendMessage('Check server ID');

    const msgs = useChatStore.getState().messages;
    const asst = msgs.find(m => m.role === 'assistant' && m.text !== 'Hi there!')!;
    expect(asst.serverMessageId).toBe(42);
  });
});
