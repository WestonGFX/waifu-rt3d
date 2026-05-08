import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smile, Upload, Trash2, Wand2 } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

/* ═══════════════════════════════════════════════════════════════════════
   Canonical 26-Emotion Set (Phase 15)
   ═══════════════════════════════════════════════════════════════════════ */

/** Display metadata for each emotion slot, grouped by category. */
const EMOTION_CATEGORIES: { category: string; slots: { emotion: string; label: string; emoji: string }[] }[] = [
  {
    category: 'Core',
    slots: [
      { emotion: 'happy',    label: 'Happy',     emoji: '😊' },
      { emotion: 'sad',      label: 'Sad',       emoji: '😢' },
      { emotion: 'angry',    label: 'Angry',     emoji: '😤' },
      { emotion: 'surprised',label: 'Surprised',  emoji: '😲' },
      { emotion: 'fearful',  label: 'Fearful',   emoji: '😨' },
      { emotion: 'disgusted',label: 'Disgusted',  emoji: '🤢' },
      { emotion: 'neutral',  label: 'Neutral',   emoji: '😐' },
    ],
  },
  {
    category: 'Social',
    slots: [
      { emotion: 'embarrassed', label: 'Embarrassed', emoji: '😳' },
      { emotion: 'shy',         label: 'Shy',         emoji: '🥺' },
      { emotion: 'proud',       label: 'Proud',       emoji: '😎' },
      { emotion: 'confident',   label: 'Confident',   emoji: '😏' },
      { emotion: 'jealous',     label: 'Jealous',     emoji: '😑' },
      { emotion: 'grateful',    label: 'Grateful',    emoji: '🙏' },
    ],
  },
  {
    category: 'Cognitive',
    slots: [
      { emotion: 'confused',    label: 'Confused',    emoji: '😕' },
      { emotion: 'curious',     label: 'Curious',     emoji: '🧐' },
      { emotion: 'thoughtful',  label: 'Thoughtful',  emoji: '🤔' },
      { emotion: 'nostalgic',   label: 'Nostalgic',   emoji: '😌' },
      { emotion: 'awe',         label: 'Awe',         emoji: '🤩' },
    ],
  },
  {
    category: 'Romantic',
    slots: [
      { emotion: 'love',    label: 'Love',    emoji: '💕' },
      { emotion: 'flirty',  label: 'Flirty',  emoji: '😉' },
      { emotion: 'longing', label: 'Longing', emoji: '😔' },
    ],
  },
  {
    category: 'Energy',
    slots: [
      { emotion: 'excited',  label: 'Excited',  emoji: '🔥' },
      { emotion: 'tired',    label: 'Tired',    emoji: '😴' },
      { emotion: 'relieved', label: 'Relieved', emoji: '😌' },
    ],
  },
  {
    category: 'Playful',
    slots: [
      { emotion: 'smug',        label: 'Smug',        emoji: '😏' },
      { emotion: 'mischievous', label: 'Mischievous', emoji: '😈' },
    ],
  },
];

/** Map of emotion name to portrait image URL. */
type PortraitMap = Record<string, string>;

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Parse the `expr_portraits` JSON string stored on a character.
 * Returns a map on parse failure so the UI is always in a valid state.
 *
 * @param raw - Raw JSON string from `character.expr_portraits`, or null/undefined.
 * @returns PortraitMap with whatever emotions were stored.
 */
function parsePortraits(raw: string | null | undefined): PortraitMap {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PortraitMap;
  } catch {
    return {};
  }
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
 * A single emotion portrait cell.
 * Shows a thumbnail when assigned, emoji placeholder when empty,
 * and upload/clear action buttons.
 */
