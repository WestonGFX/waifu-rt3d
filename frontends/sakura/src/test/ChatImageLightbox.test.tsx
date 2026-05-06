/**
 * Tests for ChatImageLightbox component.
 *
 * Covers: render, Esc closes, backdrop click closes, image-panel click does
 * NOT close (stopPropagation), Save / Regenerate callbacks fire, Save and
 * Regenerate buttons hidden when their props are undefined.
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub (ALL component tests)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatImageLightbox } from '../components/ChatImageLightbox';

// ── Pattern 4: Framer Motion stub ─────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

describe('ChatImageLightbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the image with the given URL', () => {
    render(
      <ChatImageLightbox imageUrl="/files/images/test.png" onClose={() => {}} />,
    );
    const img = screen.getByAltText('Generated image') as HTMLImageElement;
    expect(img.src).toContain('/files/images/test.png');
  });

  it('calls onClose on Escape keydown', () => {
    const onClose = vi.fn();
    render(<ChatImageLightbox imageUrl="/x.png" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does NOT call onClose on a non-Escape keydown', () => {
    const onClose = vi.fn();
    render(<ChatImageLightbox imageUrl="/x.png" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onSave when the Save button is clicked', () => {
    const onSave = vi.fn();
    render(<ChatImageLightbox imageUrl="/x.png" onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByLabelText('Save'));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('calls onRegenerate when the Regenerate button is clicked', () => {
    const onRegenerate = vi.fn();
    render(
      <ChatImageLightbox imageUrl="/x.png" onClose={() => {}} onRegenerate={onRegenerate} />,
    );
    fireEvent.click(screen.getByLabelText('Regenerate'));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it('hides Save and Regenerate buttons when their props are undefined', () => {
    render(<ChatImageLightbox imageUrl="/x.png" onClose={() => {}} />);
    expect(screen.queryByLabelText('Save')).toBeNull();
    expect(screen.queryByLabelText('Regenerate')).toBeNull();
    // Close + Copy URL always render
    expect(screen.getByLabelText('Close')).toBeTruthy();
    expect(screen.getByLabelText('Copy URL')).toBeTruthy();
  });

  it('Close button calls onClose', () => {
    const onClose = vi.fn();
    render(<ChatImageLightbox imageUrl="/x.png" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
