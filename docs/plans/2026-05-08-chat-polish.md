# Chat Polish — Execution Plan

**Date:** 2026-05-08
**Effort:** ~18h AI-assisted (~12× human-equivalent)
**Priority:** High — primary daily-use surface
**Status:** Draft, ready for /go
**Schema:** v80 (no new migrations required)
**Depends on:** No in-flight PRs blocking any phase

---

## 1. Context

**Why.** Chat is where the user spends 95% of their time with the app. Every rough edge compounds over a day of use — a clunky regen UX, no code-block copy button, a timestamp that never shows, a stuck image gen that gives no feedback. None of these individually break the experience, but together they make the app feel unfinished. This plan attacks the highest-pain daily cuts.

**What is already shipped (verified by grep — do not re-plan these):**

| Feature | Shipped | Evidence |
|---|---|---|
| Response regeneration UI | YES | `DialogueBubble.tsx:969–980` — regen button on all assistant messages + `Ctrl+Shift+R` shortcut at `ChatThread.tsx:580` |
| Response branching / swipe | YES | `handleBranchSwitch` at `ChatThread.tsx:543`; branch nav chevrons in `DialogueBubble.tsx:935–966` |
| Typing indicator (skeleton + stages) | YES | `ThinkingPlaceholder` at `DialogueBubble.tsx:199–302`; two modes wired via `thinkingIndicatorMode` from `appStore.ts:457` |
| Search within thread | YES | `StatusBar.tsx:513` — full search bar with thread/global scope toggle; `visibleMessages` filter at `ChatThread.tsx:621` |
| Scroll-to-bottom on session resume | YES | `forceScrollRef.current = true` at `ChatThread.tsx:172`; instant scroll at line 188 |
| Message editing | YES | Inline textarea in `DialogueBubble.tsx:826–850`; `editMessage` in `chatStore.ts` |
| Quick-reply chips | YES | SSE `quick_replies` event at `chatStore.ts:321`; `quickReplies?: string[]` on `ChatMessage` |
| Emoji reactions | YES | Hover-reveal picker at `ChatThread.tsx:898–935`; reaction row at lines 938–968 |
| Image lightbox | YES | `ChatImageLightbox` at `DialogueBubble.tsx:6,874` |
| Export as Markdown | YES | `handleExportMarkdown` at `ChatThread.tsx:645`; overflow menu in `StatusBar.tsx:445` |
| Timeout retry card | YES | `TimeoutActionCard` at `DialogueBubble.tsx:324–374` with Retry/Switch model/Cancel |
| `imagePrompt` field on ChatMessage | YES | `types.ts:202`; set from `tool_result` SSE at `chatStore.ts:388` |

**What is genuinely open (verified missing):**

| Item | Gap |
|---|---|
| Code-block rendering | `MarkdownText` (DB:136) handles bold/italic/narration but no backtick/fence block support |
| Copy button on code blocks | Doesn't exist because code blocks don't render |
| TTFT telemetry | `streamStart` tracked at `chatStore.ts:259` but first-token timestamp never captured separately; no TTFT stored on `ChatMessage` |
| Stuck-gen indicator for image regen | Deferred from Visual Content MVP plan; re-spec needed (`regenStartedAt` field on `ChatMessage`); `regenerateImage` keeps old `imageUrl` visible during regen, making naive signal unworkable |
| Per-message timestamps | `createdAt: number` field exists on `ChatMessage` (`types.ts:189`) but never rendered in the UI |
| Message pinning UI | `pinned?: boolean` on `ChatMessage` (`types.ts:216`), column in DB (schema v20), but no pin/unpin control in the UI |
| `failed` status rendering | `DialogueBubble.tsx:822–824` renders a red italic line but offers no retry action (unlike timeout card) |

**Daily pain statement.** The user's complaint is "chat feels slow / sloppy." The two biggest contributors are: (1) no code-block support makes LLM output look broken whenever the model uses fences, and (2) no TTFT visibility means every slow response feels like a black box. Secondary pain: stuck image-gen gives no feedback, failed messages have no retry, timestamps never show.

---

## 2. User Stories

