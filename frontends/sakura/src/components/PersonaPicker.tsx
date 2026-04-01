/**
 * PersonaPicker — Feature F37: Fantasy Persona Selection
 *
 * Overlay for browsing and selecting fantasy personas the character
 * can adopt. Each persona is a roleplay variant with a distinct
 * personality, speaking style, and scenario context. Bond-gated.
 *
 * API surface:
 *   GET /api/characters/{id}/persona-types
 *       → { ok, types: [...], eligible: bool, bond_level }
 *
 * @module PersonaPicker
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Wand2, Loader2, Lock, Sparkles,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** A persona type from the backend. */
interface PersonaType {
  id: string;
  name: string;
  description: string;
  category: string;
  min_bond: number;
  traits: string[];
}

interface PersonaPickerProps {
  /** Whether the overlay is visible. */
  isOpen: boolean;
  /** Callback to close the overlay. */
  onClose: () => void;
  /** Character database ID. */
  characterId: number;
  /** Character display name. */
  characterName: string;
  /** Callback when a persona is selected. */
  onSelect?: (persona: PersonaType) => void;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
  romantic:    { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)' },
  fantasy:     { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.08)' },
  playful:     { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)' },
  dominant:    { color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.08)' },
  submissive:  { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)' },
  mysterious:  { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.08)' },
};

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Overlay panel for selecting fantasy personas the character can adopt.
 * Shows available persona types with descriptions, traits, and bond
 * requirements. Locked personas show the minimum bond level needed.
 *
 * @param props - See {@link PersonaPickerProps}.
 *
 * @example
 * <PersonaPicker
 *   isOpen={showPersonas}
 *   onClose={() => setShowPersonas(false)}
 *   characterId={5}
 *   characterName="Luna"
 *   onSelect={(p) => activatePersona(p)}
 * />
 */
export function PersonaPicker({
  isOpen,
  onClose,
  characterId,
  characterName,
  onSelect,
}: PersonaPickerProps) {
  const [personas, setPersonas] = useState<PersonaType[]>([]);
  const [eligible, setEligible] = useState(false);
  const [bondLevel, setBondLevel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* ── Fetch persona types ─────────────────────────────────────────── */

  const fetchPersonas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/persona-types`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPersonas(data.types ?? []);
      setEligible(data.eligible ?? false);
      setBondLevel(data.bond_level ?? 0);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    if (isOpen && characterId) fetchPersonas();
  }, [isOpen, characterId, fetchPersonas]);

  /* ── Helpers ─────────────────────────────────────────────────────── */

  const getCategoryStyle = (cat: string) =>
    CATEGORY_COLORS[cat] ?? { color: 'var(--color-accent)', bg: 'var(--color-accent-soft)' };

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
              width: 440,
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
                <Wand2 size={16} style={{ color: 'var(--color-accent)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Fantasy Personas
                </h2>
                {personas.length > 0 && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'var(--color-accent-soft)',
                      color: 'var(--color-accent)',
                      fontSize: '0.65rem',
                    }}
                  >
                    {personas.length}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:opacity-80 transition-opacity"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Close personas"
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
                  Fantasy personas unlock at a deeper bond with {characterName} (current: {bondLevel})
                </span>
              </div>
            )}

            {/* ── Persona list ─────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
                </div>
              )}

              {error && (
                <div className="text-xs text-center py-8" style={{ color: 'var(--color-danger)' }}>
                  Failed to load personas
                </div>
              )}

              {!loading && !error && personas.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Sparkles size={28} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    No personas available
                  </p>
                </div>
              )}

              {!loading && personas.map((persona) => {
                const locked = bondLevel < persona.min_bond;
                const selected = selectedId === persona.id;
                const catStyle = getCategoryStyle(persona.category);

                return (
                  <motion.div
                    key={persona.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-2 rounded-lg p-3 transition-all"
                    style={{
                      backgroundColor: selected ? catStyle.bg : 'var(--color-surface-raised)',
                      border: `1px solid ${selected ? catStyle.color : 'var(--color-border-subtle)'}`,
                      opacity: locked ? 0.5 : 1,
                      cursor: locked ? 'default' : 'pointer',
                    }}
                    onClick={() => {
                      if (locked) return;
                      const isSelect = !selected;
                      setSelectedId(isSelect ? persona.id : null);
                      if (isSelect && onSelect) onSelect(persona);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {persona.name}
                        </span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded capitalize"
                          style={{ backgroundColor: catStyle.bg, color: catStyle.color, fontSize: '0.6rem' }}
                        >
                          {persona.category}
                        </span>
                      </div>
                      {locked && (
                        <div className="flex items-center gap-1 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                          <Lock size={11} />
                          <span style={{ fontSize: '0.6rem' }}>Bond {persona.min_bond}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                      {persona.description}
                    </p>
                    {persona.traits && persona.traits.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {persona.traits.map((trait, i) => (
                          <span
                            key={i}
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: 'var(--color-background)',
                              color: 'var(--color-text-muted)',
                              fontSize: '0.55rem',
                            }}
                          >
                            {trait}
                          </span>
                        ))}
                      </div>
                    )}
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
