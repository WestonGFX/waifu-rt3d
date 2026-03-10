/**
 * Electron runtime detection and helpers.
 *
 * These utilities allow the React app to behave differently when
 * running inside Electron vs. a normal browser. The Electron preload
 * script exposes `window.electronAPI` — if it exists, we're in Electron.
 */

import type { ElectronAPI } from '../types/electron';

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

/**
 * Open a native file dialog for model import when in Electron.
 * Falls back to null (caller should use browser `<input type="file">`) when
 * not running in Electron.
 *
 * Returns a File object suitable for form uploads, or null if the user
 * cancelled or we're not in Electron.
 *
 * @param type - 'vrm' for VRM models, 'live2d' for Live2D zip archives
 *
 * @example
 * const file = await openNativeFileDialog('vrm');
 * if (file) {
 *   const formData = new FormData();
 *   formData.append('file', file);
 *   await fetch('/api/upload/vrm', { method: 'POST', body: formData });
 * }
 */
export async function openNativeFileDialog(type: 'vrm' | 'live2d'): Promise<File | null> {
  const api = getElectronAPI();
  if (!api?.openFileDialog) return null;

  const result = await api.openFileDialog(type);
  if (!result) return null;

  // Convert base64 back to a File object for FormData upload compatibility
  const binary = atob(result.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const mimeType = type === 'vrm' ? 'model/gltf-binary' : 'application/zip';
  return new File([bytes], result.name, { type: mimeType });
}
