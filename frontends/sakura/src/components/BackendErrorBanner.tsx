import { WifiOff, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../stores/appStore';

/**
 * Shown when `loadCharacters` exhausts its retries — typically because the
 * backend uvicorn is not running on :8080. Without this banner, an empty
 * sidebar looks identical to "all my data was deleted", which is what
 * happened to the user during session 19 after the SW cache fix landed.
 *
 * Purposely floats over the layout (position: fixed) so it never shifts the
 * content underneath. One-click retry re-runs the load with the same
 * backoff schedule.
 */
export function BackendErrorBanner() {
  const bootError = useAppStore((s) => s.bootError);
  const retryBoot = useAppStore((s) => s.retryBoot);
  const [retrying, setRetrying] = useState(false);

  const onRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await retryBoot();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <AnimatePresence>
      {bootError && (
        <motion.div
          key="backend-error-banner"
          role="alert"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.18 }}
          style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 14px',
            borderRadius: 999,
            background: 'var(--color-danger)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.25)',
            maxWidth: '90vw',
          }}
        >
          <WifiOff size={16} aria-hidden />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Backend unreachable — chats and characters can't load.
          </span>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.18)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid rgba(255, 255, 255, 0.3)',
              cursor: retrying ? 'wait' : 'pointer',
              opacity: retrying ? 0.7 : 1,
            }}
            aria-label="Retry loading characters"
          >
            <RefreshCw
              size={12}
              style={{
                animation: retrying ? 'spin 0.8s linear infinite' : undefined,
              }}
            />
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
