import { useState, useEffect } from 'react';
import { Check, X, Loader2, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useWizardStore } from '../../stores/wizardStore';
import { WizardShell, type WizardStepDef, type WizardStepProps } from '../wizard/WizardShell';
import { wizardInputStyle } from '../../data/presets';

/* ── Step 0: Check Availability ───────────────────────────────────────── */

function StepCheckAvailability({ onNext }: WizardStepProps) {
  const [checking, setChecking] = useState(true);
  const [comfyStatus, setComfyStatus] = useState<'ok' | 'fail' | 'checking'>('checking');
  const [easyDiffStatus, setEasyDiffStatus] = useState<'ok' | 'fail' | 'checking'>('checking');

  useEffect(() => {
    const checkComfy = fetch('/api/image-gen/status')
      .then(r => r.json())
      .then(d => setComfyStatus(d.comfyui === 'connected' || d.available ? 'ok' : 'fail'))
      .catch(() => setComfyStatus('fail'));

    // Easy Diffusion typically runs on port 9000
    const checkED = fetch('/api/image-gen/status')
      .then(r => r.json())
      .then(d => setEasyDiffStatus(d.easy_diffusion === 'connected' ? 'ok' : 'fail'))
      .catch(() => setEasyDiffStatus('fail'));

    Promise.allSettled([checkComfy, checkED]).then(() => setChecking(false));
  }, []);

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'checking') return <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />;
    if (status === 'ok') return <Check size={14} style={{ color: 'var(--color-success)' }} />;
    return <X size={14} style={{ color: 'var(--color-danger)' }} />;
  };

  return (
    <div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Checking for available image generation backends...
      </p>
      <div className="flex flex-col gap-2 mb-5">
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)' }}>
          <StatusIcon status={comfyStatus} />
          <div>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>ComfyUI</span>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {comfyStatus === 'ok' ? 'Connected and ready' : 'Not detected — start ComfyUI first'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border-subtle)' }}>
          <StatusIcon status={easyDiffStatus} />
          <div>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>Easy Diffusion</span>
            <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {easyDiffStatus === 'ok' ? 'Connected and ready' : 'Not detected'}
            </p>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={checking}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          {comfyStatus === 'ok' || easyDiffStatus === 'ok' ? 'Configure' : 'Manual Setup'} <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Step 1: Configure Endpoint ───────────────────────────────────────── */

function StepConfigureEndpoint({ onNext }: WizardStepProps) {
  const { config, saveConfig } = useAppStore();
  const imageGen = config.image_gen as Record<string, unknown> | undefined;
  const [url, setUrl] = useState((imageGen?.endpoint as string) || 'http://localhost:8188');
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const testEndpoint = async () => {
    setTesting(true);
    setTestOk(null);
    try {
      await saveConfig({ image_gen: { ...imageGen, endpoint: url } } as Record<string, unknown>);
      const res = await fetch('/api/image-gen/status');
      const data = await res.json();
      setTestOk(data.available || data.comfyui === 'connected');
    } catch {
      setTestOk(false);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Enter the URL of your image generation server.
      </p>
      <div className="mb-4">
        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
          Endpoint URL
        </label>
        <input
          type="text"
          value={url}
          onChange={e => { setUrl(e.target.value); setTestOk(null); }}
          className="w-full text-xs px-3 py-2 outline-none"
          style={wizardInputStyle}
          placeholder="http://localhost:8188"
        />
      </div>
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={testEndpoint}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {testing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Test Connection
        </button>
        {testOk === true && <span className="text-xs" style={{ color: 'var(--color-success)' }}>Connected!</span>}
        {testOk === false && <span className="text-xs" style={{ color: 'var(--color-danger)' }}>Failed to connect</span>}
      </div>
      <div className="flex justify-end">
        <button
          onClick={async () => {
            await saveConfig({ image_gen: { ...imageGen, endpoint: url }, image_gen_setup_completed: true } as Record<string, unknown>).catch(() => {});
            onNext();
          }}
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
  { id: 'check', title: 'Check Availability', component: StepCheckAvailability },
  { id: 'configure', title: 'Configure', component: StepConfigureEndpoint },
];

/**
 * Image Generation Setup Wizard — 2-step modal for configuring ComfyUI / Easy Diffusion.
 */
export function ImageGenSetupWizard() {
  const { closeWizard } = useWizardStore();
  return (
    <WizardShell
      steps={STEPS}
      variant="modal"
      title="Image Generation Setup"
      onComplete={closeWizard}
      onCancel={closeWizard}
    />
  );
}
