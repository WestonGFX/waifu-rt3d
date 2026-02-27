import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Square, Mic, MicOff, Radio, X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { useProactive } from '../hooks/useProactive';
import { useVoiceMode } from '../hooks/useVoiceMode';
import { useAutoBackground } from '../hooks/useAutoBackground';
import { api } from '../lib/api';
import { DialogueBubble } from '../components/DialogueBubble';
import { StatusBar } from '../components/StatusBar';
import { ModelPanel } from '../components/ModelPanel';
import { SessionDrawer } from '../components/SessionDrawer';
import { GesturePicker } from '../components/GesturePicker';
import type { GestureName, ExpressionName } from '../components/GesturePicker';

// ── Types ────────────────────────────────────────────────────────────────────

/** Mic recording state for push-to-talk. */
type MicState = 'idle' | 'recording' | 'processing';

// ── Main component ───────────────────────────────────────────────────────────

/**
 * Full-screen chat thread view with SSE streaming dialogue.
 *
 * Features:
 * - Scrollable message list with DialogueBubble rendering
 * - Composer bar with incognito toggle, voice mode, gesture picker
 * - Voice-First Mode (Feature A): continuous VAD → auto-send
 * - Push-to-talk mic button (P5): hold to record, release to transcribe
 * - Gesture & Expression picker (Feature D): postMessage to VRM viewer
 * - Dialogue choices (Feature E): renders choice buttons on assistant turn
 * - Auto scene background (Feature I): triggers image-gen on emotion change
 * - Proactive idle messages (Issue 8): character speaks after 5 min silence
 * - Search, export, session history drawer
 */
