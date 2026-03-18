import { useMemo } from 'react';
import { useEnvironment } from '../../context/EnvironmentContext.tsx';
import EnvironmentUploader from './EnvironmentUploader.tsx';
import {
  SETTINGS_PANEL_CARD,
  SettingsSectionHeader,
  SettingsStatCard,
} from './SettingsPrimitives.tsx';

export default function RoomsSettingsPanel() {
  const { state, currentEnvironment } = useEnvironment();

  const recommendedCount = useMemo(
    () => state.library.filter((scene) => scene.recommended).length,
    [state.library],
  );

  const activeCredits = currentEnvironment?.credits?.length ?? 0;

  return (
    <div className="space-y-3.5">
      <div className={SETTINGS_PANEL_CARD}>
        <SettingsSectionHeader
          eyebrow="Rooms"
          title="Scene and room library"
          description="Pick the live environment directly from here. Rooms stay first-class instead of hiding under generic model management."
        />

        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <SettingsStatCard
            label="Current room"
            value={currentEnvironment?.name ?? 'Empty stage'}
            detail={currentEnvironment?.category ?? 'No environment loaded'}
          />
          <SettingsStatCard
            label="Library"
            value={state.library.length.toString()}
            detail={state.isLoading ? 'Refreshing room catalog' : 'Installed local scenes'}
          />
          <SettingsStatCard
            label="Starters"
            value={recommendedCount.toString()}
            detail="Recommended rooms ready to load"
          />
          <SettingsStatCard
            label="Credits"
            value={activeCredits.toString()}
            detail={activeCredits > 0 ? 'Attribution entries on the active room' : 'No active room credits'}
          />
        </div>
      </div>

      <EnvironmentUploader />
    </div>
  );
}
