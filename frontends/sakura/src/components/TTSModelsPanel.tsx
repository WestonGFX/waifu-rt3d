import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Download, Trash2, Play, RefreshCw, Package,
  Cpu, Monitor, Check, Zap, Mic, Volume2,
  ChevronDown, ChevronUp, Square, CircleDot,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import type { TTSModel, DownloadProgress } from '../lib/types';

/** Engine category for the filter bar. */
type CategoryFilter = 'all' | 'cpu' | 'gpu' | 'cloning' | 'cloud';
type LanguageFilter = 'all' | string;

/** Map of engine → whether it's cloud-only (no local install). */
const CLOUD_ENGINES = new Set(['edge-tts', 'elevenlabs', 'fish_audio']);

/** Derive a category label for display in the engine badge. */
function getEngineCategory(model: TTSModel): 'cpu' | 'gpu' | 'cloud' {
  if (CLOUD_ENGINES.has(model.engine)) return 'cloud';
  if (model.requirements?.gpu_required) return 'gpu';
  return 'cpu';
}

/** Check if a model matches the selected category filter. */
function matchesCategory(model: TTSModel, filter: CategoryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'cloning') return !!model.features?.voice_cloning;
  return getEngineCategory(model) === filter;
}

/** Badge color per engine (uses theme accent for known engines, neutral for others). */
const ENGINE_COLORS: Record<string, string> = {
  kokoro: '#22d3ee',
  piper: '#4ade80',
  'edge-tts': '#60a5fa',
  elevenlabs: '#a78bfa',
  fish_audio: '#f472b6',
  chatterbox: '#fb923c',
  gptsovits: '#facc15',
  xtts: '#f87171',
  kitten: '#34d399',
  melotts: '#2dd4bf',
  bark: '#c084fc',
  f5tts: '#e879f9',
  metavoice: '#818cf8',
  styletts2: '#fb7185',
  parler: '#fbbf24',
  dia: '#f97316',
  cosyvoice: '#38bdf8',
};

/** Render star ratings as filled/unfilled characters. */
function Stars({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="text-[10px] tracking-wide" style={{ color: 'var(--color-warning, #facc15)' }}>
      {'★'.repeat(Math.min(count, max))}
      <span style={{ opacity: 0.3 }}>{'★'.repeat(Math.max(0, max - count))}</span>
    </span>
  );
}

/**
 * TTS voice model management panel — browse, install, preview, and activate voices.
 *
 * Displays the full voice catalog from /api/tts/models with:
 * - Dynamic engine category filters (CPU / GPU / Voice Cloning / Cloud)
 * - Hardware requirements, quality/speed ratings, and feature badges per card
 * - Active voice indicator (reads config.tts.provider + voice_id)
 * - Preview via sample_url or live synthesis, greyed out when unavailable
 * - Install/delete with SSE progress tracking
 */
