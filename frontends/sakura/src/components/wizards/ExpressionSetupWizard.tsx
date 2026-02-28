import { useState, useEffect } from 'react';
import { ChevronRight, AlertTriangle, Check } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useWizardStore } from '../../stores/wizardStore';
import { WizardShell, type WizardStepDef, type WizardStepProps } from '../wizard/WizardShell';

/* ── Step 0: Requirements Check ───────────────────────────────────────── */

function StepRequirementsCheck({ onNext, setWizardData }: WizardStepProps) {
  const [imageGenAvailable, setImageGenAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/image-gen/status')
      .then(r => r.json())
      .then(d => {
        const available = d.available || d.comfyui === 'connected';
        setImageGenAvailable(available);
        setWizardData({ imageGenAvailable: available });
      })
      .catch(() => setImageGenAvailable(false));
  }, [setWizardData]);

  const { openWizard } = useWizardStore();

  if (imageGenAvailable === null) {
    return (
      <div className="py-10 text-center">
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Checking image generation...</p>
      </div>
    );
  }

  if (!imageGenAvailable) {
    return (
      <div className="text-center py-6">
        <AlertTriangle size={32} className="mx-auto mb-3" style={{ color: 'var(--color-warning)' }} />
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Image Generation Required
        </h3>
        <p className="text-xs mb-5" style={{ color: 'var(--color-text-secondary)' }}>
          Expression portraits need an image generation backend (ComfyUI or Easy Diffusion).
          Set one up first, then come back here.
        </p>
        <button
          onClick={() => openWizard('image-gen-setup')}
          className="px-5 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          Set Up Image Generation
        </button>
      </div>
    );
  }

  return (
    <div className="text-center py-4">
      <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}>
        <Check size={24} />
      </div>
      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Image Generation Ready
      </h3>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-secondary)' }}>
        Your image generation backend is connected. Let's create expression portraits for your character.
      </p>
      <button
        onClick={onNext}
        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold mx-auto"
        style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
      >
        Generate Portraits <ChevronRight size={14} />
      </button>
    </div>
  );
}

/* ── Step 1: Generate Portraits ───────────────────────────────────────── */

function StepGeneratePortraits({ onNext }: WizardStepProps) {
  const { activeCharacter } = useAppStore();

  if (!activeCharacter) {
    return (
      <div className="text-center py-6">
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          Select a character first to generate their expression portraits.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
        Generate emotion portraits for <strong>{activeCharacter.name}</strong>.
        Each slot represents a different emotion that will be shown during conversations.
      </p>
      <div className="text-center py-6">
        <p className="text-xs mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
          Use the AI Art tab in Settings to generate and manage expression portraits.
        </p>
        <button
          onClick={() => {
            useAppStore.getState().openSettingsTab('aiart');
            useWizardStore.getState().closeWizard();
          }}
          className="px-5 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--color-accent-gradient)', color: 'var(--color-accent-text)' }}
        >
          Open AI Art Settings
        </button>
      </div>
      <div className="flex justify-end mt-4">
        <button
          onClick={onNext}
          className="text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

/* ── Wizard assembly ──────────────────────────────────────────────────── */

const STEPS: WizardStepDef[] = [
  { id: 'check', title: 'Requirements', component: StepRequirementsCheck },
  { id: 'generate', title: 'Generate', component: StepGeneratePortraits },
];

/**
 * Expression Portrait Setup Wizard — 2-step modal for generating emotion artwork.
 */
export function ExpressionSetupWizard() {
  const { closeWizard } = useWizardStore();
  return (
    <WizardShell
      steps={STEPS}
      variant="modal"
      title="Expression Portraits"
      onComplete={closeWizard}
      onCancel={closeWizard}
    />
  );
}
