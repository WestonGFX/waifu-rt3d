/**
 * IntimateGallery — Feature F42: Intimate Photo Gallery
 *
 * Grid-based overlay for browsing AI-generated intimate images for a character.
 * Supports mood filtering, favorites, lightbox viewing, and stats display.
 * Bond-gated: requires bond level 80+ to access.
 *
 * API surface:
 *   GET /api/characters/{id}/gallery?limit=50&mood=X&favorites=true
 *       → { ok, images: [...], stats: { total, favorites, by_mood } }
 *
 * @module IntimateGallery
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Heart, Loader2, Image, Grid3X3, Star, ChevronLeft, ChevronRight,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

/** An intimate gallery image from the backend. */
interface GalleryImage {
  id: number;
  url: string;
  thumb_url?: string;
  mood: string | null;
  prompt_summary: string | null;
  is_favorite: boolean;
  bond_level_at_time: number;
  created_at: string;
}

/** Stats about the character's gallery. */
interface GalleryStats {
  total: number;
  favorites: number;
  by_mood: Record<string, number>;
}

interface IntimateGalleryProps {
  /** Whether the overlay is visible. */
  isOpen: boolean;
  /** Callback to close the overlay. */
  onClose: () => void;
  /** Character database ID. */
  characterId: number;
  /** Character display name. */
  characterName: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

const MOOD_COLORS: Record<string, string> = {
  romantic: '#ef4444',
  passionate: '#a855f7',
  playful: '#fbbf24',
  tender: '#3b82f6',
  dreamy: '#8b5cf6',
  bold: '#f43f5e',
};

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Full-screen overlay gallery for browsing a character's intimate images.
 * Features a responsive grid, mood filter chips, favorites toggle, and
 * a lightbox mode for full-size viewing with arrow navigation.
 *
 * @param props - See {@link IntimateGalleryProps}.
 *
 * @example
 * <IntimateGallery
 *   isOpen={showGallery}
 *   onClose={() => setShowGallery(false)}
 *   characterId={5}
 *   characterName="Luna"
 * />
 */
export function IntimateGallery({
  isOpen,
  onClose,
  characterId,
  characterName,
}: IntimateGalleryProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [stats, setStats] = useState<GalleryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moodFilter, setMoodFilter] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  /* ── Fetch gallery ───────────────────────────────────────────────── */

  const fetchGallery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (moodFilter) params.set('mood', moodFilter);
      if (favoritesOnly) params.set('favorites', 'true');
      const res = await fetch(`/api/characters/${characterId}/gallery?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setImages(data.images ?? []);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [characterId, moodFilter, favoritesOnly]);

  useEffect(() => {
    if (isOpen && characterId) fetchGallery();
  }, [isOpen, characterId, fetchGallery]);

  /* ── Lightbox navigation ─────────────────────────────────────────── */

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);

  const prevImage = () => {
    if (lightboxIndex !== null && lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1);
    }
  };

  const nextImage = () => {
    if (lightboxIndex !== null && lightboxIndex < images.length - 1) {
      setLightboxIndex(lightboxIndex + 1);
    }
  };

  /* ── Keyboard navigation in lightbox ─────────────────────────────── */

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prevImage();
      else if (e.key === 'ArrowRight') nextImage();
      else if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  /* ── Available mood filters from stats ───────────────────────────── */

  const moods = stats ? Object.keys(stats.by_mood).filter(m => stats.by_mood[m] > 0) : [];

  /* ── Helpers ─────────────────────────────────────────────────────── */

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return iso;
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
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Gallery panel — centered, larger */}
          <motion.div
            className="fixed inset-6 z-[201] flex flex-col overflow-hidden"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-elevated)',
              border: '1px solid var(--color-border-subtle)',
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            {/* ── Header ──────────────────────────────────────────── */}
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <Image size={16} style={{ color: 'var(--color-accent)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {characterName}&apos;s Gallery
                </h2>
                {stats && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'var(--color-accent-soft)',
                      color: 'var(--color-accent)',
                      fontSize: '0.65rem',
                    }}
                  >
                    {stats.total} images
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:opacity-80 transition-opacity"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Close gallery"
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Filter bar ──────────────────────────────────────── */}
            <div className="px-5 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              {/* Mood chips */}
              <div className="flex flex-wrap gap-1.5 flex-1">
                <button
                  onClick={() => setMoodFilter(null)}
                  className="text-xs px-2 py-0.5 rounded-full transition-all"
                  style={{
                    backgroundColor: !moodFilter ? 'var(--color-accent-soft)' : 'transparent',
                    color: !moodFilter ? 'var(--color-accent)' : 'var(--color-text-muted)',
                    border: `1px solid ${!moodFilter ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  }}
                >
                  All
                </button>
                {moods.map(mood => {
                  const active = moodFilter === mood;
                  const moodColor = MOOD_COLORS[mood] ?? 'var(--color-accent)';
                  return (
                    <button
                      key={mood}
                      onClick={() => setMoodFilter(active ? null : mood)}
                      className="text-xs px-2 py-0.5 rounded-full transition-all capitalize"
                      style={{
                        backgroundColor: active ? `${moodColor}15` : 'transparent',
                        color: active ? moodColor : 'var(--color-text-muted)',
                        border: `1px solid ${active ? moodColor : 'var(--color-border)'}`,
                      }}
                    >
                      {mood}
                    </button>
                  );
                })}
              </div>

