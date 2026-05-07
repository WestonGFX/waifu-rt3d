/**
 * AnimationBrowser — collapsible UI for browsing and playing clip-based animations.
 *
 * Shows animation clips from the manifest grouped by category (Idle, Emotions,
 * Reactions, Fidgets, Custom). Each clip card shows name, duration, and a play
 * button. Users can set idle clips as default and upload custom .bvh/.glb files.
 *
 * Integrates with the viewerStore's dispatchPlayAnimation and
 * dispatchLoadAnimation methods.
 *
 * @module AnimationBrowser
 */

import { useState, useEffect, useCallback } from 'react';
import { Film, Play, Square, Upload, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useViewerStore } from '../stores/viewerStore';

/** Clip metadata from the animation manifest. */
interface AnimClip {
  id: string;
  file: string;
  name: string;
  category: string;
  emotions: string[];
  duration: number;
  loop: boolean;
  available: boolean;
  url: string | null;
  packId?: string;
  packName?: string;
}

/** Category tab config. */
const CATEGORIES = [
  { key: 'idle', label: 'Idle' },
  { key: 'emotion', label: 'Emotions' },
  { key: 'reaction', label: 'Reactions' },
  { key: 'fidget', label: 'Fidgets' },
  { key: 'custom', label: 'Custom' },
] as const;

/**
 * Collapsible animation browser panel for the ModelPanel sidebar.
 *
 * @param isOpen - Whether the parent panel is open (controls render).
 *
 * @example
 * <AnimationBrowser isOpen={modelPanelOpen} />
 */
