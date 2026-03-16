import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Camera, ChevronDown, ChevronRight, Lock, Unlock,
  Maximize, User, Focus, Image,
  Star, Download,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useViewerStore } from '../stores/viewerStore';

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

/** 26 canonical emotions grouped by 6 categories. */
const EMOTION_CATEGORIES: Record<string, string[]> = {
  Core:      ['happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted', 'neutral'],
  Social:    ['embarrassed', 'shy', 'proud', 'confident', 'jealous', 'grateful'],
  Cognitive: ['confused', 'curious', 'thoughtful', 'nostalgic', 'awe'],
  Romantic:  ['love', 'flirty', 'longing'],
  Energy:    ['excited', 'tired', 'relieved'],
  Playful:   ['smug', 'mischievous'],
};

/** Non-petMode gestures available for Photo Mode posing. */
const GESTURES = [
  'nod', 'tilt', 'wave', 'shrug', 'bow', 'clap', 'think', 'point',
  'celebrate', 'shy', 'dance', 'foot_tap', 'crossed_arms', 'shake',
  'facepalm', 'stretch', 'wink', 'yawn',
] as const;

/** Gradient background presets. */
const GRADIENT_PRESETS = [
  { label: 'Sunset',     value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { label: 'Ocean',      value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { label: 'Midnight',   value: 'linear-gradient(135deg, #0c0c1d 0%, #1a1a3e 50%, #2d1b69 100%)' },
  { label: 'Sakura',     value: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
  { label: 'Monochrome', value: 'linear-gradient(135deg, #2c3e50 0%, #bdc3c7 100%)' },
  { label: 'Forest',     value: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
] as const;

/** Camera preset options. */
const CAMERA_PRESETS = [
  { id: 'fullbody' as const, label: 'Full',  icon: Maximize },
  { id: 'bust'     as const, label: 'Bust',  icon: User },
  { id: 'face'     as const, label: 'Face',  icon: Focus },
] as const;

/** Quality tier options. */
const QUALITY_OPTIONS = [
  { value: 1, label: '1x (Quick)' },
  { value: 2, label: '2x (Social)' },
  { value: 4, label: '4x (Poster)' },
] as const;

/* ═══════════════════════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════════════════════ */

const sidebarStyle: React.CSSProperties = {
  width: 280,
  height: '100%',
  overflowY: 'auto',
  backgroundColor: 'var(--color-surface)',
  borderLeft: '1px solid var(--color-border)',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  cursor: 'pointer',
  fontSize: '0.72rem',
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderTop: '1px solid var(--color-border-subtle)',
  userSelect: 'none',
};

const sectionBodyStyle: React.CSSProperties = {
  padding: '4px 12px 8px',
};

const pillStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 12,
  border: '1px solid var(--color-border)',
  backgroundColor: 'transparent',
  color: 'var(--color-text-secondary)',
  fontSize: '0.65rem',
  cursor: 'pointer',
  transition: 'all 0.15s',
  whiteSpace: 'nowrap',
};

const pillActiveStyle: React.CSSProperties = {
  ...pillStyle,
  backgroundColor: 'var(--color-accent)',
  color: 'white',
  borderColor: 'var(--color-accent)',
};

const sliderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '2px 0',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: 'var(--color-text-tertiary)',
  minWidth: 65,
};

const sliderStyle: React.CSSProperties = {
  flex: 1,
  accentColor: 'var(--color-accent)',
  height: 14,
};

/* ═══════════════════════════════════════════════════════════════════════
   Collapsible Section Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * A collapsible sidebar section with toggle header.
 *
 * @param title - Section heading text
 * @param icon - Lucide icon component
 * @param defaultOpen - Whether to start expanded (default true)
 * @param children - Section content
 */
function Section({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div style={sectionHeaderStyle} onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={13} />
        {title}
      </div>
      {open && <div style={sectionBodyStyle}>{children}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PhotoModeOverlay — Main Component
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Full-viewport Photo Mode overlay with sidebar controls.
 *
 * Renders when ``appStore.activeOverlay === 'photomode'``. The 3D viewer
 * iframe expands to fill the viewport behind this overlay's transparent
 * left panel, while the sidebar on the right provides expression, gesture,
 * camera, background, and capture controls.
 *
 * Entry: dispatches ``enterPhotoMode`` to viewer (freezes idle/emotion layers).
 * Exit: dispatches ``exitPhotoMode`` (resumes layers, tweens camera back).
 */
export function PhotoModeOverlay() {
  const { activeOverlay, closeOverlay, openOverlay, activeCharacter } = useAppStore();
  const viewer = useViewerStore();

  // Controls state
  const [activeEmotion, setActiveEmotion] = useState('neutral');
  const [emotionCategory, setEmotionCategory] = useState('Core');
  const [intensity, setIntensity] = useState(0.85);
  const [activeGesture, setActiveGesture] = useState<string | null>(null);
  const [holdPose, setHoldPose] = useState(false);
  const [orbitLocked, setOrbitLocked] = useState(false);
  const [bgMode, setBgMode] = useState<'room' | 'color' | 'gradient' | 'transparent'>('room');
  const [bgColor, setBgColor] = useState('#1a1a2e');
  const [bgGradient, setBgGradient] = useState<string>(GRADIENT_PRESETS[0].value);
  const [quality, setQuality] = useState(2);
  const [transparent, setTransparent] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);

  // Track screenshot data for gallery save
  const pendingCaptureRef = useRef(false);

  const isOpen = activeOverlay === 'photomode';

  // Enter/exit photo mode on mount/unmount
  useEffect(() => {
    if (isOpen) {
      viewer.dispatchEnterPhotoMode();
    }
    return () => {
      if (isOpen) {
        viewer.dispatchExitPhotoMode();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Listen for screenshot ready events
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'screenshotReady' && pendingCaptureRef.current) {
        pendingCaptureRef.current = false;

        // Save to gallery
        fetch('/api/gallery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data_url: e.data.dataUrl,
            character_id: activeCharacter?.id ?? null,
            character_name: activeCharacter?.name ?? null,
            emotion: activeEmotion,
            gesture: activeGesture,
            quality,
            transparent,
          }),
        })
          .then(r => r.json())
          .then(() => {
            // Shutter flash effect
            setShutterFlash(true);
            setTimeout(() => setShutterFlash(false), 200);
          })
          .catch(err => console.error('[PhotoMode] Gallery save failed:', err));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [isOpen, activeCharacter, activeEmotion, activeGesture, quality, transparent]);

  // ── Expression handlers ─────────────────────────────────────────────

  const handleEmotionSelect = useCallback((emotion: string) => {
    setActiveEmotion(emotion);
    viewer.dispatchExpression(emotion, intensity);
  }, [viewer, intensity]);

  const handleIntensityChange = useCallback((val: number) => {
    setIntensity(val);
    viewer.dispatchExpression(activeEmotion, val);
  }, [viewer, activeEmotion]);

  // ── Gesture handlers ────────────────────────────────────────────────

  const handleGesture = useCallback((gesture: string) => {
    setActiveGesture(gesture);
    viewer.dispatchGesture(gesture, null);
    // If hold pose is on, freeze after a brief delay so gesture reaches peak
    if (holdPose) {
      setTimeout(() => viewer.dispatchHoldGesture(), 400);
    }
  }, [viewer, holdPose]);

  const handleHoldToggle = useCallback((val: boolean) => {
    setHoldPose(val);
    if (val) {
      viewer.dispatchHoldGesture();
    } else {
      viewer.dispatchReleaseGesture();
    }
  }, [viewer]);

  // ── Camera handlers ─────────────────────────────────────────────────

  const handleCameraPreset = useCallback((preset: 'fullbody' | 'bust' | 'face') => {
    viewer.dispatchCameraPreset(preset);
  }, [viewer]);

  const handleOrbitLock = useCallback((val: boolean) => {
    setOrbitLocked(val);
    const iframe = viewer.iframeRef;
    iframe?.contentWindow?.postMessage(
      { type: 'setCameraEnabled', enabled: !val },
      window.location.origin,
    );
  }, [viewer.iframeRef]);

  // ── Background handlers ─────────────────────────────────────────────

  const handleBgMode = useCallback((mode: typeof bgMode) => {
    setBgMode(mode);
    switch (mode) {
      case 'room':
        viewer.dispatchBackground('room', '');
        break;
      case 'color':
        viewer.dispatchBackground('color', bgColor);
        break;
      case 'gradient':
        viewer.dispatchBackground('gradient', bgGradient);
        break;
      case 'transparent':
        viewer.dispatchBackground('transparent', '');
        setTransparent(true);
        break;
    }
  }, [viewer, bgColor, bgGradient]);

  // ── Capture handler ─────────────────────────────────────────────────

  const handleCapture = useCallback(() => {
    pendingCaptureRef.current = true;
    viewer.dispatchScreenshot({ quality, transparent: transparent || bgMode === 'transparent' });
  }, [viewer, quality, transparent, bgMode]);

  // ── Exit handler ────────────────────────────────────────────────────

  const handleExit = useCallback(() => {
    viewer.dispatchExitPhotoMode();
    // Unlock orbit if it was locked
    if (orbitLocked) {
      const iframe = viewer.iframeRef;
      iframe?.contentWindow?.postMessage(
        { type: 'setCameraEnabled', enabled: true },
        window.location.origin,
      );
    }
    closeOverlay();
  }, [viewer, closeOverlay, orbitLocked, viewer.iframeRef]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 250,
        display: 'flex',
        backgroundColor: 'rgba(0,0,0,0.05)',
      }}
    >
      {/* Left: transparent area over the 3D viewer */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Shutter flash */}
        <AnimatePresence>
          {shutterFlash && (
            <motion.div
              initial={{ opacity: 0.9 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'white',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Right: control sidebar */}
      <motion.div
        initial={{ x: 280 }}
        animate={{ x: 0 }}
        exit={{ x: 280 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={sidebarStyle}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Camera size={15} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>
              PHOTO MODE
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => openOverlay('gallery')}
              style={{
                background: 'none',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: '0.65rem',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              Gallery
            </button>
            <button
              onClick={handleExit}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                padding: 2,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Expression Section ────────────────────────────────── */}
        <Section title="Expression" icon={Star} defaultOpen={true}>
          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {Object.keys(EMOTION_CATEGORIES).map(cat => (
              <button
                key={cat}
                onClick={() => setEmotionCategory(cat)}
                style={{
                  ...(emotionCategory === cat ? pillActiveStyle : pillStyle),
                  fontSize: '0.6rem',
                  padding: '2px 6px',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
          {/* Emotion pills */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {(EMOTION_CATEGORIES[emotionCategory] ?? []).map(emo => (
              <button
                key={emo}
                onClick={() => handleEmotionSelect(emo)}
                style={activeEmotion === emo ? pillActiveStyle : pillStyle}
              >
                {emo}
              </button>
            ))}
          </div>
          {/* Intensity slider */}
          <div style={sliderRowStyle}>
            <span style={labelStyle}>Intensity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={intensity}
              onChange={e => handleIntensityChange(parseFloat(e.target.value))}
              style={sliderStyle}
            />
            <span style={{ ...labelStyle, minWidth: 30, textAlign: 'right' }}>
              {Math.round(intensity * 100)}%
            </span>
          </div>
        </Section>

        {/* ── Pose Section ─────────────────────────────────────── */}
        <Section title="Pose" icon={User} defaultOpen={true}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {GESTURES.map(g => (
              <button
                key={g}
                onClick={() => handleGesture(g)}
                style={activeGesture === g ? pillActiveStyle : pillStyle}
              >
                {g.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          {/* Hold Pose toggle */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.68rem',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={holdPose}
              onChange={e => handleHoldToggle(e.target.checked)}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            Hold Pose
          </label>
        </Section>

        {/* ── Camera Section ───────────────────────────────────── */}
        <Section title="Camera" icon={Focus} defaultOpen={true}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {CAMERA_PRESETS.map(({ id, label, icon: CamIcon }) => (
              <button
                key={id}
                onClick={() => handleCameraPreset(id)}
                style={{
                  ...pillStyle,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  flex: 1,
                  justifyContent: 'center',
                }}
              >
                <CamIcon size={12} />
                {label}
              </button>
            ))}
          </div>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.68rem',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}>
            {orbitLocked ? <Lock size={12} /> : <Unlock size={12} />}
            <input
              type="checkbox"
              checked={orbitLocked}
              onChange={e => handleOrbitLock(e.target.checked)}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            Lock Orbit
          </label>
        </Section>

        {/* ── Background Section ───────────────────────────────── */}
        <Section title="Background" icon={Image} defaultOpen={false}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {(['room', 'color', 'gradient', 'transparent'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => handleBgMode(mode)}
                style={bgMode === mode ? pillActiveStyle : pillStyle}
              >
                {mode === 'transparent' ? 'Alpha' : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {bgMode === 'color' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={bgColor}
                onChange={e => {
                  setBgColor(e.target.value);
                  viewer.dispatchBackground('color', e.target.value);
                }}
                style={{ width: 28, height: 28, border: 'none', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
                {bgColor}
              </span>
            </div>
          )}

          {bgMode === 'gradient' && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {GRADIENT_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setBgGradient(preset.value);
                    viewer.dispatchBackground('gradient', preset.value);
                  }}
                  style={{
                    width: 36,
                    height: 24,
                    borderRadius: 4,
                    border: bgGradient === preset.value
                      ? '2px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    background: preset.value,
                    cursor: 'pointer',
                  }}
                  title={preset.label}
                />
              ))}
            </div>
          )}
        </Section>

        {/* ── Capture Section ──────────────────────────────────── */}
        <Section title="Capture" icon={Camera} defaultOpen={true}>
          {/* Quality */}
          <div style={sliderRowStyle}>
            <span style={labelStyle}>Quality</span>
            <select
              value={quality}
              onChange={e => setQuality(parseInt(e.target.value))}
              style={{
                flex: 1,
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                padding: '3px 6px',
                fontSize: '0.68rem',
              }}
            >
              {QUALITY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Transparent toggle */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.68rem',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            margin: '4px 0',
          }}>
            <input
              type="checkbox"
              checked={transparent || bgMode === 'transparent'}
              onChange={e => {
                setTransparent(e.target.checked);
                if (e.target.checked) handleBgMode('transparent');
              }}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            Transparent Background
          </label>

          {/* Capture button */}
          <button
            onClick={handleCapture}
            style={{
              width: '100%',
              marginTop: 8,
              padding: '10px 0',
              borderRadius: 8,
              border: 'none',
              backgroundColor: 'var(--color-accent)',
              color: 'white',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'opacity 0.15s',
            }}
          >
            <Camera size={16} />
            Capture (Space)
          </button>

          {/* Quick download (bypasses gallery) */}
          <button
            onClick={() => {
              // Direct download without gallery save
              const iframe = viewer.iframeRef;
              const downloadHandler = (e: MessageEvent) => {
                if (e.data?.type === 'screenshotReady') {
                  window.removeEventListener('message', downloadHandler);
                  const a = document.createElement('a');
                  a.href = e.data.dataUrl;
                  a.download = `${(activeCharacter?.name ?? 'screenshot').toLowerCase().replace(/\s+/g, '-')}-photo.png`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }
              };
              window.addEventListener('message', downloadHandler);
              iframe?.contentWindow?.postMessage(
                { type: 'captureScreenshot', payload: { quality, transparent: transparent || bgMode === 'transparent' } },
                window.location.origin,
              );
            }}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '6px 0',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              backgroundColor: 'transparent',
              color: 'var(--color-text-secondary)',
              fontSize: '0.68rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Download size={13} />
            Download Only
          </button>
        </Section>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Footer hint */}
        <div style={{
          padding: '8px 12px',
          fontSize: '0.6rem',
          color: 'var(--color-text-tertiary)',
          borderTop: '1px solid var(--color-border-subtle)',
          textAlign: 'center',
        }}>
          Space = Capture &middot; Esc = Exit &middot; Scroll to zoom
        </div>
      </motion.div>
    </motion.div>
  );
}
