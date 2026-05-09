import { create } from 'zustand';
import type { ChatMessage } from '../lib/types';
import { api } from '../lib/api';
import { useViewerStore } from './viewerStore';

interface ChatState {
  messages: ChatMessage[];
  draft: string;
  loading: boolean;
  sessionId: number | null;
  charId: number | null;
  /** Active AbortController for cancelling in-flight streaming requests. */
  abortController: AbortController | null;
  /** Current emotion detected from the most recent assistant reply, or null when neutral. */
  currentEmotion: { emotion: string; intensity: number } | null;
  /** Phase 15: Latest emotion per character (charId → { emotion, timestamp }). */
  latestEmotionByChar: Record<number, { emotion: string; timestamp: number }>;
  /** Director Mode toggle — when active, input sends director notes instead of chat messages. */
  directorMode: boolean;
  setDirectorMode: (v: boolean) => void;
  setDraft: (text: string) => void;
  setContext: (sessionId: number, charId: number) => void;
  sendMessage: (text: string, speak?: boolean, incognito?: boolean, maxTokens?: number) => Promise<void>;
  /** Send a director note — stored in DB but does NOT trigger LLM response. */
  sendDirectorNote: (text: string) => Promise<void>;
  abortMessage: () => void;
  /** Inject a proactive message from the scheduler as an assistant message (no LLM call). */
  injectProactiveMessage: (msg: { text: string; serverMessageId?: number }) => void;
  loadHistory: (sessionId: number) => Promise<void>;
  clear: () => void;
  /** Drive the VRM viewer's expression and mirror state into the store. */
  setCurrentEmotion: (emotion: string, intensity: number) => void;
  /**
   * Regenerate the image attached to a prior assistant message in place.
   * Reads the message's stored `imagePrompt` (resolved with style prefix
   * during the original tool_result), re-fires the portrait endpoint, and
   * patches the new `imageUrl` onto the same message — never appends a new
   * bubble.
   */
  regenerateImage: (messageId: string) => Promise<void>;
  /**
   * Edit a message's text in place. Calls PUT /api/messages/{id}, then
   * patches the local message with the new text + editedAt from the server
   * response. Does NOT trigger regeneration.
   */
  editMessage: (messageId: string, newText: string) => Promise<void>;
  /**
   * Ask the character to continue their previous response without adding a
   * visible user message. Sends `[CONTINUE]` as an incognito turn so the DB
   * and UI stay clean; the new assistant reply appears as a fresh bubble.
   */
  continueGeneration: () => Promise<void>;
  /** Re-send the text from a timed-out turn, removing the old timeout card first. */
  retryLastTimeout: (text: string) => Promise<void>;
  /** Replace a timeout card with a silent failed marker (user chose not to retry). */
  dismissTimeout: () => void;
  /** Toggle an emoji reaction on a message (optimistic update + API sync). */
  toggleReaction: (messageId: number, emoji: string) => Promise<void>;
}

const genId = () => crypto.randomUUID();

/**
 * Parse SSE events from a ReadableStream response body.
 * Uses manual chunked parsing because EventSource only supports GET,
 * but /api/chat/stream requires POST with a JSON body.
 */
