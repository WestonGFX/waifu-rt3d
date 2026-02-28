import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { PetSpeechBubble } from '../components/PetSpeechBubble';
import { getElectronAPI } from '../lib/electron';
import { useLive2D } from '../hooks/useLive2D';

// ── Types ───────────────────────────────────────────────────────────────────────

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
}

// ── Component ───────────────────────────────────────────────────────────────────

/**
 * Minimal transparent overlay view for the Desktop Pet window.
 *
 * Renders only the VRM character (via iframe with ?pet=1) or Live2D canvas
 * on a fully transparent background. Handles:
 *   - Click-through hit testing (transparent pixels pass to apps below)
 *   - Drag-to-move (dragging on the character body moves the Electron window)
 *   - Speech bubble interaction (click on character → action menu)
 *   - CSS drop-shadow so the character is visible on light backgrounds
 *
 * This view is loaded by the Electron pet window at the /pet route.
 * It has NO sidebar, NO chat thread, NO settings — just the character.
 */
export function PetView() {
  const { activeCharacter } = useAppStore();
  const { messages } = useChatStore();

  const [showBubble, setShowBubble] = useState(false);
  const [latestMessage, setLatestMessage] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const dragRef = useRef<DragState>({ isDragging: false, startX: 0, startY: 0 });
  const lastTransparentRef = useRef(true);

  const electronAPI = getElectronAPI();

  // ── Track latest AI message for speech bubble ─────────────────────────────

  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant' && last.text) {
      setLatestMessage(last.text);
      setShowBubble(true);
      // Auto-hide after 8 seconds
      const timer = setTimeout(() => setShowBubble(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  // ── Click-through hit testing ─────────────────────────────────────────────

  /**
   * Continuously check if the cursor is over a transparent or opaque pixel.
   * Uses WebGL readPixels on the Three.js canvas to get the alpha value.
   * When transparent → pass clicks through to the app below.
   * When opaque (character) → capture clicks for interaction.
   */
  useEffect(() => {
    if (!electronAPI) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Don't do hit-testing while dragging
      if (dragRef.current.isDragging) return;

      // Try to get the WebGL canvas from the iframe
      const iframe = iframeRef.current;
      let isTransparent = true;

      if (iframe?.contentDocument) {
        const canvas = iframe.contentDocument.querySelector('canvas') as HTMLCanvasElement | null;
        if (canvas) {
          try {
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (gl) {
              const pixel = new Uint8Array(4);
              const rect = canvas.getBoundingClientRect();
              // Account for iframe offset and device pixel ratio
              const x = (e.clientX - rect.left) * (canvas.width / rect.width);
              const y = (canvas.height - (e.clientY - rect.top) * (canvas.height / rect.height));
              gl.readPixels(Math.floor(x), Math.floor(y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
              isTransparent = pixel[3] < 15; // Small threshold for antialiased edges
            }
          } catch {
            // Cross-origin or GL context lost — default to transparent
          }
        }
      }

      // Only send IPC when state changes (avoid flooding)
      if (isTransparent !== lastTransparentRef.current) {
        lastTransparentRef.current = isTransparent;
        electronAPI.setClickThrough(isTransparent);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [electronAPI]);

  // ── Drag-to-move ──────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start drag on the character (non-transparent area)
    if (lastTransparentRef.current) return;
    dragRef.current = { isDragging: true, startX: e.screenX, startY: e.screenY };
  }, []);

  useEffect(() => {
    if (!electronAPI) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging) return;
      const dx = e.screenX - dragRef.current.startX;
      const dy = e.screenY - dragRef.current.startY;
      dragRef.current.startX = e.screenX;
      dragRef.current.startY = e.screenY;
      electronAPI.movePetWindow(dx, dy);
    };

    const handleMouseUp = () => {
      dragRef.current.isDragging = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [electronAPI]);

  // ── Click on character → toggle speech bubble ─────────────────────────────

  const handleClick = useCallback(() => {
    if (lastTransparentRef.current) return; // Only on character
    setShowBubble((prev) => !prev);
  }, []);

  // ── Right-click → native context menu ─────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (lastTransparentRef.current) return; // Only on character, not transparent area
    electronAPI?.showPetContextMenu({
      characterName: activeCharacter?.name || 'Character',
      isMuted: false, // TODO: read from store when mute state is lifted to React
    });
  }, [electronAPI, activeCharacter?.name]);

  // ── Idle pet behaviors ─────────────────────────────────────────────────────
  //
  // Gives the pet a sense of life through randomized idle gestures.
  // Timers fire at random intervals within a range so the pet doesn't
  // feel robotic. Gestures are sent via postMessage to the VRM iframe
  // or dispatched through the viewerStore for Live2D.

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    /**
     * Send a gesture to the VRM viewer iframe.
     * Falls back silently if the iframe isn't ready.
     */
    const sendGesture = (gesture: string) => {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: 'playGesture', gesture },
          '*'
        );
      }
    };

    /**
     * Schedule a random gesture within a time range.
     * After firing, reschedules itself for continuous idle behavior.
     */
    const scheduleIdleGesture = (
      gesture: string,
      minMs: number,
      maxMs: number,
    ) => {
      const delay = minMs + Math.random() * (maxMs - minMs);
      const timer = setTimeout(() => {
        sendGesture(gesture);
        scheduleIdleGesture(gesture, minMs, maxMs);
      }, delay);
      timers.push(timer);
    };

    // ── Behavior schedule ──
    // Each behavior has a random interval range (min, max) in milliseconds.
    // The randomization prevents the pet from feeling mechanical.

    // Gentle nod every 30-90 seconds (subtle acknowledgment)
    scheduleIdleGesture('nod', 30_000, 90_000);

    // Head tilt every 60-180 seconds (curious look)
    scheduleIdleGesture('tilt', 60_000, 180_000);

    // Wave at the user every 3-8 minutes (friendly check-in)
    scheduleIdleGesture('wave', 180_000, 480_000);

    // Think pose every 2-5 minutes (contemplative)
    scheduleIdleGesture('think', 120_000, 300_000);

    // Shy pose every 5-12 minutes (variety)
    scheduleIdleGesture('shy', 300_000, 720_000);

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  // ── Determine viewer mode ─────────────────────────────────────────────────

  const isLive2D = !!(activeCharacter as any)?.live2d_model;
  const charId = activeCharacter?.id;

  // ── Build viewer URL with petMode params ──────────────────────────────────

  const viewerUrl = charId
    ? `/frontends/shared/viewer/viewer.html?char=${charId}&pet=1&noChatOverlay=1`
    : null;

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: 'transparent',
        overflow: 'hidden',
        cursor: dragRef.current.isDragging ? 'grabbing' : 'default',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {/* ── Character Renderer ────────────────────────────────────────── */}
      {!isLive2D && viewerUrl && (
        <iframe
          ref={iframeRef}
          src={viewerUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: 'transparent',
            // CSS drop-shadow respects transparency — only the character
            // gets the shadow, making it visible on light backgrounds
            filter: 'drop-shadow(0px 8px 16px rgba(0,0,0,0.35))',
          }}
          // Allow same-origin access for hit-testing WebGL pixel reads
          sandbox="allow-scripts allow-same-origin"
        />
      )}

      {isLive2D && (
        <Live2DPetCanvas charId={charId!} />
      )}

      {/* ── Speech Bubble ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showBubble && (
          <PetSpeechBubble
            message={latestMessage}
            characterName={activeCharacter?.name || 'Character'}
            onDismiss={() => setShowBubble(false)}
            onOpenChat={() => electronAPI?.openMainWindow()}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Cubism Core lazy loader (shared with Live2DCanvas.tsx) ────────────────────

let cubismCorePromise: Promise<void> | null = null;

/**
 * Dynamically load the Cubism Core WASM script on first use.
 * Caches the promise so multiple callers share a single load.
 */
function loadCubismCore(): Promise<void> {
  if (cubismCorePromise) return cubismCorePromise;
  if ((window as any).Live2DCubismCore) {
    cubismCorePromise = Promise.resolve();
    return cubismCorePromise;
  }
  cubismCorePromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/live2dcubismcore.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Cubism Core WASM'));
    document.head.appendChild(script);
  });
  return cubismCorePromise;
}

