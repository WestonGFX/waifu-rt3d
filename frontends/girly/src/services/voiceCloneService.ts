/**
 * voiceCloneService — voice sample management for the helper-backed clone engine.
 *
 * All functions are pure async calls to the helper subprocess REST API.
 * There is no local state; callers (UI components, context handlers) are
 * responsible for caching or re-fetching as needed.
 *
 * API contract (helper side):
 *   POST   /api/tts/clone/upload-sample   multipart/form-data
 *   GET    /api/tts/clone/samples         ?persona_id=
 *   DELETE /api/tts/clone/samples/{id}
 *   POST   /api/tts/clone/preview         JSON body
 *   GET    /api/tts/clone/engines
 *
 * The helper service starts as a scaffold (stub implementations) and gains
 * real voice-cloning model integrations (Fish Speech, F5-TTS, CosyVoice) when
 * those packages are installed in the helper runtime environment.
 */

import { DEFAULT_HELPER_BASE_URL } from './helperClient.ts';

/* ── Domain types ──────────────────────────────────────────────────────── */

/**
 * A recorded audio sample tied to a persona, used as the reference voice for
 * synthesis by the clone engine.
 */
export interface VoiceSample {
  /** Unique opaque identifier assigned by the helper. */
  id: string;
  /** Persona this sample belongs to (foreign key into PersonaProfile.id). */
  personaId: string;
  /** Human-readable label shown in the UI (e.g. "Recording 1"). */
  label: string;
  /** Raw audio data — present only when the caller requests the blob (preview). */
  audioBlob?: Blob;
  /** Duration of the sample in seconds. */
  durationSec: number;
  /** The voice-clone backend that will use this sample. */
  engine: VoiceCloneEngine;
  /** Unix epoch milliseconds when the sample was created. */
  createdAt: number;
}

/**
 * Supported voice-clone engine identifiers.
 * Each maps to a Python adapter in the helper service.
 */
export type VoiceCloneEngine = 'fish-speech' | 'f5-tts' | 'cosyvoice';

/**
 * Response from GET /api/tts/clone/engines.
 * The helper returns only engines whose Python packages are actually installed.
 */
interface EnginesResponse {
  engines: VoiceCloneEngine[];
}

/**
 * Wire-format returned by the helper for a single voice sample record.
 * Field names follow the project's camelCase JSON convention.
 */
interface VoiceSampleRecord {
  id: string;
  personaId: string;
  label: string;
  durationSec: number;
  engine: VoiceCloneEngine;
  createdAt: number;
}

/* ── Internal helpers ──────────────────────────────────────────────────── */

/**
 * Perform a JSON fetch against the helper, throwing on non-OK responses.
 *
 * @param path    - Path relative to the helper base URL (must start with /).
 * @param init    - Standard RequestInit (method, headers, body).
 * @param baseUrl - Helper base URL override (defaults to 127.0.0.1:8765).
 * @returns Parsed JSON typed as T.
 * @throws Error with the helper's error body or HTTP status on failure.
 */
