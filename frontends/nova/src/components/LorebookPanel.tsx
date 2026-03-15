import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ChevronDown, BookOpen } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import type { LoreEntry } from '../lib/types';
import styles from './LorebookPanel.module.css';

/** Spring config for expand/collapse transitions. */
const expandSpring = { type: 'spring' as const, stiffness: 300, damping: 28 };

/**
 * Glass-styled lorebook editor panel for Nova's Focused mode IconRail.
 *
 * Lists all lore/world-info entries for the active character, supports
 * creating new entries, toggling enabled/disabled state, expanding
 * entries to view full content, and deleting entries.
 *
 * Lore entries are keyword-triggered context injections that fire when
 * trigger words appear in recent conversation messages, enriching the
 * LLM's knowledge of the character's world.
 *
 * @example
 * ```tsx
 * // Rendered inside IconRail's panelContent map
 * <LorebookPanel />
 * ```
 */
export function LorebookPanel() {
  const activeCharacter = useAppStore((s) => s.activeCharacter);
  const charId = activeCharacter?.id ?? 0;

  // Lore entries state
  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Expanded entry IDs
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newKeywords, setNewKeywords] = useState('');

  /**
   * Fetch all lore entries for the active character from the backend.
   * Called on mount and after any create/update/delete operation.
   */
  const fetchEntries = useCallback(async () => {
    if (!charId) return;
    setLoading(true);
    try {
      const resp = await api.getLoreEntries(charId);
      setEntries(resp.entries ?? []);
    } catch (e) {
      console.error('[LorebookPanel] Failed to fetch lore entries:', e);
    } finally {
      setLoading(false);
    }
  }, [charId]);

  // Fetch entries when character changes
  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  /**
   * Toggle the expanded/collapsed state of a lore entry card.
   *
   * @param id - Lore entry primary key to toggle.
   */
  const toggleExpanded = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /**
   * Toggle the enabled/disabled state of a lore entry.
   * Calls PUT /api/lore/{id} and refreshes the entry list.
   *
   * @param entry - The lore entry to toggle.
   */
  const handleToggleEnabled = useCallback(async (entry: LoreEntry) => {
    try {
      await api.updateLoreEntry(entry.id, { enabled: !entry.enabled });
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, enabled: !e.enabled } : e))
      );
    } catch (e) {
      console.error('[LorebookPanel] Failed to toggle entry:', e);
    }
  }, []);

  /**
   * Delete a lore entry after implicit confirmation (hover-reveal trash icon).
   * Calls DELETE /api/lore/{id} and refreshes the entry list.
   *
   * @param id - Lore entry primary key to delete.
   */
  const handleDelete = useCallback(async (id: number) => {
    try {
      await api.deleteLoreEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      console.error('[LorebookPanel] Failed to delete entry:', e);
    }
  }, []);

  /**
   * Create a new lore entry from the inline form.
   * Parses comma-separated keywords and calls POST /api/characters/{id}/lore.
   */
  const handleCreate = useCallback(async () => {
    if (!charId || !newTitle.trim() || !newContent.trim()) return;
    const keywords = newKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    try {
      await api.createLoreEntry(charId, {
        title: newTitle.trim(),
        content: newContent.trim(),
        keywords,
        enabled: true,
      });
      setNewTitle('');
      setNewContent('');
      setNewKeywords('');
      setShowCreateForm(false);
      await fetchEntries();
    } catch (e) {
      console.error('[LorebookPanel] Failed to create entry:', e);
    }
  }, [charId, newTitle, newContent, newKeywords, fetchEntries]);

  /**
   * Format the injection position enum value into a human-readable label.
   *
   * @param pos - Raw injection_position value from the backend.
   * @returns Human-readable position label.
   */
  const formatPosition = (pos: string): string => {
    const map: Record<string, string> = {
      before_system_prompt: 'Before system prompt',
      after_system_prompt: 'After system prompt',
      before_last_message: 'Before last message',
      after_last_2_messages: 'After last 2 messages',
    };
    return map[pos] ?? pos;
  };

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* Top bar: entry count + add button */}
      <div className={styles.topBar}>
        <span className={styles.entryCount}>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
        <button
          className={styles.addButton}
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          <Plus size={12} />
          {showCreateForm ? 'Cancel' : 'Add'}
        </button>
      </div>

      {/* Inline create form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            key="create-form"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={expandSpring}
            style={{ overflow: 'hidden' }}
          >
            <div className={styles.createForm}>
              <div>
                <label className={styles.formLabel}>Title</label>
                <input
                  className={styles.formInput}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Entry title..."
                />
              </div>
              <div>
                <label className={styles.formLabel}>Content</label>
                <textarea
                  className={styles.formTextarea}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Lore text to inject into context..."
                  rows={3}
                />
              </div>
              <div>
                <label className={styles.formLabel}>Keywords (comma-separated)</label>
                <input
                  className={styles.formInput}
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  placeholder="magic, artifact, kingdom..."
                />
              </div>
              <div className={styles.formActions}>
                <button
                  className={styles.formCancel}
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </button>
                <button
                  className={styles.formSave}
                  onClick={handleCreate}
                  disabled={!newTitle.trim() || !newContent.trim()}
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!loading && entries.length === 0 && !showCreateForm && (
        <div className={styles.emptyState}>
          <BookOpen size={32} className={styles.emptyIcon} />
          <div className={styles.emptyText}>
            No lore entries yet. Add world info to enrich your character&apos;s context.
          </div>
        </div>
      )}

      {/* Entry list */}
      {entries.map((entry) => {
        const isExpanded = expandedIds.has(entry.id);

        return (
          <div key={entry.id} className={styles.entryCard}>
            {/* Header row: title + actions */}
            <div
              className={styles.entryHeader}
              onClick={() => toggleExpanded(entry.id)}
            >
              <ChevronDown
                size={12}
                className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}
              />
              <span
                className={`${styles.entryTitle} ${!entry.enabled ? styles.entryTitleDisabled : ''}`}
              >
                {entry.title}
              </span>
              <div className={styles.entryActions}>
                <button
                  className={styles.deleteButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(entry.id);
                  }}
                  title="Delete entry"
                >
                  <Trash2 size={12} />
                </button>
                <button
                  className={`${styles.toggle} ${entry.enabled ? styles.toggleActive : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleEnabled(entry);
                  }}
                  title={entry.enabled ? 'Disable entry' : 'Enable entry'}
                >
                  <div className={`${styles.toggleDot} ${entry.enabled ? styles.toggleDotActive : ''}`} />
                </button>
              </div>
            </div>

            {/* Keyword pills (always visible) */}
            {entry.keywords.length > 0 && (
              <div className={styles.keywordRow}>
                {entry.keywords.map((kw, i) => (
                  <span key={i} className={styles.keywordPill}>{kw}</span>
                ))}
              </div>
            )}

            {/* Expanded body */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  key="body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={expandSpring}
                  style={{ overflow: 'hidden' }}
                >
                  <div className={styles.entryBody}>
                    <div className={styles.entryContent}>{entry.content}</div>
                    <div className={styles.metaRow}>
                      <span className={styles.metaLabel}>Position</span>
                      <span className={styles.metaValue}>
                        {formatPosition(entry.injection_position)}
                      </span>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={styles.metaLabel}>Priority</span>
                      <span className={styles.metaValue}>{entry.priority}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
