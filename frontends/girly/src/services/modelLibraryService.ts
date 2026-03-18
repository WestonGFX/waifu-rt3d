export type ModelFileExtension = 'vrm' | 'glb';

export interface ModelLibraryItem {
  name: string;
  url: string;
  ext: ModelFileExtension;
}

interface ModelLibraryResponse {
  root: string;
  files: ModelLibraryItem[];
}

export interface ModelLibraryResult {
  root: string;
  files: ModelLibraryItem[];
}

interface ModelUploadResponse {
  root: string;
  file: ModelLibraryItem;
}

function isValidModelItem(item: unknown): item is ModelLibraryItem {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.url === 'string' &&
    (candidate.ext === 'vrm' || candidate.ext === 'glb')
  );
}

export async function fetchModelLibrary(signal?: AbortSignal): Promise<ModelLibraryResult> {
  const response = await fetch('/api/models', { signal });
  if (!response.ok) {
    throw new Error(`Model library request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as Partial<ModelLibraryResponse>;
  const files = Array.isArray(payload.files) ? payload.files.filter(isValidModelItem) : [];

  return {
    root: typeof payload.root === 'string' ? payload.root : '',
    files: files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  };
}

export async function uploadModelFile(file: File): Promise<ModelUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/models/upload', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => ({})) as Partial<ModelUploadResponse> & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Model upload failed with status ${response.status}.`);
  }

  if (!payload.file || !isValidModelItem(payload.file)) {
    throw new Error('Model upload response did not include a valid file descriptor.');
  }

  return {
    root: typeof payload.root === 'string' ? payload.root : '',
    file: payload.file,
  };
}