              {/* Favorites toggle */}
              <button
                onClick={() => setFavoritesOnly(!favoritesOnly)}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-all"
                style={{
                  backgroundColor: favoritesOnly ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                  color: favoritesOnly ? '#ef4444' : 'var(--color-text-muted)',
                  border: `1px solid ${favoritesOnly ? '#ef4444' : 'var(--color-border)'}`,
                }}
              >
                <Heart size={11} fill={favoritesOnly ? '#ef4444' : 'none'} />
                Favorites
              </button>
            </div>

            {/* ── Image grid ──────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-5">
              {loading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
                </div>
              )}

              {error && (
                <div className="text-xs text-center py-12" style={{ color: 'var(--color-danger)' }}>
                  Failed to load gallery
                </div>
              )}

              {!loading && !error && images.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Grid3X3 size={36} style={{ color: 'var(--color-text-muted)', opacity: 0.3 }} />
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {moodFilter || favoritesOnly ? 'No images match your filters' : 'Gallery is empty'}
                  </p>
                </div>
              )}

              {!loading && !error && images.length > 0 && (
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
                >
                  {images.map((img, idx) => (
                    <motion.div
                      key={img.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      className="relative group rounded-lg overflow-hidden cursor-pointer"
                      style={{
                        aspectRatio: '3/4',
                        backgroundColor: 'var(--color-background)',
                        border: '1px solid var(--color-border-subtle)',
                      }}
                      onClick={() => openLightbox(idx)}
                    >
                      {/* Thumbnail */}
                      <img
                        src={img.thumb_url || img.url}
                        alt={img.prompt_summary || 'Gallery image'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />

                      {/* Hover overlay */}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2"
                        style={{ background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.6))' }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-white text-xs" style={{ fontSize: '0.6rem' }}>
                            {formatDate(img.created_at)}
                          </span>
                          {img.is_favorite && (
                            <Heart size={12} fill="#ef4444" color="#ef4444" />
                          )}
                        </div>
                        {img.mood && (
                          <span
                            className="text-white text-xs capitalize mt-0.5"
                            style={{ fontSize: '0.6rem', opacity: 0.8 }}
                          >
                            {img.mood}
                          </span>
                        )}
                      </div>

                      {/* Favorite badge (always visible) */}
                      {img.is_favorite && (
                        <div className="absolute top-1.5 right-1.5">
                          <Star size={12} fill="#fbbf24" color="#fbbf24" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* ── Lightbox ────────────────────────────────────────────── */}
          <AnimatePresence>
            {lightboxIndex !== null && images[lightboxIndex] && (
              <motion.div
                className="fixed inset-0 z-[300] flex items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeLightbox}
              >
                {/* Close button */}
                <button
                  className="absolute top-4 right-4 p-2 rounded-full"
                  style={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }}
                  onClick={closeLightbox}
                  aria-label="Close lightbox"
                >
                  <X size={20} />
                </button>

                {/* Navigation arrows */}
                {lightboxIndex > 0 && (
                  <button
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full"
                    style={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }}
                    onClick={(e) => { e.stopPropagation(); prevImage(); }}
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={24} />
                  </button>
                )}
                {lightboxIndex < images.length - 1 && (
                  <button
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full"
                    style={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }}
                    onClick={(e) => { e.stopPropagation(); nextImage(); }}
                    aria-label="Next image"
                  >
                    <ChevronRight size={24} />
                  </button>
                )}

                {/* Full-size image */}
                <motion.img
                  key={lightboxIndex}
                  src={images[lightboxIndex].url}
                  alt={images[lightboxIndex].prompt_summary || 'Full-size image'}
                  className="max-h-[85vh] max-w-[85vw] object-contain rounded-lg"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                />

                {/* Image counter */}
                <div
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs"
                  style={{ color: 'white', backgroundColor: 'rgba(0,0,0,0.5)' }}
                >
                  {lightboxIndex + 1} / {images.length}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
