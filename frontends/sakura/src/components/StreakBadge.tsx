import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface StreakData {
  streak: number;
  total_xp: number;
  tier: string;
  next_tier: string;
  xp_to_next: number;
}

/**
 * Small pill badge showing the character's daily interaction streak.
 * Displays a fire emoji + streak count (e.g. "🔥 7").
 * Hidden when streak is 0.
 *
 * Re-fetches whenever messageCount changes (i.e. after each assistant reply),
 * since the backend awards XP and updates the streak on every interaction.
 *
 * @param charId       - Active character ID.
 * @param messageCount - Total messages in current session; triggers re-fetch on change.
 */
export function StreakBadge({ charId, messageCount }: { charId: number; messageCount: number }) {
  const [data, setData] = useState<StreakData | null>(null);

  useEffect(() => {
    api.getCharacterStreak(charId)
      .then(setData)
      .catch(() => setData(null));
  }, [charId, messageCount]);

  if (!data || data.streak === 0) return null;

  const tooltip = `${data.tier} (${data.total_xp} XP)${data.next_tier ? ` · ${data.xp_to_next} XP to ${data.next_tier}` : ''}`;

  return (
    <span
      className="flex-shrink-0"
      title={tooltip}
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 6,
        color: 'var(--color-warning, #f59e0b)',
        backgroundColor: 'color-mix(in srgb, var(--color-warning, #f59e0b) 12%, transparent)',
        letterSpacing: '0.04em',
        lineHeight: 1.5,
        cursor: 'default',
      }}
    >
      🔥 {data.streak}
    </span>
  );
}
