import { useApp } from '../../context/AppContext.tsx';
import { useCompanion } from '../../context/CompanionContext.tsx';
import { useModel } from '../../context/ModelContext.tsx';
import {
  applyRenderProfile,
  RENDER_PROFILE_LABELS,
} from '../../services/renderProfiles.ts';
import { type RenderProfileId } from '../../types/companion.ts';
import {
  AppCard,
  AppMutedNote,
  Button,
  Switch,
  SettingsSectionHeader,
  SettingsStatCard,
} from './SettingsPrimitives.tsx';

const PROFILE_ORDER: RenderProfileId[] = [
  'battery-saver',
  'balanced',
  'smooth',
  'max-fidelity',
];

const RENDER_MODE_OPTIONS: Array<{ value: '3d' | 'live2d'; label: string; description: string }> = [
  { value: '3d', label: 'VRM / 3D', description: 'Three.js renderer for .vrm and .glb models.' },
  { value: 'live2d', label: 'Live2D', description: 'PixiJS renderer for Cubism .model3.json files.' },
];

export default function RenderingSettingsPanel() {
  const { state: companionState, updateRenderSettings } = useCompanion();
  const { state: appState, dispatch: appDispatch } = useApp();
  const { state: modelState } = useModel();
  const { renderSettings } = companionState;

  return (
    <div className="space-y-3.5">
      <AppMutedNote>
        Rendering is mostly a battery versus smoothness trade. Lower pixel ratio first if you need headroom.
      </AppMutedNote>

      <AppCard className="p-3.5">
        <SettingsSectionHeader
          eyebrow="Renderer"
          title="Avatar mode"
          description="Choose which rendering engine displays your avatar. VRM/3D is the default; Live2D supports Cubism model files popular in the VTuber community."
        />
        <div className="mt-2.5 grid gap-2 xl:grid-cols-2">
          {RENDER_MODE_OPTIONS.map((mode) => (
            <Button
              key={mode.value}
              type="button"
              onClick={() => appDispatch({ type: 'SET_RENDER_MODE', payload: mode.value })}
              variant={appState.renderMode === mode.value ? 'default' : 'secondary'}
              className="h-auto items-start justify-start rounded-[18px] px-3 py-2.5 text-left"
            >
              <div className="text-sm font-medium">{mode.label}</div>
              <div className="mt-0.5 text-[11px] text-text-muted">{mode.description}</div>
            </Button>
          ))}
        </div>
        {appState.renderMode === 'live2d' && !modelState.live2dModelUrl && (
          <p className="mt-2 rounded-anime bg-amber-50 px-3 py-2 text-xs text-amber-700">
            No Live2D model loaded. Import a <span className="font-semibold">.model3.json</span> file from the Model Manager tab.
          </p>
        )}
      </AppCard>

      <AppCard className="p-3.5">
        <SettingsSectionHeader
          eyebrow="Presets"
          title="Render profile"
          description="Tune the renderer for battery life, smoothness, or max fidelity without digging through hidden constants."
        />
        <div className="mt-2.5 grid gap-2 xl:grid-cols-4">
          {PROFILE_ORDER.map((profile) => (
            <Button
              key={profile}
              type="button"
              onClick={() => void updateRenderSettings(applyRenderProfile(profile))}
              variant={renderSettings.profile === profile ? 'default' : 'secondary'}
              className="h-auto items-start justify-start rounded-[18px] px-3 py-2.5 text-left"
            >
              <div className="text-sm font-medium">{RENDER_PROFILE_LABELS[profile]}</div>
              <div className="mt-0.5 text-[11px] text-text-muted">{profile}</div>
            </Button>
          ))}
        </div>
      </AppCard>

      <div className="grid gap-2.5 xl:grid-cols-2">
        <AppCard className="p-3.5">
          <SettingsSectionHeader
            eyebrow="Telemetry"
            title="Live performance"
            description="Use these numbers when deciding whether to lower pixel ratio, frame cap, or animation quality."
          />
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <SettingsStatCard label="Current FPS" value={`${Math.round(appState.metrics.currentFps || 0)}`} />
            <SettingsStatCard label="Average FPS" value={`${Math.round(appState.metrics.averageFps || 0)}`} />
          </div>
          <p className="mt-2.5 text-xs text-text-muted">
            If average FPS drops below your target, lower pixel ratio first, then lower animation quality.
          </p>
        </AppCard>

        <AppCard className="p-3.5">
          <SettingsSectionHeader
            eyebrow="Controls"
            title="Quality toggles"
            description="These settings most directly affect image quality, battery, and camera feel."
          />
          <div className="mt-2.5 space-y-2.5">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium text-text-primary">Antialiasing</span>
                <span className="block text-xs text-text-muted">Sharper edges, slightly higher GPU cost.</span>
              </span>
              <Switch
                checked={renderSettings.antialias}
                onCheckedChange={() => void updateRenderSettings({ antialias: !renderSettings.antialias })}
              />
            </label>

            <div>
              <label className="text-sm font-medium text-text-primary">Orbit sensitivity</label>
              <input
                type="range"
                min="0.4"
                max="2"
                step="0.1"
                value={renderSettings.orbitSensitivity}
                onChange={(event) => void updateRenderSettings({
                  orbitSensitivity: Number(event.target.value),
                })}
                className="mt-1.5 w-full accent-anime-500"
              />
              <div className="mt-0.5 text-xs text-text-muted">
                {renderSettings.orbitSensitivity.toFixed(1)}x camera responsiveness
              </div>
            </div>
          </div>
        </AppCard>
      </div>

      <div className="grid gap-2.5 xl:grid-cols-2">
        <AppCard className="p-3.5">
          <SettingsSectionHeader
            eyebrow="Timing"
            title="Frame pacing"
            description="Cap the renderer when you want a cooler laptop or steadier frame delivery."
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            {[30, 45, 60, 120].map((fps) => (
              <Button
                key={fps}
                type="button"
                onClick={() => void updateRenderSettings({ fpsCap: fps as 30 | 45 | 60 | 120 })}
                variant={renderSettings.fpsCap === fps ? 'default' : 'secondary'}
                size="sm"
              >
                {fps === 120 ? 'Unlocked-ish' : `${fps} FPS`}
              </Button>
            ))}
          </div>
        </AppCard>

        <AppCard className="p-3.5">
          <SettingsSectionHeader
            eyebrow="Resolution"
            title="Pixel ratio cap"
            description="Usually the fastest way to buy back performance without making motion feel choppy."
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            {[0.75, 1, 1.25, 1.5, 2].map((ratio) => (
              <Button
                key={ratio}
                type="button"
                onClick={() => void updateRenderSettings({
                  pixelRatioCap: ratio as 0.75 | 1 | 1.25 | 1.5 | 2,
                })}
                variant={renderSettings.pixelRatioCap === ratio ? 'default' : 'secondary'}
                size="sm"
              >
                {ratio}x
              </Button>
            ))}
          </div>
        </AppCard>
      </div>

      <div className="grid gap-2.5 xl:grid-cols-2">
        <AppCard className="p-3.5">
          <SettingsSectionHeader
            eyebrow="Motion"
            title="Animation quality"
            description="Controls how dense the motion layers feel while idle, reacting, and occupying a room."
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            {(['low', 'balanced', 'high'] as const).map((quality) => (
              <Button
                key={quality}
                type="button"
                onClick={() => void updateRenderSettings({ animationQuality: quality })}
                variant={renderSettings.animationQuality === quality ? 'default' : 'secondary'}
                size="sm"
                className="capitalize"
              >
                {quality}
              </Button>
            ))}
          </div>
        </AppCard>

        <AppCard className="p-3.5">
          <SettingsSectionHeader
            eyebrow="Speech"
            title="Lip sync quality"
            description="Higher settings spend more work on mouth timing and speaking transitions."
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            {(['low', 'balanced', 'high'] as const).map((quality) => (
              <Button
                key={quality}
                type="button"
                onClick={() => void updateRenderSettings({ lipSyncQuality: quality })}
                variant={renderSettings.lipSyncQuality === quality ? 'default' : 'secondary'}
                size="sm"
                className="capitalize"
              >
                {quality}
              </Button>
            ))}
          </div>
        </AppCard>
      </div>
    </div>
  );
}
