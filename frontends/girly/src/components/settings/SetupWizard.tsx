/**
 * SetupWizard – multi-step guided configuration flow.
 *
 * Rendered inside SettingsPanel when SettingsContext.wizardStep is non-null.
 * Steps:
 *   0 – Welcome
 *   1 – LLM Provider (Ollama connection test)
 *   2 – STT Provider (browser support check)
 *   3 – TTS Provider (voice preset selection + preview)
 *   4 – Fallback Order (shows current triggers; expandable in Phase 2)
 *   5 – Summary + Finish
 *
 * On "Finish", the wizard:
 *   - Dispatches SET_SETUP_COMPLETE = true to AppContext.
 *   - Closes itself (CLOSE_WIZARD).
 */

import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext.tsx';
import { useApp } from '../../context/AppContext.tsx';
import { getLLMProvider, listLLMProviders } from '../../providers/registry.ts';
import { VOICE_PRESETS } from '../../services/voicePresets.ts';
import { setKey, hasKey } from '../../services/apiKeyService.ts';
import { type LLMConnectionStatus, testLLMConnection } from '../../services/providerHealthService.ts';

export default function SetupWizard() {
  const { state: settingsState, dispatch: settingsDispatch } = useSettings();
  const { state: appState, dispatch: appDispatch } = useApp();
  const step = settingsState.wizardStep ?? 0;

  // LLM connection test state (local to this component).
  const [llmTestStatus, setLlmTestStatus] = useState<LLMConnectionStatus>('idle');
  // The currently selected LLM provider in the wizard dropdown.
  const [selectedProvider, setSelectedProvider] = useState<string>(appState.providerConfig.llm.primary);
  // Local key input (not saved until user clicks Save).
  const [keyInput, setKeyInput] = useState<string>('');
  // Local model-name input – pre-filled from providerOptions.
  const [modelInput, setModelInput] = useState<string>(
    appState.providerConfig.providerOptions?.[appState.providerConfig.llm.primary]?.model ?? '',
  );

  /** All registered LLM providers (used to populate the dropdown). */
  const allLLMProviders = listLLMProviders();

  /**
   * Test the currently-selected provider's connectivity.
   * For cloud providers this also verifies the stored API key is valid.
   */
  const testConnection = async () => {
    setLlmTestStatus('testing');
    const result = await testLLMConnection(selectedProvider);
    setLlmTestStatus(result.status);
  };

  /**
   * Persist the wizard's LLM choices into AppContext so they survive reload.
   * Called when the user clicks Next on step 1 or finishes the wizard.
   *
   * @param providerName - The provider the user selected.
   * @param model        - The model name the user typed (may be empty → default).
   */
  const commitLLMChoice = (providerName: string, model: string) => {
    const updatedOptions = {
      ...appState.providerConfig.providerOptions,
      ...(model.trim() ? { [providerName]: { model: model.trim() } } : {}),
    };
    appDispatch({
      type: 'SET_PROVIDER_CONFIG',
      payload: {
        ...appState.providerConfig,
        llm: { ...appState.providerConfig.llm, primary: providerName },
        providerOptions: updatedOptions,
      },
    });
  };

  const finish = () => {
    appDispatch({ type: 'SET_SETUP_COMPLETE', payload: true });
    settingsDispatch({ type: 'CLOSE_WIZARD' });
  };

  /* ── Step renderers ──────────────────────────────────────────── */

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div className="flex flex-col gap-2 text-center">
          <h3 className="text-anime-600 font-bold text-[0.95rem]">Welcome to AnimeGirly</h3>
          <p className="text-text-muted text-[11px] leading-5">
            Let's quickly set up your local AI providers so everything works smoothly.
            You can always re-run this wizard later from Settings.
          </p>
        </div>
      );

      case 1: return (
        <div className="flex flex-col gap-3">
          <h3 className="text-anime-600 font-semibold text-sm">LLM Provider</h3>

          {/* Provider selector dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-muted">Choose a provider:</label>
            <select
              value={selectedProvider}
              onChange={e => {
                const name = e.target.value;
                setSelectedProvider(name);
                setLlmTestStatus('idle');
                setKeyInput('');
                // Pre-fill model input from stored providerOptions (if any).
                setModelInput(appState.providerConfig.providerOptions?.[name]?.model ?? '');
              }}
              className="text-xs px-2 py-1.5 rounded-pill border border-anime-200 bg-anime-50 text-text-primary"
            >
              {allLLMProviders.map(p => (
                <option key={p.name} value={p.name}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Ollama-specific instructions */}
          {selectedProvider === 'ollama' && (
            <p className="text-text-muted text-xs">
              Make sure Ollama is installed and running, and that you have pulled a model
              (e.g. <code className="bg-anime-100 px-1 rounded">ollama pull llama3.2</code>).
            </p>
          )}

          {/* Cloud provider: API key input (only when key not yet saved) */}
          {getLLMProvider(selectedProvider).requiresApiKey && !hasKey(selectedProvider) && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-muted">API Key</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={`Paste your ${getLLMProvider(selectedProvider).label} key…`}
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  className="flex-1 text-xs px-2 py-1 rounded-pill border border-anime-200 bg-white text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-anime-400"
                />
                <button
                  type="button"
                  onClick={() => { setKey(selectedProvider, keyInput.trim()); setKeyInput(''); }}
                  disabled={!keyInput.trim()}
                  className="text-xs px-2 py-0.5 rounded-pill border border-anime-200 text-anime-600 bg-anime-50 hover:bg-anime-100 disabled:opacity-40 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Cloud provider: key-saved confirmation */}
          {getLLMProvider(selectedProvider).requiresApiKey && hasKey(selectedProvider) && (
            <span className="text-xs text-green-600 font-semibold">✓ Key saved for {getLLMProvider(selectedProvider).label}</span>
          )}

          {/* Model name override (shown for all providers; empty = use default) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-muted">
              Model name <span className="italic">(leave blank for default)</span>
            </label>
            <input
              type="text"
              placeholder={selectedProvider === 'ollama' ? 'llama3.2' : selectedProvider === 'google' ? 'gemini-2.0-flash' : selectedProvider === 'anthropic' ? 'claude-3-5-haiku-20241022' : 'gpt-4o-mini'}
              value={modelInput}
              onChange={e => setModelInput(e.target.value)}
              className="text-xs px-2 py-1 rounded-pill border border-anime-200 bg-white text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-anime-400"
            />
          </div>

          {/* Test Connection button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void testConnection(); }}
              disabled={llmTestStatus === 'testing'}
              className="text-xs px-3 py-1 rounded-pill border border-anime-200 text-anime-600 bg-anime-50 hover:bg-anime-100 disabled:opacity-50 transition-colors"
            >
              {llmTestStatus === 'testing' ? 'Testing…' : 'Test Connection'}
            </button>

            {llmTestStatus === 'ok' && (
              <span className="text-xs text-green-600 font-semibold">✓ Connected</span>
            )}
            {llmTestStatus === 'missing_key' && (
              <span className="text-xs text-rose-pastel-400 font-semibold">✗ Missing API key</span>
            )}
            {llmTestStatus === 'unreachable' && (
              <span className="text-xs text-rose-pastel-400 font-semibold">✗ Not reachable</span>
            )}
          </div>
          {(llmTestStatus === 'missing_key' || llmTestStatus === 'unreachable') && (
            <p className="text-xs text-text-muted">
              You can continue and fix this later. Chat will show an error if the active
              provider is unavailable when you send a message.
            </p>
          )}
        </div>
      );

      case 2: return (
        <div className="flex flex-col gap-2">
          <h3 className="text-anime-600 font-semibold text-sm">Voice Input (STT)</h3>
          {('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) ? (
            <p className="text-xs text-green-600">
              ✓ Your browser supports speech recognition. The mic button will be available in chat.
            </p>
          ) : (
            <p className="text-xs text-text-muted">
              Voice input requires <strong>Chrome</strong> or <strong>Edge</strong>.
              The mic button will be hidden in your current browser. You can still type messages.
            </p>
          )}
        </div>
      );

      case 3: return (
        <div className="flex flex-col gap-2">
          <h3 className="text-anime-600 font-semibold text-sm">Voice Output (TTS)</h3>
          <p className="text-xs text-text-muted">
            Choose a voice style. The AI will read its responses aloud using this preset.
          </p>
          <select
            value={settingsState.selectedVoiceName}
            onChange={(e) => settingsDispatch({ type: 'SET_VOICE', payload: e.target.value })}
            className="text-xs px-2 py-1.5 rounded-pill border border-anime-200 bg-anime-50 text-text-primary"
          >
            {VOICE_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.label}</option>
            ))}
          </select>
        </div>
      );

      case 4: return (
        <div className="flex flex-col gap-2">
          <h3 className="text-anime-600 font-semibold text-sm">Fallback Settings</h3>
          <p className="text-xs text-text-muted">
            If a provider fails or times out, the app can fall back to an alternative.
            Phase 1 has limited fallback options; more will be added as cloud providers
            are integrated.
          </p>
          <div className="bg-anime-50 rounded-anime p-2 text-xs text-text-secondary space-y-1">
            <div>
              <strong>LLM:</strong> {appState.providerConfig.llm.primary}
              {appState.providerConfig.llm.fallbacks.length > 0
                ? ` -> ${appState.providerConfig.llm.fallbacks.join(' -> ')}`
                : ' -> (no fallback configured)'}
            </div>
            <div>
              <strong>Triggers:</strong> {appState.providerConfig.llm.fallbackTriggers.join(', ')}
            </div>
            <div><strong>STT:</strong> {appState.providerConfig.stt.primary}</div>
            <div><strong>TTS:</strong> {appState.providerConfig.tts.primary}</div>
            <div className="text-text-muted italic">You can adjust providers in Settings after setup.</div>
          </div>
        </div>
      );

      case 5: return (
        <div className="flex flex-col gap-2 text-center">
          <h3 className="text-anime-600 font-bold text-sm">All set!</h3>
          <p className="text-xs text-text-muted">
            Your configuration is saved. You can upload a 3D model and start chatting
            right away. Visit Settings at any time to adjust providers or re-run this wizard.
          </p>
        </div>
      );

      default:
        return null;
    }
  };

  /* ── Nav buttons ─────────────────────────────────────────────── */
  const isFirst = step === 0;
  const isLast  = step === 5;

  return (
    <div
      data-testid="setup-wizard-shell"
      className="w-full px-3 py-3 md:px-4 md:py-4"
    >
      {/* Progress indicator */}
      <div className="mb-2 flex justify-center gap-1">
        {[0,1,2,3,4,5].map((i) => (
          <div
            key={i}
            className={`w-5 h-1.5 rounded-full transition-colors ${i <= step ? 'bg-anime-500' : 'bg-anime-100'}`}
          />
        ))}
      </div>

      <div data-testid="setup-wizard-content" className="mx-auto flex w-full max-w-[40rem] flex-col">
        {/* Step content */}
        <div className="min-h-[5.5rem]">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="mt-3 flex justify-between">
          <button
            type="button"
            onClick={() => settingsDispatch({ type: 'WIZARD_BACK' })}
            disabled={isFirst}
            className="text-xs px-3 py-1 rounded-pill border border-anime-200 text-anime-600 disabled:text-anime-300 disabled:border-anime-100 disabled:bg-anime-50/70 disabled:opacity-100 hover:bg-anime-100 transition-colors font-medium"
          >
            Back
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={finish}
              className="text-xs px-4 py-1 rounded-pill bg-anime-500 text-white hover:bg-anime-600 transition-colors font-semibold shadow-[0_12px_24px_-18px_var(--color-glow-primary)]"
            >
              Finish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                // Commit the LLM provider choice when leaving step 1.
                if (step === 1) commitLLMChoice(selectedProvider, modelInput);
                settingsDispatch({ type: 'WIZARD_NEXT' });
              }}
              className="text-xs px-3 py-1 rounded-pill bg-anime-500 text-white hover:bg-anime-600 transition-colors shadow-[0_12px_24px_-18px_var(--color-glow-primary)]"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
