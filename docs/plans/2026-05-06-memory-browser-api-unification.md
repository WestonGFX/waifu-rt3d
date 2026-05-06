# Memory Browser API Unification — `updateUserFact` gap + final audit

**Date:** 2026-05-06
**Status:** Approved scope, ready for /go AFTER Ultraplan PR merges
**Effort:** ~1h AI-assisted (scope is narrow — see Audit Findings below)

---

> ⚠ **DO NOT START until the Ultraplan PR merges.** That PR adds `data-testid`
> attributes to MemoryBrowser tabs (`memtab-overview`, `memtab-aboutyou`,
> `memtab-memories`, `memtab-journal`). Starting this refactor before that PR
> merges will produce mechanical merge conflicts in `MemoryBrowser.tsx`.

---

## Audit Findings — Most Work Is Already Done

The MEMORY.md backlog item (item 2, session 17) describes migrating the Memories
tab from raw `fetch()` to typed `api.*` wrappers and collapsing 7 Vitest cases
onto Pattern 2. **Both of those goals were completed in sessions 16–17**, as
confirmed by the test file's own header comment (line 13):

> "Session 18 collapsed the Memories tab onto Pattern 2 after the raw-fetch →
> `api.*` unification."

...except "session 18" is this session — the test file was written in
anticipation of the refactor and already reflects the post-refactor state. The
component code (`MemoryBrowser.tsx`) also already uses `api.listMemories`,
`api.searchMemories`, `api.deleteMemory`, and `api.promoteMemory` exclusively
for the Memories tab. All four wrappers exist in `api.ts` (lines 810–857).
The Vitest suite already uses Pattern 2 for all 7 Memories-tab cases (lines
352–442 of `MemoryBrowser.test.tsx`).

**One genuine gap remains:** the `FactRow` sub-component in `MemoryBrowser.tsx`
(line 542) still uses a raw `fetch()` for inline fact editing:

```typescript
// MemoryBrowser.tsx line 542 — raw fetch, no api.* wrapper
const res = await fetch(`/api/characters/${charId}/user-facts/${fact.id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fact_text: trimmed }),
});
```

The backend endpoint exists (`PATCH /api/characters/{char_id}/user-facts/{fact_id}`,
`server.py` line 11260). There is no `api.updateUserFact()` wrapper in `api.ts`.
No Vitest test covers this edit flow.

This plan's scope is therefore narrower than the backlog item implied: add one
`api.updateUserFact()` wrapper, replace the one raw `fetch()` call in `FactRow`,
and add one Vitest test case to close the coverage gap.

---

## Context

Consistency across the codebase is the primary driver. Every other network call
in `MemoryBrowser.tsx` already goes through the typed `api.*` client — the
`FactRow` inline-edit `fetch()` is the last survivor. Replacing it closes three
gaps at once: typed request/response shapes (the raw call discards the returned
`{ok, fact}` payload entirely), uniform error-throw behavior (the `get/post/del/patch`
helpers all throw `"METHOD /url: STATUS"` which the Memories tab already
leverages for error display), and testability (Pattern 2 cannot mock a bare
`global.fetch` that the api client also uses internally — adding a named wrapper
lets the test inject directly).

Reference: MEMORY.md backlog item 2 (`raw-fetch → api.* unification`) and
`.claude/rules/testing-conventions.md` Pattern 2.

---

## Phase 1 — Add `updateUserFact` to `api.ts`

**File:** `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/lib/api.ts`

Insert immediately after `deleteUserFact` (line 780), before `getMemoryOverview`.

### Type additions (none required)

`UserFact` is already defined in `types.ts` (line 149) and imported in `api.ts`.
The backend returns `{"ok": true, "fact": UserFact}` — identical shape to
`createUserFact`. No new types needed.

### New wrapper signature

```typescript
/**
 * Update the text of an existing user fact.
 *
 * Wraps `PATCH /api/characters/{charId}/user-facts/{factId}`.
 * Only `fact_text` is mutable; category, source, and confidence are unchanged.
 *
 * @param charId   - Character primary key (scope guard).
 * @param factId   - User fact primary key.
 * @param factText - New fact text (must be non-empty; server returns 400 otherwise).
 * @returns Updated UserFact wrapped in `{ok: true, fact}`.
 */