function PortraitCell({
  emotion,
  label,
  emoji,
  url,
  onUpload,
  onClear,
}: {
  emotion: string;
  label: string;
  emoji: string;
  url: string;
  onUpload: (emotion: string, file: File) => void;
  onClear: (emotion: string) => void;
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
        gap: '6px',
        padding: '10px 8px',
        borderRadius: '10px',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {/* Thumbnail or placeholder */}
      <div
        style={{
          width: '44px',
          height: '44px',
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
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: '1.4rem', lineHeight: 1, userSelect: 'none' }}>{emoji}</span>
        )}
      </div>

      {/* Emotion label */}
      <span
        style={{
          fontSize: '0.6rem',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
          textAlign: 'center',
        }}
      >
        {label}
      </span>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '3px' }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          title={`Upload ${label} portrait`}
          aria-label={`Upload ${label} expression portrait`}
          style={{
            padding: '2px 5px',
            fontSize: '0.58rem',
            borderRadius: '4px',
            border: '1px solid var(--color-border)',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <Upload size={9} />
        </button>

        {url && (
          <button
            onClick={() => onClear(emotion)}
            title={`Remove ${label} portrait`}
            aria-label={`Remove ${label} expression portrait`}
            style={{
              padding: '2px 4px',
              fontSize: '0.58rem',
              borderRadius: '4px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-danger, #f55)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Trash2 size={9} />
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
 * Right slide-out drawer for assigning expression portraits to the 26
 * canonical emotion slots on a character (Phase 15 expansion from 6).
 *
 * Emotions are organized by category (Core, Social, Cognitive, Romantic,
 * Energy, Playful) with collapsible sections and a 3-column grid.
 *
 * Supports batch file upload: drag-and-drop multiple files named
 * `{emotion}.png` to auto-assign them to the correct slots.
 */
export function MoodBoardEditor() {
  const { closeOverlay, activeCharacter, setActiveCharacter } = useAppStore();
  const open = false; // overlay removed

  const [portraitMap, setPortraitMap] = useState<PortraitMap>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
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

  // Probe whether the generate endpoint exists.
  useEffect(() => {
    if (!open || genEndpointAvailable !== null) return;
    fetch('/api/image-gen/expressions', { method: 'HEAD' })
      .then(res => setGenEndpointAvailable(res.status !== 404))
      .catch(() => setGenEndpointAvailable(false));
  }, [open, genEndpointAvailable]);

  /**
   * Handle a local file upload for a specific emotion slot.
   * Also uploads to the per-character portrait directory via the Phase 15 API.
   */
  const handleUpload = async (emotion: string, file: File) => {
    try {
      // Show immediate preview
      const dataUrl = await fileToDataUrl(file);
      setPortraitMap(prev => ({ ...prev, [emotion]: dataUrl }));
      setSaveOk(false);

      // Upload to server if character exists
      if (activeCharacter) {
        api.uploadExpressionPortrait(activeCharacter.id, emotion, file)
          .then(res => {
            if (res.ok && res.url) {
              setPortraitMap(prev => ({ ...prev, [emotion]: res.url }));
            }
          })
          .catch(err => console.error('[MoodBoardEditor] Upload failed:', err));
      }
    } catch (err) {
      console.error('[MoodBoardEditor] Failed to read file:', err);
    }
  };

  /**
   * Remove the portrait for the given emotion slot.
   */
  const handleClear = (emotion: string) => {
    setPortraitMap(prev => {
      const next = { ...prev };
      delete next[emotion];
      return next;
    });
    setSaveOk(false);

    // Delete from server
    if (activeCharacter) {
      api.deleteExpressionPortrait(activeCharacter.id, emotion).catch(() => {});
    }
  };

  /**
   * Handle batch file drop — files named `{emotion}.png` are auto-assigned.
   */
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const allEmotions = EMOTION_CATEGORIES.flatMap(c => c.slots.map(s => s.emotion));
    const files = Array.from(e.dataTransfer.files);

    for (const file of files) {
      const baseName = file.name.replace(/\.[^.]+$/, '').toLowerCase();
      // Match {emotion}.png or {CharName}_{emotion}.png
      const emotion = allEmotions.find(em =>
        baseName === em || baseName.endsWith(`_${em}`)
      );
      if (emotion) {
        await handleUpload(emotion, file);
      }
    }
  };

  /**
   * Persist the current portraitMap to the backend.
   */
  const handleSave = async () => {
    if (!activeCharacter) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const updated = await api.updateCharacter(activeCharacter.id, {
        ...({ expr_portraits: JSON.stringify(portraitMap) } as object),
      } as Parameters<typeof api.updateCharacter>[1]);
      setActiveCharacter(updated);
      setSaveOk(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Trigger AI generation of all expression portraits via the backend.
   */
  const handleGenerateAll = async () => {
    if (!activeCharacter || !genEndpointAvailable) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await api.generateExpressions(activeCharacter.id);
      if (res.ok && res.portraits) {
        setPortraitMap(prev => ({ ...prev, ...res.portraits }));
        setSaveOk(false);
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const isGenerateDisabled = !genEndpointAvailable || generating || !activeCharacter;
  const assignedCount = Object.values(portraitMap).filter(Boolean).length;

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
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(520px, 94vw)',
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
              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
                {assignedCount}/26
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
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
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
                  {/* Generate All + batch hint */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      onClick={handleGenerateAll}
                      disabled={isGenerateDisabled}
                      title={
                        genEndpointAvailable === false
                          ? 'Image gen endpoint not available'
                          : generating
                          ? 'Generating...'
                          : 'AI-generate all expression portraits'
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 12px',
                        fontSize: '0.75rem',
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
                      }}
                    >
                      <Wand2 size={13} />
                      {generating ? 'Generating...' : 'Generate All'}
                    </button>

                    <span style={{ fontSize: '0.62rem', color: 'var(--color-text-tertiary)' }}>
                      Drop files named happy.png, sad.png, etc.
                    </span>
                  </div>

                  {generateError && (
                    <p style={{ fontSize: '0.7rem', color: 'var(--color-danger, #f44)', margin: 0 }}>
                      {generateError}
                    </p>
                  )}

                  {/* Category sections with 3-column grids */}
                  {EMOTION_CATEGORIES.map(({ category, slots }) => (
                    <div key={category}>
                      <div
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'var(--color-text-tertiary)',
                          marginBottom: '8px',
                          paddingBottom: '4px',
                          borderBottom: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        {category}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: '8px',
                        }}
                      >
                        {slots.map(({ emotion, label, emoji }) => (
                          <PortraitCell
                            key={emotion}
                            emotion={emotion}
                            label={label}
                            emoji={emoji}
                            url={portraitMap[emotion] || ''}
                            onUpload={handleUpload}
                            onClear={handleClear}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Save section */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
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
                      }}
                    >
                      {saving ? 'Saving...' : 'Save Portraits'}
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
