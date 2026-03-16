import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { useViewerStore } from '../stores/viewerStore';

/**
 * Global keyboard shortcuts for Photo Mode, Gallery, and Quick Capture.
 *
 * Shortcuts:
 * - ``Ctrl+Shift+P`` / ``Cmd+Shift+P``: Toggle Photo Mode overlay
 * - ``Ctrl+Shift+G`` / ``Cmd+Shift+G``: Open Gallery overlay
 * - ``Ctrl+Shift+S`` / ``Cmd+Shift+S``: Quick capture (saves to gallery without entering Photo Mode)
 *
 * Quick capture dispatches a screenshot request to the viewer iframe
 * and saves the result to the gallery API with auto-detected metadata
 * (current character, emotion from the last assistant message).
 *
 * @example
 * ```tsx
 * // In App.tsx:
 * usePhotoHotkeys();
 * ```
 */
export function usePhotoHotkeys() {
  const pendingQuickCapture = useRef(false);

  useEffect(() => {
    /**
     * Handle keydown events for Photo Mode shortcuts.
     * Uses Ctrl (Windows/Linux) or Cmd (macOS) modifier detection.
     *
     * @param e - Keyboard event
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.shiftKey) return;

      const key = e.key.toLowerCase();

      // Ctrl+Shift+P — Toggle Photo Mode
      if (key === 'p') {
        e.preventDefault();
        const { activeOverlay, openOverlay, closeOverlay } = useAppStore.getState();
        if (activeOverlay === 'photomode') {
          closeOverlay();
        } else {
          openOverlay('photomode');
        }
        return;
      }

      // Ctrl+Shift+G — Open Gallery
      if (key === 'g') {
        e.preventDefault();
        const { openOverlay } = useAppStore.getState();
        openOverlay('gallery');
        return;
      }

      // Ctrl+Shift+S — Quick Capture
      if (key === 's') {
        e.preventDefault();
        if (pendingQuickCapture.current) return;
        pendingQuickCapture.current = true;

        const viewer = useViewerStore.getState();
        viewer.dispatchScreenshot({ quality: 2, transparent: false });
        return;
      }
    };

    /**
     * Handle screenshotReady messages for quick capture.
     * Saves the screenshot to the gallery and shows a shutter flash.
     *
     * @param e - MessageEvent from the viewer iframe
     */
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'screenshotReady' || !pendingQuickCapture.current) return;
      pendingQuickCapture.current = false;

      const { activeCharacter } = useAppStore.getState();

      // Save to gallery
      fetch('/api/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_url: e.data.dataUrl,
          character_id: activeCharacter?.id ?? null,
          character_name: activeCharacter?.name ?? null,
          quality: 2,
          transparent: false,
        }),
      }).catch(err => console.error('[QuickCapture] Gallery save failed:', err));

      // Visual feedback — brief white flash overlay
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;inset:0;background:white;opacity:0.7;z-index:9999;pointer-events:none;transition:opacity 0.2s';
      document.body.appendChild(flash);
      requestAnimationFrame(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 250);
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('message', handleMessage);
    };
  }, []);
}
