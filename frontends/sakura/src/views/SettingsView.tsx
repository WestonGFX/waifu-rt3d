import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain, Volume2, Palette, Shield, Image, Settings, Package, User, Monitor,
  Eye, Wrench, Lightbulb, Cpu, RefreshCw, CheckCircle, HelpCircle, ExternalLink, Wand2,
  ChevronDown, ChevronRight, Upload, Lock, Heart
} from 'lucide-react';
import type { ModelCapabilities } from '../lib/api';
import type { LayoutMode, ReplyLengthMode } from '../stores/appStore';
import { useAppStore } from '../stores/appStore';
import { useWizardStore } from '../stores/wizardStore';
import { useTheme } from '../hooks/useTheme';
import type { ThemeMode } from '../hooks/useTheme';
import { SettingField } from '../components/SettingField';
import { VoicePicker } from '../components/VoicePicker';
import { VoiceSampleUploader } from '../components/VoiceSampleUploader';
import { TTSModelsPanel } from '../components/TTSModelsPanel';
import { ModelManagerPanel } from '../components/ModelManagerPanel';
import { api } from '../lib/api';
import { ExpressionPortraitGrid } from '../components/ExpressionPortraitGrid';
import { LinkStatusPanel } from '../components/LinkStatusPanel';
import { useToastStore } from '../components/ToastQueue';
import { FormatRulesEditor } from '../components/FormatRulesEditor';
import { NsfwSettingsTab } from '../components/NsfwSettingsTab';

/* ─── Helper: deep-get nested config key like "llm.model" ──────────── */
function cfgGet(config: Record<string, unknown>, key: string, fallback: unknown = ''): unknown {
  const parts = key.split('.');
  let cur: unknown = config;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return fallback;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur ?? fallback;
}

/* ─── VRM performance tier classification ───────────────────────────── */
/**
 * Map triangle count to a human-readable performance tier with color coding.
 *
 * @param triangles - Total triangle count of the loaded VRM model.
 * @returns Tier metadata: label, color, background tint, and description.
 */
function getVrmTier(triangles: number) {
  if (triangles < 20_000)  return { label: 'Light',    color: '#39c96e', bg: 'rgba(57,201,110,0.10)',  desc: 'Runs smoothly on any hardware' };
  if (triangles < 60_000)  return { label: 'Moderate', color: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  desc: 'Good performance on mainstream GPUs' };
  if (triangles < 120_000) return { label: 'Detailed', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  desc: 'High-end GPU recommended' };
  return                          { label: 'High-res', color: '#f44336', bg: 'rgba(244,67,54,0.10)',   desc: 'Enthusiast GPU required for full performance' };
}

/* ─── Shared inline styles ─────────────────────────────────────────── */
const selectStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-surface)',
  borderRadius: 'var(--radius-card)',
  border: '1px solid var(--color-border-subtle)',
  boxShadow: 'var(--shadow-card)',
};

/* ─── Tab definitions ──────────────────────────────────────────────── */
type SettingsTab = 'general' | 'character' | 'brain' | 'voice' | 'safety' | 'intimacy' | 'aiart' | 'system' | 'tts_models' | 'lm_models';

interface TabDef {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'general', label: 'General', icon: <Palette size={15} /> },
  { id: 'character', label: 'Character', icon: <User size={15} /> },
  { id: 'brain', label: 'Brain', icon: <Brain size={15} /> },
  { id: 'voice', label: 'Voice', icon: <Volume2 size={15} /> },
  { id: 'safety', label: 'Safety', icon: <Shield size={15} /> },
  { id: 'intimacy', label: 'Intimacy', icon: <Heart size={15} /> },
  { id: 'aiart', label: 'AI Art', icon: <Image size={15} /> },
  { id: 'system', label: 'System', icon: <Settings size={15} /> },
  { id: 'tts_models', label: 'TTS Models', icon: <Package size={15} /> },
  { id: 'lm_models', label: 'LM Models', icon: <Monitor size={15} /> },
];

