import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Heart } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

interface BackendVersion {
  version: string;
  schema: number;
}

/**
 * About overlay — app name, version, and build info.
 * Opened via Alt+Shift+A or from tray / Settings > Help.
 */
export function AboutOverlay() {
  const { activeOverlay, closeOverlay } = useAppStore();
  const open = activeOverlay === 'about';

  const [build, setBuild] = useState<BackendVersion | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/health')
      .then(r => r.json())
      .then((d: Record<string, unknown>) => {
        setBuild({
          version: (d.version as string | undefined) ?? '—',
          schema: (d.schema_version as number | undefined) ?? 0,
        });
      })
      .catch(() => {});
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="about-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          }}
          onClick={closeOverlay}
        >
          <motion.div
            key="about-card"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 16,
              padding: '32px 36px',
              width: 360,
              maxWidth: '90vw',
              boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
              position: 'relative',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={closeOverlay}
              style={{
                position: 'absolute', top: 14, right: 14,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-secondary)', padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Close"
            >
              <X size={18} />
            </button>

            {/* App icon placeholder */}
            <div style={{
              width: 72, height: 72, borderRadius: 18,
              background: 'var(--color-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 18, fontSize: 36,
            }}>
              🌸
            </div>

            <h2 style={{
              margin: '0 0 4px',
              fontSize: 22, fontWeight: 700,
              color: 'var(--color-text)',
            }}>
              Waifu RT3D
            </h2>

            <p style={{
              margin: '0 0 16px',
              fontSize: 13, color: 'var(--color-text-secondary)',
            }}>
              AI companion platform — local, private, yours
            </p>

            {build && (
              <div style={{
                background: 'var(--color-surface-raised)',
                borderRadius: 8, padding: '10px 14px',
                marginBottom: 18,
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 0',
              }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Version</span>
                <span style={{ fontSize: 12, color: 'var(--color-text)', textAlign: 'right', fontFamily: 'monospace' }}>{build.version}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Schema</span>
                <span style={{ fontSize: 12, color: 'var(--color-text)', textAlign: 'right', fontFamily: 'monospace' }}>v{build.schema}</span>
              </div>
            )}

            <div style={{
              fontSize: 12, color: 'var(--color-text-secondary)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              Made with <Heart size={11} style={{ color: 'var(--color-accent)' }} fill="currentColor" /> MIT License
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
