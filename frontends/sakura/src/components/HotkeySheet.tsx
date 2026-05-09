import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ShortcutEntry {
  key: string;
  description: string;
}

interface HotkeySheetProps {
  open: boolean;
  shortcuts: ShortcutEntry[];
  onClose: () => void;
}

/** Infer a display group from the description prefix. */
function inferGroup(desc: string): string {
  if (/^(open|show|toggle)/i.test(desc)) {
    if (/memory|diary|stats|timeline|analytics|summary|scenario|milestone|bookmark|bond|lorebook|vocabulary|desire|replay|search|gallery|boundary/i.test(desc)) return 'Overlays';
    if (/settings|keyboard|sidebar|cinematic|minimal|mode/i.test(desc)) return 'App Control';
  }
  if (/character|session|close|escape/i.test(desc)) return 'App Control';
  return 'Other';
}

/** Format a key string for display (ctrl+, → Ctrl+,). */
function fmtKey(raw: string): string {
  return raw
    .split('+')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('+');
}

/**
 * Read-only cheatsheet of all registered keyboard shortcuts.
 * Groups are inferred from the description text.
 * zIndex: 310 (above CommandPalette at 300).
 */
export function HotkeySheet({ open, shortcuts, onClose }: HotkeySheetProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Group shortcuts
  const groups: Record<string, ShortcutEntry[]> = {};
  for (const s of shortcuts) {
    const g = inferGroup(s.description);
    (groups[g] ??= []).push(s);
  }
  const groupOrder = ['App Control', 'Overlays', 'Other'];

  return (
    <AnimatePresence>
      {open && <>
        {/* Backdrop */}
        <motion.div
          ref={backdropRef}
          key="hotkey-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 309,
          }}
        />

        {/* Panel */}
        <motion.div
          key="hotkey-panel"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '620px',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: '80vh',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
            zIndex: 310,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--color-border-subtle)',
            flexShrink: 0,
          }}>
            <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-text-primary)' }}>
              Keyboard Shortcuts
            </span>
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '2px' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Shortcut grid */}
          <div style={{ overflowY: 'auto', padding: '12px 18px 18px' }}>
            {groupOrder.filter(g => groups[g]?.length).map(group => (
              <div key={group} style={{ marginBottom: '18px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'var(--color-text-tertiary)',
                  marginBottom: '8px',
                }}>
                  {group}
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '2px 24px',
                }}>
                  {groups[group].map(s => (
                    <>
                      <span
                        key={`desc-${s.key}`}
                        style={{ fontSize: '13px', color: 'var(--color-text-secondary)', padding: '4px 0' }}
                      >
                        {s.description}
                      </span>
                      <kbd
                        key={`key-${s.key}`}
                        style={{
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: 'var(--color-text-secondary)',
                          background: 'var(--color-background)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '4px',
                          padding: '2px 7px',
                          whiteSpace: 'nowrap',
                          alignSelf: 'center',
                          justifySelf: 'end',
                        }}
                      >
                        {fmtKey(s.key)}
                      </kbd>
                    </>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </>}
    </AnimatePresence>
  );
}