/* ─── LM Studio model type ─────────────────────────────────────────── */
interface LMStudioModel {
  id: string;
  state?: string;
  max_context_length?: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Settings View
   ═══════════════════════════════════════════════════════════════════════ */

/** Full-parity tabbed settings view matching Neon's ~70 settings. */
export function SettingsView() {
  const {
    advancedMode, toggleAdvancedMode,
    layoutMode, setLayoutMode,
    config, saveConfig,
    settingsInitTab,
  } = useAppStore();
  const { theme, setTheme } = useTheme();
  const { hasDiscovered, discoverFeature } = useWizardStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Settings tab pulsing dots — show on first settings visit for key tabs
  const showPulse = !hasDiscovered('settings_tour');
  const [visitedTabs, setVisitedTabs] = useState<Set<SettingsTab>>(new Set(['general']));
  const highlightTabs: SettingsTab[] = ['voice', 'aiart', 'brain'];

  // Mark settings_tour as discovered after user has visited 2+ highlighted tabs
  useEffect(() => {
    if (showPulse) {
      const visitedHighlighted = highlightTabs.filter(t => visitedTabs.has(t));
      if (visitedHighlighted.length >= 2) {
        discoverFeature('settings_tour');
      }
    }
  }, [visitedTabs, showPulse]);

  const handleTabClick = (tabId: SettingsTab) => {
    setActiveTab(tabId);
    setVisitedTabs(prev => new Set([...prev, tabId]));
  };

  // Jump to tab requested by openSettingsTab() and clear the request
  useEffect(() => {
    if (settingsInitTab && TABS.some(t => t.id === settingsInitTab)) {
      setActiveTab(settingsInitTab as SettingsTab);
      // Clear the init tab via a zero-cost store write (openOverlay keeps overlay open)
      useAppStore.setState({ settingsInitTab: null });
    }
  }, [settingsInitTab]);

  // LM Studio model auto-detect
  const [lmModels, setLmModels] = useState<LMStudioModel[]>([]);
  const [lmLoading, setLmLoading] = useState(false);

  const fetchLmModels = useCallback(async () => {
    setLmLoading(true);
    try {
      const res = await fetch('/api/lm-studio/models');
      if (res.ok) {
        const data = await res.json();
        setLmModels(data.models || []);
      }
    } catch { /* LM Studio not available */ }
    finally { setLmLoading(false); }
  }, []);

  useEffect(() => { fetchLmModels(); }, [fetchLmModels]);

  /** Flash the "Saved ✓" indicator for 1.5 s after a successful save. */
  const flashSaved = () => {
    setSavedFlash(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedFlash(false), 1500);
  };

  /** Save a nested config key like "llm.model". */
  const save = (key: string, value: unknown) => {
    // For nested keys, merge properly with existing parent object
    const parts = key.split('.');
    if (parts.length === 2) {
      const [parent, child] = parts;
      const existing = (config[parent] as Record<string, unknown>) || {};
      saveConfig({ [parent]: { ...existing, ...{ [child]: value } } }).then(flashSaved).catch(() => {});
    } else {
      saveConfig({ [key]: value }).then(flashSaved).catch(() => {});
    }
  };

  /** Get config value with fallback. */
  const cfg = (key: string, fallback: unknown = '') => cfgGet(config, key, fallback);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div
        className="flex items-center gap-1 p-2 overflow-x-auto flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          const shouldPulse = showPulse && highlightTabs.includes(tab.id) && !visitedTabs.has(tab.id) && !active;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              data-active={active}
              data-highlight={shouldPulse || undefined}
              className="settings-tab-pill relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200"
              style={{
                background: active ? 'var(--color-accent-gradient)' : 'transparent',
                color: active ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                boxShadow: active ? '0 1px 4px var(--color-accent-soft)' : 'none',
              }}
            >
              {tab.icon}
              {tab.label}
              {shouldPulse && (
                <span
                  className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                />
              )}
            </button>
          );
        })}
        {/* Right-side status: auto-save hint (idle) or "Saved ✓" flash */}
        <span
          className="ml-auto flex items-center gap-1 flex-shrink-0 transition-all duration-300"
          style={{
            fontSize: '0.68rem',
            fontWeight: savedFlash ? 600 : 400,
            color: savedFlash ? 'var(--color-success, #39c96e)' : 'var(--color-text-muted)',
            opacity: savedFlash ? 1 : 0.6,
          }}
        >
          {savedFlash
            ? <><CheckCircle size={11} /> Saved</>
            : <><span style={{ fontSize: '0.6rem' }}>●</span> Auto-saves</>
          }
        </span>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full">
        {activeTab === 'general' && (
          <GeneralTab
            config={config} save={save} cfg={cfg}
            theme={theme} setTheme={setTheme}
            advancedMode={advancedMode} toggleAdvancedMode={toggleAdvancedMode}
            layoutMode={layoutMode} setLayoutMode={setLayoutMode}
          />
        )}
        {activeTab === 'character' && (
          <CharacterTab />
        )}
        {activeTab === 'brain' && (
          <BrainTab config={config} save={save} cfg={cfg} lmModels={lmModels} lmLoading={lmLoading} fetchLmModels={fetchLmModels} />
        )}
        {activeTab === 'voice' && (
          <VoiceTab config={config} save={save} cfg={cfg} />
        )}
        {activeTab === 'safety' && (
          <SafetyTab config={config} save={save} cfg={cfg} />
        )}
        {activeTab === 'intimacy' && (
          <NsfwSettingsTab config={config} save={save} cfg={cfg} />
        )}
        {activeTab === 'aiart' && (
          <AIArtTab config={config} save={save} cfg={cfg} />
        )}
        {activeTab === 'system' && (
          <SystemTab config={config} save={save} cfg={cfg} />
        )}
        {activeTab === 'tts_models' && (
          <section>
            <SectionHeader title="Voice Model Manager" />
            <div style={cardStyle} className="p-4">
              <TTSModelsPanel />
            </div>
          </section>
        )}
        {activeTab === 'lm_models' && (
          <section>
            <SectionHeader title="LM Studio Model Manager" />
            <div style={cardStyle} className="p-4">
              <ModelManagerPanel />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ─── Shared sub-components ────────────────────────────────────────── */

function SectionHeader({ title }: { title: string }) {
  return (
    <h3
      className="text-xs font-semibold uppercase tracking-wider mb-2"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      {title}
    </h3>
  );
}

/** Slider with live numeric readout. */
function SliderField({
  label, description, tooltip, advanced, tier,
  value, min, max, step, onChange, format
}: {
  label: string; description?: string; tooltip?: string; advanced?: boolean;
  tier?: 0 | 1 | 2;
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const display = format ? format(value) : value.toString();
  return (
    <SettingField label={label} description={description} tooltip={tooltip} advanced={advanced} tier={tier}>
      <div className="flex items-center gap-2">
        <input
          type="range" min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-32"
        />
        <span className="text-xs w-12 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
          {display}
        </span>
      </div>
    </SettingField>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: Character (active character's appearance, model, voice)
   ═══════════════════════════════════════════════════════════════════════ */

function CharacterTab() {
  const { activeCharacter, setActiveCharacter, characters, loadCharacters, deleteCharacter, advancedMode, vrmStats, viewportFps } = useAppStore();
  const [vrmModels, setVrmModels] = useState<Array<{ name: string; url: string }>>([]);
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  /** Feature #6: local backstory text (loaded from activeCharacter.backstory). */
  const [backstory, setBackstory] = useState('');
  const [backstorySaving, setBackstorySaving] = useState(false);
  const [generatingBackstory, setGeneratingBackstory] = useState(false);
  /** Feature #29: Day Off mode — pauses proactive/scheduled messages. */
  const [dayOff, setDayOff] = useState(activeCharacter?.day_off ?? false);
  /** Feature A4: Whether time-of-day mood injection is active. */
  const [moodEnabled, setMoodEnabled] = useState(activeCharacter?.mood_enabled ?? true);
  /** Feature A4: 0.0--1.0 scale factor for mood strength. */
  const [moodIntensity, setMoodIntensity] = useState(activeCharacter?.mood_intensity ?? 0.8);
  /** Phase 15: Emotion portrait display mode (0=off, 1=chat, 2=chat+sidebar). */
  const [emotionPortraitsMode, setEmotionPortraitsMode] = useState(activeCharacter?.emotion_portraits_mode ?? 0);
  /** v36: Character bible deep persona injection toggle. */
  const [bibleEnabled, setBibleEnabled] = useState(activeCharacter?.bible_enabled ?? false);

  /** Download the active character as a .json file (id stripped for portability). */
  const exportCharacter = () => {
    if (!activeCharacter) return;
    const { id: _id, ...exportable } = activeCharacter;
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeCharacter.name || 'character').replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Import a character from a .json file. Creates a new character (does not overwrite). */
  const importCharacter = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.name || !data.system_prompt) throw new Error('Missing required fields: name, system_prompt');
        const { id: _id, ...fields } = data; // strip id if present
        await api.createCharacter(fields);
        await loadCharacters();
      } catch (err: unknown) {
        setImportError(err instanceof Error ? err.message : 'Invalid character file');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be re-imported
  };
  const [localData, setLocalData] = useState({
    id: 0,
    avatar_url: '',
    model_vrm: '',
    live2d_model: '',
    background_url: '',
    background_mode: 'transparent',
    voice_id: '',
    tts_provider: 'edge-tts',
    /** Feature H: per-emotion TTS voice overrides. Raw JSON string for editing. */
    emotion_voice_overrides: '',
    voice_sample_path: '',
  });
  /** Available Live2D models from backend scan. */
  const [live2dModels, setLive2dModels] = useState<Array<{ name: string; url: string }>>([]);
  /** Whether a Live2D zip upload is in progress. */
  const [live2dUploading, setLive2dUploading] = useState(false);
  /** Validation error message for the emotion_voice_overrides JSON field. */
  const [evoError, setEvoError] = useState<string | null>(null);

  // Load file lists + sync from active character
  useEffect(() => {
    api.scanVrm().then(models => setVrmModels(models.map(m => ({ name: m.name, url: m.url })))).catch(() => {});
    api.scanLive2d().then(models => setLive2dModels(models.map(m => ({ name: m.name, url: m.url })))).catch(() => {});
    api.scanImages().then(setImages).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeCharacter) {
      setLocalData({
        id: activeCharacter.id,
        avatar_url: activeCharacter.avatar_url || '',
        model_vrm: activeCharacter.vrm_model_url || activeCharacter.model_vrm || '',
        live2d_model: activeCharacter.live2d_model || '',
        background_url: activeCharacter.background_url || '',
        background_mode: activeCharacter.background_mode || 'transparent',
        voice_id: activeCharacter.voice_id || '',
        tts_provider: activeCharacter.tts_provider || 'edge-tts',
        // Feature H: load as a pretty-printed JSON string for the textarea
        emotion_voice_overrides: activeCharacter.emotion_voice_overrides
          ? (() => {
              try {
                const parsed = typeof activeCharacter.emotion_voice_overrides === 'string'
                  ? JSON.parse(activeCharacter.emotion_voice_overrides)
                  : activeCharacter.emotion_voice_overrides;
                return JSON.stringify(parsed, null, 2);
              } catch {
                return activeCharacter.emotion_voice_overrides as string;
              }
            })()
          : '',
        voice_sample_path: activeCharacter.voice_sample_path || '',
      });
      setEvoError(null);
      // Feature #6: sync backstory from character row
      setBackstory(activeCharacter.backstory || '');
      // Feature #29: sync day_off
      setDayOff(activeCharacter.day_off ?? false);
      // Feature A4: sync mood fields
      setMoodEnabled(activeCharacter.mood_enabled ?? true);
      setMoodIntensity(activeCharacter.mood_intensity ?? 0.8);
      // Phase 15: sync emotion portraits mode
      setEmotionPortraitsMode(activeCharacter.emotion_portraits_mode ?? 0);
      // v36: sync bible toggle
      setBibleEnabled(activeCharacter.bible_enabled ?? false);
    }
  }, [activeCharacter]);

  const saveCharacter = async () => {
    if (!activeCharacter) return;

    // Feature H: validate emotion_voice_overrides JSON before saving
    let parsedEvo: Record<string, string> | null = null;
    if (localData.emotion_voice_overrides.trim()) {
      try {
        parsedEvo = JSON.parse(localData.emotion_voice_overrides);
        if (typeof parsedEvo !== 'object' || Array.isArray(parsedEvo) || parsedEvo === null) {
          setEvoError('Must be a JSON object, e.g. {"happy": "voice_id"}');
          return;
        }
        setEvoError(null);
      } catch {
        setEvoError('Invalid JSON — check syntax and try again.');
        return;
      }
    } else {
      setEvoError(null);
    }

    setSaving(true);
    try {
      // Map frontend field names to backend API field names
      const payload: Record<string, unknown> = {
        avatar_url: localData.avatar_url,
        vrm_model_url: localData.model_vrm,
        live2d_model: localData.live2d_model || null,
        background_url: localData.background_url,
        background_mode: localData.background_mode,
        voice_id: localData.voice_id,
        tts_provider: localData.tts_provider,
        // Feature H: send parsed object (backend JSON-encodes it) or null to clear
        emotion_voice_overrides: parsedEvo,
      };
      const updated = await api.updateCharacter(activeCharacter.id, payload);
      setActiveCharacter({ ...activeCharacter, ...updated, ...localData });
      await loadCharacters();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to save character:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    try {
      const result = await api.uploadAvatar(file);
      if (result.url) {
        setLocalData(d => ({ ...d, avatar_url: result.url }));
      }
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  /**
   * Feature #6: Call the AI backstory generator endpoint and populate the textarea.
   * POST /api/characters/{id}/generate-backstory — no request body required.
   * On success the returned `backstory` string replaces the current textarea value.
   *
   * @returns void — state is updated directly
   */
  const handleGenerateBackstory = async () => {
    if (!activeCharacter) return;
    setGeneratingBackstory(true);
    try {
      const result = await api.generateBackstory(activeCharacter.id);
      if (result.backstory) {
        setBackstory(result.backstory);
      } else {
        alert('Backstory generation returned empty. Check that your LLM is connected and running.');
      }
    } catch (err) {
      console.error('Backstory generation failed:', err);
      alert(`Backstory generation failed: ${err instanceof Error ? err.message : String(err)}\n\nMake sure your LLM server is running and configured in the Brain tab.`);
    } finally {
      setGeneratingBackstory(false);
    }
  };

  /**
   * Feature #6: Persist the current backstory textarea value to the backend.
   * Calls api.updateCharacter with only the backstory field so other fields
   * are not accidentally overwritten.
   *
   * @returns void — updates appStore on success
   */
  const handleSaveBackstory = async () => {
    if (!activeCharacter) return;
    setBackstorySaving(true);
    try {
      const updated = await api.updateCharacter(activeCharacter.id, { backstory });
      setActiveCharacter({ ...activeCharacter, ...updated, backstory });
    } catch (err) {
      console.error('Failed to save backstory:', err);
    } finally {
      setBackstorySaving(false);
    }
  };

  if (!activeCharacter) {
    return (
      <div className="text-center py-12 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Select a character from the Chats tab to edit their appearance.
      </div>
    );
  }

  const avatarImages = images.filter(f => /\.(png|jpe?g|gif|webp|svg)$/i.test(f));

  return (
    <>
      {/* Active character selector */}
      <section className="mb-6">
        <SectionHeader title={`Editing: ${activeCharacter.name}`} />
        <div style={cardStyle} className="px-4">
          <SettingField label="Active Character" description="Switch which character you're editing.">
            <select
              value={activeCharacter.id}
              onChange={(e) => {
                const char = characters.find(c => c.id === Number(e.target.value));
                if (char) setActiveCharacter(char);
              }}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              {characters.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </SettingField>
        </div>
      </section>

      {/* Avatar / Icon */}
      <section className="mb-6">
        <SectionHeader title="Avatar & Appearance" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Avatar Image" description="Profile picture shown in chat bubbles and character list."
            tooltip="Select from scanned images or upload a new one. VRM files are not valid avatar images.">
            <div className="flex items-center gap-2">
              <select
                value={localData.avatar_url}
                onChange={(e) => setLocalData(d => ({ ...d, avatar_url: e.target.value }))}
                className="text-sm px-2 py-1 rounded w-48" style={selectStyle}
              >
                <option value="">None (use initial)</option>
                {avatarImages.map(img => (
                  <option key={img} value={`/files/images/${img}`}>{img}</option>
                ))}
                {localData.avatar_url && !avatarImages.some(i => `/files/images/${i}` === localData.avatar_url) && (
                  <option value={localData.avatar_url}>{localData.avatar_url} (current)</option>
                )}
              </select>
              <label
                className="text-xs px-2 py-1 rounded cursor-pointer"
                style={{ ...selectStyle, color: 'var(--color-accent)' }}
              >
                Upload
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleAvatarUpload(e.target.files[0]); }} />
              </label>
            </div>
          </SettingField>

          {/* Avatar preview */}
          {localData.avatar_url && /\.(png|jpe?g|gif|webp|svg)$/i.test(localData.avatar_url) && (
            <div className="py-2 flex justify-center">
              <img src={localData.avatar_url} alt="Avatar preview"
                className="w-20 h-20 rounded-full object-cover"
                style={{ border: '2px solid var(--color-accent)' }} />
            </div>
          )}

          {/* Feature A5: Expression portrait generator */}
          {activeCharacter?.id && (
            <ExpressionPortraitGrid
              charId={activeCharacter.id}
              charName={activeCharacter.name || 'Character'}
            />
          )}

          {/* Phase 15: Emotion portraits display mode toggle */}
          <SettingField
            label="Emotion Portraits"
            description="Show per-message emotion avatars in chat bubbles."
            tooltip="Off: static avatar. Chat Only: each message shows the emotion-specific portrait. Chat + Sidebar: also shows a temporary emotion indicator on the sidebar avatar."
          >
            <select
              value={emotionPortraitsMode}
              onChange={async (e) => {
                const mode = parseInt(e.target.value, 10);
                setEmotionPortraitsMode(mode);
                if (activeCharacter) {
                  try {
                    await api.updateCharacter(activeCharacter.id, { emotion_portraits_mode: mode });
                    setActiveCharacter({ ...activeCharacter, emotion_portraits_mode: mode });
                  } catch { setEmotionPortraitsMode(emotionPortraitsMode); }
                }
              }}
              className="text-sm px-2 py-1 rounded w-48"
              style={{
                backgroundColor: 'var(--color-background)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <option value={0}>Off</option>
              <option value={1}>Chat Bubbles Only</option>
              <option value={2}>Chat + Sidebar</option>
            </select>
          </SettingField>

          <SettingField label="VRM Model" description="3D model file for the viewport."
            tooltip="Place .vrm files in backend/storage/avatars/ to see them here.">
            <select
              value={localData.model_vrm}
              onChange={(e) => setLocalData(d => ({ ...d, model_vrm: e.target.value }))}
              className="text-sm px-2 py-1 rounded w-48" style={selectStyle}
            >
              <option value="">None</option>
              {vrmModels.map(m => (
                <option key={m.url} value={m.url}>{m.name}</option>
              ))}
            </select>
          </SettingField>

          <SettingField label="Live2D Model" description="Cubism model for 2D avatar rendering."
            tooltip="Place Live2D model folders in backend/storage/live2d/ or upload a .zip below.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <select
                value={localData.live2d_model}
                onChange={(e) => {
                  setLocalData(d => ({ ...d, live2d_model: e.target.value }));
                  // When selecting a Live2D model, clear the VRM assignment (they're mutually exclusive)
                  if (e.target.value) setLocalData(d => ({ ...d, model_vrm: '' }));
                }}
                className="text-sm px-2 py-1 rounded w-48" style={selectStyle}
              >
                <option value="">None</option>
                {live2dModels.map(m => (
                  <option key={m.url} value={m.url}>{m.name}</option>
                ))}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', fontSize: '0.7rem',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-button)',
                    cursor: live2dUploading ? 'not-allowed' : 'pointer',
                    color: 'var(--color-text-secondary)',
                    opacity: live2dUploading ? 0.5 : 1,
                  }}
                >
                  {live2dUploading ? 'Uploading...' : 'Upload .zip'}
                  <input
                    type="file"
                    accept=".zip"
                    style={{ display: 'none' }}
                    disabled={live2dUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setLive2dUploading(true);
                      try {
                        const result = await api.uploadLive2d(file);
                        if (result.ok) {
                          // Refresh the model list and select the new model
                          const models = await api.scanLive2d();
                          setLive2dModels(models.map(m => ({ name: m.name, url: m.url })));
                          setLocalData(d => ({ ...d, live2d_model: result.url, model_vrm: '' }));
                        }
                      } catch (err) {
                        console.error('Live2D upload failed:', err);
                      } finally {
                        setLive2dUploading(false);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
                {localData.live2d_model && (
                  <button
                    onClick={() => setLocalData(d => ({ ...d, live2d_model: '' }))}
                    style={{
                      padding: '3px 8px', fontSize: '0.68rem',
                      background: 'none', border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-button)',
                      color: 'var(--color-text-muted)', cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </SettingField>

          {/* VRM stats — shown when a model is loaded in the viewer */}
          {vrmStats && localData.model_vrm && (() => {
            const tier = getVrmTier(vrmStats.triangles);
            return (
              <div style={{ margin: '4px 0 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Tier chip + triangle count (compact + advanced) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 600,
                    backgroundColor: tier.bg, color: tier.color,
                    border: `1px solid ${tier.color}44`,
                  }}>
                    ● {tier.label}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                    {vrmStats.triangles.toLocaleString()} triangles
                  </span>
                  {!advancedMode && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                      — {tier.desc}
                    </span>
                  )}
                </div>
                {/* Advanced: full stats grid */}
                {advancedMode && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '4px 12px', fontSize: '0.68rem',
                    color: 'var(--color-text-secondary)',
                    padding: '6px 8px',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                  }}>
                    {([
                      ['Triangles',    vrmStats.triangles.toLocaleString()],
                      ['Vertices',     vrmStats.vertices.toLocaleString()],
                      ['Meshes',       String(vrmStats.meshes)],
                      ['Blend Shapes', String(vrmStats.blendShapes)],
                      ['Bones',        String(vrmStats.bones)],
                      ['VRM',          vrmStats.vrmVersion],
                    ] as [string, string][]).map(([label, value]) => (
                      <div key={label}>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.62rem', marginBottom: 1 }}>{label}</div>
                        <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Hint — VRM selected but viewer not yet opened */}
          {!vrmStats && localData.model_vrm && (
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', margin: '2px 0 8px' }}>
              Open the 3D viewer to analyze model performance.
            </p>
          )}

          {/* FPS performance warning — inline, no popups */}
          {viewportFps !== null && viewportFps < 30 && localData.model_vrm && (
            <div style={{
              padding: '8px 10px', borderRadius: 6, marginBottom: 4,
              backgroundColor: viewportFps < 20 ? 'rgba(244,67,54,0.08)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${viewportFps < 20 ? 'rgba(244,67,54,0.25)' : 'rgba(245,158,11,0.25)'}`,
              fontSize: '0.71rem', lineHeight: 1.5,
              color: viewportFps < 20 ? '#f44336' : '#d97706',
            }}>
              <strong>⚠ {viewportFps < 20 ? 'Very low' : 'Low'} frame rate</strong>
              {' '}({viewportFps} FPS). For better performance, try a lighter VRM model
              or reduce Shadow Quality and Render Scale in the 3D Viewer settings.
            </div>
          )}

          <SettingField label="Background Image" description="Shown behind the 3D avatar in the viewport.">
            <select
              value={localData.background_url}
              onChange={(e) => setLocalData(d => ({ ...d, background_url: e.target.value }))}
              className="text-sm px-2 py-1 rounded w-48" style={selectStyle}
            >
              <option value="">None</option>
              {images.map(img => (
                <option key={img} value={`/files/images/${img}`}>{img}</option>
              ))}
            </select>
          </SettingField>

          <SettingField label="Background Mode" description="How the viewport background is rendered.">
            <select
              value={localData.background_mode}
              onChange={(e) => setLocalData(d => ({ ...d, background_mode: e.target.value }))}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="transparent">Transparent</option>
              <option value="image">Image</option>
              <option value="color">Color</option>
              <option value="video">Video</option>
              <option value="gradient">Gradient</option>
            </select>
          </SettingField>
        </div>
      </section>

      {/* Per-character voice */}
      <section className="mb-6">
        <SectionHeader title="Voice" />
        <div style={cardStyle} className="px-4">
          <SettingField label="TTS Provider" description="Override the global voice provider for this character.">
            <select
              value={localData.tts_provider}
              onChange={(e) => setLocalData(d => ({ ...d, tts_provider: e.target.value }))}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <optgroup label="Cloud">
                <option value="edge-tts">Edge-TTS (Free)</option>
                <option value="elevenlabs">ElevenLabs (Paid)</option>
                <option value="fish_audio">Fish Audio</option>
                <option value="voxtral">Voxtral (Mistral)</option>
              </optgroup>
              <optgroup label="CPU">
                <option value="kokoro">Kokoro</option>
                <option value="piper_local">Piper</option>
                <option value="kitten">KittenTTS</option>
                <option value="melotts">MeloTTS</option>
              </optgroup>
              <optgroup label="GPU">
                <option value="bark">Bark</option>
                <option value="styletts2">StyleTTS 2</option>
                <option value="parler">Parler-TTS</option>
                <option value="f5tts">F5-TTS</option>
                <option value="cosyvoice">CosyVoice 3</option>
              </optgroup>
              <optgroup label="Voice Cloning">
                <option value="chatterbox">Chatterbox</option>
                <option value="gptsovits">GPT-SoVITS</option>
                <option value="xtts_server">XTTS v2</option>
                <option value="metavoice">MetaVoice-1B</option>
                <option value="dia">Dia</option>
              </optgroup>
            </select>
          </SettingField>

          <SettingField label="Voice" description="Pick a voice for this character.">
            <VoicePicker
              value={localData.voice_id}
              provider={localData.tts_provider}
              onChange={(voiceId, provider) => setLocalData(d => ({ ...d, voice_id: voiceId, tts_provider: provider }))}
            />
          </SettingField>

          {/* Voice sample upload — only for cloning-capable providers */}
          {['chatterbox', 'gptsovits', 'xtts_server', 'f5tts', 'metavoice', 'dia', 'cosyvoice'].includes(localData.tts_provider) && (
            <SettingField
              label="Voice Sample"
              description="Upload a 5–30s audio clip for voice cloning. The engine will mimic this voice."
            >
              <VoiceSampleUploader
                charId={localData.id}
                currentSampleUrl={localData.voice_sample_path || null}
                onChanged={(newPath) => setLocalData(d => ({ ...d, voice_sample_path: newPath || '' }))}
              />
            </SettingField>
          )}

          {/* Feature H: Per-emotion voice overrides */}
          <SettingField
            label="Voice Overrides (by emotion)"
            description={
              <span>
                Map emotions to different voice IDs.{' '}
                <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {'{'}&#34;happy&#34;: &#34;af_sky&#34;, &#34;sad&#34;: &#34;bm_lewis&#34;{'}'}
                </span>
              </span>
            }
          >
            <div className="flex flex-col gap-1 w-full">
              <textarea
                rows={3}
                value={localData.emotion_voice_overrides}
                onChange={(e) => {
                  setLocalData(d => ({ ...d, emotion_voice_overrides: e.target.value }));
                  setEvoError(null);
                }}
                placeholder={'{\n  "happy": "af_sky",\n  "sad": "bm_lewis"\n}'}
                className="text-xs px-2 py-1.5 rounded font-mono w-full resize-y"
                style={{
                  background: 'var(--color-surface)',
                  border: `1px solid ${evoError ? 'var(--color-danger, #f44)' : 'var(--color-border)'}`,
                  color: 'var(--color-text)',
                  minHeight: '72px',
                }}
                spellCheck={false}
              />
              {evoError && (
                <span className="text-xs" style={{ color: 'var(--color-danger, #f44)' }}>
                  {evoError}
                </span>
              )}
            </div>
          </SettingField>
        </div>
      </section>

      {/* Relationship reset */}
      <section className="mb-4">
        <SectionHeader title="Relationship" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Reset Relationship" description="Reset affinity, mood, and trust back to 0.5 neutral.">
            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ color: 'var(--color-danger, #f44)', border: '1px solid var(--color-danger, #f44)' }}
              >
                Reset
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => { await api.resetRelationship(activeCharacter.id); setConfirmReset(false); }}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                  style={{ backgroundColor: 'var(--color-danger, #f44)', color: '#fff' }}
                >
                  Confirm Reset
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="text-xs px-2 py-1.5 rounded-lg"
                  style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </SettingField>
        </div>
      </section>

      {/* Feature #6: Backstory */}
      <section className="mb-6">
        <SectionHeader title="Backstory" />
        <div style={cardStyle} className="px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              Backstory
            </span>
            <button
              onClick={handleGenerateBackstory}
              disabled={generatingBackstory}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full disabled:opacity-50 transition-colors"
              style={{
                backgroundColor: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
                border: '1px solid var(--color-accent)',
              }}
              title="Generate backstory with AI"
            >
              <Wand2 size={10} />
              {generatingBackstory ? 'Generating...' : 'Generate'}
            </button>
          </div>
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Narrative background for this character. Click Generate to create one with AI.
          </p>
          <textarea
            rows={5}
            value={backstory}
            onChange={(e) => setBackstory(e.target.value)}
            placeholder="Enter a backstory or click Generate to create one with AI..."
            className="text-xs px-2 py-1.5 rounded w-full resize-y"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              minHeight: '100px',
            }}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={handleSaveBackstory}
              disabled={backstorySaving}
              className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-text)',
              }}
            >
              {backstorySaving ? 'Saving...' : 'Save Backstory'}
            </button>
          </div>
        </div>
      </section>

      {/* Feature #29: Day Off Mode */}
      <section className="mb-6">
        <SectionHeader title="Availability" />
        <div style={cardStyle} className="px-4">
          <SettingField
            label="Day Off"
            description="Pause all proactive and scheduled messages for this character today."
            tooltip="When enabled, the scheduler skips this character entirely. The character will still reply normally when you send a message."
          >
            <input
              type="checkbox"
              checked={dayOff}
              onChange={async (e) => {
                const enabled = e.target.checked;
                setDayOff(enabled);
                if (activeCharacter) {
                  try {
                    await fetch(`/api/characters/${activeCharacter.id}/day-off`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ enabled }),
                    });
                    setActiveCharacter({ ...activeCharacter, day_off: enabled });
                  } catch { setDayOff(!enabled); /* revert on error */ }
                }
              }}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>
        </div>
      </section>

      {/* Feature A4: Daily Mood Settings */}
      <section className="mb-6">
        <SectionHeader title="Daily Mood" />
        <div style={cardStyle} className="px-4">
          <SettingField
            label="Time-of-Day Mood"
            description="Subtly shift personality based on time of day (morning, afternoon, evening, night)."
            tooltip="When enabled, the system prompt receives an invisible mood directive that makes the character feel groggy in the morning, energetic in the afternoon, reflective at night, etc. The user never sees this text."
          >
            <input
              type="checkbox"
              checked={moodEnabled}
              onChange={async (e) => {
                const enabled = e.target.checked;
                setMoodEnabled(enabled);
                if (activeCharacter) {
                  try {
                    await api.updateCharacter(activeCharacter.id, { mood_enabled: enabled });
                    setActiveCharacter({ ...activeCharacter, mood_enabled: enabled });
                  } catch { setMoodEnabled(!enabled); }
                }
              }}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>
          {moodEnabled && (
            <SettingField
              label="Mood Intensity"
              description="How strongly time-of-day affects personality. Lower values produce subtler shifts."
              tooltip="At 0% mood is disabled. Below 50% tone hints are skipped. Above 80% affinity-based warmth modifiers are included."
            >
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0} max={1} step={0.1}
                  value={moodIntensity}
                  onChange={async (e) => {
                    const val = parseFloat(e.target.value);
                    setMoodIntensity(val);
                    if (activeCharacter) {
                      try {
                        await api.updateCharacter(activeCharacter.id, { mood_intensity: val });
                        setActiveCharacter({ ...activeCharacter, mood_intensity: val });
                      } catch { /* keep local value */ }
                    }
                  }}
                  className="w-32"
                />
                <span className="text-xs w-12 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                  {Math.round(moodIntensity * 100)}%
                </span>
              </div>
            </SettingField>
          )}
        </div>
      </section>

      {/* Deep Persona (Bible) section — v36 */}
      {activeCharacter?.bible_path && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Deep Persona</h3>
          <SettingField
            label="Character Bible Injection"
            description="When enabled, injects detailed personality, backstory, and voice style from the character bible into every conversation."
            tooltip="Adds ~3K-8K tokens of deep character context from the markdown bible file. Produces more authentic, consistent responses at the cost of context window budget."
          >
            <input
              type="checkbox"
              checked={bibleEnabled}
              onChange={async (e) => {
                const enabled = e.target.checked;
                setBibleEnabled(enabled);
                if (activeCharacter) {
                  try {
                    await api.updateCharacter(activeCharacter.id, { bible_enabled: enabled });
                    setActiveCharacter({ ...activeCharacter, bible_enabled: enabled });
                  } catch { setBibleEnabled(!enabled); }
                }
              }}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>
          {bibleEnabled && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              Bible: <code className="text-[var(--color-accent)]">{activeCharacter.bible_path}</code>
            </div>
          )}
        </section>
      )}

      {/* Feature T1-7: Output Format Rules */}
      <section className="mb-6">
        <SectionHeader title="Output Format Rules" />
        <div style={cardStyle} className="px-4 py-3">
          <FormatRulesEditor characterId={activeCharacter.id} />
        </div>
      </section>

      {/* Save + Delete buttons */}
      <div className="flex items-center justify-between gap-3">
        {/* Delete with two-step confirmation */}
        {/* Export / Import */}
        <button
          onClick={exportCharacter}
          className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', background: 'transparent' }}
          title="Download character as JSON"
        >
          Export
        </button>
        <button
          onClick={() => api.exportCharaCard(activeCharacter.id, `${activeCharacter.name}.png`).catch(() => {})}
          className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', background: 'transparent' }}
          title="Export as SillyTavern CHARA v2 card (PNG)"
        >
          Export Card
        </button>
        <label
          className="px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', background: 'transparent' }}
          title="Import character from JSON file"
        >
          Import
          <input type="file" accept=".json,application/json" onChange={importCharacter} className="hidden" />
        </label>
        {importError && (
          <span className="text-xs" style={{ color: 'var(--color-danger)' }}>{importError}</span>
        )}

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{ color: 'var(--color-danger, #f44)', border: '1px solid var(--color-danger, #f44)', background: 'transparent' }}
          >
            Delete Character
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-danger, #f44)' }}>
              Permanently delete {activeCharacter.name}?
            </span>
            <button
              onClick={async () => {
                await deleteCharacter(activeCharacter.id);
                setConfirmDelete(false);
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg"
              style={{ backgroundColor: 'var(--color-danger, #f44)', color: '#fff' }}
            >
              Yes, delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 text-xs rounded-lg"
              style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
            >
              Cancel
            </button>
          </div>
        )}
        <button
          onClick={saveCharacter}
          disabled={saving}
          className="px-5 py-2 text-sm font-medium rounded-lg disabled:opacity-50 transition-colors duration-300"
          style={{
            backgroundColor: saveSuccess ? 'var(--color-success, #39c96e)' : 'var(--color-accent)',
            color: 'var(--color-accent-text)',
          }}
        >
          {saving ? 'Saving…' : saveSuccess ? '✓ Saved' : 'Save Changes'}
        </button>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Theme Customization — preset swatches + custom color pickers
   ═══════════════════════════════════════════════════════════════════════ */

/** localStorage key for persisted custom color overrides. */
const CUSTOM_THEME_KEY = 'sakura-custom-theme';

interface CustomThemeColors {
  accent: string;
  background: string;
  surface: string;
  textPrimary: string;
  border: string;
}

/** Default color values that represent a neutral starting point for the
 *  color pickers when no custom theme is saved.  These reflect the dark-sakura
 *  palette so the pickers always show something sensible. */
const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
  accent: '#e88a9a',
  background: '#1a1518',
  surface: '#252022',
  textPrimary: '#f0e6e8',
  border: '#3a3234',
};

