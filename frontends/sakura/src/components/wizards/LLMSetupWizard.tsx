import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Check, Loader2, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useWizardStore } from '../../stores/wizardStore';
import { WizardShell, type WizardStepDef, type WizardStepProps } from '../wizard/WizardShell';
import { PROVIDER_PRESETS, wizardInputStyle, type ProviderPreset } from '../../data/presets';

/* ── Step 0: Current Status ───────────────────────────────────────────── */

function StepCurrentStatus({ onNext }: WizardStepProps) {
  const { config } = useAppStore();
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  const llm = config.llm as Record<string, unknown> | undefined;
  const provider = llm?.provider as string || 'none';
  const endpoint = llm?.endpoint as string || '';
  const model = llm?.model as string || '';

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => {
        setStatus(data.services?.llm === 'connected' ? 'connected' : 'disconnected');
      })
      .catch(() => setStatus('disconnected'));
  }, []);

  return (
    <div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Your current LLM configuration:
      </p>
      <div
        className="p-4 rounded-xl mb-5"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          {status === 'checking' && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />}
          {status === 'connected' && <Check size={14} style={{ color: 'var(--color-success)' }} />}
          {status === 'disconnected' && <WifiOff size={14} style={{ color: 'var(--color-danger)' }} />}
          <span className="text-xs font-semibold" style={{
            color: status === 'connected' ? 'var(--color-success)' : status === 'disconnected' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
          }}>
            {status === 'checking' ? 'Checking...' : status === 'connected' ? 'Connected' : 'Not Connected'}
          </span>
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            Provider: <strong style={{ color: 'var(--color-text-primary)' }}>{provider}</strong>
          </p>
          {endpoint && (
            <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
              Endpoint: <strong style={{ color: 'var(--color-text-primary)' }}>{endpoint}</strong>
            </p>
          )}
          {model && (
            <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
              Model: <strong style={{ color: 'var(--color-text-primary)' }}>{model}</strong>
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          {status === 'connected' ? 'Reconfigure' : 'Set Up'} <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Step 1: Provider Selection + Configuration ───────────────────────── */

function StepConfigureLLM({ onNext, wizardData }: WizardStepProps) {
  const { saveConfig } = useAppStore();
  const initProvider = (wizardData.llmProvider as string) || 'lmstudio';
  const defaultPreset = PROVIDER_PRESETS.find(p => p.id === initProvider) || PROVIDER_PRESETS[0];

  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset>(defaultPreset);
  const [endpoint, setEndpoint] = useState(defaultPreset.endpoint);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);

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

  const handleSave = async () => {
    if (testResult !== 'ok') {
      await saveConfig({
        llm: {
          provider: selectedPreset.provider,
          endpoint: endpoint || undefined,
          model: model || undefined,
          ...(apiKey ? { api_key: apiKey } : {}),
        }
      } as Record<string, unknown>).catch(() => {});
    }
    onNext();
  };

  return (
    <div>
      {/* Provider pills */}
      <div className="grid grid-cols-4 gap-2 mb-4">
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
      <div className="flex flex-col gap-3 mb-4">
        {selectedPreset.id !== 'claude' && (
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
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
          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
            Model
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
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
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

      {/* Test + Save */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={testConnection}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {testing ? <><Loader2 size={12} className="animate-spin" /> Testing...</> : <><Wifi size={12} /> Test</>}
        </button>
        {testResult === 'ok' && <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-success)' }}><Check size={12} /> Connected</span>}
        {testResult === 'fail' && <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-danger)' }}><WifiOff size={12} /> Failed</span>}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          Save <Check size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Wizard assembly ──────────────────────────────────────────────────── */

const STEPS: WizardStepDef[] = [
  { id: 'status', title: 'Current Status', component: StepCurrentStatus },
  { id: 'configure', title: 'Configure', component: StepConfigureLLM },
];

/**
 * LLM Setup Wizard — 2-step modal for (re)configuring the LLM connection.
 */
export function LLMSetupWizard() {
  const { closeWizard } = useWizardStore();
  return (
    <WizardShell
      steps={STEPS}
      variant="modal"
      title="Configure LLM"
      onComplete={closeWizard}
      onCancel={closeWizard}
    />
  );
}
