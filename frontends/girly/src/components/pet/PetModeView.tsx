/**
 * PetModeView – Desktop pet overlay that renders only the avatar.
 *
 * This component is mounted when the app detects `?pet=1` in the URL,
 * meaning it is running inside the Tauri pet window (frameless, transparent,
 * always-on-top, 300x400px).
 *
 * Features:
 *   - Renders ThreeViewer avatar only (no chat panel, no settings).
 *   - Transparent background so the avatar floats on the desktop.
 *   - Draggable via the avatar area (native Tauri window drag).
 *   - Right-click context menu with Open Chat, Change Expression, Quit.
 *   - Slide-up mini chat input at the bottom.
 */

import { useCallback, useState, useRef, type MouseEvent } from 'react';
import ThreeViewer from '../viewer/ThreeViewer.tsx';
import PetContextMenu from './PetContextMenu.tsx';
import PetMiniChat from './PetMiniChat.tsx';
import {
  startPetDrag,
  closePetWindow,
} from '../../services/tauriPetService.ts';

/**
 * Root view for the desktop pet window.
 * Replaces the full AppLayout when pet mode is active.
 */
export default function PetModeView() {
  const [chatOpen, setChatOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  /** Initiate native frameless window drag on pointer down. */
  const handlePointerDown = useCallback(() => {
    isDraggingRef.current = true;
    void startPetDrag();
  }, []);

  /** Show the custom context menu on right-click. */
  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
  }, []);

  /** Dismiss the context menu. */
  const dismissMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  /** Handle context menu actions. */
  const handleMenuAction = useCallback((action: string) => {
    setMenuPosition(null);
    switch (action) {
      case 'chat':
        setChatOpen((prev) => !prev);
        break;
      case 'quit':
        void closePetWindow();
        break;
      default:
        break;
    }
  }, []);

  return (
    <div
      className="pet-mode-root"
      onContextMenu={handleContextMenu}
    >
      {/* Avatar area – occupies the full window, acts as drag handle */}
      <div
        className="pet-mode-viewer"
        onPointerDown={handlePointerDown}
      >
        <ThreeViewer />
      </div>

      {/* Slide-up mini chat */}
      <PetMiniChat open={chatOpen} onClose={() => setChatOpen(false)} />

      {/* Toggle chat button */}
      <button
        type="button"
        className="pet-mode-chat-toggle"
        onClick={() => setChatOpen((prev) => !prev)}
        aria-label={chatOpen ? 'Close chat' : 'Open chat'}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {chatOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </>
          )}
        </svg>
      </button>

      {/* Right-click context menu */}
      {menuPosition ? (
        <PetContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          onAction={handleMenuAction}
          onDismiss={dismissMenu}
        />
      ) : null}
    </div>
  );
}
