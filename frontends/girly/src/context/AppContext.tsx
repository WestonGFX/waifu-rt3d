/**
 * AppContext – Top-level application state.
 *
 * Owns:
 *   - Whether the first-launch setup wizard has been completed.
 *   - The persisted ProviderConfig (which providers are active + fallback chains).
 *   - Dev-mode flag (union of Vite mode AND a user-toggled localStorage override).
 *   - Live DevMetrics updated by ThreeViewer (FPS) and the fallback executor (latency).
 *
 * Consumers call `useApp()` to read state or dispatch actions.
 */

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react';
import { loadState, saveState } from '../services/storageService.ts';
import {
  type AvatarRuntimeState,
  type AvatarTuning,
  type ProviderConfig,
  type DevMetrics,
  type ThemePreference,
  type ShellStylePreference,
  type UtilityTrayId,
  type WorkspacePanelPreferences,
  type HeaderModuleVisibility,
  type HeaderInsightMode,
} from '../types/index.ts';
import {
  DEFAULT_AVATAR_TUNING,
  createInitialAvatarRuntime,
} from '../services/avatarPerformanceService.ts';
import { isThemePreference } from '../services/themePresets.ts';

/* ── Default provider config (Phase 1 providers only) ────────────── */
const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  llm: {
    primary: 'ollama',
    fallbacks: [],
    fallbackTriggers: ['error', 'timeout'],
    timeoutMs: 30000,
  },
  stt: {
    primary: 'webSpeech',
    fallbacks: [],
    fallbackTriggers: ['error', 'unsupported'],
    timeoutMs: 10000,
  },
  tts: {
    primary: 'webSpeech',
    fallbacks: [],
    fallbackTriggers: ['error', 'unsupported'],
    timeoutMs: 15000,
  },
  animation: {
    primary: 'performance',
    fallbacks: [],
    fallbackTriggers: ['error'],
    timeoutMs: 5000,
  },
};

function getActiveProviders(config: ProviderConfig): DevMetrics['activeProviders'] {
  return {
    llm: config.llm.primary,
    stt: config.stt.primary,
    tts: config.tts.primary,
    animation: config.animation.primary,
  };
}

const DEFAULT_WORKSPACE_PANEL_PREFERENCES: WorkspacePanelPreferences = {
  chats: true,
  context: true,
  thoughts: true,
  settings: true,
  headerModules: {
    overview: true,
    focus: true,
    actions: false,
  },
};

function normalizeHeaderModuleVisibility(
  visibility?: Partial<HeaderModuleVisibility> | null,
): HeaderModuleVisibility {
  const normalized: HeaderModuleVisibility = {
    ...DEFAULT_WORKSPACE_PANEL_PREFERENCES.headerModules,
    ...(visibility ?? {}),
  };

  if (!normalized.overview && !normalized.focus) {
    normalized.overview = true;
  }

  return normalized;
}

function normalizeWorkspacePanelPreferences(
  preferences?: Partial<WorkspacePanelPreferences> | null,
): WorkspacePanelPreferences {
  return {
    ...DEFAULT_WORKSPACE_PANEL_PREFERENCES,
    ...(preferences ?? {}),
    headerModules: normalizeHeaderModuleVisibility(preferences?.headerModules),
  };
}

function normalizeHeaderInsightMode(
  mode: HeaderInsightMode | undefined,
  preferences: WorkspacePanelPreferences,
): HeaderInsightMode {
  if (mode === 'actions' && !preferences.headerModules?.actions) {
    return 'companion';
  }
  return mode ?? 'companion';
}

/* ── State & Actions ─────────────────────────────────────────────── */
export interface AppState {
  setupComplete: boolean;
  providerConfig: ProviderConfig;
  devMode: boolean;
  themePreference: ThemePreference;
  shellStylePreference: ShellStylePreference;
  activeUtilityTray: UtilityTrayId | null;
  workspacePanelPreferences: WorkspacePanelPreferences;
  headerInsightMode: HeaderInsightMode;
  /** Which viewer renders the avatar: '3d' (Three.js/VRM), '2d' (Canvas 2D), or 'live2d' (PixiJS/Cubism). */
  renderMode: '3d' | '2d' | 'live2d';
  avatar: AvatarRuntimeState;
  avatarTuning: AvatarTuning;
  /** Live telemetry – mutated externally, never triggers re-render on its own. */
  metrics: DevMetrics;
}

export type AppAction =
  | { type: 'SET_SETUP_COMPLETE'; payload: boolean }
  | { type: 'SET_PROVIDER_CONFIG'; payload: ProviderConfig }
  | { type: 'SET_DEV_MODE'; payload: boolean }
  | { type: 'SET_THEME_PREFERENCE'; payload: ThemePreference }
  | { type: 'SET_SHELL_STYLE_PREFERENCE'; payload: ShellStylePreference }
  | { type: 'SET_ACTIVE_UTILITY_TRAY'; payload: UtilityTrayId | null }
  | { type: 'TOGGLE_UTILITY_TRAY'; payload: UtilityTrayId }
  | { type: 'SET_WORKSPACE_PANEL_PREFERENCES'; payload: WorkspacePanelPreferences }
  | { type: 'SET_HEADER_INSIGHT_MODE'; payload: HeaderInsightMode }
  | { type: 'SET_RENDER_MODE'; payload: '3d' | '2d' | 'live2d' }
  | { type: 'SET_AVATAR_STATE'; payload: AvatarRuntimeState }
  | { type: 'SET_AVATAR_TUNING'; payload: AvatarTuning }
  | { type: 'UPDATE_METRICS'; payload: Partial<DevMetrics> };

