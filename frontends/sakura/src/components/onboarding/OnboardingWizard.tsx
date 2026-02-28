import { useAppStore } from '../../stores/appStore';
import { useWizardStore } from '../../stores/wizardStore';
import { WizardShell, type WizardStepDef } from '../wizard/WizardShell';
import { StepWelcome } from './steps/StepWelcome';
import { StepHardwareScan } from './steps/StepHardwareScan';
import { StepLLMSetup } from './steps/StepLLMSetup';
import { StepVoiceSetup } from './steps/StepVoiceSetup';
import { StepCharacterCreate } from './steps/StepCharacterCreate';
import { StepFeatureTour } from './steps/StepFeatureTour';
import { StepDone } from './steps/StepDone';

/* ── Step definitions ─────────────────────────────────────────────────── */

const ONBOARDING_STEPS: WizardStepDef[] = [
  { id: 'welcome',   title: 'Welcome',    component: StepWelcome,         skippable: false },
  { id: 'scan',      title: 'System Scan', component: StepHardwareScan,   skippable: true },
  { id: 'llm',       title: 'LLM Setup',  component: StepLLMSetup,        skippable: true },
  { id: 'voice',     title: 'Voice',       component: StepVoiceSetup,      skippable: true },
  { id: 'character', title: 'Character',   component: StepCharacterCreate, skippable: true },
  { id: 'tour',      title: 'Features',    component: StepFeatureTour,     skippable: true },
  { id: 'done',      title: 'Done',        component: StepDone,            skippable: false },
];

/**
 * Full-screen onboarding wizard shown on first launch (7 steps).
 *
 * Replaces the original 4-step wizard with an enhanced flow:
 * Welcome → Hardware Scan → LLM Setup → Voice Setup → Character → Feature Tour → Done
 *
 * The hardware scan results propagate to downstream steps via the shared
 * `wizardData` bag managed by WizardShell, enabling auto-detection of
 * LM Studio/Ollama and hardware-aware voice engine recommendations.
 */
export function OnboardingWizard() {
  const { saveConfig } = useAppStore();
  const { closeWizard } = useWizardStore();

  const handleComplete = async () => {
    await saveConfig({ onboarded: true, onboarding_version: 2 } as Record<string, unknown>).catch(() => {});
    closeWizard();
  };

  const handleCancel = async () => {
    await saveConfig({ onboarded: true, onboarding_version: 2 } as Record<string, unknown>).catch(() => {});
    closeWizard();
  };

  return (
    <WizardShell
      steps={ONBOARDING_STEPS}
      variant="fullscreen"
      onComplete={handleComplete}
      onCancel={handleCancel}
      showProgress
    />
  );
}
