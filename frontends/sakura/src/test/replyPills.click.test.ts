import { describe, it, expect, vi } from 'vitest';
import { applyReplyPill, getReplyPillAction, type ReplyPillHandlers } from '../lib/replyPills';

function makeHandlers(draft = '') {
  return {
    getDraft: () => draft,
    setDraft: vi.fn<ReplyPillHandlers['setDraft']>(),
    send: vi.fn<ReplyPillHandlers['send']>(),
    focusComposer: vi.fn<ReplyPillHandlers['focusComposer']>(),
  };
}

describe('getReplyPillAction', () => {
  it('defaults to fill when config is missing or unset', () => {
    expect(getReplyPillAction(null)).toBe('fill');
    expect(getReplyPillAction(undefined)).toBe('fill');
    expect(getReplyPillAction({})).toBe('fill');
  });

  it('returns send only for an exact send value', () => {
    expect(getReplyPillAction({ reply_pills_action: 'send' })).toBe('send');
    expect(getReplyPillAction({ reply_pills_action: 'fill' })).toBe('fill');
    expect(getReplyPillAction({ reply_pills_action: 'SEND' as unknown as 'send' })).toBe('fill');
  });
});

describe('applyReplyPill', () => {
  it('fill drops the pill into the composer and focuses it without sending', () => {
    const h = makeHandlers();
    expect(applyReplyPill('Tell me more', 'fill', h)).toBe('fill');
    expect(h.setDraft).toHaveBeenCalledWith('Tell me more');
    expect(h.focusComposer).toHaveBeenCalledOnce();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('send fires the pill immediately without touching the draft', () => {
    const h = makeHandlers();
    expect(applyReplyPill('Tell me more', 'send', h)).toBe('send');
    expect(h.send).toHaveBeenCalledWith('Tell me more');
    expect(h.setDraft).not.toHaveBeenCalled();
    expect(h.focusComposer).not.toHaveBeenCalled();
  });

  it.each(['fill', 'send'] as const)('%s is ignored when the composer already has text', (action) => {
    const h = makeHandlers('half-typed message');
    expect(applyReplyPill('Tell me more', action, h)).toBe('ignored');
    expect(h.send).not.toHaveBeenCalled();
    expect(h.setDraft).not.toHaveBeenCalled();
    expect(h.focusComposer).not.toHaveBeenCalled();
  });
});
