import Dexie, { type Table } from 'dexie';
import {
  type AppSettingRecord,
  type ChatThread,
  type EpisodicMemory,
  type KnowledgeBoundary,
  type MemoryRecord,
  type PersonaProfile,
  type ThreadMessageRecord,
  type ThreadSummaryRecord,
  type TTSVoiceProfile,
} from '../types/companion.ts';
import { type IntimacyStateRecord } from '../types/content.ts';
import { type PsychologyStateRecord } from '../types/psychology.ts';
import { type LorebookEntry } from '../types/lorebook.ts';
import { type MilestoneRecord, type MoodJournalEntry } from '../types/relationship.ts';
import { type CharacterRelationship } from '../types/relationshipWeb.ts';

class AnimeGirlyDb extends Dexie {
  settings!: Table<AppSettingRecord, string>;
  threads!: Table<ChatThread, string>;
  messages!: Table<ThreadMessageRecord, string>;
  personas!: Table<PersonaProfile, string>;
  voiceProfiles!: Table<TTSVoiceProfile, string>;
  threadSummaries!: Table<ThreadSummaryRecord, string>;
  memoryRecords!: Table<MemoryRecord, string>;
  intimacyStates!: Table<IntimacyStateRecord, string>;
  psychologyStates!: Table<PsychologyStateRecord, string>;
  lorebookEntries!: Table<LorebookEntry, string>;
  milestones!: Table<MilestoneRecord, string>;
  moodJournal!: Table<MoodJournalEntry, string>;
  relationships!: Table<CharacterRelationship, string>;
  episodicMemories!: Table<EpisodicMemory, string>;
  knowledgeBoundaries!: Table<KnowledgeBoundary, string>;

  constructor() {
    super('animegirly_companion');

    this.version(1).stores({
      settings: '&id, updatedAt',
      threads: '&id, updatedAt, archived, personaId',
      messages: '&id, threadId, timestamp, role',
      personas: '&id, updatedAt, archetype',
      voiceProfiles: '&id, updatedAt, label',
      threadSummaries: '&threadId, updatedAt',
      memoryRecords: '&id, personaId, threadId, kind, createdAt',
    });

    this.version(2).stores({
      settings: '&id, updatedAt',
      threads: '&id, updatedAt, archived, personaId',
      messages: '&id, threadId, timestamp, role',
      personas: '&id, updatedAt, archetype',
      voiceProfiles: '&id, updatedAt, label',
      threadSummaries: '&threadId, updatedAt',
      memoryRecords: '&id, personaId, threadId, kind, createdAt',
      intimacyStates: '&threadId, personaId',
      psychologyStates: '&threadId, personaId',
    });

    this.version(3).stores({
      settings: '&id, updatedAt',
      threads: '&id, updatedAt, archived, personaId',
      messages: '&id, threadId, timestamp, role',
      personas: '&id, updatedAt, archetype',
      voiceProfiles: '&id, updatedAt, label',
      threadSummaries: '&threadId, updatedAt',
      memoryRecords: '&id, personaId, threadId, kind, createdAt',
      intimacyStates: '&threadId, personaId',
      psychologyStates: '&threadId, personaId',
      lorebookEntries: '&id, personaId, enabled, category, updatedAt',
    });

    this.version(4).stores({
      settings: '&id, updatedAt',
      threads: '&id, updatedAt, archived, personaId',
      messages: '&id, threadId, timestamp, role',
      personas: '&id, updatedAt, archetype',
      voiceProfiles: '&id, updatedAt, label',
      threadSummaries: '&threadId, updatedAt',
      memoryRecords: '&id, personaId, threadId, kind, createdAt',
      intimacyStates: '&threadId, personaId',
      psychologyStates: '&threadId, personaId',
      lorebookEntries: '&id, personaId, enabled, category, updatedAt',
      milestones: '&id, personaId, milestoneDefId, achievedAt',
      moodJournal: '&id, personaId, threadId, date',
    });

    this.version(5).stores({
      settings: '&id, updatedAt',
      threads: '&id, updatedAt, archived, personaId',
      messages: '&id, threadId, timestamp, role',
      personas: '&id, updatedAt, archetype',
      voiceProfiles: '&id, updatedAt, label',
      threadSummaries: '&threadId, updatedAt',
      memoryRecords: '&id, personaId, threadId, kind, createdAt',
      intimacyStates: '&threadId, personaId',
      psychologyStates: '&threadId, personaId',
      lorebookEntries: '&id, personaId, enabled, category, updatedAt',
      milestones: '&id, personaId, milestoneDefId, achievedAt',
      moodJournal: '&id, personaId, threadId, date',
      relationships: '&id, sourcePersonaId, targetPersonaId',
    });

    // v6: Advanced Memory — episodic memories, knowledge boundaries, enhanced memory indexes
    this.version(6).stores({
      settings: '&id, updatedAt',
      threads: '&id, updatedAt, archived, personaId',
      messages: '&id, threadId, timestamp, role',
      personas: '&id, updatedAt, archetype',
      voiceProfiles: '&id, updatedAt, label',
      threadSummaries: '&threadId, updatedAt',
      memoryRecords: '&id, personaId, threadId, kind, createdAt, lastAccessedAt',
      intimacyStates: '&threadId, personaId',
      psychologyStates: '&threadId, personaId',
      lorebookEntries: '&id, personaId, enabled, category, updatedAt',
      milestones: '&id, personaId, milestoneDefId, achievedAt',
      moodJournal: '&id, personaId, threadId, date',
      relationships: '&id, sourcePersonaId, targetPersonaId',
      episodicMemories: '&id, personaId, threadId, createdAt, impactScore',
      knowledgeBoundaries: '&id, personaId, topic, status',
    });
  }
}

