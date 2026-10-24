/**
 * Click behaviour for the quick-reply pills shown under the last assistant reply.
 *
 * `fill` (default) drops the pill text into the composer so the user can edit
 * before sending; `send` fires it immediately. Either way a click is ignored if
 * the composer already holds text — pills are hidden while drafting, so that
 * only happens in a click race, and we never overwrite freshly typed text.
 *
 * Pure function, no React/DOM dependencies — Vitest-friendly.
 */

import type { AppConfig } from './types';

export type ReplyPillAction = 'fill' | 'send';

/** Reads `reply_pills_action` from config, falling back to `'fill'` for missing/invalid values. */
export function getReplyPillAction(config: AppConfig | null | undefined): ReplyPillAction {
  return config?.reply_pills_action === 'send' ? 'send' : 'fill';
}

export interface ReplyPillHandlers {
  /** Current composer text, read at click time (not from a render closure). */
  getDraft: () => string;
  setDraft: (text: string) => void;
  send: (text: string) => void;
  focusComposer: () => void;
}

/** Applies a pill click. Returns what happened so callers and tests can tell. */
export function applyReplyPill(
  chip: string,
  action: ReplyPillAction,
  handlers: ReplyPillHandlers,
): ReplyPillAction | 'ignored' {
  if (handlers.getDraft()) return 'ignored';
  if (action === 'send') {
    handlers.send(chip);
  } else {
    handlers.setDraft(chip);
    handlers.focusComposer();
  }
  return action;
}
