/**
 * SettingsContext – User-facing settings state.
 *
 * Owns:
 *   - The currently selected TTS voice preset name.
 *   - Whether the settings panel is visually open.
 *   - The step index for the setup wizard (null when wizard is not shown).
 *
 * Voice presets are defined in src/services/voicePresets.ts and referenced
 * here by name.  The actual TTSOptions are looked up at speak-time by
 * useSpeechSynthesis.
 */

import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import { loadState, saveState } from '../services/storageService.ts';
import { VOICE_PRESETS } from '../services/voicePresets.ts';
import { type SettingsTab } from '../types/companion.ts';

/* ── State & Actions ─────────────────────────────────────────────── */
export interface SettingsState {
  /** Name key of the active voice preset (must match a VoicePreset.name). */
  selectedVoiceName: string;
  /** Auto-speak newly completed assistant messages. */
  autoReadAssistant: boolean;
  /** Enable voice interruption — user can speak to cut off AI mid-speech. */
  voiceInterruptionEnabled: boolean;
  /** Controls visibility of the SettingsPanel slide-over. */
  isPanelOpen: boolean;
  /** Active tab in the expanded settings control center. */
  currentTab: SettingsTab;
  /** Preferred height for the desktop settings split-pane. */
  panelHeight: number;
  /** Preferred desktop viewer width share, persisted as a percentage. */
  desktopViewerWidthPercent: number;
  /**
   * When non-null, the SetupWizard is visible and this is the current step
   * index (0-based).  Null means the wizard is closed.
   */
  wizardStep: number | null;
}

export type SettingsAction =
  | { type: 'SET_VOICE'; payload: string }
  | { type: 'SET_AUTO_READ_ASSISTANT'; payload: boolean }
  | { type: 'SET_VOICE_INTERRUPTION'; payload: boolean }
  | { type: 'TOGGLE_PANEL' }
  | { type: 'SET_PANEL_OPEN'; payload: boolean }
  | { type: 'SET_PANEL_HEIGHT'; payload: number }
  | { type: 'SET_DESKTOP_VIEWER_WIDTH_PERCENT'; payload: number }
  | { type: 'SET_TAB'; payload: SettingsTab }
  | { type: 'OPEN_WIZARD' }
  | { type: 'WIZARD_NEXT' }
  | { type: 'WIZARD_BACK' }
  | { type: 'CLOSE_WIZARD' };

const WIZARD_TOTAL_STEPS = 6; // Welcome, LLM, STT, TTS, Fallbacks, Summary

const initialState: SettingsState = {
  selectedVoiceName: 'default',
  autoReadAssistant: false,
  voiceInterruptionEnabled: false,
  isPanelOpen: false,
  currentTab: 'general',
  panelHeight: 440,
  desktopViewerWidthPercent: 40,
  wizardStep: null,
};

function getDesktopViewerWidthBounds(viewportWidth: number): { minPercent: number; maxPercent: number } {
  const minLeftPx = 300;
  const minRightPx = 460;
  const minPercent = Math.max(30, Math.round((minLeftPx / viewportWidth) * 100));
  const defaultMaxPercent = viewportWidth >= 1680
    ? 52
    : viewportWidth >= 1480
      ? 50
      : viewportWidth >= 1280
        ? 48
        : viewportWidth >= 1120
          ? 46
          : 42;
  const maxPercent = Math.min(defaultMaxPercent, 100 - Math.round((minRightPx / viewportWidth) * 100));
  return { minPercent, maxPercent };
}

function clampPanelHeight(height: number): number {
  if (typeof window === 'undefined') {
    return Math.max(320, Math.min(680, Math.round(height)));
  }

  const viewportHeight = window.innerHeight;
  const reservedChatSpace = viewportHeight >= 960 ? 320 : 280;
  const availableHeight = viewportHeight - reservedChatSpace;
  const viewportBound = Math.max(320, Math.min(760, availableHeight));
  return Math.max(320, Math.min(viewportBound, Math.round(height)));
}

function clampDesktopViewerWidthPercent(percent: number): number {
  if (typeof window === 'undefined') {
    return Math.max(30, Math.min(52, Math.round(percent)));
  }

  const viewportWidth = window.innerWidth;
  const { minPercent, maxPercent } = getDesktopViewerWidthBounds(viewportWidth);
  if (minPercent >= maxPercent) {
    return 40;
  }
  return Math.max(minPercent, Math.min(maxPercent, Math.round(percent)));
}

