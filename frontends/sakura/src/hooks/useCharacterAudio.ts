import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { useViewerStore } from '../stores/viewerStore';

/**
 * Post a message to the viewer iframe's CharacterAudioEngine.
 *
 * Uses the same origin-restricted postMessage pattern as viewerStore.
 * Messages are silently dropped if the iframe isn't mounted yet.
 *
 * @param msg - Payload fields merged with `{ type: 'characterAudio' }`
 */
function postAudio(msg: Record<string, unknown>): void {
  const iframe = useViewerStore.getState().iframeRef;
  iframe?.contentWindow?.postMessage(
    { type: 'characterAudio', ...msg },
    window.location.origin,
  );
}

/**
 * Reads a config value with a typed default, using the same nested-key
 * convention as SettingsView's `cfg()` helper.
 *
 * @param config - The appStore config object
 * @param key - Dot-separated key (e.g. 'character_audio.enabled')
 * @param fallback - Default if the key is missing
 * @returns The config value or the fallback
 */
function cfgGet(config: Record<string, unknown>, key: string, fallback: unknown): unknown {
  const parts = key.split('.');
  if (parts.length === 2) {
    const parent = config[parts[0]] as Record<string, unknown> | undefined;
    return parent?.[parts[1]] ?? fallback;
  }
  return config[key] ?? fallback;
}

/**
 * Watches the appStore config for `character_audio.*` keys and pushes
 * changes to the viewer.html CharacterAudioEngine via postMessage.
 *
 * Settings are persisted by SettingsView through the backend config API
 * (app.json), so this hook doesn't manage its own storage — it simply
 * bridges config → viewer postMessage.
 *
 * Also listens for `characterTouch` events from the viewer for future
 * React-side effects (the sound itself plays in the viewer).
 *
 * Mount once in a component that lives alongside the viewer iframe
 * (e.g. ChatThread).
 *
 * @example
 * // In ChatThread.tsx:
 * useCharacterAudio();
 */
export function useCharacterAudio(): void {
  const config = useAppStore((s) => s.config);

  const enabled = cfgGet(config, 'character_audio.enabled', false) === true;
  const volume = Number(cfgGet(config, 'character_audio.volume', 0.15));
  const breathing = cfgGet(config, 'character_audio.breathing', true) !== false;
  const vocals = cfgGet(config, 'character_audio.vocals', true) !== false;
  const interaction = cfgGet(config, 'character_audio.interaction', true) !== false;

  const prevEnabled = useRef(false);

  // Sync enabled state to viewer
  useEffect(() => {
    if (enabled && !prevEnabled.current) {
      postAudio({ action: 'enable' });
      postAudio({ action: 'setVolume', volume });
      postAudio({ action: 'setLayers', breathing, vocals, interaction });
    } else if (!enabled && prevEnabled.current) {
      postAudio({ action: 'disable' });
    }
    prevEnabled.current = enabled;
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync volume changes
  useEffect(() => {
    if (enabled) postAudio({ action: 'setVolume', volume });
  }, [volume, enabled]);

  // Sync layer toggles
  useEffect(() => {
    if (enabled) postAudio({ action: 'setLayers', breathing, vocals, interaction });
  }, [breathing, vocals, interaction, enabled]);
}
