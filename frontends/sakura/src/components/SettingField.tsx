import { HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '../stores/appStore';

interface SettingFieldProps {
  label: string;
  description?: React.ReactNode;
  tooltip?: string;
  advanced?: boolean;
  children: React.ReactNode;
}

/** Reusable settings row with label, description, tooltip, and control slot. */
export function SettingField({ label, description, tooltip, advanced, children }: SettingFieldProps) {
  const { advancedMode, layoutMode } = useAppStore();
  const compactMode = layoutMode !== 'normal';
  const [showTooltip, setShowTooltip] = useState(false);

  if (advanced && !advancedMode) return null;

  return (
    <div className="py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {label}
          </span>
          {tooltip && (
            <div className="relative">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="p-0.5"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <HelpCircle size={13} />
              </button>
              {showTooltip && (
                <div
                  className="absolute left-6 top-0 z-50 w-56 p-2 text-xs"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--radius-button)',
                    boxShadow: 'var(--shadow-elevated)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)'
                  }}
                >
                  {tooltip}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex-shrink-0">{children}</div>
      </div>
      {description && !compactMode && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {description}
        </p>
      )}
    </div>
  );
}
