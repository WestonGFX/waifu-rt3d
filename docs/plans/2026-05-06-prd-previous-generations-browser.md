# PRD: Previous Generations Browser (Sibling Messages / Swipe Alternatives)

**Effort:** 1.5–2d (calibrated AI-assisted) | **Priority:** P1 — top-3 competitive gap from April 7 research
**Status:** Draft
**Depends on:** Retry/Regenerate PRD (`docs/plans/2026-05-06-prd-retry-regenerate.md`) — must land first to establish hover-button + chatStore.regenerateAssistant action surface.
**Coordinates with:** Image-URL persistence PRD + Message-Edit PRD (both also targeting schema **v73**) — bundle the column ALTERs into a single migration if possible.
**Schema:** **v73** (`messages` — adding `sibling_group_id`, `sibling_index`, plus reusing existing `parent_id`/`is_active`)
**Companion bug:** `docs/bugs/2026-05-06-retry-regenerate-and-message-edit-missing.md`
**Closes competitive gap:** `docs/research/2026-04-07-competitor-gap-analysis.md` — "message swipe / regeneration" (top-3)

---

## ⚠ Pre-PRD Reality Check (Critical Context)

**Significant prior work already exists in the codebase that the bug-doc didn't reflect.** This PRD has been re-scoped to acknowledge it. Findings from grounding pass on session 30:

| Layer | What's already shipped | File:line |
|---|---|---|
| Schema | `messages.parent_id` (nullable INT) + `messages.is_active` (default 1) columns exist | `backend/preflight.py:5229` (added in early migration) |
| Backend API | `POST /api/messages/{id}/regenerate` — appends new sibling, marks old `is_active=0` | `backend/server.py:6903–7003` |
| Backend API | `GET /api/messages/{id}/branches` — returns `{branches, active_index, total}` | `backend/server.py:10424–10472` |
| Backend API | `POST /api/messages/{id}/activate` — switches `is_active` flag among siblings | `backend/server.py:10477–10535` |
| Frontend API mirror | `api.regenerateMessage`, `api.getMessageBranches`, `api.activateBranch` already exported | `frontends/sakura/src/lib/api.ts:240–255` |
| Component UI | `DialogueBubble` already renders `◀ N/M ▶` pager + RefreshCw button on hover | `frontends/sakura/src/components/DialogueBubble.tsx:769–812` |
| View wiring | `views/ChatThread.tsx:476–520` — `handleRegenerate` + `handleBranchSwitch` are wired | `frontends/sakura/src/views/ChatThread.tsx:473–520` |

**What this PRD actually delivers** is therefore **NOT** the green-field schema option (1) from the bug doc — that ship has sailed via a parent-pointer (option 2) implementation. Instead, this PRD:

1. **Hardens** the existing parent-pointer model against three known correctness bugs (see §1 Problem & Goals).
2. **Adds defensive `sibling_group_id`** (option 1) **as a denormalized column on top of `parent_id`** to fix the orphan-grouping bug (§3.1) without requiring a destructive backfill of `parent_id`.
3. **Adds `sibling_index`** for stable display order independent of insert order (§3.1).
4. **Wires zero-test surface** — there are currently 0 backend tests for branch endpoints. We add them.
5. **Tightens UX**: pager only appears when `total > 1`, regen spinner state, downstream-context-drift warning, and 10/10 overflow handling.

**The bug-doc-recommended option 1 (`sibling_group_id` + `sibling_index`) is therefore added as a *complement to*, not a *replacement of*, the existing `parent_id` column.** Both columns coexist; group_id is the canonical sibling key going forward, parent_id is preserved for backward compat with the already-shipped endpoints.

---

## 1. Problem & Goals

### Why (for Chris)

When a user regenerates an assistant reply, the existing `parent_id` infrastructure means the OLD generation is preserved as `is_active=0` rather than overwritten — that part works. But three quiet correctness bugs make the pager misbehave today:

1. **Orphan grouping bug.** Most code paths that INSERT assistant messages (`server.py:4417`, `4422`, `4956`, `5031`, `5148`, `5152`) do NOT set `parent_id`. So a fresh assistant reply lives with `parent_id = NULL`. When the user regenerates it for the first time, the regenerate endpoint reads `parent_id = NULL` from the original (line 6927), then INSERTs the new sibling with `parent_id = NULL` (line 6993). The branches query (line 10462) then asks `WHERE parent_id = NULL` → every orphan assistant message in the entire database appears to be a "sibling" of every other. This is silently broken — the front-end pager would show absurd totals if any session had 2+ regenerated messages, but the bug is masked today because `getMessageBranches` is fetched per-message and `is_active=0` filtering hides most of the damage.

2. **Display-order instability.** Today the pager orders siblings by `id ASC` (line 10462). That's the database insert order, which is fine for a single regeneration sequence — but if the user toggles between siblings and a downstream code path inserts something, the IDs interleave with non-sibling rows and the pager labels (1/3, 2/3) drift.

3. **No first-class "regen attempt" semantic.** A sibling at index 2 looks identical to a sibling at index 0 in the table — there's no way to tell "this was the original reply" vs "this was the user's preferred fourth attempt" except by reading `created_at` timestamps. Users who'll later browse memorial content (Bond Phase 5) want this distinction surfaced.

The user-facing pain is real and hits daily: regenerating, comparing variations, picking the best — Character.AI's "swipe" is the #1 retention feature in their funnel. Today's half-shipped state means a user who does this 2+ times in a single session can hit truly weird UI ("seeing the wrong sibling list"), and the team will field the bug report cold without knowing the parent_id orphan story.

