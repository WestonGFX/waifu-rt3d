import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatInputBar from './ChatInputBar.tsx';

const mockUseChat = vi.fn();
const mockUseSpeechRecognition = vi.fn();
const mockSendMessage = vi.fn();

vi.mock('../../context/ChatContext.tsx', () => ({
  useChat: () => mockUseChat(),
}));

vi.mock('../../hooks/useSpeechRecognition.ts', () => ({
  default: (...args: unknown[]) => mockUseSpeechRecognition(...args),
}));

describe('ChatInputBar STT gating', () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
    mockUseChat.mockReturnValue({
      state: { isLoading: false },
      sendMessage: mockSendMessage,
    });
  });

  it('renders mic button when STT is supported', () => {
    mockUseSpeechRecognition.mockReturnValue({
      isRecording: false,
      isSupported: true,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });

    render(<ChatInputBar />);
    expect(screen.getByLabelText('Start voice input')).toBeInTheDocument();
  });

  it('hides mic button when STT is unsupported', () => {
    mockUseSpeechRecognition.mockReturnValue({
      isRecording: false,
      isSupported: false,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });

    render(<ChatInputBar />);
    expect(screen.queryByLabelText('Start voice input')).not.toBeInTheDocument();
  });

  it('renders a multiline composer by default', () => {
    mockUseSpeechRecognition.mockReturnValue({
      isRecording: false,
      isSupported: false,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });

    render(<ChatInputBar />);

    const composer = screen.getByLabelText('Type a message…');
    expect(composer.tagName).toBe('TEXTAREA');
    expect(composer).toHaveAttribute('rows', '2');
  });

  it('uses the balanced desktop composer shell spacing', () => {
    mockUseSpeechRecognition.mockReturnValue({
      isRecording: false,
      isSupported: true,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });

    render(<ChatInputBar />);

    expect(screen.getByTestId('chat-input-shell').className).toContain('items-center');
    expect(screen.getByTestId('chat-input-shell').className).toContain('py-3');
    expect(screen.getByTestId('chat-input-actions').className).toContain('self-center');
    expect(screen.getByTestId('chat-input-actions').className).toContain('justify-center');
    expect(screen.getByTestId('chat-input-actions').className).toContain('gap-2');
    expect(screen.getByLabelText('Type a message…').className).toContain('min-h-[68px]');
    expect(screen.getByLabelText('Type a message…').className).toContain('py-3');
    expect(screen.getByLabelText('Start voice input').className).toContain('h-9');
    expect(screen.getByLabelText('Send message').className).toContain('h-9');
  });

  it('autofocuses the composer on entry', () => {
    mockUseSpeechRecognition.mockReturnValue({
      isRecording: false,
      isSupported: false,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });

    render(<ChatInputBar />);

    return waitFor(() => {
      expect(screen.getByLabelText('Type a message…')).toHaveFocus();
    });
  });

  it('submits the trimmed message on Enter', () => {
    mockUseSpeechRecognition.mockReturnValue({
      isRecording: false,
      isSupported: false,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });

    render(<ChatInputBar />);

    const composer = screen.getByLabelText('Type a message…');
    fireEvent.change(composer, { target: { value: '  hello there  ' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });

    expect(mockSendMessage).toHaveBeenCalledWith('hello there');
  });

  it('returns focus to the composer after sending', () => {
    mockUseSpeechRecognition.mockReturnValue({
      isRecording: false,
      isSupported: false,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });

    render(<ChatInputBar />);

    const composer = screen.getByLabelText('Type a message…');
    const sendButton = screen.getByLabelText('Send message');

    fireEvent.change(composer, { target: { value: 'hello again' } });
    fireEvent.click(sendButton);

    expect(mockSendMessage).toHaveBeenCalledWith('hello again');
    return waitFor(() => {
      expect(composer).toHaveFocus();
    });
  });

  it('does not hijack focus back when autofocus is disabled', () => {
    mockUseSpeechRecognition.mockReturnValue({
      isRecording: false,
      isSupported: false,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });

    render(<ChatInputBar autofocusEnabled={false} />);

    expect(screen.getByLabelText('Type a message…')).not.toHaveFocus();
  });

  it('does not steal focus back if the user intentionally moves elsewhere after send', async () => {
    mockUseSpeechRecognition.mockReturnValue({
      isRecording: false,
      isSupported: false,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });

    render(
      <>
        <button type="button">Elsewhere</button>
        <ChatInputBar />
      </>,
    );

    const composer = screen.getByLabelText('Type a message…');
    const sendButton = screen.getByLabelText('Send message');
    const elsewhereButton = screen.getByRole('button', { name: 'Elsewhere' });

    fireEvent.change(composer, { target: { value: 'keep typing' } });
    fireEvent.click(sendButton);
    elsewhereButton.focus();

    await waitFor(() => {
      expect(elsewhereButton).toHaveFocus();
    });
  });

  it('keeps multiline input on Shift+Enter', () => {
    mockUseSpeechRecognition.mockReturnValue({
      isRecording: false,
      isSupported: false,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });

    render(<ChatInputBar />);

    const composer = screen.getByLabelText('Type a message…');
    fireEvent.change(composer, { target: { value: 'first line' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter', shiftKey: true });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
