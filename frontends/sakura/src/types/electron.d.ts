/**
 * Type declarations for the Electron preload API.
 *
 * The `electronAPI` object is exposed by `electron/preload.js` via
 * contextBridge. It's only available when the app runs inside Electron —
 * in a normal browser, `window.electronAPI` is undefined.
 *
 * Use `isElectronApp()` from `lib/electron.ts` to check at runtime.
 */

interface ElectronAPI {
  /** Whether we're running inside Electron. */
  isElectron: true;

  /** Toggle click-through for the pet window's transparent areas. */
  setClickThrough: (shouldPassThrough: boolean) => void;

  /** Move the pet window by a pixel delta (for drag-to-move). */
  movePetWindow: (deltaX: number, deltaY: number) => void;

  /** Open the full app window from the pet overlay. */
  openMainWindow: () => void;

  /** Set the character mute state. */
  setMuted: (muted: boolean) => void;

  /** Listen for mute state changes. Returns cleanup function. */
  onMuteChanged: (callback: (muted: boolean) => void) => () => void;

  /** Get current app state from the main process. */
  getAppState: () => Promise<{ petMode: boolean; muted: boolean }>;

  /** Show a native right-click context menu on the pet window. */
  showPetContextMenu: (opts: { characterName: string; isMuted: boolean }) => void;

  /** Show a native OS notification. */
  showNotification: (opts: { title: string; body: string; charId?: number }) => void;

  /** Listen for navigation-to-character requests. Returns cleanup function. */
  onNavigateToCharacter: (callback: (charId: number) => void) => () => void;

  /** Listen for voice mode activation. Returns cleanup function. */
  onStartVoiceMode: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
