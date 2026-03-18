/**
 * Relationship Web service — pure functions for building character relationship
 * context blocks suitable for prompt injection.
 *
 * This service has no React dependency and no database access. All DB CRUD for
 * CharacterRelationship records will live in appDb.ts and be wired separately.
 * The functions here operate exclusively on in-memory data passed by callers.
 *
 * Typical call site: the prompt assembly pipeline (promptAssemblyService.ts)
 * will call `buildRelationshipContext` when multiple personas are active in a
 * group-chat scenario and inject the result into the system prompt.
 */

import {
  type CharacterRelationship,
  type RelationshipType,
  RELATIONSHIP_TYPE_CONFIGS,
} from '../types/relationshipWeb.ts';
import { type PersonaProfile } from '../types/companion.ts';

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns the human-readable label for a relationship type.
 *
 * Falls back to the `customTypeLabel` when the type is `'custom'`, and then
 * to the config label if no custom label is supplied.
 *
 * @param relationship - The edge whose display label is needed.
 * @returns A lowercase label string suitable for inline prose.
 *
 * @example
 * resolveRelationshipLabel({ type: 'rival', customTypeLabel: undefined, ... })
 * // => 'rivals'
 *
 * resolveRelationshipLabel({ type: 'custom', customTypeLabel: 'childhood friend', ... })
 * // => 'childhood friend'
 */
function resolveRelationshipLabel(relationship: CharacterRelationship): string {
  if (relationship.type === 'custom' && relationship.customTypeLabel) {
    return relationship.customTypeLabel;
  }
  const config = RELATIONSHIP_TYPE_CONFIGS.find(c => c.type === relationship.type);
  return config?.label.toLowerCase() ?? relationship.type;
}

/**
 * Formats a single relationship edge as a prose sentence for the context block.
 *
 * @param relationship - The directed relationship edge to format.
 * @param sourceName - Display name of the source persona.
 * @param targetName - Display name of the target persona.
 * @returns A formatted line ready to be included in a prompt context block.
 *
 * @example
 * formatRelationshipLine(edge, 'Dae', 'Yuki')
 * // => '- Dae → Yuki: rivals (strength 75) — "Former best friends who fell out"'
 */
function formatRelationshipLine(
  relationship: CharacterRelationship,
  sourceName: string,
  targetName: string,
): string {
  const typeLabel = resolveRelationshipLabel(relationship);
  const strengthNote = `strength ${relationship.strength}`;
  const descriptionPart = relationship.description.trim()
    ? ` — "${relationship.description.trim()}"`
    : '';

  return `- ${sourceName} → ${targetName}: ${typeLabel} (${strengthNote})${descriptionPart}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a plain-text relationship context block for prompt injection.
 *
 * Each relationship edge is rendered as a prose line with the source character
 * name, target character name, relationship type label, numeric strength, and
 * the user's description notes. Edges with unknown persona IDs (i.e. the
 * corresponding PersonaProfile is not in the supplied map) are silently
 * skipped so stale DB records never cause a crash.
 *
 * The returned string is empty when `relationships` is empty or when all edges
 * reference unknown personas, allowing callers to omit the block cleanly.
 *
 * @param relationships - All relationship edges to include.
 * @param personas - Array of PersonaProfile records used to resolve names.
 *   Only personas present in this array can appear in the output.
 * @returns A formatted multi-line string beginning with `[Character Relationships]`,
 *   or an empty string if there is nothing to render.
 *
 * @example
 * const block = buildRelationshipContext(edges, [daeProfile, yukiProfile]);
 * // =>
 * // [Character Relationships]
 * // - Dae → Yuki: rivals (strength 75) — "Former best friends who fell out"
 * // - Dae → Hana: roommates (strength 90) — "Hana keeps Dae grounded"
 */
export function buildRelationshipContext(
  relationships: CharacterRelationship[],
  personas: PersonaProfile[],
): string {
  if (relationships.length === 0) return '';

  // Build a lookup map so resolution is O(1) per edge.
  const personaMap = new Map<string, PersonaProfile>();
  for (const persona of personas) {
    personaMap.set(persona.id, persona);
  }

  const lines: string[] = [];

  for (const rel of relationships) {
    const source = personaMap.get(rel.sourcePersonaId);
    const target = personaMap.get(rel.targetPersonaId);

    // Skip edges where either side cannot be resolved.
    if (!source || !target) continue;

    lines.push(formatRelationshipLine(rel, source.name, target.name));
  }

  if (lines.length === 0) return '';

  return `[Character Relationships]\n${lines.join('\n')}`;
}

/**
 * Filters a flat relationship array down to edges that involve a specific
 * persona — either as the source or the target.
 *
 * Useful for persona detail views that only need to display relationships
 * relevant to one character without fetching everything from the DB.
 *
 * @param relationships - The full set of relationship edges.
 * @param personaId - The persona whose edges should be returned.
 * @returns A new array containing only edges where `sourcePersonaId` or
 *   `targetPersonaId` equals `personaId`.
 *
 * @example
 * const daeEdges = filterRelationshipsForPersona(allEdges, 'dae-persona-id');
 */
export function filterRelationshipsForPersona(
  relationships: CharacterRelationship[],
  personaId: string,
): CharacterRelationship[] {
  return relationships.filter(
    r => r.sourcePersonaId === personaId || r.targetPersonaId === personaId,
  );
}

/**
 * Returns all relationship edges between two specific personas, in either
 * direction.
 *
 * Because the graph is directed, up to two edges can exist between any pair
 * (one per direction). This function returns both when present.
 *
 * @param relationships - The full set of relationship edges.
 * @param personaIdA - One side of the pair.
 * @param personaIdB - The other side of the pair.
 * @returns Edges where one end is `personaIdA` and the other is `personaIdB`.
 *
 * @example
 * const edges = getEdgesBetween(allEdges, 'dae-id', 'yuki-id');
 * // Returns [daeToYuki, yukiToDae] when both directions are stored.
 */
export function getEdgesBetween(
  relationships: CharacterRelationship[],
  personaIdA: string,
  personaIdB: string,
): CharacterRelationship[] {
  return relationships.filter(
    r =>
      (r.sourcePersonaId === personaIdA && r.targetPersonaId === personaIdB) ||
      (r.sourcePersonaId === personaIdB && r.targetPersonaId === personaIdA),
  );
}

/**
 * Looks up the display configuration for a given relationship type.
 *
 * A convenience wrapper around `RELATIONSHIP_TYPE_CONFIGS` so callers do not
 * need to import and search the array themselves.
 *
 * @param type - The relationship type to look up.
 * @returns The matching `RelationshipTypeConfig`, or `undefined` if the type
 *   is not present in the config array (should not happen with well-typed input).
 *
 * @example
 * const cfg = getRelationshipTypeConfig('rival');
 * edgeSvgLine.setAttribute('stroke', cfg?.color ?? '#888');
 */
export function getRelationshipTypeConfig(
  type: RelationshipType,
) {
  return RELATIONSHIP_TYPE_CONFIGS.find(c => c.type === type);
}
