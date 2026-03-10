import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, Download, Loader2, Trash2, Edit3, Box,
  Globe, HardDrive, CheckCircle, AlertCircle
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';
import type { BrowseableModel, AvatarDownloadStatus, Character } from '../lib/types';

/* ═══════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

type SourceTab = 'cc0' | 'sketchfab' | 'local';

const SOURCE_TABS: { id: SourceTab; label: string; icon: typeof Box }[] = [
  { id: 'cc0', label: 'CC0 Curated', icon: Box },
  { id: 'sketchfab', label: 'Sketchfab', icon: Globe },
  { id: 'local', label: 'Local Library', icon: HardDrive },
];

/** Format badge colors by model format. */
const FORMAT_COLORS: Record<string, { bg: string; text: string }> = {
  vrm:  { bg: 'rgba(168,85,247,0.15)', text: 'rgb(168,85,247)' },
  glb:  { bg: 'rgba(59,130,246,0.15)', text: 'rgb(59,130,246)' },
  gltf: { bg: 'rgba(34,197,94,0.15)',  text: 'rgb(34,197,94)' },
};

/* ═══════════════════════════════════════════════════════════════════════
   ModelBrowser — overlay panel for browsing & downloading 3D avatars
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Full-screen overlay drawer for browsing, downloading, and managing 3D avatar
 * models. Three tabs: CC0 Curated catalog, Sketchfab search, and Local Library.
 *
 * Follows the standard overlay pattern used by MoodBoardEditor, ScenarioLibrary,
 * etc. — reads `activeOverlay` from appStore and renders a slide-in panel.
 *
 * Download flow:
 * 1. User clicks "Download" on a model card
 * 2. POST /api/avatars/download starts the background download
 * 3. 1-second interval polls GET /api/avatars/download-status
 * 4. On completion, refreshes local library and offers character assignment
 */
