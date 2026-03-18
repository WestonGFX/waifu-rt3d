/* ──────────────────────────────────────────────
 * Shared type definitions for AnimeGirly
 * ────────────────────────────────────────────── */

/** Roles in a chat conversation.
 *  - 'user'      – Normal user message.
 *  - 'assistant'  – AI companion response.
 *  - 'director'   – Out-of-character stage direction / story steering note.
 *                   Injected into the LLM prompt as system-level context
 *                   but does NOT trigger an LLM response on its own.
 */
export type MessageRole = 'user' | 'assistant' | 'director';

/** A single message in the chat history. */
export interface ChatMessage {
  /** Unique key for React list rendering. */
  id: string;
  role: MessageRole;
  content: string;
  /** Unix timestamp (Date.now()) – used for ordering and display. */
  timestamp: number;
  /** True while the assistant message is still being populated by a stream. */
  isStreaming?: boolean;
  /** Extracted `<think>` content from the LLM response, if any. */
  thoughts?: string;
  /** IDs of lorebook entries that were activated for this response. */
  activatedLorebookEntryIds?: string[];
}

/** Portable chat message shape used for deep-link sharing. */
export interface SharedChatMessage {
  role: MessageRole;
  content: string;
  timestamp: number;
}

/** Encoded into the URL so another user can import a conversation moment. */
export interface SharedConversationMoment {
  version: 1;
  source: 'animegirly';
  createdAt: number;
  messages: [SharedChatMessage, SharedChatMessage];
}

/** Minimal event set used to measure the share loop locally. */
export type GrowthEventName =
  | 'share_moment_shared'
  | 'shared_moment_imported';

/** Full persisted application state written to localStorage. */
export interface PersistedState {
  chatHistory: ChatMessage[];
  selectedVoiceName: string;
  /** Whether new assistant messages should be read aloud automatically. */
  autoReadAssistant?: boolean;
  /** Persisted desktop settings panel height in pixels. */
  settingsPanelHeight?: number;
  /** Persisted desktop viewer width as a percentage of the desktop app shell. */
  desktopViewerWidthPercent?: number;
  /** Provider config written by the setup wizard. */
  providerConfig: ProviderConfig;
  /** Whether the first-launch setup wizard has been completed. */
  setupComplete: boolean;
  /** User-toggled dev-mode override (separate from the Vite mode flag). */
  devModeEnabled: boolean;
  /** Which viewer renders the avatar: '3d' (Three.js/VRM), '2d' (Canvas 2D), or 'live2d' (PixiJS/Cubism). */
  renderMode: '3d' | '2d' | 'live2d';
  /** Last selected model path or object URL. */
  modelUrl?: string | null;
  /** Last selected Live2D .model3.json path or object URL. */
  live2dModelUrl?: string | null;
  /** Internal avatar tuning for the animation runtime. */
  avatarTuning?: AvatarTuning;
  /** User-facing theme preference for the shell and panels. */
  themePreference?: ThemePreference;
  /** User-facing shell style preference for how panels sit on top of the background. */
  shellStylePreference?: ShellStylePreference;
  /** Which workspace utility trays are visible in the chat workspace. */
  workspacePanelPreferences?: WorkspacePanelPreferences;
  /** Last expanded utility tray in the chat workspace. */
  activeUtilityTray?: UtilityTrayId | null;
  /** Which insight card renders in the top-right of the chat workspace header. */
  headerInsightMode?: HeaderInsightMode;
  /** Internal schema for layout-only persisted UI state. */
  layoutSchemaVersion?: number;
}

export type ThemePreference =
  | 'auto'
  | 'light'
  | 'dark'
  | 'catppuccin-latte'
  | 'catppuccin-mocha'
  | 'catppuccin-frappe'
  | 'tokyo-night'
  | 'dracula';
export type ShellStylePreference = 'floating' | 'fullscreen';
export type UtilityTrayId = 'chats' | 'context' | 'thoughts' | 'settings';
export type HeaderModuleId = 'overview' | 'focus' | 'actions';
export type HeaderInsightMode =
  | 'companion'
  | 'runtime'
  | 'scene'
  | 'actions'
  | 'character'
  | 'hybrid';

export interface HeaderModuleVisibility {
  overview: boolean;
  focus: boolean;
  actions: boolean;
}

export interface WorkspacePanelPreferences {
  chats: boolean;
  context: boolean;
  thoughts: boolean;
  settings: boolean;
  headerModules?: HeaderModuleVisibility;
}

/* ── Provider system types ── */

/**
 * Per-provider extra options persisted alongside the fallback chain.
 * Lets each provider store its own model name / base-URL without
 * polluting the shared CapabilityConfig.
 */
export interface ProviderOptionsBag {
  /** Model identifier, e.g. "gpt-4o-mini", "claude-3-5-haiku-20241022". */
  model?: string;
  /** Custom base-URL override (for self-hosted or proxy endpoints). */
  baseUrl?: string;
  /** Enable model-side tool calling when the provider/model supports it. */
  enableTools?: boolean;
  /** Enable reasoning / thinking mode when the provider/model supports it. */
  enableReasoning?: boolean;
  /** Enable multimodal vision features when the provider/model supports it. */
  enableVision?: boolean;
  /** Effective context window selected for prompt budgeting. */
  contextWindow?: number;
  /** Let AnimeGirly tune context and feature toggles automatically per selected runtime model. */
  autoTune?: boolean;
  /** Keep the selected local runtime model warm in memory when possible. */
  keepModelWarm?: boolean;
  /** Desired Ollama keep-alive duration, e.g. "30m" or "-1". */
  keepAlive?: string;
}

