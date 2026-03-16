import { useEffect, useState, useCallback } from 'react';
import { Cpu, ExternalLink, RefreshCw, HardDrive, Loader, AlertTriangle, Monitor } from 'lucide-react';
import { api } from '../lib/api';
import type { LMStudioModel, RecommendedModel, HardwareInfo } from '../lib/api';

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
 * @param requiredGb - Required VRAM in GB
 * @param availableGb - Available VRAM in GB (0 = unknown)
 * @returns CSS color string
 */
function vramFitColor(requiredGb: number, availableGb: number): string {
  if (!availableGb || !requiredGb) return 'var(--color-text-secondary)';
  const ratio = requiredGb / availableGb;
  if (ratio <= 0.6) return '#4ade80';   // green — fits comfortably
  if (ratio <= 0.85) return '#facc15';  // yellow — tight fit
  if (ratio <= 1.0) return '#f97316';   // orange — very tight, may need offload
  return '#f87171';                      // red — won't fit, CPU offload needed
}

/**
 * Get a human-readable VRAM fit label and warning.
 *
 * @param requiredGb - VRAM the model needs in GB
 * @param availableGb - User's total VRAM in GB
 * @returns Object with label and optional warning message
 */
function vramFitInfo(requiredGb: number, availableGb: number): { label: string; warning?: string } {
  if (!availableGb || !requiredGb) return { label: '' };
  const ratio = requiredGb / availableGb;
  if (ratio <= 0.6) return { label: 'Fits easily' };
  if (ratio <= 0.85) return { label: 'Tight fit' };
  if (ratio <= 1.0) return { label: 'Very tight', warning: 'May need partial CPU offload, which reduces speed significantly.' };
  return {
    label: 'Too large',
    warning: `Needs ${requiredGb.toFixed(1)} GB but you have ${availableGb.toFixed(1)} GB. CPU offload would make this too slow to be usable.`,
  };
}

/**
 * Detect whether this system should use MLX (Apple Silicon) or GGUF (NVIDIA/CPU).
 *
 * @param hw - Hardware info from the backend
 * @returns Recommended model format and explanation
 */
function detectModelFormat(hw: HardwareInfo): { format: string; reason: string } {
  const isDarwin = hw.platform === 'darwin';
  const isArm = hw.arch?.toLowerCase().includes('arm');
  if (isDarwin && isArm) {
    return { format: 'MLX', reason: 'Apple Silicon detected — MLX models run natively on unified memory' };
  }
  if (hw.gpu?.toLowerCase().includes('nvidia') || hw.gpu?.toLowerCase().includes('geforce') || hw.gpu?.toLowerCase().includes('rtx')) {
    return { format: 'GGUF', reason: 'NVIDIA GPU detected — use GGUF format in LM Studio' };
  }
  if (hw.gpu?.toLowerCase().includes('amd') || hw.gpu?.toLowerCase().includes('radeon')) {
    return { format: 'GGUF', reason: 'AMD GPU detected — use GGUF with ROCm or Vulkan backend' };
  }
  return { format: 'GGUF', reason: 'Use GGUF format for broadest compatibility' };
}

/**
 * Suggest a quantization level based on available VRAM and model parameter count.
 *
 * @param vramGb - Available VRAM in GB
 * @returns Recommended quant and explanation
 */
function suggestQuant(vramGb: number): { quant: string; note: string } {
  if (vramGb >= 24) return { quant: 'Q5_K_M or Q6_K', note: 'Plenty of VRAM — higher quants give better quality' };
  if (vramGb >= 16) return { quant: 'Q4_K_M', note: 'Sweet spot for 16GB — best quality-to-size ratio' };
  if (vramGb >= 8) return { quant: 'IQ4_XS or Q4_K_M', note: 'Tight VRAM — use smaller quants for larger models' };
  return { quant: 'IQ3_XXS or IQ4_XS', note: 'Limited VRAM — aggressive quantization needed' };
}

