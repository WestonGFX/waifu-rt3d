import {
  type EnvironmentCreditRecord,
  type EnvironmentSceneMetadata,
  type EnvironmentSceneProfile,
} from '../types/companion.ts';

export interface EnvironmentLibraryResult {
  root: string;
  files: EnvironmentSceneProfile[];
}

interface EnvironmentLibraryResponse {
  root: string;
  files: EnvironmentSceneProfile[];
}

interface EnvironmentUploadResponse {
  root: string;
  file: EnvironmentSceneProfile;
}

function isCreditRecord(value: unknown): value is EnvironmentCreditRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.title === 'string';
}

function normalizeCategory(name: string): EnvironmentSceneProfile['category'] {
  const lower = name.toLowerCase();
  if (lower.includes('bedroom')) return 'bedroom';
  if (lower.includes('living')) return 'living-room';
  if (lower.includes('office')) return 'office';
  if (lower.includes('class')) return 'classroom';
  if (lower.includes('sci')) return 'sci-fi';
  if (lower.includes('dining') || lower.includes('room') || lower.includes('interior')) return 'interior';
  return 'unknown';
}

function isEnvironmentSceneProfile(value: unknown): value is EnvironmentSceneProfile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.url === 'string'
  );
}

function normalizeEnvironmentScene(scene: EnvironmentSceneProfile): EnvironmentSceneProfile {
  return {
    ...scene,
    source: scene.source ?? 'local-library',
    category: scene.category ?? normalizeCategory(scene.name),
    recommended: Boolean(scene.recommended),
    credits: Array.isArray(scene.credits) ? scene.credits.filter(isCreditRecord) : [],
  };
}

export async function fetchEnvironmentLibrary(signal?: AbortSignal): Promise<EnvironmentLibraryResult> {
  const response = await fetch('/api/environments', { signal });
  if (!response.ok) {
    throw new Error(`Environment library request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as Partial<EnvironmentLibraryResponse>;
  const files = Array.isArray(payload.files)
    ? payload.files.filter(isEnvironmentSceneProfile).map(normalizeEnvironmentScene)
    : [];

  return {
    root: typeof payload.root === 'string' ? payload.root : '',
    files: files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  };
}

export async function uploadEnvironmentFile(file: File): Promise<EnvironmentUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/environments/upload', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => ({})) as Partial<EnvironmentUploadResponse> & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Environment upload failed with status ${response.status}.`);
  }

  if (!payload.file || !isEnvironmentSceneProfile(payload.file)) {
    throw new Error('Environment upload response did not include a valid file descriptor.');
  }

  return {
    root: typeof payload.root === 'string' ? payload.root : '',
    file: normalizeEnvironmentScene(payload.file),
  };
}

export async function fetchEnvironmentMetadata(
  metadataPath: string,
  signal?: AbortSignal,
): Promise<EnvironmentSceneMetadata | null> {
  const response = await fetch(metadataPath, { signal });
  if (!response.ok) return null;
  return await response.json().catch(() => null) as EnvironmentSceneMetadata | null;
}
