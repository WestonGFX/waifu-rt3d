import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Download } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useCompanion } from '../../context/CompanionContext.tsx';
import { createPersonaPrompt } from '../../services/personaPresets.ts';
import { estimateTokenCount } from '../../services/contextBudgetService.ts';
import {
  importCardFromPng,
  importCardFromJson,
  exportCardAsPng,
  exportCardAsJson,
  downloadBlob,
  cardDataToPersona,
} from '../../services/characterCardService.ts';
import { type DereType, type PersonaArchetype, type PersonaProfile } from '../../types/companion.ts';
import { type ThemePreference } from '../../types/index.ts';
import {
  type ContentRatingLevel,
  CONTENT_RATING_ORDER,
  DEFAULT_SENSORY_WRITING_CONFIG,
} from '../../types/content.ts';
import { type RelationshipPhase, DEFAULT_PHASE_THRESHOLDS } from '../../types/psychology.ts';
import ContentRatingBadge from '@/components/ui/ContentRatingBadge.tsx';
import { APP_THEME_OPTIONS, getThemeLabel, type PersonaThemePreference } from '../../services/themePresets.ts';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import {
  SETTINGS_PANEL_CARD,
  SETTINGS_PANEL_MUTED,
  SETTINGS_PANEL_SUBCARD,
  SettingsSectionHeader,
} from './SettingsPrimitives.tsx';

const ARCHETYPES: PersonaArchetype[] = [
  'deredere',
  'tsundere-lite',
  'kuudere',
  'dandere',
  'genki',
  'onee-san',
  'custom',
];

const DERE_TYPES: DereType[] = [
  'deredere',
  'tsundere',
  'kuudere',
  'dandere',
  'yandere-lite',
  'genki',
  'onee-san',
  'ojou',
  'bokukko',
  'himedere',
  'mayadere',
  'sadodere',
  'dorodere',
  'nyandere',
  'tennen',
  'goudere',
];

