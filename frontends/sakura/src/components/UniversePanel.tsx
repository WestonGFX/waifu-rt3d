import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, Plus, Edit2, Trash2, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import type { Universe } from '../lib/types';

/* ═══════════════════════════════════════════════════════════════════════
   Internal state types
   ═══════════════════════════════════════════════════════════════════════ */

/** Describes which universe row is currently expanded to show character pills. */
type ExpandedSet = Set<number>;

/** Form state for create or edit mode. */
interface UniverseFormState {
  /** When non-null, the form is in edit mode for the universe with this id. */
  editingId: number | null;
  name: string;
  lore: string;
}

const EMPTY_FORM: UniverseFormState = { editingId: null, name: '', lore: '' };

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Truncate a lore string to a maximum character count and append an ellipsis.
 *
 * @param text  - Full lore text.
 * @param limit - Maximum character count before truncation (default 160).
 * @returns Truncated string with "…" appended when over the limit.
 */
function truncateLore(text: string, limit = 160): string {
  if (!text) return '';
  return text.length > limit ? text.slice(0, limit).trimEnd() + '…' : text;
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/** Props for the inline create/edit form rendered inside the panel. */
interface UniverseFormProps {
  /** Current form field values. */
  form: UniverseFormState;
  /** True when a save network request is in-flight. */
  saving: boolean;
  /** Callback fired on each keystroke to update the `name` field. */
  onNameChange: (value: string) => void;
  /** Callback fired on each keystroke to update the `lore` textarea. */
  onLoreChange: (value: string) => void;
  /** Commit the current form values (create or update). */
  onSave: () => void;
  /** Discard the form and revert to list view. */
  onCancel: () => void;
}

/**
 * Reusable inline form for creating and editing universes.
 * Rendered below the universe list in the panel body.
 *
 * @param props - See {@link UniverseFormProps}.
 */
function UniverseForm({ form, saving, onNameChange, onLoreChange, onSave, onCancel }: UniverseFormProps) {
  const isEdit = form.editingId !== null;
  const canSave = form.name.trim().length > 0 && !saving;

  return (
    <motion.div
      key="universe-form"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      style={{
        marginTop: '16px',
        padding: '14px 16px',
        borderRadius: '8px',
        border: '1px solid var(--color-accent)',
        backgroundColor: 'color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Section label */}
      <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-accent)', textTransform: 'uppercase' }}>
        {isEdit ? 'Edit Universe' : 'New Universe'}
      </p>

      {/* Name field */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
          Name <span style={{ color: 'var(--color-danger, #f44)' }}>*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="e.g. Feudal Japan"
          autoFocus
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '6px 10px',
            fontSize: '0.85rem',
            borderRadius: '6px',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-background)',
            color: 'var(--color-text-primary)',
          }}
        />
      </div>

      {/* Lore textarea */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
          Lore
        </label>
        <textarea
          value={form.lore}
          onChange={e => onLoreChange(e.target.value)}
          placeholder="Describe the shared world. This text is prepended to every member character's system prompt…"
          rows={5}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '6px 10px',
            fontSize: '0.82rem',
            borderRadius: '6px',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-background)',
            color: 'var(--color-text-primary)',
            resize: 'vertical',
            lineHeight: 1.55,
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Save / Cancel buttons */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '5px 14px',
            fontSize: '0.78rem',
            borderRadius: '5px',
            border: '1px solid var(--color-border)',
            background: 'transparent',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!canSave}
          style={{
            padding: '5px 16px',
            fontSize: '0.78rem',
            fontWeight: 600,
            borderRadius: '5px',
            border: 'none',
            backgroundColor: canSave ? 'var(--color-accent)' : 'var(--color-border)',
            color: canSave ? '#fff' : 'var(--color-text-muted)',
            cursor: canSave ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <Check size={13} />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel for the Universe / Shared World Builder feature (#23).
 *
 * Features:
 * - Lists all universes with name, truncated lore, and character count pill.
 * - Expand/collapse each row to reveal character assignment pills.
 * - Inline form (below the list) for creating a new universe or editing an
 *   existing one.  Triggered by the "New Universe" header button or the per-row
 *   Edit button.
 * - Delete with a window.confirm guard.
 * - Character assignment: click a character pill to assign them to that universe
 *   or remove them if they are already assigned.  Refreshes `characters` in
 *   appStore after every mutation so the rest of the UI stays in sync.
 *
 * Reads `activeOverlay` from appStore and shows only when it equals 'universes'.
 */
export function UniversePanel() {
  const { activeOverlay, closeOverlay, characters, loadCharacters } = useAppStore();
  const open = activeOverlay === 'universes';

  // ── Data ──────────────────────────────────────────────────────────────
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Form ──────────────────────────────────────────────────────────────
  /** Whether the create/edit form is currently visible. */
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<UniverseFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ── Expansion ─────────────────────────────────────────────────────────
  /** Set of universe ids whose character assignment section is expanded. */
  const [expanded, setExpanded] = useState<ExpandedSet>(new Set());

  // ── Assignment mutation loading ───────────────────────────────────────
  /** Character ids currently in-flight for assignment/removal requests. */
  const [assigningCharIds, setAssigningCharIds] = useState<Set<number>>(new Set());

  // ── Effects ───────────────────────────────────────────────────────────

  /** Fetch universes when the panel opens; reset transient state on close. */
  useEffect(() => {
    if (!open) {
      // Reset all transient state when closed so next open is clean.
      setShowForm(false);
      setForm(EMPTY_FORM);
      setExpanded(new Set());
      return;
    }

    fetchUniverses();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Data helpers ──────────────────────────────────────────────────────

  /**
   * Load (or reload) the universes list from the API.
   * Also re-fetches characters so assignment counts stay accurate.
   */
  async function fetchUniverses(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getUniverses();
      setUniverses(data);
      // Keep character universe_id fields in sync.
      await loadCharacters();
    } catch {
      setError('Failed to load universes.');
    } finally {
      setLoading(false);
    }
  }

  // ── Form handlers ─────────────────────────────────────────────────────

  /**
   * Open the form in "new universe" mode.
   * Clears any in-progress edit and scrolls the form into view.
   */
  function handleNewUniverse(): void {
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  /**
   * Populate the form with the given universe's current values and show it.
   *
   * @param universe - The universe row that the user clicked Edit on.
   */
  function handleEdit(universe: Universe): void {
    setForm({ editingId: universe.id, name: universe.name, lore: universe.lore });
    setShowForm(true);
  }

  /** Discard the form and return to list-only view. */
  function handleCancelForm(): void {
    setShowForm(false);
    setForm(EMPTY_FORM);
  }

  /**
   * Commit the form.  Creates a new universe when `form.editingId` is null;
   * otherwise patches the existing record.  Refreshes the list on success.
   */
  async function handleSave(): Promise<void> {
    const name = form.name.trim();
    if (!name) return;

    setSaving(true);
    try {
      if (form.editingId === null) {
        await api.createUniverse({ name, lore: form.lore.trim() });
      } else {
        await api.updateUniverse(form.editingId, { name, lore: form.lore.trim() });
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      await fetchUniverses();
    } catch {
      // Keep the form open so the user can retry.
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────

  /**
   * Prompt the user to confirm deletion and, if confirmed, delete the universe.
   * Member characters will have their universe_id cleared by the backend.
   *
   * @param universe - The universe to delete.
   */
  async function handleDelete(universe: Universe): Promise<void> {
    const confirmed = window.confirm(
      `Delete universe "${universe.name}"?\n\nAll ${universe.character_count} member character(s) will be unassigned.`
    );
    if (!confirmed) return;

    try {
      await api.deleteUniverse(universe.id);
      await fetchUniverses();
      // If the form was editing this universe, close it.
      if (form.editingId === universe.id) {
        setShowForm(false);
        setForm(EMPTY_FORM);
      }
    } catch {
      // Silently fail — user can retry.
    }
  }

  // ── Expansion toggle ──────────────────────────────────────────────────

  /**
   * Toggle the character assignment section for a universe row.
   *
   * @param universeId - The id of the universe row to expand or collapse.
   */
  function toggleExpanded(universeId: number): void {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(universeId)) {
        next.delete(universeId);
      } else {
        next.add(universeId);
      }
      return next;
    });
  }

  // ── Character assignment ──────────────────────────────────────────────

  /**
   * Assign or unassign a character from the given universe.
   *
   * If the character is already in this universe (`character.universe_id === universeId`),
   * they are removed.  Otherwise they are assigned (overwriting any previous universe).
   *
   * @param universeId - Target universe primary key.
   * @param charId     - Character primary key.
   */
  async function handleToggleCharacter(universeId: number, charId: number): Promise<void> {
    if (assigningCharIds.has(charId)) return; // Prevent double-click.

    setAssigningCharIds(prev => new Set(prev).add(charId));
    try {
      const char = characters.find(c => c.id === charId);
      const isAssigned = char?.universe_id === universeId;

      if (isAssigned) {
        await api.removeCharacterFromUniverse(charId);
      } else {
        await api.assignCharacterToUniverse(universeId, charId);
      }

      // Refresh both universes list (character_count) and character list (universe_id).
      await fetchUniverses();
    } catch {
      // Silently fail — UI will stay in previous state.
    } finally {
      setAssigningCharIds(prev => {
        const next = new Set(prev);
        next.delete(charId);
        return next;
      });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="universe-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeOverlay}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              zIndex: 40,
            }}
          />

          {/* Panel */}
          <motion.div
            key="universe-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Universe builder"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 'min(520px, 94vw)',
              backgroundColor: 'var(--color-background)',
              borderLeft: '1px solid var(--color-border)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ── */}
            <div
              style={{
                padding: '16px 20px 14px',
                borderBottom: '1px solid var(--color-border)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Globe size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    letterSpacing: '0.06em',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  UNIVERSE BUILDER
                </span>

                {/* New Universe button */}
                <button
                  onClick={handleNewUniverse}
                  title="Create a new universe"
                  style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    borderRadius: '5px',
                    border: '1px solid var(--color-accent)',
                    background: 'transparent',
                    color: 'var(--color-accent)',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={12} />
                  New Universe
                </button>

                {/* Close button */}
                <button
                  onClick={closeOverlay}
                  title="Close"
                  aria-label="Close universe builder panel"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    padding: '4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Subtitle */}
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: '0.72rem',
                  color: 'var(--color-text-muted)',
                  lineHeight: 1.4,
                }}
              >
                Group characters under a shared lore document. The lore is injected into every member character's system prompt.
              </p>
            </div>

            {/* ── Body ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px 24px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Loading state */}
              {loading && (
                <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', padding: '40px 0' }}>
                  Loading…
                </p>
              )}

              {/* Error state */}
              {error && !loading && (
                <p style={{ textAlign: 'center', color: 'var(--color-danger, #f44)', fontSize: '0.85rem', padding: '40px 0' }}>
                  {error}
                </p>
              )}

              {/* Empty state (no universes yet) */}
              {!loading && !error && universes.length === 0 && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    padding: '40px 20px',
                    textAlign: 'center',
                  }}
                >
                  <Globe size={36} style={{ opacity: 0.25, color: 'var(--color-accent)' }} />
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', fontWeight: 500, margin: 0 }}>
                    No universes yet
                  </p>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', maxWidth: '280px', lineHeight: 1.5, opacity: 0.75, margin: 0 }}>
                    Create a universe to group characters under a shared lore document.
                  </p>
                </div>
              )}

              {/* Universe list */}
              {!loading && !error && universes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {universes.map(universe => {
                    const isExpanded = expanded.has(universe.id);
                    const isBeingEdited = form.editingId === universe.id && showForm;

                    return (
                      <div
                        key={universe.id}
                        style={{
                          borderRadius: '8px',
                          border: isBeingEdited
                            ? '1px solid var(--color-accent)'
                            : '1px solid var(--color-border)',
                          backgroundColor: 'var(--color-surface)',
                          overflow: 'hidden',
                          transition: 'border-color 0.15s',
                        }}
                      >
                        {/* ── Universe row ── */}
                        <div style={{ padding: '12px 14px' }}>
                          {/* Row header: name + pill + actions */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            {/* Universe name */}
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                color: 'var(--color-text-primary)',
                                flex: 1,
                                lineHeight: 1.3,
                                paddingTop: '1px',
                              }}
                            >
                              {universe.name}
                            </span>

                            {/* Character count pill */}
                            <span
                              title={`${universe.character_count} character(s) in this universe`}
                              style={{
                                flexShrink: 0,
                                padding: '2px 8px',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                borderRadius: '20px',
                                backgroundColor: 'var(--color-accent-soft)',
                                color: 'var(--color-accent)',
                                letterSpacing: '0.03em',
                              }}
                            >
                              {universe.character_count} char{universe.character_count !== 1 ? 's' : ''}
                            </span>

                            {/* Edit button */}
                            <button
                              onClick={() => handleEdit(universe)}
                              title="Edit universe"
                              aria-label={`Edit ${universe.name}`}
                              style={{
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                padding: '4px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--color-text-muted)',
                                borderRadius: '4px',
                              }}
                            >
                              <Edit2 size={13} />
                            </button>

                            {/* Delete button */}
                            <button
                              onClick={() => handleDelete(universe)}
                              title="Delete universe"
                              aria-label={`Delete ${universe.name}`}
                              style={{
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                padding: '4px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--color-danger, #f44)',
                                borderRadius: '4px',
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          {/* Lore preview */}
                          {universe.lore && (
                            <p
                              style={{
                                margin: '6px 0 0',
                                fontSize: '0.78rem',
                                color: 'var(--color-text-secondary)',
                                lineHeight: 1.5,
                              }}
                            >
                              {truncateLore(universe.lore)}
                            </p>
                          )}

                          {/* Expand/collapse toggle for character section */}
                          <button
                            onClick={() => toggleExpanded(universe.id)}
                            style={{
                              marginTop: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              color: 'var(--color-text-muted)',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0',
                              letterSpacing: '0.03em',
                            }}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? 'Collapse character assignment' : 'Expand character assignment'}
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {isExpanded ? 'Hide characters' : 'Assign characters'}
                          </button>
                        </div>

                        {/* ── Character assignment section ── */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              key={`chars-${universe.id}`}
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18 }}
                              style={{ overflow: 'hidden' }}
                            >
                              <div
                                style={{
                                  padding: '10px 14px 14px',
                                  borderTop: '1px solid var(--color-border)',
                                  backgroundColor: 'color-mix(in srgb, var(--color-background) 60%, var(--color-surface))',
                                }}
                              >
                                {characters.length === 0 ? (
                                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                    No characters found.
                                  </p>
                                ) : (
                                  <>
                                    <p
                                      style={{
                                        margin: '0 0 8px',
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.05em',
                                        color: 'var(--color-text-muted)',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      Click to assign / unassign
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {characters.map(char => {
                                        const isAssigned = char.universe_id === universe.id;
                                        const isLoading = assigningCharIds.has(char.id);

                                        return (
                                          <button
                                            key={char.id}
                                            onClick={() => handleToggleCharacter(universe.id, char.id)}
                                            disabled={isLoading}
                                            title={
                                              isAssigned
                                                ? `Remove ${char.name} from this universe`
                                                : char.universe_id != null
                                                  ? `Move ${char.name} to this universe (currently in another)`
                                                  : `Add ${char.name} to this universe`
                                            }
                                            style={{
                                              padding: '4px 10px',
                                              fontSize: '0.75rem',
                                              fontWeight: isAssigned ? 700 : 500,
                                              borderRadius: '20px',
                                              border: isAssigned
                                                ? '1px solid var(--color-accent)'
                                                : '1px solid var(--color-border)',
                                              backgroundColor: isAssigned
                                                ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)'
                                                : 'var(--color-background)',
                                              color: isAssigned
                                                ? 'var(--color-accent)'
                                                : 'var(--color-text-secondary)',
                                              cursor: isLoading ? 'wait' : 'pointer',
                                              opacity: isLoading ? 0.6 : 1,
                                              transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                            }}
                                          >
                                            {isAssigned && <Check size={11} />}
                                            {char.name}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Inline form ── */}
              <AnimatePresence>
                {showForm && (
                  <UniverseForm
                    form={form}
                    saving={saving}
                    onNameChange={value => setForm(f => ({ ...f, name: value }))}
                    onLoreChange={value => setForm(f => ({ ...f, lore: value }))}
                    onSave={handleSave}
                    onCancel={handleCancelForm}
                  />
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
