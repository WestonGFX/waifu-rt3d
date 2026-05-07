# PRD: Message Editing (User + Assistant, Edit-in-Place)

**Effort:** 1.0d (8h calibrated AI-assisted) | **Priority:** P1 | **Status:** Draft
**Depends on:** none (decouple-able from Retry/Regen + Sibling-Browser PRDs)
**Schema:** v73 (`messages.edited_at`, `messages.edit_history`)
**Related bug doc:** `/Users/chris/Code/waifu-rt3d/docs/bugs/2026-05-06-retry-regenerate-and-message-edit-missing.md`
**Related (separate) PRDs:** Retry/Regen Text · Sibling Browser · Visual Content in Chat (Phase 2)

---

## 1. Problem & Goals

### Why (for Chris)

You typed "yuo" instead of "you" — sent — and now the model is replying to a typo for the next 30 turns. Or worse: the assistant just hallucinated that your character is from "Tokyo, Japan, born 1995" when the lore says she's from a fictional city, and that fact is now seeded into context for every future reply. There's currently no escape hatch except sending a corrective new message ("ignore that, I meant…") — which itself pollutes context — or wiping the session.

Every comparable product (SillyTavern, NovelAI, Discord, Slack, ChatGPT, Claude, Character.AI) ships message editing on day one. Its absence is felt **daily** and silently erodes trust in the chat surface. Users who muscle-memory `Cmd+E` or click-and-hold an old message expect *something* to happen.

The emotional-companion angle matters here too: when the assistant says something subtly off-tone, the warmest fix is "let me touch this up so we stay in the moment" — not "let me delete the whole reply and reroll until the dice land right." Editing preserves the conversation's continuity in a way regeneration cannot.

### How (for the implementer)

The hover action row in `frontends/sakura/src/components/DialogueBubble.tsx:548-571` (user-side) and `:815-840` (assistant-side, "secondary action bar") already exists. There is **partial scaffolding** for user-message edit:

- `DialogueBubble.tsx:104` declares an `onEdit?: (messageId, newText) => void` prop.
- `DialogueBubble.tsx:322` has `editing` local state.
- `DialogueBubble.tsx:413-432` already implements `handleEditStart` / `handleEditConfirm` / `handleEditCancel` and renders a textarea on `:519-543`.
- `ChatThread.tsx:553-564` has `handleEditMessage` calling `api.editMessage(serverMessageId, newText)`.
- `api.ts:228-229` wraps `PUT /api/messages/{id}` with `{text}` body.
- `server.py:6848-6870` implements `PUT /api/messages/{id}` — but currently overwrites `text` only, with **no `edited_at`, no `edit_history`, no audit trail**.
- `ChatThread.tsx:837` only wires `onEdit` for `msg.role === 'user'` — assistant messages are uneditable.

**Gap inventory:**

1. Schema lacks `edited_at` + `edit_history` columns → no way to render "(edited)" badge.
2. `PUT /api/messages/{id}` is fire-and-forget — returns `{ok, id}`, not the full message — so frontend can't refresh `editedAt` without a separate roundtrip.
3. No edit history capture → unrecoverable typo: if the user clicks Save by accident, the original text is gone forever.
4. Assistant bubble doesn't pass `onEdit` → assistant messages aren't editable.
5. `ChatMessage` interface (`types.ts:185-233`) lacks `editedAt` + `editHistory` fields.
6. No "Edit & Regenerate" affordance on user messages.
7. Edit is not disabled for the message currently streaming.
8. Empty-string guard exists locally (`handleEditConfirm`) but no server-side validation.

This PRD upgrades the existing scaffolding into a production-grade affordance with audit trail, mirrors the type contract end-to-end, and surfaces the affordance on assistant bubbles.

### Goals

| # | Goal | Measure |
|---|---|---|
| G1 | Any non-streaming message editable in ≤2 clicks (hover → pencil → type → Save) | Manual + Vitest gesture test |
| G2 | Edit history captured server-side for every save | `edit_history` column non-empty after edit; pytest assertion |
| G3 | "(edited)" badge appears immediately after save without page reload | RTL component test |
| G4 | Assistant + user messages both editable | Two Vitest tests covering both roles |
| G5 | TypeScript compiles cleanly with `editedAt` propagated through `loadHistory` | `npx tsc --noEmit` clean |
| G6 | Pydantic↔TS contract mirrored in same commit | Visual diff of `MessageOut` ↔ `ChatMessage` |
| G7 | Editing blocked while message is mid-stream | Edit button hidden when `status === 'streaming'` |

### Non-goals

