import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Brain, Volume2, Palette, Info, ChevronDown, Shield,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useNovaStore } from '../stores/novaStore';
import { api } from '../lib/api';
import type { Character, AppConfig, VoiceEntry } from '../lib/types';
import { CollapsibleModelSuggestions } from './ModelSuggestions';
import styles from './SettingsPanel.module.css';

/**
 * Glass-styled settings panel for Nova's Focused mode.
 *
 * NOT a port of Sakura's 4200-line SettingsView. This is a clean,
 * focused settings experience with six accordion sections:
 *
 * 1. **Character** — name, avatar, system prompt, model selection
 * 2. **Brain** — LLM endpoint, model, temperature, recommended models
 * 3. **Voice** — TTS provider, voice picker, speed/pitch
 * 4. **Display** — theme toggle, character tint, mode preference
 * 5. **Safety** — content filter level for LLM output
 * 6. **About** — version, links, LLM status
 *
 * Each section uses the `AccordionSection` primitive which wraps
 * Framer Motion's AnimatePresence for smooth height animation.
 * Config changes are saved automatically via debounced PUT to
 * `/api/config` and character updates via PUT to `/api/characters/:id`.
 *
 * @example
 * ```tsx
 * // Rendered inside IconRail's panel content area
 * <SettingsPanel />
 * ```
 */

// ── Accordion Section ───────────────────────────────────────────────────────

interface AccordionSectionProps {
  /** Unique section identifier for tracking open/closed state. */
  id: string;
  /** Display title shown in the section header. */
  title: string;
  /** Icon component rendered before the title. */
  icon: ReactNode;
  /** Whether the section body is currently visible. */
  isOpen: boolean;
  /** Called when the section header is clicked. */
  onToggle: () => void;
  /** Section body content (only rendered when open). */
  children: ReactNode;
}

/**
 * Collapsible section with icon header and animated body.
 * Uses Framer Motion AnimatePresence for smooth height transitions.
 */
function AccordionSection({ title, icon, isOpen, onToggle, children }: AccordionSectionProps) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader} onClick={onToggle}>
        <div className={styles.sectionTitle}>
          {icon}
          {title}
        </div>
        <ChevronDown
          size={14}
          className={`${styles.sectionChevron} ${isOpen ? styles.sectionChevronOpen : ''}`}
        />
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            style={{ overflow: 'hidden' }}
          >
            <div className={styles.sectionBody}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Toggle Switch ───────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  /** Current on/off state. */
  checked: boolean;
  /** Called when the toggle is clicked. */
  onChange: (checked: boolean) => void;
  /** Accessible label text. */
  label: string;
}

/**
 * Simple toggle switch with glass styling.
 */
function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <div className={styles.toggleRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <button
        className={`${styles.toggle} ${checked ? styles.toggleActive : ''}`}
        onClick={() => onChange(!checked)}
        aria-label={label}
        type="button"
      >
        <div className={`${styles.toggleDot} ${checked ? styles.toggleDotActive : ''}`} />
      </button>
    </div>
  );
}

// ── Main Settings Panel ─────────────────────────────────────────────────────

