import { useState, useEffect } from 'react';
import { ChevronRight, Wifi, WifiOff, Check, Loader2 } from 'lucide-react';
import { useAppStore } from '../../../stores/appStore';
import { PROVIDER_PRESETS, wizardInputStyle, type ProviderPreset } from '../../../data/presets';
import type { WizardStepProps } from '../../wizard/WizardShell';

/**
 * Onboarding Step 2: LLM Connection Setup.
 *
 * Shows provider cards (LM Studio, Ollama, OpenAI, Anthropic) with
 * endpoint/model/API-key fields. Auto-fills from hardware scan results
 * in `wizardData` when available.
 */
export function StepLLMSetup({ onNext, onSkip, wizardData }: WizardStepProps) {
  const { saveConfig } = useAppStore();

  // Auto-fill from hardware scan results
  const autoProvider = wizardData.autoProvider as string | undefined;
  const autoModel = wizardData.autoModel as string | undefined;
  const autoEndpoint = wizardData.autoEndpoint as string | undefined;

  const defaultPreset = autoProvider
    ? PROVIDER_PRESETS.find(p => p.provider === autoProvider) || PROVIDER_PRESETS[0]
    : PROVIDER_PRESETS[0];

  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset>(defaultPreset);
  const [endpoint, setEndpoint] = useState(autoEndpoint || defaultPreset.endpoint);
  const [model, setModel] = useState(autoModel || '');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);

  // If auto-detected provider changes (e.g. from re-scan), update the form
  useEffect(() => {
    if (autoProvider) {
      const preset = PROVIDER_PRESETS.find(p => p.provider === autoProvider);
      if (preset) {
        setSelectedPreset(preset);
        setEndpoint(autoEndpoint || preset.endpoint);
        setModel(autoModel || '');
      }
    }
  }, [autoProvider, autoModel, autoEndpoint]);

  const selectPreset = (preset: ProviderPreset) => {
    setSelectedPreset(preset);
    setEndpoint(preset.endpoint);
    setTestResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const patch: Record<string, unknown> = {
        llm: {
          provider: selectedPreset.provider,
          endpoint: endpoint || undefined,
          model: model || undefined,
          ...(apiKey ? { api_key: apiKey } : {}),
        }
      };
      await saveConfig(patch);
      const health = await fetch('/api/health').then(r => r.json()) as { services?: { llm?: string } };
      setTestResult(health?.services?.llm === 'connected' ? 'ok' : 'fail');
    } catch {
      setTestResult('fail');
    } finally {
      setTesting(false);
    }
  };

  const handleNext = async () => {
    if (testResult !== 'ok') {
      const patch: Record<string, unknown> = {
        llm: {
          provider: selectedPreset.provider,
          endpoint: endpoint || undefined,
          model: model || undefined,
          ...(apiKey ? { api_key: apiKey } : {}),
        }
      };
      await saveConfig(patch).catch(() => {});
    }
    onNext();
  };

  return (
    <div className="w-full max-w-lg mx-auto px-4">
      <h2 className="char-name-display mb-1" style={{ color: 'var(--color-text-primary)', fontSize: '1.3rem' }}>
        Connect your LLM
      </h2>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-tertiary)' }}>
        The AI brain that powers conversation. LM Studio runs locally — free and private.
      </p>

      {/* Provider pills */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {PROVIDER_PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => selectPreset(p)}
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-center transition-all"
            style={{
              backgroundColor: selectedPreset.id === p.id ? 'var(--color-accent-soft)' : 'var(--color-surface)',
              border: selectedPreset.id === p.id ? '1px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
              color: selectedPreset.id === p.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}
          >
            <span className="text-lg">{p.icon}</span>
            <span className="text-[10px] font-medium">{p.label}</span>
          </button>
        ))}
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-3 mb-5">
        {selectedPreset.id !== 'claude' && (
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              Endpoint URL
            </label>
            <input
              type="text"
              value={endpoint}
              onChange={e => { setEndpoint(e.target.value); setTestResult(null); }}
              className="w-full text-xs px-3 py-2 outline-none"
              style={wizardInputStyle}
              placeholder="http://localhost:1234/v1"
            />
          </div>
        )}

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
            Model {selectedPreset.id === 'lmstudio' && <span style={{ color: 'var(--color-text-muted)' }}>(optional)</span>}
          </label>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            className="w-full text-xs px-3 py-2 outline-none"
            style={wizardInputStyle}
            placeholder={selectedPreset.modelPlaceholder}
          />
        </div>

        {selectedPreset.needsKey && (
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="w-full text-xs px-3 py-2 outline-none"
              style={wizardInputStyle}
              placeholder="sk-..."
            />
          </div>
        )}
      </div>

      {/* Test connection */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={testConnection}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {testing
            ? <><Loader2 size={12} className="animate-spin" /> Testing...</>
            : <><Wifi size={12} /> Test connection</>}
        </button>

        {testResult === 'ok' && (
          <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--color-success, #22c55e)' }}>
            <Check size={12} /> Connected
          </span>
        )}
        {testResult === 'fail' && (
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-danger)' }}>
            <WifiOff size={12} /> Not reachable — check endpoint
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onSkip} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Skip for now
        </button>
        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