export function TTSModelsPanel() {
  const [models, setModels] = useState<TTSModel[]>([]);
  const [totalMb, setTotalMb] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [langFilter, setLangFilter] = useState<LanguageFilter>('all');
  const [engineFilter, setEngineFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedSetup, setExpandedSetup] = useState<string | null>(null);

  const config = useAppStore((s) => s.config);
  const saveConfig = useAppStore((s) => s.saveConfig);

  // Derive active voice from config (supports both new and legacy config shapes)
  const activeTtsProvider = (
    (config as Record<string, unknown>)?.services as Record<string, unknown>
  )?.tts
    ? ((((config as Record<string, unknown>)?.services as Record<string, unknown>)?.tts as Record<string, unknown>)?.active_provider as string) || ''
    : ((config as Record<string, unknown>)?.tts as Record<string, unknown>)?.provider as string || '';

  // setActiveVoice always writes to config.tts.voice_id (legacy shape),
  // so read from there regardless of which provider path is active.
  const activeTtsVoiceId = ((config as Record<string, unknown>)?.tts as Record<string, unknown>)?.voice_id as string || '';

  const loadModels = useCallback(async () => {
    try {
      const data = await api.getTTSModels();
      setModels(data.models || []);
      setTotalMb(data.total_installed_mb || 0);
    } catch (err) {
      console.error('Failed to load TTS models:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadModels(); }, [loadModels]);

  const installedCount = models.filter(m => m.installed).length;

  // Derive unique values for filter dropdowns
  const languages = [...new Set(models.map(m => m.language))].sort();
  const engines = [...new Set(models.map(m => m.engine))].sort();

  // Filter models
  const filtered = models.filter(m => {
    if (!matchesCategory(m, categoryFilter)) return false;
    if (engineFilter !== 'all' && m.engine !== engineFilter) return false;
    if (langFilter !== 'all' && m.language !== langFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.name.toLowerCase().includes(q)
        || m.description.toLowerCase().includes(q)
        || m.engine.toLowerCase().includes(q);
    }
    return true;
  });

  // Sort: active first, then installed, then by engine + name
  const sorted = [...filtered].sort((a, b) => {
    const aActive = isActiveVoice(a) ? 0 : 1;
    const bActive = isActiveVoice(b) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    const engineCmp = a.engine.localeCompare(b.engine);
    if (engineCmp !== 0) return engineCmp;
    return a.name.localeCompare(b.name);
  });

  /** Check if a model is the currently active voice. */
  function isActiveVoice(model: TTSModel): boolean {
    if (activeTtsProvider && model.engine === activeTtsProvider) {
      if (!activeTtsVoiceId) return true;
      return model.voice_id === activeTtsVoiceId;
    }
    return false;
  }

  /** Set this model as the active voice in config. */
  const setActiveVoice = async (model: TTSModel) => {
    try {
      await saveConfig({
        tts: {
          ...((config as Record<string, unknown>)?.tts as Record<string, unknown> || {}),
          provider: model.engine,
          voice_id: model.voice_id,
        },
      });
    } catch (err) {
      console.error('Failed to set active voice:', err);
    }
  };

  /** Start installing a model and track progress via SSE. */
  const installModel = async (modelId: string) => {
    try {
      await api.installTTSModel(modelId);
      const evtSource = new EventSource('/api/tts/models/install/status');
      evtSource.onmessage = (e) => {
        try {
          const progress: DownloadProgress = JSON.parse(e.data);
          setDownloadProgress(progress);
          if (progress.status === 'complete' || progress.status === 'error') {
            evtSource.close();
            setDownloadProgress(null);
            loadModels();
          }
        } catch { /* ignore parse errors */ }
      };
      evtSource.onerror = () => {
        evtSource.close();
        setDownloadProgress(null);
        loadModels();
      };
    } catch (err) {
      console.error('Install failed:', err);
    }
  };

  /** Delete an installed model. */
  const deleteModel = async (modelId: string) => {
    if (!confirm(`Delete voice "${modelId}"? The files will be removed.`)) return;
    try {
      await api.deleteTTSModel(modelId);
      loadModels();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  /** Refresh catalog from remote. */
  const refreshCatalog = async () => {
    setRefreshing(true);
    try {
      await api.refreshTTSCatalog();
      await loadModels();
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  /** Play a voice preview — uses sample_url if available, otherwise live synthesis. */
  const playPreview = async (model: TTSModel) => {
    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playingId === model.id) {
      setPlayingId(null);
      return;
    }

    const vol = (config as Record<string, unknown>)?.tts_volume;
    const volume = typeof vol === 'number' ? Number(vol) : 1.0;

    // Try sample_url first
    if (model.sample_url) {
      const audio = new Audio(model.sample_url);
      audio.volume = volume;
      audioRef.current = audio;
      setPlayingId(model.id);
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
      audio.play().catch(() => setPlayingId(null));
      return;
    }

    // For installed models, try live synthesis
    if (model.installed || !model.requirements?.gpu_required) {
      try {
        setPlayingId(model.id);
        const resp = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: 'Hello! This is a voice preview.',
            provider: model.engine,
            voice_id: model.voice_id,
          }),
        });
        if (!resp.ok) throw new Error(`TTS failed: ${resp.status}`);
        const data = await resp.json();
        if (data.ok && data.url) {
          const audio = new Audio(data.url);
          audio.volume = volume;
          audioRef.current = audio;
          audio.onended = () => setPlayingId(null);
          audio.onerror = () => setPlayingId(null);
          audio.play().catch(() => setPlayingId(null));
        } else {
          setPlayingId(null);
        }
      } catch {
        setPlayingId(null);
      }
      return;
    }

    // Can't preview
    setPlayingId(null);
  };

  /** Whether a model can be previewed. */
  function canPreview(model: TTSModel): boolean {
    if (model.sample_url) return true;
    if (model.installed) return true;
    // Cloud engines are always "available" (no local install needed)
    if (CLOUD_ENGINES.has(model.engine)) return true;
    // CPU engines might be available if server is running
    if (!model.requirements?.gpu_required) return true;
    return false;
  }

  const selectStyle = {
    backgroundColor: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Loading voice catalog...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Package size={16} style={{ color: 'var(--color-accent)' }} />
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {installedCount} installed / {models.length} available
            {totalMb > 0 && ` · ${totalMb.toFixed(1)} MB`}
          </span>
        </div>
        <button
          onClick={refreshCatalog}
          disabled={refreshing}
          className="text-xs px-2 py-1 rounded flex items-center gap-1"
          style={{
            ...selectStyle,
            opacity: refreshing ? 0.5 : 1,
            cursor: refreshing ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {([
          ['all', 'All'],
          ['cpu', 'CPU'],
          ['gpu', 'GPU'],
          ['cloning', 'Voice Cloning'],
          ['cloud', 'Cloud'],
        ] as [CategoryFilter, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategoryFilter(key)}
            className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
            style={{
              backgroundColor: categoryFilter === key ? 'var(--color-accent)' : 'var(--color-surface)',
              color: categoryFilter === key ? 'var(--color-background)' : 'var(--color-text-secondary)',
              border: `1px solid ${categoryFilter === key ? 'var(--color-accent)' : 'var(--color-border)'}`,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Engine + Language + Search filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={engineFilter} onChange={(e) => setEngineFilter(e.target.value)}
          className="text-xs px-2 py-1 rounded" style={selectStyle}>
          <option value="all">All Engines ({engines.length})</option>
          {engines.map(e => (
            <option key={e} value={e}>
              {e} ({models.filter(m => m.engine === e).length})
            </option>
          ))}
        </select>
        <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)}
          className="text-xs px-2 py-1 rounded" style={selectStyle}>
          <option value="all">All Languages</option>
          {languages.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <input
          type="text" placeholder="Search voices..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs px-2 py-1 rounded flex-1 min-w-[120px]" style={selectStyle}
        />
      </div>

      {/* Voice card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
        {sorted.map(model => {
          const isDownloading = downloadProgress?.model_id === model.id && downloadProgress.status === 'downloading';
          const pct = isDownloading ? Math.round((downloadProgress?.progress || 0) * 100) : 0;
          const active = isActiveVoice(model);
          const engineColor = ENGINE_COLORS[model.engine] || 'var(--color-text-secondary)';
          const category = getEngineCategory(model);
          const showSetup = expandedSetup === model.id;

          return (
            <div
              key={model.id}
              className="rounded-lg p-3 flex flex-col gap-1.5 transition-all"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: active
                  ? `2px solid var(--color-accent)`
                  : `1px solid ${model.installed ? engineColor + '44' : 'var(--color-border)'}`,
                boxShadow: active ? `0 0 12px ${engineColor}33` : undefined,
              }}
            >
              {/* Row 1: Name + badges */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {model.name}
                  </span>
                  {active && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        color: 'var(--color-background)',
                      }}>
                      ACTIVE
                    </span>
                  )}
                  {model.installed && !active && (
                    <span className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: '#22c55e22',
                        color: '#4ade80',
                      }}>
                      <Check size={8} /> Installed
                    </span>
                  )}
                </div>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0"
                  style={{
                    color: engineColor,
                    border: `1px solid ${engineColor}44`,
                  }}
                >
                  {model.engine}
                </span>
              </div>

              {/* Row 2: Meta — gender, language, size, hw category */}
              <div className="text-[11px] flex flex-wrap items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                <span>{model.gender === 'female' ? 'F' : 'M'}</span>
                <span>{model.language}</span>
                <span>{model.size_mb < 1
                  ? `${(model.size_mb * 1024).toFixed(0)} KB`
                  : `${model.size_mb.toFixed(0)} MB`}
                </span>
                {/* Hardware badge */}
                <span className="flex items-center gap-0.5" style={{
                  color: category === 'gpu' ? '#f59e0b' : category === 'cloud' ? '#60a5fa' : '#4ade80',
                }}>
                  {category === 'gpu' ? <Monitor size={10} /> : category === 'cloud' ? <Zap size={10} /> : <Cpu size={10} />}
                  {category === 'gpu' && model.requirements?.min_vram
                    ? `GPU ${model.requirements.min_vram}GB+`
                    : category === 'cloud' ? 'Cloud' : 'CPU'}
                </span>
              </div>

              {/* Row 3: Quality + Speed stars */}
              {(model.quality_stars || model.speed_stars) && (
                <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {model.quality_stars != null && (
                    <span className="flex items-center gap-1">
                      <Volume2 size={9} />
                      <Stars count={model.quality_stars} />
                    </span>
                  )}
                  {model.speed_stars != null && (
                    <span className="flex items-center gap-1">
                      <Zap size={9} />
                      <Stars count={model.speed_stars} />
                    </span>
                  )}
                </div>
              )}

              {/* Row 4: Description */}
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {model.description}
              </p>

              {/* Row 5: Feature badges + tags */}
              <div className="flex flex-wrap gap-1">
                {model.features?.voice_cloning && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5"
                    style={{ backgroundColor: '#7c3aed22', color: '#a78bfa' }}>
                    <Mic size={8} /> Cloning
                  </span>
                )}
                {model.features?.nonverbal_sounds && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: '#f59e0b22', color: '#fbbf24' }}>
                    Nonverbal
                  </span>
                )}
                {model.features?.streaming && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: '#3b82f622', color: '#60a5fa' }}>
                    Streaming
                  </span>
                )}
                {model.features?.emotion_control && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: '#ec489922', color: '#f472b6' }}>
                    Emotion
                  </span>
                )}
                {model.tags?.length > 0 && model.tags.map(tag => (
                  <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-secondary)' }}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* Hardware requirement note */}
              {model.requirements?.note && (
                <p className="text-[10px] italic" style={{ color: 'var(--color-warning, #facc15)', opacity: 0.8 }}>
                  {model.requirements.note}
                </p>
              )}

              {/* Expandable setup instructions */}
              {model.setup && (model.setup.docker || model.setup.pip) && (
                <div>
                  <button
                    onClick={() => setExpandedSetup(showSetup ? null : model.id)}
                    className="text-[10px] flex items-center gap-1 cursor-pointer"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    {showSetup ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    Setup instructions
                  </button>
                  {showSetup && (
                    <div className="mt-1 p-2 rounded text-[10px] font-mono space-y-1"
                      style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-secondary)' }}>
                      {model.setup.pip && <div><span style={{ color: 'var(--color-accent)' }}>pip:</span> {model.setup.pip}</div>}
                      {model.setup.docker && <div><span style={{ color: 'var(--color-accent)' }}>docker:</span> {model.setup.docker}</div>}
                      {model.setup.docs_url && (
                        <div>
                          <a href={model.setup.docs_url} target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
                            Documentation
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Download progress bar */}
              {isDownloading && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                    <div className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, background: `linear-gradient(90deg, var(--color-accent), ${engineColor})` }} />
                  </div>
                  <span className="text-[10px] w-8 text-right" style={{ color: 'var(--color-text-secondary)' }}>
                    {pct}%
                  </span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                {/* Preview */}
                <button
                  onClick={() => playPreview(model)}
                  disabled={!canPreview(model) || isDownloading}
                  className="text-[11px] px-2 py-1 rounded flex items-center gap-1"
                  style={{
                    ...selectStyle,
                    opacity: canPreview(model) ? 1 : 0.4,
                    cursor: canPreview(model) ? 'pointer' : 'not-allowed',
                  }}
                  title={canPreview(model) ? 'Preview this voice' : 'Engine not available — install or start the server'}
                >
                  {playingId === model.id ? <Square size={10} /> : <Play size={10} />}
                  {playingId === model.id ? 'Stop' : 'Preview'}
                </button>

                {/* Install / Delete */}
                {model.installed ? (
                  <button
                    onClick={() => deleteModel(model.id)}
                    className="text-[11px] px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
                    style={{ ...selectStyle, color: '#f87171' }}
                  >
                    <Trash2 size={10} />
                    Delete
                  </button>
                ) : (
                  // Only show install for models with downloadable files
                  model.size_mb > 0 && (
                    <button
                      onClick={() => installModel(model.id)}
                      disabled={isDownloading}
                      className="text-[11px] px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
                      style={{ ...selectStyle, opacity: isDownloading ? 0.5 : 1 }}
                    >
                      <Download size={10} />
                      {isDownloading ? 'Installing...' : 'Install'}
                    </button>
                  )
                )}

                {/* Set as active */}
                {!active && (model.installed || CLOUD_ENGINES.has(model.engine)) && (
                  <button
                    onClick={() => setActiveVoice(model)}
                    className="text-[11px] px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
                    style={{
                      ...selectStyle,
                      color: 'var(--color-accent)',
                      borderColor: 'var(--color-accent)',
                    }}
                  >
                    <CircleDot size={10} />
                    Set Active
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          No voices match the current filters.
        </div>
      )}
    </div>
  );
}