export const appDb = new AnimeGirlyDb();

export async function getSetting<T>(id: string): Promise<T | undefined> {
  const record = await appDb.settings.get(id);
  return record?.value as T | undefined;
}

export async function putSetting<T>(id: string, value: T): Promise<void> {
  await appDb.settings.put({
    id,
    value,
    updatedAt: Date.now(),
  });
}

export async function listThreads(): Promise<ChatThread[]> {
  return appDb.threads.orderBy('updatedAt').reverse().toArray();
}

export async function putThread(thread: ChatThread): Promise<void> {
  await appDb.threads.put(thread);
}

export async function deleteThreadCascade(threadId: string): Promise<void> {
  await appDb.transaction(
    'rw',
    appDb.threads,
    appDb.messages,
    appDb.threadSummaries,
    appDb.memoryRecords,
    appDb.intimacyStates,
    appDb.psychologyStates,
    appDb.episodicMemories,
    async () => {
      await appDb.threads.delete(threadId);
      await appDb.messages.where('threadId').equals(threadId).delete();
      await appDb.threadSummaries.where('threadId').equals(threadId).delete();
      await appDb.memoryRecords.where('threadId').equals(threadId).delete();
      await appDb.intimacyStates.delete(threadId);
      await appDb.psychologyStates.delete(threadId);
      await appDb.episodicMemories.where('threadId').equals(threadId).delete();
    },
  );
}

export async function bulkPutThreads(threads: ChatThread[]): Promise<void> {
  if (threads.length === 0) return;
  await appDb.threads.bulkPut(threads);
}

export async function listMessagesForThread(threadId: string): Promise<ThreadMessageRecord[]> {
  return appDb.messages
    .where('threadId')
    .equals(threadId)
    .sortBy('timestamp');
}

export async function replaceMessagesForThread(
  threadId: string,
  messages: ThreadMessageRecord[],
): Promise<void> {
  await appDb.transaction('rw', appDb.messages, async () => {
    await appDb.messages.where('threadId').equals(threadId).delete();
    if (messages.length > 0) {
      await appDb.messages.bulkPut(messages);
    }
  });
}

