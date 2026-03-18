import { describe, expect, it } from 'vitest';
import { type ChatMessage } from '../types/index.ts';
import {
  buildMemoryRecords,
  buildThreadSummaryRecord,
  selectRetrievedMemories,
} from './memoryHeuristicsService.ts';

function createMessage(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  timestamp: number,
): ChatMessage {
  return { id, role, content, timestamp };
}

describe('memoryHeuristicsService', () => {
  it('builds a thread summary once the thread is long enough', () => {
    const messages: ChatMessage[] = [
      createMessage('u1', 'user', 'I like strawberry cake and late night cafés.', 1),
      createMessage('a1', 'assistant', 'That sounds cozy. I can remember that.', 2),
      createMessage('u2', 'user', 'My favorite drink is matcha milk tea.', 3),
      createMessage('a2', 'assistant', 'Cute taste. I will keep that in mind.', 4),
      createMessage('u3', 'user', 'Call me Chris when we are being sweet.', 5),
      createMessage('a3', 'assistant', 'Okay, Chris.', 6),
      createMessage('u4', 'user', 'I do not like loud horror movies.', 7),
      createMessage('a4', 'assistant', 'We can avoid those.', 8),
      createMessage('u5', 'user', 'Remember that I want a rainy rooftop date scene later.', 9),
      createMessage('a5', 'assistant', 'Noted.', 10),
      createMessage('u6', 'user', 'What outfit would fit that scene?', 11),
      createMessage('a6', 'assistant', 'A soft coat and scarf would be nice.', 12),
    ];

    const summary = buildThreadSummaryRecord('thread-1', messages, 1, 1000);

    expect(summary).not.toBeNull();
    expect(summary?.summaryText).toContain('I like strawberry cake');
    expect(summary?.notablePreferences.join(' ')).toContain('Favorite drink');
    expect(summary?.unresolvedTopics.join(' ')).toContain('What outfit would fit that scene?');
  });

  it('extracts memory records from user preference and boundary statements', () => {
    const messages: ChatMessage[] = [
      createMessage('u1', 'user', 'I love melon soda and cheesecake.', 1),
      createMessage('u2', 'user', "I don't like spicy ramen.", 2),
      createMessage('u3', 'user', 'Call me captain when I am feeling dramatic.', 3),
    ];

    const records = buildMemoryRecords('persona-asami', 'thread-1', messages, [], 2000);

    expect(records.map((record) => record.kind)).toEqual(
      expect.arrayContaining(['preference', 'boundary', 'relationship']),
    );
    expect(records.map((record) => record.text).join(' | ')).toContain('Enjoys melon soda and cheesecake');
    expect(records.map((record) => record.text).join(' | ')).toContain('Dislikes spicy ramen');
    expect(records.map((record) => record.text).join(' | ')).toContain('Preferred nickname');
  });

  it('retrieves the most relevant memories for the latest user message', () => {
    const memories = [
      {
        id: 'm1',
        personaId: 'persona-asami',
        threadId: 'thread-1',
        kind: 'preference' as const,
        text: 'Enjoys strawberry cake',
        salience: 0.8,
        confidence: 0.8,
        createdAt: 1,
        sourceMessageIds: ['u1'],
      },
      {
        id: 'm2',
        personaId: 'persona-asami',
        threadId: 'thread-1',
        kind: 'callback' as const,
        text: 'Remember to callback to: rainy rooftop date scene',
        salience: 0.7,
        confidence: 0.75,
        createdAt: 2,
        sourceMessageIds: ['u2'],
      },
      {
        id: 'm3',
        personaId: 'persona-asami',
        threadId: 'thread-1',
        kind: 'boundary' as const,
        text: 'Dislikes loud horror movies',
        salience: 0.75,
        confidence: 0.76,
        createdAt: 3,
        sourceMessageIds: ['u3'],
      },
    ];

    const retrieved = selectRetrievedMemories(memories, [
      createMessage('u10', 'user', 'Plan that rainy rooftop date for me again.', 10),
    ]);

    expect(retrieved[0]?.id).toBe('m2');
  });
});
