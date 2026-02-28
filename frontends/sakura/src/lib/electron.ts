/**
 * Electron runtime detection and helpers.
 *
 * These utilities allow the React app to behave differently when
 * running inside Electron vs. a normal browser. The Electron preload
 * script exposes `window.electronAPI` — if it exists, we're in Electron.
 */

/**
 * Check if the app is running inside Electron.
 * Safe to call in any environment — returns false in normal browsers.
 */
export function isElectronApp(): boolean {
  return !!window.electronAPI?.isElectron;
}

/**
 * Check if we're in the pet overlay window.
 * Uses ?pet=1 query param (works with any base path).
 */
export function isPetMode(): boolean {
  return new URLSearchParams(window.location.search).get('pet') === '1';
}

/**
 * Get the Electron API, or null if not in Electron.
 * Prefer this over direct `window.electronAPI` access for type safety.
 */
export function getElectronAPI(): ElectronAPI | null {
  return window.electronAPI ?? null;
}
