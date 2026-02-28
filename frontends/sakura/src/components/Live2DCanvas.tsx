import { useRef, useState, useEffect, useCallback } from 'react';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useLive2D } from '../hooks/useLive2D';

// ── Cubism Core lazy loader ──────────────────────────────────────────────────

let cubismCorePromise: Promise<void> | null = null;

/**
 * Dynamically load the Cubism Core WASM script on first use.
 *
 * Caches the promise so multiple callers share a single load. The script
 * must be available at /live2dcubismcore.min.js (served by the backend's
 * static mount or vite proxy).
 */
function loadCubismCore(): Promise<void> {
  if (cubismCorePromise) return cubismCorePromise;

  // Already loaded (e.g. via script tag in dev)
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

// ── Types ───────────────────────────────────────────────────────────────────────

interface Live2DCanvasProps {
  /** URL to the model3.json manifest (e.g. "/live2d/ariu/ariu.model3.json"). */
  modelUrl: string;
  /** Called when the model loads or fails, so the parent can show status overlays. */
  onLoadStateChange?: (state: 'loading' | 'loaded' | 'failed', reason?: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────────

/**
 * React wrapper around the useLive2D hook.
 *
 * Renders a container div that the PIXI canvas is mounted into. Uses a
 * ResizeObserver to track the container's dimensions and feed them to the
 * Live2D renderer for responsive scaling.
 *
 * Shows loading/error overlays internally, and optionally notifies the parent
 * of load state changes via the `onLoadStateChange` callback.
 *
 * @example
 * <Live2DCanvas
 *   modelUrl="/live2d/ariu/ariu.model3.json"
 *   onLoadStateChange={(s) => console.log('Live2D state:', s)}
 * />
 */
export function Live2DCanvas({ modelUrl, onLoadStateChange }: Live2DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
  const [failReason, setFailReason] = useState('');

  // ── ResizeObserver ──────────────────────────────────────────────────────────

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
    // Capture initial dimensions
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height });
    }

    return () => ro.disconnect();
  }, []);

  // ── Live2D hook ─────────────────────────────────────────────────────────────

  const { loadModel } = useLive2D({
    container: containerRef.current,
    width: dimensions.width,
    height: dimensions.height,
  });

  // ── Load model when URL or dimensions change ───────────────────────────────

  const hasLoaded = useRef<string | null>(null);
  const hasValidDimensions = dimensions.width > 0 && dimensions.height > 0;

  useEffect(() => {
    if (!modelUrl || !hasValidDimensions) return;
    // Skip if we already loaded this exact model
    if (hasLoaded.current === modelUrl) return;

    setLoadState('loading');
    setFailReason('');
    onLoadStateChange?.('loading');

    // Ensure Cubism Core WASM is loaded before attempting model parse
    loadCubismCore()
      .then(() => loadModel(modelUrl))
      .then((ok) => {
        if (ok) {
          hasLoaded.current = modelUrl;
          setLoadState('loaded');
          onLoadStateChange?.('loaded');
        } else {
          setLoadState('failed');
          setFailReason('Model file could not be parsed');
          onLoadStateChange?.('failed', 'Model file could not be parsed');
        }
      })
      .catch((err) => {
        setLoadState('failed');
        setFailReason(err.message || 'Cubism Core failed to load');
        onLoadStateChange?.('failed', err.message);
      });
  }, [modelUrl, hasValidDimensions, loadModel, onLoadStateChange]);

  // ── Retry ───────────────────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    hasLoaded.current = null;
    setLoadState('loading');
    setFailReason('');
    onLoadStateChange?.('loading');

    loadCubismCore()
      .then(() => loadModel(modelUrl))
      .then((ok) => {
        if (ok) {
          hasLoaded.current = modelUrl;
          setLoadState('loaded');
          onLoadStateChange?.('loaded');
        } else {
          setLoadState('failed');
          setFailReason('Retry failed — check console for details');
          onLoadStateChange?.('failed', 'Retry failed');
        }
      })
      .catch((err) => {
        setLoadState('failed');
        setFailReason(err.message || 'Cubism Core failed to load');
        onLoadStateChange?.('failed', err.message);
      });
  }, [modelUrl, loadModel, onLoadStateChange]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Loading overlay */}
      {loadState === 'loading' && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ backgroundColor: 'var(--color-background)', opacity: 0.9, zIndex: 5 }}
        >
          <div className="text-center">
            <Loader2
              size={28}
              className="animate-spin"
              style={{ color: 'var(--color-accent)', margin: '0 auto 8px' }}
            />
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Loading Live2D model...
            </p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {loadState === 'failed' && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-background)', zIndex: 5 }}
        >
          <div className="text-center px-6">
            <AlertTriangle
              size={28}
              style={{ color: 'var(--color-danger, #f55)', margin: '0 auto 10px' }}
            />
            <p
              className="text-sm font-medium mb-1"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Failed to load Live2D model
            </p>
            {failReason && (
              <p
                className="text-[10px] mb-3 font-mono"
                style={{ color: 'var(--color-text-tertiary)', wordBreak: 'break-all' }}
              >
                {failReason}
              </p>
            )}
            <button
              onClick={handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg mx-auto"
              style={{
                backgroundColor: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
                border: '1px solid var(--color-accent)',
              }}
            >
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
