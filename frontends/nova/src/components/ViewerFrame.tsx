import { useEffect, useRef } from 'react';
import { useViewerStore } from '../stores/viewerStore';

/**
 * Full-viewport 3D viewer iframe.
 *
 * Embeds the shared `viewer.html` (Three.js/VRM) as a transparent iframe
 * that sits behind all glass UI panels. In Companion mode this fills the
 * entire viewport; in Focused mode it shrinks to a side panel.
 *
 * The iframe communicates with React via `postMessage`, brokered by
 * `viewerStore.ts` (copied from Sakura — a pure dispatcher with no
 * framework-specific dependencies).
 */
export function ViewerFrame() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const setIframeRef = useViewerStore((s) => s.setIframeRef);

  useEffect(() => {
    setIframeRef(iframeRef.current);
    return () => setIframeRef(null);
  }, [setIframeRef]);

  return (
    <iframe
      ref={iframeRef}
      src="/shared/viewer/viewer.html"
      title="3D Character Viewer"
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
  );
}
