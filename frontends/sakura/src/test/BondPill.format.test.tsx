/**
 * Regression tests for BondPill XP display format.
 *
 * Locks in the fix from session 29 (Option A from
 * docs/bugs/2026-05-06-bondpill-xp-overshoots-level-threshold.md):
 *   "{bondXp}/{threshold} XP · {xpToNext} to next"
 * where threshold = bondXp + xpToNext.
 *
 * Follows testing-conventions.md:
 *   Pattern 4 — framer-motion stub
 *   Pattern 2 — api module mock
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BondPill } from '../components/BondPill';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
      <div {...p}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../lib/api', () => ({
  api: {
    getRelationship: vi.fn().mockResolvedValue({ affinity: 0.5, mood: 0.5, trust: 0.5, interactions: 0 }),
    getCharacterStreak: vi.fn().mockResolvedValue(null),
  },
}));

describe('BondPill XP format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders threshold (bondXp + xpToNext) as denominator, not the remainder', () => {
    render(
      <BondPill
        charId={1}
        bondLevel={0}
        bondXp={138}
        xpToNext={12}
        tier="stranger"
        messageCount={0}
      />
    );
    // Old buggy format would have been "138/12 XP". New format: "138/150 XP · 12 to next".
    expect(screen.getByText(/138\/150 XP · 12 to next/)).toBeInTheDocument();
  });

  it('progressbar aria-valuemax equals the threshold, not the remainder', () => {
    render(
      <BondPill
        charId={1}
        bondLevel={0}
        bondXp={138}
        xpToNext={12}
        tier="stranger"
        messageCount={0}
      />
    );
    const bar = screen.getByRole('progressbar', { name: /bond xp progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '138');
    expect(bar).toHaveAttribute('aria-valuemax', '150');
  });

  it('accessible-name spells out both numbers without the "out of remainder" trap', () => {
    render(
      <BondPill
        charId={1}
        bondLevel={3}
        bondXp={250}
        xpToNext={50}
        tier="friend"
        messageCount={0}
      />
    );
    const btn = screen.getByRole('button', { name: /bond level 3/i });
    expect(btn).toHaveAttribute(
      'aria-label',
      expect.stringContaining('250 of 300 XP, 50 to next level')
    );
  });

  it('handles xpToNext=0 (level-cap edge) without dividing by zero', () => {
    render(
      <BondPill
        charId={1}
        bondLevel={50}
        bondXp={9999}
        xpToNext={0}
        tier="soulmate"
        messageCount={0}
      />
    );
    const bar = screen.getByRole('progressbar', { name: /bond xp progress/i });
    // threshold = 9999 + 0 = 9999. fillPercent = 100.
    expect(bar).toHaveAttribute('aria-valuemax', '9999');
    expect(screen.getByText(/9,999\/9,999 XP · 0 to next/)).toBeInTheDocument();
  });
});