/** Format GB to a human-readable string. */
function fmtSize(gb?: number): string {
  if (!gb) return '';
  if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`;
  return `${gb.toFixed(1)} GB`;
}

/**
 * Hardware-aware model recommendation panel.
 *
 * Shows the user's hardware profile, recommended model format (MLX vs GGUF),
 * suggested quantization, and a curated catalog of models with HuggingFace links.
 * Models are color-coded by VRAM fit. Users install models via their local AI
 * backend (LM Studio, Ollama) — this panel is for discovery and guidance.
 *
 * Also shows currently installed/loaded models from the connected backend (read-only).
 */
export function ModelManagerPanel() {
  const [activeCategory, setActiveCategory] = useState<ModelCategory>('llm');
  const [installed, setInstalled] = useState<LMStudioModel[]>([]);
  const [recommended, setRecommended] = useState<RecommendedModel[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [installedLoading, setInstalledLoading] = useState(true);
  const [recommendedLoading, setRecommendedLoading] = useState(true);

  /** Load installed models from LM Studio / Ollama (read-only). */
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

  // ── Derived values ────────────────────────────────────────────────────────

  const vramGb = hardware?.vram_gb ?? 0;
  const formatInfo = hardware ? detectModelFormat(hardware) : null;
  const quantInfo = vramGb ? suggestQuant(vramGb) : null;
  const isLoaded = (m: LMStudioModel) => m.state === 'loaded';

  const isInstalled = (modelId: string) =>
    installed.some(m => m.id.includes(modelId.split('/').pop() ?? ''));

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">

      {/* ── Hardware Detection Banner ────────────────────────────────────── */}
      {hardware && (
        <div
          className="rounded-lg px-3 py-3 text-xs flex flex-col gap-2"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          {/* System specs row */}
          <div className="flex items-center gap-3">
            <Cpu size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--color-text-secondary)' }}>
              {hardware.gpu && (
                <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {hardware.gpu}
                </span>
              )}
              {vramGb > 0 && (
                <span className="flex items-center gap-1">
                  <HardDrive size={11} />
                  {vramGb.toFixed(1)} GB VRAM
                </span>
              )}
              {hardware.ram_gb && (
                <span>{hardware.ram_gb.toFixed(0)} GB RAM</span>
              )}
            </div>
          </div>

          {/* Format + quant recommendation */}
          {(formatInfo || quantInfo) && (
            <div
              className="rounded px-2.5 py-2 flex flex-col gap-1"
              style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)' }}
            >
              {formatInfo && (
                <div className="flex items-center gap-2">
                  <Monitor size={11} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                  <span>
                    <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                      {formatInfo.format}
                    </span>
                    {' '}<span style={{ color: 'var(--color-text-secondary)' }}>{formatInfo.reason}</span>
                  </span>
                </div>
              )}
              {quantInfo && (
                <div className="flex items-center gap-2">
                  <HardDrive size={11} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                  <span>
                    Suggested quant:{' '}
                    <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      {quantInfo.quant}
                    </span>
                    {' '}<span style={{ color: 'var(--color-text-tertiary)' }}>— {quantInfo.note}</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Currently Loaded (read-only) ─────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
            Currently Loaded
          </h4>
          <button
            onClick={loadInstalled}
            className="text-[11px] px-1.5 py-0.5 rounded flex items-center gap-1"
            style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            title="Refresh from LM Studio / Ollama"
          >
            <RefreshCw size={10} />
          </button>
        </div>

        {installedLoading ? (
          <div className="text-xs py-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
            <Loader size={12} className="animate-spin" /> Checking…
          </div>
        ) : installed.length === 0 ? (
          <p className="text-xs py-3" style={{ color: 'var(--color-text-secondary)' }}>
            No models found. Make sure LM Studio or Ollama is running.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {installed.map(m => {
              const loaded = isLoaded(m);
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
                      <span
                        className="px-1.5 py-0.5 rounded font-semibold uppercase"
                        style={{
                          color: loaded ? '#4ade80' : '#93c5fd',
                          border: `1px solid ${loaded ? 'rgba(74,222,128,0.3)' : 'rgba(147,197,253,0.3)'}`,
                        }}
                      >
                        {loaded ? 'Active' : 'Ready'}
                      </span>
                      {m.max_context_length && (
                        <span>{(m.max_context_length / 1000).toFixed(0)}k ctx</span>
                      )}
                      {m.architecture && <span>{m.architecture}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Recommended Models (catalog with HF links) ───────────────────── */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          Recommended Models
        </h4>
        <p className="text-[10px] mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
          Install these in LM Studio or Ollama. Click a model name to view on HuggingFace.
        </p>

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
              // VRAM fit calculation
              const modelVramGb = model.vram_required_mb ? model.vram_required_mb / 1024 : (model.size_gb ?? 0);
              const fitInfo = modelVramGb && vramGb ? vramFitInfo(modelVramGb, vramGb) : null;
              const fitColor = modelVramGb && vramGb ? vramFitColor(modelVramGb, vramGb) : 'var(--color-text-secondary)';

              return (
                <div
                  key={model.id}
                  className="rounded-lg p-3 flex flex-col gap-2"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: `1px solid ${alreadyInstalled ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                  }}
                >
                  {/* Name row — clickable HF link */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <a
                      href={`https://huggingface.co/${model.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium flex items-center gap-1 hover:underline"
                      style={{ color: 'var(--color-accent)' }}
                      title={`View ${model.id} on HuggingFace`}
                    >
                      {model.name ?? model.id.split('/').pop()}
                      <ExternalLink size={10} style={{ opacity: 0.6 }} />
                    </a>
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
                    {/* VRAM requirement with fit indicator */}
                    {modelVramGb > 0 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ backgroundColor: 'var(--color-background)', color: fitColor }}
                        title={fitInfo?.warning || fitInfo?.label || ''}
                      >
                        ~{modelVramGb.toFixed(1)} GB
                        {fitInfo && ` · ${fitInfo.label}`}
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

                  {/* CPU offload warning */}
                  {fitInfo?.warning && (
                    <div
                      className="flex items-start gap-2 text-[11px] px-2.5 py-1.5 rounded"
                      style={{
                        backgroundColor: 'color-mix(in srgb, #f87171 8%, var(--color-background))',
                        border: '1px solid color-mix(in srgb, #f87171 20%, var(--color-border))',
                        color: '#f87171',
                      }}
                    >
                      <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>{fitInfo.warning}</span>
                    </div>
                  )}

                  {/* Tags (if any) */}
                  {model.tags && model.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {model.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-[9px] px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-tertiary)' }}
                        >
                          {tag}
                        </span>
                      ))}
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
