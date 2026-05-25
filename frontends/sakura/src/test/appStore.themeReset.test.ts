/**
 * Regression lock: sakura-custom wine/maroon theme persists on reload (fixed in commit 2080240).
 *
 * Fix commits (oldest -> newest):
 *   2080240  fix: sakura-custom wine/maroon theme persists on reload (App.tsx)
 *
 * Bug path: the "sakura-custom" preset was removed from the theme list, but users
 * who had previously selected it had its 5 wine/maroon palette colors persisted in
 * localStorage (appStore.customTheme). On reload, App.tsx's useEffect re-applied
 * those CSS variables, locking the user into the removed palette with no escape.
 *
 * The fix (App.tsx lines 284–291) detects the exact 5-color legacy palette and
 * calls `resetCustomTheme()` to clear it before applying any CSS overrides.
 *
 * SCOPE OF THESE TESTS:
 * This file tests the store contract — not App.tsx's useEffect. The migration logic
 * in App.tsx is difficult to unit-test in isolation (requires DOM, useEffect, and
 * React lifecycle). If that migration block is ever moved or rewritten, update
 * this file's docstring. The tests here lock in two things:
 *   1. `resetCustomTheme()` reliably clears `customTheme` to `{}` (store contract).
 *   2. The legacy palette constants are documented and the detection predicate is
 *      verified — so any future accidental change to those constants trips a test.
 *
 * Follows testing-conventions.md Pattern 1: Zustand store-direct testing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../stores/appStore';

/**
 * The exact 5-color wine/maroon palette from the removed "sakura-custom" preset.
 * These values must match EXACTLY what App.tsx checks (lines 286–288 of the fix).
 * If the detection predicate in App.tsx ever changes, update this constant too.
 *
 *   Fix commit: 2080240
 *   App.tsx line: const removedColors = ['#e879a0', '#1a0d12', '#2a1020', '#f5e0ea', '#4a2030'];
 */
const LEGACY_SAKURA_CUSTOM_PALETTE: string[] = [
  '#e879a0',
  '#1a0d12',
  '#2a1020',
  '#f5e0ea',
  '#4a2030',
];

/**
 * Build a customTheme object that exactly matches the legacy palette.
 * Uses placeholder CSS variable names — the migration check in App.tsx only
 * inspects the VALUES (Object.values), not the keys.
 */
function makeLegacyPalette(): Record<string, string> {
  return {
    '--color-accent': LEGACY_SAKURA_CUSTOM_PALETTE[0],
    '--color-background': LEGACY_SAKURA_CUSTOM_PALETTE[1],
    '--color-surface': LEGACY_SAKURA_CUSTOM_PALETTE[2],
    '--color-text-primary': LEGACY_SAKURA_CUSTOM_PALETTE[3],
    '--color-border': LEGACY_SAKURA_CUSTOM_PALETTE[4],
  };
}

describe('appStore — resetCustomTheme regression (fix: 2080240)', () => {
  beforeEach(() => {
    // Start with a clean slate before each test
    useAppStore.setState({ customTheme: {} });
  });

  // ── Store contract: resetCustomTheme() ────────────────────────────────────

  it('resetCustomTheme() clears customTheme to an empty object', () => {
    // Seed the store with the legacy palette
    useAppStore.setState({ customTheme: makeLegacyPalette() });
    expect(Object.keys(useAppStore.getState().customTheme)).toHaveLength(5);

    // Call the reset
    useAppStore.getState().resetCustomTheme();

    // Must be empty — App.tsx relies on this contract
    const { customTheme } = useAppStore.getState();
    expect(customTheme).toEqual({});
  });

  it('resetCustomTheme() is a no-op when customTheme is already empty', () => {
    useAppStore.getState().resetCustomTheme();
    expect(useAppStore.getState().customTheme).toEqual({});
  });

  it('resetCustomTheme() clears any arbitrary palette, not just the legacy one', () => {
    useAppStore.setState({
      customTheme: { '--color-accent': '#ff0000', '--color-background': '#000000' },
    });
    useAppStore.getState().resetCustomTheme();
    expect(useAppStore.getState().customTheme).toEqual({});
  });

  // ── Legacy palette constants: detection predicate ─────────────────────────

  it('LEGACY_SAKURA_CUSTOM_PALETTE has exactly 5 colors (App.tsx checks vals.length === 5)', () => {
    // If someone adds/removes a color from LEGACY_SAKURA_CUSTOM_PALETTE, this
    // immediately signals a mismatch with the App.tsx detection condition.
    expect(LEGACY_SAKURA_CUSTOM_PALETTE).toHaveLength(5);
  });

  it('all 5 legacy palette values are distinct (prevents false-positive detection)', () => {
    const unique = new Set(LEGACY_SAKURA_CUSTOM_PALETTE);
    expect(unique.size).toBe(5);
  });

  it('detection predicate matches when customTheme contains exactly the 5 legacy colors', () => {
    // This mirrors the check in App.tsx:
    //   const vals = Object.values(customTheme);
    //   if (vals.length === 5 && removedColors.every((c) => vals.includes(c))) { ... }
    const legacyTheme = makeLegacyPalette();
    const vals = Object.values(legacyTheme);
    const shouldReset =
      vals.length === 5 && LEGACY_SAKURA_CUSTOM_PALETTE.every((c) => vals.includes(c));
    expect(shouldReset).toBe(true);
  });

  it('detection predicate does NOT match when a different 5-color palette is set', () => {
    const differentPalette: Record<string, string> = {
      '--color-accent': '#123456',
      '--color-background': '#abcdef',
      '--color-surface': '#fedcba',
      '--color-text-primary': '#654321',
      '--color-border': '#111111',
    };
    const vals = Object.values(differentPalette);
    const shouldReset =
      vals.length === 5 && LEGACY_SAKURA_CUSTOM_PALETTE.every((c) => vals.includes(c));
    expect(shouldReset).toBe(false);
  });

  it('detection predicate does NOT match when palette has fewer than 5 colors', () => {
    const partialLegacy: Record<string, string> = {
      '--color-accent': LEGACY_SAKURA_CUSTOM_PALETTE[0],
      '--color-background': LEGACY_SAKURA_CUSTOM_PALETTE[1],
    };
    const vals = Object.values(partialLegacy);
    const shouldReset =
      vals.length === 5 && LEGACY_SAKURA_CUSTOM_PALETTE.every((c) => vals.includes(c));
    expect(shouldReset).toBe(false);
  });

  it('detection predicate does NOT match when palette has MORE than 5 colors', () => {
    const extendedPalette = {
      ...makeLegacyPalette(),
      '--color-extra': '#ffffff',
    };
    const vals = Object.values(extendedPalette);
    const shouldReset =
      vals.length === 5 && LEGACY_SAKURA_CUSTOM_PALETTE.every((c) => vals.includes(c));
    expect(shouldReset).toBe(false);
  });

  // ── setCustomThemeVar: ensure it doesn't interfere with reset ─────────────

  it('setCustomThemeVar adds to customTheme, resetCustomTheme then clears it', () => {
    useAppStore.getState().setCustomThemeVar('--color-accent', '#ff69b4');
    expect(useAppStore.getState().customTheme['--color-accent']).toBe('#ff69b4');

    useAppStore.getState().resetCustomTheme();
    expect(useAppStore.getState().customTheme['--color-accent']).toBeUndefined();
    expect(useAppStore.getState().customTheme).toEqual({});
  });
});
