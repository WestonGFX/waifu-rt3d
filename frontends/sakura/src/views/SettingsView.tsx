import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain, Volume2, Palette, Shield, Image, Settings, Package, User, Monitor,
  Eye, Wrench, Lightbulb, Cpu, RefreshCw, CheckCircle, HelpCircle, ExternalLink
} from 'lucide-react';
import type { ModelCapabilities } from '../lib/api';
import type { LayoutMode } from '../stores/appStore';
import { useAppStore } from '../stores/appStore';
import { useTheme } from '../hooks/useTheme';
import { SettingField } from '../components/SettingField';
import { VoicePicker } from '../components/VoicePicker';
import { TTSModelsPanel } from '../components/TTSModelsPanel';
import { ModelManagerPanel } from '../components/ModelManagerPanel';
import { api } from '../lib/api';

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
type SettingsTab = 'general' | 'character' | 'brain' | 'voice' | 'safety' | 'aiart' | 'system' | 'tts_models' | 'lm_models';

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
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

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

  /** Save a nested config key like "llm.model". */
  const save = (key: string, value: unknown) => {
    // For nested keys, merge properly with existing parent object
    const parts = key.split('.');
    if (parts.length === 2) {
      const [parent, child] = parts;
      const existing = (config[parent] as Record<string, unknown>) || {};
      saveConfig({ [parent]: { ...existing, ...{ [child]: value } } });
    } else {
      saveConfig({ [key]: value });
    }
  };

  /** Get config value with fallback. */
  const cfg = (key: string, fallback: unknown = '') => cfgGet(config, key, fallback);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div
        className="flex gap-1 p-2 overflow-x-auto flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-active={active}
              className="settings-tab-pill flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200"
              style={{
                background: active ? 'var(--color-accent-gradient)' : 'transparent',
                color: active ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                boxShadow: active ? '0 1px 4px var(--color-accent-soft)' : 'none',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
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
  label, description, tooltip, advanced,
  value, min, max, step, onChange, format
}: {
  label: string; description?: string; tooltip?: string; advanced?: boolean;
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const display = format ? format(value) : value.toString();
  return (
    <SettingField label={label} description={description} tooltip={tooltip} advanced={advanced}>
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
  const { activeCharacter, setActiveCharacter, characters, loadCharacters, deleteCharacter } = useAppStore();
  const [vrmModels, setVrmModels] = useState<Array<{ name: string; url: string }>>([]);
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

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
    avatar_url: '',
    model_vrm: '',
    background_url: '',
    background_mode: 'transparent',
    voice_id: '',
    tts_provider: 'edge-tts',
  });

  // Load file lists + sync from active character
  useEffect(() => {
    api.scanVrm().then(models => setVrmModels(models.map(m => ({ name: m.name, url: m.url })))).catch(() => {});
    api.scanImages().then(setImages).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeCharacter) {
      setLocalData({
        avatar_url: activeCharacter.avatar_url || '',
        model_vrm: activeCharacter.vrm_model_url || activeCharacter.model_vrm || '',
        background_url: activeCharacter.background_url || '',
        background_mode: activeCharacter.background_mode || 'transparent',
        voice_id: activeCharacter.voice_id || '',
        tts_provider: activeCharacter.tts_provider || 'edge-tts',
      });
    }
  }, [activeCharacter]);

  const saveCharacter = async () => {
    if (!activeCharacter) return;
    setSaving(true);
    try {
      // Map frontend field names to backend API field names
      const payload = {
        avatar_url: localData.avatar_url,
        vrm_model_url: localData.model_vrm,
        background_url: localData.background_url,
        background_mode: localData.background_mode,
        voice_id: localData.voice_id,
        tts_provider: localData.tts_provider,
      };
      const updated = await api.updateCharacter(activeCharacter.id, payload);
      setActiveCharacter({ ...activeCharacter, ...updated, ...localData });
      await loadCharacters();
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
              <option value="edge-tts">Edge-TTS (Cloud)</option>
              <option value="kokoro">Kokoro (Local)</option>
              <option value="piper">Piper (Local)</option>
              <option value="chatterbox">Chatterbox (Local)</option>
              <option value="elevenlabs">ElevenLabs (Cloud)</option>
            </select>
          </SettingField>

          <SettingField label="Voice" description="Pick a voice for this character.">
            <VoicePicker
              value={localData.voice_id}
              provider={localData.tts_provider}
              onChange={(voiceId, provider) => setLocalData(d => ({ ...d, voice_id: voiceId, tts_provider: provider }))}
            />
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
          className="px-5 py-2 text-sm font-medium rounded-lg disabled:opacity-50"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
          }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: General (Appearance + Layout)
   ═══════════════════════════════════════════════════════════════════════ */

interface GeneralTabProps {
  config: Record<string, unknown>; save: (k: string, v: unknown) => void;
  cfg: (k: string, fb?: unknown) => unknown;
  theme: string; setTheme: (t: 'sakura' | 'crystal' | 'dark-sakura' | 'dark-crystal') => void;
  advancedMode: boolean; toggleAdvancedMode: () => void;
  layoutMode: LayoutMode; setLayoutMode: (m: LayoutMode) => void;
}

function GeneralTab({ save, cfg, theme, setTheme, advancedMode, toggleAdvancedMode, layoutMode, setLayoutMode }: GeneralTabProps) {
  return (
    <>
      {/* Theme */}
      <section className="mb-6">
        <SectionHeader title="Theme" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Color Theme" description="4 premium themes — warm sakura or cool crystal, each in light and dark."
            tooltip="Changes all colors, shadows, and accents across the entire UI.">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'sakura' | 'crystal' | 'dark-sakura' | 'dark-crystal')}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <optgroup label="Light">
                <option value="sakura">Sakura</option>
                <option value="crystal">Crystal</option>
              </optgroup>
              <optgroup label="Dark">
                <option value="dark-sakura">Dark Sakura</option>
                <option value="dark-crystal">Dark Crystal</option>
              </optgroup>
            </select>
          </SettingField>
        </div>
      </section>

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

          <SettingField label="Proactive Messages" description="Character sends unprompted check-in messages after idle time." advanced
            tooltip="Uses a lightweight LLM call after configurable idle minutes.">
            <input
              type="checkbox"
              checked={Boolean(cfg('proactive_messages', false))}
              onChange={(e) => save('proactive_messages', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

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
}: {
  modelId: string;
  lmContextLength?: number;
  activeCharacterId?: number | null;
  onApply: (caps: ModelCapabilities) => void;
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
      if (result.ok) setCaps(result);
      else setError('Detection failed');
    } catch {
      setError('Could not reach backend');
    } finally {
      setLoading(false);
    }
  }, []);

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

