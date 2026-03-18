import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { useCompanion } from '../../context/CompanionContext.tsx';
import { useEnvironment } from '../../context/EnvironmentContext.tsx';
import {
  AppCard,
  AppField,
  AppMutedNote,
  Button,
  Input,
  SettingsSectionHeader,
} from './SettingsPrimitives.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';

export default function AdvancedSettingsPanel() {
  const { state: appState } = useApp();
  const { state, setHelperBaseUrl, refreshHelperData } = useCompanion();
  const { state: environmentState } = useEnvironment();
  const [helperBaseUrlDraft, setHelperBaseUrlDraft] = useState(state.helperBaseUrl);
  const kokoroCapability = state.helperCapabilities?.localProviders.find((provider) => provider.providerId === 'kokoro');

  useEffect(() => {
    setHelperBaseUrlDraft(state.helperBaseUrl);
  }, [state.helperBaseUrl]);

  return (
    <div className="space-y-3.5">
      <AppMutedNote>
        Advanced is for local runtime plumbing, bootstrap commands, and raw inspection when something feels broken.
      </AppMutedNote>

      <AppCard className="p-3.5">
        <SettingsSectionHeader
          eyebrow="Helper"
          title="Helper runtime endpoint"
          description="Point the frontend at a local companion helper for runtime discovery, jobs, and helper-backed TTS."
        />
        <div className="mt-3 grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
          <AppField label="Base URL" hint="Point this at the local helper that manages installs, secrets, runtime probes, and helper-backed speech.">
            <Input
              value={helperBaseUrlDraft}
              onChange={(event) => setHelperBaseUrlDraft(event.target.value)}
            />
          </AppField>
          <Button
            type="button"
            className="self-end"
            onClick={() => void setHelperBaseUrl(helperBaseUrlDraft)}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="self-end"
            onClick={() => void refreshHelperData()}
          >
            Probe helper
          </Button>
        </div>
      </AppCard>

      <div className="grid gap-2.5 xl:grid-cols-2">
        <AppCard className="p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">Helper bootstrap</div>
              <p className="mt-1 text-xs text-text-muted">
                Kokoro currently needs a helper runtime created with Python 3.11 or 3.12. Piper is already usable in the current helper runtime.
              </p>
            </div>
            <Badge variant="secondary">Low-level</Badge>
          </div>

          {state.helperCapabilities ? (
            <div className="mt-2.5 space-y-2.5 text-xs text-text-muted">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="font-medium text-text-primary">Current helper Python</div>
                  <div className="mt-1">{state.helperCapabilities.helperPythonVersion}</div>
                </div>
                <div>
                  <div className="font-medium text-text-primary">Recommended runtime</div>
                  <div className="mt-1">Python {state.helperCapabilities.recommendedPython}</div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="font-medium text-text-primary">Machine</div>
                  <div className="mt-1">
                    {[state.helperCapabilities.system.chip, state.helperCapabilities.system.machineModel].filter(Boolean).join(' · ') || 'Unavailable'}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-text-primary">Metal working-set guidance</div>
                  <div className="mt-1">
                    {state.helperCapabilities.system.recommendedMaxWorkingSetBytes
                      ? `${(state.helperCapabilities.system.recommendedMaxWorkingSetBytes / (1024 ** 3)).toFixed(2)} GB`
                      : 'Unavailable'}
                  </div>
                </div>
              </div>

              <div>
                <div className="font-medium text-text-primary">Detected Python commands</div>
                <div className="mt-1">
                  {state.helperCapabilities.pythonCandidates.join(', ') || 'No alternative Python interpreters detected'}
                </div>
              </div>

              <div>
                <div className="font-medium text-text-primary">Bootstrap command</div>
                <ScrollArea className="mt-1 max-w-full rounded-[18px] bg-slate-950/90">
                  <pre className="p-2.5 text-[11px] leading-5 text-slate-100">
                    {state.helperCapabilities.recommendedBootstrapCommand}
                  </pre>
                </ScrollArea>
              </div>

              <div>
                <div className="font-medium text-text-primary">Bootstrap script</div>
                <div className="mt-1 break-all">{state.helperCapabilities.bootstrapScriptPath}</div>
              </div>

              {kokoroCapability?.reason && (
                <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                  {kokoroCapability.reason}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2.5 rounded-[16px] border border-anime-100 bg-anime-50/70 px-3 py-2 text-xs text-text-muted">
              Probe the helper to inspect bootstrap readiness and local runtime capabilities.
            </div>
          )}
        </AppCard>

        <AppCard className="p-3.5">
          <SettingsSectionHeader
            eyebrow="Debug"
            title="Raw provider config"
            description="Low-level config snapshot for runtime debugging."
          />
          <ScrollArea className="mt-2.5 max-w-full rounded-[18px] bg-slate-950/90">
            <pre className="p-2.5 text-[11px] leading-5 text-slate-100">
              {JSON.stringify(appState.providerConfig, null, 2)}
            </pre>
          </ScrollArea>
        </AppCard>

        <AppCard className="p-3.5">
          <SettingsSectionHeader
            eyebrow="Debug"
            title="Runtime traces"
            description="Recent helper health, runtime status, and job state."
          />
          <ScrollArea className="mt-2.5 max-w-full rounded-[18px] bg-slate-950/90">
            <pre className="p-2.5 text-[11px] leading-5 text-slate-100">
              {JSON.stringify({
                helperHealth: state.helperHealth,
                helperCapabilities: state.helperCapabilities,
                runtimes: state.runtimeStatuses,
                jobs: state.jobs.slice(0, 5),
              }, null, 2)}
            </pre>
          </ScrollArea>
        </AppCard>

        <AppCard className="p-3.5 md:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">Credits &amp; Attributions</div>
              <p className="mt-1 text-xs text-text-muted">
                This stays out of the main screen on purpose. If a local room includes attribution or source notes, it shows up here without cluttering the chat or viewer.
              </p>
            </div>
            <span className="rounded-pill bg-anime-50 px-2 py-1 text-[11px] font-medium text-anime-700">
              Hidden from main UI
            </span>
          </div>

          <div className="mt-2.5 space-y-2.5">
            {environmentState.library.length === 0 ? (
                <div className="rounded-[16px] border border-anime-100 bg-anime-50/70 px-3 py-2 text-xs text-text-muted">
                  No environment assets have been loaded into the room library yet.
                </div>
              ) : (
                environmentState.library.map((scene) => (
                <div key={scene.id} className="rounded-[18px] border border-anime-100 bg-white/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-text-primary">{scene.name}</div>
                      <div className="mt-1 text-[11px] text-text-muted">
                        {scene.category}
                        {scene.license ? ` · ${scene.license}` : ''}
                        {scene.author ? ` · ${scene.author}` : ''}
                      </div>
                    </div>
                    {scene.sourceUrl && (
                      <a
                        href={scene.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-medium text-anime-600 underline-offset-2 hover:underline"
                      >
                        Source
                      </a>
                    )}
                  </div>

                  {scene.credits?.length ? (
                    <div className="mt-2.5 space-y-2">
                      {scene.credits.map((credit, index) => (
                        <div key={`${scene.id}-credit-${index}`} className="rounded-[16px] border border-anime-100 bg-anime-50/60 px-3 py-2 text-xs text-text-secondary">
                          <div className="font-medium text-text-primary">{credit.title}</div>
                          <div className="mt-1">
                            {[credit.author, credit.license].filter(Boolean).join(' · ') || 'Local asset'}
                          </div>
                          {credit.sourceUrl && (
                            <a
                              href={credit.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-anime-600 underline-offset-2 hover:underline"
                            >
                              {credit.sourceUrl}
                            </a>
                          )}
                          {credit.notes && (
                            <div className="mt-1">{credit.notes}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2.5 rounded-[16px] border border-anime-100 bg-anime-50/60 px-3 py-2 text-xs text-text-muted">
                      No explicit credits file was found for this local environment.
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </AppCard>
      </div>
    </div>
  );
}
