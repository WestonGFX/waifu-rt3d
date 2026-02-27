import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Sliders, RotateCcw } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useViewer } from '../hooks/useViewer';
import { api } from '../lib/api';
import type { Character } from '../lib/types';

interface ModelPanelProps {
  character: Character;
}

/**
 * Resolve the VRM model URL for a character.
 * Priority: explicit model_vrm > vrm_model_url > auto-detect by name.
 * Auto-detection matches character name (or parenthetical alias) against
 * available VRM filenames from the scan endpoint.
 */
function resolveVrmUrl(
  character: Character,
  availableModels: Array<{ name: string; url: string }>
): string | null {
  // Explicit assignment
  if (character.model_vrm) return character.model_vrm;
  if (character.vrm_model_url) return character.vrm_model_url;

  // Auto-detect by name: check parenthetical alias first, e.g. "Fox (Rin)" → "Rin"
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
  const { modelPanelOpen, toggleModelPanel } = useAppStore();
  const { iframeRef, loadCharacter, setCameraPreset, getAvailableBlendShapes, setBlendShape, setBlendShapes } = useViewer();
  const [vrmModels, setVrmModels] = useState<Array<{ name: string; url: string }>>([]);

  // Expression editor state
  const [showExprEditor, setShowExprEditor] = useState(false);
  const [blendShapes, setBlendShapes_] = useState<string[]>([]);
  const [blendValues, setBlendValues] = useState<Record<string, number>>({});

  // Fetch available VRM models once
  useEffect(() => {
    api.scanVrm().then(models => {
      setVrmModels(models.map(m => ({ name: m.name, url: m.url })));
    }).catch(() => {});
  }, []);

  const vrmUrl = resolveVrmUrl(character, vrmModels);

  useEffect(() => {
    if (modelPanelOpen && vrmUrl) {
      const timer = setTimeout(() => {
        loadCharacter(vrmUrl);
        setCameraPreset('bust');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [modelPanelOpen, vrmUrl, loadCharacter, setCameraPreset]);

  // Load blend shapes when expression editor opens
  const handleOpenExprEditor = useCallback(async () => {
    setShowExprEditor(true);
    const shapes = await getAvailableBlendShapes();
    setBlendShapes_(shapes);
    // Initialize all values to 0
    setBlendValues(Object.fromEntries(shapes.map(s => [s, 0])));
  }, [getAvailableBlendShapes]);

  function handleBlendChange(name: string, value: number) {
    setBlendValues(prev => ({ ...prev, [name]: value }));
    setBlendShape(name, value);
  }

  function handleResetAll() {
    const zeros = Object.fromEntries(blendShapes.map(s => [s, 0]));
    setBlendValues(zeros);
    setBlendShapes(zeros);
  }

  return (
    <AnimatePresence>
      {modelPanelOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: '40%', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative flex-shrink-0 h-full overflow-hidden"
          style={{
            borderLeft: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-background)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* 3D Viewer iframe — takes remaining space above expression editor */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            <iframe
              ref={iframeRef}
              src="/shared/viewer/viewer.html"
              className="w-full h-full border-0"
              title="3D Viewer"
            />
            {!vrmUrl && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
                <div className="text-center px-6">
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    No VRM model found
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    Assign a 3D model in character settings or add a .vrm file named after this character to backend/storage/avatars/
                  </p>
                </div>
              </div>
            )}

            {/* Controls overlay (bottom-left) */}
            <div className="absolute bottom-4 left-4 flex items-center gap-2">
              <button
                onClick={toggleModelPanel}
                className="flex items-center gap-1 px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-button)',
                  boxShadow: 'var(--shadow-card)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <ChevronLeft size={14} /> Hide
              </button>
              {vrmUrl && (
                <>
                  {/* Camera preset buttons */}
                  {(['fullbody', 'bust', 'face'] as const).map(preset => (
                    <button
                      key={preset}
                      onClick={() => setCameraPreset(preset)}
                      className="px-2.5 py-1.5 text-xs capitalize"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderRadius: 'var(--radius-button)',
                        boxShadow: 'var(--shadow-card)',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border)',
                      }}
                      title={`${preset.charAt(0).toUpperCase() + preset.slice(1)} view`}
                    >
                      {preset}
                    </button>
                  ))}
                  {/* Expression editor toggle */}
                  <button
                    onClick={() => showExprEditor ? setShowExprEditor(false) : handleOpenExprEditor()}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs"
                    style={{
                      backgroundColor: showExprEditor ? 'var(--color-accent)' : 'var(--color-surface)',
                      borderRadius: 'var(--radius-button)',
                      boxShadow: 'var(--shadow-card)',
                      color: showExprEditor ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <Sliders size={14} /> Expressions
                  </button>
                </>
              )}
            </div>
          </div>

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
