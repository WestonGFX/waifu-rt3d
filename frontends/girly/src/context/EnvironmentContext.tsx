import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getSetting, putSetting } from '../services/appDb.ts';
import { fetchEnvironmentLibrary } from '../services/environmentLibraryService.ts';
import {
  type EnvironmentSceneProfile,
  type RoomRuntimeState,
} from '../types/companion.ts';

interface EnvironmentState {
  root: string;
  library: EnvironmentSceneProfile[];
  selectedEnvironmentId: string | null;
  familiarityByEnvironmentId: Record<string, number>;
  roomRuntime: RoomRuntimeState;
  isLoading: boolean;
  error: string | null;
}

interface EnvironmentContextValue {
  state: EnvironmentState;
  currentEnvironment: EnvironmentSceneProfile | null;
  refreshLibrary: () => Promise<void>;
  selectEnvironment: (environmentId: string) => Promise<void>;
  clearEnvironment: () => Promise<void>;
  incrementFamiliarity: (environmentId: string, amount?: number) => Promise<void>;
  setRoomRuntime: (patch: Partial<RoomRuntimeState>) => void;
}

const DEFAULT_ROOM_RUNTIME: RoomRuntimeState = {
  roomMode: 'none',
  currentAnchorId: null,
  targetAnchorId: null,
  currentHotspotId: null,
  familiarity: 0,
  environmentName: null,
};

const EnvironmentContext = createContext<EnvironmentContextValue | undefined>(undefined);

function resolveDebugSceneOverrideId(library: EnvironmentSceneProfile[]): string | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const requestedScene = params.get('scene') ?? params.get('environment');
  if (!requestedScene) return null;

  const normalizedRequested = requestedScene.trim().toLowerCase();
  if (!normalizedRequested) return null;

  return library.find((scene) => {
    const normalizedName = scene.name.trim().toLowerCase().replace(/\s+/g, '-');
    return (
      scene.id.toLowerCase() === normalizedRequested
      || scene.name.trim().toLowerCase() === normalizedRequested
      || normalizedName === normalizedRequested
    );
  })?.id ?? null;
}

