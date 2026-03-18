/**
 * Character Card Import/Export Service.
 *
 * Converts between TavernAI/SillyTavern character card format
 * and AnimeGirly's internal PersonaProfile. Handles both V1 (flat)
 * and V2 (wrapped) card formats.
 *
 * Card format: PNG image with a `tEXt` chunk (keyword: `chara`)
 * containing base64-encoded JSON character data.
 *
 * This service handles:
 *   - PNG tEXt chunk extraction and injection (pure browser APIs)
 *   - V1/V2 card format detection and normalization
 *   - Field mapping: CardData ↔ PersonaProfile
 *   - Lorebook entry extraction (stored for future Lorebook feature)
 *   - Avatar image extraction from the card PNG
 */

import {
  type CharacterCardV1,
  type CharacterCardV2,
  type CharacterCardData,
  type CardImportResult,
  type CardExportResult,
} from '../types/characterCard.ts';
import { type PersonaProfile } from '../types/companion.ts';
import { type LorebookEntry, DEFAULT_LOREBOOK_ENTRY } from '../types/lorebook.ts';
import { type CharacterBookEntry } from '../types/characterCard.ts';
import { estimateTokenCount } from './contextBudgetService.ts';
import { createPersonaPrompt } from './personaPresets.ts';
import { bulkPutLorebookEntries } from './appDb.ts';

/* ── PNG tEXt chunk parsing ──────────────────────────────────── */

/** PNG file signature (first 8 bytes). */
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Extracts the `chara` tEXt chunk from a PNG file's binary data.
 *
 * Walks the PNG chunk structure looking for a tEXt chunk with
 * keyword "chara", then decodes the base64 value to JSON.
 *
 * @param buffer - The PNG file as an ArrayBuffer.
 * @returns The decoded character card JSON string, or null if not found.
 *
 * @example
 * const buffer = await file.arrayBuffer();
 * const json = extractCharaChunk(buffer);
 * if (json) {
 *   const card = JSON.parse(json);
 * }
 */
export function extractCharaChunk(buffer: ArrayBuffer): string | null {
  const data = new Uint8Array(buffer);

  // Verify PNG signature
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (data[i] !== PNG_SIGNATURE[i]) return null;
  }

  let offset = 8; // Skip signature

  while (offset < data.length) {
    // Each chunk: 4 bytes length + 4 bytes type + data + 4 bytes CRC
    const length = readUint32BE(data, offset);
    const typeBytes = data.slice(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);

    if (type === 'tEXt') {
      const chunkData = data.slice(offset + 8, offset + 8 + length);
      const { keyword, text } = parseTEXtChunk(chunkData);

      if (keyword === 'chara') {
        // Value is base64-encoded JSON
        try {
          return atob(text);
        } catch {
          return null;
        }
      }
    }

    if (type === 'IEND') break;

    // Move to next chunk: 4 (length) + 4 (type) + length (data) + 4 (CRC)
    offset += 12 + length;
  }

  return null;
}

/**
 * Injects a `chara` tEXt chunk into a PNG file's binary data.
 *
 * Inserts the chunk before the IEND marker. The value is the
 * base64-encoded JSON string of the character card data.
 *
 * @param pngBuffer - The original PNG as an ArrayBuffer.
 * @param jsonString - The character card JSON to embed.
 * @returns A new ArrayBuffer containing the modified PNG.
 */
export function injectCharaChunk(pngBuffer: ArrayBuffer, jsonString: string): ArrayBuffer {
  const original = new Uint8Array(pngBuffer);
  const base64Value = btoa(jsonString);
  const charaChunk = buildTEXtChunk('chara', base64Value);

  // Find the IEND chunk position
  let iendOffset = -1;
  let offset = 8;

  while (offset < original.length) {
    const length = readUint32BE(original, offset);
    const typeBytes = original.slice(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);

    if (type === 'IEND') {
      iendOffset = offset;
      break;
    }

    offset += 12 + length;
  }

  if (iendOffset === -1) {
    // Malformed PNG — append chunk at the end (best effort)
    const result = new Uint8Array(original.length + charaChunk.length);
    result.set(original);
    result.set(charaChunk, original.length);
    return result.buffer;
  }

  // Insert the chara chunk before IEND
  const before = original.slice(0, iendOffset);
  const after = original.slice(iendOffset);
  const result = new Uint8Array(before.length + charaChunk.length + after.length);
  result.set(before);
  result.set(charaChunk, before.length);
  result.set(after, before.length + charaChunk.length);

  return result.buffer;
}

