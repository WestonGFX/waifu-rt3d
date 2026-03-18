/**
 * helperClient — waifu-rt3d stub.
 *
 * AnimeGirly's helper backend (localhost:8765) is not needed;
 * waifu-rt3d's FastAPI backend handles all LLM, TTS, model management,
 * and secret storage natively. All functions return sensible defaults
 * so CompanionContext hydration completes without errors.
 */

import {
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
  type DiskUsageResponse,
} from '../types/companion.ts';

export const DEFAULT_HELPER_BASE_URL = 'http://localhost:8080';

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

export interface WhisperTranscribeResponse {
  text: string;
  language: string;
  segments: Array<{ start: number; end: number; text: string }>;
  modelId: string;
}

export function createOfflineHelperHealth(message: string): HelperHealth {
  return {
    ok: false,
    version: 'waifu-rt3d',
    runtimes: {},
    message,
    checkedAt: Date.now(),
  };
}

export async function fetchHelperHealth(): Promise<HelperHealth> {
  return {
    ok: true,
    version: 'waifu-rt3d',
    runtimes: {},
    message: 'Connected to waifu-rt3d backend',
    checkedAt: Date.now(),
  };
}

export async function fetchHelperCapabilities(): Promise<HelperCapabilities> {
  return { tts: [], stt: [], models: false, secrets: false } as unknown as HelperCapabilities;
}

export async function fetchRuntimeStatuses(): Promise<RuntimeStatus[]> {
  return [];
}

export async function warmOllamaModel(): Promise<{ runtimeId: 'ollama'; status: 'ok' | 'error'; message: string }> {
  return { runtimeId: 'ollama', status: 'ok', message: 'Not needed — waifu-rt3d backend handles model loading' };
}

export async function unloadOllamaModels(): Promise<{ runtimeId: 'ollama'; status: 'ok' | 'error'; message: string }> {
  return { runtimeId: 'ollama', status: 'ok', message: 'Not needed' };
}

export async function fetchTTSProviders(): Promise<TTSProviderDescriptor[]> {
  return [];
}

export async function fetchTTSVoices(): Promise<TTSVoiceDescriptor[]> {
  return [];
}

export async function fetchModelCatalog(): Promise<ModelCatalogEntry[]> {
  return [];
}

export async function fetchJobs(): Promise<HelperJobRecord[]> {
  return [];
}

export async function fetchSecretStatus(): Promise<SecretStatusResponse> {
  return { providers: {} } as unknown as SecretStatusResponse;
}

export async function setProviderSecret(): Promise<{ providerId: string; status: string; message: string }> {
  return { providerId: '', status: 'ok', message: 'Not needed' };
}

export async function deleteProviderSecret(): Promise<{ providerId: string; status: string }> {
  return { providerId: '', status: 'ok' };
}

export async function createInstallJob(): Promise<HelperJobRecord> {
  return { id: 'noop', status: 'skipped' } as unknown as HelperJobRecord;
}

export async function removeInstalledModel(): Promise<{ modelId: string; status: string; message: string }> {
  return { modelId: '', status: 'ok', message: 'Not needed' };
}

export async function synthesizeSpeech(): Promise<TTSAudioResponse> {
  return { audioBase64: '', mimeType: 'audio/wav', providerId: 'none' };
}

export async function fetchDiskUsage(): Promise<DiskUsageResponse> {
  return { models: [], totalBytes: 0 } as unknown as DiskUsageResponse;
}

export async function fetchSTTProviders(): Promise<STTProviderDescriptor[]> {
  return [];
}

export async function transcribeAudioBase64(): Promise<WhisperTranscribeResponse> {
  return { text: '', language: 'en', segments: [], modelId: '' };
}
