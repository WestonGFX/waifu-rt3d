import { describe, it, expect } from 'vitest';
import {
  normalizeCardData,
  cardDataToPersona,
  personaToCardData,
  extractCharaChunk,
  injectCharaChunk,
  exportCardAsJson,
} from './characterCardService.ts';
import { type CharacterCardData, type CharacterCardV2 } from '../types/characterCard.ts';
import { type PersonaProfile } from '../types/companion.ts';

const MOCK_V2_CARD: CharacterCardV2 = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: 'Test Character',
    description: 'A brave warrior with a heart of gold.',
    personality: 'Brave, kind, determined',
    scenario: 'A fantasy kingdom under siege.',
    first_mes: 'Hello traveler, welcome to our realm.',
    mes_example: '<START>\n{{user}}: Hi\n{{char}}: Greetings!',
    system_prompt: 'You are Test Character, a brave warrior.',
    creator_notes: 'Created for testing.',
    tags: ['fantasy', 'warrior'],
    creator: 'TestCreator',
    character_version: '1.0',
    post_history_instructions: '',
    alternate_greetings: ['Hey there!', 'Well met!'],
  },
};

const MOCK_V1_CARD = {
  name: 'V1 Character',
  description: 'An old-format character.',
  personality: 'Quiet and thoughtful',
  scenario: 'A library at midnight.',
  first_mes: 'Shhh, the books are sleeping.',
  mes_example: '',
};

describe('normalizeCardData', () => {
  it('normalizes V2 cards correctly', () => {
    const result = normalizeCardData(MOCK_V2_CARD);
    expect(result.name).toBe('Test Character');
    expect(result.description).toBe('A brave warrior with a heart of gold.');
    expect(result.personality).toBe('Brave, kind, determined');
    expect(result.tags).toEqual(['fantasy', 'warrior']);
  });

  it('normalizes V1 cards correctly', () => {
    const result = normalizeCardData(MOCK_V1_CARD);
    expect(result.name).toBe('V1 Character');
    expect(result.description).toBe('An old-format character.');
    expect(result.personality).toBe('Quiet and thoughtful');
    // V1 defaults
    expect(result.tags).toEqual([]);
    expect(result.system_prompt).toBe('');
  });

  it('throws on invalid input', () => {
    expect(() => normalizeCardData(null)).toThrow('not a JSON object');
    expect(() => normalizeCardData({})).toThrow('missing required fields');
    expect(() => normalizeCardData({ name: 123 })).toThrow('missing required fields');
  });
});

describe('cardDataToPersona', () => {
  it('converts card data to a valid PersonaProfile', () => {
    const persona = cardDataToPersona(MOCK_V2_CARD.data);
    expect(persona.name).toBe('Test Character');
    expect(persona.archetype).toBe('custom');
    expect(persona.backstory).toBe('A brave warrior with a heart of gold.');
    expect(persona.worldSetting).toBe('A fantasy kingdom under siege.');
    expect(persona.toneGuide).toBe('Brave, kind, determined');
    expect(persona.id).toMatch(/^persona-card-/);
    expect(persona.rawPromptOverride).toContain('You are Test Character');
    expect(persona.generatedSystemPrompt).toBeTruthy();
  });

  it('handles empty/missing fields gracefully', () => {
    const minimalCard: CharacterCardData = {
      name: 'Minimal',
      description: 'Bare bones.',
      personality: '',
      scenario: '',
      first_mes: '',
      mes_example: '',
      system_prompt: '',
      creator_notes: '',
      tags: [],
      creator: '',
      character_version: '',
      post_history_instructions: '',
      alternate_greetings: [],
    };
    const persona = cardDataToPersona(minimalCard);
    expect(persona.name).toBe('Minimal');
    expect(persona.backstory).toBe('Bare bones.');
    expect(persona.tagline).toBe('Imported from character card.');
  });
});