/** Reads a big-endian uint32 from a byte array at the given offset. */
function readUint32BE(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  );
}

/** Writes a big-endian uint32 into a byte array at the given offset. */
function writeUint32BE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

/** Parses a tEXt chunk into keyword + text (separated by null byte). */
function parseTEXtChunk(data: Uint8Array): { keyword: string; text: string } {
  const nullIndex = data.indexOf(0);
  if (nullIndex === -1) {
    return { keyword: String.fromCharCode(...data), text: '' };
  }
  const keyword = String.fromCharCode(...data.slice(0, nullIndex));
  const text = String.fromCharCode(...data.slice(nullIndex + 1));
  return { keyword, text };
}

/**
 * Builds a complete PNG tEXt chunk (length + type + data + CRC).
 *
 * @param keyword - The tEXt keyword (e.g., "chara").
 * @param text - The text value (base64-encoded JSON).
 * @returns Complete chunk as Uint8Array.
 */
function buildTEXtChunk(keyword: string, text: string): Uint8Array {
  const keywordBytes = new TextEncoder().encode(keyword);
  const textBytes = new TextEncoder().encode(text);

  // Data = keyword + null separator + text
  const chunkData = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
  chunkData.set(keywordBytes);
  chunkData[keywordBytes.length] = 0; // Null separator
  chunkData.set(textBytes, keywordBytes.length + 1);

  // Full chunk: 4 (length) + 4 (type) + data + 4 (CRC)
  const chunk = new Uint8Array(12 + chunkData.length);
  writeUint32BE(chunk, 0, chunkData.length);

  // Type: "tEXt"
  chunk[4] = 0x74; // t
  chunk[5] = 0x45; // E
  chunk[6] = 0x58; // X
  chunk[7] = 0x74; // t

  // Data
  chunk.set(chunkData, 8);

  // CRC32 over type + data
  const crcData = chunk.slice(4, 8 + chunkData.length);
  const crc = crc32(crcData);
  writeUint32BE(chunk, 8 + chunkData.length, crc);

  return chunk;
}

/** CRC32 lookup table. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

/** Computes CRC32 checksum for PNG chunk validation. */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* ── Card format detection & normalization ───────────────────── */

/**
 * Detects whether a parsed JSON object is a V1 or V2 card and normalizes
 * it to V2 CharacterCardData format.
 *
 * @param raw - The parsed JSON from the card file.
 * @returns Normalized V2 card data.
 * @throws Error if the JSON doesn't look like a character card.
 */
export function normalizeCardData(raw: unknown): CharacterCardData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid character card: not a JSON object');
  }

  const obj = raw as Record<string, unknown>;

  // V2: has `spec` and `data` fields
  if (obj.spec === 'chara_card_v2' && obj.data && typeof obj.data === 'object') {
    const v2 = obj as unknown as CharacterCardV2;
    return v2.data;
  }

  // V1: fields are at the root level
  if (typeof obj.name === 'string' && typeof obj.description === 'string') {
    const v1 = obj as unknown as CharacterCardV1;
    return {
      name: v1.name,
      description: v1.description,
      personality: v1.personality ?? '',
      scenario: v1.scenario ?? '',
      first_mes: v1.first_mes ?? '',
      mes_example: v1.mes_example ?? '',
      system_prompt: v1.system_prompt ?? '',
      creator_notes: v1.creator_notes ?? '',
      tags: v1.tags ?? [],
      creator: '',
      character_version: '',
      post_history_instructions: '',
      alternate_greetings: [],
      character_book: v1.character_book,
    };
  }

  throw new Error('Invalid character card: missing required fields (name, description)');
}

