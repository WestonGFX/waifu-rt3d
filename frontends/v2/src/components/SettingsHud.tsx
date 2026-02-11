import { useState } from 'react';
import { motion } from 'framer-motion';

import { saveUiConfig } from '../lib/api';
import { microcopy } from '../lib/microcopy';

interface SettingsHudProps {
  open: boolean;
  onClose: () => void;
  onApplyVoicePitch: (pitch: number) => void;
  onApplyCreativity: (temperature: number) => void;
}

interface RingSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function RingSlider({ label, value, min, max, step, onChange }: RingSliderProps) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="v2-ring-slider">
      <div
        className="v2-ring"
        style={{
          background: `conic-gradient(var(--v2-neon-cyan) ${percent}%, rgba(255,255,255,0.08) ${percent}%)`
        }}
      >
        <div className="v2-ring-core">
          <span>{value.toFixed(2)}</span>
        </div>
      </div>
      <label>
        {label}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    </div>
  );
}

export function SettingsHud({ open, onClose, onApplyVoicePitch, onApplyCreativity }: SettingsHudProps) {
  const [voicePitch, setVoicePitch] = useState(1);
  const [creativity, setCreativity] = useState(0.7);
  const [speechAuto, setSpeechAuto] = useState(true);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  return (
    <motion.div
      className="v2-hud-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section className="v2-hud" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <header>
          <h3>Settings HUD</h3>
          <button type="button" onClick={onClose}>
            {microcopy.actions.close}
          </button>
        </header>

        <div className="v2-hud-grid">
          <RingSlider label="Voice Pitch" value={voicePitch} min={0.5} max={1.5} step={0.05} onChange={setVoicePitch} />
          <RingSlider label="Creativity" value={creativity} min={0.1} max={1.5} step={0.05} onChange={setCreativity} />

          <div className="v2-toggle-card">
            <p>Audio Stream Protocol</p>
            <label>
              <input type="checkbox" checked={speechAuto} onChange={(event) => setSpeechAuto(event.target.checked)} />
              <span>{speechAuto ? 'Auto transmit on' : 'Manual transmit only'}</span>
            </label>
          </div>

          <div className="v2-core-pulse">
            <div />
            <span>Core Sync</span>
          </div>
        </div>

        <footer>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await saveUiConfig({
                  tts: { tts_pitch: voicePitch },
                  llm: { temperature: creativity },
                  ui: { speech_auto: speechAuto }
                });
                onApplyVoicePitch(voicePitch);
                onApplyCreativity(creativity);
                onClose();
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? 'Syncing...' : microcopy.actions.apply}
          </button>
        </footer>
      </motion.section>
    </motion.div>
  );
}