export async function listPersonas(): Promise<PersonaProfile[]> {
  return appDb.personas.orderBy('updatedAt').reverse().toArray();
}

export async function bulkPutPersonas(personas: PersonaProfile[]): Promise<void> {
  if (personas.length === 0) return;
  await appDb.personas.bulkPut(personas);
}

export async function putPersona(persona: PersonaProfile): Promise<void> {
  await appDb.personas.put(persona);
}

export async function listVoiceProfiles(): Promise<TTSVoiceProfile[]> {
  return appDb.voiceProfiles.orderBy('updatedAt').reverse().toArray();
}

export async function bulkPutVoiceProfiles(voiceProfiles: TTSVoiceProfile[]): Promise<void> {
  if (voiceProfiles.length === 0) return;
  await appDb.voiceProfiles.bulkPut(voiceProfiles);
}

export async function putVoiceProfile(profile: TTSVoiceProfile): Promise<void> {
  await appDb.voiceProfiles.put(profile);
}

export async function listThreadSummariesForThread(threadId: string): Promise<ThreadSummaryRecord[]> {
  return appDb.threadSummaries
    .where('threadId')
    .equals(threadId)
    .sortBy('updatedAt');
}

export async function putThreadSummary(summary: ThreadSummaryRecord): Promise<void> {
  await appDb.threadSummaries.put(summary);
}

export async function deleteThreadSummary(threadId: string): Promise<void> {
  await appDb.threadSummaries.delete(threadId);
}

export async function listMemoryRecords(): Promise<MemoryRecord[]> {
  return appDb.memoryRecords.orderBy('createdAt').reverse().toArray();
}

export async function listMemoryRecordsForPersona(personaId: string): Promise<MemoryRecord[]> {
  return appDb.memoryRecords
    .where('personaId')
    .equals(personaId)
    .reverse()
    .sortBy('createdAt');
}

export async function bulkPutMemoryRecords(records: MemoryRecord[]): Promise<void> {
  if (records.length === 0) return;
  await appDb.memoryRecords.bulkPut(records);
}

export async function putMemoryRecord(record: MemoryRecord): Promise<void> {
  await appDb.memoryRecords.put(record);
}

export async function deleteMemoryRecord(memoryId: string): Promise<void> {
  await appDb.memoryRecords.delete(memoryId);
}

/* ── Intimacy state persistence ── */

export async function getIntimacyState(threadId: string): Promise<IntimacyStateRecord | undefined> {
  return appDb.intimacyStates.get(threadId);
}

export async function putIntimacyState(record: IntimacyStateRecord): Promise<void> {
  await appDb.intimacyStates.put(record);
}

export async function deleteIntimacyState(threadId: string): Promise<void> {
  await appDb.intimacyStates.delete(threadId);
}

/* ── Psychology state persistence ── */

export async function getPsychologyState(threadId: string): Promise<PsychologyStateRecord | undefined> {
  return appDb.psychologyStates.get(threadId);
}

export async function putPsychologyState(record: PsychologyStateRecord): Promise<void> {
  await appDb.psychologyStates.put(record);
}

export async function deletePsychologyState(threadId: string): Promise<void> {
  await appDb.psychologyStates.delete(threadId);
}

/* ── Lorebook entry persistence ── */

export async function listLorebookEntriesForPersona(personaId: string): Promise<LorebookEntry[]> {
  return appDb.lorebookEntries
    .where('personaId')
    .equals(personaId)
    .sortBy('updatedAt');
}

export async function listAllLorebookEntries(): Promise<LorebookEntry[]> {
  return appDb.lorebookEntries.orderBy('updatedAt').reverse().toArray();
}

export async function putLorebookEntry(entry: LorebookEntry): Promise<void> {
  await appDb.lorebookEntries.put(entry);
}

