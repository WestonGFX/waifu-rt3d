/**
 * Scenario Generator Service.
 *
 * Takes a ScenarioConfig from the wizard and calls the LLM to produce
 * a system prompt and opening message for a new roleplay scenario.
 *
 * The generation prompt is carefully structured to get high-quality,
 * in-character outputs regardless of which LLM is backing the request.
 */

import { type ProviderConfig } from '../types/index.ts';
import { type ScenarioConfig, type ScenarioOutput } from '../types/scenario.ts';
import { executeLLM } from '../providers/registry.ts';

/**
 * Build the meta-prompt that instructs the LLM to generate a scenario.
 *
 * @param config - User-configured scenario parameters from the wizard.
 * @returns A system prompt string for the generation call.
 */
function buildGenerationPrompt(config: ScenarioConfig): string {
  const characterDescriptions = config.characters
    .map((c, i) => `  ${i + 1}. **${c.name}** (${c.role}): ${c.personality}`)
    .join('\n');

  return [
    'You are a creative writing assistant specializing in roleplay scenario design.',
    'Generate a roleplay scenario based on the following configuration:',
    '',
    `**Genre**: ${config.genre}`,
    `**Setting**: ${config.setting}`,
    `**Mood**: ${config.mood}`,
    `**Conflict/Hook**: ${config.conflict || 'None specified — create an interesting hook'}`,
    `**Content Rating**: ${config.maturityRating}`,
    '',
    '**Characters**:',
    characterDescriptions || '  (Use the default AI companion character)',
    '',
    'Respond with EXACTLY this format (no markdown code fences, no extra text):',
    '',
    'SYSTEM_PROMPT_START',
    '[Write a detailed system prompt for the AI character. Include personality traits, speech patterns, relationship context, the setting details, and any scenario-specific instructions. Write in second person addressing the AI character. 150-300 words.]',
    'SYSTEM_PROMPT_END',
    '',
    'OPENING_MESSAGE_START',
    '[Write the AI character\'s opening message to start the scenario. Set the scene, establish the mood, and give the user something to respond to. Write in first person as the character. 50-150 words.]',
    'OPENING_MESSAGE_END',
  ].join('\n');
}

/**
 * Parse the LLM output to extract the system prompt and opening message.
 *
 * @param raw - Raw LLM response text.
 * @returns Parsed system prompt and opening message, or null if parsing fails.
 */
function parseGenerationOutput(raw: string): { systemPrompt: string; openingMessage: string } | null {
  const systemMatch = raw.match(/SYSTEM_PROMPT_START\s*([\s\S]*?)\s*SYSTEM_PROMPT_END/);
  const openingMatch = raw.match(/OPENING_MESSAGE_START\s*([\s\S]*?)\s*OPENING_MESSAGE_END/);

  if (!systemMatch || !openingMatch) return null;

  return {
    systemPrompt: systemMatch[1].trim(),
    openingMessage: openingMatch[1].trim(),
  };
}

/**
 * Generate a complete scenario from the user's wizard configuration.
 *
 * Calls the configured LLM provider to produce a system prompt and
 * opening message based on the scenario parameters.
 *
 * @param config - Scenario configuration from the wizard.
 * @param providerConfig - Current provider configuration for the LLM call.
 * @returns A fully populated ScenarioOutput ready to use.
 * @throws If the LLM call fails or the output can't be parsed.
 *
 * @example
 *   const scenario = await generateScenario(config, appState.providerConfig);
 *   // scenario.systemPrompt → use as persona system prompt
 *   // scenario.openingMessage → first message in the new thread
 */
export async function generateScenario(
  config: ScenarioConfig,
  providerConfig: ProviderConfig,
): Promise<ScenarioOutput> {
  const prompt = buildGenerationPrompt(config);

  const response = await executeLLM(
    [{ role: 'user', content: prompt }],
    providerConfig.llm,
    undefined,
    providerConfig.providerOptions,
  );

  const parsed = parseGenerationOutput(response);

  if (!parsed) {
    // Fallback: use the entire response as the system prompt.
    return {
      id: `scenario-${Date.now()}`,
      config,
      systemPrompt: response.trim(),
      openingMessage: `*${config.characters[0]?.name ?? 'She'} looks at you with interest.* "Hey... want to hang out?"`,
      createdAt: Date.now(),
    };
  }

  return {
    id: `scenario-${Date.now()}`,
    config,
    systemPrompt: parsed.systemPrompt,
    openingMessage: parsed.openingMessage,
    createdAt: Date.now(),
  };
}

/** Genre presets with display labels and emoji hints. */
export const GENRE_PRESETS: { id: string; label: string; hint: string }[] = [
  { id: 'romance', label: 'Romance', hint: 'Love, dates, confession scenes' },
  { id: 'slice-of-life', label: 'Slice of Life', hint: 'Everyday moments, cozy hangouts' },
  { id: 'fantasy', label: 'Fantasy', hint: 'Magic, quests, mythical worlds' },
  { id: 'sci-fi', label: 'Sci-Fi', hint: 'Space, cyberpunk, future tech' },
  { id: 'mystery', label: 'Mystery', hint: 'Puzzles, secrets, investigation' },
  { id: 'horror', label: 'Horror', hint: 'Creepy, supernatural, survival' },
  { id: 'comedy', label: 'Comedy', hint: 'Funny situations, misunderstandings' },
  { id: 'drama', label: 'Drama', hint: 'Emotional, conflict-driven stories' },
  { id: 'action', label: 'Action', hint: 'Fights, chases, high stakes' },
];

/** Mood presets with display labels. */
export const MOOD_PRESETS: { id: string; label: string }[] = [
  { id: 'cozy', label: 'Cozy & warm' },
  { id: 'dramatic', label: 'Dramatic & tense' },
  { id: 'mysterious', label: 'Mysterious & intriguing' },
  { id: 'lighthearted', label: 'Lighthearted & fun' },
  { id: 'intense', label: 'Intense & serious' },
  { id: 'melancholic', label: 'Melancholic & bittersweet' },
  { id: 'playful', label: 'Playful & flirty' },
];
