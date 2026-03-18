/* ──────────────────────────────────────────────
 * Content system types for NSFW gating,
 * intimacy tracking, and sensory writing.
 * ────────────────────────────────────────────── */

/** Content maturity tiers, ordered from safest to most permissive. */
export type ContentRatingLevel = 'general' | 'edgy' | 'mature' | 'explicit';

/** Ordered list used for ceiling comparisons (lower index = safer). */
export const CONTENT_RATING_ORDER: ContentRatingLevel[] = [
  'general',
  'edgy',
  'mature',
  'explicit',
];

/**
 * Per-thread intimacy tracker.
 *
 * Level 0-100 maps to content bands:
 *   0-30  flirty, 30-60 suggestive, 60-85 heavy physical, 85-100 explicit.
 */
export interface IntimacyState {
  /** Current intimacy score (0-100). */
  level: number;
  /** Direction of recent change. */
  trend: 'rising' | 'stable' | 'cooling';
  /** Turn number when intimacy was last adjusted. */
  lastUpdateTurn: number;
}

/**
 * Physical scene continuity state.
 *
 * Tracks clothing, position, and recent physical actions so the LLM
 * maintains spatial coherence across turns in intimate scenes.
 */
export interface PhysicalState {
  /** Description of the user's current clothing state. */
  userClothing: string;
  /** Description of the companion's current clothing state. */
  companionClothing: string;
  /** Narrative context for physical proximity, e.g. "sitting together on the couch". */
  physicalContext: string;
  /** Arousal level (0-10), only tracked when content ceiling >= 'mature'. */
  arousalLevel: number;
  /** Rolling window of the last 5 physical actions described. */
  recentActions: string[];
  /** Timestamp of last update. */
  lastUpdatedAt: number;
}

/**
 * Global content gating configuration.
 *
 * Stored in IndexedDB settings. Controls the maximum content
 * level allowed across the entire app, with per-persona overrides.
 */
export interface ContentGateConfig {
  /** Maximum content rating allowed globally. */
  globalContentCeiling: ContentRatingLevel;
  /** Whether the user has confirmed they are 18+. */
  ageVerified: boolean;
  /** Whether the ceiling selector is password-locked. */
  contentLockEnabled: boolean;
  /** SHA-256 hash of the content lock password (hex string). */
  contentLockPasswordHash: string;
  /** Per-persona ceiling overrides, keyed by persona ID. */
  perPersonaCeilings: Record<string, ContentRatingLevel>;
}

/** Sensory writing emphasis configuration. */
export interface SensoryWritingConfig {
  /** Whether sensory writing instructions are injected into prompts. */
  enabled: boolean;
  /** Which sensory channels to emphasize. */
  emphasis: {
    sound: boolean;
    scent: boolean;
    touch: boolean;
    temperature: boolean;
    texture: boolean;
    taste: boolean;
  };
  /** Overall sensory description intensity (0-10). */
  intensity: number;
}

/**
 * Intimacy level thresholds mapping score ranges to content bands.
 *
 * Each tuple is [min, max) — the level must be >= min and < max
 * to fall within that band.
 */
export interface IntimacyThresholds {
  flirty: [number, number];
  suggestive: [number, number];
  heavyPhysical: [number, number];
  explicit: [number, number];
}

/** Default intimacy thresholds used when no custom config is provided. */
export const DEFAULT_INTIMACY_THRESHOLDS: IntimacyThresholds = {
  flirty: [0, 30],
  suggestive: [30, 60],
  heavyPhysical: [60, 85],
  explicit: [85, 100],
};

/** Default sensory writing config — all channels off. */
export const DEFAULT_SENSORY_WRITING_CONFIG: SensoryWritingConfig = {
  enabled: false,
  emphasis: {
    sound: false,
    scent: false,
    touch: false,
    temperature: false,
    texture: false,
    taste: false,
  },
  intensity: 5,
};

/** Default content gate config — everything locked to 'general'. */
export const DEFAULT_CONTENT_GATE_CONFIG: ContentGateConfig = {
  globalContentCeiling: 'general',
  ageVerified: false,
  contentLockEnabled: false,
  contentLockPasswordHash: '',
  perPersonaCeilings: {},
};

/** Per-thread intimacy + physical state, persisted to IndexedDB. */
export interface IntimacyStateRecord {
  threadId: string;
  personaId: string;
  intimacy: IntimacyState;
  physical: PhysicalState;
}

/** Default initial intimacy state for a new thread. */
export const DEFAULT_INTIMACY_STATE: IntimacyState = {
  level: 0,
  trend: 'stable',
  lastUpdateTurn: 0,
};

/** Default initial physical state for a new thread. */
export const DEFAULT_PHYSICAL_STATE: PhysicalState = {
  userClothing: 'casual clothes',
  companionClothing: 'default outfit',
  physicalContext: 'sitting across from each other',
  arousalLevel: 0,
  recentActions: [],
  lastUpdatedAt: Date.now(),
};
