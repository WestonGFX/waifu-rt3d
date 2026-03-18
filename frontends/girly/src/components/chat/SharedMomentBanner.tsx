import { type SharedConversationMoment } from '../../types/index.ts';

interface Props {
  moment: SharedConversationMoment;
  hasExistingChat: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

function clipPreview(content: string, maxChars: number): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

export default function SharedMomentBanner({
  moment,
  hasExistingChat,
  onAccept,
  onDismiss,
}: Props) {
  const [userMessage, assistantMessage] = moment.messages;

  return (
    <div className="shared-moment-banner motion-panel mx-4 mt-1.5 rounded-[24px] border px-3.5 py-2.5 shadow-[0_18px_42px_-34px_var(--color-glow-primary)] md:mx-5">
      <div className="flex items-start justify-between gap-3">
        <div className="motion-content">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-anime-500">
            Shared Moment
          </p>
          <p className="mt-0.5 text-sm font-medium text-text-primary">
            {hasExistingChat ? 'Start from this shared exchange.' : 'Import this exchange and keep chatting.'}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {hasExistingChat
              ? 'This replaces the current local chat history in this tab.'
              : 'You can keep the shared vibe and continue the conversation from here.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="rounded-pill border border-anime-200 px-2.5 py-1 text-[11px] font-medium text-text-muted transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-micro)] ease-[var(--motion-ease-standard)] hover:bg-white active:scale-[var(--motion-scale-press)]"
        >
          Dismiss
        </button>
      </div>

      <div className="motion-content mt-2 space-y-1.5">
        <div className="chat-bubble-user max-w-full rounded-bubble rounded-br-sm border px-3 py-2 text-xs text-text-primary">
          {clipPreview(userMessage.content, 180)}
        </div>
        <div className="shared-moment-assistant max-w-full rounded-bubble rounded-bl-sm border px-3 py-2 text-xs text-text-secondary shadow-[0_8px_22px_-18px_var(--color-glow-primary)]">
          {clipPreview(assistantMessage.content, 280)}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-pill bg-anime-500 px-3 py-1.5 text-xs font-semibold text-white transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-micro)] ease-[var(--motion-ease-standard)] hover:bg-anime-600 active:scale-[var(--motion-scale-press)]"
        >
          {hasExistingChat ? 'Replace and continue' : 'Import moment'}
        </button>
      </div>
    </div>
  );
}