const initialMetrics: DevMetrics = {
  currentFps: 0,
  averageFps: 0,
  lastLlmLatencyMs: 0,
  activeProviders: {
    llm: 'ollama',
    stt: 'webSpeech',
    tts: 'webSpeech',
    animation: 'performance',
  },
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_SETUP_COMPLETE':
      return { ...state, setupComplete: action.payload };
    case 'SET_PROVIDER_CONFIG':
      return {
        ...state,
        providerConfig: action.payload,
        metrics: {
          ...state.metrics,
          activeProviders: getActiveProviders(action.payload),
        },
      };
    case 'SET_DEV_MODE':
      return { ...state, devMode: action.payload };
    case 'SET_THEME_PREFERENCE':
      return { ...state, themePreference: action.payload };
    case 'SET_SHELL_STYLE_PREFERENCE':
      return { ...state, shellStylePreference: action.payload };
    case 'SET_ACTIVE_UTILITY_TRAY':
      return { ...state, activeUtilityTray: action.payload };
    case 'TOGGLE_UTILITY_TRAY':
      return {
        ...state,
        activeUtilityTray: state.activeUtilityTray === action.payload ? null : action.payload,
      };
    case 'SET_WORKSPACE_PANEL_PREFERENCES':
      return {
        ...state,
        workspacePanelPreferences: normalizeWorkspacePanelPreferences(action.payload),
        headerInsightMode: normalizeHeaderInsightMode(state.headerInsightMode, normalizeWorkspacePanelPreferences(action.payload)),
      };
    case 'SET_HEADER_INSIGHT_MODE':
      return {
        ...state,
        headerInsightMode: normalizeHeaderInsightMode(action.payload, state.workspacePanelPreferences),
      };
    case 'SET_RENDER_MODE':
      return { ...state, renderMode: action.payload };
    case 'SET_AVATAR_STATE':
      return { ...state, avatar: action.payload };
    case 'SET_AVATAR_TUNING':
      return { ...state, avatarTuning: action.payload };
    case 'UPDATE_METRICS':
      return { ...state, metrics: { ...state.metrics, ...action.payload } };
    default:
      return state;
  }
}

/* ── Context ─────────────────────────────────────────────────────── */
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/* ── Provider ────────────────────────────────────────────────────── */
export function AppProvider({ children }: { children: ReactNode }) {
  // Determine dev-mode: true if explicit env flag is set OR user toggled it on.
  const envDevMode = import.meta.env.VITE_DEV_MODE === '1';

  const [state, dispatch] = useReducer(appReducer, undefined, () => {
    const persisted = loadState();
    const providerConfig = persisted?.providerConfig ?? DEFAULT_PROVIDER_CONFIG;
    const avatarTuning = persisted?.avatarTuning ?? DEFAULT_AVATAR_TUNING;
    const workspacePanelPreferences = normalizeWorkspacePanelPreferences(persisted?.workspacePanelPreferences);
    return {
      setupComplete: persisted?.setupComplete ?? false,
      providerConfig,
      devMode: envDevMode || (persisted?.devModeEnabled ?? false),
      themePreference:
        typeof persisted?.themePreference === 'string' && isThemePreference(persisted.themePreference)
          ? persisted.themePreference
          : 'auto',
      shellStylePreference: persisted?.shellStylePreference ?? 'floating',
      activeUtilityTray: persisted?.setupComplete ? null : 'settings',
      workspacePanelPreferences,
      headerInsightMode: normalizeHeaderInsightMode(persisted?.headerInsightMode, workspacePanelPreferences),
      renderMode: persisted?.renderMode === '2d'
        ? '3d'
        : (persisted?.renderMode === 'live2d' ? 'live2d' : (persisted?.renderMode ?? '3d')),
      avatar: createInitialAvatarRuntime(avatarTuning),
      avatarTuning,
      metrics: {
        ...initialMetrics,
        activeProviders: getActiveProviders(providerConfig),
      },
    };
  });

  // Persist setupComplete, providerConfig, and devMode whenever they change.
  useEffect(() => {
    const persisted = loadState();
    saveState({
      ...persisted,
      setupComplete: state.setupComplete,
      providerConfig: state.providerConfig,
      devModeEnabled: state.devMode && !envDevMode, // only persist the toggle, not the env override
      themePreference: state.themePreference,
      shellStylePreference: state.shellStylePreference,
      workspacePanelPreferences: state.workspacePanelPreferences,
      headerInsightMode: state.headerInsightMode,
      renderMode: state.renderMode,
      avatarTuning: state.avatarTuning,
    });
  }, [
    state.setupComplete,
    state.providerConfig,
    state.devMode,
    state.themePreference,
    state.shellStylePreference,
    state.workspacePanelPreferences,
    state.headerInsightMode,
    state.renderMode,
    state.avatarTuning,
    envDevMode,
  ]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}