**US-1 — Core flow (LLM response with code block).**
The user asks their character a technical question. The model replies with a fenced code block. Today: the backticks appear literally in the bubble, unformatted. After this plan: the block renders in a monospace box with a one-click copy button. The user copies the snippet without touching the mouse-select dance.

**US-2 — Slow response feedback.**
The user sends a message. The model is warm but taking 8 seconds to produce the first token. Today: the skeleton/stages indicator shows elapsed time in whole seconds ("Thinking 8s") but the user doesn't know if the model is prefilling or stuck. After this plan: the first-token timestamp is captured; once the first token arrives the TTFT is shown in the message metadata line ("0.3s to first token, 24 t/s"). Slow-model users now know which part of the wait was prefill vs generation.

**US-3 — Image generation stuck.**
The user asks for a portrait. The agent calls `generate_image`. ComfyUI is slow. Today: the pending bubble shows typing dots and an elapsed timer but gives no image-specific feedback. After this plan: at 30s it shows "Still generating image..." below the dots; at 60s it shows "Took too long — Try again" wired to `regenerateImage`. The user isn't left guessing whether the backend is alive.

**US-4 — Recovering a failed message.**
A send fails mid-stream (`status: 'failed'`). Today: the bubble shows red italic text with no action — the user has to retype from scratch. After this plan: a compact error card replaces the red text with a "Retry" button (mirrors the existing timeout card pattern) and optionally surfaces the original text.

---

## 3. Locked Decisions

| Decision | Resolution | Rationale |
|---|---|---|
| Code block rendering library | Custom tokenizer extending existing `MarkdownText` | No new dependency; the existing `parseActions` pattern handles inline tokens and can be extended for fenced blocks; keeping it custom avoids hydration/SSR concerns |
| Code copy button UX | Overlay button in top-right corner of the code block, shown on hover | Industry standard (GitHub, VS Code pattern); avoids adding a separate control row |
| TTFT capture location | Frontend `chatStore.ts`, on first `token` SSE event | Already has `streamStart` reference; avoids backend change; stored as `firstTokenMs?: number` on ChatMessage (store-only, not persisted) |
| TTFT display location | Metadata line below sent message (next to latencyMs / tokensPerSecond) | Already rendered at `DialogueBubble.tsx:1020+`; adding one field is non-breaking |
| Stuck-gen re-spec trigger | `regenStartedAt?: number` on ChatMessage, set when `regenerateImage` is called, cleared when new `imageUrl` arrives | Solves the "old imageUrl visible during regen" problem that blocked the previous attempt; clean and reversible |
| Per-message timestamp display | Show on hover, formatted as relative time ("2 min ago") | Non-intrusive; consistent with chat app conventions; the field already exists |
| Failed-message retry card | New `FailedActionCard` component modeled after `TimeoutActionCard` (same file) | Pattern already tested and proven; avoids a new component file |
| Message pinning | Deferred — schema and field exist but the pin list management UX is a session-management feature, not a chat-polish item | Out of scope for this plan |

**Non-goals.**
- Conversation minimap / jump-to-date UI
- Smart context compaction visualization (ContextBudgetBar is numeric-only intentionally)
- Swipe gestures (desktop-only app per CLAUDE.md)
- Message-level retry queue for offline support (local-first, always-online to localhost)
- Voice bubble polish (separate audio system)
- Export improvements beyond what is already shipped

---

## 4. Phase A — Code Block Rendering + Copy Button

**Why.** When the LLM sends a fenced code block, the user sees raw backticks. This is the most visually embarrassing gap in message rendering. A character who says "here's a Python snippet" followed by literal triple-backticks looks broken. This phase fixes that at the parser level with zero new dependencies.

**How.**

### 4.1 Extend `parseActions` to handle fenced code blocks

`frontends/sakura/src/components/DialogueBubble.tsx`, function `parseActions` (currently begins around line 136 — the exact line will shift as the file grows; locate by searching for `function parseActions` or `parseActions` near `MarkdownText`).

The current tokenizer handles `**bold**`, `*italic*`, and `(narration)` inline. It processes text character-by-character. Extend it to detect fenced code blocks before the inline token pass:

1. Split the raw `text` by the regex `/^```[\s\S]*?^```/m` (multiline fence detection) BEFORE passing to the paragraph splitter.
2. For each fence segment, emit a token `{ type: 'code', lang: string, body: string }` preserving language hint from the opening fence.
3. For inline backtick code (\`snippet\`), emit `{ type: 'inline_code', text: string }`.
4. Update `MarkdownText` to render `type === 'code'` tokens as a new `<CodeBlock>` sub-component and `type === 'inline_code'` as `<code>` with monospace styling.

### 4.2 New `CodeBlock` sub-component (same file, above `MarkdownText`)

```tsx
/** Renders a fenced code block with language label and one-click copy. */
function CodeBlock({ lang, body }: { lang: string; body: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ position: 'relative', margin: '0.6em 0' }}>
      {lang && (
        <span style={{ /* lang pill */ }}>
          {lang}
        </span>
      )}
      <button
        onClick={copy}
        title="Copy code"
        style={{
          position: 'absolute', top: 6, right: 6,
          background: copied ? 'var(--color-accent-soft)' : 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 4, padding: '2px 6px',
          fontSize: '0.7rem', cursor: 'pointer',
          color: copied ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
          transition: 'all 0.15s',
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8, padding: '10px 12px',
        overflowX: 'auto', fontSize: '0.82rem',
        fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
        color: 'var(--color-text-primary)',
        margin: 0, lineHeight: 1.5,
      }}>
        <code>{body}</code>
      </pre>
    </div>
  );
}
```

### 4.3 Inline code styling

In `MarkdownText`, render `type === 'inline_code'` tokens as:
```tsx
<code style={{
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: '0.88em',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 3,
  padding: '0.1em 0.35em',
  color: 'var(--color-text-primary)',
}}>
  {tok.text}
</code>
```

**Files touched:**
- `frontends/sakura/src/components/DialogueBubble.tsx` — extend `parseActions`, add `CodeBlock`, update `MarkdownText`

**No new files. No store changes. No API changes. No schema changes.**

**Effort:** ~2h

---

## 5. Phase B — TTFT Telemetry + First-Token Display

**Why.** The user waits 8 seconds staring at "Thinking 8s." They don't know if the model is still in prefill (normal) or has stalled. Adding time-to-first-token (TTFT) to the completed message metadata line (which already shows `tokens_per_second` and `latency_ms`) closes that feedback loop. It also helps the user decide whether to upgrade hardware or switch models.

**How.**

### 5.1 Add `firstTokenMs?: number` to `ChatMessage`

`frontends/sakura/src/lib/types.ts`, in the `ChatMessage` interface (line 185). Add after the existing `latencyMs?: number` field (line 205):

```typescript
/**
 * Time-to-first-token in milliseconds: elapsed ms from sendMessage call
 * to receipt of the first `generating` SSE event (model prefill complete).
 * Store-only — not persisted to the database.
 */
firstTokenMs?: number;
```

### 5.2 Capture TTFT in `chatStore.ts`

`frontends/sakura/src/stores/chatStore.ts`, in the `sendMessage` function (line 258+). The `streamStart = performance.now()` reference already exists at line 259. On receipt of the `generating` SSE event (case `'generating'` around line 306), capture TTFT and patch the assistant message:

```typescript
case 'generating': {
  const firstTokenMs = Math.round(performance.now() - streamStart);
  patchAssistant({ status: 'streaming', text: '', stage: 'generating', firstTokenMs });
  break;
}
```

The `generating` event is already fired by the backend at `server.py:5873` when `first_token` flips. No backend change needed.

### 5.3 Display TTFT in `DialogueBubble.tsx`

In the message metadata line rendered after a sent assistant message. The existing metadata section (locate by `tokensPerSecond` near line 1020) shows tps and latency. Add TTFT before the latency figure:

```tsx
{message.firstTokenMs != null && message.firstTokenMs > 500 && (
  <span title="Time to first token (prefill latency)">
    {message.firstTokenMs > 1000
      ? `${(message.firstTokenMs / 1000).toFixed(1)}s TTFT`
      : `${message.firstTokenMs}ms TTFT`}
  </span>
)}
```

Show only when `firstTokenMs > 500ms` — sub-500ms TTFT is unremarkable and clutters the line. Show in seconds for values ≥ 1000ms for readability.

**Files touched:**
- `frontends/sakura/src/lib/types.ts` — add `firstTokenMs` field
- `frontends/sakura/src/stores/chatStore.ts` — capture on `generating` event
- `frontends/sakura/src/components/DialogueBubble.tsx` — render in metadata line

**No schema changes. No API changes.**

**Effort:** ~1.5h

---

## 6. Phase C — Stuck-Gen Indicator for Image Regeneration

**Why.** When the user asks for a portrait and ComfyUI is slow, the pending bubble shows animated dots with an elapsed timer — that's the existing `ThinkingPlaceholder`. But once the agent has confirmed an image request is in flight, the user has no image-specific feedback. If ComfyUI is offline or stalled, the 60s timeout fires and produces the generic timeout card, which says "check your LLM" rather than "check your image generator." This phase gives the user accurate, image-specific feedback.

**How.**

### 6.1 Add `regenStartedAt?: number` to `ChatMessage`

`frontends/sakura/src/lib/types.ts`, add after `firstTokenMs`:

```typescript
/**
 * Epoch-ms timestamp when regenerateImage() was last called for this message.
 * Used to drive the stuck-gen indicator in DialogueBubble. Cleared when a
 * new imageUrl arrives. Store-only — not persisted.
 */
