/**
 * Tests for FeedbackButtons component.
 *
 * Covers:
 *   - Initial render (both buttons present)
 *   - ThumbsUp click calls recordFeedback with +1
 *   - ThumbsUp toggle (second click sends null to clear)
 *   - ThumbsDown click calls recordFeedback with -1
 *   - aria-pressed reflects active signal state
 *   - onSignalChange callback fires with correct value
 *   - Network error rolls back optimistic signal update
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub (required for all component tests)
 *   Pattern 2 — api module mock
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FeedbackButtons } from '../components/FeedbackButtons';
import { api } from '../lib/api';

// ── Pattern 4: Framer Motion stub ─────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// ── Pattern 2: API mock ────────────────────────────────────────────────────────
vi.mock('../lib/api', () => ({
  api: {
    recordFeedback: vi.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Renders FeedbackButtons for message id 42 with optional props. */
function renderComponent(props: {
  initialSignal?: 1 | -1 | null;
  onSignalChange?: (signal: 1 | -1 | null) => void;
} = {}) {
  return render(
    <FeedbackButtons messageId={42} {...props} />
  );
}

/**
 * Returns the ThumbsUp button regardless of active state.
 * The aria-label toggles between "Thumbs up" (inactive) and
 * "Remove thumbs-up" (active), so we match both via a shared substring.
 */
function getThumbsUp() {
  // Both "Thumbs up" and "Remove thumbs-up" contain "thumbs-up" or "Thumbs up".
  // The stable selector is the title attribute which has identical values.
  const buttons = screen.getAllByRole('button');
  const btn = buttons.find(
    (b) => b.getAttribute('title') === 'Thumbs up' || b.getAttribute('title') === 'Remove thumbs-up'
  );
  if (!btn) throw new Error('ThumbsUp button not found');
  return btn;
}

/**
 * Returns the ThumbsDown button regardless of active state.
 * The aria-label toggles between "Thumbs down" (inactive) and
 * "Remove thumbs-down" (active).
 */
