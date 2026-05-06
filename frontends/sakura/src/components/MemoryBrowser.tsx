/**
 * MemoryBrowser — Feature P5: Unified Memory Browser
 *
 * Single-panel view combining everything a character "knows" about the user
 * into a tabbed interface. Replaces the need to open 3 separate panels
 * (MemoryPanel, UserKnowledgePanel, DiaryPanel).
 *
 * Tabs:
 * 1. **Overview** — Stats dashboard from /api/characters/{id}/memory/overview
 * 2. **About You** — User facts CRUD (identity, preferences, history, etc.)
 * 3. **Memories** — Tiered memory browser with search, delete, promote
 * 4. **Journal**  — Character journal entries (from adaptive journal system)
 *
 * Design:
 * - Right slide-in panel (460px, matches MemoryPanel/DiaryPanel pattern)
 * - AnimatePresence + framer-motion for smooth open/close
 * - Full theme-awareness via CSS custom properties
 * - All data fetched on tab switch, no global store pollution
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, Trash2, ChevronLeft, ChevronRight, Star,
  User, Heart, Clock, Smile, Tag, Plus, Edit3, Check,
  Brain, BookOpen, BarChart3, Loader2, MessageCircle,
  Database, ArrowUpCircle, FileText,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api, type MemoryItem } from '../lib/api';
import type { UserFact } from '../lib/types';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

type TabId = 'overview' | 'facts' | 'memories' | 'journal';

interface TabDef {
  id: TabId;
  label: string;
  icon: ReactNode;
}

const TABS: TabDef[] = [
  { id: 'overview',  label: 'Overview',   icon: <BarChart3 size={13} /> },
  { id: 'facts',     label: 'About You',  icon: <User size={13} /> },
  { id: 'memories',  label: 'Memories',   icon: <Brain size={13} /> },
  { id: 'journal',   label: 'Journal',    icon: <BookOpen size={13} /> },
];

type FactCategory = 'identity' | 'preferences' | 'history' | 'relationship' | 'general';

const CATEGORY_META: Record<FactCategory, { label: string; icon: ReactNode; color: string }> = {
  identity:     { label: 'Identity',     icon: <User size={12} />,   color: 'var(--color-accent)' },
  preferences:  { label: 'Preferences',  icon: <Heart size={12} />,  color: '#e9729f' },
  history:      { label: 'History',      icon: <Clock size={12} />,  color: '#f59e0b' },
  relationship: { label: 'Relationship', icon: <Smile size={12} />,  color: '#39c96e' },
  general:      { label: 'General',      icon: <Tag size={12} />,    color: 'var(--color-text-secondary)' },
};

const CATEGORIES = Object.keys(CATEGORY_META) as FactCategory[];


interface JournalEntry {
  id: number;
  session_id: number;
  entry_text: string;
  created_at: string;
}

interface OverviewStats {
  total_messages: number;
  total_facts: number;
  total_journal_entries: number;
  has_profile: boolean;
}

interface OverviewData {
  user_facts: UserFact[];
  journal_entries: JournalEntry[];
  profile: Record<string, unknown> | null;
  stats: OverviewStats;
}

const PAGE_SIZE = 12;
const TIER_LABEL: Record<number, string> = { 1: 'Fleeting', 2: 'Recent', 3: 'Permanent' };
const TIER_COLOR: Record<number, string> = {
  1: 'var(--color-text-tertiary)',
  2: 'var(--color-accent)',
  3: '#f59e0b',
};

/* ═══════════════════════════════════════════════════════════════════════
   Shared styles
   ═══════════════════════════════════════════════════════════════════════ */

const cardStyle = {
  backgroundColor: 'var(--color-background)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 10,
};

const fieldStyle = {
  backgroundColor: 'var(--color-background)',
  border: '1px solid var(--color-border-subtle)',
  color: 'var(--color-text-primary)',
};

