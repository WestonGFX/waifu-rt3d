import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatStore } from './chatStore';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  sendChat: vi.fn()
}));

const mockedSendChat = vi.mocked(api.sendChat);

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      draft: '',
      isTyping: false,
      loading: false,
      lastError: null,
      sessionId: 1,
      charId: 1,
      lastAudioUrl: null
    });
    mockedSendChat.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds optimistic entries and resolves to sent status', async () => {
    mockedSendChat.mockResolvedValue({
      ok: true,
      reply: 'ack',
      audio: null,
      session_id: 2
    } as never);

    await useChatStore.getState().sendMessage('hello', false);

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].role).toBe('user');
    expect(state.messages[1].role).toBe('assistant');
    expect(state.messages[1].status).toBe('sent');
    expect(state.sessionId).toBe(2);
    expect(state.lastError).toBeNull();
  });

  it('marks assistant message as failed on API error and supports retry', async () => {
    mockedSendChat.mockRejectedValueOnce(new Error('boom'));
    await useChatStore.getState().sendMessage('retry me', false);

    const failed = useChatStore
      .getState()
      .messages.find((message) => message.role === 'assistant');
    expect(failed?.status).toBe('failed');
    expect(useChatStore.getState().lastError).toBeTruthy();

    mockedSendChat.mockResolvedValueOnce({
      ok: true,
      reply: 'recovered',
      audio: null,
      session_id: 1
    } as never);

    await useChatStore.getState().retryMessage(failed!.id, false);

    const retried = useChatStore
      .getState()
      .messages.find((message) => message.id === failed!.id);
    expect(retried?.status).toBe('sent');
    expect(retried?.text).toBe('recovered');
    expect(useChatStore.getState().lastError).toBeNull();
  });

  it('does not send while a request is in flight', async () => {
    useChatStore.setState({ loading: true });

    await useChatStore.getState().sendMessage('blocked', false);

    expect(mockedSendChat).not.toHaveBeenCalled();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it('debounces typing indicator to false', () => {
    vi.useFakeTimers();

    useChatStore.getState().setDraft('ping');
    expect(useChatStore.getState().isTyping).toBe(true);

    vi.advanceTimersByTime(421);
    expect(useChatStore.getState().isTyping).toBe(false);
  });

  it('ignores empty sends', async () => {
    await useChatStore.getState().sendMessage('   ', false);

    expect(mockedSendChat).not.toHaveBeenCalled();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});
