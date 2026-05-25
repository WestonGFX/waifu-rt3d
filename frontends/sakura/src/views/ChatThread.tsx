import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Square, Mic, MicOff, Radio, X, BookOpen, Drama, EyeOff, Tv, Phone, Clapperboard, Shield, Sparkles, SlidersHorizontal, Check, MessageCircle, Zap, Italic, Pin } from 'lucide-react';
import { VNTextBox } from '../components/VNTextBox';
import { VNPortrait } from '../components/VNPortrait';
import { useAppStore } from '../stores/appStore';
import { useViewerStore } from '../stores/viewerStore';

import type { ReplyLengthMode } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { useProactive } from '../hooks/useProactive';
import { useVoiceMode } from '../hooks/useVoiceMode';
import { useAutoBackground } from '../hooks/useAutoBackground';
import { useBondProgress } from '../hooks/useBondProgress';
import { useMemorialScene } from '../hooks/useMemorialScene';
import { useAdaptivePacing } from '../hooks/useAdaptivePacing';
import { useCharacterAudio } from '../hooks/useCharacterAudio';
import { api } from '../lib/api';
import { useToastStore } from '../components/ToastQueue';
import { downloadBlob } from '../lib/downloadFile';
import { DialogueBubble } from '../components/DialogueBubble';
import { WaveformVisualizer } from '../components/WaveformVisualizer';
import { StatusBar } from '../components/StatusBar';
import { ModelPanel } from '../components/ModelPanel';
import { SessionDrawer } from '../components/SessionDrawer';
import { GesturePicker } from '../components/GesturePicker';
import type { GestureName, ExpressionName } from '../components/GesturePicker';
import { VoiceConversationPanel } from '../components/VoiceConversationPanel';
// Session-46: GreetingCard removed from render. Import dropped.
// import { GreetingCard } from '../components/GreetingCard';
import { RichComposer, type RichComposerHandle } from '../components/RichComposer';
import { LLMProbeAside } from '../components/LLMProbeAside';

// ── Types ────────────────────────────────────────────────────────────────────

/** Mic recording state for push-to-talk. */
type MicState = 'idle' | 'recording' | 'processing';

