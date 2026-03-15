import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ImagePlus, Trash2, Image } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import styles from './ExpressionPortraitsPanel.module.css';

// ── Emotion categories ──────────────────────────────────────────────────────

/** Emotion category definition for the portrait grid layout. */
interface EmotionCategory {
  /** Display label for the category header. */
  label: string;
  /** Ordered list of emotion slugs within this category. */
  emotions: string[];
}

const EMOTION_CATEGORIES: EmotionCategory[] = [
  { label: 'Core',     emotions: ['happy', 'sad', 'angry', 'surprised', 'neutral'] },
  { label: 'Social',   emotions: ['embarrassed', 'shy', 'proud', 'confident'] },
  { label: 'Romantic', emotions: ['love', 'flirty', 'longing'] },
  { label: 'Energy',   emotions: ['excited', 'tired', 'calm'] },
];

/** All emotion slugs flattened for counting. */
const ALL_EMOTIONS = EMOTION_CATEGORIES.flatMap((c) => c.emotions);

/** Spring config for card entrance animations. */
const cardSpring = { type: 'spring' as const, stiffness: 300, damping: 28 };

/**
 * Glass-styled expression portrait grid panel for Nova's character settings.
 *
 * Displays a categorized grid of emotion portrait slots (2:3 aspect ratio)
 * organized into Core, Social, Romantic, and Energy groups. Each slot can
 * display an existing portrait, accept a file upload, or show an empty
 * placeholder. Supports batch generation via the image-gen backend and
 * individual upload/delete per emotion.
 *
 * Communicates with the backend via:
 * - `api.listExpressionPortraits(charId)` — load existing portraits
 * - `api.generateExpressions(charId)` — batch-generate all portraits
 * - `api.uploadExpressionPortrait(charId, emotion, file)` — upload one
 * - `api.deleteExpressionPortrait(charId, emotion)` — delete one
 *
 * @example
 * ```tsx
 * // Rendered inside IconRail's panelContent map
 * <ExpressionPortraitsPanel />
 * ```
 */
