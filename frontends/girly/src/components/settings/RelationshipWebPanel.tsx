/**
 * RelationshipWebPanel — Character Relationship Web visualization.
 *
 * Renders an SVG circle-layout graph showing connections between personas,
 * with an inline form for adding/editing relationships and a list view
 * of all existing relationships below. Relationship data lives in local
 * component state; appDb wiring is deferred to a later pass.
 *
 * Layout notes:
 * - Graph: 100% width × 400px SVG, nodes arranged in evenly-spaced ring.
 * - Controls/form: standard AppCard stack below the graph.
 * - Works in both floating-shell and fullscreen modes.
 */

import { useId, useMemo, useState } from 'react';
import { Network, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useCompanion } from '@/context/CompanionContext.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import {
  AppCard,
  AppField,
  Button,
  SettingsSectionHeader,
  Textarea,
} from './SettingsPrimitives.tsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CharacterRelationship {
  id: string;
  sourcePersonaId: string;
  targetPersonaId: string;
  type: string;
  strength: number;
  description: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RELATIONSHIP_TYPES = [
  'friend',
  'rival',
  'lover',
  'sibling',
  'roommate',
  'colleague',
  'enemy',
  'acquaintance',
  'custom',
] as const;

/** Semantic edge colors by relationship type. Falls back to muted grey. */
const RELATIONSHIP_COLORS: Record<string, string> = {
  friend: '#10b981',
  rival: '#ef4444',
  lover: '#ec4899',
  sibling: '#8b5cf6',
  roommate: '#3b82f6',
  colleague: '#f59e0b',
  enemy: '#dc2626',
  acquaintance: '#94a3b8',
};

/** Dash patterns that reinforce relationship sentiment at a glance. */
const RELATIONSHIP_DASH: Record<string, string> = {
  rival: '6 3',
  enemy: '4 2',
  acquaintance: '8 4',
  custom: '3 3',
};

const GRAPH_HEIGHT = 400;
/** Radius of each persona node circle, in SVG units. */
const NODE_RADIUS = 28;
/** Ring radius — how far nodes sit from center. Scales with persona count. */
const RING_RADIUS_BASE = 130;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the two-letter initials for a persona name.
 *
 * @param name - Full persona name.
 * @returns Up to two uppercase initial characters.
 *
 * @example
 * getInitials('Sakura Hime') // 'SH'
 * getInitials('Aiko')        // 'AI'
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return name.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Distributes n points evenly around a circle centered at (cx, cy).
 *
 * @param count - Number of nodes.
 * @param cx    - SVG center x.
 * @param cy    - SVG center y.
 * @param r     - Ring radius in SVG units.
 * @returns Array of {x, y} positions in SVG coordinate space.
 */
function circleLayout(
  count: number,
  cx: number,
  cy: number,
  r: number,
): Array<{ x: number; y: number }> {
  if (count === 0) return [];
  if (count === 1) return [{ x: cx, y: cy }];

  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  });
}

/**
 * Returns the edge colour for a given relationship type,
 * falling back to the acquaintance colour for unknown types.
 */