export function SettingsPanel() {
  const activeCharacter = useAppStore((s) => s.activeCharacter);
  const config = useAppStore((s) => s.config);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const fetchCharacters = useAppStore((s) => s.fetchCharacters);

  const theme = useNovaStore((s) => s.theme);
  const setTheme = useNovaStore((s) => s.setTheme);
  const addToast = useNovaStore((s) => s.addToast);

  // Section open/closed state
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['character']));

  // Local form state
  const [charName, setCharName] = useState('');
  const [charPrompt, setCharPrompt] = useState('');
  const [charTemp, setCharTemp] = useState(0.8);
  const [charGreeting, setCharGreeting] = useState(true);
  const [charMood, setCharMood] = useState(true);

  const [llmEndpoint, setLlmEndpoint] = useState('');
  const [llmModel, setLlmModel] = useState('');

  const [ttsProvider, setTtsProvider] = useState('');
  const [voices, setVoices] = useState<VoiceEntry[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');

  const [contentFilter, setContentFilter] = useState(1);

  const [llmConnected, setLlmConnected] = useState(false);
  const [llmProvider, setLlmProvider] = useState('');

  // Sync form state when active character or config changes
  useEffect(() => {
    if (activeCharacter) {
      setCharName(activeCharacter.name || '');
      setCharPrompt(activeCharacter.system_prompt || '');
      setCharTemp(activeCharacter.llm_temperature ?? 0.8);
      setCharGreeting(activeCharacter.greeting_enabled ?? true);
      setCharMood(activeCharacter.mood_enabled ?? true);
      setSelectedVoice(activeCharacter.voice_id || '');
      setTtsProvider(activeCharacter.tts_provider || '');
    }
  }, [activeCharacter]);

  useEffect(() => {
    if (config) {
      const llm = config.llm as Record<string, unknown> | undefined;
      setLlmEndpoint((llm?.endpoint as string) || '');
      setLlmModel((llm?.model as string) || '');
      // Sync content filter level (default 1 = Light)
      const filterLevel = config.content_filter_level as number | undefined;
      setContentFilter(filterLevel ?? 1);
    }
  }, [config]);

  // Fetch LLM status + voices on mount
  useEffect(() => {
    api.getStats()
      .then((stats) => {
        const provider = (stats.llm_provider as string) || (stats.provider as string) || '';
        setLlmConnected(true);
        setLlmProvider(provider);
      })
      .catch(() => setLlmConnected(false));

    api.getVoices()
      .then(setVoices)
      .catch(() => {});
  }, []);

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Save handlers ───────────────────────────────────────────────────────

  /**
   * Save character-level settings via PUT /api/characters/:id.
   * Triggers a re-fetch of the character list to update the store.
   */
  const saveCharacter = useCallback(async (patch: Partial<Character>) => {
    if (!activeCharacter) return;
    try {
      await api.updateCharacter(activeCharacter.id, patch);
      await fetchCharacters();
      addToast('Character saved', 'success');
    } catch (e) {
      addToast('Failed to save character', 'error');
    }
  }, [activeCharacter, fetchCharacters, addToast]);

  /**
   * Save app config via PUT /api/config.
   * Merges patch into existing config and re-fetches.
   */
  const saveConfig = useCallback(async (patch: Partial<AppConfig>) => {
    try {
      await api.saveConfig(patch);
      await fetchConfig();
      addToast('Settings saved', 'success');
    } catch (e) {
      addToast('Failed to save settings', 'error');
    }
  }, [fetchConfig, addToast]);

  // ── Character section handlers ────────────────────────────────────────

  const handleNameBlur = useCallback(() => {
    if (charName.trim() && charName !== activeCharacter?.name) {
      saveCharacter({ name: charName.trim() });
    }
  }, [charName, activeCharacter, saveCharacter]);

  const handlePromptBlur = useCallback(() => {
    if (charPrompt !== activeCharacter?.system_prompt) {
      saveCharacter({ system_prompt: charPrompt });
    }
  }, [charPrompt, activeCharacter, saveCharacter]);

  const handleTempChange = useCallback((val: number) => {
    setCharTemp(val);
    saveCharacter({ llm_temperature: val });
  }, [saveCharacter]);

  // ── Brain section handlers ────────────────────────────────────────────

  const handleEndpointBlur = useCallback(() => {
    saveConfig({ llm: { ...(config?.llm as Record<string, unknown> || {}), endpoint: llmEndpoint } });
  }, [llmEndpoint, config, saveConfig]);

  const handleModelBlur = useCallback(() => {
    saveConfig({ llm: { ...(config?.llm as Record<string, unknown> || {}), model: llmModel } });
  }, [llmModel, config, saveConfig]);

  // ── Voice section handlers ────────────────────────────────────────────

  const handleVoiceChange = useCallback((voiceId: string) => {
    setSelectedVoice(voiceId);
    saveCharacter({ voice_id: voiceId });
  }, [saveCharacter]);

  const handleTtsProviderChange = useCallback((provider: string) => {
    setTtsProvider(provider);
    saveCharacter({ tts_provider: provider });
    // Refresh voice list for the new provider
    api.getVoices(provider).then(setVoices).catch(() => {});
  }, [saveCharacter]);

  return (
    <div className={styles.container}>
      {/* ── 1. Character ────────────────────────────────────────── */}
      <AccordionSection
        id="character"
        title="Character"
        icon={<User size={14} />}
        isOpen={openSections.has('character')}
        onToggle={() => toggleSection('character')}
      >
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Name</label>
          <input
            className={styles.fieldInput}
            value={charName}
            onChange={(e) => setCharName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="Character name"
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>System Prompt</label>
          <textarea
            className={styles.fieldTextarea}
            value={charPrompt}
            onChange={(e) => setCharPrompt(e.target.value)}
            onBlur={handlePromptBlur}
            placeholder="Character personality and instructions..."
            rows={4}
          />
        </div>

        <ToggleSwitch
          label="Greeting on load"
          checked={charGreeting}
          onChange={(v) => { setCharGreeting(v); saveCharacter({ greeting_enabled: v }); }}
        />

        <ToggleSwitch
          label="Mood system"
          checked={charMood}
          onChange={(v) => { setCharMood(v); saveCharacter({ mood_enabled: v }); }}
        />
      </AccordionSection>

      {/* ── 2. Brain ────────────────────────────────────────────── */}
      <AccordionSection
        id="brain"
        title="Brain"
        icon={<Brain size={14} />}
        isOpen={openSections.has('brain')}
        onToggle={() => toggleSection('brain')}
      >
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Status</span>
          <span className={styles.statusPill}>
            <span className={`${styles.statusDot} ${llmConnected ? styles.statusConnected : styles.statusDisconnected}`} />
            {llmConnected ? llmProvider || 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>LLM Endpoint</label>
          <input
            className={styles.fieldInput}
            value={llmEndpoint}
            onChange={(e) => setLlmEndpoint(e.target.value)}
            onBlur={handleEndpointBlur}
            placeholder="http://localhost:1234/v1"
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Model</label>
          <input
            className={styles.fieldInput}
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
            onBlur={handleModelBlur}
            placeholder="Auto-detect from server"
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Temperature</label>
          <div className={styles.sliderRow}>
            <input
              type="range"
              className={styles.slider}
              min={0}
              max={2}
              step={0.05}
              value={charTemp}
              onChange={(e) => handleTempChange(parseFloat(e.target.value))}
            />
            <span className={styles.sliderValue}>{charTemp.toFixed(2)}</span>
          </div>
        </div>

        <CollapsibleModelSuggestions />
      </AccordionSection>

      {/* ── 3. Voice ────────────────────────────────────────────── */}
      <AccordionSection
        id="voice"
        title="Voice"
        icon={<Volume2 size={14} />}
        isOpen={openSections.has('voice')}
        onToggle={() => toggleSection('voice')}
      >
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>TTS Provider</label>
          <select
            className={styles.fieldSelect}
            value={ttsProvider}
            onChange={(e) => handleTtsProviderChange(e.target.value)}
          >
            <option value="">None</option>
            <option value="kokoro">Kokoro</option>
            <option value="chatterbox">Chatterbox</option>
            <option value="openai">OpenAI</option>
            <option value="elevenlabs">ElevenLabs</option>
            <option value="piper">Piper</option>
          </select>
        </div>

        {voices.length > 0 && (
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Voice</label>
            <select
              className={styles.fieldSelect}
              value={selectedVoice}
              onChange={(e) => handleVoiceChange(e.target.value)}
            >
              <option value="">Default</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.engine})
                </option>
              ))}
            </select>
          </div>
        )}
      </AccordionSection>

      {/* ── 4. Display ──────────────────────────────────────────── */}
      <AccordionSection
        id="display"
        title="Display"
        icon={<Palette size={14} />}
        isOpen={openSections.has('display')}
        onToggle={() => toggleSection('display')}
      >
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Theme</label>
          <select
            className={styles.fieldSelect}
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'system')}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </div>
      </AccordionSection>

      {/* ── 5. Safety ───────────────────────────────────────────── */}
      <AccordionSection
        id="safety"
        title="Safety"
        icon={<Shield size={14} />}
        isOpen={openSections.has('safety')}
        onToggle={() => toggleSection('safety')}
      >
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Content Filter</label>
          <select
            className={styles.fieldSelect}
            value={contentFilter}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setContentFilter(val);
              saveConfig({ content_filter_level: val });
            }}
          >
            <option value={-1}>Off (NSFW Allowed)</option>
            <option value={0}>Minimal (Model Defaults)</option>
            <option value={1}>Light (Default)</option>
            <option value={2}>Moderate</option>
            <option value={3}>Strict (Family Safe)</option>
          </select>
        </div>
        {contentFilter === -1 && (
          <div className={styles.filterWarning}>
            For local models only. Cloud APIs may override this setting.
          </div>
        )}
      </AccordionSection>

      {/* ── 6. About ────────────────────────────────────────────── */}
      <AccordionSection
        id="about"
        title="About"
        icon={<Info size={14} />}
        isOpen={openSections.has('about')}
        onToggle={() => toggleSection('about')}
      >
        <div className={styles.aboutSection}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Frontend</span>
            <span className={styles.infoValue}>Nova</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Project</span>
            <span className={styles.infoValue}>Waifu-RT3D</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Keyboard</span>
            <span className={styles.infoValue}>⌘K palette · ⌘\ mode</span>
          </div>
        </div>
      </AccordionSection>
    </div>
  );
}