async function helperJson<T>(
  path: string,
  init?: RequestInit,
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Voice clone helper request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/* ── Public API ────────────────────────────────────────────────────────── */

/**
 * Upload a raw audio recording as a voice sample for a given persona.
 *
 * The audio blob is sent as multipart/form-data so the helper can persist it
 * alongside its metadata.  The helper assigns the sample ID and returns the
 * full record.
 *
 * @param personaId - ID of the persona this sample belongs to.
 * @param audioBlob - Raw audio file (wav, mp3, ogg — helper validates format).
 * @param engine    - Clone engine that will consume this sample.
 * @param baseUrl   - Helper base URL override.
 * @returns The created VoiceSample record (without audioBlob — use
 *   previewClonedVoice() to hear the result).
 *
 * @example
 *   const sample = await uploadVoiceSample(
 *     'persona-xyz',
 *     recordingBlob,
 *     'fish-speech',
 *   );
 *   console.log(sample.id); // "vs-abc123"
 */
export async function uploadVoiceSample(
  personaId: string,
  audioBlob: Blob,
  engine: VoiceCloneEngine,
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<VoiceSample> {
  const form = new FormData();
  form.append('persona_id', personaId);
  form.append('engine', engine);
  form.append('file', audioBlob, 'sample.wav');

  const response = await fetch(`${baseUrl}/api/tts/clone/upload-sample`, {
    method: 'POST',
    // Do NOT set Content-Type — the browser must set the multipart boundary.
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `uploadVoiceSample: helper returned ${response.status} — ${detail || 'no detail'}`,
    );
  }

  const record = (await response.json()) as VoiceSampleRecord;
  return {
    id: record.id,
    personaId: record.personaId,
    label: record.label,
    durationSec: record.durationSec,
    engine: record.engine,
    createdAt: record.createdAt,
  };
}

/**
 * Retrieve all voice samples that belong to a given persona.
 *
 * @param personaId - Persona whose samples should be listed.
 * @param baseUrl   - Helper base URL override.
 * @returns Ordered list of VoiceSample records (newest first per helper sort).
 *
 * @example
 *   const samples = await listVoiceSamples('persona-xyz');
 *   samples.forEach(s => console.log(s.label, s.durationSec));
 */
export async function listVoiceSamples(
  personaId: string,
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<VoiceSample[]> {
  const records = await helperJson<VoiceSampleRecord[]>(
    `/api/tts/clone/samples?persona_id=${encodeURIComponent(personaId)}`,
    undefined,
    baseUrl,
  );

  return records.map((record) => ({
    id: record.id,
    personaId: record.personaId,
    label: record.label,
    durationSec: record.durationSec,
    engine: record.engine,
    createdAt: record.createdAt,
  }));
}

/**
 * Permanently delete a voice sample from the helper's storage.
 *
 * @param sampleId - ID of the sample to delete.
 * @param baseUrl  - Helper base URL override.
 * @returns Resolves when the delete succeeds; throws on error.
 *
 * @example
 *   await deleteVoiceSample('vs-abc123');
 */
export async function deleteVoiceSample(
  sampleId: string,
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<void> {
  const response = await fetch(
    `${baseUrl}/api/tts/clone/samples/${encodeURIComponent(sampleId)}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `deleteVoiceSample: helper returned ${response.status} — ${detail || 'no detail'}`,
    );
  }
}

/**
 * Synthesise a short preview of a cloned voice without committing to
 * full playback infrastructure.  Useful for the "test voice" button in the UI.
 *
 * @param sampleId - Voice sample to synthesise from.
 * @param text     - Text to speak.  Keep it short (< 100 chars) for fast preview.
 * @param baseUrl  - Helper base URL override.
 * @returns An audio/wav Blob ready to be played via URL.createObjectURL().
 *
 * @example
 *   const blob = await previewClonedVoice('vs-abc123', 'Hello there!');
 *   const audio = new Audio(URL.createObjectURL(blob));
 *   await audio.play();
 */
export async function previewClonedVoice(
  sampleId: string,
  text: string,
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<Blob> {
  const response = await fetch(`${baseUrl}/api/tts/clone/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sample_id: sampleId, text }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `previewClonedVoice: helper returned ${response.status} — ${detail || 'no detail'}`,
    );
  }

  return response.blob();
}

/**
 * Query which voice-clone engines are currently available in the helper runtime.
 *
 * The helper only reports engines whose Python packages are installed.  An
 * empty array means no clone engine is ready yet; the UI should surface an
 * install prompt.
 *
 * @param baseUrl - Helper base URL override.
 * @returns Array of available engine identifiers (may be empty).
 *
 * @example
 *   const engines = await getAvailableEngines();
 *   if (engines.includes('fish-speech')) {
 *     console.log('Fish Speech is ready');
 *   }
 */
export async function getAvailableEngines(
  baseUrl = DEFAULT_HELPER_BASE_URL,
): Promise<VoiceCloneEngine[]> {
  const data = await helperJson<EnginesResponse>(
    '/api/tts/clone/engines',
    undefined,
    baseUrl,
  );
  return data.engines;
}