The retention impact is significant: **siblings let users explore character "voice variations" without burning context** (vs sending "can you redo that" which pollutes the LLM history with meta-instructions and breaks immersion). It also gives the user a sense of *agency over the character's voice* — "this is the version that felt right" — which deepens the bond beyond what static replies provide.

**Success criteria:**
- Sibling pager (◀ N/M ▶) visible on any assistant message that has ≥ 2 generations.
- ◀ / ▶ feels instant: pager state updates synchronously (optimistic), backend reconciles in < 200ms.
- Activating a sibling correctly threads it into downstream LLM context (i.e. the next user message sees the active sibling, not the original).
- No phantom-grouping: a fresh regenerate on a never-regenerated message produces a clean group of exactly 2 siblings, not "every orphan in the DB".
- Pager doesn't render at all when `total === 1` (no clutter on single-gen messages).
- Pytest coverage for: regenerate, branches, activate, orphan-grouping fix, sibling-context-drift warning.

### How (for the AI implementer)

Three correctness bugs + two missing semantics + zero backend test coverage. Concretely:

1. **Schema migration v73** — add `sibling_group_id TEXT` and `sibling_index INTEGER` columns to `messages` (idempotent ALTER guarded by column-existence check). Backfill: for every existing assistant message with non-NULL `parent_id`, generate a UUID, group all messages with the same `parent_id` under one `sibling_group_id`, set `sibling_index` by `id ASC`. For orphans (`parent_id IS NULL`), leave both new columns NULL — they're solo, no group needed.

2. **Backend hardening** — at every assistant-INSERT site that today omits `parent_id`, also leave `sibling_group_id` NULL on first insert. Modify `/api/messages/{id}/regenerate` (`server.py:6903`) to:
   - On first regen of a message with NULL `sibling_group_id`: allocate a fresh UUID, UPDATE the original row with `sibling_group_id=<uuid>, sibling_index=0`, then INSERT the new sibling with the same group_id and `sibling_index=1`.
   - On Nth regen (group already exists): SELECT MAX(sibling_index) for the group, INSERT new sibling at MAX+1.
   - Continue setting `parent_id` for backward compatibility with shipped endpoints, but **do not rely on it for grouping** going forward.

3. **Branches endpoint** (`server.py:10424`) — switch the WHERE clause from `parent_id = ?` to `sibling_group_id = ?` (with fallback to `parent_id` for migrated-but-not-yet-regenerated old data). Order siblings by `sibling_index ASC` for stable pager labels.

4. **Activate endpoint** (`server.py:10477`) — same: switch sibling lookup to use `sibling_group_id`. Confirm it sets `is_active=0` on every sibling in the group except the activated one.

5. **Frontend** — minimal touch. The pager UI is already shipped; we just need to:
   - Render pager only when `total > 1` (guard already exists at `DialogueBubble.tsx:769`, verify it).
   - Add downstream-drift warning toast when activating a non-tail sibling with later messages in the session (new logic in `ChatThread.tsx:handleBranchSwitch`).
   - Cap pager display at 10/10 with overflow tooltip "+N more" (currently no cap).

### Goals

| Goal | How measured |
|---|---|
| Fix orphan-grouping bug | New pytest: regenerate twice on two unrelated orphan messages, assert each group has 2 members, NOT 4 |
| Stable sibling order | Pytest: regenerate 5 times, interleave session inserts, assert `sibling_index` 0-4 contiguous and pager order matches |
| First-class "original" semantic | `sibling_index = 0` always points to the original reply; never reassigned |
| Zero pager clutter | Pager hidden when `total === 1` (verified in DialogueBubble vitest) |
| Downstream context warning | Activating sibling that has messages after it in the session shows a 1-line toast: "Switching this reply will diverge from later messages." |
| Test coverage | Pytest: 6 new cases (orphan, multi-regen, activate, drift, edge-empty, 10+ overflow). Vitest: 3 new cases (pager hidden when total=1, pager paginates correctly, activation toast fires) |

### Non-goals (explicit, to prevent scope creep)

- **Side-by-side "view all siblings" overlay** — out of scope for v1. Add to v2 backlog.
- **Branch-as-fork** (creating a new session from a sibling) — out of scope, separate PRD if ever wanted.
- **Sibling deletion / re-ordering** — out of scope; siblings are immutable history.
- **Memorial integration** — sibling switches do NOT trigger Bond memorial scenes. Out of scope.
- **Backfilling `parent_id` for orphan messages** — not done. Orphans stay orphans (group of 1), no data migration risk.
- **Removing `parent_id`** — keep it for shipped-endpoint backward compat. Both columns coexist.
- **Touching the user-message side** — siblings only apply to assistant messages. User messages are immutable.
- **Per-sibling images** — if a regenerated reply has a different `image_url`, that's the image-url-persistence PRD's problem, not ours. (Coordinate v73.)

---

## 2. User Stories

### US-1: Quick variation hunt (core flow)
> Sara is chatting with Aiko about her bad day. Aiko's first reply is OK but feels a bit clinical. Sara hovers over the bubble, clicks the regenerate icon (RefreshCw), and gets a warmer second variation. The bubble now shows "◀ 1/2 ▶" near the timestamp. She clicks ◀ to compare the original — yeah, the new one's better. She clicks ▶ to flip back to the warmer version, sends her next message. Aiko replies in continuity with the warmer version, not the clinical original. Sara never had to type "can you redo that" or break the fourth wall.