function isKnownVoicePreset(name: string): boolean {
  return VOICE_PRESETS.some((preset) => preset.name === name);
}

function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'SET_VOICE':
      return { ...state, selectedVoiceName: action.payload };
    case 'SET_AUTO_READ_ASSISTANT':
      return { ...state, autoReadAssistant: action.payload };
    case 'SET_VOICE_INTERRUPTION':
      return { ...state, voiceInterruptionEnabled: action.payload };
    case 'TOGGLE_PANEL':
      return { ...state, isPanelOpen: !state.isPanelOpen };
    case 'SET_PANEL_OPEN':
      return { ...state, isPanelOpen: action.payload };
    case 'SET_PANEL_HEIGHT':
      return { ...state, panelHeight: clampPanelHeight(action.payload) };
    case 'SET_DESKTOP_VIEWER_WIDTH_PERCENT':
      return { ...state, desktopViewerWidthPercent: clampDesktopViewerWidthPercent(action.payload) };
    case 'SET_TAB':
      return { ...state, currentTab: action.payload };
    case 'OPEN_WIZARD':
      return { ...state, isPanelOpen: true, wizardStep: 0 };
    case 'WIZARD_NEXT':
      return {
        ...state,
        wizardStep: state.wizardStep !== null && state.wizardStep < WIZARD_TOTAL_STEPS - 1
          ? state.wizardStep + 1
          : state.wizardStep,
      };
    case 'WIZARD_BACK':
      return {
        ...state,
        wizardStep: state.wizardStep !== null && state.wizardStep > 0
          ? state.wizardStep - 1
          : state.wizardStep,
      };
    case 'CLOSE_WIZARD':
      return { ...state, wizardStep: null };
    default:
      return state;
  }
}

/* ── Context ─────────────────────────────────────────────────────── */
interface SettingsContextValue {
  state: SettingsState;
  dispatch: React.Dispatch<SettingsAction>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}

/* ── Provider ────────────────────────────────────────────────────── */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(settingsReducer, undefined, () => {
    const persisted = loadState();
    const persistedVoice = persisted?.selectedVoiceName;
    const persistedAutoRead = persisted?.autoReadAssistant;
    const setupComplete = persisted?.setupComplete ?? false;
    return {
      ...initialState,
      selectedVoiceName:
        typeof persistedVoice === 'string' && isKnownVoicePreset(persistedVoice)
          ? persistedVoice
          : initialState.selectedVoiceName,
      autoReadAssistant:
        typeof persistedAutoRead === 'boolean'
          ? persistedAutoRead
          : initialState.autoReadAssistant,
      panelHeight:
        typeof persisted?.settingsPanelHeight === 'number'
          ? clampPanelHeight(persisted.settingsPanelHeight)
          : initialState.panelHeight,
      desktopViewerWidthPercent:
        typeof persisted?.desktopViewerWidthPercent === 'number'
          ? clampDesktopViewerWidthPercent(persisted.desktopViewerWidthPercent)
          : initialState.desktopViewerWidthPercent,
      wizardStep: setupComplete ? null : 0,
    };
  });

  // Persist only the durable settings values.
  useEffect(() => {
    const persisted = loadState();
    saveState({
      ...persisted,
      selectedVoiceName: state.selectedVoiceName,
      autoReadAssistant: state.autoReadAssistant,
      settingsPanelHeight: state.panelHeight,
      desktopViewerWidthPercent: state.desktopViewerWidthPercent,
    });
  }, [state.selectedVoiceName, state.autoReadAssistant, state.panelHeight, state.desktopViewerWidthPercent]);

  useEffect(() => {
    const onResize = () => {
      const clamped = clampPanelHeight(state.panelHeight);
      const clampedViewerWidth = clampDesktopViewerWidthPercent(state.desktopViewerWidthPercent);

      if (clamped !== state.panelHeight) {
        dispatch({ type: 'SET_PANEL_HEIGHT', payload: clamped });
      }

      if (clampedViewerWidth !== state.desktopViewerWidthPercent) {
        dispatch({ type: 'SET_DESKTOP_VIEWER_WIDTH_PERCENT', payload: clampedViewerWidth });
      }
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [state.panelHeight, state.desktopViewerWidthPercent]);

  return (
    <SettingsContext.Provider value={{ state, dispatch }}>
      {children}
    </SettingsContext.Provider>
  );
}
