import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Wind, Eye, EyeOff, RotateCcw, Save } from 'lucide-react';
import { useViewerStore } from '../stores/viewerStore';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

// ── Types ───────────────────────────────────────────────────────────────────────

interface SpringBoneJoint {
  index: number;
  boneName: string;
  stiffness: number;
  drag: number;
  gravityPower: number;
  gravityDir: { x: number; y: number; z: number };
  hitRadius: number;
}

interface ColliderGroup {
  index: number;
  name: string;
  colliders: Array<{ type: string; radius: number; offset: { x: number; y: number; z: number } | null }>;
}

interface SpringBoneInfo {
  joints: SpringBoneJoint[];
  colliderGroups: ColliderGroup[];
}

// ── Presets ──────────────────────────────────────────────────────────────────────

/** Named parameter presets for quick spring bone tuning. */
const PRESETS: Record<string, { stiffness: number; drag: number; gravityPower: number; label: string }> = {
  stiff: { stiffness: 8.0, drag: 0.8, gravityPower: 0.3, label: 'Stiff' },
  default: { stiffness: 1.0, drag: 0.4, gravityPower: 1.0, label: 'Default' },
  flowy: { stiffness: 0.3, drag: 0.15, gravityPower: 1.5, label: 'Flowy' },
  windy: { stiffness: 0.5, drag: 0.2, gravityPower: 0.8, label: 'Windy' },
};

// ── Environment Presets ──────────────────────────────────────────────────────────

/**
 * Environmental physics presets that combine spring bone parameters with wind state.
 * Each preset simulates a different real-world environment by tuning stiffness,
 * drag, gravity, and wind direction/strength together.
 */
interface EnvironmentPreset {
  label: string;
  icon: string;
  spring: { stiffness: number; drag: number; gravityPower: number };
  wind: { enabled: boolean; angle: number; strength: number };
}

const ENV_PRESETS: Record<string, EnvironmentPreset> = {
  indoor: {
    label: 'Indoor',
    icon: '🏠',
    spring: { stiffness: 2.0, drag: 0.6, gravityPower: 1.0 },
    wind: { enabled: false, angle: 0, strength: 0 },
  },
  breeze: {
    label: 'Breeze',
    icon: '🍃',
    spring: { stiffness: 0.8, drag: 0.3, gravityPower: 1.0 },
    wind: { enabled: true, angle: 90, strength: 0.3 },
  },
  outdoor: {
    label: 'Outdoor',
    icon: '🌳',
    spring: { stiffness: 0.5, drag: 0.2, gravityPower: 0.8 },
    wind: { enabled: true, angle: 45, strength: 0.6 },
  },
  storm: {
    label: 'Storm',
    icon: '⛈️',
    spring: { stiffness: 0.3, drag: 0.1, gravityPower: 0.5 },
    wind: { enabled: true, angle: 0, strength: 1.5 },
  },
  underwater: {
    label: 'Underwater',
    icon: '🌊',
    spring: { stiffness: 0.15, drag: 0.7, gravityPower: 0.3 },
    wind: { enabled: false, angle: 0, strength: 0 },
  },
};

// ── Component ───────────────────────────────────────────────────────────────────

interface SpringBonePanelProps {
  /** Whether the parent panel is open (controls data fetching). */
  isOpen: boolean;
}

/**
 * Spring bone physics inspector and wind controls.
 *
 * Displays per-joint sliders for stiffness/drag/gravity, wind direction
 * and strength controls, collider debug toggle, and parameter presets.
 * Communicates with the VRM viewer iframe via viewerStore dispatch.
 *
 * @example
 * <SpringBonePanel isOpen={modelPanelOpen} />
 */
