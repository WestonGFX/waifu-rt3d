/**
 * OpenAILLMProvider – calls the OpenAI Chat Completions API.
 *
 * Wire format:
 *   POST https://api.openai.com/v1/chat/completions
 *   Headers: Authorization: Bearer <key>
 *   Body:    { model, messages: [{role, content}], stream: false }
 *   Reply:   choices[0].message.content
 *
 * The API key is read from apiKeyService at call-time so that UI updates
 * take effect immediately.  An error is thrown if no key is stored.
 */

import { type LLMProvider, type LLMMetrics } from '../types.ts';
import { type LLMOptions }                   from '../../types/index.ts';
import { getKey }                           from '../../services/apiKeyService.ts';
import { readSSEData }                      from './streamUtils.ts';

/** Minimal shape we need from the OpenAI response. */
interface OpenAIResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export class OpenAILLMProvider implements LLMProvider {
  readonly name = 'openai';
  readonly label = 'OpenAI';
  readonly requiresApiKey = true;

  /** Metrics from the most recent successful chat() call. */
  private lastMetrics: LLMMetrics | undefined;

  /**
   * Send a chat request to OpenAI and return the assistant's response text.
   *
   * @param messages - Full conversation history as role/content pairs.
   * @param options  - Optional model override and max-token limit.
   * @returns The generated response string.
   * @throws   If no API key is stored, or on network / API error.
   */
  async chat(
    messages: { role: string; content: string }[],
    options?: LLMOptions,
  ): Promise<string> {
    const key = getKey('openai');
    if (!key) throw new Error('OpenAI API key is not set. Save one in Settings → API Keys.');

    const model = options?.model ?? 'gpt-4o-mini';
    const startMs = Date.now();

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };
    if (options?.maxTokens != null) body.max_tokens = options.maxTokens;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI returned ${response.status}: ${detail}`);
    }

    const data: OpenAIResponse = await response.json();
    const latencyMs = Date.now() - startMs;

    const totalTokens =
      data.usage
        ? data.usage.prompt_tokens + data.usage.completion_tokens
        : undefined;

    this.lastMetrics = { latencyMs, totalTokens };

    return data.choices[0]?.message?.content ?? '';
  }

  /** Returns metrics from the most recent chat() call. */
  getLastMetrics(): LLMMetrics | undefined {
    return this.lastMetrics;
  }

  /**
   * Streaming variant – OpenAI SSE format.  Each "data:" line contains a
   * choices[0].delta.content chunk.  The stream ends with "data: [DONE]".
   *
   * Note: OpenAI does not include usage stats in streaming mode, so
   * lastMetrics.totalTokens will be undefined after a streamed request.
   *
   * @param messages - Full conversation history.
   * @param options  - Optional model / token-limit overrides.
   * @param signal   - AbortSignal for timeout cancellation.
   * @yields Each content chunk as it arrives.
   */
  async *chatStream(
    messages: { role: string; content: string }[],
    options?: LLMOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, unknown> {
    const key = getKey('openai');
    if (!key) throw new Error('OpenAI API key is not set. Save one in Settings → API Keys.');

    const model   = options?.model ?? 'gpt-4o-mini';
    const startMs = Date.now();

    const body: Record<string, unknown> = { model, messages, stream: true };
    if (options?.maxTokens != null) body.max_tokens = options.maxTokens;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI returned ${response.status}: ${detail}`);
    }

    for await (const payload of readSSEData(response.body!)) {
      const data = JSON.parse(payload) as {
        choices: { delta: { content?: string }; finish_reason: string | null }[];
      };

      const content = data.choices[0]?.delta?.content;
      if (content) yield content;
    }

    // No usage data available in streaming mode.
    this.lastMetrics = { latencyMs: Date.now() - startMs, totalTokens: undefined };
  }

  /**
   * Lightweight connectivity test – GET /v1/models returns 200 when
   * the key is valid and the account is active.
   *
   * @returns true if OpenAI responds with 200.
   */
  async testConnection(): Promise<boolean> {
    const key = getKey('openai');
    if (!key) return false;
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${key}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