regenStartedAt?: number;
```

### 6.2 Set `regenStartedAt` in `chatStore.ts`

`frontends/sakura/src/stores/chatStore.ts`, function `regenerateImage` (line 596). At the start of the function, before the `api.generatePortrait` call, patch the message:

```typescript
get().messages.find(m => m.id === messageId)  // guard: message exists + has imagePrompt
// then:
set(s => ({
  messages: s.messages.map(m =>
    m.id === messageId ? { ...m, regenStartedAt: Date.now() } : m
  ),
}));
```

After the `result` arrives and `imageUrl` is patched in (around line 606–615), clear `regenStartedAt`:

```typescript
// In the success patch:
{ ...m, imageUrl: newUrl, regenStartedAt: undefined }
// In the error/catch patch:
{ ...m, regenStartedAt: undefined }
```

### 6.3 Add stuck-gen indicator in `DialogueBubble.tsx`

Below the `ThinkingPlaceholder` block (which renders when `status === 'pending'`), add a secondary indicator that fires when `regenStartedAt` is set and the message still has no new image incoming. Create a small hook-style interval inside the bubble render or a dedicated sub-component:

```tsx
function StuckImageIndicator({
  regenStartedAt,
  onRetry,
}: {
  regenStartedAt: number;
  onRetry?: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - regenStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [regenStartedAt]);

  if (elapsed < 30) return null;

  return (
    <div style={{
      fontSize: '0.78rem',
      color: 'var(--color-text-tertiary)',
      fontStyle: 'italic',
      marginTop: 6,
    }}>
      {elapsed >= 60 ? (
        <span>
          Image took too long.{' '}
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: 'var(--color-accent)', cursor: 'pointer',
                fontStyle: 'normal', fontSize: 'inherit', textDecoration: 'underline',
              }}
            >
              Try again
            </button>
          )}
        </span>
      ) : (
        'Still generating image...'
      )}
    </div>
  );
}
```

Render `<StuckImageIndicator>` inside the `DialogueBubble` body when `message.regenStartedAt != null`. The `onRetry` prop calls `onRegenerateImage?.(message.id)`.

**Files touched:**
- `frontends/sakura/src/lib/types.ts` — add `regenStartedAt` field
- `frontends/sakura/src/stores/chatStore.ts` — set/clear in `regenerateImage`
- `frontends/sakura/src/components/DialogueBubble.tsx` — add `StuckImageIndicator` sub-component and render site

**No schema changes. No API changes.**

**Effort:** ~2.5h

---

## 7. Phase D — Failed-Message Retry Card + Per-Message Timestamps

**Why.** Two small but sharp daily-use cuts:

1. `status === 'failed'` messages render as red italic text with no action. The user has to retype their message from scratch. The timeout path already has a polished `TimeoutActionCard`; failed messages deserve the same treatment.
2. Every message has a `createdAt` timestamp that is never shown. Users occasionally want to know when a specific message was sent ("was that before or after I changed the system prompt?"). Showing it on hover is unintrusive.

### 7.1 `FailedActionCard` component

`frontends/sakura/src/components/DialogueBubble.tsx`, directly below `TimeoutActionCard` (around line 375). Same structure and button style. Since `failed` status can happen on both assistant messages (stream error) and user messages (send failure), the card accepts `role` to customize the label:

```tsx
function FailedActionCard({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry?: (text: string) => void;
}) {
  const retryText = message.retryText ?? message.text;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 14px', borderRadius: 10,
      border: '1px solid var(--color-danger, #f44)',
      background: 'var(--color-surface)',
      color: 'var(--color-text-primary)', maxWidth: 340,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.85rem' }}>
        <AlertCircle size={15} style={{ color: 'var(--color-danger, #f44)', flexShrink: 0 }} />
        Message failed to send
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
        Something went wrong during generation. Your message is preserved below.
      </div>
      <pre style={{
        fontSize: '0.78rem', color: 'var(--color-text-tertiary)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
        maxHeight: 80, overflowY: 'auto',
      }}>
        {retryText}
      </pre>
      <div style={{ display: 'flex', gap: 6 }}>
        {onRetry && retryText && (
          <button style={{ /* same accent style as TimeoutActionCard Retry button */ }}
            onClick={() => onRetry(retryText)}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
```

Wire: in `DialogueBubble`, replace the current `message.status === 'failed'` branch (line 822–824) with `<FailedActionCard message={message} onRetry={...} />`. The `onRetry` prop bubbles up to `ChatThread.tsx` similarly to `onRegenerate`; it re-calls `sendMessage` with the stored text.

Add `onRetry?: (text: string) => void` to `DialogueBubbleProps`. Add `handleFailedRetry` callback in `ChatThread.tsx` (mirror `handleRegenerate` pattern).

### 7.2 Per-message hover timestamp

In `DialogueBubble.tsx`, in the secondary action bar (currently `hovered && message.status === 'sent'` block around line 984), add a timestamp span at the trailing end of the bar:

```tsx
<span
  title={new Date(message.createdAt).toLocaleString()}
  style={{
    fontSize: '0.68rem',
    color: 'var(--color-text-tertiary)',
    marginLeft: 'auto',
    userSelect: 'none',
  }}
>
  {formatRelativeTime(message.createdAt)}
</span>
```

Add a `formatRelativeTime(ms: number): string` utility in `frontends/sakura/src/lib/formatTime.ts` (new small file, ~20 lines):

```typescript
/** Returns a human-readable relative time string, e.g. "just now", "3 min ago", "Yesterday". */
export function formatRelativeTime(epochMs: number): string {
  const diffS = Math.floor((Date.now() - epochMs) / 1000);
  if (diffS < 60) return 'just now';
  if (diffS < 3600) return `${Math.floor(diffS / 60)} min ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  if (diffS < 172800) return 'Yesterday';
  return new Date(epochMs).toLocaleDateString();
}
```

Show the timestamp on every message (pending/streaming/sent/failed) since hover-to-show is non-intrusive. Use `message.editedAt` to append "(edited)" when present.

**Files touched:**
- `frontends/sakura/src/components/DialogueBubble.tsx` — add `FailedActionCard`, update `status === 'failed'` branch, add timestamp in hover bar, update `DialogueBubbleProps`
- `frontends/sakura/src/views/ChatThread.tsx` — add `handleFailedRetry` callback, pass `onRetry` to `DialogueBubble`
- `frontends/sakura/src/lib/formatTime.ts` — NEW, `formatRelativeTime` utility

**No schema changes. No API changes.**

**Effort:** ~3h

---

## 8. ASCII UI Mockup

### Code block rendering (Phase A)

```
┌─────────────────────────────────────────────────────┐
│ Sakura                                               │
│ ─────────────────────────────────────────────────── │
│                                                      │
│  Here's a quick Python snippet:                      │
│                                                      │
│  ┌─ python ──────────────────────────── [Copy] ─┐   │
│  │ def greet(name: str) -> str:                  │   │
│  │     return f"Hello, {name}!"                  │   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
│  You can call it like `greet("Chris")`.              │
│  ─────────────────────────────────────────────────── │
│                                                      │
│  [ metadata: 14 t/s · 340ms TTFT · 2 min ago ]      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Stuck-gen indicator (Phase C) — at 35 seconds

```
┌─────────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░                               │
│  ● ● ●   Thinking 35s                               │
│                                                      │
│  Still generating image...                          │
└─────────────────────────────────────────────────────┘
```

### Stuck-gen at 65 seconds

```
┌─────────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░                               │
│  ● ● ●   Thinking 65s                               │
│                                                      │
│  Image took too long. [Try again]                   │
└─────────────────────────────────────────────────────┘
```

### Failed message card (Phase D)

```
┌─────────────────────────────────────────────────────┐
│  ⚠ Message failed to send                           │
│  Something went wrong during generation.            │
│  Your message is preserved below.                   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Tell me something interesting about          │   │
│  │ black holes                                  │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  [ Retry ]                                          │
└─────────────────────────────────────────────────────┘
```

### Per-message hover timestamp (Phase D)

```
  Sakura  "I've been thinking about you..."
           ↑ 14 t/s · 340ms TTFT         3 min ago
            ↗ reaction picker appears on group hover
```

---

## 9. File-Level Change-Set Summary

### New Files

| Path | Purpose | Phase |
|---|---|---|
| `frontends/sakura/src/lib/formatTime.ts` | `formatRelativeTime` utility | D |

### Modified Files

| Path | What changes | Phase |
|---|---|---|
| `frontends/sakura/src/components/DialogueBubble.tsx` | `CodeBlock` sub-component + fenced code token in `parseActions`; `firstTokenMs` display; `StuckImageIndicator`; `FailedActionCard`; `onRetry` prop; hover timestamp; `AlertCircle` import | A, B, C, D |
| `frontends/sakura/src/stores/chatStore.ts` | Capture `firstTokenMs` on `generating` event; set/clear `regenStartedAt` in `regenerateImage` | B, C |
| `frontends/sakura/src/lib/types.ts` | Add `firstTokenMs?: number`, `regenStartedAt?: number` to `ChatMessage` | B, C |
| `frontends/sakura/src/views/ChatThread.tsx` | Add `handleFailedRetry`; pass `onRetry` to `DialogueBubble` | D |

### Existing Code to Reuse

| Symbol | File:line | How reused |
|---|---|---|
| `parseActions` / `MarkdownText` | `DialogueBubble.tsx:136` | Extended in Phase A; add `code` and `inline_code` token types |
| `TimeoutActionCard` | `DialogueBubble.tsx:324` | Template for `FailedActionCard` in Phase D — same style constants |
| `patchAssistant` pattern | `chatStore.ts:262` | Phase C reuses inline `set(s => ...)` pattern for `regenStartedAt` mutations |
| `streamStart` | `chatStore.ts:259` | Phase B reads this reference to compute TTFT on first `generating` event |
| Metadata line (tps / latency) | `DialogueBubble.tsx:~1020` | Phase B appends TTFT span to existing line; no new layout needed |
| `ThinkingPlaceholder` | `DialogueBubble.tsx:199` | Phase C's `StuckImageIndicator` renders below this when `regenStartedAt` is set |
| `hovered` state + secondary action bar | `DialogueBubble.tsx:~984` | Phase D appends timestamp span to the end of this existing bar |
| `handleRegenerate` in `ChatThread.tsx` | `ChatThread.tsx:495` | Phase D's `handleFailedRetry` mirrors this exact shape |

---

## 10. Implementation Order

### Phase A — Code Block Rendering (2h)
1. Add `code` and `inline_code` token types to `parseActions` (split text on fenced blocks first, then pass segments to inline parser).
2. Add `CodeBlock` sub-component with copy button + `useState(copied)` feedback.
3. Update `MarkdownText` to route `type === 'code'` to `CodeBlock` and `type === 'inline_code'` to `<code>`.
4. Manual verification: send a message containing ` ```python\nprint("hello")\n``` ` and confirm rendered output. Confirm copy button copies the body without the fence markers.
5. Run `npx tsc --project tsconfig.app.json --noEmit` — zero errors.
6. Commit: `feat(chat-polish-A): code block rendering with copy button in DialogueBubble`.

### Phase B — TTFT Telemetry (1.5h)
1. Add `firstTokenMs?: number` to `ChatMessage` in `types.ts`.
2. Capture it in `chatStore.ts` on the `generating` case.
3. Add TTFT span to metadata line in `DialogueBubble.tsx` (conditional on `> 500ms`).
4. Manual verification: send a message; after it completes, hover the metadata line and confirm TTFT appears on a slow-model response (may need to lower timeout or use a busy model).
5. Run TSC — zero errors.
6. Commit: `feat(chat-polish-B): TTFT telemetry captured and displayed in message metadata`.

### Phase C — Stuck-Gen Indicator (2.5h)
1. Add `regenStartedAt?: number` to `ChatMessage` in `types.ts`.
2. Set `regenStartedAt` at start of `regenerateImage` in `chatStore.ts`; clear in success + catch.
3. Add `StuckImageIndicator` sub-component to `DialogueBubble.tsx`.
4. Render it in `DialogueBubble` body when `message.regenStartedAt != null`.
5. Verify `onRetry` wiring reaches `onRegenerateImage` correctly.
6. Manual verification: trigger an image regen with ComfyUI offline; at 30s confirm "Still generating image..."; at 60s confirm "Try again" button appears and re-fires regen.
7. Run TSC — zero errors.
8. Commit: `feat(chat-polish-C): stuck-gen indicator for image regeneration with regenStartedAt field`.

### Phase D — Failed Card + Timestamps (3h)
1. Create `frontends/sakura/src/lib/formatTime.ts` with `formatRelativeTime`.
2. Add `FailedActionCard` to `DialogueBubble.tsx` below `TimeoutActionCard`.
3. Replace `status === 'failed'` branch with `<FailedActionCard>`.
4. Add `onRetry?: (text: string) => void` to `DialogueBubbleProps`.
5. Add `handleFailedRetry` in `ChatThread.tsx`; pass as `onRetry` prop.
6. Add `AlertCircle` import from `lucide-react` in `DialogueBubble.tsx`.
7. Add hover timestamp span to secondary action bar in `DialogueBubble.tsx`.
8. Manual verification: force a `status: 'failed'` message (disconnect backend mid-stream); confirm retry card appears; confirm Retry button re-sends original text; confirm timestamp shows on hover.
9. Run full test suite: `.venv/bin/python -m pytest backend/tests/ -q --tb=line` + `npx tsc --noEmit`.
10. Commit: `feat(chat-polish-D): failed-message retry card + per-message hover timestamps`.

---

## 11. Verification Matrix

| Phase | Automated | Manual |
|---|---|---|
| A | `npx tsc --noEmit` — zero errors | Send ` ```python\nprint("hello")\n``` ` → renders monospace block; copy button copies body without fence markers; inline `` `snippet` `` renders with monospace styling |
| B | `npx tsc --noEmit` — zero errors; `ChatMessage` type check passes | Send message to slow model → completed bubble shows TTFT (e.g. "2.3s TTFT"); fast model shows nothing (< 500ms threshold) |
| C | `npx tsc --noEmit` — zero errors | (a) `regenStartedAt` is set on `regenerateImage` call; (b) cleared when `imageUrl` arrives; (c) with ComfyUI offline, indicator fires at 30s and 60s; (d) "Try again" button re-calls `regenerateImage` |
| D | `.venv/bin/python -m pytest backend/tests/ -q` + `npx tsc --noEmit` — both clean | (a) Disconnect backend mid-stream → `status: 'failed'` → retry card with original text appears; (b) Retry button re-sends; (c) hover any message → timestamp shown; (d) edited message shows "(edited)" suffix |

---

## 12. Risks + Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Fenced code block regex breaks italic/bold that uses asterisks inside a code block | Medium | Process fences first (split text on fence boundaries before inline pass); content inside a fence block never enters the inline tokenizer |
| `navigator.clipboard.writeText` fails in non-HTTPS Electron context | Low | Electron's renderer runs in a privileged context where clipboard API is available; wrap in try/catch and fall back to `execCommand('copy')` on catch |
| `firstTokenMs` is 0 when `generating` event never fires (model timeout) | Low | Only render TTFT when `firstTokenMs != null && firstTokenMs > 500` — if the event never fired the field stays `undefined` and nothing renders |
| `regenStartedAt` leak — stays set if `regenerateImage` throws before patching | Low | `regenStartedAt` is cleared in the `catch` block; if the function throws before the initial set, the field was never set in the first place |
| `FailedActionCard` `retryText` is undefined for assistant `failed` messages | Medium | `message.retryText` is set on timeout path (chatStore:279); for `failed` status, fall back to `message.text`; hide Retry button when both are empty |
| `DialogueBubble.tsx` is large (~1100 lines including existing content); adding 4 new sub-components increases scroll maintenance cost | Medium | All new sub-components are small (< 40 lines each) and added directly above their render site; no restructuring of existing components |
| Test mock drift in `DialogueBubble.editMode.test.tsx` | Low | The test already mocks `thinkingIndicatorMode` from `appStore` (test line 50); no new store selectors added — existing mock is sufficient. Verify after D. |

---

## 13. Sequencing Notes

All four phases are independent. They do not share in-flight code changes and can be executed serially without merge risk.

**Recommended order: A → B → C → D** because:
- Phase A has the highest user-visible impact and zero risk of touching shared store state.
- Phase B adds a `types.ts` field that Phase C also needs — batching them reduces context switches.
- Phase D touches `ChatThread.tsx` (the largest file) last, when the simpler phases are already stable.

Do not batch all phases into one commit. Each phase is a discrete shippable unit.

---

## 14. Reuse Hooks

| Existing symbol | File:line | Reused by |
|---|---|---|
| `parseActions` | `DialogueBubble.tsx:~136` | Phase A extends the token type union and splits fence regions before inline pass |
| `TimeoutActionCard` button style constants | `DialogueBubble.tsx:329–338` | Phase D copies the `btnStyle` object verbatim for `FailedActionCard` |
| `streamStart = performance.now()` | `chatStore.ts:259` | Phase B reads this at `generating` event to derive TTFT |
| `patchAssistant` inline mutation pattern | `chatStore.ts:262` | Phase C's `regenStartedAt` mutations use `set(s => ({messages: s.messages.map(...)}))` — same pattern, no abstraction needed |
| `hovered` state and secondary action bar | `DialogueBubble.tsx:~984` | Phase D appends timestamp to the trailing end of the existing hover bar |
| `handleRegenerate` shape | `ChatThread.tsx:495` | Phase D's `handleFailedRetry` is a structural copy — same `useCallback`, same `useChatStore.getState()` access pattern |
| `downloadFile.ts` + `downloadBlob` | `lib/downloadFile.ts:6` | No direct reuse in this plan, but Phase A's copy button reuses `navigator.clipboard` directly (no file download needed) |

---

## 15. References

- Visual Content MVP plan (stuck-gen deferred section): `docs/plans/2026-05-06-visual-content-mvp-execution.md` lines 706–710
- Competitor gap analysis (code block + TTFT as gaps): `docs/research/2026-04-07-competitor-gap-analysis.md`
- Frontend conventions: `docs/conventions/frontend-and-ui.md`
- Testing conventions (7 patterns): `.claude/rules/testing-conventions.md`
- `ChatMessage` type: `frontends/sakura/src/lib/types.ts:185–243`
- SSE event flow (generating event, first_token): `backend/server.py:5857–5876`

---

## 16. Forward-Looking

Items that are one step beyond this plan's scope but become natural next steps after these four phases ship:

- **Message pinning UI.** The `pinned` field and DB column exist. The missing piece is a pin toggle in the hover bar and a "pinned messages" filter mode. A 2h follow-on from Phase D.
- **Syntax highlighting in code blocks.** Phase A delivers structure and copy; color highlighting (e.g. `highlight.js` or hand-rolled token coloring for common languages) is a follow-on. Low priority — structure alone is a large improvement.
- **Improved Markdown.** Tables (`| col | col |`), blockquotes (`>`), and horizontal rules are the next most common LLM output formats after code blocks. Can extend the same `parseActions` tokenizer without a library.
- **TTFT trend in Settings.** Once `firstTokenMs` is captured per message, a simple average over the last 20 messages could surface in Settings > Brain as "average response latency," giving the user a model-performance metric without opening a separate tool.