export function ExpressionPortraitsPanel() {
  const activeCharacter = useAppStore((s) => s.activeCharacter);
  const charId = activeCharacter?.id ?? 0;

  // Portrait map: emotion → image URL
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [generatingSlots, setGeneratingSlots] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);

  // Hidden file input ref for per-slot uploads
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadEmotion = useRef<string | null>(null);

  /**
   * Fetch all expression portraits for the active character.
   * Called on mount and after generate/upload/delete operations.
   */
  const fetchPortraits = useCallback(async () => {
    if (!charId) return;
    try {
      const resp = await api.listExpressionPortraits(charId);
      setPortraits(resp.portraits ?? {});
    } catch (e) {
      console.error('[ExpressionPortraitsPanel] Failed to fetch portraits:', e);
    }
  }, [charId]);

  // Re-fetch when character changes
  useEffect(() => {
    fetchPortraits();
  }, [fetchPortraits]);

  /**
   * Batch-generate all expression portraits for the active character.
   * Sets per-slot loading indicators for all emotions during generation.
   */
  const handleGenerateAll = useCallback(async () => {
    if (!charId || generating) return;
    setGenerating(true);
    setErrors([]);
    setGeneratingSlots(new Set(ALL_EMOTIONS));
    try {
      const resp = await api.generateExpressions(charId);
      if (resp.portraits) {
        setPortraits((prev) => ({ ...prev, ...resp.portraits }));
      }
      if (resp.errors && resp.errors.length > 0) {
        setErrors(resp.errors);
      }
    } catch (e) {
      console.error('[ExpressionPortraitsPanel] Failed to generate expressions:', e);
      setErrors(['Generation failed. Check that an image generation provider is configured.']);
    } finally {
      setGenerating(false);
      setGeneratingSlots(new Set());
    }
  }, [charId, generating]);

  /**
   * Open the hidden file input for a specific emotion slot.
   *
   * @param emotion - The emotion slug to upload a portrait for.
   */
  const handleSlotClick = useCallback((emotion: string) => {
    pendingUploadEmotion.current = emotion;
    fileInputRef.current?.click();
  }, []);

  /**
   * Handle file selection from the hidden input and upload the portrait.
   * Triggered by the onChange event of the hidden file input.
   */
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const emotion = pendingUploadEmotion.current;
    if (!file || !emotion || !charId) return;

    // Reset the input so re-selecting the same file triggers onChange
    e.target.value = '';

    setGeneratingSlots((prev) => new Set(prev).add(emotion));
    try {
      const resp = await api.uploadExpressionPortrait(charId, emotion, file);
      if (resp.ok && resp.url) {
        setPortraits((prev) => ({ ...prev, [emotion]: resp.url }));
      }
    } catch (err) {
      console.error(`[ExpressionPortraitsPanel] Failed to upload ${emotion}:`, err);
    } finally {
      setGeneratingSlots((prev) => {
        const next = new Set(prev);
        next.delete(emotion);
        return next;
      });
      pendingUploadEmotion.current = null;
    }
  }, [charId]);

  /**
   * Delete a single expression portrait.
   *
   * @param emotion - The emotion slug whose portrait to remove.
   */
  const handleDelete = useCallback(async (emotion: string) => {
    if (!charId) return;
    try {
      await api.deleteExpressionPortrait(charId, emotion);
      setPortraits((prev) => {
        const next = { ...prev };
        delete next[emotion];
        return next;
      });
    } catch (e) {
      console.error(`[ExpressionPortraitsPanel] Failed to delete ${emotion}:`, e);
    }
  }, [charId]);

  const filledCount = Object.keys(portraits).length;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Top bar: count + generate button */}
      <div className={styles.topBar}>
        <span className={styles.portraitCount}>
          {filledCount} / {ALL_EMOTIONS.length} portraits
        </span>
        <button
          className={styles.generateButton}
          onClick={handleGenerateAll}
          disabled={!charId || generating}
        >
          <Sparkles size={12} />
          {generating ? 'Generating...' : 'Generate All'}
        </button>
      </div>

      {/* Error list from batch generation */}
      <AnimatePresence>
        {errors.length > 0 && (
          <motion.div
            key="errors"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={cardSpring}
            style={{ overflow: 'hidden' }}
          >
            <div className={styles.errorList}>
              {errors.map((err, i) => (
                <div key={i} className={styles.errorItem}>{err}</div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state when no character */}
      {!charId && (
        <div className={styles.emptyState}>
          <Image size={32} className={styles.emptyIcon} />
          <div className={styles.emptyText}>
            Select a character to manage expression portraits.
          </div>
        </div>
      )}

      {/* Categorized portrait grid */}
      {charId > 0 && EMOTION_CATEGORIES.map((category) => (
        <div key={category.label} className={styles.categorySection}>
          <div className={styles.categoryHeader}>{category.label}</div>
          <div className={styles.portraitGrid}>
            {category.emotions.map((emotion) => {
              const url = portraits[emotion];
              const isSlotLoading = generatingSlots.has(emotion);

              if (url) {
                // Filled slot with image
                return (
                  <div key={emotion} className={styles.slotFilled}>
                    <img
                      src={url}
                      alt={emotion}
                      className={styles.slotImage}
                      loading="lazy"
                    />
                    <div className={styles.slotLabel}>{emotion}</div>
                    <button
                      className={styles.deleteButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(emotion);
                      }}
                      title={`Delete ${emotion} portrait`}
                    >
                      <Trash2 size={10} />
                    </button>
                    {isSlotLoading && (
                      <div className={styles.slotLoading}>
                        <div className={styles.spinner} />
                      </div>
                    )}
                  </div>
                );
              }

              // Empty slot placeholder
              return (
                <div
                  key={emotion}
                  className={styles.slotEmpty}
                  onClick={() => handleSlotClick(emotion)}
                  title={`Upload ${emotion} portrait`}
                >
                  {isSlotLoading ? (
                    <div className={styles.slotLoading}>
                      <div className={styles.spinner} />
                    </div>
                  ) : (
                    <>
                      <ImagePlus size={14} className={styles.slotEmptyIcon} />
                      <span className={styles.slotEmptyLabel}>{emotion}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