function edgeColor(type: string): string {
  return RELATIONSHIP_COLORS[type] ?? RELATIONSHIP_COLORS['acquaintance'];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * GraphView — SVG canvas rendering nodes and edges.
 *
 * @param personas     - List of {id, name} pairs to render as nodes.
 * @param relationships - All relationships to draw as edges.
 */
function GraphView({
  personas,
  relationships,
}: {
  personas: Array<{ id: string; name: string }>;
  relationships: CharacterRelationship[];
}) {
  const svgWidth = 600; // internal SVG coordinate system — scales via viewBox
  const cx = svgWidth / 2;
  const cy = GRAPH_HEIGHT / 2;

  // Scale ring radius up a little for larger casts so nodes don't crowd.
  const ringRadius = Math.min(
    RING_RADIUS_BASE + personas.length * 6,
    Math.min(cx, cy) - NODE_RADIUS - 16,
  );

  const positions = circleLayout(personas.length, cx, cy, ringRadius);

  /** Quick lookup: personaId → SVG position */
  const posMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    personas.forEach((persona, i) => {
      map.set(persona.id, positions[i] ?? { x: cx, y: cy });
    });
    return map;
  }, [personas, positions, cx, cy]);

  const isEmpty = personas.length === 0;

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${GRAPH_HEIGHT}`}
      className="w-full"
      style={{ height: GRAPH_HEIGHT }}
      aria-label="Character relationship web"
      role="img"
    >
      {/* Background */}
      <rect
        x={0}
        y={0}
        width={svgWidth}
        height={GRAPH_HEIGHT}
        rx={18}
        fill="var(--card-bg-soft)"
        opacity={0.6}
      />

      {/* Empty state */}
      {isEmpty && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text-muted)"
          fontSize={13}
          fontFamily="inherit"
        >
          No personas yet — add some in the Persona panel.
        </text>
      )}

      {/* Single-persona hint */}
      {personas.length === 1 && relationships.length === 0 && (
        <text
          x={cx}
          y={cy + NODE_RADIUS + 22}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize={11}
          fontFamily="inherit"
        >
          Add another persona and connect them below.
        </text>
      )}

      {/* Edges — drawn before nodes so nodes sit on top */}
      {relationships.map((rel) => {
        const src = posMap.get(rel.sourcePersonaId);
        const tgt = posMap.get(rel.targetPersonaId);
        if (!src || !tgt) return null;

        const mx = (src.x + tgt.x) / 2;
        const my = (src.y + tgt.y) / 2;
        const color = edgeColor(rel.type);
        const dash = RELATIONSHIP_DASH[rel.type] ?? 'none';
        // Opacity scales with strength so weak links read as tenuous.
        const opacity = 0.3 + (rel.strength / 100) * 0.65;

        return (
          <g key={rel.id} aria-label={`${rel.type} relationship`}>
            <line
              x1={src.x}
              y1={src.y}
              x2={tgt.x}
              y2={tgt.y}
              stroke={color}
              strokeWidth={1.5 + (rel.strength / 100) * 2}
              strokeDasharray={dash === 'none' ? undefined : dash}
              strokeOpacity={opacity}
              strokeLinecap="round"
            />
            {/* Edge label at midpoint */}
            <text
              x={mx}
              y={my - 5}
              textAnchor="middle"
              fill={color}
              fillOpacity={Math.min(opacity + 0.2, 1)}
              fontSize={9}
              fontFamily="inherit"
              fontWeight={600}
              letterSpacing={0.5}
              style={{ textTransform: 'uppercase' }}
            >
              {rel.type}
            </text>
          </g>
        );
      })}

      {/* Nodes */}
      {personas.map((persona, i) => {
        const pos = positions[i] ?? { x: cx, y: cy };
        const initials = getInitials(persona.name);

        return (
          <g key={persona.id} aria-label={persona.name}>
            {/* Glow halo */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={NODE_RADIUS + 4}
              fill="var(--color-glow-primary, #ec4899)"
              fillOpacity={0.1}
            />
            {/* Node circle */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={NODE_RADIUS}
              fill="var(--card-bg)"
              stroke="var(--control-border-soft)"
              strokeWidth={1.5}
            />
            {/* Initials */}
            <text
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--text-primary)"
              fontSize={13}
              fontFamily="inherit"
              fontWeight={700}
            >
              {initials}
            </text>
            {/* Name label below node */}
            <text
              x={pos.x}
              y={pos.y + NODE_RADIUS + 13}
              textAnchor="middle"
              fill="var(--text-secondary)"
              fontSize={10}
              fontFamily="inherit"
              fontWeight={500}
            >
              {persona.name.length > 12
                ? `${persona.name.slice(0, 11)}\u2026`
                : persona.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Default form state factory
// ---------------------------------------------------------------------------

function emptyDraft(): Omit<CharacterRelationship, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    sourcePersonaId: '',
    targetPersonaId: '',
    type: 'friend',
    strength: 50,
    description: '',
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * RelationshipWebPanel — settings sub-panel for the Character Relationship Web.
 *
 * Displays a visual SVG graph of persona connections and provides CRUD
 * controls for managing relationships. Data is held in component-local
 * state; appDb persistence will be wired in a follow-up pass.
 */
export default function RelationshipWebPanel() {
  const { state } = useCompanion();
  const personas = state.personas;

  const [relationships, setRelationships] = useState<CharacterRelationship[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);

  const formId = useId();

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  /** Flat {id, name} list suitable for dropdowns and the graph. */
  const personaOptions = useMemo(
    () => personas.map((p) => ({ id: p.id, name: p.name })),
    [personas],
  );

  const personaNameById = useMemo(() => {
    const map = new Map<string, string>();
    personas.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [personas]);

  // ---------------------------------------------------------------------------
  // Form actions
  // ---------------------------------------------------------------------------

  /** Opens the add form with a clean draft. */
  function handleAddClick() {
    setEditingId(null);
    setDraft(emptyDraft());
    setFormError(null);
    setFormOpen(true);
  }

  /**
   * Populates the form for editing an existing relationship.
   *
   * @param rel - The relationship record to edit.
   */
  function handleEditClick(rel: CharacterRelationship) {
    setEditingId(rel.id);
    setDraft({
      sourcePersonaId: rel.sourcePersonaId,
      targetPersonaId: rel.targetPersonaId,
      type: rel.type,
      strength: rel.strength,
      description: rel.description,
    });
    setFormError(null);
    setFormOpen(true);
  }

  /**
   * Validates the draft and either inserts a new relationship or updates
   * the existing one identified by editingId.
   */
  function handleSave() {
    if (!draft.sourcePersonaId) {
      setFormError('Please choose a source persona.');
      return;
    }
    if (!draft.targetPersonaId) {
      setFormError('Please choose a target persona.');
      return;
    }
    if (draft.sourcePersonaId === draft.targetPersonaId) {
      setFormError('A persona cannot have a relationship with itself.');
      return;
    }

    const now = Date.now();

    if (editingId) {
      setRelationships((prev) =>
        prev.map((r) =>
          r.id === editingId
            ? { ...r, ...draft, updatedAt: now }
            : r,
        ),
      );
    } else {
      const next: CharacterRelationship = {
        id: `rel-${now}-${Math.random().toString(36).slice(2, 7)}`,
        ...draft,
        createdAt: now,
        updatedAt: now,
      };
      setRelationships((prev) => [...prev, next]);
    }

    setFormOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
    setFormError(null);
  }

  function handleCancel() {
    setFormOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
    setFormError(null);
  }

  /**
   * Removes a relationship by ID.
   *
   * @param id - The relationship record ID to delete.
   */
  function handleDelete(id: string) {
    setRelationships((prev) => prev.filter((r) => r.id !== id));
    if (editingId === id) {
      handleCancel();
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Section header */}
      <SettingsSectionHeader
        eyebrow="Characters"
        title="Relationship Web"
        description="Map how your personas know and relate to one another. These connections inform narrative context."
        aside={
          <Button
            size="sm"
            variant="default"
            onClick={handleAddClick}
            disabled={personas.length < 2}
            aria-label="Add relationship"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Add Relationship
          </Button>
        }
      />

      {/* Graph */}
      <AppCard className="overflow-hidden p-0">
        <div className="p-1.5">
          <GraphView
            personas={personaOptions}
            relationships={relationships}
          />
        </div>
        {personas.length < 2 && (
          <p className="px-3.5 pb-3 text-center text-xs text-text-muted">
            You need at least two personas to create relationships.
          </p>
        )}
      </AppCard>

      {/* Inline add/edit form */}
      {formOpen && (
        <AppCard className="space-y-3 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">
              <Network className="mr-1 inline-block h-3 w-3" aria-hidden="true" />
              {editingId ? 'Edit Relationship' : 'New Relationship'}
            </span>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg p-1 text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anime-300"
              aria-label="Close form"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Source → Target row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppField label="From persona">
              <Select
                value={draft.sourcePersonaId}
                onValueChange={(v) => setDraft((d) => ({ ...d, sourcePersonaId: v }))}
              >
                <SelectTrigger
                  id={`${formId}-source`}
                  className="rounded-xl text-sm"
                  aria-label="Source persona"
                >
                  <SelectValue placeholder="Choose persona…" />
                </SelectTrigger>
                <SelectContent>
                  {personaOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AppField>

            <AppField label="To persona">
              <Select
                value={draft.targetPersonaId}
                onValueChange={(v) => setDraft((d) => ({ ...d, targetPersonaId: v }))}
              >
                <SelectTrigger
                  id={`${formId}-target`}
                  className="rounded-xl text-sm"
                  aria-label="Target persona"
                >
                  <SelectValue placeholder="Choose persona…" />
                </SelectTrigger>
                <SelectContent>
                  {personaOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AppField>
          </div>

          {/* Type + Strength row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AppField label="Relationship type">
              <Select
                value={draft.type}
                onValueChange={(v) => setDraft((d) => ({ ...d, type: v }))}
              >
                <SelectTrigger
                  id={`${formId}-type`}
                  className="rounded-xl text-sm"
                  aria-label="Relationship type"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{
                            backgroundColor:
                              RELATIONSHIP_COLORS[t] ?? RELATIONSHIP_COLORS['acquaintance'],
                          }}
                          aria-hidden="true"
                        />
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AppField>

            <AppField
              label={`Strength — ${draft.strength}`}
              hint="How intense or close this relationship is."
            >
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={draft.strength}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, strength: Number(e.target.value) }))
                }
                className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--control-bg)] accent-anime-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anime-300"
                aria-label={`Relationship strength: ${draft.strength}`}
              />
            </AppField>
          </div>

          {/* Description */}
          <AppField label="Description (optional)">
            <Textarea
              id={`${formId}-description`}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Describe how these two characters know each other…"
              className="min-h-[72px] rounded-xl text-sm"
              aria-label="Relationship description"
            />
          </AppField>

          {/* Validation error */}
          {formError && (
            <p className="text-xs font-medium text-destructive" role="alert">
              {formError}
            </p>
          )}

          {/* Form actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Cancel
            </Button>
            <Button size="sm" variant="default" onClick={handleSave}>
              <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {editingId ? 'Save Changes' : 'Add Relationship'}
            </Button>
          </div>
        </AppCard>
      )}

      {/* Relationship list */}
      {relationships.length > 0 && (
        <AppCard className="space-y-1 p-3.5">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-anime-600">
            All Relationships
          </div>

          <ul className="space-y-1.5" aria-label="Relationship list">
            {relationships.map((rel) => {
              const srcName = personaNameById.get(rel.sourcePersonaId) ?? rel.sourcePersonaId;
              const tgtName = personaNameById.get(rel.targetPersonaId) ?? rel.targetPersonaId;
              const color = edgeColor(rel.type);

              return (
                <li
                  key={rel.id}
                  className="flex items-center gap-2 rounded-[14px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] px-3 py-2 text-sm"
                >
                  {/* Colour dot */}
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />

                  {/* Label */}
                  <span className="min-w-0 flex-1 truncate text-text-primary">
                    <span className="font-medium">{srcName}</span>
                    <span className="mx-1 text-text-muted">→</span>
                    <span className="font-medium">{tgtName}</span>
                    <span className="mx-1.5 text-text-muted">·</span>
                    <span
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color }}
                    >
                      {rel.type}
                    </span>
                    <span className="ml-1.5 text-xs text-text-muted">
                      ({rel.strength}%)
                    </span>
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleEditClick(rel)}
                      className="rounded-lg p-1.5 text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anime-300"
                      aria-label={`Edit ${srcName} → ${tgtName} relationship`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rel.id)}
                      className="rounded-lg p-1.5 text-text-muted transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anime-300"
                      aria-label={`Delete ${srcName} → ${tgtName} relationship`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </AppCard>
      )}

      {/* Empty state when no relationships exist and the form is closed */}
      {relationships.length === 0 && !formOpen && personas.length >= 2 && (
        <div className="rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] px-3.5 py-4 text-center text-xs leading-5 text-text-muted">
          No relationships defined yet. Use{' '}
          <button
            type="button"
            onClick={handleAddClick}
            className="font-semibold text-anime-500 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anime-300"
          >
            Add Relationship
          </button>{' '}
          to connect your personas.
        </div>
      )}
    </div>
  );
}
