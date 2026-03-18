import { describe, expect, it } from 'vitest';
import { buildContextBudgetBreakdown } from './contextBudgetService.ts';

describe('buildContextBudgetBreakdown', () => {
  it('includes room, stage, provider, and routing segments when that context is present', () => {
    const breakdown = buildContextBudgetBreakdown({
      persona: {
        id: 'persona-1',
        name: 'Asami',
        archetype: 'custom',
        dereTypes: ['kuudere'],
        tagline: 'Calm and observant.',
        shortBio: '',
        backstory: '',
        characterFacts: [],
        worldSetting: '',
        relationshipPremise: '',
        toneGuide: '',
        initiativeLevel: 0.4,
        affectionLevel: 0.4,
        flirtLevel: 0.2,
        memoryPriorities: [],
        generatedSystemPrompt: 'Stay warm and observant.',
        createdAt: 1,
        updatedAt: 1,
      },
      summaries: [
        {
          threadId: 'thread-1',
          summaryVersion: 1,
          summaryText: 'The user likes quiet rainy-day scenes.',
          relationshipState: 'friendly',
          unresolvedTopics: [],
          notablePreferences: [],
          updatedAt: 1,
        },
      ],
      retrievedMemories: [
        {
          id: 'memory-1',
          personaId: 'persona-1',
          threadId: 'thread-1',
          kind: 'preference',
          text: 'Prefers calm lighting and soft piano.',
          salience: 0.8,
          confidence: 0.9,
          createdAt: 1,
          sourceMessageIds: [],
        },
      ],
      recentMessages: [
        {
          id: 'message-1',
          role: 'user',
          content: 'Let us stay in the bedroom for now.',
          timestamp: 1,
        },
      ],
      currentEnvironment: {
        id: 'room-1',
        name: 'Minimalistic Modern Bedroom',
        url: '/scene.glb',
        source: 'local-library',
        category: 'bedroom',
        recommended: true,
      },
      roomRuntime: {
        roomMode: 'looking',
        currentAnchorId: 'window-side',
        currentHotspotId: 'nightstand',
        familiarity: 0.64,
        environmentName: 'Minimalistic Modern Bedroom',
      },
      runtimeDescriptor: {
        providerId: 'ollama',
        modelId: 'llama3.2',
        fallbackChain: ['openai'],
        fallbackTriggers: ['error', 'timeout'],
        contextWindow: 4096,
      },
      contextWindow: 4096,
    });

    expect(breakdown.segments.map((segment) => segment.id)).toEqual([
      'persona',
      'summaries',
      'memory',
      'recent',
      'room',
      'staging',
      'provider',
      'routing',
      'free',
      'response',
    ]);

    expect(breakdown.segments.find((segment) => segment.id === 'room')?.tokens).toBeGreaterThan(0);
    expect(breakdown.segments.find((segment) => segment.id === 'staging')?.tokens).toBeGreaterThan(0);
    expect(breakdown.segments.find((segment) => segment.id === 'provider')?.tokens).toBeGreaterThan(0);
    expect(breakdown.segments.find((segment) => segment.id === 'routing')?.tokens).toBeGreaterThan(0);
  });

  it('omits optional room and runtime metadata segments when that context is absent', () => {
    const breakdown = buildContextBudgetBreakdown({
      persona: null,
      summaries: [],
      retrievedMemories: [],
      recentMessages: [],
      contextWindow: 4096,
    });

    expect(breakdown.segments.map((segment) => segment.id)).toEqual([
      'persona',
      'summaries',
      'memory',
      'recent',
      'free',
      'response',
    ]);
  });
});
