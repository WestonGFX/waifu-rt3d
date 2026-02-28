import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smile, Upload, Trash2, Wand2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** The six canonical emotion slots available for expression portrait assignment. */
type Emotion = 'happy' | 'sad' | 'love' | 'angry' | 'shock' | 'neutral';

/** Map of emotion name to portrait image URL (or empty string when unset). */
type PortraitMap = Record<Emotion, string>;

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** Display metadata for each emotion slot. */
const EMOTION_SLOTS: { emotion: Emotion; label: string; emoji: string }[] = [
  { emotion: 'happy',   label: 'Happy',   emoji: '😊' },
  { emotion: 'sad',     label: 'Sad',     emoji: '😢' },
  { emotion: 'love',    label: 'Love',    emoji: '💕' },
  { emotion: 'angry',   label: 'Angry',   emoji: '😤' },
  { emotion: 'shock',   label: 'Shock',   emoji: '😱' },
  { emotion: 'neutral', label: 'Neutral', emoji: '😐' },
];

const EMPTY_MAP: PortraitMap = {
  happy: '', sad: '', love: '', angry: '', shock: '', neutral: '',
};

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Parse the `expr_portraits` JSON string stored on a character.
 * Returns an empty map on parse failure so the UI is always in a valid state.
 *
 * @param raw - Raw JSON string from `character.expr_portraits`, or null/undefined.
 * @returns Fully-populated PortraitMap (missing keys default to empty string).
 */
function parsePortraits(raw: string | null | undefined): PortraitMap {
  const base: PortraitMap = { ...EMPTY_MAP };
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<PortraitMap>;
    for (const key of Object.keys(base) as Emotion[]) {
      if (typeof parsed[key] === 'string') base[key] = parsed[key]!;
    }
  } catch {
    // Malformed JSON — silently fall back to empty map.
  }
  return base;
}

/**
 * Convert a File object to a data URL for local preview and storage.
 *
 * @param file - The image file selected by the user.
 * @returns A base64 data URL string.
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * A single emotion portrait cell in the 2×3 grid.
 *
 * Shows:
 * - A 50×50 thumbnail when a URL is assigned
 * - An emoji placeholder when no portrait is set
 * - Upload and Clear action buttons
 *
 * @param emotion  - Emotion slot identifier.
 * @param label    - Human-readable label for the emotion.
 * @param emoji    - Emoji fallback displayed when no portrait URL is set.
 * @param url      - Current portrait URL (empty string = unset).
 * @param onUpload - Called with the File selected by the user.
 * @param onClear  - Called when the user removes this portrait.
 */
