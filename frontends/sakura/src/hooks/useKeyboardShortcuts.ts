import { useEffect } from 'react';

interface Shortcut {
  /** Key combo like "ctrl+k", "escape", "ctrl+shift+d". */
  key: string;
  /** Callback to run when the shortcut is pressed. */
  action: () => void;
  /** Description for help display. */
  description: string;
  /** Allow triggering when focus is inside an input/textarea. Default: false. */
  allowInInput?: boolean;
}

/**
 * Normalize a KeyboardEvent into a shortcut string.
 * Format: "ctrl+shift+k", "meta+a", "escape"
 */
function normalizeEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  const key = e.key.toLowerCase();
  // Avoid adding modifier keys as the main key
  if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
    parts.push(key === ' ' ? 'space' : key);
  }

  return parts.join('+');
}

/**
 * Hook that registers global keyboard shortcuts.
 * Shortcuts are active while the component is mounted and automatically
 * cleaned up on unmount.
 *
 * @param shortcuts - Array of shortcut definitions
 *
 * @example
 * useKeyboardShortcuts([
 *   { key: 'ctrl+k', action: () => focusSearch(), description: 'Focus search' },
 *   { key: 'escape', action: () => closeModal(), description: 'Close modal' },
 * ]);
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const combo = normalizeEvent(e);
      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      for (const shortcut of shortcuts) {
        if (shortcut.key.toLowerCase() === combo) {
          if (inInput && !shortcut.allowInInput) continue;
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}

/** Returns all registered shortcuts for help display. */
export function getShortcutDescriptions(shortcuts: Shortcut[]): Array<{ key: string; description: string }> {
  return shortcuts.map(s => ({ key: s.key, description: s.description }));
}