export async function bulkPutLorebookEntries(entries: LorebookEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await appDb.lorebookEntries.bulkPut(entries);
}

export async function deleteLorebookEntry(entryId: string): Promise<void> {
  await appDb.lorebookEntries.delete(entryId);
}

export async function deleteLorebookEntriesForPersona(personaId: string): Promise<void> {
  await appDb.lorebookEntries.where('personaId').equals(personaId).delete();
}

/* ── Milestone persistence ── */

export async function listMilestonesForPersona(personaId: string): Promise<MilestoneRecord[]> {
  return appDb.milestones
    .where('personaId')
    .equals(personaId)
    .sortBy('achievedAt');
}

export async function putMilestone(record: MilestoneRecord): Promise<void> {
  await appDb.milestones.put(record);
}

export async function bulkPutMilestones(records: MilestoneRecord[]): Promise<void> {
  if (records.length === 0) return;
  await appDb.milestones.bulkPut(records);
}

/* ── Mood journal persistence ── */

export async function listMoodJournalForPersona(personaId: string): Promise<MoodJournalEntry[]> {
  return appDb.moodJournal
    .where('personaId')
    .equals(personaId)
    .reverse()
    .sortBy('date');
}

export async function getMoodJournalEntry(id: string): Promise<MoodJournalEntry | undefined> {
  return appDb.moodJournal.get(id);
}

export async function putMoodJournalEntry(entry: MoodJournalEntry): Promise<void> {
  await appDb.moodJournal.put(entry);
}

/* ── Character relationship persistence ── */

export async function listRelationshipsForPersona(personaId: string): Promise<CharacterRelationship[]> {
  const asSource = await appDb.relationships.where('sourcePersonaId').equals(personaId).toArray();
  const asTarget = await appDb.relationships.where('targetPersonaId').equals(personaId).toArray();
  const seen = new Set<string>();
  const results: CharacterRelationship[] = [];
  for (const r of [...asSource, ...asTarget]) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      results.push(r);
    }
  }
  return results;
}

export async function listAllRelationships(): Promise<CharacterRelationship[]> {
  return appDb.relationships.toArray();
}

export async function putRelationship(relationship: CharacterRelationship): Promise<void> {
  await appDb.relationships.put(relationship);
}

export async function deleteRelationship(relationshipId: string): Promise<void> {
  await appDb.relationships.delete(relationshipId);
}

/* ── Episodic memory persistence ── */

export async function listEpisodicMemoriesForPersona(personaId: string): Promise<EpisodicMemory[]> {
  return appDb.episodicMemories
    .where('personaId')
    .equals(personaId)
    .reverse()
    .sortBy('createdAt');
}

export async function putEpisodicMemory(memory: EpisodicMemory): Promise<void> {
  await appDb.episodicMemories.put(memory);
}

export async function bulkPutEpisodicMemories(memories: EpisodicMemory[]): Promise<void> {
  if (memories.length === 0) return;
  await appDb.episodicMemories.bulkPut(memories);
}

export async function deleteEpisodicMemory(memoryId: string): Promise<void> {
  await appDb.episodicMemories.delete(memoryId);
}

/* ── Knowledge boundary persistence ── */

export async function listKnowledgeBoundariesForPersona(personaId: string): Promise<KnowledgeBoundary[]> {
  return appDb.knowledgeBoundaries
    .where('personaId')
    .equals(personaId)
    .sortBy('topic');
}

export async function putKnowledgeBoundary(boundary: KnowledgeBoundary): Promise<void> {
  await appDb.knowledgeBoundaries.put(boundary);
}

export async function bulkPutKnowledgeBoundaries(boundaries: KnowledgeBoundary[]): Promise<void> {
  if (boundaries.length === 0) return;
  await appDb.knowledgeBoundaries.bulkPut(boundaries);
}

export async function deleteKnowledgeBoundary(boundaryId: string): Promise<void> {
  await appDb.knowledgeBoundaries.delete(boundaryId);
}
