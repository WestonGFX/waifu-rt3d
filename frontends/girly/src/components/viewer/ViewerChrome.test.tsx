import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ViewerChrome from './ViewerChrome.tsx';

describe('ViewerChrome', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('renders all primary viewer controls in one top control group', () => {
    render(
      <ViewerChrome
        cameraMode="orbit"
        renderPaused={false}
        viewerNotice={null}
        onSetCameraMode={vi.fn()}
        onResetView={vi.fn()}
        onToggleRenderPaused={vi.fn()}
        onDismissNotice={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Orbit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Free look' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause viewer rendering' })).toBeInTheDocument();
  });

  it('auto-dismisses the free-look helper notice after the timeout', () => {
    const onDismissNotice = vi.fn();

    render(
      <ViewerChrome
        cameraMode="freelook"
        renderPaused={false}
        viewerNotice="freelook"
        onSetCameraMode={vi.fn()}
        onResetView={vi.fn()}
        onToggleRenderPaused={vi.fn()}
        onDismissNotice={onDismissNotice}
      />,
    );

    expect(screen.getByText(/Drag to look around/i)).toBeInTheDocument();

    vi.advanceTimersByTime(5999);
    expect(onDismissNotice).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismissNotice).toHaveBeenCalledTimes(1);
  });

  it('lets the user dismiss the paused notice manually', () => {
    const onDismissNotice = vi.fn();

    render(
      <ViewerChrome
        cameraMode="orbit"
        renderPaused
        viewerNotice="paused"
        onSetCameraMode={vi.fn()}
        onResetView={vi.fn()}
        onToggleRenderPaused={vi.fn()}
        onDismissNotice={onDismissNotice}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /dismiss viewer paused notice/i }));
    expect(onDismissNotice).toHaveBeenCalledTimes(1);
  });

  it('uses motion classes on the top control group and helper notice surfaces', () => {
    render(
      <ViewerChrome
        cameraMode="freelook"
        renderPaused={false}
        viewerNotice="freelook"
        onSetCameraMode={vi.fn()}
        onResetView={vi.fn()}
        onToggleRenderPaused={vi.fn()}
        onDismissNotice={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Orbit' }).closest('.motion-panel')).not.toBeNull();
    expect(screen.getByRole('button', { name: /dismiss free look notice/i }).closest('.motion-panel')).not.toBeNull();
  });

});