### US-2: Voice exploration (power user)
> Mike wants to find Aiko's "right" register for an emotional scene. He regenerates 6 times in a row, getting 6 variations of the same reply. The pager shows "◀ 6/6 ▶". He clicks ◀ four times to land back on variation 2, which felt the most in-character. He continues from there. The other 4 variations are not lost — if he ever wants to revisit, they're still in the group. **Note:** No memorial trigger — siblings are casual, not narrative milestones.

### US-3: Late switch with downstream cost (warning case)
> Lana regenerated Aiko's reply 3 turns ago and picked the active sibling, then sent two more user messages and got two more replies. Now she goes back and clicks ◀ on that older bubble to switch to a different sibling. A small toast appears: *"Switching this reply will diverge from later messages — they'll stay, but the next reply you send may feel inconsistent."* She accepts. The active sibling switches; the downstream messages stay visible (they were generated against the old branch, but that's history now). Her next user message is sent with the new active sibling in context — Aiko picks up from the new branch.

---

## 3. Feature Breakdown

### 3.1 Schema migration v73 (sibling_group_id + sibling_index)

**Why:** Today's `parent_id` model breaks for orphan messages (`parent_id IS NULL` matches every other orphan) and gives unstable pager labels (insert-id order, not regen-attempt order). Adding two columns + a UUID-keyed group fixes both without breaking shipped endpoints.

**How:**

File: `backend/preflight.py` — append after `migrate_to_v72` (line 5070), before `ensure_db()` (line 5164).

```python
def migrate_to_v73(con: sqlite3.Connection) -> bool:
    """Migrate schema from v72 to v73.

    Adds sibling_group_id (TEXT UUID) and sibling_index (INTEGER) to
    messages, replacing parent_id as the canonical sibling key.

    Backfill: every existing assistant message with non-NULL parent_id is
    assigned a deterministic UUID per parent_id group, with sibling_index
    by id ASC. Orphans (parent_id IS NULL) get NULL on both new columns.

    Coordinates with: image_url persistence + edit_history (also v73).
    If those PRDs ship in the same migration, ALL their ALTERs go in this
    function in declared order. See §5 File Plan for the bundled column list.
    """
    cur_ver = get_schema_version(con)
    if cur_ver >= 73:
        logger.info("Schema already at v%d, skipping v73 migration.", cur_ver)
        return True

    try:
        # Idempotent ALTERs (use _column_exists helper if present, else IF NOT EXISTS pragma trick)
        if not _column_exists(con, "messages", "sibling_group_id"):
            con.execute("ALTER TABLE messages ADD COLUMN sibling_group_id TEXT")
        if not _column_exists(con, "messages", "sibling_index"):
            con.execute("ALTER TABLE messages ADD COLUMN sibling_index INTEGER")

        # Backfill: every distinct parent_id gets a UUID; siblings ordered by id ASC
        parent_ids = con.execute(
            "SELECT DISTINCT parent_id FROM messages "
            "WHERE parent_id IS NOT NULL AND sibling_group_id IS NULL"
        ).fetchall()

        for (pid,) in parent_ids:
            group_id = str(uuid.uuid4())
            siblings = con.execute(
                "SELECT id FROM messages WHERE parent_id = ? ORDER BY id ASC",
                (pid,),
            ).fetchall()
            for idx, (mid,) in enumerate(siblings):
                con.execute(
                    "UPDATE messages SET sibling_group_id = ?, sibling_index = ? "
                    "WHERE id = ?",
                    (group_id, idx, mid),
                )

        # Index for fast group lookup (canonical sibling read path)
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_sibling_group "
            "ON messages(sibling_group_id) WHERE sibling_group_id IS NOT NULL"
        )

        con.execute(
            "INSERT INTO schema_version (version, applied_ts) "
            "VALUES (73, strftime('%s','now'))"
        )
        con.commit()
        logger.info(
            "✅ Schema v73 migration complete (sibling_group_id + sibling_index "
            "added; backfilled %d parent groups)", len(parent_ids)
        )
        return True
    except Exception as e:
        logger.error("Schema v73 migration failed: %s", e)
        con.rollback()
        raise
```

Also bump `LATEST_SCHEMA_VERSION` constant at top of file. Add `migrate_to_v73` to the chain in `ensure_db`.

**Coordination with sibling v73 PRDs:** if image-url persistence and message-edit are shipping the same week, fold their ALTERs into the same `migrate_to_v73` function in the order: sibling cols → image_url col → edited_at + edit_history cols. One v73, three concerns. Each guarded by `_column_exists` so re-running is safe. (If they ship later, they get v74 / v75; nothing breaks.)

### 3.2 Hardened regenerate endpoint

**Why:** Today's regenerate (server.py:6903) inserts new siblings with the same `parent_id` as the original — but if the original is an orphan (`parent_id=NULL`), the "group" is "every orphan in the database". Switch the canonical key to `sibling_group_id`, allocate fresh on first regen.

**How:**

File: `backend/server.py:6903–7003`. Modify in place (this is an existing endpoint — additive only, no signature change).

Pseudocode patch:

```python
# After line 6927 (session_id, role, parent_id = row):
# NEW: read sibling_group_id, allocate if missing
cur.execute(
    "SELECT sibling_group_id, sibling_index FROM messages WHERE id=?",
    (message_id,)
)
group_row = cur.fetchone()
group_id, _orig_idx = group_row if group_row else (None, None)

if group_id is None:
    # First regen on this message — allocate fresh group, retrofit the original.
    group_id = str(uuid.uuid4())
    cur.execute(
        "UPDATE messages SET sibling_group_id=?, sibling_index=0 WHERE id=?",
        (group_id, message_id)
    )
    next_idx = 1
else:
    # Subsequent regen — extend the group.
    cur.execute(
        "SELECT COALESCE(MAX(sibling_index), -1) + 1 FROM messages "
        "WHERE sibling_group_id=?",
        (group_id,)
    )
    next_idx = cur.fetchone()[0]

# ... existing LLM call ...

# Modified INSERT (line 6991) — now includes sibling_group_id + sibling_index:
cur.execute(
    "INSERT INTO messages(session_id, role, text, parent_id, is_active, "
    "emotion, char_id, sibling_group_id, sibling_index) "
    "VALUES (?,?,?,?,1,?,?,?,?)",
    (session_id, "assistant", clean_reply, parent_id, emotion, char_id,
     group_id, next_idx)
)
```

Note: `parent_id` is still set for backward compat. If `parent_id` was NULL on the original (orphan), the new sibling also gets NULL `parent_id` — but the group is now joined by `sibling_group_id`, so the orphan-collision bug is gone.

### 3.3 Branches + activate endpoint switch to group_id

**Why:** Once group_id exists, the branches lookup must use it (not `parent_id`) to avoid orphan collisions, and must order by `sibling_index` (not `id`) for stable pager labels.

**How:**

File: `backend/server.py:10424–10472` (`get_message_branches`):

- Modify SELECT (line 10462) from `WHERE parent_id = ?` to `WHERE sibling_group_id = ?`.
- ORDER BY `sibling_index ASC` (not `id ASC`).
- For the no-group case (line 10449: `parent_id is None`), also check `sibling_group_id IS NULL` — return the single-message branch list as today.

File: `backend/server.py:10477–10535` (`activate_branch`):

- Same swap: use `sibling_group_id` not `parent_id` for sibling lookup (line 10516).
- Returns shape unchanged: `{"ok": True, "message_id": int, "deactivated": list[int]}`.

### 3.4 New endpoint: GET /api/messages/{id}/siblings (v73 canonical)

**Why:** The bug-doc spec called for a `/siblings` endpoint distinct from `/branches`. We don't need a NEW endpoint — `/branches` already does this — but we DO want the response shape to include `sibling_group_id`, `sibling_index`, and `is_original` so the frontend can render "original" vs "regen #N" labels in v2 if/when we add a side-by-side overlay.

**How:**

File: `backend/server.py:10424–10472`. Extend existing response from:
```json
{"branches": [{"id", "text", "emotion", "created_at", "is_active"}], "active_index": int, "total": int}
```
to:
```json
{
  "branches": [{"id", "text", "emotion", "created_at", "is_active", "sibling_index", "is_original"}],
  "active_index": int,
  "total": int,
  "sibling_group_id": str | null
}
```
where `is_original = (sibling_index == 0)`. Backward compat: existing `branches` consumers (DialogueBubble) ignore the extra fields.

### 3.5 Downstream-drift warning (frontend)

**Why:** When the user activates a sibling that has subsequent messages after it in the session, those subsequent messages were generated in response to the OLD active sibling. The user should be warned that switching may cause inconsistency on the next reply.

**How:**

File: `frontends/sakura/src/views/ChatThread.tsx:503` (`handleBranchSwitch`).

Before calling `useChatStore.setState({ messages: updated })`, check if the switched message is the LAST assistant message in `currentMsgs`. If not (i.e. there are messages after it), fire a single-line toast:

```typescript
import { useToast } from '../hooks/useToast'; // or whatever the existing toast hook is

// Inside handleBranchSwitch, before setState:
const switchedIdx = currentMsgs.findIndex(m => m.serverMessageId === newMsgId);
const hasDownstream = switchedIdx >= 0 && switchedIdx < currentMsgs.length - 1;
if (hasDownstream) {
  toast({
    title: "Switched a past reply",
    description: "Later messages stay visible, but Aiko may diverge in her next response.",
    variant: "info",
    duration: 4000,
  });
}
```

Verify the toast hook exists by grepping the codebase first (`grep -rn "useToast\|toast(" frontends/sakura/src --include="*.tsx" | head -5`); if not, fall back to a simple inline element styled with `var(--color-warning)`. Do NOT add a new toast library.

### 3.6 Pager polish (overflow + zero-state)

**Why:** UI hygiene. Today the pager renders on every assistant message even when `total=1` (verify on read), and a power user with 10+ regens has no upper-bound display.

**How:**

File: `frontends/sakura/src/components/DialogueBubble.tsx:769`.

- **Zero-state:** Verify the existing guard `branchTotal > 1 || isLastAssistant` (line 769). Strip `|| isLastAssistant` — pager should be hidden, NOT shown, on never-regenerated last assistant messages. The regenerate button itself (line 800) is the affordance for "you can regen this"; the pager is the affordance for "you HAVE regen'd this." (Confirm with Chris before stripping — small UX call.)

- **Overflow:** Cap visible count at 10/10. If `total > 10`, render `1/10+` and the right-arrow's title attr becomes `"More versions exist (only first 10 shown)"`. Keep `branchIds` array full — clicking ▶ at position 10 advances normally, just the label clamps. Consider this v1 MVP; a "see all" button is v2 territory.