export function AnimationBrowser({ isOpen }: { isOpen: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('idle');
  const [clips, setClips] = useState<Record<string, AnimClip[]>>({});
  const [totalClips, setTotalClips] = useState(0);
  const [availableClips, setAvailableClips] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    dispatchPlayAnimation,
    dispatchStopAnimation,
    dispatchLoadAnimation,
  } = useViewerStore();

  /** Fetch the manifest and group clips by category. */
  const fetchManifest = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/animations');
      if (!res.ok) return;
      const manifest = await res.json();

      const grouped: Record<string, AnimClip[]> = {};
      let total = 0;
      let avail = 0;

      for (const pack of (manifest.packs || [])) {
        for (const clip of (pack.clips || [])) {
          const cat = clip.category || 'custom';
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push({ ...clip, packId: pack.id, packName: pack.name });
          total++;
          if (clip.available) avail++;
        }
      }

      setClips(grouped);
      setTotalClips(total);
      setAvailableClips(avail);
    } catch (err) {
      console.warn('[AnimationBrowser] Failed to fetch manifest:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (expanded && totalClips === 0) {
      fetchManifest();
    }
  }, [expanded, totalClips, fetchManifest]);

  /**
   * Play a clip by loading it first (if needed) then dispatching play.
   *
   * @param clip - The clip metadata to play.
   */
  const handlePlay = (clip: AnimClip) => {
    if (!clip.available || !clip.url) return;

    if (playing === clip.id) {
      // Stop currently playing
      dispatchStopAnimation(0.3);
      setPlaying(null);
      return;
    }

    // Load + play
    dispatchLoadAnimation(clip.url, clip.id, true);
    // Small delay to allow load to complete, then play
    setTimeout(() => {
      dispatchPlayAnimation(clip.id, { loop: clip.loop, fadeIn: 0.4 });
      setPlaying(clip.id);
    }, 500);
  };

  if (!isOpen) return null;

  const activeClips = clips[activeCategory] || [];

  return (
    <div style={{ borderTop: '1px solid var(--color-border)' }}>
      {/* Header — click to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
          background: 'none', border: 'none', color: 'var(--color-text-primary)',
          cursor: 'pointer', padding: '8px 12px', fontSize: '13px', fontWeight: 500,
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Film size={14} />
        <span>Animation Library</span>
        {totalClips > 0 && (
          <span style={{
            fontSize: '10px', color: 'var(--color-text-tertiary)', marginLeft: 'auto',
            padding: '1px 6px', borderRadius: 99,
            backgroundColor: 'var(--color-border-subtle)',
          }}>
            {availableClips}/{totalClips}
          </span>
        )}
      </button>

      {expanded && (
        <div style={{ padding: '0 12px 8px' }}>
          {/* Category tabs */}
          <div style={{
            display: 'flex', gap: '2px', marginBottom: '8px',
            borderRadius: '6px', overflow: 'hidden',
            backgroundColor: 'var(--color-border-subtle)',
            padding: '2px',
          }}>
            {CATEGORIES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                style={{
                  flex: 1, padding: '4px 2px', fontSize: '10px', fontWeight: 500,
                  border: 'none', borderRadius: '4px', cursor: 'pointer',
                  transition: 'all 0.2s',
                  backgroundColor: activeCategory === key
                    ? 'var(--color-surface)' : 'transparent',
                  color: activeCategory === key
                    ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  boxShadow: activeCategory === key ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Clip grid */}
          {loading ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px', color: 'var(--color-text-tertiary)', fontSize: '12px',
            }}>
              <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', marginRight: '6px' }} />
              Loading...
            </div>
          ) : activeClips.length === 0 ? (
            <div style={{
              padding: '16px', textAlign: 'center',
              color: 'var(--color-text-tertiary)', fontSize: '11px',
            }}>
              No {activeCategory} clips available.
              <br />
              <span style={{ fontSize: '10px' }}>
                Run <code>tools/download_animation_packs.py</code> to add clips.
              </span>
            </div>
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '4px', maxHeight: '240px', overflowY: 'auto',
            }}>
              {activeClips.map(clip => (
                <button
                  key={clip.id}
                  onClick={() => handlePlay(clip)}
                  disabled={!clip.available}
                  title={`${clip.name} (${clip.duration.toFixed(1)}s) — ${clip.emotions?.join(', ') ?? ''}`}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    gap: '2px', padding: '6px 8px',
                    borderRadius: '6px', border: '1px solid var(--color-border)',
                    backgroundColor: playing === clip.id
                      ? 'var(--color-accent-soft)' : 'var(--color-surface)',
                    cursor: clip.available ? 'pointer' : 'not-allowed',
                    opacity: clip.available ? 1 : 0.4,
                    transition: 'all 0.15s',
                    textAlign: 'left',
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    width: '100%',
                  }}>
                    {playing === clip.id
                      ? <Square size={10} style={{ color: 'var(--color-accent)' }} />
                      : <Play size={10} style={{ color: 'var(--color-text-tertiary)' }} />
                    }
                    <span style={{
                      fontSize: '11px', fontWeight: 500,
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flex: 1,
                    }}>
                      {clip.name}
                    </span>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    width: '100%',
                  }}>
                    <span style={{
                      fontSize: '9px', color: 'var(--color-text-tertiary)',
                      padding: '0 4px', borderRadius: '3px',
                      backgroundColor: 'var(--color-border-subtle)',
                    }}>
                      {clip.duration.toFixed(1)}s
                    </span>
                    {clip.loop && (
                      <span style={{
                        fontSize: '9px', color: 'var(--color-accent)',
                      }}>
                        loop
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Upload button */}
          <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}>
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '4px 10px', fontSize: '10px',
                borderRadius: '4px', cursor: 'pointer',
                border: '1px dashed var(--color-border)',
                color: 'var(--color-text-tertiary)',
                transition: 'all 0.15s',
              }}
            >
              <Upload size={12} />
              <span>Upload .glb / .bvh</span>
              <input
                type="file"
                accept=".glb,.gltf,.bvh,.vrma"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  // Upload to animations directory via a simple PUT
                  const name = file.name.replace(/\.[^.]+$/, '');
                  const url = URL.createObjectURL(file);
                  dispatchLoadAnimation(url, name, true);
                  setPlaying(name);
                }}
              />
            </label>
            <button
              onClick={fetchManifest}
              title="Refresh animation list"
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '4px 8px', fontSize: '10px',
                borderRadius: '4px', cursor: 'pointer',
                border: '1px solid var(--color-border)',
                backgroundColor: 'transparent',
                color: 'var(--color-text-tertiary)',
              }}
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