- ❌ Sibling messages / branch browser (separate PRD — schema migration uses `sibling_group_id`)
- ❌ Regenerate text reply (separate PRD — `chatStore.regenerateAssistant`)
- ❌ Version diff viewer / "history" overlay surfacing past edits
- ❌ Inline preview of edited markdown (use existing `MarkdownText` after save, no live preview)
- ❌ Collaborative / multi-user editing
- ❌ Auto-resave triggering re-embedding, re-summarization, or context-cache invalidation (out of scope; covered by separate Memory Decay PRD)
- ❌ Mobile/touch swipe-to-edit gesture (desktop-only app; per `feedback_desktop_only.md`)
- ❌ Undo stack on the client (client trusts `edit_history` audit only)

---

## 2. User Stories

### US-1 — Fix a typo in the message you just sent (the daily case)

> Mira opens chat with her companion Aiko. She types "I had a logn day at work" and hits Enter. As Aiko's reply starts streaming, Mira's eyes catch "logn." She hovers her own bubble; the action row appears with a pencil. She clicks it. The bubble morphs in-place into a textarea pre-filled with her text. She fixes the typo, presses Enter (not Shift+Enter), and the bubble snaps back to its rendered form with a faint "(edited)" caption next to her timestamp. Aiko's reply continues streaming uninterrupted — the edit didn't disturb the flow because user-side edits don't auto-regenerate. **The conversation feels alive instead of brittle.**

### US-2 — Curate an off-tone assistant reply (the emotional case)

> Aiko replies: "Tough day, huh? Sucks to be you lol." The "lol" lands wrong — it's not Aiko's voice. Mira hovers Aiko's bubble. The hover row shows Copy, Edit, Regenerate. She clicks **Edit** (not Regenerate — she doesn't want a full reroll, she wants to tweak the *texture*). She deletes "lol" and changes "Sucks to be you" to "I'm sorry you're going through that." Saves. The bubble updates in place, "(edited)" badge appears. **Mira just kept her companion in character without losing the rest of the reply.** This is the curation muscle SillyTavern users build over years.

### US-3 — Edit & Regenerate (the deliberate redo)

> Mira asked "what's a good restaurant in austin" — typo'd "austun". The reply is about Austin TX (autocorrect-y), but she's actually visiting Austin, **Minnesota**. Hovering her own bubble, she clicks Edit. In edit mode, alongside Save and Cancel, there's a third button: **Save & Regenerate**. She fixes "austun" → "austin minnesota", clicks Save & Regenerate. Her bubble updates, the assistant's reply re-streams from the corrected prompt. **One affordance, one decision: 'fix' vs 'fix and reroll'.**

---

## 3. Feature Breakdown

### 3.1 Schema migration v73 — `edited_at` + `edit_history` columns

**Why:** Without server-side audit, every edit silently destroys the original text. The Slack/Discord pattern (visible "(edited)" + invisible audit) is the floor.

**How:**
- File: `/Users/chris/Code/waifu-rt3d/backend/preflight.py`
- Add `migrate_to_v73(con)` after the existing `migrate_to_v72` (`preflight.py:5070`).
- Bump `LATEST_SCHEMA_VERSION` constant.
- Pattern follows existing idempotent ALTER blocks like `preflight.py:1106-1133` (uses `PRAGMA table_info(messages)` to filter cols not present, then `ALTER TABLE ... ADD COLUMN`).
- Wire migration into `ensure_db()` ladder around `preflight.py:5700`.

**SQL diff:**

```sql
-- v73: Add edit-tracking columns to messages
-- edited_at: unix timestamp (ms) of most recent edit, NULL if never edited.
-- edit_history: JSON array of {ts: int, prev_content: str} entries, NULL if never edited.

-- (idempotent guard via PRAGMA table_info filter, mirrors preflight.py:1106)
ALTER TABLE messages ADD COLUMN edited_at INTEGER;
ALTER TABLE messages ADD COLUMN edit_history TEXT;

INSERT INTO schema_version (version, applied_ts) VALUES (73, strftime('%s','now'));
```

### 3.2 Backend — upgrade `PUT /api/messages/{id}`

**Why:** Current endpoint at `server.py:6848-6870` overwrites text without audit and returns only `{ok, id}`. We need it to:
1. Capture the previous `text` into `edit_history` JSON before overwrite.
2. Set `edited_at = now_ms`.
3. Return the full updated `MessageOut` so the frontend can patch `editedAt` and `editHistory` in the store without an extra GET.

**How:**
- File: `/Users/chris/Code/waifu-rt3d/backend/server.py`
- Replace body of `edit_message()` at `:6848`. Per `backend-and-api.md` rule, do **not** delete or reorder; just expand the body.
- Add Pydantic models near the existing `# ==================== MESSAGE EDIT / REGENERATE ====================` block (`:6846`):