// ── Helper components ────────────────────────────────────────────────────────

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
  const { activeCharacter, modelPanelOpen, openOverlay, replyLengthMode, setReplyLengthMode, incognito, showQuickChips, cinematicMode, vnMode, toggleVnMode, config, saveConfig, layoutMode } = useAppStore();
  const { messages, draft, loading, setDraft, sendMessage, sendDirectorNote, abortMessage, setContext, loadHistory, sessionId, directorMode, setDirectorMode, regenerateImage, continueGeneration, toggleReaction } = useChatStore();
  void toggleReaction; // session-46: emoji reactions removed.
  const scrollRef = useRef<HTMLDivElement>(null);
  // Gaze flick: fire once per typing burst, debounced 2s so holding a key doesn't spam
  const gazeFlickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  // Ref shared with WaveformVisualizer so it can attach an AnalyserNode.
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const textareaRef = useRef<RichComposerHandle | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  // ── AIE Phase C: Feedback signal preferences ────────────────────────────
  // Session-46 declutter: 👍/👎 feedback buttons under every assistant
  // message are emoji-reaction noise that doesn't compound into anything
  // visible. User specifically said: "i hate the feature we added that
  // lets users emoji react to messages". Default OFF.
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  useEffect(() => {
    api.getFeedbackPreferences()
      .then(prefs => setFeedbackEnabled(prefs.explicit_signals_enabled))
      .catch(() => { /* default true on error */ });
  }, []);

  // ── Task 2: Diary state ─────────────────────────────────────────────────
  const [diaryText, setDiaryText] = useState<string | null>(null);
  const [diaryDate, setDiaryDate] = useState<string | null>(null);
  const [diaryDismissed, setDiaryDismissed] = useState(false);
  const [greetingText, setGreetingText] = useState<string | null>(null);
  const [greetingEmotion, setGreetingEmotion] = useState<string | undefined>(undefined);
  void greetingEmotion;
  const [greetingDismissed, setGreetingDismissed] = useState(false);

  // ── Task 3: Push-to-talk mic state ──────────────────────────────────────
  const [micState, setMicState] = useState<MicState>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ── Feature D: Gesture picker state ────────────────────────────────────
  const [gesturePickerOpen, setGesturePickerOpen] = useState(false);
  const [whisperMode, setWhisperMode] = useState(false);
  const [quickFireMode, setQuickFireMode] = useState(false);

  // ── Tier 3 HUD: ⚙ Modes inline popover ─────────────────────────────────
  // Holds the 5 mode toggles + whisper + quickfire that previously lived in
  // their own row above the composer. Collapses 3 rows → 1 row.
  const [modesOpen, setModesOpen] = useState(false);
  const modesBtnRef = useRef<HTMLButtonElement>(null);
  const modesMenuRef = useRef<HTMLDivElement>(null);

  // ── Feature A1: Full-duplex voice conversation mode ─────────────────────
  const [fullDuplexVoice, setFullDuplexVoice] = useState(false);

  // ── Phase 12-P5: Character ambient audio ──────────────────────────────
  useCharacterAudio();

  // Tier 3 HUD: close ⚙ Modes popover on outside click.
  useEffect(() => {
    if (!modesOpen) return;
    const handle = (e: MouseEvent) => {
      if (
        modesMenuRef.current?.contains(e.target as Node) ||
        modesBtnRef.current?.contains(e.target as Node)
      ) return;
      setModesOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [modesOpen]);

  // ── Feature B3: VN reader — index of the message currently shown ────────
  // Starts at last message; advances to next on each "advance" action.
  const [vnMessageIdx, setVnMessageIdx] = useState(-1);
  useEffect(() => {
    if (vnMode && messages.length > 0) setVnMessageIdx(messages.length - 1);
  }, [vnMode, messages.length]);

  // ── Feature A: Web Speech API dictation ─────────────────────────────────
  // SpeechRecognition is not in the default TS lib — store as unknown to avoid type errors
  const recognitionRef = useRef<unknown>(null);
  const [dictating, setDictating] = useState(false);

  // RichComposer handles its own sizing via CSS max-height + overflow-y:auto.

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

  // Track whether the next message update is a fresh session load (force scroll)
  const forceScrollRef = useRef(false);

  // Create/resume chat session when character changes
  useEffect(() => {
    if (!activeCharacter) return;
    forceScrollRef.current = true;
    api.createSession(activeCharacter.id)
      .then((session) => {
        setContext(session.id, activeCharacter.id);
        if (session.id) loadHistory(session.id);
      })
      .catch(console.error);
  }, [activeCharacter, setContext, loadHistory]);

  // Auto-scroll to bottom when new messages arrive or text streams in.
  // Force-scroll on session load; near-bottom check for subsequent messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (forceScrollRef.current) {
      forceScrollRef.current = false;
      el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
      return;
    }
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

  /**
   * Cycles content filter level: 0 (Off) → -1 (NSFW) → 1 (SFW) → 0 (Off).
   * Persists to backend config via appStore.saveConfig().
   */
  const contentFilterLevel = Number(config?.content_filter_level ?? 0);
  const cycleContentFilter = useCallback(() => {
    const order = [0, -1, 1];
    const idx = order.indexOf(contentFilterLevel);
    const next = order[(idx + 1) % order.length];
    saveConfig({ content_filter_level: next });
  }, [contentFilterLevel, saveConfig]);

  /** Content filter display label + tint color. */
  const filterLabel = contentFilterLevel === -1 ? 'Filter: 18+' : contentFilterLevel === 1 ? 'Filter: SFW' : 'Filter: Off';
  const filterColor = contentFilterLevel === -1 ? '#ef4444' : contentFilterLevel === 1 ? '#22c55e' : undefined;

  /**
   * Cycles RP style preset: none → light_rp → full_rp → explicit_rp → none.
   * Controls how much narration instruction the LLM receives.
   */
  const rpStyle = String(config?.rp_style_preset ?? 'none');
  const cycleRpStyle = useCallback(() => {
    const order = ['none', 'light_rp', 'full_rp', 'explicit_rp'];
    const idx = order.indexOf(rpStyle);
    const next = order[(idx + 1) % order.length];
    saveConfig({ rp_style_preset: next });
  }, [rpStyle, saveConfig]);

  /** RP style display label. */
  const rpLabel = rpStyle === 'light_rp' ? 'Style: RP' : rpStyle === 'full_rp' ? 'Style: RP+' : rpStyle === 'explicit_rp' ? 'Style: 18+RP' : 'Style: Chat';

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

  // ── Scheduler-backed proactive idle (pings backend to enqueue a message) ──
  // Distinct from the direct LLM call above — this path lets the backend
  // scheduler generate the message and deliver it via the poller, so it can
  // be persisted and acknowledged like any other scheduled message.
  const handleSchedulerIdleTrigger = useCallback(() => {
    if (activeCharacter?.id) {
      fetch(`/api/proactive/trigger-idle/${activeCharacter.id}`, { method: 'POST' }).catch(() => {});
    }
  }, [activeCharacter?.id]);

  useProactive({
    enabled: Boolean(activeCharacter?.proactive_enabled),
    idleMinutes: 10,
    onTrigger: handleSchedulerIdleTrigger,
  });

  // ── Feature I: Auto scene background on emotion change ──────────────────
  const lastAssistantEmotion = useMemo(
    () => [...messages].reverse().find(m => m.role === 'assistant')?.emotion,
    [messages],
  );
  useAutoBackground(lastAssistantEmotion, activeCharacter?.id, modelPanelOpen);

  // Bond progression: poll after each *successful* assistant reply. Counting
  // raw `messages.length` previously granted the `first_message` achievement
  // on send-attempt — including timeouts and failures — which made the toast
  // fire on the user's first failed connection attempt (session-46 P2).
  const completedAssistantCount = useMemo(
    () => messages.filter((m) => m.role === 'assistant' && m.status === 'sent').length,
    [messages],
  );
  useBondProgress(activeCharacter?.id ?? null, completedAssistantCount);

  // Memorial scene: check for pending cinematic after level-ups
  useMemorialScene(activeCharacter?.id ?? null);

  // Quick-reply chips now arrive piggybacked on the main chat-stream reply via
  // the SSE 'quick_replies' event (see chatStore.ts). The frontend just reads
  // them off the last assistant message — no separate LLM call, no timeouts,
  // no two-phase race. Toggled off when showQuickChips is false.
  const lastAssistantQuickReplies = (() => {
    if (!showQuickChips || loading) return null;
    const last = [...messages].reverse().find(m => m.role === 'assistant');
    if (!last || last.status !== 'sent' || !last.quickReplies?.length) return null;
    return last.quickReplies;
  })();

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
    setGreetingDismissed(true);
    if (directorMode) {
      sendDirectorNote(draft);
    } else {
      sendMessage(draft, true, incognito, effectiveMaxTokens);
    }
  }, [draft, loading, sendMessage, sendDirectorNote, directorMode, incognito, effectiveMaxTokens]);

  /**
   * Wrap the composer selection with `*...*`. Delegates to the RichComposer
   * imperative `wrapSelection` handle, which mutates the contenteditable
   * directly, restores caret, and fires onChange → setDraft.
   */
  const wrapSelectionWithAction = useCallback(() => {
    textareaRef.current?.wrapSelection();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      wrapSelectionWithAction();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    // Gaze flick: character glances down on the first keypress of each typing burst.
    // Debounce 2s — timer reset on each key, so burst = one flick.
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      if (!gazeFlickTimer.current) {
        useViewerStore.getState().dispatchTriggerGazeFlick();
      }
      if (gazeFlickTimer.current) clearTimeout(gazeFlickTimer.current);
      gazeFlickTimer.current = setTimeout(() => { gazeFlickTimer.current = null; }, 2000);
    }
  }, [handleSend, wrapSelectionWithAction]);

  // ── Feature E: Dialogue choice select ──────────────────────────────────
  const handleChoiceSelect = useCallback((choice: string) => {
    idleFired.current = false;
    sendMessage(choice, true, incognito, effectiveMaxTokens);
  }, [sendMessage, incognito, effectiveMaxTokens]);

  // ── T0-3: Regenerate + branch switch ────────────────────────────────────
  const [regeneratingMsgId, setRegeneratingMsgId] = useState<number | null>(null);
  const [pinnedAsMemoryId, setPinnedAsMemoryId] = useState<number | null>(null);
  void pinnedAsMemoryId; void setPinnedAsMemoryId; // session-46: Brain/Remember button removed; state kept dormant.

  const handleRegenerate = useCallback(async (serverMessageId: number) => {
    setRegeneratingMsgId(serverMessageId);
    const originalMsg = useChatStore.getState().messages.find(m => m.serverMessageId === serverMessageId);
    const originalText = originalMsg?.text ?? '';
    const originalEmotion = originalMsg?.emotion;

    // Show typing indicator while waiting
    useChatStore.setState(s => ({
      messages: s.messages.map(m =>
        m.serverMessageId === serverMessageId
          ? { ...m, text: '', status: 'pending' as const }
          : m
      ),
    }));

    try {
      const res = await api.regenerateMessage(serverMessageId);
      if (res.ok && res.new_message) {
        useChatStore.setState(s => ({
          messages: s.messages.map(m =>
            m.serverMessageId === serverMessageId
              ? { ...m, text: res.new_message.text, emotion: res.new_message.emotion ?? originalEmotion, serverMessageId: res.new_message.id, status: 'sent' as const }
              : m
          ),
        }));
      } else {
        useChatStore.setState(s => ({
          messages: s.messages.map(m =>
            m.serverMessageId === serverMessageId
              ? { ...m, text: originalText, emotion: originalEmotion, status: 'sent' as const }
              : m
          ),
        }));
      }
    } catch (err) {
      console.error('[Regenerate] failed:', err);
      useChatStore.setState(s => ({
        messages: s.messages.map(m =>
          m.serverMessageId === serverMessageId
            ? { ...m, text: originalText, emotion: originalEmotion, status: 'sent' as const }
            : m
        ),
      }));
    } finally {
      setRegeneratingMsgId(null);
    }
  }, []);

  const handleBranchSwitch = useCallback(async (newMsgId: number, newText: string, newEmotion?: string, localMessageId?: string) => {
    const { messages: currentMsgs } = useChatStore.getState();
    const addToast = useToastStore.getState().addToast;

    // Find the message being switched by its local store id (preferred) or last assistant fallback
    let switchIdx = localMessageId
      ? currentMsgs.findIndex(m => m.id === localMessageId)
      : -1;
    if (switchIdx < 0) {
      for (let i = currentMsgs.length - 1; i >= 0; i--) {
        if (currentMsgs[i].role === 'assistant') { switchIdx = i; break; }
      }
    }

    if (switchIdx < 0) return;

    // Downstream-drift warning: if messages exist after this one, context diverges
    const hasDownstream = switchIdx < currentMsgs.length - 1;
    if (hasDownstream) {
      addToast({
        message: 'Switched a past reply — later messages stay visible, but the next reply may feel inconsistent.',
        type: 'warning',
        icon: 'ⓘ',
        duration: 4000,
      });
    }

    const updated = [...currentMsgs];
    updated[switchIdx] = {
      ...updated[switchIdx],
      text: newText,
      emotion: newEmotion ?? updated[switchIdx].emotion,
      serverMessageId: newMsgId,
    };
    useChatStore.setState({ messages: updated });
  }, []);

  // Ctrl+Shift+R shortcut to regenerate last assistant message
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        if (regeneratingMsgId) return;
        const msgs = useChatStore.getState().messages;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant' && msgs[i].serverMessageId) {
            handleRegenerate(msgs[i].serverMessageId!);
            break;
          }
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [handleRegenerate, regeneratingMsgId]);

  // ── Message actions: delete + edit ─────────────────────────────────────
  const handleDeleteMessage = useCallback(async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.serverMessageId) return;
    try {
      await api.deleteMessage(msg.serverMessageId);
      useChatStore.setState(s => ({ messages: s.messages.filter(m => m.id !== messageId) }));
    } catch (err) {
      console.error('[DeleteMessage] failed:', err);
    }
  }, [messages]);

  const handleEditMessage = useCallback(async (messageId: string, newText: string) => {
    try {
      await useChatStore.getState().editMessage(messageId, newText);
    } catch (err) {
      console.error('[EditMessage] failed:', err);
    }
  }, []);

  // ── Search + pin filter ───────────────────────────────────────────────────
  const visibleMessages = useMemo(() => {
    let filtered = messages;
    if (showPinnedOnly) filtered = filtered.filter(m => m.pinned);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(m => m.text?.toLowerCase().includes(q));
    }
    return filtered;
  }, [messages, searchQuery, showPinnedOnly]);

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const lines = messages.map(m => {
      const who = m.role === 'user' ? 'You' : (activeCharacter?.name ?? 'AI');
      return `[${who}]: ${m.text}`;
    });
    const content = `${activeCharacter?.name ?? 'Chat'} — exported ${new Date().toLocaleString()}\n\n${lines.join('\n\n')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const filename = `${(activeCharacter?.name ?? 'chat').replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.txt`;
    downloadBlob(blob, filename);
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
    const filename = `${charName.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().slice(0, 10)}.md`;
    downloadBlob(blob, filename);
  }, [messages, activeCharacter, sessionId]);

  /**
   * Exports the conversation as a JSON file via the backend export API.
   * Uses the server's /api/sessions/{id}/export?format=json endpoint which
   * returns structured data with session metadata and message history.
   */
  const handleExportJson = useCallback(async () => {
    if (!sessionId) return;
    try {
      const resp = await fetch(`/api/sessions/${sessionId}/export?format=json`);
      if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);
      const blob = await resp.blob();
      const charName = (activeCharacter?.name ?? 'chat').replace(/[^a-z0-9]/gi, '_');
      const filename = `${charName}-${new Date().toISOString().slice(0, 10)}.json`;
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('[ChatThread] JSON export failed:', err);
    }
  }, [sessionId, activeCharacter]);

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
  void showGreeting;

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* ── Chat column ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0" style={{ position: 'relative' }}>
        {/* B1: Hide status bar in cinematic mode */}
        {!cinematicMode && (
          <StatusBar
            character={activeCharacter}
            onOpenSessions={() => setSessionsOpen(true)}
            onSearchChange={setSearchQuery}
            onExport={handleExport}
            onExportMarkdown={handleExportMarkdown}
            onExportJson={handleExportJson}
            messageCount={messages.length}
            sessionId={sessionId}
          />
        )}

        {/* Pin filter pill — shown when there are pinned messages to filter to */}
        {messages.some(m => m.pinned) && !cinematicMode && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px 4px' }}>
            <button
              onClick={() => setShowPinnedOnly(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20,
                border: `1px solid ${showPinnedOnly ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: showPinnedOnly ? 'var(--color-accent-soft)' : 'transparent',
                color: showPinnedOnly ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <Pin size={10} />
              Pinned
            </button>
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

        {/* Session-46 cut: GreetingCard "WILD POPUP HAS APPEARED" banner
            removed per user directive. Greetings now flow as normal chat
            messages via the proactive scheduler path, OR appear via the
            character's empty-state greeting bubble below. Banner with X
            dismiss button was visually a popup even though we called it
            a "card". User: "this kind of code makes our app look SO cheap
            and buggy". */}
        {/* GreetingCard intentionally never rendered (see comment above). */}
        {(undefined as React.ReactNode)}

        {/* ── Message list ──────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0" style={{ position: 'relative' }}>
        <div ref={scrollRef} className="chat-area h-full overflow-y-auto p-4 max-w-3xl mx-auto w-full">
          <LLMProbeAside />
          {(searchQuery || showPinnedOnly) && (
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {visibleMessages.length === 0
                  ? showPinnedOnly ? 'No pinned messages — pin a message from its hover menu.' : 'No messages match'
                  : `${visibleMessages.length} message${visibleMessages.length === 1 ? '' : 's'}${showPinnedOnly ? ' pinned' : ' found'}`}
              </p>
              {showPinnedOnly && (
                <button
                  onClick={() => setShowPinnedOnly(false)}
                  style={{ fontSize: '0.7rem', color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Show all
                </button>
              )}
            </div>
          )}

          {/* Empty-state greeting — shown when chat is empty and not still loading */}
          {!loading && visibleMessages.length === 0 && !searchQuery && !showPinnedOnly && (
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

          {(() => {
            // Pre-compute last assistant index for the loop
            let lastAssistantVisIdx = -1;
            for (let i = visibleMessages.length - 1; i >= 0; i--) {
              if (visibleMessages[i].role === 'assistant') { lastAssistantVisIdx = i; break; }
            }
            return visibleMessages.map((msg, idx) => {
            const isLastAssistant = msg.role === 'assistant' && idx === lastAssistantVisIdx;
            // session-46: emoji-reactions removed; canReact retained but unused.
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const canReact = !!msg.serverMessageId && msg.status === 'sent';
            void canReact;
            return (
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
                  onRegenerate={handleRegenerate}
                  onRegenerateImage={regenerateImage}
                  onBranchSwitch={handleBranchSwitch}
                  onDelete={handleDeleteMessage}
                  onEdit={handleEditMessage}
                  isLastAssistant={isLastAssistant}
                  isRegenerating={regeneratingMsgId === msg.serverMessageId}
                  onContinue={isLastAssistant ? continueGeneration : undefined}
                  feedbackEnabled={feedbackEnabled}
                />
                {/* Session-46 cut (user directive — TWICE): 5-emoji reaction
                    picker (👍 ❤️ 😂 😮 😭), the Brain "Remember" button, AND
                    the existing-reactions row all removed from chat. User:
                    "i dont like or want any of those anymore". The DialogueBubble
                    Pin + Bookmark were removed earlier; this is a SEPARATE
                    reaction layer in ChatThread that I missed. `canReact` and
                    `pinnedAsMemoryId` state kept dormant for now — no UI
                    surface to trigger them. */}
              </div>
            );
          });
          })()}

          {/* Thinking indicator now lives inside the assistant DialogueBubble
              while the message is in 'pending' status — see ThinkingPlaceholder
              in DialogueBubble.tsx. The standalone bubble caused redundant UI
              and easy-to-miss positioning below an empty placeholder. */}
        </div>
        </div>{/* end message list wrapper */}

        {/* ── Feature B3: VN Reader overlay ────────────────────────────── */}
        {vnMode && (
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 50,
              backgroundColor: 'var(--color-background)',
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              overflow: 'hidden',
            }}
          >
            {/* Background scene */}
            {activeCharacter.background_url ? (
              <div
                style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: `url(${activeCharacter.background_url})`,
                  backgroundSize: 'cover', backgroundPosition: 'center',
                  filter: 'brightness(0.55) saturate(0.8)',
                }}
              />
            ) : (
              <div
                style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(160deg, #1a0a2e 0%, #0d1b2a 60%, #051015 100%)',
                }}
              />
            )}

            {/* Character portrait */}
            <VNPortrait
              avatarUrl={activeCharacter.avatar_url}
              charName={activeCharacter.name}
              dimmed={messages[vnMessageIdx]?.role === 'user'}
              side="left"
            />

            {/* Dialogue text box at bottom */}
            <div
              style={{
                position: 'relative', zIndex: 4,
                padding: '0 40px 24px',
                maxWidth: 860, width: '100%', margin: '0 auto',
              }}
            >
              <VNTextBox
                message={messages[vnMessageIdx]}
                charName={activeCharacter.name}
                onAdvance={() => {
                  // Navigate forward through history; when at end do nothing
                  setVnMessageIdx(i => Math.min(i + 1, messages.length - 1));
                }}
              />
            </div>

            {/* Navigation row */}
            <div
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 10,
                display: 'flex', gap: 6,
              }}
            >
              {/* ← prev / → next message nav */}
              <button
                onClick={() => setVnMessageIdx(i => Math.max(i - 1, 0))}
                disabled={vnMessageIdx <= 0}
                style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.65)', fontSize: 12, cursor: 'pointer',
                  backdropFilter: 'blur(4px)',
                  opacity: vnMessageIdx <= 0 ? 0.3 : 1,
                }}
              >
                ◀
              </button>
              <button
                onClick={() => setVnMessageIdx(i => Math.min(i + 1, messages.length - 1))}
                disabled={vnMessageIdx >= messages.length - 1}
                style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.65)', fontSize: 12, cursor: 'pointer',
                  backdropFilter: 'blur(4px)',
                  opacity: vnMessageIdx >= messages.length - 1 ? 0.3 : 1,
                }}
              >
                ▶
              </button>
              <span
                style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.4)', fontSize: 11,
                  backdropFilter: 'blur(4px)',
                }}
              >
                {vnMessageIdx + 1} / {messages.length}
              </span>
              <button
                onClick={toggleVnMode}
                title="Exit VN mode"
                style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', backdropFilter: 'blur(4px)',
                  letterSpacing: '0.04em',
                }}
              >
                EXIT
              </button>
            </div>
          </div>
        )}

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
            {/* Context-aware quick-reply chips — piggybacked on the main reply
                via the SSE 'quick_replies' event. Hidden while typing or loading. */}
            {lastAssistantQuickReplies && !draft && (
              <div
                className="flex gap-2 mb-2 flex-wrap justify-center"
                role="group"
                aria-label="Quick reply suggestions"
              >
                {lastAssistantQuickReplies.map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (useChatStore.getState().draft) return;
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

            {/* Director Mode banner — shown above textarea when active */}
            {directorMode && (
              <div
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  borderTop: '1px solid rgba(245, 158, 11, 0.3)',
                  color: 'rgb(245, 158, 11)',
                  fontSize: 10,
                  padding: '6px 16px',
                  width: '100%',
                  marginBottom: 6,
                  borderRadius: 6,
                }}
              >
                <Clapperboard size={10} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 5 }} />
                DIRECTOR MODE — Stage directions steer the AI without breaking immersion
              </div>
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

            {/* Tier 3 HUD: 1-row composer (was 3 rows). ⚙ Modes popover holds
                the 5 mode toggles + whisper + quickfire. Segmented status
                pill renders the 3 cycle controls inline. Voice icons + send
                stay where they were. */}
            <div className="flex items-end gap-2 w-full min-w-0">
              {/* ⚙ Modes inline popover — hidden in Minimal layout mode */}
              {layoutMode !== 'minimal' && (() => {
                const anyModeOn = vnMode || gesturePickerOpen || directorMode || whisperMode || quickFireMode;
                return (
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                      ref={modesBtnRef}
                      onClick={() => setModesOpen(o => !o)}
                      title="Composer modes (scenarios, gestures, director, whisper, quickfire)"
                      aria-label="Toggle composer modes menu"
                      aria-haspopup="true"
                      aria-expanded={modesOpen}
                      className="p-2 rounded-lg transition-all duration-150"
                      style={{
                        backgroundColor: modesOpen || anyModeOn ? 'var(--color-accent-soft)' : 'transparent',
                        color: modesOpen || anyModeOn ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                        boxShadow: anyModeOn ? '0 0 8px var(--color-accent-soft)' : 'none',
                      }}
                    >
                      <SlidersHorizontal size={16} />
                    </button>
                    {modesOpen && (
                      <div
                        ref={modesMenuRef}
                        role="menu"
                        style={{
                          position: 'absolute',
                          bottom: 'calc(100% + 4px)',
                          left: 0,
                          minWidth: 220,
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 8,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                          zIndex: 50,
                          overflow: 'hidden',
                        }}
                      >
                        <button
                          role="menuitem"
                          onClick={() => { setModesOpen(false); openOverlay('scenarios'); }}
                          className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                          style={{ color: 'var(--color-text-primary)' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                        >
                          <BookOpen size={14} /> Scenario library
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => { setModesOpen(false); openOverlay('scenariopicker'); }}
                          className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                          style={{ color: 'var(--color-text-primary)' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                        >
                          <Sparkles size={14} /> Scenario picker
                        </button>
                        <button
                          role="menuitemcheckbox"
                          aria-checked={vnMode}
                          onClick={toggleVnMode}
                          className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                          style={{ color: vnMode ? 'var(--color-accent)' : 'var(--color-text-primary)' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                        >
                          <Tv size={14} /> Visual Novel mode
                          {vnMode && <Check size={12} style={{ marginLeft: 'auto' }} />}
                        </button>
                        <button
                          role="menuitemcheckbox"
                          aria-checked={gesturePickerOpen}
                          onClick={() => setGesturePickerOpen(o => !o)}
                          className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                          style={{ color: gesturePickerOpen ? 'var(--color-accent)' : 'var(--color-text-primary)' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                        >
                          <Drama size={14} /> Gesture picker
                          {gesturePickerOpen && <Check size={12} style={{ marginLeft: 'auto' }} />}
                        </button>
                        <button
                          role="menuitemcheckbox"
                          aria-checked={directorMode}
                          onClick={() => setDirectorMode(!directorMode)}
                          className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                          style={{ color: directorMode ? 'rgb(245, 158, 11)' : 'var(--color-text-primary)' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                        >
                          <Clapperboard size={14} /> Director mode
                          {directorMode && <Check size={12} style={{ marginLeft: 'auto' }} />}
                        </button>
                        {rpStyle !== 'none' && (
                          <>
                            <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '2px 0' }} />
                            <button
                              role="menuitemcheckbox"
                              aria-checked={whisperMode}
                              onClick={() => setWhisperMode(!whisperMode)}
                              className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                              style={{ color: whisperMode ? 'rgb(139, 92, 246)' : 'var(--color-text-primary)' }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                            >
                              <MessageCircle size={14} /> Whisper mode
                              {whisperMode && <Check size={12} style={{ marginLeft: 'auto' }} />}
                            </button>
                            <button
                              role="menuitemcheckbox"
                              aria-checked={quickFireMode}
                              onClick={() => setQuickFireMode(!quickFireMode)}
                              className="w-full text-left px-4 py-2.5 text-xs transition-all duration-150 flex items-center gap-2"
                              style={{ color: quickFireMode ? 'rgb(249, 115, 22)' : 'var(--color-text-primary)' }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-accent-soft)')}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                            >
                              <Zap size={14} /> Quickfire mode
                              {quickFireMode && <Check size={12} style={{ marginLeft: 'auto' }} />}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Segmented status pill — Brief · Off · 18+RP. Each segment is
                  its own click-to-cycle button. Visually unified into one pill. */}
              <div
                className="flex items-center rounded-lg"
                style={{
                  backgroundColor: 'var(--color-background)',
                  border: '1px solid var(--color-border-subtle)',
                  flexShrink: 0,
                  alignSelf: 'center',
                }}
              >
                <button
                  onClick={cycleReplyLengthMode}
                  title={`Reply length: ${replyLengthMode}. Click to cycle.`}
                  aria-label={`Reply length mode: ${replyLengthMode}`}
                  className="px-2 py-1 transition-all duration-150"
                  style={{
                    color: replyLengthMode !== 'normal' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                    fontSize: 10,
                    fontWeight: 600,
                    lineHeight: 1.2,
                    minWidth: 40,
                  }}
                >
                  {replyLengthMode === 'brief' ? 'Brief' :
                   replyLengthMode === 'detailed' ? 'Long' :
                   replyLengthMode === 'auto' ? `Auto·${effectiveMaxTokens}t` : 'Norm'}
                </button>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 10, opacity: 0.5 }}>·</span>
                <button
                  onClick={cycleContentFilter}
                  title={`Content filter: ${filterLabel}. Click to cycle. (Off → NSFW → SFW → Off)`}
                  aria-label={`Content filter: ${filterLabel}`}
                  className="px-2 py-1 transition-all duration-150 flex items-center gap-1"
                  style={{
                    color: filterColor ?? 'var(--color-text-tertiary)',
                    fontSize: 10,
                    fontWeight: 600,
                    lineHeight: 1.2,
                  }}
                >
                  <Shield size={10} />
                  {contentFilterLevel === -1 ? '18+' : contentFilterLevel === 1 ? 'SFW' : 'Off'}
                </button>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 10, opacity: 0.5 }}>·</span>
                <button
                  onClick={cycleRpStyle}
                  title={`RP style: ${rpLabel}. Click to cycle. (Chat → Light RP → Full RP → Explicit RP → Chat)`}
                  aria-label={`RP style: ${rpLabel}`}
                  className="px-2 py-1 transition-all duration-150 flex items-center gap-1"
                  style={{
                    color: rpStyle !== 'none' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                    fontSize: 10,
                    fontWeight: 600,
                    lineHeight: 1.2,
                  }}
                >
                  <Sparkles size={10} />
                  {rpStyle === 'light_rp' ? 'RP' : rpStyle === 'full_rp' ? 'RP+' : rpStyle === 'explicit_rp' ? '18+RP' : 'Chat'}
                </button>
              </div>

              {/* Text input — RichComposer renders *italic* tokens live as the
                  user types. onChange receives the plain text string (not an event). */}
              <RichComposer
                ref={textareaRef}
                value={draft}
                onChange={(next) => setDraft(next)}
                onKeyDown={handleKeyDown}
                placeholder={
                  dictating ? 'Dictating — speak now…' :
                  voiceActive ? 'Voice mode active — speak to send…' :
                  directorMode ? "Director's note — stage direction…" :
                  incognito ? 'Incognito — not saved…' :
                  `Message ${activeCharacter.name}…`
                }
                aria-label="Message composer"
                className="rich-composer flex-1 px-4 py-2.5 text-sm outline-none transition-all duration-200"
                style={{
                  backgroundColor: 'var(--color-background)',
                  borderRadius: 'var(--radius-input)',
                  border: directorMode
                    ? '1px solid rgb(245, 158, 11)'
                    : voiceActive
                    ? '1px solid color-mix(in srgb, var(--color-accent) 50%, transparent)'
                    : incognito
                    ? '1px solid var(--color-accent)'
                    : '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  minWidth: 0,
                  minHeight: 40,
                  maxHeight: 120,
                  overflowY: 'auto',
                  boxSizing: 'border-box',
                  lineHeight: 1.4,
                }}
              />

              {/* Italic / action wrap button — wraps textarea selection in
                  `*...*` so it renders as an accent-coloured roleplay action.
                  With no selection, drops `**` and parks cursor between. */}
              <button
                type="button"
                onClick={wrapSelectionWithAction}
                title="Wrap selection in *italic* (Ctrl/Cmd+I) — for roleplay actions"
                aria-label="Wrap selection in italic action"
                className="p-2 rounded-lg transition-all duration-150 flex-shrink-0"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                <Italic size={16} />
              </button>

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

              {/* Voice-First Mode toggle (push-to-talk auto-send) */}
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

              {/* Feature A1: Full-duplex voice conversation toggle */}
              <button
                onClick={() => setFullDuplexVoice(v => !v)}
                title={fullDuplexVoice ? 'Exit voice conversation' : 'Start voice conversation (full-duplex)'}
                aria-label={fullDuplexVoice ? 'Exit voice conversation' : 'Start voice conversation'}
                aria-pressed={fullDuplexVoice}
                className="p-2 rounded-lg transition-all duration-150 flex-shrink-0"
                style={{
                  backgroundColor: fullDuplexVoice ? 'var(--color-accent)' : 'transparent',
                  color: fullDuplexVoice ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)',
                  boxShadow: fullDuplexVoice ? '0 0 10px var(--color-accent-soft)' : 'none',
                }}
              >
                <Phone size={16} />
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

      {/* ── Feature A1: Full-duplex voice conversation overlay ──────── */}
      {fullDuplexVoice && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            backgroundColor: 'var(--color-background)',
          }}
        >
          <VoiceConversationPanel
            sessionId={sessionId}
            charId={activeCharacter.id}
            onClose={() => setFullDuplexVoice(false)}
            onUserMessage={(text) => {
              // Inject user speech as a chat message for persistence
              sendMessage(text, true, incognito);
            }}
          />
        </div>
      )}

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