/* ── Field mapping: CardData → PersonaProfile ────────────────── */

/**
 * Converts a character card's data into an AnimeGirly PersonaProfile.
 *
 * The mapping is intentionally lossy for fields that don't have direct
 * equivalents — those are preserved in `rawPromptOverride` and
 * `generatedSystemPrompt` so nothing is lost.
 *
 * @param card - Normalized V2 card data.
 * @param avatarUrl - Optional object URL for the card's embedded avatar image.
 * @returns A new PersonaProfile ready to save to IndexedDB.
 *
 * @example
 * const cardData = normalizeCardData(JSON.parse(jsonString));
 * const persona = cardDataToPersona(cardData);
 * await savePersona(persona);
 */
export function cardDataToPersona(card: CharacterCardData): PersonaProfile {
  const now = Date.now();
  const id = `persona-card-${now}`;

  // Build the raw prompt from all card text fields
  const promptParts: string[] = [];
  if (card.system_prompt) promptParts.push(card.system_prompt);
  if (card.description) promptParts.push(card.description);
  if (card.personality) promptParts.push(`Personality: ${card.personality}`);
  if (card.scenario) promptParts.push(`Scenario: ${card.scenario}`);
  if (card.mes_example) promptParts.push(`Example dialogue:\n${card.mes_example}`);
  if (card.post_history_instructions) promptParts.push(card.post_history_instructions);

  const rawPrompt = promptParts.join('\n\n');

  // Extract character facts from description (split on newlines, take non-empty lines)
  const descriptionLines = card.description
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length < 200);
  const characterFacts = descriptionLines.slice(0, 10);

  const persona: PersonaProfile = {
    id,
    name: card.name || 'Imported Character',
    archetype: 'custom',
    dereTypes: [],
    tagline: card.personality
      ? card.personality.slice(0, 100)
      : `Imported from character card.`,
    shortBio: card.personality || card.description.slice(0, 200),
    backstory: card.description,
    characterFacts,
    worldSetting: card.scenario || 'A world described by the character card.',
    relationshipPremise: card.scenario || '',
    toneGuide: card.personality || '',
    initiativeLevel: 6,
    affectionLevel: 6,
    flirtLevel: 5,
    memoryPriorities: [],
    generatedSystemPrompt: createPersonaPrompt({
      name: card.name || 'Imported Character',
      archetype: 'custom',
      dereTypes: [],
      tagline: card.personality?.slice(0, 100) || 'Imported character.',
      shortBio: card.personality || card.description.slice(0, 200),
      backstory: card.description,
      characterFacts,
      worldSetting: card.scenario || '',
      relationshipPremise: card.scenario || '',
      toneGuide: card.personality || '',
      initiativeLevel: 6,
      affectionLevel: 6,
      flirtLevel: 5,
      memoryPriorities: [],
    }),
    rawPromptOverride: rawPrompt,
    createdAt: now,
    updatedAt: now,
  };

  return persona;
}

/**
 * Converts a CharacterBookEntry (SillyTavern format) to a LorebookEntry.
 *
 * @param entry - The character book entry from a card import.
 * @param personaId - The persona this entry belongs to.
 * @returns A LorebookEntry ready to persist.
 */
export function characterBookEntryToLorebookEntry(
  entry: CharacterBookEntry,
  personaId: string,
): LorebookEntry {
  const now = Date.now();
  return {
    ...DEFAULT_LOREBOOK_ENTRY,
    id: `lore-${now}-${entry.id ?? Math.random().toString(36).slice(2, 8)}`,
    personaId,
    name: entry.name || `Entry ${entry.id}`,
    triggers: entry.keys ?? [],
    secondaryTriggers: entry.secondary_keys ?? [],
    content: entry.content ?? '',
    priority: entry.priority ?? 50,
    enabled: entry.enabled ?? true,
    constant: entry.constant ?? false,
    caseSensitive: entry.case_sensitive ?? false,
    selective: entry.selective ?? false,
    insertionOrder: entry.insertion_order ?? 100,
    category: entry.comment || '',
    tokenEstimate: estimateTokenCount(entry.content ?? ''),
    createdAt: now,
    updatedAt: now,
  };
}

