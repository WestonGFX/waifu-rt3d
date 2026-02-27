import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';

// Mock the entire api module
vi.mock('../lib/api', () => ({
  api: {
    llmGenerate: vi.fn(),
    updateSession: vi.fn().mockResolvedValue({ ok: true }),
    saveConfig: vi.fn().mockResolvedValue({ ok: true, config: {} }),
    getConfig: vi.fn().mockResolvedValue({}),
    getCharacters: vi.fn().mockResolvedValue([]),
  },
}));

/**
 * Helper: build a minimal SSE-like Response body for /api/chat/stream.
 * Emits: generating → token → done events.
 */
function makeFakeStreamResponse(replyText: string): Response {
  const encoder = new TextEncoder();
  const chunks = [
    'event: generating\ndata: {}\n\n',
    `event: token\ndata: ${JSON.stringify({ text: replyText })}\n\n`,
    `event: done\ndata: ${JSON.stringify({ reply: replyText, token_count: 10 })}\n\n`,
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
 * Tests for the auto-title feature in chatStore.sendMessage.
 *
 * After the first exchange (messages.length === 0 before send), the store
 * fires a background api.llmGenerate call to generate a session title.
 * It must NOT fire on subsequent messages.
 */
describe('chatStore — session auto-title', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chat store state
    useChatStore.setState({
      sessionId: 1,
      charId: 99,
      messages: [],
      loading: false,
      draft: '',
      abortController: null,
    });
    vi.mocked(api.llmGenerate).mockResolvedValue({ text: 'A great chat session' });
  });

  it('fires llmGenerate after the first exchange', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(makeFakeStreamResponse('Hello from assistant!')));

    await useChatStore.getState().sendMessage('Hi there');

    // The call is fire-and-forget — wait a tick for microtasks to flush
    await vi.waitFor(() => {
      expect(api.llmGenerate).toHaveBeenCalledTimes(1);
    });

    // Verify it used system + user message format
    const [messages] = vi.mocked(api.llmGenerate).mock.calls[0];
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('Hi there');
  });

  it('saves the generated title via updateSession', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(makeFakeStreamResponse('Hello!')));
    vi.mocked(api.llmGenerate).mockResolvedValue({ text: 'Short Witty Title' });

    await useChatStore.getState().sendMessage('Hello');

    await vi.waitFor(() => {
      expect(api.updateSession).toHaveBeenCalledWith(1, { title: 'Short Witty Title' });
    });
  });

  it('does NOT fire llmGenerate on the second message', async () => {
    // Pre-populate with one message so isFirstExchange is false
    useChatStore.setState({
      messages: [{
        id: 'existing-1',
        role: 'assistant',
        text: 'Previous reply',
        createdAt: Date.now() - 5000,
        status: 'sent',
      }],
    });

    vi.stubGlobal('fetch', () => Promise.resolve(makeFakeStreamResponse('Second reply')));
    await useChatStore.getState().sendMessage('Second message');

    // Give fire-and-forget a chance to run
    await new Promise(r => setTimeout(r, 50));
    expect(api.llmGenerate).not.toHaveBeenCalled();
  });

  it('does NOT fire if sessionId is null', async () => {
    useChatStore.setState({ sessionId: null });
    vi.stubGlobal('fetch', () => Promise.resolve(makeFakeStreamResponse('reply')));

    // sendMessage bails early when sessionId is null, so nothing fires
    await useChatStore.getState().sendMessage('test');
    await new Promise(r => setTimeout(r, 50));
    expect(api.llmGenerate).not.toHaveBeenCalled();
  });
});