/** Maps each CSS variable name to the key in CustomThemeColors. */
const CSS_VAR_MAP: Record<keyof CustomThemeColors, string> = {
  accent: '--color-accent',
  background: '--color-background',
  surface: '--color-surface',
  textPrimary: '--color-text-primary',
  border: '--color-border',
};

/** A named preset that can set the data-theme attribute and/or inject
 *  inline CSS variable overrides.  Setting customColors to null means the
 *  preset relies purely on the data-theme CSS file. */
interface ThemePreset {
  id: string;
  label: string;
  /** data-theme value to apply, or null to leave the current one untouched */
  dataTheme: ThemeMode | null;
  /** Accent swatch color for the visual card preview */
  swatchAccent: string;
  /** Background swatch color for the visual card preview */
  swatchBg: string;
  /** If present, these inline CSS vars are applied on top of data-theme */
  customColors: CustomThemeColors | null;
}

const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'dark',
    label: 'Dark',
    dataTheme: 'dark-sakura',
    swatchAccent: '#e88a9a',
    swatchBg: '#1a1518',
    customColors: null,
  },
  {
    id: 'light',
    label: 'Light',
    dataTheme: 'sakura',
    swatchAccent: '#e8788a',
    swatchBg: '#fdf5f7',
    customColors: null,
  },
  {
    id: 'sakura-custom',
    label: 'Sakura',
    dataTheme: 'dark-sakura',
    swatchAccent: '#e879a0',
    swatchBg: '#1a0d12',
    customColors: {
      accent: '#e879a0',
      background: '#1a0d12',
      surface: '#2a1020',
      textPrimary: '#f5e0ea',
      border: '#4a2030',
    },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    dataTheme: 'dark-crystal',
    swatchAccent: '#38bdf8',
    swatchBg: '#0a1628',
    customColors: {
      accent: '#38bdf8',
      background: '#0a1628',
      surface: '#0f2040',
      textPrimary: '#e0f0ff',
      border: '#1a3a60',
    },
  },
  {
    id: 'forest',
    label: 'Forest',
    dataTheme: 'dark-sakura',
    swatchAccent: '#4ade80',
    swatchBg: '#0d1a0d',
    customColors: {
      accent: '#4ade80',
      background: '#0d1a0d',
      surface: '#152615',
      textPrimary: '#e0f5e0',
      border: '#204020',
    },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    dataTheme: 'dark-sakura',
    swatchAccent: '#fb923c',
    swatchBg: '#1a0e08',
    customColors: {
      accent: '#fb923c',
      background: '#1a0e08',
      surface: '#281806',
      textPrimary: '#fff0e0',
      border: '#402010',
    },
  },
  {
    id: 'bubblegum',
    label: 'Bubblegum',
    dataTheme: 'bubblegum',
    swatchAccent: '#FF69B4',
    swatchBg: '#FFF0F8',
    customColors: null,
  },
  {
    id: 'blurple',
    label: 'Blurple',
    dataTheme: 'blurple',
    swatchAccent: '#5865F2',
    swatchBg: '#1E1F22',
    customColors: null,
  },
  {
    id: 'catppuccin-latte',
    label: 'Catppuccin Latte',
    dataTheme: 'catppuccin-latte',
    swatchAccent: '#8839EF',
    swatchBg: '#EFF1F5',
    customColors: null,
  },
  {
    id: 'catppuccin-macchiato',
    label: 'Catppuccin Macchiato',
    dataTheme: 'catppuccin-macchiato',
    swatchAccent: '#B7BDF8',
    swatchBg: '#1E2030',
    customColors: null,
  },
  {
    id: 'monokai',
    label: 'Monokai',
    dataTheme: 'monokai',
    swatchAccent: '#A6E22E',
    swatchBg: '#272822',
    customColors: null,
  },
  {
    id: 'darcula',
    label: 'Darcula',
    dataTheme: 'darcula',
    swatchAccent: '#6897BB',
    swatchBg: '#2B2B2B',
    customColors: null,
  },
  {
    id: 'dracula',
    label: 'Dracula',
    dataTheme: 'dracula',
    swatchAccent: '#BD93F9',
    swatchBg: '#282A36',
    customColors: null,
  },
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    dataTheme: 'tokyo-night',
    swatchAccent: '#7AA2F7',
    swatchBg: '#1A1B2E',
    customColors: null,
  },
  {
    id: 'pop-bubblegum',
    label: 'Pop Bubblegum',
    dataTheme: 'pop-bubblegum',
    swatchAccent: '#FF2D78',
    swatchBg: '#FFFBFE',
    customColors: null,
  },
  {
    id: 'pop-lemonade',
    label: 'Pop Lemonade',
    dataTheme: 'pop-lemonade',
    swatchAccent: '#F5C100',
    swatchBg: '#FFFDE8',
    customColors: null,
  },
];

/**
 * Applies a set of custom color overrides as inline CSS vars on the root
 * element.  Inline style properties take precedence over attribute-matched
 * rules, so they override whatever data-theme provides.
 *
 * @param colors - The color values to inject, or null to clear all overrides.
 */
function applyCustomColors(colors: CustomThemeColors | null): void {
  const root = document.documentElement;
  (Object.keys(CSS_VAR_MAP) as Array<keyof CustomThemeColors>).forEach((key) => {
    if (colors) {
      root.style.setProperty(CSS_VAR_MAP[key], colors[key]);
    } else {
      root.style.removeProperty(CSS_VAR_MAP[key]);
    }
  });
}

/**
 * Saves custom theme colors to localStorage and applies them to the DOM.
 *
 * @param colors - The color values to persist, or null to clear saved overrides.
 */
function saveCustomTheme(colors: CustomThemeColors | null): void {
  if (colors) {
    localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(colors));
  } else {
    localStorage.removeItem(CUSTOM_THEME_KEY);
  }
  applyCustomColors(colors);
}

/**
 * Reads the persisted custom theme from localStorage and returns it, or null
 * if no custom theme has been saved.
 */
