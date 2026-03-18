/**
 * OpenRouterLLMProvider – calls the OpenRouter API.
 *
 * OpenRouter is an aggregator that exposes an OpenAI-compatible wire format,
 * so the body / reply shape is identical to OpenAILLMProvider.  Two small
 * differences:
 *   - Base URL is https://openrouter.ai/api/v1
 *   - An HTTP-Referer header identifies the app (required by OpenRouter).
 *
 * The API key is read from apiKeyService at call-time.
 */

import { type LLMProvider, type LLMMetrics } from '../types.ts';
import { type LLMOptions }                   from '../../types/index.ts';
import { getKey }                           from '../../services/apiKeyService.ts';
import { readSSEData }                      from './streamUtils.ts';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/** Minimal shape we need from the OpenRouter (OpenAI-compat) response. */
interface OpenRouterResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export class OpenRouterLLMProvider implements LLMProvider {
  readonly name = 'openrouter';
  readonly label = 'OpenRouter';
  readonly requiresApiKey = true;

  /** Metrics from the most recent successful chat() call. */
  private lastMetrics: LLMMetrics | undefined;

  /**
   * Send a chat request to OpenRouter and return the assistant's response text.
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
    const key = getKey('openrouter');
    if (!key) throw new Error('OpenRouter API key is not set. Save one in Settings → API Keys.');

    const model   = options?.model ?? 'openai/gpt-4o-mini';
    const startMs = Date.now();

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };
    if (options?.maxTokens != null) body.max_tokens = options.maxTokens;

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer':  'AnimeGirly',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenRouter returned ${response.status}: ${detail}`);
    }

    const data: OpenRouterResponse = await response.json();
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
   * Streaming variant – OpenRouter uses the same SSE format as OpenAI
   * (choices[0].delta.content + [DONE] sentinel).  The only differences
   * from OpenAI are the base URL and the HTTP-Referer header, both
   * already present in the non-streaming chat().
   *
   * Like OpenAI, usage stats are not available in streaming mode.
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
    const key = getKey('openrouter');
    if (!key) throw new Error('OpenRouter API key is not set. Save one in Settings → API Keys.');

    const model   = options?.model ?? 'openai/gpt-4o-mini';
    const startMs = Date.now();

    const body: Record<string, unknown> = { model, messages, stream: true };
    if (options?.maxTokens != null) body.max_tokens = options.maxTokens;

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer':  'AnimeGirly',
      },
      signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenRouter returned ${response.status}: ${detail}`);
    }

    for await (const payload of readSSEData(response.body!)) {
      const data = JSON.parse(payload) as {
        choices: { delta: { content?: string }; finish_reason: string | null }[];
      };

      const content = data.choices[0]?.delta?.content;
      if (content) yield content;
    }

    this.lastMetrics = { latencyMs: Date.now() - startMs, totalTokens: undefined };
  }

  /**
   * Lightweight connectivity test – GET /api/v1/models is a public endpoint
   * (no auth needed) that returns the list of available models.  A 200
   * confirms OpenRouter is reachable; we also do a quick key-presence check
   * so the UI can show "no key" vs "unreachable" distinctly.
   *
   * @returns true if a key is stored AND OpenRouter is reachable.
   */
  async testConnection(): Promise<boolean> {
    const key = getKey('openrouter');
    if (!key) return false;
    try {
      const res = await fetch(`${OPENROUTER_BASE}/models`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }
}
