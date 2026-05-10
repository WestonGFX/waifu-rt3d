/**
 * JigglePhysicsPanel — Settings tab for controlling VRM jiggle / spring-bone
 * physics in the 3D viewer.
 *
 * Renders as the "Physics" tab inside SettingsView. All viewer changes are
 * dispatched through viewerStore (postMessage bridge) and persisted to app
 * config via the `save` prop.
 *
 * Sections:
 *   - Global enable/disable toggle
 *   - Preset segmented control (Subtle / Natural / Anime / Bouncy / Max)
 *   - Master intensity slider (0.0–1.0)
 *   - Per-body-part sliders (breast / butt / thigh), collapsible
 *   - Bone detection status line
 *   - Reset-to-defaults button
 *
 * Viewer postMessage events consumed:
 *   - `jiggleInfo`      — full state snapshot (sent in response to getJiggleInfo)
 *   - `jiggleDetection` — bone-detection result posted on model load
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Zap, ChevronDown, ChevronRight, RotateCcw, Info, User } from 'lucide-react';
import { useViewerStore } from '../stores/viewerStore';
import { useAppStore } from '../stores/appStore';
import { api, type CharacterPhysicsProfile } from '../lib/api';

/* ─── Types ─────────────────────────────────────────────────────────────────── */

/** Named jiggle presets supported by the viewer. */
type JigglePreset = 'subtle' | 'natural' | 'anime' | 'bouncy' | 'max';

/** Body parts that support independent intensity. */
type BodyPart = 'breast' | 'butt' | 'thigh';

/** Shape of the `jiggleInfo` postMessage payload. */
interface JiggleInfoPayload {
  enabled: boolean;
  preset: string;
  intensity: number;
  bodyPartIntensity: Partial<Record<BodyPart, number>>;
  detected: boolean;
}

/** Shape of the `jiggleDetection` postMessage payload. */
interface JiggleDetectionPayload {
  detected: boolean;
  /** Number of jiggle-capable joints found on the current model. */
  jointCount: number;
}

/** Props passed in from SettingsView (standard tab contract). */
export interface JigglePhysicsPanelProps {
  /** Full app config object (nested structure from appStore). */
  config: Record<string, unknown>;
  /**
   * Persists a nested config key (e.g. `"jiggle.enabled"`).
   *
   * @param key   - Dot-notated config path.
   * @param value - New value to store.
   */
  save: (key: string, value: unknown) => void;
  /**
   * Reads a nested config key with an optional fallback.
   *
   * @param key      - Dot-notated config path.
   * @param fallback - Value to return when the key is absent.
   */
  cfg: (key: string, fallback?: unknown) => unknown;
}

/* ─── Constants ─────────────────────────────────────────────────────────────── */

/** Default jiggle configuration (matches app.json defaults). */
const DEFAULTS = {
  enabled: true,
  preset: 'subtle' as JigglePreset,
  intensity: 0.5,
  bodyParts: { breast: 0.65, butt: 0.40, thigh: 0.20 },
} as const;

/** Ordered preset options displayed in the segmented control. */
const PRESETS: Array<{ value: JigglePreset; label: string }> = [
  { value: 'subtle',  label: 'Subtle'  },
  { value: 'natural', label: 'Natural' },
  { value: 'anime',   label: 'Anime'   },
  { value: 'bouncy',  label: 'Bouncy'  },
  { value: 'max',     label: 'Max'     },
];

/** Persist debounce delay in milliseconds. */
const PERSIST_DEBOUNCE_MS = 300;

/** Body type options for per-character physics multipliers. */
const BODY_TYPES: Array<{
  value: CharacterPhysicsProfile['body_type'];
  label: string;
}> = [
  { value: 'petite',     label: 'Petite'     },
  { value: 'average',    label: 'Average'    },
  { value: 'athletic',   label: 'Athletic'   },
  { value: 'curvy',      label: 'Curvy'      },
  { value: 'voluptuous', label: 'Voluptuous' },
];

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

