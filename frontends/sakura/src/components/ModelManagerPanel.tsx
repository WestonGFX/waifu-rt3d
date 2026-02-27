import { useEffect, useState, useRef, useCallback } from 'react';
import { Cpu, Trash2, Play, Square, Download, RefreshCw, HardDrive, Loader } from 'lucide-react';
import { api } from '../lib/api';
import type { LMStudioModel, RecommendedModel, ModelFile, HardwareInfo, DownloadStatus } from '../lib/api';

type ModelCategory = 'llm' | 'coding' | 'vlm' | 'asr';

/** Category tabs shown at the top of the Recommended section. */
const CATEGORIES: { id: ModelCategory; label: string; icon: string }[] = [
  { id: 'llm', label: 'Chat / RP', icon: '🧠' },
  { id: 'coding', label: 'Coding', icon: '💻' },
  { id: 'vlm', label: 'Vision', icon: '👁️' },
  { id: 'asr', label: 'Speech', icon: '🎙️' },
];

/**
 * Detect the architecture family from a model ID string.
 *
 * @param modelId - HuggingFace model ID
 * @returns Short architecture label or null
 */
function detectArch(modelId: string): string | null {
  const id = modelId.toLowerCase();
  if (id.includes('llama-3') || id.includes('llama3')) return 'Llama 3';
  if (id.includes('llama-2') || id.includes('llama2')) return 'Llama 2';
  if (id.includes('mistral')) return 'Mistral';
  if (id.includes('mixtral')) return 'Mixtral';
  if (id.includes('gemma')) return 'Gemma';
  if (id.includes('qwen')) return 'Qwen';
  if (id.includes('deepseek')) return 'DeepSeek';
  if (id.includes('phi')) return 'Phi';
  if (id.includes('whisper')) return 'Whisper';
  if (id.includes('llava')) return 'LLaVA';
  if (id.includes('hermes')) return 'Hermes';
  return null;
}

/**
 * Color-code a VRAM requirement chip relative to available GPU VRAM.
 *
 * @param required - Required VRAM in MB
 * @param available - Available VRAM in MB (0 = unknown)
 * @returns CSS color string
 */
function vramColor(required: number, available: number): string {
  if (!available || !required) return 'var(--color-text-secondary)';
  const ratio = required / available;
  if (ratio <= 0.6) return '#4ade80';   // green — fits comfortably
  if (ratio <= 0.9) return '#facc15';   // yellow — tight fit
  return '#f87171';                      // red — won't fit
}

const inputStyle = {
  backgroundColor: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)',
} as const;

/**
 * LM Studio model management panel.
 *
 * Shows a hardware banner, installed model list with LOAD/UNLOAD/DELETE,
 * and a curated catalog of recommended models with one-click download via
 * quantization picker. Polls /api/models/download-status during active downloads.
 */
