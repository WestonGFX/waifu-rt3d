import { Component, useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Sliders, RotateCcw, Loader2, AlertTriangle, Box, RefreshCw, Sparkles, Wifi, WifiOff, X, Camera, Settings2, ChevronDown } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { useViewerStore } from '../stores/viewerStore';
import { api } from '../lib/api';
import type { Character } from '../lib/types';
import { SpringBonePanel } from './SpringBonePanel';
import { EffectsPanel } from './EffectsPanel';
import { AnimationBrowser } from './AnimationBrowser';
import { FloatingComposer } from './FloatingComposer';

/**
 * Error boundary for Live2D canvas — catches Cubism SDK import errors
 * (thrown at module load time by pixi-live2d-display) and renders a
 * friendly fallback instead of crashing the entire React tree.
 */
class Live2DErrorBoundary extends Component<
  { children: React.ReactNode; onError?: (msg: string) => void },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: Error) {
    return { error: err.message || 'Live2D failed to load' };
  }

  componentDidCatch(err: Error) {
    console.warn('[ModelPanel] Live2D load error caught:', err.message);
    this.props.onError?.(err.message);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', width: '100%', height: '100%', gap: 8,
          color: 'var(--color-text-tertiary)', fontSize: '0.78rem', padding: 20,
          textAlign: 'center',
        }}>
          <AlertTriangle size={28} style={{ color: 'var(--color-warning)', opacity: 0.7 }} />
          <span style={{ fontWeight: 600 }}>Live2D Unavailable</span>
          <span style={{ fontSize: '0.68rem' }}>
            Cubism SDK not loaded. The Live2D viewer requires the Cubism runtime.
            <br />Use a VRM/GLB model instead, or install the Cubism SDK.
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Lazy-load Live2DCanvas to avoid importing pixi-live2d-display eagerly.
 * The pixi-live2d-display module throws at import time if the Cubism SDK
 * WASM is not loaded, which would crash the entire app for VRM-only users.
 */
const Live2DCanvas = lazy(() => import('./Live2DCanvas').then(m => ({ default: m.Live2DCanvas })));

interface ModelPanelProps {
  character: Character;
}

/**
 * Resolve the 3D model URL for a character.
 *
 * Priority chain:
 *   1. Explicit model_vrm field
 *   2. Explicit vrm_model_url field
 *   3. Explicit glb_model_url field
 *   4. Auto-detect by name against all available 3D models (VRM + GLB)
 *
 * Auto-detection matches character name (or parenthetical alias) against
 * available filenames from the scan endpoint.
 */