export function ModelBrowser() {
  const { activeOverlay, closeOverlay, characters } = useAppStore();
  const open = activeOverlay === 'modelbrowser';

  // ── Tab & search state ──
  const [tab, setTab] = useState<SourceTab>('cc0');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Data state ──
  const [models, setModels] = useState<BrowseableModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Download state ──
  const [downloadStatus, setDownloadStatus] = useState<AvatarDownloadStatus | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadComplete, setDownloadComplete] = useState<string | null>(null);

  // ── Local library actions ──
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // ── Character assignment ──
  const [assignTarget, setAssignTarget] = useState<number | null>(null);

  // Debounce search input
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  /**
   * Fetch models when the panel opens, tab changes, or search query updates.
   * CC0 and Sketchfab use the browse endpoint; Local uses the scan endpoint.
   */
  const fetchModels = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);

    try {
      if (tab === 'local') {
        // Local models come from the 3D model scan endpoint
        const res = await api.scan3dModels();
        const localModels: BrowseableModel[] = (res || [])
          .filter((m: { name: string; url: string }) =>
            !debouncedQuery || m.name.toLowerCase().includes(debouncedQuery.toLowerCase())
          )
          .map((m: { name: string; url: string }) => ({
            id: `local_${m.name}`,
            name: m.name,
            description: `Local model: ${m.url}`,
            thumbnail_url: '',
            download_url: m.url,
            format: (m.url.endsWith('.glb') || m.url.endsWith('.gltf') ? 'glb' : 'vrm') as 'vrm' | 'glb' | 'gltf',
            license: 'local',
            file_size_mb: 0,
            tags: ['local'],
            author: 'Local',
            source: 'local' as const,
          }));
        setModels(localModels);
      } else {
        const res = await api.browseAvatars(tab, debouncedQuery);
        setModels(res.models || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, [open, tab, debouncedQuery]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  // ── Download progress polling ──
  useEffect(() => {
    if (!downloadingId) return;
    const poll = setInterval(async () => {
      try {
        const status = await api.getAvatarDownloadStatus();
        setDownloadStatus(status);
        if (!status.active) {
          clearInterval(poll);
          if (!status.error) {
            setDownloadComplete(status.filename || downloadingId);
            // Refresh local library if we're on that tab
            if (tab === 'local') fetchModels();
          }
          setDownloadingId(null);
        }
      } catch {
        clearInterval(poll);
        setDownloadingId(null);
      }
    }, 1000);
    return () => clearInterval(poll);
  }, [downloadingId, tab, fetchModels]);

  /**
   * Start downloading a model from the catalog.
   *
   * @param model - The BrowseableModel to download
   */
  const handleDownload = async (model: BrowseableModel) => {
    if (downloadingId) return; // One download at a time
    if (!model.download_url) {
      setError(`No download URL available for "${model.name}"`);
      return;
    }

    setDownloadingId(model.id);
    setDownloadComplete(null);
    setDownloadStatus({ active: true, progress_pct: 0 });
    setError(null);

    try {
      const ext = model.format === 'vrm' ? '.vrm' : '.glb';
      const filename = model.name.replace(/[^a-zA-Z0-9_-]/g, '_') + ext;
      await api.downloadAvatar(model.download_url, filename, model.source);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      setDownloadingId(null);
      setDownloadStatus(null);
    }
  };

  /** Delete a local avatar file. */
  const handleDelete = async (filename: string) => {
    try {
      await api.deleteAvatar(filename);
      fetchModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  /** Rename a local avatar file. */
  const handleRename = async (oldName: string) => {
    if (!renameValue.trim()) return;
    try {
      await api.renameAvatar(oldName, renameValue.trim());
      setRenaming(null);
      setRenameValue('');
      fetchModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  /**
   * Assign a downloaded model to a character.
   * Updates the character's model_vrm or glb_model_url depending on format.
   */
  const handleAssign = async (filename: string, charId: number) => {
    const isGlb = filename.endsWith('.glb') || filename.endsWith('.gltf');
    const url = `/files/avatars/${filename}`;
    const patch: Partial<Character> = isGlb
      ? { glb_model_url: url }
      : { model_vrm: url };

    try {
      await api.updateCharacter(charId, patch);
      setAssignTarget(null);
      setDownloadComplete(null);
      // Reload characters so the viewer picks up the new model
      useAppStore.getState().loadCharacters();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed');
    }
  };

  // Reset state when panel closes
  useEffect(() => {
    if (!open) {
      setError(null);
      setDownloadComplete(null);
      setAssignTarget(null);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="modelbrowser-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeOverlay}
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              zIndex: 40,
            }}
          />

          {/* Panel */}
          <motion.div
            key="modelbrowser-panel"
            role="dialog"
            aria-modal="true"
            aria-label="3D Model Browser"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(580px, 96vw)',
              backgroundColor: 'var(--color-background)',
              borderLeft: '1px solid var(--color-border)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ── */}
            <div
              style={{
                padding: '16px 20px 14px',
                borderBottom: '1px solid var(--color-border)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Download size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <span style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-primary)',
                }}>
                  MODEL BROWSER
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)' }}>
                  {models.length} model{models.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={closeOverlay}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                    color: 'var(--color-text-tertiary)',
                  }}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* ── Source Tabs ── */}
              <div style={{ display: 'flex', gap: '4px', marginTop: '12px' }}>
                {SOURCE_TABS.map(t => {
                  const Icon = t.icon;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setTab(t.id); setQuery(''); }}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: active ? 600 : 400,
                        backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
                        color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Icon size={14} />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {/* ── Search Bar ── */}
              <div style={{ position: 'relative', marginTop: '10px' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute', left: '10px', top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-tertiary)',
                  }}
                />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={tab === 'sketchfab' ? 'Search Sketchfab models...' : 'Filter models...'}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 32px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border-subtle)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontSize: '0.78rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* ── Download Progress Bar ── */}
            {downloadingId && downloadStatus?.active && (
              <div style={{
                padding: '8px 20px',
                borderBottom: '1px solid var(--color-border-subtle)',
                flexShrink: 0,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '0.72rem', color: 'var(--color-text-secondary)',
                }}>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Downloading... {Math.round(downloadStatus.progress_pct ?? 0)}%</span>
                  {downloadStatus.speed_mb_s != null && (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>
                      ({downloadStatus.speed_mb_s.toFixed(1)} MB/s)
                    </span>
                  )}
                </div>
                <div style={{
                  marginTop: '4px',
                  height: '3px',
                  borderRadius: '2px',
                  backgroundColor: 'var(--color-border-subtle)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${downloadStatus.progress_pct ?? 0}%`,
                    backgroundColor: 'var(--color-accent)',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            )}

            {/* ── Download Complete + Assign ── */}
            {downloadComplete && (
              <div style={{
                padding: '10px 20px',
                borderBottom: '1px solid var(--color-border-subtle)',
                flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: '8px',
                backgroundColor: 'color-mix(in srgb, var(--color-success) 8%, transparent)',
              }}>
                <CheckCircle size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--color-success)', flex: 1 }}>
                  Downloaded: {downloadComplete}
                </span>
                {characters.length > 0 && (
                  <select
                    value={assignTarget ?? ''}
                    onChange={e => {
                      const val = Number(e.target.value);
                      if (val) handleAssign(downloadComplete, val);
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontSize: '0.7rem',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">Assign to character...</option>
                    {characters.map((c: Character) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* ── Error Banner ── */}
            {error && (
              <div style={{
                padding: '8px 20px',
                borderBottom: '1px solid var(--color-border-subtle)',
                flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: '8px',
                backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
              }}>
                <AlertCircle size={14} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--color-error)', flex: 1 }}>
                  {error}
                </span>
                <button
                  onClick={() => setError(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* ── Model Grid ── */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 16px',
                scrollbarWidth: 'thin',
              }}
            >
              {loading ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '48px 0',
                  color: 'var(--color-text-tertiary)',
                }}>
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : models.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '48px 0',
                  color: 'var(--color-text-tertiary)',
                  fontSize: '0.78rem',
                }}>
                  {debouncedQuery
                    ? `No models found for "${debouncedQuery}"`
                    : tab === 'sketchfab'
                      ? 'Enter a search query to find Sketchfab models'
                      : 'No models available'
                  }
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '12px',
                }}>
                  {models.map(model => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      isDownloading={downloadingId === model.id}
                      isLocal={tab === 'local'}
                      onDownload={() => handleDownload(model)}
                      onDelete={() => {
                        // Extract filename from URL for local models
                        const parts = model.download_url.split('/');
                        handleDelete(parts[parts.length - 1]);
                      }}
                      onRename={() => {
                        const parts = model.download_url.split('/');
                        setRenaming(parts[parts.length - 1]);
                        setRenameValue(model.name);
                      }}
                      onAssign={(charId) => {
                        const parts = model.download_url.split('/');
                        handleAssign(parts[parts.length - 1], charId);
                      }}
                      characters={characters}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* ── Rename Dialog ── */}
          {renaming && (
            <div
              style={{
                position: 'fixed', inset: 0, zIndex: 60,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.5)',
              }}
              onClick={() => setRenaming(null)}
            >
              <div
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: '12px',
                  padding: '20px',
                  minWidth: '320px',
                  border: '1px solid var(--color-border)',
                }}
                onClick={e => e.stopPropagation()}
              >
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px', color: 'var(--color-text-primary)' }}>
                  Rename Model
                </h3>
                <input
                  type="text"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(renaming); }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-background)',
                    color: 'var(--color-text-primary)',
                    fontSize: '0.78rem',
                    outline: 'none',
                  }}
                  autoFocus
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                  <button
                    onClick={() => setRenaming(null)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'transparent',
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleRename(renaming)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: 'var(--color-accent)',
                      color: 'var(--color-accent-text)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Rename
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   ModelCard — single model entry in the grid
   ═══════════════════════════════════════════════════════════════════════ */

interface ModelCardProps {
  model: BrowseableModel;
  isDownloading: boolean;
  isLocal: boolean;
  onDownload: () => void;
  onDelete: () => void;
  onRename: () => void;
  onAssign: (charId: number) => void;
  characters: Character[];
}

/**
 * Individual model card showing thumbnail, name, metadata badges,
 * and action buttons (download / delete / rename / assign).
 */
function ModelCard({
  model, isDownloading, isLocal,
  onDownload, onDelete, onRename, onAssign,
  characters,
}: ModelCardProps) {
  const formatStyle = FORMAT_COLORS[model.format] || FORMAT_COLORS.glb;

  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface)',
        borderRadius: '10px',
        border: '1px solid var(--color-border-subtle)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-accent)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-subtle)';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      {/* Thumbnail */}
      <div style={{
        height: '120px',
        backgroundColor: 'var(--color-background)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {model.thumbnail_url ? (
          <img
            src={model.thumbnail_url}
            alt={model.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Box size={32} style={{ color: 'var(--color-text-tertiary)', opacity: 0.3 }} />
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h4 style={{
          fontSize: '0.78rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {model.name}
        </h4>

        <p style={{
          fontSize: '0.65rem',
          color: 'var(--color-text-tertiary)',
          lineHeight: 1.4,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {model.description}
        </p>

        {/* Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
          {/* Format */}
          <span style={{
            fontSize: '0.6rem',
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: formatStyle.bg,
            color: formatStyle.text,
            textTransform: 'uppercase',
          }}>
            {model.format}
          </span>
          {/* License */}
          {model.license && model.license !== 'local' && (
            <span style={{
              fontSize: '0.6rem',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
            }}>
              {model.license}
            </span>
          )}
          {/* Size */}
          {model.file_size_mb > 0 && (
            <span style={{
              fontSize: '0.6rem',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'var(--color-background)',
              color: 'var(--color-text-tertiary)',
            }}>
              {model.file_size_mb.toFixed(1)} MB
            </span>
          )}
        </div>

        {/* Author */}
        {model.author && model.author !== 'Local' && (
          <div style={{ fontSize: '0.62rem', color: 'var(--color-text-tertiary)' }}>
            by {model.author}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--color-border-subtle)',
        display: 'flex',
        gap: '6px',
        alignItems: 'center',
      }}>
        {isLocal ? (
          <>
            {/* Local library: assign, rename, delete */}
            <select
              onChange={e => {
                const val = Number(e.target.value);
                if (val) onAssign(val);
              }}
              defaultValue=""
              style={{
                flex: 1,
                padding: '4px 6px',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-background)',
                color: 'var(--color-text-secondary)',
                fontSize: '0.65rem',
                cursor: 'pointer',
              }}
            >
              <option value="">Assign...</option>
              {characters.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={onRename}
              title="Rename"
              style={{
                padding: '4px',
                borderRadius: '6px',
                border: '1px solid var(--color-border-subtle)',
                backgroundColor: 'transparent',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
              }}
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={onDelete}
              title="Delete"
              style={{
                padding: '4px',
                borderRadius: '6px',
                border: '1px solid var(--color-border-subtle)',
                backgroundColor: 'transparent',
                color: 'var(--color-error)',
                cursor: 'pointer',
              }}
            >
              <Trash2 size={12} />
            </button>
          </>
        ) : (
          <>
            {/* Browse: download button */}
            <button
              onClick={onDownload}
              disabled={isDownloading || !model.download_url}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: model.download_url
                  ? 'var(--color-accent)'
                  : 'var(--color-border)',
                color: model.download_url
                  ? 'var(--color-accent-text)'
                  : 'var(--color-text-tertiary)',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: model.download_url ? 'pointer' : 'not-allowed',
                opacity: isDownloading ? 0.6 : 1,
              }}
            >
              {isDownloading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              {isDownloading ? 'Downloading...' : model.download_url ? 'Download' : 'Unavailable'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
