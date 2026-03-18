/**
 * ModelUploader – mixed model selection UI.
 *
 * Supports two flows:
 *   1) Pick a local file with the browser file picker (object URL).
 *   2) Load a model from the local model directory exposed by the Vite API.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useModel } from '../../context/ModelContext.tsx';
import {
  fetchModelLibrary,
  type ModelLibraryItem,
  uploadModelFile,
} from '../../services/modelLibraryService.ts';

export default function ModelUploader() {
  const { dispatch } = useModel();
  const [libraryItems, setLibraryItems] = useState<ModelLibraryItem[]>([]);
  const [selectedModelUrl, setSelectedModelUrl] = useState('');
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryRoot, setLibraryRoot] = useState('');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** Holds the current object URL so we can revoke it on the next upload. */
  const currentUrlRef = useRef<string | null>(null);

  const loadLibrary = useCallback(async (signal?: AbortSignal) => {
    setIsLibraryLoading(true);
    setLibraryError(null);
    try {
      const result = await fetchModelLibrary(signal);
      setLibraryItems(result.files);
      setLibraryRoot(result.root);
      setSelectedModelUrl((previous) => (
        result.files.some((item) => item.url === previous) ? previous : (result.files[0]?.url ?? '')
      ));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const message = error instanceof Error ? error.message : 'Failed to load local model library.';
      setLibraryItems([]);
      setSelectedModelUrl('');
      setLibraryRoot('');
      setLibraryError(message);
    } finally {
      setIsLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadLibrary(controller.signal);
    return () => controller.abort();
  }, [loadLibrary]);

  /**
   * Determines whether a file is a Live2D model by checking its extension.
   *
   * @param fileName - The file name to check.
   * @returns `true` if the file is a .model3.json or .model.json Live2D descriptor.
   */
  const isLive2dFile = useCallback((fileName: string): boolean => {
    const lower = fileName.toLowerCase();
    return lower.endsWith('.model3.json') || lower.endsWith('.model.json');
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Route Live2D model descriptors to the Live2D model URL instead of VRM
    if (isLive2dFile(file.name)) {
      const url = URL.createObjectURL(file);
      dispatch({ type: 'SET_LIVE2D_MODEL_URL', payload: url });
      setUploadStatus(`Live2D model ${file.name} loaded. Switch to Live2D render mode to see it.`);
      e.target.value = '';
      return;
    }

    setUploadStatus(`Importing ${file.name}…`);
    setIsUploading(true);

    try {
      const result = await uploadModelFile(file);
      setLibraryRoot(result.root);
      setSelectedModelUrl(result.file.url);
      dispatch({ type: 'SET_MODEL_URL', payload: result.file.url });
      setUploadStatus(`${result.file.name} was imported into AnimeGirly's local model library and is loading now.`);
      await loadLibrary();
    } catch (error) {
      // Revoke the previous object URL to free memory.
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }

      const url = URL.createObjectURL(file);
      currentUrlRef.current = url;
      dispatch({ type: 'SET_MODEL_URL', payload: url });
      const message = error instanceof Error ? error.message : 'Model import failed.';
      setUploadStatus(`${message} Falling back to a session-only load for ${file.name}.`);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  }, [dispatch, isLive2dFile, loadLibrary]);

  const handleLoadSelected = useCallback(() => {
    if (!selectedModelUrl) return;
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
    dispatch({ type: 'SET_MODEL_URL', payload: selectedModelUrl });
  }, [dispatch, selectedModelUrl]);

  const selectedFile = libraryItems.find((item) => item.url === selectedModelUrl);
  const handleCopyPath = useCallback(async () => {
    if (!libraryRoot || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(libraryRoot);
    setUploadStatus('Copied the local model library path to your clipboard.');
  }, [libraryRoot]);

  return (
    <div className="flex flex-col gap-2 rounded-anime border border-anime-100 bg-white/60 p-2.5">
      <label className="text-xs font-semibold text-text-secondary">3D Model</label>
      <p className="text-xs text-text-muted">
        Import a <span className="font-semibold">.glb</span>,{' '}
        <span className="font-semibold">.vrm</span>, or{' '}
        <span className="font-semibold">.model3.json</span> (Live2D) file. VRM/GLB files go to the local model library; Live2D descriptors load directly.
      </p>

      <input
        id="animegirly-model-upload"
        ref={fileInputRef}
        type="file"
        accept=".glb,.vrm,.json"
        onChange={handleFileChange}
        className="sr-only"
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={[
          'inline-flex w-fit cursor-pointer items-center rounded-pill border px-3 py-1.5 text-xs transition-colors',
          isUploading
            ? 'cursor-wait border-anime-200 bg-anime-100 text-anime-500'
            : 'border-anime-300 bg-anime-50 text-anime-600 hover:bg-anime-100',
        ].join(' ')}
        title="Pick a VRM or GLB file to import into AnimeGirly's local avatar library."
      >
        {isUploading ? 'Importing…' : 'Import model…'}
      </button>

      {uploadStatus && (
        <div className="rounded-anime border border-anime-100 bg-anime-50/60 px-3 py-2 text-xs text-text-secondary">
          {uploadStatus}
        </div>
      )}

      <div className="pt-2 border-t border-anime-100 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-text-secondary">Local Model Library</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyPath()}
              disabled={!libraryRoot || !navigator.clipboard?.writeText}
              className="text-[11px] px-2 py-1 rounded-pill border border-anime-200 text-anime-500 bg-white hover:bg-anime-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              title="Copy the watched model folder path."
            >
              Copy path
            </button>
            <button
              type="button"
              onClick={() => void loadLibrary()}
              disabled={isLibraryLoading}
              className="text-[11px] px-2 py-1 rounded-pill border border-anime-200 text-anime-500 bg-white hover:bg-anime-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {isLibraryLoading && (
          <p className="text-xs text-text-muted">Loading local models…</p>
        )}

        {!isLibraryLoading && libraryRoot && (
          <div className="rounded-anime border border-anime-100 bg-anime-50/60 px-3 py-2 text-xs text-text-muted">
            <div className="font-medium text-text-primary">Manual folder</div>
            <div className="mt-1 break-all">{libraryRoot}</div>
            <div className="mt-2">
              AnimeGirly creates this folder automatically. You can either import files with the button above or manually drop <span className="font-semibold">.vrm</span> / <span className="font-semibold">.glb</span> files here and press <span className="font-semibold">Refresh</span>. You can override the watched folder with the <span className="font-semibold">ANIMEGIRLY_MODELS_DIR</span> environment variable when starting Vite.
            </div>
          </div>
        )}

        {!isLibraryLoading && libraryError && (
          <p className="text-xs text-rose-pastel-400">
            {libraryError}
          </p>
        )}

        {!isLibraryLoading && !libraryError && libraryItems.length === 0 && (
          <p className="text-xs text-text-muted">
            No <span className="font-semibold">.vrm</span> or{' '}
            <span className="font-semibold">.glb</span> files found in the local model directory yet.
          </p>
        )}

        {!isLibraryLoading && !libraryError && libraryItems.length > 0 && (
          <>
            <select
              value={selectedModelUrl}
              onChange={(event) => setSelectedModelUrl(event.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-anime-200 bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-anime-300"
            >
              {libraryItems.map((item) => (
                <option key={item.url} value={item.url}>
                  {item.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleLoadSelected}
              disabled={!selectedModelUrl}
              className="text-xs px-3 py-1.5 rounded-pill border border-anime-300 text-anime-600 bg-anime-50 hover:bg-anime-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Load Selected {selectedFile ? `(${selectedFile.ext.toUpperCase()})` : ''}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
