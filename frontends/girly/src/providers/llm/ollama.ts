/**
 * OllamaLLMProvider – calls the local Ollama HTTP API.
 *
 * Ollama exposes a chat endpoint at:
 *   POST http://localhost:11434/api/chat
 *
 * The default port (11434) and model ("llama3.2") can be overridden
 * via the LLMOptions passed to chat().
 *
 * Why stream: false in Phase 1:
 *   Streaming would require the chat UI to render partial tokens as they
 *   arrive, adding complexity to MessageBubble.  A single complete response
 *   per bubble is simpler and sufficient for v1.0.  Streaming is a Phase 2
 *   enhancement.
 */

import { type LLMProvider, type LLMMetrics } from '../types.ts';
import { type LLMOptions } from '../../types/index.ts';
import { readLines } from './streamUtils.ts';

/** Response shape returned by Ollama /api/chat (stream: false). */
interface OllamaResponse {
  model: string;
  created_at: string;
  message: { role: string; content: string };
  done: boolean;
  /** Total generation time in nanoseconds (if reported). */
  total_duration?: number;
  /** Number of tokens generated (if reported). */
  eval_count?: number;
  /** Duration of token evaluation in nanoseconds (if reported). */
  eval_duration?: number;
}

export class OllamaLLMProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly label = 'Ollama (local)';
  readonly requiresApiKey = false;

  /** Base URL for the Ollama API – always localhost. */
  private readonly baseUrl: string;
  /** Metrics from the most recent successful chat() call. */
  private lastMetrics: LLMMetrics | undefined;

  /**
   * @param baseUrl - Ollama API root. Defaults to http://localhost:11434.
   */
  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  /**
   * Send a chat request to Ollama and return the assistant's response text.
   *
   * @param messages - Full conversation history as role/content pairs.
   * @param options  - Optional model override and max-token limit.
   * @returns The generated response string.
   * @throws   On network failure or non-200 status.
   *
   * @example
   *   const provider = new OllamaLLMProvider();
   *   const reply = await provider.chat([{ role: 'user', content: 'Hello!' }]);
   */
  async chat(
    messages: { role: string; content: string }[],
    options?: LLMOptions,
  ): Promise<string> {
    const model = options?.model ?? 'llama3.2';
    const startMs = Date.now();

    const body = JSON.stringify({
      model,
      messages,
      stream: false,
      // Ollama accepts "options.num_predict" for max tokens.
      ...(options?.maxTokens != null && { options: { num_predict: options.maxTokens } }),
    });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Ollama returned ${response.status}: ${detail}`);
    }

    const data: OllamaResponse = await response.json();
    const latencyMs = Date.now() - startMs;

    // Store metrics for dev-mode telemetry.
    this.lastMetrics = {
      latencyMs,
      totalTokens: data.eval_count,
      // tokens/sec = eval_count / (eval_duration_ns / 1e9)
      tokensPerSecond: data.eval_count != null && data.eval_duration != null
        ? Math.round(data.eval_count / (data.eval_duration / 1e9))
        : undefined,
    };

    return data.message.content;
  }

  /**
   * Returns metrics from the most recent chat() call.
   */
  getLastMetrics(): LLMMetrics | undefined {
    return this.lastMetrics;
  }

  /**
   * Streaming variant – Ollama returns NDJSON when stream is true (or
   * omitted, since true is the default).  Each line is a complete JSON
   * object; the final one has done: true and carries eval metrics.
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
    const model   = options?.model ?? 'llama3.2';
    const startMs = Date.now();

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...(options?.maxTokens != null && { options: { num_predict: options.maxTokens } }),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Ollama returned ${response.status}: ${detail}`);
    }

    // Each line is a standalone JSON object.  The last one (done: true)
    // carries the generation metrics.
    for await (const line of readLines(response.body!)) {
      if (!line) continue; // skip blank lines

      const obj = JSON.parse(line) as {
        message: { content: string };
        done: boolean;
        eval_count?: number;
        eval_duration?: number;
      };

      if (obj.done) {
        // Final object – store metrics and finish.
        this.lastMetrics = {
          latencyMs: Date.now() - startMs,
          totalTokens: obj.eval_count,
          tokensPerSecond:
            obj.eval_count != null && obj.eval_duration != null
              ? Math.round(obj.eval_count / (obj.eval_duration / 1e9))
              : undefined,
        };
        return;
      }

      yield obj.message.content;
    }
  }

  /**
   * Lightweight connectivity test – calls GET /api/tags which lists
   * locally pulled models.  Returns true if Ollama responds with 200.
   */
  async testConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }
}
