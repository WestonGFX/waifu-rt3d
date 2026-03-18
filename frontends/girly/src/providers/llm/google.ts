/**
 * GoogleLLMProvider – calls the Google Generative AI (Gemini) API.
 *
 * Wire format (differs from every other provider):
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=<key>
 *   Body:  { contents: [ { role: "user"|"model", parts: [{ text }] } ] }
 *   Reply: candidates[0].content.parts[0].text
 *
 * Key differences vs the OpenAI-style providers:
 *   - The API key is passed as a QUERY PARAMETER, not a header.
 *   - The "assistant" role is called "model" in Gemini's schema.
 *   - Message content is wrapped in a `parts` array even for plain text.
 *
 * The API key is read from apiKeyService at call-time.
 */

import { type LLMProvider, type LLMMetrics } from '../types.ts';
import { type LLMOptions }                   from '../../types/index.ts';
import { getKey }                           from '../../services/apiKeyService.ts';
import { readSSEData }                      from './streamUtils.ts';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Minimal response shape from Gemini generateContent. */
interface GeminiResponse {
  candidates?: {
    content: {
      parts: { text: string }[];
    };
  }[];
  usageMetadata?: {
    promptTokenCount:    number;
    candidateTokenCount: number;
  };
}

/** Gemini role name – "user" stays the same, "assistant" becomes "model". */
function toGeminiRole(role: string): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

export class GoogleLLMProvider implements LLMProvider {
  readonly name = 'google';
  readonly label = 'Google (Gemini)';
  readonly requiresApiKey = true;

  /** Metrics from the most recent successful chat() call. */
  private lastMetrics: LLMMetrics | undefined;

  /**
   * Send a chat request to Google Gemini and return the assistant's response text.
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
    const key = getKey('google');
    if (!key) throw new Error('Google API key is not set. Save one in Settings → API Keys.');

    const model   = options?.model ?? 'gemini-2.0-flash';
    const startMs = Date.now();

    // Convert messages into Gemini's contents / parts format.
    const contents = messages.map(m => ({
      role:  toGeminiRole(m.role),
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = { contents };
    // Gemini supports generationConfig.maxOutputTokens for token limiting.
    if (options?.maxTokens != null) {
      body.generationConfig = { maxOutputTokens: options.maxTokens };
    }

    const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${key}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Google Gemini returned ${response.status}: ${detail}`);
    }

    const data: GeminiResponse = await response.json();
    const latencyMs = Date.now() - startMs;

    const totalTokens =
      data.usageMetadata
        ? data.usageMetadata.promptTokenCount + data.usageMetadata.candidateTokenCount
        : undefined;

    this.lastMetrics = { latencyMs, totalTokens };

    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  /** Returns metrics from the most recent chat() call. */
  getLastMetrics(): LLMMetrics | undefined {
    return this.lastMetrics;
  }

  /**
   * Streaming variant – Google's streaming endpoint swaps the URL action
   * from `:generateContent` to `:streamGenerateContent`.  The SSE payload
   * shape is identical to the non-streaming response (candidates[0]…).
   *
   * Two small differences from OpenAI-style SSE:
   *   - There is no `[DONE]` sentinel; the stream simply ends.
   *   - `usageMetadata` is only present on the *last* SSE event.
   *
   * We pass skipDone=false to readSSEData so it does not wait for a
   * sentinel that will never come.
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
    const key = getKey('google');
    if (!key) throw new Error('Google API key is not set. Save one in Settings → API Keys.');

    const model   = options?.model ?? 'gemini-2.0-flash';
    const startMs = Date.now();

    const contents = messages.map(m => ({
      role:  toGeminiRole(m.role),
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = { contents };
    if (options?.maxTokens != null) {
      body.generationConfig = { maxOutputTokens: options.maxTokens };
    }

    // :streamGenerateContent is the streaming action endpoint.
    const url = `${GEMINI_BASE_URL}/models/${model}:streamGenerateContent?key=${key}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Google Gemini returned ${response.status}: ${detail}`);
    }

    let totalTokens: number | undefined;

    // skipDone = false – Google's stream has no [DONE] sentinel.
    for await (const payload of readSSEData(response.body!, false)) {
      const data = JSON.parse(payload) as GeminiResponse;

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) yield text;

      // usageMetadata only appears on the final event.
      if (data.usageMetadata) {
        totalTokens =
          data.usageMetadata.promptTokenCount +
          data.usageMetadata.candidateTokenCount;
      }
    }

    this.lastMetrics = { latencyMs: Date.now() - startMs, totalTokens };
  }

  /**
   * Lightweight connectivity test – GET /v1beta/models?key=<key> lists
   * available models.  A 200 confirms the key is valid.
   *
   * @returns true if Google responds with 200.
   */
  async testConnection(): Promise<boolean> {
    const key = getKey('google');
    if (!key) return false;
    try {
      const res = await fetch(`${GEMINI_BASE_URL}/models?key=${key}`, {
        method: 'GET',
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
