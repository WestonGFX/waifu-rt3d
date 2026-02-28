import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Square, Mic, MicOff, Radio, X, BookOpen, Drama, EyeOff } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

import type { ReplyLengthMode } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { useProactive } from '../hooks/useProactive';
import { useVoiceMode } from '../hooks/useVoiceMode';
import { useAutoBackground } from '../hooks/useAutoBackground';
import { useAdaptivePacing } from '../hooks/useAdaptivePacing';
import { api } from '../lib/api';
import { DialogueBubble } from '../components/DialogueBubble';
import { WaveformVisualizer } from '../components/WaveformVisualizer';
import { StatusBar } from '../components/StatusBar';
import { ModelPanel } from '../components/ModelPanel';
import { SessionDrawer } from '../components/SessionDrawer';
import { GesturePicker } from '../components/GesturePicker';
import type { GestureName, ExpressionName } from '../components/GesturePicker';
import { GreetingCard } from '../components/GreetingCard';

// ── Types ────────────────────────────────────────────────────────────────────

/** Mic recording state for push-to-talk. */
type MicState = 'idle' | 'recording' | 'processing';

// ── Helper components ────────────────────────────────────────────────────────

/**
 * Animated three-dot bubble shown while the AI is generating a response.
 * Uses the typingDot CSS keyframe from components.css.
 *
 * @param name - Character name for the aria-label.
 */
