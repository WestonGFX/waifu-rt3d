/**
 * Shared streaming utilities for LLM providers.
 *
 * All cloud + local providers that support streaming need to:
 *   1. Read a ReadableStream<Uint8Array> from a fetch() response body.
 *   2. Decode the bytes to UTF-8 text.
 *   3. Split the text into complete lines, buffering across read() boundaries
 *      (a single read() call may split a line in the middle).
 *
 * Two exported generators handle this:
 *   - readLines  – yields every complete line from the stream.  Used directly
 *                  by Ollama (NDJSON) and Anthropic (needs raw event: lines).
 *   - readSSEData – wraps readLines, filters to "data: …" lines, strips the
 *                   prefix, and skips the "[DONE]" sentinel used by
 *                   OpenAI-compatible APIs.  Used by OpenAI, OpenRouter, Google.
 *
 * Why async generators instead of callbacks:
 *   Generators let the caller control backpressure naturally with for-await.
 *   There is no need for an event emitter, promise queue, or manual state
 *   machine — the language does the work.
 */

/**
 * Yields every complete text line from a ReadableStream<Uint8Array>.
 *
 * Handles the common edge cases:
 *   - Lines split across multiple read() chunks.
 *   - \r\n line endings (strips trailing \r).
 *   - Trailing content after the last newline (flushed when stream closes).
 *   - Empty lines (yielded as empty strings — callers filter as needed).
 *
 * @param body - The response body stream from a fetch() call.
 * @yields Each complete line, without the line terminator.
 *
 * @example
 *   const res = await fetch(url);
 *   for await (const line of readLines(res.body!)) {
 *     console.log(line);
 *   }
 */
export async function* readLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let buffer    = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      // Flush any remaining content that wasn't terminated by a newline.
      if (buffer.length > 0) yield buffer;
      return;
    }

    buffer += decoder.decode(value, { stream: true });

    // Split on newlines and yield every complete line.
    // The last element is always the incomplete remainder (or '' if the
    // chunk ended exactly on a newline).
    const lines = buffer.split('\n');
    buffer = lines.pop()!; // keep the incomplete tail

    for (const line of lines) {
      // Strip trailing \r so callers don't have to think about \r\n.
      yield line.endsWith('\r') ? line.slice(0, -1) : line;
    }
  }
}

/**
 * Yields the payload portion of every SSE "data:" line in a stream.
 *
 * SSE format (per the W3C spec):
 *   data: {"choices":[…]}\n\n
 *   data: {"choices":[…]}\n\n
 *   data: [DONE]\n\n          ← OpenAI sentinel; skipped when skipDone is false
 *
 * This generator:
 *   - Filters out blank lines and any non-"data:" lines (e.g. "event:",
 *     "id:", comments starting with ":").  Callers that need those lines
 *     (e.g. Anthropic, which uses "event:" to distinguish event types)
 *     should use readLines directly.
 *   - Strips the "data: " prefix.
 *   - Optionally skips the literal string "[DONE]" (set skipDone = false
 *     to yield it; Google's stream has no such sentinel).
 *
 * @param body     - The response body stream.
 * @param skipDone - If true (default), the "[DONE]" sentinel is silently
 *                   dropped.  Set to false for providers that do not emit it.
 * @yields The raw payload string after "data: ", ready to JSON.parse().
 *
 * @example
 *   for await (const payload of readSSEData(res.body!)) {
 *     const obj = JSON.parse(payload);
 *   }
 */
export async function* readSSEData(
  body: ReadableStream<Uint8Array>,
  skipDone = true,
): AsyncGenerator<string, void, unknown> {
  for await (const line of readLines(body)) {
    if (!line.startsWith('data: ')) continue;

    const payload = line.slice('data: '.length);

    if (skipDone && payload === '[DONE]') continue;

    yield payload;
  }
}