function loadSavedCustomTheme(): CustomThemeColors | null {
  try {
    const raw = localStorage.getItem(CUSTOM_THEME_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CustomThemeColors;
  } catch {
    return null;
  }
}

/**
 * Self-contained "Theme Customization" section rendered inside GeneralTab.
 * Reads and writes custom color overrides via the Zustand appStore so that
 * they survive page reloads without any additional localStorage logic.
 * App.tsx applies the persisted values on mount via a dedicated useEffect.
 *
 * @param props.setTheme - The useTheme setter, used to persist the base
 *   data-theme value via Zustand when a preset is selected.
 */
function ThemeCustomizationSection({
  setTheme,
}: {
  setTheme: (t: ThemeMode) => void;
}) {
  const { customTheme, setCustomThemeVar, resetCustomTheme } = useAppStore();

  // Which preset card is visually "active" (best-effort match on mount)
  const [activePreset, setActivePreset] = useState<string | null>(null);
  // Whether the custom color editor is expanded
  const [expanded, setExpanded] = useState(false);

  /**
   * Derive a CustomThemeColors snapshot from the appStore's flat CSS-var map.
   * Falls back to DEFAULT_CUSTOM_COLORS for vars not yet overridden so that
   * the color pickers always show a sensible starting value.
   */
  const colors: CustomThemeColors = {
    accent:      customTheme['--color-accent']      ?? DEFAULT_CUSTOM_COLORS.accent,
    background:  customTheme['--color-background']  ?? DEFAULT_CUSTOM_COLORS.background,
    surface:     customTheme['--color-surface']     ?? DEFAULT_CUSTOM_COLORS.surface,
    textPrimary: customTheme['--color-text-primary'] ?? DEFAULT_CUSTOM_COLORS.textPrimary,
    border:      customTheme['--color-border']      ?? DEFAULT_CUSTOM_COLORS.border,
  };

  // On mount: re-apply any values the store already has (covers the case where
  // App.tsx's useEffect hasn't fired yet, e.g. when the overlay is opened fast).
  useEffect(() => {
    const saved = loadSavedCustomTheme();
    if (saved && Object.keys(customTheme).length === 0) {
      // Migrate legacy localStorage-only saves into the store on first open
      (Object.keys(CSS_VAR_MAP) as Array<keyof CustomThemeColors>).forEach((key) => {
        setCustomThemeVar(CSS_VAR_MAP[key], saved[key]);
      });
      setActivePreset('custom');
    } else if (Object.keys(customTheme).length > 0) {
      setActivePreset('custom');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handles clicking a named preset card.  Applies the data-theme change via
   * the Zustand store (for persistence) and optionally injects custom CSS var
   * overrides on top.
   *
   * @param preset - The preset definition to activate.
   */
  function handlePreset(preset: ThemePreset): void {
    setActivePreset(preset.id);
    if (preset.dataTheme) {
      setTheme(preset.dataTheme);
    }
    if (preset.customColors) {
      // Write each color var into the appStore and apply it to the DOM
      (Object.keys(CSS_VAR_MAP) as Array<keyof CustomThemeColors>).forEach((key) => {
        const cssVar = CSS_VAR_MAP[key];
        const value = preset.customColors![key];
        setCustomThemeVar(cssVar, value);
        document.documentElement.style.setProperty(cssVar, value);
      });
      // Keep legacy localStorage in sync for backward compat
      saveCustomTheme(preset.customColors);
    } else {
      // Pure data-theme preset — clear all inline overrides
      resetCustomTheme();
      applyCustomColors(null);
      saveCustomTheme(null);
    }
  }

  /**
   * Handles a color picker change for a single variable.  Applies immediately
   * to the DOM and persists via appStore (+ localStorage for backward compat).
   *
   * @param key - The color key to update.
   * @param value - The new hex color string from the input[type=color].
   */
  function handleColorChange(key: keyof CustomThemeColors, value: string): void {
    const cssVar = CSS_VAR_MAP[key];
    setCustomThemeVar(cssVar, value);
    document.documentElement.style.setProperty(cssVar, value);
    setActivePreset('custom');
    // Keep legacy localStorage in sync
    const updated = { ...colors, [key]: value };
    saveCustomTheme(updated);
  }

  /** Resets all inline CSS var overrides, clears appStore, and clears localStorage. */
  function handleReset(): void {
    resetCustomTheme();
    applyCustomColors(null);
    saveCustomTheme(null);
    setActivePreset(null);
  }

  const colorFields: Array<{ key: keyof CustomThemeColors; label: string }> = [
    { key: 'accent',      label: 'Accent' },
    { key: 'background',  label: 'Background' },
    { key: 'surface',     label: 'Surface' },
    { key: 'textPrimary', label: 'Text' },
    { key: 'border',      label: 'Border' },
  ];

  return (
    <section className="mb-6">
      <SectionHeader title="Theme Customization" />
      <div style={cardStyle} className="px-4 py-1">

        {/* ── Preset cards ─────────────────────────────────────────────── */}
        <div className="py-3">
          <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Choose a preset or customize individual colors below.
          </p>
          <div className="flex flex-wrap gap-2">
            {THEME_PRESETS.map((preset) => {
              const isActive = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handlePreset(preset)}
                  aria-pressed={isActive}
                  title={preset.label}
                  style={{
                    width: 80,
                    border: isActive
                      ? '2px solid var(--color-accent)'
                      : '2px solid var(--color-border)',
                    borderRadius: 'var(--radius-button)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: 'none',
                    padding: 0,
                    outline: 'none',
                    flexShrink: 0,
                  }}
                >
                  {/* Color swatch strip */}
                  <div style={{ height: 28, background: preset.swatchBg, position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 4,
                        right: 6,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: preset.swatchAccent,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                      }}
                    />
                  </div>
                  {/* Label */}
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: isActive ? 600 : 400,
                      padding: '3px 4px',
                      background: 'var(--color-surface)',
                      color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      textAlign: 'center',
                      lineHeight: '1.2',
                    }}
                  >
                    {preset.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Divider ──────────────────────────────────────────────────── */}
        <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '0 -16px' }} />

        {/* ── Collapsible custom color editor ──────────────────────────── */}
        <div className="py-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium w-full text-left py-1"
            style={{ color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
            aria-expanded={expanded}
          >
            <ChevronDown
              size={13}
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 150ms',
              }}
            />
            Customize
          </button>

          {expanded && (
            <div className="mt-2">
              {/* 2-column color picker grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px 16px',
                  marginBottom: 10,
                }}
              >
                {colorFields.map(({ key, label }) => (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: 'var(--color-text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="color"
                      value={colors[key]}
                      onChange={(e) => handleColorChange(key, e.target.value)}
                      style={{
                        width: 28,
                        height: 28,
                        border: '1px solid var(--color-border)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        padding: 2,
                        background: 'var(--color-surface)',
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>

              {/* Reset button */}
              <button
                onClick={handleReset}
                className="text-xs px-3 py-1 rounded"
                style={{
                  ...selectStyle,
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Reset to Default
              </button>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: General (Appearance + Layout)
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── Shortcut Editor (Feature #24) ─────────────────────────────────────────
   Maps every App.tsx shortcut description to its default key so Settings can
   display and override them without App.tsx importing SettingsView.
   ─────────────────────────────────────────────────────────────────────────── */

const DEFAULT_SHORTCUT_KEYS: Record<string, string> = {
  'Open settings':           'ctrl+,',
  'Open memory manager':     'ctrl+m',
  'Open vocabulary manager': 'alt+v',
  'Conversation analytics':  'alt+a',
  'Session summary':         'alt+s',
  'Character diary':         'alt+d',
  'Relationship timeline':   'alt+t',
  'Message schedules':       'alt+h',
  'Global message search':   'alt+f',
  'Scenario library':        'alt+i',
  'Character mood board':    'alt+b',
  'Model arena':             'alt+p',
  'New character':           'alt+n',
  'Toggle sidebar':          'ctrl+\\',
  'Show keyboard shortcuts': '?',
  'Character portfolio':     'alt+o',
  'Session replay':          'alt+r',
  'Relationship web':        'alt+w',
  'Close overlay':           'escape',
};

/**
 * Normalizes a KeyboardEvent to the same format used by useKeyboardShortcuts.
 *
 * @param e - The keyboard event to normalize.
 * @returns A lowercase combo string like "ctrl+shift+k" or "escape".
 */
function normalizeCapture(e: React.KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  const key = e.key.toLowerCase();
  if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
    parts.push(key === ' ' ? 'space' : key);
  }
  return parts.join('+');
}

/* ─── Setup Guides Section ─────────────────────────────────────────────
   Grid of guide cards linking to re-triggerable setup wizards.
   Shown in the General tab. Each card shows completion status.
   ─────────────────────────────────────────────────────────────────────── */

function SetupGuidesSection() {
  const { config, saveConfig } = useAppStore();
  const openWizard = useWizardStore(s => s.openWizard);

  const guides = [
    { id: 'voice-setup' as const, label: 'Set up Voice', icon: <Volume2 size={15} />, completedKey: 'voice_setup_completed' },
    { id: 'image-gen-setup' as const, label: 'Set up Image Gen', icon: <Image size={15} />, completedKey: 'image_gen_setup_completed' },
    { id: 'llm-setup' as const, label: 'Configure LLM', icon: <Brain size={15} />, completedKey: null },
    { id: 'card-import' as const, label: 'Import Character', icon: <Upload size={15} />, completedKey: null },
    { id: 'expression-setup' as const, label: 'Expression Portraits', icon: <Palette size={15} />, completedKey: null },
  ];

  const handleRerunOnboarding = async () => {
    await saveConfig({ onboarded: false } as Record<string, unknown>).catch(() => {});
    openWizard('onboarding');
  };

  return (
    <section className="mb-6">
      <SectionHeader title="Setup Guides" />
      <div className="flex flex-col gap-1.5">
        {guides.map(g => {
          const completed = g.completedKey ? Boolean((config as Record<string, unknown>)[g.completedKey]) : false;
          return (
            <button
              key={g.id}
              onClick={() => openWizard(g.id)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              <span style={{ color: 'var(--color-accent)' }}>{g.icon}</span>
              <span className="text-xs font-medium flex-1" style={{ color: 'var(--color-text-primary)' }}>
                {g.label}
              </span>
              {completed ? (
                <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
              ) : (
                <ChevronDown size={14} style={{ color: 'var(--color-text-tertiary)', transform: 'rotate(-90deg)' }} />
              )}
            </button>
          );
        })}
        {/* Re-run onboarding */}
        <button
          onClick={handleRerunOnboarding}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <span style={{ color: 'var(--color-accent)' }}><RefreshCw size={15} /></span>
          <span className="text-xs font-medium flex-1" style={{ color: 'var(--color-text-primary)' }}>
            Re-run Onboarding
          </span>
          <ChevronDown size={14} style={{ color: 'var(--color-text-tertiary)', transform: 'rotate(-90deg)' }} />
        </button>
      </div>
    </section>
  );
}

/**
 * Settings section that lets users rebind all global keyboard shortcuts.
 * Reads and writes to appStore's customKeyBindings map, which is persisted
 * via localStorage through Zustand's partialize middleware.
 */
function ShortcutEditorSection() {
  const { customKeyBindings, setCustomKeyBinding, resetCustomKeyBindings } = useAppStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [capturedKey, setCapturedKey] = useState('');

  const startEdit = (desc: string) => { setEditing(desc); setCapturedKey(''); };

  const handleCapture = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const combo = normalizeCapture(e);
    if (combo) setCapturedKey(combo);
  };

  const saveEdit = () => {
    if (editing && capturedKey) setCustomKeyBinding(editing, capturedKey);
    setEditing(null);
  };

  return (
    <section className="mb-6">
      <SectionHeader title="Keyboard Shortcuts" />
      <div style={cardStyle} className="px-4 pb-3">
        <p className="text-xs py-2.5" style={{ color: 'var(--color-text-secondary)' }}>
          Click Edit on any shortcut to rebind it. Custom bindings are shown in
          <span style={{ color: 'var(--color-accent)' }}> accent color</span>.
        </p>
        <div>
          {Object.entries(DEFAULT_SHORTCUT_KEYS).map(([desc, defaultKey]) => {
            const current = customKeyBindings[desc] ?? defaultKey;
            const isCustom = desc in customKeyBindings;
            const isEditing = editing === desc;
            return (
              <div
                key={desc}
                className="flex items-center gap-3 py-1.5 px-2 rounded-lg"
                style={{
                  border: isEditing ? '1px solid var(--color-accent)' : '1px solid transparent',
                  transition: 'border-color 0.15s',
                }}
              >
                <span className="flex-1 text-xs" style={{ color: 'var(--color-text-primary)' }}>
                  {desc}
                </span>
                {isEditing ? (
                  <>
                    {/* Invisible focusable div that captures key events */}
                    <div
                      role="textbox"
                      aria-label={`Capture new key for ${desc}`}
                      tabIndex={0}
                      onKeyDown={handleCapture}
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      className="text-xs px-3 py-1 rounded cursor-text select-none"
                      style={{
                        minWidth: 110,
                        fontFamily: 'monospace',
                        backgroundColor: 'var(--color-accent-soft)',
                        color: capturedKey ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                        border: '1px solid var(--color-accent)',
                      }}
                    >
                      {capturedKey || '— press keys —'}
                    </div>
                    <button
                      onClick={saveEdit}
                      disabled={!capturedKey}
                      className="text-xs px-2 py-1 rounded disabled:opacity-40"
                      style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <kbd
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        border: '1px solid var(--color-border)',
                        color: isCustom ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        fontFamily: 'monospace',
                      }}
                    >
                      {current}
                    </kbd>
                    <button
                      onClick={() => startEdit(desc)}
                      className="text-[10px] px-2 py-0.5 rounded"
                      aria-label={`Edit shortcut for ${desc}`}
                      style={{ color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}
                    >
                      Edit
                    </button>
                    {isCustom && (
                      <button
                        onClick={() => setCustomKeyBinding(desc, '')}
                        className="text-[10px] px-2 py-0.5 rounded"
                        aria-label={`Reset ${desc} to default`}
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        ↺
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <button
          onClick={resetCustomKeyBindings}
          className="mt-3 text-xs px-3 py-1 rounded"
          style={{ color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}
        >
          Reset all to defaults
        </button>
      </div>
    </section>
  );
}

/* ─── DiscordRpcSettings ────────────────────────────────────────────────────
   Electron-only component rendered in the Desktop Pet section of GeneralTab.
   Allows the user to configure their Discord Application ID and enable RPC.
   Communicates with main.js via IPC (get-discord-state / set-discord-app-id /
   set-discord-rpc-enabled).
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * Discord Rich Presence configuration panel.
 * Only rendered when the app is running inside Electron.
 */
function DiscordRpcSettings() {
  const [appId, setAppId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate from persistent electron-store on mount
  useEffect(() => {
    window.electronAPI?.getDiscordState().then((state) => {
      setAppId(state.appId);
      setEnabled(state.enabled);
      setConnected(state.connected);
    }).catch(() => {});
  }, []);

  /** Persist App ID when user tabs out of the input field. */
  const handleAppIdBlur = useCallback(async () => {
    if (!appId.trim()) return;
    await window.electronAPI?.setDiscordAppId(appId.trim());
  }, [appId]);

  /** Toggle RPC on/off. Saves App ID first, then enables/disables. */
  const handleToggle = useCallback(async (checked: boolean) => {
    if (checked && !appId.trim()) {
      setError('Enter a Discord Application ID first.');
      return;
    }
    setError(null);
    setLoading(true);
    await window.electronAPI?.setDiscordAppId(appId.trim());
    const result = await window.electronAPI?.setDiscordRpcEnabled(checked);
    setEnabled(checked);
    setConnected(result?.connected ?? false);
    if (result?.error === 'no_app_id') setError('Enter a Discord Application ID first.');
    setLoading(false);
  }, [appId]);

  // Status badge state derived from enabled + connected flags
  const badge = connected
    ? { label: 'Connected', color: '#22c55e' }
    : enabled
      ? { label: 'Discord not running', color: '#f59e0b' }
      : { label: 'Disconnected', color: 'var(--color-text-secondary)' };

  return (
    <div style={cardStyle} className="px-4">
      <SettingField
        label="Discord Application ID"
        description="Create an app at discord.com/developers/applications, then paste its numeric ID here."
        tooltip="The 18-digit numeric ID from your Discord Developer Portal app page. Required for Rich Presence."
      >
        <input
          type="text"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          onBlur={handleAppIdBlur}
          placeholder="123456789012345678"
          className="text-sm px-2 py-1 rounded w-48"
          style={selectStyle}
        />
      </SettingField>

      <SettingField
        label="Enable Discord Rich Presence"
        description={
          <span>
            Shows your active character in Discord.{' '}
            <span style={{ color: badge.color }}>● {badge.label}</span>
          </span>
        }
        tooltip="Displays 'Chatting with Kitsune' in your Discord profile when active. Discord must be running and logged in."
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={loading}
          onChange={(e) => handleToggle(e.target.checked)}
          className="accent-[var(--color-accent)]"
        />
      </SettingField>

      {error && (
        <p className="text-xs pb-3 pl-1" style={{ color: 'var(--color-error, #ef4444)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

interface GeneralTabProps {
  config: Record<string, unknown>; save: (k: string, v: unknown) => void;
  cfg: (k: string, fb?: unknown) => unknown;
  theme: string; setTheme: (t: ThemeMode) => void;
  advancedMode: boolean; toggleAdvancedMode: () => void;
  layoutMode: LayoutMode; setLayoutMode: (m: LayoutMode) => void;
}

function GeneralTab({ save, cfg, theme, setTheme, advancedMode, toggleAdvancedMode, layoutMode, setLayoutMode }: GeneralTabProps) {
  const { incognito, setIncognito, showQuickChips, setShowQuickChips, settingsMode, setSettingsMode, settingsTier, setSettingsTier, activeCharacter, thinkingIndicatorMode, setThinkingIndicatorMode } = useAppStore();

  /** Proactive messages: enabled toggle (per-character, PATCH /api/characters/{id}/proactive). */
  const [proactiveEnabled, setProactiveEnabled] = useState(Boolean(activeCharacter?.proactive_enabled));
  /** Proactive messages: frequency preset — 'quiet' | 'normal' | 'chatty'. */
  const [proactiveFrequency, setProactiveFrequency] = useState<string>(activeCharacter?.proactive_frequency ?? 'normal');
  /** Proactive messages: active hour window as "start-end" string, e.g. "9-22". */
  const [proactiveHours, setProactiveHours] = useState<string>(activeCharacter?.proactive_hours ?? '9-22');
  /** Proactive messages: recent history records fetched from /api/characters/{id}/proactive/history. */
  const [proactiveHistory, setProactiveHistory] = useState<Array<{id: number; text: string; triggered_at: number; trigger_type: string}>>([]);

  /** Sync proactive state and fetch recent history whenever the active character changes. */
  useEffect(() => {
    if (!activeCharacter?.id) return;
    setProactiveEnabled(Boolean(activeCharacter.proactive_enabled));
    setProactiveFrequency(activeCharacter.proactive_frequency ?? 'normal');
    setProactiveHours(activeCharacter.proactive_hours ?? '9-22');
    fetch(`/api/characters/${activeCharacter.id}/proactive/history?limit=5`)
      .then(r => r.json())
      .then((data: { ok?: boolean; messages?: Array<{id: number; text: string; triggered_at: number; trigger_type: string}> }) => {
        if (data.ok) setProactiveHistory(data.messages ?? []);
      })
      .catch(() => {});
  }, [activeCharacter?.id]);

  /**
   * PATCHes per-character proactive message settings to the backend.
   *
   * Args:
   *   updates: Partial proactive config — any of { enabled, frequency, hours }.
   *
   * Errors are swallowed silently so a failed network call never disrupts
   * the settings UI.
   */
  const saveProactive = async (updates: Record<string, unknown>) => {
    if (!activeCharacter?.id) return;
    try {
      await fetch(`/api/characters/${activeCharacter.id}/proactive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch { /* silent — non-critical */ }
  };

  return (
    <>
      {/* Theme */}
      <section className="mb-6">
        <SectionHeader title="Theme" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Color Theme" description="8 themes — light, pastel, and dark variants."
            tooltip="Changes all colors, shadows, and accents across the entire UI.">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemeMode)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <optgroup label="Light">
                <option value="sakura">Sakura — warm rose</option>
                <option value="crystal">Crystal — cool blue</option>
              </optgroup>
              <optgroup label="Light Pastel">
                <option value="matcha">Matcha — sage green</option>
                <option value="lavender">Lavender — soft violet</option>
                <option value="peach">Peach — warm coral</option>
              </optgroup>
              <optgroup label="Dark">
                <option value="dark-sakura">Dark Sakura</option>
                <option value="dark-crystal">Dark Crystal</option>
                <option value="midnight">Midnight — navy &amp; gold</option>
              </optgroup>
            </select>
          </SettingField>
        </div>
      </section>

      {/* Theme Customization */}
      <ThemeCustomizationSection setTheme={setTheme} />

      {/* Layout */}
      <section className="mb-6">
        <SectionHeader title="Layout" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Chat Layout" description="How chat and 3D model are arranged."
            tooltip="Chat-first shows the conversation full width. Model-first gives the 3D model most of the screen. Split shows both side-by-side.">
            <select
              value={String(cfg('chat_layout', 'chat-first'))}
              onChange={(e) => save('chat_layout', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="chat-first">Chat First</option>
              <option value="model-first">Model First</option>
              <option value="split">Split</option>
            </select>
          </SettingField>

          <SettingField label="Chat Font Size" description="Size of chat message text."
            tooltip="Affects all chat bubbles. Small=12px, Medium=14px, Large=16px.">
            <select
              value={String(cfg('chat_font_size', 'medium'))}
              onChange={(e) => save('chat_font_size', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </SettingField>

          <SettingField label="Show Timestamps" description="Show time on each chat bubble."
            tooltip="Displays the message timestamp on hover.">
            <input
              type="checkbox"
              checked={cfg('show_timestamps', true) as boolean}
              onChange={(e) => save('show_timestamps', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SettingField label="Interface Sounds" description="Subtle clicks and beeps for UI interactions."
            tooltip="Plays cyberpunk-style audio feedback on button clicks and events.">
            <input
              type="checkbox"
              checked={cfg('ui_sounds', false) as boolean}
              onChange={(e) => save('ui_sounds', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SettingField label="Frontend" description="Switch between Sakura and Neon interfaces.">
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/frontend/switch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ frontend: 'neon' }),
                  });
                  const data = await res.json();
                  if (data.ok) window.location.href = data.reload_url || '/';
                } catch (err) {
                  console.error('Frontend switch failed:', err);
                }
              }}
              className="text-sm px-3 py-1 rounded cursor-pointer"
              style={selectStyle}
            >
              Switch to Neon
            </button>
          </SettingField>
        </div>
      </section>

      {/* Chat Effects */}
      <section className="mb-6">
        <SectionHeader title="Chat Effects" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Typewriter Effect" description="Animate AI responses word by word."
            tooltip="AI responses appear word-by-word for a visual novel feel. Disable for instant display.">
            <input
              type="checkbox"
              checked={cfg('typewriter_enabled', false) as boolean}
              onChange={(e) => save('typewriter_enabled', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          {Boolean(cfg('typewriter_enabled', false)) && (
            <SliderField
              label="Typewriter Speed" description="Words revealed per second."
              tooltip="Higher = faster reveal. 15 w/s is a good default for readability."
              value={Number(cfg('typewriter_speed', 15))}
              min={5} max={40} step={1}
              onChange={(v) => save('typewriter_speed', v)}
              format={(v) => `${v} w/s`}
            />
          )}
        </div>
      </section>

      {/* 3D Viewport */}
      <section className="mb-6">
        <SectionHeader title="3D Viewport" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Scene Lighting" description="Lighting mood for the 3D viewport."
            tooltip="Studio is neutral. Warm sunset, cool moonlight, and neon are atmospheric.">
            <select
              value={String(cfg('lighting_preset', 'studio'))}
              onChange={(e) => save('lighting_preset', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="studio">Studio</option>
              <option value="warm_sunset">Warm Sunset</option>
              <option value="cool_moonlight">Cool Moonlight</option>
              <option value="dramatic">Dramatic</option>
              <option value="neon">Neon</option>
            </select>
          </SettingField>

          <SettingField label="Shadow Quality" description="3D character shadow rendering."
            tooltip="Off = fastest. Soft = realistic blur (recommended). Sharp = hard-edged shadows.">
            <select
              value={String(cfg('shadow_quality', 'off'))}
              onChange={(e) => save('shadow_quality', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="off">Off</option>
              <option value="soft">Soft</option>
              <option value="sharp">Sharp</option>
            </select>
          </SettingField>

          <SettingField label="FPS Cap" description="Limit 3D render frame rate." advanced
            tooltip="Capping FPS reduces GPU load. Useful if running in the background or on battery.">
            <select
              value={String(cfg('fps_target', 'Unlimited'))}
              onChange={(e) => save('fps_target', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
              <option value="120">120 FPS</option>
              <option value="Unlimited">Unlimited</option>
            </select>
          </SettingField>

          <SettingField label="Anti-Aliasing" description="Smooth jagged edges on 3D models." advanced
            tooltip="Smooths stair-step edges. Disabling saves ~10-15% GPU. Requires page reload.">
            <input
              type="checkbox"
              checked={cfg('antialias', true) as boolean}
              onChange={(e) => save('antialias', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>
        </div>
      </section>

      {/* Behavior */}
      <section className="mb-6">
        <SectionHeader title="Behavior" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Ambient Idle" description="Show idle status messages like 'daydreaming...' in chat header."
            tooltip="Purely cosmetic — no LLM calls. Toggles status text cycling in chat header.">
            <input
              type="checkbox"
              checked={cfg('ambient_idle', true) as boolean !== false}
              onChange={(e) => save('ambient_idle', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          {/* Proactive Messages — expanded per-character settings group */}
          <SettingField label="Proactive Messages" description="Character sends unprompted messages based on time, mood, and milestones." advanced
            tooltip="When enabled, the character will initiate conversations based on schedules, idle detection, and relationship milestones.">
            <input
              type="checkbox"
              checked={proactiveEnabled}
              onChange={(e) => {
                setProactiveEnabled(e.target.checked);
                saveProactive({ enabled: e.target.checked });
              }}
              style={{ accentColor: 'var(--color-accent)' }}
            />
          </SettingField>

          {proactiveEnabled && (
            <>
              <SettingField label="Frequency" description={`Max ${proactiveFrequency === 'quiet' ? '1' : proactiveFrequency === 'chatty' ? '5' : '3'} messages/day`} advanced>
                <select
                  value={proactiveFrequency}
                  onChange={(e) => {
                    setProactiveFrequency(e.target.value);
                    saveProactive({ frequency: e.target.value });
                  }}
                  style={selectStyle}
                  className="text-sm px-2 py-1 rounded"
                >
                  <option value="quiet">Quiet (1/day)</option>
                  <option value="normal">Normal (3/day)</option>
                  <option value="chatty">Chatty (5/day)</option>
                </select>
              </SettingField>

              <SettingField label="Active Hours" description="Only send messages during these hours" advanced>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={parseInt(proactiveHours.split('-')[0]) || 9}
                    onChange={(e) => {
                      const start = e.target.value;
                      const end = proactiveHours.split('-')[1] || '22';
                      const newHours = `${start}-${end}`;
                      setProactiveHours(newHours);
                      saveProactive({ hours: newHours });
                    }}
                    style={{ ...selectStyle, width: 64, padding: '2px 6px', borderRadius: 4 }}
                  />
                  <span style={{ color: 'var(--color-text-secondary)' }}>to</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={parseInt(proactiveHours.split('-')[1]) || 22}
                    onChange={(e) => {
                      const start = proactiveHours.split('-')[0] || '9';
                      const end = e.target.value;
                      const newHours = `${start}-${end}`;
                      setProactiveHours(newHours);
                      saveProactive({ hours: newHours });
                    }}
                    style={{ ...selectStyle, width: 64, padding: '2px 6px', borderRadius: 4 }}
                  />
                </div>
              </SettingField>

              {proactiveHistory.length > 0 && (
                <SettingField label="Recent Messages" description="Last proactive messages sent" advanced>
                  <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 320 }}>
                    {proactiveHistory.slice(0, 3).map(m => (
                      <div key={m.id} style={{ color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.text}>
                        <span style={{ opacity: 0.6 }}>
                          {new Date(m.triggered_at * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {' — '}
                        {m.text.length > 60 ? m.text.slice(0, 60) + '...' : m.text}
                      </div>
                    ))}
                  </div>
                </SettingField>
              )}
            </>
          )}

          <SettingField label="Message During AI Response" description="What to do when you send while AI is still responding." advanced
            tooltip="Queue: buffered and auto-fired when response finishes. Steer: aborts current generation. Discard: message is dropped.">
            <select
              value={String(cfg('message_input_mode', 'queue'))}
              onChange={(e) => save('message_input_mode', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="queue">Queue</option>
              <option value="steer">Steer</option>
              <option value="discard">Discard</option>
            </select>
          </SettingField>
        </div>
      </section>

      {/* Display preferences */}
      <section className="mb-6">
        <SectionHeader title="Display" />
        <div style={cardStyle} className="px-4">
          {/* Advanced mode — independent checkbox */}
          <SettingField
            label="Advanced Mode"
            description="Show extra settings and developer fields throughout the app."
          >
            <input
              type="checkbox"
              checked={advancedMode}
              onChange={toggleAdvancedMode}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          {/* Developer mode — visible only when Advanced is ON */}
          <SettingField
            label="Developer Mode"
            description="Unlock dev console, prompt inspector, raw config editor, and power-user tools."
            tier={1}
            tooltip="Enables deep debugging tools: LLM request logger, token profiler, prompt assembly viewer, WebSocket monitor, and raw config editing."
          >
            <input
              type="checkbox"
              checked={settingsTier >= 2}
              onChange={(e) => setSettingsTier(e.target.checked ? 2 : 1)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          {/* Layout mode — mutually exclusive segmented control */}
          <SettingField
            label="Layout"
            description="Normal shows all descriptions. Compact hides them. Mobile enables touch gestures."
          >
            <div
              className="flex gap-0.5 p-0.5 rounded-lg"
              style={{
                backgroundColor: 'var(--color-background)',
                border: '1px solid var(--color-border)',
              }}
            >
              {(['normal', 'compact', 'mobile'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setLayoutMode(mode)}
                  className="px-3 py-1 rounded-md text-xs font-medium transition-all"
                  style={{
                    backgroundColor: layoutMode === mode
                      ? 'var(--color-accent)'
                      : 'transparent',
                    color: layoutMode === mode
                      ? 'var(--color-accent-text)'
                      : 'var(--color-text-muted)',
                  }}
                >
                  {mode === 'normal' ? (
                    <span className="flex items-center gap-1">
                      <Monitor size={10} /> Normal
                    </span>
                  ) : mode === 'compact' ? 'Compact' : 'Mobile'}
                </button>
              ))}
            </div>
          </SettingField>
        </div>
      </section>

      {/* Chat Behaviour */}
      <section className="mb-6">
        <SectionHeader title="Chat Behaviour" />
        <div style={cardStyle} className="px-4">
          <SettingField
            label="Incognito Mode"
            description="When on, messages are not saved to the database. Toggle in Settings instead of the chat toolbar."
          >
            <input
              type="checkbox"
              checked={incognito}
              onChange={e => setIncognito(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>
          <SettingField
            label="Quick-Reply Chips"
            description="Show suggested reply chips after each AI response."
          >
            <input
              type="checkbox"
              checked={showQuickChips}
              onChange={e => setShowQuickChips(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>
          <SettingField
            label="Thinking Indicator Style"
            description="Skeleton: shimmering placeholder + elapsed timer (default). Stages: explicit Reading / Thinking / Generating rows."
          >
            <div
              className="flex gap-0.5 p-0.5 rounded-lg"
              style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)' }}
            >
              {(['skeleton', 'stages'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setThinkingIndicatorMode(mode)}
                  className="px-3 py-1 rounded-md text-xs font-medium transition-all capitalize"
                  style={{
                    backgroundColor: thinkingIndicatorMode === mode ? 'var(--color-accent)' : 'transparent',
                    color: thinkingIndicatorMode === mode ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </SettingField>
          <SettingField
            label="Settings Panel"
            description="Sidebar: Settings opens as a left panel — the 3D model stays visible on the right. Drawer: full-width overlay (default)."
          >
            <div
              className="flex gap-0.5 p-0.5 rounded-lg"
              style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)' }}
            >
              {(['drawer', 'sidebar'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setSettingsMode(mode)}
                  className="px-3 py-1 rounded-md text-xs font-medium transition-all capitalize"
                  style={{
                    backgroundColor: settingsMode === mode ? 'var(--color-accent)' : 'transparent',
                    color: settingsMode === mode ? 'var(--color-accent-text)' : 'var(--color-text-muted)',
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </SettingField>
        </div>
      </section>

      {/* User Persona — "About You" */}
      <section className="mb-6">
        <SectionHeader title="About You" />
        <div style={cardStyle} className="px-4">
          <SettingField
            label="Tell your characters about yourself"
            description="This text is shared with all characters. It helps them understand who you are and adapt their personality."
            tooltip="Injected into the system prompt as [About the user]. Max 500 characters."
          >
            <div style={{ width: '100%' }}>
              <textarea
                value={String(cfg('user_persona', ''))}
                onChange={(e) => {
                  if (e.target.value.length <= 500) save('user_persona', e.target.value);
                }}
                placeholder="e.g. I'm a 25yo guy who likes anime, gaming, and late-night conversations..."
                rows={3}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8rem',
                  lineHeight: 1.55,
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
              <div style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                {String(cfg('user_persona', '')).length}/500
              </div>
            </div>
          </SettingField>
        </div>
      </section>

      {/* Feature Discovery */}
      <section className="mb-6">
        <SectionHeader title="Feature Discovery" />
        <div style={cardStyle} className="px-4">
          <SettingField
            label="Hide tooltips"
            description="Suppress all contextual feature tips permanently."
          >
            <input
              type="checkbox"
              checked={Boolean(cfg('tooltips_hidden', false))}
              onChange={(e) => save('tooltips_hidden', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>
        </div>
      </section>

      {/* Desktop Pet — only visible when running in Electron */}
      {window.electronAPI?.isElectron && (
        <section className="mb-6">
          <SectionHeader title="Desktop Pet" />
          <DiscordRpcSettings />
        </section>
      )}

      {/* Setup Guides */}
      <SetupGuidesSection />

      {/* Keyboard Shortcuts editor (#24) */}
      <ShortcutEditorSection />
    </>
  );
}

/* ─── ModelCapabilityCard ───────────────────────────────────────────────────
   Shows HF-enriched capability badges for the selected model.
   Tier, vision, tools, thinking, context window, architecture.
   Also provides "Apply to character" to write the capability_profile.
   ─────────────────────────────────────────────────────────────────────────── */

const TIER_COLORS: Record<string, string> = {
  tiny: '#94a3b8', small: '#4ade80', medium: '#22d3ee',
  large: '#a78bfa', xl: '#f472b6', unknown: '#6b7280',
};

const TIER_LABELS: Record<string, string> = {
  tiny: 'Tiny (≤3B)', small: 'Small (≤7B)', medium: 'Medium (≤14B)',
  large: 'Large (≤32B)', xl: 'XL (70B+)', unknown: 'Unknown',
};

/**
 * Capability badge strip for the BrainTab.
 * Fetches /api/models/capabilities when model selection changes (debounced 600ms).
 */
function ModelCapabilityCard({
  modelId,
  lmContextLength,
  activeCharacterId,
  onApply,
  onAutoDetect,
}: {
  modelId: string;
  lmContextLength?: number;
  activeCharacterId?: number | null;
  onApply: (caps: ModelCapabilities) => void;
  /** Fires once when capabilities are first detected (for auto-applying config). */
  onAutoDetect?: (caps: ModelCapabilities) => void;
}) {
  const [caps, setCaps] = useState<ModelCapabilities | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCaps = useCallback(async (id: string, ctx?: number) => {
    if (!id.trim()) { setCaps(null); return; }
    setLoading(true);
    setError(null);
    setApplied(false);
    try {
      const result = await api.getModelCapabilities(id, ctx);
      if (result.ok) {
        setCaps(result);
        onAutoDetect?.(result);
      } else {
        setError('Detection failed');
      }
    } catch {
      setError('Could not reach backend');
    } finally {
      setLoading(false);
    }
  }, [onAutoDetect]);

  // Debounce re-fetch when model ID or context changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCaps(modelId, lmContextLength), 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [modelId, lmContextLength, fetchCaps]);

  const handleApply = () => {
    if (!caps) return;
    onApply(caps);
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  };

  const fmtCtx = (n?: number | null) => {
    if (!n) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return String(n);
  };

  if (!modelId.trim()) return null;

  return (
    <div
      className="mx-4 mb-3 rounded-lg px-3 py-2.5 text-xs"
      style={{
        backgroundColor: 'var(--color-background)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {loading && (
        <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
          <RefreshCw size={11} className="animate-spin" />
          Detecting capabilities…
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
          <HelpCircle size={11} />
          {error}
        </div>
      )}

      {caps && !loading && (
        <div className="flex flex-col gap-2">
          {/* Badge row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Tier */}
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                color: TIER_COLORS[caps.tier] ?? '#6b7280',
                border: `1px solid ${TIER_COLORS[caps.tier] ?? '#6b7280'}40`,
                backgroundColor: `${TIER_COLORS[caps.tier] ?? '#6b7280'}15`,
              }}
              title={TIER_LABELS[caps.tier]}
            >
              {TIER_LABELS[caps.tier] ?? caps.tier}
            </span>

            {/* Architecture */}
            {caps.architecture && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px]"
                style={{
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                {caps.architecture}
              </span>
            )}

            {/* Context window (HF ground truth > LM Studio reported) */}
            {(caps.context_window || caps.lm_context_length) && (
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]"
                style={{
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-subtle)',
                }}
                title={
                  caps.context_window
                    ? `HuggingFace max: ${caps.context_window.toLocaleString()} tokens`
                    : `LM Studio: ${caps.lm_context_length?.toLocaleString()} tokens`
                }
              >
                <Cpu size={9} />
                {fmtCtx(caps.context_window ?? caps.lm_context_length)} ctx
              </span>
            )}

            {/* Feature flags */}
            {caps.supports_tools && (
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]"
                style={{ color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', backgroundColor: 'rgba(74,222,128,0.08)' }}
                title="Supports function calling / tool use"
              >
                <Wrench size={9} /> Tools
              </span>
            )}
            {caps.supports_vision && (
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]"
                style={{ color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)', backgroundColor: 'rgba(34,211,238,0.08)' }}
                title="Supports vision / image inputs"
              >
                <Eye size={9} /> Vision
              </span>
            )}
            {caps.supports_thinking && (
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]"
                style={{ color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', backgroundColor: 'rgba(167,139,250,0.08)' }}
                title="Extended reasoning / thinking mode available"
              >
                <Lightbulb size={9} /> Reasoning
              </span>
            )}
          </div>

          {/* Source + HF link + Apply button row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
              <span>
                {caps.source === 'hf'
                  ? 'via HuggingFace'
                  : caps.source === 'heuristic'
                  ? 'name heuristics'
                  : 'estimated'}
              </span>
              {caps.hf_repo && (
                <a
                  href={`https://huggingface.co/${caps.hf_repo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-0.5"
                  style={{ color: 'var(--color-accent)' }}
                  title={`View ${caps.hf_repo} on HuggingFace`}
                >
                  <ExternalLink size={9} /> HF
                </a>
              )}
            </div>

            {activeCharacterId != null && (
              <button
                onClick={handleApply}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] transition-all"
                style={{
                  background: applied
                    ? 'rgba(74,222,128,0.15)'
                    : 'var(--color-accent-gradient)',
                  color: applied ? '#4ade80' : 'var(--color-accent-text)',
                  border: applied ? '1px solid rgba(74,222,128,0.3)' : 'none',
                }}
                title="Write these detected capabilities to the active character's profile"
              >
                {applied ? <><CheckCircle size={9} /> Applied!</> : 'Apply to character'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: Brain (LLM)
   ═══════════════════════════════════════════════════════════════════════ */

interface BrainTabProps {
  config: Record<string, unknown>; save: (k: string, v: unknown) => void;
  cfg: (k: string, fb?: unknown) => unknown;
  lmModels: LMStudioModel[]; lmLoading: boolean; fetchLmModels: () => void;
}

/** Provider presets: clicking one auto-fills endpoint + provider key. */
const PROVIDER_PRESETS = [
  { label: 'LM Studio', provider: 'openai',  endpoint: 'http://localhost:1234/v1' },
  { label: 'Ollama',    provider: 'ollama',  endpoint: 'http://localhost:11434/v1' },
  { label: 'Claude',    provider: 'claude',  endpoint: 'https://api.anthropic.com' },
  { label: 'OpenAI',    provider: 'openai',  endpoint: 'https://api.openai.com/v1' },
] as const;

function BrainTab({ save, cfg, lmModels, lmLoading, fetchLmModels }: BrainTabProps) {
  const currentModel = String(cfg('llm.model', ''));
  const currentProvider = String(cfg('llm.provider', 'openai'));
  const currentEndpoint = String(cfg('llm.endpoint', ''));
  const loadedModels = lmModels.filter(m => m.state === 'loaded');
  const unloadedModels = lmModels.filter(m => m.state !== 'loaded');
  const { activeCharacter, replyLengthMode, setReplyLengthMode } = useAppStore();

  /** C2: Manual tool protocol override for the current model (auto = no override). */
  const [overrideProtocol, setOverrideProtocol] = useState<'auto' | 'openai_functions' | 'xml_fallback' | 'none'>('auto');

  useEffect(() => {
    if (!currentModel) return;
    api.getCapabilityCache().then(result => {
      const entry = result.entries?.find(e => e.model_id === currentModel);
      if (entry?.manual_override) {
        setOverrideProtocol(entry.tool_protocol as 'openai_functions' | 'xml_fallback' | 'none');
      } else {
        setOverrideProtocol('auto');
      }
    }).catch(() => {});
  }, [currentModel]);

  // Ollama model list (fetched separately from LM Studio)
  const [ollamaModels, setOllamaModels] = useState<LMStudioModel[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const fetchOllamaModels = useCallback(async () => {
    setOllamaLoading(true);
    try {
      const models = await api.getOllamaModels();
      setOllamaModels(models);
    } catch { /* Ollama not reachable */ }
    finally { setOllamaLoading(false); }
  }, []);

  // Auto-fetch Ollama model list when provider is set to ollama
  useEffect(() => {
    if (currentProvider === 'ollama') fetchOllamaModels();
  }, [currentProvider, fetchOllamaModels]);

  // When provider is ollama, show Ollama models; otherwise show LM Studio models
  const isOllama = currentProvider === 'ollama';
  const modelList = isOllama ? ollamaModels : lmModels;
  const modelListLoading = isOllama ? ollamaLoading : lmLoading;
  const refreshModels = isOllama ? fetchOllamaModels : fetchLmModels;

  /** Auto-detect context window from the first loaded LM Studio model. */
  const autoDetectContext = () => {
    const loaded = loadedModels[0];
    if (loaded?.max_context_length) {
      save('context_limit', loaded.max_context_length);
    }
  };

  /**
   * Apply HF-detected capabilities to the active character's capability_profile.
   * Maps ModelCapabilities → the capability_profile JSON schema the backend expects.
   */
  const applyCapabilitiesToCharacter = useCallback(async (caps: ModelCapabilities) => {
    if (!activeCharacter?.id) return;
    const profile = {
      model_tier: caps.tier === 'unknown' ? undefined : caps.tier,
      context_budget: caps.context_window ?? caps.lm_context_length ?? undefined,
      supports_tools: caps.supports_tools,
      supports_vision: caps.supports_vision,
      supports_thinking: caps.supports_thinking,
      notes: caps.hf_repo
        ? `Auto-detected from ${caps.hf_repo} (${caps.source})`
        : `Auto-detected via ${caps.source}`,
    };
    try {
      await api.updateCharacter(activeCharacter.id, {
        capability_profile: JSON.stringify(profile),
      });
    } catch (err) {
      console.error('Failed to save capability_profile:', err);
    }
  }, [activeCharacter]);

  // Context length for the currently loaded model (for capability enrichment)
  const loadedModelCtx = loadedModels.find(m => m.id === currentModel)?.max_context_length
    ?? loadedModels[0]?.max_context_length;

  return (
    <>
      {/* ── Section 1: Connection ── */}
      <section className="mb-6">
        <SectionHeader title="Connection" />
        <div style={cardStyle} className="px-4">
          {/* Provider preset quick-pick */}
          <SettingField label="Backend" description="Choose your local AI runtime."
            tooltip="Clicking a preset fills in the endpoint and provider automatically. You can still edit the endpoint manually.">
            <div className="flex gap-1 flex-wrap">
              {PROVIDER_PRESETS.map(p => {
                const active = currentProvider === p.provider && currentEndpoint === p.endpoint;
                return (
                  <button
                    key={p.label}
                    onClick={() => { save('llm.provider', p.provider); save('llm.endpoint', p.endpoint); }}
                    className="text-xs px-2.5 py-1 rounded transition-all"
                    style={{
                      background: active ? 'var(--color-accent-gradient)' : 'var(--color-surface-raised)',
                      color: active ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                      border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </SettingField>

          {/* LLM Endpoint */}
          <SettingField label="LLM Endpoint" description="OpenAI-compatible API URL."
            tooltip="LM Studio default: http://localhost:1234/v1 · Ollama: http://localhost:11434/v1 · Change if running on a different port or machine.">
            <input
              type="text"
              value={currentEndpoint}
              onChange={(e) => save('llm.endpoint', e.target.value)}
              placeholder="http://localhost:1234/v1"
              className="text-sm px-2 py-1 w-56 rounded" style={selectStyle}
            />
          </SettingField>

          {/* Active Model dropdown — shows LM Studio or Ollama models depending on provider */}
          <SettingField
            label="Active Model"
            description={isOllama ? 'Select from installed Ollama models.' : 'Select from LM Studio or type a model name.'}
            tooltip={isOllama
              ? 'Ollama loads models on demand. Click ↻ to refresh.'
              : 'Shows models from LM Studio. Loaded models are marked. Click ↻ to re-scan.'
            }
          >
            <div className="flex items-center gap-2">
              <select
                value={currentModel}
                onChange={(e) => save('llm.model', e.target.value)}
                className="text-sm px-2 py-1 rounded w-48" style={selectStyle}
              >
                <option value="">-- Select Model --</option>
                {/* LM Studio: separate Loaded / Available groups */}
                {!isOllama && loadedModels.length > 0 && (
                  <optgroup label="Loaded (Active)">
                    {loadedModels.map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </optgroup>
                )}
                {!isOllama && unloadedModels.length > 0 && (
                  <optgroup label="Available">
                    {unloadedModels.map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </optgroup>
                )}
                {/* Ollama: flat list (loads on demand) */}
                {isOllama && ollamaModels.length > 0 && (
                  <optgroup label="Installed">
                    {ollamaModels.map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </optgroup>
                )}
                {/* Manual entry fallback when model not in list */}
                {currentModel && !modelList.find(m => m.id === currentModel) && (
                  <option value={currentModel}>{currentModel} (manual)</option>
                )}
              </select>
              <button
                onClick={refreshModels}
                className="text-xs px-2 py-1 rounded"
                style={selectStyle}
                title="Refresh model list"
              >
                {modelListLoading ? '...' : '↻'}
              </button>
              {/* HuggingFace link — extract repo from model path */}
              {currentModel && (() => {
                // LM Studio format: "author/repo-name/filename.gguf" or "author/repo-name"
                const parts = currentModel.split('/');
                const hfRepo = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
                if (!hfRepo || hfRepo.includes('.')) return null;
                return (
                  <a
                    href={`https://huggingface.co/${hfRepo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-2 py-1 rounded flex items-center gap-1"
                    style={{ ...selectStyle, color: 'var(--color-accent)', textDecoration: 'none' }}
                    title={`View ${hfRepo} on HuggingFace`}
                  >
                    <ExternalLink size={10} /> HF
                  </a>
                );
              })()}
            </div>
          </SettingField>
        </div>
      </section>

      {/* ── Section 1.5: Link Devices (collapsible) ── */}
      <LinkStatusPanel
        linkEnabled={cfg('llm.link.enabled', false) as boolean}
        autoRoute={cfg('llm.link.auto_route', true) as boolean}
        onToggleLink={(v) => save('llm.link.enabled', v)}
        onToggleAutoRoute={(v) => save('llm.link.auto_route', v)}
      />

      {/* ── Section 2: Model Intelligence ── */}
      <section className="mb-6">
        <SectionHeader title="Model Intelligence" />

        {/* Capability badge strip — shown whenever a model is selected */}
        {currentModel && (
          <ModelCapabilityCard
            modelId={currentModel}
            lmContextLength={loadedModelCtx}
            activeCharacterId={activeCharacter?.id ?? null}
            onApply={applyCapabilitiesToCharacter}
            onAutoDetect={(caps) => {
              const changes: string[] = [];
              if (caps.supports_thinking) { save('llm.thinking_mode', true); changes.push('Reasoning'); }
              if (caps.supports_tools) { save('llm.tool_use_enabled', true); changes.push('Tools'); }
              if (caps.supports_vision) { save('llm.vision_enabled', true); changes.push('Vision'); }
              if (caps.context_window) { save('context_limit', caps.context_window); }
              if (changes.length > 0) {
                const arch = caps.architecture ?? caps.model_id?.split('/').pop() ?? 'Model';
                useToastStore.getState().addToast({
                  message: `${arch}: ${changes.join(', ')} enabled`,
                  icon: '🧠',
                  type: 'success',
                  onClick: () => {
                    useAppStore.getState().openSettingsTab?.('brain');
                  },
                });
              }
            }}
          />
        )}

        <div style={cardStyle} className="px-4">
          {/* Thinking / Reasoning toggle */}
          <SettingField label="Thinking / Reasoning" description="Enable extended reasoning for supported models." tier={1}
            tooltip="Auto-detected for Qwen3, DeepSeek-R1/R2, QwQ, and other reasoning-capable models. When enabled, the model spends more time thinking before responding (slower but smarter).">
            <input
              type="checkbox"
              checked={cfg('llm.thinking_mode', false) as boolean}
              onChange={(e) => save('llm.thinking_mode', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          {/* Show Thinking Tags toggle (moved from old flat list) */}
          <SettingField label="Show Thinking Tags" description="Show the AI's chain-of-thought reasoning in chat." tier={1}
            tooltip="Shows reasoning in <think> tags. Useful for debugging.">
            <input
              type="checkbox"
              checked={cfg('thinking_visible', true) as boolean}
              onChange={(e) => save('thinking_visible', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          {/* Tool Use / Function Calling toggle */}
          <SettingField label="Tool Use / Function Calling" description="Allow the AI to use tools when available." tier={1}
            tooltip="When enabled and model supports it, the AI can execute tools (web search, code, etc). Disable to force text-only responses.">
            <input
              type="checkbox"
              checked={cfg('llm.tool_use_enabled', true) as boolean}
              onChange={(e) => save('llm.tool_use_enabled', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          {/* Vision / Image Input toggle */}
          <SettingField label="Vision / Image Input" description="Allow sending images to the AI." tier={1}
            tooltip="When enabled and model supports vision, you can attach images to messages. Disable to hide the image upload button.">
            <input
              type="checkbox"
              checked={cfg('llm.vision_enabled', true) as boolean}
              onChange={(e) => save('llm.vision_enabled', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          {/* Context Window Override */}
          <SettingField label="Context Window" description="Max tokens for memory. Match your model's context length."
            tooltip="Set to your model's max context. Use Auto-Detect to query LM Studio.">
            <div className="flex items-center gap-2">
              <input
                type="number" min={2048} max={262144} step={1024}
                value={Number(cfg('context_limit', 131072))}
                onChange={(e) => save('context_limit', parseInt(e.target.value))}
                className="text-sm px-2 py-1 w-24 rounded" style={selectStyle}
              />
              {loadedModels.length > 0 && (
                <button
                  onClick={autoDetectContext}
                  className="text-xs px-2 py-1 rounded"
                  style={{ ...selectStyle, color: 'var(--color-accent)' }}
                >
                  Auto-Detect
                </button>
              )}
            </div>
          </SettingField>

          {/* Character Detail Level — tiered prompt selection */}
          <SettingField
            label="Character Detail"
            description="How much personality to include in the system prompt."
            tooltip="Auto selects based on context window: ≤8K uses Lite (~1K tokens), ≤16K uses Full (~3K), >16K uses Full + Character Bible. Override to force a specific level."
          >
            <select
              value={String(cfg('prompt_tier', 'auto'))}
              onChange={(e) => save('prompt_tier', e.target.value)}
              className="text-sm px-2 py-1 rounded"
              style={selectStyle}
            >
              <option value="auto">Auto (Recommended)</option>
              <option value="lite">Lite — minimal personality (~1K tokens)</option>
              <option value="full">Full — complete character (~3K tokens)</option>
              <option value="deep">Deep — full + character bible (~5K+ tokens)</option>
            </select>
          </SettingField>

          {/* Tool Protocol Override (dev-only) */}
          <SettingField
            label="Tool Call Protocol" tier={2}
            description="How this model invokes tools. Override if auto-detection is wrong."
            tooltip="openai_functions = native JSON schemas (Qwen2.5, Llama 3.1+). xml_fallback = XML injected as system prompt (older models). none = disable tools. Auto-detect uses pattern matching and caches results."
          >
            <select
              value={overrideProtocol}
              onChange={(e) => {
                const v = e.target.value as 'auto' | 'openai_functions' | 'xml_fallback' | 'none';
                setOverrideProtocol(v);
                if (v !== 'auto' && currentModel) {
                  api.setModelToolProtocol(currentModel, v).catch(() => {});
                }
              }}
              className="text-sm px-2 py-1 rounded"
              style={selectStyle}
            >
              <option value="auto">Auto-detect</option>
              <option value="openai_functions">OpenAI Functions (native JSON)</option>
              <option value="xml_fallback">XML Fallback (system prompt)</option>
              <option value="none">None (disable tools)</option>
            </select>
          </SettingField>
        </div>
      </section>

      {/* ── Section 3: Inference Parameters ── */}
      <section className="mb-6">
        <SectionHeader title="Inference Parameters" />
        <div style={cardStyle} className="px-4">
          {/* Reply Length — always visible */}
          <SettingField
            label="Reply Length"
            description="How many tokens the AI targets per response. Auto adjusts based on your typing speed."
          >
            <div className="flex gap-1.5">
              {(['brief', 'normal', 'detailed', 'auto'] as ReplyLengthMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setReplyLengthMode(mode)}
                  aria-pressed={replyLengthMode === mode}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize transition-colors"
                  style={{
                    backgroundColor: replyLengthMode === mode ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: replyLengthMode === mode ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                    border: '1px solid ' + (replyLengthMode === mode ? 'var(--color-accent)' : 'var(--color-border)'),
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </SettingField>

          <SliderField
            label="Temperature" description="Higher = more creative, lower = more logical." tier={1}
            tooltip="0.7 recommended for chat. Lower (0.3) for factual, higher (1.2) for creative."
            value={Number(cfg('temperature', 0.7))}
            min={0.1} max={2.0} step={0.1}
            onChange={(v) => save('temperature', v)}
            format={(v) => v.toFixed(1)}
          />

          <SliderField
            label="Repetition Penalty" description="Prevent looping phrases." tier={1}
            tooltip="1.1 is usually perfect. Higher values may make responses feel forced."
            value={Number(cfg('repeat_penalty', 1.1))}
            min={1.0} max={2.0} step={0.05}
            onChange={(v) => save('repeat_penalty', v)}
            format={(v) => v.toFixed(2)}
          />

          <SettingField label="System Prompt Override" description="Override the default system prompt for all characters." tier={1}
            tooltip="Overrides character personality. Leave empty to use default persona.">
            <textarea
              value={String(cfg('system_prompt', ''))}
              onChange={(e) => save('system_prompt', e.target.value)}
              placeholder="Leave empty to use character's default..."
              rows={3}
              className="text-sm px-2 py-1 w-full rounded resize-y"
              style={selectStyle}
            />
          </SettingField>
        </div>
      </section>

      {/* ── Section 4: Context & Memory ── */}
      <section className="mb-6">
        <SectionHeader title="Context & Memory" />
        <div style={cardStyle} className="px-4">
          <SliderField
            label="Chat History Limit" description="Max messages sent per request. 0 = unlimited." tier={1}
            tooltip="0 = send all history (recommended for large context). Set a limit if hitting token limits."
            value={Number(cfg('llm.history_limit', cfg('history_limit', 0)))}
            min={0} max={500} step={10}
            onChange={(v) => save('llm.history_limit', v)}
            format={(v) => v === 0 ? '∞' : String(v)}
          />

          {/* Auto-Compact Threshold */}
          <SettingField label="Auto-Compact Threshold" description="Compress history when context reaches this % full." tier={1}
            tooltip="When the context budget exceeds this percentage, the app automatically summarizes older messages to free space. Lower values compact sooner (preserves more budget), higher values keep more raw history.">
            <div className="flex items-center gap-2">
              <input type="range" min={50} max={95} step={5}
                value={cfg('auto_compact_threshold', 85) as number}
                onChange={(e) => save('auto_compact_threshold', parseInt(e.target.value))}
                className="flex-1" style={{ accentColor: 'var(--color-accent)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)', minWidth: 32, textAlign: 'right' }}>
                {String(cfg('auto_compact_threshold', 85))}%
              </span>
            </div>
          </SettingField>

          {/* Compact Batch Size */}
          <SettingField label="Compact Batch Size" description="Messages per compression batch." tier={2}
            tooltip="How many messages to summarize in each compression step. Smaller batches = more granular summaries but more LLM calls.">
            <input type="number" min={5} max={50} step={5}
              value={cfg('compact_batch_size', 20) as number}
              onChange={(e) => save('compact_batch_size', parseInt(e.target.value) || 20)}
              className="w-16 text-sm text-center rounded"
              style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text)', padding: '4px 8px' }} />
          </SettingField>

          {/* Keep Recent Messages */}
          <SettingField label="Keep Recent Messages" description="Messages to keep verbatim during compaction." tier={2}
            tooltip="During auto-compaction, this many of the most recent messages are preserved verbatim (not summarized). More = better immediate context, less = more room for summary history.">
            <input type="number" min={2} max={20} step={1}
              value={cfg('keep_recent_messages', 6) as number}
              onChange={(e) => save('keep_recent_messages', parseInt(e.target.value) || 6)}
              className="w-16 text-sm text-center rounded"
              style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text)', padding: '4px 8px' }} />
          </SettingField>
        </div>
      </section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: Voice (TTS / ASR)
   ═══════════════════════════════════════════════════════════════════════ */

interface TabProps {
  config: Record<string, unknown>; save: (k: string, v: unknown) => void;
  cfg: (k: string, fb?: unknown) => unknown;
}

function VoiceTab({ save, cfg }: TabProps) {
  const { activeCharacter } = useAppStore();
  const [wandRunning, setWandRunning] = useState(false);
  const [wandResult, setWandResult] = useState<string | null>(null);

  const runVoiceWand = async () => {
    if (!activeCharacter?.id || wandRunning) return;
    setWandRunning(true);
    setWandResult(null);
    try {
      const res = await api.getCharacterVoiceWand(activeCharacter.id);
      setWandResult(res.voice_description);
    } catch (err) {
      console.error('[VoiceWand] failed:', err);
    } finally {
      setWandRunning(false);
    }
  };

  /** Trigger a TTS preview using current voice settings. */
  const previewVoice = async () => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello! This is a voice preview test.',
          provider: cfg('tts.provider', 'edge-tts'),
          voice_id: cfg('tts.voice_id', cfg('voice_id', '')),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.url) {
          const audio = new Audio(data.url);
          audio.volume = Number(cfg('tts_volume', 1.0));
          audio.play();
        }
      }
    } catch (err) {
      console.error('Voice preview failed:', err);
    }
  };

  return (
    <>
      <section className="mb-6">
        <SectionHeader title="Text-to-Speech" />
        <div style={cardStyle} className="px-4">
          <SettingField label="TTS Provider" description="Which speech engine to use."
            tooltip="CPU engines run locally with no GPU. GPU engines need a graphics card. Cloud engines require internet but no local hardware.">
            <select
              value={String(cfg('tts.provider', 'edge-tts'))}
              onChange={(e) => save('tts.provider', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <optgroup label="Cloud (no local install)">
                <option value="edge-tts">Edge-TTS (Free)</option>
                <option value="elevenlabs">ElevenLabs (Paid)</option>
                <option value="fish_audio">Fish Audio (Cloud)</option>
                <option value="voxtral">Voxtral (Mistral, Cloud)</option>
              </optgroup>
              <optgroup label="CPU (no GPU needed)">
                <option value="kokoro">Kokoro (82M params)</option>
                <option value="piper_local">Piper (ONNX)</option>
                <option value="kitten">KittenTTS (15-80M)</option>
                <option value="melotts">MeloTTS (100M)</option>
              </optgroup>
              <optgroup label="GPU (local, high quality)">
                <option value="bark">Bark (1B, 2-12GB VRAM)</option>
                <option value="styletts2">StyleTTS 2 (300M, 2GB VRAM)</option>
                <option value="parler">Parler-TTS (880M, 4GB VRAM)</option>
                <option value="f5tts">F5-TTS (330M, 4GB VRAM)</option>
                <option value="cosyvoice">CosyVoice 3 (0.5B, 8GB VRAM)</option>
              </optgroup>
              <optgroup label="Voice Cloning (GPU)">
                <option value="chatterbox">Chatterbox (Turbo, cloning)</option>
                <option value="gptsovits">GPT-SoVITS (cloning)</option>
                <option value="xtts_server">XTTS v2 (cloning)</option>
                <option value="metavoice">MetaVoice-1B (cloning)</option>
                <option value="dia">Dia (1.6B, dialogue, cloning)</option>
              </optgroup>
              <optgroup label="Other">
                <option value="generic_rest">Generic REST Endpoint</option>
              </optgroup>
            </select>
          </SettingField>

          <SettingField label="Voice" description="Select a voice for the active TTS engine."
            tooltip="Browses available voices grouped by engine. Install more voices in the TTS Models tab.">
            <VoicePicker
              value={String(cfg('tts.voice_id', cfg('voice_id', '')))}
              provider={String(cfg('tts.provider', 'edge-tts'))}
              onChange={(voiceId, provider) => {
                save('tts.voice_id', voiceId);
                save('tts.provider', provider);
              }}
            />
          </SettingField>

          <SettingField label="Auto-Speak" description="Automatically play TTS audio for new messages.">
            <input
              type="checkbox"
              checked={Boolean(cfg('tts.auto_speak', false))}
              onChange={(e) => save('tts.auto_speak', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SliderField
            label="Volume" description="Master volume for TTS audio playback."
            tooltip="Controls volume of all TTS audio. 100% is full volume. Applies to voice preview and in-chat playback."
            value={Number(cfg('tts_volume', 1.0))}
            min={0} max={1.0} step={0.05}
            onChange={(v) => save('tts_volume', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />

          <SliderField
            label="Speech Rate" description="Speed of TTS output."
            tooltip="1.0 is normal speed. Lower for dramatic delivery, higher for quick responses."
            value={Number(cfg('speech_rate', 1.0))}
            min={0.5} max={2.0} step={0.1}
            onChange={(v) => save('speech_rate', v)}
            format={(v) => `${v.toFixed(1)}x`}
          />

          <SliderField
            label="Pitch Shift" description="Semitone shift for voice." advanced
            tooltip="Negative = deeper, positive = higher."
            value={Number(cfg('pitch_shift', 0))}
            min={-10} max={10} step={1}
            onChange={(v) => save('pitch_shift', v)}
            format={(v) => v > 0 ? `+${v}` : String(v)}
          />

          <SliderField
            label="Voice Stability" description="Consistent vs expressive." advanced
            tooltip="Low = more expressive and varied. High = more consistent but robotic."
            value={Number(cfg('voice_stability', 0.5))}
            min={0} max={1.0} step={0.1}
            onChange={(v) => save('voice_stability', v)}
            format={(v) => v.toFixed(1)}
          />

          <SliderField
            label="Chatterbox Exaggeration" description="Emotional intensity for Chatterbox TTS." advanced
            tooltip="0.3–0.5 = Calm. 0.7–0.9 = Natural. 1.2–1.5 = Dramatic. Only applies to Chatterbox."
            value={Number(cfg('tts.exaggeration', 0.8))}
            min={0.3} max={2.0} step={0.1}
            onChange={(v) => save('tts.exaggeration', v)}
            format={(v) => v.toFixed(1)}
          />

          <SettingField label="Interrupt Mode" description="Stop AI talking when you speak." advanced
            tooltip="When enabled, sending a new message while TTS is playing will stop playback immediately.">
            <input
              type="checkbox"
              checked={cfg('interrupt_mode', true) as boolean}
              onChange={(e) => save('interrupt_mode', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SettingField label="Fast TTS (Sentence Streaming)" description="Start speaking after first sentence instead of waiting for full reply." advanced
            tooltip="Recommended for local TTS. Turn OFF for ElevenLabs.">
            <input
              type="checkbox"
              checked={cfg('tts.fast_chunking', true) as boolean}
              onChange={(e) => save('tts.fast_chunking', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SettingField label="Voice Preview" description="Hear the current voice settings with a test phrase.">
            <button
              onClick={previewVoice}
              className="text-sm px-3 py-1 rounded cursor-pointer"
              style={{ ...selectStyle, color: 'var(--color-accent)' }}
            >
              ▶ Preview
            </button>
          </SettingField>
        </div>
      </section>

      <section className="mb-6">
        <SectionHeader title="Voice Cloning" />
        <div style={cardStyle} className="px-4">
          <SettingField
            label="Voice Wand"
            description="Generate a voice description for the active character using their personality and backstory."
            tooltip="The AI reads the character's profile and writes a Parler-style voice description. Use this as a prompt when setting up Parler-TTS or Chatterbox."
          >
            <button
              onClick={runVoiceWand}
              disabled={wandRunning || !activeCharacter}
              className="text-sm px-3 py-1 rounded cursor-pointer disabled:opacity-50"
              style={{ ...selectStyle, color: 'var(--color-accent)' }}
            >
              {wandRunning ? '✨ Generating...' : '✨ Generate Voice Description'}
            </button>
          </SettingField>
          {wandResult && (
            <SettingField label="Result" description="Copy this description into your TTS engine's voice prompt field.">
              <textarea
                readOnly
                value={wandResult}
                rows={4}
                className="text-xs rounded w-full"
                style={{ ...selectStyle, resize: 'vertical', fontFamily: 'monospace' }}
              />
            </SettingField>
          )}
          <SettingField
            label="Voice Sample"
            description="Upload a voice sample for zero-shot cloning (Chatterbox, XTTS, GPT-SoVITS)."
            tooltip="Upload a 10-30s WAV/MP3 clip of the character's voice. Used by local cloning adapters."
          >
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              Upload a sample in the Character tab → Voice section.
            </span>
          </SettingField>
        </div>
      </section>

      <section className="mb-6">
        <SectionHeader title="Speech Recognition (ASR)" />
        <div style={cardStyle} className="px-4">
          <SettingField label="ASR Provider" description="Speech recognition engine for voice input."
            tooltip="Browser: Web Speech API (cloud). Faster-Whisper: local offline. Groq: free cloud Whisper API.">
            <select
              value={String(cfg('asr_provider', 'browser'))}
              onChange={(e) => save('asr_provider', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="browser">Browser (Web Speech API)</option>
              <option value="faster_whisper">Faster-Whisper (Local)</option>
              <option value="groq">Groq (Free Cloud)</option>
            </select>
          </SettingField>

          {/* Groq ASR API key — shown only when Groq provider is selected */}
          {String(cfg('asr_provider', 'browser')) === 'groq' && (
            <SettingField label="Groq API Key" description="Free API key from console.groq.com."
              tooltip="Get a free API key at console.groq.com. Groq runs Whisper large-v3 in the cloud with sub-second latency — no local GPU needed. The free tier includes generous monthly limits.">
              <input
                type="password"
                value={String(cfg('groq_api_key', ''))}
                onChange={(e) => save('groq_api_key', e.target.value)}
                placeholder="gsk_..."
                className="text-sm px-2 py-1.5 rounded w-64 font-mono"
                style={selectStyle}
              />
            </SettingField>
          )}

          <SettingField label="Whisper Model Size" description="Accuracy vs speed tradeoff." advanced
            tooltip="tiny.en: fastest. base.en: good balance. large-v3: best accuracy, needs ~4GB RAM.">
            <select
              value={String(cfg('asr_model', 'base.en'))}
              onChange={(e) => save('asr_model', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="tiny.en">tiny.en (fastest)</option>
              <option value="base.en">base.en (balanced)</option>
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large-v3">large-v3 (best)</option>
            </select>
          </SettingField>

          <SliderField
            label="VAD Sensitivity" description="Lower = more sensitive. Higher = ignores keyboard noise." advanced
            tooltip="Default 0.015. Try 0.02–0.03 if keyboard clicks trigger hands-free mode."
            value={Number(cfg('vad_threshold', 0.015))}
            min={0.001} max={0.05} step={0.001}
            onChange={(v) => save('vad_threshold', v)}
            format={(v) => v.toFixed(3)}
          />

          <SliderField
            label="ASR Confidence Threshold" description="Min confidence to accept transcription. 0 = accept all." advanced
            tooltip="Transcriptions below this are discarded. Only used by Faster-Whisper."
            value={Number(cfg('asr_min_confidence', 0))}
            min={0} max={0.9} step={0.05}
            onChange={(v) => save('asr_min_confidence', v)}
            format={(v) => v === 0 ? 'Off' : v.toFixed(2)}
          />
        </div>
      </section>

      <section className="mb-6">
        <SectionHeader title="Voice Conversation (Full-Duplex)" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Auto-Interrupt" description="AI stops speaking when you start talking."
            tooltip="Enables barge-in: when voice activity is detected during AI speech, the AI immediately stops. Disable if you want to listen without accidentally interrupting.">
            <input
              type="checkbox"
              checked={cfg('voice.auto_interrupt', true) as boolean}
              onChange={(e) => save('voice.auto_interrupt', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SliderField
            label="Silence Timeout" description="How long to wait after you stop speaking before processing."
            tooltip="Shorter = snappier responses but may cut off pauses. Longer = more forgiving for natural speech pauses. Range: 200ms–10,000ms."
            value={Number(cfg('voice.silence_timeout_ms', 1500))}
            min={200} max={5000} step={100}
            onChange={(v) => save('voice.silence_timeout_ms', v)}
            format={(v) => `${v}ms`}
          />

          <SliderField
            label="VAD Threshold (Duplex)" description="Voice activity detection sensitivity for full-duplex mode."
            tooltip="Lower = more sensitive (picks up quiet speech). Higher = less sensitive (ignores background noise). This is separate from the push-to-talk VAD above. Range: 0.001–0.5."
            value={Number(cfg('voice.vad_threshold', 0.015))}
            min={0.001} max={0.1} step={0.001}
            onChange={(v) => save('voice.vad_threshold', v)}
            format={(v) => v.toFixed(3)}
          />

          <SliderField
            label="Echo Gate Threshold" description="VAD threshold during AI speech to prevent self-triggering." advanced
            tooltip="Higher values prevent the AI's own voice from triggering barge-in through speakers. Only applies when auto-interrupt is enabled."
            value={Number(cfg('voice.speaking_vad_threshold', 0.06))}
            min={0.01} max={0.3} step={0.01}
            onChange={(v) => save('voice.speaking_vad_threshold', v)}
            format={(v) => v.toFixed(2)}
          />
        </div>
      </section>

      {/* ── Phase 12-P5: Character Audio ──────────────────────────────── */}
      <section className="mb-6">
        <SectionHeader title="Character Audio" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Ambient Audio" description="Breathing, vocalizations, and interaction sounds.">
            <select
              value={String(cfg('character_audio.enabled', 'false'))}
              onChange={(e) => save('character_audio.enabled', e.target.value === 'true')}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="false">Disabled</option>
              <option value="true">Enabled</option>
            </select>
          </SettingField>
          <SliderField
            label="Audio Volume" description="Master volume for character sounds."
            value={Number(cfg('character_audio.volume', 0.15))}
            min={0} max={1} step={0.01}
            onChange={(v) => save('character_audio.volume', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <SettingField label="Breathing Sounds" description="Subtle breathing cycle synced to emotion.">
            <select
              value={String(cfg('character_audio.breathing', 'true'))}
              onChange={(e) => save('character_audio.breathing', e.target.value === 'true')}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </SettingField>
          <SettingField label="Idle Vocalizations" description="Occasional 'hmm', sighs, giggles during silence.">
            <select
              value={String(cfg('character_audio.vocals', 'true'))}
              onChange={(e) => save('character_audio.vocals', e.target.value === 'true')}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </SettingField>
          <SettingField label="Touch Sounds" description="Sound effects when tapping the character.">
            <select
              value={String(cfg('character_audio.interaction', 'true'))}
              onChange={(e) => save('character_audio.interaction', e.target.value === 'true')}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </SettingField>
        </div>
      </section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: Safety
   ═══════════════════════════════════════════════════════════════════════ */

/** Maps content ceiling level name to legacy integer for backward compat with bridge.py. */
const CEILING_TO_INT: Record<string, number> = {
  general: 2,
  edgy: 1,
  mature: 0,
  explicit: -1,
};

/** Display metadata for each content ceiling level. */
const CEILING_OPTIONS: Array<{
  value: string;
  label: string;
  description: string;
  accentColor: string;
  requiresVerification: boolean;
}> = [
  { value: 'general',  label: 'General',  description: 'Family-safe. No mature themes.',       accentColor: '#22c55e', requiresVerification: false },
  { value: 'edgy',     label: 'Edgy',     description: 'Violence, dark humor, mild language.',  accentColor: '#eab308', requiresVerification: false },
  { value: 'mature',   label: 'Mature',   description: 'Adult themes, suggestive content.',     accentColor: '#f97316', requiresVerification: true  },
  { value: 'explicit', label: 'Explicit', description: 'Unrestricted adult content.',           accentColor: '#ef4444', requiresVerification: true  },
];

/**
 * Safety / Content Gate settings tab.
 *
 * Renders five sections:
 * 1. Content Ceiling — radio-card selector backed by the /api/content-gate endpoint.
 * 2. Age Verification — one-time confirmation gate for mature/explicit levels.
 * 3. Per-Character Overrides — collapsible per-character ceiling dropdowns.
 * 4. Content Lock — optional password lock that disables all ceiling controls.
 * 5. RP Style, Audio Cache, Vocabulary — pre-existing config-backed settings.
 */
function SafetyTab({ save, cfg }: TabProps) {
  const { characters } = useAppStore();

  // ── Content gate remote state ────────────────────────────────────
  const [ceiling, setCeiling] = useState<string>('general');
  const [ageVerified, setAgeVerified] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [perCharCeilings, setPerCharCeilings] = useState<Record<string, string>>({});
  const [gateLoading, setGateLoading] = useState(true);
  const [gateError, setGateError] = useState<string | null>(null);

  // ── Age verification UI state ────────────────────────────────────
  const [ageCheckPending, setAgeCheckPending] = useState(false);

  // ── Content lock UI state ────────────────────────────────────────
  const [lockPassword, setLockPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [lockBusy, setLockBusy] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  // ── Per-character overrides section collapse state ───────────────
  const [charOverridesOpen, setCharOverridesOpen] = useState(false);

  // ── AIE Phase C: Feedback signal privacy preferences ────────────
  const [feedbackExplicit, setFeedbackExplicit] = useState(true);
  const [feedbackImplicit, setFeedbackImplicit] = useState(true);

  useEffect(() => {
    api.getFeedbackPreferences()
      .then(prefs => {
        setFeedbackExplicit(prefs.explicit_signals_enabled);
        setFeedbackImplicit(prefs.implicit_signals_enabled);
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  const handleFeedbackToggle = async (key: 'explicit_signals_enabled' | 'implicit_signals_enabled', val: boolean) => {
    if (key === 'explicit_signals_enabled') setFeedbackExplicit(val);
    else setFeedbackImplicit(val);
    try {
      await api.setFeedbackPreferences({ [key]: val });
    } catch {
      // Roll back on error
      if (key === 'explicit_signals_enabled') setFeedbackExplicit(!val);
      else setFeedbackImplicit(!val);
    }
  };

  /** Load content gate settings from the backend on mount. */
  useEffect(() => {
    setGateLoading(true);
    api.getContentGate()
      .then(data => {
        setCeiling(data.global_content_ceiling);
        setAgeVerified(data.age_verified);
        setLockEnabled(data.content_lock_enabled);
        setPerCharCeilings(data.per_character_ceilings ?? {});
        setGateError(null);
      })
      .catch(err => {
        setGateError(String(err));
      })
      .finally(() => setGateLoading(false));
  }, []);

  /**
   * Change the global content ceiling via API.
   * Also keeps the legacy `content_filter_level` integer in sync for bridge.py compat.
   *
   * @param newCeiling - One of 'general' | 'edgy' | 'mature' | 'explicit'.
   */
  const handleCeilingChange = async (newCeiling: string) => {
    try {
      const res = await api.updateContentGate({ global_content_ceiling: newCeiling });
      setCeiling(res.global_content_ceiling);
      // Backward compat: keep the integer field in sync
      save('content_filter_level', CEILING_TO_INT[res.global_content_ceiling] ?? 1);
    } catch (err) {
      setGateError(`Failed to save: ${String(err)}`);
    }
  };

  /**
   * Confirm age verification after user checks the checkbox and confirms the dialog.
   */
  const handleVerifyAge = async () => {
    if (!window.confirm('I confirm I am 18 years of age or older.')) return;
    setAgeCheckPending(true);
    try {
      const res = await api.verifyAge();
      setAgeVerified(res.age_verified);
    } catch (err) {
      setGateError(`Verification failed: ${String(err)}`);
    } finally {
      setAgeCheckPending(false);
    }
  };

  /**
   * Enable the content lock with the provided password.
   */
  const handleSetLock = async () => {
    if (lockPassword.length < 4) {
      setLockError('Password must be at least 4 characters.');
      return;
    }
    setLockBusy(true);
    setLockError(null);
    try {
      const res = await api.setContentLock(lockPassword);
      setLockEnabled(res.content_lock_enabled);
      setLockPassword('');
    } catch (err) {
      setLockError(`Failed to set lock: ${String(err)}`);
    } finally {
      setLockBusy(false);
    }
  };

  /**
   * Unlock content controls by verifying the password.
   */
  const handleUnlock = async () => {
    setLockBusy(true);
    setLockError(null);
    try {
      const res = await api.unlockContent(unlockPassword);
      setLockEnabled(res.content_lock_enabled);
      setUnlockPassword('');
    } catch (err) {
      setLockError('Incorrect password.');
    } finally {
      setLockBusy(false);
    }
  };

  /**
   * Update the per-character ceiling override for one character.
   *
   * @param charId - Character primary key.
   * @param value - Ceiling level string, or 'global' to inherit global setting.
   */
  const handleCharCeiling = async (charId: number, value: string) => {
    const resolved = value === 'global' ? null : value;
    try {
      const res = await api.setCharacterCeiling(charId, resolved);
      setPerCharCeilings(prev => {
        const next = { ...prev };
        if (res.ceiling === null) {
          delete next[charId];
        } else {
          next[charId] = res.ceiling;
        }
        return next;
      });
    } catch (err) {
      setGateError(`Failed to update character ceiling: ${String(err)}`);
    }
  };

  const controlsDisabled = lockEnabled || gateLoading;

  return (
    <>
      {/* ── Section 1: Content Ceiling ─────────────────────────────── */}
      <section className="mb-6">
        <SectionHeader title="Content Ceiling" />
        <div style={cardStyle} className="px-4 py-3">
          {gateLoading && (
            <p className="text-xs py-2" style={{ color: 'var(--color-text-secondary)' }}>
              Loading…
            </p>
          )}
          {gateError && (
            <p className="text-xs py-2" style={{ color: '#ef4444' }}>
              {gateError}
            </p>
          )}
          {lockEnabled && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded text-xs"
              style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              <Lock size={12} />
              <span>Content controls are locked. Enter your password below to make changes.</span>
            </div>
          )}
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {CEILING_OPTIONS.map(opt => {
              const isSelected = ceiling === opt.value;
              const needsVerify = opt.requiresVerification && !ageVerified;
              return (
                <button
                  key={opt.value}
                  disabled={controlsDisabled || (needsVerify)}
                  onClick={() => handleCeilingChange(opt.value)}
                  style={{
                    border: isSelected
                      ? `2px solid ${opt.accentColor}`
                      : '2px solid var(--color-border)',
                    borderRadius: 'var(--radius-card)',
                    backgroundColor: isSelected
                      ? `color-mix(in srgb, ${opt.accentColor} 12%, var(--color-surface))`
                      : 'var(--color-surface)',
                    padding: '10px 12px',
                    textAlign: 'left',
                    cursor: controlsDisabled || needsVerify ? 'not-allowed' : 'pointer',
                    opacity: controlsDisabled || needsVerify ? 0.5 : 1,
                    transition: 'border-color 0.15s, background-color 0.15s',
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold" style={{ color: isSelected ? opt.accentColor : 'var(--color-text)' }}>
                      {opt.label}
                    </span>
                    {needsVerify && <Lock size={12} style={{ color: 'var(--color-text-secondary)' }} />}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Section 2: Age Verification ────────────────────────────── */}
      {!ageVerified && (
        <section className="mb-6">
          <SectionHeader title="Age Verification" />
          <div style={cardStyle} className="px-4">
            <SettingField
              label="I am 18 years or older"
              description="Required to access Mature and Explicit ceiling levels."
              tooltip="Age verification is stored locally and never transmitted. You only need to confirm once.">
              <button
                disabled={ageCheckPending || lockEnabled}
                onClick={handleVerifyAge}
                className="text-xs px-3 py-1 rounded"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-text-on-accent, #fff)',
                  border: 'none',
                  cursor: ageCheckPending || lockEnabled ? 'not-allowed' : 'pointer',
                  opacity: ageCheckPending || lockEnabled ? 0.6 : 1,
                }}
              >
                {ageCheckPending ? 'Confirming…' : 'Confirm Age'}
              </button>
            </SettingField>
          </div>
        </section>
      )}

      {/* ── Section 3: Per-Character Overrides ─────────────────────── */}
      <section className="mb-6">
        <SectionHeader title="Per-Character Overrides" />
        <div style={cardStyle} className="px-4">
          {/* Collapsible header row */}
          <button
            onClick={() => setCharOverridesOpen(o => !o)}
            className="flex items-center justify-between w-full py-3 text-sm"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)' }}
          >
            <span>Override ceiling per character</span>
            <span style={{ color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="text-xs">{charOverridesOpen ? 'Hide' : 'Show'}</span>
              {charOverridesOpen
                ? <ChevronDown size={14} />
                : <ChevronRight size={14} />}
            </span>
          </button>

          {charOverridesOpen && (
            <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8, paddingBottom: 8 }}>
              {characters.length === 0 && (
                <p className="text-xs py-2" style={{ color: 'var(--color-text-secondary)' }}>No characters found.</p>
              )}
              {characters.map(char => (
                <div key={char.id} className="flex items-center justify-between py-2"
                  style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                    {char.name}
                  </span>
                  <select
                    disabled={controlsDisabled}
                    value={perCharCeilings[char.id] ?? 'global'}
                    onChange={e => handleCharCeiling(char.id, e.target.value)}
                    className="text-sm px-2 py-1 rounded"
                    style={{ ...selectStyle, minWidth: 110, opacity: controlsDisabled ? 0.5 : 1 }}
                  >
                    <option value="global">Use Global</option>
                    <option value="general">General</option>
                    <option value="edgy">Edgy</option>
                    <option value="mature">Mature</option>
                    <option value="explicit">Explicit</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Section 4: Content Lock ────────────────────────────────── */}
      <section className="mb-6">
        <SectionHeader title="Content Lock" />
        <div style={cardStyle} className="px-4">
          {!lockEnabled ? (
            <SettingField
              label="Lock content controls"
              description="Protect settings with a password to prevent accidental changes."
              tooltip="Once locked, a password is required to change any content ceiling settings. Minimum 4 characters.">
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="Password (min 4)"
                  value={lockPassword}
                  onChange={e => { setLockPassword(e.target.value); setLockError(null); }}
                  className="text-sm px-2 py-1 rounded"
                  style={{ ...selectStyle, width: 130 }}
                />
                <button
                  disabled={lockBusy || lockPassword.length < 4}
                  onClick={handleSetLock}
                  className="text-xs px-3 py-1 rounded"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'var(--color-text-on-accent, #fff)',
                    border: 'none',
                    cursor: lockBusy || lockPassword.length < 4 ? 'not-allowed' : 'pointer',
                    opacity: lockBusy || lockPassword.length < 4 ? 0.6 : 1,
                  }}
                >
                  {lockBusy ? 'Locking…' : 'Enable Lock'}
                </button>
              </div>
              {lockError && (
                <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{lockError}</p>
              )}
            </SettingField>
          ) : (
            <SettingField
              label="Locked"
              description="Enter your password to unlock content controls.">
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="Enter password"
                  value={unlockPassword}
                  onChange={e => { setUnlockPassword(e.target.value); setLockError(null); }}
                  className="text-sm px-2 py-1 rounded"
                  style={{ ...selectStyle, width: 130 }}
                />
                <button
                  disabled={lockBusy || !unlockPassword}
                  onClick={handleUnlock}
                  className="text-xs px-3 py-1 rounded"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    color: 'var(--color-text-on-accent, #fff)',
                    border: 'none',
                    cursor: lockBusy || !unlockPassword ? 'not-allowed' : 'pointer',
                    opacity: lockBusy || !unlockPassword ? 0.6 : 1,
                  }}
                >
                  {lockBusy ? 'Checking…' : 'Unlock'}
                </button>
              </div>
              {lockError && (
                <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{lockError}</p>
              )}
            </SettingField>
          )}
        </div>
      </section>

      {/* ── Section 5: RP Style ────────────────────────────────────── */}
      <section className="mb-6">
        <SectionHeader title="RP Style" />
        <div style={cardStyle} className="px-4">
          <SettingField label="RP Style Preset" description="How much narration formatting to inject into the LLM prompt."
            tooltip="None: natural chat. Light: brief *action* beats. Full: novel-quality narration with (thoughts), *actions*, and sensory detail. Explicit: Full + unrestricted intimate scenes.">
            <select
              value={String(cfg('rp_style_preset', 'none'))}
              onChange={(e) => save('rp_style_preset', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="none">None — Natural chat</option>
              <option value="light_rp">Light RP — Brief action beats</option>
              <option value="full_rp">Full RP — Novel-quality narration</option>
              <option value="explicit_rp">Explicit RP — Unrestricted adult</option>
            </select>
          </SettingField>
        </div>
      </section>

      {/* ── Section 6: Audio Cache ─────────────────────────────────── */}
      <section className="mb-6">
        <SectionHeader title="Audio Cache" />
        <div style={cardStyle} className="px-4">
          <SliderField
            label="Audio Cache Retention" description="Days to keep cached TTS audio (0 = forever)."
            tooltip="Audio files older than this are automatically deleted."
            value={Number(cfg('audio_cleanup_days', 7))}
            min={0} max={30} step={1}
            onChange={(v) => save('audio_cleanup_days', v)}
            format={(v) => v === 0 ? 'Forever' : `${v}d`}
          />
        </div>
      </section>

      {/* ── Section 7: Vocabulary ─────────────────────────────────── */}
      <section className="mb-6">
        <SectionHeader title="Vocabulary" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Inject Vocabulary" description="Send vocab context so the AI uses slang/terms naturally."
            tooltip="When on, the AI receives a curated list of slang/vocab.">
            <input
              type="checkbox"
              checked={cfg('vocab_enabled', true) as boolean}
              onChange={(e) => save('vocab_enabled', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SliderField
            label="Vocab Context Size" description="Max vocab entries injected per message." advanced
            tooltip="More entries = richer vocabulary but uses more tokens. 40 is a good balance."
            value={Number(cfg('vocab_limit', 40))}
            min={10} max={100} step={5}
            onChange={(v) => save('vocab_limit', v)}
          />
        </div>
      </section>

      {/* AIE Phase C: Feedback Signals */}
      <section className="mb-6">
        <SectionHeader title="Feedback Signals" />
        <div style={cardStyle} className="px-4">
          <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Feedback stays local and private. When enabled, it helps your character's responses improve over time through adaptive learning.
          </p>
          <SettingField
            label="Show feedback buttons on messages"
            description="Display 👍/👎 buttons on assistant messages. Your explicit ratings are the strongest signal for personalisation."
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={feedbackExplicit}
                onChange={(e) => handleFeedbackToggle('explicit_signals_enabled', e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                Show 👍 / 👎 buttons
              </span>
            </label>
          </SettingField>
          <SettingField
            label="Allow implicit feedback collection"
            description="Collect anonymous behavioural signals (regenerate rate, session length) to supplement explicit ratings. No content is read."
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={feedbackImplicit}
                onChange={(e) => handleFeedbackToggle('implicit_signals_enabled', e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                Allow implicit signals
              </span>
            </label>
          </SettingField>
        </div>
      </section>

      {/* M6-item22: Affinity-gated NSFW override */}
      <section className="mb-6">
        <SectionHeader title="Bond Gate Override" />
        <div style={cardStyle} className="px-4">
          <SettingField
            label="Skip Bond Level Requirement"
            description="By default, intimate content (desire arc, love letters, audio stories) requires a minimum bond level. Enable this to unlock all bond-gated content immediately."
            tooltip="Useful for testing or if you prefer not to grind relationship levels. This does NOT bypass the global content ceiling — NSFW must still be enabled at the Safety level."
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={Boolean(cfg('nsfw.skip_bond_gate', false))}
                onChange={(e) => save('nsfw.skip_bond_gate', e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                Unlock without bond level requirement
              </span>
            </label>
          </SettingField>
        </div>
      </section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: AI Art
   ═══════════════════════════════════════════════════════════════════════ */

function AIArtTab({ save, cfg }: TabProps) {
  const { activeCharacter } = useAppStore();
  const [genStatus, setGenStatus] = useState<{ available: boolean; provider: string } | null>(null);
  const [genPrompt, setGenPrompt] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [genResult, setGenResult] = useState<{ url: string; type: 'background' | 'portrait' } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const provider = String(cfg('image_gen.provider', 'disabled'));

  // Check backend status whenever provider setting changes
  useEffect(() => {
    if (provider === 'disabled') { setGenStatus(null); return; }
    api.getImageGenStatus()
      .then(s => setGenStatus(s))
      .catch(() => setGenStatus({ available: false, provider }));
  }, [provider]);

  async function generate(type: 'background' | 'portrait') {
    if (!genPrompt.trim() || genBusy) return;
    setGenBusy(true);
    setGenError(null);
    setGenResult(null);
    try {
      const fn = type === 'background' ? api.generateBackground : api.generatePortrait;
      const res = await fn({
        prompt: genPrompt.trim(),
        character_id: activeCharacter?.id,
      });
      if (res.ok && res.url) {
        setGenResult({ url: res.url, type });
      } else {
        setGenError(res.error || 'Generation failed');
      }
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <>
      <section className="mb-6">
        <SectionHeader title="Image Generation" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Image Generator" description="Backend for AI image generation."
            tooltip="ComfyUI (recommended): run locally on port 8188, needs a workflow JSON + checkpoint. Easy Diffusion: just start the app, enable 'Allow Network Access' in its Settings → Server, then paste the URL here — no other config needed. See docs/IMAGE_GEN_GUIDE.md.">
            <select
              value={provider}
              onChange={(e) => { save('image_gen.provider', e.target.value); setGenStatus(null); }}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="disabled">Disabled</option>
              <option value="comfyui">ComfyUI</option>
              <option value="easydiffusion">Easy Diffusion</option>
            </select>
          </SettingField>

          {/* Live status badge — shown when provider is not disabled */}
          {provider !== 'disabled' && (
            <div className="py-3 flex items-center gap-2 text-xs border-t" style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
              <span style={{ color: 'var(--color-text-tertiary)' }}>Status:</span>
              {genStatus === null ? (
                <span style={{ color: 'var(--color-text-tertiary)' }}>Checking…</span>
              ) : genStatus.available ? (
                <span style={{ color: 'var(--color-success, #4caf50)', fontWeight: 600 }}>● Online</span>
              ) : (
                <span style={{ color: 'var(--color-danger, #f44)', fontWeight: 600 }}>● Offline</span>
              )}
              <button
                onClick={() => api.getImageGenStatus().then(setGenStatus).catch(() => setGenStatus({ available: false, provider }))}
                className="ml-1 text-xs opacity-60 hover:opacity-100"
                style={{ color: 'var(--color-accent)' }}
              >
                Recheck
              </button>
            </div>
          )}

          <SettingField label="Image Gen URL" description="URL of your image generation server."
            tooltip="ComfyUI default: http://localhost:8188. Easy Diffusion: http://localhost:9000 (or your LAN machine IP, e.g. http://192.168.1.50:9000 for GPU offloading to another PC).">
            <input
              type="text"
              value={String(cfg('image_gen.endpoint', 'http://localhost:8188'))}
              onChange={(e) => save('image_gen.endpoint', e.target.value)}
              className="text-sm px-2 py-1 w-56 rounded" style={selectStyle}
            />
          </SettingField>

          <SettingField label="Default Checkpoint" description="ComfyUI checkpoint filename (without .safetensors)." advanced
            tooltip="Z-Image-Turbo: 9 steps, ~1s on RTX 5080. FLUX.1-dev: 20 steps.">
            <input
              type="text"
              value={String(cfg('image_gen.model', 'z-image-turbo'))}
              onChange={(e) => save('image_gen.model', e.target.value)}
              className="text-sm px-2 py-1 w-48 rounded" style={selectStyle}
            />
          </SettingField>

          <SliderField
            label="Inference Steps" description="Denoising steps per image. More = higher quality, slower." advanced
            tooltip="Z-Image-Turbo: 9. FLUX.1-dev: 20. SDXL: 25–35."
            value={Number(cfg('image_gen.steps', 9))}
            min={4} max={50} step={1}
            onChange={(v) => save('image_gen.steps', v)}
          />

          <SliderField
            label="Default Width" description="Image width in pixels." advanced
            value={Number(cfg('image_gen.width', 512))}
            min={256} max={1024} step={64}
            onChange={(v) => save('image_gen.width', v)}
            format={(v) => `${v}px`}
          />

          <SliderField
            label="Default Height" description="Image height in pixels." advanced
            value={Number(cfg('image_gen.height', 512))}
            min={256} max={1024} step={64}
            onChange={(v) => save('image_gen.height', v)}
            format={(v) => `${v}px`}
          />

          <SliderField
            label="Image Retention"
            description="Auto-delete chat-generated images older than N days. Set to 0 for unlimited (no cleanup). Expression-portrait files are never affected."
            value={Number(cfg('image_gen.retention_days', 90))}
            min={0} max={365} step={1}
            onChange={(v) => save('image_gen.retention_days', v)}
            format={(v) => (v === 0 ? 'Unlimited' : `${v} days`)}
          />
        </div>
      </section>

      {/* Generate test images — only shown when backend is available */}
      {genStatus?.available && (
        <section className="mb-6">
          <SectionHeader title="Test Generate" />
          <div style={cardStyle} className="p-4">
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Test your image gen setup. Generated images are saved to <code>storage/images/</code>.
              If you specify a character, the background or avatar will be updated automatically.
            </p>
            <textarea
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              placeholder="Describe the image… e.g. 'anime bedroom, lofi aesthetic, neon lights, night'"
              rows={3}
              className="w-full text-sm px-3 py-2 rounded mb-3"
              style={{ ...selectStyle, resize: 'vertical' }}
            />
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => generate('background')}
                disabled={genBusy || !genPrompt.trim()}
                className="px-4 py-1.5 text-sm rounded font-medium transition-opacity"
                style={{
                  background: 'var(--color-accent-gradient)',
                  color: 'var(--color-accent-text)',
                  opacity: genBusy || !genPrompt.trim() ? 0.5 : 1,
                }}
              >
                {genBusy ? '⏳ Generating…' : '🖼 Background'}
              </button>
              <button
                onClick={() => generate('portrait')}
                disabled={genBusy || !genPrompt.trim()}
                className="px-4 py-1.5 text-sm rounded font-medium transition-opacity"
                style={{
                  background: 'var(--color-surface)',
                  color: 'var(--color-accent)',
                  border: '1px solid var(--color-accent)',
                  opacity: genBusy || !genPrompt.trim() ? 0.5 : 1,
                }}
              >
                {genBusy ? '⏳ Generating…' : '👤 Portrait'}
              </button>
            </div>
            {genError && (
              <p className="mt-2 text-xs" style={{ color: 'var(--color-danger, #f44)' }}>{genError}</p>
            )}
            {genResult && (
              <div className="mt-3">
                <p className="text-xs mb-1 capitalize" style={{ color: 'var(--color-text-tertiary)' }}>
                  Generated {genResult.type}
                  {activeCharacter?.id ? ` — applied to ${activeCharacter.name}` : ''}:
                </p>
                <img
                  src={genResult.url}
                  alt={`Generated ${genResult.type}`}
                  className="rounded-lg"
                  style={{
                    maxWidth: '100%',
                    maxHeight: 320,
                    border: '1px solid var(--color-border-subtle)',
                    objectFit: 'contain',
                  }}
                />
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mb-6">
        <SectionHeader title="Video Generation" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Video Generator" description="Backend for AI video backgrounds (takes minutes)." advanced
            tooltip="Requires ComfyUI + WanVideoWrapper. Takes 5–15 min per clip even on RTX 5080.">
            <select
              value={String(cfg('video_gen.provider', 'disabled'))}
              onChange={(e) => save('video_gen.provider', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="disabled">Disabled</option>
              <option value="comfyui">ComfyUI</option>
              <option value="wan2gp">Wan2GP</option>
            </select>
          </SettingField>

          <SettingField label="Video Gen URL" description="URL of your video generation server." advanced>
            <input
              type="text"
              value={String(cfg('video_gen.endpoint', 'http://localhost:8188'))}
              onChange={(e) => save('video_gen.endpoint', e.target.value)}
              className="text-sm px-2 py-1 w-56 rounded" style={selectStyle}
            />
          </SettingField>
        </div>
      </section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: System & Dev
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Live performance stats for animation generation and 3D viewport.
 * Polls /api/motion/stats every 5 seconds and listens for fpsUpdate messages
 * from the viewer iframe.
 *
 * Renders:
 *  - Animation backend (procedural / AI) + average & last latency
 *  - Request success rate (ok / total)
 *  - 3D viewport FPS (sourced from fpsUpdate postMessage)
 */
function PerformanceStatsSection() {
  const [motionStats, setMotionStats] = useState<{
    remote_connected: boolean;
    remote_url: string | null;
    remote_backend: string | null;
    remote_requests_ok: number;
    remote_requests_failed: number;
    remote_latency_ms: number | null;
    remote_avg_latency_ms: number | null;
    remote_server_stats: Record<string, unknown> | null;
    local_backend: string;
    models_dir: string;
  } | null>(null);
  const [viewFps, setViewFps] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Poll motion stats
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const s = await api.getMotionStats();
        if (active) { setMotionStats(s); setLoading(false); }
      } catch { if (active) setLoading(false); }
    }
    load();
    const id = setInterval(load, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Subscribe to FPS updates from the viewer iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'fpsUpdate') setViewFps(e.data.fps as number);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  /** Colour-code latency: green < 200ms, yellow < 1000ms, red ≥ 1000ms */
  function latencyColor(ms: number | null) {
    if (ms == null) return 'var(--color-text-muted)';
    return ms < 200 ? 'var(--color-success, #39c96e)' : ms < 1000 ? '#e8a22a' : '#f44';
  }

  const statRow: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '7px 0', borderBottom: '1px solid var(--color-border-subtle)',
    fontSize: '0.78rem',
  };
  const labelStyle: React.CSSProperties = { color: 'var(--color-text-secondary)' };
  const valStyle: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', fontWeight: 600 };

  return (
    <section className="mb-6">
      <SectionHeader title="Performance" />
      <div style={cardStyle} className="px-4 py-1">
        {loading && (
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', padding: '10px 0' }}>
            Loading stats…
          </p>
        )}
        {!loading && (
          <>
            {/* 3D Viewport FPS */}
            <div style={statRow}>
              <span style={labelStyle}>3D Viewport FPS</span>
              <span style={{
                ...valStyle,
                color: viewFps == null ? 'var(--color-text-muted)'
                     : viewFps >= 50 ? 'var(--color-success, #39c96e)'
                     : viewFps >= 25 ? '#e8a22a' : '#f44',
              }}>
                {viewFps != null ? `${viewFps} FPS` : 'Panel not open'}
              </span>
            </div>

            {/* Motion backend */}
            <div style={statRow}>
              <span style={labelStyle}>Animation Backend</span>
              <span style={{ ...valStyle, color: 'var(--color-text-primary)' }}>
                {motionStats?.remote_connected && motionStats.remote_url
                  ? `Remote GPU (${motionStats.remote_backend ?? 'procedural'})`
                  : motionStats?.local_backend ?? 'procedural'}
              </span>
            </div>

            {/* Remote URL (if connected) */}
            {motionStats?.remote_connected && motionStats.remote_url && (
              <div style={statRow}>
                <span style={labelStyle}>GPU Server</span>
                <span style={{ ...valStyle, fontSize: '0.7rem', color: 'var(--color-success, #39c96e)', fontFamily: 'var(--font-mono, monospace)' }}>
                  {motionStats.remote_url}
                </span>
              </div>
            )}

            {/* Avg latency (remote) */}
            <div style={statRow}>
              <span style={labelStyle}>Avg Animation Latency</span>
              <span style={{ ...valStyle, color: latencyColor(motionStats?.remote_avg_latency_ms ?? null) }}>
                {motionStats?.remote_avg_latency_ms != null ? `${motionStats.remote_avg_latency_ms} ms` : '—'}
              </span>
            </div>

            {/* Last latency (remote) */}
            <div style={statRow}>
              <span style={labelStyle}>Last Animation Latency</span>
              <span style={{ ...valStyle, color: latencyColor(motionStats?.remote_latency_ms ?? null) }}>
                {motionStats?.remote_latency_ms != null ? `${motionStats.remote_latency_ms} ms` : '—'}
              </span>
            </div>

            {/* Remote server stats (shown only when connected) */}
            {motionStats?.remote_connected && motionStats.remote_server_stats && (
              <div style={statRow}>
                <span style={labelStyle}>GPU Server Uptime</span>
                <span style={{ ...valStyle, color: 'var(--color-text-primary)' }}>
                  {(motionStats.remote_server_stats as Record<string, unknown>).uptime_s != null
                    ? `${Math.round(Number((motionStats.remote_server_stats as Record<string, unknown>).uptime_s) / 60)}m`
                    : '—'}
                </span>
              </div>
            )}

            {/* Request counters */}
            <div style={{ ...statRow, borderBottom: 'none' }}>
              <span style={labelStyle}>Animation Requests</span>
              <span style={{ ...valStyle, color: 'var(--color-text-primary)' }}>
                {motionStats
                  ? `${motionStats.remote_requests_ok} / ${motionStats.remote_requests_ok + motionStats.remote_requests_failed} ok`
                  : '—'}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SystemTab({ save, cfg }: TabProps) {
  const { openOverlay } = useAppStore();

  const handleFactoryReset = async () => {
    if (!confirm('Reset ALL settings to defaults? Characters and chat history are NOT affected.')) return;
    try {
      await fetch('/api/config/reset', { method: 'POST' });
      window.location.reload();
    } catch (err) {
      console.error('Reset failed:', err);
    }
  };

  return (
    <>
      <section className="mb-6">
        <SectionHeader title="LM Studio" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Auto-Start LM Studio" description="Start LM Studio daemon automatically on server boot."
            tooltip="Runs 'lms daemon up' + 'lms server start' if LM Studio is not reachable.">
            <input
              type="checkbox"
              checked={cfg('auto_start_lmstudio', true) as boolean}
              onChange={(e) => save('auto_start_lmstudio', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SettingField label="Auto-Load Model" description="Model key to auto-load on headless start. Leave blank to skip." advanced
            tooltip="After starting headless LM Studio, runs 'lms load <model>'. Uses llm.model if blank.">
            <input
              type="text"
              value={String(cfg('lms_autoload_model', ''))}
              onChange={(e) => save('lms_autoload_model', e.target.value)}
              placeholder="e.g. gemma-3-12b-instruct"
              className="text-sm px-2 py-1 w-56 rounded" style={selectStyle}
            />
          </SettingField>
        </div>
      </section>

      <section className="mb-6">
        <SectionHeader title="3D Viewport" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Scene Lighting" description="Lighting mood for the 3D viewport." advanced>
            <select
              value={String(cfg('lighting_preset', 'studio'))}
              onChange={(e) => save('lighting_preset', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="studio">Studio</option>
              <option value="warm_sunset">Warm Sunset</option>
              <option value="cool_moonlight">Cool Moonlight</option>
              <option value="dramatic">Dramatic</option>
              <option value="neon">Neon</option>
            </select>
          </SettingField>

          <SettingField label="FPS Cap" description="Limit 3D render frame rate." advanced
            tooltip="Capping FPS reduces GPU load. Useful on battery or in the background.">
            <select
              value={String(cfg('fps_target', 'Unlimited'))}
              onChange={(e) => save('fps_target', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
              <option value="120">120 FPS</option>
              <option value="Unlimited">Unlimited</option>
            </select>
          </SettingField>

          <SettingField label="Shadow Quality" description="3D character shadow rendering." advanced>
            <select
              value={String(cfg('shadow_quality', 'off'))}
              onChange={(e) => save('shadow_quality', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="off">Off (fastest)</option>
              <option value="soft">Soft</option>
              <option value="sharp">Sharp</option>
            </select>
          </SettingField>

          <SettingField label="Render Quality" description="Pixel ratio for 3D viewport." advanced
            tooltip="Low = fastest. High = native resolution. Ultra = supersampled (sharpest).">
            <select
              value={String(cfg('render_quality', 'High (Native)'))}
              onChange={(e) => save('render_quality', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="Low (1x)">Low (1x)</option>
              <option value="Medium (1.5x)">Medium (1.5x)</option>
              <option value="High (Native)">High (Native)</option>
              <option value="Ultra (2x)">Ultra (2x)</option>
            </select>
          </SettingField>

          <SettingField label="Anti-Aliasing" description="Smooth jagged edges on 3D models." advanced
            tooltip="Disabling saves ~10-15% GPU. Requires page reload.">
            <input
              type="checkbox"
              checked={cfg('antialias', true) as boolean}
              onChange={(e) => save('antialias', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SettingField label="FPS Overlay" description="Display live FPS counter in the 3D viewport." advanced>
            <input
              type="checkbox"
              checked={cfg('show_fps_overlay', false) as boolean}
              onChange={(e) => save('show_fps_overlay', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>
        </div>
      </section>

      <PerformanceStatsSection />

      <section className="mb-6">
        <SectionHeader title="Vocabulary" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Browse Vocabulary" description="Explore the 2537-entry e-girl/VTuber slang library, add custom entries, and import/export.">
            <button
              onClick={() => openOverlay('vocab')}
              className="text-sm px-3 py-1 rounded cursor-pointer"
              style={selectStyle}
            >
              Open Vocabulary Manager
            </button>
          </SettingField>
        </div>
      </section>

      <section className="mb-6">
        <SectionHeader title="Developer" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Developer Mode" description="Show debug log overlay."
            tooltip="Shows a floating debug panel with API calls, errors, and timing.">
            <input
              type="checkbox"
              checked={Boolean(cfg('dev_mode', false))}
              onChange={(e) => save('dev_mode', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SliderField
            label="Log Buffer Size" description="Lines to keep in memory." advanced
            value={Number(cfg('log_limit', 200))}
            min={100} max={1000} step={100}
            onChange={(v) => save('log_limit', v)}
          />

          <SettingField label="Auto-Save Logs" description="Save logs on exit." advanced>
            <input
              type="checkbox"
              checked={Boolean(cfg('save_logs_auto', false))}
              onChange={(e) => save('save_logs_auto', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SettingField label="Export All Data" description="Download a ZIP of all characters, sessions, messages, memories, and config. (#20)">
            <a
              href="/api/data/export"
              download
              className="text-sm px-3 py-1 rounded cursor-pointer inline-block"
              style={{ ...selectStyle, textDecoration: 'none' }}
            >
              Download ZIP
            </a>
          </SettingField>

          <SettingField label="Factory Reset" description="Wipe all settings to defaults. Characters and history are kept.">
            <button
              onClick={handleFactoryReset}
              className="text-sm px-3 py-1 rounded cursor-pointer"
              style={{ ...selectStyle, color: '#ef4444', borderColor: '#ef4444' }}
            >
              Reset All Settings
            </button>
          </SettingField>
        </div>
      </section>

      <section className="mb-6">
        <SectionHeader title="Webhooks" />
        <div style={cardStyle} className="px-4">
          <WebhookSection cfg={cfg} save={save} />
        </div>
      </section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Webhook Config Sub-Section (#7 — Sakura parity with Neon)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Fields for configuring outbound webhook URLs.
 * Each URL is fired by the backend on the corresponding event.
 * A "Test" button sends a GET request to verify reachability.
 */
function WebhookSection({ cfg, save }: Pick<TabProps, 'cfg' | 'save'>) {
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, 'ok' | 'err'>>({});

  /**
   * Fires a GET to the given webhook URL and records pass/fail.
   *
   * @param key - Config key (used as result key)
   * @param url - The webhook URL to test
   */
  const testWebhook = async (key: string, url: string) => {
    if (!url) return;
    setTesting(key);
    try {
      await fetch('/api/config/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      setTestResult(r => ({ ...r, [key]: 'ok' }));
    } catch {
      setTestResult(r => ({ ...r, [key]: 'err' }));
    } finally {
      setTesting(null);
    }
  };

  const webhooks = [
    { key: 'webhook_on_message',       label: 'On Message',        description: 'Fired after every assistant reply.' },
    { key: 'webhook_on_session_start', label: 'On Session Start',  description: 'Fired when a new session begins.' },
    { key: 'webhook_on_emotion_change',label: 'On Emotion Change', description: 'Fired when the detected emotion changes.' },
  ] as const;

  return (
    <>
      {webhooks.map(({ key, label, description }) => {
        const url = String(cfg(key, ''));
        const result = testResult[key];
        return (
          <SettingField key={key} label={label} description={description} advanced>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => save(key, e.target.value)}
                placeholder="https://..."
                className="text-sm px-2 py-1 rounded w-52"
                style={selectStyle}
              />
              <button
                onClick={() => testWebhook(key, url)}
                disabled={!url || testing === key}
                className="text-xs px-2 py-1 rounded"
                style={{
                  ...selectStyle,
                  opacity: (!url || testing === key) ? 0.4 : 1,
                  color: result === 'ok' ? 'var(--color-success)' : result === 'err' ? '#ef4444' : 'var(--color-text-secondary)',
                }}
                title="Send a test ping to this URL"
              >
                {testing === key ? '…' : result === 'ok' ? '✓ OK' : result === 'err' ? '✗ Fail' : 'Test'}
              </button>
            </div>
          </SettingField>
        );
      })}
    </>
  );
}
