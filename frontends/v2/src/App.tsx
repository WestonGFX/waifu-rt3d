import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { fetchCharacters } from './lib/api';
import { microcopy } from './lib/microcopy';
import { ChatPanel } from './components/ChatPanel';
import { MemoryGraph } from './components/MemoryGraph';
import { RosterPanel } from './components/RosterPanel';
import { SettingsHud } from './components/SettingsHud';
import { ViewerPanel } from './components/ViewerPanel';
import { VoiceVisualizer } from './components/VoiceVisualizer';
import { useVoiceLevels } from './hooks/useVoiceLevels';
import { useChatStore } from './stores/chatStore';
import type { Character } from './types';

export default function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeCharId, setActiveCharId] = useState<number>(1);
  const [hudOpen, setHudOpen] = useState(false);
  const [speakingEnabled, setSpeakingEnabled] = useState(true);

  const loading = useChatStore((state) => state.loading);
  const sessionId = useChatStore((state) => state.sessionId);
  const charId = useChatStore((state) => state.charId);
  const setContext = useChatStore((state) => state.setContext);
  const lastAudioUrl = useChatStore((state) => state.lastAudioUrl);

  const { level, micEnabled, micError, toggleMic } = useVoiceLevels(audioRef);

  useEffect(() => {
    fetchCharacters()
      .then((result) => {
        setCharacters(result);
        if (result.length > 0) {
          setActiveCharId(result[0].id);
          setContext(sessionId, result[0].id);
        }
      })
      .catch(() => {
        setCharacters([]);
      });
  }, [setContext, sessionId]);

  useEffect(() => {
    if (!lastAudioUrl || !audioRef.current) return;
    audioRef.current.src = lastAudioUrl;
    void audioRef.current.play().catch(() => {
      // Autoplay can fail until the first user gesture.
    });
  }, [lastAudioUrl]);

  const activeCharacter = useMemo(() => {
    return characters.find((character) => character.id === activeCharId);
  }, [characters, activeCharId]);

  return (
    <div className="v2-root">
      <motion.div
        className="v2-grid"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <RosterPanel
          characters={characters}
          activeCharId={activeCharId}
          onOpenHud={() => setHudOpen(true)}
          onSelect={(character) => {
            setActiveCharId(character.id);
            setContext(sessionId, character.id);
          }}
        />

        <main className="v2-main">
          <ViewerPanel activeCharacter={activeCharacter} status={loading ? 'thinking' : 'stable'} />
          <ChatPanel
            onToggleMic={toggleMic}
            micEnabled={micEnabled}
            speakingEnabled={speakingEnabled}
            setSpeakingEnabled={setSpeakingEnabled}
          />
          <VoiceVisualizer level={level} />
        </main>

        <aside className="v2-panel v2-memory">
          <MemoryGraph sessionId={sessionId} charId={charId} />
          {micError ? <p className="v2-warning">{microcopy.errors.micDenied}</p> : null}
          <p className="v2-hint">{microcopy.status.stable} · Preview route `/v2`</p>
        </aside>
      </motion.div>

      <audio ref={audioRef} preload="auto" hidden />

      <AnimatePresence>
        {hudOpen ? (
          <SettingsHud
            open={hudOpen}
            onClose={() => setHudOpen(false)}
            onApplyVoicePitch={() => undefined}
            onApplyCreativity={() => undefined}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