/* ── Field mapping: PersonaProfile → CardData ────────────────── */

/**
 * Converts an AnimeGirly PersonaProfile into a V2 character card.
 *
 * @param persona - The persona to export.
 * @returns A complete V2 character card ready for JSON serialization.
 */
export function personaToCardData(persona: PersonaProfile): CharacterCardV2 {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: persona.name,
      description: [
        persona.backstory,
        persona.characterFacts.length > 0
          ? `\nFacts:\n${persona.characterFacts.map((f) => `- ${f}`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      personality: [
        persona.toneGuide,
        persona.dereTypes.length > 0 ? `Dere types: ${persona.dereTypes.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('. '),
      scenario: persona.worldSetting,
      first_mes: '',
      mes_example: '',
      system_prompt: persona.rawPromptOverride || persona.generatedSystemPrompt,
      creator_notes: `Exported from AnimeGirly. Archetype: ${persona.archetype}.`,
      tags: [...persona.dereTypes],
      creator: 'AnimeGirly',
      character_version: '1.0',
      post_history_instructions: '',
      alternate_greetings: [],
      extensions: {
        animegirly: {
          archetype: persona.archetype,
          initiativeLevel: persona.initiativeLevel,
          affectionLevel: persona.affectionLevel,
          flirtLevel: persona.flirtLevel,
          memoryPriorities: persona.memoryPriorities,
          contentConfig: persona.contentConfig,
          psychologyConfig: persona.psychologyConfig,
        },
      },
    },
  };
}

/* ── High-level import/export flows ──────────────────────────── */

/**
 * Imports a character card from a PNG file.
 *
 * Extracts the `chara` tEXt chunk, parses the JSON, normalizes
 * to V2 format, and converts to a PersonaProfile.
 *
 * @param file - The PNG file selected by the user.
 * @returns Import result with the new persona ID and metadata.
 */
export async function importCardFromPng(file: File): Promise<CardImportResult> {
  try {
    const buffer = await file.arrayBuffer();
    const jsonString = extractCharaChunk(buffer);

    if (!jsonString) {
      return {
        personaId: '',
        success: false,
        message: 'No character data found in this PNG. Make sure it\'s a valid character card.',
        lorebookEntryCount: 0,
      };
    }

    const raw = JSON.parse(jsonString);
    const cardData = normalizeCardData(raw);
    const persona = cardDataToPersona(cardData);

    // Persist embedded lorebook entries from the character card
    const bookEntries = cardData.character_book?.entries ?? [];
    if (bookEntries.length > 0) {
      const lorebookEntries = bookEntries.map((entry) =>
        characterBookEntryToLorebookEntry(entry, persona.id),
      );
      await bulkPutLorebookEntries(lorebookEntries);
    }

    return {
      personaId: persona.id,
      success: true,
      message: `Imported "${cardData.name}" successfully.`,
      lorebookEntryCount: bookEntries.length,
      rawCardData: cardData,
      creatorNotes: cardData.creator_notes || undefined,
      firstMessage: cardData.first_mes || undefined,
      alternateGreetings: cardData.alternate_greetings?.length ? cardData.alternate_greetings : undefined,
    };
  } catch (error) {
    return {
      personaId: '',
      success: false,
      message: error instanceof Error ? error.message : 'Failed to import character card.',
      lorebookEntryCount: 0,
    };
  }
}

/**
 * Imports a character card from a raw JSON file.
 *
 * @param file - The JSON file selected by the user.
 * @returns Import result with the new persona ID and metadata.
 */
