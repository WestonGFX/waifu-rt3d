/**
 * VoiceSelector – dropdown for choosing a TTS voice preset.
 *
 * Also includes a "Preview" button that speaks a short sample sentence
 * using the currently selected preset, so the user can hear the difference
 * before committing.
 */

import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext.tsx';
import { VOICE_PRESETS } from '../../services/voicePresets.ts';
import useSpeechSynthesis from '../../hooks/useSpeechSynthesis.ts';

export default function VoiceSelector() {
  const { state, dispatch } = useSettings();
  const { speak, isSupported } = useSpeechSynthesis();
  const [isPreviewing, setIsPreviewing] = useState(false);

  const handlePreview = async () => {
    if (!isSupported || isPreviewing) return;
    setIsPreviewing(true);
    try {
      await speak('Hi there! This is a voice preview.');
    } finally {
      setIsPreviewing(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-anime border border-anime-100 bg-white/60 p-2.5">
      <label className="text-xs font-semibold text-text-secondary">Voice</label>

      <div className="flex items-center gap-2">
        <select
          value={state.selectedVoiceName}
          onChange={(e) => dispatch({ type: 'SET_VOICE', payload: e.target.value })}
          className="flex-1 text-xs px-2 py-1.5 rounded-pill border border-anime-200 bg-anime-50 text-text-primary focus:outline-none focus:ring-2 focus:ring-anime-300"
        >
          {VOICE_PRESETS.map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.label}
            </option>
          ))}
        </select>

        {isSupported && (
          <button
            type="button"
            onClick={() => { void handlePreview(); }}
            disabled={isPreviewing}
            className="text-xs px-2.5 py-1 rounded-pill border border-anime-200 text-anime-600 bg-anime-50 hover:bg-anime-100 disabled:opacity-50 transition-colors"
          >
            {isPreviewing ? '…' : 'Preview'}
          </button>
        )}
      </div>

      {!isSupported && (
        <p className="text-xs text-text-muted italic">
          Voice preview requires Chrome or Edge.
        </p>
      )}
    </div>
  );
}
