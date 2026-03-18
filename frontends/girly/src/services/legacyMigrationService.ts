import { loadState } from './storageService.ts';
import {
  appDb,
  bulkPutPersonas,
  bulkPutThreads,
  bulkPutVoiceProfiles,
  getSetting,
  listThreads,
  putSetting,
  replaceMessagesForThread,
} from './appDb.ts';
import { getDefaultPersonaPresets } from './personaPresets.ts';
import { getDefaultVoiceProfiles } from './voiceProfileService.ts';
import { applyRenderProfile, DEFAULT_RENDER_SETTINGS } from './renderProfiles.ts';
import { type ChatThread, type ThreadMessageRecord } from '../types/companion.ts';

const MIGRATION_VERSION = 1;

function createDefaultThread(personaId: string, voiceProfileId: string, now = Date.now()): ChatThread {
  return {
    id: `thread-${now}`,
    title: 'New conversation',
    titleSource: 'timestamp',
    personaId,
    voiceProfileId,
    archived: false,
    createdAt: now,
    updatedAt: now,
    summaryVersion: 0,
    promptSnapshotId: `prompt-${now}`,
  };
}

function deriveThreadTitle(messages: ThreadMessageRecord[]): string {
  const firstUser = messages.find((message) => message.role === 'user');
  if (!firstUser || firstUser.content.trim().length === 0) {
    return 'New conversation';
  }

  const normalized = firstUser.content.trim().replace(/\s+/g, ' ');
  return normalized.length > 42 ? `${normalized.slice(0, 41).trimEnd()}…` : normalized;
}

export async function migrateLegacyStateIfNeeded(): Promise<void> {
  const currentVersion = await getSetting<number>('companion_migration_version');
  if (currentVersion === MIGRATION_VERSION) return;

  const existingThreads = await listThreads();
  if (existingThreads.length > 0) {
    await putSetting('companion_migration_version', MIGRATION_VERSION);
    return;
  }

  const persisted = loadState();
  const now = Date.now();
  const personas = getDefaultPersonaPresets(now);
  const voiceProfiles = getDefaultVoiceProfiles(now);
  const fallbackPersona = personas[0];
  const fallbackVoice = voiceProfiles[0];
  const baseThread = createDefaultThread(fallbackPersona.id, fallbackVoice.id, now);
  const migratedMessages: ThreadMessageRecord[] = (persisted.chatHistory ?? []).map((message) => ({
    ...message,
    threadId: baseThread.id,
  }));

  if (migratedMessages.length > 0) {
    baseThread.title = deriveThreadTitle(migratedMessages);
    baseThread.titleSource = 'heuristic';
    baseThread.updatedAt = migratedMessages[migratedMessages.length - 1]?.timestamp ?? now;
  }

  await appDb.transaction(
    'rw',
    appDb.settings,
    appDb.threads,
    appDb.messages,
    appDb.personas,
    appDb.voiceProfiles,
    async () => {
      await bulkPutPersonas(personas);
      await bulkPutVoiceProfiles(voiceProfiles);
      await bulkPutThreads([baseThread]);
      await replaceMessagesForThread(baseThread.id, migratedMessages);
      await putSetting('current_thread_id', baseThread.id);
      await putSetting('current_persona_id', fallbackPersona.id);
      await putSetting('current_voice_profile_id', fallbackVoice.id);
      await putSetting(
        'render_settings',
        persisted.renderMode === '2d'
          ? applyRenderProfile('balanced')
          : DEFAULT_RENDER_SETTINGS,
      );
      await putSetting('memory_preferences', {
        mode: 'thread-only',
        showUsageHints: true,
        longTermEnabled: false,
      });
      await putSetting('helper_base_url', 'http://127.0.0.1:8765');
      await putSetting('companion_migration_version', MIGRATION_VERSION);
    },
  );
}