```python
class EditHistoryEntry(BaseModel):
    """One captured prior version of a message's text.

    Attributes:
        ts: Unix timestamp (ms) when this version was overwritten.
        prev_content: The text content prior to the edit that produced
            this entry.  Persisted only server-side; not surfaced in UI.
    """
    ts: int
    prev_content: str


class MessageEditRequest(BaseModel):
    """Request body for PUT /api/messages/{id}.

    Attributes:
        text: New message text. Must be non-empty after strip.
            Newlines preserved verbatim.
    """
    text: str


class MessageOut(BaseModel):
    """Full message payload returned by edit / activate / get endpoints.

    Attributes:
        id: Server-side row id from the messages table.
        role: 'user' | 'assistant' | 'system' | 'director'.
        text: Current text content (may have been edited).
        ts: ISO-8601 creation timestamp (preserved from row).
        edited_at: Unix ms of most recent edit, or None if never edited.
        edit_history: List of prior versions (most recent overwrite last).
            None if never edited; list may be capped at 20 entries (3.6).
        emotion: Last detected emotion tag (assistant only).
        pinned: Whether this message is user-pinned (Feature #10).
    """
    id: int
    role: str
    text: str
    ts: str | None = None
    edited_at: int | None = None
    edit_history: list[EditHistoryEntry] | None = None
    emotion: str | None = None
    pinned: bool = False
```

- New endpoint body (replaces `:6848-6870`):

```python
@app.put("/api/messages/{message_id}", response_model=MessageOut)
async def edit_message(message_id: int, body: MessageEditRequest) -> MessageOut:
    """Edit the text of an existing message, preserving full audit history.

    Captures the prior text into ``edit_history`` (JSON), sets
    ``edited_at`` to the current unix-ms timestamp, then overwrites
    ``text``.  Returns the full updated ``MessageOut`` so the client
    can patch its in-memory message without a follow-up GET.

    Args:
        message_id: Row id from the ``messages`` table.
        body: New text content; must be non-empty after strip.

    Returns:
        MessageOut with updated text, edited_at, and edit_history.

    Raises:
        HTTPException 400: If text is empty after strip.
        HTTPException 404: If the message_id does not exist.
        HTTPException 500: On unexpected DB failure.
    """
    new_text = body.text.strip()
    if not new_text:
        raise HTTPException(400, "text required")
    now_ms = int(time.time() * 1000)
    HISTORY_CAP = 20  # See PRD §3.6

    with db_ctx() as conn:
        row = conn.execute(
            "SELECT id, role, text, ts, edited_at, edit_history, emotion, pinned "
            "FROM messages WHERE id=?", (message_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "Message not found")

        prev_text = row[2] or ""
        prev_history_raw = row[5]
        try:
            history: list[dict] = json.loads(prev_history_raw) if prev_history_raw else []
        except (TypeError, ValueError):
            history = []  # Recover from corrupt rows gracefully

        history.append({"ts": now_ms, "prev_content": prev_text})
        # Cap to last N to bound storage cost (oldest dropped)
        if len(history) > HISTORY_CAP:
            history = history[-HISTORY_CAP:]

        try:
            with conn:
                conn.execute(
                    "UPDATE messages SET text=?, edited_at=?, edit_history=? WHERE id=?",
                    (new_text, now_ms, json.dumps(history), message_id),
                )
        except Exception as e:
            raise HTTPException(500, f"Edit failed: {e}")

        return MessageOut(
            id=row[0], role=row[1], text=new_text, ts=row[3],
            edited_at=now_ms,
            edit_history=[EditHistoryEntry(**h) for h in history],
            emotion=row[6], pinned=bool(row[7] or 0),
        )
```

