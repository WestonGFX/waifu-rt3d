import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AVATAR_TUNING,
  createAssistantAvatarState,
  createInitialAvatarRuntime,
  parseAssistantPerformance,
  resolveAvatarPresentation,
  sanitizeAssistantVisibleText,
} from './avatarPerformanceService.ts';

describe('avatarPerformanceService', () => {
  it('extracts inline performance tags and strips them from visible text', () => {
    const parsed = parseAssistantPerformance(
      'Hi there!\n<anime-performance emotion="warm" energy="0.61" intimacy="0.74" gesture="handToHeart" gaze="camera" talkIntensity="0.58" reaction="softSmile" idle="cozy" sceneBeat="reassure" />',
    );

    expect(parsed.visibleText).toBe('Hi there!');
    expect(parsed.source).toBe('inline');
    expect(parsed.metadata.emotion).toBe('warm');
    expect(parsed.metadata.gesture).toBe('handToHeart');
    expect(parsed.metadata.sceneBeat).toBe('reassure');
  });

  it('hides partial performance tags during streaming sanitization', () => {
    expect(sanitizeAssistantVisibleText('Hello there<anime-')).toBe('Hello there');
    expect(
      sanitizeAssistantVisibleText(
        'Hello there\n<anime-performance emotion="playful"',
      ),
    ).toBe('Hello there');
  });

  it('derives reacting then idle presentation from assistant state timestamps', () => {
    const initial = createInitialAvatarRuntime(DEFAULT_AVATAR_TUNING, 1_000);
    const responseState = createAssistantAvatarState(
      initial,
      'hello',
      'Cute reply!\n<anime-performance emotion="playful" energy="0.68" intimacy="0.63" gesture="point" gaze="soft" talkIntensity="0.55" reaction="giggle" idle="curious" sceneBeat="tease" />',
      DEFAULT_AVATAR_TUNING,
      2_000,
    );

    const reactingFrame = resolveAvatarPresentation(responseState, 2_100);
    const idleFrame = resolveAvatarPresentation(responseState, (responseState.settleUntil ?? 2_000) + 10);

    expect(reactingFrame.phase).toBe('reacting');
    expect(reactingFrame.reactionBlend).toBeGreaterThan(0);
    expect(idleFrame.phase).toBe('idle');
  });
});
