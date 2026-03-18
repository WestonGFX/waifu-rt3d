import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeLLM, executeLLMStream, getLLMProvider, STREAM_RESET_SENTINEL } from './registry.ts';
import { type CapabilityConfig } from '../types/index.ts';

const baseConfig: CapabilityConfig = {
  primary: 'ollama',
  fallbacks: ['openai'],
  fallbackTriggers: ['error', 'timeout'],
  timeoutMs: 20,
};

const ollama = getLLMProvider('ollama');
const openai = getLLMProvider('openai');

const originalOllamaChat = ollama.chat.bind(ollama);
const originalOpenAIChat = openai.chat.bind(openai);
const originalOllamaStream = ollama.chatStream?.bind(ollama);
const originalOpenAIStream = openai.chatStream?.bind(openai);

function restoreProviderMethods() {
  ollama.chat = originalOllamaChat;
  openai.chat = originalOpenAIChat;
  if (originalOllamaStream) ollama.chatStream = originalOllamaStream;
  if (originalOpenAIStream) openai.chatStream = originalOpenAIStream;
}

afterEach(() => {
  vi.restoreAllMocks();
  restoreProviderMethods();
});

describe('registry fallback executor', () => {
  it('returns primary response when primary succeeds', async () => {
    const fallbackSpy = vi.fn(async () => 'fallback');
    ollama.chat = vi.fn(async () => 'primary');
    openai.chat = fallbackSpy;

    const text = await executeLLM([{ role: 'user', content: 'hello' }], baseConfig);

    expect(text).toBe('primary');
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it('falls back on timeout when timeout trigger is enabled', async () => {
    ollama.chat = vi.fn(() => new Promise<string>(() => {}));
    openai.chat = vi.fn(async () => 'fallback-ok');

    const text = await executeLLM([{ role: 'user', content: 'hi' }], {
      ...baseConfig,
      timeoutMs: 5,
    });

    expect(text).toBe('fallback-ok');
  });

  it('does not fallback on error when error trigger is disabled', async () => {
    ollama.chat = vi.fn(async () => {
      throw new Error('primary exploded');
    });
    openai.chat = vi.fn(async () => 'should-not-run');

    await expect(
      executeLLM(
        [{ role: 'user', content: 'hi' }],
        { ...baseConfig, fallbackTriggers: ['timeout'] },
      ),
    ).rejects.toThrow('primary exploded');

    expect(openai.chat).not.toHaveBeenCalled();
  });

  it('yields reset sentinel when a streaming provider fails mid-stream before fallback', async () => {
    ollama.chatStream = async function* () {
      yield 'partial';
      throw new Error('stream failed');
    };
    openai.chatStream = async function* () {
      yield 'recovered';
    };

    const chunks: string[] = [];
    for await (const chunk of executeLLMStream(
      [{ role: 'user', content: 'hello' }],
      baseConfig,
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['partial', STREAM_RESET_SENTINEL, 'recovered']);
  });

  it('reports aggregated chain errors when all providers fail', async () => {
    ollama.chat = vi.fn(async () => {
      throw new Error('ollama down');
    });
    openai.chat = vi.fn(async () => {
      throw new Error('openai down');
    });

    await expect(
      executeLLM([{ role: 'user', content: 'hello' }], baseConfig),
    ).rejects.toThrow('LLM provider chain failed');
  });
});

