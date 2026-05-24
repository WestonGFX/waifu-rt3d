/**
 * Regression test for the Ctrl+M → Memory Browser hotkey wiring.
 *
 * Why this exists: between sessions 41 and 44, two separate sessions
 * independently attempted to "add" the Ctrl+M hotkey, each leaving behind
 * broken duplicate scaffolding (useMemoryBrowserOverlay.tsx variants,
 * MemoryBrowserOverlay.tsx, App.tsx.new, an integration patch, and even a
 * gutted smoke-test.spec.ts dropping from 743 to 16 lines). The hotkey was
 * already wired at App.tsx via useKeyboardShortcuts — but with zero test
 * coverage on the wiring, the duplication kept happening.
 *
 * This test locks in that:
 *   1. useKeyboardShortcuts dispatches ctrl+m to its registered action
 *   2. cmd+m works as the macOS equivalent (meta key)
 *   3. ctrl+m is suppressed while a text input is focused (matches the
 *      hook's allowInInput=false default — Ctrl+M does NOT carry
 *      allowInInput, per App.tsx:278)
 *
 * Follows testing-conventions.md Pattern: focused hook-direct test, no
 * framer-motion / no app rendering.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

describe('useKeyboardShortcuts — Ctrl+M Memory Browser wiring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires the registered action on ctrl+m', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'ctrl+m', action, description: 'Open memory browser' },
      ])
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', ctrlKey: true }));
    });

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('fires the registered action on cmd+m (macOS meta key)', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'ctrl+m', action, description: 'Open memory browser' },
      ])
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', metaKey: true }));
    });

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire ctrl+m while a text input has focus (default allowInInput=false)', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'ctrl+m', action, description: 'Open memory browser' },
      ])
    );

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true })
      );
    });

    expect(action).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('does not fire on plain m without modifier', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'ctrl+m', action, description: 'Open memory browser' },
      ])
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    });

    expect(action).not.toHaveBeenCalled();
  });
});
