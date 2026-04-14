/**
 * ScenarioPicker — modal for browsing and activating per-character scenario templates.
 *
 * Displays all templates grouped by mood with collapsible description, an
 * "Activate for this session" button per item, a "Random" button that picks
 * a random template from the currently visible list, and a "Create Custom"
 * form for quick authoring of new templates.
 *
 * @example
 *   <ScenarioPicker open={open} onClose={onClose} charId={42} sessionId={7} />
 */

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Sparkles, Plus, Check, X, ChevronDown, ChevronRight, Trash2, Shuffle } from 'lucide-react';
import { useScenarios } from '../hooks/useScenarios';
import type { ScenarioTemplate, CreateScenarioPayload } from '../hooks/useScenarios';

// ── Constants ─────────────────────────────────────────────────────────────────

/** All valid setting values. */
const SETTINGS = ['indoor', 'outdoor', 'transit', 'virtual'] as const;
type Setting = typeof SETTINGS[number];

/** All valid time-of-day values. */
const TIMES = ['morning', 'afternoon', 'evening', 'night', 'any'] as const;
type TimeOfDay = typeof TIMES[number];

/** All valid mood values (determines grouping in the list). */
const MOODS = ['cozy', 'tense', 'romantic', 'playful', 'melancholy', 'energetic'] as const;
type Mood = typeof MOODS[number];

/** Human-readable label + emoji indicator per mood. */
const MOOD_LABELS: Record<Mood, string> = {
  cozy:      'Cozy',
  tense:     'Tense',
  romantic:  'Romantic',
  playful:   'Playful',
  melancholy:'Melancholy',
  energetic: 'Energetic',
};

/** Props for the ScenarioPicker modal. */
interface ScenarioPickerProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Called when the user dismisses the modal. */
  onClose: () => void;
  /** Active character primary key. */
  charId: number;
  /** Active session primary key. */
  sessionId: number;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * A single scenario template row with expandable description and action buttons.
 */