function BrainTab({ save, cfg, lmModels, lmLoading, fetchLmModels }: BrainTabProps) {
  const currentModel = String(cfg('llm.model', ''));
  const loadedModels = lmModels.filter(m => m.state === 'loaded');
  const unloadedModels = lmModels.filter(m => m.state !== 'loaded');
  const { activeCharacter } = useAppStore();

  /** Auto-detect context window from loaded model. */
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
      <section className="mb-6">
        <SectionHeader title="Language Model" />
        <div style={cardStyle} className="px-4">
          {/* LLM Endpoint */}
          <SettingField label="LLM Endpoint" description="OpenAI-compatible API URL (e.g. LM Studio, Ollama, llama.cpp)."
            tooltip="Default: http://localhost:1234/v1. Change if your LLM server runs on a different port or machine.">
            <input
              type="text"
              value={String(cfg('llm.endpoint', ''))}
              onChange={(e) => save('llm.endpoint', e.target.value)}
              placeholder="http://localhost:1234/v1"
              className="text-sm px-2 py-1 w-56 rounded" style={selectStyle}
            />
          </SettingField>

          {/* Active Model dropdown */}
          <SettingField label="Active Model" description="Select from LM Studio or type a model name."
            tooltip="Shows models from LM Studio. Loaded models are marked. Click refresh to re-scan.">
            <div className="flex items-center gap-2">
              <select
                value={currentModel}
                onChange={(e) => save('llm.model', e.target.value)}
                className="text-sm px-2 py-1 rounded w-48" style={selectStyle}
              >
                <option value="">-- Select Model --</option>
                {loadedModels.length > 0 && (
                  <optgroup label="Loaded (Active)">
                    {loadedModels.map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </optgroup>
                )}
                {unloadedModels.length > 0 && (
                  <optgroup label="Available">
                    {unloadedModels.map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </optgroup>
                )}
                {currentModel && !lmModels.find(m => m.id === currentModel) && (
                  <option value={currentModel}>{currentModel} (manual)</option>
                )}
              </select>
              <button
                onClick={fetchLmModels}
                className="text-xs px-2 py-1 rounded"
                style={selectStyle}
                title="Refresh model list"
              >
                {lmLoading ? '...' : '↻'}
              </button>
            </div>
          </SettingField>

        </div>

        {/* Capability badge strip — shown whenever a model is selected */}
        {currentModel && (
          <ModelCapabilityCard
            modelId={currentModel}
            lmContextLength={loadedModelCtx}
            activeCharacterId={activeCharacter?.id ?? null}
            onApply={applyCapabilitiesToCharacter}
          />
        )}

        <div style={cardStyle} className="px-4">
          {/* Context Window */}
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

          <SliderField
            label="Chat History Limit" description="Max messages sent per request. 0 = unlimited."
            tooltip="0 = send all history (recommended for large context). Set a limit if hitting token limits."
            value={Number(cfg('llm.history_limit', cfg('history_limit', 0)))}
            min={0} max={500} step={10}
            onChange={(v) => save('llm.history_limit', v)}
            format={(v) => v === 0 ? '∞' : String(v)}
          />

          <SliderField
            label="Temperature" description="Higher = more creative, lower = more logical."
            tooltip="0.7 recommended for chat. Lower (0.3) for factual, higher (1.2) for creative."
            value={Number(cfg('temperature', 0.7))}
            min={0.1} max={2.0} step={0.1}
            onChange={(v) => save('temperature', v)}
            format={(v) => v.toFixed(1)}
          />

          <SliderField
            label="Repetition Penalty" description="Prevent looping phrases." advanced
            tooltip="1.1 is usually perfect. Higher values may make responses feel forced."
            value={Number(cfg('repeat_penalty', 1.1))}
            min={1.0} max={2.0} step={0.05}
            onChange={(v) => save('repeat_penalty', v)}
            format={(v) => v.toFixed(2)}
          />

          <SettingField label="Show Thinking" description="Show the AI's chain-of-thought reasoning." advanced
            tooltip="Shows reasoning in <think> tags. Useful for debugging.">
            <input
              type="checkbox"
              checked={cfg('thinking_visible', true) as boolean}
              onChange={(e) => save('thinking_visible', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SettingField label="Qwen3 Thinking Mode" description="Enable deep reasoning for Qwen3 models." advanced
            tooltip="When ON: Qwen3 uses deep reasoning (slower, smarter). Only applies when a Qwen3 model is loaded.">
            <input
              type="checkbox"
              checked={cfg('llm.qwen3_thinking_mode', false) as boolean}
              onChange={(e) => save('llm.qwen3_thinking_mode', e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
          </SettingField>

          <SettingField label="System Prompt Override" description="Override the default system prompt for all characters." advanced
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
            tooltip="edge-tts: Microsoft cloud voices (free, online). kokoro: local neural TTS (requires server). piper: local lightweight TTS.">
            <select
              value={String(cfg('tts.provider', 'edge-tts'))}
              onChange={(e) => save('tts.provider', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="edge-tts">Edge-TTS (Cloud)</option>
              <option value="kokoro">Kokoro (Local)</option>
              <option value="piper">Piper (Local)</option>
              <option value="chatterbox">Chatterbox (Local)</option>
              <option value="elevenlabs">ElevenLabs (Cloud)</option>
            </select>
          </SettingField>

          <SettingField label="Voice ID" description="Default voice identifier for the selected provider."
            tooltip="e.g. en-US-AvaNeural for Edge-TTS, af_sky for Kokoro. See TTS Models tab for browsable voices.">
            <input
              type="text"
              value={String(cfg('tts.voice_id', cfg('voice_id', '')))}
              onChange={(e) => save('tts.voice_id', e.target.value)}
              placeholder="en-US-AvaNeural"
              className="text-sm px-2 py-1 w-48 rounded" style={selectStyle}
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
        <SectionHeader title="Speech Recognition (ASR)" />
        <div style={cardStyle} className="px-4">
          <SettingField label="ASR Provider" description="Speech recognition engine for voice input."
            tooltip="Browser: Web Speech API (cloud). Faster-Whisper: local offline (pip install faster-whisper).">
            <select
              value={String(cfg('asr_provider', 'browser'))}
              onChange={(e) => save('asr_provider', e.target.value)}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              <option value="browser">Browser (Web Speech API)</option>
              <option value="faster_whisper">Faster-Whisper (Local)</option>
            </select>
          </SettingField>

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
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Tab: Safety
   ═══════════════════════════════════════════════════════════════════════ */

const CONTENT_FILTER_OPTIONS = [
  { value: -1, label: 'Off (NSFW Allowed)', color: '#ef4444' },
  { value: 0, label: 'Minimal (Model Defaults)', color: '#9ca3af' },
  { value: 1, label: 'Light (Default)', color: '#eab308' },
  { value: 2, label: 'Moderate', color: '#f97316' },
  { value: 3, label: 'Strict (Family Safe)', color: '#22c55e' },
];

function SafetyTab({ save, cfg }: TabProps) {
  return (
    <>
      <section className="mb-6">
        <SectionHeader title="Content Safety" />
        <div style={cardStyle} className="px-4">
          <SettingField label="Content Filter" description="Controls what content the AI is allowed to generate."
            tooltip="The filter works by adding instructions to the system prompt. -1: NSFW allowed. 0: model decides. 1: no explicit (default). 2: all-ages. 3: fully PG.">
            <select
              value={Number(cfg('content_filter_level', 1))}
              onChange={(e) => save('content_filter_level', parseInt(e.target.value))}
              className="text-sm px-2 py-1 rounded" style={selectStyle}
            >
              {CONTENT_FILTER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.value} — {opt.label}
                </option>
              ))}
            </select>
          </SettingField>

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
    </>
  );
}
