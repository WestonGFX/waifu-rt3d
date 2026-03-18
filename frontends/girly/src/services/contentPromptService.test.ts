import { describe, it, expect } from 'vitest';
import {
  buildContentDirectiveBlock,
  buildPhysicalAwarenessBlock,
  buildSensoryWritingBlock,
  buildIntimacyGateBlock,
} from './contentPromptService.ts';
import { DEFAULT_PHYSICAL_STATE, DEFAULT_SENSORY_WRITING_CONFIG } from '../types/content.ts';

describe('buildContentDirectiveBlock', () => {
  it('produces general-safe directive for general ceiling', () => {
    const block = buildContentDirectiveBlock('general', 0);
    expect(block).toContain('Family-friendly');
    expect(block).toContain('General');
  });

  it('produces explicit directive for explicit ceiling', () => {
    const block = buildContentDirectiveBlock('explicit', 90);
    expect(block).toContain('Explicit');
    expect(block).toContain('Fully explicit');
  });

  it('includes intimacy note when level > 0', () => {
    const block = buildContentDirectiveBlock('mature', 50);
    expect(block).toContain('emotional closeness: 50/100');
  });

  it('does not include intimacy note when level is 0', () => {
    const block = buildContentDirectiveBlock('mature', 0);
    expect(block).not.toContain('emotional closeness');
  });
});

describe('buildPhysicalAwarenessBlock', () => {
  it('includes clothing and context', () => {
    const state = {
      ...DEFAULT_PHYSICAL_STATE,
      physicalContext: 'cuddling on the sofa',
      companionClothing: 'sundress',
      userClothing: 't-shirt and jeans',
    };
    const block = buildPhysicalAwarenessBlock(state);
    expect(block).toContain('cuddling on the sofa');
    expect(block).toContain('sundress');
    expect(block).toContain('t-shirt and jeans');
  });

  it('includes recent actions when present', () => {
    const state = {
      ...DEFAULT_PHYSICAL_STATE,
      recentActions: ['leans closer', 'places hand on shoulder'],
    };
    const block = buildPhysicalAwarenessBlock(state);
    expect(block).toContain('leans closer');
    expect(block).toContain('places hand on shoulder');
  });
});

describe('buildSensoryWritingBlock', () => {
  it('returns empty when disabled', () => {
    expect(buildSensoryWritingBlock(DEFAULT_SENSORY_WRITING_CONFIG, 50)).toBe('');
  });

  it('returns empty when no channels are enabled', () => {
    const config = { ...DEFAULT_SENSORY_WRITING_CONFIG, enabled: true };
    expect(buildSensoryWritingBlock(config, 50)).toBe('');
  });

  it('produces block with active channels', () => {
    const config = {
      ...DEFAULT_SENSORY_WRITING_CONFIG,
      enabled: true,
      emphasis: {
        ...DEFAULT_SENSORY_WRITING_CONFIG.emphasis,
        touch: true,
        scent: true,
      },
    };
    const block = buildSensoryWritingBlock(config, 50);
    expect(block).toContain('touch');
    expect(block).toContain('scent');
    expect(block).toContain('Sensory Writing');
  });
});

describe('buildIntimacyGateBlock', () => {
  it('returns empty for general ceiling with low intimacy', () => {
    expect(buildIntimacyGateBlock(5, 'general')).toBe('');
  });

  it('produces flirty guidance at low intimacy', () => {
    const block = buildIntimacyGateBlock(15, 'edgy');
    expect(block).toContain('light flirting');
    expect(block).toContain('should not yet');
  });

  it('produces suggestive guidance at mid intimacy', () => {
    const block = buildIntimacyGateBlock(45, 'mature');
    expect(block).toContain('flirt openly');
  });

  it('produces explicit guidance at high intimacy with explicit ceiling', () => {
    const block = buildIntimacyGateBlock(90, 'explicit');
    expect(block).toContain('deep intimacy');
    expect(block).toContain('consensual');
  });
});