function getThumbsDown() {
  const buttons = screen.getAllByRole('button');
  const btn = buttons.find(
    (b) => b.getAttribute('title') === 'Thumbs down' || b.getAttribute('title') === 'Remove thumbs-down'
  );
  if (!btn) throw new Error('ThumbsDown button not found');
  return btn;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FeedbackButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: API calls resolve successfully with undefined (no payload needed)
    vi.mocked(api.recordFeedback).mockResolvedValue(undefined as never);
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders thumbs-up and thumbs-down buttons', () => {
    renderComponent();
    // Both buttons are in the DOM (aria-labels come from the title/aria-label attributes)
    expect(getThumbsUp()).toBeInTheDocument();
    expect(getThumbsDown()).toBeInTheDocument();
  });

  it('renders both buttons in an unpressed state when no initialSignal provided', () => {
    renderComponent();
    expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'false');
    expect(getThumbsDown()).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders thumbs-up pre-pressed when initialSignal is 1', () => {
    renderComponent({ initialSignal: 1 });
    expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'true');
    expect(getThumbsDown()).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders thumbs-down pre-pressed when initialSignal is -1', () => {
    renderComponent({ initialSignal: -1 });
    expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'false');
    expect(getThumbsDown()).toHaveAttribute('aria-pressed', 'true');
  });

  // ── ThumbsUp click ─────────────────────────────────────────────────────────

  it('clicking thumbs-up calls recordFeedback with messageId and +1', async () => {
    renderComponent();
    fireEvent.click(getThumbsUp());
    await waitFor(() =>
      expect(vi.mocked(api.recordFeedback)).toHaveBeenCalledWith(42, 1)
    );
  });

  it('thumbs-up button aria-pressed becomes true after clicking', async () => {
    renderComponent();
    fireEvent.click(getThumbsUp());
    await waitFor(() =>
      expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'true')
    );
    expect(getThumbsDown()).toHaveAttribute('aria-pressed', 'false');
  });

  // ── Toggle (second click clears) ───────────────────────────────────────────

  it('clicking thumbs-up twice sends null on second click (toggle/clear)', async () => {
    renderComponent();

    // First click → signal becomes 1
    fireEvent.click(getThumbsUp());
    await waitFor(() =>
      expect(vi.mocked(api.recordFeedback)).toHaveBeenLastCalledWith(42, 1)
    );

    // The component sets `pending` while the API call is in flight and ignores
    // re-entrant clicks (`if (pending) return`). recordFeedback resolves before
    // pending clears, so we must wait for the button to re-enable before the
    // second click — otherwise it's silently dropped (flaky under CI timing).
    await waitFor(() => expect(getThumbsUp()).not.toBeDisabled());

    // Second click → same button toggled off → null
    fireEvent.click(getThumbsUp());
    await waitFor(() =>
      expect(vi.mocked(api.recordFeedback)).toHaveBeenLastCalledWith(42, null)
    );

    expect(vi.mocked(api.recordFeedback)).toHaveBeenCalledTimes(2);
  });

  it('clicking thumbs-up twice restores aria-pressed to false', async () => {
    renderComponent();
    fireEvent.click(getThumbsUp());
    await waitFor(() => expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'true'));

    // Wait for the in-flight call's `pending` to clear (button re-enabled) so the
    // second click isn't swallowed by the re-entry guard. See note above.
    await waitFor(() => expect(getThumbsUp()).not.toBeDisabled());
    fireEvent.click(getThumbsUp());
    await waitFor(() => expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'false'));
  });

  // ── ThumbsDown click ───────────────────────────────────────────────────────

  it('clicking thumbs-down calls recordFeedback with messageId and -1', async () => {
    renderComponent();
    fireEvent.click(getThumbsDown());
    await waitFor(() =>
      expect(vi.mocked(api.recordFeedback)).toHaveBeenCalledWith(42, -1)
    );
  });

  it('thumbs-down button aria-pressed becomes true after clicking', async () => {
    renderComponent();
    fireEvent.click(getThumbsDown());
    await waitFor(() =>
      expect(getThumbsDown()).toHaveAttribute('aria-pressed', 'true')
    );
    expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking thumbs-down twice sends null on second click (toggle/clear)', async () => {
    renderComponent();

    fireEvent.click(getThumbsDown());
    await waitFor(() =>
      expect(vi.mocked(api.recordFeedback)).toHaveBeenLastCalledWith(42, -1)
    );

    // Wait for `pending` to clear (button re-enabled) before the second click,
    // or the re-entry guard drops it and the toggle-to-null never fires. See note
    // in the thumbs-up toggle test above.
    await waitFor(() => expect(getThumbsDown()).not.toBeDisabled());
    fireEvent.click(getThumbsDown());
    await waitFor(() =>
      expect(vi.mocked(api.recordFeedback)).toHaveBeenLastCalledWith(42, null)
    );

    expect(vi.mocked(api.recordFeedback)).toHaveBeenCalledTimes(2);
  });

  // ── Switching between signals ──────────────────────────────────────────────

  it('clicking thumbs-down when thumbs-up is active clears thumbs-up and sets thumbs-down', async () => {
    renderComponent({ initialSignal: 1 });
    expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(getThumbsDown());
    await waitFor(() =>
      expect(vi.mocked(api.recordFeedback)).toHaveBeenCalledWith(42, -1)
    );
    await waitFor(() => expect(getThumbsDown()).toHaveAttribute('aria-pressed', 'true'));
    expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'false');
  });

  // ── onSignalChange callback ────────────────────────────────────────────────

  it('onSignalChange is called with +1 when thumbs-up is clicked', async () => {
    const onSignalChange = vi.fn();
    renderComponent({ onSignalChange });

    fireEvent.click(getThumbsUp());

    // The callback fires optimistically (before the API resolves)
    expect(onSignalChange).toHaveBeenCalledWith(1);
  });

  it('onSignalChange is called with -1 when thumbs-down is clicked', async () => {
    const onSignalChange = vi.fn();
    renderComponent({ onSignalChange });

    fireEvent.click(getThumbsDown());

    expect(onSignalChange).toHaveBeenCalledWith(-1);
  });

  it('onSignalChange is called with null when active thumbs-up is clicked again', async () => {
    const onSignalChange = vi.fn();
    renderComponent({ initialSignal: 1, onSignalChange });

    fireEvent.click(getThumbsUp());

    expect(onSignalChange).toHaveBeenCalledWith(null);
  });

  // ── Network error rollback ─────────────────────────────────────────────────

  it('rolls back signal to previous value on API failure', async () => {
    vi.mocked(api.recordFeedback).mockRejectedValueOnce(new Error('Network error'));

    renderComponent();

    // Optimistic update fires immediately — aria-pressed goes true
    fireEvent.click(getThumbsUp());
    await waitFor(() => expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'true'));

    // After the rejection settles, signal is rolled back to null (original)
    await waitFor(() => expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'false'));
  });

  it('calls onSignalChange twice on API failure: once optimistically, once on rollback', async () => {
    vi.mocked(api.recordFeedback).mockRejectedValueOnce(new Error('Network error'));

    const onSignalChange = vi.fn();
    renderComponent({ onSignalChange });

    fireEvent.click(getThumbsUp());

    // Wait for the full rejection/rollback cycle to complete
    await waitFor(() => expect(onSignalChange).toHaveBeenCalledTimes(2));
    // First call: optimistic +1
    expect(onSignalChange).toHaveBeenNthCalledWith(1, 1);
    // Second call: rollback to null (the original value)
    expect(onSignalChange).toHaveBeenNthCalledWith(2, null);
  });

  it('rolls back from -1 to null on API failure', async () => {
    vi.mocked(api.recordFeedback).mockRejectedValueOnce(new Error('Network error'));

    renderComponent();
    fireEvent.click(getThumbsDown());

    await waitFor(() => expect(getThumbsDown()).toHaveAttribute('aria-pressed', 'true'));
    await waitFor(() => expect(getThumbsDown()).toHaveAttribute('aria-pressed', 'false'));
  });

  it('rolls back to the prior signal (not always null) when error occurs from a pre-existing state', async () => {
    // Start with initialSignal=1 (thumbs-up already active)
    // Click thumbs-down → optimistic: signal=-1, api fails → rollback to signal=1
    vi.mocked(api.recordFeedback).mockRejectedValueOnce(new Error('Network error'));

    renderComponent({ initialSignal: 1 });
    expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(getThumbsDown());

    // Optimistic: thumbs-down active briefly
    await waitFor(() => expect(getThumbsDown()).toHaveAttribute('aria-pressed', 'true'));

    // Rollback: thumbs-up should be active again
    await waitFor(() => expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'true'));
    expect(getThumbsDown()).toHaveAttribute('aria-pressed', 'false');
  });

  // ── Pending state (debounce) ────────────────────────────────────────────────

  it('ignores a second click while the first API call is still pending', async () => {
    // Use a promise that we control so we can fire a second click before resolve
    let resolveFirst!: () => void;
    const firstCallPromise = new Promise<void>((res) => { resolveFirst = res; });
    vi.mocked(api.recordFeedback).mockReturnValueOnce(firstCallPromise as never);

    renderComponent();

    fireEvent.click(getThumbsUp());
    // While the first call is still pending, click again
    fireEvent.click(getThumbsUp());

    // Only one API call should have been made
    expect(vi.mocked(api.recordFeedback)).toHaveBeenCalledTimes(1);

    // Resolve to clean up
    resolveFirst();
    await waitFor(() => expect(getThumbsUp()).toHaveAttribute('aria-pressed', 'true'));
  });
});
