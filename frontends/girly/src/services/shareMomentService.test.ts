import { describe, expect, it } from 'vitest';
import {
  buildShareableMoment,
  buildShareMomentCopy,
  createImportedMessagesFromSharedMoment,
  createShareMomentUrl,
  parseShareMomentFromLocation,
} from './shareMomentService.ts';

describe('shareMomentService', () => {
  it('builds the latest completed user-to-assistant exchange', () => {
    const moment = buildShareableMoment([
      {
        id: 'user-1',
        role: 'user',
        content: 'old',
        timestamp: 1,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'old reply',
        timestamp: 2,
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'Tell me something cute.',
        timestamp: 3,
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'You are doing better than you think.',
        timestamp: 4,
      },
      {
        id: 'assistant-3',
        role: 'assistant',
        content: 'still streaming',
        timestamp: 5,
        isStreaming: true,
      },
    ]);

    expect(moment).not.toBeNull();
    expect(moment?.messages[0].content).toBe('Tell me something cute.');
    expect(moment?.messages[1].content).toBe('You are doing better than you think.');
  });

  it('serializes, parses, and materializes a shared moment', () => {
    const sourceMoment = buildShareableMoment([
      {
        id: 'user-1',
        role: 'user',
        content: 'What should I do today?',
        timestamp: 10,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Make tea, open the app, and flirt with your avatar.',
        timestamp: 11,
      },
    ]);

    expect(sourceMoment).not.toBeNull();

    const shareUrl = createShareMomentUrl(
      sourceMoment!,
      'https://animegirly.app/chat?view=main',
    );
    const parsedMoment = parseShareMomentFromLocation(shareUrl);

    expect(parsedMoment).toEqual(sourceMoment);
    expect(buildShareMomentCopy(parsedMoment!)).toContain('AnimeGirly conversation');

    const importedMessages = createImportedMessagesFromSharedMoment(parsedMoment!);
    expect(importedMessages).toHaveLength(2);
    expect(importedMessages[0].role).toBe('user');
    expect(importedMessages[1].role).toBe('assistant');
  });
});
