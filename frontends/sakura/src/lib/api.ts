import type { AppConfig, Character, ChatResponse, Session, VoiceEntry, TTSModelsResponse, VocabEntry } from './types';

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

/** Typed API client for the waifu-rt3d backend. */
export const api = {
  // Config
  getConfig: () => get<AppConfig>('/api/config'),
  saveConfig: (config: Partial<AppConfig>) => put<{ ok: boolean; config: AppConfig }>('/api/config', config),

  // Characters
  getCharacters: () => get<{ characters: Character[] }>('/api/characters').then(d => d.characters),
  createCharacter: (data: Partial<Character>) => post<Character>('/api/characters', data),
  updateCharacter: (id: number, data: Partial<Character>) => put<Character>(`/api/characters/${id}`, data),
  deleteCharacter: (id: number) => del<{ ok: boolean }>(`/api/characters/${id}`),

  // Sessions
  getSessions: () => get<{ sessions: Session[] }>('/api/sessions').then(d => d.sessions),
  createSession: (charId: number) => post<Session>('/api/sessions', { character_id: charId }),
  createNamedSession: (title: string) => post<{ id: number; title: string }>('/api/sessions', { title }),
  updateSession: (id: number, data: { title?: string; is_pinned?: boolean; is_archived?: boolean }) =>
    put<{ ok: boolean }>(`/api/sessions/${id}`, data),
  deleteSession: (id: number) => del<{ ok: boolean; deleted_messages: number }>(`/api/sessions/${id}`),
  getMessages: (sessionId: number) =>
    get<{ messages: Array<{ id: number; role: string; content: string; created_at: string }> }>(
      `/api/sessions/${sessionId}/messages`
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

  // Files
  scanVrm: () => get<{ models: Array<{ name: string; file: string; url: string; size: number }> }>('/api/scan/vrm').then(d => d.models),
  scanImages: () => get<{ images: Array<string | { file: string; url: string; name: string }> }>('/api/scan/images').then(d =>
    (d.images || []).map(img => typeof img === 'string' ? img : img.file)
  ),
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
};
