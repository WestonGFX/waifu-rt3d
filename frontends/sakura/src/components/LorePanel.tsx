import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Pencil, Check, ChevronDown } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import type { LoreEntry } from '../lib/types';

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** Valid injection positions and their human-readable labels. */
const POSITION_OPTIONS: { value: LoreEntry['injection_position']; label: string }[] = [
  { value: 'after_system_prompt', label: 'After system prompt' },
  { value: 'before_system_prompt', label: 'Before system prompt' },
  { value: 'before_last_message', label: 'Before last message' },
  { value: 'after_last_2_messages', label: 'Before last 2 messages' },
];

/** Empty form state for creating a new lore entry. */
const EMPTY_FORM: FormState = {
  title: '',
  content: '',
  keywords: [],
  injection_position: 'after_system_prompt',
  priority: 0,
  enabled: true,
};

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface FormState {
  title: string;
  content: string;
  keywords: string[];
  injection_position: LoreEntry['injection_position'];
  priority: number;
  enabled: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out panel for managing lorebook / world-info entries.
 *
 * Shows all lore entries for the active character with inline add/edit forms,
 * keyword tag input, and per-entry enable/disable toggles.
 *
 * Matches the visual density and patterns of MemoryPanel.
 */
export function LorePanel() {
  const { activeOverlay, closeOverlay, activeCharacter } = useAppStore();
  const open = activeOverlay === 'lore';

  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state — null = list mode, 'new' = adding, number = editing entry id
  const [formMode, setFormMode] = useState<null | 'new' | number>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [keywordInput, setKeywordInput] = useState('');
  const [saving, setSaving] = useState(false);

  const charId = activeCharacter?.id;

  /** Load lore entries from the backend. */
  const loadEntries = useCallback(async () => {
    if (!charId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getLoreEntries(charId);
      setEntries(res.entries || []);
    } catch (e) {
      setError((e as Error).message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [charId]);

  // Load entries when panel opens
  useEffect(() => {
    if (open && charId) {
      setFormMode(null);
      setForm({ ...EMPTY_FORM });
      setKeywordInput('');
      loadEntries();
    }
  }, [open, charId, loadEntries]);

  /** Open the add-new form. */
  const startAdd = () => {
    setFormMode('new');
    setForm({ ...EMPTY_FORM });
    setKeywordInput('');
  };

  /** Open the edit form for an existing entry. */
  const startEdit = (entry: LoreEntry) => {
    setFormMode(entry.id);
    setForm({
      title: entry.title,
      content: entry.content,
      keywords: [...entry.keywords],
      injection_position: entry.injection_position,
      priority: entry.priority,
      enabled: entry.enabled,
    });
    setKeywordInput('');
  };

  /** Cancel the current form. */
  const cancelForm = () => {
    setFormMode(null);
    setForm({ ...EMPTY_FORM });
    setKeywordInput('');
  };

  /** Add a keyword tag from the input. */
  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !form.keywords.includes(kw)) {
      setForm(f => ({ ...f, keywords: [...f.keywords, kw] }));
    }
    setKeywordInput('');
  };

  /** Remove a keyword tag by index. */
  const removeKeyword = (index: number) => {
    setForm(f => ({ ...f, keywords: f.keywords.filter((_, i) => i !== index) }));
  };

  /** Handle Enter key in keyword input. */
  const handleKeywordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword();
    }
  };

  /** Save the current form (create or update). */
  const saveForm = async () => {
    if (!charId) return;
    setSaving(true);
    try {
      if (formMode === 'new') {
        await api.createLoreEntry(charId, form);
      } else if (typeof formMode === 'number') {
        await api.updateLoreEntry(formMode, form);
      }
      cancelForm();
      await loadEntries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /** Delete an entry. */
  const handleDelete = async (entryId: number) => {
    try {
      await api.deleteLoreEntry(entryId);
      await loadEntries();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  /** Toggle an entry's enabled state. */
  const handleToggle = async (entry: LoreEntry) => {
    try {
      await api.updateLoreEntry(entry.id, { enabled: !entry.enabled });
      await loadEntries();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const cardStyle = {
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '10px',
  };

  const fieldStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border-subtle)',
    color: 'var(--color-text-primary)',
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            onClick={closeOverlay}
            className="fixed inset-0 bg-black z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width: 'min(460px, 85vw)',
              backgroundColor: 'var(--color-surface)',
              borderLeft: '1px solid var(--color-border-subtle)',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
            }}
          >
            {/* ── Header ─────────────────────────────────────── */}
            <div
              className="flex items-center justify-between px-4 h-12 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: 'var(--color-accent)' }}>&#128218;</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Lorebook
                </span>
                {activeCharacter && (
                  <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {activeCharacter.name}
                  </span>
                )}
              </div>
              <button
                onClick={closeOverlay}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Content ────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">

              {/* Add button */}
              {formMode === null && (
                <button
                  onClick={startAdd}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                    border: '1px solid var(--color-accent)',
                  }}
                >
                  <Plus size={13} />
                  Add Lore Entry
                </button>
              )}

              {/* ── Inline Form (Add / Edit) ─────────────────── */}
              {formMode !== null && (
                <div className="p-3 space-y-2.5" style={cardStyle}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
                    {formMode === 'new' ? 'New Entry' : 'Edit Entry'}
                  </p>

                  {/* Title */}
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Title (e.g. Magic System)"
                    className="w-full text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                    style={fieldStyle}
                  />

                  {/* Content */}
                  <textarea
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="Lore content to inject..."
                    rows={4}
                    className="w-full text-[11px] px-2.5 py-1.5 rounded-lg outline-none resize-y"
                    style={{ ...fieldStyle, minHeight: '60px' }}
                  />

                  {/* Keywords */}
                  <div>
                    <p className="text-[10px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                      Keywords (type + Enter)
                    </p>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {form.keywords.map((kw, i) => (
                        <span
                          key={i}
                          onClick={() => removeKeyword(i)}
                          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] cursor-pointer transition-opacity hover:opacity-70"
                          style={{
                            backgroundColor: 'var(--color-accent-soft)',
                            color: 'var(--color-accent)',
                          }}
                          title="Click to remove"
                        >
                          {kw}
                          <X size={9} />
                        </span>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={keywordInput}
                      onChange={e => setKeywordInput(e.target.value)}
                      onKeyDown={handleKeywordKeyDown}
                      placeholder="Add keyword..."
                      className="w-full text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                      style={fieldStyle}
                    />
                  </div>

                  {/* Position + Priority row */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <p className="text-[10px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                        Injection Position
                      </p>
                      <div className="relative">
                        <select
                          value={form.injection_position}
                          onChange={e => setForm(f => ({ ...f, injection_position: e.target.value as LoreEntry['injection_position'] }))}
                          className="w-full text-[11px] px-2.5 py-1.5 rounded-lg outline-none appearance-none pr-7"
                          style={fieldStyle}
                        >
                          {POSITION_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <ChevronDown
                          size={12}
                          className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        />
                      </div>
                    </div>
                    <div style={{ width: '70px' }}>
                      <p className="text-[10px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                        Priority
                      </p>
                      <input
                        type="number"
                        value={form.priority}
                        onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                        className="w-full text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                        style={fieldStyle}
                      />
                    </div>
                  </div>

                  {/* Enabled toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      Enabled
                    </span>
                  </label>

                  {/* Save / Cancel buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={saveForm}
                      disabled={saving || !form.title.trim()}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        color: 'var(--color-accent-text)',
                      }}
                    >
                      <Check size={12} />
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={cancelForm}
                      className="px-3 py-1.5 rounded-lg text-[11px] transition-colors"
                      style={{
                        color: 'var(--color-text-tertiary)',
                        border: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* ── Entry List ───────────────────────────────── */}
              {loading && (
                <p className="text-xs text-center py-6" style={{ color: 'var(--color-text-tertiary)' }}>
                  Loading...
                </p>
              )}

              {error && (
                <p className="text-xs text-center py-4" style={{ color: 'var(--color-danger)' }}>
                  Error: {error}
                </p>
              )}

              {!loading && !error && entries.length === 0 && formMode === null && (
                <div className="text-center py-8">
                  <p className="text-[11px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
                    No lore entries yet.
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    Add world info, NPC details, or location descriptions that inject into the AI's context when keywords are mentioned.
                  </p>
                </div>
              )}

              {!loading && entries.map(entry => (
                <div
                  key={entry.id}
                  className="group p-2.5 rounded-lg transition-colors duration-100"
                  style={{
                    ...cardStyle,
                    opacity: entry.enabled ? 1 : 0.55,
                  }}
                >
                  {/* Title row */}
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[11px] font-semibold flex-1 truncate"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {entry.title || '(untitled)'}
                    </span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: entry.enabled ? 'color-mix(in srgb, var(--color-success) 15%, transparent)' : 'var(--color-border)',
                        color: entry.enabled ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                      }}
                    >
                      {entry.enabled ? 'ON' : 'OFF'}
                    </span>
                  </div>

                  {/* Content preview */}
                  <p
                    className="text-[10px] leading-relaxed mb-1.5"
                    style={{ color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}
                  >
                    {(entry.content || '').slice(0, 60)}
                    {(entry.content?.length || 0) > 60 && '...'}
                  </p>

                  {/* Keyword chips */}
                  {entry.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {entry.keywords.map((kw, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded-full text-[9px]"
                          style={{
                            backgroundColor: 'var(--color-accent-soft)',
                            color: 'var(--color-accent)',
                          }}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions row */}
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      onClick={() => handleToggle(entry)}
                      className="text-[9px] px-2 py-0.5 rounded transition-colors"
                      style={{
                        color: entry.enabled ? 'var(--color-text-tertiary)' : 'var(--color-success)',
                        border: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      {entry.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => startEdit(entry)}
                      className="p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                      style={{ color: 'var(--color-text-tertiary)' }}
                      title="Edit"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                      style={{ color: 'var(--color-danger)' }}
                      title="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                    <span className="ml-auto text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      P{entry.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
