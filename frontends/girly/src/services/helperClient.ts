import {
  type DiskUsageResponse,
  type HelperCapabilities,
  type HelperHealth,
  type HelperJobRecord,
  type ModelCatalogEntry,
  type RuntimeStatus,
  type SecretStatusResponse,
  type STTProviderDescriptor,
  type TTSProviderDescriptor,
  type TTSVoiceDescriptor,
  type TTSProviderRef,
} from '../types/companion.ts';

export const DEFAULT_HELPER_BASE_URL = 'http://127.0.0.1:8765';

export interface TTSPreviewRequest {
  text: string;
  profileId?: string;
  providerOverride?: TTSProviderRef | null;
}

export interface TTSSynthesizeRequest {
  text: string;
  profileId?: string;
  provider: TTSProviderRef;
  providerSettings?: Record<string, string | number | boolean>;
}

export interface TTSAudioResponse {
  audioBase64: string;
  mimeType: string;
  durationMs?: number;
  providerId: string;
}

async function requestJson<T>(path: string, init?: RequestInit, baseUrl = DEFAULT_HELPER_BASE_URL): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Helper request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchHelperHealth(baseUrl = DEFAULT_HELPER_BASE_URL): Promise<HelperHealth> {
  const payload = await requestJson<Omit<HelperHealth, 'checkedAt'>>('/v1/health', undefined, baseUrl);
  return {
    ...payload,
    checkedAt: Date.now(),
  };
}

export async function fetchHelperCapabilities(baseUrl = DEFAULT_HELPER_BASE_URL): Promise<HelperCapabilities> {
  return requestJson<HelperCapabilities>('/v1/runtime/capabilities', undefined, baseUrl);
}

export function createOfflineHelperHealth(message: string): HelperHealth {
  return {
    ok: false,
    version: 'offline',
    runtimes: {},
    message,
    checkedAt: Date.now(),
  };
}

export async function fetchRuntimeStatuses(baseUrl = DEFAULT_HELPER_BASE_URL): Promise<RuntimeStatus[]> {
  return requestJson<RuntimeStatus[]>('/v1/runtimes', undefined, baseUrl);
}

export async function warmOllamaModel(
  modelId: string,
  keepAlive = '30m',
  unloadOthers = true,
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<{ runtimeId: 'ollama'; status: 'ok' | 'error'; message: string }> {
  return requestJson<{ runtimeId: 'ollama'; status: 'ok' | 'error'; message: string }>('/v1/runtimes/ollama/select', {
    method: 'POST',
    body: JSON.stringify({ modelId, keepAlive, unloadOthers }),
  }, baseUrl);
}

export async function unloadOllamaModels(
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<{ runtimeId: 'ollama'; status: 'ok' | 'error'; message: string }> {
  return requestJson<{ runtimeId: 'ollama'; status: 'ok' | 'error'; message: string }>('/v1/runtimes/ollama/unload', {
    method: 'POST',
  }, baseUrl);
}

export async function fetchTTSProviders(baseUrl = DEFAULT_HELPER_BASE_URL): Promise<TTSProviderDescriptor[]> {
  return requestJson<TTSProviderDescriptor[]>('/v1/tts/providers', undefined, baseUrl);
}

export async function fetchTTSVoices(baseUrl = DEFAULT_HELPER_BASE_URL): Promise<TTSVoiceDescriptor[]> {
  return requestJson<TTSVoiceDescriptor[]>('/v1/tts/voices', undefined, baseUrl);
}

export async function fetchModelCatalog(baseUrl = DEFAULT_HELPER_BASE_URL): Promise<ModelCatalogEntry[]> {
  return requestJson<ModelCatalogEntry[]>('/v1/models/catalog', undefined, baseUrl);
}

export async function fetchJobs(baseUrl = DEFAULT_HELPER_BASE_URL): Promise<HelperJobRecord[]> {
  return requestJson<HelperJobRecord[]>('/v1/jobs', undefined, baseUrl);
}

export async function fetchSecretStatus(baseUrl = DEFAULT_HELPER_BASE_URL): Promise<SecretStatusResponse> {
  return requestJson<SecretStatusResponse>('/v1/secrets/status', undefined, baseUrl);
}

export async function setProviderSecret(
  providerId: string,
  secret: string,
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<{ providerId: string; status: string; message: string }> {
  return requestJson<{ providerId: string; status: string; message: string }>(`/v1/secrets/providers/${providerId}`, {
    method: 'POST',
    body: JSON.stringify({ secret }),
  }, baseUrl);
}

export async function deleteProviderSecret(
  providerId: string,
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<{ providerId: string; status: string }> {
  return requestJson<{ providerId: string; status: string }>(`/v1/secrets/providers/${providerId}`, {
    method: 'DELETE',
  }, baseUrl);
}

export async function createInstallJob(
  modelId: string,
  source = 'curated',
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<HelperJobRecord> {
  return requestJson<HelperJobRecord>('/v1/jobs/install', {
    method: 'POST',
    body: JSON.stringify({ model_id: modelId, source }),
  }, baseUrl);
}

export async function removeInstalledModel(
  modelId: string,
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<{ modelId: string; status: string; message: string }> {
  return requestJson<{ modelId: string; status: string; message: string }>(`/v1/models/${modelId}`, {
    method: 'DELETE',
  }, baseUrl);
}

export async function synthesizeSpeech(
  request: TTSSynthesizeRequest,
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<TTSAudioResponse> {
  return requestJson<TTSAudioResponse>('/v1/tts/synthesize', {
    method: 'POST',
    body: JSON.stringify(request),
  }, baseUrl);
}

export async function fetchDiskUsage(baseUrl = DEFAULT_HELPER_BASE_URL): Promise<DiskUsageResponse> {
  return requestJson<DiskUsageResponse>('/v1/models/disk-usage', undefined, baseUrl);
}

export async function fetchSTTProviders(baseUrl = DEFAULT_HELPER_BASE_URL): Promise<STTProviderDescriptor[]> {
  return requestJson<STTProviderDescriptor[]>('/v1/stt/providers', undefined, baseUrl);
}

export interface WhisperTranscribeResponse {
  text: string;
  language: string;
  segments: Array<{ start: number; end: number; text: string }>;
  modelId: string;
}

export async function transcribeAudioBase64(
  audioBase64: string,
  language?: string,
  modelId?: string,
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<WhisperTranscribeResponse> {
  return requestJson<WhisperTranscribeResponse>('/v1/stt/transcribe/base64', {
    method: 'POST',
    body: JSON.stringify({ audioBase64, language, modelId }),
  }, baseUrl);
}
