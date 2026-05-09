import { useState, useRef, useCallback, useEffect } from 'react';
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
 * - Two-step delete (no confirm() dialog)
 * - Canvas waveform preview before upload
 * - Length validation: warn < 6s, reject > 60s
 * - Explicit "Replace sample" label when a sample exists
 *
 * Connects to:
 * - POST /api/characters/{char_id}/voice-sample (upload)
 * - DELETE /api/characters/{char_id}/voice-sample (delete)
 */
export function VoiceSampleUploader({ charId, currentSampleUrl, onChanged }: VoiceSampleUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [waveform, setWaveform] = useState<Float32Array | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw waveform on canvas whenever waveform data changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'var(--color-accent)';

    const step = Math.ceil(waveform.length / width);
    for (let x = 0; x < width; x++) {
      let max = 0;
      for (let i = x * step; i < (x + 1) * step && i < waveform.length; i++) {
        max = Math.max(max, Math.abs(waveform[i]));
      }
      const barHeight = Math.max(1, max * height);
      ctx.fillRect(x, (height - barHeight) / 2, 1, barHeight);
    }
  }, [waveform]);

  /** Decode audio file and extract amplitude samples for waveform display. */
  const decodeWaveform = async (file: File): Promise<{ samples: Float32Array; durationS: number } | null> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new AudioContext();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();
      return {
        samples: decoded.getChannelData(0),
        durationS: decoded.duration,
      };
    } catch {
      return null;
    }
  };

  /** Validate and upload a file. */
  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setWarning(null);
    setWaveform(null);

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

    // Decode waveform for preview and length validation
    const decoded = await decodeWaveform(file);
    if (decoded) {
      setWaveform(decoded.samples);
      if (decoded.durationS > 60) {
        setError(`Sample too long (${decoded.durationS.toFixed(0)}s). Keep under 60 seconds.`);
        return;
      }
      if (decoded.durationS < 6) {
        setWarning(`Short sample (${decoded.durationS.toFixed(1)}s). 10–30s gives best cloning quality.`);
      }
    }

    setUploading(true);
    try {
      const result = await api.uploadVoiceSample(charId, file);
      if (result.ok) {
        onChanged(result.path);
        setWaveform(null);
      } else {
        setError('Upload failed — check server logs.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }, [charId, onChanged]);

  /** Two-step delete: first click → confirm state; second click → delete. */
  const handleDeleteClick = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
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
          {/* Two-step delete */}
          {confirmDelete ? (
            <>
              <span style={{ color: '#f87171', fontSize: '0.7rem' }}>Confirm?</span>
              <button onClick={handleDeleteClick} className="cursor-pointer" style={{ color: '#f87171' }}>
                <Trash2 size={12} />
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button onClick={handleDeleteClick} className="cursor-pointer" style={{ color: 'var(--color-text-muted)' }}
              title="Delete voice sample">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}

      {/* Waveform preview (shown after file pick, before upload completes) */}
      {waveform && (
        <canvas
          ref={canvasRef}
          width={400}
          height={40}
          style={{ width: '100%', height: 40, borderRadius: 4, backgroundColor: 'var(--color-surface)', opacity: 0.8 }}
        />
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
          {uploading
            ? 'Uploading...'
            : currentSampleUrl
              ? 'Drop a new sample here to replace, or click to browse'
              : 'Drop a voice sample here, or click to browse'}
        </p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
          WAV, MP3, OGG, FLAC · 10–30 seconds of clean speech · Max 50 MB
        </p>
      </div>

      {/* Warning (short sample) */}
      {warning && (
        <div className="flex items-center gap-1.5 text-xs p-2 rounded"
          style={{ backgroundColor: 'rgba(251,191,36,0.15)', color: 'rgb(251,191,36)' }}>
          <AlertCircle size={12} />
          {warning}
        </div>
      )}

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
