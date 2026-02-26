import type { AppConfig, Character, ChatResponse, Session, VoiceEntry } from './types';

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
    return get<{ voices: VoiceEntry[] }>(`/api/tts/voices${params}`).then(d => d.voices);
  },

  // Files
  scanVrm: () => get<{ models: string[] }>('/api/scan/vrm').then(d => d.models),
  scanImages: () => get<{ images: string[] }>('/api/scan/images').then(d => d.images),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch('/api/upload/avatar', { method: 'POST', body: form }).then(r => r.json());
  }
};