async function parseSSEStream(
  response: Response,
  onEvent: (type: string, data: unknown) => void
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by double newlines
    const events = buffer.split('\n\n');
    buffer = events.pop()!; // Keep incomplete tail for next iteration

    for (const eventBlock of events) {
      if (!eventBlock.trim()) continue;

      const lines = eventBlock.split('\n');
      let eventType = 'message';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6);
        }
      }

      if (!eventData) continue;

      try {
        onEvent(eventType, JSON.parse(eventData));
      } catch (e) {
        console.warn('[SSE] Parse error:', e, eventData);
      }
    }
  }
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  draft: '',
  loading: false,
  sessionId: null,
  charId: null,
  abortController: null,
  currentEmotion: null,
  latestEmotionByChar: {},
  directorMode: false,

  setDirectorMode: (v) => set({ directorMode: v }),
  setDraft: (text) => set({ draft: text }),

  setCurrentEmotion: (emotion, intensity) => {
    const charId = get().charId;
    set(state => ({
      currentEmotion: emotion === 'neutral' ? null : { emotion, intensity },
      // Phase 15: track per-character latest emotion for sidebar indicator
      latestEmotionByChar: charId
        ? { ...state.latestEmotionByChar, [charId]: { emotion, timestamp: Date.now() } }
        : state.latestEmotionByChar,
    }));
    useViewerStore.getState().dispatchExpression(emotion, intensity);

    // Phase 3 animation polish: drive idle personality + jiggle from mood state
    const MOOD_PERSONALITY_MAP: Record<string, Record<string, number>> = {
      happy:      { energy: 0.75, nervousness: 0.1,  playfulness: 0.8 },
      excited:    { energy: 0.9,  nervousness: 0.3,  playfulness: 0.9 },
      sad:        { energy: 0.2,  nervousness: 0.2,  playfulness: 0.1 },
      angry:      { energy: 0.7,  nervousness: 0.7,  playfulness: 0.2 },
      calm:       { energy: 0.4,  nervousness: 0.05, playfulness: 0.4 },
      embarrassed:{ energy: 0.4,  nervousness: 0.8,  playfulness: 0.2 },
      flirty:     { energy: 0.6,  nervousness: 0.2,  playfulness: 0.7 },
      neutral:    { energy: 0.5,  nervousness: 0.1,  playfulness: 0.5 },
    };
    const EMOTION_JIGGLE_MAP: Record<string, number> = {
      excited: 1.3, happy: 1.1, flirty: 1.2,
      calm: 0.8, sad: 0.7, neutral: 1.0,
    };
    const normalizedEmotion = emotion.toLowerCase();
    const personality = MOOD_PERSONALITY_MAP[normalizedEmotion] ?? MOOD_PERSONALITY_MAP.neutral;
    const jiggleMult = EMOTION_JIGGLE_MAP[normalizedEmotion] ?? 1.0;
    useViewerStore.getState().dispatchSetPersonality(personality);
    useViewerStore.getState().dispatchSetJiggleEmotionMultiplier(jiggleMult);
  },

  setContext: (sessionId, charId) => set({ sessionId, charId, messages: [] }),

  clear: () => set({ messages: [], draft: '', loading: false }),

  injectProactiveMessage: (msg) => {
    const proactiveMsg: ChatMessage = {
      id: genId(),
      role: 'assistant',
      text: msg.text,
      createdAt: Date.now(),
      status: 'sent',
      serverMessageId: msg.serverMessageId,
    };
    set((s) => ({ messages: [...s.messages, proactiveMsg] }));
  },

  sendDirectorNote: async (text) => {
    const { sessionId, charId } = get();
    if (!sessionId || !charId) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    // Optimistic local insert
    const noteMsg: ChatMessage = {
      id: genId(),
      role: 'director',
      text: trimmed,
      createdAt: Date.now(),
      status: 'sent',
    };
    set((s) => ({ messages: [...s.messages, noteMsg], draft: '' }));

    // Persist to backend (no LLM call)
    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          session_id: sessionId,
          character_id: charId,
          role: 'director',
        }),
      });
      const data = await res.json();
      if (data.message_id) {
        // Patch with server ID
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === noteMsg.id ? { ...m, serverMessageId: data.message_id } : m
          ),
        }));
      }
    } catch (err) {
      console.error('[DirectorMode] Failed to save note:', err);
    }
  },

  loadHistory: async (sessionId) => {
    const data = await api.getMessages(sessionId);
    const messages: ChatMessage[] = data.messages.map((m) => ({
      id: String(m.id),
      serverMessageId: m.id,
      role: m.role as ChatMessage['role'],
      text: m.text ?? '',
      createdAt: m.ts ? new Date(m.ts).getTime() : Date.now(),
      status: 'sent',
      emotion: m.emotion ?? undefined,
      pinned: m.pinned === 1,
      imageUrl: m.image_url ?? undefined,
      imagePrompt: m.image_prompt ?? undefined,
      editedAt: m.edited_at ?? undefined,
      voiceMessageUrl: m.voice_message_url ?? undefined,
      reactions: Array.isArray(m.reactions) ? m.reactions : undefined,
    }));
    set({ messages });
  },

  abortMessage: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
      set({ abortController: null, loading: false });
    }
  },

  sendMessage: async (text, speak = true, incognito = false, maxTokens?: number) => {
    const { sessionId, charId, loading } = get();
    if (loading || sessionId == null || !charId) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const controller = new AbortController();
    // Capture before we add the new pair — true only on the first exchange
    const isFirstExchange = get().messages.length === 0;

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      text: trimmed,
      createdAt: Date.now(),
      status: 'sent'
    };
    const assistantId = genId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      createdAt: Date.now(),
      status: 'pending'
    };

    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      loading: true,
      draft: '',
      abortController: controller
    }));

    let fullText = '';
    let tokenCount = 0;
    const streamStart = performance.now();

    /** Helper to patch the assistant message in-place. */
    const patchAssistant = (patch: Partial<ChatMessage>) => {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantId ? { ...m, ...patch } : m
        )
      }));
    };

    // 35-second client-side timeout — shorter than the backend's 30s so the
    // action card always appears before the server error reaches the client.
    let timedOut = false;
    const TIMEOUT_MS = 35_000;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      const elapsedMs = Math.round(performance.now() - streamStart);
      console.warn(`[LLM Timeout] No response after ${elapsedMs}ms — aborting. Check that your LLM model is loaded and responding.`);
      controller.abort();
      patchAssistant({ status: 'timeout', text: '', retryText: trimmed });
      set({ loading: false, abortController: null });
    }, TIMEOUT_MS);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          session_id: sessionId,
          character_id: charId,
          speak,
          ...(incognito && { incognito: true }),
          ...(maxTokens != null && maxTokens > 0 && { max_tokens: maxTokens }),
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Stream request failed: ${response.status}`);
      }

      await parseSSEStream(response, (eventType, data: any) => {
        switch (eventType) {
          case 'processing':
            // LLM is processing input — keep typing dots but note input tokens
            patchAssistant({ status: 'pending', stage: 'processing' });
            break;

          case 'generating':
            // First token incoming — switch from dots to streaming
            patchAssistant({ status: 'streaming', text: '', stage: 'generating' });
            break;

          case 'token':
            // Individual token — append to running text
            fullText += data.t;
            tokenCount++;
            patchAssistant({ status: 'streaming', text: fullText });
            break;

          case 'quick_replies':
            // Phase 2: Piggyback context-aware reply suggestions extracted from
            // the model's <quick_replies> block. Replaces the old two-phase
            // (regex + post-hoc LLM) chip-generation flow.
            if (Array.isArray(data.options) && data.options.length > 0) {
              patchAssistant({ quickReplies: data.options.slice(0, 3).map((s: unknown) => String(s).slice(0, 80)) });
            }
            break;

          case 'audio_chunk':
            // Sentence-level TTS chunk — play first chunk immediately
            if (data.index === 0 && data.url) {
              patchAssistant({ audioUrl: data.url });
            }
            break;

          case 'emotion': {
            // Dedicated emotion SSE frame — fired just before 'done' by B2 backend
            const { emotion, intensity } = data as { emotion: string; intensity: number };
            get().setCurrentEmotion(emotion, intensity ?? 1.0);
            break;
          }

          case 'done': {
            // Stream complete — apply final metadata
            const elapsed = (performance.now() - streamStart) / 1000;
            const serverTokens = data.token_count || tokenCount;
            const speed = data.tokens_per_second || (elapsed > 0.2 ? serverTokens / elapsed : 0);

            patchAssistant({
              text: data.reply || fullText,
              status: 'sent',
              stage: undefined,
              emotion: data.emotion,
              gesture: data.gesture ?? undefined,
              audioUrl: data.audio_url || data.tts_chunked ? undefined : undefined,
              tokens: serverTokens,
              tokensPerSecond: Math.round(speed * 10) / 10,
              latencyMs: data.generation_time_ms,
              model: data.model,
              serverMessageId: data.assistant_message_id
            });

            // If there's a single (non-chunked) audio URL, use it
            if (data.audio_url) {
              patchAssistant({ audioUrl: data.audio_url });
            }

            // Fallback: fire emotion if the dedicated 'emotion' SSE event was missed
            if (data.emotion) get().setCurrentEmotion(data.emotion, 1.0);
            break;
          }

          case 'choices':
            // Feature E: Dialogue choices block extracted from the LLM reply.
            // Store on the message so DialogueBubble can render choice buttons.
            if (Array.isArray(data.options) && data.options.length > 0) {
              patchAssistant({ choices: data.options as string[], status: 'sent' });
            }
            break;

          case 'tool_result':
            // Agent tool finished — if the tool generated an image, attach the URL
            // to the current assistant message so DialogueBubble can render it.
            if (data.display === 'image' && data.data?.url) {
              const patch: Partial<ChatMessage> = { imageUrl: data.data.url };
              if (typeof data.data.prompt === 'string' && data.data.prompt) {
                patch.imagePrompt = data.data.prompt;
              }
              patchAssistant(patch);
            }
            break;

          case 'stream_reset':
            // T0-25: Provider failed mid-stream — clear partial text before error
            fullText = '';
            tokenCount = 0;
            patchAssistant({ text: '', status: 'pending' });
            break;

          case 'error':
            patchAssistant({
              text: `Error: ${data.error || 'Unknown stream error'}`,
              status: 'failed'
            });
            break;
        }
      });

      // If we never got a 'done' event, finalize with what we have
      const current = get().messages.find(m => m.id === assistantId);
      if (current?.status === 'streaming') {
        patchAssistant({ status: 'sent' });
      }

      // Auto-compact: check context usage after each reply (fire-and-forget)
      const _sessionId = get().sessionId;
      if (_sessionId) {
        fetch(`/api/context-budget/${_sessionId}`)
          .then(r => r.ok ? r.json() : null)
          .then(budgetData => {
            if (!budgetData) return;
            const threshold = 85;
            if (budgetData.usage_pct > threshold) {
              // Inject compaction system message
              const compactMsgId = `compact-${Date.now()}`;
              set((s) => ({
                messages: [...s.messages, {
                  id: compactMsgId,
                  role: 'system' as const,
                  text: '\u27F3 Auto-compacting conversation...',
                  createdAt: Date.now(),
                  status: 'sent' as const,
                }],
              }));

              // Fire compression
              fetch(`/api/sessions/${_sessionId}/compress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keep_recent: 6 }),
              })
                .then(r => r.ok ? r.json() : null)
                .then(result => {
                  if (result?.ok) {
                    set((s) => ({
                      messages: s.messages.map((m) =>
                        m.id === compactMsgId
                          ? { ...m, text: `\u27F3 Auto-compacted \u2014 ${result.archived} messages summarized` }
                          : m
                      ),
                    }));
                  } else {
                    // Remove the system message on failure
                    set((s) => ({ messages: s.messages.filter((m) => m.id !== compactMsgId) }));
                  }
                })
                .catch(() => {
                  set((s) => ({ messages: s.messages.filter((m) => m.id !== compactMsgId) }));
                });
            }
          })
          .catch(() => {});
      }

      // Auto-title the session after the first exchange (fire-and-forget)
      if (isFirstExchange && sessionId && fullText) {
        const reply = (get().messages.find(m => m.id === assistantId)?.text || fullText).slice(0, 200);
        api.llmGenerate([
          {
            role: 'system',
            content: 'You generate short chat session titles. Output 3 to 5 words. No punctuation. No quotes. Nothing else.'
          },
          {
            role: 'user',
            content: `User said: ${trimmed}\nAssistant replied: ${reply}`
          }
        ], 0.7, 20)
          .then(r => api.updateSession(sessionId, { title: r.text.trim() }))
          .catch(() => {}); // non-critical, ignore failures
      }
    } catch (err: any) {
      if (timedOut) {
        // Timeout callback already patched the message and reset loading state
      } else if (err.name === 'AbortError') {
        // User cancelled — mark as sent with partial text
        patchAssistant({
          text: fullText || '(cancelled)',
          status: 'sent'
        });
      } else {
        patchAssistant({
          text: `Failed to get response: ${err.message}`,
          status: 'failed'
        });
      }
    } finally {
      clearTimeout(timeoutId);
      if (!timedOut) {
        set({ loading: false, abortController: null });
      }
    }
  },

  retryLastTimeout: async (text: string) => {
    // Remove the timed-out assistant message and the user message before it
    set((s) => {
      const msgs = [...s.messages];
      let lastTimeoutIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].status === 'timeout') { lastTimeoutIdx = i; break; }
      }
      if (lastTimeoutIdx === -1) return {};
      const toRemove = new Set([msgs[lastTimeoutIdx].id]);
      if (lastTimeoutIdx > 0 && msgs[lastTimeoutIdx - 1].role === 'user') {
        toRemove.add(msgs[lastTimeoutIdx - 1].id);
      }
      return { messages: msgs.filter((m) => !toRemove.has(m.id)) };
    });
    await get().sendMessage(text);
  },

  dismissTimeout: () => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.status === 'timeout'
          ? { ...m, status: 'failed' as const, text: '(timed out)', retryText: undefined }
          : m
      ),
    }));
  },

  toggleReaction: async (messageId: number, emoji: string) => {
    // Optimistic update
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.serverMessageId !== messageId) return m;
        const current = m.reactions ?? [];
        const updated = current.includes(emoji)
          ? current.filter((e) => e !== emoji)
          : [...current, emoji];
        return { ...m, reactions: updated };
      }),
    }));
    try {
      const result = await api.toggleReaction(messageId, emoji);
      // Sync with server truth
      set((s) => ({
        messages: s.messages.map((m) =>
          m.serverMessageId === messageId ? { ...m, reactions: result.reactions } : m
        ),
      }));
    } catch {
      // Revert optimistic update on error
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.serverMessageId !== messageId) return m;
          const current = m.reactions ?? [];
          const reverted = current.includes(emoji)
            ? current.filter((e) => e !== emoji)
            : [...current, emoji];
          return { ...m, reactions: reverted };
        }),
      }));
    }
  },

  editMessage: async (messageId, newText) => {
    const msg = get().messages.find(m => m.id === messageId);
    if (!msg?.serverMessageId) return;
    const trimmed = newText.trim();
    if (!trimmed || trimmed === msg.text) return;
    try {
      const updated = await api.editMessage(msg.serverMessageId, trimmed);
      set(s => ({
        messages: s.messages.map(m =>
          m.id === messageId
            ? {
                ...m,
                text: updated.text,
                editedAt: updated.edited_at ?? undefined,
                editHistory: (updated.edit_history ?? []).map(h => ({
                  ts: h.ts,
                  prevContent: h.prev_content,
                })),
              }
            : m
        ),
      }));
    } catch (err) {
      console.error('[editMessage] failed:', err);
      throw err;
    }
  },

  regenerateImage: async (messageId: string) => {
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg?.imagePrompt) return;
    const applyPatch = (p: Partial<ChatMessage>) => {
      set((s) => ({
        messages: s.messages.map((m) => (m.id === messageId ? { ...m, ...p } : m)),
      }));
    };
    applyPatch({ status: 'streaming' });
    try {
      const result = await api.generatePortrait({ prompt: msg.imagePrompt });
      if (result.ok && result.url) {
        applyPatch({ imageUrl: result.url, status: 'sent' });
        if (msg.serverMessageId) {
          api.updateMessageImageUrl(msg.serverMessageId, result.url).catch(() => {
            // persist is best-effort — UI is already updated
          });
        }
      } else {
        applyPatch({ status: 'sent' });
      }
    } catch {
      applyPatch({ status: 'sent' });
    }
  },

  continueGeneration: async () => {
    const { sessionId, charId, loading } = get();
    if (loading || sessionId == null || !charId) return;

    const controller = new AbortController();
    const assistantId = genId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      createdAt: Date.now(),
      status: 'pending',
    };

    set((s) => ({ messages: [...s.messages, assistantMsg], loading: true, abortController: controller }));

    const patchAssistant = (patch: Partial<ChatMessage>) => {
      set((s) => ({ messages: s.messages.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)) }));
    };

    let fullText = '';
    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: '[CONTINUE]',
          session_id: sessionId,
          character_id: charId,
          speak: false,
          incognito: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Stream request failed: ${response.status}`);

      await parseSSEStream(response, (eventType, data: any) => {
        switch (eventType) {
          case 'processing':
            patchAssistant({ status: 'pending', stage: 'processing' });
            break;
          case 'token':
            fullText += data.t ?? '';
            patchAssistant({ text: fullText, status: 'streaming', stage: 'generating' });
            break;
          case 'done':
            patchAssistant({
              text: data.reply ?? fullText,
              status: 'sent',
              stage: undefined,
              emotion: data.emotion ?? undefined,
              serverMessageId: data.message_id ?? undefined,
              quickReplies: Array.isArray(data.quick_replies) && data.quick_replies.length > 0
                ? data.quick_replies
                : undefined,
            });
            break;
          case 'error':
            patchAssistant({ text: `Error: ${data.error ?? 'unknown'}`, status: 'failed', stage: undefined });
            break;
        }
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        patchAssistant({ text: fullText || '(cancelled)', status: 'sent' });
      } else {
        patchAssistant({ text: `Failed: ${err.message}`, status: 'failed' });
      }
    } finally {
      set({ loading: false, abortController: null });
    }
  },
}));
