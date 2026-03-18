/**
 * Bridge between waifu-rt3d backend characters and Girly's PersonaProfile format.
 *
 * Fetches from GET /api/characters and maps to Girly's expected shape.
 * Backend characters use prefixed IDs ("wrt3d-char-{id}") to distinguish
 * them from Girly's native IndexedDB personas.
 *
 * Falls back gracefully to an empty array when the backend is unreachable,
 * so the frontend remains fully functional in offline / standalone mode.
 */

import { type PersonaProfile, type PersonaArchetype, type DereType } from '../types/companion.ts';

/** Shape of a character returned by GET /api/characters. */
interface BackendCharacter {
  id: number;
  name: string;
  system_prompt: string;
  system_prompt_lite?: string | null;
  avatar_url?: string;
  /**
   * JSON-encoded string array OR already-parsed string array.
   * The backend stores this as a JSON string in SQLite, but older
   * response paths may already parse it.
   */
  personality_traits?: string | string[];
}

/** Shape of the GET /api/characters response envelope. */
interface CharactersResponse {
  characters: BackendCharacter[];
}

/**
 * Map backend personality trait strings to Girly dere types.
 *
 * Performs a substring match so trait strings like "tsundere with a soft core"
 * still map correctly. Defaults to ['deredere'] when no match is found.
 *
 * @param traits - Raw trait strings from the backend character.
 * @returns Array of matched DereType values.
 */
function inferDereTypes(traits: string[]): DereType[] {
  const lower = traits.map((t) => t.toLowerCase());
  const types: DereType[] = [];

  if (lower.some((t) => t.includes('tsundere'))) types.push('tsundere');
  if (lower.some((t) => t.includes('kuudere'))) types.push('kuudere');
  if (lower.some((t) => t.includes('yandere'))) types.push('yandere-lite');
  if (lower.some((t) => t.includes('deredere'))) types.push('deredere');
  if (lower.some((t) => t.includes('dandere'))) types.push('dandere');
  if (lower.some((t) => t.includes('genki'))) types.push('genki');
  if (lower.some((t) => t.includes('onee'))) types.push('onee-san');
  if (lower.some((t) => t.includes('ojou'))) types.push('ojou');
  if (lower.some((t) => t.includes('bokukko'))) types.push('bokukko');
  if (lower.some((t) => t.includes('himedere'))) types.push('himedere');

  return types.length > 0 ? types : ['deredere'];
}

/**
 * Parse the personality_traits field, which arrives as either a JSON string
 * or an already-decoded array depending on which code path serialised it.
 *
 * @param raw - The raw personality_traits value from the API response.
 * @returns A plain string array, empty on parse failure.
 */
function parseTraits(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Convert a single backend character to a Girly PersonaProfile.
 *
 * Fields that have no direct backend counterpart (worldSetting, backstory,
 * etc.) receive sensible defaults — the rich persona definition lives in
 * generatedSystemPrompt, which maps directly from system_prompt.
 *
 * @param char - Raw character object from the backend API.
 * @param now  - Timestamp to use for createdAt / updatedAt.
 * @returns A fully-formed PersonaProfile ready for Girly's state.
 */
function toPersonaProfile(char: BackendCharacter, now: number): PersonaProfile {
  const traits = parseTraits(char.personality_traits);
  const dereTypes = inferDereTypes(traits);

  // Pick a stable archetype from the first dere type, defaulting to 'genki'.
  const archetypeMap: Partial<Record<DereType, PersonaArchetype>> = {
    deredere: 'deredere',
    tsundere: 'tsundere-lite',
    kuudere: 'kuudere',
    dandere: 'dandere',
    genki: 'genki',
    'onee-san': 'onee-san',
  };
  const archetype: PersonaArchetype = archetypeMap[dereTypes[0]] ?? 'genki';

  return {
    id: `wrt3d-char-${char.id}`,
    name: char.name,
    archetype,
    dereTypes,
    tagline: `${char.name} — waifu-rt3d character`,
    shortBio: traits.length > 0 ? traits.join(', ') : 'A companion character.',
    backstory: '',
    characterFacts: traits,
    worldSetting: 'A cozy present-day anime world.',
    relationshipPremise: 'A companion who grows closer over time.',
    toneGuide: 'Warm and engaging.',
    initiativeLevel: 7,
    affectionLevel: 6,
    flirtLevel: 4,
    memoryPriorities: ['user preferences', 'shared moments', 'emotional context'],
    generatedSystemPrompt: char.system_prompt ?? '',
    rawPromptOverride: char.system_prompt_lite ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Fetch characters from the waifu-rt3d backend and convert them to
 * Girly PersonaProfiles.
 *
 * Uses a 3-second AbortSignal timeout so a slow or unreachable backend
 * does not block the hydration cycle. Returns an empty array on any
 * network or parse error so callers can treat it as "no backend personas".
 *
 * @returns Array of PersonaProfiles sourced from the backend, or [] on failure.
 *
 * @example
 * const personas = await fetchBackendPersonas();
 * if (personas.length > 0) {
 *   console.log(`Loaded ${personas.length} backend characters`);
 * }
 */
export async function fetchBackendPersonas(): Promise<PersonaProfile[]> {
  try {
    const resp = await fetch('/api/characters', {
      signal: AbortSignal.timeout(3000), // 3 s — don't block hydration
    });
    if (!resp.ok) return [];

    const data: unknown = await resp.json();

    // Narrow: expect { characters: [...] }
    if (
      typeof data !== 'object' ||
      data === null ||
      !('characters' in data) ||
      !Array.isArray((data as CharactersResponse).characters)
    ) {
      return [];
    }

    const { characters } = data as CharactersResponse;
    const now = Date.now();
    return characters.map((char) => toPersonaProfile(char, now));
  } catch {
    // Network timeout, JSON parse failure, or any other error.
    // Fall back silently — Girly's preset personas will cover the gap.
    return [];
  }
}

/**
 * Check whether a persona ID refers to a backend-synced character.
 *
 * @param personaId - The persona ID to inspect.
 * @returns True if the ID was generated by this bridge (has the wrt3d prefix).
 *
 * @example
 * isBackendPersona('wrt3d-char-3'); // true
 * isBackendPersona('preset-hana');  // false
 */
export function isBackendPersona(personaId: string): boolean {
  return personaId.startsWith('wrt3d-char-');
}

/**
 * Extract the numeric backend character ID from a prefixed persona ID.
 *
 * @param personaId - e.g. "wrt3d-char-3"
 * @returns The numeric character ID (3), or null if not a backend persona.
 *
 * @example
 * getBackendCharacterId('wrt3d-char-7'); // 7
 * getBackendCharacterId('preset-hana');  // null
 */
export function getBackendCharacterId(personaId: string): number | null {
  if (!isBackendPersona(personaId)) return null;
  const id = parseInt(personaId.replace('wrt3d-char-', ''), 10);
  return isNaN(id) ? null : id;
}
