import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../stores/appStore';

describe('appStore chat preferences', () => {
  beforeEach(() => {
    useAppStore.setState({ chatStyle: 'storybook', thoughtsMode: 'peek', replyDelivery: 'live' });
  });

  it('defaults: storybook look, peek thoughts, live replies', () => {
    const s = useAppStore.getState();
    expect(s.chatStyle).toBe('storybook');
    expect(s.thoughtsMode).toBe('peek');
    expect(s.replyDelivery).toBe('live');
  });

  it('switches chat style', () => {
    useAppStore.getState().setChatStyle('screenplay');
    expect(useAppStore.getState().chatStyle).toBe('screenplay');
    useAppStore.getState().setChatStyle('transcript');
    expect(useAppStore.getState().chatStyle).toBe('transcript');
  });

  it('switches thoughts mode through off / peek / open', () => {
    for (const mode of ['off', 'open', 'peek'] as const) {
      useAppStore.getState().setThoughtsMode(mode);
      expect(useAppStore.getState().thoughtsMode).toBe(mode);
    }
  });

  it('switches reply delivery through live / fade / beats', () => {
    for (const mode of ['fade', 'beats', 'live'] as const) {
      useAppStore.getState().setReplyDelivery(mode);
      expect(useAppStore.getState().replyDelivery).toBe(mode);
    }
  });
});
