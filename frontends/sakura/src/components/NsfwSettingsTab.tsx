/**
 * NsfwSettingsTab — settings panel for NSFW / Intimacy configuration.
 *
 * Covers four domains:
 *   1. Power Dynamics — per-character dynamic type + intensity (fetched from
 *      `/api/characters/{id}/power-dynamic` on character change).
 *   2. Jealousy & Possessiveness — global toggle stored in app config.
 *   3. Spontaneity Level — four-option segmented control stored in app config.
 *   4. Time Features — toggle that gates midnight confessional mode, morning-
 *      after scenarios, anniversary hints, and time-of-day moods.
 *
 * This component is intentionally self-contained: it manages its own local
 * state for the power-dynamic API call so that SettingsView.tsx can import it
 * without any additional wiring beyond passing the standard TabProps.
 */

import { useState, useEffect, useCallback } from 'react';
import { Flame, Clock, Zap, Heart } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { SettingField } from './SettingField';

/* ─── Types ────────────────────────────────────────────────────────────────── */

/** Allowed values for the per-character power-dynamic type. */
type DynamicType = 'equal' | 'dom_char' | 'sub_char' | 'switch' | 'playful';

/** Payload returned by `GET /api/characters/{id}/power-dynamic`. */
interface PowerDynamicResponse {
  char_id: number;
  dynamic_type: DynamicType;
  /** Intensity from 1 (minimal) to 5 (maximal). */
  intensity: number;
}

/** Allowed values for the spontaneity level setting. */
type SpontaneityLevel = 'off' | 'subtle' | 'moderate' | 'bold';

/** Props passed in from SettingsView (standard tab contract). */
export interface NsfwSettingsTabProps {
  /** Full app config object (nested structure). */
  config: Record<string, unknown>;
  /** Persists a nested config key (e.g. `"intimacy.jealousy_enabled"`). */
  save: (key: string, value: unknown) => void;
  /** Reads a nested config key with an optional fallback. */
  cfg: (key: string, fallback?: unknown) => unknown;
}

/* ─── Constants ─────────────────────────────────────────────────────────────── */

const DYNAMIC_OPTIONS: Array<{ value: DynamicType; label: string; description: string }> = [
  { value: 'equal',    label: 'Equal',     description: 'Balanced give-and-take between you and your companion' },
  { value: 'dom_char', label: 'Dom (her)', description: 'Your companion leads and takes charge' },
  { value: 'sub_char', label: 'Sub (her)', description: 'Your companion defers and follows your lead' },
  { value: 'switch',   label: 'Switch',    description: 'Dynamic shifts naturally based on mood and context' },
  { value: 'playful',  label: 'Playful',   description: 'Teasing, banter-heavy, light-hearted tension' },
];

const SPONTANEITY_OPTIONS: Array<{ value: SpontaneityLevel; label: string; description: string }> = [
  { value: 'off',      label: 'Off',      description: 'Only responds when spoken to' },
  { value: 'subtle',   label: 'Subtle',   description: 'Occasional hints and implications' },
  { value: 'moderate', label: 'Moderate', description: 'Proactive flirting and suggestive moments' },
  { value: 'bold',     label: 'Bold',     description: 'Initiates frequently and with confidence' },
];

/* ─── Sub-components ────────────────────────────────────────────────────────── */

/** Section header using the project-standard uppercase label style. */
function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <span style={{ color: 'var(--color-accent)' }}>{icon}</span>
      <h3
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {title}
      </h3>
    </div>
  );
}

/** Toggle switch that uses CSS variable accent color. */
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
        backgroundColor: checked ? 'var(--color-accent)' : 'var(--color-border-subtle)',
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
 * Settings tab component for NSFW / Intimacy configuration.
 *
 * Rendered inside `SettingsView` when the "Intimacy" tab is active. Manages
 * its own fetch lifecycle for the power-dynamic API so that the parent view
 * stays stateless with respect to NSFW data.
 *
 * @param config - Full app config from `useAppStore().config`.
 * @param save   - Persists a dot-notated config key (e.g. `"intimacy.jealousy_enabled"`).
 * @param cfg    - Reads a dot-notated config key with an optional fallback value.
 *
 * @example
 * ```tsx
 * <NsfwSettingsTab config={config} save={save} cfg={cfg} />
 * ```
 */
