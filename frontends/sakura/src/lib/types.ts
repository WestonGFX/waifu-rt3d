export type MessageRole = 'user' | 'assistant' | 'system' | 'director';
export type MessageStatus = 'pending' | 'streaming' | 'sent' | 'failed' | 'timeout';

export interface Character {
  id: number;
  name: string;
  system_prompt: string;
  avatar_url?: string;
  voice_id?: string;
  tts_provider?: string;
  model_type?: string;
  model_vrm?: string;
  vrm_model_url?: string;
  live2d_model?: string;
  background_url?: string;
  background_mode?: string;
  greeting_message?: string;
  llm_endpoint?: string;
  llm_model?: string;
  llm_temperature?: number;
  animation_profile?: {
    energy: number;
    confidence: number;
    nervousness: number;
    expressiveness: number;
    playfulness: number;
  };
  capability_profile?: string;
  /**
   * Feature H: Per-emotion TTS voice overrides.
   * JSON string mapping emotion names to voice IDs, e.g.
   * `'{"happy": "af_sky", "sad": "bm_lewis"}'`.
   * When present and the character expresses a mapped emotion, the
   * specified voice is used instead of the default `voice_id`.
   */
  emotion_voice_overrides?: string | null;
  /**
   * Feature #6: AI-generated (or manually written) character backstory.
   * Stored in the `backstory` column on the characters table (schema v20).
   */
  backstory?: string | null;
  /**
   * Feature #29: When true the scheduler skips all proactive messages for this
   * character. Stored in the `day_off` column on the characters table (schema v21).
   */
  day_off?: boolean;
  /**
   * Feature #23: Universe / Shared World Builder.
   * ID of the universe this character belongs to, or undefined/null when the
   * character has no universe assignment (schema v22).
   */
  universe_id?: number | null;
  /**
   * Feature A4: Whether time-of-day mood injection is active for this character.
   * When true the MoodEngine prepends a tonal directive to the system prompt
   * based on the current time slot (morning/afternoon/evening/night/late_night).
   * Stored in the `mood_enabled` column on the characters table (schema v23).
   */
  mood_enabled?: boolean;
  /**
   * Feature A4: 0.0--1.0 scale factor controlling mood prefix strength.
   * At 0 mood is effectively disabled; at 1.0 all modifiers (tone hints,
   * affinity, session gap) are included. Stored in the `mood_intensity`
   * column on the characters table (schema v23).
   */
  mood_intensity?: number;
  /** Feature C4: When true, shows a contextual LLM-generated greeting on character load (schema v24). */
  greeting_enabled?: boolean;
  /** Feature C4: 0.0–1.0 controls greeting length/depth (schema v24). */
  greeting_intensity?: number;
  /** Feature A7: Path to uploaded voice sample for cloning-capable TTS providers. */
  voice_sample_path?: string;
  /**
   * Phase 15: Emotion portrait display mode.
   * 0 = off (static avatar everywhere), 1 = chat bubbles only,
   * 2 = chat bubbles + sidebar emotion indicator.
   * Stored in `emotion_portraits_mode` column (schema v31).
   */
  emotion_portraits_mode?: number;
  /** 3D Pipeline: URL/path to a GLB/GLTF 3D model (schema v33). */
  glb_model_url?: string;
  /** 3D Pipeline: URL/path to a Unity WebGL scene (schema v33). */
  unity_scene_url?: string;
  /** Optional greeting animation gesture played after walk-on entrance. */
  greeting_animation?: string;
  /** B.3: Entrance animation style (walk | run | jump | fade | teleport). Schema v34. */
  entrance_style?: string;
  /** B.3: Exit animation style (walk | fade | teleport). Schema v34. */
  exit_style?: string;
  /**
   * v36: Relative path to the character's markdown bible file.
   * When `bible_enabled` is true, selected sections are injected into the
   * system prompt for deeper persona context.
   */
  bible_path?: string | null;
  /** v36: Toggle for bible section injection into the system prompt. */
  bible_enabled?: boolean;
  /**
   * v36: JSON list of section numbers to inject from the bible (e.g. `[2,3,4]`).
   * When null, all sections except 0 (card recap) and 10 (prompt pack) are used.
   */
  bible_sections?: number[] | null;
  /**
   * Proactive messaging: when true the scheduler is allowed to send unprompted
   * messages for this character. Stored in the `proactive_enabled` column.
   */
  proactive_enabled?: boolean;
  /**
   * Proactive messaging: frequency preset controlling how often the scheduler
   * enqueues messages. One of `'quiet'`, `'normal'`, or `'chatty'`.
   * Stored in the `proactive_frequency` column.
   */
  proactive_frequency?: string;
  /**
   * Proactive messaging: active hour window expressed as `"start-end"`,
   * e.g. `"9-22"`. Messages are only scheduled within this window.
   * Stored in the `proactive_hours` column.
   */
  proactive_hours?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Feature #23: Universe / Shared World Builder.
 * A named narrative universe that groups characters under a shared lore document.
 * The lore text is automatically prepended to every member character's system
 * prompt so they all share consistent world knowledge.
 */
export interface Universe {
  /** Universe primary key. */
  id: number;
  /** Display name shown in the UI. */
  name: string;
  /** Lore document injected into member characters' system prompts. */
  lore: string;
  /** ISO datetime string of when the universe was created. */
  created_at: string;
  /** Number of characters currently assigned to this universe. */
  character_count: number;
}

/**
 * Feature A6: A single lore/world-info entry.
 * Attached to a character and injected into the LLM context when
 * trigger keywords appear in recent conversation messages.
 */
/** Feature C3: A user fact learned or entered about the human user. */
export interface UserFact {
  id: number;
  /** FK to the owning character (each char has its own user profile). */
  character_id: number;
  /** identity | preferences | history | relationship | general */
  category: 'identity' | 'preferences' | 'history' | 'relationship' | 'general';
  /** The fact as a short plain-text string. */
  fact_text: string;
  /** 'auto' = AI-extracted, 'manual' = user-entered */
  source: 'auto' | 'manual';
  /** 0.0–1.0 confidence; manual entries default to 1.0 */
  confidence: number;
  created_at: string;
}

export interface LoreEntry {
  /** Primary key. */
  id: number;
  /** FK to the owning character. */
  character_id: number;
  /** Short descriptive title for the entry. */
  title: string;
  /** The lore text injected into the LLM context. */
  content: string;
  /** JSON array of trigger keywords. */
  keywords: string[];
  /** Where in the message list to inject this entry. */
  injection_position: 'before_system_prompt' | 'after_system_prompt' | 'before_last_message' | 'after_last_2_messages';
  /** Higher priority entries are injected first. */
  priority: number;
  /** Whether this entry is active. */
  enabled: boolean;
  /** ISO datetime string of when the entry was created. */
  created_at?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: number;
  status: MessageStatus;
  serverMessageId?: number;
  emotion?: string;
  gesture?: string;
  audioUrl?: string;
  /** URL of an image generated by the agent's generate_image tool. */
  imageUrl?: string;
  /**
   * Resolved prompt used to generate `imageUrl` (positive_prefix + user prompt).
   * Captured from the `tool_result` SSE event so the user can regenerate the
   * image in place. Lives only in the Zustand store; not persisted.
   */
  imagePrompt?: string;
  tokens?: number;
  tokensPerSecond?: number;
  latencyMs?: number;
  model?: string;
  /**
   * Dialogue-choice options from Feature E.  When present, the frontend renders
   * interactive choice buttons instead of the free-text composer for this turn.
   */
  choices?: string[];
  /**
   * Feature #10: Whether this message has been pinned by the user.
   * Stored on the messages table (schema v20). Defaults to false.
   */
  pinned?: boolean;
  /**
   * Lifecycle stage during generation, derived from SSE events:
   *   - 'processing'  → backend is assembling context / model is in prefill
   *   - 'generating'  → first token has arrived, streaming in progress
   * Cleared (undefined) once status flips to 'sent' or 'failed'. Used by the
   * thinking-indicator stages mode to render Reading/Thinking/Generating rows.
   */
  stage?: 'processing' | 'generating';
  /**
   * AI-generated context-aware reply suggestions (3 short strings) shipped
   * inline with the assistant reply via the `quick_replies` SSE event. The
   * backend extracts them from a `<quick_replies>` block in the model output
   * before emitting the final text. Replaces the old two-phase chip-generation
   * architecture (regex heuristic + post-hoc LLM upgrade).
   */
  quickReplies?: string[];
  /** Unix-ms timestamp of most recent edit. Undefined if never edited. */
  editedAt?: number;
  /** Server-side audit log of prior versions. Not surfaced in UI in MVP. */
  editHistory?: { ts: number; prevContent: string }[];
  /** M3-item16: URL of a TTS audio file generated for this message (voice messages). */
  voiceMessageUrl?: string;
  /** Original user text stored on a timed-out assistant message so the retry action can re-send it. */
  retryText?: string;
  /** Emoji reactions added by the user. Array of emoji strings e.g. ["👍", "❤️"]. */
  reactions?: string[];
}

export interface Session {
  id: number;
  character_id: number;
  title?: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
  /**
   * Feature #9: User-defined tags for categorising a session (e.g. "roleplay", "fluff").
   * Returned by GET /api/sessions and persisted via PATCH /api/sessions/{id}/tags.
   */
  tags?: string[];
}

export interface ChatResponse {
  ok: boolean;
  reply: string;
  audio: string | null;
  session_id: number;
  emotion?: string;
  intensity?: number;
  gesture?: string | null;
  user_message_id?: number;
  assistant_message_id?: number;
  tokens_used?: number;
  tokens_per_second?: number;
  ttft_ms?: number;
  model?: string;
}

export interface AppConfig {
  [key: string]: unknown;
}

export interface VoiceEntry {
  id: string;
  engine: string;
  name: string;
  language: string;
  gender: string;
  description: string;
  installed?: boolean;
}

/** Hardware requirements for a TTS engine. */
export interface TTSRequirements {
  min_ram: number;
  min_vram: number;
  gpu_required: boolean;
  accelerators: string[];
  note: string;
}

/** Setup instructions for installing a TTS engine. */
export interface TTSSetup {
  docker?: string;
  pip?: string;
  docs_url?: string;
}

/** Feature flags for a TTS engine. */
export interface TTSFeatures {
  voice_cloning: boolean;
  nonverbal_sounds: boolean;
  streaming: boolean;
  emotion_control: boolean;
}

export interface TTSModel {
  id: string;
  engine: string;
  name: string;
  language: string;
  gender: string;
  description: string;
  size_mb: number;
  voice_id: string;
  sample_url: string | null;
  tags: string[];
  installed: boolean;
  installed_at?: string;
  quality_stars?: number;
  speed_stars?: number;
  requirements?: TTSRequirements;
  setup?: TTSSetup;
  features?: TTSFeatures;
}

export interface TTSModelsResponse {
  models: TTSModel[];
  catalog_updated: string;
  total_installed_mb: number;
}

export interface VocabEntry {
  eg_id: string;
  term: string;
  meaning: string;
  category: string;
  register: string;
  emotion: string;
  pos: string;
  language: string;
  aliases: string[];
  _source: 'base' | 'user';
}

export interface DownloadProgress {
  model_id: string;
  status: 'downloading' | 'complete' | 'error' | 'idle';
  progress: number;
  bytes_done: number;
  bytes_total: number;
  file_index: number;
  file_count: number;
  error?: string;
}

/** 3D model geometry statistics computed by the viewer at load time. */
export interface VrmStats {
  /** Total triangle count across all meshes. */
  triangles: number;
  /** Total vertex count. */
  vertices: number;
  /** Number of mesh objects. */
  meshes: number;
  /** Number of expression / blend shape targets (VRM) or morph targets (GLB). */
  blendShapes: number;
  /** Number of humanoid bones (VRM) or skeleton bones (GLB). */
  bones: number;
  /** Model format: '0.x', '1.x' (VRM versions), or 'glb'. */
  vrmVersion: string;
  /** Embedded animation clip names (GLB only). */
  animations?: string[];
}

// --- Feature A2: In-App Mini Games ---

/** Supported mini-game types. */
export type GameType =
  | 'trivia'
  | 'twenty_questions'
  | 'hangman'
  | 'word_association'
  | 'riddles'
  | 'tictactoe'
  | 'memory_match';

/** One trivia question as returned by the backend. */
export interface TriviaQuestion {
  q: string;
  options: [string, string, string, string];
  /** Always -1 from the server (answer is hidden). */
  answer: -1;
}

/** One Q&A pair recorded during a 20 Questions game. */
export interface TwentyQEntry {
  q: string;
  a: string;
}

/** One word in a Word Association chain. */
export interface WaChainEntry {
  word: string;
  by: 'player' | 'ai';
}

/** A memory card as returned by the backend. */
export interface MemoryCard {
  id: number;
  pair: number;
  emoji: string;   // "?" when hidden
  matched: boolean;
}

/** Public game state (secrets masked for in-progress games). */
export interface GameState {
  // Common
  finished: boolean;
  topic?: string;
  won?: boolean | null;
  reaction?: string | null;
  reveal?: string | null;

