import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { PetSpeechBubble } from '../components/PetSpeechBubble';
import { getElectronAPI } from '../lib/electron';
import { useLive2D } from '../hooks/useLive2D';

// ── Idle Behavior Utilities ─────────────────────────────────────────────────

/** Time-of-day periods for idle behavior weighting. */
type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * Get the current time-of-day period.
 * Morning (6-12), Afternoon (12-18), Evening (18-22), Night (22-6).
 */
function getTimePeriod(): TimePeriod {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Weight multipliers per gesture per time-of-day.
 * Only gestures that deviate from 1.0 need entries.
 * Morning = energetic, evening = calm, night = sleepy.
 */
const TIME_MULTIPLIERS: Record<TimePeriod, Record<string, number>> = {
  morning: { wave: 2.0, nod: 1.5, celebrate: 1.5, dance: 1.3 },
  afternoon: {}, // baseline — all weights × 1.0
  evening: { think: 2.0, shy: 1.8, nod: 0.7, wave: 0.5, celebrate: 0.3, dance: 0.3 },
  night: { think: 1.5, shy: 1.5, nod: 0.5, wave: 0.2, celebrate: 0.1, dance: 0.1, clap: 0.2, point: 0.3 },
};

/** Global weight multiplier for nighttime — everything is slower and less frequent. */
const NIGHT_GLOBAL_MULTIPLIER = 0.5;

/**
 * Mood-based weight multipliers. Maps emotion strings (from chatStore.currentEmotion)
 * to per-gesture weight adjustments.
 */
const MOOD_MULTIPLIERS: Record<string, Record<string, number>> = {
  happy: { celebrate: 2.5, dance: 2.0, clap: 2.0, wave: 1.5, shy: 0.5 },
  excited: { celebrate: 3.0, dance: 2.5, clap: 2.5, wave: 2.0, foot_tap: 1.5 },
  sad: { shy: 2.0, think: 1.8, nod: 1.3, wave: 0.2, celebrate: 0, dance: 0, clap: 0 },
  worried: { think: 2.0, shy: 1.5, foot_tap: 1.5, celebrate: 0, dance: 0 },
  angry: { crossed_arms: 2.5, foot_tap: 2.0, shake: 1.8, wave: 0.3, celebrate: 0, dance: 0 },
  frustrated: { crossed_arms: 2.0, foot_tap: 1.8, shake: 1.5, celebrate: 0 },
  surprised: { wave: 1.5, point: 1.5, nod: 1.3 },
};

/** Random attention-seeking prompts shown when the user has been idle too long. */
const ATTENTION_PROMPTS = [
  'Hey, what are you up to?',
  "I'm bored... talk to me?",
  'Did you forget about me?',
  '*pokes*',
  "It's quiet here...",
  '*stretches* Still there?',
  'Want to chat for a bit?',
];

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
  const { messages, currentEmotion, sessionId } = useChatStore();

  const [showBubble, setShowBubble] = useState(false);
  const [latestMessage, setLatestMessage] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const dragRef = useRef<DragState>({ isDragging: false, startX: 0, startY: 0 });
  const lastTransparentRef = useRef(true);
  const lastInteractionRef = useRef(Date.now());
  const attentionCountRef = useRef(0);

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

  // ── Track user interaction for attention-seeking ──────────────────────────

  const resetInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
    attentionCountRef.current = 0;
  }, []);

  // Reset interaction timer on user activity
  useEffect(() => {
    const handler = () => { lastInteractionRef.current = Date.now(); };
    window.addEventListener('mousemove', handler);
    window.addEventListener('click', handler);
    return () => {
      window.removeEventListener('mousemove', handler);
      window.removeEventListener('click', handler);
    };
  }, []);

  // Reset on new messages (user is actively chatting)
  useEffect(() => { resetInteraction(); }, [messages.length, resetInteraction]);

  // ── Idle pet behaviors ─────────────────────────────────────────────────────
  //
  // A single timer picks a random gesture from a weighted pool every 45-120s.
  // Weights are modulated by time-of-day and current emotion for organic variety.
  // After 10min of no user interaction, attention-seeking bubbles may appear.

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    /** Base gesture pool — weights are multiplied by time + mood factors. */
    const BASE_GESTURES: { gesture: string; weight: number }[] = [
      // Subtle head/body (most frequent — gentle, non-distracting)
      { gesture: 'nod',         weight: 5 },
      { gesture: 'tilt',        weight: 5 },
      { gesture: 'shake',       weight: 3 },

      // Posture shifts (moderate — natural restlessness)
      { gesture: 'shrug',       weight: 3 },
      { gesture: 'crossed_arms', weight: 3 },
      { gesture: 'foot_tap',    weight: 3 },

      // Expressive (less frequent — feels intentional)
      { gesture: 'think',       weight: 2 },
      { gesture: 'shy',         weight: 2 },
      { gesture: 'bow',         weight: 1 },
      { gesture: 'point',       weight: 1 },

      // Big gestures (rare — special moments)
      { gesture: 'wave',        weight: 1 },
      { gesture: 'celebrate',   weight: 1 },
      { gesture: 'dance',       weight: 1 },
      { gesture: 'clap',        weight: 1 },
    ];

    /**
     * Apply time-of-day and mood multipliers to base weights.
     * Returns a new array with adjusted weights (never negative).
     */
    const getAdjustedGestures = (): { gesture: string; weight: number }[] => {
      const period = getTimePeriod();
      const isNight = period === 'night';
      const timeMults = TIME_MULTIPLIERS[period];
      const emotion = currentEmotion?.emotion || '';
      const moodMults = MOOD_MULTIPLIERS[emotion] || {};

      return BASE_GESTURES.map(({ gesture, weight }) => {
        let adjusted = weight;

        // Apply time-of-day multiplier
        if (timeMults[gesture] !== undefined) adjusted *= timeMults[gesture];
        if (isNight) adjusted *= NIGHT_GLOBAL_MULTIPLIER;

        // Stack mood multiplier
        if (moodMults[gesture] !== undefined) adjusted *= moodMults[gesture];

        return { gesture, weight: Math.max(0, adjusted) };
      }).filter(g => g.weight > 0);
    };

    /** Pick a random gesture from the adjusted weighted pool. */
    const pickGesture = (): string => {
      const gestures = getAdjustedGestures();
      const totalWeight = gestures.reduce((sum, g) => sum + g.weight, 0);
      if (totalWeight <= 0) return 'nod';

      let roll = Math.random() * totalWeight;
      for (const { gesture, weight } of gestures) {
        roll -= weight;
        if (roll <= 0) return gesture;
      }
      return 'nod';
    };

    /** Send a gesture to the VRM viewer iframe. */
    const sendGesture = (gesture: string) => {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: 'playGesture', gesture },
          '*'
        );
      }
    };

    /** Get the idle interval range based on time of day (ms). */
    const getIntervalRange = (): [number, number] => {
      if (getTimePeriod() === 'night') return [90_000, 180_000]; // 90s–180s at night
      return [45_000, 120_000]; // 45s–120s during day
    };

    /**
     * Check if the user has been idle long enough to trigger attention-seeking.
     * Returns true if we should show an attention bubble this cycle.
     */
    const shouldSeekAttention = (): boolean => {
      const idleMs = Date.now() - lastInteractionRef.current;
      const idleMinutes = idleMs / 60_000;

      // Only after 10 minutes of no interaction
      if (idleMinutes < 10) return false;

      // Cap at 3 attention attempts per idle period
      if (attentionCountRef.current >= 3) return false;

      // 30% chance each cycle
      return Math.random() < 0.3;
    };

    /** Schedule the next idle gesture at a random interval. */
    const scheduleNext = () => {
      const [min, max] = getIntervalRange();
      const delay = min + Math.random() * (max - min);

      timer = setTimeout(() => {
        // Check for attention-seeking before normal gesture
        if (shouldSeekAttention()) {
          attentionCountRef.current += 1;
          sendGesture('wave');
          const prompt = ATTENTION_PROMPTS[Math.floor(Math.random() * ATTENTION_PROMPTS.length)];
          setLatestMessage(prompt);
          setShowBubble(true);
          setTimeout(() => setShowBubble(false), 10_000);
        } else {
          sendGesture(pickGesture());
        }

        scheduleNext();
      }, delay);
    };

    // Initial delay before first gesture (15-40s after load)
    timer = setTimeout(() => {
      sendGesture(pickGesture());
      scheduleNext();
    }, 15_000 + Math.random() * 25_000);

    return () => clearTimeout(timer);
  }, [currentEmotion]);

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

      {/* ── Resize Grip ────────────────────────────────────────────────── */}
      {/* Visual affordance for window resizing — the window is already
          resizable via Electron, but users need a visual cue. The grip
          dots appear on hover in the bottom-right corner. */}
      <div
        style={{
          position: 'fixed',
          bottom: 4,
          right: 4,
          width: 16,
          height: 16,
          cursor: 'nwse-resize',
          opacity: 0,
          transition: 'opacity 0.2s',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          justifyContent: 'flex-end',
          alignContent: 'flex-end',
          pointerEvents: 'none', // Electron handles the actual resize natively
        }}
        className="pet-resize-grip"
      >
        {/* 3-dot diagonal pattern */}
        <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.6)' }} />
        <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.6)' }} />
        <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.6)' }} />
      </div>
      <style>{`
        div:hover > .pet-resize-grip { opacity: 1 !important; }
      `}</style>

      {/* ── Speech Bubble ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showBubble && (
          <PetSpeechBubble
            message={latestMessage}
            characterName={activeCharacter?.name || 'Character'}
            charId={charId}
            sessionId={sessionId}
            onDismiss={() => setShowBubble(false)}
            onOpenChat={() => electronAPI?.openMainWindow()}
            onQuickReply={(response) => {
              setLatestMessage(response);
              resetInteraction();
            }}
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
