/* ──────────────────────────────────────────────
 * TavernAI / SillyTavern Character Card types.
 *
 * These types describe the external interchange format —
 * NOT our internal PersonaProfile. Cards are converted
 * to/from PersonaProfile via the characterCardService.
 *
 * Spec reference: SillyTavern Character Card V2
 * https://github.com/malfoyslastname/character-card-spec-v2
 * ────────────────────────────────────────────── */

/**
 * Top-level wrapper for a V2 character card.
 *
 * The `spec` field distinguishes V1 (no wrapper) from V2 (has `data` object).
 * V1 cards have fields at the root level; V2 nests them under `data`.
 */
export interface CharacterCardV2 {
  spec: 'chara_card_v2';
  spec_version: '2.0';
  data: CharacterCardData;
}

/**
 * The core character data payload (V2 format).
 *
 * V1 cards have these same fields at the root level (without the wrapper).
 */
export interface CharacterCardData {
  /** Character's display name. */
  name: string;
  /** Long-form character description (personality, appearance, behavior). */
  description: string;
  /** Short personality summary keywords or phrases. */
  personality: string;
  /** The scenario/setting for the conversation. */
  scenario: string;
  /** The character's first message to start a conversation. */
  first_mes: string;
  /** Example message exchanges for the AI to reference. */
  mes_example: string;
  /** System prompt override (prepended to the conversation). */
  system_prompt: string;
  /** Notes from the card creator (not sent to the AI). */
  creator_notes: string;
  /** Tags for categorization. */
  tags: string[];
  /** Card creator's name or handle. */
  creator: string;
  /** Character version/revision string. */
  character_version: string;
  /** Post-history instructions (injected after chat history). */
  post_history_instructions: string;
  /** Alternate greetings the character can use. */
  alternate_greetings: string[];
  /** Embedded world info / lorebook entries. */
  character_book?: CharacterBook;

  /** V2 extensions — vendor-specific fields. */
  extensions?: Record<string, unknown>;
}

/**
 * Embedded lorebook/world info within a character card.
 *
 * These entries are keyword-triggered context injections
 * that activate when specific words appear in the conversation.
 */
export interface CharacterBook {
  /** Display name for this lorebook. */
  name?: string;
  /** Description of the lorebook's purpose. */
  description?: string;
  /** Default scan depth (how many messages back to scan for triggers). */
  scan_depth?: number;
  /** Whether recursive scanning is enabled (entries can trigger other entries). */
  recursive_scanning?: boolean;
  /** The lorebook entries. */
  entries: CharacterBookEntry[];
  /** V2 extensions. */
  extensions?: Record<string, unknown>;
}

/** A single lorebook/world info entry. */
export interface CharacterBookEntry {
  /** Unique key names that trigger this entry. */
  keys: string[];
  /** Secondary keys (all must match in addition to a primary key). */
  secondary_keys: string[];
  /** The content to inject when triggered. */
  content: string;
  /** Whether this entry is active. */
  enabled: boolean;
  /** Injection position: 'before_char' | 'after_char' (relative to char definition). */
  insertion_order: number;
  /** Whether this entry should use case-sensitive matching. */
  case_sensitive: boolean;
  /** Display name for this entry. */
  name: string;
  /** Priority for ordering when multiple entries trigger. */
  priority: number;
  /** Entry ID (numeric in the spec). */
  id: number;
  /** Comment/notes about this entry. */
  comment: string;
  /** Whether to select on secondary keys. */
  selective: boolean;
  /** Whether this is a constant entry (always injected). */
  constant: boolean;
  /** Position: 0 = before AN, 1 = after AN, 2 = before char, 3 = after char. */
  position?: string;
  /** V2 extensions. */
  extensions?: Record<string, unknown>;
}

/**
 * V1 character card — flat structure without the `spec`/`data` wrapper.
 *
 * Many older cards from TavernAI use this format. We detect V1 by the
 * absence of a `spec` field and convert to V2 internally.
 */
export interface CharacterCardV1 {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  /** V1 cards may or may not have these fields. */
  system_prompt?: string;
  creator_notes?: string;
  tags?: string[];
  character_book?: CharacterBook;
}

/**
 * Result of importing a character card.
 *
 * Contains the converted PersonaProfile plus any embedded lorebook
 * entries that were extracted (for future Lorebook feature integration).
 */
export interface CardImportResult {
  /** The converted persona profile, ready to save. */
  personaId: string;
  /** Whether the import succeeded. */
  success: boolean;
  /** Human-readable status message. */
  message: string;
  /** Number of lorebook entries extracted (stored separately). */
  lorebookEntryCount: number;
  /** The raw card data that was parsed (for debugging). */
  rawCardData?: CharacterCardData;
  /** Card creator notes (shown to user, not sent to AI). */
  creatorNotes?: string;
  /** First message from the card (can be used to start a thread). */
  firstMessage?: string;
  /** Alternate greetings available. */
  alternateGreetings?: string[];
}

/**
 * Result of exporting a persona as a character card.
 */
export interface CardExportResult {
  /** The PNG blob with embedded character data. */
  blob: Blob;
  /** Suggested filename for download. */
  filename: string;
  /** Whether the export succeeded. */
  success: boolean;
  /** Human-readable status message. */
  message: string;
}