### 3.7 Backend test coverage (zero today)

**Why:** Current backend tests have ZERO coverage of `/regenerate`, `/branches`, `/activate`. We're hardening these endpoints and adding a migration; without tests, the next session that touches `messages` can silently regress.

**How:**

New file: `backend/tests/test_message_siblings.py`. 6 cases:

1. `test_first_regen_allocates_group` — assistant message with NULL group_id, regenerate once, assert group_id is non-NULL UUID, original has `sibling_index=0`, new has `sibling_index=1`, both share group.
2. `test_multi_regen_extends_group` — regenerate 4 times, assert group has 5 members with sibling_index 0-4 contiguous.
3. `test_orphan_messages_dont_collide` — two unrelated assistant messages (both `parent_id=NULL` initially), regen each once. Assert each group has exactly 2 members, NOT 4. (This is the bug we're fixing.)
4. `test_branches_returns_group_ordered_by_sibling_index` — regen 3 times, assert `branches` response is ordered by sibling_index ASC, not id ASC.
5. `test_activate_switches_is_active_within_group_only` — two unrelated regen groups, activate sibling in group A, assert group B is untouched.
6. `test_v73_migration_backfills_existing_groups` — set up a v72 DB with parent_id-grouped messages, run migrate_to_v73, assert every group has consistent group_id and sibling_index 0..N-1.

### 3.8 Frontend test coverage

**Why:** Same — DialogueBubble has growing complexity around branch state. Pattern 4 (Framer Motion stub) + Pattern 2 (api mock) apply.

**How:**

New file: `frontends/sakura/src/test/dialogueBubble.siblings.test.tsx`. 3 cases:

1. `pager_hidden_when_total_is_1` — render bubble, mock `api.getMessageBranches` → `{total: 1}`, assert pager not in DOM.
2. `pager_renders_and_paginates_when_total_gt_1` — mock → `{total: 3, active_index: 0}`, click ▶, assert `api.activateBranch` called with branch[1].id, pager updates to "2/3".
3. `pager_caps_at_10_with_overflow_label` — mock → `{total: 15, active_index: 0}`, assert label reads "1/10+" and ▶ title attr contains "10 shown".

For the drift-warning toast (§3.5), add a 4th case in a new file `frontends/sakura/src/test/chatThread.siblingDrift.test.tsx` per testing-conventions.md naming pattern.

---

## 4. UI Layout

```
┌─ Single-gen assistant bubble (no pager — total=1) ────────────────┐
│  ┌─ Aiko avatar ─┐  Hey, that sounds rough. I'm sorry your day    │
│  │   [portrait]  │  went sideways. Want to talk about it, or just │
│  └───────────────┘  vent for a bit?                                │
│                     2:34 PM                          [↻] [⎘] [✕] │  ← hover row: regen, copy, delete
└────────────────────────────────────────────────────────────────────┘

┌─ Multi-gen bubble (siblings exist — pager visible) ───────────────┐
│  ┌─ Aiko avatar ─┐  Oh no, that really does sound exhausting.     │
│  │   [portrait]  │  Come here — let me just listen. No fixing,    │
│  └───────────────┘  no advice unless you want it. Just here.       │
│                     2:34 PM   ◀  2/3  ▶            [↻] [⎘] [✕]   │  ← pager left of action row
└────────────────────────────────────────────────────────────────────┘

┌─ Mid-regenerate (spinner replaces ↻) ─────────────────────────────┐
│  ┌─ Aiko avatar ─┐  Oh no, that really does sound exhausting.     │
│  │   [portrait]  │  Come here — let me just listen. No fixing,    │
│  └───────────────┘  no advice unless you want it. Just here.       │
│                     2:34 PM   ◀  2/3  ▶          [⟳ spin] [⎘] [✕]│  ← regen button shows spinner
└────────────────────────────────────────────────────────────────────┘

┌─ After ◀ click — content swaps with subtle fade ──────────────────┐
│  ┌─ Aiko avatar ─┐  Hey. Bad day, huh? Hit me with it. (fading    │
│  │   [portrait]  │  in over 200ms — Framer Motion opacity 0→1)    │
│  └───────────────┘                                                  │
│                     2:31 PM   ◀  1/3  ▶            [↻] [⎘] [✕]   │  ← pager updates synchronously
└────────────────────────────────────────────────────────────────────┘

┌─ Drift warning toast (after activating non-tail sibling) ─────────┐
│                                                                    │
│   ┌──────────────────────────────────────────────┐                │
│   │  ⓘ  Switched a past reply                     │                │
│   │     Later messages stay visible, but Aiko    │                │
│   │     may diverge in her next response.         │                │
│   └──────────────────────────────────────────────┘                │
│   (auto-dismiss 4s; var(--color-warning) accent)                   │
└────────────────────────────────────────────────────────────────────┘

┌─ Overflow case (10+ regens) ──────────────────────────────────────┐
│                     2:34 PM   ◀  1/10+  ▶          [↻] [⎘] [✕]   │
│                                       ↑                            │
│                          title="More versions exist               │
│                          (only first 10 shown)"                   │
└────────────────────────────────────────────────────────────────────┘
```

ASCII represents the desktop chat surface in `views/ChatThread.tsx`. The pager + button row is part of `DialogueBubble.tsx:769–812`. Pager uses `var(--color-text-tertiary)` for icons, `var(--color-text-muted)` for the "N/M" label — already shipped, just verifying it's theme-clean across all 18 themes.

---

## 5. File Plan

### New Files

| File | Purpose | Lines (est.) |
|---|---|---|
| `backend/tests/test_message_siblings.py` | 6 pytest cases for sibling group correctness + migration backfill | ~250 |
| `frontends/sakura/src/test/dialogueBubble.siblings.test.tsx` | 3 vitest cases for pager rendering/pagination/overflow | ~140 |
| `frontends/sakura/src/test/chatThread.siblingDrift.test.tsx` | 1 vitest case for downstream-drift warning toast | ~80 |

### Modified Files

| File | Change | Lines touched (est.) |
|---|---|---|
| `backend/preflight.py` | Append `migrate_to_v73`; bump `LATEST_SCHEMA_VERSION` to 73; add to `ensure_db` chain | ~70 |
| `backend/server.py` (line 6903–7003) | Allocate `sibling_group_id` on first regen, extend on Nth; INSERT new col values | ~30 |
| `backend/server.py` (line 10424–10472) | Switch branches lookup to `sibling_group_id`, ORDER BY `sibling_index`, add new fields to response | ~20 |
| `backend/server.py` (line 10477–10535) | Switch activate lookup to `sibling_group_id` | ~10 |
| `frontends/sakura/src/lib/api.ts:240–255` | Update `getMessageBranches` return type to include `sibling_index`, `is_original`, `sibling_group_id` (Pydantic↔TS drift — do NOT skip) | ~15 |
| `frontends/sakura/src/components/DialogueBubble.tsx:769–812` | Strip `\|\| isLastAssistant` from pager guard; add overflow label cap at 10/10 | ~15 |
| `frontends/sakura/src/views/ChatThread.tsx:503–520` | Add downstream-drift detection + toast in `handleBranchSwitch` | ~20 |

### Existing Code to Reuse

| File:line | What to reuse | Why |
|---|---|---|
| `backend/server.py:6903–7003` | `regenerate_message` endpoint scaffolding (LLM call, prompt building, vector_store.add_memory) | Already correct apart from group_id allocation — surgical patch only |
| `backend/server.py:10424–10472` | `get_message_branches` response shape | Extend, don't replace |
| `backend/server.py:10477–10535` | `activate_branch` deactivation loop | Logic is correct; just swap the WHERE clause source |
| `backend/preflight.py:5070–5161` (`migrate_to_v72`) | Idempotency pattern + try/except/rollback structure | Copy-paste skeleton for v73 |
| `frontends/sakura/src/components/DialogueBubble.tsx:328–366` (branch state hooks) | `branchTotal`, `branchIndex`, `branchIds`, `handleBranchNav` — already implemented | No changes needed for core flow |
| `frontends/sakura/src/components/DialogueBubble.tsx:769–812` (pager JSX) | ChevronLeft / ChevronRight rendering, RefreshCw spinner state | Polish only — overflow + guard tweak |
| `frontends/sakura/src/views/ChatThread.tsx:476–520` (handleRegenerate, handleBranchSwitch) | Already wired to `api.regenerateMessage` and `useChatStore.setState` | Add drift detection only |
| `frontends/sakura/src/lib/api.ts:240–255` | `getMessageBranches`, `regenerateMessage`, `activateBranch` wrappers | Already exist — extend return types |
| `frontends/sakura/src/test/setup.ts` + 7 test patterns from `.claude/rules/testing-conventions.md` | Pattern 2 (API mock) + Pattern 4 (Framer Motion stub) | Required scaffolding for new vitest files |

---

## 6. Implementation Order

### Phase 1 — Schema migration (~2h calibrated)

- [ ] Append `migrate_to_v73` to `backend/preflight.py`.
- [ ] Bump `LATEST_SCHEMA_VERSION` constant.
- [ ] Add to `ensure_db` chain (after v72 call).
- [ ] Run `.venv/bin/python -m pytest backend/tests/test_preflight.py -q` — must stay green.
- [ ] Run `.venv/bin/python -c "import backend.preflight"` — clean import.
- [ ] On a copy of `app.db`, manually run preflight and confirm: schema_version → 73, both new columns present, existing parent_id-grouped messages got a group_id, orphans are NULL.

**Phase gate:** Both pytest test_preflight + manual smoke pass. Do NOT proceed to Phase 2 until DB confirmed clean.

### Phase 2 — Backend hardening (~3h)

- [ ] Patch `regenerate_message` (server.py:6903) — allocate group on first regen, extend on Nth.
- [ ] Patch `get_message_branches` (server.py:10424) — switch to group_id, ORDER BY sibling_index, add response fields.
- [ ] Patch `activate_branch` (server.py:10477) — switch to group_id.
- [ ] Write `backend/tests/test_message_siblings.py` (6 cases per §3.7).
- [ ] Run `.venv/bin/python -m pytest backend/tests/test_message_siblings.py backend/tests/test_preflight.py -q` — must pass.
- [ ] Run full backend suite `.venv/bin/python -m pytest backend/tests/ -q --tb=line` — confirm no regression in 2,703 existing tests.

**Phase gate:** All 6 new + all 2,703 existing backend tests green.

### Phase 3 — Frontend wiring (~2h)

- [ ] Extend `getMessageBranches` return type in `frontends/sakura/src/lib/api.ts:240` to include new fields. (Pydantic↔TS drift area — verify TSC clean.)
- [ ] Strip `|| isLastAssistant` guard in DialogueBubble.tsx:769 (pending Chris confirmation — this is a small UX call).
- [ ] Add overflow cap label "1/10+" with title attr in DialogueBubble.tsx:786.
- [ ] Add downstream-drift toast in `views/ChatThread.tsx:handleBranchSwitch` (§3.5).
- [ ] Run `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` — clean.

**Phase gate:** TSC clean.

### Phase 4 — Frontend test coverage (~2h)

- [ ] Write `dialogueBubble.siblings.test.tsx` (3 cases — §3.8).
- [ ] Write `chatThread.siblingDrift.test.tsx` (1 case — drift warning).
- [ ] Run `cd frontends/sakura && npx vitest run` — all 201 + 4 new pass.

**Phase gate:** Vitest clean (205 total).

### Phase 5 — Smoke + commit (~1h)

- [ ] Run full smoke: `.venv/bin/python -m pytest backend/tests/ -q --tb=line` AND `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`. Both must be clean.
- [ ] Manual browser exercise (per CLAUDE.md UI verification): open chat, send 2 messages, regenerate the latter 3x, verify pager 1/4 → 4/4, click ◀ to back to 1/4, send another message, confirm next reply uses sibling 1's text as context (check via context-viewer overlay or backend logs).
- [ ] Commit with message:
  ```
  feat(sibling-browser): harden parent-pointer model with group_id (v73)

  Closes top-3 competitive gap from Apr 7 research. Fixes orphan-grouping
  bug (parent_id=NULL collisions) by adding sibling_group_id UUID +
  sibling_index. Pager UI was already shipped — this PRD makes it
  correct. Adds 6 backend tests + 4 frontend tests (zero coverage today).

  Schema v73 (coordinates with image-url + edit-history PRDs if bundled).
  ```
- [ ] Run `/checkpoint` to update CURRENT_STATUS.md (schema badge v72 → v73, new test counts).

**Total: ~10h (1.5d) calibrated AI-assisted.** Adds ~25–30% buffer for the v73 coordination dance with image-url / edit-history PRDs if all three land same week.

---

## 7. Edge Cases & Risks

| Risk | Mitigation |
|---|---|
| **Orphan-grouping bug** (parent_id=NULL collides every orphan) | Switch canonical sibling key to `sibling_group_id`; allocate fresh UUID on first regen. Backfill migration. Pytest case 3. |
| **First-regen retrofit race** — two near-simultaneous regen requests on same orphan original | Wrap the "SELECT group_id; if NULL allocate; UPDATE original" in a single transaction (`with conn:`). SQLite WAL mode + db_pool serializes writes. Acceptable for single-user desktop app. |
| **v73 collision** with image-url-persistence + edit-history PRDs | If all three land in the same migration: declare column ALTERs in fixed order in one `migrate_to_v73`. If any ship later, they get v74 / v75 — no conflict. |
| **Sibling_index gap** if two regens fire concurrently | Concurrent INSERTs at same `MAX(sibling_index)+1` would create duplicate indices. Mitigation: single-user app + serialized SQLite writes. Add `UNIQUE(sibling_group_id, sibling_index)` index in v74 if it ever bites multi-user (not now). |
| **Activating mid-conversation invalidates downstream** | Don't delete; warn via toast (§3.5). Downstream messages stay visible; flag context drift to user. Memorial system not triggered (out of scope, §1 non-goals). |
| **10+ regens per group** | Pager label clamps at "1/10+", branches list still complete in DB. v2 side-by-side overlay handles browse-all. |
| **Loading session history** | `loadHistory` already filters by `is_active=1` (`server.py:6826` for the `getMessages` endpoint reads `is_active`). Confirm sibling pager lazy-loads via `getMessageBranches` per-message on mount (DialogueBubble.tsx:346–350) — already correct, no change. |
| **Memory snapshots and active sibling** | Today, `vector_store.add_memory` fires on EVERY regenerated message (server.py:6999), including non-active ones. **Recommendation:** only add memory on the active sibling. Patch line 6999 to defer memory until activate (or skip add for any sibling beyond index 0). Out of scope for v1 if Chris says "ship the pager fix first" — but flag it in commit message. |
| **Pydantic ↔ TypeScript type drift** (Known Sensitive Area per CLAUDE.md) | Update `api.ts:240` return type in same commit as backend response shape change. Run TSC. Add explicit test that the new fields are accessed in the bubble — fails loudly if backend drops them. |
| **Test mock drift in context providers** (Known Sensitive Area) | Pattern 4 (Framer Motion stub) covers the bubble test. The drift-warning test mounts ChatThread which pulls `useChatStore` + `useToast`; mock both via `vi.mock`. Don't expand context provider surface. |
| **Dark/light theme verification** (Known Sensitive Area) | Pager uses `var(--color-text-tertiary)` and `var(--color-warning)` for the toast — both already theme-clean. Visual smoke on at least 1 dark + 1 light theme before commit. |
| **`isLastAssistant` guard removal regret** | Small UX risk — removing it hides pager on never-regenerated tail messages. The regen button (RefreshCw) is still visible as the affordance. Confirm with Chris via AskUserQuestion before stripping; if uncertain, keep the guard and let v2 strip it once the new flow is settled. |

---

## 8. Verification

### Automated tests

**Backend (pytest):**
- `backend/tests/test_message_siblings.py` — 6 new cases (§3.7).
- `backend/tests/test_preflight.py` — must stay green; v73 migration adds zero failures.
- Full suite: `.venv/bin/python -m pytest backend/tests/ -q --tb=line` — assert 2,703 → 2,709 passing.

**Frontend (vitest):**
- `frontends/sakura/src/test/dialogueBubble.siblings.test.tsx` — 3 cases (§3.8).
- `frontends/sakura/src/test/chatThread.siblingDrift.test.tsx` — 1 case.
- Full suite: `cd frontends/sakura && npx vitest run` — assert 201 → 205 passing.

**TSC:**
- `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` — clean. Specifically watch for errors on `api.ts` return-type extension flowing into `DialogueBubble.tsx` consumers.

### Manual checklist (Chris desktop, after Phase 5 commit)

- [ ] Open chat, send "hey", get reply. Hover reply — see RefreshCw button. Pager NOT visible (total=1). ✅
- [ ] Click RefreshCw. New reply replaces in place. Pager appears: "◀ 1/2 ▶". ✅
- [ ] Click RefreshCw again. Pager: "◀ 1/3 ▶" (active is the newest, but per current `regenerate_message` logic it's the one just inserted — confirm pager shows 3/3, not 1/3, after each regen — TBD verification).
- [ ] Click ◀ to walk back to first generation. Bubble content swaps. Pager: "◀ 1/3 ▶".
- [ ] Send another user message. Reply continues from sibling-1 context, not sibling-3. (Verify via context-viewer overlay Ctrl+K.)
- [ ] Go back, click ▶ on the older bubble. Toast appears: "Switched a past reply — Later messages stay visible, but Aiko may diverge…" Toast auto-dismisses after 4s. Downstream messages remain visible. ✅
- [ ] Regenerate 11 times. Pager shows "◀ 11/10+ ▶" with overflow tooltip. Click ▶ at 10 advances normally. ✅
- [ ] Switch theme to "Cherry Blossom Dark". Pager + toast both readable, no hardcoded colors leaking. ✅
- [ ] Reload session (close tab, reopen). Pager re-fetches per-message; only the active sibling's content shows by default. ✅
- [ ] On a fresh chat with a fresh character, regenerate twice. Verify in DB (`sqlite3 backend/storage/app.db "SELECT id, sibling_group_id, sibling_index, is_active FROM messages ORDER BY id DESC LIMIT 5"`) that group_id is a single UUID, sibling_index is 0,1,2 contiguous, exactly one row has is_active=1. ✅

### Verification per CLAUDE.md "Verification Before Claiming Success"

| Work type | Required verification | This PRD's evidence |
|---|---|---|
| DB migration | Run `preflight.py` + verify `schema_version` bumped + `pytest test_preflight.py` passes | Phase 1 gate |
| API endpoint | `curl` with realistic payload; confirm status code AND response shape | Manual: `curl http://localhost:8080/api/messages/42/branches` post-regen, expect 200 + new field shape |
| UI feature | Open in browser and exercise the golden path | Manual checklist above |
| Tests pass | Actually run them, paste tail of output | Phases 2 + 4 gates |

---

## 9. Open Questions for Chris

1. **`isLastAssistant` guard removal** (§3.6) — strip it to hide pager on never-regenerated tail messages, or keep it for visual continuity? Recommendation: strip; the regen button is the affordance for "you can regen". Use `AskUserQuestion` if uncertain.

2. **Memory write on non-active siblings** (§7 risk row) — today every regenerated reply hits `vector_store.add_memory`. Recommendation: only on activation, or only on `sibling_index=0`. Out of scope for v1 unless Chris says "fix it now."

3. **v73 bundling** — is this PRD shipping standalone (becomes v73), or coordinating with image-url-persistence + edit-history (combined v73)? Affects migration code structure, not effort.

4. **Side-by-side overlay** — confirmed v2 (out of scope here)? The `is_original` + `sibling_index` fields in §3.4 are the foundation; v2 would add a new overlay component.

5. **Toast library** — does a toast hook (`useToast`) already exist in Sakura, or do we need to inline the warning? Grep first; do NOT add a dependency.

---

## 10. Research & Documentation References

- **Companion bug doc:** `docs/bugs/2026-05-06-retry-regenerate-and-message-edit-missing.md` — proposed three schema options; this PRD adopts a hybrid (option 2 already shipped + option 1 added on top).
- **Competitive gap analysis:** `docs/research/2026-04-07-competitor-gap-analysis.md` — "message swipe / regeneration" flagged as top-3 retention gap.
- **Predecessor PRD:** `docs/plans/2026-05-06-prd-retry-regenerate.md` — establishes hover-button + regenerate action.
- **Sibling v73 PRDs:**
  - Image-url persistence PRD (TBD path) — `messages.image_url` column.
  - Message-edit PRD (TBD path) — `messages.edited_at` + `messages.edit_history JSON`.
  - Coordinate ALTER ordering in `migrate_to_v73`.
- **Memorial system** (out of scope but referenced): Bond Phase 5 memorial scenes — sibling switches do NOT trigger memorials.
- **Convention guides:**
  - `.claude/rules/preflight-migrations.md` — migration chain rules (append-only, sequential, idempotent).
  - `.claude/rules/backend-and-api.md` — server.py append-only, db_pool usage, FastAPI patterns.
  - `.claude/rules/frontend-and-ui.md` — Zustand store ceiling (4 stores, do NOT add 5th), CSS variable theming, Lucide icons.
  - `.claude/rules/testing-conventions.md` — 7 test patterns; this PRD uses Pattern 2 (API mock) + Pattern 4 (Framer Motion stub).
- **Schema:** v72 today (`backend/preflight.py:5070`); this PRD adds v73.
