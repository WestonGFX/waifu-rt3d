/**
 * Content gating service — ceiling resolution, provider awareness, and password lock.
 *
 * This is the safety-critical layer that determines the maximum content
 * level allowed for any given conversation turn. It considers three inputs:
 *   1. The global content ceiling set by the user.
 *   2. The per-persona content ceiling (if configured).
 *   3. The provider's inherent limit (cloud APIs cap at 'mature').
 *
 * The effective ceiling is always the MINIMUM of all three.
 */

import {
  type ContentGateConfig,
  type ContentRatingLevel,
  CONTENT_RATING_ORDER,
  DEFAULT_INTIMACY_THRESHOLDS,
} from '../types/content.ts';

/** Cloud providers that refuse explicit content and auto-cap at 'mature'. */
const CLOUD_PROVIDER_CEILING: ContentRatingLevel = 'mature';
const CLOUD_PROVIDERS = new Set(['openai', 'anthropic', 'google']);

/**
 * Resolves the effective content ceiling for the current context.
 *
 * @param globalConfig - The user's global content gate configuration.
 * @param personaCeiling - Optional per-persona content ceiling override.
 * @param providerName - The active LLM provider name.
 * @returns The most restrictive (lowest) content ceiling.
 *
 * @example
 * >>> resolveEffectiveContentCeiling(config, 'explicit', 'ollama')
 * 'explicit'  // local provider, no cloud cap
 *
 * >>> resolveEffectiveContentCeiling(config, 'explicit', 'openai')
 * 'mature'  // cloud provider caps at 'mature'
 */
export function resolveEffectiveContentCeiling(
  globalConfig: ContentGateConfig,
  personaCeiling: ContentRatingLevel | undefined,
  providerName: string,
): ContentRatingLevel {
  const ceilings: ContentRatingLevel[] = [globalConfig.globalContentCeiling];

  if (personaCeiling) {
    ceilings.push(personaCeiling);
  }

  if (CLOUD_PROVIDERS.has(providerName)) {
    ceilings.push(CLOUD_PROVIDER_CEILING);
  }

  // Return the minimum ceiling (lowest index in the order array).
  let minIndex = CONTENT_RATING_ORDER.length - 1;
  for (const ceiling of ceilings) {
    const index = CONTENT_RATING_ORDER.indexOf(ceiling);
    if (index >= 0 && index < minIndex) {
      minIndex = index;
    }
  }

  return CONTENT_RATING_ORDER[minIndex];
}

/**
 * Maps an intimacy level (0-100) to the appropriate ContentRatingLevel.
 *
 * @param intimacyLevel - Current intimacy score.
 * @returns The content rating band the intimacy level falls into.
 */
export function getContentLevelForIntimacy(intimacyLevel: number): ContentRatingLevel {
  const { flirty, suggestive, heavyPhysical } = DEFAULT_INTIMACY_THRESHOLDS;

  if (intimacyLevel < flirty[1]) return 'general';
  if (intimacyLevel < suggestive[1]) return 'edgy';
  if (intimacyLevel < heavyPhysical[1]) return 'mature';
  return 'explicit';
}

/**
 * Checks whether the current intimacy level is allowed under the effective ceiling.
 *
 * @param intimacyLevel - Current intimacy score (0-100).
 * @param effectiveCeiling - The resolved effective content ceiling.
 * @returns True if the intimacy level's content band is at or below the ceiling.
 */
export function isContentAllowed(
  intimacyLevel: number,
  effectiveCeiling: ContentRatingLevel,
): boolean {
  const currentLevel = getContentLevelForIntimacy(intimacyLevel);
  const currentIndex = CONTENT_RATING_ORDER.indexOf(currentLevel);
  const ceilingIndex = CONTENT_RATING_ORDER.indexOf(effectiveCeiling);
  return currentIndex <= ceilingIndex;
}

/**
 * Returns whether a given provider is a cloud provider that caps content.
 *
 * @param providerName - The provider name to check.
 * @returns True if the provider is cloud-based and content-capped.
 */
export function isCloudProvider(providerName: string): boolean {
  return CLOUD_PROVIDERS.has(providerName);
}

/**
 * Hashes a content lock password using Web Crypto API (SHA-256).
 *
 * @param password - Plain-text password to hash.
 * @returns Hex-encoded SHA-256 hash.
 */
export async function hashContentLockPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies a password against a stored hash.
 *
 * @param input - The password attempt.
 * @param storedHash - The stored SHA-256 hex hash.
 * @returns True if the input matches the stored hash.
 */
export async function verifyContentLockPassword(
  input: string,
  storedHash: string,
): Promise<boolean> {
  const inputHash = await hashContentLockPassword(input);
  return inputHash === storedHash;
}

/**
 * Returns the display color class for a content rating badge.
 *
 * @param level - The content rating level.
 * @returns Tailwind color class string.
 */
export function getContentRatingColor(level: ContentRatingLevel): {
  bg: string;
  text: string;
  label: string;
} {
  switch (level) {
    case 'general':
      return { bg: 'bg-emerald-500', text: 'text-emerald-700', label: 'General' };
    case 'edgy':
      return { bg: 'bg-yellow-500', text: 'text-yellow-700', label: 'Edgy' };
    case 'mature':
      return { bg: 'bg-orange-500', text: 'text-orange-700', label: 'Mature' };
    case 'explicit':
      return { bg: 'bg-red-500', text: 'text-red-700', label: 'Explicit' };
  }
}
