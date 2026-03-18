/**
 * ContentLockDialog — Set or unlock a password that protects
 * the content ceiling selector.
 *
 * When the lock is enabled, the ceiling selector is disabled until
 * the correct password is entered. The password is stored as a
 * SHA-256 hash — never in plain text.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import {
  hashContentLockPassword,
  verifyContentLockPassword,
} from '@/services/contentGatingService.ts';

interface ContentLockDialogProps {
  /** Whether the dialog is currently visible. */
  open: boolean;
  /** Whether a lock is currently set (unlock mode vs set mode). */
  isLocked: boolean;
  /** The stored password hash (for unlock verification). */
  storedHash: string;
  /** Called with the new hash when setting, or empty string when unlocking. */
  onComplete: (hash: string, enabled: boolean) => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

/**
 * Renders a dialog for setting or unlocking the content lock password.
 */
export default function ContentLockDialog({
  open,
  isLocked,
  storedHash,
  onComplete,
  onCancel,
}: ContentLockDialogProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      if (isLocked) {
        // Unlock mode: verify the password
        const matches = await verifyContentLockPassword(password, storedHash);
        if (!matches) {
          setError('Incorrect password.');
          setLoading(false);
          return;
        }
        onComplete('', false);
      } else {
        // Set mode: validate and hash
        if (password.length < 4) {
          setError('Password must be at least 4 characters.');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }
        const hash = await hashContentLockPassword(password);
        onComplete(hash, true);
      }
    } finally {
      setPassword('');
      setConfirmPassword('');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-[color:var(--shell-divider)] bg-[color:var(--card-bg)] p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-text-primary">
          {isLocked ? 'Unlock Content Settings' : 'Set Content Lock'}
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          {isLocked
            ? 'Enter the password to unlock content settings.'
            : 'Set a password to prevent accidental changes to the content ceiling.'}
        </p>

        <div className="mt-4 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isLocked ? 'Enter password' : 'New password'}
            className="w-full rounded-lg border border-[color:var(--shell-divider)] bg-[color:var(--control-bg)] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
            autoFocus
          />
          {!isLocked && (
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full rounded-lg border border-[color:var(--shell-divider)] bg-[color:var(--control-bg)] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
            />
          )}
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !password}>
            {isLocked ? 'Unlock' : 'Set Lock'}
          </Button>
        </div>
      </div>
    </div>
  );
}
