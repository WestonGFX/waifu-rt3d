import { useState, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronRight, Sparkles, Droplets, Sun, Camera } from 'lucide-react';
import { useViewerStore } from '../stores/viewerStore';

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** Ambient particle type options. */
const AMBIENT_TYPES = [
  { id: null, label: 'Off', emoji: '' },
  { id: 'sakura', label: 'Sakura', emoji: '\u{1F338}' },
  { id: 'dust', label: 'Dust', emoji: '\u{2728}' },
  { id: 'snow', label: 'Snow', emoji: '\u{2744}\u{FE0F}' },
] as const;

/** Color grading presets for quick selection. */
const COLOR_PRESETS = [
  { label: 'None', brightness: 0, contrast: 0, saturation: 0 },
  { label: 'Warm Film', brightness: 0.03, contrast: 0.1, saturation: 0.15 },
  { label: 'Cool Teal', brightness: -0.02, contrast: 0.08, saturation: -0.1 },
  { label: 'Dramatic', brightness: -0.05, contrast: 0.25, saturation: -0.05 },
  { label: 'Anime Pastel', brightness: 0.06, contrast: -0.05, saturation: 0.25 },
] as const;

/* ═══════════════════════════════════════════════════════════════════════
   EffectsPanel — Phase 5 post-processing & particle controls
   ═══════════════════════════════════════════════════════════════════════ */

interface EffectsPanelProps {
  /** Whether the parent ModelPanel is currently open. */
  isOpen: boolean;
}

/**
 * Collapsible panel for controlling the Phase 5 post-processing pipeline
 * and particle system. Renders below the SpringBonePanel in ModelPanel.
 *
 * Sections:
 * - Bloom: enable + strength/radius/threshold sliders
 * - Color Grading: presets + brightness/contrast/saturation sliders
 * - Particles: ambient type selector + emotion-reactive toggle
 * - Camera: FOV slider (30–90°, default 50)
 * - Screenshot: supersampled + transparent checkboxes
 *
 * All changes are dispatched through viewerStore to the viewer iframe
 * via postMessage commands.
 */