export function ChatThread() {
  const { activeCharacter, modelPanelOpen } = useAppStore();
  const { messages, draft, loading, setDraft, sendMessage, abortMessage, setContext, loadHistory } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [incognito, setIncognito] = useState(false);

  // ── Task 2: Diary state ─────────────────────────────────────────────────
  const [diaryText, setDiaryText] = useState<string | null>(null);
  const [diaryDate, setDiaryDate] = useState<string | null>(null);
  const [diaryDismissed, setDiaryDismissed] = useState(false);

  // ── Task 3: Push-to-talk mic state ──────────────────────────────────────
  const [micState, setMicState] = useState<MicState>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ── Feature D: Gesture picker state ────────────────────────────────────
  const [gesturePickerOpen, setGesturePickerOpen] = useState(false);

  // ── Proactive guard ─────────────────────────────────────────────────────
  /** Prevents multiple proactive triggers before the user resumes typing. */
  const idleFired = useRef(false);

  // Load diary when character changes
  useEffect(() => {
    setDiaryDismissed(false);
    setDiaryText(null);
    if (!activeCharacter?.id) return;
    api.getDiary(activeCharacter.id)
      .then(res => {
        if (res?.diary?.trim()) {
          setDiaryText(res.diary);
          setDiaryDate(res.diary_date ?? null);
        }
      })
      .catch(() => { /* diary not critical */ });
  }, [activeCharacter?.id]);

  // Create/resume chat session when character changes
  useEffect(() => {
    if (!activeCharacter) return;
    api.createSession(activeCharacter.id)
      .then((session) => {
        setContext(session.id, activeCharacter.id);
        if (session.id) loadHistory(session.id);
      })
      .catch(console.error);
  }, [activeCharacter, setContext, loadHistory]);

  // Auto-scroll to bottom when new messages arrive or text streams in
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  // ── Proactive idle messages (Issue 8) ───────────────────────────────────
  const lastMsg = messages[messages.length - 1];
  const proactiveEnabled = (
    !loading &&
    !incognito &&
    messages.length > 0 &&
    lastMsg?.role === 'assistant' &&
    lastMsg?.status === 'sent'
  );

  const handleProactiveTrigger = useCallback(() => {
    if (!useChatStore.getState().loading) {
      idleFired.current = true;
      sendMessage('(The conversation has gone quiet. Continue naturally as your character.)', false, true);
    }
  }, [sendMessage]);

  useProactive({
    enabled: proactiveEnabled,
    idleMinutes: 5,
    onTrigger: handleProactiveTrigger,
  });

  // ── Feature I: Auto scene background on emotion change ──────────────────
  const lastAssistantEmotion = useMemo(
    () => [...messages].reverse().find(m => m.role === 'assistant')?.emotion,
    [messages],
  );
  useAutoBackground(lastAssistantEmotion, activeCharacter?.id, modelPanelOpen);

  // ── Feature A: Voice-First Mode ─────────────────────────────────────────
  /**
   * Handles a transcription result from the VAD pipeline or push-to-talk.
   *
   * @param text - Transcribed text.
   * @param autoSend - True from VAD silence; false from push-to-talk.
   */
  const handleTranscribed = useCallback(
    (text: string, autoSend: boolean) => {
      if (autoSend) {
        idleFired.current = false;
        sendMessage(text, true, incognito);
      } else {
        setDraft(text);
      }
    },
    [sendMessage, setDraft, incognito],
  );

  const { voiceActive, voiceState, toggleVoiceMode } = useVoiceMode({
    onTranscribed: handleTranscribed,
    onSpeechStart: useCallback(() => { /* could flash indicator */ }, []),
  });

  // Ctrl+Shift+V global shortcut to toggle voice mode
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        toggleVoiceMode();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [toggleVoiceMode]);

  // ── Push-to-talk mic (P5) ───────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (micState !== 'idle' || voiceActive) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setMicState('processing');
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const fd = new FormData();
        fd.append('audio', blob, 'recording.webm');
        try {
          const res = await fetch('/api/asr/transcribe', { method: 'POST', body: fd });
          const data = await res.json();
          if (data.text?.trim()) setDraft(data.text.trim());
        } catch { /* ignore */ }
        setMicState('idle');
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setMicState('recording');
    } catch { setMicState('idle'); }
  }, [micState, voiceActive, setDraft]);

  const stopRecording = useCallback(() => {
    if (micState === 'recording' && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
  }, [micState]);

  // ── Feature D: Gesture picker ───────────────────────────────────────────
  const handleGesture = useCallback((_g: GestureName | null, _e: ExpressionName | null) => {
    setGesturePickerOpen(false);
  }, []);

  // ── Send / keyboard ─────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!draft.trim() || loading) return;
    idleFired.current = false;
    sendMessage(draft, true, incognito);
  }, [draft, loading, sendMessage, incognito]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ── Feature E: Dialogue choice select ──────────────────────────────────
  const handleChoiceSelect = useCallback((choice: string) => {
    idleFired.current = false;
    sendMessage(choice, true, incognito);
  }, [sendMessage, incognito]);

  // ── Search filter ────────────────────────────────────────────────────────
  const visibleMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.text?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const lines = messages.map(m => {
      const who = m.role === 'user' ? 'You' : (activeCharacter?.name ?? 'AI');
      return `[${who}]: ${m.text}`;
    });
    const content = `${activeCharacter?.name ?? 'Chat'} — exported ${new Date().toLocaleString()}\n\n${lines.join('\n\n')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeCharacter?.name ?? 'chat').replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, activeCharacter]);

  // ── Audio playback ───────────────────────────────────────────────────────
  const playAudio = useCallback((msg: { id: string; audioUrl?: string }) => {
    if (!msg.audioUrl) return;
    const audio = new Audio(msg.audioUrl);
    const vol = useAppStore.getState().config?.tts_volume;
    audio.volume = typeof vol === 'number' ? vol : 1.0;
    setPlayingAudioId(msg.id);
    audio.onended = () => setPlayingAudioId(null);
    audio.play().catch(() => setPlayingAudioId(null));
  }, []);

  if (!activeCharacter) return null;

  const showDiary = diaryText && !diaryDismissed;

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* ── Chat column ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        <StatusBar
          character={activeCharacter}
          onOpenSessions={() => setSessionsOpen(true)}
          onSearchChange={setSearchQuery}
          onExport={handleExport}
          messageCount={messages.length}
        />

        {/* Diary snippet — "last time, character wrote..." */}
        {showDiary && (
          <div
            className="mx-auto max-w-3xl w-full px-4 pt-3"
            style={{ flexShrink: 0 }}
          >
            <div
              className="relative flex items-start gap-2 px-3 py-2 rounded-lg text-xs italic"
              style={{
                backgroundColor: 'var(--color-accent-soft)',
                color: 'var(--color-text-secondary)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>📖</span>
              <div className="min-w-0 flex-1">
                <span style={{ color: 'var(--color-accent)', fontWeight: 600, fontStyle: 'normal' }}>
                  {activeCharacter.name}
                </span>{' '}
                wrote on {diaryDate ?? 'last time'}:
                <span className="block mt-0.5 line-clamp-2">{diaryText}</span>
              </div>
              <button
                onClick={() => setDiaryDismissed(true)}
                aria-label="Dismiss diary snippet"
                style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        {/* ── Message list ──────────────────────────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full">
          {searchQuery && (
            <p className="text-center text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
              {visibleMessages.length === 0 ? 'No messages match' : `${visibleMessages.length} message${visibleMessages.length === 1 ? '' : 's'} found`}
            </p>
          )}
          {visibleMessages.map((msg) => (
            <DialogueBubble
              key={msg.id}
              message={msg}
              character={activeCharacter}
              onPlayAudio={() => playAudio(msg)}
              isPlaying={playingAudioId === msg.id}
              searchQuery={searchQuery}
              onChoiceSelect={handleChoiceSelect}
            />
          ))}
        </div>

        {/* ── Composer bar ─────────────────────────────────────────────── */}
        <div
          className="sticky bottom-0 p-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-surface) 85%, transparent)',
            backdropFilter: 'var(--blur-surface)',
            WebkitBackdropFilter: 'var(--blur-surface)',
            borderTop: '1px solid var(--color-border-subtle)',
          }}
        >
          <div className="max-w-3xl mx-auto">
            {/* Voice mode status badge */}
            {voiceActive && (
              <div
                className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                aria-live="polite"
                style={{
                  backgroundColor: 'var(--color-accent-soft)',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
                  color: 'var(--color-accent)',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }}
                />
                {voiceState === 'listening' ? 'Listening…' : 'Processing…'}
                <button
                  onClick={toggleVoiceMode}
                  aria-label="Exit voice mode"
                  className="ml-auto"
                  style={{ color: 'var(--color-accent)' }}
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Gesture picker (Feature D) — shown above composer when open */}
            {gesturePickerOpen && (
              <GesturePicker onGesture={handleGesture} className="mb-2" />
            )}

            {/* Composer row */}
            <div className="flex items-end gap-2">
              {/* Gesture picker toggle button */}
              <button
                onClick={() => setGesturePickerOpen(o => !o)}
                title="Gesture & expression picker"
                aria-label="Toggle gesture picker"
                aria-pressed={gesturePickerOpen}
                className="p-2 rounded-lg transition-all duration-150 flex-shrink-0 text-base leading-none"
                style={{
                  backgroundColor: gesturePickerOpen ? 'var(--color-accent-soft)' : 'transparent',
                  color: gesturePickerOpen ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  boxShadow: gesturePickerOpen ? '0 0 8px var(--color-accent-soft)' : 'none',
                }}
              >
                🎭
              </button>

              {/* Incognito toggle */}
              <button
                onClick={() => setIncognito(v => !v)}
                title={incognito ? 'Incognito: messages not saved. Click to disable.' : 'Enable incognito mode'}
                aria-label={incognito ? 'Disable incognito mode' : 'Enable incognito mode'}
                aria-pressed={incognito}
                className="p-2 rounded-lg transition-all duration-200 flex-shrink-0 text-base leading-none"
                style={{
                  opacity: incognito ? 1 : 0.35,
                  backgroundColor: incognito ? 'var(--color-accent-soft)' : 'transparent',
                }}
              >
                👻
              </button>

              {/* Text input */}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  voiceActive ? 'Voice mode active — speak to send…' :
                  incognito ? 'Incognito — not saved…' : 'Say something…'
                }
                rows={1}
                className="flex-1 resize-none px-4 py-2.5 text-sm outline-none transition-all duration-200"
                style={{
                  backgroundColor: 'var(--color-background)',
                  borderRadius: 'var(--radius-input)',
                  border: voiceActive
                    ? '1px solid color-mix(in srgb, var(--color-accent) 50%, transparent)'
                    : incognito
                    ? '1px solid var(--color-accent)'
                    : '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />

              {/* Push-to-talk mic button (hidden when voice mode active) */}
              {!voiceActive && (
                <button
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  title="Hold to record (push-to-talk)"
                  aria-label="Push to talk"
                  aria-pressed={micState === 'recording'}
                  className="p-2 rounded-lg transition-all duration-150 flex-shrink-0"
                  style={{
                    backgroundColor: micState === 'recording' ? 'var(--color-accent)' : 'transparent',
                    color: micState === 'recording' ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)',
                    animation: micState === 'recording' ? 'pulse 1s ease-in-out infinite' : 'none',
                  }}
                >
                  {micState === 'idle' ? <Mic size={16} /> : <MicOff size={16} />}
                </button>
              )}

              {/* Voice-First Mode toggle */}
              <button
                onClick={toggleVoiceMode}
                title={voiceActive ? 'Exit voice mode (Ctrl+Shift+V)' : 'Enter voice mode (Ctrl+Shift+V)'}
                aria-label={voiceActive ? 'Exit voice-first mode' : 'Enter voice-first mode'}
                aria-pressed={voiceActive}
                className="p-2 rounded-lg transition-all duration-150 flex-shrink-0"
                style={{
                  backgroundColor: voiceActive ? 'var(--color-accent)' : 'transparent',
                  color: voiceActive ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)',
                  boxShadow: voiceActive ? '0 0 10px var(--color-accent-soft)' : 'none',
                  animation: voiceActive ? 'pulse 2s ease-in-out infinite' : 'none',
                }}
              >
                <Radio size={16} />
              </button>

              {/* Send / Cancel */}
              {loading ? (
                <button
                  onClick={abortMessage}
                  className="p-2.5 transition-all duration-200 flex-shrink-0"
                  aria-label="Cancel generation"
                  title="Cancel generation"
                  style={{
                    backgroundColor: 'var(--color-error, #f44)',
                    color: '#fff',
                    borderRadius: 'var(--radius-button)',
                  }}
                >
                  <Square size={16} />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!draft.trim()}
                  aria-label="Send message"
                  className="p-2.5 transition-all duration-200 disabled:opacity-40 flex-shrink-0"
                  style={{
                    background: 'var(--color-accent-gradient)',
                    color: 'var(--color-accent-text)',
                    borderRadius: 'var(--radius-button)',
                    boxShadow: !draft.trim() ? 'none' : '0 2px 8px var(--color-accent-soft)',
                  }}
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Model panel ─────────────────────────────────────────────────── */}
      <ModelPanel character={activeCharacter} />

      {/* ── Session management drawer ────────────────────────────────────── */}
      <SessionDrawer
        open={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        characterId={activeCharacter.id}
        characterName={activeCharacter.name}
      />
    </div>
  );
}
