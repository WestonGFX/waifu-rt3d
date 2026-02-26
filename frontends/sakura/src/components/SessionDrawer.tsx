import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Pencil, Trash2, Check, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useChatStore } from '../stores/chatStore';
import type { Session } from '../lib/types';

interface SessionDrawerProps {
  open: boolean;
  onClose: () => void;
  characterId: number;
  characterName: string;
}

/**
 * Slide-out left drawer listing chat sessions for the active character.
 * Supports: create new session, rename, delete, and switch between sessions.
 * Sessions are fetched from GET /api/sessions and filtered client-side by
 * the character ID (since the backend stores sessions globally).
 */
export function SessionDrawer({ open, onClose, characterId, characterName }: SessionDrawerProps) {
  const { sessionId, setContext, loadHistory } = useChatStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  /** Filter sessions by search query (matches title). */
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(s =>
      (s.title || `Session ${s.id}`).toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  const loadSessions = useCallback(async () => {
    try {
      const all = await api.getSessions();
      // Filter to sessions that belong to this character (have messages from this char)
      // The backend doesn't filter by char_id, so we show all sessions.
      // In practice, each character gets its own sessions via createSession(charId).
      setSessions(all.filter(s => !s.character_id || s.character_id === characterId));
    } catch {
      setSessions([]);
    }
  }, [characterId]);

  useEffect(() => {
    if (open) loadSessions();
  }, [open, loadSessions]);

  const createNew = async () => {
    try {
      const title = `${characterName} — ${new Date().toLocaleDateString()}`;
      const session = await api.createNamedSession(title);
      setContext(session.id, characterId);
      loadHistory(session.id);
      await loadSessions();
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  };

  const switchTo = (session: Session) => {
    setContext(session.id, characterId);
    loadHistory(session.id);
    onClose();
  };

  const startRename = (session: Session) => {
    setEditingId(session.id);
    setEditTitle(session.title || `Session ${session.id}`);
  };

  const saveRename = async () => {
    if (editingId == null) return;
    try {
      await api.updateSession(editingId, { title: editTitle });
      await loadSessions();
    } catch (e) {
      console.error('Rename failed:', e);
    } finally {
      setEditingId(null);
    }
  };

  const deleteSession = async (id: number) => {
    try {
      await api.deleteSession(id);
      await loadSessions();
      // If we deleted the active session, clear chat
      if (id === sessionId) {
        useChatStore.getState().clear();
      }
    } catch (e) {
      console.error('Delete failed:', e);
    }
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
            onClick={onClose}
            className="fixed inset-0 bg-black z-40"
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed left-0 top-0 bottom-0 w-72 z-50 overflow-y-auto flex flex-col"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRight: '1px solid var(--color-border-subtle)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Chat Threads
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={createNew}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--color-accent)' }}
                  title="New thread"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-tertiary)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search threads..."
                  className="w-full text-xs pl-7 pr-2 py-1.5 rounded-lg outline-none"
                  style={{
                    backgroundColor: 'var(--color-background)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </div>
            </div>

            {/* Session list */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredSessions.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--color-text-tertiary)' }}>
                  No chat threads yet
                </p>
              ) : (
                filteredSessions.map(session => {
                  const active = session.id === sessionId;
                  const editing = editingId === session.id;

                  return (
                    <div
                      key={session.id}
                      className="group flex items-center gap-2 px-3 py-2 rounded-lg mb-1 transition-all duration-150 cursor-pointer"
                      style={{
                        backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
                        border: active ? '1px solid var(--color-accent)' : '1px solid transparent',
                      }}
                      onClick={() => !editing && switchTo(session)}
                    >
                      {editing ? (
                        <div className="flex-1 flex items-center gap-1">
                          <input
                            autoFocus
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditingId(null); }}
                            className="flex-1 text-xs px-2 py-1 rounded outline-none"
                            style={{
                              backgroundColor: 'var(--color-background)',
                              border: '1px solid var(--color-accent)',
                              color: 'var(--color-text-primary)',
                            }}
                            onClick={e => e.stopPropagation()}
                          />
                          <button onClick={(e) => { e.stopPropagation(); saveRename(); }} className="p-0.5" style={{ color: 'var(--color-accent)' }}>
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate" style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>
                              {session.title || `Session ${session.id}`}
                            </p>
                            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                              {session.message_count ?? 0} messages
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); startRename(session); }}
                              className="p-1 rounded"
                              style={{ color: 'var(--color-text-tertiary)' }}
                              title="Rename"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                              className="p-1 rounded"
                              style={{ color: 'var(--color-danger)' }}
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
