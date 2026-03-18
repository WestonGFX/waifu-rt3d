/**
 * AgeVerificationDialog — Modal confirming the user is 18+.
 *
 * Shown once when the user first attempts to set the content ceiling
 * above 'general'. Legal CYA, not identity verification.
 * The boolean is persisted in ContentGateConfig.ageVerified.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';

interface AgeVerificationDialogProps {
  /** Whether the dialog is currently visible. */
  open: boolean;
  /** Called when the user confirms they are 18+. */
  onConfirm: () => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

/**
 * Renders a modal asking the user to confirm they are 18+.
 *
 * @example
 * <AgeVerificationDialog open={showDialog} onConfirm={handleConfirm} onCancel={handleCancel} />
 */
export default function AgeVerificationDialog({
  open,
  onConfirm,
  onCancel,
}: AgeVerificationDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-[color:var(--shell-divider)] bg-[color:var(--card-bg)] p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-text-primary">
          Age Verification Required
        </h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Mature and explicit content settings are only available to users who are 18 years of age or older.
          This is a one-time confirmation.
        </p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--shell-divider)] p-3 transition-colors hover:bg-[color:var(--control-bg)]">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-anime-500"
          />
          <span className="text-sm text-text-primary">
            I confirm that I am 18 years of age or older.
          </span>
        </label>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!acknowledged}
            onClick={() => {
              setAcknowledged(false);
              onConfirm();
            }}
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
