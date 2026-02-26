import { useAppStore } from '../stores/appStore';
import { useTheme } from '../hooks/useTheme';
import { SettingField } from '../components/SettingField';

/** Settings view with progressive disclosure (Standard/Advanced) and Compact Mode. */
export function SettingsView() {
  const { advancedMode, toggleAdvancedMode, compactMode, toggleCompactMode, config, saveConfig } = useAppStore();
  const { theme, setTheme } = useTheme();

  const selectStyle = {
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)'
  };

  const inputStyle = {
    ...selectStyle
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold mb-4">Settings</h2>

      {/* Master toggles */}
      <div className="flex items-center gap-4 mb-6">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={advancedMode} onChange={toggleAdvancedMode} className="accent-[var(--color-accent)]" />
          <span style={{ color: 'var(--color-text-primary)' }}>Advanced Mode</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={compactMode} onChange={toggleCompactMode} className="accent-[var(--color-accent)]" />
          <span style={{ color: 'var(--color-text-primary)' }}>Compact</span>
        </label>
      </div>

      {/* Appearance */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          Appearance
        </h3>
        <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)' }} className="px-4">
          <SettingField label="Theme" description="Choose between warm sakura pink or cool crystal blue.">
            <select value={theme} onChange={(e) => setTheme(e.target.value as 'sakura' | 'crystal')}
              className="text-sm px-2 py-1 rounded" style={selectStyle}>
              <option value="sakura">Sakura</option>
              <option value="crystal">Crystal</option>
            </select>
          </SettingField>

          <SettingField label="Chat Layout" description="How the chat and 3D model are arranged."
            tooltip="Chat-first shows the conversation full width. Model-first gives the 3D model most of the screen. Split shows both side-by-side.">
            <select value={String(config.chat_layout || 'chat-first')}
              onChange={(e) => saveConfig({ chat_layout: e.target.value })}
              className="text-sm px-2 py-1 rounded" style={selectStyle}>
              <option value="chat-first">Chat First</option>
              <option value="model-first">Model First</option>
              <option value="split">Split</option>
            </select>
          </SettingField>

          <SettingField label="Frontend" description="Switch between Sakura (modern) and Neon (cyberpunk) interfaces.">
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
              style={{
                backgroundColor: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              Switch to Neon
            </button>
          </SettingField>
        </div>
      </section>

      {/* Voice */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          Voice
        </h3>
        <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)' }} className="px-4">
          <SettingField label="Auto-speak" description="Automatically play TTS audio for new messages.">
            <input type="checkbox"
              checked={Boolean((config.tts as Record<string, unknown> | undefined)?.auto_speak)}
              onChange={(e) => saveConfig({ tts: { ...(config.tts as Record<string, unknown> || {}), auto_speak: e.target.checked } })}
              className="accent-[var(--color-accent)]" />
          </SettingField>

          <SettingField label="Speech Rate" description="Speed of text-to-speech playback." advanced
            tooltip="1.0 is normal speed. Range: 0.5 (slow) to 2.0 (fast).">
            <input type="range" min="0.5" max="2" step="0.1"
              value={Number(config.speech_rate || 1)}
              onChange={(e) => saveConfig({ speech_rate: parseFloat(e.target.value) })}
              className="w-32" />
            <span className="text-xs ml-2 w-8 inline-block" style={{ color: 'var(--color-text-secondary)' }}>
              {Number(config.speech_rate || 1).toFixed(1)}
            </span>
          </SettingField>
        </div>
      </section>

      {/* AI Model */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          AI Model
        </h3>
        <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)' }} className="px-4">
          <SettingField label="AI Model" description="Which language model to use for chat.">
            <input type="text"
              value={String((config.llm as Record<string, unknown> | undefined)?.model || '')}
              onChange={(e) => saveConfig({ llm: { ...(config.llm as Record<string, unknown> || {}), model: e.target.value } })}
              className="text-sm px-2 py-1 w-48 rounded" style={inputStyle} />
          </SettingField>

          <SettingField label="Temperature" description="Higher = more creative, lower = more focused." advanced
            tooltip="Controls randomness in AI responses. 0.0 is deterministic, 2.0 is very creative. Default: 0.7">
            <input type="range" min="0" max="2" step="0.1"
              value={Number(config.temperature || 0.7)}
              onChange={(e) => saveConfig({ temperature: parseFloat(e.target.value) })}
              className="w-32" />
            <span className="text-xs ml-2 w-8 inline-block" style={{ color: 'var(--color-text-secondary)' }}>
              {Number(config.temperature || 0.7).toFixed(1)}
            </span>
          </SettingField>

          <SettingField label="History Limit" description="Max messages sent to the AI per request." advanced
            tooltip="Set to 0 for unlimited. Higher values use more tokens but give the AI more context. Default: 30">
            <input type="number" min="0" max="200"
              value={Number((config.llm as Record<string, unknown> | undefined)?.history_limit || 30)}
              onChange={(e) => saveConfig({ llm: { ...(config.llm as Record<string, unknown> || {}), history_limit: parseInt(e.target.value) } })}
              className="text-sm px-2 py-1 w-20 rounded" style={inputStyle} />
          </SettingField>

          <SettingField label="Context Limit" description="Maximum context window size in tokens." advanced
            tooltip="Depends on your model. Larger contexts use more VRAM. Common values: 8192, 32768, 131072.">
            <input type="number" min="1024" max="262144" step="1024"
              value={Number(config.context_limit || 131072)}
              onChange={(e) => saveConfig({ context_limit: parseInt(e.target.value) })}
              className="text-sm px-2 py-1 w-24 rounded" style={inputStyle} />
          </SettingField>
        </div>
      </section>

      {/* Behavior */}
      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          Behavior
        </h3>
        <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)' }} className="px-4">
          <SettingField label="Ambient Idle" description="Show idle status messages like 'daydreaming...' in chat header."
            tooltip="Purely cosmetic — no LLM calls. Toggles status text cycling in chat header.">
            <input type="checkbox" defaultChecked className="accent-[var(--color-accent)]" />
          </SettingField>

          <SettingField label="Proactive Messages" description="Character sends unprompted check-in messages after idle time." advanced
            tooltip="Uses a lightweight LLM call after configurable idle minutes. Can be set to 5, 15, 30, or 60 minutes.">
            <input type="checkbox" className="accent-[var(--color-accent)]" />
          </SettingField>
        </div>
      </section>

      {/* Developer (Advanced only) */}
      <section className="mb-6">
        {advancedMode && (
          <>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Developer
            </h3>
            <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)' }} className="px-4">
              <SettingField label="Dev Mode" description="Show developer tools and debug info.">
                <input type="checkbox"
                  checked={Boolean(config.dev_mode)}
                  onChange={(e) => saveConfig({ dev_mode: e.target.checked })}
                  className="accent-[var(--color-accent)]" />
              </SettingField>

              <SettingField label="JSON Logging" description="Enable structured JSON log output."
                tooltip="Set WAIFU_LOG_JSON=1 environment variable for backend JSON logs.">
                <input type="checkbox"
                  checked={Boolean(config.save_logs_auto)}
                  onChange={(e) => saveConfig({ save_logs_auto: e.target.checked })}
                  className="accent-[var(--color-accent)]" />
              </SettingField>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
