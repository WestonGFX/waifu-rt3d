/**
 * Discord Rich Presence Integration
 *
 * Shows the active character and activity status in the user's Discord profile.
 * This module is completely opt-in and fails gracefully if:
 *   - The `discord-rpc` package isn't installed
 *   - Discord isn't running
 *   - No application ID is configured
 *
 * To enable:
 *   1. Create a Discord Application at https://discord.com/developers/applications
 *   2. Set the Application ID in Electron settings (stored in electron-store)
 *   3. Enable via the system tray menu checkbox
 *
 * @module discord-rpc
 */

let rpcClient = null;
let isConnected = false;
let currentActivity = {};

/**
 * Initialize Discord RPC with the given application ID.
 * Attempts to connect to Discord's local IPC socket. If Discord isn't
 * running or the ID is invalid, this silently returns false.
 *
 * @param {string} applicationId - Discord Application ID
 * @returns {Promise<boolean>} Whether connection succeeded
 */
async function initDiscordRPC(applicationId) {
  if (!applicationId) return false;
  if (isConnected) return true;

  try {
    // Try to require discord-rpc — it's an optional dependency
    const DiscordRPC = require('discord-rpc');
    DiscordRPC.register(applicationId);

    rpcClient = new DiscordRPC.Client({ transport: 'ipc' });

    rpcClient.on('ready', () => {
      isConnected = true;
      // Apply any pending activity
      if (Object.keys(currentActivity).length > 0) {
        rpcClient.setActivity(currentActivity).catch(() => {});
      }
    });

    rpcClient.on('disconnected', () => {
      isConnected = false;
      rpcClient = null;
    });

    await rpcClient.login({ clientId: applicationId });
    return true;
  } catch {
    // discord-rpc not installed, Discord not running, or connection failed
    rpcClient = null;
    isConnected = false;
    return false;
  }
}

/**
 * Update the Discord Rich Presence activity.
 *
 * @param {Object} opts
 * @param {string} opts.characterName - Name of the active character
 * @param {'chatting' | 'voice' | 'idle' | 'gaming'} opts.activity - Current activity type
 * @param {number} [opts.startTimestamp] - When the activity started (epoch ms)
 */
function updatePresence({ characterName, activity = 'chatting', startTimestamp }) {
  const details = {
    chatting: `Chatting with ${characterName}`,
    voice: `Voice call with ${characterName}`,
    idle: `Hanging out with ${characterName}`,
    gaming: `Playing games with ${characterName}`,
  };

  currentActivity = {
    details: details[activity] || details.chatting,
    state: characterName,
    startTimestamp: startTimestamp || Date.now(),
    largeImageKey: 'app_icon',
    largeImageText: 'Waifu RT3D',
    smallImageKey: activity,
    smallImageText: activity.charAt(0).toUpperCase() + activity.slice(1),
    instance: false,
  };

  if (isConnected && rpcClient) {
    rpcClient.setActivity(currentActivity).catch(() => {});
  }
}

/**
 * Clear the Discord presence and disconnect.
 */
function destroyDiscordRPC() {
  if (rpcClient) {
    try {
      rpcClient.clearActivity();
      rpcClient.destroy();
    } catch {
      // Already disconnected
    }
    rpcClient = null;
    isConnected = false;
    currentActivity = {};
  }
}

/**
 * Check if Discord RPC is currently connected.
 *
 * @returns {boolean}
 */
function isDiscordConnected() {
  return isConnected;
}

module.exports = {
  initDiscordRPC,
  updatePresence,
  destroyDiscordRPC,
  isDiscordConnected,
};
