import { create } from 'zustand';
import type { ChatMessage } from '../lib/types';
import { api } from '../lib/api';

interface ChatState {
  messages: ChatMessage[];
  draft: string;
  loading: boolean;
  sessionId: number | null;
  charId: number | null;

  setDraft: (text: string) => void;
  setContext: (sessionId: number, charId: number) => void;
  sendMessage: (text: string, speak?: boolean) => Promise<void>;
  loadHistory: (sessionId: number) => Promise<void>;
  clear: () => void;
}

const genId = () => crypto.randomUUID();

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  draft: '',
  loading: false,
  sessionId: null,
  charId: null,

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

  sendMessage: async (text, speak = true) => {
    const { sessionId, charId, loading } = get();
    if (loading || sessionId == null || !charId) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      text: trimmed,
      createdAt: Date.now(),
      status: 'sent'
    };
    const assistantMsg: ChatMessage = {
      id: genId(),
      role: 'assistant',
      text: '',
      createdAt: Date.now(),
      status: 'pending'
    };

    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      loading: true,
      draft: ''
    }));

    try {
      const res = await api.sendChat({
        text: trimmed,
        session_id: sessionId,
        char_id: charId,
        speak
      });

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                text: res.reply,
                status: 'sent' as const,
                emotion: res.emotion,
                gesture: res.gesture ?? undefined,
                audioUrl: res.audio ?? undefined,
                tokens: res.tokens_used,
                tokensPerSecond: res.tokens_per_second,
                latencyMs: res.ttft_ms,
                model: res.model,
                serverMessageId: res.assistant_message_id
              }
            : m
        ),
        loading: false
      }));
    } catch {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, text: 'Failed to get response.', status: 'failed' as const }
            : m
        ),
        loading: false
      }));
    }
  }
}));