// ── Live2D Pet Canvas (inline sub-component) ────────────────────────────────

/**
 * Minimal Live2D renderer for pet mode.
 *
 * Uses the same useLive2D hook as the main app's Live2DCanvas, but without
 * loading/error overlays — the pet window is a transparent overlay where
 * UI chrome would be distracting. The PIXI app renders with backgroundAlpha: 0.
 */
function Live2DPetCanvas({ charId }: { charId: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const hasLoaded = useRef<string | null>(null);

  // Get the character's live2d_model URL from the store
  const { activeCharacter } = useAppStore();
  const modelUrl = (activeCharacter as any)?.live2d_model || '';

  // ── ResizeObserver for responsive canvas sizing ─────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    ro.observe(el);
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height });
    }

    return () => ro.disconnect();
  }, []);

  // ── Live2D hook (PIXI with transparent background) ─────────────────────

  const { loadModel } = useLive2D({
    container: containerRef.current,
    width: dimensions.width,
    height: dimensions.height,
  });

  // ── Load model when URL and dimensions are ready ───────────────────────

  const hasValidDimensions = dimensions.width > 0 && dimensions.height > 0;

  useEffect(() => {
    if (!modelUrl || !hasValidDimensions) return;
    if (hasLoaded.current === modelUrl) return;

    loadCubismCore()
      .then(() => loadModel(modelUrl))
      .then((ok) => {
        if (ok) hasLoaded.current = modelUrl;
      })
      .catch((err) => {
        console.error('[PetView] Live2D load failed:', err);
      });
  }, [modelUrl, hasValidDimensions, loadModel]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: 'transparent',
        filter: 'drop-shadow(0px 8px 16px rgba(0,0,0,0.35))',
      }}
    />
  );
}