/* ═══════════════════════════════════════════════════════════════════════
   Overview Tab
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Displays a stats dashboard + quick summary of all character memory.
 * Pulls from GET /api/characters/{id}/memory/overview.
 */
function OverviewTab({ charId, charName }: { charId: number; charName: string }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getMemoryOverview(charId)
      .then(res => setData({
        user_facts: res.user_facts ?? [],
        journal_entries: res.journal_entries ?? [],
        profile: res.profile,
        stats: res.stats ?? { total_messages: 0, total_facts: 0, total_journal_entries: 0, has_profile: false },
      }))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [charId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-tertiary)' }}>
        <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
        <p style={{ fontSize: '0.8rem' }}>Loading overview...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-xs text-center py-8" style={{ color: 'var(--color-text-tertiary)' }}>
        Could not load memory overview.
      </p>
    );
  }

  const { stats } = data;

  /** Single stat card. */
  const StatCard = ({ label, value, icon, color }: { label: string; value: number | string; icon: ReactNode; color: string }) => (
    <div
      style={{
        ...cardStyle,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 36, height: 36, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
          color,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <p style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          {label}
        </p>
      </div>
    </div>
  );

  // Category breakdown for the mini fact chart
  const factsByCategory = CATEGORIES.map(cat => ({
    cat,
    count: data.user_facts.filter(f => f.category === cat).length,
    ...CATEGORY_META[cat],
  })).filter(c => c.count > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Title */}
      <div style={{ marginBottom: 4 }}>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1rem',
            fontWeight: 300,
            fontStyle: 'italic',
            color: 'var(--color-text-primary)',
          }}
        >
          {charName}'s Memory
        </h3>
        <p style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          Everything this character knows and remembers
        </p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <StatCard
          label="Messages exchanged"
          value={stats.total_messages}
          icon={<MessageCircle size={17} />}
          color="var(--color-accent)"
        />
        <StatCard
          label="Facts learned"
          value={stats.total_facts}
          icon={<Brain size={17} />}
          color="#e9729f"
        />
        <StatCard
          label="Journal entries"
          value={stats.total_journal_entries}
          icon={<BookOpen size={17} />}
          color="#f59e0b"
        />
        <StatCard
          label="Adaptive profile"
          value={stats.has_profile ? 'Active' : 'Building...'}
          icon={<ArrowUpCircle size={17} />}
          color="#39c96e"
        />
      </div>

      {/* Fact breakdown */}
      {factsByCategory.length > 0 && (
        <div style={{ ...cardStyle, padding: '12px 14px' }}>
          <p
            style={{
              fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--color-text-tertiary)',
              marginBottom: 10,
            }}
          >
            Knowledge by category
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {factsByCategory.map(({ cat, count, label, color }) => {
              const pct = stats.total_facts > 0 ? (count / stats.total_facts) * 100 : 0;
              return (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.72rem', color, width: 80, flexShrink: 0 }}>{label}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: 'var(--color-border-subtle)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: 3,
                        backgroundColor: color,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary)', width: 24, textAlign: 'right' }}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Latest journal preview */}
      {data.journal_entries.length > 0 && (
        <div style={{ ...cardStyle, padding: '12px 14px' }}>
          <p
            style={{
              fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--color-text-tertiary)',
              marginBottom: 8,
            }}
          >
            Latest journal entry
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {data.journal_entries[0].entry_text.slice(0, 300)}
            {data.journal_entries[0].entry_text.length > 300 && '...'}
          </p>
          <p style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)', marginTop: 6 }}>
            {new Date(data.journal_entries[0].created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Facts Tab (About You)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Displays user facts grouped by category with add/edit/delete.
 * Logic ported from UserKnowledgePanel with improved layout for tab embedding.
 */
function FactsTab({ charId, charName }: { charId: number; charName: string }) {
  const [facts, setFacts] = useState<UserFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [addText, setAddText] = useState('');
  const [addCategory, setAddCategory] = useState<FactCategory>('general');
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const loadFacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getUserFacts(charId);
      setFacts(res.facts ?? []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [charId]);

  useEffect(() => { loadFacts(); }, [loadFacts]);

  const handleDelete = async (factId: number) => {
    try {
      await api.deleteUserFact(charId, factId);
      setFacts(prev => prev.filter(f => f.id !== factId));
    } catch { /* non-fatal */ }
  };

  const handleAdd = async () => {
    if (!addText.trim()) return;
    setAdding(true);
    try {
      const res = await api.createUserFact(charId, addCategory, addText.trim());
      setFacts(prev => [res.fact, ...prev]);
      setAddText('');
      setShowAddForm(false);
    } catch { /* non-fatal */ }
    finally { setAdding(false); }
  };

  const byCategory = CATEGORIES.reduce<Record<FactCategory, UserFact[]>>(
    (acc, cat) => { acc[cat] = facts.filter(f => f.category === cat); return acc; },
    {} as Record<FactCategory, UserFact[]>,
  );

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-tertiary)' }}>
        <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
        <p style={{ fontSize: '0.8rem' }}>Loading facts...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header with add button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1rem', fontWeight: 300, fontStyle: 'italic',
              color: 'var(--color-text-primary)',
            }}
          >
            What {charName} knows
          </h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
            {facts.length} fact{facts.length !== 1 ? 's' : ''} learned
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            backgroundColor: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            borderRadius: 8, padding: '5px 10px', fontSize: '0.72rem',
            cursor: 'pointer',
          }}
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div
          style={{
            ...cardStyle,
            padding: '10px 12px',
            display: 'flex', gap: 6, alignItems: 'center',
          }}
        >
          <select
            value={addCategory}
            onChange={(e) => setAddCategory(e.target.value as FactCategory)}
            style={{
              ...fieldStyle,
              borderRadius: 6, fontSize: '0.75rem', padding: '5px 6px',
              flexShrink: 0,
            }}
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{CATEGORY_META[c].label}</option>
            ))}
          </select>
          <input
            type="text"
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Enter a fact about yourself..."
            autoFocus
            style={{
              ...fieldStyle,
              flex: 1, borderRadius: 6, fontSize: '0.8rem', padding: '5px 8px',
            }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !addText.trim()}
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-accent-text)',
              border: 'none', borderRadius: 6,
              padding: '5px 10px', fontSize: '0.75rem',
              cursor: adding ? 'wait' : 'pointer',
              opacity: adding || !addText.trim() ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            Add
          </button>
        </div>
      )}

      {/* Empty state */}
      {facts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-tertiary)' }}>
          <User size={28} style={{ margin: '0 auto 10px', opacity: 0.35 }} />
          <p style={{ fontSize: '0.85rem' }}>No facts yet.</p>
          <p style={{ fontSize: '0.75rem', marginTop: 4 }}>
            {charName} will learn about you as you chat, or add facts manually above.
          </p>
        </div>
      )}

      {/* Facts by category */}
      {CATEGORIES.map(cat => {
        const catFacts = byCategory[cat];
        if (catFacts.length === 0) return null;
        const meta = CATEGORY_META[cat];
        return (
          <div key={cat}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <span style={{ color: meta.color }}>{meta.icon}</span>
              <span
                style={{
                  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.08em', color: meta.color,
                }}
              >
                {meta.label}
              </span>
              <span
                style={{
                  fontSize: '0.65rem', color: 'var(--color-text-tertiary)',
                  backgroundColor: 'var(--color-surface-raised)',
                  borderRadius: 8, padding: '1px 5px',
                }}
              >
                {catFacts.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {catFacts.map(fact => (
                <FactRow
                  key={fact.id}
                  fact={fact}
                  charId={charId}
                  onDelete={handleDelete}
                  onEdit={(id, text) => {
                    setFacts(prev => prev.map(f => f.id === id ? { ...f, fact_text: text } : f));
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Single fact row with source badge, inline edit, and delete button.
 *
 * @param fact    - The UserFact record.
 * @param charId  - Character ID (for API calls).
 * @param onDelete - Callback after successful delete.
 * @param onEdit  - Callback after successful edit (updates local state).
 */
function FactRow({
  fact, charId, onDelete, onEdit,
}: {
  fact: UserFact;
  charId: number;
  onDelete: (id: number) => void;
  onEdit: (id: number, newText: string) => void;
}) {
  const [hovering, setHovering] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(fact.fact_text);
  const [saving, setSaving] = useState(false);
  const isManual = fact.source === 'manual';
  const confidencePct = Math.round(fact.confidence * 100);

  const handleSave = async () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === fact.fact_text) {
      setEditing(false);
      setEditText(fact.fact_text);
      return;
    }
    setSaving(true);
    try {
      await api.updateUserFact(charId, fact.id, trimmed);
      onEdit(fact.id, trimmed);
      setEditing(false);
    } catch { /* non-fatal — save silently fails; editor stays open */ }
    finally { setSaving(false); }
  };

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        backgroundColor: hovering || editing ? 'var(--color-surface-raised)' : 'transparent',
        borderRadius: 6, padding: '5px 6px',
        transition: 'background-color 0.12s ease',
      }}
    >
      {editing ? (
        <input
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') { setEditing(false); setEditText(fact.fact_text); }
          }}
          autoFocus
          disabled={saving}
          style={{
            flex: 1, fontSize: '0.82rem',
            color: 'var(--color-text-primary)',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-accent)',
            borderRadius: 4, padding: '2px 6px',
            outline: 'none',
          }}
        />
      ) : (
        <span
          style={{
            flex: 1, fontSize: '0.82rem',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
          }}
          onDoubleClick={() => setEditing(true)}
          title="Double-click to edit"
        >
          {fact.fact_text}
        </span>
      )}
      {/* Source + confidence badge */}
      <span
        style={{
          fontSize: '0.62rem', fontWeight: 600,
          backgroundColor: isManual ? 'rgba(57,201,110,0.12)' : 'rgba(107,114,128,0.15)',
          color: isManual ? '#39c96e' : 'var(--color-text-tertiary)',
          borderRadius: 4, padding: '1px 5px', flexShrink: 0,
        }}
        title={isManual ? 'Manually added' : `AI-extracted (${confidencePct}% confidence)`}
      >
        {isManual ? 'you' : `AI ${confidencePct}%`}
      </span>
      {/* Edit / save button */}
      <button
        onClick={() => editing ? handleSave() : setEditing(true)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: editing ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
          padding: 2,
          opacity: hovering || editing ? 1 : 0,
          transition: 'opacity 0.12s ease',
          flexShrink: 0,
        }}
        title={editing ? 'Save edit' : 'Edit this fact'}
      >
        {editing ? <Check size={13} /> : <Edit3 size={13} />}
      </button>
      {/* Delete button */}
      <button
        onClick={() => onDelete(fact.id)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-tertiary)', padding: 2,
          opacity: hovering ? 1 : 0,
          transition: 'opacity 0.12s ease',
          flexShrink: 0,
        }}
        title="Delete this fact"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Memories Tab (Tiered Memory Browser)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Paginated tiered memory browser with semantic search, delete, and promote.
 * Logic ported from MemoryPanel's list view.
 */
function MemoriesTab({ charId }: { charId: number }) {
  const { characters } = useAppStore();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [filterCharId, setFilterCharId] = useState(charId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadPage = useCallback(async (p: number, cid: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listMemories(cid, p, PAGE_SIZE);
      setMemories(data.memories || []);
      setTotal(data.total || 0);
      setPage(p);
      setIsSearchMode(false);
    } catch (e) {
      // api.* helpers throw "GET /url: 500" — surface only the status for the UI.
      const msg = (e as Error).message;
      const status = msg.match(/(\d{3})\s*$/)?.[1] ?? msg;
      setError(status);
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const doSearch = useCallback(async (q: string, cid: number) => {
    if (!q.trim()) { loadPage(0, cid); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await api.searchMemories(cid, q, 20);
      setMemories(data.results || []);
      setTotal(data.results?.length || 0);
      setIsSearchMode(true);
    } catch (e) {
      const msg = (e as Error).message;
      const status = msg.match(/(\d{3})\s*$/)?.[1] ?? msg;
      setError(status);
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteMemory(id);
      if (isSearchMode && query) doSearch(query, filterCharId);
      else loadPage(page, filterCharId);
    } catch { /* non-fatal */ }
    finally { setDeletingId(null); }
  }, [isSearchMode, query, filterCharId, page, loadPage, doSearch]);

  const handlePromote = useCallback(async (id: string) => {
    setPromotingId(id);
    try {
      await api.promoteMemory(id);
      if (isSearchMode && query) doSearch(query, filterCharId);
      else loadPage(page, filterCharId);
    } catch { /* non-fatal */ }
    finally { setPromotingId(null); }
  }, [isSearchMode, query, filterCharId, page, loadPage, doSearch]);

  useEffect(() => { loadPage(0, filterCharId); }, [loadPage, filterCharId]);

  const handleFilterChange = (cid: number) => {
    setFilterCharId(cid);
    if (isSearchMode && query) doSearch(query, cid);
    else loadPage(0, cid);
  };

  const roleColor = (role?: string) => {
    if (role === 'user') return 'var(--color-accent)';
    if (role === 'knowledge') return 'var(--color-success)';
    return 'var(--color-text-tertiary)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Search + filter bar */}
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={12}
            style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--color-text-tertiary)',
            }}
          />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doSearch(query, filterCharId); }}
            placeholder="Semantic search..."
            style={{
              ...fieldStyle,
              width: '100%', fontSize: '0.72rem',
              paddingLeft: 28, paddingRight: 8,
              paddingTop: 6, paddingBottom: 6,
              borderRadius: 8, outline: 'none',
            }}
          />
        </div>
        <select
          value={filterCharId}
          onChange={e => handleFilterChange(parseInt(e.target.value))}
          style={{ ...fieldStyle, fontSize: '0.72rem', padding: '6px 8px', borderRadius: 8, outline: 'none' }}
        >
          <option value={0}>All chars</option>
          {characters.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          onClick={() => doSearch(query, filterCharId)}
          style={{
            backgroundColor: 'var(--color-accent-soft)',
            color: 'var(--color-accent)',
            border: '1px solid var(--color-accent)',
            borderRadius: 8, padding: '6px 10px', fontSize: '0.72rem',
            fontWeight: 500, cursor: 'pointer',
          }}
        >
          Go
        </button>
      </div>

      {/* Memory list */}
      {loading && (
        <p className="text-center py-6" style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)' }}>
          Loading...
        </p>
      )}
      {error && (
        <p className="text-center py-6" style={{ fontSize: '0.78rem', color: 'var(--color-danger)' }}>
          Failed to load: {error}
        </p>
      )}
      {!loading && !error && memories.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-tertiary)' }}>
          <Database size={24} style={{ margin: '0 auto 8px', opacity: 0.35 }} />
          <p style={{ fontSize: '0.82rem' }}>
            {isSearchMode ? 'No matching memories found.' : 'No memories stored yet.'}
          </p>
        </div>
      )}

      {!loading && memories.map(mem => (
        <div key={mem.id} className="group" style={{ ...cardStyle, padding: '8px 10px' }}>
          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.58rem', textTransform: 'uppercase', fontWeight: 700,
                letterSpacing: '0.05em', color: roleColor(mem.role),
              }}
            >
              {mem.role || 'unknown'}
            </span>
            {mem.tier != null && (
              <span
                style={{
                  fontSize: '0.58rem', fontWeight: 700, padding: '0 4px',
                  borderRadius: 3,
                  color: TIER_COLOR[mem.tier] ?? 'var(--color-text-tertiary)',
                  border: `1px solid ${TIER_COLOR[mem.tier] ?? 'var(--color-border)'}`,
                  opacity: 0.85,
                }}
              >
                T{mem.tier} {TIER_LABEL[mem.tier]}
              </span>
            )}
            {mem.score != null && (
              <span style={{ fontSize: '0.58rem', fontWeight: 500, color: 'var(--color-success)' }}>
                {(mem.score * 100).toFixed(0)}%
              </span>
            )}
            <span style={{ fontSize: '0.58rem', marginLeft: 'auto', color: 'var(--color-text-tertiary)' }}>
              {mem.created_at ? new Date(mem.created_at).toLocaleDateString() : ''}
            </span>
            {/* Promote button (T1/T2 only) */}
            {mem.tier != null && mem.tier < 3 && (
              <button
                onClick={() => handlePromote(mem.id)}
                disabled={promotingId === mem.id}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f59e0b', padding: 2 }}
                title="Promote to Permanent"
              >
                {promotingId === mem.id ? <span style={{ fontSize: '0.58rem' }}>...</span> : <Star size={11} />}
              </button>
            )}
            {/* Delete button */}
            <button
              onClick={() => handleDelete(mem.id)}
              disabled={deletingId === mem.id}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', padding: 2 }}
              title="Delete memory"
            >
              {deletingId === mem.id ? <span style={{ fontSize: '0.58rem' }}>...</span> : <Trash2 size={11} />}
            </button>
          </div>
          {/* Text */}
          <p style={{ fontSize: '0.78rem', lineHeight: 1.5, color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}>
            {(mem.text || '').slice(0, 200)}
            {(mem.text?.length || 0) > 200 && '...'}
          </p>
        </div>
      ))}

      {/* Pagination */}
      {!isSearchMode && !loading && total > 0 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: 8, borderTop: '1px solid var(--color-border-subtle)',
          }}
        >
          <button
            onClick={() => page > 0 && loadPage(page - 1, filterCharId)}
            disabled={page === 0}
            style={{
              background: 'none', border: 'none', cursor: page === 0 ? 'default' : 'pointer',
              color: 'var(--color-text-tertiary)', padding: 4, opacity: page === 0 ? 0.3 : 1,
            }}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
            Page {page + 1} / {totalPages} ({total} memories)
          </span>
          <button
            onClick={() => page < totalPages - 1 && loadPage(page + 1, filterCharId)}
            disabled={page >= totalPages - 1}
            style={{
              background: 'none', border: 'none',
              cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              color: 'var(--color-text-tertiary)', padding: 4,
              opacity: page >= totalPages - 1 ? 0.3 : 1,
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Search result count */}
      {isSearchMode && !loading && (
        <div style={{ textAlign: 'center', paddingTop: 8, borderTop: '1px solid var(--color-border-subtle)' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
            {total} result{total !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => { setQuery(''); loadPage(0, filterCharId); }}
            style={{
              fontSize: '0.65rem', marginLeft: 8, color: 'var(--color-accent)',
              background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Journal Tab
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Displays character journal entries from the adaptive journal system.
 * Fetches from the memory overview endpoint (journal_entries array).
 */
function JournalTab({ charId, charName }: { charId: number; charName: string }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getMemoryOverview(charId)
      .then(res => setEntries(res.journal_entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [charId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-tertiary)' }}>
        <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
        <p style={{ fontSize: '0.8rem' }}>Loading journal...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-tertiary)' }}>
        <FileText size={28} style={{ margin: '0 auto 10px', opacity: 0.35 }} />
        <p style={{ fontSize: '0.85rem' }}>No journal entries yet.</p>
        <p style={{ fontSize: '0.75rem', marginTop: 4 }}>
          {charName}'s journal will fill in as you have conversations together.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ marginBottom: 4 }}>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1rem', fontWeight: 300, fontStyle: 'italic',
            color: 'var(--color-text-primary)',
          }}
        >
          {charName}'s Journal
        </h3>
        <p style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'} written
        </p>
      </div>

      {entries.map(entry => {
        const isExpanded = expandedId === entry.id;
        const preview = entry.entry_text.slice(0, 120);
        const hasMore = entry.entry_text.length > 120;
        return (
          <div
            key={entry.id}
            style={{
              ...cardStyle,
              padding: '10px 14px',
              cursor: hasMore ? 'pointer' : 'default',
            }}
            onClick={() => hasMore && setExpandedId(isExpanded ? null : entry.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <BookOpen size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary)' }}>
                {new Date(entry.created_at).toLocaleDateString(undefined, {
                  month: 'long', day: 'numeric', year: 'numeric',
                })}
              </span>
              <span style={{ fontSize: '0.6rem', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
                Session #{entry.session_id}
              </span>
            </div>
            <p
              style={{
                fontSize: '0.82rem',
                lineHeight: 1.55,
                color: 'var(--color-text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {isExpanded ? entry.entry_text : preview}
              {!isExpanded && hasMore && (
                <span style={{ color: 'var(--color-accent)', fontSize: '0.72rem' }}>
                  {' '}... read more
                </span>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Unified Memory Browser — the single panel for viewing everything
 * a character knows and remembers about the user.
 *
 * Renders as a right slide-in overlay (460px wide).
 * Opens when `activeOverlay === 'memorybrowser'`.
 *
 * @example
 * // In sidebar: openOverlay('memorybrowser')
 * // Keyboard shortcut: Ctrl+M (replaces old memory panel)
 */
export function MemoryBrowser() {
  const { activeOverlay, closeOverlay, activeCharacter } = useAppStore();
  const open = activeOverlay === 'memorybrowser';
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const charId = activeCharacter?.id ?? 0;
  const charName = activeCharacter?.name ?? 'Character';

  // Reset to overview when panel reopens
  useEffect(() => {
    if (open) setActiveTab('overview');
  }, [open]);

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
            style={{ position: 'fixed', inset: 0, backgroundColor: '#000', zIndex: 40 }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              right: 0, top: 0, bottom: 0,
              width: 'min(480px, 92vw)',
              backgroundColor: 'var(--color-surface)',
              borderLeft: '1px solid var(--color-border-subtle)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ─────────────────────────────────────── */}
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 16px', height: 48, flexShrink: 0,
                borderBottom: '1px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Brain size={15} style={{ color: 'var(--color-accent)' }} />
                <span
                  style={{
                    fontSize: '0.82rem', fontWeight: 600,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Memory Browser
                </span>
              </div>
              <button
                onClick={closeOverlay}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--color-text-tertiary)', padding: 6, borderRadius: 8,
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Tab Bar ────────────────────────────────────── */}
            <div
              style={{
                display: 'flex', gap: 0, flexShrink: 0,
                borderBottom: '1px solid var(--color-border-subtle)',
                padding: '0 12px',
              }}
            >
              {TABS.map(tab => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '10px 12px',
                      fontSize: '0.72rem', fontWeight: active ? 600 : 400,
                      color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                      background: 'none', border: 'none',
                      borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'color 0.15s ease, border-color 0.15s ease',
                    }}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* ── Tab Content ────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {!activeCharacter ? (
                <p style={{ textAlign: 'center', padding: '40px 0', fontSize: '0.82rem', color: 'var(--color-text-tertiary)' }}>
                  Select a character to browse their memory.
                </p>
              ) : (
                <>
                  {activeTab === 'overview' && <OverviewTab charId={charId} charName={charName} />}
                  {activeTab === 'facts'    && <FactsTab charId={charId} charName={charName} />}
                  {activeTab === 'memories' && <MemoriesTab charId={charId} />}
                  {activeTab === 'journal'  && <JournalTab charId={charId} charName={charName} />}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
