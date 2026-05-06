import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Download, RefreshCw, Share2 } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   ChatImageLightbox — full-screen viewer for an inline chat image
   ═══════════════════════════════════════════════════════════════════════

   Sibling of `ImageLightbox` (which is shaped around the gallery's
   `GalleryItem` and supports favorite/delete). This URL-based variant is
   the chat-bubble case: a single image URL with optional Save / Share /
   Regenerate actions. The two components intentionally do not share
   state — gallery items have DB identity, chat images are ephemeral.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Props for {@link ChatImageLightbox}.
 */
export interface ChatImageLightboxProps {
  /** Image URL to display. */
  imageUrl: string;
  /** Close handler — invoked on backdrop click, Esc, or Close button. */
  onClose: () => void;
  /** Save handler — when omitted, the Save button is hidden. */
  onSave?: () => void;
  /** Regenerate handler — when omitted, the Regenerate button is hidden. */
  onRegenerate?: () => void;
}

/**
 * Full-screen lightbox for a single chat-image URL.
 *
 * Wrap with `<AnimatePresence>` at the call site; this component renders
 * unconditionally when mounted. Backdrop click closes; image-panel click
 * stops propagation. Esc fires `onClose` via a window keydown listener.
 *
 * @example
 * <AnimatePresence>
 *   {open && (
 *     <ChatImageLightbox
 *       imageUrl={msg.imageUrl!}
 *       onClose={() => setOpen(false)}
 *       onSave={() => downloadFromUrl(msg.imageUrl!, 'rin.png')}
 *       onRegenerate={msg.imagePrompt ? () => regen(msg.id) : undefined}
 *     />
 *   )}
 * </AnimatePresence>
 */
export function ChatImageLightbox({
  imageUrl,
  onClose,
  onSave,
  onRegenerate,
}: ChatImageLightboxProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleShare = () => {
    void navigator.clipboard?.writeText(imageUrl).catch(() => {});
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 260,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4vh 4vw',
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <img
          src={imageUrl}
          alt="Generated image"
          style={{
            maxWidth: '90vw',
            maxHeight: '78vh',
            borderRadius: 12,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            objectFit: 'contain',
          }}
        />

        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '6px 8px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {onSave && (
            <LightboxButton onClick={onSave} title="Save" icon={<Download size={16} />} />
          )}
          <LightboxButton onClick={handleShare} title="Copy URL" icon={<Share2 size={16} />} />
          {onRegenerate && (
            <LightboxButton
              onClick={onRegenerate}
              title="Regenerate"
              icon={<RefreshCw size={16} />}
            />
          )}
          <LightboxButton onClick={onClose} title="Close" icon={<X size={16} />} />
        </div>
      </motion.div>
    </motion.div>
  );
}

interface LightboxButtonProps {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}

function LightboxButton({ onClick, title, icon }: LightboxButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: 999,
        border: 'none',
        background: 'transparent',
        color: 'white',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {icon}
    </button>
  );
}
