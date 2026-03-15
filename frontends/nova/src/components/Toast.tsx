/**
 * Toast notification system for the Nova frontend.
 *
 * Renders glass-styled notifications at the bottom-right of the viewport.
 * Toasts slide in from the right via Framer Motion and auto-dismiss after
 * 3 seconds. A maximum of 3 toasts are visible at once (oldest evicted first).
 *
 * @example
 * // Trigger a toast from anywhere:
 * import { useNovaStore } from '../stores/novaStore';
 * useNovaStore.getState().addToast('Settings saved', 'success');
 *
 * // Mount the container once in App.tsx:
 * <ToastContainer />
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useNovaStore } from '../stores/novaStore';
import styles from './Toast.module.css';

/** Visual type of a toast notification. */
type ToastType = 'success' | 'error' | 'info';

/** Map toast type to the corresponding CSS module class for the status dot. */
const dotClass: Record<ToastType, string> = {
  success: styles.dotSuccess,
  error: styles.dotError,
  info: styles.dotInfo,
};

/**
 * Renders all active toast notifications.
 *
 * Reads from `useNovaStore` and renders each toast with a slide-in/out
 * animation. Should be mounted once at the root level (e.g. in App.tsx).
 */
export function ToastContainer() {
  const toasts = useNovaStore((s) => s.toasts);
  const removeToast = useNovaStore((s) => s.removeToast);

  return (
    <div className={styles.container} aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className={styles.toast}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            role="status"
          >
            <span className={dotClass[toast.type]} />
            <span className={styles.message}>{toast.message}</span>
            <button
              className={styles.dismiss}
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
            >
              &times;
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
