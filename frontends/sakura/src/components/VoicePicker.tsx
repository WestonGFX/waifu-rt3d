import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { VoiceEntry } from '../lib/types';

interface VoicePickerProps {
  value: string;
  provider?: string;
  onChange: (voiceId: string, provider: string) => void;
}

/** Voice selection dropdown that fetches available voices from the backend. */
export function VoicePicker({ value, provider, onChange }: VoicePickerProps) {
  const [voices, setVoices] = useState<VoiceEntry[]>([]);

  useEffect(() => {
    api.getVoices(provider).then(setVoices).catch(console.error);
  }, [provider]);

  const grouped = voices.reduce<Record<string, VoiceEntry[]>>((acc, v) => {
    const key = v.engine.charAt(0).toUpperCase() + v.engine.slice(1);
    (acc[key] ??= []).push(v);
    return acc;
  }, {});

  return (
    <select
      value={value}
      onChange={(e) => {
        const voice = voices.find(v => v.id === e.target.value);
        if (voice) onChange(voice.id, voice.engine);
      }}
      className="text-sm px-2 py-1.5 w-full rounded"
      style={{
        backgroundColor: 'var(--color-background)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-primary)'
      }}
    >
      <option value="">Select a voice...</option>
      {Object.entries(grouped).map(([engine, voiceList]) => (
        <optgroup key={engine} label={engine}>
          {voiceList.map(v => (
            <option key={v.id} value={v.id}>
              {v.name} — {v.description}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
