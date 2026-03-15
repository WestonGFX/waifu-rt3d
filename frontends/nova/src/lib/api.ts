import type { AppConfig, Character, ChatResponse, Session, VoiceEntry, TTSModelsResponse, VocabEntry, Universe, LoreEntry, UserFact, BrowseableModel, AvatarDownloadStatus, LinkDevice, LinkRoutingDecision, ExtendedHardwareInfo } from './types';
import { useNovaStore } from '../stores/novaStore';

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

/** GPU/RAM info returned by /api/hardware. */
export interface HardwareInfo {
  gpu_name?: string;
  /** Detected GPU VRAM in MB. */
  vram_mb?: number;
  ram_mb?: number;
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
  if (!res.ok) {
    const msg = `GET ${url}: ${res.status}`;
    useNovaStore.getState().addToast(msg, 'error');
    throw new Error(msg);
  }
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
  if (!res.ok) {
    const msg = `POST ${url}: ${res.status}`;
    useNovaStore.getState().addToast(msg, 'error');
    throw new Error(msg);
  }
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
  if (!res.ok) {
    const msg = `PUT ${url}: ${res.status}`;
    useNovaStore.getState().addToast(msg, 'error');
    throw new Error(msg);
  }
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
  if (!res.ok) {
    const msg = `DELETE ${url}: ${res.status}`;
    useNovaStore.getState().addToast(msg, 'error');
    throw new Error(msg);
  }
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
  if (!res.ok) {
    const msg = `PATCH ${url}: ${res.status}`;
    useNovaStore.getState().addToast(msg, 'error');
    throw new Error(msg);
  }
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
    get<{ messages: Array<{ id: number; role: string; content: string; created_at: string }> }>(
      `/api/sessions/${sessionId}/messages`
    ),
  // Feature #10: Pin or unpin a message
  pinMessage: (messageId: number, pinned: boolean) =>
    put<{ ok: boolean }>(`/api/messages/${messageId}/pin`, { pinned }),

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
      connected: boolean;
      remote_url: string | null;
      backend_name: string | null;
      requests_total: number;
      requests_ok: number;
      requests_failed: number;
      avg_latency_ms: number | null;
      last_latency_ms: number | null;
      remote_avg_latency_ms: number | null;
      remote_p95_latency_ms: number | null;
    }>('/api/motion/stats'),

  // Files
  scanVrm: () => get<{ models: Array<{ name: string; file: string; url: string; size: number }> }>('/api/scan/vrm').then(d => d.models),

  /**
   * Scan for all 3D models (VRM, GLB, GLTF) in avatars storage.
   * Returns a unified list with type metadata.
   */
  scan3dModels: () =>
    get<{ models: Array<{ name: string; file: string; url: string; size: number; type: string }> }>(
      '/api/scan/models3d'
    ).then(d => d.models),

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
};
