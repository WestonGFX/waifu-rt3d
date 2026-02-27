import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SessionDrawer } from '../components/SessionDrawer';
import { useAppStore } from '../stores/appStore';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';

// ── Framer Motion — render children as plain divs in test env ────────────────
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ── API mock ─────────────────────────────────────────────────────────────────
vi.mock('../lib/api', () => ({
  api: {
    getSessions: vi.fn(),
    deleteSession: vi.fn().mockResolvedValue({ ok: true, deleted_messages: 0 }),
    updateSession: vi.fn().mockResolvedValue({ ok: true }),
    createSession: vi.fn().mockResolvedValue({ id: 99, title: 'New Session' }),
  },
}));

// ── Store helpers ─────────────────────────────────────────────────────────────

const SESSIONS = [
  { id: 1, title: 'Alpha', is_pinned: false, is_archived: false, created_at: '' },
  { id: 2, title: 'Beta', is_pinned: false, is_archived: false, created_at: '' },
];

function setMobileMode(on: boolean) {
  useAppStore.setState({ mobileMode: on, compactMode: on });
}

// ── Tests ────────────────────────────────────────────────────────────────────

/**
 * Tests for the swipe-to-delete gesture in SessionDrawer (mobile mode).
 *
 * The swipe works entirely via refs + CSS transforms — no re-renders during
 * the gesture.  We fire touch events and inspect the DOM directly.
 *
 * Important: `vi.useFakeTimers()` is activated AFTER `renderAndLoad()` because
 * `waitFor()` internally uses real `setTimeout` for its retry interval — faking
 * timers before the await causes it to hang indefinitely.
 */
describe('SessionDrawer — swipe-to-delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getSessions).mockResolvedValue(SESSIONS);
    setMobileMode(true);
    useChatStore.setState({
      sessionId: null,
    } as Parameters<typeof useChatStore.setState>[0]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Render and wait for sessions to fully load before returning.
   * Fake timers must be activated AFTER this call.
   */
  async function renderAndLoad() {
    const { container } = render(
      <SessionDrawer
        open
        onClose={vi.fn()}
        characterId={1}
        characterName="Aria"
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    return container;
  }

  it('swipe < 100px snaps back without deleting', async () => {
    await renderAndLoad();
    vi.useFakeTimers(); // activate AFTER waitFor completes

    const row = screen.getByText('Alpha').closest('div') as HTMLElement;

    fireEvent.touchStart(row, { touches: [{ clientX: 200 }] });
    fireEvent.touchMove(row, { touches: [{ clientX: 150 }] }); // delta = -50px
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 150 }] });

    await act(() => { vi.advanceTimersByTime(300); });

    expect(api.deleteSession).not.toHaveBeenCalled();
  });

  it('swipe > 100px triggers deleteSession after 210ms', async () => {
    await renderAndLoad();
    vi.useFakeTimers();

    const row = screen.getByText('Beta').closest('div') as HTMLElement;

    fireEvent.touchStart(row, { touches: [{ clientX: 300 }] });
    fireEvent.touchMove(row, { touches: [{ clientX: 140 }] }); // delta = -160px
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 140 }] });

    await act(() => { vi.advanceTimersByTime(250); });

    expect(api.deleteSession).toHaveBeenCalledWith(2);
  });

  it('swipe is ignored when mobileMode is false', async () => {
    setMobileMode(false);
    await renderAndLoad();
    vi.useFakeTimers();

    const row = screen.getByText('Alpha').closest('div') as HTMLElement;

    fireEvent.touchStart(row, { touches: [{ clientX: 300 }] });
    fireEvent.touchMove(row, { touches: [{ clientX: 50 }] }); // delta = -250px
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 50 }] });

    await act(() => { vi.advanceTimersByTime(300); });

    expect(api.deleteSession).not.toHaveBeenCalled();
  });
});
