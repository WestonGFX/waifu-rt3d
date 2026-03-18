/**
 * Content prompt service — builds prompt injection blocks for content gating,
 * physical awareness, sensory writing, and intimacy gates.
 *
 * These blocks are injected into the prompt assembly pipeline between
 * the persona prompt and conversation history. They shape the LLM's
 * output without the user ever seeing them.
 */

import {
  type ContentRatingLevel,
  type PhysicalState,
  type SensoryWritingConfig,
} from '../types/content.ts';

/**
 * Builds the content directive block that enforces the content rating.
 *
 * This is the primary safety enforcement — it tells the LLM what level
 * of content is permitted and what to avoid.
 *
 * @param ceiling - The effective content ceiling for this turn.
 * @param intimacyLevel - Current intimacy score (0-100).
 * @returns Prompt text to inject, or empty string if no directive needed.
 */
export function buildContentDirectiveBlock(
  ceiling: ContentRatingLevel,
  intimacyLevel: number,
): string {
  const directives: Record<ContentRatingLevel, string> = {
    general: [
      '[Content Rating: General — Family-friendly mode]',
      'Keep all content appropriate for all ages.',
      'No sexual content, innuendo, or suggestive descriptions.',
      'Physical contact limited to friendly gestures (handshakes, high-fives, brief hugs).',
      'Romance may be hinted at through emotional warmth but never physical descriptions.',
    ].join('\n'),

    edgy: [
      '[Content Rating: Edgy — Moderate romantic content permitted]',
      'Light flirting, teasing, and romantic tension are encouraged.',
      'Physical affection is allowed (hand-holding, cuddling, light kissing).',
      'No explicit sexual content or detailed physical descriptions.',
      'Emotional intimacy and longing can be explored freely.',
    ].join('\n'),

    mature: [
      '[Content Rating: Mature — Romantic and sensual content permitted]',
      'Passionate physical intimacy is allowed (kissing, touching, embracing).',
      'Sensual descriptions and emotional/physical desire can be expressed.',
      'Suggestive content and innuendo are welcome.',
      'Stop short of explicitly graphic sexual descriptions.',
      'Prioritize emotional connection and character chemistry.',
    ].join('\n'),

    explicit: [
      '[Content Rating: Explicit — Fully explicit content permitted]',
      'All forms of consensual intimate content are allowed.',
      'Detailed physical descriptions and explicit scenes are permitted.',
      'Always prioritize emotional connection and character authenticity.',
      'The intimacy should feel earned and natural to the relationship.',
      'Maintain consistent characterization even in explicit scenes.',
    ].join('\n'),
  };

  const baseDirective = directives[ceiling];
  const intimacyNote = intimacyLevel > 0
    ? `\nCurrent emotional closeness: ${intimacyLevel}/100. Let this naturally inform the warmth and openness of your responses.`
    : '';

  return baseDirective + intimacyNote;
}

/**
 * Builds a physical scene awareness block for maintaining continuity.
 *
 * Only injected when intimacy is above 30 (suggestive threshold),
 * to avoid wasting context tokens on physical state during casual chat.
 *
 * @param physicalState - Current physical state to describe.
 * @returns Prompt text describing the physical scene, or empty string.
 */
export function buildPhysicalAwarenessBlock(
  physicalState: PhysicalState,
): string {
  const parts: string[] = [
    '[Physical Scene Context — maintain consistency, never reference this block directly]',
  ];

  if (physicalState.physicalContext) {
    parts.push(`Setting: ${physicalState.physicalContext}`);
  }

  parts.push(`Your clothing: ${physicalState.companionClothing}`);
  parts.push(`Their clothing: ${physicalState.userClothing}`);

  if (physicalState.recentActions.length > 0) {
    parts.push(`Recent physical actions: ${physicalState.recentActions.join('; ')}`);
  }

  return parts.join('\n');
}

/**
 * Builds sensory writing direction block.
 *
 * Tells the LLM which sensory channels to emphasize in its prose
 * and at what intensity level.
 *
 * @param config - Sensory writing configuration.
 * @param intimacyLevel - Current intimacy score (modulates intensity).
 * @returns Prompt text for sensory writing guidance, or empty string if disabled.
 */
export function buildSensoryWritingBlock(
  config: SensoryWritingConfig,
  intimacyLevel: number,
): string {
  if (!config.enabled) return '';

  const activeChannels = Object.entries(config.emphasis)
    .filter(([, enabled]) => enabled)
    .map(([channel]) => channel);

  if (activeChannels.length === 0) return '';

  // Scale intensity with intimacy for natural escalation
  const effectiveIntensity = Math.min(10, config.intensity + Math.floor(intimacyLevel / 20));

  const parts = [
    '[Sensory Writing Direction — enrich descriptions with these senses]',
    `Active senses: ${activeChannels.join(', ')}`,
    `Descriptive intensity: ${effectiveIntensity}/10`,
    'Weave sensory details naturally into the narrative.',
    'Don\'t list sensations mechanically — let them emerge through the scene.',
  ];

  return parts.join('\n');
}

/**
 * Builds an intimacy gate block that guides content escalation.
 *
 * This tells the LLM what level of physical/romantic content is
 * currently appropriate based on the intimacy score and ceiling,
 * providing graduated "you may" / "you should not yet" guidance.
 *
 * @param intimacyLevel - Current intimacy score (0-100).
 * @param ceiling - Effective content ceiling.
 * @returns Prompt text for intimacy gating, or empty string if general.
 */
export function buildIntimacyGateBlock(
  intimacyLevel: number,
  ceiling: ContentRatingLevel,
): string {
  if (ceiling === 'general' && intimacyLevel < 10) return '';

  const parts = ['[Intimacy Gate — natural escalation guidance, never reference directly]'];

  if (intimacyLevel < 30) {
    parts.push(
      'You may: light flirting, teasing, playful banter, warm eye contact.',
      'You should not yet: initiate physical contact beyond casual gestures.',
    );
  } else if (intimacyLevel < 60) {
    parts.push(
      'You may: flirt openly, tease physically, hold hands, lean close, light touching.',
      'You should not yet: initiate passionate kissing or intimate touching.',
    );
  } else if (intimacyLevel < 85) {
    parts.push(
      'You may: passionate kissing, intimate touching, sensual descriptions, close physical contact.',
    );
    if (ceiling === 'mature' || ceiling === 'explicit') {
      parts.push('You may describe desire and physical sensations with tasteful detail.');
    }
    parts.push('You should not yet: describe fully explicit sexual acts.');
  } else {
    if (ceiling === 'explicit') {
      parts.push(
        'The relationship has reached deep intimacy.',
        'You may: express any form of consensual physical intimacy with emotional authenticity.',
        'Always prioritize the emotional connection — physical acts should feel meaningful.',
      );
    } else {
      parts.push(
        'The relationship has reached deep intimacy.',
        'You may: passionate physical affection, intense emotional and sensual descriptions.',
        'Stay within the current content rating — imply rather than describe explicit acts.',
      );
    }
  }

  return parts.join('\n');
}
