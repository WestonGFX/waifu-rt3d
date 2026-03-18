/**
 * Types for the Scenario Generator Wizard.
 *
 * A scenario packages a genre, setting, mood, conflict, and character
 * descriptions into a ready-to-use system prompt and opening message.
 * Users walk through a multi-step wizard to configure these, then the
 * LLM generates the scenario content.
 */

/** Content maturity rating — matches the app-wide convention. */
export type ContentRating = 'general' | 'edgy' | 'mature';

/** Genre presets for the scenario wizard. */
export type ScenarioGenre =
  | 'romance'
  | 'slice-of-life'
  | 'fantasy'
  | 'sci-fi'
  | 'mystery'
  | 'horror'
  | 'comedy'
  | 'drama'
  | 'action'
  | 'custom';

/** Mood presets that shape the tone of the generated scenario. */
export type ScenarioMood =
  | 'cozy'
  | 'dramatic'
  | 'mysterious'
  | 'lighthearted'
  | 'intense'
  | 'melancholic'
  | 'playful'
  | 'custom';

/** A character slot in the scenario configuration. */
export interface ScenarioCharacter {
  name: string;
  role: string;
  personality: string;
}

/** User's choices from the wizard, before LLM generation. */
export interface ScenarioConfig {
  genre: ScenarioGenre | string;
  setting: string;
  mood: ScenarioMood | string;
  conflict: string;
  characters: ScenarioCharacter[];
  maturityRating: ContentRating;
}

/** The generated output from the LLM, ready to use as a chat scenario. */
export interface ScenarioOutput {
  id: string;
  config: ScenarioConfig;
  systemPrompt: string;
  openingMessage: string;
  createdAt: number;
}

/** Which step the wizard is currently on. */
export type ScenarioWizardStep =
  | 'genre'
  | 'setting'
  | 'mood'
  | 'characters'
  | 'generate'
  | 'preview';
