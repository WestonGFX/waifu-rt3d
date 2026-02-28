/**
 * UserKnowledgePanel — Feature C3: Companion User Knowledge Graph
 *
 * Displays structured facts the character has learned about the human user,
 * grouped by category. Auto-extracted facts (source='auto') are shown with
 * a confidence indicator; manually entered facts are shown with a different
 * badge. Users can delete any fact or add their own.
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { X, Plus, User, Heart, Clock, Smile, Tag, Trash2, Loader2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import type { UserFact } from '../lib/types';

type FactCategory = 'identity' | 'preferences' | 'history' | 'relationship' | 'general';

const CATEGORY_META: Record<FactCategory, { label: string; icon: ReactNode; color: string }> = {
  identity:     { label: 'Identity',     icon: <User size={12} />,   color: 'var(--color-accent)' },
  preferences:  { label: 'Preferences',  icon: <Heart size={12} />,  color: '#e9729f' },
  history:      { label: 'History',      icon: <Clock size={12} />,  color: '#f59e0b' },
  relationship: { label: 'Relationship', icon: <Smile size={12} />,  color: '#39c96e' },
  general:      { label: 'General',      icon: <Tag size={12} />,    color: 'var(--color-text-secondary)' },
};

const CATEGORIES = Object.keys(CATEGORY_META) as FactCategory[];

export function UserKnowledgePanel() {
  const { activeCharacter, closeOverlay } = useAppStore();
  const [facts, setFacts] = useState<UserFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [addText, setAddText] = useState('');
  const [addCategory, setAddCategory] = useState<FactCategory>('general');
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const charId = activeCharacter?.id;
  const charName = activeCharacter?.name ?? 'Character';

  const loadFacts = useCallback(async () => {
    if (!charId) return;
    setLoading(true);
    try {
      const res = await api.getUserFacts(charId);
      setFacts(res.facts ?? []);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, [charId]);

  useEffect(() => { loadFacts(); }, [loadFacts]);

  const handleDelete = async (factId: number) => {
    if (!charId) return;
    try {
      await api.deleteUserFact(charId, factId);
      setFacts(prev => prev.filter(f => f.id !== factId));
    } catch {
      /* non-fatal */
    }
  };

  const handleAdd = async () => {
    if (!charId || !addText.trim()) return;
    setAdding(true);
    try {
      const res = await api.createUserFact(charId, addCategory, addText.trim());
      setFacts(prev => [res.fact, ...prev]);
      setAddText('');
      setShowAddForm(false);
    } catch {
      /* non-fatal */
    } finally {
      setAdding(false);
    }
  };

  // Group facts by category
  const byCategory = CATEGORIES.reduce<Record<FactCategory, UserFact[]>>(
    (acc, cat) => {
      acc[cat] = facts.filter(f => f.category === cat);
      return acc;
    },
    {} as Record<FactCategory, UserFact[]>
  );

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) closeOverlay(); }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-modal)',
          width: '100%',
          maxWidth: 560,
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px 12px',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                fontWeight: 300,
                color: 'var(--color-text-primary)',
                fontStyle: 'italic',
              }}
            >
              {charName} knows about you
            </h2>
            <p style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
              {facts.length} fact{facts.length !== 1 ? 's' : ''} · AI-extracted and manually added
            </p>
          </div>
          <button
            onClick={() => closeOverlay()}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-secondary)', padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-tertiary)' }}>
              <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: '0.8rem' }}>Loading…</p>
            </div>
          ) : facts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-tertiary)' }}>
              <User size={28} style={{ margin: '0 auto 10px', opacity: 0.35 }} />
              <p style={{ fontSize: '0.85rem' }}>No facts yet.</p>
              <p style={{ fontSize: '0.75rem', marginTop: 4 }}>
                {charName} will learn about you as you chat, or you can add facts manually.
              </p>
            </div>
          ) : (
            CATEGORIES.map(cat => {
              const catFacts = byCategory[cat];
              if (catFacts.length === 0) return null;
              const meta = CATEGORY_META[cat];
              return (
                <div key={cat} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      marginBottom: 6,
                    }}
                  >
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {catFacts.map(fact => (
                      <FactRow key={fact.id} fact={fact} onDelete={handleDelete} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Add fact form */}
        {showAddForm && (
          <div
            style={{
              borderTop: '1px solid var(--color-border-subtle)',
              padding: '10px 16px',
              backgroundColor: 'var(--color-background)',
            }}
          >
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <select
                value={addCategory}
                onChange={(e) => setAddCategory(e.target.value as FactCategory)}
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  borderRadius: 6, fontSize: '0.78rem', padding: '4px 6px',
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
                placeholder="Enter a fact about yourself…"
                autoFocus
                style={{
                  flex: 1,
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  borderRadius: 6, fontSize: '0.82rem', padding: '4px 8px',
                }}
              />
              <button
                onClick={handleAdd}
                disabled={adding || !addText.trim()}
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-accent-text)',
                  border: 'none', borderRadius: 6,
                  padding: '4px 10px', fontSize: '0.78rem',
                  cursor: adding ? 'wait' : 'pointer',
                  opacity: adding || !addText.trim() ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid var(--color-border-subtle)',
            padding: '10px 16px',
            display: 'flex', justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={() => setShowAddForm(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              borderRadius: 6, padding: '5px 12px', fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            <Plus size={13} />
            Add fact manually
          </button>
        </div>
      </div>
    </div>
  );
}

/** Single fact row with source badge and delete button. */
function FactRow({
  fact,
  onDelete,
}: {
  fact: UserFact;
  onDelete: (id: number) => void;
}) {
  const [hovering, setHovering] = useState(false);
  const isManual = fact.source === 'manual';
  const confidencePct = Math.round(fact.confidence * 100);

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        backgroundColor: hovering ? 'var(--color-surface-raised)' : 'transparent',
        borderRadius: 6, padding: '5px 6px',
        transition: 'background-color 0.12s ease',
      }}
    >
      <span
        style={{
          flex: 1, fontSize: '0.82rem',
          color: 'var(--color-text-primary)',
        }}
      >
        {fact.fact_text}
      </span>
      {/* Source + confidence badge */}
      <span
        style={{
          fontSize: '0.62rem', fontWeight: 600,
          backgroundColor: isManual
            ? 'rgba(57,201,110,0.12)' : 'rgba(107,114,128,0.15)',
          color: isManual ? '#39c96e' : 'var(--color-text-tertiary)',
          borderRadius: 4, padding: '1px 5px', flexShrink: 0,
        }}
        title={isManual ? 'Manually added' : `AI-extracted (${confidencePct}% confidence)`}
      >
        {isManual ? 'you' : `AI ${confidencePct}%`}
      </span>
      {/* Delete button (only visible on hover) */}
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
