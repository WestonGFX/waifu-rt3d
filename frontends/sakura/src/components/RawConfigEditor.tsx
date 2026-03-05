import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import type { AppConfig } from '../lib/types';

/**
 * RawConfigEditor — direct JSON editing of app.json for power users.
 *
 * Provides a textarea with JSON syntax validation, Save/Reset buttons,
 * and visual feedback for validation errors. Dev mode only (tier=2).
 *
 * @example
 * // Used inside DevConsole as a tab:
 * <RawConfigEditor />
 */
export function RawConfigEditor() {
  const [text, setText] = useState('');
  const [serverSnapshot, setServerSnapshot] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Fetch the current config from the backend and populate the editor.
   * Also stores a snapshot for diff comparison.
   */
  const fetchConfig = useCallback(async () => {
    setStatus('loading');
    try {
      const cfg = await api.getConfig();
      const pretty = JSON.stringify(cfg, null, 2);
      setText(pretty);
      setServerSnapshot(pretty);
      setParseError(null);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load config');
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [fetchConfig]);

  /**
   * Validate JSON on every keystroke and update parse error state.
   *
   * @param value - Raw textarea content to validate.
   */
  const handleChange = (value: string) => {
    setText(value);
    try {
      JSON.parse(value);
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  /**
   * Save the current textarea content to the backend via PUT /api/config.
   * Shows a brief "Saved!" flash on success.
   */
  const handleSave = async () => {
    if (parseError) return;
    try {
      const parsed = JSON.parse(text) as Partial<AppConfig>;
      await api.saveConfig(parsed);
      setServerSnapshot(text);
      setStatus('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
    }
  };

  /**
   * Re-fetch config from the server, discarding local edits.
   */
  const handleReset = () => {
    fetchConfig();
  };

  /**
   * Count top-level keys that differ between the current text and the
   * last-fetched server snapshot. Returns 0 when either side is invalid JSON.
   */
  const countChangedKeys = (): number => {
    try {
      const current = JSON.parse(text) as Record<string, unknown>;
      const snapshot = JSON.parse(serverSnapshot) as Record<string, unknown>;
      const allKeys = Array.from(new Set([...Object.keys(current), ...Object.keys(snapshot)]));
      let changed = 0;
      for (const key of allKeys) {
        if (JSON.stringify(current[key]) !== JSON.stringify(snapshot[key])) {
          changed++;
        }
      }
      return changed;
    } catch {
      return 0;
    }
  };

  const changedKeys = countChangedKeys();
  const isValid = parseError === null && text.trim().length > 0;

  // Border color reflects validation state
  const borderColor = parseError
    ? 'var(--color-error, #f44)'
    : text !== serverSnapshot
      ? 'var(--color-warning, #fa0)'
      : 'var(--color-border)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {/* Toolbar row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          {status === 'loading' && 'Loading...'}
          {status === 'saved' && (
            <span style={{ color: 'var(--color-success, #4c4)' }}>Saved!</span>
          )}
          {status === 'error' && (
            <span style={{ color: 'var(--color-error, #f44)' }}>{errorMsg}</span>
          )}
          {status === 'idle' && changedKeys > 0 && (
            <span style={{
              background: 'var(--color-primary, #66f)',
              color: '#fff',
              borderRadius: 8,
              padding: '1px 7px',
              fontSize: '0.65rem',
              fontWeight: 600,
            }}>
              {changedKeys} change{changedKeys !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleReset}
            style={{
              fontSize: '0.7rem',
              padding: '3px 10px',
              cursor: 'pointer',
              borderRadius: 4,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface, transparent)',
              color: 'var(--color-text)',
            }}
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || text === serverSnapshot}
            style={{
              fontSize: '0.7rem',
              padding: '3px 10px',
              cursor: isValid && text !== serverSnapshot ? 'pointer' : 'not-allowed',
              borderRadius: 4,
              border: '1px solid var(--color-border)',
              background: isValid && text !== serverSnapshot
                ? 'var(--color-primary, #66f)'
                : 'var(--color-surface, transparent)',
              color: isValid && text !== serverSnapshot ? '#fff' : 'var(--color-text-secondary)',
              opacity: isValid && text !== serverSnapshot ? 1 : 0.5,
            }}
          >
            Save
          </button>
        </div>
      </div>

      {/* JSON textarea */}
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          minHeight: 300,
          width: '100%',
          fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", Menlo, monospace',
          fontSize: '0.75rem',
          lineHeight: 1.5,
          padding: 8,
          background: 'var(--color-background)',
          color: 'var(--color-text)',
          border: `1.5px solid ${borderColor}`,
          borderRadius: 6,
          resize: 'vertical',
          outline: 'none',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          boxSizing: 'border-box',
        }}
      />

      {/* Validation error */}
      {parseError && (
        <div style={{
          padding: '4px 8px',
          fontSize: '0.7rem',
          color: 'var(--color-error, #f44)',
          fontFamily: 'monospace',
        }}>
          {parseError}
        </div>
      )}
    </div>
  );
}
