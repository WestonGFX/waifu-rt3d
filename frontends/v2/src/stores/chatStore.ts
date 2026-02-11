import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';

import { sendChat } from '../lib/api';
import { microcopy } from '../lib/microcopy';
import type { ChatMessage } from '../types';

interface ChatStoreState {
  messages: ChatMessage[];
  draft: string;
  isTyping: boolean;
  loading: boolean;
  lastError: string | null;
  sessionId: number;
  charId: number;
  lastAudioUrl: string | null;
  sendMessage: (text: string, speak?: boolean) => Promise<void>;
  retryMessage: (messageId: string, speak?: boolean) => Promise<void>;
  setDraft: (text: string) => void;
  setContext: (sessionId: number, charId: number) => void;
  clear: () => void;
}

let typingTimer: ReturnType<typeof setTimeout> | null = null;
const maxHistoryMessages = 240;
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
};
const isVitest = Boolean((import.meta as ImportMeta & { vitest?: unknown }).vitest);

const id = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function markMessage(
  messages: ChatMessage[],
  targetId: string,
  updater: (message: ChatMessage) => ChatMessage
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== targetId) {
      return message;
    }
    return updater(message);
  });
}

function appendWithLimit(messages: ChatMessage[], ...next: ChatMessage[]) {
  const merged = [...messages, ...next];
  if (merged.length <= maxHistoryMessages) {
    return merged;
  }
  return merged.slice(merged.length - maxHistoryMessages);
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set, get) => ({
      messages: [],
      draft: '',
      isTyping: false,
      loading: false,
      lastError: null,
      sessionId: 1,
      charId: 1,
      lastAudioUrl: null,

      setDraft: (text) => {
        set({ draft: text, isTyping: text.trim().length > 0 });
        if (typingTimer) {
          clearTimeout(typingTimer);
        }
        typingTimer = setTimeout(() => {
          set({ isTyping: false });
        }, 420);
      },

      setContext: (sessionId, charId) => {
        set({ sessionId, charId });
      },

      clear: () => set({ messages: [], draft: '', lastAudioUrl: null, lastError: null }),

      sendMessage: async (text, speak = true) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        const current = get();
        if (current.loading) return;

        const userMessageId = id();
        const assistantMessageId = id();

        const optimisticUser: ChatMessage = {
          id: userMessageId,
          role: 'user',
          text: trimmed,
          createdAt: Date.now(),
          status: 'sent'
        };

        const optimisticAssistant: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          text: microcopy.status.thinking,
          createdAt: Date.now(),
          status: 'pending',
          requestText: trimmed,
          clientMessageId: userMessageId
        };

        set((state) => ({
          messages: appendWithLimit(state.messages, optimisticUser, optimisticAssistant),
          loading: true,
          draft: '',
          isTyping: false,
          lastError: null
        }));

        try {
          const response = await sendChat({
            text: trimmed,
            session_id: current.sessionId,
            char_id: current.charId,
            speak,
            client_message_id: userMessageId
          });

          set((state) => ({
            sessionId: response.session_id ?? state.sessionId,
            messages: markMessage(state.messages, assistantMessageId, (message) => ({
              ...message,
              status: response.ok ? 'sent' : 'failed',
              text: response.reply || microcopy.errors.sendFailed,
              serverMessageId: response.assistant_message_id
            })),
            lastAudioUrl: response.audio ?? null,
            loading: false,
            lastError: response.ok ? null : microcopy.errors.sendFailed
          }));
        } catch {
          set((state) => ({
            messages: markMessage(state.messages, assistantMessageId, (message) => ({
              ...message,
              status: 'failed',
              text: microcopy.errors.sendFailed
            })),
            loading: false,
            lastError: microcopy.errors.sendFailed
          }));
        }
      },

      retryMessage: async (messageId, speak = true) => {
        const current = get();
        if (current.loading) {
          return;
        }

        const message = current.messages.find((entry) => entry.id === messageId);
        if (!message || message.status !== 'failed' || !message.requestText) {
          return;
        }

        set((state) => ({
          loading: true,
          lastError: null,
          messages: markMessage(state.messages, messageId, (entry) => ({
            ...entry,
            status: 'pending',
            text: microcopy.status.thinking
          }))
        }));

        try {
          const response = await sendChat({
            text: message.requestText,
            session_id: current.sessionId,
            char_id: current.charId,
            speak,
            client_message_id: message.clientMessageId
          });

          set((state) => ({
            sessionId: response.session_id ?? state.sessionId,
            messages: markMessage(state.messages, messageId, (entry) => ({
              ...entry,
              status: response.ok ? 'sent' : 'failed',
              text: response.reply || microcopy.errors.sendFailed,
              serverMessageId: response.assistant_message_id
            })),
            lastAudioUrl: response.audio ?? null,
            loading: false,
            lastError: response.ok ? null : microcopy.errors.sendFailed
          }));
        } catch {
          set((state) => ({
            messages: markMessage(state.messages, messageId, (entry) => ({
              ...entry,
              status: 'failed',
              text: microcopy.errors.sendFailed
            })),
            loading: false,
            lastError: microcopy.errors.sendFailed
          }));
        }
      }
    }),
    {
      name: 'waifu-v2-chat-store',
      storage: createJSONStorage(() => {
        if (isVitest) {
          return noopStorage;
        }
        const storage = globalThis.localStorage as Storage | undefined;
        if (
          storage &&
          typeof storage.getItem === 'function' &&
          typeof storage.setItem === 'function' &&
          typeof storage.removeItem === 'function'
        ) {
          return storage;
        }
        return noopStorage;
      }),
      partialize: (state) => ({
        messages: state.messages,
        sessionId: state.sessionId,
        charId: state.charId
      })
    }
  )
);
