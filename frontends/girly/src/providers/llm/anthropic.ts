/**
 * AnthropicLLMProvider – calls the Anthropic Messages API (Claude).
 *
 * Wire format:
 *   POST https://api.anthropic.com/v1/messages
 *   Headers: x-api-key: <key>, anthropic-version: 2023-06-01
 *   Body:    { model, messages: [{role, content}], max_tokens }
 *   Reply:   content[0].text
 *
 * Anthropic's API REQUIRES max_tokens on every request; we default to 1024
 * when the caller doesn't specify one.
 *
 * The API key is read from apiKeyService at call-time.
 */

import { type LLMProvider, type LLMMetrics } from '../types.ts';
import { type LLMOptions }                   from '../../types/index.ts';
import { getKey }                           from '../../services/apiKeyService.ts';
import { readLines }                        from './streamUtils.ts';

/** Minimal shape we need from the Anthropic response. */
interface AnthropicResponse {
  content: { type: string; text: string }[];
  usage?: { input_tokens: number; output_tokens: number };
}

export class AnthropicLLMProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly label = 'Anthropic (Claude)';
  readonly requiresApiKey = true;

  /** Metrics from the most recent successful chat() call. */
  private lastMetrics: LLMMetrics | undefined;

  /**
   * Send a chat request to Anthropic and return the assistant's response text.
   *
   * @param messages - Full conversation history as role/content pairs.
   * @param options  - Optional model override and max-token limit (default 1024).
   * @returns The generated response string.
   * @throws   If no API key is stored, or on network / API error.
   */
  async chat(
    messages: { role: string; content: string }[],
    options?: LLMOptions,
  ): Promise<string> {
    const key = getKey('anthropic');
    if (!key) throw new Error('Anthropic API key is not set. Save one in Settings → API Keys.');

    const model     = options?.model    ?? 'claude-3-5-haiku-20241022';
    // Anthropic requires max_tokens; default to 1024 if not provided.
    const maxTokens = options?.maxTokens ?? 1024;
    const startMs   = Date.now();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Anthropic returned ${response.status}: ${detail}`);
    }

    const data: AnthropicResponse = await response.json();
    const latencyMs = Date.now() - startMs;

    const totalTokens =
      data.usage
        ? data.usage.input_tokens + data.usage.output_tokens
        : undefined;

    this.lastMetrics = { latencyMs, totalTokens };

    // content is an array of content blocks; the first text block is the reply.
    const textBlock = data.content.find(b => b.type === 'text');
    return textBlock?.text ?? '';
  }

  /** Returns metrics from the most recent chat() call. */
  getLastMetrics(): LLMMetrics | undefined {
    return this.lastMetrics;
  }

  /**
   * Streaming variant – Anthropic SSE uses *named event types* rather than
   * a single `data:` line per chunk.  The relevant events are:
   *   event: message_start        → data contains usage.input_tokens
   *   event: content_block_delta  → data.delta.text is the next text chunk
   *   event: message_delta        → data.usage.output_tokens (final)
   *
   * Because we need the `event:` lines (not just `data:`), we use the
   * lower-level readLines() and maintain a one-line look-back for the
   * current event type.
   *
   * Unlike the non-streaming path, token counts ARE available in streaming
   * mode — input_tokens arrives in message_start and output_tokens in
   * message_delta.
   *
   * @param messages - Full conversation history.
   * @param options  - Optional model / token-limit overrides.
   * @param signal   - AbortSignal for timeout cancellation.
   * @yields Each text chunk as it arrives.
   */
  async *chatStream(
    messages: { role: string; content: string }[],
    options?: LLMOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, unknown> {
    const key = getKey('anthropic');
    if (!key) throw new Error('Anthropic API key is not set. Save one in Settings → API Keys.');

    const model     = options?.model    ?? 'claude-3-5-haiku-20241022';
    const maxTokens = options?.maxTokens ?? 1024;
    const startMs   = Date.now();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
      },
      signal,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream:     true,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Anthropic returned ${response.status}: ${detail}`);
    }

    let currentEvent = '';
    let inputTokens  = 0;
    let outputTokens = 0;

    for await (const line of readLines(response.body!)) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice('event: '.length);
        continue;
      }

      if (!line.startsWith('data: ')) continue;
      const payload = line.slice('data: '.length);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(payload) as any;

      switch (currentEvent) {
        case 'message_start':
          // input_tokens is reported once at the top of the stream.
          inputTokens = data.message?.usage?.input_tokens ?? 0;
          break;

        case 'content_block_delta':
          // Only text deltas contain the actual response text.
          if (data.delta?.type === 'text_delta' && data.delta.text) {
            yield data.delta.text;
          }
          break;

        case 'message_delta':
          // output_tokens is reported once at the end of the stream.
          outputTokens = data.usage?.output_tokens ?? 0;
          break;
      }

      // Reset event label – each event: / data: pair is independent.
      currentEvent = '';
    }

    this.lastMetrics = {
      latencyMs:   Date.now() - startMs,
      totalTokens: inputTokens + outputTokens || undefined,
    };
  }

  /**
   * Lightweight connectivity test – send a minimal messages request with
   * max_tokens=1 and a one-word prompt.  A 200 confirms the key works.
   *
   * @returns true if Anthropic responds with 200.
   */
  async testConnection(): Promise<boolean> {
    const key = getKey('anthropic');
    if (!key) return false;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-3-5-haiku-20241022',
          messages:   [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
