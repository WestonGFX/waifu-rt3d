# Session 27 Browser QA Report

**Date:** 2026-05-06
**Tester:** Claude Code (Opus 4.7), Playwright MCP
**Scope:** Targeted regression sweep of just-shipped commits + broader surface
**Build:** master @ `ae82afe` (after WIP ship `1ae41b1`)
**Servers:** Sakura `vite@5175` (HTTP 302) + uvicorn backend `:8080` (HTTP 200)
**Viewport:** 1440 × 900

## Executive summary

| Surface | Result | Confidence |
|---|---|---|
| Memory Browser — Facts tab `api.updateUserFact` (commit `201f465`) | ✅ PASS end-to-end | High — backend persistence verified |
| Memory Browser — Memories list pagination + semantic search | ✅ PASS | High — 151 memories, 13 pages, search returns relevance-ranked results |
| Memory Browser — Overview tab stats | ✅ PASS | High |
| Settings — Thinking-indicator stages mode toggle (commit `1ae41b1`) | ✅ PASS | High — toggle flips state, persists across page reload via localStorage |
| Quick-replies SSE chip rendering (commit `1ae41b1`) | ⏭ NOT TESTED | LLM endpoint at `10.0.0.17:1234` was offline; cannot exercise the chat send path |
| Thinking-stages render during streaming (commit `1ae41b1`) | ⏭ NOT TESTED | Same reason — needs live LLM stream |
| Frontend stability with WIP shipped | ✅ PASS | No regressions; clean error handling on offline LLM (no crash) |

## Bugs filed during this session

| Severity | Title | File |
|---|---|---|
| **P1** | `character_relationships` table accumulates massive row duplication (23,291 dupes for char_id=1, schema lacks UNIQUE on `char_id`) | [`docs/bugs/2026-05-06-character-relationships-duplicate-rows.md`](../bugs/2026-05-06-character-relationships-duplicate-rows.md) |
| P3 | BondPill display format reads as "X out of Y" but actually shows "X earned / Y to next" | [`docs/bugs/2026-05-06-bondpill-xp-overshoots-level-threshold.md`](../bugs/2026-05-06-bondpill-xp-overshoots-level-threshold.md) |

