import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../lib/api';

/**
 * Reply-Assist Tier 2 — verify the api.generateQuickReplies wrapper forwards
 * the new `opts.count` (2 or 3) and `opts.userPersona` correctly into the
 * `/api/llm/generate` request body, and that the system + user prompt vary
 * with count and persona presence.
 *
 * Stubs `fetch` directly so we exercise the real api method (not a mock).
 */
describe('Reply-Assist Tier 2 — generateQuickReplies request shape', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: '["a","b","c"]' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function getRequestBody(): {
    messages: Array<{ role: string; content: string }>;
    max_tokens: number;
    temperature: number;
  } {
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    return JSON.parse((init as RequestInit).body as string);
  }

  it('defaults to count=3 when opts is omitted (back-compat)', async () => {
    await api.generateQuickReplies('hi', 'Aria', 'Chris');
    const body = getRequestBody();

    expect(body.max_tokens).toBe(120);
    expect(body.messages[0].content).toContain('exactly 3 short reply suggestions');
    expect(body.messages[0].content).toContain('JSON array of 3 strings');
    expect(body.messages[1].content).toContain('Generate 3 short replies');
    // 3-tone rule kept intact
    expect(body.messages[0].content).toContain('warm/affectionate');
    expect(body.messages[0].content).toContain('curious/engaged');
    expect(body.messages[0].content).toContain('playful/teasing');
  });

  it('forwards count=2 into the system + user prompts and trims max_tokens', async () => {
    await api.generateQuickReplies('hi', 'Aria', 'Chris', { count: 2 });
    const body = getRequestBody();

    expect(body.max_tokens).toBe(90);
    expect(body.messages[0].content).toContain('exactly 2 short reply suggestions');
    expect(body.messages[0].content).toContain('JSON array of 2 strings');
    expect(body.messages[1].content).toContain('Generate 2 short replies');
  });

  it('uses 2-tone rule when count=2 (drops the 3rd tone)', async () => {
    await api.generateQuickReplies('hi', 'Aria', 'Chris', { count: 2 });
    const body = getRequestBody();

    expect(body.messages[0].content).toContain('warm/curious');
    expect(body.messages[0].content).toContain('playful/teasing');
    expect(body.messages[0].content).not.toContain('warm/affectionate');
    expect(body.messages[0].content).not.toContain('curious/engaged');
  });

  it('injects userPersona into the user message as [About the user]: prefix', async () => {
    await api.generateQuickReplies('hi', 'Aria', 'Chris', {
      userPersona: '25yo guy who likes anime and gaming',
    });
    const body = getRequestBody();

    expect(body.messages[1].content).toMatch(
      /^\[About the user\]: 25yo guy who likes anime and gaming\n/,
    );
    // Persona prefix sits ABOVE the character-said line
    expect(body.messages[1].content).toContain('Aria just said:');
  });

  it('omits the persona prefix when userPersona is empty / whitespace-only', async () => {
    await api.generateQuickReplies('hi', 'Aria', 'Chris', { userPersona: '   ' });
    const body = getRequestBody();

    expect(body.messages[1].content).not.toContain('[About the user]:');
    // User content still starts with "Aria just said:"
    expect(body.messages[1].content.startsWith('Aria just said:')).toBe(true);
  });

  it('combines count=2 with persona injection (both forwarded together)', async () => {
    await api.generateQuickReplies('hi', 'Aria', 'Chris', {
      count: 2,
      userPersona: 'sleepy biologist who only chats at 2am',
    });
    const body = getRequestBody();

    expect(body.max_tokens).toBe(90);
    expect(body.messages[0].content).toContain('exactly 2 short reply suggestions');
    expect(body.messages[1].content).toContain(
      '[About the user]: sleepy biologist who only chats at 2am',
    );
    expect(body.messages[1].content).toContain('Generate 2 short replies');
  });
});
