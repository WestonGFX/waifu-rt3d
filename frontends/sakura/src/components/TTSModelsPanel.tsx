import { useEffect, useState, useRef, useCallback } from 'react';
import { Download, Trash2, Play, RefreshCw, Package } from 'lucide-react';
import { api } from '../lib/api';
import type { TTSModel, DownloadProgress } from '../lib/types';

type EngineFilter = 'all' | 'kokoro' | 'piper';
type LanguageFilter = 'all' | string;

/**
 * TTS voice model management panel.
 * Browse the catalog, install/delete voices, and preview samples.
 * Connects to the same /api/tts/models endpoints as the Neon UI.
 */
export function TTSModelsPanel() {
  const [models, setModels] = useState<TTSModel[]>([]);
  const [totalMb, setTotalMb] = useState(0);
  const [loading, setLoading] = useState(true);
  const [engineFilter, setEngineFilter] = useState<EngineFilter>('all');
  const [langFilter, setLangFilter] = useState<LanguageFilter>('all');
  const [search, setSearch] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

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

  // Derive unique languages from catalog
  const languages = [...new Set(models.map(m => m.language))].sort();

  // Filter models
  const filtered = models.filter(m => {
    if (engineFilter !== 'all' && m.engine !== engineFilter) return false;
    if (langFilter !== 'all' && m.language !== langFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
    }
    return true;
  });

  // Sort: installed first, then by name
  const sorted = [...filtered].sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  /** Start installing a model and track progress via SSE. */
  const installModel = async (modelId: string) => {
    try {
      await api.installTTSModel(modelId);

      // Open SSE stream for download progress
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

  /** Play a voice sample audio. */
  const playSample = (modelId: string, sampleUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playingId === modelId) {
      setPlayingId(null);
      return;
    }
    const audio = new Audio(sampleUrl);
    audioRef.current = audio;
    setPlayingId(modelId);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    audio.play().catch(() => setPlayingId(null));
  };

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

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={engineFilter} onChange={(e) => setEngineFilter(e.target.value as EngineFilter)}
          className="text-xs px-2 py-1 rounded" style={selectStyle}>
          <option value="all">All Engines</option>
          <option value="kokoro">Kokoro</option>
          <option value="piper">Piper</option>
        </select>
        <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)}
          className="text-xs px-2 py-1 rounded" style={selectStyle}>
          <option value="all">All Languages</option>
          {languages.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <input
          type="text" placeholder="Search..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs px-2 py-1 rounded flex-1 min-w-[120px]" style={selectStyle}
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
        {sorted.map(model => {
          const isDownloading = downloadProgress?.model_id === model.id && downloadProgress.status === 'downloading';
          const pct = isDownloading ? Math.round((downloadProgress?.progress || 0) * 100) : 0;

          return (
            <div
              key={model.id}
              className="rounded-lg p-3 flex flex-col gap-2"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: `1px solid ${model.installed ? 'var(--color-accent)' : 'var(--color-border)'}`,
                opacity: model.installed ? 1 : 0.85,
              }}
            >
              {/* Name + engine badge */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {model.name}
                </span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase"
                  style={{
                    color: model.engine === 'kokoro' ? '#22d3ee' : '#4ade80',
                    border: `1px solid ${model.engine === 'kokoro' ? 'rgba(34,211,238,0.3)' : 'rgba(74,222,128,0.3)'}`,
                  }}
                >
                  {model.engine}
                </span>
              </div>

              {/* Meta */}
              <div className="text-[11px] flex gap-3" style={{ color: 'var(--color-text-secondary)' }}>
                <span>{model.gender === 'female' ? 'F' : 'M'}</span>
                <span>{model.language}</span>
                <span>{model.size_mb < 1 ? `${(model.size_mb * 1024).toFixed(0)} KB` : `${model.size_mb.toFixed(0)} MB`}</span>
              </div>

              {/* Description */}
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {model.description}
              </p>

              {/* Tags */}
              {model.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {model.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-secondary)' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Kokoro note */}
              {model.engine === 'kokoro' && (
                <p className="text-[10px] italic" style={{ color: 'var(--color-warning, #facc15)' }}>
                  Requires Kokoro server running
                </p>
              )}

              {/* Progress bar */}
              {isDownloading && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                    <div className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--color-accent), #4ade80)' }} />
                  </div>
                  <span className="text-[10px] w-8 text-right" style={{ color: 'var(--color-text-secondary)' }}>
                    {pct}%
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-auto">
                {model.sample_url && (
                  <button
                    onClick={() => playSample(model.id, model.sample_url)}
                    className="text-[11px] px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
                    style={selectStyle}
                  >
                    <Play size={11} />
                    {playingId === model.id ? 'Stop' : 'Preview'}
                  </button>
                )}
                {model.installed ? (
                  <button
                    onClick={() => deleteModel(model.id)}
                    className="text-[11px] px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
                    style={{ ...selectStyle, color: '#f87171' }}
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                ) : (
                  <button
                    onClick={() => installModel(model.id)}
                    disabled={isDownloading}
                    className="text-[11px] px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
                    style={{ ...selectStyle, opacity: isDownloading ? 0.5 : 1 }}
                  >
                    <Download size={11} />
                    {isDownloading ? 'Installing...' : 'Install'}
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
