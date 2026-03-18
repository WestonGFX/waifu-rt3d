/**
 * PetContextMenu – Right-click context menu for the desktop pet window.
 *
 * Renders a small floating menu at the cursor position with actions:
 *   - Open Chat: toggles the mini chat input
 *   - Quit: closes the pet window
 */

import { useEffect, useRef, useCallback } from 'react';

interface PetContextMenuProps {
  /** Horizontal cursor position (px). */
  x: number;
  /** Vertical cursor position (px). */
  y: number;
  /** Fires when the user selects a menu action. */
  onAction: (action: string) => void;
  /** Fires when the menu should close without an action. */
  onDismiss: () => void;
}

/**
 * Floating context menu for the pet overlay.
 *
 * @param props - Position and callback props.
 */
export default function PetContextMenu({ x, y, onAction, onDismiss }: PetContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  /** Dismiss the menu when clicking outside. */
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    },
    [onDismiss],
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  const items: Array<{ id: string; label: string; destructive?: boolean }> = [
    { id: 'chat', label: 'Open Chat' },
    { id: 'quit', label: 'Quit Pet Mode', destructive: true },
  ];

  return (
    <div
      ref={menuRef}
      className="pet-context-menu"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`pet-context-menu__item ${item.destructive ? 'pet-context-menu__item--destructive' : ''}`}
          onClick={() => onAction(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
