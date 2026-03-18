/**
 * ModelContext – 3-D VRM model state.
 *
 * Owns:
 *   - The object-URL (or path) to the currently selected .glb / .vrm file.
 *   - Loading progress (0-100) and error state while the GLTFLoader is active.
 *
 * The ThreeViewer component watches `modelUrl` and calls useVRMLoader
 * whenever it changes.  The loader dispatches progress/error back here.
 */

import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import { loadState, saveState } from '../services/storageService.ts';

/* ── State & Actions ─────────────────────────────────────────────── */
export interface ModelState {
  /** Object URL or path to the current VRM/GLB model.  null = no model loaded. */
  modelUrl: string | null;
  /** Object URL or path to a Live2D .model3.json file.  null = no Live2D model. */
  live2dModelUrl: string | null;
  isLoading: boolean;
  /** Progress percentage while loading (0–100). */
  loadingProgress: number;
  /** Error message if the last load attempt failed. */
  error: string | null;
}

export type ModelAction =
  | { type: 'SET_MODEL_URL'; payload: string }
  | { type: 'CLEAR_MODEL_URL' }
  | { type: 'SET_LIVE2D_MODEL_URL'; payload: string }
  | { type: 'CLEAR_LIVE2D_MODEL_URL' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_PROGRESS'; payload: number }
  | { type: 'SET_ERROR'; payload: string | null };

const initialState: ModelState = {
  modelUrl: null,
  live2dModelUrl: null,
  isLoading: false,
  loadingProgress: 0,
  error: null,
};

function modelReducer(state: ModelState, action: ModelAction): ModelState {
  switch (action.type) {
    case 'SET_MODEL_URL':
      return { ...state, modelUrl: action.payload, isLoading: true, loadingProgress: 0, error: null };
    case 'CLEAR_MODEL_URL':
      return { ...state, modelUrl: null, isLoading: false, loadingProgress: 0, error: null };
    case 'SET_LIVE2D_MODEL_URL':
      return { ...state, live2dModelUrl: action.payload, error: null };
    case 'CLEAR_LIVE2D_MODEL_URL':
      return { ...state, live2dModelUrl: null };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_PROGRESS':
      return { ...state, loadingProgress: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    default:
      return state;
  }
}

/* ── Context ─────────────────────────────────────────────────────── */
interface ModelContextValue {
  state: ModelState;
  dispatch: React.Dispatch<ModelAction>;
}

const ModelContext = createContext<ModelContextValue | undefined>(undefined);

export function useModel(): ModelContextValue {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error('useModel must be used inside <ModelProvider>');
  return ctx;
}

/* ── Provider ────────────────────────────────────────────────────── */
export function ModelProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(modelReducer, undefined, () => {
    const persisted = loadState();
    const persistedModelUrl = persisted?.modelUrl ?? null;
    const persistedLive2dUrl = persisted?.live2dModelUrl ?? null;
    return {
      ...initialState,
      modelUrl: persistedModelUrl,
      live2dModelUrl: persistedLive2dUrl,
      isLoading: Boolean(persistedModelUrl),
    };
  });

  useEffect(() => {
    const persisted = loadState();
    saveState({ ...persisted, modelUrl: state.modelUrl, live2dModelUrl: state.live2dModelUrl });
  }, [state.modelUrl, state.live2dModelUrl]);

  return (
    <ModelContext.Provider value={{ state, dispatch }}>
      {children}
    </ModelContext.Provider>
  );
}
