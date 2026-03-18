import { type ChatMessage, type ThemePreference } from './index.ts';
import {
  type ContentRatingLevel,
  type SensoryWritingConfig,
} from './content.ts';
import {
  type BehavioralRule,
  type CanonConstraint,
  type DereWeightEntry,
  type PhaseTransitionThresholds,
  type RelationshipPhase,
  type TriggerMapEntry,
} from './psychology.ts';

export type SettingsTab =
  | 'general'
  | 'voice'
  | 'rendering'
  | 'rooms'
  | 'models'
  | 'memory'
  | 'persona'
  | 'content'
  | 'lorebook'
  | 'usage'
  | 'relationships'
  | 'gallery'
  | 'themes'
  | 'backup'
  | 'advanced';

export type RenderProfileId =
  | 'battery-saver'
  | 'balanced'
  | 'smooth'
  | 'max-fidelity';

export interface RenderSettings {
  profile: RenderProfileId;
  fpsCap: 30 | 45 | 60 | 120;
  pixelRatioCap: 0.75 | 1 | 1.25 | 1.5 | 2;
  antialias: boolean;
  orbitSensitivity: number;
  lipSyncQuality: 'low' | 'balanced' | 'high';
  animationQuality: 'low' | 'balanced' | 'high';
  hidden2DModeEnabled: false;
}

export type PersonaArchetype =
  | 'deredere'
  | 'tsundere-lite'
  | 'kuudere'
  | 'dandere'
  | 'genki'
  | 'onee-san'
  | 'custom';

export type DereType =
  | 'deredere'
  | 'tsundere'
  | 'kuudere'
  | 'dandere'
  | 'yandere-lite'
  | 'genki'
  | 'onee-san'
  | 'ojou'
  | 'bokukko'
  | 'himedere'
  | 'mayadere'
  | 'sadodere'
  | 'dorodere'
  | 'nyandere'
  | 'tennen'
  | 'goudere';

export interface PersonaProfile {
  id: string;
  name: string;
  archetype: PersonaArchetype;
  dereTypes: DereType[];
  tagline: string;
  shortBio: string;
  backstory: string;
  characterFacts: string[];
  worldSetting: string;
  relationshipPremise: string;
  toneGuide: string;
  initiativeLevel: number;
  affectionLevel: number;
  flirtLevel: number;
  memoryPriorities: string[];
  generatedSystemPrompt: string;
  rawPromptOverride?: string;
  defaultVoiceProfileId?: string;
  themePreference?: ThemePreference;

  /** Per-persona content and intimacy configuration. */
  contentConfig?: {
    /** Maximum content rating this persona will produce. */
    contentCeiling: ContentRatingLevel;
    /** Sensory writing style preferences. */
    sensoryWriting: SensoryWritingConfig;
    /** How this character behaves in intimate moments. */
    intimacyPersonality: string;
    /** Body description for physical scene awareness. */
    physicalDescription?: string;
    /** Voice pattern shift during intimate scenes, e.g. "drops to a whisper". */
    intimateVoiceShift?: string;
  };

  /** Per-persona psychology engine configuration. */
  psychologyConfig?: {
    /** Conditional behavioral rules evaluated each turn. */
    behavioralRules: BehavioralRule[];
    /** Pattern-based behavioral mode triggers. */
    triggerMap: TriggerMapEntry[];
    /** Immutable character facts the AI must respect. */
    canonConstraints: CanonConstraint[];
    /** Dere-type blend weights with phase modifiers. */
    dereWeights: DereWeightEntry[];
    /** Starting relationship phase for new threads. */
    initialPhase: RelationshipPhase;
    /** Score thresholds for relationship phase transitions. */
    phaseTransitionThresholds: PhaseTransitionThresholds;
  };

  createdAt: number;
  updatedAt: number;
}

export type TTSMode = 'local-only' | 'cloud-only' | 'hybrid';

