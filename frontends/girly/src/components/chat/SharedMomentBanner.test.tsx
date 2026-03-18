import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SharedMomentBanner from './SharedMomentBanner.tsx';

const sharedMoment = {
  version: 1 as const,
  source: 'animegirly' as const,
  createdAt: 123,
  messages: [
    {
      role: 'user' as const,
      content: 'Tell me something sweet.',
      timestamp: 1,
    },
    {
      role: 'assistant' as const,
      content: 'You are the warmest part of this little timeline.',
      timestamp: 2,
    },
  ],
};

describe('SharedMomentBanner', () => {
  it('renders the shared preview and wires actions', () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();

    render(
      <SharedMomentBanner
        moment={sharedMoment}
        hasExistingChat={false}
        onAccept={onAccept}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText('Shared Moment')).toBeInTheDocument();
    expect(screen.getByText('Tell me something sweet.')).toBeInTheDocument();
    expect(screen.getByText('You are the warmest part of this little timeline.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Import moment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses the motion classes for the banner shell and preview content', () => {
    render(
      <SharedMomentBanner
        moment={sharedMoment}
        hasExistingChat={false}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('Shared Moment').closest('.motion-content')).not.toBeNull();
    expect(screen.getByText('Shared Moment').closest('.motion-panel')).not.toBeNull();
  });
});
