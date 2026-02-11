import type { AppConfig, Character, ChatResponse, MemoryGraphPayload } from '../types';

interface ChatRequest {
  text: string;
  session_id: number;
  char_id: number;
  speak: boolean;
  client_message_id?: string;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`POST ${url} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`PUT ${url} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchCharacters(): Promise<Character[]> {
  const data = await apiGet<{ characters: Character[] }>('/api/characters');
  return data.characters;
}

export async function sendChat(request: ChatRequest): Promise<ChatResponse> {
  return apiPost<ChatResponse>('/api/chat', request);
}

export async function fetchMemoryGraph(sessionId: number, charId: number, limit = 40): Promise<MemoryGraphPayload> {
  const params = new URLSearchParams({
    session_id: String(sessionId),
    char_id: String(charId),
    limit: String(limit)
  });
  return apiGet<MemoryGraphPayload>(`/api/v2/memory/graph?${params.toString()}`);
}

export async function searchMemory(charId: number, query: string, nResults = 5) {
  const params = new URLSearchParams({
    char_id: String(charId),
    query,
    n_results: String(nResults)
  });
  return apiGet<{ results: Array<{ id: string; text: string; role: string; score: number; session_id?: number; timestamp?: number }> }>(
    `/api/v2/memory/search?${params.toString()}`
  );
}

export async function fetchUiConfig(): Promise<AppConfig> {
  return apiGet<AppConfig>('/api/config');
}

export async function saveUiConfig(payload: Partial<AppConfig>) {
  return apiPut<{ ok: boolean; config: AppConfig }>('/api/config', payload);
}