export default function PersonaSettingsPanel() {
  const { state: appState } = useApp();
  const {
    state,
    activePersona,
    setCurrentPersona,
    savePersona,
    setPersonaThemePreference,
  } = useCompanion();
  const [draft, setDraft] = useState<PersonaProfile | null>(activePersona);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);

    const isPng = file.name.toLowerCase().endsWith('.png');
    const isJson = file.name.toLowerCase().endsWith('.json');

    if (!isPng && !isJson) {
      setImportStatus('Error: Only .png and .json character cards are supported.');
      return;
    }

    const result = isPng
      ? await importCardFromPng(file)
      : await importCardFromJson(file);

    if (!result.success) {
      setImportStatus(`Error: ${result.message}`);
      return;
    }

    // Re-parse to get the persona (importCard returns the ID but not the full persona)
    const buffer = isPng ? await file.arrayBuffer() : null;
    let persona: PersonaProfile | null = null;

    if (isPng && buffer) {
      const { extractCharaChunk, normalizeCardData } = await import('../../services/characterCardService.ts');
      const json = extractCharaChunk(buffer);
      if (json) {
        const cardData = normalizeCardData(JSON.parse(json));
        persona = cardDataToPersona(cardData);
      }
    } else {
      const text = await file.text();
      const { normalizeCardData } = await import('../../services/characterCardService.ts');
      const cardData = normalizeCardData(JSON.parse(text));
      persona = cardDataToPersona(cardData);
    }

    if (persona) {
      await savePersona(persona);
      await setCurrentPersona(persona.id);
      const lorebookNote = result.lorebookEntryCount > 0
        ? ` (${result.lorebookEntryCount} lorebook entries saved for future use)`
        : '';
      setImportStatus(`Imported "${persona.name}"${lorebookNote}`);
    }

    // Reset file input so the same file can be re-imported
    if (importFileRef.current) importFileRef.current.value = '';
  }, [savePersona, setCurrentPersona]);

  const handleExport = useCallback(async (format: 'png' | 'json') => {
    if (!activePersona) return;
    setImportStatus(null);

    if (format === 'json') {
      const result = exportCardAsJson(activePersona);
      if (result.success) {
        downloadBlob(result.blob, result.filename);
        setImportStatus(result.message);
      } else {
        setImportStatus(`Error: ${result.message}`);
      }
    } else {
      const result = await exportCardAsPng(activePersona);
      if (result.success) {
        downloadBlob(result.blob, result.filename);
        setImportStatus(result.message);
      } else {
        setImportStatus(`Error: ${result.message}`);
      }
    }
  }, [activePersona]);

  useEffect(() => {
    setDraft(activePersona);
  }, [activePersona]);

  const generatedPromptPreview = useMemo(() => {
    if (!draft) return '';
    return createPersonaPrompt(draft);
  }, [draft]);

  const promptTokenEstimate = useMemo(
    () => estimateTokenCount(draft?.rawPromptOverride?.trim() || generatedPromptPreview),
    [draft?.rawPromptOverride, generatedPromptPreview],
  );

  const patchDraft = (patch: Partial<PersonaProfile>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      ...patch,
      updatedAt: Date.now(),
    });
  };

  const handlePersonaThemeChange = async (value: PersonaThemePreference) => {
    if (!draft) return;

    const nextThemePreference = value === 'app-default'
      ? undefined
      : value as ThemePreference;

    setDraft({
      ...draft,
      themePreference: nextThemePreference,
      updatedAt: Date.now(),
    });

    await setPersonaThemePreference(draft.id, nextThemePreference);
  };

  const saveDraft = async () => {
    if (!draft) return;
    const nextPersona: PersonaProfile = {
      ...draft,
      generatedSystemPrompt: generatedPromptPreview,
      updatedAt: Date.now(),
    };
    await savePersona(nextPersona);
    await setCurrentPersona(nextPersona.id);
  };

  return (
    <div className="space-y-4">
      <div className={SETTINGS_PANEL_MUTED}>
        Personas are the character layer of the app. The guided fields below feed the generated system prompt, while the raw override lets you take full manual control when you want exact behavior.
      </div>

      <div className="grid gap-3 xl:grid-cols-[240px_1fr]">
        <div className={SETTINGS_PANEL_CARD}>
          <SettingsSectionHeader
            eyebrow="Library"
            title="Persona library"
            description="Swap between dere-style companions and then tune the active one without leaving this tab."
          />
          <ScrollArea className="mt-3 max-h-[42rem] pr-1">
          <div className="space-y-2">
            {state.personas.map((persona) => (
              <button
                key={persona.id}
                type="button"
                onClick={() => void setCurrentPersona(persona.id)}
                className={[
                  'w-full rounded-anime border px-3 py-2 text-left transition-colors',
                  activePersona?.id === persona.id
                    ? 'border-anime-400 bg-anime-50 text-anime-700'
                    : 'border-anime-100 bg-white text-text-secondary hover:bg-anime-50',
                ].join(' ')}
              >
                <div className="text-sm font-medium">{persona.name}</div>
                <div className="mt-1 text-[11px] text-text-muted">{persona.tagline}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-text-muted">
                  {persona.dereTypes.join(' · ')}
                </div>
              </button>
            ))}
          </div>
          </ScrollArea>

          {/* Import / Export buttons */}
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => importFileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 gap-1.5"
              disabled={!activePersona}
              onClick={() => void handleExport('png')}
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
          {importStatus && (
            <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${importStatus.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {importStatus}
            </div>
          )}
          <input
            ref={importFileRef}
            type="file"
            accept=".png,.json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>

        <div className={`space-y-3 ${SETTINGS_PANEL_CARD}`}>
          {!draft ? (
            <p className="text-sm text-text-muted">Select a persona.</p>
          ) : (
            <>
              <SettingsSectionHeader
                eyebrow="Builder"
                title="Persona builder"
                description="Shape the companion’s dere-style, emotional pacing, and world premise without giving up raw prompt control."
                aside={(
                  <Button
                    size="sm"
                    onClick={() => void saveDraft()}
                  >
                    Save persona
                  </Button>
                )}
              />

              <div className="grid gap-3 xl:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-text-secondary">Name</span>
                  <Input
                    value={draft.name}
                    onChange={(event) => patchDraft({ name: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-text-secondary">Archetype</span>
                  <Select value={draft.archetype} onValueChange={(value) => patchDraft({ archetype: value as PersonaArchetype })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ARCHETYPES.map((archetype) => (
                        <SelectItem key={archetype} value={archetype}>{archetype}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-text-secondary">Theme</span>
                  <Select
                    value={(draft.themePreference ?? 'app-default') as PersonaThemePreference}
                    onValueChange={(value) => void handlePersonaThemeChange(value as PersonaThemePreference)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="app-default">
                        {`Follow app theme (${getThemeLabel(appState.themePreference)})`}
                      </SelectItem>
                      {APP_THEME_OPTIONS.map((theme) => (
                        <SelectItem key={theme.id} value={theme.id}>{theme.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <div className={SETTINGS_PANEL_SUBCARD}>
                <div className="text-xs font-semibold text-text-secondary">Theme behavior</div>
                <div className="mt-1 text-xs leading-6 text-text-muted">
                  Keep a persona on app theme if you want Auto or your app-wide default to stay in control.
                  Choose a specific theme here only when this character should always switch the app into that look.
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Tagline</span>
                <Input
                  value={draft.tagline}
                  onChange={(event) => patchDraft({ tagline: event.target.value })}
                />
              </label>

              <div className={SETTINGS_PANEL_SUBCARD}>
                <div className="text-xs font-semibold text-text-secondary">Dere tags</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DERE_TYPES.map((tag) => {
                    const selected = draft.dereTypes.includes(tag);
                    return (
                      <Button
                        key={tag}
                        variant={selected ? 'default' : 'secondary'}
                        size="sm"
                        onClick={() => patchDraft({
                          dereTypes: selected
                            ? draft.dereTypes.filter((value) => value !== tag)
                            : [...draft.dereTypes, tag],
                        })}
                      >
                        {tag}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-text-secondary">Short bio</span>
                  <Textarea
                    rows={4}
                    value={draft.shortBio}
                    onChange={(event) => patchDraft({ shortBio: event.target.value })}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-text-secondary">Backstory</span>
                  <Textarea
                    rows={4}
                    value={draft.backstory}
                    onChange={(event) => patchDraft({ backstory: event.target.value })}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Relationship premise</span>
                <Textarea
                  rows={3}
                  value={draft.relationshipPremise}
                  onChange={(event) => patchDraft({ relationshipPremise: event.target.value })}
                />
              </label>

              <div className="grid gap-3 xl:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-text-secondary">World setting</span>
                  <Textarea
                    rows={4}
                    value={draft.worldSetting}
                    onChange={(event) => patchDraft({ worldSetting: event.target.value })}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-text-secondary">Tone guide</span>
                  <Textarea
                    rows={4}
                    value={draft.toneGuide}
                    onChange={(event) => patchDraft({ toneGuide: event.target.value })}
                  />
                </label>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {[
                  ['Initiative', 'initiativeLevel'],
                  ['Affection', 'affectionLevel'],
                  ['Flirt', 'flirtLevel'],
                ].map(([label, key]) => (
                  <label key={key} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-text-secondary">{label}</span>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={draft[key as keyof PersonaProfile] as number}
                      onChange={(event) => patchDraft({
                        [key]: Number(event.target.value),
                      } as Partial<PersonaProfile>)}
                      className="accent-anime-500"
                    />
                    <span className="text-xs text-text-muted">{draft[key as keyof PersonaProfile] as number}/10</span>
                  </label>
                ))}
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Memory priorities</span>
                <Input
                  value={draft.memoryPriorities.join(', ')}
                  onChange={(event) => patchDraft({
                    memoryPriorities: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                  })}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Character facts</span>
                <Textarea
                  rows={4}
                  value={draft.characterFacts.join('\n')}
                  onChange={(event) => patchDraft({
                    characterFacts: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean),
                  })}
                />
              </label>

              {/* ── Content config section ── */}
              <div className={SETTINGS_PANEL_SUBCARD}>
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Content config</div>
                  {draft.contentConfig && <ContentRatingBadge level={draft.contentConfig.contentCeiling} />}
                </div>
                <div className="mt-1 text-xs leading-5 text-text-muted">
                  Per-persona content rating and sensory writing. Leave unconfigured to inherit the global setting.
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-text-secondary">Content ceiling</span>
                    <Select
                      value={draft.contentConfig?.contentCeiling ?? 'inherit'}
                      onValueChange={(value) => {
                        if (value === 'inherit') {
                          const { contentConfig: _, ...rest } = draft;
                          void _;
                          patchDraft(rest as Partial<PersonaProfile>);
                          setDraft((prev) => prev ? { ...prev, contentConfig: undefined } : prev);
                          return;
                        }
                        patchDraft({
                          contentConfig: {
                            contentCeiling: value as ContentRatingLevel,
                            sensoryWriting: draft.contentConfig?.sensoryWriting ?? DEFAULT_SENSORY_WRITING_CONFIG,
                            intimacyPersonality: draft.contentConfig?.intimacyPersonality ?? '',
                            physicalDescription: draft.contentConfig?.physicalDescription,
                            intimateVoiceShift: draft.contentConfig?.intimateVoiceShift,
                          },
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">Inherit global</SelectItem>
                        {CONTENT_RATING_ORDER.map((level) => (
                          <SelectItem key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  {draft.contentConfig && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-text-secondary">Intimacy personality</span>
                      <Textarea
                        rows={3}
                        value={draft.contentConfig.intimacyPersonality}
                        onChange={(event) => patchDraft({
                          contentConfig: { ...draft.contentConfig!, intimacyPersonality: event.target.value },
                        })}
                        placeholder="How this character behaves in intimate moments..."
                      />
                    </label>
                  )}
                </div>

                {draft.contentConfig && (
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-text-secondary">Physical description</span>
                      <Textarea
                        rows={2}
                        value={draft.contentConfig.physicalDescription ?? ''}
                        onChange={(event) => patchDraft({
                          contentConfig: { ...draft.contentConfig!, physicalDescription: event.target.value || undefined },
                        })}
                        placeholder="Body description for physical scene awareness..."
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-text-secondary">Intimate voice shift</span>
                      <Input
                        value={draft.contentConfig.intimateVoiceShift ?? ''}
                        onChange={(event) => patchDraft({
                          contentConfig: { ...draft.contentConfig!, intimateVoiceShift: event.target.value || undefined },
                        })}
                        placeholder='e.g. "drops to a whisper"'
                      />
                    </label>
                  </div>
                )}

                {draft.contentConfig && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-text-secondary">Sensory channels</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(Object.keys(draft.contentConfig.sensoryWriting.emphasis) as Array<keyof typeof draft.contentConfig.sensoryWriting.emphasis>).map((channel) => {
                        const active = draft.contentConfig!.sensoryWriting.emphasis[channel];
                        return (
                          <Button
                            key={channel}
                            variant={active ? 'default' : 'secondary'}
                            size="sm"
                            onClick={() => patchDraft({
                              contentConfig: {
                                ...draft.contentConfig!,
                                sensoryWriting: {
                                  ...draft.contentConfig!.sensoryWriting,
                                  enabled: true,
                                  emphasis: { ...draft.contentConfig!.sensoryWriting.emphasis, [channel]: !active },
                                },
                              },
                            })}
                          >
                            {channel}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Psychology config section ── */}
              <div className={SETTINGS_PANEL_SUBCARD}>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Psychology config</div>
                <div className="mt-1 text-xs leading-5 text-text-muted">
                  Relationship dynamics, canon constraints, and dere weight blending. Leave unconfigured for default behavior.
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-text-secondary">Initial phase</span>
                    <Select
                      value={draft.psychologyConfig?.initialPhase ?? 'none'}
                      onValueChange={(value) => {
                        if (value === 'none') {
                          setDraft((prev) => prev ? { ...prev, psychologyConfig: undefined } : prev);
                          return;
                        }
                        patchDraft({
                          psychologyConfig: {
                            behavioralRules: draft.psychologyConfig?.behavioralRules ?? [],
                            triggerMap: draft.psychologyConfig?.triggerMap ?? [],
                            canonConstraints: draft.psychologyConfig?.canonConstraints ?? [],
                            dereWeights: draft.psychologyConfig?.dereWeights ?? [],
                            initialPhase: value as RelationshipPhase,
                            phaseTransitionThresholds: draft.psychologyConfig?.phaseTransitionThresholds ?? DEFAULT_PHASE_THRESHOLDS,
                          },
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not configured</SelectItem>
                        <SelectItem value="honeymoon">Honeymoon</SelectItem>
                        <SelectItem value="stable">Stable</SelectItem>
                        <SelectItem value="strained">Strained</SelectItem>
                        <SelectItem value="detaching">Detaching</SelectItem>
                        <SelectItem value="post_breakup">Post-breakup</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>

                {draft.psychologyConfig && (
                  <>
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-text-secondary">Canon constraints</div>
                      <div className="mt-1 text-xs text-text-muted">Immutable character rules. One per line. Prefix with [hard] or [soft].</div>
                      <Textarea
                        rows={4}
                        className="mt-2"
                        value={draft.psychologyConfig.canonConstraints.map((c) => `[${c.priority}] ${c.text}`).join('\n')}
                        onChange={(event) => {
                          const constraints = event.target.value
                            .split('\n')
                            .filter((line) => line.trim())
                            .map((line, i) => {
                              const match = line.match(/^\[(hard|soft)\]\s*(.*)/);
                              return {
                                id: `canon-${draft.id}-${i}`,
                                priority: (match?.[1] ?? 'hard') as 'hard' | 'soft',
                                text: match?.[2] ?? line.trim(),
                              };
                            });
                          patchDraft({
                            psychologyConfig: { ...draft.psychologyConfig!, canonConstraints: constraints },
                          });
                        }}
                        placeholder="[hard] She NEVER chases. She never begs."
                      />
                    </div>

                    {draft.psychologyConfig.dereWeights.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-semibold text-text-secondary">Dere weight base values</div>
                        <div className="mt-2 space-y-2">
                          {draft.psychologyConfig.dereWeights.map((entry, i) => (
                            <div key={entry.dereType} className="flex items-center gap-2">
                              <span className="w-20 text-xs text-text-muted">{entry.dereType}</span>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                value={entry.baseWeight}
                                onChange={(event) => {
                                  const nextWeights = [...draft.psychologyConfig!.dereWeights];
                                  nextWeights[i] = { ...entry, baseWeight: Number(event.target.value) };
                                  patchDraft({
                                    psychologyConfig: { ...draft.psychologyConfig!, dereWeights: nextWeights },
                                  });
                                }}
                                className="flex-1 accent-anime-500"
                              />
                              <span className="w-8 text-right text-xs text-text-muted">{entry.baseWeight}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3">
                      <div className="text-xs font-semibold text-text-secondary">
                        Rules: {draft.psychologyConfig.behavioralRules.length} | Triggers: {draft.psychologyConfig.triggerMap.length}
                      </div>
                      <div className="mt-1 text-xs text-text-muted">
                        Behavioral rules and trigger maps are configured via persona presets. A visual editor is planned for a future update.
                      </div>
                    </div>
                  </>
                )}
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Raw prompt override</span>
                <Textarea
                  rows={5}
                  value={draft.rawPromptOverride ?? ''}
                  onChange={(event) => patchDraft({ rawPromptOverride: event.target.value })}
                />
              </label>

              <div className={SETTINGS_PANEL_SUBCARD}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                    Generated system prompt preview
                  </div>
                  <div className="text-[11px] text-text-muted">
                    ~{promptTokenEstimate} tokens
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
                  {draft.rawPromptOverride?.trim() || generatedPromptPreview}
                </p>
              </div>

              <div className={SETTINGS_PANEL_SUBCARD}>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Character reference sheet
                </div>
                <p className="mt-2 text-sm text-text-secondary">{draft.shortBio}</p>
                <p className="mt-2 text-sm text-text-secondary">{draft.backstory}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {draft.characterFacts.map((fact) => (
                    <Badge key={fact} variant="secondary" className="text-[11px]">
                      {fact}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
