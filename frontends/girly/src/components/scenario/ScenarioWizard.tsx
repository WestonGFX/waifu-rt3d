/**
 * ScenarioWizard – multi-step wizard for generating roleplay scenarios.
 *
 * Steps: Genre -> Setting -> Mood -> Characters -> Generate -> Preview
 *
 * The wizard collects user preferences through each step, then calls the
 * LLM to generate a system prompt and opening message. The user can preview
 * and apply the scenario to start a new conversation thread.
 */

import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Loader2, Wand2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useCompanion } from '../../context/CompanionContext.tsx';
import {
  type ScenarioConfig,
  type ScenarioOutput,
  type ScenarioWizardStep,
  type ScenarioCharacter,
  type ContentRating,
} from '../../types/scenario.ts';
import {
  generateScenario,
  GENRE_PRESETS,
  MOOD_PRESETS,
} from '../../services/scenarioGeneratorService.ts';

interface Props {
  onClose: () => void;
  onApply: (scenario: ScenarioOutput) => void;
}

const STEPS: ScenarioWizardStep[] = ['genre', 'setting', 'mood', 'characters', 'generate', 'preview'];

const STEP_LABELS: Record<ScenarioWizardStep, string> = {
  genre: 'Genre',
  setting: 'Setting',
  mood: 'Mood',
  characters: 'Characters',
  generate: 'Generate',
  preview: 'Preview',
};

const DEFAULT_CHARACTER: ScenarioCharacter = {
  name: '',
  role: 'AI companion',
  personality: '',
};

