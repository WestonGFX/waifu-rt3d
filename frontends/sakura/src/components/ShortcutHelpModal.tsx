import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ShortcutEntry {
  key: string;
  description: string;
}

interface ShortcutHelpModalProps {
  open: boolean;
  shortcuts: ShortcutEntry[];
  onClose: () => void;
}

/** Format a raw shortcut string into a readable key badge label. */
function formatKey(raw: string): string {
  return raw
    .replace('ctrl+\\', 'Ctrl + \\')
    .replace('ctrl+,', 'Ctrl + ,')
    .replace('ctrl+m', 'Ctrl + M')
    .replace('alt+v', 'Alt + V')
    .replace('alt+n', 'Alt + N')
    .replace('escape', 'Esc')
    .replace('?', '?');
}

/** Single key badge pill. */
function KeyBadge({ label }: { label: string }) {
  return (
    <kbd
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold"
      style={{
        backgroundColor: 'var(--color-background)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-secondary)',
        boxShadow: '0 1px 0 var(--color-border)',
      }}
    >
      {label}
    </kbd>
  );
}

/**
 * Keyboard shortcut reference overlay, triggered by the ? key.
 * Lists all registered global shortcuts with formatted key badges.
 */
export function ShortcutHelpModal({ open, shortcuts, onClose }: ShortcutHelpModalProps) {
  // Filter out the ? shortcut itself — it's implicit
  const visible = shortcuts.filter(s => s.key !== '?');

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-card)',
              border: '1px solid var(--color-border-subtle)',
              boxShadow: 'var(--shadow-elevated)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Keyboard Shortcuts
              </span>
              <button
                onClick={onClose}
                className="p-1 rounded-md"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Shortcut rows */}
            <div className="px-4 py-3 flex flex-col gap-2.5">
              {visible.map(s => (
                <div key={s.key} className="flex items-center justify-between gap-4">
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {s.description}
                  </span>
                  <KeyBadge label={formatKey(s.key)} />
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div
              className="px-4 py-2.5 text-center"
              style={{ borderTop: '1px solid var(--color-border-subtle)' }}
            >
              <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                Press <KeyBadge label="?" /> or <KeyBadge label="Esc" /> to close
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