function TypingIndicator({ name }: { name: string }) {
  return (
    <div
      className="flex items-end gap-2 px-4 py-1"
      aria-label={`${name} is typing`}
      aria-live="polite"
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '10px 14px', borderRadius: '18px 18px 18px 4px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              display: 'block', width: 6, height: 6, borderRadius: '50%',
              backgroundColor: 'var(--color-text-muted)',
              animation: 'typingDot 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Generate 3 quick-reply chip suggestions from the last assistant message.
 * Uses simple heuristics — no backend call needed.
 *
 * @param text     - Last assistant message text.
 * @param charName - Character name for personalised chips.
 * @returns Array of exactly 3 suggestion strings.
 */
function generateChips(text: string, charName: string): string[] {
  const lower = text.toLowerCase();
  const hasQuestion = text.includes('?');
  const isAskingAboutUser = /how (are|do) you|what about you|tell me/i.test(lower);
  const isEmotional = /happy|sad|miss|love|glad|wonder|hope|afraid/i.test(lower);

  if (hasQuestion && isAskingAboutUser) {
    return ["I'm doing well! 😊", "Honestly, not great…", "Tell me more first!"];
  }
  if (hasQuestion) {
    return ["Yes, definitely!", "Not really, no…", "I'm not sure, what do you think?"];
  }
  if (isEmotional) {
    return [`I feel the same way, ${charName}`, "That's really sweet ♥", "Tell me more about that"];
  }
  return ["That's interesting! Go on…", "I hadn't thought of it that way", `What else is on your mind, ${charName}?`];
}

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
  const { activeCharacter, modelPanelOpen, openOverlay, replyLengthMode, setReplyLengthMode, incognito, showQuickChips } = useAppStore();
  const { messages, draft, loading, setDraft, sendMessage, abortMessage, setContext, loadHistory, sessionId } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  // Ref shared with WaveformVisualizer so it can attach an AnalyserNode.
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickChips, setQuickChips] = useState<string[]>([]);
  // Chips are hidden until a short delay after AI response (less jarring than immediate pop-in)
  const [chipsVisible, setChipsVisible] = useState(false);
  const chipsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Context budget bar: usage % 0–100, null while loading ──────────────
  const [contextUsagePct, setContextUsagePct] = useState<number | null>(null);
  const [contextTotalTokens, setContextTotalTokens] = useState<number | null>(null);
  const [contextLimitTokens, setContextLimitTokens] = useState<number | null>(null);
  useEffect(() => {
    if (!sessionId || !activeCharacter?.id) return;
    let cancelled = false;
    const fetch = async () => {
      try {
        const res = await api.getContextBudget(sessionId, activeCharacter.id);
        if (!cancelled) {
          setContextUsagePct(res.usage_pct);
          setContextTotalTokens(res.total_tokens);
          setContextLimitTokens(res.context_limit);
        }
      } catch { /* non-critical */ }
    };
    fetch();
    // Refresh after every assistant reply (poll by watching message count)
    const iv = setInterval(fetch, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [sessionId, activeCharacter?.id, messages.length]);

  // ── Task 2: Diary state ─────────────────────────────────────────────────
  const [diaryText, setDiaryText] = useState<string | null>(null);
  const [diaryDate, setDiaryDate] = useState<string | null>(null);
  const [diaryDismissed, setDiaryDismissed] = useState(false);
  const [greetingText, setGreetingText] = useState<string | null>(null);
  const [greetingEmotion, setGreetingEmotion] = useState<string | undefined>(undefined);
  const [greetingDismissed, setGreetingDismissed] = useState(false);

  // ── Task 3: Push-to-talk mic state ──────────────────────────────────────
  const [micState, setMicState] = useState<MicState>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ── Feature D: Gesture picker state ────────────────────────────────────
  const [gesturePickerOpen, setGesturePickerOpen] = useState(false);

  // ── Feature A: Web Speech API dictation ─────────────────────────────────
  // SpeechRecognition is not in the default TS lib — store as unknown to avoid type errors
  const recognitionRef = useRef<unknown>(null);
  const [dictating, setDictating] = useState(false);

  // Auto-resize textarea to fit content (max ~5 lines ≈ 120px)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

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

  // Feature C4: fetch contextual opening greeting on character switch
  useEffect(() => {
    setGreetingDismissed(false);
    setGreetingText(null);
    if (!activeCharacter?.id) return;
    api.getGreeting(activeCharacter.id)
      .then(res => {
        if (res?.enabled && res.greeting?.trim()) {
          setGreetingText(res.greeting);
          setGreetingEmotion(res.emotion);
        }
      })
      .catch(() => { /* greeting not critical */ });
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

  // ── Feature 21: Adaptive pacing — resolve effective max_tokens ──────────
  const effectiveMaxTokens = useAdaptivePacing(replyLengthMode);

  /**
   * Cycles the reply length mode through brief → normal → detailed → auto → brief.
   * Called when the user clicks the reply length badge in the composer bar.
   */
  const cycleReplyLengthMode = useCallback(() => {
    const order: ReplyLengthMode[] = ['brief', 'normal', 'detailed', 'auto'];
    const idx = order.indexOf(replyLengthMode);
    setReplyLengthMode(order[(idx + 1) % order.length]);
  }, [replyLengthMode, setReplyLengthMode]);

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
      sendMessage('(The conversation has gone quiet. Continue naturally as your character.)', false, true, effectiveMaxTokens);
    }
  }, [sendMessage, effectiveMaxTokens]);

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

  // ── Feature C: Generate quick-reply chips whenever the AI finishes ───────
  useEffect(() => {
    // Clear any pending chip-reveal timer on each effect run
    if (chipsTimerRef.current) { clearTimeout(chipsTimerRef.current); chipsTimerRef.current = null; }

    if (!loading) {
      const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
      if (lastAssistant?.text && activeCharacter && showQuickChips) {
        const chips = generateChips(lastAssistant.text, activeCharacter.name);
        setQuickChips(chips);
        setChipsVisible(false);
        // Delay reveal by 1.5 s so they don't pop in immediately after the AI finishes
        chipsTimerRef.current = setTimeout(() => {
          setChipsVisible(true);
          chipsTimerRef.current = null;
        }, 1500);
      } else {
        setQuickChips([]);
        setChipsVisible(false);
      }
    } else {
      setQuickChips([]);
      setChipsVisible(false);
    }
  // messages and activeCharacter.id are intentionally included so chips
  // regenerate correctly after a character switch mid-session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, activeCharacter?.id, showQuickChips]);

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
        sendMessage(text, true, incognito, effectiveMaxTokens);
      } else {
        setDraft(text);
      }
    },
    [sendMessage, setDraft, incognito, effectiveMaxTokens],
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

  // ── Feature A: Web Speech API dictation callbacks ───────────────────────
  /**
   * Starts browser-native speech recognition using the Web Speech API.
   * Appends interim and final transcripts to the current draft text.
   * No-ops silently on unsupported browsers (button is hidden in that case).
   *
   * All SpeechRecognition types are cast via `unknown` because TypeScript's
   * default lib does not include Web Speech API definitions.
   */
  const startDictation = useCallback(() => {
    if (recognitionRef.current) return; // Guard: already running, ignore rapid double-click
    // Resolve constructor — Chrome uses SpeechRecognition, older uses webkit prefix
    type SRConstructor = new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((e: {
        resultIndex: number;
        results: { isFinal: boolean; [0]: { transcript: string } }[];
      }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const win = window as unknown as Record<string, unknown>;
    const SR = (win['SpeechRecognition'] ?? win['webkitSpeechRecognition']) as SRConstructor | undefined;
    if (!SR) return; // Browser doesn't support — button is hidden when unsupported
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    let base = draft; // snapshot of draft at click time
    rec.onresult = (e) => {
      let interim = '';
      let final = base;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) { final += e.results[i][0].transcript; base = final; }
        else interim += e.results[i][0].transcript;
      }
      setDraft(final + interim);
    };
    rec.onerror = () => { recognitionRef.current = null; setDictating(false); };
    rec.onend   = () => { recognitionRef.current = null; setDictating(false); };
    recognitionRef.current = rec;
    rec.start();
    setDictating(true);
  }, [draft, setDraft]);

  /** Stops an active Web Speech recognition session. */
  const stopDictation = useCallback(() => {
    (recognitionRef.current as { stop: () => void } | null)?.stop();
    recognitionRef.current = null;
    setDictating(false);
  }, []);

  /** Toggles Web Speech dictation on/off. */
  const toggleDictation = useCallback(() => {
    if (dictating) stopDictation();
    else startDictation();
  }, [dictating, startDictation, stopDictation]);

  // Stop Web Speech dictation if voice-first mode activates (they can't coexist)
  useEffect(() => {
    if (voiceActive && dictating) stopDictation();
  }, [voiceActive, dictating, stopDictation]);

  // Release microphone and stop recognition when the component unmounts
  useEffect(() => {
    return () => {
      (recognitionRef.current as { stop: () => void } | null)?.stop();
      recognitionRef.current = null;
    };
  }, []);

  // ── Feature D: Gesture picker ───────────────────────────────────────────
  const handleGesture = useCallback((_g: GestureName | null, _e: ExpressionName | null) => {
    setGesturePickerOpen(false);
  }, []);

  // ── Send / keyboard ─────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!draft.trim() || loading) return;
    idleFired.current = false;
    setGreetingDismissed(true); // dismiss greeting on first user message
    sendMessage(draft, true, incognito, effectiveMaxTokens);
  }, [draft, loading, sendMessage, incognito, effectiveMaxTokens]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ── Feature E: Dialogue choice select ──────────────────────────────────
  const handleChoiceSelect = useCallback((choice: string) => {
    idleFired.current = false;
    sendMessage(choice, true, incognito, effectiveMaxTokens);
  }, [sendMessage, incognito, effectiveMaxTokens]);

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

  /**
   * Exports the conversation as a Markdown file.
   *
   * Formats each message as a bold speaker label followed by the message text,
   * separated by blank lines. Includes a header block with character name,
   * export date, and session ID.
   */
  const handleExportMarkdown = useCallback(() => {
    const charName = activeCharacter?.name ?? 'AI';
    const date = new Date().toLocaleString();
    const lines = messages.map(m => {
      const who = m.role === 'user' ? 'You' : charName;
      return `**${who}:** ${m.text ?? ''}`;
    });
    const content = [
      `# Conversation with ${charName}`,
      `**Date:** ${date}`,
      `**Session:** ${sessionId ?? 'Unknown'}`,
      `**Affinity Tier:** Unknown`,
      '',
      '---',
      '',
      lines.join('\n\n'),
      '',
      '---',
      '*Exported from Waifu-RT3D*',
    ].join('\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${charName.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, activeCharacter, sessionId]);

  // ── Audio playback ───────────────────────────────────────────────────────
  const playAudio = useCallback((msg: { id: string; audioUrl?: string }) => {
    if (!msg.audioUrl) return;
    const audio = new Audio(msg.audioUrl);
    const vol = useAppStore.getState().config?.tts_volume;
    audio.volume = typeof vol === 'number' ? vol : 1.0;
    // Share the element with WaveformVisualizer before play() so the analyser
    // can attach before the audio context starts consuming data.
    ttsAudioRef.current = audio;
    setPlayingAudioId(msg.id);
    audio.onended = () => { setPlayingAudioId(null); };
    audio.play().catch(() => { setPlayingAudioId(null); });
  }, []);

  if (!activeCharacter) return null;

  const showDiary = diaryText && !diaryDismissed;
  const showGreeting = greetingText && !greetingDismissed;

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* ── Chat column ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        <StatusBar
          character={activeCharacter}
          onOpenSessions={() => setSessionsOpen(true)}
          onSearchChange={setSearchQuery}
          onExport={handleExport}
          onExportMarkdown={handleExportMarkdown}
          messageCount={messages.length}
          sessionId={sessionId}
        />

        {/* Context budget bar — thin strip showing context window usage */}
        {contextUsagePct !== null && contextUsagePct > 0 && (
          <div
            title={`Context window: ${contextTotalTokens?.toLocaleString() ?? '?'} / ${contextLimitTokens?.toLocaleString() ?? '?'} tokens (${contextUsagePct}%)`}
            style={{
              width: '100%',
              height: 3,
              backgroundColor: 'var(--color-border-subtle)',
              flexShrink: 0,
              cursor: 'default',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(contextUsagePct, 100)}%`,
                backgroundColor:
                  contextUsagePct < 50 ? 'var(--color-success, #39c96e)'
                  : contextUsagePct < 80 ? '#e8a22a'
                  : '#f44',
                transition: 'width 0.6s ease, background-color 0.6s ease',
              }}
            />
          </div>
        )}

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
              <BookOpen size={16} style={{ flexShrink: 0 }} />
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

        {/* Feature C4: Opening greeting card */}
        {showGreeting && (
          <GreetingCard
            charName={activeCharacter.name}
            greeting={greetingText!}
            emotion={greetingEmotion}
            onDismiss={() => setGreetingDismissed(true)}
          />
        )}

        {/* ── Message list ──────────────────────────────────────────────── */}
        <div ref={scrollRef} className="chat-area flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full">
          {searchQuery && (
            <p className="text-center text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
              {visibleMessages.length === 0 ? 'No messages match' : `${visibleMessages.length} message${visibleMessages.length === 1 ? '' : 's'} found`}
            </p>
          )}

          {/* Empty-state greeting — shown when chat is empty and not still loading */}
          {!loading && visibleMessages.length === 0 && !searchQuery && (
            <div
              className="flex flex-col items-center justify-center py-16 px-4 text-center"
              style={{ minHeight: '60vh' }}
            >
              {/* Avatar */}
              {activeCharacter.avatar_url ? (
                <img
                  src={activeCharacter.avatar_url}
                  alt=""
                  className="w-20 h-20 rounded-full object-cover mb-5"
                  style={{ boxShadow: '0 4px 24px var(--color-accent-soft)', border: '2px solid var(--color-accent-soft)' }}
                />
              ) : (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
                  style={{
                    background: 'var(--color-accent-gradient)',
                    boxShadow: '0 4px 24px var(--color-accent-soft)',
                    fontSize: '2rem',
                    color: 'var(--color-accent-text)',
                  }}
                >
                  {activeCharacter.name?.[0] ?? '?'}
                </div>
              )}

              <h2 className="char-name-display mb-2" style={{ color: 'var(--color-accent)', fontSize: '1.4rem' }}>
                {activeCharacter.name}
              </h2>

              {/* "No messages yet" label */}
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginBottom: 16, opacity: 0.7 }}>
                No messages yet — say hello!
              </p>

              {/* Greeting card */}
              {activeCharacter.greeting_message && (
                <p
                  className="text-sm leading-relaxed max-w-sm mb-6"
                  style={{
                    color: 'var(--color-text-secondary)',
                    fontStyle: 'italic',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-card)',
                    padding: '14px 18px',
                    boxShadow: 'var(--shadow-card)',
                    opacity: 0.9,
                  }}
                >
                  "{activeCharacter.greeting_message}"
                </p>
              )}

              {/* Starter prompt buttons — centered, appear after 1 s */}
              {showQuickChips && (
                <div
                  className="flex flex-wrap gap-2 justify-center max-w-sm"
                  style={{ opacity: 0.75 }}
                  role="group"
                  aria-label="Suggested conversation starters"
                >
                  {[
                    `Tell me about yourself`,
                    `How are you feeling today?`,
                    `What do you want to talk about?`,
                  ].map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => { idleFired.current = false; sendMessage(prompt, true, incognito, effectiveMaxTokens); }}
                      className="px-4 py-2 rounded-full text-xs transition-all duration-150"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {visibleMessages.map((msg) => (
            <div
              key={msg.id}
              className="group relative"
            >
              <DialogueBubble
                message={msg}
                character={activeCharacter}
                onPlayAudio={() => playAudio(msg)}
                isPlaying={playingAudioId === msg.id}
                searchQuery={searchQuery}
                onChoiceSelect={handleChoiceSelect}
              />
            </div>
          ))}

          {/* Typing indicator — shown while AI is generating */}
          {loading && <TypingIndicator name={activeCharacter.name} />}
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
            {/* Quick-reply chips — appear after AI response, hidden while typing or loading */}
            {quickChips.length > 0 && chipsVisible && !draft && !loading && (
              <div className="flex gap-2 mb-2 flex-wrap justify-center" role="group" aria-label="Quick reply suggestions">
                {quickChips.map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      // Read draft synchronously from store to avoid stale closure
                      // race where the user typed between last render and this click.
                      if (useChatStore.getState().draft) return;
                      setQuickChips([]);
                      sendMessage(chip, true, incognito, effectiveMaxTokens);
                    }}
                    className="px-3 py-1.5 text-xs rounded-full transition-all duration-150"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {/* TTS Waveform Visualizer — shown while audio is playing */}
            {playingAudioId && (
              <div className="mb-2 px-1">
                <WaveformVisualizer audioRef={ttsAudioRef} playing={!!playingAudioId} />
              </div>
            )}

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

            {/* Feature 26: Incognito banner — shown above textarea when active */}
            {incognito && (
              <div
                style={{
                  backgroundColor: 'rgba(147, 51, 234, 0.12)',
                  borderTop: '1px solid rgba(147, 51, 234, 0.3)',
                  color: 'rgb(167, 139, 250)',
                  fontSize: 10,
                  padding: '6px 16px',
                  width: '100%',
                  marginBottom: 6,
                  borderRadius: 6,
                }}
              >
                <EyeOff size={10} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 5 }} />
                INCOGNITO — This conversation won't be saved
              </div>
            )}

            {/* Composer row */}
            <div className="flex items-end gap-2">
              {/* Scenario Library trigger */}
              <button
                onClick={() => openOverlay('scenarios')}
                title="Scenario library (Alt+I)"
                aria-label="Open scenario library"
                className="p-2 rounded-lg transition-all duration-150 flex-shrink-0 text-base leading-none"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <BookOpen size={16} />
              </button>

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
                <Drama size={16} />
              </button>

              {/* Reply length badge — cycles through brief/normal/detailed/auto on click */}
              <button
                onClick={cycleReplyLengthMode}
                title={`Reply length: ${replyLengthMode}. Click to cycle.`}
                aria-label={`Reply length mode: ${replyLengthMode}`}
                className="flex-shrink-0 flex flex-col items-center justify-center leading-none rounded-lg px-1.5 py-1 transition-all duration-150"
                style={{
                  color: replyLengthMode !== 'normal' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                  backgroundColor: replyLengthMode !== 'normal' ? 'var(--color-accent-soft)' : 'transparent',
                  minWidth: 36,
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'capitalize', lineHeight: 1.2 }}>
                  {replyLengthMode === 'brief' ? 'Brief' :
                   replyLengthMode === 'detailed' ? 'Long' :
                   replyLengthMode === 'auto' ? 'Auto' : 'Norm'}
                </span>
                {replyLengthMode === 'auto' && (
                  <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', lineHeight: 1.2 }}>
                    {effectiveMaxTokens}t
                  </span>
                )}
              </button>

              {/* Text input */}
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); if (quickChips.length) { setQuickChips([]); setChipsVisible(false); } }}
                onKeyDown={handleKeyDown}
                placeholder={
                  dictating ? 'Dictating — speak now…' :
                  voiceActive ? 'Voice mode active — speak to send…' :
                  incognito ? 'Incognito — not saved…' :
                  `Message ${activeCharacter.name}…`
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
                  overflowY: 'hidden',
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

              {/* Voice dictation — Web Speech API (Chrome/Edge). Hidden when unsupported. */}
              {!voiceActive && !!(
                (window as unknown as Record<string, unknown>).SpeechRecognition ||
                (window as unknown as Record<string, unknown>).webkitSpeechRecognition
              ) && (
                <button
                  onClick={toggleDictation}
                  title={dictating ? 'Stop dictation (Web Speech)' : 'Dictate message (Web Speech API)'}
                  aria-label={dictating ? 'Stop voice dictation' : 'Start voice dictation'}
                  aria-pressed={dictating}
                  className="p-2 rounded-lg transition-all duration-150 flex-shrink-0"
                  style={{
                    backgroundColor: dictating ? 'var(--color-success, #39c96e)' : 'transparent',
                    color: dictating ? '#fff' : 'var(--color-text-tertiary)',
                  }}
                >
                  <Mic size={16} />
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
                  className="send-btn p-2.5 transition-all duration-200 disabled:opacity-40 flex-shrink-0"
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
