import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveContentCeiling,
  getContentLevelForIntimacy,
  isContentAllowed,
  isCloudProvider,
  hashContentLockPassword,
  verifyContentLockPassword,
  getContentRatingColor,
} from './contentGatingService.ts';
import { type ContentGateConfig } from '../types/content.ts';

const baseConfig: ContentGateConfig = {
  globalContentCeiling: 'explicit',
  ageVerified: true,
  contentLockEnabled: false,
  contentLockPasswordHash: '',
  perPersonaCeilings: {},
};

describe('resolveEffectiveContentCeiling', () => {
  it('returns global ceiling when no persona or provider caps exist', () => {
    expect(resolveEffectiveContentCeiling(baseConfig, undefined, 'ollama')).toBe('explicit');
  });

  it('caps at mature for cloud providers', () => {
    expect(resolveEffectiveContentCeiling(baseConfig, undefined, 'openai')).toBe('mature');
    expect(resolveEffectiveContentCeiling(baseConfig, undefined, 'anthropic')).toBe('mature');
    expect(resolveEffectiveContentCeiling(baseConfig, undefined, 'google')).toBe('mature');
  });

  it('takes the minimum of global and persona ceilings', () => {
    expect(resolveEffectiveContentCeiling(baseConfig, 'edgy', 'ollama')).toBe('edgy');
  });

  it('takes the minimum of all three inputs', () => {
    const config = { ...baseConfig, globalContentCeiling: 'mature' as const };
    expect(resolveEffectiveContentCeiling(config, 'explicit', 'openai')).toBe('mature');
  });
});

describe('getContentLevelForIntimacy', () => {
  it('maps levels to correct rating bands', () => {
    expect(getContentLevelForIntimacy(0)).toBe('general');
    expect(getContentLevelForIntimacy(15)).toBe('general');
    expect(getContentLevelForIntimacy(30)).toBe('edgy');
    expect(getContentLevelForIntimacy(45)).toBe('edgy');
    expect(getContentLevelForIntimacy(60)).toBe('mature');
    expect(getContentLevelForIntimacy(80)).toBe('mature');
    expect(getContentLevelForIntimacy(85)).toBe('explicit');
    expect(getContentLevelForIntimacy(100)).toBe('explicit');
  });
});

describe('isContentAllowed', () => {
  it('allows content at or below ceiling', () => {
    expect(isContentAllowed(20, 'edgy')).toBe(true);
    expect(isContentAllowed(50, 'mature')).toBe(true);
    expect(isContentAllowed(90, 'explicit')).toBe(true);
  });

  it('rejects content above ceiling', () => {
    expect(isContentAllowed(90, 'mature')).toBe(false);
    expect(isContentAllowed(50, 'general')).toBe(false);
  });
});

describe('isCloudProvider', () => {
  it('identifies cloud providers', () => {
    expect(isCloudProvider('openai')).toBe(true);
    expect(isCloudProvider('anthropic')).toBe(true);
    expect(isCloudProvider('google')).toBe(true);
    expect(isCloudProvider('ollama')).toBe(false);
    expect(isCloudProvider('openrouter')).toBe(false);
  });
});

describe('password hashing', () => {
  it('hashes and verifies passwords correctly', async () => {
    const hash = await hashContentLockPassword('testpassword');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyContentLockPassword('testpassword', hash)).toBe(true);
    expect(await verifyContentLockPassword('wrong', hash)).toBe(false);
  });
});

describe('getContentRatingColor', () => {
  it('returns correct labels for each level', () => {
    expect(getContentRatingColor('general').label).toBe('General');
    expect(getContentRatingColor('edgy').label).toBe('Edgy');
    expect(getContentRatingColor('mature').label).toBe('Mature');
    expect(getContentRatingColor('explicit').label).toBe('Explicit');
  });
});
