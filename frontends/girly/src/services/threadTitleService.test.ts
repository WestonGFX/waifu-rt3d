import { describe, expect, it, vi } from 'vitest';
import {
  buildHeuristicThreadTitle,
  buildTimestampThreadTitle,
  generateThreadTitleWithLLM,
} from './threadTitleService.ts';

vi.mock('../providers/registry.ts', () => ({
  executeLLM: vi.fn(async () => '"Rainy Day Mischief"'),
}));

describe('threadTitleService', () => {
  it('builds a heuristic title from the first non-empty user message', () => {
    const title = buildHeuristicThreadTitle([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Hi there',
        timestamp: 1,
      },
      {
        id: 'user-1',
        role: 'user',
        content: '   Plan a dramatic rooftop confession scene for us.   ',
        timestamp: 2,
      },
    ]);

    expect(title).toBe('Plan a dramatic rooftop confession scene…');
  });

  it('formats a stable timestamp fallback title', () => {
    const title = buildTimestampThreadTitle(Date.UTC(2026, 2, 8, 3, 41, 0));
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
  });

  it('asks the LLM for a concise title and cleans wrapping quotes', async () => {
    const title = await generateThreadTitleWithLLM(
      {
        id: 'thread-1',
        title: 'New conversation',
        titleSource: 'timestamp',
        personaId: 'persona-1',
        voiceProfileId: 'voice-1',
        archived: false,
        createdAt: 1,
        updatedAt: 1,
        summaryVersion: 0,
        promptSnapshotId: 'prompt-1',
      },
      [
        {
          id: 'user-1',
          role: 'user',
          content: 'Suggest a playful rainy-day date idea for us.',
          timestamp: 1,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Let us build a blanket fort, brew cocoa, and play card games.',
          timestamp: 2,
        },
      ],
      {
        id: 'persona-1',
        name: 'Reina',
        archetype: 'onee-san',
        worldSetting: 'A stylish city apartment',
        relationshipPremise: 'A steady romantic bond',
        toneGuide: 'Warm, teasing, and composed.',
        initiativeLevel: 0.7,
        affectionLevel: 0.8,
        flirtLevel: 0.6,
        memoryPriorities: ['dates', 'comfort rituals'],
        generatedSystemPrompt: 'Be warm and composed.',
      },
      {
        llm: { primary: 'ollama', fallbacks: [], fallbackTriggers: ['error'], timeoutMs: 20000 },
        stt: { primary: 'webSpeech', fallbacks: [], fallbackTriggers: ['error'], timeoutMs: 10000 },
        tts: { primary: 'webSpeech', fallbacks: [], fallbackTriggers: ['error'], timeoutMs: 10000 },
        animation: { primary: 'deterministic', fallbacks: [], fallbackTriggers: ['error'], timeoutMs: 10000 },
        providerOptions: {},
      },
    );

    expect(title).toBe('Rainy Day Mischief');
  });
});
