import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import type { ScheduledNotification } from '../stores/appStore';

interface NotificationBadgeProps {
  /** Called when the user clicks a notification to open that character's chat. */
  onNavigateToChar: (charId: number) => void;
}

/**
 * Bell icon with unread count badge and a dropdown list of pending scheduled
 * character messages (Feature C: Scheduled Proactive Messages).
 *
 * Renders nothing when there are no pending notifications. When notifications
 * exist, shows a pulsing accent badge over a bell icon. Clicking the bell
 * toggles a popover list; clicking an item navigates to the character's
 * chat and dismisses that notification. Clicking outside closes the popover.
 *
 * @param props.onNavigateToChar - Callback to open a character's chat thread.
 *
 * @example
 * <NotificationBadge onNavigateToChar={(id) => selectCharacterById(id)} />
 */
export function NotificationBadge({ onNavigateToChar }: NotificationBadgeProps) {
  const {
    scheduledNotifications,
    unreadNotificationCount,
    dismissScheduledNotification,
    clearScheduledNotifications,
  } = useAppStore();

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  if (unreadNotificationCount === 0) return null;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        title={`${unreadNotificationCount} new message${unreadNotificationCount !== 1 ? 's' : ''}`}
        style={{
          position: 'relative',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          padding: '6px',
          borderRadius: 8,
          color: 'var(--color-text-secondary)',
        }}
      >
        <Bell size={16} />
        {/* Unread count pill */}
        <span
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            minWidth: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
            fontSize: 8,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 2px',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        >
          {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
        </span>
      </button>

      {/* Notification list popover */}
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 8,
            width: 280,
            maxHeight: 320,
            overflowY: 'auto',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-card)',
            zIndex: 200,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Messages while you were away
            </span>
            <button
              onClick={clearScheduledNotifications}
              style={{
                fontSize: 10,
                color: 'var(--color-accent)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              Clear all
            </button>
          </div>

          {/* Notification rows */}
          {scheduledNotifications.map((n: ScheduledNotification) => (
            <button
              key={n.id}
              onClick={() => {
                dismissScheduledNotification(n.id);
                setOpen(false);
                onNavigateToChar(n.charId);
              }}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid var(--color-border-subtle)',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  'var(--color-accent-soft)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
            >
              {/* Avatar */}
              {n.charAvatarUrl ? (
                <img
                  src={n.charAvatarUrl}
                  alt=""
                  style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-accent-gradient)',
                    color: 'var(--color-accent-text)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {n.charName[0]}
                </div>
              )}

              {/* Text */}
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-accent)', margin: 0 }}>
                  {n.charName}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-secondary)',
                    margin: '2px 0 0',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {n.preview}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
