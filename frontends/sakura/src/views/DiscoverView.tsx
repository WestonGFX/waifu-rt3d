import { Search } from 'lucide-react';

/**
 * Placeholder Discover tab — browse and import community characters.
 * Shows a styled empty state until the feature is implemented.
 */
export function DiscoverView() {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[60vh]">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{
          backgroundColor: 'var(--color-accent-soft)',
          color: 'var(--color-accent)'
        }}
      >
        <Search size={24} />
      </div>
      <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        Discover
      </p>
      <p className="text-sm mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
        Browse and import community characters
      </p>
      <span
        className="mt-3 text-[10px] font-medium px-2.5 py-1 rounded-full"
        style={{
          backgroundColor: 'var(--color-accent-soft)',
          color: 'var(--color-accent)',
        }}
      >
        Coming soon
      </span>
    </div>
  );
}