export function SpringBonePanel({ isOpen }: SpringBonePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [info, setInfo] = useState<SpringBoneInfo | null>(null);
  const [windEnabled, setWindEnabled] = useState(false);
  const [windAngle, setWindAngle] = useState(0); // degrees, 0 = from right (+X)
  const [windStrength, setWindStrength] = useState(0.5);
  const [colliderDebug, setColliderDebug] = useState(false);
  const [selectedJoint, setSelectedJoint] = useState<number | null>(null);
  // Listen for spring bone info responses from the viewer
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'springBoneInfo') {
        setInfo({ joints: e.data.joints || [], colliderGroups: e.data.colliderGroups || [] });
      } else if (e.data?.type === 'colliderDebugState') {
        setColliderDebug(!!e.data.active);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Fetch spring bone info when panel opens
  useEffect(() => {
    if (isOpen && expanded) {
      useViewerStore.getState().dispatchGetSpringBoneInfo();
    }
  }, [isOpen, expanded]);

  /**
   * Update a single joint's parameters via viewerStore.
   */
  const updateJoint = useCallback((index: number, params: { stiffness?: number; drag?: number; gravityPower?: number }) => {
    useViewerStore.getState().dispatchSetSpringBoneParams(index, params);
    // Update local state optimistically
    setInfo(prev => {
      if (!prev) return prev;
      const joints = [...prev.joints];
      const j = { ...joints[index] };
      if (params.stiffness !== undefined) j.stiffness = params.stiffness;
      if (params.drag !== undefined) j.drag = params.drag;
      if (params.gravityPower !== undefined) j.gravityPower = params.gravityPower;
      joints[index] = j;
      return { ...prev, joints };
    });
  }, []);

  /**
   * Apply an environment preset — sets spring bone params AND wind state together.
   */
  const applyEnvironment = useCallback((envKey: string) => {
    const env = ENV_PRESETS[envKey];
    if (!env || !info) return;
    // Apply spring params to all joints
    for (const joint of info.joints) {
      useViewerStore.getState().dispatchSetSpringBoneParams(joint.index, {
        stiffness: env.spring.stiffness,
        drag: env.spring.drag,
        gravityPower: env.spring.gravityPower,
      });
    }
    setInfo(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        joints: prev.joints.map(j => ({
          ...j,
          stiffness: env.spring.stiffness,
          drag: env.spring.drag,
          gravityPower: env.spring.gravityPower,
        })),
      };
    });
    // Apply wind state
    setWindEnabled(env.wind.enabled);
    setWindAngle(env.wind.angle);
    setWindStrength(env.wind.strength);
    if (env.wind.enabled) {
      const rad = (env.wind.angle * Math.PI) / 180;
      useViewerStore.getState().dispatchWind(Math.cos(rad), 0, Math.sin(rad), env.wind.strength);
    } else {
      useViewerStore.getState().dispatchWind(0, 0, 0, 0);
    }
  }, [info]);

  /**
   * Apply a preset to all joints.
   */
  const applyPreset = useCallback((presetKey: string) => {
    const preset = PRESETS[presetKey];
    if (!preset || !info) return;
    for (const joint of info.joints) {
      useViewerStore.getState().dispatchSetSpringBoneParams(joint.index, {
        stiffness: preset.stiffness,
        drag: preset.drag,
        gravityPower: preset.gravityPower,
      });
    }
    // Optimistic update
    setInfo(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        joints: prev.joints.map(j => ({
          ...j,
          stiffness: preset.stiffness,
          drag: preset.drag,
          gravityPower: preset.gravityPower,
        })),
      };
    });
    // If applying "windy" preset, also enable wind
    if (presetKey === 'windy' && !windEnabled) {
      setWindEnabled(true);
      const rad = (windAngle * Math.PI) / 180;
      useViewerStore.getState().dispatchWind(Math.cos(rad), 0, Math.sin(rad), windStrength);
    }
  }, [info, windEnabled, windAngle, windStrength]);

  /**
   * Toggle wind on/off and update viewer.
   */
  const toggleWind = useCallback(() => {
    const newEnabled = !windEnabled;
    setWindEnabled(newEnabled);
    if (newEnabled) {
      const rad = (windAngle * Math.PI) / 180;
      useViewerStore.getState().dispatchWind(Math.cos(rad), 0, Math.sin(rad), windStrength);
    } else {
      useViewerStore.getState().dispatchWind(0, 0, 0, 0);
    }
  }, [windEnabled, windAngle, windStrength]);

  /**
   * Update wind parameters when sliders change.
   */
  const updateWind = useCallback((angle: number, strength: number) => {
    setWindAngle(angle);
    setWindStrength(strength);
    if (windEnabled) {
      const rad = (angle * Math.PI) / 180;
      useViewerStore.getState().dispatchWind(Math.cos(rad), 0, Math.sin(rad), strength);
    }
  }, [windEnabled]);

  const toggleColliderDebug = useCallback(() => {
    useViewerStore.getState().dispatchToggleColliderDebug();
  }, []);

  const refreshInfo = useCallback(() => {
    useViewerStore.getState().dispatchGetSpringBoneInfo();
  }, []);

  const [saving, setSaving] = useState(false);
  const savePreset = useCallback(async () => {
    const charId = useAppStore.getState().activeCharacter?.id;
    if (!charId || !info?.joints?.length) return;
    setSaving(true);
    try {
      await api.saveSpringBonePreset(charId, {
        joints: info.joints.map(j => ({
          index: j.index,
          boneName: j.boneName,
          stiffness: j.stiffness,
          dragForce: j.drag,
          gravityPower: j.gravityPower,
        })),
      });
    } finally {
      setSaving(false);
    }
  }, [info]);

  const jointCount = info?.joints?.length ?? 0;
  const colliderCount = info?.colliderGroups?.reduce((acc, g) => acc + g.colliders.length, 0) ?? 0;

  return (
    <div
      style={{
        borderTop: '1px solid var(--color-border)',
        padding: '8px 12px',
      }}
    >
      {/* Header — clickable to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          background: 'none',
          border: 'none',
          color: 'var(--color-text-primary)',
          cursor: 'pointer',
          padding: 0,
          fontSize: '13px',
          fontWeight: 500,
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Spring Bones</span>
        {jointCount > 0 && (
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: '11px', marginLeft: 'auto' }}>
            {jointCount} joints / {colliderCount} colliders
          </span>
        )}
      </button>

      {expanded && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Environment presets — combined spring + wind */}
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {Object.entries(ENV_PRESETS).map(([key, env]) => (
              <button
                key={key}
                onClick={() => applyEnvironment(key)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '14px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-secondary)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
                title={`${env.label}: stiff=${env.spring.stiffness} drag=${env.spring.drag} wind=${env.wind.enabled ? env.wind.strength : 'off'}`}
              >
                <span style={{ fontSize: '12px' }}>{env.icon}</span>
                {env.label}
              </button>
            ))}
          </div>

          {/* Spring bone parameter presets row */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                style={{
                  padding: '3px 10px',
                  borderRadius: '12px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-secondary)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={refreshInfo}
              title="Refresh spring bone data"
              style={{
                marginLeft: 'auto',
                padding: '3px 6px',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <RotateCcw size={12} />
            </button>
          </div>

          {/* Wind controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={toggleWind}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  border: '1px solid var(--color-border)',
                  background: windEnabled ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: windEnabled ? '#fff' : 'var(--color-text-secondary)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                <Wind size={12} />
                {windEnabled ? 'Wind On' : 'Breeze'}
              </button>
              {windEnabled && (
                <>
                  <label style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                    Dir
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={15}
                    value={windAngle}
                    onChange={(e) => updateWind(Number(e.target.value), windStrength)}
                    style={{ flex: 1, height: '4px' }}
                  />
                  <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', minWidth: '30px' }}>
                    {windAngle}°
                  </span>
                </>
              )}
            </div>
            {windEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', minWidth: '60px' }}>
                  Strength
                </label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={windStrength}
                  onChange={(e) => updateWind(windAngle, Number(e.target.value))}
                  style={{ flex: 1, height: '4px' }}
                />
                <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', minWidth: '30px' }}>
                  {windStrength.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Collider debug toggle */}
          <button
            onClick={toggleColliderDebug}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 10px',
              borderRadius: '12px',
              border: '1px solid var(--color-border)',
              background: colliderDebug ? 'rgba(0,255,136,0.15)' : 'var(--color-surface)',
              color: colliderDebug ? '#00ff88' : 'var(--color-text-secondary)',
              fontSize: '11px',
              cursor: 'pointer',
              width: 'fit-content',
            }}
          >
            {colliderDebug ? <Eye size={12} /> : <EyeOff size={12} />}
            {colliderDebug ? 'Colliders Visible' : 'Show Colliders'}
          </button>

          {/* Per-joint controls (collapsed by default, click joint to expand) */}
          {info && info.joints.length > 0 && (
            <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '11px' }}>
              {info.joints.map((joint) => (
                <div
                  key={joint.index}
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    padding: '4px 0',
                  }}
                >
                  <button
                    onClick={() => setSelectedJoint(selectedJoint === joint.index ? null : joint.index)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      padding: '2px 0',
                      fontSize: '11px',
                    }}
                  >
                    {selectedJoint === joint.index ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    <span style={{ fontFamily: 'monospace' }}>{joint.boneName}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)' }}>
                      s:{joint.stiffness.toFixed(1)} d:{joint.drag.toFixed(2)} g:{joint.gravityPower.toFixed(1)}
                    </span>
                  </button>

                  {selectedJoint === joint.index && (
                    <div style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                      <SliderRow
                        label="Stiffness"
                        min={0} max={10} step={0.1}
                        value={joint.stiffness}
                        onChange={(v) => updateJoint(joint.index, { stiffness: v })}
                      />
                      <SliderRow
                        label="Drag"
                        min={0} max={1} step={0.01}
                        value={joint.drag}
                        onChange={(v) => updateJoint(joint.index, { drag: v })}
                      />
                      <SliderRow
                        label="Gravity"
                        min={0} max={2} step={0.05}
                        value={joint.gravityPower}
                        onChange={(v) => updateJoint(joint.index, { gravityPower: v })}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {info && info.joints.length === 0 && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
              No spring bones detected. Load a VRM model with hair/clothing physics.
            </div>
          )}

          {info && info.joints.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                onClick={savePreset}
                disabled={saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: saving ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                  fontSize: '11px',
                  cursor: saving ? 'default' : 'pointer',
                }}
              >
                <Save size={11} />
                {saving ? 'Saving…' : 'Save Preset'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Slider Sub-component ────────────────────────────────────────────────────────

interface SliderRowProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

/**
 * Compact labeled slider row for spring bone parameter editing.
 */
function SliderRow({ label, min, max, step, value, onChange }: SliderRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <label style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', minWidth: '50px' }}>
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, height: '3px' }}
      />
      <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', minWidth: '30px', textAlign: 'right', fontFamily: 'monospace' }}>
        {value.toFixed(step < 0.1 ? 2 : 1)}
      </span>
    </div>
  );
}
