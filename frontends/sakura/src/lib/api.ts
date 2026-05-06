import type { AppConfig, Character, ChatResponse, Session, VoiceEntry, TTSModelsResponse, VocabEntry, Universe, LoreEntry, UserFact, BrowseableModel, AvatarDownloadStatus, LinkDevice, LinkRoutingDecision, ExtendedHardwareInfo } from './types';

// ─── LM Studio Model Manager types ───────────────────────────────────────────

/**
 * Auto-detected model capabilities from HuggingFace + name heuristics.
 * Returned by /api/models/capabilities and /api/models/active-capabilities.
 */
export interface ModelCapabilities {
  model_id: string;
  /** Resolved HuggingFace repo ID, e.g. "lmstudio-community/Qwen3-8B-GGUF". */
  hf_repo: string | null;
  /** "hf" = data from HuggingFace, "heuristic" = name patterns only, "unknown" = no data. */
  source: 'hf' | 'heuristic' | 'unknown';
  /** Intelligence tier based on parameter count. */
  tier: 'tiny' | 'small' | 'medium' | 'large' | 'xl' | 'unknown';
  /** Architecture family (e.g. "qwen3", "llama3", "gemma3"). */
  architecture: string | null;
  /** True max context window from HF config.json (tokens). */
  context_window: number | null;
  /** Context window currently reported by the local LLM server. */
  lm_context_length: number | null;
  supports_vision: boolean;
  supports_tools: boolean;
  /** Extended reasoning / chain-of-thought thinking mode. */
  supports_thinking: boolean;
  /** Feature C2: Resolved tool protocol for this model. */
  tool_protocol?: 'openai_functions' | 'xml_fallback' | 'none';
}

/** An LM Studio installed model entry (from /api/models/installed). */
export interface LMStudioModel {
  id: string;
  /** 'loaded' when resident in VRAM, otherwise 'not-loaded' or absent. */
  state?: string;
  max_context_length?: number;
  architecture?: string;
  /** GGUF is the universal format; MLX is Apple-Silicon-only. */
  format?: 'gguf' | 'mlx' | 'other';
}

/** A curated recommended model entry (from /api/models/recommend). */
export interface RecommendedModel {
  id: string;
  name?: string;
  tags?: string[];
  description?: string;
  /** Estimated VRAM required in MB (used for compatibility coloring). */
  vram_required_mb?: number;
  size_gb?: number;
  downloads?: number;
  recommended?: boolean;
}

/** A single file within a HuggingFace repo (from /api/models/details). */
export interface ModelFile {
  rfilename: string;
  size?: number;
}

/** GPU/RAM/platform info returned by /api/hardware. */
export interface HardwareInfo {
  cpu?: string;
  gpu?: string;
  /** Detected GPU VRAM in GB. On Apple Silicon this equals RAM (unified memory). */
  vram_gb?: number;
  ram_gb?: number;
  /** OS platform: 'darwin', 'linux', 'win32'. */
  platform?: string;
  /** CPU architecture: 'arm64', 'x86_64'. */
  arch?: string;
}

/** Download progress snapshot from /api/models/download-status. */
export interface DownloadStatus {
  active: boolean;
  repo_id?: string;
  file?: string;
  /** 0–100 percent complete. */
  progress?: number;
  speed_mb_s?: number;
  eta_s?: number;
  error?: string;
}

/**
 * A single vector-store memory row as returned by `/api/v2/memory/list`
 * and `/api/v2/memory/search`.
 *
 * Fields are loose because the backend returns slightly different shapes
 * for list (recency-sorted) vs. search (similarity-scored). The Memory
 * Browser UI tolerates missing fields.
 */
