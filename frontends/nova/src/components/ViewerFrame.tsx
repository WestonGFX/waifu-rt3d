import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useViewerStore } from '../stores/viewerStore';

/**
 * Full-viewport 3D viewer iframe with loading overlay.
 *
 * Embeds the shared `viewer.html` (Three.js/VRM) as a transparent iframe
 * that sits behind all glass UI panels. Shows a centered loading indicator
 * until the iframe fires its `load` event.
 */
export function ViewerFrame() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const setIframeRef = useViewerStore((s) => s.setIframeRef);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setIframeRef(iframeRef.current);
    return () => setIframeRef(null);
  }, [setIframeRef]);

  return (
    <>
      <iframe
        ref={iframeRef}
        src="/shared/viewer/viewer.html"
        title="3D Character Viewer"
        onLoad={() => setLoaded(true)}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          zIndex: 0,
          background: 'transparent',
        }}
        allow="autoplay; microphone"
      />
      <AnimatePresence>
        {!loaded && (
          <motion.div
            key="viewer-loading"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{
              color: 'var(--nova-text-muted)',
              fontSize: 12,
              letterSpacing: '0.06em',
              padding: '6px 16px',
              borderRadius: 'var(--nova-radius-pill)',
              background: 'var(--nova-glass-bg)',
              border: '1px solid var(--nova-glass-border)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}>
              Loading 3D viewer...
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