  // Trivia
  questions?: TriviaQuestion[];
  current?: number;
  score?: number;
  current_question?: TriviaQuestion | null;
  last_correct?: boolean;
  last_answer?: number;

  // 20 Questions
  thing?: string;        // "???" while in progress
  category?: string;
  questions_list?: TwentyQEntry[];
  remaining?: number;

  // Hangman
  word?: string;         // revealed after game ends
  display?: string;
  guessed?: string[];
  wrong?: string[];
  max_wrong?: number;
  hit?: boolean;

  // Word Association
  chain?: WaChainEntry[];
  bonus?: number;
  reason?: string | null;
  max_length?: number;
  min_win?: number;

  // Riddles
  riddle?: string;
  answer?: string;       // "???" while in progress
  hints?: string[];      // only unlocked hints sent
  hints_used?: number;
  guesses?: string[];
  max_guesses?: number;
  correct?: boolean;

  // Tic-Tac-Toe
  board?: string[];       // 9-element array: " ", "X", "O"
  turn?: string;
  winner?: string | null;
  difficulty?: string;

  // Memory Match
  cards?: MemoryCard[];
  size?: number;
  flipped?: number[];
  pairs_found?: number;
  moves?: number;
  matched?: boolean;
  match_indices?: number[];
}

/** Per-game-type best score entry from GET /api/games/best-scores. */
export interface GameBestScore {
  best: number;   // 0.0–1.0 ratio
  plays: number;
  wins: number;
}

/** A completed game session summary from GET /api/games/history. */
export interface GameSession {
  id: number;
  game_type: GameType;
  result: 'win' | 'loss' | 'draw' | null;
  score: number | null;
  max_score: number | null;
  duration_seconds: number | null;
  played_at: string;
}

/** Response from POST /api/games/start. */
export interface GameStartResponse {
  session_id: number;
  state: GameState;
}

/** Response from POST /api/games/{id}/move. */
export interface GameMoveResponse {
  event: string;
  state: GameState;
  reaction: string | null;
}

// ── Section A: Browseable Avatar Models ──────────────────────────────────────

/** A browseable 3D model from the CC0 catalog, Sketchfab, or local storage. */
export interface BrowseableModel {
  id: string;
  name: string;
  description: string;
  thumbnail_url: string;
  download_url: string;
  format: 'vrm' | 'glb' | 'gltf';
  license: string;
  file_size_mb: number;
  tags: string[];
  author: string;
  source: 'cc0' | 'sketchfab' | 'vroid' | 'local';
}

/** Current state of an avatar download (polled from backend). */
export interface AvatarDownloadStatus {
  active: boolean;
  filename?: string;
  progress_pct?: number;
  speed_mb_s?: number;
  error?: string;
}

// ── Part 5: LM Studio Link Device Discovery ──────────────────────────────────

/** A Link-connected device discovered via LM Studio Link mesh. */
export interface LinkDevice {
  device_id: string;
  display_name: string;
  endpoint: string;
  online: boolean;
  models_loaded: string[];
  latency_ms: number;
  is_local: boolean;
}

/** Routing decision preview from GET /api/link/route. */
export interface LinkRoutingDecision {
  device_id: string | null;
  display_name: string | null;
  endpoint: string;
  model: string;
  reason: string;
}

/** Extended hardware info from GET /api/hardware-info. */
export interface ExtendedHardwareInfo {
  hardware: {
    gpu?: string;
    vram_gb?: number;
    ram_gb?: number;
    backend?: string;
    arch?: string;
    os?: string;
  };
  recommended_tier?: {
    id: string;
    label: string;
    backend?: string;
    models: Array<{
      id: string;
      name?: string;
      quant?: string;
      vram_gb?: number;
      capabilities?: string[];
      speed_estimate?: string;
      quality_tier?: string;
    }>;
  } | null;
}

// ── Feature A1: Full-Duplex Voice Configuration ─────────────────────────────

/** User-configurable parameters for the full-duplex voice conversation. */
export interface VoiceConfig {
  /** RMS energy threshold for voice activity detection (0.0–1.0). */
  vad_threshold: number;
  /** Silence duration before end-of-speech is declared (milliseconds). */
  silence_timeout_ms: number;
  /** Whether to automatically interrupt AI speech when user starts talking. */
  auto_interrupt: boolean;
}

// ── Game Spectator types ──────────────────────────────────────────────────

/** Frequency presets for spectator reaction rate. */
export type SpectatorFrequency = 'quiet' | 'normal' | 'hyped';

/** Spectator mode — user plays or AI plays. */
export type SpectatorMode = 'watch' | 'play';

/** A single spectator reaction from the character. */
export interface SpectatorReaction {
  /** Character's in-character reaction text. */
  text: string;
  /** Detected emotion tag. */
  emotion: string;
  /** Importance score (0.0–1.0). */
  urgency: number;
  /** Timestamp when the reaction was received. */
  timestamp: number;
}

/** Configuration for a spectator session. */
export interface SpectatorConfig {
  /** Character ID. */
  charId: number;
  /** User-provided game name (e.g. "PokeRogue"). */
  gameTag: string;
  /** Watch mode (user plays) or play mode (AI plays). */
  mode: SpectatorMode;
  /** Reaction frequency preset. */
  frequency: SpectatorFrequency;
  /** User's display name for personalized reactions. */
  userName: string;
}

/** State of the spectator hook. */
export type SpectatorState = 'idle' | 'connecting' | 'capturing' | 'error';

/** Privacy preferences controlling feedback signal collection. */
export interface FeedbackPreferences {
  /** Whether the 👍/👎 UI buttons are shown and clicks recorded. */
  explicit_signals_enabled: boolean;
  /** Whether implicit signals (regenerate rate, session length, etc.) are collected. */
  implicit_signals_enabled: boolean;
}

/** A single per-message feedback record from the backend. */
export interface MessageFeedback {
  message_id: number;
  /** +1 (thumbs-up), -1 (thumbs-down), or null (no explicit click). */
  explicit_signal: 1 | -1 | null;
  /** Implicit score computed at session end, range [-1.0, +1.0]. */
  implicit_score: number | null;
  /** Weighted combination of explicit + implicit. */
  final_score: number | null;
}
