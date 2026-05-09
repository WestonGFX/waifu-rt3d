/**
 * Hook to poll bond progression state and detect level-ups.
 *
 * Fetches the character's bond state from the backend after each message
 * exchange (detected via messageCount changes). When a level-up is detected,
 * queues a celebration overlay via appStore.setPendingLevelUp().
 *
 * @param charId - Active character ID (null when no character selected).
 * @param messageCount - Current message count; triggers re-fetch on change.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { api } from '../lib/api';

/** Fetch bond state + unlocks and update appStore. Detect level-ups. */
async function fetchBondState(charId: number): Promise<void> {
  const store = useAppStore.getState();
  const prevLevel = store.bondLevel;

  try {
    const [bondRes, unlockRes] = await Promise.all([
      api.getBondLevel(charId),
      api.getBondUnlocks(charId),
    ]);

    const bond = bondRes.bond ?? bondRes;
    const level = bond.bond_level ?? 0;
    const xp = bond.bond_xp ?? 0;
    const xpToNext = bond.xp_to_next ?? 150;
    const tier = bond.tier ?? 'stranger';

    store.setBondState({
      bondLevel: level,
      bondXp: xp,
      bondXpToNext: xpToNext,
      bondTier: tier,
      bondNextUnlock: unlockRes.next_unlock ?? null,
    });

    // Detect level-up (only when level increased, not on first load)
    if (level > prevLevel && prevLevel > 0) {
      const prevTier = store.bondTier;
      const unlocks = (unlockRes.unlocked ?? [])
        .filter((u: { level?: number }) => u.level !== undefined && u.level > prevLevel && u.level <= level)
        .map((u: { type: string; label: string }) => ({ type: u.type, label: u.label }));

      store.setPendingLevelUp({
        newLevel: level,
        tier,
        previousTier: prevTier,
        unlocks,
      });

      // M6-item21: Grant bond milestone achievements
      for (const milestone of [10, 50, 90]) {
        if (prevLevel < milestone && level >= milestone) {
          api.grantAchievement(charId, `bond_${milestone}`).then((res) => {
            if (res.granted) store.setPendingAchievement(res.achievement);
          }).catch(() => {});
          break;
        }
      }
    }

    // M6-item21: streak achievements — check after every bond fetch
    try {
      const streakRes = await api.getCharacterStreak(charId);
      const s = streakRes.streak ?? 0;
      for (const threshold of [3, 7, 30] as const) {
        if (s >= threshold) {
          api.grantAchievement(charId, `streak_${threshold}`).then((res) => {
            if (res.granted) store.setPendingAchievement(res.achievement);
          }).catch(() => {});
        }
      }
    } catch {
      // Streak API not available — silent fallback
    }
  } catch {
    // Bond API not available — silent fallback
  }
}

const MSG_ACHIEVEMENT_MILESTONES: Array<[number, string]> = [
  [1, 'first_message'],
  [100, 'messages_100'],
  [500, 'messages_500'],
];

export function useBondProgress(charId: number | null, messageCount: number): void {
  const initialFetch = useRef(false);
  const checkedMsgMilestones = useRef(new Set<string>());

  // Fetch on character change — reset milestone cache
  useEffect(() => {
    if (!charId) return;
    initialFetch.current = false;
    checkedMsgMilestones.current.clear();
    fetchBondState(charId);
  }, [charId]);

  // Fetch after each message exchange + check message-count achievements
  useEffect(() => {
    if (!charId || messageCount === 0) return;
    if (!initialFetch.current) {
      initialFetch.current = true;
      return;
    }
    fetchBondState(charId);

    // M6-item21: grant first/100/500 message achievements
    const store = useAppStore.getState();
    for (const [threshold, key] of MSG_ACHIEVEMENT_MILESTONES) {
      if (messageCount === threshold && !checkedMsgMilestones.current.has(key)) {
        checkedMsgMilestones.current.add(key);
        api.grantAchievement(charId, key).then((res) => {
          if (res.granted) store.setPendingAchievement(res.achievement);
        }).catch(() => {});
      }
    }
  }, [charId, messageCount]);
}
