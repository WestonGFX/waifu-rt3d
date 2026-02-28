import { useState, useRef, useCallback } from 'react';
import { Upload, Trash2, Play, Square, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

/** Audio formats accepted for voice cloning samples. */
const ACCEPTED_FORMATS = '.wav,.mp3,.ogg,.flac,.m4a';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

interface VoiceSampleUploaderProps {
  /** Character ID to upload the sample for. */
  charId: number;
  /** Current voice_sample_path (URL) if one exists, or null. */
  currentSampleUrl: string | null;
  /** Called after successful upload/delete with the new path (or null). */
  onChanged: (newPath: string | null) => void;
}

/**
 * Voice sample upload widget for TTS voice cloning providers.
 *
 * Features:
 * - Drag-and-drop or click-to-browse file selection
 * - Upload progress indicator
 * - Play/stop current sample
 * - Delete current sample
 * - Format validation (WAV, MP3, OGG, FLAC, M4A)
 *
 * Connects to:
 * - POST /api/characters/{char_id}/voice-sample (upload)
 * - DELETE /api/characters/{char_id}/voice-sample (delete)
 */
export function VoiceSampleUploader({ charId, currentSampleUrl, onChanged }: VoiceSampleUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [playing, setPlaying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /** Validate and upload a file. */
  const handleFile = useCallback(async (file: File) => {
    setError(null);

    // Validate extension
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['wav', 'mp3', 'ogg', 'flac', 'm4a'].includes(ext)) {
      setError(`Unsupported format .${ext}. Use WAV, MP3, OGG, FLAC, or M4A.`);
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 50 MB.`);
      return;
    }

    setUploading(true);
    try {
      const result = await api.uploadVoiceSample(charId, file);
      if (result.ok) {
        onChanged(result.path);
      } else {
        setError('Upload failed — check server logs.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }, [charId, onChanged]);

  /** Delete the current voice sample. */
  const handleDelete = async () => {
    if (!confirm('Delete voice sample? The character will use the default voice.')) return;
    try {
      await api.deleteVoiceSample(charId);
      onChanged(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  /** Toggle playback of the current sample. */
  const togglePlay = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }
    if (!currentSampleUrl) return;
    const audio = new Audio(currentSampleUrl);
    audioRef.current = audio;
    setPlaying(true);
    audio.onended = () => { audioRef.current = null; setPlaying(false); };
    audio.onerror = () => { audioRef.current = null; setPlaying(false); };
    audio.play().catch(() => { audioRef.current = null; setPlaying(false); });
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  return (
    <div className="space-y-2">
      {/* Current sample display */}
      {currentSampleUrl && (
        <div className="flex items-center gap-2 text-xs p-2 rounded"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <button onClick={togglePlay} className="cursor-pointer flex items-center gap-1"
            style={{ color: 'var(--color-accent)' }}>
            {playing ? <Square size={12} /> : <Play size={12} />}
            {playing ? 'Stop' : 'Play'}
          </button>
          <span className="flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
            {currentSampleUrl.split('/').pop()}
          </span>
          <button onClick={handleDelete} className="cursor-pointer" style={{ color: '#f87171' }}>
            <Trash2 size={12} />
          </button>
        </div>
      )}

      {/* Drop zone / file picker */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg p-4 text-center cursor-pointer transition-colors"
        style={{
          border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
          backgroundColor: dragOver ? 'var(--color-accent)11' : 'transparent',
          opacity: uploading ? 0.5 : 1,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FORMATS}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        <Upload size={20} className="mx-auto mb-1" style={{ color: 'var(--color-text-secondary)' }} />
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {uploading ? 'Uploading...' : 'Drop a voice sample here, or click to browse'}
        </p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
          WAV, MP3, OGG, FLAC · 5–30 seconds of clean speech · Max 50 MB
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs p-2 rounded"
          style={{ backgroundColor: '#f8717122', color: '#f87171' }}>
          <AlertCircle size={12} />
          {error}
        </div>
      )}
    </div>
  );
}
