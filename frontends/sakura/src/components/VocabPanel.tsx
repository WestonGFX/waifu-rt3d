import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Trash2, Plus, ChevronLeft, ChevronRight, Download, Upload, BookOpen } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import type { VocabEntry } from '../lib/types';

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

const PAGE_SIZE = 40;

const REGISTER_OPTIONS = [
  'playful', 'cute', 'edgy', 'flirty', 'chill', 'hype',
  'dramatic', 'sassy', 'wholesome', 'chaotic', 'neutral',
];

const EMOTION_OPTIONS = [
  'neutral', 'joy', 'love', 'flirt', 'hype', 'sass',
  'anger', 'sad', 'shock', 'cringe', 'comfort', 'tease',
];

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/** Small pill badge (BASE vs CUSTOM) */
function SourceBadge({ source }: { source: 'base' | 'user' }) {
  return (
    <span
      style={{
        fontSize: '0.6rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        padding: '1px 5px',
        borderRadius: '3px',
        backgroundColor: source === 'base'
          ? 'var(--color-border-subtle)'
          : 'color-mix(in srgb, var(--color-accent) 18%, transparent)',
        color: source === 'base'
          ? 'var(--color-text-muted)'
          : 'var(--color-accent)',
        border: source === 'base'
          ? '1px solid var(--color-border)'
          : '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
        flexShrink: 0,
      }}
    >
      {source === 'base' ? 'BASE' : 'CUSTOM'}
    </span>
  );
}

