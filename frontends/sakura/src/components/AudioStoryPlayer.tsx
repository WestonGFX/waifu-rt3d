/**
 * AudioStoryPlayer — Feature F33: Erotic Audio Narration
 *
 * Overlay panel showing available audio story types for a character.
 * Displays eligibility (bond-gated), story categories, and TTS
 * parameter info. When the user selects a story type, it triggers
 * audio generation via the TTS pipeline.
 *
 * API surface:
 *   GET /api/characters/{id}/audio-story-types
 *       → { ok, types: [...], eligible: bool, bond_level, tts_params }
 *
 * @module AudioStoryPlayer
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Headphones, Loader2, Lock, Play, Volume2,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** An audio story type from the backend. */
interface StoryType {
  id: string;
  name: string;
  description: string;
  category: string;
  min_bond: number;
  duration_estimate: string;
}

/** TTS parameters for audio story generation. */
interface TTSParams {
  speed: number;
  pitch: number;
  voice_id: string | null;
}

interface AudioStoryPlayerProps {
  /** Whether the panel is visible. */
  isOpen: boolean;
  /** Callback to close the panel. */
  onClose: () => void;
  /** Character database ID. */
  characterId: number;
  /** Character display name. */
  characterName: string;
  /** Current bond level — used to gate locked stories. */
  bondLevel?: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Slide-in panel listing available audio story types for the active character.
 * Stories are bond-gated and categorized. Locked stories show the required
 * bond level with a lock icon.
 *
 * @param props - See {@link AudioStoryPlayerProps}.
 *
 * @example
 * <AudioStoryPlayer
 *   isOpen={showAudio}
 *   onClose={() => setShowAudio(false)}
 *   characterId={5}
 *   characterName="Luna"
 *   bondLevel={65}
 * />
 */
export function AudioStoryPlayer({
  isOpen,
  onClose,
  characterId,
  characterName,
  bondLevel = 0,
}: AudioStoryPlayerProps) {
  const [storyTypes, setStoryTypes] = useState<StoryType[]>([]);
  const [eligible, setEligible] = useState(false);
  const [ttsParams, setTtsParams] = useState<TTSParams | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  /* ── Fetch story types ───────────────────────────────────────────── */

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/audio-story-types`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStoryTypes(data.types ?? []);
      setEligible(data.eligible ?? false);
      if (data.tts_params) setTtsParams(data.tts_params);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    if (isOpen && characterId) fetchTypes();
  }, [isOpen, characterId, fetchTypes]);

  /* ── Category colors ─────────────────────────────────────────────── */

  const categoryColor = (cat: string): string => {
    switch (cat) {
      case 'romantic':   return '#ef4444';
      case 'bedtime':    return '#8b5cf6';
      case 'fantasy':    return '#a855f7';
      case 'confession': return '#f43f5e';
      case 'whisper':    return '#3b82f6';
      default:           return 'var(--color-accent)';
    }
  };

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[200]"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed inset-y-4 right-4 z-[201] flex flex-col overflow-hidden"
            style={{
              width: 400,
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-elevated)',
              border: '1px solid var(--color-border-subtle)',
            }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          >
            {/* ── Header ──────────────────────────────────────────── */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <Headphones size={16} style={{ color: 'var(--color-accent)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Audio Stories
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:opacity-80 transition-opacity"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Close audio stories"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Eligibility banner ──────────────────────────────── */}
            {!eligible && !loading && (
              <div
                className="mx-4 mt-3 px-3 py-2 rounded-lg flex items-center gap-2"
                style={{
                  backgroundColor: 'rgba(251, 191, 36, 0.08)',
                  border: '1px solid rgba(251, 191, 36, 0.2)',
                }}
              >
                <Lock size={13} style={{ color: '#f59e0b' }} />
                <span className="text-xs" style={{ color: '#f59e0b' }}>
                  Audio stories require a deeper bond with {characterName}
                </span>
              </div>
            )}

            {/* ── TTS info ────────────────────────────────────────── */}
            {ttsParams && eligible && (
              <div
                className="mx-4 mt-3 px-3 py-2 rounded-lg flex items-center gap-2"
                style={{
                  backgroundColor: 'var(--color-accent-soft)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <Volume2 size={13} style={{ color: 'var(--color-accent)' }} />
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Stories use {characterName}&apos;s voice with intimate TTS settings
                </span>
              </div>
            )}

            {/* ── Story type list ──────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
                </div>
              )}

              {error && (
                <div className="text-xs text-center py-8" style={{ color: 'var(--color-danger)' }}>
                  Failed to load story types
                </div>
              )}

              {!loading && !error && storyTypes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Headphones size={28} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    No audio story types available
                  </p>
                </div>
              )}

              {!loading && storyTypes.map((st) => {
                const locked = bondLevel < st.min_bond;
                const selected = selectedType === st.id;
                const color = categoryColor(st.category);
                return (
                  <motion.div
                    key={st.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-2 rounded-lg p-3 transition-all"
                    style={{
                      backgroundColor: selected ? `${color}10` : 'var(--color-surface-raised)',
                      border: `1px solid ${selected ? color : 'var(--color-border-subtle)'}`,
                      opacity: locked ? 0.5 : 1,
                      cursor: locked ? 'default' : 'pointer',
                    }}
                    onClick={() => !locked && setSelectedType(selected ? null : st.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                            {st.name}
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded capitalize"
                            style={{ backgroundColor: `${color}15`, color, fontSize: '0.6rem' }}
                          >
                            {st.category}
                          </span>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                          {st.description}
                        </p>
                        {st.duration_estimate && (
                          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>
                            ~{st.duration_estimate}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 mt-1">
                        {locked ? (
                          <div className="flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                            <Lock size={12} />
                            <span style={{ fontSize: '0.6rem' }}>Bond {st.min_bond}</span>
                          </div>
                        ) : (
                          <Play size={16} style={{ color }} />
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
