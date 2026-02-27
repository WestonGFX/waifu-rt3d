import { create } from 'zustand';
import type { ChatMessage } from '../lib/types';
import { api } from '../lib/api';

interface ChatState {
  messages: ChatMessage[];
  draft: string;
  loading: boolean;
  sessionId: number | null;
  charId: number | null;
  /** Active AbortController for cancelling in-flight streaming requests. */
  abortController: AbortController | null;
  setDraft: (text: string) => void;
  setContext: (sessionId: number, charId: number) => void;
  sendMessage: (text: string, speak?: boolean, incognito?: boolean) => Promise<void>;
  abortMessage: () => void;
  loadHistory: (sessionId: number) => Promise<void>;
  clear: () => void;
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

  setDraft: (text) => set({ draft: text }),

  setContext: (sessionId, charId) => set({ sessionId, charId, messages: [] }),

  clear: () => set({ messages: [], draft: '', loading: false }),

  loadHistory: async (sessionId) => {
    const data = await api.getMessages(sessionId);
    const messages: ChatMessage[] = data.messages.map((m) => ({
      id: String(m.id),
      role: m.role as ChatMessage['role'],
      text: m.content,
      createdAt: new Date(m.created_at).getTime(),
      status: 'sent'
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

  sendMessage: async (text, speak = true, incognito = false) => {
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
            patchAssistant({ status: 'pending' });
            break;

          case 'generating':
            // First token incoming — switch from dots to streaming
            patchAssistant({ status: 'streaming', text: '' });
            break;

          case 'token':
            // Individual token — append to running text
            fullText += data.t;
            tokenCount++;
            patchAssistant({ status: 'streaming', text: fullText });
            break;

          case 'audio_chunk':
            // Sentence-level TTS chunk — play first chunk immediately
            if (data.index === 0 && data.url) {
              patchAssistant({ audioUrl: data.url });
            }
            break;

          case 'done': {
            // Stream complete — apply final metadata
            const elapsed = (performance.now() - streamStart) / 1000;
            const serverTokens = data.token_count || tokenCount;
            const speed = data.tokens_per_second || (elapsed > 0.2 ? serverTokens / elapsed : 0);

            patchAssistant({
              text: data.reply || fullText,
              status: 'sent',
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
              patchAssistant({ imageUrl: data.data.url });
            }
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
      if (err.name === 'AbortError') {
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
      set({ loading: false, abortController: null });
    }
  }
}));