export interface MemoryItem {
  id: string;
  text: string;
  role?: string;
  timestamp?: number;
  score?: number;
  char_id?: number;
  /** 1=Fleeting, 2=Recent, 3=Permanent (TieredMemoryManager only). */
  tier?: number;
  salience?: number;
  created_at?: string;
  session_id?: number;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Generic GET request with typed response.
 *
 * @param url - API endpoint path
 * @returns Parsed JSON response
 * @throws Error if response is not ok
 */
async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Generic POST request with typed response.
 *
 * @param url - API endpoint path
 * @param body - Request body (will be JSON-stringified)
 * @returns Parsed JSON response
 * @throws Error if response is not ok
 */
async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Generic PUT request with typed response.
 *
 * @param url - API endpoint path
 * @param body - Request body (will be JSON-stringified)
 * @returns Parsed JSON response
 * @throws Error if response is not ok
 */
async function put<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`PUT ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Generic DELETE request with typed response.
 *
 * @param url - API endpoint path
 * @returns Parsed JSON response
 * @throws Error if response is not ok
 */
async function del<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Generic PATCH request with typed response.
 *
 * @param url - API endpoint path
 * @param body - Request body (will be JSON-stringified)
 * @returns Parsed JSON response
 * @throws Error if response is not ok
 */
async function patch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Typed API client for the waifu-rt3d backend. */
export const api = {
  // Config
  getConfig: () => get<AppConfig>('/api/config'),
  saveConfig: (config: Partial<AppConfig>) => put<{ ok: boolean; config: AppConfig }>('/api/config', config),

  // Characters
  getCharacters: () => get<{ characters: Character[] }>('/api/characters').then(d => d.characters),
  getRecentMessagesPerChar: () =>
    get<{ ok: boolean; recent: Record<string, { text: string; ts: number }> }>('/api/characters/recent-messages')
      .then(d => d.recent),
  createCharacter: (data: Partial<Character>) => post<Character>('/api/characters', data),
  updateCharacter: (id: number, data: Partial<Character>) => put<Character>(`/api/characters/${id}`, data),
  deleteCharacter: (id: number) => del<{ ok: boolean }>(`/api/characters/${id}`),

  // Character export/import (Feature L)
  exportCharacter: (charId: number) =>
    post<{ ok: boolean; character: Record<string, unknown> }>(`/api/characters/export/${charId}`, {}),

  // Feature #6: Backstory generator
  generateBackstory: (charId: number) =>
    post<{ ok: boolean; backstory: string }>(`/api/characters/${charId}/generate-backstory`, {}),

  // Sessions
  getSessions: () => get<{ sessions: Session[] }>('/api/sessions').then(d => d.sessions),
  createSession: (charId: number) => post<Session>('/api/sessions', { character_id: charId }),
  createNamedSession: (title: string) => post<{ id: number; title: string }>('/api/sessions', { title }),
  updateSession: (id: number, data: { title?: string; is_pinned?: boolean; is_archived?: boolean }) =>
    put<{ ok: boolean }>(`/api/sessions/${id}`, data),
  // Feature #9: Update tags on a session
  updateSessionTags: (id: number, tags: string[]) =>
    patch<{ ok: boolean; tags: string[] }>(`/api/sessions/${id}/tags`, { tags }),
  deleteSession: (id: number) => del<{ ok: boolean; deleted_messages: number }>(`/api/sessions/${id}`),
  getMessages: (sessionId: number) =>
    get<{ messages: Array<{ id: number; role: string; text: string; ts: string; emotion?: string; parent_id?: number | null; is_active?: number; pinned?: number }> }>(
      `/api/sessions/${sessionId}/messages`
    ),
  /** Edit the text of an existing message. */
  editMessage: (messageId: number, text: string) =>
    put<{ ok: boolean; id: number }>(`/api/messages/${messageId}`, { text }),

  /** Delete a message by ID. */
  deleteMessage: (messageId: number) =>
    del<{ ok: boolean; id: number }>(`/api/messages/${messageId}`),

  // Feature #10: Pin or unpin a message
  pinMessage: (messageId: number, pinned: boolean) =>
    put<{ ok: boolean }>(`/api/messages/${messageId}/pin`, { pinned }),

  /** Get all branch siblings of a message for swipe navigation. */
  getMessageBranches: (messageId: number) =>
    get<{ branches: Array<{ id: number; text: string; emotion: string; created_at: string; is_active: boolean }>; active_index: number; total: number }>(
      `/api/messages/${messageId}/branches`
    ),

  /** Regenerate an assistant message, creating a new branch. */
  regenerateMessage: (messageId: number) =>
    post<{ ok: boolean; new_message: { id: number; text: string; emotion?: string; gesture?: string } }>(
      `/api/messages/${messageId}/regenerate`, {}
    ),

  /** Activate a branched message, deactivating siblings. */
  activateBranch: (messageId: number) =>
    post<{ ok: boolean; message_id: number; deactivated: number[] }>(
      `/api/messages/${messageId}/activate`, {}
    ),

  // Chat
  sendChat: (req: { text: string; session_id: number; char_id: number; speak: boolean }) =>
    post<ChatResponse>('/api/chat', req),

  // TTS
  getVoices: (provider?: string) => {
    const params = provider ? `?provider=${provider}` : '';
    return get<{ voices: Array<Record<string, unknown>> }>(`/api/tts/voices${params}`).then(d =>
      (d.voices || []).map(v => ({
        id: String(v.id || ''),
        engine: String(v.engine || v.provider || 'unknown'),
        name: String(v.name || v.id || ''),
        language: String(v.language || ''),
        gender: String(v.gender || ''),
        description: String(v.description || ''),
        installed: Boolean(v.installed),
      } satisfies VoiceEntry))
    );
  },

  getDefaultVoice: () => get<{ voice_id: string; provider: string; name: string }>('/api/tts/voices/default'),

  // TTS Model Management
  getTTSModels: () => get<TTSModelsResponse>('/api/tts/models'),
  installTTSModel: (modelId: string) => post<{ ok: boolean }>('/api/tts/models/install', { model_id: modelId }),
  deleteTTSModel: (modelId: string) => del<{ ok: boolean }>(`/api/tts/models/${encodeURIComponent(modelId)}`),
  refreshTTSCatalog: () => post<{ ok: boolean; count: number }>('/api/tts/models/refresh-catalog', {}),

  /** Upload a voice sample WAV for voice cloning providers (Chatterbox, XTTS, Dia, CosyVoice, etc). */
  uploadVoiceSample: async (charId: number, file: File): Promise<{ ok: boolean; path: string }> => {
    const form = new FormData();
    form.append('file', file);
    const resp = await fetch(`/api/characters/${charId}/voice-sample`, { method: 'POST', body: form });
    if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
    return resp.json();
  },

  /** Delete a character's voice sample. */
  deleteVoiceSample: (charId: number) => del<{ ok: boolean }>(`/api/characters/${charId}/voice-sample`),

  // AI Motion generation
  getMotionModelStatus: () =>
    get<{ procedural: boolean; motion_diffuse: boolean; active_backend: string; model_dir: string }>('/api/motion/model-status'),
  generateMotion: (body: { emotion: string; intensity?: number; duration?: number; context?: string; label?: string; loop?: boolean }) =>
    post<{ label: string; backend: string; duration: number; loop: boolean; keyframes: Array<{ time: number; bones: Record<string, { x: number; y: number; z: number }> }>; latency_ms?: number }>('/api/motion/generate', body),

  /** Scan local network for GPU motion servers via UDP broadcast (blocks ~8s). */
  discoverMotion: () =>
    get<{ servers: Array<{ ip: string; port: number; version: string; url: string }> }>('/api/motion/discover'),

  /** Connect to a remote GPU motion server (probe + save URL to config). */
  connectMotion: (url: string) =>
    post<{ ok: boolean; url: string; backend: string | null; message: string }>('/api/motion/connect', { url }),

  /** Disconnect from the remote GPU server (clears saved URL). */
  disconnectMotion: () =>
    del<{ ok: boolean; message: string }>('/api/motion/connect'),

  /**
   * Get full context window usage breakdown for a session.
   * Returns token counts per prompt section plus chat history.
   */
  getContextBudget: (sessionId: number, charId?: number) => {
    const q = charId ? `?char_id=${charId}` : '';
    return get<{
      ok: boolean;
      context_limit: number;
      history_limit: number;
      sections: Array<{ name: string; tokens: number; chars: number }>;
      total_tokens: number;
      remaining_tokens: number;
      usage_pct: number;
    }>(`/api/context-budget/${sessionId}${q}`);
  },

  /**
   * Live motion + performance stats.
   * Merges local proxy counters with the remote server's own histogram.
   */
  getMotionStats: () =>
    get<{
      remote_connected: boolean;
      remote_url: string | null;
      remote_backend: string | null;
      remote_requests_ok: number;
      remote_requests_failed: number;
      remote_latency_ms: number | null;
      remote_avg_latency_ms: number | null;
      remote_server_stats: Record<string, unknown> | null;
      local_backend: string;
      models_dir: string;
    }>('/api/motion/stats'),

  // Files
  scanVrm: () => get<{ models: Array<{ name: string; file: string; url: string; size: number }> }>('/api/scan/vrm').then(d => d.models),

  /**
   * Scan for all 3D models (VRM, GLB, GLTF) in avatars storage.
   * Returns a unified list with type metadata.
   */
  scan3dModels: () =>
    get<{ models: Array<{ name: string; file: string; url: string; size: number; type: string; thumbnail_url: string }> }>(
      '/api/scan/models3d'
    ).then(d => d.models),

  /**
   * Save a canvas-captured PNG as a VRM thumbnail sibling file.
   * @param name - Model stem (e.g. "Panicandy" not "Panicandy.vrm")
   * @param dataUrl - data:image/png;base64,... from canvas.toDataURL()
   * @returns URL of the saved thumbnail
   */
  saveAvatarThumbnail: (name: string, dataUrl: string) =>
    post<{ url: string }>('/api/avatars/thumbnail', { name, data_url: dataUrl }),

  /** Scan for available Live2D models (.model3.json files). */
  scanLive2d: () =>
    get<{ models: Array<{ name: string; file: string; url: string; rel_path: string }> }>('/api/scan/live2d').then(d => d.models),

  /**
   * Upload a zipped Live2D model (extracts server-side).
   *
   * @param file - The .zip file containing the Live2D model folder.
   * @returns Upload result with model name and URL on success.
   */
  uploadLive2d: async (file: File): Promise<{ ok: boolean; name: string; url: string }> => {
    const form = new FormData();
    form.append('file', file);
    const resp = await fetch('/api/upload/live2d', { method: 'POST', body: form });
    if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
    return resp.json();
  },
  scanImages: () => get<{ images: Array<string | { file: string; url: string; name: string }> }>('/api/scan/images').then(d =>
    (d.images || []).map(img => typeof img === 'string' ? img : img.file)
  ),
  // Image generation
  getImageGenStatus: () =>
    get<{ available: boolean; provider: string; model: string; endpoint: string }>('/api/image-gen/status'),
  generateBackground: (body: { prompt: string; character_id?: number; width?: number; height?: number; steps?: number }) =>
    post<{ ok: boolean; url?: string; filename?: string; error?: string }>('/api/image-gen/background', body),
  generatePortrait: (body: { prompt: string; character_id?: number; width?: number; height?: number; steps?: number }) =>
    post<{ ok: boolean; url?: string; filename?: string; error?: string }>('/api/image-gen/portrait', body),

  /** Feature A5: Generate full expression portrait set for a character (batch). */
  generateExpressions: (charId: number, basePrompt?: string) =>
    post<{ ok: boolean; portraits?: Record<string, string>; errors?: string[] }>(
      `/api/image-gen/expressions/${charId}`,
      basePrompt ? { base_prompt: basePrompt } : {}
    ),

  /** Feature A5: Get character's current expression portrait map. */
  getExprPortraits: (charId: number) =>
    get<{ ok: boolean; expr_portraits: Record<string, string> | null }>(`/api/characters/${charId}/expr-portraits`),

  /** Phase 15: List all available expression portraits with display mode. */
  listExpressionPortraits: (charId: number) =>
    get<{ ok: boolean; portraits: Record<string, string>; mode: number }>(`/api/characters/${charId}/expression-portraits`),

  /** Phase 15: Upload a single expression portrait for one emotion. */
  uploadExpressionPortrait: (charId: number, emotion: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`/api/characters/${charId}/expression-portrait/${emotion}`, {
      method: 'POST',
      body: fd,
    }).then(r => r.json()) as Promise<{ ok: boolean; url: string }>;
  },

  /** Phase 15: Delete a single expression portrait. */
  deleteExpressionPortrait: (charId: number, emotion: string) =>
    fetch(`/api/characters/${charId}/expression-portrait/${emotion}`, { method: 'DELETE' })
      .then(r => r.json()) as Promise<{ ok: boolean }>,

  // Stats (LLM status, uptime, etc.)
  getStats: () => get<Record<string, unknown>>('/api/stats'),

  // Bond progression
  getBondLevel: (charId: number) =>
    get<{ ok: boolean; bond: { bond_level: number; bond_xp: number; xp_to_next: number; tier: string; relationship_mode: string } }>(
      `/api/characters/${charId}/bond`
    ),
  getBondUnlocks: (charId: number) =>
    get<{ ok: boolean; bond_level: number; tier: string; unlocked: Array<{ type: string; key: string; label: string; level: number }>; next_unlock: { type: string; key: string; label: string; level: number } | null }>(
      `/api/characters/${charId}/bond/unlocks`
    ),
  getBondMilestones: (charId: number) =>
    get<{ ok: boolean; milestones: Array<{ id: number; milestone_type: string; milestone_key: string; bond_level: number; achieved_at: string; viewed: number }> }>(
      `/api/characters/${charId}/bond/milestones`
    ),
  getBondXpHistory: (charId: number, limit = 50) =>
    get<{ ok: boolean; events: Array<{ id: number; xp_amount: number; action: string; multiplier: number; source_detail: string | null; created_at: string }> }>(
      `/api/characters/${charId}/bond/xp-history?limit=${limit}`
    ),
  /** Get all bond stories for a character (locked + unlocked). */
  getBondStories: (charId: number) =>
    get<{ ok: boolean; stories: Array<{ id: number; title: string; bond_level_required: number; scene_text?: string; scene_type?: string; unlocked: boolean; viewed: boolean }> }>(
      `/api/characters/${charId}/bond/stories`
    ),
  /** Mark a bond story as viewed. */
  markBondStoryViewed: (charId: number, storyId: number) =>
    post<{ ok: boolean }>(`/api/characters/${charId}/bond/stories/${storyId}/view`, {}),

  /**
   * Fetch the pending memorial scene for a character at the given bond level.
   *
   * Returns a cinematic scene with setting, beat list, culmination text and
   * a keepsake item to reveal when the scene completes. Returns null when no
   * scene is pending at that level.
   *
   * @param charId - Character ID
   * @param level  - Bond level to check for a pending scene
   */
  getMemorialScene: (charId: number, level: number) =>
    get<{
      ok: boolean;
      scene: {
        id: string;
        setting: string;
        beats: string[];
        culmination: string;
        keepsake: string;
      } | null;
    }>(`/api/characters/${charId}/bond/memorial-scene?level=${level}`),

  /**
   * Mark a memorial scene as completed so it won't be shown again.
   *
   * @param charId  - Character ID
   * @param sceneId - Scene ID returned by getMemorialScene
   */
  completeMemorialScene: (charId: number, sceneId: string) =>
    post<{ ok: boolean }>(`/api/characters/${charId}/bond/memorial-scene/complete`, { scene_id: sceneId }),

  /**
   * Fetch the first-memory scene for a character (special scene at bond level 1).
   *
   * @param charId - Character ID
   */
  getFirstMemory: (charId: number) =>
    get<{
      ok: boolean;
      scene: {
        id: string;
        setting: string;
        beats: string[];
        culmination: string;
        keepsake: string;
      } | null;
    }>(`/api/characters/${charId}/bond/first-memory`),

  /**
   * Fetch bond analytics for a character — XP totals, activity stats, and
   * source breakdown showing what activities earned the most XP.
   *
   * @param charId - Character ID
   */
  getBondAnalytics: (charId: number) =>
    get<{
      ok: boolean;
      total_xp_earned: number;
      days_active: number;
      avg_xp_per_day: number;
      est_days_to_soulmate: number | null;
      source_breakdown: Record<string, number>;
    }>(`/api/characters/${charId}/bond/analytics`),

  /**
   * Fetch paginated XP history events for a character.
   *
   * @param charId - Character ID
   * @param limit  - Max number of events to return (default 50)
   * @param offset - Pagination offset (default 0)
   */
  getBondXpHistoryPaged: (charId: number, limit = 50, offset = 0) =>
    get<{
      ok: boolean;
      events: Array<{
        ts: string;
        xp: number;
        source: string;
        meta: Record<string, unknown>;
      }>;
    }>(`/api/characters/${charId}/bond/xp-history?limit=${limit}&offset=${offset}`),

  // Relationship
  getRelationship: (charId: number) =>
    get<{ ok: boolean; relationship: { affinity: number; mood: number; trust: number; interactions: number; last_updated: number | null } }>(
      `/api/characters/${charId}/relationship`
    ).then(d => d.relationship),
  resetRelationship: (charId: number) =>
    post<{ ok: boolean }>(`/api/characters/${charId}/relationship/reset`, {}),

  // LLM generation proxy (for AI character generation, etc.)
  llmGenerate: (messages: Array<{ role: string; content: string }>, temperature = 0.9, maxTokens = 500) =>
    post<{ text: string }>('/api/llm/generate', { messages, temperature, max_tokens: maxTokens }),

  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch('/api/upload/avatar', { method: 'POST', body: form }).then(r => r.json());
  },

  // Vocabulary
  getVocabEntries: (params: { category?: string; register?: string; source?: string; search?: string; page?: number; size?: number }) => {
    const q = new URLSearchParams();
    if (params.category) q.set('category', params.category);
    if (params.register) q.set('register', params.register);
    if (params.source) q.set('source', params.source);
    if (params.search) q.set('search', params.search);
    if (params.page != null) q.set('page', String(params.page));
    if (params.size != null) q.set('size', String(params.size));
    return get<{ ok: boolean; entries: VocabEntry[]; total: number; page: number; size: number }>(`/api/vocab?${q}`);
  },
  getVocabCategories: () =>
    get<{ ok: boolean; categories: string[] }>('/api/vocab/categories').then(d => d.categories),
  getVocabStats: () =>
    get<{ ok: boolean; stats: { total: number; base_count: number; user_count: number; category_count: number } }>('/api/vocab/stats').then(d => d.stats),
  addVocabEntry: (entry: Partial<VocabEntry>) =>
    post<{ ok: boolean; entry: VocabEntry }>('/api/vocab', entry),
  updateVocabEntry: (egId: string, patch: Partial<VocabEntry>) =>
    put<{ ok: boolean; entry: VocabEntry }>(`/api/vocab/${encodeURIComponent(egId)}`, patch),
  deleteVocabEntry: (egId: string) =>
    del<{ ok: boolean }>(`/api/vocab/${encodeURIComponent(egId)}`),
  exportVocab: () =>
    get<{ ok: boolean; entries: VocabEntry[]; count: number }>('/api/vocab/export'),
  importVocab: (entries: Partial<VocabEntry>[]) =>
    post<{ ok: boolean; imported: number; total_user: number }>('/api/vocab/import', { entries }),

  // Model capability enrichment via HuggingFace
  /**
   * Resolve a model ID to HuggingFace metadata and detect capabilities.
   * Accepts any format: LM Studio GGUF path, HF repo ID, short name, Ollama name.
   *
   * @param modelId - Model identifier (e.g. "lmstudio-community/Qwen3-8B-GGUF/...")
   * @param contextLength - Context window reported by the local LLM server (optional fallback)
   */
  getModelCapabilities: (modelId: string, contextLength?: number) => {
    const params = new URLSearchParams({ model_id: modelId });
    if (contextLength) params.set('context_length', String(contextLength));
    return get<ModelCapabilities & { ok: boolean }>(`/api/models/capabilities?${params}`);
  },
  /**
   * Auto-detect the currently loaded LM Studio model and return its capabilities.
   * Returns {ok: false, error: string} when LM Studio is unreachable.
   */
  getActiveModelCapabilities: () =>
    get<ModelCapabilities & { ok: boolean; active_model_id?: string }>('/api/models/active-capabilities'),

  /** Feature C2: Set manual tool protocol override for a model. */
  setModelToolProtocol: (modelId: string, protocol: 'openai_functions' | 'xml_fallback' | 'none') =>
    post<{ ok: boolean; model_id: string; protocol: string }>(`/api/models/${encodeURIComponent(modelId)}/tool-protocol`, { protocol }),

  /** Feature C2: Get the full model capability cache. */
  getCapabilityCache: () =>
    get<{ ok: boolean; entries: Array<{ model_id: string; tool_protocol: string; source: string; manual_override: boolean; cached_at: string }> }>('/api/models/capability-cache'),

  // LM Studio Model Manager
  getInstalledModels: () =>
    get<{ models: LMStudioModel[] }>('/api/models/installed').then(d => d.models ?? []),
  getOllamaModels: () =>
    get<{ ok: boolean; models: LMStudioModel[] }>('/api/ollama/models').then(d => d.models ?? []),
  getRecommendedModels: (type: string) =>
    get<{ models: RecommendedModel[] }>(`/api/models/recommend?type=${type}`).then(d => d.models ?? []),
  getModelDetails: (id: string) =>
    get<{ files: ModelFile[] }>(`/api/models/details?id=${encodeURIComponent(id)}`),
  getDownloadStatus: () =>
    get<DownloadStatus>('/api/models/download-status'),
  getHardwareInfo: () =>
    get<HardwareInfo>('/api/hardware'),
  installModel: (body: { repo_id: string; file: string }) =>
    post<{ ok: boolean }>('/api/models/install', body),
  loadModel: (identifier: string) =>
    post<{ ok: boolean }>('/api/models/load', { identifier }),
  unloadModel: (identifier: string) =>
    post<{ ok: boolean }>('/api/models/unload', { identifier }),
  deleteModel: (type: string, id: string) =>
    del<{ ok: boolean }>(`/api/models/${type}/${encodeURIComponent(id)}`),

  // Character diary — latest diary entry written by the agent
  getDiary: (charId: number) =>
    get<{ ok: boolean; diary: string | null; diary_date: string | null }>(`/api/characters/${charId}/diary`),

  /** Feature C4: Fetch contextual opening greeting for a character (30-min cached). */
  getGreeting: (charId: number) =>
    get<{ ok: boolean; greeting?: string; emotion?: string; enabled: boolean }>(`/api/characters/${charId}/greeting`),

  // Character relationship timeline (Feature B)
  getTimeline: (charId: number) =>
    get<{ ok: boolean; timeline: Array<Record<string, unknown>> }>(`/api/characters/${charId}/timeline`),

  // Character lifetime stats (Feature G)
  getCharacterStats: (charId: number) =>
    get<Record<string, unknown>>(`/api/characters/${charId}/stats`),

  // Conversation analytics dashboard
  getCharacterAnalytics: (charId: number) =>
    get<Record<string, unknown>>(`/api/characters/${charId}/analytics`),

  // Gesture/expression trigger for the VRM viewer (Feature D)
  triggerGesture: (gesture: string | null, expression: string | null, intensity: number) =>
    post<{ ok: boolean }>('/api/viewer/gesture', { gesture, expression, intensity }),

  // Scheduler: pending proactive messages + delivery acknowledgement (Feature C)
  getSchedulerPending: () =>
    get<{ ok: boolean; pending: Array<{ id: number; char_id: number; char_name: string; char_avatar_url: string | null; text: string; triggered_at: string }> }>('/api/scheduler/pending'),
  acknowledgeScheduled: (messageId: number) =>
    post<{ ok: boolean }>('/api/scheduler/acknowledge', { message_id: messageId }),

  // ── Feature #23: Universe / Shared World Builder ──────────────────────────

  /**
   * List all universes with character counts.
   *
   * @returns Array of Universe objects sorted alphabetically by name.
   */
  getUniverses: () => get<Universe[]>('/api/universes'),

  /**
   * Create a new universe.
   *
   * @param data - Object with `name` (required) and `lore` (optional) fields.
   * @returns The newly created universe (id, name, lore).
   */
  createUniverse: (data: { name: string; lore: string }) =>
    post<{ id: number; name: string; lore: string }>('/api/universes', data),

  /**
   * Update an existing universe's name and lore.
   *
   * @param id   - Universe primary key.
   * @param data - Object with updated `name` and `lore` fields.
   * @returns {"ok": true}
   */
  updateUniverse: (id: number, data: { name: string; lore: string }) =>
    put<{ ok: boolean }>(`/api/universes/${id}`, data),

  /**
   * Delete a universe.  Member characters have their universe_id set to NULL.
   *
   * @param id - Universe primary key.
   * @returns {"ok": true}
   */
  deleteUniverse: (id: number) => del<{ ok: boolean }>(`/api/universes/${id}`),

  /**
   * Assign a character to a universe (overwrites any previous assignment).
   *
   * @param universeId - Target universe primary key.
   * @param charId     - Character primary key.
   * @returns {"ok": true}
   */
  assignCharacterToUniverse: (universeId: number, charId: number) =>
    post<{ ok: boolean }>(`/api/universes/${universeId}/characters/${charId}`, {}),

  /**
   * Remove a character from their universe (sets universe_id to NULL).
   *
   * @param charId - Character primary key.
   * @returns {"ok": true}
   */
  removeCharacterFromUniverse: (charId: number) =>
    del<{ ok: boolean }>(`/api/universes/characters/${charId}`),

  // ── Feature A6: Lorebook / World Info ──────────────────────────────

  /**
   * List all lore entries for a character.
   *
   * @param charId - Character primary key.
   * @returns Array of LoreEntry objects ordered by priority DESC.
   */
  getLoreEntries: (charId: number) =>
    get<{ ok: boolean; entries: LoreEntry[] }>(`/api/characters/${charId}/lore`),

  /**
   * Create a new lore entry for a character.
   *
   * @param charId - Character primary key.
   * @param data   - Partial LoreEntry fields (title, content, keywords, etc.).
   * @returns The newly created entry.
   */
  createLoreEntry: (charId: number, data: Partial<LoreEntry>) =>
    post<{ ok: boolean; entry: LoreEntry }>(`/api/characters/${charId}/lore`, data),

  /**
   * Update an existing lore entry.
   *
   * @param id   - Lore entry primary key.
   * @param data - Partial LoreEntry fields to update.
   * @returns {"ok": true, "entry_id": number}
   */
  updateLoreEntry: (id: number, data: Partial<LoreEntry>) =>
    put<{ ok: boolean; entry_id: number }>(`/api/lore/${id}`, data),

  /**
   * Delete a lore entry.
   *
   * @param id - Lore entry primary key.
   * @returns {"ok": true, "deleted": number}
   */
  deleteLoreEntry: (id: number) =>
    del<{ ok: boolean; deleted: number }>(`/api/lore/${id}`),

  // ── Feature C3: User Knowledge Graph ──────────────────────────────────────

  /**
   * Fetch all user facts the character has learned about the human user.
   *
   * @param charId - Character primary key.
   * @returns Array of UserFact records sorted by confidence desc.
   */
  getUserFacts: (charId: number) =>
    get<{ ok: boolean; facts: UserFact[] }>(`/api/characters/${charId}/user-facts`),

  /**
   * Manually add a user fact for a character.
   *
   * @param charId    - Character primary key.
   * @param category  - Fact category ('identity' | 'preferences' | 'history' | 'relationship' | 'general').
   * @param fact_text - The fact text.
   * @returns Newly created UserFact.
   */
  createUserFact: (charId: number, category: string, fact_text: string) =>
    post<{ ok: boolean; fact: UserFact }>(`/api/characters/${charId}/user-facts`, { category, fact_text }),

  /**
   * Delete a user fact.
   *
   * @param charId - Character primary key (scope guard).
   * @param factId - User fact primary key.
   * @returns {"ok": true, "deleted": factId}
   */
  deleteUserFact: (charId: number, factId: number) =>
    del<{ ok: boolean; deleted: number }>(`/api/characters/${charId}/user-facts/${factId}`),

  /**
   * Update the text of an existing user fact.
   *
   * Wraps `PATCH /api/characters/{charId}/user-facts/{factId}`. Only `fact_text`
   * is mutable; category, source, and confidence are unchanged server-side.
   *
   * @param charId   - Character primary key (scope guard).
   * @param factId   - User fact primary key.
   * @param factText - New fact text (must be non-empty; server returns 400 otherwise).
   * @returns Updated UserFact wrapped in `{ok, fact}`.
   */
  updateUserFact: (charId: number, factId: number, factText: string) =>
    patch<{ ok: boolean; fact: UserFact }>(
      `/api/characters/${charId}/user-facts/${factId}`,
      { fact_text: factText },
    ),

  /**
   * Comprehensive memory overview for a character.
   *
   * Combines user facts, journal entries, adaptive profile, and stats
   * into a single response for the Memory Browser.
   *
   * @param charId - Character primary key.
   * @returns Combined memory overview with facts, journal, profile, and stats.
   */
  getMemoryOverview: (charId: number) =>
    get<{
      ok: boolean;
      user_facts: UserFact[];
      journal_entries: Array<{ id: number; session_id: number; entry_text: string; created_at: string }>;
      profile: Record<string, unknown> | null;
      stats: { total_messages: number; total_facts: number; total_journal_entries: number; has_profile: boolean };
    }>(`/api/characters/${charId}/memory/overview`),

  /**
   * Paginated list of stored vector memories for a character.
   *
   * Wraps `GET /api/v2/memory/list`. Pass `charId = 0` for all characters.
   *
   * @param charId - Character primary key, or 0 for all.
   * @param page - Zero-indexed page number.
   * @param size - Page size (1-50, server clamps).
   * @returns `{memories, total}` ordered by recency.
   */
  listMemories: (charId: number, page: number, size: number) => {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (charId > 0) params.set('char_id', String(charId));
    return get<{ memories: MemoryItem[]; total: number }>(`/api/v2/memory/list?${params}`);
  },

  /**
   * Semantic memory search across the vector store.
   *
   * Wraps `GET /api/v2/memory/search`. Pass `charId = 0` for all characters
   * (matching the existing UI semantics).
   *
   * @param charId - Character primary key, or 0 for all.
   * @param query - Natural-language query string.
   * @param nResults - Top-k cap (1-20, server clamps).
   * @returns `{results}` sorted by similarity descending.
   */
  searchMemories: (charId: number, query: string, nResults = 20) => {
    const params = new URLSearchParams({
      char_id: String(charId),
      query,
      n_results: String(nResults),
    });
    return get<{ results: MemoryItem[] }>(`/api/v2/memory/search?${params}`);
  },

  /**
   * Delete a single vector memory by document ID.
   *
   * Wraps `DELETE /api/v2/memory/{id}`.
   *
   * @param memoryId - Vector store document ID.
   * @returns `{ok: true}` on success.
   */
  deleteMemory: (memoryId: string) =>
    del<{ ok: boolean }>(`/api/v2/memory/${encodeURIComponent(memoryId)}`),

  /**
   * Promote a memory to Tier 3 (permanent — never pruned).
   *
   * Wraps `PATCH /api/v2/memory/{id}/promote`. Requires the
   * TieredMemoryManager backend; otherwise the server returns 501.
   *
   * @param memoryId - Vector store document ID.
   * @returns `{ok: true}` on success.
   */
  promoteMemory: (memoryId: string) =>
    patch<{ ok: boolean }>(`/api/v2/memory/${encodeURIComponent(memoryId)}/promote`, {}),

  /**
   * Full prompt inspection for a session — returns every assembled section
   * with content, token counts, summaries, and history stats.
   *
   * Used by the P2 Context Assembly Viewer for debugging what's sent to the LLM.
   *
   * @param sessionId - Session primary key.
   * @param charId    - Optional character ID override.
   * @returns Sections with full content, history stats, and summaries.
   */
  getPromptInspect: (sessionId: number, charId?: number) =>
    get<{
      ok: boolean;
      sections: Array<{ name: string; content: string; tokens: number; chars: number }>;
      history: { message_count: number; tokens: number };
      summaries: Array<{ text: string; range: string; tokens: number }>;
      token_counter: 'tiktoken' | 'heuristic';
    }>(`/api/dev/prompt-inspect/${sessionId}${charId ? `?char_id=${charId}` : ''}`),

  /**
   * Fetch the author's note for a session.
   *
   * @param sessionId - Session primary key.
   * @returns Current note text, injection position, and enabled flag.
   */
  getAuthorNote: (sessionId: number) =>
    get<{ note: string; position: string; enabled: boolean }>(`/api/sessions/${sessionId}/author-note`),

  /**
   * Update the author's note for a session (partial patch).
   *
   * @param sessionId - Session primary key.
   * @param patch - Fields to update (note, position, enabled).
   */
  updateAuthorNote: (sessionId: number, data: { note?: string; position?: string; enabled?: boolean }) =>
    patch<{ ok: boolean; note: string; position: string; enabled: boolean }>(
      `/api/sessions/${sessionId}/author-note`, data
    ),

  /**
   * Fetch the scene context for a session.
   *
   * @param sessionId - Session primary key.
   * @returns Current scene text and enabled flag.
   */
  getScene: (sessionId: number) =>
    get<{ scene: string; enabled: boolean }>(`/api/sessions/${sessionId}/scene`),

  /**
   * Update the scene context for a session (partial patch).
   *
   * @param sessionId - Session primary key.
   * @param data - Fields to update (scene text and/or enabled flag).
   */
  updateScene: (sessionId: number, data: { scene?: string; enabled?: boolean }) =>
    patch<{ ok: boolean; scene: string; enabled: boolean }>(
      `/api/sessions/${sessionId}/scene`, data
    ),

  /**
   * Import a SillyTavern CHARA v2 PNG character card.
   *
   * @param file - PNG file with embedded CHARA v2 tEXt chunk.
   * @returns Created character id and name.
   */
  importCharaCard: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/characters/import-card', { method: 'POST', body: fd })
      .then(r => r.ok ? r.json() : r.json().then((e: { detail?: string }) => Promise.reject(new Error(e.detail ?? 'Import failed')))) as Promise<{ ok: boolean; id: number; name: string }>;
  },

  /**
   * Download a character as a SillyTavern-compatible CHARA v2 PNG card.
   * Triggers a browser download via a temporary anchor click.
   *
   * @param charId - Character to export.
   * @param fileName - Suggested download filename.
   */
  exportCharaCard: async (charId: number, fileName?: string): Promise<void> => {
    const res = await fetch(`/api/characters/${charId}/export-card`);
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName ?? `character_${charId}.png`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // --- Feature A2: Mini Games ---

  /**
   * Start a new mini-game session.
   *
   * @param gameType - "trivia" | "twenty_questions"
   * @param characterId - Character playing the game.
   * @param topic - Optional topic/category hint.
   */
  /**
   * Start a new mini-game session.
   *
   * @param gameType - One of the supported game type strings.
   * @param characterId - Character playing the game.
   * @param options - Extra options (topic, difficulty, pairs, theme, etc.).
   */
  startGame: (gameType: string, characterId: number, options: Record<string, unknown> = {}) =>
    post('/api/games/start', { game_type: gameType, character_id: characterId, ...options }),

  /**
   * Submit a move in an active game session.
   *
   * Payload varies by game type:
   * - trivia: `{ choice: 0 }`
   * - twenty_questions: `{ question: "..." }` or `{ guess: "..." }`
   * - hangman: `{ letter: "a" }`
   * - word_association: `{ word: "..." }` or `{ action: "end" }`
   * - riddles: `{ guess: "..." }` or `{ action: "hint" }`
   * - tictactoe: `{ cell: 0-8 }`
   * - memory_match: `{ card_index: 0-N }`
   */
  gameMove: (sessionId: number, move: Record<string, unknown>) =>
    post(`/api/games/${sessionId}/move`, move),

  /** Get current public state of a game session. */
  getGameState: (sessionId: number) =>
    get(`/api/games/${sessionId}/state`),

  /** Get game history for a character. */
  getGameHistory: (characterId: number, limit = 20) =>
    get(`/api/games/history?character_id=${characterId}&limit=${limit}`),

  /** Get personal best scores per game type for a character. */
  getGameBestScores: (characterId: number) =>
    get(`/api/games/best-scores?character_id=${characterId}`),

  // ── Section A: Avatar Browser ───────────────────────────────────────────────

  /** Browse avatars from a specific source (cc0, sketchfab, local). */
  browseAvatars: (source = 'cc0', query = '', page = 1) => {
    const params = new URLSearchParams({ source, q: query, page: String(page) });
    return get<{ models: BrowseableModel[]; source: string; total: number }>(`/api/avatars/browse?${params}`);
  },

  /** Cross-source merged search across all avatar sources. */
  searchAvatars: (query: string) =>
    get<{ models: BrowseableModel[]; total: number }>(`/api/avatars/search?q=${encodeURIComponent(query)}`),

  /** Start downloading an avatar model from a URL. */
  downloadAvatar: (url: string, filename: string, source = 'cc0') =>
    post<{ ok: boolean; filename: string; error: string | null }>('/api/avatars/download', { url, filename, source }),

  /** Poll current avatar download progress. */
  getAvatarDownloadStatus: () =>
    get<AvatarDownloadStatus>('/api/avatars/download-status'),

  /** Delete a local avatar file. */
  deleteAvatar: (filename: string) =>
    del<{ ok: boolean; error: string | null }>(`/api/avatars/${encodeURIComponent(filename)}`),

  /** Rename a local avatar file. */
  renameAvatar: (filename: string, newName: string) =>
    put<{ ok: boolean; error: string | null }>(`/api/avatars/${encodeURIComponent(filename)}/rename`, { new_name: newName }),

  // ── Part 5: LM Studio Link Device Discovery ────────────────────────────────

  /**
   * Fetch all discovered Link devices with their status.
   *
   * @returns Device list with online/offline status, loaded models, and latency.
   */
  getLinkDevices: () =>
    get<{ ok: boolean; devices: LinkDevice[]; device_count: number; online_count: number }>('/api/link/devices'),

  /**
   * Force a health check on all known Link devices.
   *
   * @returns Refreshed device list after pinging endpoints.
   */
  refreshLinkDevices: () =>
    post<{ ok: boolean; devices: LinkDevice[] }>('/api/link/health', {}),

  /**
   * Preview the routing decision for a given capability.
   *
   * @param capability - Task type (chat, vision, summarization, tts).
   * @param model - Optional preferred model identifier.
   * @returns Routing decision with device, endpoint, and reason.
   */
  getLinkRoute: (capability: string, model?: string) => {
    const params = new URLSearchParams({ capability });
    if (model) params.set('model', model);
    return get<{ ok: boolean; decision: LinkRoutingDecision }>(`/api/link/route?${params}`);
  },

  /**
   * Extended hardware detection with model tier matching.
   *
   * @returns Hardware details plus recommended model tier from model_recommendations.json.
   */
  getExtendedHardwareInfo: () =>
    get<{ ok: boolean } & ExtendedHardwareInfo>('/api/hardware-info'),

  /**
   * Trigger rolling compression on a session.
   *
   * @param sessionId - Session to compress.
   * @param keepRecent - Number of recent messages to keep verbatim (default 6).
   * @returns Compression result with summary and archive count.
   */
  compressSession: (sessionId: number, keepRecent = 6) =>
    post<{
      ok: boolean;
      summary?: string;
      archived?: number;
      kept?: number;
      batch_range?: [number, number];
      error?: string;
    }>(`/api/sessions/${sessionId}/compress`, { keep_recent: keepRecent }),

  // ── Feature T1-8: Daily Interaction Streaks ─────────────────────────────

  /**
   * Get the current streak, XP, and relationship tier for a character.
   *
   * @param charId - Character primary key.
   * @returns Streak count, total XP, current tier, next tier, and XP remaining.
   */
  getCharacterStreak: (charId: number) =>
    get<{ streak: number; total_xp: number; tier: string; next_tier: string; xp_to_next: number }>(
      `/api/characters/${charId}/streak`
    ),

  // ── Feature T1-7: Output Format Rules ───────────────────────────────────

  /**
   * List all output format rules for a character.
   *
   * @param charId - Character primary key.
   * @returns Array of format rule objects ordered by priority DESC.
   */
  getFormatRules: (charId: number) =>
    get<{ rules: Array<{ id: number; rule_name: string; pattern: string; replacement: string; is_enabled: boolean; priority: number }> }>(
      `/api/characters/${charId}/format-rules`
    ),

  /**
   * Create a new output format rule for a character.
   *
   * @param charId - Character primary key.
   * @param rule - Rule fields: name, regex pattern, replacement string, priority.
   * @returns The new rule's ID.
   */
  createFormatRule: (charId: number, rule: { rule_name: string; pattern: string; replacement?: string; priority?: number }) =>
    post<{ ok: boolean; id: number }>(`/api/characters/${charId}/format-rules`, rule),

  /**
   * Update an existing format rule (partial patch).
   *
   * @param ruleId - Format rule primary key.
   * @param fields - Fields to update (rule_name, pattern, replacement, is_enabled, priority).
   * @returns Success flag.
   */
  updateFormatRule: (ruleId: number, fields: Record<string, unknown>) =>
    patch<{ ok: boolean }>(`/api/format-rules/${ruleId}`, fields),

  /**
   * Delete a format rule.
   *
   * @param ruleId - Format rule primary key.
   * @returns Success flag.
   */
  deleteFormatRule: (ruleId: number) =>
    del<{ ok: boolean }>(`/api/format-rules/${ruleId}`),

  // ── Content Gate (Phase 18C) ────────────────────────────────────────

  /**
   * Fetch the global content gate config and per-character ceilings.
   *
   * @returns Global ceiling, age-verification status, lock state, and per-character overrides.
   */
  getContentGate: () =>
    get<{
      global_content_ceiling: string;
      age_verified: boolean;
      content_lock_enabled: boolean;
      per_character_ceilings: Record<string, string>;
    }>('/api/content-gate'),

  /**
   * Update the global content ceiling.
   *
   * @param body - New ceiling value and optional unlock password.
   * @returns Updated ceiling value.
   */
  updateContentGate: (body: { global_content_ceiling: string; unlock_password?: string }) =>
    put<{ ok: boolean; global_content_ceiling: string }>('/api/content-gate', body),

  /**
   * Confirm age verification (one-time).
   *
   * @returns Updated age verification status.
   */
  verifyAge: () =>
    post<{ ok: boolean; age_verified: boolean }>('/api/content-gate/verify-age', { confirmed: true }),

  /**
   * Enable content lock with a password.
   *
   * @param password - Password to lock content controls (min 4 chars).
   * @returns Updated lock state.
   */
  setContentLock: (password: string) =>
    post<{ ok: boolean; content_lock_enabled: boolean }>('/api/content-gate/lock', { password }),

  /**
   * Unlock content by verifying password.
   *
   * @param password - Password to verify before unlocking.
   * @returns Updated lock state.
   */
  unlockContent: (password: string) =>
    post<{ ok: boolean; content_lock_enabled: boolean }>('/api/content-gate/unlock', { password }),

  /**
   * Set or clear a per-character content ceiling override.
   *
   * @param charId - Character primary key.
   * @param ceiling - Ceiling level string, or null to inherit global setting.
   * @returns Updated per-character ceiling.
   */
  setCharacterCeiling: (charId: number, ceiling: string | null) =>
    put<{ ok: boolean; char_id: number; ceiling: string | null }>(`/api/content-gate/character/${charId}`, { ceiling }),

  // ── Per-Character Scenario Templates ────────────────────────────────────────

  /**
   * List all scenario templates for a character (built-in + custom).
   *
   * @param charId - Character primary key.
   * @returns Array of scenario template objects.
   */
  getScenarioTemplates: (charId: number) =>
    get<{
      ok: boolean;
      templates: Array<{
        id: number;
        char_id: number;
        title: string;
        description: string;
        setting: string | null;
        time_of_day: string | null;
        mood: string | null;
        is_default: boolean;
        is_builtin: boolean;
        created_at: string;
      }>;
    }>(`/api/scenarios/templates?char_id=${charId}`),

  /**
   * Get the currently active scenario template for a session, if any.
   *
   * @param charId - Character primary key.
   * @param sessionId - Session primary key.
   * @returns The active template or null.
   */
  getActiveScenarioTemplate: (charId: number, sessionId: number) =>
    get<{
      ok: boolean;
      template: {
        id: number;
        char_id: number;
        title: string;
        description: string;
        setting: string | null;
        time_of_day: string | null;
        mood: string | null;
        is_default: boolean;
        is_builtin: boolean;
        created_at: string;
      } | null;
    }>(`/api/scenarios/templates/active?char_id=${charId}&session_id=${sessionId}`),

  /**
   * Create a new custom scenario template.
   *
   * @param payload - Template fields including charId and required title/description.
   * @returns The newly created template.
   */
  createScenarioTemplate: (payload: {
    char_id: number;
    title: string;
    description: string;
    setting?: string;
    time_of_day?: string;
    mood?: string;
    is_default?: boolean;
  }) =>
    post<{
      ok: boolean;
      template: {
        id: number;
        char_id: number;
        title: string;
        description: string;
        setting: string | null;
        time_of_day: string | null;
        mood: string | null;
        is_default: boolean;
        is_builtin: boolean;
        created_at: string;
      };
    }>('/api/scenarios/templates', payload),

  /**
   * Update fields on an existing scenario template.
   *
   * @param id - Template primary key.
   * @param fields - Partial fields to update.
   * @returns Whether the update was applied.
   */
  updateScenarioTemplate: (id: number, fields: Record<string, unknown>) =>
    put<{ ok: boolean; updated: boolean }>(`/api/scenarios/templates/${id}`, fields),

  /**
   * Delete a custom scenario template.
   *
   * @param id - Template primary key.
   * @returns Whether the deletion was applied.
   */
  deleteScenarioTemplate: (id: number) =>
    del<{ ok: boolean; deleted: boolean }>(`/api/scenarios/templates/${id}`),

  /**
   * Activate a scenario template for the current session.
   *
   * @param templateId - Template primary key to activate.
   * @param sessionId - Session primary key to associate.
   * @returns Whether activation succeeded.
   */
  activateScenarioTemplate: (templateId: number, sessionId: number) =>
    post<{ ok: boolean; activated: boolean }>('/api/scenarios/templates/activate', {
      template_id: templateId,
      session_id: sessionId,
    }),

  /**
   * Deactivate (clear) the active scenario template for a session.
   *
   * @param sessionId - Session primary key.
   * @returns Whether deactivation succeeded.
   */
  deactivateScenarioTemplate: (sessionId: number) =>
    post<{ ok: boolean; activated: boolean }>('/api/scenarios/templates/activate', {
      template_id: 0,
      session_id: sessionId,
    }),
};