function TemplateRow({
  template,
  isActive,
  onActivate,
  onDelete,
}: {
  template: ScenarioTemplate;
  isActive: boolean;
  onActivate: () => void;
  onDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        borderRadius: 8,
        border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}`,
        backgroundColor: isActive ? 'var(--color-accent-soft)' : 'var(--color-surface)',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {expanded
          ? <ChevronDown size={13} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
          : <ChevronRight size={13} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        }
        <span style={{
          flex: 1,
          fontWeight: isActive ? 600 : 400,
          fontSize: '0.85rem',
          color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {template.title}
        </span>
        {/* Metadata badges */}
        {template.setting && (
          <span style={{
            fontSize: '0.7rem',
            padding: '1px 6px',
            borderRadius: 4,
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-tertiary)',
            flexShrink: 0,
          }}>
            {template.setting}
          </span>
        )}
        {template.time_of_day && template.time_of_day !== 'any' && (
          <span style={{
            fontSize: '0.7rem',
            padding: '1px 6px',
            borderRadius: 4,
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-tertiary)',
            flexShrink: 0,
          }}>
            {template.time_of_day}
          </span>
        )}
        {isActive && (
          <Check size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        )}
      </button>

      {/* Expandable body */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 12px 12px' }}>
              <p style={{
                margin: '0 0 10px',
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
              }}>
                {template.description}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={onActivate}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    backgroundColor: isActive ? 'var(--color-bg-secondary)' : 'var(--color-accent)',
                    color: isActive ? 'var(--color-text-secondary)' : 'var(--color-accent-text)',
                  }}
                >
                  {isActive ? 'Active — click to deactivate' : 'Activate for this session'}
                </button>
                {!template.is_builtin && onDelete && (
                  <button
                    onClick={onDelete}
                    title="Delete this custom template"
                    style={{
                      padding: '5px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--color-border)',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      backgroundColor: 'transparent',
                      color: 'var(--color-text-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Create Custom Form ────────────────────────────────────────────────────────

/** Inline form for quickly authoring a new custom scenario template. */
function CreateCustomForm({ onSubmit, onCancel }: {
  onSubmit: (payload: CreateScenarioPayload) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [setting, setSetting] = useState<Setting | ''>('');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | ''>('');
  const [mood, setMood] = useState<Mood | ''>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      ...(setting ? { setting } : {}),
      ...(timeOfDay ? { time_of_day: timeOfDay } : {}),
      ...(mood ? { mood } : {}),
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 6,
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.82rem',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    display: 'block',
    marginBottom: 3,
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: '1px dashed var(--color-border)',
        borderRadius: 8,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div>
        <label style={labelStyle}>Title *</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Late night study session"
          style={inputStyle}
          required
        />
      </div>
      <div>
        <label style={labelStyle}>Description *</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe the scene, atmosphere, and what the characters are doing…"
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          required
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div>
          <label style={labelStyle}>Setting</label>
          <select value={setting} onChange={e => setSetting(e.target.value as Setting | '')} style={selectStyle}>
            <option value="">Any</option>
            {SETTINGS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Time of day</label>
          <select value={timeOfDay} onChange={e => setTimeOfDay(e.target.value as TimeOfDay | '')} style={selectStyle}>
            <option value="">Any</option>
            {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Mood</label>
          <select value={mood} onChange={e => setMood(e.target.value as Mood | '')} style={selectStyle}>
            <option value="">None</option>
            {MOODS.map(m => <option key={m} value={m}>{MOOD_LABELS[m]}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={!title.trim() || !description.trim()}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
            opacity: !title.trim() || !description.trim() ? 0.5 : 1,
          }}
        >
          Create & Activate
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            backgroundColor: 'transparent',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

/**
 * Modal for browsing and activating per-character scenario templates.
 *
 * Templates are grouped by mood. Each row can be expanded to show the full
 * description plus Activate / Delete buttons. A "Random" button picks a random
 * template and activates it. "Create Custom" reveals an inline authoring form.
 *
 * @param open - Whether the modal is visible.
 * @param onClose - Callback to close the modal.
 * @param charId - Active character primary key.
 * @param sessionId - Active session primary key.
 */
export function ScenarioPicker({ open, onClose, charId, sessionId }: ScenarioPickerProps) {
  const { templates, activeTemplate, loading, activate, deactivate, createCustom, deleteTemplate } =
    useScenarios(charId, sessionId);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [moodFilter, setMoodFilter] = useState<Mood | ''>('');

  // ── Filtered + grouped template list ────────────────────────────────────

  const filteredTemplates = useMemo(() => {
    if (!moodFilter) return templates;
    return templates.filter(t => t.mood === moodFilter);
  }, [templates, moodFilter]);

  /** Templates grouped by mood. Templates with no mood fall under 'other'. */
  const grouped = useMemo(() => {
    const groups: Record<string, ScenarioTemplate[]> = {};
    for (const t of filteredTemplates) {
      const key = t.mood ?? 'other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return groups;
  }, [filteredTemplates]);

  // ── Random pick ──────────────────────────────────────────────────────────

  const handleRandom = useCallback(() => {
    if (filteredTemplates.length === 0) return;
    const pick = filteredTemplates[Math.floor(Math.random() * filteredTemplates.length)];
    activate(pick.id);
  }, [filteredTemplates, activate]);

  // ── Activate / deactivate toggle ─────────────────────────────────────────

  const handleToggleActivate = useCallback((templateId: number) => {
    if (activeTemplate?.id === templateId) {
      deactivate();
    } else {
      activate(templateId);
    }
  }, [activeTemplate, activate, deactivate]);

  // ── Create custom handler ────────────────────────────────────────────────

  const handleCreateCustom = useCallback(async (payload: CreateScenarioPayload) => {
    await createCustom(payload);
    setShowCreateForm(false);
  }, [createCustom]);

  if (!open) return null;

  return (
    // Backdrop
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 16px 24px',
        overflowY: 'auto',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.97 }}
        transition={{ duration: 0.2 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          backgroundColor: 'var(--color-background)',
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 96px)',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <BookOpen size={18} style={{ color: 'var(--color-accent)' }} />
          <span style={{ flex: 1, fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)' }}>
            Scenarios
          </span>
          {activeTemplate && (
            <span style={{
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: 12,
              backgroundColor: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
              fontWeight: 600,
            }}>
              Active: {activeTemplate.title}
            </span>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
              color: 'var(--color-text-tertiary)',
              display: 'flex',
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Filter bar ── */}
        <div style={{
          display: 'flex',
          gap: 6,
          padding: '10px 20px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
          overflowX: 'auto',
        }}>
          <button
            onClick={() => setMoodFilter('')}
            style={{
              padding: '4px 10px',
              borderRadius: 16,
              border: '1px solid var(--color-border)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: moodFilter === '' ? 700 : 400,
              backgroundColor: moodFilter === '' ? 'var(--color-accent)' : 'transparent',
              color: moodFilter === '' ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            All
          </button>
          {MOODS.map(m => (
            <button
              key={m}
              onClick={() => setMoodFilter(prev => prev === m ? '' : m)}
              style={{
                padding: '4px 10px',
                borderRadius: 16,
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: moodFilter === m ? 700 : 400,
                backgroundColor: moodFilter === m ? 'var(--color-accent)' : 'transparent',
                color: moodFilter === m ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                whiteSpace: 'nowrap',
              }}
            >
              {MOOD_LABELS[m]}
            </button>
          ))}
        </div>

        {/* ── Action bar ── */}
        <div style={{
          display: 'flex',
          gap: 8,
          padding: '10px 20px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <button
            onClick={handleRandom}
            disabled={filteredTemplates.length === 0}
            title="Activate a random template from the visible list"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              backgroundColor: 'transparent',
              color: 'var(--color-text-secondary)',
              opacity: filteredTemplates.length === 0 ? 0.4 : 1,
            }}
          >
            <Shuffle size={14} />
            Random
          </button>
          <button
            onClick={() => setShowCreateForm(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              backgroundColor: showCreateForm ? 'var(--color-accent-soft)' : 'transparent',
              color: showCreateForm ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}
          >
            <Plus size={14} />
            Create Custom
          </button>
          {activeTemplate && (
            <button
              onClick={deactivate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                backgroundColor: 'transparent',
                color: 'var(--color-text-tertiary)',
                marginLeft: 'auto',
              }}
            >
              <X size={13} />
              Clear active
            </button>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px' }}>
          {/* Create form */}
          <AnimatePresence>
            {showCreateForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ overflow: 'hidden', marginBottom: 16 }}
              >
                <CreateCustomForm
                  onSubmit={handleCreateCustom}
                  onCancel={() => setShowCreateForm(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {loading && (
            <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.82rem', margin: '24px 0' }}>
              Loading scenarios…
            </p>
          )}

          {!loading && filteredTemplates.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.82rem', margin: '24px 0' }}>
              No scenarios match the current filter.
            </p>
          )}

          {/* Grouped template list */}
          {!loading && Object.entries(grouped).map(([mood, items]) => (
            <div key={mood} style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <Sparkles size={11} />
                {MOOD_LABELS[mood as Mood] ?? mood}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(t => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    isActive={activeTemplate?.id === t.id}
                    onActivate={() => handleToggleActivate(t.id)}
                    onDelete={!t.is_builtin ? () => deleteTemplate(t.id) : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
