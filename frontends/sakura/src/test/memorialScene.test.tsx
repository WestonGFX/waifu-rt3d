/**
 * Tests for MemorialScene component.
 *
 * Covers:
 * - Setting narration is shown first
 * - Advancing through beats one at a time (click + space)
 * - Culmination shown after last beat
 * - Keepsake panel renders after culmination
 * - completeMemorialScene is called when scene finishes
 * - onClose callback fires after completion
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub (ALL component tests)
 *   Pattern 2 — api module mock
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemorialScene } from '../components/MemorialScene';
import type { MemorialSceneData } from '../components/MemorialScene';
import { api } from '../lib/api';

// ── Pattern 4: Framer Motion stub ─────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// ── Pattern 2: API mock ───────────────────────────────────────────────────────
vi.mock('../lib/api', () => ({
  api: {
    completeMemorialScene: vi.fn(),
  },
}));

// ── viewerStore mock (no iframe in jsdom) ─────────────────────────────────────
vi.mock('../stores/viewerStore', () => ({
  useViewerStore: (selector: (s: { dispatchExpression: () => void }) => unknown) =>
    selector({ dispatchExpression: vi.fn() }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SCENE: MemorialSceneData = {
  id: 'scene-001',
  setting: 'A quiet rooftop under a rain-streaked sky.',
  beats: [
    'She reaches out and takes your hand.',
    'The city hums below, indifferent.',
    'She whispers something you almost miss.',
  ],
  culmination: 'For a moment, the world holds its breath.',
  keepsake: 'A rain-worn photograph of the two of you.',
};

function renderScene(onClose = vi.fn()) {
  return render(<MemorialScene charId={42} scene={SCENE} onClose={onClose} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MemorialScene', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.completeMemorialScene).mockResolvedValue({ ok: true });
  });

  it('shows the scene setting as the opening narration', () => {
    renderScene();
    expect(screen.getByText(SCENE.setting)).toBeInTheDocument();
  });

  it('shows first beat after clicking from setting stage', () => {
    const { container } = renderScene();
    // Click the overlay to advance past setting
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(screen.getByText(SCENE.beats[0])).toBeInTheDocument();
  });

  it('advances through beats on Space key', () => {
    const { container } = renderScene();
    // Advance past setting
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(screen.getByText(SCENE.beats[0])).toBeInTheDocument();

    // Advance through remaining beats
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByText(SCENE.beats[1])).toBeInTheDocument();

    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByText(SCENE.beats[2])).toBeInTheDocument();
  });

  it('shows culmination after all beats are advanced', () => {
    const { container } = renderScene();
    const el = container.firstElementChild as HTMLElement;

    // Setting → beats[0]
    fireEvent.click(el);
    // beats[0] → beats[1]
    fireEvent.click(el);
    // beats[1] → beats[2]
    fireEvent.click(el);
    // beats[2] → culmination
    fireEvent.click(el);

    expect(screen.getByText(SCENE.culmination)).toBeInTheDocument();
  });

  it('calls completeMemorialScene and onClose when scene finishes', async () => {
    const onClose = vi.fn();
    const { container } = renderScene(onClose);
    const el = container.firstElementChild as HTMLElement;

    // Navigate: setting → beat0 → beat1 → beat2 → culmination → keepsake → finish
    fireEvent.click(el); // → beat0
    fireEvent.click(el); // → beat1
    fireEvent.click(el); // → beat2
    fireEvent.click(el); // → culmination
    fireEvent.click(el); // → keepsake
    fireEvent.click(el); // → done (posts completion)

    await waitFor(() => {
      expect(vi.mocked(api.completeMemorialScene)).toHaveBeenCalledWith(42, 'scene-001');
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('advances on Enter key the same as Space', () => {
    const { container } = renderScene();
    // Advance past setting with click
    fireEvent.click(container.firstElementChild as HTMLElement);
    // Advance with Enter
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByText(SCENE.beats[1])).toBeInTheDocument();
  });

  it('renders the keepsake panel text after culmination advance', async () => {
    const { container } = renderScene();
    const el = container.firstElementChild as HTMLElement;

    fireEvent.click(el); // → beat0
    fireEvent.click(el); // → beat1
    fireEvent.click(el); // → beat2
    fireEvent.click(el); // → culmination
    fireEvent.click(el); // → keepsake

    // Keepsake text should become visible
    await waitFor(() => {
      expect(screen.getByText(SCENE.keepsake)).toBeInTheDocument();
    });
  });
});