The P1 was surfaced by a DB probe done while investigating the BondPill
display. Both bugs are pre-existing — not caused by any session-26/27
commit. The P1 in particular has been silently corrupting bond state for a
long time (24,508 rows for 11 characters means thousands of "ensure row
exists" calls have run).

## Detailed test trace

### Test 1 — Memory Browser updateUserFact (primary target of `201f465`)

Steps:
1. `Ctrl+M` opens Memory Browser overlay (4 tabs render, no console errors
   from the overlay itself).
2. Active char (Rin) had 0 facts → manually added one via the `Add` form:
   `"QA test fact for updateUserFact wrapper"` → fact appears in the list,
   "1 fact learned" subheading updates.
3. Hover the fact row, click the `Edit this fact` button (Edit3 icon).
   Input becomes autofocused with current text. Button title flips to
   `Save edit`.
4. Select-all + retype: `"EDITED via api.updateUserFact at 14:09 UTC"`.
5. Press Enter (triggers `handleSave` which now calls
   `api.updateUserFact(charId, fact.id, trimmed)` instead of raw `fetch`).
6. Editor closes, fact text in the row updates in place.
7. Backend verification: `curl /api/characters/1/user-facts` returns
   `fact_text: "EDITED via api.updateUserFact at 14:09 UTC"` ← persisted.
8. Cleaned up: deleted the test fact via the trash button → backend confirms
   delete (subsequent `getUserFacts` returns `facts: []`).

Result: ✅ The new wrapper, the FactRow refactor, the `patch<T>` throwing
on error semantics, and the `onEdit` callback all work correctly together.

### Test 2 — Memory Browser Memories tab

Steps:
1. Click `Memories` tab → loads with `api.listMemories(1, 0, 12)` (pattern
   confirmed on the wire — paginated 12-per-page list of 151 memories
   across 13 pages).
2. Type `"cherry blossom"` in the semantic search box → click `Go` → 7
   relevance-ranked results returned via `api.searchMemories(1, "cherry
   blossom", 20)`. Top result is Rin's blossom-themed reply at 13%
   relevance. The just-sent "favorite season" message ranks at 21% (more
   recent + literal match).
3. Promote and Delete buttons render in list mode; Delete-only renders in
   search mode (deliberate UX, not a bug).

Result: ✅ All four wrappers from session 16-17 (`listMemories`,
`searchMemories`, `deleteMemory`, `promoteMemory`) plus the new
`updateUserFact` are now the only surface for this overlay.

### Test 3 — Settings stages-mode toggle (commit `1ae41b1` Feature B)

Steps:
1. Click "Open settings" header button → Settings drawer opens on the
   General tab.
2. Located the `Thinking Indicator Style` field via DOM text-walker —
   confirmed two buttons rendered: `skeleton` (default, accent bg) +
   `stages` (transparent bg).
3. Clicked `stages`. After ~1s React re-render: `skeleton` bg becomes
   `transparent`, `stages` bg becomes `var(--color-accent)`. Color
   contrast/text colors update correctly per the inline-style ternary.
4. Page reload → re-read `localStorage.sakura-app` →
   `state.thinkingIndicatorMode === "stages"`. Persistence works.
5. Reset to skeleton via direct localStorage edit + reload.

Result: ✅ The Settings UI piece of the stages-mode feature works. The
runtime render of stages during a real LLM stream was NOT tested (LLM
offline), but the component code in `DialogueBubble.tsx` reads the same
`thinkingIndicatorMode` from `appStore` and the SSE-derived `stage`
field from `chatStore` — both wired correctly per the diff.

### Test 4 — LLM offline error path

Sent message `"hi rin, what's your favorite season?"`. Composer cleared,
user message rendered, then assistant bubble appeared with the error
string:

> Error: Connection Failed: HTTPConnectionPool(host='10.0.0.17', port=1234):
> Max retries exceeded with url: /v1/chat/completions
> (Caused by NewConnectionError("HTTPConnection(host='10.0.0.17', port=1234):
> Failed to establish a new connection: [Errno 61] Connection refused"))

No frontend crash, no orphan typing-indicator state, no zombie message.
Composer becomes editable again. Result: ✅ graceful failure path.

## Skipped tests (LLM offline)

| Test | Why blocked |
|---|---|
| Quick-replies chip render (commit `1ae41b1` Feature A) | Needs full chat-stream cycle producing a `<quick_replies>` block |
| Thinking-stages animation during streaming | Needs `processing` → `generating` SSE event sequence |
| Stuck-gen indicator (Phase 3 future work) | Not yet implemented |
| Image gen end-to-end (Visual Content MVP Phase 1, commit `d34f86f`) | ComfyUI also offline; same root cause |

To unblock these in a future session: bring up `localhost:1234` LM Studio
or switch the active LLM provider in `app.json`, then re-exercise.

## Console error inventory

7 errors at page load — **all pre-existing 404s for portrait images**:

```
GET /files/images/icon.png            → 404
GET /files/images/nana_portrait.png   → 404
GET /files/images/mikazuki_portrait.png → 404
GET /files/images/suzuha_portrait.png → 404
GET /files/images/tsukimi_portrait.png → 404
GET /files/images/shirayuki_portrait.png → 404
GET /files/images/alana_portrait.png  → 404
```

Affected characters render their first-letter circle fallback (e.g.
`S` for Shiori, `M` for Mika) — UI degrades gracefully. Could be closed
by either generating those portraits or by removing the `<img>` element
when `avatar_url` is unset. Not a session-27 regression — these characters
have been portrait-less for some time.

## Coverage gaps for next QA pass

Recommended for the next browser session (preferably with LLM up):

1. **Quick-replies end-to-end** — send a real message, observe SSE events
   (`processing` → `generating` → tokens → `quick_replies` → `done`),
   verify the 3 chips render below the assistant bubble, click a chip and
   verify it fills the composer.
2. **Stages-mode animation** — toggle to stages, send a real message,
   observe the three-row progression (Reading context → Thinking → Generating).
3. **Image gen with character style** — invoke the agent's
   `generate_image` tool via a chat prompt, verify the resolved style
   prefix appears in server logs and the resulting image reflects the
   character's visual style.
4. **Bond progression visual** — watch the BondPill while sending messages
   to a fresh character; confirm whichever bond row the SELECT picks is
   monotonically advancing (or fix the P1 first).
5. **Memory Browser deeper edge cases** — empty state, network failure
   mid-edit, inline cancel via Esc, double-click-to-edit path
   (alternative entry to the click-button path tested today).

## Artifacts

- Bond pill bug screenshot: [`docs/testing/screenshots/2026-05-06-session27-qa/01-bondpill-138-of-12-xp-bug.png`](screenshots/2026-05-06-session27-qa/01-bondpill-138-of-12-xp-bug.png)
- This report: `docs/testing/2026-05-06-session27-browser-qa-report.md`
- Bug 1 (P1 dupes): `docs/bugs/2026-05-06-character-relationships-duplicate-rows.md`
- Bug 2 (P3 BondPill): `docs/bugs/2026-05-06-bondpill-xp-overshoots-level-threshold.md`

## Verdict

Today's commits pass everything that doesn't depend on a live LLM. The two
bugs uncovered are both **pre-existing** — the P1 dupe-row issue is the
larger concern and warrants a v72 schema migration before any further
bond-system work lands. The P3 BondPill display is a one-line frontend fix.

The session-26 + session-27 ship trajectory is sound. Recommend pushing
the 11 unpushed commits to `origin/master` once user authorizes the push.
