/**
 * Type definitions for the Character Relationship Web feature.
 *
 * A relationship web is a directed graph where each node is a PersonaProfile
 * and each edge (CharacterRelationship) describes how one character relates
 * to another. Edges are directional: "Dae sees Yuki as a rival" is distinct
 * from "Yuki sees Dae as a mentor".
 *
 * Display metadata (colors, dash patterns) lives in RELATIONSHIP_TYPE_CONFIGS
 * so the UI can render graph edges consistently without embedding presentation
 * logic inside components.
 */

// ── Enumerations ─────────────────────────────────────────────────────────────

/**
 * The semantic category of a directed character relationship.
 *
 * - `'custom'` requires a `customTypeLabel` on the edge record.
 */
export type RelationshipType =
  | 'friend'
  | 'rival'
  | 'lover'
  | 'sibling'
  | 'parent'
  | 'mentor'
  | 'roommate'
  | 'colleague'
  | 'enemy'
  | 'acquaintance'
  | 'custom';

// ── Core domain types ─────────────────────────────────────────────────────────

/**
 * A single directed edge in the relationship graph.
 *
 * Directionality: `sourcePersonaId` is the character who *holds* this view of
 * the relationship. For symmetric bonds (e.g. mutual friends) two mirrored
 * edges are stored.
 */
export interface CharacterRelationship {
  /** Unique identifier for this relationship edge (UUID). */
  id: string;

  /** The persona ID of the character who holds this relationship view. */
  sourcePersonaId: string;

  /** The persona ID of the character being related to. */
  targetPersonaId: string;

  /** Semantic category of the relationship. */
  type: RelationshipType;

  /**
   * Human-readable label used when `type` is `'custom'`.
   * Must be provided if and only if `type === 'custom'`.
   */
  customTypeLabel?: string;

  /**
   * Relationship strength on a 0–100 scale.
   * 0 = barely connected, 100 = deeply bonded / intensely opposed.
   */
  strength: number;

  /**
   * Free-form user notes describing the history or nuance of the relationship.
   * Injected verbatim into prompt context when both personas are active.
   *
   * @example "Former best friends who fell out over a shared secret."
   */
  description: string;

  /** Unix timestamp (ms) when this edge was first created. */
  createdAt: number;

  /** Unix timestamp (ms) when this edge was last modified. */
  updatedAt: number;
}

// ── Display metadata ──────────────────────────────────────────────────────────

/**
 * Presentation configuration for a specific relationship type.
 *
 * Used by graph renderers (Canvas/SVG) to draw edges with consistent visual
 * language — emerald for friends, red for rivals, pink for lovers, etc.
 */
export interface RelationshipTypeConfig {
  /** The relationship type this config applies to. */
  type: RelationshipType;

  /** Human-readable label shown in the UI (e.g. "Best Friends"). */
  label: string;

  /** Hex color string for the edge line and legend swatch. */
  color: string;

  /**
   * SVG `stroke-dasharray` value.
   * Use `'none'` for solid lines, or a pattern like `'5,5'` for dashed edges.
   */
  dashPattern: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Canonical display configuration for every built-in relationship type.
 *
 * The array is ordered from most positive to most negative for consistent
 * legend rendering. The `'custom'` entry sits at the end as a catch-all.
 *
 * @example
 * // Look up config for a specific type:
 * const cfg = RELATIONSHIP_TYPE_CONFIGS.find(c => c.type === relationship.type);
 * edgeElement.style.stroke = cfg?.color ?? '#888';
 */
export const RELATIONSHIP_TYPE_CONFIGS: RelationshipTypeConfig[] = [
  {
    type: 'lover',
    label: 'Lovers',
    color: '#ec4899', // pink-500
    dashPattern: 'none',
  },
  {
    type: 'friend',
    label: 'Friends',
    color: '#10b981', // emerald-500
    dashPattern: 'none',
  },
  {
    type: 'sibling',
    label: 'Siblings',
    color: '#8b5cf6', // violet-500
    dashPattern: 'none',
  },
  {
    type: 'parent',
    label: 'Parent / Child',
    color: '#a78bfa', // violet-400
    dashPattern: '3,3',
  },
  {
    type: 'mentor',
    label: 'Mentor',
    color: '#f59e0b', // amber-500
    dashPattern: 'none',
  },
  {
    type: 'roommate',
    label: 'Roommates',
    color: '#3b82f6', // blue-500
    dashPattern: 'none',
  },
  {
    type: 'colleague',
    label: 'Colleagues',
    color: '#6366f1', // indigo-500
    dashPattern: '4,4',
  },
  {
    type: 'acquaintance',
    label: 'Acquaintances',
    color: '#94a3b8', // slate-400
    dashPattern: '2,4',
  },
  {
    type: 'rival',
    label: 'Rivals',
    color: '#ef4444', // red-500
    dashPattern: '5,5',
  },
  {
    type: 'enemy',
    label: 'Enemies',
    color: '#dc2626', // red-600
    dashPattern: '8,4',
  },
  {
    type: 'custom',
    label: 'Custom',
    color: '#64748b', // slate-500
    dashPattern: '6,3,2,3',
  },
];