export async function importCardFromJson(file: File): Promise<CardImportResult> {
  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    const cardData = normalizeCardData(raw);
    const persona = cardDataToPersona(cardData);

    // Persist embedded lorebook entries from the character card
    const bookEntries = cardData.character_book?.entries ?? [];
    if (bookEntries.length > 0) {
      const lorebookEntries = bookEntries.map((entry) =>
        characterBookEntryToLorebookEntry(entry, persona.id),
      );
      await bulkPutLorebookEntries(lorebookEntries);
    }

    return {
      personaId: persona.id,
      success: true,
      message: `Imported "${cardData.name}" successfully.`,
      lorebookEntryCount: bookEntries.length,
      rawCardData: cardData,
      creatorNotes: cardData.creator_notes || undefined,
      firstMessage: cardData.first_mes || undefined,
      alternateGreetings: cardData.alternate_greetings?.length ? cardData.alternate_greetings : undefined,
    };
  } catch (error) {
    return {
      personaId: '',
      success: false,
      message: error instanceof Error ? error.message : 'Failed to import character card.',
      lorebookEntryCount: 0,
    };
  }
}

/**
 * Exports a persona as a V2 character card PNG.
 *
 * Creates a default avatar image (or uses a provided one),
 * embeds the card JSON as a `chara` tEXt chunk, and returns
 * the result as a downloadable Blob.
 *
 * @param persona - The persona to export.
 * @param avatarBlob - Optional avatar image to use as the card's PNG.
 * @returns Export result with the PNG blob and suggested filename.
 */
export async function exportCardAsPng(
  persona: PersonaProfile,
  avatarBlob?: Blob,
): Promise<CardExportResult> {
  try {
    const cardData = personaToCardData(persona);
    const jsonString = JSON.stringify(cardData);

    // Create a default avatar PNG if none provided
    let pngBuffer: ArrayBuffer;
    if (avatarBlob) {
      pngBuffer = await avatarBlob.arrayBuffer();
    } else {
      pngBuffer = await createDefaultAvatarPng(persona.name);
    }

    const modifiedBuffer = injectCharaChunk(pngBuffer, jsonString);
    const blob = new Blob([modifiedBuffer], { type: 'image/png' });
    const safeName = persona.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    return {
      blob,
      filename: `${safeName}.png`,
      success: true,
      message: `Exported "${persona.name}" as character card.`,
    };
  } catch (error) {
    return {
      blob: new Blob(),
      filename: '',
      success: false,
      message: error instanceof Error ? error.message : 'Failed to export character card.',
    };
  }
}

/**
 * Exports a persona as a raw JSON character card.
 *
 * @param persona - The persona to export.
 * @returns Export result with the JSON blob and suggested filename.
 */
export function exportCardAsJson(persona: PersonaProfile): CardExportResult {
  try {
    const cardData = personaToCardData(persona);
    const jsonString = JSON.stringify(cardData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const safeName = persona.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    return {
      blob,
      filename: `${safeName}.json`,
      success: true,
      message: `Exported "${persona.name}" as JSON card.`,
    };
  } catch (error) {
    return {
      blob: new Blob(),
      filename: '',
      success: false,
      message: error instanceof Error ? error.message : 'Failed to export character card.',
    };
  }
}

/**
 * Triggers a browser download for a blob.
 *
 * @param blob - The file content to download.
 * @param filename - Suggested filename.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ── Default avatar generation ───────────────────────────────── */

/**
 * Creates a simple default avatar PNG using Canvas 2D.
 *
 * Generates a 512×512 gradient background with the character's
 * initial in the center. Used when exporting a persona that
 * doesn't have an avatar image.
 *
 * @param name - Character name (first letter used as initial).
 * @returns PNG as ArrayBuffer.
 */
async function createDefaultAvatarPng(name: string): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, '#a855f7');
  gradient.addColorStop(1, '#ec4899');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Character initial
  const initial = (name[0] || '?').toUpperCase();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 200px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, 256, 256);

  // "AnimeGirly" watermark
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '24px sans-serif';
  ctx.fillText('AnimeGirly', 256, 480);

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });

  return blob.arrayBuffer();
}