- **`get_session_messages` projection update** (`server.py:6781-6843`): add `edited_at` to the `cols` string at `:6799-6800`. The fallback path at `:6815-6820` does not need changes (it's a panic mode that only returns `id, role, text, ts`). Append `msg["edited_at"] = r[13]` at `:6841` after the `pinned` projection. (Edit history is **not** projected on list — too heavy for hot path; only available via single-message GET if ever exposed.)

### 3.3 Frontend — `api.ts` mirror + `ChatMessage` extension

**Why:** Pydantic↔TypeScript drift is a Known Sensitive Area (`CLAUDE.md`). If the backend returns new fields and `api.ts` doesn't model them, TSC silently passes (the old narrower type is still valid) and the field never reaches the UI.

**How:**

- File: `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/lib/api.ts`
- Replace `editMessage` at `:228-229`:

```typescript
/**
 * Edit a message's text content. Captures previous text into server-side
 * edit_history audit log; sets edited_at to the current unix-ms timestamp.
 * Returns the full updated message so the caller can patch state in place.
 *
 * @param messageId - Server-side row id (Message.serverMessageId)
 * @param text - New text content; must be non-empty after strip
 * @returns The updated MessageOut including edited_at and edit_history
 * @throws Error if 400 (empty), 404 (not found), or 500 (DB failure)
 */
editMessage: (messageId: number, text: string) =>
  put<MessageOut>(`/api/messages/${messageId}`, { text }),
```

- Add interfaces (mirror Pydantic from §3.2):

```typescript
export interface EditHistoryEntry {
  ts: number;
  prev_content: string;
}

export interface MessageOut {
  id: number;
  role: 'user' | 'assistant' | 'system' | 'director';
  text: string;
  ts?: string | null;
  edited_at?: number | null;
  edit_history?: EditHistoryEntry[] | null;
  emotion?: string | null;
  pinned?: boolean;
}
```

- File: `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/lib/types.ts:185`
- Extend `ChatMessage` interface:

```typescript
/** Unix-ms timestamp of most recent edit. Undefined if never edited. */
editedAt?: number;
/** Server-side audit log of prior versions. Not surfaced in UI in MVP;
 *  retained for future history-viewer feature. */
editHistory?: { ts: number; prevContent: string }[];
```

### 3.4 Frontend — `chatStore.editMessage` action + `loadHistory` mapping

**Why:** Today, `ChatThread.tsx:553-564` bypasses the store and uses `useChatStore.setState` directly. That works for the typo case but loses the new `editedAt` field returned by the upgraded endpoint. Centralize in the store to keep ChatThread thin and to make the action testable in isolation (Pattern 1 from `testing-conventions.md`).

**How:**

- File: `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/stores/chatStore.ts`
- Add to `ChatState` interface (after `regenerateImage` at `:40`):

```typescript
/**
 * Edit a message's text in place. Calls PUT /api/messages/{id}, then
 * patches the local message with the new text + editedAt fields from
 * the server response. Does NOT trigger regeneration; see
 * editAndRegenerate() for that flow.
 */
editMessage: (messageId: string, newText: string) => Promise<void>;
```

- Implement in store body:

```typescript
editMessage: async (messageId, newText) => {
  const msg = get().messages.find(m => m.id === messageId);
  if (!msg?.serverMessageId) return;
  const trimmed = newText.trim();
  if (!trimmed || trimmed === msg.text) return;
  try {
    const updated = await api.editMessage(msg.serverMessageId, trimmed);
    set(s => ({
      messages: s.messages.map(m =>
        m.id === messageId
          ? {
              ...m,
              text: updated.text,
              editedAt: updated.edited_at ?? undefined,
              editHistory: (updated.edit_history ?? []).map(h => ({
                ts: h.ts,
                prevContent: h.prev_content,
              })),
            }
          : m
      ),
    }));
  } catch (err) {
    console.error('[editMessage] failed:', err);
    throw err;
  }
},
```

- Update `loadHistory` at `:178-191` to project `editedAt`:

```typescript
const messages: ChatMessage[] = data.messages.map((m) => ({
  id: String(m.id),
  serverMessageId: m.id,
  role: m.role as ChatMessage['role'],
  text: m.text ?? '',
  createdAt: m.ts ? new Date(m.ts).getTime() : Date.now(),
  status: 'sent',
  emotion: m.emotion ?? undefined,
  pinned: m.pinned === 1,
  editedAt: m.edited_at ?? undefined,  // NEW
}));
```

- Update `api.getMessages` return type (in `api.ts`) to include `edited_at?: number | null` on the row shape.

### 3.5 Frontend — DialogueBubble: "(edited)" badge + assistant edit + streaming guard + Edit-and-Regenerate

**Why:** Visible indicator that an edit happened (so users trust their corrections persisted), assistant editability for US-2, hide-during-stream so users don't edit a half-streamed reply, and Save & Regenerate for US-3.

**How:**

- File: `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/components/DialogueBubble.tsx`
- **Pass-through wiring** (`ChatThread.tsx:837`): change to allow assistant edits:

```typescript
onEdit={handleEditMessage}  // remove role gate; backend allows both
```

- **Streaming guard** (`DialogueBubble.tsx:548` and `:816`): add `&& message.status === 'sent'` (the user-side row at `:548` doesn't yet check status; assistant row at `:816` already has it).

- **"(edited)" badge** — render inline next to the existing timestamp (the timestamp lives in the metadata row near the avatar `:618-655`). Add after the emotion emoji block at `:651-655`:

```tsx
{message.editedAt && (
  <span
    title={`Edited ${new Date(message.editedAt).toLocaleString()}`}
    style={{
      fontSize: '0.7rem',
      color: 'var(--color-text-tertiary)',
      fontStyle: 'italic',
      marginLeft: '0.4rem',
    }}
  >
    (edited)
  </span>
)}
```

For the user-side bubble (which renders without the avatar metadata row), add the badge directly after `</MarkdownText>` at `:545`. Use `var(--color-text-tertiary)` per `frontend-and-ui.md` (theme inheritance).

- **Assistant edit button** — the assistant secondary action bar at `:816-840` only has Copy + Delete today. Add Edit button mirroring user-side `:560-564`:

```tsx
{onEdit && (
  <button
    onClick={handleEditStart}
    className="p-0.5 rounded transition-colors"
    style={{ color: 'var(--color-text-tertiary)' }}
    title="Edit message"
  >
    <Pencil size={11} />
  </button>
)}
```

- **Edit-mode rendering for assistant** — currently the textarea block at `:519-543` only renders inside the user-side branch. Extract that block into a small inline subcomponent or duplicate it inside the assistant branch (around `:545` MarkdownText). Reuse the same `editText` / `editing` state from `:322`.

- **Save & Regenerate button** (US-3, user-side only) — extend the textarea controls at `:536-541`:

```tsx
<button
  onClick={handleEditAndRegenerate}
  title="Save and regenerate reply"
  style={{
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid var(--color-accent)',
    background: 'var(--color-accent-soft)',
    color: 'var(--color-accent)',
    cursor: 'pointer',
  }}
>
  <RefreshCw size={11} /> Save & Regenerate
</button>
```

`handleEditAndRegenerate` calls `editMessage(...)` then `onRegenerateAfterEdit(messageId)` — the latter is owned by the future Retry/Regen PRD; for **this** PRD, accept an optional `onRegenerateAfterEdit?: (messageId: string) => void` prop and only render the button when the prop is supplied. This way the affordance lights up automatically once the regen PRD ships, and is invisible until then.

### 3.6 Edit history capping policy

**Why:** A user could feasibly edit a long passage 200 times during a single roleplay scene. Without a cap, `edit_history` grows unbounded and bloats both row size and the JSON parse cost on every read.

**How:**
- Hardcoded `HISTORY_CAP = 20` in `edit_message()` (§3.2). Oldest entries dropped FIFO.
- Document in code comment + this PRD. **Not user-configurable** in MVP.
- The cap is a *policy choice*, not a contract — if a future feature needs full history, it's a backend-only change.

---

## 4. UI Layout

### 4.1 Bubble at rest (no hover)

```
┌──────────────────────────────────────────────────────────────┐
│ [avatar] Aiko · 14:32                                         │
│ ──────────────────────────────────────────────────────────── │
│ I had a long day at work too — what's keeping you up?       │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Bubble on hover (action row visible)

```
┌──────────────────────────────────────────────────────────────┐
│ [avatar] Aiko · 14:32                                         │
│ ──────────────────────────────────────────────────────────── │
│ I had a long day at work too — what's keeping you up?       │
│                                                               │
│  [Copy] [Edit ✏] [Regenerate ↻] [Delete 🗑]    ← hover row  │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 Edit mode (after pencil clicked)

```
┌──────────────────────────────────────────────────────────────┐
│ [avatar] Aiko · 14:32                                         │
│ ──────────────────────────────────────────────────────────── │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ I had a long day at work too — what's keeping you up?   │ │
│ │                                                          │ │
│ │                                              [autofocus] │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  [Save (↵)]  [Cancel (Esc)]                                  │
│                                                               │
│  USER bubbles ALSO show: [Save & Regenerate ↻]                │
└──────────────────────────────────────────────────────────────┘
```

Keybindings: `Enter` = Save, `Shift+Enter` = newline, `Esc` = Cancel. (Already implemented at `DialogueBubble.tsx:525`.)

### 4.4 After save (with badge)

```
┌──────────────────────────────────────────────────────────────┐
│ [avatar] Aiko · 14:32 (edited)                                │
│ ──────────────────────────────────────────────────────────── │
│ I had a long day at work too — what's been on your mind?    │
└──────────────────────────────────────────────────────────────┘
```

The `(edited)` text is `var(--color-text-tertiary)`, italic, 0.7rem, with a hover tooltip showing `Edited {full timestamp}`.

### 4.5 During streaming (Edit hidden)

```
┌──────────────────────────────────────────────────────────────┐
│ [avatar] Aiko · 14:32                                         │
│ ──────────────────────────────────────────────────────────── │
│ I had a long day at work too — what's...▌      ← streaming  │
│                                                               │
│  [Copy]                          ← Edit hidden until done    │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. File Plan

### New Files

| Path | Purpose |
|---|---|
| `frontends/sakura/src/test/chatStore.editMessage.test.ts` | Vitest store-direct test (Pattern 1+2) covering edit flow + error path |
| `frontends/sakura/src/test/DialogueBubble.editMode.test.tsx` | Vitest RTL test covering hover→edit→save/cancel + (edited) badge |
| `backend/tests/test_message_edit.py` | pytest covering schema migration v73 + endpoint round-trip + history cap + error cases |

### Modified Files

| Path | Change |
|---|---|
| `backend/preflight.py` | New `migrate_to_v73()` after `:5070`; bump `LATEST_SCHEMA_VERSION`; wire ladder around `:5700` |
| `backend/server.py` | Add `EditHistoryEntry`/`MessageEditRequest`/`MessageOut` Pydantic models near `:6846`; rewrite `edit_message()` body at `:6848-6870`; extend `get_session_messages` projection at `:6799-6841` to include `edited_at` |
| `frontends/sakura/src/lib/api.ts` | Mirror `MessageOut` + `EditHistoryEntry`; update `editMessage` return type; widen `getMessages` row shape with `edited_at` |
| `frontends/sakura/src/lib/types.ts:185` | Add `editedAt?: number` and `editHistory?: ...` to `ChatMessage` |
| `frontends/sakura/src/stores/chatStore.ts` | Add `editMessage` action; project `editedAt` in `loadHistory` mapping at `:178-191` |
| `frontends/sakura/src/components/DialogueBubble.tsx` | "(edited)" badge in metadata row + after MarkdownText; assistant Edit button at `:816`; assistant edit-mode rendering; streaming-guard on user-side action row at `:548`; optional Save & Regenerate button via `onRegenerateAfterEdit` prop |
| `frontends/sakura/src/views/ChatThread.tsx` | Switch `handleEditMessage` to call `useChatStore.getState().editMessage` (`:553-564`); remove role-gate at `:837`; (later) wire `onRegenerateAfterEdit` once that PRD ships |

### Existing Code to Reuse

| File | Lines | What to reuse |
|---|---|---|
| `frontends/sakura/src/components/DialogueBubble.tsx` | 322, 413-432, 519-543 | Existing `editing` state, `handleEditStart`/`Confirm`/`Cancel`, textarea+Save+Cancel UI |
| `frontends/sakura/src/components/DialogueBubble.tsx` | 104, 560-564 | Existing `onEdit` prop + Pencil button |
| `frontends/sakura/src/views/ChatThread.tsx` | 553-564 | `handleEditMessage` callback (refactor to call store action) |
| `frontends/sakura/src/lib/api.ts` | 228-229 | Existing `editMessage` wrapper (widen return type) |
| `backend/server.py` | 6848-6870 | Existing `PUT /api/messages/{id}` endpoint — rewrite body, do not move |
| `backend/server.py` | 6781-6843 | `get_session_messages` SELECT — extend cols + projection |
| `backend/preflight.py` | 1106-1133 | Idempotent ALTER TABLE pattern via `PRAGMA table_info` filter |
| `backend/preflight.py` | 5070-5161 | `migrate_to_v72` shape — copy structure for v73 |
| `frontends/sakura/src/stores/chatStore.ts` | 464+ | `regenerateImage` action shape (closest analogue: server-mutation + in-place patch via `set` map) |

---

## 6. Implementation Order

Single PR (8h) recommended — the schema, backend, and frontend changes are tightly coupled and the contract surface is small enough that splitting introduces more coordination cost than it saves. If the user prefers staged review, split at the dotted line.

### Phase 1 — Schema + backend (3h)

1. Write `migrate_to_v73()` in `preflight.py`. Verify idempotency with double-run test. (45m)
2. Add Pydantic models + rewrite `edit_message()` body in `server.py`. (45m)
3. Extend `get_session_messages` projection to include `edited_at`. (15m)
4. Write `backend/tests/test_message_edit.py`: migration test, happy path, empty-text 400, missing-id 404, history cap at N=20, JSON-corrupt-row recovery, multi-line newline preservation. (1h)
5. Run `.venv/bin/python -m pytest backend/tests/test_preflight.py backend/tests/test_message_edit.py -q`. (15m)

- - - (commit boundary, optional split point)

### Phase 2 — Frontend mirror + store (2h)

6. Mirror `MessageOut` + `EditHistoryEntry` in `api.ts`; widen `editMessage` return; extend `getMessages` row shape with `edited_at`. (30m)
7. Extend `ChatMessage` in `types.ts`. (10m)
8. Add `editMessage` action to `chatStore.ts`; update `loadHistory` projection. (40m)
9. Write `chatStore.editMessage.test.ts` (Pattern 1 + Pattern 2). (40m)

### Phase 3 — UI (3h)

10. Wire assistant edit (extend `DialogueBubble.tsx` edit-mode block to render under assistant branch). (45m)
11. Add "(edited)" badge in both branches. (30m)
12. Streaming guard on action rows. (20m)
13. Optional `onRegenerateAfterEdit` prop + Save & Regenerate button (gated on prop presence — invisible until Retry/Regen PRD lands). (30m)
14. Update `ChatThread.tsx` to pass `onEdit` for both roles, route through store. (15m)
15. Write `DialogueBubble.editMode.test.tsx`: hover-shows-edit, click-opens-textarea, save calls store, cancel restores, badge renders when `editedAt`, edit hidden during streaming. (40m)
16. Run `.venv/bin/python -m pytest backend/tests/ -q --tb=line` + `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` + `npx vitest run`. (10m)

### Verification

- Browser: hover a recent message, edit, confirm "(edited)" appears, reload session, badge survives. Edit assistant message, same.
- Streaming: send a new message; confirm Edit hidden while reply streams; appears after `[DONE]`.
- pytest tail count.
- TSC clean.
- Vitest count: should rise by 2 (chatStore.editMessage + DialogueBubble.editMode).

---

## 7. Edge Cases & Risks

| # | Risk | Mitigation |
|---|---|---|
| E1 | Edit during in-flight streaming corrupts SSE-built text | Action row hidden when `message.status !== 'sent'`. Backend would also reject because the row's `text` is being mutated by the stream — but the UI guard prevents the race entirely. |
| E2 | `edit_history` JSON grows unbounded over months of editing | Hardcoded `HISTORY_CAP = 20`, oldest-first FIFO. Documented in code + this PRD §3.6. |
| E3 | Editing a USER message after assistant has replied — does the model see edited or original on next turn? | Edited. Context assembly reads current `messages.text` (`server.py:3708`), not history. This is the *intended* semantic — users edit precisely because they want the assistant to act on the corrected version going forward. The original is preserved in `edit_history` for audit only, never re-injected. Document this in commit message and the bug doc. |
| E4 | "Edit & Regenerate" depends on a separate PRD's `regenerateAssistant` action that may not ship at the same time | Save & Regenerate button is rendered only when the optional `onRegenerateAfterEdit` prop is supplied. This PRD's commit can ship without the affordance lit; it lights up automatically once the Retry/Regen PRD ships its prop wiring. Zero blocker, zero coordination friction. |
| E5 | Multi-line edits collapsed by accidental whitespace stripping | Server-side: `body.text.strip()` strips only outer whitespace; inner newlines preserved. Frontend textarea uses `<textarea>` (not `<input>`) so newlines preserved natively. Test case in §6 step 4. |
| E6 | Pydantic↔TS drift if frontend `ChatMessage.editedAt` is added later than backend column | Same-commit policy enforced by including both `api.ts` mirror AND `ChatMessage` extension in Phase 2. CLAUDE.md's "Known Sensitive Areas" callout reinforces this. |
| E7 | A user mass-edits 50 messages in a roleplay scene → 50 PUTs in quick succession | No debounce in MVP. Endpoint is cheap (single UPDATE + JSON parse). If it becomes a problem, add 500ms debounce on the textarea Save handler. Not blocking ship. |
| E8 | Empty-string save destroys content | Server returns 400 on empty-after-strip; client `handleEditConfirm` already guards (`DialogueBubble.tsx:423`). Tested in Phase 1 step 4. |
| E9 | Edit to a message currently being TTS-spoken | TTS playback uses `audioUrl` which is decoupled from `text`; edit changes text but doesn't kill in-flight audio. Acceptable — playback finishes, next playback uses new text. |
| E10 | Theme breakage of "(edited)" badge across 18 themes | Use `var(--color-text-tertiary)` for color (theme-inheriting). Manual check on 1 light + 1 dark theme during verification. |
| E11 | `MarkdownText` re-rendering bug on text change (cached AST) | `MarkdownText` already re-renders on `text` prop change (existing behavior — typo edit on user messages already works). Confirmed by reading existing edit flow at `:519-545`. |
| E12 | A botched save races with the streaming-guard hiding the button mid-click | Event handler captures `messageId` at click time; even if the bubble re-renders, the action is dispatched against a stable id. Worst case: save succeeds, badge shows. No data corruption. |

---

## 8. Verification

### Automated tests

**Backend (`backend/tests/test_message_edit.py`):**
- `test_v73_migration_idempotent` — runs migration twice on a v72 DB, verifies columns exist exactly once.
- `test_edit_message_happy_path` — POST a message via the chat path, PUT new text, assert response shape, assert `edited_at` set, assert `edit_history` has one entry with prior text.
- `test_edit_message_preserves_history` — edit twice, assert `edit_history` has two entries in chronological order.
- `test_edit_message_history_cap` — edit 25 times, assert `edit_history` length == 20 and oldest is dropped.
- `test_edit_message_empty_400` — PUT `{"text": ""}` → 400.
- `test_edit_message_whitespace_only_400` — PUT `{"text": "   "}` → 400.
- `test_edit_message_missing_404` — PUT to non-existent id → 404.
- `test_edit_message_corrupt_history_recovers` — manually set `edit_history='{not-json'`, PUT, assert recovers + creates fresh history with one entry.
- `test_edit_message_preserves_newlines` — PUT `"line1\nline2\n\nline3"`, assert exact byte preservation.
- `test_get_session_messages_projects_edited_at` — edit then GET, assert `edited_at` field present in row.

**Frontend store (`chatStore.editMessage.test.ts`):**
- `it('patches text + editedAt in store on success', ...)` — Pattern 1+2.
- `it('no-ops when text unchanged', ...)`.
- `it('no-ops when text is empty after trim', ...)`.
- `it('does not mutate other messages', ...)`.
- `it('throws + leaves store unchanged on API error', ...)`.

**Frontend component (`DialogueBubble.editMode.test.tsx`):**
- `it('shows pencil button on hover for user message', ...)` — Pattern 4.
- `it('shows pencil button on hover for assistant message', ...)`.
- `it('hides pencil button while streaming', ...)`.
- `it('opens textarea with prefilled text on pencil click', ...)`.
- `it('calls onEdit on Enter, not on Shift+Enter', ...)`.
- `it('cancels on Escape and restores original text', ...)`.
- `it('renders (edited) badge when editedAt is set', ...)`.
- `it('renders Save & Regenerate button only when onRegenerateAfterEdit provided', ...)`.

### Manual checklist (browser, after deploy)

1. Hover a user message → pencil appears.
2. Click pencil → textarea opens, focus + cursor in textarea, original text selected.
3. Edit text + Enter → bubble snaps back, `(edited)` badge appears.
4. Hover assistant message → pencil appears.
5. Edit assistant message → same flow works.
6. Send new message; while streaming, hover the streaming bubble → pencil **NOT** visible.
7. After stream completes, pencil appears.
8. Reload session → `(edited)` badge persists on edited messages.
9. Edit user message → confirm assistant's *next* reply is contextually based on the edited text (send a follow-up).
10. Theme check: cycle to one dark theme + one light theme, confirm badge readable.
11. Multi-line edit: paste a 4-line message, edit, save, confirm rendering preserves newlines (markdown blank-line → paragraph break).

---

## 9. Out of Scope (explicit)

- ❌ Sibling messages — separate PRD
- ❌ Retry/Regenerate text — separate PRD
- ❌ Version diff viewer / "show edit history" UI in chat
- ❌ Mobile/touch swipe-to-edit gestures
- ❌ Auto-resave after embedding/summarization invalidation
- ❌ Multi-user collaborative edits
- ❌ Rich-text WYSIWYG inside the textarea (plain text only; markdown rendering happens after save)
- ❌ Undo client-side history (server `edit_history` is the source of truth)

---

## 10. Open Questions

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Should "Save & Regenerate" ship in this PRD, or wait for Retry/Regen PRD? | Ship with the prop-gated affordance (invisible until regen PRD wires the callback). Zero risk, future-friendly. |
| Q2 | Is `HISTORY_CAP = 20` the right number? | Yes for MVP — enough to recover the last week of typo edits without bloating row size. Revisit if a power user complains. |
| Q3 | Should `(edited)` show the edit count (e.g., "edited × 3")? | No — Slack/Discord/ChatGPT all show only "(edited)". Count is information overload for MVP. |
| Q4 | Hover tooltip on "(edited)" — show timestamp of latest edit? | Yes (already in §3.5). Cheap UX win. |
| Q5 | Should edits to the **first** user message of a session retitle the session? | No. Out of scope; titles regen is its own pipeline. |
| Q6 | Does editing trigger any AIE module recompute (user-model signal, mood)? | No. AIE pipelines run on send, not edit. Edits are silent w.r.t. AIE in MVP. (Future PRD: "edit-as-signal" for user-model.) |

---

## 11. Research & Documentation References

- Bug doc: `/Users/chris/Code/waifu-rt3d/docs/bugs/2026-05-06-retry-regenerate-and-message-edit-missing.md`
- Competitor gap analysis: `/Users/chris/Code/waifu-rt3d/docs/research/2026-04-07-competitor-gap-analysis.md` — message edit is in the top-10 gaps.
- Companion (separate) PRDs to coordinate:
  - Retry/Regen Text — needs `chatStore.regenerateAssistant` (this PRD's `onRegenerateAfterEdit` plugs into that).
  - Sibling Browser — uses `sibling_group_id` schema, decoupled from edit's `edited_at`.
  - Visual Content in Chat Phase 2 (`/Users/chris/Code/waifu-rt3d/docs/plans/2026-05-06-visual-content-mvp-execution.md`) — touches the same `DialogueBubble.tsx` action row; coordinate merge order to avoid trivial conflicts.
- Convention guides: `.claude/rules/backend-and-api.md`, `.claude/rules/frontend-and-ui.md`, `.claude/rules/preflight-migrations.md`, `.claude/rules/testing-conventions.md`.
- Schema reference: `backend/preflight.py:5070` (`migrate_to_v72`) — closest structural template.
- Existing edit scaffold: `frontends/sakura/src/components/DialogueBubble.tsx:413-432, 519-543`.
- Existing endpoint: `backend/server.py:6848-6870`.

---

**End of PRD.**
