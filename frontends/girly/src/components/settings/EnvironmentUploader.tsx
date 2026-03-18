import { useCallback, useEffect, useRef, useState } from 'react';
import { useEnvironment } from '../../context/EnvironmentContext.tsx';
import { uploadEnvironmentFile } from '../../services/environmentLibraryService.ts';
import {
  Button,
  SETTINGS_PANEL_CARD,
  SETTINGS_PANEL_MUTED,
  SettingsSectionHeader,
  SettingsStatCard,
} from './SettingsPrimitives.tsx';

export default function EnvironmentUploader() {
  const {
    state,
    currentEnvironment,
    refreshLibrary,
    selectEnvironment,
    clearEnvironment,
  } = useEnvironment();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(currentEnvironment?.id ?? '');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSwitchingEnvironmentId, setIsSwitchingEnvironmentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedEnvironmentId(currentEnvironment?.id ?? '');
  }, [currentEnvironment?.id]);

  useEffect(() => {
    if (!selectedEnvironmentId && state.library.length > 0) {
      setSelectedEnvironmentId(state.library[0].id);
    }
  }, [selectedEnvironmentId, state.library]);

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(`Importing ${file.name}…`);

    try {
      const result = await uploadEnvironmentFile(file);
      await refreshLibrary();
      setSelectedEnvironmentId(result.file.id);
      await selectEnvironment(result.file.id);
      setUploadStatus(`${result.file.name} was imported into AnimeGirly's room library and is ready to load.`);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : 'Environment import failed.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  }, [refreshLibrary, selectEnvironment]);

  const handleCopyPath = useCallback(async () => {
    if (!state.root || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(state.root);
    setUploadStatus('Copied the local environment folder path to your clipboard.');
  }, [state.root]);

  const handleLoadEnvironment = useCallback(async (environmentId: string) => {
    setSelectedEnvironmentId(environmentId);
    setIsSwitchingEnvironmentId(environmentId);
    const targetEnvironment = state.library.find((scene) => scene.id === environmentId);
    setUploadStatus(
      targetEnvironment
        ? `Loading ${targetEnvironment.name} into the viewer…`
        : 'Loading selected room…',
    );

    try {
      await selectEnvironment(environmentId);
      if (targetEnvironment) {
        setUploadStatus(`${targetEnvironment.name} is now the active room.`);
      }
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : 'Room loading failed.');
    } finally {
      setIsSwitchingEnvironmentId(null);
    }
  }, [selectEnvironment, state.library]);

  const recommendedScenes = state.library.filter((scene) => scene.recommended);
  const visibleLibrary = recommendedScenes.length > 0
    ? [...recommendedScenes, ...state.library.filter((scene) => !scene.recommended)]
    : state.library;

  return (
    <div className="space-y-3.5">
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb"
        onChange={handleUpload}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className={SETTINGS_PANEL_CARD}>
        <SettingsSectionHeader
          eyebrow="Live room"
          title="Current environment"
          description="Keep the active room easy to scan, then load a new one directly from the cards below."
        />

        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <SettingsStatCard
            label="Active"
            value={currentEnvironment?.name ?? 'Empty stage'}
            detail={currentEnvironment?.category ?? 'No scene loaded'}
          />
          <SettingsStatCard
            label="Scenes"
            value={state.library.length.toString()}
            detail={state.isLoading ? 'Loading local room library' : 'Available to load'}
          />
          <SettingsStatCard
            label="Recommended"
            value={recommendedScenes.length.toString()}
            detail="Quick starter rooms"
          />
          <SettingsStatCard
            label="Source"
            value={currentEnvironment?.source ?? 'Local library'}
            detail={currentEnvironment?.license ?? 'Bring your own scenes'}
          />
        </div>

        <div className="mt-3 rounded-[18px] border border-[color:var(--control-border-soft)] bg-[color:var(--control-bg-soft)] px-3.5 py-3 text-[11px] leading-5 text-text-secondary shadow-[var(--shell-shadow-soft)]">
          <span className="font-semibold text-text-primary">Current live room:</span>{' '}
          {currentEnvironment
            ? `${currentEnvironment.name} · ${currentEnvironment.category ?? 'scene'}`
            : 'Empty stage'}
        </div>
      </div>

      {state.error && (
        <div className="text-xs text-rose-pastel-400">{state.error}</div>
      )}

      {!state.error && !state.isLoading && state.library.length === 0 && (
        <div className="text-xs text-text-muted">No local room scenes were found yet.</div>
      )}

      {state.library.length > 0 && (
        <div className="space-y-2.5">
          <SettingsSectionHeader
            eyebrow="Scenes"
            title="Pick a room"
            description="Load any room directly. Recommended starters stay at the top and the live room stays highlighted."
          />

          {recommendedScenes.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-text-secondary">Recommended local starters</div>
              <div className="flex flex-wrap gap-2">
                {recommendedScenes.slice(0, 4).map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => void handleLoadEnvironment(scene.id)}
                    className={[
                      'rounded-pill border px-3 py-1.5 text-[11px] font-medium transition-colors',
                      currentEnvironment?.id === scene.id
                        ? 'border-anime-400 bg-anime-50 text-anime-700'
                        : 'border-anime-100 bg-white text-text-secondary hover:bg-anime-50',
                    ].join(' ')}
                  >
                    {scene.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
            {visibleLibrary.map((scene) => {
              const isActive = currentEnvironment?.id === scene.id;
              const isSelected = (selectedEnvironmentId || currentEnvironment?.id) === scene.id;
              const isLoadingSelection = isSwitchingEnvironmentId === scene.id;
              return (
                <div
                  key={scene.id}
                  className={[
                    'app-card-surface rounded-[18px] px-3.5 py-3.5 text-left transition-all',
                    'block w-full',
                    isActive
                      ? 'border-anime-400 bg-anime-50/92 text-anime-700 shadow-[0_18px_36px_-30px_var(--color-glow-primary)]'
                      : 'text-text-secondary hover:border-anime-200 hover:bg-white/86',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-text-primary">{scene.name}</div>
                      <div className="mt-1 text-xs text-text-muted">
                        {[scene.category, scene.author ? `by ${scene.author}` : null].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {isActive ? (
                      <span className="rounded-pill border border-anime-300 bg-anime-100/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-anime-700">
                        Live
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-text-muted">
                    {scene.recommended ? 'Recommended starter' : scene.source === 'bundled' ? 'Bundled' : 'Local room'}
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleLoadEnvironment(scene.id)}
                      disabled={isLoadingSelection}
                      aria-label={`${isActive ? 'Reload' : 'Load'} ${scene.name}`}
                    >
                      {isLoadingSelection ? 'Loading…' : isActive ? 'Loaded' : 'Load room'}
                    </Button>
                    {!isActive && isSelected ? (
                      <span className="rounded-pill border border-[color:var(--control-border-soft)] px-2.5 py-1 text-[11px] text-text-muted">
                        Selected
                      </span>
                    ) : null}
                    {scene.license ? (
                      <span className="rounded-pill border border-[color:var(--control-border-soft)] px-2 py-1 text-[11px] text-text-muted">
                        {scene.license}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedEnvironmentId && selectedEnvironmentId !== currentEnvironment?.id ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => void handleLoadEnvironment(selectedEnvironmentId)} disabled={isSwitchingEnvironmentId === selectedEnvironmentId}>
                Load selected room
              </Button>
              <span className="text-xs text-text-muted">
                Pending selection: {state.library.find((scene) => scene.id === selectedEnvironmentId)?.name ?? selectedEnvironmentId}
              </span>
            </div>
          ) : null}

          {currentEnvironment?.credits?.length ? (
            <div className="text-[11px] text-text-muted">
              Credits are available in <span className="font-medium text-text-primary">Advanced → Credits &amp; Attributions</span>.
            </div>
          ) : null}
        </div>
      )}

      <div className={SETTINGS_PANEL_CARD}>
        <SettingsSectionHeader
          eyebrow="Library"
          title="Import and manage room files"
          description="Bring in `.glb` interiors, refresh the local library, or clear the active room without leaving this panel."
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? 'Importing…' : 'Import room'}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void refreshLibrary()}>
            Refresh library
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleCopyPath()}
            disabled={!state.root || !navigator.clipboard?.writeText}
          >
            Copy folder path
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void clearEnvironment()}
            disabled={!currentEnvironment}
          >
            Clear active room
          </Button>
        </div>

        {uploadStatus ? (
          <div className={`mt-3 ${SETTINGS_PANEL_MUTED}`}>
            {uploadStatus}
          </div>
        ) : null}

        <div className={`mt-3 ${SETTINGS_PANEL_MUTED}`}>
          <div className="font-medium text-text-primary">Manual folder</div>
          <div className="mt-1 break-all">{state.root || 'Loading environment folder…'}</div>
          <div className="mt-1.5">
            Drop <span className="font-semibold">.glb</span> scenes here and press <span className="font-semibold">Refresh</span>. Optional sidecars such as <span className="font-semibold">.scene.json</span> and <span className="font-semibold">.credits.json</span> can sit next to the room file.
          </div>
        </div>
      </div>
    </div>
  );
}