export function useEnvironment(): EnvironmentContextValue {
  const context = useContext(EnvironmentContext);
  if (!context) throw new Error('useEnvironment must be used inside <EnvironmentProvider>');
  return context;
}

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EnvironmentState>({
    root: '',
    library: [],
    selectedEnvironmentId: null,
    familiarityByEnvironmentId: {},
    roomRuntime: DEFAULT_ROOM_RUNTIME,
    isLoading: true,
    error: null,
  });

  const hydrate = useCallback(async () => {
    setState((previous) => ({ ...previous, isLoading: true, error: null }));
    try {
      const [result, selectedEnvironmentId, familiarityByEnvironmentId] = await Promise.all([
        fetchEnvironmentLibrary(),
        getSetting<string>('current_environment_id'),
        getSetting<Record<string, number>>('environment_familiarity'),
      ]);

      setState((previous) => {
        const debugSceneOverrideId = resolveDebugSceneOverrideId(result.files);
        const persistedSelectedId = selectedEnvironmentId && result.files.some((item) => item.id === selectedEnvironmentId)
          ? selectedEnvironmentId
          : null;
        const safeSelectedId = debugSceneOverrideId ?? persistedSelectedId;
        const currentEnvironment = result.files.find((item) => item.id === safeSelectedId) ?? null;
        return {
          ...previous,
          root: result.root,
          library: result.files,
          selectedEnvironmentId: safeSelectedId,
          familiarityByEnvironmentId: familiarityByEnvironmentId ?? {},
          roomRuntime: {
            ...previous.roomRuntime,
            familiarity: safeSelectedId ? (familiarityByEnvironmentId?.[safeSelectedId] ?? 0) : 0,
            environmentName: currentEnvironment?.name ?? null,
          },
          isLoading: false,
          error: null,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load environment library.';
      setState((previous) => ({
        ...previous,
        root: '',
        library: [],
        selectedEnvironmentId: null,
        isLoading: false,
        error: message,
      }));
    }
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const refreshLibrary = useCallback(async () => {
    const result = await fetchEnvironmentLibrary();
    setState((previous) => {
      const debugSceneOverrideId = resolveDebugSceneOverrideId(result.files);
      const persistedSelectedId = previous.selectedEnvironmentId && result.files.some((item) => item.id === previous.selectedEnvironmentId)
        ? previous.selectedEnvironmentId
        : null;
      const safeSelectedId = debugSceneOverrideId ?? persistedSelectedId;
      const currentEnvironment = result.files.find((item) => item.id === safeSelectedId) ?? null;
      return {
        ...previous,
        root: result.root,
        library: result.files,
        selectedEnvironmentId: safeSelectedId,
        error: null,
        roomRuntime: {
          ...previous.roomRuntime,
          familiarity: safeSelectedId ? (previous.familiarityByEnvironmentId[safeSelectedId] ?? 0) : 0,
          environmentName: currentEnvironment?.name ?? null,
        },
      };
    });
  }, []);

  const selectEnvironment = useCallback(async (environmentId: string) => {
    setState((previous) => {
      const currentEnvironment = previous.library.find((item) => item.id === environmentId) ?? null;
      return {
        ...previous,
        selectedEnvironmentId: environmentId,
        roomRuntime: {
          ...previous.roomRuntime,
          roomMode: 'settling',
          currentAnchorId: null,
          targetAnchorId: null,
          currentHotspotId: null,
          familiarity: previous.familiarityByEnvironmentId[environmentId] ?? 0,
          environmentName: currentEnvironment?.name ?? null,
        },
      };
    });

    await putSetting('current_environment_id', environmentId);
  }, []);

  const clearEnvironment = useCallback(async () => {
    setState((previous) => ({
      ...previous,
      selectedEnvironmentId: null,
      roomRuntime: DEFAULT_ROOM_RUNTIME,
    }));
    await putSetting('current_environment_id', null);
  }, []);

  const incrementFamiliarity = useCallback(async (environmentId: string, amount = 0.05) => {
    let nextMap: Record<string, number> = {};

    setState((previous) => {
      const nextValue = Math.min(1, (previous.familiarityByEnvironmentId[environmentId] ?? 0) + amount);
      nextMap = {
        ...previous.familiarityByEnvironmentId,
        [environmentId]: Number(nextValue.toFixed(3)),
      };
      return {
        ...previous,
        familiarityByEnvironmentId: nextMap,
        roomRuntime: previous.selectedEnvironmentId === environmentId
          ? {
              ...previous.roomRuntime,
              familiarity: nextMap[environmentId],
            }
          : previous.roomRuntime,
      };
    });

    await putSetting('environment_familiarity', nextMap);
  }, []);

  const setRoomRuntime = useCallback((patch: Partial<RoomRuntimeState>) => {
    setState((previous) => ({
      ...previous,
      roomRuntime: {
        ...previous.roomRuntime,
        ...patch,
      },
    }));
  }, []);

  const currentEnvironment = useMemo(
    () => state.library.find((item) => item.id === state.selectedEnvironmentId) ?? null,
    [state.library, state.selectedEnvironmentId],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const debugWindow = window as Window & {
      __animegirlyDebug?: Record<string, unknown>;
    };

    debugWindow.__animegirlyDebug = {
      ...(debugWindow.__animegirlyDebug ?? {}),
      environmentLibrary: state.library,
      selectedEnvironmentId: state.selectedEnvironmentId,
      debugSceneOverrideId: resolveDebugSceneOverrideId(state.library),
      selectEnvironmentById: (environmentId: string) => selectEnvironment(environmentId),
      clearEnvironmentSelection: () => clearEnvironment(),
    };
  }, [clearEnvironment, selectEnvironment, state.library, state.selectedEnvironmentId]);

  return (
    <EnvironmentContext.Provider
      value={{
        state,
        currentEnvironment,
        refreshLibrary,
        selectEnvironment,
        clearEnvironment,
        incrementFamiliarity,
        setRoomRuntime,
      }}
    >
      {children}
    </EnvironmentContext.Provider>
  );
}