/** Top-level config shape for all capabilities, persisted after wizard. */
export interface ProviderConfig {
  llm:       CapabilityConfig;
  stt:       CapabilityConfig;
  tts:       CapabilityConfig;
  animation: CapabilityConfig;
  /**
   * Per-provider extra options, keyed by provider name.
   * e.g. { openai: { model: "gpt-4o" }, ollama: { model: "llama3.2" } }
   */
  providerOptions?: Record<string, ProviderOptionsBag>;
}

/** Per-capability provider configuration with fallback chain. */
export interface CapabilityConfig {
  /** Name of the primary provider (must match a registered provider). */
  primary: string;
  /** Ordered list of fallback provider names to try on failure. */
  fallbacks: string[];
  /** Conditions under which to fall back to the next provider. */
  fallbackTriggers: FallbackTrigger[];
  /** Milliseconds before a request is considered timed-out and falls back. */
  timeoutMs: number;
}

/** Conditions that trigger a fallback to the next provider in the chain. */
export type FallbackTrigger = 'error' | 'timeout' | 'unsupported';

/* ── LLM provider ── */

/** Options forwarded to an LLM provider's chat method. */
export interface LLMOptions {
  /** Ollama / API model identifier, e.g. "llama3.2". */
  model?: string;
  /** Maximum tokens the model may generate. */
  maxTokens?: number;
}

/** Metrics returned alongside an LLM response (for dev-mode telemetry). */
export interface LLMMetrics {
  /** Wall-clock duration of the request in milliseconds. */
  latencyMs: number;
  /** Total tokens generated (if reported by the provider). */
  totalTokens?: number;
  /** Tokens generated per second (if reported). */
  tokensPerSecond?: number;
}

/* ── STT provider ── */

/** Options passed when starting speech recognition. */
export interface STTOptions {
  /** BCP-47 language code, e.g. "en-US". */
  lang?: string;
}

/* ── TTS provider ── */

/** Options controlling speech synthesis playback. */
export interface TTSOptions {
  /** BCP-47 language code. */
  lang?: string;
  /** Pitch multiplier: 0.1 – 2.0. */
  pitch?: number;
  /** Rate multiplier: 0.1 – 10.0. */
  rate?: number;
}

/** A predefined voice preset shown in the VoiceSelector dropdown. */
export interface VoicePreset {
  /** Unique identifier / key used in ProviderConfig. */
  name: string;
  /** Human-readable label displayed in the UI. */
  label: string;
  /** Default TTS options for this preset. */
  options: TTSOptions;
}

/* ── Animation provider ── */

export type AvatarPhase =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'reacting'
  | 'settling';

export type AvatarEmotion =
  | 'neutral'
  | 'warm'
  | 'excited'
  | 'shy'
  | 'playful'
  | 'thoughtful';

export type AvatarGesture =
  | 'none'
  | 'nod'
  | 'handToHeart'
  | 'handToCheek'
  | 'wave'
  | 'point';

export type AvatarGazeMode = 'camera' | 'soft' | 'down' | 'side';

export type AvatarReaction =
  | 'none'
  | 'softSmile'
  | 'giggle'
  | 'surprised'
  | 'bashful';

export type AvatarIdleStyle = 'neutral' | 'cozy' | 'bashful' | 'curious';

export type AvatarMetadataSource = 'system' | 'inline' | 'fallback';

export interface AvatarPerformanceMetadata {
  emotion: AvatarEmotion;
  energy: number;
  intimacy: number;
  gesture: AvatarGesture;
  gaze: AvatarGazeMode;
  talkIntensity: number;
  reaction: AvatarReaction;
  idle: AvatarIdleStyle;
  sceneBeat?: string;
}

export interface AvatarTuning {
  baselineMood: number;
  animationIntensity: number;
  talkiness: number;
  gazeStrength: number;
  gestureFrequency: number;
  style: 'sweet' | 'playful' | 'cool';
}

export interface AvatarRuntimeState extends AvatarPerformanceMetadata {
  phase: AvatarPhase;
  moodCarry: number;
  metadataSource: AvatarMetadataSource;
  lastAssistantText: string;
  lastUserText: string;
  phaseStartedAt: number;
  lastUpdatedAt: number;
  speechPlaybackActive: boolean;
  speechStartedAt: number | null;
  speechUntil: number | null;
  reactionUntil: number | null;
  settleUntil: number | null;
  debugLabel: string;
}

/** Context fed into the animation provider when generating a clip. */
export interface AnimationContext {
  message: string;
  metadata: AvatarPerformanceMetadata;
  phase: AvatarPhase;
  moodCarry: number;
  speechPlaybackActive: boolean;
  tuning: AvatarTuning;
}

/* ── Dev-mode telemetry ── */

/** Live metrics snapshot exposed to DevModePanel. */
export interface DevMetrics {
  /** Most recent frame's FPS (instantaneous). */
  currentFps: number;
  /** Average FPS over the last 60 rendered frames. */
  averageFps: number;
  /** Latency of the most recent LLM request in ms. */
  lastLlmLatencyMs: number;
  /** Token metrics from the most recent LLM response. */
  lastLlmTokens?: number;
  /** Names of the currently-active providers per capability. */
  activeProviders: Record<string, string>;
}
