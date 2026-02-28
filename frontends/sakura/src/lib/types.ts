export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'pending' | 'streaming' | 'sent' | 'failed';

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

export interface TTSModel {
  id: string;
  engine: string;
  name: string;
  language: string;
  gender: string;
  description: string;
  size_mb: number;
  voice_id: string;
  sample_url: string;
  tags: string[];
  installed: boolean;
  installed_at?: string;
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

/** VRM model geometry statistics computed by the 3D viewer at load time. */
export interface VrmStats {
  /** Total triangle count across all meshes. */
  triangles: number;
  /** Total vertex count. */
  vertices: number;
  /** Number of mesh objects. */
  meshes: number;
  /** Number of expression / blend shape targets. */
  blendShapes: number;
  /** Number of humanoid bones. */
  bones: number;
  /** VRM spec version: '0.x' or '1.x'. */
  vrmVersion: string;
}

// --- Feature A2: In-App Mini Games ---

/** Supported mini-game types. */
export type GameType = 'trivia' | 'twenty_questions';

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

/** Public game state (thing masked for 20Q in progress). */
export interface GameState {
  // Common
  finished: boolean;
  topic: string;
  // Trivia-specific
  questions?: TriviaQuestion[];
  current?: number;
  score?: number;
  current_question?: TriviaQuestion | null;
  last_correct?: boolean;
  last_answer?: number;
  // 20Q-specific
  thing?: string;        // "???" while in progress
  category?: string;
  questions_list?: TwentyQEntry[];
  remaining?: number;
  won?: boolean | null;
  reveal?: string | null;
}

/** A completed game session summary from GET /api/games/history. */
export interface GameSession {
  id: number;
  game_type: GameType;
  result: 'win' | 'loss' | null;
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
  event: 'correct' | 'wrong' | 'answered' | 'won' | 'lost' | 'guess_wrong' | 'unknown';
  state: GameState;
  reaction: string | null;
}
