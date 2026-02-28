/**
 * Electron Preload Script
 *
 * Exposes a safe, minimal API to the renderer process via contextBridge.
 * The renderer (PetView.tsx) uses these methods for:
 *   - Click-through hit testing (setClickThrough)
 *   - Dragging the pet window (movePetWindow)
 *   - Opening the main app window (openMainWindow)
 *   - Mute state management (setMuted, onMuteChanged)
 *   - Detecting Electron environment (isElectron)
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Whether we're running inside Electron (vs. a normal browser). */
  isElectron: true,

  /**
   * Tell the main process whether to pass mouse clicks through
   * to the app below. Called continuously from the mousemove
   * hit-test loop in PetView.tsx.
   *
   * @param {boolean} shouldPassThrough - true if cursor is over a transparent pixel
   */
  setClickThrough: (shouldPassThrough) => {
    ipcRenderer.send('set-click-through', shouldPassThrough);
  },

  /**
   * Move the pet window by a pixel delta.
   * Used for drag-to-move when the user drags on the character body.
   *
   * @param {number} deltaX - Horizontal movement in pixels
   * @param {number} deltaY - Vertical movement in pixels
   */
  movePetWindow: (deltaX, deltaY) => {
    ipcRenderer.send('move-pet-window', deltaX, deltaY);
  },

  /**
   * Open the full app window (from the pet's speech bubble "Chat" button).
   */
  openMainWindow: () => {
    ipcRenderer.send('open-main-window');
  },

  /**
   * Set the mute state.
   *
   * @param {boolean} muted - Whether the character should be muted
   */
  setMuted: (muted) => {
    ipcRenderer.send('set-muted', muted);
  },

  /**
   * Listen for mute state changes from the main process.
   *
   * @param {(muted: boolean) => void} callback
   * @returns {() => void} Cleanup function to remove the listener
   */
  onMuteChanged: (callback) => {
    const handler = (_event, muted) => callback(muted);
    ipcRenderer.on('mute-changed', handler);
    return () => ipcRenderer.removeListener('mute-changed', handler);
  },

  /**
   * Get the current app state from the main process.
   *
   * @returns {Promise<{petMode: boolean, muted: boolean}>}
   */
  getAppState: () => {
    return ipcRenderer.invoke('get-app-state');
  },

  /**
   * Show a native right-click context menu on the pet window.
   * The main process builds and displays a native OS menu.
   *
   * @param {{ characterName: string, isMuted: boolean }} opts
   */
  showPetContextMenu: (opts) => {
    ipcRenderer.send('show-pet-context-menu', opts);
  },

  /**
   * Show a native OS notification (desktop notification center).
   * Clicking the notification focuses the app and navigates to the character.
   *
   * @param {{ title: string, body: string, charId?: number }} opts
   */
  showNotification: (opts) => {
    ipcRenderer.send('show-notification', opts);
  },

  /**
   * Listen for navigation requests from the main process.
   * Fired when the user clicks a notification or tray menu item.
   *
   * @param {(charId: number) => void} callback
   * @returns {() => void} Cleanup function
   */
  onNavigateToCharacter: (callback) => {
    const handler = (_event, charId) => callback(charId);
    ipcRenderer.on('navigate-to-character', handler);
    return () => ipcRenderer.removeListener('navigate-to-character', handler);
  },

  /**
   * Listen for voice mode activation from the main process.
   * Fired when "Voice Mode" is selected from the pet context menu.
   *
   * @param {(void) => void} callback
   * @returns {() => void} Cleanup function
   */
  onStartVoiceMode: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('start-voice-mode', handler);
    return () => ipcRenderer.removeListener('start-voice-mode', handler);
  },
});