export function ModelManagerPanel() {
  const [activeCategory, setActiveCategory] = useState<ModelCategory>('llm');
  const [installed, setInstalled] = useState<LMStudioModel[]>([]);
  const [recommended, setRecommended] = useState<RecommendedModel[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus | null>(null);
  // Map of modelId → array of files fetched from HF
  const [fileOptions, setFileOptions] = useState<Record<string, ModelFile[]>>({});
  // Map of modelId → selected filename for install
  const [selectedFiles, setSelectedFiles] = useState<Record<string, string>>({});
  // Track which modelId is currently being loaded/unloaded/deleted
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [installedLoading, setInstalledLoading] = useState(true);
  const [recommendedLoading, setRecommendedLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Load installed models from LM Studio. */
  const loadInstalled = useCallback(async () => {
    setInstalledLoading(true);
    try {
      const models = await api.getInstalledModels();
      setInstalled(models);
    } catch {
      setInstalled([]);
    } finally {
      setInstalledLoading(false);
    }
  }, []);

  /** Load the curated recommended catalog for the given category. */
  const loadRecommended = useCallback(async (cat: ModelCategory) => {
    setRecommendedLoading(true);
    try {
      const models = await api.getRecommendedModels(cat);
      setRecommended(models);
    } catch {
      setRecommended([]);
    } finally {
      setRecommendedLoading(false);
    }
  }, []);

  // On mount: fetch hardware info + installed models
  useEffect(() => {
    api.getHardwareInfo().then(setHardware).catch(() => {});
    loadInstalled();
  }, [loadInstalled]);

  // Reload recommended whenever category changes
  useEffect(() => { loadRecommended(activeCategory); }, [activeCategory, loadRecommended]);

  // ── Download progress polling ─────────────────────────────────────────────

  /** Start polling /api/models/download-status every 1.5s. */
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.getDownloadStatus();
        setDownloadStatus(status);
        if (!status.active) {
          stopPolling();
          loadInstalled();
        }
      } catch {
        stopPolling();
      }
    }, 1500);
  }, [loadInstalled]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  // ── Model actions ─────────────────────────────────────────────────────────

  /**
   * Fetch GGUF file list for a model lazily (on first INSTALL click).
   * Picks Q4_K_M as the default selection when available.
   */
  const fetchFiles = async (modelId: string) => {
    if (fileOptions[modelId]) return; // already fetched
    try {
      const data = await api.getModelDetails(modelId);
      const files = (data.files ?? []).filter(f => f.rfilename.endsWith('.gguf'));
      setFileOptions(prev => ({ ...prev, [modelId]: files }));
      // Pre-select Q4_K_M if present, else the first file
      const q4 = files.find(f => f.rfilename.toLowerCase().includes('q4_k_m'));
      setSelectedFiles(prev => ({
        ...prev,
        [modelId]: prev[modelId] ?? (q4?.rfilename ?? files[0]?.rfilename ?? ''),
      }));
    } catch {
      setFileOptions(prev => ({ ...prev, [modelId]: [] }));
    }
  };

  /**
   * Start downloading a model file.
   * Fires POST /api/models/install then begins progress polling.
   */
  const installModel = async (modelId: string) => {
    const file = selectedFiles[modelId];
    if (!file) return;
    try {
      setActionInProgress(modelId);
      await api.installModel({ repo_id: modelId, file });
      startPolling();
    } catch (err) {
      console.error('Install failed:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  /**
   * Load a model into LM Studio VRAM.
   * The model ID comes from the installed list (LM Studio internal id).
   */
  const loadModel = async (id: string) => {
    setActionInProgress(id);
    try {
      await api.loadModel(id);
      await loadInstalled();
    } catch (err) {
      console.error('Load failed:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  /** Unload a model from VRAM without deleting it. */
  const unloadModel = async (id: string) => {
    setActionInProgress(id);
    try {
      await api.unloadModel(id);
      await loadInstalled();
    } catch (err) {
      console.error('Unload failed:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  /**
   * Permanently delete a model.
   * Uses a two-step inline confirm (button turns red → second click confirms).
   */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDeleteClick = async (m: LMStudioModel) => {
    if (confirmDelete !== m.id) {
      setConfirmDelete(m.id);
      return;
    }
    setConfirmDelete(null);
    setActionInProgress(m.id);
    try {
      const type = m.format ?? 'gguf';
      await api.deleteModel(type, m.id);
      await loadInstalled();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const isInstalled = (modelId: string) =>
    installed.some(m => m.id.includes(modelId.split('/').pop() ?? ''));

  const isLoaded = (m: LMStudioModel) => m.state === 'loaded';

  const vramMb = hardware?.vram_mb ?? 0;

  /** Format bytes to a human-readable MB/GB string. */
  function fmtSize(gb?: number): string {
    if (!gb) return '';
    if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`;
    return `${gb.toFixed(1)} GB`;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">

      {/* ── Hardware Banner ─────────────────────────────────────────────── */}
      {hardware && (
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          <Cpu size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--color-text-secondary)' }}>
            {hardware.gpu_name && (
              <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {hardware.gpu_name}
              </span>
            )}
            {hardware.vram_mb && (
              <span className="flex items-center gap-1">
                <HardDrive size={11} />
                {(hardware.vram_mb / 1024).toFixed(1)} GB VRAM
              </span>
            )}
            {hardware.ram_mb && (
              <span>{(hardware.ram_mb / 1024).toFixed(0)} GB RAM</span>
            )}
          </div>
        </div>
      )}

      {/* ── Active Download Progress ─────────────────────────────────────── */}
      {downloadStatus?.active && (
        <div
          className="rounded-lg px-3 py-2.5 text-xs flex flex-col gap-1.5"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-accent-soft, var(--color-border))' }}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
              Downloading {downloadStatus.file ?? '…'}
            </span>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {downloadStatus.progress ?? 0}%
              {downloadStatus.speed_mb_s ? ` · ${downloadStatus.speed_mb_s.toFixed(1)} MB/s` : ''}
              {downloadStatus.eta_s ? ` · ${Math.round(downloadStatus.eta_s)}s left` : ''}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${downloadStatus.progress ?? 0}%`,
                background: 'linear-gradient(90deg, var(--color-accent), #4ade80)',
              }}
            />
          </div>
          <p className="truncate" style={{ color: 'var(--color-text-secondary)' }}>
            {downloadStatus.repo_id}
          </p>
        </div>
      )}

      {/* ── Installed Models ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
            Installed Models
          </h4>
          <button
            onClick={loadInstalled}
            className="text-[11px] px-1.5 py-0.5 rounded flex items-center gap-1"
            style={inputStyle}
            title="Refresh installed list"
          >
            <RefreshCw size={10} />
          </button>
        </div>

        {installedLoading ? (
          <div className="text-xs py-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
            <Loader size={12} className="animate-spin" /> Loading…
          </div>
        ) : installed.length === 0 ? (
          <p className="text-xs py-3" style={{ color: 'var(--color-text-secondary)' }}>
            No models found — make sure LM Studio is running.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {installed.map(m => {
              const loaded = isLoaded(m);
              const busy = actionInProgress === m.id;
              const confirmingDelete = confirmDelete === m.id;
              return (
                <div
                  key={m.id}
                  className="rounded-lg px-3 py-2.5 flex items-start justify-between gap-2"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: `1px solid ${loaded ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                  }}
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                      {m.id.split('/').pop()}
                    </span>
                    <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {/* State badge */}
                      <span
                        className="px-1.5 py-0.5 rounded font-semibold uppercase"
                        style={{
                          color: loaded ? '#4ade80' : '#93c5fd',
                          border: `1px solid ${loaded ? 'rgba(74,222,128,0.3)' : 'rgba(147,197,253,0.3)'}`,
                        }}
                      >
                        {loaded ? 'Loaded' : 'Downloaded'}
                      </span>
                      {m.max_context_length && (
                        <span>{(m.max_context_length / 1000).toFixed(0)}k ctx</span>
                      )}
                      {m.architecture && <span>{m.architecture}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {busy ? (
                      <Loader size={14} className="animate-spin" style={{ color: 'var(--color-text-secondary)' }} />
                    ) : (
                      <>
                        {/* Load / Unload */}
                        {loaded ? (
                          <button
                            onClick={() => unloadModel(m.id)}
                            className="text-[11px] px-2 py-1 rounded flex items-center gap-1"
                            style={inputStyle}
                          >
                            <Square size={10} />
                            Unload
                          </button>
                        ) : (
                          <button
                            onClick={() => loadModel(m.id)}
                            className="text-[11px] px-2 py-1 rounded flex items-center gap-1"
                            style={inputStyle}
                          >
                            <Play size={10} />
                            Load
                          </button>
                        )}

                        {/* Delete (two-click confirm) */}
                        <button
                          onClick={() => handleDeleteClick(m)}
                          className="text-[11px] px-2 py-1 rounded flex items-center gap-1"
                          style={{ ...inputStyle, color: confirmingDelete ? '#f87171' : 'var(--color-text-secondary)' }}
                          title={confirmingDelete ? 'Click again to confirm delete' : 'Delete model'}
                        >
                          <Trash2 size={10} />
                          {confirmingDelete ? 'Confirm?' : 'Delete'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Recommended Models ───────────────────────────────────────────── */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-secondary)' }}>
          Recommended
        </h4>

        {/* Category tab pills */}
        <div className="flex gap-1 mb-3 flex-wrap">
          {CATEGORIES.map(cat => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className="text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all duration-150"
                style={{
                  background: active ? 'var(--color-accent-gradient)' : 'var(--color-surface)',
                  color: active ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                  border: `1px solid ${active ? 'transparent' : 'var(--color-border-subtle)'}`,
                  boxShadow: active ? '0 1px 4px var(--color-accent-soft)' : 'none',
                }}
              >
                <span>{cat.icon}</span>
                {cat.label}
              </button>
            );
          })}
        </div>

        {recommendedLoading ? (
          <div className="text-xs py-4 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
            <Loader size={12} className="animate-spin" /> Loading catalog…
          </div>
        ) : recommended.length === 0 ? (
          <p className="text-xs py-4" style={{ color: 'var(--color-text-secondary)' }}>
            No models found for this category.
          </p>
        ) : (
          <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
            {recommended.map(model => {
              const arch = detectArch(model.id);
              const alreadyInstalled = isInstalled(model.id);
              const files = fileOptions[model.id];
              const selectedFile = selectedFiles[model.id];
              const busy = actionInProgress === model.id;
              const isDownloading = downloadStatus?.active && downloadStatus.repo_id === model.id;

              return (
                <div
                  key={model.id}
                  className="rounded-lg p-3 flex flex-col gap-2"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: `1px solid ${alreadyInstalled ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                    opacity: alreadyInstalled ? 1 : 0.9,
                  }}
                >
                  {/* Name + chips row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {model.name ?? model.id.split('/').pop()}
                    </span>
                    {arch && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-secondary)' }}
                      >
                        {arch}
                      </span>
                    )}
                    {model.size_gb && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-secondary)' }}
                      >
                        {fmtSize(model.size_gb)}
                      </span>
                    )}
                    {model.vram_required_mb && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: 'var(--color-background)',
                          color: vramColor(model.vram_required_mb, vramMb),
                        }}
                      >
                        ~{(model.vram_required_mb / 1024).toFixed(1)} GB VRAM
                      </span>
                    )}
                    {alreadyInstalled && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase"
                        style={{ color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}
                      >
                        Installed
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {model.description && (
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                      {model.description}
                    </p>
                  )}

                  {/* Quantization picker + Download (only when files fetched) */}
                  {files && files.length > 0 && !alreadyInstalled && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={selectedFile ?? ''}
                        onChange={e => setSelectedFiles(prev => ({ ...prev, [model.id]: e.target.value }))}
                        className="text-xs px-2 py-1 rounded flex-1 min-w-[140px]"
                        style={inputStyle}
                      >
                        {files.map(f => (
                          <option key={f.rfilename} value={f.rfilename}>
                            {f.rfilename}
                            {f.size ? ` (${(f.size / 1024 / 1024 / 1024).toFixed(1)} GB)` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => installModel(model.id)}
                        disabled={busy || !selectedFile || !!isDownloading}
                        className="text-xs px-3 py-1 rounded flex items-center gap-1.5"
                        style={{
                          background: 'var(--color-accent-gradient)',
                          color: 'var(--color-accent-text)',
                          opacity: busy || isDownloading ? 0.5 : 1,
                          cursor: busy || isDownloading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {busy ? <Loader size={11} className="animate-spin" /> : <Download size={11} />}
                        {isDownloading ? 'Downloading…' : 'Download'}
                      </button>
                    </div>
                  )}

                  {/* Files list failed / empty */}
                  {files && files.length === 0 && !alreadyInstalled && (
                    <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      No GGUF files found for this model.
                    </p>
                  )}

                  {/* Action bar (Install button or already-installed badge) */}
                  {!alreadyInstalled && !files && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fetchFiles(model.id)}
                        disabled={busy}
                        className="text-xs px-3 py-1 rounded flex items-center gap-1.5"
                        style={{ ...inputStyle, opacity: busy ? 0.5 : 1 }}
                      >
                        <Download size={11} />
                        Install…
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
