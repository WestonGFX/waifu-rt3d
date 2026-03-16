import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Trash2, Download, Image, ChevronLeft, Heart,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useGallery, type GalleryItem } from '../hooks/useGallery';

/* ═══════════════════════════════════════════════════════════════════════
   GalleryOverlay — Screenshot gallery with thumbnail grid + lightbox
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Full-screen overlay for browsing, managing, and downloading screenshots.
 *
 * Renders when ``appStore.activeOverlay === 'gallery'``. Features:
 * - Thumbnail grid (4 columns, newest first)
 * - Character filter dropdown + favorites-only toggle
 * - Click thumbnail → lightbox with full-size view, metadata, actions
 * - Favorite toggle, delete, and download per screenshot
 */
export function GalleryOverlay() {
  const { activeOverlay, closeOverlay, characters } = useAppStore();
  const open = activeOverlay === 'gallery';

  const {
    items, total, loading, fetchPage,
    toggleFavorite, deleteItem,
  } = useGallery();

  // Filters
  const [filterCharId, setFilterCharId] = useState<number | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Lightbox
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);

  // Fetch on open or filter change
  useEffect(() => {
    if (open) {
      fetchPage({ offset: 0, characterId: filterCharId, favoritesOnly });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filterCharId, favoritesOnly]);

  const handleDownload = useCallback((item: GalleryItem) => {
    const a = document.createElement('a');
    a.href = `/api/gallery/${item.id}/download`;
    a.download = `${(item.character_name ?? 'screenshot').toLowerCase().replace(/\s+/g, '-')}-${item.uuid.slice(0, 8)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleDelete = useCallback(async (item: GalleryItem) => {
    await deleteItem(item.id);
    if (selectedItem?.id === item.id) {
      setSelectedItem(null);
    }
  }, [deleteItem, selectedItem]);

  const handleToggleFav = useCallback(async (item: GalleryItem) => {
    await toggleFavorite(item.id);
    // Update lightbox state if open
    if (selectedItem?.id === item.id) {
      setSelectedItem(prev => prev ? { ...prev, favorite: !prev.favorite } : null);
    }
  }, [toggleFavorite, selectedItem]);

  /**
   * Format file size into human-readable string.
   *
   * @param bytes - File size in bytes
   * @returns Formatted string (e.g., "1.2 MB")
   */
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 260,
        backgroundColor: 'var(--color-background)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={closeOverlay}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              padding: 2,
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <Image size={16} style={{ color: 'var(--color-accent)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>
            Gallery
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>
            {total} screenshot{total !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Character filter */}
          <select
            value={filterCharId ?? ''}
            onChange={e => setFilterCharId(e.target.value ? parseInt(e.target.value) : null)}
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: '0.7rem',
            }}
          >
            <option value="">All Characters</option>
            {characters.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Favorites toggle */}
          <button
            onClick={() => setFavoritesOnly(f => !f)}
            style={{
              background: favoritesOnly ? 'var(--color-accent)' : 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
              color: favoritesOnly ? 'white' : 'var(--color-text-secondary)',
              fontSize: '0.7rem',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Heart size={12} fill={favoritesOnly ? 'white' : 'none'} />
            Favorites
          </button>

          <button
            onClick={closeOverlay}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              padding: 2,
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 16,
      }}>
        {loading && items.length === 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: 40,
            color: 'var(--color-text-tertiary)',
            fontSize: '0.8rem',
          }}>
            Loading...
          </div>
        )}

        {!loading && items.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 60,
            color: 'var(--color-text-tertiary)',
            gap: 12,
          }}>
            <Image size={40} strokeWidth={1} />
            <span style={{ fontSize: '0.85rem' }}>No screenshots yet</span>
            <span style={{ fontSize: '0.7rem' }}>
              Use Photo Mode or Ctrl+Shift+S to capture
            </span>
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}>
          {items.map(item => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                position: 'relative',
                borderRadius: 10,
                overflow: 'hidden',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                cursor: 'pointer',
                transition: 'box-shadow 0.15s',
              }}
              onClick={() => setSelectedItem(item)}
              whileHover={{ boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
            >
              {/* Thumbnail */}
              <div style={{
                width: '100%',
                paddingTop: '75%',
                position: 'relative',
                backgroundColor: item.transparent ? 'repeating-conic-gradient(#eee 0 90deg, #fff 0 180deg) 0 0/20px 20px' : 'var(--color-bg-secondary)',
              }}>
                <img
                  src={item.thumb_url}
                  alt={item.caption || `Screenshot of ${item.character_name || 'character'}`}
                  loading="lazy"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                {/* Favorite badge */}
                {item.favorite && (
                  <div style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    color: '#ef4444',
                  }}>
                    <Heart size={14} fill="#ef4444" />
                  </div>
                )}
                {/* Quality badge */}
                {item.quality > 1 && (
                  <div style={{
                    position: 'absolute',
                    bottom: 6,
                    right: 6,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    color: 'white',
                    fontSize: '0.55rem',
                    padding: '1px 5px',
                    borderRadius: 4,
                    fontWeight: 600,
                  }}>
                    {item.quality}x
                  </div>
                )}
              </div>

              {/* Info bar */}
              <div style={{ padding: '6px 8px' }}>
                <div style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {item.character_name || 'Screenshot'}
                </div>
                <div style={{
                  fontSize: '0.6rem',
                  color: 'var(--color-text-tertiary)',
                  display: 'flex',
                  gap: 6,
                }}>
                  {item.emotion && <span>{item.emotion}</span>}
                  <span>{formatSize(item.file_size)}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 270,
              backgroundColor: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(8px)',
            }}
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Full-size image */}
              <img
                src={selectedItem.url}
                alt={selectedItem.caption || 'Screenshot'}
                style={{
                  maxWidth: '85vw',
                  maxHeight: '75vh',
                  objectFit: 'contain',
                  borderRadius: 8,
                  backgroundColor: selectedItem.transparent
                    ? 'repeating-conic-gradient(#333 0 90deg, #444 0 180deg) 0 0/20px 20px'
                    : undefined,
                }}
              />

              {/* Metadata bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                color: 'rgba(255,255,255,0.7)',
                fontSize: '0.72rem',
              }}>
                {selectedItem.character_name && (
                  <span style={{ fontWeight: 600, color: 'white' }}>
                    {selectedItem.character_name}
                  </span>
                )}
                {selectedItem.emotion && <span>{selectedItem.emotion}</span>}
                {selectedItem.gesture && <span>{selectedItem.gesture}</span>}
                <span>{selectedItem.width}×{selectedItem.height}</span>
                <span>{selectedItem.quality}x</span>
                <span>{formatSize(selectedItem.file_size)}</span>
                <span>{new Date(selectedItem.created_at).toLocaleDateString()}</span>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleToggleFav(selectedItem)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.2)',
                    backgroundColor: selectedItem.favorite ? '#ef4444' : 'rgba(255,255,255,0.1)',
                    color: 'white',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  <Heart size={13} fill={selectedItem.favorite ? 'white' : 'none'} />
                  {selectedItem.favorite ? 'Unfavorite' : 'Favorite'}
                </button>

                <button
                  onClick={() => handleDownload(selectedItem)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.2)',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    color: 'white',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  <Download size={13} />
                  Download
                </button>

                <button
                  onClick={() => {
                    if (confirm('Delete this screenshot?')) {
                      handleDelete(selectedItem);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.2)',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    color: '#ef4444',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={13} />
                  Delete
                </button>

                <button
                  onClick={() => setSelectedItem(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.2)',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    color: 'white',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                  }}
                >
                  <X size={13} />
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