export interface TTSProviderRef {
  providerId: string;
  modelId?: string;
  voiceId?: string;
}

export interface TTSVoiceProfile {
  id: string;
  label: string;
  mode: TTSMode;
  primary: TTSProviderRef;
  fallbacks: TTSProviderRef[];
  playbackRate: number;
  playbackGainDb: number;
  chunkingMode: 'sentence' | 'paragraph' | 'provider-default';
  providerSettings: Record<string, Record<string, string | number | boolean>>;
  defaultForPersonaIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatThread {
  id: string;
  title: string;
  titleSource: 'manual' | 'llm' | 'heuristic' | 'timestamp';
  personaId: string;
  voiceProfileId: string;
  avatarModelId?: string;
  environmentId?: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  summaryVersion: number;
  promptSnapshotId: string;
}

export interface EnvironmentCreditRecord {
  title: string;
  author?: string;
  license?: string;
  sourceUrl?: string;
  notes?: string;
}

export interface SceneAnchor {
  id: string;
  position: [number, number, number];
  rotationY: number;
  pose: 'stand' | 'sit' | 'lean';
  personaBiasTags: string[];
}

export interface SceneHotspot {
  id: string;
  position: [number, number, number];
  lookAt: [number, number, number];
  label: string;
  curiosityWeight: number;
  tags: string[];
}

export interface EnvironmentSceneMetadata {
  anchors: SceneAnchor[];
  hotspots: SceneHotspot[];
  lookTargets: Array<{
    id: string;
    position: [number, number, number];
    label: string;
  }>;
  walkBounds?: {
    min: [number, number];
    max: [number, number];
  };
  collisionMeshes?: string[];
  credits?: EnvironmentCreditRecord[];
  baseFloorYOverride?: number;
  spawnOffsetY?: number;
  cameraPreset?: {
    position: [number, number, number];
    target: [number, number, number];
    freeLookSpawn?: [number, number, number];
    fov?: number;
  };
  roamPreset?: 'calm' | 'balanced' | 'curious';
  roamEnabled?: boolean;
}

export interface EnvironmentSceneProfile {
  id: string;
  name: string;
  url: string;
  source: 'local-library' | 'bundled';
  category: 'bedroom' | 'living-room' | 'office' | 'classroom' | 'sci-fi' | 'interior' | 'unknown';
  recommended: boolean;
  license?: string;
  author?: string;
  sourceUrl?: string;
  defaultSpawnId?: string;
  metadataPath?: string;
  creditsPath?: string;
  credits?: EnvironmentCreditRecord[];
}

export type RoomMode =
  | 'none'
  | 'settling'
  | 'waiting'
  | 'looking'
  | 'inspecting'
  | 'walking'
  | 'speaking';

export interface RoomRuntimeState {
  roomMode: RoomMode;
  currentAnchorId?: string | null;
  targetAnchorId?: string | null;
  currentHotspotId?: string | null;
  familiarity: number;
  environmentName?: string | null;
}

export interface ThreadMessageRecord extends ChatMessage {
  threadId: string;
  /** Per-message emotion signal computed after streaming completes. */
  emotionSignal?: { label: string | null; confidence: number };
}

export interface ThreadSummaryRecord {
  threadId: string;
  summaryVersion: number;
  summaryText: string;
  relationshipState: string;
  unresolvedTopics: string[];
  notablePreferences: string[];
  updatedAt: number;
}

export interface MemoryRecord {
  id: string;
  personaId: string;
  threadId: string;
  kind: 'preference' | 'fact' | 'relationship' | 'world' | 'boundary' | 'callback';
  text: string;
  salience: number;
  confidence: number;
  createdAt: number;
  lastUsedAt?: number;
  sourceMessageIds: string[];
  /** Semantic embedding vector (768-dim from nomic-embed-text). Null when embeddings unavailable. */
  embedding?: number[];
  /** Number of times this memory has been retrieved for prompt injection. */
  usageCount?: number;
  /** Which embedding model created the embedding (e.g. 'nomic-embed-text'). */
  embeddingModel?: string;
  /** Emotion tags associated with the memory's source conversation. */
  emotionTags?: string[];
  /** Significance score in [0, 10], used by consolidation. */
  impactScore?: number;
  /** Timestamp of last retrieval for prompt injection. */
  lastAccessedAt?: number;
  /** Decay factor in [0, 1] applied by consolidation (0 = fully decayed). */
  decayFactor?: number;
  /** IDs of memories this record was consolidated from (audit trail). */
  consolidatedFrom?: string[];
  /** IDs of memory records that contradict this one. */
  contradicts?: string[];
  /** Origin of the memory: user said it, assistant inferred it, or director injected it. */
  knowledgeSource?: 'user-stated' | 'assistant-inferred' | 'director-injected';
}

/**
 * A significant emotional moment captured from a conversation, forming
 * the companion's episodic memory. These are richer than MemoryRecords
 * and are retrieved by emotional resonance rather than keyword match.
 */
export interface EpisodicMemory {
  id: string;
  personaId: string;
  threadId: string;
  /** Human-readable description of what happened. */
  event: string;
  /** Emotions experienced during this moment (e.g. 'happy', 'nervous'). */
  emotionTags: string[];
  /** Significance in [0, 10]; higher = more likely to be retrieved. */
  impactScore: number;
  /** People involved (e.g. 'user', persona name). */
  participants: string[];
  /** Semantic embedding of the event description. */
  embedding?: number[];
  /** Which embedding model created the embedding. */
  embeddingModel?: string;
  /** IDs of the messages that contributed to this moment. */
  sourceMessageIds: string[];
  createdAt: number;
  /** When this memory was last referenced in a prompt. */
  lastReferencedAt?: number;
  /** How many times this memory has been injected into prompts. */
  referenceCount: number;
}

/**
 * Tracks what the companion knows or doesn't know about a topic,
 * preventing hallucinated knowledge and encouraging natural follow-up questions.
 */
export interface KnowledgeBoundary {
  /** Composite key: `${personaId}:${topic}`. */
  id: string;
  personaId: string;
  /** Normalised topic label (e.g. 'user_name', 'user_job', 'pet_name'). */
  topic: string;
  /** Current knowledge status. */
  status: 'known' | 'unknown' | 'partially-known';
  /** Supporting evidence text (the fact or partial fact). */
  evidence?: string;
  updatedAt: number;
}

export interface AppSettingRecord<T = unknown> {
  id: string;
  value: T;
  updatedAt: number;
}

export interface HelperHealth {
  ok: boolean;
  version: string;
  runtimes: Record<string, 'online' | 'offline'>;
  message?: string;
  checkedAt: number;
}

export interface LocalProviderCapability {
  providerId: 'kokoro' | 'piper';
  runtimeAvailable: boolean;
  installed: boolean;
  available: boolean;
  bootstrapRequired: boolean;
  reason?: string | null;
}

export interface HelperCapabilities {
  helperPythonVersion: string;
  recommendedPython: string;
  bootstrapScriptPath: string;
  recommendedBootstrapCommand: string;
  pythonCandidates: string[];
  voice: {
    localOnly: boolean;
    cloudOnly: boolean;
    hybrid: boolean;
  };
  llmRuntimes: string[];
  memory: {
    threadSummaries: boolean;
    longTerm: string;
  };
  localProviders: LocalProviderCapability[];
  system: {
    machineModel?: string | null;
    chip?: string | null;
    totalMemoryBytes?: number | null;
    metalDeviceName?: string | null;
    recommendedMaxWorkingSetBytes?: number | null;
    hasUnifiedMemory?: boolean | null;
    gpuName?: string | null;
    vramBytes?: number | null;
    cpuCores?: number | null;
    diskFreeBytes?: number | null;
    platform?: string | null;
  };
}

export interface ProviderSecretStatus {
  stored: boolean;
  backend: string;
}

export interface SecretStatusResponse {
  elevenlabs: ProviderSecretStatus;
}

export interface RuntimeStatus {
  id: 'ollama' | 'lmstudio';
  label: string;
  online: boolean;
  baseUrl?: string;
  modelCount: number;
  loadedModelIds: string[];
  activeModelId?: string | null;
  models: RuntimeModelInfo[];
  message: string;
  canWarmModels?: boolean;
}

export interface RuntimeModelInfo {
  id: string;
  family?: string;
  parameterSize?: string;
  quantizationLevel?: string;
  contextWindow?: number;
  modifiedAt?: string;
  loaded: boolean;
  capabilities: string[];
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
}

export interface TTSProviderDescriptor {
  providerId: string;
  label: string;
  local: boolean;
  requiresInstall: boolean;
  requiresApiKey: boolean;
  supportsStreaming: boolean;
  supportsPreview: boolean;
  recommended: boolean;
  qualityTier: 'starter' | 'balanced' | 'premium' | 'experimental' | 'legacy';
  available: boolean;
  installState: 'installed' | 'not-installed' | 'runtime-missing' | 'cloud' | 'legacy';
  docsUrl?: string;
}

export interface TTSVoiceDescriptor {
  id: string;
  providerId: string;
  label: string;
  language: string;
  gender: 'female' | 'male' | 'unknown';
  previewText?: string;
}

export interface ModelCatalogEntry {
  id: string;
  family: string;
  type: 'tts' | 'stt' | 'llm' | 'motion' | 'avatar' | 'voice-clone';
  source: 'curated' | 'huggingface-import' | 'runtime-discovered';
  local: boolean;
  requiresInstall: boolean;
  requiresApiKey: boolean;
  languages: string[];
  voiceStyle: 'female' | 'male' | 'mixed' | 'n/a';
  qualityTier: 'starter' | 'balanced' | 'premium' | 'experimental';
  installSizeMb?: number;
  minRamGb?: number;
  minVramGb?: number;
  license?: string;
  docsUrl?: string;
  recommended: boolean;
  summary: string;
  description?: string;
  huggingfaceId?: string;
  accuracy?: 'basic' | 'good' | 'great' | 'excellent';
  installed?: boolean;
}

export interface STTProviderDescriptor {
  providerId: string;
  label: string;
  local: boolean;
  requiresInstall: boolean;
  available: boolean;
  qualityTier: 'starter' | 'balanced' | 'premium' | 'experimental';
  installState: 'installed' | 'not-installed' | 'runtime-missing' | 'cloud' | 'legacy';
  recommended: boolean;
  docsUrl?: string;
  activeModel?: string;
}

export interface DiskUsageEntry {
  modelId: string;
  type: string;
  sizeBytes: number;
}

export interface DiskUsageResponse {
  totalBytes: number;
  byType: Record<string, number>;
  models: DiskUsageEntry[];
}

export interface HelperJobRecord {
  jobId: string;
  kind: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  progress: number;
  message: string;
  createdAt: number;
  updatedAt: number;
  payloadHash?: string;
  resultRef?: string;
  errorCode?: string;
  errorDetail?: string;
}

export interface MemoryPreferences {
  mode: 'disabled' | 'thread-only' | 'thread-and-long-term';
  showUsageHints: boolean;
  longTermEnabled: boolean;
}

export interface CompanionSnapshot {
  threads: ChatThread[];
  currentThreadId: string | null;
  messagesByThread: Record<string, ChatMessage[]>;
  summariesByThread: Record<string, ThreadSummaryRecord[]>;
  memoryRecords: MemoryRecord[];
  personas: PersonaProfile[];
  currentPersonaId: string;
  voiceProfiles: TTSVoiceProfile[];
  currentVoiceProfileId: string;
  renderSettings: RenderSettings;
  memoryPreferences: MemoryPreferences;
}
