import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Download, Heart } from 'lucide-react';
import type { GalleryItem } from '../hooks/useGallery';

/* ═══════════════════════════════════════════════════════════════════════
   ImageLightbox — full-screen viewer for a single GalleryItem
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Props for {@link ImageLightbox}.
 */
export interface ImageLightboxProps {
  /** Item to display, or `null` to render nothing (closed state). */
  item: GalleryItem | null;
  /** Close handler — invoked on backdrop click or Close button. */
  onClose: () => void;
  /** Toggle favorite for the current item. */
  onToggleFavorite: (item: GalleryItem) => void;
  /** Download handler for the current item. */
  onDownload: (item: GalleryItem) => void;
  /** Delete handler — caller is responsible for any confirm prompt. */
  onDelete: (item: GalleryItem) => void;
}

/**
 * Format a byte count into a human-readable string.
 *
 * @param bytes - File size in bytes
 * @returns Short string like `"237 B"`, `"1.2 KB"`, or `"3.4 MB"`
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Full-screen lightbox for a single gallery item.
 *
 * Extracted from `GalleryOverlay.tsx` (lines 320–474 prior to extraction)
 * so the same lightbox shell can be reused by the upcoming Visual Content
 * MVP Phase 2 chat-image viewer without duplicating the markup.
 *
 * Renders nothing when `item` is `null`. Otherwise displays a backdrop
 * (closes on click), the full-size image, a metadata bar, and three
 * actions: favorite toggle, download, and delete. Delete prompts the
 * caller through the `onDelete` callback — this component does NOT
 * call `confirm()` itself; the caller decides.
 *
 * @param props - See {@link ImageLightboxProps}.
 *
 * @example
 *   <ImageLightbox
 *     item={selectedItem}
 *     onClose={() => setSelectedItem(null)}
 *     onToggleFavorite={handleToggleFav}
 *     onDownload={handleDownload}
 *     onDelete={item => { if (confirm('Delete?')) handleDelete(item); }}
 *   />
 */
export function ImageLightbox({
  item,
  onClose,
  onToggleFavorite,
  onDownload,
  onDelete,
}: ImageLightboxProps) {
  return (
    <AnimatePresence>
      {item && (
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
          onClick={onClose}
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
            <img
              src={item.url}
              alt={item.caption || 'Screenshot'}
              style={{
                maxWidth: '85vw',
                maxHeight: '75vh',
                objectFit: 'contain',
                borderRadius: 8,
                backgroundColor: item.transparent
                  ? 'repeating-conic-gradient(#333 0 90deg, #444 0 180deg) 0 0/20px 20px'
                  : undefined,
              }}
            />

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              color: 'rgba(255,255,255,0.7)',
              fontSize: '0.72rem',
            }}>
              {item.character_name && (
                <span style={{ fontWeight: 600, color: 'white' }}>
                  {item.character_name}
                </span>
              )}
              {item.emotion && <span>{item.emotion}</span>}
              {item.gesture && <span>{item.gesture}</span>}
              <span>{item.width}×{item.height}</span>
              <span>{item.quality}x</span>
              <span>{formatSize(item.file_size)}</span>
              <span>{new Date(item.created_at).toLocaleDateString()}</span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => onToggleFavorite(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: item.favorite ? '#ef4444' : 'rgba(255,255,255,0.1)',
                  color: 'white',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                }}
              >
                <Heart size={13} fill={item.favorite ? 'white' : 'none'} />
                {item.favorite ? 'Unfavorite' : 'Favorite'}
              </button>

              <button
                onClick={() => onDownload(item)}
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
                onClick={() => onDelete(item)}
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
                onClick={onClose}
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
  );
}
