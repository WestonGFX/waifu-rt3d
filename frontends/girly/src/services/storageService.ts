/**
 * storageService – Centralised localStorage access for AnimeGirly.
 *
 * Why a dedicated module instead of inline localStorage calls:
 *   - localStorage is synchronous and throws on quota-exceeded or
 *     when the browser is in a restricted private-browsing mode.
 *   - Centralising access lets us handle those errors in one place,
 *     add schema-version migration later, and keep consumers simple.
 *
 * The persisted shape is PersistedState (see src/types/index.ts).
 * Missing keys in stored JSON are filled with undefined; consumers
 * fall back to their own defaults via the `??` operator.
 */

import { type PersistedState } from '../types/index.ts';

const STORAGE_KEY = 'animegirly_state';
const LAYOUT_SCHEMA_VERSION = 9;

/**
 * Loads the persisted application state from localStorage.
 *
 * @returns The stored state object, or an empty object if nothing has been
 *          saved yet or if the stored value is not valid JSON.
 */
export function loadState(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistedState>;

    if ((parsed.layoutSchemaVersion ?? 0) < LAYOUT_SCHEMA_VERSION) {
      const migrated: Partial<PersistedState> = {
        ...parsed,
        settingsPanelHeight: undefined,
        desktopViewerWidthPercent: undefined,
        shellStylePreference: 'floating',
        workspacePanelPreferences: {
          chats: true,
          context: true,
          settings: true,
          headerModules: {
            overview: true,
            focus: true,
            actions: false,
          },
        },
        activeUtilityTray: null,
        layoutSchemaVersion: LAYOUT_SCHEMA_VERSION,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }

    return parsed;
  } catch {
    // Corrupted or unparseable – start fresh.
    return {};
  }
}

/**
 * Persists the application state to localStorage.
 *
 * Silently no-ops if localStorage is unavailable (e.g. private browsing
 * in some browsers, or quota exceeded).
 *
 * @param state - The full or partial state to write.  We merge with the
 *                current stored value so callers can update a single key
 *                without reading first.
 */
export function saveState(state: Partial<PersistedState>): void {
  try {
    const current = loadState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...current,
      ...state,
      layoutSchemaVersion: LAYOUT_SCHEMA_VERSION,
    }));
  } catch {
    // Quota exceeded or storage unavailable – silently ignore.
    console.warn('[AnimeGirly] Could not persist state to localStorage.');
  }
}

/**
 * Wipes the persisted state entirely.
 * Called by "Clear Chat History" (which also clears the in-memory state).
 */
export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

export function resetLayoutState(): void {
  try {
    const current = loadState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...current,
      settingsPanelHeight: undefined,
      desktopViewerWidthPercent: undefined,
      shellStylePreference: 'floating',
      workspacePanelPreferences: {
        chats: true,
        context: true,
        settings: true,
        headerModules: {
          overview: true,
          focus: true,
          actions: false,
        },
      },
      activeUtilityTray: null,
      layoutSchemaVersion: LAYOUT_SCHEMA_VERSION,
    }));
  } catch {
    // no-op
  }
}