export function EffectsPanel({ isOpen }: EffectsPanelProps) {
  const dispatchSetEffects = useViewerStore(s => s.dispatchSetEffects);
  const dispatchSetAmbientParticles = useViewerStore(s => s.dispatchSetAmbientParticles);
  const dispatchSetEmotionParticles = useViewerStore(s => s.dispatchSetEmotionParticles);
  const [expanded, setExpanded] = useState(false);

  // ── Bloom state ──
  const [bloomEnabled, setBloomEnabled] = useState(false);
  const [bloomStrength, setBloomStrength] = useState(0.3);
  const [bloomRadius, setBloomRadius] = useState(0.4);
  const [bloomThreshold, setBloomThreshold] = useState(0.85);

  // ── Color grading state ──
  const [colorGradeEnabled, setColorGradeEnabled] = useState(false);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);

  // ── Particle state ──
  const [ambientType, setAmbientType] = useState<string | null>(null);
  const [emotionParticles, setEmotionParticles] = useState(true);

  // ── Camera / FOV state ──
  const [fov, setFov] = useState(50);
  const dispatchSetFOV = useViewerStore(s => s.dispatchSetFOV);

  // ── Screenshot options ──
  const [ssSupersample, setSsSupersample] = useState(false);
  const [ssTransparent, setSsTransparent] = useState(false);

  // Sync effects to viewer when bloom parameters change
  const syncBloom = useCallback(() => {
    dispatchSetEffects({
      bloom: {
        enabled: bloomEnabled,
        strength: bloomStrength,
        radius: bloomRadius,
        threshold: bloomThreshold,
      },
    });
  }, [bloomEnabled, bloomStrength, bloomRadius, bloomThreshold, dispatchSetEffects]);

  useEffect(() => { syncBloom(); }, [syncBloom]);

  // Sync color grading to viewer
  const syncColorGrade = useCallback(() => {
    dispatchSetEffects({
      colorGrade: {
        enabled: colorGradeEnabled,
        brightness,
        contrast,
        saturation,
      },
    });
  }, [colorGradeEnabled, brightness, contrast, saturation, dispatchSetEffects]);

  useEffect(() => { syncColorGrade(); }, [syncColorGrade]);

  // Sync ambient particles
  useEffect(() => {
    dispatchSetAmbientParticles(ambientType);
  }, [ambientType, dispatchSetAmbientParticles]);

  // Sync emotion particles toggle
  useEffect(() => {
    dispatchSetEmotionParticles(emotionParticles);
  }, [emotionParticles, dispatchSetEmotionParticles]);

  /**
   * Apply a color grading preset.
   *
   * @param preset - The preset to apply
   */
  const applyColorPreset = useCallback((preset: typeof COLOR_PRESETS[number]) => {
    if (preset.label === 'None') {
      setColorGradeEnabled(false);
      setBrightness(0);
      setContrast(0);
      setSaturation(0);
    } else {
      setColorGradeEnabled(true);
      setBrightness(preset.brightness);
      setContrast(preset.contrast);
      setSaturation(preset.saturation);
    }
  }, []);

  /** Take screenshot with current options. */
  const iframeRef = useViewerStore(s => s.iframeRef);
  const handleScreenshot = useCallback(() => {
    iframeRef?.contentWindow?.postMessage({
      type: 'captureScreenshot',
      payload: {
        supersampled: ssSupersample,
        transparent: ssTransparent,
      },
    }, window.location.origin);
  }, [iframeRef, ssSupersample, ssTransparent]);

  if (!isOpen) return null;

  const sectionStyle: React.CSSProperties = {
    borderTop: '1px solid var(--color-border-subtle)',
    padding: '8px 12px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.68rem',
    color: 'var(--color-text-tertiary)',
    minWidth: '65px',
  };

  const sliderStyle: React.CSSProperties = {
    flex: 1,
    accentColor: 'var(--color-accent)',
    height: '14px',
  };

  const valueStyle: React.CSSProperties = {
    minWidth: '2.2rem',
    fontSize: '0.65rem',
    textAlign: 'right' as const,
    color: 'var(--color-text-tertiary)',
    fontFamily: 'monospace',
  };

  return (
    <div style={sectionStyle}>
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 0',
          color: 'var(--color-text-secondary)',
          fontSize: '0.75rem',
          fontWeight: 600,
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Sparkles size={13} style={{ color: 'var(--color-accent)' }} />
        Visual Effects
        {(bloomEnabled || colorGradeEnabled || ambientType) && (
          <span style={{
            fontSize: '0.58rem',
            padding: '1px 5px',
            borderRadius: '8px',
            backgroundColor: 'var(--color-accent-soft)',
            color: 'var(--color-accent)',
            marginLeft: '4px',
          }}>
            ON
          </span>
        )}
      </button>

      {expanded && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* ── Bloom ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Sun size={12} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Bloom
              </span>
              <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={bloomEnabled}
                  onChange={e => setBloomEnabled(e.target.checked)}
                  style={{ accentColor: 'var(--color-accent)' }}
                />
                <span style={{ fontSize: '0.62rem', color: 'var(--color-text-tertiary)' }}>Enable</span>
              </label>
            </div>
            {bloomEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '8px' }}>
                <SliderRow label="Strength" value={bloomStrength} min={0} max={2} step={0.05}
                  onChange={setBloomStrength} labelStyle={labelStyle} sliderStyle={sliderStyle} valueStyle={valueStyle} />
                <SliderRow label="Radius" value={bloomRadius} min={0} max={1} step={0.05}
                  onChange={setBloomRadius} labelStyle={labelStyle} sliderStyle={sliderStyle} valueStyle={valueStyle} />
                <SliderRow label="Threshold" value={bloomThreshold} min={0} max={1} step={0.05}
                  onChange={setBloomThreshold} labelStyle={labelStyle} sliderStyle={sliderStyle} valueStyle={valueStyle} />
              </div>
            )}
          </div>

          {/* ── Color Grading ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Color Grade
              </span>
            </div>
            {/* Preset pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
              {COLOR_PRESETS.map(p => {
                const isActive = colorGradeEnabled
                  && brightness === p.brightness
                  && contrast === p.contrast
                  && saturation === p.saturation;
                return (
                  <button
                    key={p.label}
                    onClick={() => applyColorPreset(p)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '12px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.62rem',
                      fontWeight: isActive ? 600 : 400,
                      backgroundColor: isActive ? 'var(--color-accent)' : 'var(--color-background)',
                      color: isActive ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {colorGradeEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '8px' }}>
                <SliderRow label="Bright" value={brightness} min={-0.3} max={0.3} step={0.01}
                  onChange={setBrightness} labelStyle={labelStyle} sliderStyle={sliderStyle} valueStyle={valueStyle} />
                <SliderRow label="Contrast" value={contrast} min={-0.5} max={0.5} step={0.01}
                  onChange={setContrast} labelStyle={labelStyle} sliderStyle={sliderStyle} valueStyle={valueStyle} />
                <SliderRow label="Saturate" value={saturation} min={-0.5} max={0.5} step={0.01}
                  onChange={setSaturation} labelStyle={labelStyle} sliderStyle={sliderStyle} valueStyle={valueStyle} />
              </div>
            )}
          </div>

          {/* ── Particles ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Droplets size={12} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Particles
              </span>
            </div>
            {/* Ambient type pills */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
              {AMBIENT_TYPES.map(t => {
                const isActive = ambientType === t.id;
                return (
                  <button
                    key={t.id ?? 'off'}
                    onClick={() => setAmbientType(t.id)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '12px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.62rem',
                      fontWeight: isActive ? 600 : 400,
                      backgroundColor: isActive ? 'var(--color-accent)' : 'var(--color-background)',
                      color: isActive ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {t.emoji} {t.label}
                  </button>
                );
              })}
            </div>
            {/* Emotion-reactive toggle */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              paddingLeft: '8px', cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={emotionParticles}
                onChange={e => setEmotionParticles(e.target.checked)}
                style={{ accentColor: 'var(--color-accent)' }}
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
                Emotion-reactive particles (hearts on love, sparkles on happy, etc.)
              </span>
            </label>
          </div>

          {/* ── Camera / FOV ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Camera size={12} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Camera
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '8px' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-tertiary)', minWidth: '65px' }}>
                FOV: {fov}°
              </span>
              <input
                type="range"
                min={30}
                max={90}
                step={1}
                value={fov}
                onChange={e => {
                  const val = parseInt(e.target.value, 10);
                  setFov(val);
                  dispatchSetFOV(val);
                }}
                style={{ flex: 1, accentColor: 'var(--color-accent)', height: '14px' }}
              />
              <button
                onClick={() => { setFov(50); dispatchSetFOV(50); }}
                style={{
                  padding: '2px 6px', fontSize: '0.6rem',
                  border: '1px solid var(--color-border)', borderRadius: '4px',
                  background: 'none', color: 'var(--color-text-tertiary)',
                  cursor: 'pointer',
                }}
                title="Reset FOV to default (50°)"
              >
                Reset
              </button>
            </div>
          </div>

          {/* ── Screenshot Options ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Camera size={12} style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Screenshot
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={ssSupersample}
                  onChange={e => setSsSupersample(e.target.checked)}
                  style={{ accentColor: 'var(--color-accent)' }}
                />
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
                  2x Supersampled (higher quality, slower)
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={ssTransparent}
                  onChange={e => setSsTransparent(e.target.checked)}
                  style={{ accentColor: 'var(--color-accent)' }}
                />
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
                  Transparent background (PNG alpha)
                </span>
              </label>
              <button
                onClick={handleScreenshot}
                style={{
                  marginTop: '4px',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-accent-text)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  justifyContent: 'center',
                }}
              >
                <Camera size={13} />
                Capture Screenshot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   SliderRow — reusable labeled slider component
   ═══════════════════════════════════════════════════════════════════════ */

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  labelStyle: React.CSSProperties;
  sliderStyle: React.CSSProperties;
  valueStyle: React.CSSProperties;
}

/** Compact labeled slider row for effects parameters. */
function SliderRow({ label, value, min, max, step, onChange, labelStyle, sliderStyle, valueStyle }: SliderRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={labelStyle}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={sliderStyle}
      />
      <span style={valueStyle}>{value.toFixed(2)}</span>
    </div>
  );
}