describe('personaToCardData', () => {
  it('converts a persona to a valid V2 card', () => {
    const persona: PersonaProfile = {
      id: 'test-persona',
      name: 'Asami',
      archetype: 'deredere',
      dereTypes: ['deredere', 'genki'],
      tagline: 'A sunshine girl.',
      shortBio: 'Bright and warm.',
      backstory: 'She grew up in a café.',
      characterFacts: ['Plays violin', 'Loves cream soda'],
      worldSetting: 'A cozy city.',
      relationshipPremise: 'Close friends.',
      toneGuide: 'Warm and playful.',
      initiativeLevel: 8,
      affectionLevel: 9,
      flirtLevel: 7,
      memoryPriorities: ['treats', 'dates'],
      generatedSystemPrompt: 'Stay in character as Asami.',
      createdAt: 1,
      updatedAt: 1,
    };

    const card = personaToCardData(persona);
    expect(card.spec).toBe('chara_card_v2');
    expect(card.spec_version).toBe('2.0');
    expect(card.data.name).toBe('Asami');
    expect(card.data.scenario).toBe('A cozy city.');
    expect(card.data.system_prompt).toBe('Stay in character as Asami.');
    expect(card.data.tags).toContain('deredere');
    expect(card.data.tags).toContain('genki');
    expect(card.data.extensions?.animegirly).toBeDefined();
  });
});

describe('PNG chunk operations', () => {
  it('round-trips inject → extract', () => {
    // Create a minimal valid PNG (1x1 white pixel)
    const minimalPng = createMinimalPng();
    const testJson = JSON.stringify({ name: 'Test', description: 'Hello' });

    const modified = injectCharaChunk(minimalPng, testJson);
    const extracted = extractCharaChunk(modified);

    expect(extracted).toBe(testJson);
  });

  it('returns null for non-PNG data', () => {
    const notPng = new ArrayBuffer(8);
    expect(extractCharaChunk(notPng)).toBeNull();
  });

  it('returns null for PNG without chara chunk', () => {
    const png = createMinimalPng();
    expect(extractCharaChunk(png)).toBeNull();
  });
});

describe('exportCardAsJson', () => {
  it('produces a valid JSON blob', () => {
    const persona: PersonaProfile = {
      id: 'test',
      name: 'TestChar',
      archetype: 'custom',
      dereTypes: [],
      tagline: 'test',
      shortBio: 'test',
      backstory: 'test',
      characterFacts: [],
      worldSetting: 'test',
      relationshipPremise: 'test',
      toneGuide: 'test',
      initiativeLevel: 5,
      affectionLevel: 5,
      flirtLevel: 5,
      memoryPriorities: [],
      generatedSystemPrompt: 'test',
      createdAt: 1,
      updatedAt: 1,
    };

    const result = exportCardAsJson(persona);
    expect(result.success).toBe(true);
    expect(result.filename).toBe('testchar.json');
    expect(result.blob.type).toBe('application/json');
  });
});

/**
 * Creates a minimal valid PNG (1x1 transparent pixel) for testing.
 * This is the smallest possible valid PNG file.
 */
function createMinimalPng(): ArrayBuffer {
  // PNG signature + IHDR + IDAT + IEND
  // This is a pre-computed minimal 1x1 transparent PNG
  const bytes = [
    // PNG signature
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    // IHDR chunk (13 bytes data)
    0x00, 0x00, 0x00, 0x0d, // length = 13
    0x49, 0x48, 0x44, 0x52, // type = IHDR
    0x00, 0x00, 0x00, 0x01, // width = 1
    0x00, 0x00, 0x00, 0x01, // height = 1
    0x08, 0x06,             // bit depth = 8, color type = 6 (RGBA)
    0x00, 0x00, 0x00,       // compression, filter, interlace
    0x1f, 0x15, 0xc4, 0x89, // CRC
    // IDAT chunk (raw pixel data, zlib compressed)
    0x00, 0x00, 0x00, 0x0a, // length = 10
    0x49, 0x44, 0x41, 0x54, // type = IDAT
    0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x00, // zlib data
    0x05, 0xfe, 0xd4, 0x36, // CRC (placeholder — not validated for test)
    // IEND chunk
    0x00, 0x00, 0x00, 0x00, // length = 0
    0x49, 0x45, 0x4e, 0x44, // type = IEND
    0xae, 0x42, 0x60, 0x82, // CRC
  ];
  return new Uint8Array(bytes).buffer;
}
