/* ──────────────────────────────────────────────
 * Lorebook / Story Bible types for keyword-triggered
 * lore injection into the LLM prompt context.
 * ────────────────────────────────────────────── */

/**
 * A single lorebook entry that injects contextual lore into the prompt
 * when its trigger keywords are detected in recent conversation history.
 *
 * Entries support two activation modes:
 *   - Standard: any primary trigger keyword activates the entry.
 *   - Selective: at least one primary AND one secondary keyword must both match.
 *
 * Constant entries bypass scanning entirely and are always injected.
 * Author's note entries use `authorsNoteDepth` to splice text at a specific
 * position relative to the end of the message history.
 */
export interface LorebookEntry {
  /** UUID, stable across edits. */
  id: string;

  /**
   * ID of the persona this entry belongs to.
   * Null indicates a global entry shared across all personas.
   */
  personaId: string | null;

  /** Human-readable label shown in the lorebook editor UI. */
  name: string;

  /**
   * Primary trigger keywords.
   * A single match from this list activates the entry (OR logic),
   * unless `selective` is true, in which case primary AND secondary
   * keywords must both appear.
   */
  triggers: string[];

  /**
   * Secondary trigger keywords used only when `selective` is true.
   * At least one entry from this list must also match alongside a
   * primary trigger for the entry to activate.
   */
  secondaryTriggers: string[];

  /** Lore text that is injected into the assembled prompt when activated. */
  content: string;

  /**
   * Injection priority. Higher values are injected before lower values
   * when multiple entries activate simultaneously.
   * Default: 50.
   */
  priority: number;

  /** Whether this entry participates in scanning at all. */
  enabled: boolean;

  /**
   * When true, this entry is injected on every turn regardless of trigger
   * matching. Useful for permanent world-lore or persona rules.
   */
  constant: boolean;

  /**
   * When true, this entry is treated as an Author's Note rather than
   * standard lore — it is spliced into the message history at a fixed
   * depth from the end rather than prepended to the system prompt.
   */
  isAuthorsNote: boolean;

  /**
   * Number of messages from the end of the history at which to splice
   * the Author's Note content. Only used when `isAuthorsNote` is true.
   * Default: 3.
   */
  authorsNoteDepth: number;

  /** Free-text grouping label (e.g. "characters", "locations", "lore"). */
  category: string;

  /**
   * Number of recent messages to scan for trigger keywords.
   * 0 means use the global default from `LorebookGlobalSettings.defaultScanDepth`.
   */
  scanDepth: number;

  /** Whether keyword matching is case-sensitive. */
  caseSensitive: boolean;

  /**
   * When true, `triggers` and `secondaryTriggers` are interpreted as
   * regular expressions rather than plain substrings.
   */
  useRegex: boolean;

  /**
   * When true, activation requires both a primary AND a secondary trigger
   * to match (AND logic). When false, any primary trigger match suffices.
   */
  selective: boolean;

  /**
   * Fine-grained ordering within the same priority tier.
   * Lower values are injected first when two entries share the same
   * `priority` value.
   */
  insertionOrder: number;

  /**
   * Cached token count estimate for `content`.
   * Updated whenever `content` changes to avoid re-computing on every
   * context budget pass.
   */
  tokenEstimate: number;

  /** Unix timestamp (ms) when the entry was created. */
  createdAt: number;

  /** Unix timestamp (ms) when the entry was last modified. */
  updatedAt: number;
}

/**
 * Output produced by the lorebook scanner for a single prompt assembly pass.
 *
 * The scanner walks recent messages, matches triggers against each enabled
 * entry, and returns the activated subset along with budget metadata.
 */
export interface LorebookScanResult {
  /** Entries whose triggers fired and whose content will be injected. */
  activatedEntries: LorebookEntry[];

  /**
   * Resolved Author's Note to splice into message history, or null if no
   * Author's Note entry activated on this pass.
   */
  authorsNote: { content: string; depth: number } | null;

  /** Sum of `tokenEstimate` across all activated entries. */
  totalTokens: number;

  /**
   * Number of entries that activated but were dropped due to the lorebook
   * token budget being exhausted.
   */
  truncatedCount: number;
}

/**
 * Global lorebook scanner configuration.
 *
 * Stored in app settings and applied as the default for all entries
 * whose per-entry overrides are set to their zero/default values.
 */
export interface LorebookGlobalSettings {
  /**
   * Default number of recent messages to scan for trigger keywords
   * when an entry's `scanDepth` is 0.
   * Default: 3.
   */
  defaultScanDepth: number;

  /**
   * Maximum percentage of the total context budget that lorebook entries
   * may consume in aggregate (0-100).
   * Default: 15.
   */
  maxBudgetPercent: number;

  /**
   * When true, activated entries are themselves scanned for keywords that
   * might activate additional entries (cascading activation).
   * Default: true.
   */
  recursiveScanning: boolean;

  /**
   * Maximum number of recursive activation passes to prevent infinite loops.
   * Only meaningful when `recursiveScanning` is true.
   * Default: 3.
   */
  maxRecursiveDepth: number;

  /**
   * When true, the chat UI displays a subtle indicator listing which lorebook
   * entries fired on the most recent turn.
   * Default: true.
   */
  showActivationIndicator: boolean;
}

/** Default global lorebook settings applied on first use. */
export const DEFAULT_LOREBOOK_SETTINGS: LorebookGlobalSettings = {
  defaultScanDepth: 3,
  maxBudgetPercent: 15,
  recursiveScanning: true,
  maxRecursiveDepth: 3,
  showActivationIndicator: true,
};

/**
 * Partial default values for a newly created lorebook entry.
 *
 * Consumers must supply at minimum `id`, `name`, `content`, `createdAt`,
 * and `updatedAt` before persisting.
 *
 * @example
 * const entry: LorebookEntry = {
 *   ...DEFAULT_LOREBOOK_ENTRY,
 *   id: crypto.randomUUID(),
 *   name: 'Sakura Academy',
 *   content: 'A prestigious all-girls high school in Tokyo...',
 *   createdAt: Date.now(),
 *   updatedAt: Date.now(),
 * };
 */
export const DEFAULT_LOREBOOK_ENTRY: Omit<
  LorebookEntry,
  'id' | 'name' | 'content' | 'createdAt' | 'updatedAt'
> = {
  personaId: null,
  triggers: [],
  secondaryTriggers: [],
  priority: 50,
  enabled: true,
  constant: false,
  isAuthorsNote: false,
  authorsNoteDepth: 3,
  category: '',
  scanDepth: 0,
  caseSensitive: false,
  useRegex: false,
  selective: false,
  insertionOrder: 100,
  tokenEstimate: 0,
};