function PortraitCell({
  emotion,
  label,
  emoji,
  url,
  onUpload,
  onClear,
}: {
  emotion: Emotion;
  label: string;
  emoji: string;
  url: string;
  onUpload: (emotion: Emotion, file: File) => void;
  onClear: (emotion: Emotion) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(emotion, file);
    e.target.value = '';
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '12px',
        borderRadius: '10px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {/* Thumbnail or placeholder */}
      <div
        style={{
          width: '50px',
          height: '50px',
          borderRadius: '8px',
          overflow: 'hidden',
          border: url
            ? '2px solid var(--color-accent)'
            : '2px dashed var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-background)',
          flexShrink: 0,
        }}
      >
        {url ? (
          <img
            src={url}
            alt={`${label} expression portrait`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <span style={{ fontSize: '1.6rem', lineHeight: 1, userSelect: 'none' }}>{emoji}</span>
        )}
      </div>

      {/* Emotion label */}
      <span
        style={{
          fontSize: '0.65rem',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
        }}
      >
        {label}
      </span>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          title={`Upload ${label} portrait`}
          aria-label={`Upload ${label} expression portrait`}
          style={{
            padding: '3px 7px',
            fontSize: '0.62rem',
            borderRadius: '4px',
            border: '1px solid var(--color-border)',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <Upload size={10} />
          Upload
        </button>

        {url && (
          <button
            onClick={() => onClear(emotion)}
            title={`Remove ${label} portrait`}
            aria-label={`Remove ${label} expression portrait`}
            style={{
              padding: '3px 5px',
              fontSize: '0.62rem',
              borderRadius: '4px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-danger, #f55)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Right slide-out drawer for assigning expression portraits to the 6 emotion
 * slots on a character.
 *
 * State model:
 * - `portraitMap` is kept locally and persisted to the backend via
 *   `api.updateCharacter` when the user clicks Save.
 * - Local uploads are converted to base64 data URLs (suitable for small
 *   thumbnails; a production implementation would upload to a file server).
 * - "Generate All" fires `POST /api/image-gen/expressions`. If that endpoint
 *   is not present the button is disabled with a tooltip.
 *
 * Reads `character.expr_portraits` (JSON string) from `activeCharacter` on
 * mount, parses it, and falls back to an empty map on error.
 */
export function MoodBoardEditor() {
  const { activeOverlay, closeOverlay, activeCharacter, setActiveCharacter } = useAppStore();
  const open = activeOverlay === 'moodboard';

  const [portraitMap, setPortraitMap] = useState<PortraitMap>({ ...EMPTY_MAP });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  /**
   * Whether the image-gen expressions endpoint exists.
   * We optimistically assume it does and flip to false on first 404/405.
   */
  const [genEndpointAvailable, setGenEndpointAvailable] = useState<boolean | null>(null);

  // Parse stored portraits whenever the panel opens or the active character changes.
  useEffect(() => {
    if (!open || !activeCharacter) return;
    const raw = (activeCharacter as unknown as { expr_portraits?: string | null }).expr_portraits;
    setPortraitMap(parsePortraits(raw));
    setSaveOk(false);
    setSaveError(null);
    setGenerateError(null);
  }, [open, activeCharacter?.id]);

  // Probe whether the generate endpoint exists (lazy, first time panel opens).
  useEffect(() => {
    if (!open || genEndpointAvailable !== null) return;
    fetch('/api/image-gen/expressions', { method: 'HEAD' })
      .then(res => {
        // 405 Method Not Allowed = endpoint exists but HEAD not supported.
        // 404 = endpoint missing.
        setGenEndpointAvailable(res.status !== 404);
      })
      .catch(() => setGenEndpointAvailable(false));
  }, [open, genEndpointAvailable]);

  /**
   * Handle a local file upload for a specific emotion slot.
   * Converts the File to a base64 data URL and stores it in the local map.
   *
   * @param emotion - The emotion slot being updated.
   * @param file    - The image file chosen by the user.
   */
  const handleUpload = async (emotion: Emotion, file: File) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      setPortraitMap(prev => ({ ...prev, [emotion]: dataUrl }));
      setSaveOk(false);
    } catch (err) {
      console.error('[MoodBoardEditor] Failed to read file:', err);
    }
  };

  /**
   * Remove the portrait URL for the given emotion slot.
   *
   * @param emotion - The emotion slot to clear.
   */
  const handleClear = (emotion: Emotion) => {
    setPortraitMap(prev => ({ ...prev, [emotion]: '' }));
    setSaveOk(false);
  };

  /**
   * Persist the current portraitMap to the backend by calling updateCharacter.
   * Updates the local activeCharacter reference in appStore on success so
   * the panel reflects the new value if reopened without a full reload.
   */
  const handleSave = async () => {
    if (!activeCharacter) return;

    setSaving(true);
    setSaveError(null);
    setSaveOk(false);

    try {
      const updated = await api.updateCharacter(activeCharacter.id, {
        // Store as JSON string in the expr_portraits column.
        ...({ expr_portraits: JSON.stringify(portraitMap) } as object),
      } as Parameters<typeof api.updateCharacter>[1]);

      // Reflect saved state in appStore so other components see it.
      setActiveCharacter(updated);
      setSaveOk(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Trigger AI generation of all six expression portraits via the backend.
   * Fires `POST /api/image-gen/expressions` with character metadata.
   * On success, merges returned URLs into the local portrait map.
   */
  const handleGenerateAll = async () => {
    if (!activeCharacter || !genEndpointAvailable) return;

    setGenerating(true);
    setGenerateError(null);

    try {
      const res = await fetch('/api/image-gen/expressions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_id: activeCharacter.id,
          character_name: activeCharacter.name,
          system_prompt: activeCharacter.system_prompt,
        }),
      });

      if (!res.ok) {
        if (res.status === 404 || res.status === 405) {
          setGenEndpointAvailable(false);
          return;
        }
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json() as { ok: boolean; portraits?: Partial<PortraitMap> };
      if (data.ok && data.portraits) {
        setPortraitMap(prev => ({ ...prev, ...data.portraits }));
        setSaveOk(false);
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const isGenerateDisabled = !genEndpointAvailable || generating || !activeCharacter;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="moodboard-backdrop"
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
            key="moodboard-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Expression portraits editor"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(480px, 94vw)',
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
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <Smile size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-primary)',
                }}
              >
                EXPRESSION PORTRAITS
              </span>
              {activeCharacter && (
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginLeft: 2 }}>
                  {activeCharacter.name}
                </span>
              )}
              <button
                onClick={closeOverlay}
                aria-label="Close expression portraits editor"
                title="Close"
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Content ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              {/* No character selected */}
              {!activeCharacter && (
                <div
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: '12px', padding: '40px 20px', textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '2.5rem', opacity: 0.3 }}>🎭</span>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', margin: 0 }}>
                    No character selected
                  </p>
                </div>
              )}

              {activeCharacter && (
                <>
                  {/* Generate All button */}
                  <div>
                    <button
                      onClick={handleGenerateAll}
                      disabled={isGenerateDisabled}
                      title={
                        genEndpointAvailable === false
                          ? 'Image gen endpoint coming soon'
                          : generating
                          ? 'Generating…'
                          : 'AI-generate all 6 expression portraits'
                      }
                      aria-label="Generate all expression portraits with AI"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        borderRadius: '7px',
                        border: '1px solid var(--color-accent)',
                        backgroundColor: isGenerateDisabled
                          ? 'transparent'
                          : 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                        color: isGenerateDisabled
                          ? 'var(--color-text-tertiary)'
                          : 'var(--color-accent)',
                        cursor: isGenerateDisabled ? 'not-allowed' : 'pointer',
                        opacity: isGenerateDisabled ? 0.5 : 1,
                        borderColor: isGenerateDisabled
                          ? 'var(--color-border)'
                          : 'var(--color-accent)',
                        transition: 'opacity 0.15s',
                      }}
                    >
                      <Wand2 size={14} />
                      {generating ? 'Generating…' : 'Generate All'}
                    </button>

                    {genEndpointAvailable === false && (
                      <p style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)', marginTop: '5px', margin: '5px 0 0' }}>
                        Image gen endpoint coming soon
                      </p>
                    )}
                    {generateError && (
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-danger, #f44)', marginTop: '5px', margin: '5px 0 0' }}>
                        {generateError}
                      </p>
                    )}
                  </div>

                  {/* 2-column emotion grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '10px',
                    }}
                  >
                    {EMOTION_SLOTS.map(({ emotion, label, emoji }) => (
                      <PortraitCell
                        key={emotion}
                        emotion={emotion}
                        label={label}
                        emoji={emoji}
                        url={portraitMap[emotion]}
                        onUpload={handleUpload}
                        onClear={handleClear}
                      />
                    ))}
                  </div>

                  {/* Save section */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      aria-label="Save expression portraits"
                      style={{
                        padding: '10px 0',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: 'var(--color-accent)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        letterSpacing: '0.04em',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.6 : 1,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      {saving ? 'Saving…' : 'Save Portraits'}
                    </button>

                    {saveOk && (
                      <p style={{ fontSize: '0.72rem', color: 'var(--color-success)', margin: 0, textAlign: 'center' }}>
                        Portraits saved successfully.
                      </p>
                    )}
                    {saveError && (
                      <p style={{ fontSize: '0.72rem', color: 'var(--color-danger, #f44)', margin: 0 }}>
                        {saveError}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