function resolveModelUrl(
  character: Character,
  availableModels: Array<{ name: string; url: string }>
): string | null {
  // Explicit assignment (VRM takes priority, then GLB)
  if (character.model_vrm) return character.model_vrm;
  if (character.vrm_model_url) return character.vrm_model_url;
  if (character.glb_model_url) return character.glb_model_url;

  // Auto-detect by name: check parenthetical alias first, e.g. "Rin (Akane)" → "Akane"
  const parenMatch = character.name?.match(/\(([^)]+)\)/);
  const names = [
    parenMatch?.[1]?.trim(),
    character.name?.split(/\s/)[0],
    character.name,
  ].filter(Boolean).map(n => n!.toLowerCase());

  for (const model of availableModels) {
    if (names.includes(model.name.toLowerCase())) {
      return model.url;
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   Expression Editor Overlay
   ═══════════════════════════════════════════════════════════════════════ */

/** Presets are stored in localStorage keyed by this constant. */
const PRESETS_KEY = 'waifu-expression-presets';

interface ExpressionEditorProps {
  shapes: string[];
  values: Record<string, number>;
  onChange: (name: string, value: number) => void;
  onResetAll: () => void;
}

function ExpressionEditor({ shapes, values, onChange, onResetAll }: ExpressionEditorProps) {
  const [presets, setPresets] = useState<Record<string, Record<string, number>>>(() => {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}'); }
    catch { return {}; }
  });
  const [selectedPreset, setSelectedPreset] = useState('');

  function savePreset() {
    const name = prompt('Preset name:');
    if (!name?.trim()) return;
    const nonZero = Object.fromEntries(Object.entries(values).filter(([, v]) => v > 0));
    if (!Object.keys(nonZero).length) return;
    const next = { ...presets, [name.trim()]: nonZero };
    setPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  }

  function loadPreset() {
    if (!selectedPreset || !presets[selectedPreset]) return;
    const preset = presets[selectedPreset];
    // Apply only known shapes
    shapes.forEach(name => onChange(name, preset[name] ?? 0));
  }

  function deletePreset() {
    if (!selectedPreset) return;
    const next = { ...presets };
    delete next[selectedPreset];
    setPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    setSelectedPreset('');
  }

  if (!shapes.length) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
        No blend shapes available.<br />Load a VRM model first.
      </div>
    );
  }

  const selectStyle: React.CSSProperties = {
    padding: '3px 6px',
    fontSize: '0.72rem',
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
  };

  const btnStyle: React.CSSProperties = {
    padding: '3px 8px',
    fontSize: '0.7rem',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
  };

  return (
    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px', height: '100%', overflow: 'hidden' }}>
      {/* Preset controls */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
        <select
          style={{ ...selectStyle, flex: 1 }}
          value={selectedPreset}
          onChange={e => setSelectedPreset(e.target.value)}
        >
          <option value="">-- Preset --</option>
          {Object.keys(presets).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button style={btnStyle} onClick={loadPreset}>Load</button>
        <button style={{ ...btnStyle, color: 'var(--color-accent)' }} onClick={savePreset}>Save</button>
        <button style={{ ...btnStyle, color: 'var(--color-danger, #f44)' }} onClick={deletePreset}>Del</button>
        <button style={{ ...btnStyle, display: 'flex', alignItems: 'center', gap: '3px' }} onClick={onResetAll}>
          <RotateCcw size={10} /> Reset
        </button>
      </div>

      {/* Sliders */}
      <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {shapes.map(name => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label
              style={{
                flex: '0 0 110px', fontSize: '0.68rem',
                color: 'var(--color-text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono, monospace)',
              }}
              title={name}
            >
              {name}
            </label>
            <input
              type="range" min="0" max="1" step="0.01"
              value={values[name] ?? 0}
              onChange={e => onChange(name, parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--color-accent)', height: '14px' }}
            />
            <span style={{ minWidth: '2.2rem', fontSize: '0.68rem', textAlign: 'right', color: 'var(--color-text-muted)' }}>
              {(values[name] ?? 0).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Panel
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Slide-out right panel containing the 3D viewer iframe.
 * Includes an integrated Expression Editor that lets users adjust VRM
 * blend shapes in real-time with preset save/load support.
 *
 * Uses Framer Motion for smooth width animation on open/close.
 * Auto-resolves VRM model by character name if not explicitly set.
 */
export function ModelPanel({ character }: ModelPanelProps) {
  const { modelPanelOpen, toggleModelPanel, setVrmStats, setViewportFps, cinematicMode, openOverlay } = useAppStore();
  const viewer = useViewerStore();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  /** Current emotion from chatStore — drives the emotion badge in the viewport overlay. */
  const currentEmotion = useChatStore(s => s.currentEmotion);
  /** C2: Tool protocol detected for the active LLM model (openai_functions / xml_fallback / none). */
  const [toolProtocol, setToolProtocol] = useState<string | null>(null);

  useEffect(() => {
    api.getActiveModelCapabilities().then(caps => {
      setToolProtocol(caps.tool_protocol ?? null);
    }).catch(() => {});
  }, [character?.id]);

  const [vrmModels, setVrmModels] = useState<Array<{ name: string; url: string }>>([]);

  // Expression editor state
  const [showExprEditor, setShowExprEditor] = useState(false);
  const [blendShapes, setBlendShapes_] = useState<string[]>([]);
  const [blendValues, setBlendValues] = useState<Record<string, number>>({});

  /**
   * VRM load state — tracks whether the model is loading, loaded, or failed.
   * The viewer posts modelLoaded / modelFailed messages to window.
   */
  const [vrmLoadState, setVrmLoadState] = useState<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
  const [vrmFailReason, setVrmFailReason] = useState<string>('');

  /** Whether the camera preset strip is expanded (click-to-open via 📷 button). */
  const [cameraBarOpen, setCameraBarOpen] = useState(false);
  /** Whether the advanced panels slide-up (EffectsPanel + AnimationBrowser) is open. */
  const [advancedOpen, setAdvancedOpen] = useState(false);

  /** Floating chat composer visibility — allows chatting while viewing the 3D model. */
  const [showFloatingComposer, setShowFloatingComposer] = useState(false);

  /** Currently active camera preset for the accent underline indicator. */
  const [activePreset, setActivePreset] = useState<string | null>('fullbody');

  /** Custom camera saves stored in localStorage (max 5). */
  const [customCameras, setCustomCameras] = useState<Array<{ name: string; position: number[]; target: number[]; radius: number }>>(() => {
    try {
      return JSON.parse(localStorage.getItem('waifu-camera-presets') || '[]');
    } catch { return []; }
  });

  /** AI motion backend: 'procedural' | 'motion_diffuse' | null (unknown) */
  const [motionBackend, setMotionBackend] = useState<string | null>(null);
  /** Track the last emotion we generated motion for to avoid duplicate calls. */
  const lastMotionEmotion = useRef<string | null>(null);

  /** Remote GPU wizard state */
  type WizardState = 'idle' | 'scanning' | 'found' | 'not_found' | 'connecting' | 'connected' | 'error';
  const [wizardState, setWizardState] = useState<WizardState>('idle');
  const [wizardServers, setWizardServers] = useState<Array<{ url: string; ip: string }>>([]);
  const [wizardError, setWizardError] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [showWizard, setShowWizard] = useState(false);

  /** Live 3D viewport FPS — posted by viewer.html every second. Used for the in-panel overlay. */
  const [viewportFpsLocal, setViewportFpsLocal] = useState<number | null>(null);

  /** GLB morph targets — populated when a GLB model is loaded. */
  const [glbMorphTargets, setGlbMorphTargets] = useState<Array<{ meshName: string; targetName: string; index: number; value: number }>>([]);
  const [glbMorphValues, setGlbMorphValues] = useState<Record<string, number>>({});

  const screenshotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Callback ref for the VRM iframe — syncs to viewerStore on mount/unmount. */
  const setIframeEl = useCallback((el: HTMLIFrameElement | null) => {
    iframeRef.current = el;
    useViewerStore.getState().setIframeRef(el);
  }, []);

  // Fetch available 3D models (VRM + GLB) + motion model status once
  useEffect(() => {
    api.scan3dModels().then(models => {
      setVrmModels(models.map(m => ({ name: m.name, url: m.url })));
    }).catch(() => {
      // Fallback to VRM-only scan for older backends
      api.scanVrm().then(models => {
        setVrmModels(models.map(m => ({ name: m.name, url: m.url })));
      }).catch(() => {});
    });
    api.getMotionModelStatus().then(s => setMotionBackend(s.active_backend)).catch(() => {});
  }, []);

  const vrmUrl = resolveModelUrl(character, vrmModels);

  /** Whether this character uses a Live2D model (takes priority over VRM). */
  const isLive2D = Boolean(character.live2d_model);
  /** Whether this character uses a Unity WebGL scene (highest priority). */
  const isUnity = character.model_type === 'unity' || Boolean(character.unity_scene_url);

  // Sync viewer mode when the character's model type changes
  useEffect(() => {
    const mode = isUnity ? 'unity' : isLive2D ? 'live2d' : 'vrm';
    useViewerStore.getState().setMode(mode);
  }, [isLive2D, isUnity]);

  // Listen for modelLoaded / modelFailed messages from the viewer iframe
  useEffect(() => {
    /**
     * Handle postMessages from the shared 3D viewer.
     * The viewer emits modelLoaded on success and modelFailed with a reason on error.
     *
     * @param {MessageEvent} e - Browser message event from the iframe.
     */
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'modelLoaded') {
        setVrmLoadState('loaded');
        // Write geometry stats to app store so SettingsView can display them
        if (e.data.stats) setVrmStats(e.data.stats);
        // B.1: Auto-request morph targets for GLB models
        if (e.data.stats?.vrmVersion === 'glb') {
          setTimeout(() => useViewerStore.getState().dispatchGetGlbMorphTargets(), 200);
        } else {
          setGlbMorphTargets([]);
          setGlbMorphValues({});
        }
        // Auto-generate a neutral idle motion clip when the model first loads
        api.generateMotion({ emotion: 'neutral', duration: 4, loop: true })
          .then(data => {
            useViewerStore.getState().dispatchKeyframes(data);
            lastMotionEmotion.current = 'neutral';
          })
          .catch(() => {});
      } else if (e.data?.type === 'modelFailed') {
        setVrmLoadState('failed');
        setVrmFailReason(String(e.data?.reason ?? 'Unknown error'));
      } else if (e.data?.type === 'vrmSpringBonesReady') {
        // Auto-apply the character's saved spring bone preset (if any)
        if (e.data.jointCount > 0 && character?.id) {
          api.getSpringBonePreset(character.id)
            .then(({ preset }) => {
              if (!preset?.joints?.length) return;
              const vs = useViewerStore.getState();
              for (const j of preset.joints) {
                vs.dispatchSetSpringBoneParams(j.index, {
                  stiffness: j.stiffness,
                  drag: j.dragForce,
                  gravityPower: j.gravityPower,
                });
              }
              if (preset.wind) {
                vs.dispatchWind(preset.wind.x, preset.wind.y, preset.wind.z, preset.wind.strength);
              }
            })
            .catch(() => {}); // silently ignore — no preset is the expected initial state
        }
      } else if (e.data?.type === 'emotionChanged') {
        // Viewer can emit this to trigger a fresh motion clip when emotion shifts
        const emo: string = e.data?.emotion || 'neutral';
        if (emo !== lastMotionEmotion.current) {
          api.generateMotion({ emotion: emo, duration: 3.5, loop: true })
            .then(data => {
              useViewerStore.getState().dispatchKeyframes(data);
              lastMotionEmotion.current = emo;
            })
            .catch(() => {});
        }
        // Modulate spring bone physics to reflect the emotion (Phase 5)
        if (useViewerStore.getState().mode === 'vrm') {
          useViewerStore.getState().iframeRef?.contentWindow?.postMessage(
            { type: 'setSpringBoneEmotion', payload: { emotion: emo } },
            window.location.origin,
          );
        }
      } else if (e.data?.type === 'glbMorphTargetList') {
        // B.1: Populate GLB morph target sliders
        const targets = e.data.targets || [];
        setGlbMorphTargets(targets);
        const vals: Record<string, number> = {};
        for (const t of targets) {
          vals[`${t.meshName}:${t.index}`] = t.value;
        }
        setGlbMorphValues(vals);
      } else if (e.data?.type === 'fpsUpdate') {
        const fps = e.data.fps as number;
        setViewportFpsLocal(fps);  // drives the in-panel FPS overlay
        setViewportFps(fps);       // mirrors to store for SettingsView
      } else if (e.data?.type === 'screenshotReady') {
        // Thumbnail captures are handled by ModelBrowser — skip download.
        if ((e.data.requestId as string | undefined)?.startsWith('thumbnail_')) return;
        if (screenshotTimeoutRef.current) {
          clearTimeout(screenshotTimeoutRef.current);
          screenshotTimeoutRef.current = null;
        }
        const a = document.createElement('a');
        a.href = e.data.dataUrl as string;
        a.download = `${character.name.toLowerCase().replace(/\s+/g, '-')}-screenshot.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [character]);

  useEffect(() => {
    if (modelPanelOpen && vrmUrl) {
      // Reset load state and clear stale geometry stats each time we load a model
      setVrmLoadState('loading');
      setVrmFailReason('');
      setVrmStats(null);
      // Allow 800ms for the iframe to initialise before sending the load command
      const timer = setTimeout(() => {
        // Queue greeting gesture before model load (entrance animator will play it after slide-in)
        if (character.greeting_animation) {
          useViewerStore.getState().dispatchQueueGreetingGesture(character.greeting_animation);
        }
        useViewerStore.getState().dispatchLoadModel(vrmUrl);
        useViewerStore.getState().dispatchCameraPreset('bust');
      }, 800);
      return () => clearTimeout(timer);
    } else if (!vrmUrl) {
      setVrmLoadState('idle');
    }
  }, [modelPanelOpen, vrmUrl]);

  /**
   * Retry loading the VRM model after a failure.
   * Resets load state and re-sends the loadCharacter message.
   */
  const handleRetry = () => {
    if (!vrmUrl) return;
    setVrmLoadState('loading');
    setVrmFailReason('');
    setTimeout(() => {
      useViewerStore.getState().dispatchLoadModel(vrmUrl);
      useViewerStore.getState().dispatchCameraPreset('bust');
    }, 400);
  };

  // Screenshot available in Photo Mode overlay (openOverlay('photomode')).

  // Load blend shapes when expression editor opens
  const handleOpenExprEditor = useCallback(async () => {
    setShowExprEditor(true);
    // Request blend shapes from the viewer via postMessage; response comes
    // via the window 'message' listener (blendShapeList event).
    const shapes = await new Promise<string[]>((resolve) => {
      const timeoutId = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve([]);
      }, 2000);
      function handler(event: MessageEvent) {
        if (event.data?.type === 'blendShapeList') {
          clearTimeout(timeoutId);
          window.removeEventListener('message', handler);
          resolve(event.data.shapes || []);
        }
      }
      window.addEventListener('message', handler);
      useViewerStore.getState().dispatchGetBlendShapes();
    });
    setBlendShapes_(shapes);
    setBlendValues(Object.fromEntries(shapes.map(s => [s, 0])));
  }, []);

  function handleBlendChange(name: string, value: number) {
    setBlendValues(prev => ({ ...prev, [name]: value }));
    viewer.dispatchBlendShape(name, value);
  }

  function handleResetAll() {
    const zeros = Object.fromEntries(blendShapes.map(s => [s, 0]));
    setBlendValues(zeros);
    viewer.dispatchBlendShapes(zeros);
  }

  /**
   * Kick off the remote GPU wizard: call /api/motion/discover (blocks ~8s on server),
   * then update wizard state with whatever servers were found.
   */
  async function handleScanForGpu() {
    setShowWizard(true);
    setWizardState('scanning');
    setWizardServers([]);
    setWizardError('');
    try {
      const result = await api.discoverMotion();
      if (result.servers.length > 0) {
        setWizardServers(result.servers.map(s => ({ url: s.url, ip: s.ip })));
        setWizardState('found');
      } else {
        setWizardState('not_found');
      }
    } catch {
      setWizardState('error');
      setWizardError('Scan failed — server may be unreachable.');
    }
  }

  /**
   * Connect to a discovered (or manually entered) remote GPU server URL.
   * Saves the URL to the app config on success.
   */
  async function handleConnect(url: string) {
    setWizardState('connecting');
    try {
      const res = await api.connectMotion(url);
      if (res.ok) {
        setWizardState('connected');
        setRemoteUrl(url);
        setMotionBackend(res.backend ?? 'procedural');
      } else {
        setWizardState('error');
        setWizardError(res.message);
      }
    } catch {
      setWizardState('error');
      setWizardError(`Could not reach ${url}`);
    }
  }

  /**
   * Disconnect from the current remote GPU server (clears config).
   * Falls back to local procedural generation immediately.
   */
  async function handleDisconnect() {
    try { await api.disconnectMotion(); } catch { /* ignore */ }
    setRemoteUrl('');
    setWizardState('idle');
    setShowWizard(false);
    api.getMotionModelStatus().then(s => setMotionBackend(s.active_backend)).catch(() => {});
  }

  // ── Ctrl+Shift+C toggles floating composer ─────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        setShowFloatingComposer(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Auto-show floating composer when entering cinematic mode
  useEffect(() => {
    if (cinematicMode) setShowFloatingComposer(true);
  }, [cinematicMode]);

  /** Camera preset definitions for the horizontal preset strip. */
  const cameraPresets = [
    { id: 'fullbody', label: 'Full' },
    { id: 'bust', label: 'Bust' },
    { id: 'face', label: 'Face' },
    { id: 'threeQuarter', label: '3/4' },
    { id: 'sideProfile', label: 'Side' },
    { id: 'lowAngle', label: 'Low' },
  ] as const;

  /**
   * Save the current camera position to localStorage.
   * Captures camera state via postMessage and stores up to 5 custom views.
   */
  const handleSaveCamera = useCallback(() => {
    // Request camera state from viewer — response comes via the message listener
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'cameraState') {
        window.removeEventListener('message', handler);
        const { position, target, radius } = e.data;
        const name = `View ${customCameras.length + 1}`;
        const updated = [...customCameras, { name, position, target, radius }].slice(-5);
        setCustomCameras(updated);
        localStorage.setItem('waifu-camera-presets', JSON.stringify(updated));
      }
    };
    window.addEventListener('message', handler);
    // Safety: clean up after 3s if viewer doesn't respond
    setTimeout(() => window.removeEventListener('message', handler), 3000);
    viewer.dispatchGetCameraState();
  }, [customCameras, viewer]);

  /**
   * Delete a saved custom camera position by index.
   *
   * @param idx - Index of the custom camera to remove.
   */
  const handleDeleteCamera = useCallback((idx: number) => {
    const updated = customCameras.filter((_, i) => i !== idx);
    setCustomCameras(updated);
    localStorage.setItem('waifu-camera-presets', JSON.stringify(updated));
  }, [customCameras]);

  /**
   * Restore a saved custom camera position.
   *
   * @param cam - The saved camera state to restore.
   */
  const handleLoadCamera = useCallback((cam: { position: number[]; target: number[]; radius: number }) => {
    setActivePreset(null);
    viewer.dispatchSetCameraState(
      { x: cam.position[0], y: cam.position[1], z: cam.position[2] },
      { x: cam.target[0], y: cam.target[1], z: cam.target[2] },
      500
    );
  }, [viewer]);

  return (
    <AnimatePresence>
      {(modelPanelOpen || cinematicMode) && (
        <motion.div
          initial={cinematicMode ? { opacity: 0 } : { width: 0, opacity: 0 }}
          animate={cinematicMode ? { opacity: 1 } : { width: '40%', opacity: 1 }}
          exit={cinematicMode ? { opacity: 0 } : { width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cinematicMode ? undefined : 'relative flex-shrink-0 h-full overflow-hidden'}
          style={cinematicMode ? {
            position: 'fixed', inset: 0, zIndex: 100,
            backgroundColor: 'var(--color-background)',
            display: 'flex', flexDirection: 'column',
          } : {
            borderLeft: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-background)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Top bar — "3D Viewer" label + back-to-chat button */}
          <div
            className="flex items-center justify-between px-3 flex-shrink-0"
            style={{
              height: 36,
              backgroundColor: 'var(--color-surface)',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
              3D Viewer
            </span>
            <button
              onClick={toggleModelPanel}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors duration-150"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--color-accent)',
                backgroundColor: 'var(--color-accent-soft)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
              }}
              title="Close 3D viewer and return to chat"
              aria-label="Close 3D viewer"
            >
              <ChevronLeft size={14} />
              Back to Chat
            </button>
          </div>

          {/* Viewer area — Unity iframe, Live2D canvas, or VRM/GLB iframe */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            {isUnity ? (
              <iframe
                ref={(el) => {
                  if (el) useViewerStore.getState().setUnityIframeRef(el);
                }}
                src={character.unity_scene_url || '/unity/Build/index.html'}
                className="w-full h-full border-0"
                title="Unity 3D Viewer"
                allow="autoplay"
              />
            ) : isLive2D ? (
              <motion.div
                key={character.live2d_model}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                transition={{ duration: 1.2, ease: [0.33, 1, 0.68, 1] }}
                style={{ width: '100%', height: '100%' }}
              >
                <Live2DErrorBoundary onError={(msg) => {
                  setVrmLoadState('failed');
                  setVrmFailReason(msg);
                }}>
                  <Suspense fallback={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
                    </div>
                  }>
                    <Live2DCanvas
                      modelUrl={character.live2d_model!}
                      onLoadStateChange={(state, reason) => {
                        if (state === 'loaded') setVrmLoadState('loaded');
                        else if (state === 'failed') {
                          setVrmLoadState('failed');
                          setVrmFailReason(reason || 'Live2D model failed to load');
                        } else {
                          setVrmLoadState('loading');
                        }
                      }}
                    />
                  </Suspense>
                </Live2DErrorBoundary>
              </motion.div>
            ) : (
              <iframe
                ref={setIframeEl}
                src="/shared/viewer/viewer.html?v=9"
                className="w-full h-full border-0"
                title="3D Viewer"
              />
            )}

            {/* ── Status overlays (cover iframe until model resolves) ── */}
            {!vrmUrl && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
                <div className="text-center px-6">
                  <Box size={32} style={{ color: 'var(--color-border)', margin: '0 auto 12px' }} />
                  <p className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    No 3D model assigned
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
                    Open Settings → Character and assign a .vrm file,<br />
                    or drop a file named <code style={{ opacity: 0.7 }}>{character.name.toLowerCase()}.vrm</code><br />
                    into <code style={{ opacity: 0.7 }}>backend/storage/avatars/</code>
                  </p>
                </div>
              </div>
            )}
            {vrmUrl && vrmLoadState === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ backgroundColor: 'var(--color-background)', opacity: 0.9 }}>
                <div className="text-center">
                  <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-accent)', margin: '0 auto 8px' }} />
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Loading 3D model…</p>
                </div>
              </div>
            )}
            {vrmUrl && vrmLoadState === 'failed' && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
                <div className="text-center px-6">
                  <AlertTriangle size={28} style={{ color: 'var(--color-danger, #f55)', margin: '0 auto 10px' }} />
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Failed to load 3D model
                  </p>
                  {vrmFailReason && (
                    <p className="text-[10px] mb-3 font-mono" style={{ color: 'var(--color-text-tertiary)', wordBreak: 'break-all' }}>
                      {vrmFailReason}
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

            {/* ── FPS + motion backend overlay — top-right corner ── */}
            <div
              style={{
                position: 'absolute', top: 8, right: 8, zIndex: 10,
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
                pointerEvents: 'none',
              }}
            >
              {viewportFpsLocal !== null && (
                <div
                  style={{
                    fontSize: 10, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.05em',
                    padding: '2px 6px', borderRadius: 4,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    color: viewportFpsLocal >= 50 ? '#4caf50' : viewportFpsLocal >= 25 ? '#ff9800' : '#f44336',
                  }}
                  title={`3D viewport: ${viewportFpsLocal} FPS`}
                >
                  {viewportFpsLocal} FPS
                </div>
              )}
              {/* Motion backend status badge — click to open GPU server wizard */}
              {vrmLoadState === 'loaded' && motionBackend && (
                <button
                  onClick={() => setShowWizard(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '3px',
                    padding: '1px 6px', borderRadius: 4,
                    backgroundColor: 'rgba(0,0,0,0.40)',
                    fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.04em',
                    cursor: 'pointer', border: 'none',
                    color: remoteUrl ? '#66c97e' : 'rgba(255,255,255,0.5)',
                    pointerEvents: 'auto',
                  }}
                  title={remoteUrl ? `GPU remote: ${remoteUrl} — click to disconnect` : 'Click to connect a GPU motion server'}
                >
                  {remoteUrl ? <Wifi size={9} /> : <Sparkles size={9} />}
                  {remoteUrl ? 'GPU' : motionBackend === 'motion_diffuse' ? 'AI' : 'Proc'}
                </button>
              )}
              {/* B2: Emotion badge — shows active expression driven by the last LLM reply */}
              {currentEmotion && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                    fontWeight: 600,
                  }}
                >
                  {currentEmotion.emotion} {Math.round(currentEmotion.intensity * 100)}%
                </span>
              )}
              {/* C2: Tool protocol badge — shows detected tool-calling mode for the active LLM */}
              {toolProtocol && toolProtocol !== 'none' && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: toolProtocol === 'openai_functions'
                      ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)',
                    color: toolProtocol === 'openai_functions' ? '#3b82f6' : '#f59e0b',
                    fontWeight: 600,
                  }}
                  title={toolProtocol === 'openai_functions'
                    ? 'Model uses OpenAI-format tool calling'
                    : 'Model uses XML tool fallback'}
                >
                  Tools: {toolProtocol === 'openai_functions' ? 'OpenAI' : 'XML'}
                </span>
              )}
            </div>

            {/* ── LEFT side: expression editor toggle ── */}
            {vrmUrl && vrmLoadState === 'loaded' && (
              <div
                style={{
                  position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                  display: 'flex', flexDirection: 'column', gap: 5, zIndex: 10,
                  opacity: 0.85,
                }}
              >
                <button
                  onClick={() => showExprEditor ? setShowExprEditor(false) : handleOpenExprEditor()}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs"
                  style={{
                    backgroundColor: showExprEditor ? 'var(--color-accent)' : 'var(--color-surface)',
                    borderRadius: 'var(--radius-button)',
                    boxShadow: 'var(--shadow-card)',
                    color: showExprEditor ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                    minWidth: 44, justifyContent: 'center',
                  }}
                  title="Expression editor"
                >
                  <Sliders size={12} />
                </button>
              </div>
            )}

            {/* ── Camera preset strip — click-to-open via 📷 button ── */}
            <AnimatePresence>
              {vrmUrl && vrmLoadState === 'loaded' && cameraBarOpen && (
                <motion.div
                  key="camera-strip"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', alignItems: 'center', gap: 3, zIndex: 15,
                    padding: '3px 5px',
                    background: 'color-mix(in srgb, var(--color-surface) 90%, transparent)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: 'var(--radius-card, 10px)',
                    border: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-card)',
                  }}
                >
                  {cameraPresets.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setActivePreset(p.id);
                        viewer.dispatchCameraPreset(p.id as 'fullbody' | 'bust' | 'face' | 'threeQuarter' | 'sideProfile' | 'lowAngle');
                      }}
                      className="px-2 py-1 text-[10px]"
                      style={{
                        background: activePreset === p.id ? 'var(--color-accent-soft)' : 'transparent',
                        borderRadius: 'var(--radius-button, 6px)',
                        color: activePreset === p.id ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: activePreset === p.id ? 700 : 500,
                        borderBottom: activePreset === p.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                        whiteSpace: 'nowrap',
                      }}
                      title={`${p.label} camera view`}
                    >
                      {p.label}
                    </button>
                  ))}
                  {/* Custom saved cameras — click to load, X to delete */}
                  {customCameras.map((cam, idx) => (
                    <div
                      key={`custom-${idx}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 1 }}
                    >
                      <button
                        onClick={() => handleLoadCamera(cam)}
                        className="px-1.5 py-1 text-[10px]"
                        style={{
                          background: 'transparent',
                          borderRadius: 'var(--radius-button, 6px)',
                          color: 'var(--color-text-tertiary)',
                          border: '1px dashed var(--color-border)',
                          cursor: 'pointer',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                        }}
                        title={cam.name}
                      >
                        {cam.name}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteCamera(idx); }}
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer',
                          padding: '0 1px', opacity: 0.4, lineHeight: 1,
                          color: 'var(--color-text-tertiary)',
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.4'; }}
                        title="Delete saved view"
                        aria-label={`Delete ${cam.name}`}
                      >
                        <X size={8} />
                      </button>
                    </div>
                  ))}
                  {/* Save current view */}
                  {customCameras.length < 5 && (
                    <button
                      onClick={handleSaveCamera}
                      className="px-1.5 py-1 text-[10px]"
                      style={{
                        background: 'transparent',
                        borderRadius: 'var(--radius-button, 6px)',
                        color: 'var(--color-text-tertiary)',
                        border: 'none',
                        cursor: 'pointer',
                        opacity: 0.6,
                      }}
                      title="Save current camera position"
                    >
                      ★
                    </button>
                  )}
                  {/* Divider + Reset */}
                  <div style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 2px' }} />
                  <button
                    onClick={() => { setActivePreset('fullbody'); viewer.dispatchResetCamera(); }}
                    className="flex items-center gap-0.5 px-1.5 py-1 text-[10px]"
                    style={{
                      background: 'transparent',
                      borderRadius: 'var(--radius-button, 6px)',
                      color: 'var(--color-text-tertiary)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    title="Reset camera to default"
                  >
                    <RotateCcw size={10} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Floating chat composer (overlays 3D viewport) ── */}
            <FloatingComposer
              visible={showFloatingComposer && vrmLoadState === 'loaded'}
              onClose={() => setShowFloatingComposer(false)}
            />

            {/* ── Bottom bar — 4 actions: Camera, Advanced, Models, Photo ── */}
            <div
              className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 px-3 pb-3"
              style={{ transition: 'opacity 0.2s', opacity: 0.9 }}
            >
              {/* 📷 Camera — toggles preset strip */}
              {vrmLoadState === 'loaded' && (
                <button
                  onClick={() => setCameraBarOpen(o => !o)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs"
                  style={{
                    backgroundColor: cameraBarOpen ? 'var(--color-accent)' : 'var(--color-surface)',
                    borderRadius: 'var(--radius-button)',
                    boxShadow: 'var(--shadow-card)',
                    color: cameraBarOpen ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                  title="Camera presets"
                >
                  <Camera size={13} /> Camera
                </button>
              )}

              {/* ⚙ Advanced — slides up EffectsPanel + AnimationBrowser */}
              {vrmLoadState === 'loaded' && !isLive2D && (
                <button
                  onClick={() => setAdvancedOpen(o => !o)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs"
                  style={{
                    backgroundColor: advancedOpen ? 'var(--color-accent)' : 'var(--color-surface)',
                    borderRadius: 'var(--radius-button)',
                    boxShadow: 'var(--shadow-card)',
                    color: advancedOpen ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                  title="Advanced panels (VFX, Animations)"
                >
                  <Settings2 size={13} /> Advanced
                  <ChevronDown
                    size={11}
                    style={{ transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                  />
                </button>
              )}

              {/* Models browser */}
              <button
                onClick={() => openOverlay('modelbrowser')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-button)',
                  boxShadow: 'var(--shadow-card)',
                  color: 'var(--color-accent)',
                  border: '1px solid var(--color-border)',
                }}
                title="Browse & download 3D models"
              >
                <Box size={13} /> Models
              </button>

              {/* Photo Mode */}
              {vrmLoadState === 'loaded' && (
                <button
                  onClick={() => openOverlay('photomode')}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--radius-button)',
                    boxShadow: 'var(--shadow-card)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                  title="Photo Mode (Ctrl+Shift+P)"
                  aria-label="Open Photo Mode"
                >
                  <Camera size={13} /> Photo
                </button>
              )}
            </div>

          </div>

          {/* Spring Bone Physics Panel — always shown when VRM loaded (stays collapsed internally) */}
          {!isLive2D && vrmLoadState === 'loaded' && (
            <SpringBonePanel isOpen={modelPanelOpen} />
          )}

          {/* Advanced panels — slide up from bottom when advancedOpen */}
          <AnimatePresence>
            {!isLive2D && vrmLoadState === 'loaded' && advancedOpen && (
              <motion.div
                key="advanced-sheet"
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                style={{
                  position: 'absolute', bottom: 48, left: 0, right: 0,
                  background: 'var(--color-surface)',
                  borderTop: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-card, 10px) var(--radius-card, 10px) 0 0',
                  overflow: 'auto',
                  maxHeight: '60%',
                  zIndex: 20,
                  boxShadow: 'var(--shadow-overlay)',
                }}
              >
                <EffectsPanel isOpen={advancedOpen} />
                <AnimationBrowser isOpen={advancedOpen} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* B.1: GLB Morph Target Sliders — shown only when a GLB has morph targets */}
          {glbMorphTargets.length > 0 && vrmLoadState === 'loaded' && (
            <div style={{ borderTop: '1px solid var(--color-border)', padding: '8px 12px' }}>
              <button
                onClick={() => {
                  const el = document.getElementById('morph-target-panel');
                  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                  background: 'none', border: 'none', color: 'var(--color-text-primary)',
                  cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 500,
                }}
              >
                <Sliders size={14} />
                <span>Morph Targets</span>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: '11px', marginLeft: 'auto' }}>
                  {glbMorphTargets.length} targets
                </span>
              </button>
              <div id="morph-target-panel" style={{ display: 'none', marginTop: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {glbMorphTargets.map((target) => {
                  const key = `${target.meshName}:${target.index}`;
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                      <label
                        style={{
                          flex: '0 0 100px', fontSize: '10px', color: 'var(--color-text-secondary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontFamily: 'monospace',
                        }}
                        title={`${target.meshName} / ${target.targetName}`}
                      >
                        {target.targetName}
                      </label>
                      <input
                        type="range" min="0" max="1" step="0.01"
                        value={glbMorphValues[key] ?? 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setGlbMorphValues(prev => ({ ...prev, [key]: val }));
                          useViewerStore.getState().dispatchSetGlbMorphTarget(target.meshName, target.index, val);
                        }}
                        style={{ flex: 1, height: '3px' }}
                      />
                      <span style={{ minWidth: '28px', fontSize: '10px', textAlign: 'right', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>
                        {(glbMorphValues[key] ?? 0).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Remote GPU Wizard — slide up from bottom */}
          <AnimatePresence>
            {showWizard && (
              <motion.div
                key="gpu-wizard"
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{
                  borderTop: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-background)',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em',
                      color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: '5px',
                    }}>
                      <Wifi size={11} /> GPU MOTION SERVER
                    </span>
                    <button
                      onClick={() => setShowWizard(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '2px' }}
                      aria-label="Close wizard"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  {/* Idle state */}
                  {wizardState === 'idle' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>
                        Run animations on a Windows PC with an NVIDIA GPU for faster, higher-quality motion.
                        Make sure the Windows PC is on the same WiFi network and the motion server is running.
                      </p>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          onClick={handleScanForGpu}
                          style={{
                            flex: 1, padding: '6px 10px', fontSize: '0.72rem', fontWeight: 600,
                            backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)',
                            border: 'none', borderRadius: 'var(--radius-button)', cursor: 'pointer',
                          }}
                        >
                          Scan for GPU Server
                        </button>
                        <button
                          onClick={() => setWizardState('not_found')}
                          style={{
                            padding: '6px 10px', fontSize: '0.72rem',
                            backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)',
                            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-button)', cursor: 'pointer',
                          }}
                        >
                          Enter IP
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Scanning */}
                  {wizardState === 'scanning' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.71rem', color: 'var(--color-text-secondary)' }}>
                        Scanning your network… (~8 seconds)
                      </span>
                    </div>
                  )}

                  {/* Found servers */}
                  {wizardState === 'found' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', margin: '0 0 2px' }}>
                        Found {wizardServers.length} server{wizardServers.length !== 1 ? 's' : ''} on your network:
                      </p>
                      {wizardServers.map(s => (
                        <div key={s.url} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            flex: 1, fontSize: '0.71rem', fontFamily: 'var(--font-mono, monospace)',
                            color: 'var(--color-text-primary)',
                          }}>{s.url}</span>
                          <button
                            onClick={() => handleConnect(s.url)}
                            style={{
                              padding: '4px 12px', fontSize: '0.7rem', fontWeight: 600,
                              backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)',
                              border: 'none', borderRadius: 'var(--radius-button)', cursor: 'pointer',
                            }}
                          >
                            Connect
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Not found / manual entry */}
                  {wizardState === 'not_found' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                        No servers found automatically. Enter the IP address of your Windows PC:
                      </p>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="http://192.168.1.100:8081"
                          value={remoteUrl}
                          onChange={e => setRemoteUrl(e.target.value)}
                          style={{
                            flex: 1, padding: '5px 8px', fontSize: '0.71rem',
                            backgroundColor: 'var(--color-background)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-button)',
                            color: 'var(--color-text-primary)',
                          }}
                        />
                        <button
                          onClick={() => remoteUrl && handleConnect(remoteUrl)}
                          disabled={!remoteUrl}
                          style={{
                            padding: '5px 12px', fontSize: '0.7rem', fontWeight: 600,
                            backgroundColor: remoteUrl ? 'var(--color-accent)' : 'var(--color-surface)',
                            color: remoteUrl ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                            border: 'none', borderRadius: 'var(--radius-button)',
                            cursor: remoteUrl ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Connect
                        </button>
                      </div>
                      <button
                        onClick={handleScanForGpu}
                        style={{
                          padding: '4px', fontSize: '0.68rem', background: 'none',
                          border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        ↺ Try scanning again
                      </button>
                    </div>
                  )}

                  {/* Connecting */}
                  {wizardState === 'connecting' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                      <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.71rem', color: 'var(--color-text-secondary)' }}>Connecting…</span>
                    </div>
                  )}

                  {/* Connected */}
                  {wizardState === 'connected' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Wifi size={13} style={{ color: 'var(--color-success, #39c96e)', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.71rem', color: 'var(--color-success, #39c96e)', fontWeight: 600 }}>
                        Connected!
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginLeft: 4 }}>
                        Motion now runs on your GPU PC.
                      </span>
                      <button
                        onClick={handleDisconnect}
                        style={{
                          marginLeft: 'auto', padding: '3px 8px', fontSize: '0.68rem',
                          background: 'none', border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-button)', color: 'var(--color-text-muted)', cursor: 'pointer',
                        }}
                      >
                        Disconnect
                      </button>
                    </div>
                  )}

                  {/* Error */}
                  {wizardState === 'error' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <WifiOff size={13} style={{ color: '#f55', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.71rem', color: '#f55' }}>{wizardError}</span>
                      </div>
                      <button
                        onClick={() => setWizardState('idle')}
                        style={{
                          padding: '4px 10px', fontSize: '0.7rem', alignSelf: 'flex-start',
                          backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)',
                          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-button)', cursor: 'pointer',
                        }}
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expression Editor — slide up from bottom when open */}
          <AnimatePresence>
            {showExprEditor && (
              <motion.div
                key="expr-editor"
                initial={{ height: 0 }}
                animate={{ height: 240 }}
                exit={{ height: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{
                  borderTop: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-background)',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  padding: '6px 10px 4px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  color: 'var(--color-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <Sliders size={11} /> EXPRESSION EDITOR
                </div>
                <div style={{ height: 'calc(240px - 30px)', overflow: 'hidden' }}>
                  <ExpressionEditor
                    shapes={blendShapes}
                    values={blendValues}
                    onChange={handleBlendChange}
                    onResetAll={handleResetAll}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
