/**
 * CharacterCardImporter — Feature A8: SillyTavern CHARA v2 card import
 *
 * Renders a drag-and-drop PNG upload zone.  On file selection it reads the PNG,
 * sends it to POST /api/characters/import-card, shows a field preview, and
 * calls onImported(charId) on success.
 *
 * The component also exposes an export helper: clicking the "Export Card"
 * button on a character card row calls GET /api/characters/{id}/export-card.
 */

import { useRef, useState, useCallback } from 'react';
import { Upload, FileImage, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

interface ImportedPreview {
  name: string;
  system_prompt?: string;
  personality?: string;
  greeting?: string;
}

interface Props {
  /** Called with the newly created character ID after a successful import. */
  onImported: (charId: number, charName: string) => void;
}

type DropState = 'idle' | 'over' | 'loading' | 'success' | 'error';

/**
 * Drag-and-drop PNG upload zone for importing SillyTavern character cards.
 *
 * @example
 * <CharacterCardImporter onImported={(id, name) => selectCharacter(id)} />
 */
export function CharacterCardImporter({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropState, setDropState] = useState<DropState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportedPreview | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Drag-and-drop handlers ───────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropState('over');
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropState('idle');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core processing ──────────────────────────────────────────────────────

  /**
   * Read the PNG as a data URL for the avatar preview, then upload to the
   * import-card endpoint.  On success, show field preview before confirming.
   */
  const processFile = async (file: File) => {
    const nameLower = file.name.toLowerCase();
    if (!nameLower.endsWith('.png') && !nameLower.endsWith('.charx')) {
      setError('Please upload a .png or .charx character card file');
      setDropState('error');
      return;
    }

    // Preview the image immediately (client-side FileReader)
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewUrl(ev.target?.result as string ?? null);
    reader.readAsDataURL(file);

    setDropState('loading');
    setError(null);
    setPreview(null);

    try {
      const result = await api.importCharaCard(file);
      setPreview({
        name: result.name,
      });
      setDropState('success');
      // Auto-confirm after a short delay so users can see the success state
      setTimeout(() => onImported(result.id, result.name), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setDropState('error');
    }
  };

  // ── Reset ────────────────────────────────────────────────────────────────

  const reset = () => {
    setDropState('idle');
    setError(null);
    setPreview(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const isOver = dropState === 'over';
  const isLoading = dropState === 'loading';
  const isSuccess = dropState === 'success';
  const isError = dropState === 'error';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Hidden file input — triggered by click on drop zone */}
      <input
        ref={inputRef}
        type="file"
        accept=".png,.charx"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a character card PNG here or click to browse"
        onClick={() => !isLoading && !isSuccess && inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        style={{
          border: `2px dashed ${
            isOver ? 'var(--color-accent)' :
            isSuccess ? 'var(--color-success, #4ade80)' :
            isError ? 'var(--color-error, #f87171)' :
            'var(--color-border)'
          }`,
          borderRadius: 12,
          padding: '32px 24px',
          textAlign: 'center',
          cursor: isLoading || isSuccess ? 'default' : 'pointer',
          backgroundColor: isOver
            ? 'color-mix(in srgb, var(--color-accent) 6%, transparent)'
            : 'var(--color-surface)',
          transition: 'border-color 0.15s, background-color 0.15s',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {/* Preview thumbnail */}
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Card preview"
            style={{
              width: 80,
              height: 80,
              objectFit: 'cover',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
            }}
          />
        )}

        {/* Icon */}
        {!previewUrl && (
          isLoading ? (
            <Loader2
              size={36}
              style={{ color: 'var(--color-accent)', animation: 'spin 1s linear infinite' }}
            />
          ) : isSuccess ? (
            <CheckCircle size={36} style={{ color: 'var(--color-success, #4ade80)' }} />
          ) : isError ? (
            <AlertCircle size={36} style={{ color: 'var(--color-error, #f87171)' }} />
          ) : isOver ? (
            <FileImage size={36} style={{ color: 'var(--color-accent)' }} />
          ) : (
            <Upload size={36} style={{ color: 'var(--color-text-secondary)' }} />
          )
        )}

        {/* Label */}
        <div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            fontWeight: 600,
            color: isSuccess
              ? 'var(--color-success, #4ade80)'
              : isError
              ? 'var(--color-error, #f87171)'
              : 'var(--color-text)',
            marginBottom: 4,
          }}>
            {isLoading ? 'Reading card…' :
             isSuccess ? `Imported "${preview?.name}"` :
             isError ? 'Import failed' :
             isOver ? 'Drop to import' :
             'Drop a character card here'}
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--color-text-secondary)',
          }}>
            {isLoading || isSuccess ? null :
             isError ? error :
             'or click to browse · .png (CHARA v2/v3) or .charx archive'}
          </div>
        </div>
      </div>

      {/* Try again button shown after error */}
      {isError && (
        <button
          onClick={reset}
          style={{
            alignSelf: 'center',
            padding: '6px 16px',
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          Try again
        </button>
      )}

      {/* Compatibility note */}
      {dropState === 'idle' && (
        <p style={{
          margin: 0,
          fontSize: '0.75rem',
          color: 'var(--color-text-secondary)',
          textAlign: 'center',
          lineHeight: 1.5,
        }}>
          Compatible with SillyTavern, RisuAI, and any app using the CHARA v2 standard.
        </p>
      )}
    </div>
  );
}
