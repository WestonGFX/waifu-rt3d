import { lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

// SettingsView is 4 000+ lines and imports many heavy sub-panels (VoicePicker,
// TTSModelsPanel, ModelManagerPanel, LinkStatusPanel, etc.).  Lazy-loading it
// means the JS is never parsed until the user first opens Settings, which is
// the single largest deferred-parse win available in this codebase.
const SettingsView = lazy(() => import('../views/SettingsView').then(m => ({ default: m.SettingsView })));

/**
 * Settings panel — supports two layout modes:
 * - 'drawer' (default): full-width right-side overlay with a dark backdrop
 * - 'sidebar': left-side panel that leaves the 3D viewer visible on the right
 *
 * The mode is persisted in appStore and can be changed in Settings → General → Chat Behaviour.
 */
export function SettingsDrawer() {
  const { activeOverlay, closeOverlay, settingsMode } = useAppStore();
  const open = activeOverlay === 'settings';
  const isSidebar = settingsMode === 'sidebar';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — lighter in sidebar mode so content stays interactive */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isSidebar ? 0.12 : 0.3 }}
            exit={{ opacity: 0 }}
            onClick={closeOverlay}
            className="fixed inset-0 bg-black z-40"
            style={{ pointerEvents: isSidebar ? 'none' : 'auto' }}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: isSidebar ? '-100%' : '100%' }}
            animate={{ x: 0 }}
            exit={{ x: isSidebar ? '-100%' : '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              [isSidebar ? 'left' : 'right']: 0,
              width: isSidebar ? 'min(480px, 40vw)' : 'min(520px, 85vw)',
              backgroundColor: 'var(--color-background)',
              borderRight: isSidebar ? '1px solid var(--color-border-subtle)' : undefined,
              borderLeft: isSidebar ? undefined : '1px solid var(--color-border-subtle)',
              boxShadow: isSidebar ? '4px 0 24px rgba(0,0,0,0.12)' : '-4px 0 24px rgba(0,0,0,0.15)',
            }}
          >
            {/* Close bar */}
            <div
              className="flex items-center justify-between px-4 h-12 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Settings
              </span>
              <button
                onClick={closeOverlay}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <X size={16} />
              </button>
            </div>
            {/* Settings content — Suspense fallback shown only on first open
                while the SettingsView chunk downloads (~one-time, <200 ms). */}
            <div className="flex-1 overflow-y-auto">
              <Suspense fallback={
                <div style={{
                  display: 'flex',
                  minHeight: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text-secondary)',
                  fontSize: 13,
                }}>
                  Loading settings…
                </div>
              }>
                <SettingsView />
              </Suspense>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
