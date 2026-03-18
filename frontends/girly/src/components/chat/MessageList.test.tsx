import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessageList from './MessageList.tsx';

const mockUseChat = vi.fn();
const mockUseCompanion = vi.fn();

vi.mock('../../context/ChatContext.tsx', () => ({
  useChat: () => mockUseChat(),
}));

vi.mock('../../context/CompanionContext.tsx', () => ({
  useCompanion: () => mockUseCompanion(),
}));

describe('MessageList empty state', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });

    mockUseChat.mockReturnValue({
      state: {
        messages: [],
        isLoading: false,
      },
    });

    mockUseCompanion.mockReturnValue({
      state: {
        memoryRecords: [],
      },
      activePersona: null,
      currentThread: null,
    });
  });

  it('top-aligns the contained empty-state prompt instead of centering it vertically', () => {
    render(<MessageList scrollMode="contained" />);

    const surface = screen.getByTestId('empty-message-surface');
    const classTokens = surface.className.split(/\s+/);
    expect(surface.className).toContain('items-start');
    expect(surface.className).not.toContain('items-center');
    expect(surface.className).toContain('max-h-full');
    expect(classTokens).not.toContain('h-full');
    expect(screen.getByText('Start a conversation')).toBeInTheDocument();
  });

  it('uses a bounded top-aligned empty state for loaded-room fresh chat', () => {
    render(<MessageList scrollMode="contained" emptyStateVariant="loaded-room-fresh-chat" />);

    const surface = screen.getByTestId('empty-message-surface');
    const classTokens = surface.className.split(/\s+/);
    expect(surface.className).toContain('items-start');
    expect(surface.className).not.toContain('items-center');
    expect(surface.className).toContain('max-h-[clamp(9rem,15dvh,10.5rem)]');
    expect(surface.className).not.toContain('max-h-full');
    expect(classTokens).not.toContain('h-full');
  });
});