updateUserFact: (charId: number, factId: number, factText: string) =>
  patch<{ ok: boolean; fact: UserFact }>(
    `/api/characters/${charId}/user-facts/${factId}`,
    { fact_text: factText }
  ),
```

### Backend contract verification

`PATCH /api/characters/{char_id}/user-facts/{fact_id}` (`server.py` line 11260):
- Request body: `{ "fact_text": string }` (400 if empty/missing)
- Response: `{ "ok": true, "fact": { id, character_id, category, fact_text, confidence, source, created_at } }`
- Errors: 400 (empty text), 404 (fact not found for character)
- The `patch<T>` helper in `api.ts` (line 180) handles the method, Content-Type header, and JSON stringification — matches the raw call exactly.

---

## Phase 2 — Replace raw `fetch()` in `FactRow`

**File:** `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/components/MemoryBrowser.tsx`

Target: `handleSave` function inside the `FactRow` sub-component, lines 533–553.

### Before

```typescript
const handleSave = async () => {
  const trimmed = editText.trim();
  if (!trimmed || trimmed === fact.fact_text) {
    setEditing(false);
    setEditText(fact.fact_text);
    return;
  }
  setSaving(true);
  try {
    const res = await fetch(`/api/characters/${charId}/user-facts/${fact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fact_text: trimmed }),
    });
    if (res.ok) {
      onEdit(fact.id, trimmed);
      setEditing(false);
    }
  } catch { /* non-fatal */ }
  finally { setSaving(false); }
};
```

### After

```typescript
const handleSave = async () => {
  const trimmed = editText.trim();
  if (!trimmed || trimmed === fact.fact_text) {
    setEditing(false);
    setEditText(fact.fact_text);
    return;
  }
  setSaving(true);
  try {
    await api.updateUserFact(charId, fact.id, trimmed);
    onEdit(fact.id, trimmed);
    setEditing(false);
  } catch { /* non-fatal — save silently fails; editor stays open */ }
  finally { setSaving(false); }
};
```

Key differences:
1. `fetch(...)` → `api.updateUserFact(...)` — typed, consistent error shape.
2. `if (res.ok)` guard removed — the `patch<T>` helper throws on non-ok, so the
   `catch` block handles failure; success path always calls `onEdit` + `setEditing`.
3. Import: `api` is already imported in `MemoryBrowser.tsx` (used for all other calls).
   No new import needed.

**UX unchanged:** saving state, edit mode toggle, non-fatal error handling —
all preserved. The `onEdit` callback propagates the new text to the parent's
state list, keeping the in-memory list consistent without a full refetch.

---

## Phase 3 — Add Vitest test for `updateUserFact` flow

**File:** `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/test/MemoryBrowser.test.tsx`

The existing `vi.mock('../lib/api', ...)` block at line 39 must gain
`updateUserFact: vi.fn()`. The `beforeEach` safe-default block at line 109 should
add `vi.mocked(api.updateUserFact).mockResolvedValue({ ok: true, fact: OVERVIEW_FACTS[0] })`.

Add one test inside the `Facts (About You) tab` describe block:

```typescript
it('calls updateUserFact and updates text in-place on save', async () => {
  const updatedFact: UserFact = {
    ...OVERVIEW_FACTS[0],
    fact_text: 'Named Christopher',
  };
  vi.mocked(api.updateUserFact).mockResolvedValueOnce({ ok: true, fact: updatedFact });

  await switchToFactsTab();
  await waitFor(() => expect(screen.getByText('Named Chris')).toBeInTheDocument());

  // Hover-reveal edit button; find by title
  const editButtons = screen.getAllByTitle('Edit this fact');
  fireEvent.click(editButtons[0]);

  const input = screen.getByDisplayValue('Named Chris') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'Named Christopher' } });
  fireEvent.click(screen.getByTitle('Save edit'));

  await waitFor(() =>
    expect(vi.mocked(api.updateUserFact)).toHaveBeenCalledWith(42, 1, 'Named Christopher')
  );
  await waitFor(() =>
    expect(screen.getByText('Named Christopher')).toBeInTheDocument()
  );
});
```

**Note:** If the FactRow edit UI uses different button titles or triggers (keyboard
Enter vs explicit Save button), verify against the actual rendered DOM before
committing. The test should be read after the component is confirmed — adjust
`getByTitle` selectors to match.

**Test count:** The file currently has 7 tests in the Memories tab describe block
(lines 352–442). This plan adds 1 test to the Facts tab describe block (not the
Memories block). The Memories tab count stays at 7; total file count increases by 1.
This is explicitly justified: it closes the only untested network path.

**Pattern 4 (Framer Motion stub):** Already present at lines 30–36. No change needed.
**Pattern 2 (api mock):** Already present at lines 39–50. Add one entry.

---

## Verification Commands

```bash
# 1. TypeScript clean — no new type errors
cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit

# 2. Full MemoryBrowser test suite passes (including new updateUserFact test)
cd frontends/sakura && npx vitest run src/test/MemoryBrowser.test.tsx

# 3. No raw fetch() left in MemoryBrowser (grep must return 0 hits)
grep -n "fetch(" frontends/sakura/src/components/MemoryBrowser.tsx | grep -v "// "
# → expect: 0 hits

# 4. Manual smoke test: open app, Ctrl+M, Facts tab, hover a fact, click edit
#    pencil, change text, save — confirm text updates in-place without page reload
```

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Ultraplan PR merge conflict** | The wait gate at the top. Do not touch `MemoryBrowser.tsx` until the Ultraplan PR (data-testid attributes) is merged. |
| **FactRow edit UI element selectors** | The Vitest test above uses `getByTitle('Edit this fact')` and `getByTitle('Save edit')` — verify these match the actual rendered button titles before committing. Wrong selectors = test passes vacuously. Read lines 555–650 of `MemoryBrowser.tsx` to confirm. |
| **`onEdit` callback shape** | The `patch<T>` helper throws on 4xx/5xx. If the backend returns 404 for a fact the user edited in the same session, the catch block suppresses the error. Acceptable — same behavior as the original `if (!res.ok)` path (silent fail). |
| **`beforeEach` mock default gap** | If `updateUserFact` is not added to the `vi.mock` factory and `beforeEach` defaults, tests that switch to the Facts tab and hover a fact may blow up with "not a function". Add to both locations. |
| **No confirm dialog on edit save** | The existing component has no confirm-dialog for fact editing (only for fact deletion). Nothing to preserve here. |

---

## Critical Files

| Absolute Path | Status | Phase |
|---|---|---|
| `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/lib/api.ts` | MODIFIED | Phase 1 |
| `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/components/MemoryBrowser.tsx` | MODIFIED | Phase 2 |
| `/Users/chris/Code/waifu-rt3d/frontends/sakura/src/test/MemoryBrowser.test.tsx` | MODIFIED | Phase 3 |

No new files. No backend changes. No schema changes.

---

## Reuse Hooks

- **`patch<T>` helper** (`api.ts` line 180) — handles PATCH method, Content-Type
  header, JSON body, and error throwing. The new `updateUserFact` wrapper is a
  one-liner using this helper, identical in shape to `promoteMemory`.
- **`MemoryItem` interface** (`api.ts` line 94) — no changes needed; the v2 memory
  wrappers already use it correctly.
- **Pattern 2 test fixture** — the `vi.mock('../lib/api', ...)` block in
  `MemoryBrowser.test.tsx` is the canonical Pattern 2 shape from
  `.claude/rules/testing-conventions.md`. Extend by adding one entry; do not
  restructure.

---

## Research and Documentation References

- MEMORY.md backlog item 2: "Memory Browser raw-fetch → `api.*` unification" —
  describes the original intent; this plan records what was already completed
  in sessions 16–17 and scopes the remaining gap.
- `.claude/rules/testing-conventions.md` Pattern 2 (Store + API Mock) — canonical
  `vi.mock('../lib/api', ...)` shape used throughout `MemoryBrowser.test.tsx`.
- `MemoryBrowser.test.tsx` header comment (lines 1–19) — documents session
  history and which patterns apply per section.