export function NsfwSettingsTab({ save, cfg }: NsfwSettingsTabProps) {
  const { characters, activeCharacter } = useAppStore();

  /* ── Local state ────────────────────────────────────────────────────── */

  /** Character ID selected in the power-dynamic picker (defaults to active). */
  const [selectedCharId, setSelectedCharId] = useState<number | null>(
    activeCharacter?.id ?? null
  );

  /** Power dynamic fetched from the API for the currently selected character. */
  const [dynamicType, setDynamicType] = useState<DynamicType>('equal');
  const [intensity, setIntensity] = useState<number>(3);
  const [powerLoading, setPowerLoading] = useState(false);
  const [powerSaving, setPowerSaving] = useState(false);
  const [powerError, setPowerError] = useState<string | null>(null);

  /* ── Power-dynamic fetch ────────────────────────────────────────────── */

  /** Fetch the current power-dynamic settings for the selected character. */
  const fetchPowerDynamic = useCallback(async (charId: number) => {
    setPowerLoading(true);
    setPowerError(null);
    try {
      const res = await fetch(`/api/characters/${charId}/power-dynamic`);
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data = (await res.json()) as PowerDynamicResponse;
      setDynamicType(data.dynamic_type);
      setIntensity(data.intensity);
    } catch (err) {
      // Treat 404 (not yet set) as a clean default rather than a hard error.
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('404')) {
        setDynamicType('equal');
        setIntensity(3);
      } else {
        setPowerError('Could not load power dynamic settings.');
      }
    } finally {
      setPowerLoading(false);
    }
  }, []);

  // Re-fetch whenever the selected character changes.
  useEffect(() => {
    if (selectedCharId !== null) {
      void fetchPowerDynamic(selectedCharId);
    }
  }, [selectedCharId, fetchPowerDynamic]);

  // Keep selected character in sync when activeCharacter changes externally.
  useEffect(() => {
    if (activeCharacter && selectedCharId === null) {
      setSelectedCharId(activeCharacter.id);
    }
  }, [activeCharacter, selectedCharId]);

  /* ── Power-dynamic save ─────────────────────────────────────────────── */

  /**
   * Persist the current dynamic_type + intensity to the API.
   *
   * @param nextType      - The dynamic type to save.
   * @param nextIntensity - The intensity value (1–5) to save.
   */
  const savePowerDynamic = useCallback(
    async (nextType: DynamicType, nextIntensity: number) => {
      if (selectedCharId === null) return;
      setPowerSaving(true);
      setPowerError(null);
      try {
        const res = await fetch(`/api/characters/${selectedCharId}/power-dynamic`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dynamic_type: nextType, intensity: nextIntensity }),
        });
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
      } catch {
        setPowerError('Failed to save power dynamic settings.');
      } finally {
        setPowerSaving(false);
      }
    },
    [selectedCharId]
  );

  /* ── Derived config values ──────────────────────────────────────────── */

  const jealousyEnabled = cfg('intimacy.jealousy_enabled', false) as boolean;
  const spontaneityLevel = (cfg('intimacy.spontaneity_level', 'subtle') as string) as SpontaneityLevel;
  const timeFeaturesEnabled = cfg('intimacy.time_features_enabled', true) as boolean;

  /* ── Styles ─────────────────────────────────────────────────────────── */

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-surface)',
    borderRadius: 'var(--radius-card)',
    border: '1px solid var(--color-border-subtle)',
    boxShadow: 'var(--shadow-card)',
    padding: '16px 20px',
    marginBottom: 16,
  };

  const selectStyle: React.CSSProperties = {
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    borderRadius: 'var(--radius-button)',
    padding: '5px 10px',
    fontSize: 13,
    cursor: 'pointer',
  };

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div style={{ padding: '16px 20px', maxWidth: 680 }}>

      {/* ── Section 1: Power Dynamics ──────────────────────────────────── */}
      <div style={cardStyle}>
        <SectionHeader title="Power Dynamics" icon={<Flame size={14} />} />

        {/* Character selector */}
        <SettingField
          label="Character"
          description="Choose which character's power dynamic you are editing."
          tier={0}
        >
          <select
            style={selectStyle}
            value={selectedCharId ?? ''}
            onChange={e => setSelectedCharId(Number(e.target.value))}
            aria-label="Select character for power dynamic"
          >
            {characters.length === 0 && (
              <option value="">No characters</option>
            )}
            {characters.map(char => (
              <option key={char.id} value={char.id}>
                {char.name}
              </option>
            ))}
          </select>
        </SettingField>

        {powerError && (
          <p
            className="text-xs mb-3"
            style={{ color: 'var(--color-error, #ef4444)' }}
            role="alert"
          >
            {powerError}
          </p>
        )}

        {/* Dynamic type selector */}
        <SettingField
          label="Dynamic type"
          description="Sets the relational power archetype between you and your companion."
          tooltip="This shapes how the character initiates, responds, and expresses dominance or deference in intimate contexts."
          tier={0}
        >
          <select
            style={{ ...selectStyle, opacity: powerLoading ? 0.5 : 1 }}
            value={dynamicType}
            disabled={powerLoading || selectedCharId === null}
            onChange={e => {
              const next = e.target.value as DynamicType;
              setDynamicType(next);
              void savePowerDynamic(next, intensity);
            }}
            aria-label="Dynamic type"
          >
            {DYNAMIC_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </SettingField>

        {/* Dynamic description hint */}
        {(() => {
          const selected = DYNAMIC_OPTIONS.find(o => o.value === dynamicType);
          return selected ? (
            <p
              className="text-xs mb-3 mt-1"
              style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}
            >
              {selected.description}
            </p>
          ) : null;
        })()}

        {/* Intensity slider */}
        <SettingField
          label={`Intensity — ${intensity} / 5`}
          description="Controls how strongly the dynamic manifests in dialogue and reactions."
          tooltip="1 = barely noticeable subtext. 5 = overt, explicit power expression."
          tier={0}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)', minWidth: 10 }}>1</span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={intensity}
              disabled={powerLoading || selectedCharId === null}
              aria-label="Intensity level"
              style={{ width: 120, accentColor: 'var(--color-accent)', cursor: 'pointer' }}
              onChange={e => {
                const next = Number(e.target.value);
                setIntensity(next);
              }}
              onMouseUp={() => void savePowerDynamic(dynamicType, intensity)}
              onKeyUp={() => void savePowerDynamic(dynamicType, intensity)}
            />
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)', minWidth: 10 }}>5</span>
          </div>
        </SettingField>

        {/* Saving indicator */}
        {powerSaving && (
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Saving…
          </p>
        )}
      </div>

      {/* ── Section 2: Jealousy & Possessiveness ───────────────────────── */}
      <div style={cardStyle}>
        <SectionHeader title="Jealousy &amp; Possessiveness" icon={<Heart size={14} />} />

        <SettingField
          label="Enable jealousy"
          description="When on, your companion may express jealousy or possessiveness when you mention other people, relationships, or activities that exclude her."
          tooltip="Adds emotional texture and realism to the relationship. Disable if you prefer a more relaxed, non-jealous companion."
          tier={0}
        >
          <Toggle
            checked={jealousyEnabled}
            onChange={val => save('intimacy.jealousy_enabled', val)}
            ariaLabel="Toggle jealousy and possessiveness"
          />
        </SettingField>
      </div>

      {/* ── Section 3: Spontaneity ──────────────────────────────────────── */}
      <div style={cardStyle}>
        <SectionHeader title="Spontaneity" icon={<Zap size={14} />} />

        <SettingField
          label="Spontaneity level"
          description="How often your companion initiates flirtatious or intimate moments unprompted."
          tooltip="Higher levels mean your companion will more frequently bring up intimate topics, tease, or flirt without being asked."
          tier={0}
        >
          {/* Segmented control */}
          <div
            style={{
              display: 'flex',
              gap: 2,
              backgroundColor: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-button)',
              padding: 2,
            }}
            role="radiogroup"
            aria-label="Spontaneity level"
          >
            {SPONTANEITY_OPTIONS.map(opt => {
              const active = spontaneityLevel === opt.value;
              return (
                <button
                  key={opt.value}
                  role="radio"
                  aria-checked={active}
                  title={opt.description}
                  onClick={() => save('intimacy.spontaneity_level', opt.value)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    borderRadius: 'calc(var(--radius-button) - 2px)',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? 'var(--color-accent-text, #fff)' : 'var(--color-text-secondary)',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </SettingField>

        {/* Description of current selection */}
        {(() => {
          const selected = SPONTANEITY_OPTIONS.find(o => o.value === spontaneityLevel);
          return selected ? (
            <p
              className="text-xs mt-1"
              style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}
            >
              {selected.description}
            </p>
          ) : null;
        })()}
      </div>

      {/* ── Section 4: Time Features ────────────────────────────────────── */}
      <div style={cardStyle}>
        <SectionHeader title="Time-Aware Features" icon={<Clock size={14} />} />

        <SettingField
          label="Enable time features"
          description={
            <>
              Gates all time-dependent behaviour:{' '}
              <span style={{ color: 'var(--color-text-primary)' }}>
                midnight confessional mode, morning-after scenarios, anniversary hints,
              </span>{' '}
              and time-of-day mood shifts. Disable to keep conversations time-neutral.
            </>
          }
          tooltip="When off, your companion behaves the same regardless of the time of day or whether today is a special date."
          tier={0}
        >
          <Toggle
            checked={timeFeaturesEnabled}
            onChange={val => save('intimacy.time_features_enabled', val)}
            ariaLabel="Toggle time-aware features"
          />
        </SettingField>
      </div>

    </div>
  );
}