interface SliderRowProps {
  /** Display label shown to the left of the slider. */
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Called on every input change with the new numeric value. */
  onChange: (v: number) => void;
}

/**
 * A label + range slider + numeric readout row.
 * Uses the project's standard EffectsPanel slider dimensions.
 */
function SliderRow({ label, value, min, max, step, onChange }: SliderRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '1px 0',
      }}
    >
      <span
        style={{
          fontSize: '0.68rem',
          color: 'var(--color-text-tertiary)',
          minWidth: '52px',
        }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          flex: 1,
          accentColor: 'var(--color-accent)',
          height: '14px',
        }}
      />
      <span
        style={{
          minWidth: '2.2rem',
          fontSize: '0.65rem',
          textAlign: 'right',
          color: 'var(--color-text-tertiary)',
          fontFamily: 'monospace',
        }}
      >
        {value.toFixed(2)}
      </span>
    </div>
  );
}

/** Pill-style toggle switch matching the NsfwSettingsTab pattern. */
function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: 40,
        height: 22,
        borderRadius: 11,
        border: 'none',
        cursor: 'pointer',
        backgroundColor: checked
          ? 'var(--color-accent)'
          : 'var(--color-border-subtle)',
        transition: 'background-color 0.2s ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: 'var(--color-text-inverse, #fff)',
          transition: 'left 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }}
      />
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────────── */

/**
 * Jiggle physics settings panel rendered as the "Physics" tab in SettingsView.
 *
 * On mount the component fires `dispatchGetJiggleInfo()` to pull the current
 * viewer state, then keeps itself in sync through a `window` postMessage
 * listener that handles both `jiggleInfo` and `jiggleDetection` events.
 *
 * All mutations are:
 *   1. Applied immediately to local state (so the UI is responsive).
 *   2. Dispatched to the viewer via viewerStore.
 *   3. Persisted to config via `save` (intensity changes are debounced 300 ms).
 *
 * @example
 * ```tsx
 * <JigglePhysicsPanel config={config} save={save} cfg={cfg} />
 * ```
 */
export function JigglePhysicsPanel({ config, save, cfg: _cfg }: JigglePhysicsPanelProps) {
  /* ── Viewer store actions ────────────────────────────────────────────── */
  const dispatchSetJiggleEnabled  = useViewerStore(s => s.dispatchSetJiggleEnabled);
  const dispatchSetJiggleIntensity = useViewerStore(s => s.dispatchSetJiggleIntensity);
  const dispatchSetJigglePreset   = useViewerStore(s => s.dispatchSetJigglePreset);
  const dispatchGetJiggleInfo     = useViewerStore(s => s.dispatchGetJiggleInfo);

  /* ── Local state — seeded from persisted config ─────────────────────── */
  const jiggleCfg = (config.jiggle as Record<string, unknown> | undefined) ?? {};
  const bodyPartsCfg = (jiggleCfg.body_parts as Record<string, unknown> | undefined) ?? {};

  const [enabled,   setEnabled]   = useState<boolean>(() =>
    typeof jiggleCfg.enabled === 'boolean' ? jiggleCfg.enabled : DEFAULTS.enabled
  );
  const [preset,    setPreset]    = useState<JigglePreset>(() =>
    PRESETS.some(p => p.value === jiggleCfg.preset)
      ? (jiggleCfg.preset as JigglePreset)
      : DEFAULTS.preset
  );
  const [intensity, setIntensity] = useState<number>(() =>
    typeof jiggleCfg.intensity === 'number' ? jiggleCfg.intensity : DEFAULTS.intensity
  );
  const [breastIntensity, setBreastIntensity] = useState<number>(() =>
    typeof bodyPartsCfg.breast === 'number' ? bodyPartsCfg.breast : DEFAULTS.bodyParts.breast
  );
  const [buttIntensity, setButtIntensity] = useState<number>(() =>
    typeof bodyPartsCfg.butt === 'number' ? bodyPartsCfg.butt : DEFAULTS.bodyParts.butt
  );
  const [thighIntensity, setThighIntensity] = useState<number>(() =>
    typeof bodyPartsCfg.thigh === 'number' ? bodyPartsCfg.thigh : DEFAULTS.bodyParts.thigh
  );

  /* ── Bone-detection state ───────────────────────────────────────────── */
  const [detected,   setDetected]   = useState<boolean | null>(null);
  const [jointCount, setJointCount] = useState<number>(0);

  /* ── Per-character override state ───────────────────────────────────── */
  const activeCharacter = useAppStore(s => s.activeCharacter);
  const [charProfile, setCharProfile] = useState<CharacterPhysicsProfile | null>(null);
  const [charBodyType, setCharBodyType] = useState<CharacterPhysicsProfile['body_type']>('average');
  const [charSaving, setCharSaving] = useState(false);
  const [charProfileExpanded, setCharProfileExpanded] = useState(false);

  /* ── UI state ───────────────────────────────────────────────────────── */
  const [perPartExpanded, setPerPartExpanded] = useState(false);

  /* ── Debounce refs for persist ──────────────────────────────────────── */
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Debounced config persist helper. Cancels any pending write before
   * scheduling a new one so rapid slider drags only produce one save.
   *
   * @param patch - Partial jiggle config to deep-merge and save.
   */
  const debouncedPersist = useCallback(
    (patch: Record<string, unknown>) => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        const existing = (config.jiggle as Record<string, unknown> | undefined) ?? {};
        const merged = { ...existing, ...patch };
        save('jiggle', merged);
      }, PERSIST_DEBOUNCE_MS);
    },
    [config, save]
  );

  /* ── Mount: request current viewer state ────────────────────────────── */
  useEffect(() => {
    dispatchGetJiggleInfo();
  }, [dispatchGetJiggleInfo]);

  /* ── Load per-character profile when active character changes ────────── */
  useEffect(() => {
    if (!activeCharacter?.id) {
      setCharProfile(null);
      setCharBodyType('average');
      return;
    }
    api.getCharacterPhysics(activeCharacter.id)
      .then(({ profile }) => {
        setCharProfile(profile);
        setCharBodyType(profile?.body_type ?? 'average');
      })
      .catch(() => {});
  }, [activeCharacter?.id]);

  /* ── postMessage listener: jiggleInfo + jiggleDetection ─────────────── */
  useEffect(() => {
    /**
     * Handle inbound messages from the viewer iframe.
     *
     * @param event - The MessageEvent from the iframe's contentWindow.
     */
    function handleMessage(event: MessageEvent) {
      if (!event.data || typeof event.data !== 'object') return;

      const { type } = event.data as { type: string };

      if (type === 'jiggleInfo') {
        const payload = event.data as JiggleInfoPayload & { type: string };
        setEnabled(payload.enabled);
        if (PRESETS.some(p => p.value === payload.preset)) {
          setPreset(payload.preset as JigglePreset);
        }
        setIntensity(payload.intensity);
        if (payload.bodyPartIntensity.breast !== undefined) {
          setBreastIntensity(payload.bodyPartIntensity.breast);
        }
        if (payload.bodyPartIntensity.butt !== undefined) {
          setButtIntensity(payload.bodyPartIntensity.butt);
        }
        if (payload.bodyPartIntensity.thigh !== undefined) {
          setThighIntensity(payload.bodyPartIntensity.thigh);
        }
        setDetected(payload.detected);
      } else if (type === 'jiggleDetection') {
        const payload = event.data as JiggleDetectionPayload & { type: string };
        setDetected(payload.detected);
        setJointCount(payload.jointCount);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  /* ── Cleanup debounce on unmount ────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  /* ── Handlers ───────────────────────────────────────────────────────── */

  /**
   * Toggle global jiggle enabled state.
   *
   * @param next - The new enabled state.
   */
  function handleEnabled(next: boolean) {
    setEnabled(next);
    dispatchSetJiggleEnabled(next);
    const existing = (config.jiggle as Record<string, unknown> | undefined) ?? {};
    save('jiggle', { ...existing, enabled: next });
  }

  /**
   * Switch to a named preset and persist.
   *
   * @param p - The preset name to apply.
   */
  function handlePreset(p: JigglePreset) {
    setPreset(p);
    dispatchSetJigglePreset(p);
    const existing = (config.jiggle as Record<string, unknown> | undefined) ?? {};
    save('jiggle', { ...existing, preset: p });
  }

  /**
   * Update master intensity, dispatch to viewer, and debounce config persist.
   *
   * @param v - New intensity value (0.0–1.0).
   */
  function handleIntensity(v: number) {
    setIntensity(v);
    dispatchSetJiggleIntensity(v);
    debouncedPersist({ intensity: v });
  }

  /**
   * Update a per-body-part intensity slider.
   *
   * @param part - Which body part to adjust.
   * @param v    - New intensity value (0.0–1.0).
   */
  function handleBodyPart(part: BodyPart, v: number) {
    if (part === 'breast') setBreastIntensity(v);
    else if (part === 'butt') setButtIntensity(v);
    else setThighIntensity(v);

    dispatchSetJiggleIntensity(v, part);

    // Merge the single part into the saved body_parts object.
    const existingJiggle = (config.jiggle as Record<string, unknown> | undefined) ?? {};
    const existingParts  = (existingJiggle.body_parts as Record<string, unknown> | undefined) ?? {};
    debouncedPersist({
      body_parts: { ...existingParts, [part]: v },
    });
  }

  /** Restore all jiggle settings to the factory defaults. */
  function handleReset() {
    const d = DEFAULTS;

    setEnabled(d.enabled);
    setPreset(d.preset);
    setIntensity(d.intensity);
    setBreastIntensity(d.bodyParts.breast);
    setButtIntensity(d.bodyParts.butt);
    setThighIntensity(d.bodyParts.thigh);

    dispatchSetJiggleEnabled(d.enabled);
    dispatchSetJigglePreset(d.preset);
    dispatchSetJiggleIntensity(d.intensity);
    dispatchSetJiggleIntensity(d.bodyParts.breast, 'breast');
    dispatchSetJiggleIntensity(d.bodyParts.butt,   'butt');
    dispatchSetJiggleIntensity(d.bodyParts.thigh,  'thigh');

    save('jiggle', {
      enabled: d.enabled,
      preset:  d.preset,
      intensity: d.intensity,
      body_parts: { ...d.bodyParts },
    });
  }

  /**
   * Save the per-character body type and send the profile to the viewer.
   */
  async function handleSaveCharProfile() {
    if (!activeCharacter?.id) return;
    setCharSaving(true);
    try {
      const { profile } = await api.saveCharacterPhysics(activeCharacter.id, {
        body_type: charBodyType,
        breast_intensity: charProfile?.breast_intensity ?? null,
        butt_intensity: charProfile?.butt_intensity ?? null,
        thigh_intensity: charProfile?.thigh_intensity ?? null,
        preset_override: charProfile?.preset_override ?? null,
        intensity_override: charProfile?.intensity_override ?? null,
        enabled_override: charProfile?.enabled_override ?? null,
      });
      setCharProfile(profile);
    } finally {
      setCharSaving(false);
    }
  }

  /**
   * Clear the per-character profile override — falls back to global settings.
   */
  async function handleClearCharProfile() {
    if (!activeCharacter?.id) return;
    setCharSaving(true);
    try {
      await api.deleteCharacterPhysics(activeCharacter.id);
      setCharProfile(null);
      setCharBodyType('average');
    } finally {
      setCharSaving(false);
    }
  }

  /* ── Derived ────────────────────────────────────────────────────────── */

  /** Human-readable bone detection status line. */
  const detectionLine: string = (() => {
    if (detected === null) return 'Checking for jiggle bones…';
    if (!detected)         return 'No jiggle bones detected on current model.';
    const n    = jointCount;
    const noun = n === 1 ? 'bone' : 'bones';
    return `${n} breast ${noun} detected. Physics active.`;
  })();

  /* ── Shared style objects ───────────────────────────────────────────── */

  const sectionStyle: React.CSSProperties = {
    padding: '12px 0',
    borderTop: '1px solid var(--color-border-subtle)',
  };

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        padding: '0 4px',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          paddingBottom: '10px',
        }}
      >
        <Zap size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            letterSpacing: '0.02em',
          }}
        >
          Jiggle Physics
        </span>
      </div>

      {/* ── Global enable/disable ── */}
      <div
        style={{
          ...sectionStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <label
          htmlFor="jiggle-enabled"
          style={{
            fontSize: '0.72rem',
            color: 'var(--color-text)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          Enable Jiggle Physics
        </label>
        <Toggle
          checked={enabled}
          onChange={handleEnabled}
          ariaLabel="Enable jiggle physics"
        />
      </div>

      {/* ── Preset segmented control ── */}
      <div style={sectionStyle}>
        <span
          style={{
            display: 'block',
            fontSize: '0.68rem',
            color: 'var(--color-text-tertiary)',
            marginBottom: '6px',
          }}
        >
          Preset
        </span>
        <div
          role="group"
          aria-label="Jiggle preset"
          style={{
            display: 'flex',
            gap: '4px',
            flexWrap: 'wrap',
          }}
        >
          {PRESETS.map(({ value, label }) => {
            const active = preset === value;
            return (
              <button
                key={value}
                onClick={() => handlePreset(value)}
                aria-pressed={active}
                style={{
                  padding: '3px 10px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.62rem',
                  fontWeight: active ? 600 : 400,
                  backgroundColor: active
                    ? 'var(--color-accent)'
                    : 'var(--color-background)',
                  color: active
                    ? 'var(--color-accent-text, #fff)'
                    : 'var(--color-text-tertiary)',
                  transition: 'all 0.15s ease',
                  opacity: enabled ? 1 : 0.45,
                  pointerEvents: enabled ? 'auto' : 'none',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Master intensity ── */}
      <div style={sectionStyle}>
        <span
          style={{
            display: 'block',
            fontSize: '0.68rem',
            color: 'var(--color-text-tertiary)',
            marginBottom: '4px',
          }}
        >
          Intensity
        </span>
        <div
          style={{
            opacity: enabled ? 1 : 0.45,
            pointerEvents: enabled ? 'auto' : 'none',
          }}
        >
          <SliderRow
            label=""
            value={intensity}
            min={0}
            max={1}
            step={0.05}
            onChange={handleIntensity}
          />
        </div>
      </div>

      {/* ── Per-body-part (collapsible) ── */}
      <div style={sectionStyle}>
        <button
          onClick={() => setPerPartExpanded(v => !v)}
          aria-expanded={perPartExpanded}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            width: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 0',
            color: 'var(--color-text-secondary)',
            fontSize: '0.72rem',
            fontWeight: 600,
          }}
        >
          {perPartExpanded
            ? <ChevronDown size={13} />
            : <ChevronRight size={13} />}
          Per-Body-Part
        </button>

        {perPartExpanded && (
          <div
            style={{
              marginTop: '6px',
              paddingLeft: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              opacity: enabled ? 1 : 0.45,
              pointerEvents: enabled ? 'auto' : 'none',
            }}
          >
            <SliderRow
              label="Breast"
              value={breastIntensity}
              min={0}
              max={1}
              step={0.05}
              onChange={v => handleBodyPart('breast', v)}
            />
            <SliderRow
              label="Butt"
              value={buttIntensity}
              min={0}
              max={1}
              step={0.05}
              onChange={v => handleBodyPart('butt', v)}
            />
            <SliderRow
              label="Thigh"
              value={thighIntensity}
              min={0}
              max={1}
              step={0.05}
              onChange={v => handleBodyPart('thigh', v)}
            />
          </div>
        )}
      </div>

      {/* ── Bone detection status ── */}
      <div
        role="status"
        aria-live="polite"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '5px',
          padding: '8px 0',
          borderTop: '1px solid var(--color-border-subtle)',
        }}
      >
        <Info
          size={12}
          style={{
            color: detected
              ? 'var(--color-accent)'
              : 'var(--color-text-tertiary)',
            marginTop: '1px',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: '0.65rem',
            color: detected
              ? 'var(--color-text-secondary)'
              : 'var(--color-text-tertiary)',
            lineHeight: 1.4,
          }}
        >
          {detectionLine}
        </span>
      </div>

      {/* ── Per-character override (collapsible) ── */}
      {activeCharacter && (
        <div style={sectionStyle}>
          <button
            onClick={() => setCharProfileExpanded(v => !v)}
            aria-expanded={charProfileExpanded}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              width: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 0',
              color: 'var(--color-text-secondary)',
              fontSize: '0.72rem',
              fontWeight: 600,
            }}
          >
            {charProfileExpanded
              ? <ChevronDown size={13} />
              : <ChevronRight size={13} />}
            <User size={12} style={{ flexShrink: 0 }} />
            {activeCharacter.name} Override
            {charProfile && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: '0.6rem',
                  color: 'var(--color-accent)',
                  fontWeight: 400,
                }}
              >
                {charProfile.body_type}
              </span>
            )}
          </button>

          {charProfileExpanded && (
            <div style={{ marginTop: '8px', paddingLeft: '14px' }}>
              {/* Body type selector */}
              <div style={{ marginBottom: '8px' }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.68rem',
                    color: 'var(--color-text-tertiary)',
                    marginBottom: '5px',
                  }}
                >
                  Body Type
                </span>
                <div
                  role="group"
                  aria-label="Body type"
                  style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}
                >
                  {BODY_TYPES.map(({ value, label }) => {
                    const active = charBodyType === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setCharBodyType(value)}
                        aria-pressed={active}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '10px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.6rem',
                          fontWeight: active ? 600 : 400,
                          backgroundColor: active
                            ? 'var(--color-accent)'
                            : 'var(--color-background)',
                          color: active
                            ? 'var(--color-accent-text, #fff)'
                            : 'var(--color-text-tertiary)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status note */}
              {charProfile ? (
                <p
                  style={{
                    fontSize: '0.62rem',
                    color: 'var(--color-text-tertiary)',
                    margin: '0 0 8px',
                    lineHeight: 1.4,
                  }}
                >
                  Override active — body type multipliers applied on top of global preset.
                </p>
              ) : (
                <p
                  style={{
                    fontSize: '0.62rem',
                    color: 'var(--color-text-tertiary)',
                    margin: '0 0 8px',
                    lineHeight: 1.4,
                  }}
                >
                  No override saved — using global settings.
                </p>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleSaveCharProfile}
                  disabled={charSaving}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '7px',
                    border: '1px solid var(--color-accent)',
                    background: 'var(--color-accent)',
                    color: 'var(--color-accent-text, #fff)',
                    cursor: charSaving ? 'default' : 'pointer',
                    fontSize: '0.65rem',
                    opacity: charSaving ? 0.6 : 1,
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  {charSaving ? 'Saving…' : 'Save Override'}
                </button>
                {charProfile && (
                  <button
                    onClick={handleClearCharProfile}
                    disabled={charSaving}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '7px',
                      border: '1px solid var(--color-border)',
                      background: 'none',
                      cursor: charSaving ? 'default' : 'pointer',
                      fontSize: '0.65rem',
                      color: 'var(--color-text-secondary)',
                      opacity: charSaving ? 0.6 : 1,
                    }}
                  >
                    Clear Override
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Reset button ── */}
      <div
        style={{
          paddingTop: '4px',
          borderTop: '1px solid var(--color-border-subtle)',
        }}
      >
        <button
          onClick={handleReset}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 12px',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            background: 'none',
            cursor: 'pointer',
            fontSize: '0.68rem',
            color: 'var(--color-text-secondary)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'var(--color-bg-secondary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          }}
        >
          <RotateCcw size={12} />
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