export default function ScenarioWizard({ onClose, onApply }: Props) {
  const { state: appState } = useApp();
  const { activePersona } = useCompanion();

  const [step, setStep] = useState<ScenarioWizardStep>('genre');
  const [config, setConfig] = useState<ScenarioConfig>({
    genre: '',
    setting: '',
    mood: '',
    conflict: '',
    characters: [{
      name: activePersona?.name ?? '',
      role: 'AI companion',
      personality: activePersona?.tagline ?? '',
    }],
    maturityRating: 'general' as ContentRating,
  });
  const [scenario, setScenario] = useState<ScenarioOutput | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.indexOf(step);
  const canGoBack = stepIndex > 0 && step !== 'preview';
  const canGoForward = stepIndex < STEPS.length - 1;

  const goBack = () => {
    if (canGoBack) setStep(STEPS[stepIndex - 1]);
  };

  const goForward = useCallback(async () => {
    if (step === 'generate' && !scenario) {
      setIsGenerating(true);
      setError(null);
      try {
        const result = await generateScenario(config, appState.providerConfig);
        setScenario(result);
        setStep('preview');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate scenario');
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    if (canGoForward) setStep(STEPS[stepIndex + 1]);
  }, [step, scenario, config, appState.providerConfig, canGoForward, stepIndex]);

  const updateCharacter = (index: number, field: keyof ScenarioCharacter, value: string) => {
    setConfig(prev => ({
      ...prev,
      characters: prev.characters.map((c, i) =>
        i === index ? { ...c, [field]: value } : c,
      ),
    }));
  };

  const addCharacter = () => {
    setConfig(prev => ({
      ...prev,
      characters: [...prev.characters, { ...DEFAULT_CHARACTER }],
    }));
  };

  const removeCharacter = (index: number) => {
    if (config.characters.length <= 1) return;
    setConfig(prev => ({
      ...prev,
      characters: prev.characters.filter((_, i) => i !== index),
    }));
  };

  const inputClass = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-anime-400/50';
  const cardClass = 'rounded-xl border border-white/8 bg-white/4 p-3 cursor-pointer hover:bg-white/8 transition-colors';
  const selectedCardClass = 'rounded-xl border border-anime-400/40 bg-anime-500/10 p-3 cursor-pointer ring-1 ring-anime-400/30';

  return (
    <div className="flex flex-col h-full max-h-[520px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <Wand2 size={16} className="text-anime-400" />
          <span className="text-sm font-semibold text-text-primary">Scenario Wizard</span>
        </div>
        <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary text-xs">
          Cancel
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1 px-4 py-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= stepIndex ? 'bg-anime-400' : 'bg-white/10'
            }`}
          />
        ))}
      </div>
      <div className="px-4 pb-2">
        <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
          Step {stepIndex + 1} / {STEPS.length}: {STEP_LABELS[step]}
        </span>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {step === 'genre' && (
          <div className="space-y-2">
            <p className="text-xs text-text-muted mb-3">Pick a genre for your scenario.</p>
            <div className="grid grid-cols-3 gap-2">
              {GENRE_PRESETS.map(g => (
                <div
                  key={g.id}
                  className={config.genre === g.id ? selectedCardClass : cardClass}
                  onClick={() => setConfig(prev => ({ ...prev, genre: g.id }))}
                >
                  <div className="text-xs font-semibold text-text-primary">{g.label}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">{g.hint}</div>
                </div>
              ))}
            </div>
            <input
              type="text"
              className={inputClass + ' mt-2'}
              placeholder="Or type a custom genre..."
              value={GENRE_PRESETS.some(g => g.id === config.genre) ? '' : config.genre}
              onChange={e => setConfig(prev => ({ ...prev, genre: e.target.value }))}
            />
          </div>
        )}

        {step === 'setting' && (
          <div className="space-y-3">
            <p className="text-xs text-text-muted">Describe the setting where the scenario takes place.</p>
            <textarea
              className={inputClass + ' min-h-[80px] resize-none'}
              placeholder="e.g., A cozy coffee shop on a rainy evening in Tokyo..."
              value={config.setting}
              onChange={e => setConfig(prev => ({ ...prev, setting: e.target.value }))}
            />
            <div>
              <label className="text-xs font-medium text-text-secondary">Conflict or hook (optional)</label>
              <textarea
                className={inputClass + ' min-h-[60px] resize-none mt-1'}
                placeholder="e.g., You're meeting for the first time after chatting online..."
                value={config.conflict}
                onChange={e => setConfig(prev => ({ ...prev, conflict: e.target.value }))}
              />
            </div>
          </div>
        )}

        {step === 'mood' && (
          <div className="space-y-2">
            <p className="text-xs text-text-muted mb-3">Set the mood and tone.</p>
            <div className="grid grid-cols-2 gap-2">
              {MOOD_PRESETS.map(m => (
                <div
                  key={m.id}
                  className={config.mood === m.id ? selectedCardClass : cardClass}
                  onClick={() => setConfig(prev => ({ ...prev, mood: m.id }))}
                >
                  <div className="text-xs font-semibold text-text-primary">{m.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label className="text-xs font-medium text-text-secondary">Content rating</label>
              <div className="flex gap-2 mt-1">
                {(['general', 'edgy', 'mature'] as ContentRating[]).map(rating => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, maturityRating: rating }))}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                      config.maturityRating === rating
                        ? 'border-anime-400/40 bg-anime-500/15 text-anime-300'
                        : 'border-white/10 bg-white/5 text-text-muted hover:bg-white/8'
                    }`}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'characters' && (
          <div className="space-y-3">
            <p className="text-xs text-text-muted">Configure the characters in your scenario.</p>
            {config.characters.map((char, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-white/4 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-text-muted uppercase">Character {i + 1}</span>
                  {config.characters.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCharacter(i)}
                      className="text-[10px] text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Name"
                  value={char.name}
                  onChange={e => updateCharacter(i, 'name', e.target.value)}
                />
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Role (e.g., AI companion, rival, mentor)"
                  value={char.role}
                  onChange={e => updateCharacter(i, 'role', e.target.value)}
                />
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Personality (e.g., shy but curious, energetic and flirty)"
                  value={char.personality}
                  onChange={e => updateCharacter(i, 'personality', e.target.value)}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={addCharacter}
              className="w-full rounded-xl border border-dashed border-white/15 py-2 text-xs text-text-muted hover:border-white/25 hover:text-text-secondary transition-colors"
            >
              + Add character
            </button>
          </div>
        )}

        {step === 'generate' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Sparkles size={32} className="text-anime-400" />
            <p className="text-sm text-text-primary text-center font-medium">Ready to generate your scenario</p>
            <div className="text-xs text-text-muted text-center space-y-1">
              <p><strong>Genre:</strong> {config.genre || 'Not set'}</p>
              <p><strong>Setting:</strong> {config.setting || 'Not set'}</p>
              <p><strong>Mood:</strong> {config.mood || 'Not set'}</p>
              <p><strong>Characters:</strong> {config.characters.map(c => c.name || 'Unnamed').join(', ')}</p>
            </div>
            {error && (
              <p className="text-xs text-red-400 text-center">{error}</p>
            )}
          </div>
        )}

        {step === 'preview' && scenario && (
          <div className="space-y-3">
            <div>
              <span className="text-[10px] font-semibold text-text-muted uppercase">System Prompt</span>
              <div className="mt-1 rounded-xl border border-white/8 bg-white/4 p-3 text-xs text-text-secondary leading-relaxed max-h-[160px] overflow-y-auto">
                {scenario.systemPrompt}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-text-muted uppercase">Opening Message</span>
              <div className="mt-1 rounded-xl border border-anime-400/15 bg-anime-500/5 p-3 text-xs text-text-primary leading-relaxed italic">
                {scenario.openingMessage}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/8">
        <button
          type="button"
          onClick={goBack}
          disabled={!canGoBack}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={14} /> Back
        </button>

        {step === 'preview' && scenario ? (
          <button
            type="button"
            onClick={() => onApply(scenario)}
            className="flex items-center gap-1.5 rounded-lg bg-anime-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-anime-400 transition-colors"
          >
            <Sparkles size={12} /> Use Scenario
          </button>
        ) : (
          <button
            type="button"
            onClick={goForward}
            disabled={isGenerating || (step === 'genre' && !config.genre)}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Generating...
              </>
            ) : step === 'generate' ? (
              <>
                <Sparkles size={12} /> Generate
              </>
            ) : (
              <>
                Next <ChevronRight size={14} />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
