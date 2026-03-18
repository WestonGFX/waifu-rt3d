/**
 * ContentSettingsPanel — Settings tab for content gating, age verification,
 * content lock, and sensory writing configuration.
 *
 * Controls the global content ceiling, per-persona overrides, and the
 * content lock password system. All state flows through CompanionContext.
 */

import { useState } from 'react';
import { Shield, Lock, Unlock } from 'lucide-react';
import { useCompanion } from '@/context/CompanionContext.tsx';
import {
  type ContentRatingLevel,
  CONTENT_RATING_ORDER,
  DEFAULT_CONTENT_GATE_CONFIG,
} from '@/types/content.ts';
import { getContentRatingColor, isCloudProvider } from '@/services/contentGatingService.ts';
import ContentRatingBadge from '@/components/ui/ContentRatingBadge.tsx';
import AgeVerificationDialog from '@/components/ui/AgeVerificationDialog.tsx';
import ContentLockDialog from '@/components/ui/ContentLockDialog.tsx';
import {
  AppCard,
  AppField,
  AppMutedNote,
  SettingsSectionHeader,
  Switch,
} from './SettingsPrimitives.tsx';
import { useApp } from '@/context/AppContext.tsx';

/** Rating level selector row. */
function RatingOption({
  level,
  selected,
  disabled,
  onSelect,
}: {
  level: ContentRatingLevel;
  selected: boolean;
  disabled: boolean;
  onSelect: (level: ContentRatingLevel) => void;
}) {
  const { label } = getContentRatingColor(level);
  const descriptions: Record<ContentRatingLevel, string> = {
    general: 'Family-friendly. No sexual content or suggestive descriptions.',
    edgy: 'Light flirting and romantic tension. No explicit content.',
    mature: 'Sensual and passionate content. Suggestive but not graphic.',
    explicit: 'Fully explicit content permitted. Requires local LLM.',
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(level)}
      disabled={disabled}
      className={[
        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
        selected
          ? 'border-anime-400 bg-anime-50/50'
          : 'border-[color:var(--control-border-soft)] bg-[color:var(--card-bg-soft)] hover:bg-[color:var(--control-bg)]',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      ].join(' ')}
    >
      <ContentRatingBadge level={level} size="md" />
      <div className="flex-1">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        <div className="mt-0.5 text-xs text-text-muted">{descriptions[level]}</div>
      </div>
      {selected && (
        <div className="h-2 w-2 rounded-full bg-anime-500" />
      )}
    </button>
  );
}

/**
 * Renders the full Content settings panel.
 */
export default function ContentSettingsPanel() {
  const { state: companionState, updateContentGateConfig } = useCompanion();
  const { state: appState } = useApp();
  const config = companionState.contentGateConfig ?? DEFAULT_CONTENT_GATE_CONFIG;

  const [showAgeDialog, setShowAgeDialog] = useState(false);
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [pendingLevel, setPendingLevel] = useState<ContentRatingLevel | null>(null);

  const providerName = appState.providerConfig.llm.primary;
  const isCloud = isCloudProvider(providerName);

  const handleSelectLevel = (level: ContentRatingLevel) => {
    if (config.contentLockEnabled) return;

    // Require age verification for anything above 'general'
    const levelIndex = CONTENT_RATING_ORDER.indexOf(level);
    if (levelIndex > 0 && !config.ageVerified) {
      setPendingLevel(level);
      setShowAgeDialog(true);
      return;
    }

    void updateContentGateConfig({ ...config, globalContentCeiling: level });
  };

  const handleAgeConfirm = () => {
    setShowAgeDialog(false);
    if (pendingLevel) {
      void updateContentGateConfig({
        ...config,
        ageVerified: true,
        globalContentCeiling: pendingLevel,
      });
      setPendingLevel(null);
    }
  };

  const handleLockComplete = (hash: string, enabled: boolean) => {
    setShowLockDialog(false);
    void updateContentGateConfig({
      ...config,
      contentLockEnabled: enabled,
      contentLockPasswordHash: hash,
    });
  };

  return (
    <div className="space-y-4">
      <SettingsSectionHeader
        icon={<Shield className="h-4 w-4" />}
        title="Content Rating"
        subtitle="Set the maximum content maturity level for all conversations."
      />

      <AppCard>
        <div className="space-y-2">
          {CONTENT_RATING_ORDER.map((level) => (
            <RatingOption
              key={level}
              level={level}
              selected={config.globalContentCeiling === level}
              disabled={config.contentLockEnabled}
              onSelect={handleSelectLevel}
            />
          ))}
        </div>

        {isCloud && config.globalContentCeiling === 'explicit' && (
          <AppMutedNote className="mt-3">
            Your current LLM provider ({providerName}) is cloud-based and will auto-cap at <ContentRatingBadge level="mature" />.
            Switch to a local provider (Ollama) for explicit content.
          </AppMutedNote>
        )}
      </AppCard>

      <SettingsSectionHeader
        icon={config.contentLockEnabled ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
        title="Content Lock"
        subtitle="Password-protect the content ceiling to prevent accidental changes."
      />

      <AppCard>
        <AppField label="Content lock" description="When enabled, the ceiling selector requires a password to change.">
          <Switch
            checked={config.contentLockEnabled}
            onCheckedChange={() => setShowLockDialog(true)}
          />
        </AppField>
      </AppCard>

      <AgeVerificationDialog
        open={showAgeDialog}
        onConfirm={handleAgeConfirm}
        onCancel={() => {
          setShowAgeDialog(false);
          setPendingLevel(null);
        }}
      />

      <ContentLockDialog
        open={showLockDialog}
        isLocked={config.contentLockEnabled}
        storedHash={config.contentLockPasswordHash}
        onComplete={handleLockComplete}
        onCancel={() => setShowLockDialog(false)}
      />
    </div>
  );
}
