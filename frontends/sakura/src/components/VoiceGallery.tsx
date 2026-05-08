import { useState, useEffect, useRef } from 'react';
import { Play, Square } from 'lucide-react';
import { api } from '../lib/api';
import type { VoiceEntry } from '../lib/types';

interface VoiceGalleryProps {
  /** Currently selected voice_id. */
  value: string;
  /** Currently selected provider — used to pre-select the filter chip. */
  provider?: string;
  onSelect: (voiceId: string, provider: string) => void;
}

/**
 * Card-based voice browser with filter chips and per-voice preview playback.
 *
 * Replaces the flat VoicePicker dropdown with a scannable grid showing name,
 * engine, gender, language, and a short description per voice.
 */
export function VoiceGallery({ value, provider, onSelect }: VoiceGalleryProps) {
  const [voices, setVoices] = useState<VoiceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(provider ?? 'all');
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    api.getVoices().then(v => {
      setVoices(v);
      setLoading(false);
    }).catch(err => {
      console.error('[VoiceGallery] voices load failed:', err);
      setLoading(false);
    });
  }, []);

  const engines = ['all', ...Array.from(new Set(voices.map(v => v.engine))).sort()];
  const filtered = filter === 'all' ? voices : voices.filter(v => v.engine === filter);

  const previewVoice = async (voice: VoiceEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing === voice.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    setPlaying(voice.id);
    try {
      const res = await fetch('/api/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Hello! I'm ${voice.name}. How can I help you today?`,
          voice_id: voice.id,
          provider: voice.engine,
        }),
      });
      const data = await res.json() as { ok: boolean; audio_url?: string };
      if (data.ok && data.audio_url) {
        const audio = new Audio(data.audio_url);
        audioRef.current = audio;
        audio.onended = () => setPlaying(null);
        audio.onerror = () => setPlaying(null);
        audio.play().catch(() => setPlaying(null));
      } else {
        setPlaying(null);
      }
    } catch {
      setPlaying(null);
    }
  };

  if (loading) {
    return (
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, padding: '8px 0' }}>
        Loading voices…
      </p>
    );
  }

  if (voices.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, padding: '8px 0' }}>
        No voices available. Install voices in the TTS Models tab.
      </p>
    );
  }

  return (
    <div>
      {/* Engine filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {engines.map(eng => {
          const active = filter === eng;
          return (
            <button
              key={eng}
              onClick={() => setFilter(eng)}
              style={{
                padding: '3px 10px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: active ? 600 : 400,
                border: `1.5px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                backgroundColor: active ? 'var(--color-accent)' : 'var(--color-surface)',
                color: active ? '#fff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'border-color 0.12s, background-color 0.12s',
              }}
            >
              {eng}
            </button>
          );
        })}
      </div>

      {/* Voice cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        gap: 8,
        maxHeight: 340,
        overflowY: 'auto',
        paddingRight: 2,
      }}>
        {filtered.map(voice => {
          const selected = voice.id === value;
          const isPlaying = playing === voice.id;
          return (
            <div
              key={voice.id}
              onClick={() => onSelect(voice.id, voice.engine)}
              style={{
                padding: '9px 11px',
                borderRadius: 8,
                cursor: 'pointer',
                border: `1.5px solid ${selected ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                backgroundColor: selected ? 'var(--color-surface)' : 'var(--color-background)',
                transition: 'border-color 0.12s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                <span style={{
                  fontWeight: 600,
                  fontSize: 12,
                  color: selected ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  wordBreak: 'break-word',
                  lineHeight: 1.3,
                }}>
                  {voice.name}
                </span>
                <button
                  onClick={(e) => previewVoice(voice, e)}
                  title={isPlaying ? 'Stop preview' : 'Preview voice'}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    border: `1px solid ${isPlaying ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    backgroundColor: isPlaying ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: isPlaying ? '#fff' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'background-color 0.12s, border-color 0.12s',
                  }}
                >
                  {isPlaying ? <Square size={9} /> : <Play size={9} />}
                </button>
              </div>

              {/* Badges */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                <Badge>{voice.engine}</Badge>
                {voice.gender && voice.gender !== 'unknown' && <Badge>{voice.gender}</Badge>}
                {voice.language && <Badge>{voice.language.slice(0, 5)}</Badge>}
              </div>

              {/* Description */}
              {voice.description && (
                <p style={{
                  fontSize: 10,
                  color: 'var(--color-text-secondary)',
                  marginTop: 5,
                  lineHeight: 1.4,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>
                  {voice.description}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, padding: '8px 0' }}>
          No voices match this filter.
        </p>
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 600,
      padding: '1px 5px',
      borderRadius: 8,
      border: '1px solid var(--color-border)',
      color: 'var(--color-text-secondary)',
      backgroundColor: 'var(--color-surface)',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
    }}>
      {children}
    </span>
  );
}
