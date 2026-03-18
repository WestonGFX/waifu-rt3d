/**
 * tauriPetService – Desktop pet window management via Tauri v2 IPC.
 *
 * All Tauri API calls are dynamically imported so the web build continues
 * to work without Tauri installed. Every public function is a no-op when
 * running outside the Tauri webview shell.
 */

/** Whether the app is running inside a Tauri webview. */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Detects if the current window was opened in pet mode.
 * Pet mode is signaled via a `?pet=1` query parameter in the URL.
 *
 * @returns True when the current window is the pet overlay.
 */
export function isPetModeWindow(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('pet') === '1';
}

/**
 * Opens the desktop pet window via a Tauri IPC command.
 * If already open, the existing window receives focus.
 *
 * @throws Error when the Tauri invoke call fails.
 */
export async function openPetWindow(): Promise<void> {
  if (!isTauriEnvironment()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_pet_window');
}

/**
 * Closes the desktop pet window if it is open.
 *
 * @throws Error when the Tauri invoke call fails.
 */
export async function closePetWindow(): Promise<void> {
  if (!isTauriEnvironment()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('close_pet_window');
}

/**
 * Toggles the always-on-top property of the pet window.
 *
 * @param onTop - Whether the pet window should float above other windows.
 * @throws Error when the Tauri invoke call fails.
 */
export async function setPetAlwaysOnTop(onTop: boolean): Promise<void> {
  if (!isTauriEnvironment()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_pet_always_on_top', { onTop });
}

/**
 * Initiates a native window drag on the pet window.
 * Call this from a mousedown/pointerdown handler on the pet drag area.
 *
 * @throws Error when the Tauri invoke call fails.
 */
export async function startPetDrag(): Promise<void> {
  if (!isTauriEnvironment()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('start_pet_drag');
}