/** Category pill */
function CategoryPill({ label }: { label: string }) {
  if (!label) return null;
  return (
    <span
      style={{
        fontSize: '0.6rem',
        padding: '1px 5px',
        borderRadius: '3px',
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-text-muted)',
        border: '1px solid var(--color-border)',
        flexShrink: 0,
        maxWidth: '80px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Add Entry Form
   ═══════════════════════════════════════════════════════════════════════ */

interface AddFormState {
  term: string;
  meaning: string;
  category: string;
  register: string;
  emotion: string;
}

const EMPTY_FORM: AddFormState = { term: '', meaning: '', category: '', register: 'neutral', emotion: 'neutral' };

function AddEntryForm({ categories, onAdded }: { categories: string[]; onAdded: () => void }) {
  const [form, setForm] = useState<AddFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    fontSize: '0.8rem',
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    color: 'var(--color-text-primary)',
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...fieldStyle,
    cursor: 'pointer',
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.term.trim() || !form.meaning.trim()) {
      setError('Term and meaning are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.addVocabEntry(form);
      setForm(EMPTY_FORM);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <label style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '3px', display: 'block' }}>Term *</label>
          <input
            style={fieldStyle}
            placeholder="e.g. slay"
            value={form.term}
            onChange={e => setForm(f => ({ ...f, term: e.target.value }))}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '3px', display: 'block' }}>Category</label>
          <input
            style={fieldStyle}
            placeholder="e.g. GenZ"
            list="vocab-category-list"
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          />
          <datalist id="vocab-category-list">
            {categories.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
      </div>

      <div>
        <label style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '3px', display: 'block' }}>Meaning *</label>
        <input
          style={fieldStyle}
          placeholder="What does it mean / how is it used?"
          value={form.meaning}
          onChange={e => setForm(f => ({ ...f, meaning: e.target.value }))}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <label style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '3px', display: 'block' }}>Register</label>
          <select style={selectStyle} value={form.register} onChange={e => setForm(f => ({ ...f, register: e.target.value }))}>
            {REGISTER_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '3px', display: 'block' }}>Emotion</label>
          <select style={selectStyle} value={form.emotion} onChange={e => setForm(f => ({ ...f, emotion: e.target.value }))}>
            {EMOTION_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <p style={{ color: 'var(--color-danger, #f44)', fontSize: '0.75rem', margin: 0 }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={saving}
        style={{
          padding: '7px 16px',
          borderRadius: '6px',
          background: 'var(--color-accent-gradient)',
          color: 'var(--color-accent-text)',
          fontWeight: 600,
          fontSize: '0.8rem',
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.7 : 1,
          border: 'none',
          alignSelf: 'flex-end',
        }}
      >
        {saving ? 'Adding…' : '+ Add Entry'}
      </button>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Entry Row
   ═══════════════════════════════════════════════════════════════════════ */

function EntryRow({ entry, onDelete }: { entry: VocabEntry; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await api.deleteVocabEntry(entry.eg_id);
      onDelete();
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '7px 8px',
        borderRadius: '6px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {/* Term + Meaning */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-primary)' }}>
            {entry.term}
          </span>
          <SourceBadge source={entry._source} />
          <CategoryPill label={entry.category} />
          {entry.register && entry.register !== 'neutral' && (
            <span style={{ fontSize: '0.6rem', color: 'var(--color-accent)', opacity: 0.75 }}>
              {entry.register}
            </span>
          )}
        </div>
        <p style={{ margin: '2px 0 0', fontSize: '0.77rem', color: 'var(--color-text-muted)', lineHeight: 1.35 }}>
          {entry.meaning}
        </p>
      </div>

      {/* Delete (user entries only) */}
      {entry._source === 'user' && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            padding: '4px 6px',
            borderRadius: '5px',
            border: confirmDelete ? '1px solid var(--color-danger, #f44)' : '1px solid var(--color-border)',
            background: 'transparent',
            color: confirmDelete ? 'var(--color-danger, #f44)' : 'var(--color-text-muted)',
            cursor: 'pointer',
            fontSize: '0.7rem',
            flexShrink: 0,
          }}
          title={confirmDelete ? 'Click again to confirm' : 'Delete entry'}
        >
          {confirmDelete ? 'Confirm?' : <Trash2 size={12} />}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

type VocabTab = 'browse' | 'mine' | 'add';

/**
 * Right slide-out panel with full Vocabulary Manager.
 *
 * Tabs:
 * - **Browse** — all entries (base + user), paginated, filterable by category/register/search
 * - **My Additions** — user-only entries
 * - **Add New** — form to create a custom vocab entry
 *
 * Matches the feature set of Neon's VocabManager modal.
 */
export function VocabPanel() {
  const { activeOverlay, closeOverlay } = useAppStore();
  const open = activeOverlay === 'vocab';

  const [activeTab, setActiveTab] = useState<VocabTab>('browse');
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterRegister, setFilterRegister] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [stats, setStats] = useState<{ total: number; base_count: number; user_count: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [search]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const source = activeTab === 'mine' ? 'user' : undefined;
      const result = await api.getVocabEntries({
        search: debouncedSearch || undefined,
        category: filterCategory || undefined,
        register: filterRegister || undefined,
        source,
        page,
        size: PAGE_SIZE,
      });
      setEntries(result.entries);
      setTotal(result.total);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterCategory, filterRegister, page, debouncedSearch]);

  // Load on open + filter changes
  useEffect(() => {
    if (!open) return;
    loadEntries();
  }, [open, loadEntries]);

  // Load categories + stats once on open
  useEffect(() => {
    if (!open) return;
    api.getVocabCategories().then(setCategories).catch(() => {});
    api.getVocabStats().then(setStats).catch(() => {});
  }, [open]);

  // Reset page when tab changes
  useEffect(() => {
    setPage(0);
    setSearch('');
    setFilterCategory('');
    setFilterRegister('');
  }, [activeTab]);

  async function handleExport() {
    try {
      const result = await api.exportVocab();
      const blob = new Blob([JSON.stringify(result.entries, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my_vocab.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — UI feedback can be added later
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const entries = JSON.parse(text);
      await api.importVocab(Array.isArray(entries) ? entries : entries.entries ?? []);
      loadEntries();
      api.getVocabStats().then(setStats).catch(() => {});
    } catch {
      // silent
    }
    e.target.value = '';
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const tabStyle = (id: VocabTab): React.CSSProperties => ({
    padding: '5px 12px',
    fontSize: '0.77rem',
    fontWeight: activeTab === id ? 700 : 400,
    borderRadius: '6px',
    cursor: 'pointer',
    border: 'none',
    backgroundColor: activeTab === id
      ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)'
      : 'transparent',
    color: activeTab === id ? 'var(--color-accent)' : 'var(--color-text-muted)',
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="vocab-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeOverlay}
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              zIndex: 40,
            }}
          />

          {/* Panel */}
          <motion.div
            key="vocab-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: '520px',
              maxWidth: '94vw',
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
                padding: '16px 20px 12px',
                borderBottom: '1px solid var(--color-border)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <BookOpen size={16} style={{ color: 'var(--color-accent)' }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '0.06em', color: 'var(--color-text-primary)' }}>
                  VOCABULARY
                </span>
                {stats && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginLeft: '4px' }}>
                    {stats.total.toLocaleString()} entries · {stats.user_count} custom
                  </span>
                )}
                <button
                  onClick={closeOverlay}
                  style={{
                    marginLeft: 'auto',
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

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '4px', marginTop: '10px' }}>
                {([['browse', 'Browse'], ['mine', 'My Additions'], ['add', 'Add New']] as const).map(([id, label]) => (
                  <button key={id} style={tabStyle(id)} onClick={() => setActiveTab(id)}>
                    {id === 'add' && <Plus size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />}
                    {label}
                  </button>
                ))}

                {/* Export/Import — shown on browse + mine tabs */}
                {activeTab !== 'add' && (
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    <button
                      onClick={handleExport}
                      title="Export custom vocab"
                      style={{
                        padding: '4px 8px', fontSize: '0.72rem', borderRadius: '5px',
                        border: '1px solid var(--color-border)', background: 'transparent',
                        color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      <Download size={11} /> Export
                    </button>
                    <label
                      title="Import vocab JSON"
                      style={{
                        padding: '4px 8px', fontSize: '0.72rem', borderRadius: '5px',
                        border: '1px solid var(--color-border)', background: 'transparent',
                        color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      <Upload size={11} /> Import
                      <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* ── Toolbar (Browse + Mine tabs) ── */}
            {activeTab !== 'add' && (
              <div
                style={{
                  padding: '10px 20px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  flexShrink: 0,
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                }}
              >
                {/* Search */}
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={13} style={{
                    position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--color-text-muted)', pointerEvents: 'none',
                  }} />
                  <input
                    placeholder="Search term or meaning…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      paddingLeft: '28px', paddingRight: '8px', paddingTop: '5px', paddingBottom: '5px',
                      fontSize: '0.78rem',
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>

                {/* Category filter */}
                {activeTab === 'browse' && (
                  <select
                    value={filterCategory}
                    onChange={e => { setFilterCategory(e.target.value); setPage(0); }}
                    style={{
                      padding: '5px 8px', fontSize: '0.78rem',
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">All categories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}

                {/* Register filter */}
                {activeTab === 'browse' && (
                  <select
                    value={filterRegister}
                    onChange={e => { setFilterRegister(e.target.value); setPage(0); }}
                    style={{
                      padding: '5px 8px', fontSize: '0.78rem',
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">All registers</option>
                    {REGISTER_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}
              </div>
            )}

            {/* ── Content ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {activeTab === 'add' ? (
                <AddEntryForm
                  categories={categories}
                  onAdded={() => {
                    setActiveTab('mine');
                    api.getVocabStats().then(setStats).catch(() => {});
                  }}
                />
              ) : loading ? (
                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '40px 0', fontSize: '0.85rem' }}>
                  Loading…
                </div>
              ) : entries.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '40px 0', fontSize: '0.85rem' }}>
                  {activeTab === 'mine' ? 'No custom entries yet. Add some!' : 'No entries found.'}
                </div>
              ) : (
                entries.map(entry => (
                  <EntryRow
                    key={entry.eg_id}
                    entry={entry}
                    onDelete={() => {
                      loadEntries();
                      api.getVocabStats().then(setStats).catch(() => {});
                    }}
                  />
                ))
              )}
            </div>

            {/* ── Pagination ── */}
            {activeTab !== 'add' && totalPages > 1 && (
              <div
                style={{
                  padding: '10px 20px',
                  borderTop: '1px solid var(--color-border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{
                    padding: '4px 8px', borderRadius: '5px',
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    color: page === 0 ? 'var(--color-border)' : 'var(--color-text-muted)',
                    cursor: page === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                  {page + 1} / {totalPages} <span style={{ opacity: 0.6 }}>({total.toLocaleString()} entries)</span>
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  style={{
                    padding: '4px 8px', borderRadius: '5px',
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    color: page >= totalPages - 1 ? 'var(--color-border)' : 'var(--color-text-muted)',
                    cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
