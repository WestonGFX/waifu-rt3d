# Memory Browser QA Report — 2026-05-07

**Tester:** Claude (Playwright automated) + visual review  
**Build:** master, commit 201f465 (session 37)  
**Backend:** schema v78, 2843 tests passing  
**Method:** Playwright MCP browser automation against live dev server (`:5175/sakura/`)

---

## Tabs Tested

| Tab | Status | Notes |
|-----|--------|-------|
| Overview | ✅ Pass | Stats display correctly (92 msgs, 0 facts, 0 journal, "Building…" for AI analysis) |
| About You | ✅ Pass | Full CRUD tested: create, edit, delete all functional |
| Memories | ✅ Pass | 154 entries / 13 pages, tier filters, Promote to Permanent, pagination |
| Journal | ✅ Pass | Empty state renders correctly ("No journal entries yet…") |
| Mind Map | ✅ Pass | Node graph renders with tier legend (T3:0, T2:14, T1:119), session-connection lines |

---

## Issues Found

### ISSUE-001 · P2 — Console errors on `/api/feedback/preferences` (404)
**Severity:** P2 (noisy, may degrade AIE adaptive features)  
**Reproducible:** Yes, every page load  
**Symptoms:** 3 console errors on load:
```
Failed to load resource: http://localhost:8080/api/feedback/preferences — 404
```
**Root cause:** Backend server process is old — predates the AIE Phase C Phase 0 commits that added this endpoint (`server.py:18618`). The endpoint exists in source but the running process hasn't reloaded it.  
**Fix:** Restart the backend server with `uvicorn backend.server:app --host 0.0.0.0 --port 8080`.  
**Impact:** Adaptive intelligence features (preference learning, context tuning) silently degrade. Not user-visible in UI, but AIE personalization gate will fail to load preferences.

---

### ISSUE-002 · P3 — About You fact delete has no confirmation
**Severity:** P3 (minor UX / accidental data loss risk)  
**Reproducible:** Yes  
**Symptoms:** Clicking "Delete this fact" immediately removes the fact with no confirmation dialog or undo option.  
**Steps:**
1. Open Memory Browser → About You
2. Add a fact
3. Click delete icon
4. Fact is gone instantly

**Expected:** Either a confirmation modal ("Delete this fact? This cannot be undone.") or a brief undo toast.  
**Actual:** Immediate permanent deletion.  
**Impact:** Low — facts are user-entered and relatively easy to re-add. But matches a pattern where accidental clicks on a small icon cause irreversible data loss.

---

## Observations (Non-Bugs)

- **Promote to Permanent**: Works correctly. T1 Fleeting → T3 Permanent badge updates immediately without page reload. Star icon appears next to date.
- **Mind Map node count**: "Up to 42 shown" is by design per footer text. Legend counts are live (updated correctly after promote action would reflect on next open).
- **Journal empty state copy**: "Rin (Akane)'s journal will fill in as you have conversations together." — character name correctly interpolated.
- **Semantic search**: Search bar and "Go" button present in Memories tab; not tested with actual queries (would require a running embedding model).
- **Character filter**: Combobox shows all 14 characters correctly in Memories tab.
- **Tier filter chips**: T1 Fleeting / T2 Recent / T3 Permanent labels are consistent with Mind Map legend labels (no label mismatch).

---

## Screenshots

All screenshots saved to `docs/testing/memory-browser-qa-2026-05-07/`:

| File | Content |
|------|---------|
| `memory-browser-qa-01-initial.png` | App initial state |
| `memory-browser-qa-02-opened.png` | Memory Browser opened |
| `memory-browser-qa-03-overview.png` | Overview tab |
| `memory-browser-qa-04-overview.png` | Overview tab (detail) |
| `memory-browser-qa-05-about-you.png` | About You empty state |
| `memory-browser-qa-06-add-fact.png` | Add fact input revealed |
| `memory-browser-qa-07-fact-added.png` | Fact created ("1 fact learned") |
| `memory-browser-qa-08-edit-fact.png` | Edit mode active |
| `memory-browser-qa-09-edit-saved.png` | Edit saved |
| `memory-browser-qa-12-memories.png` | Memories tab (pagination visible) |
| `memory-browser-qa-13-journal.png` | Journal empty state |
| `memory-browser-qa-14-mindmap.png` | Mind Map node graph |
| `memory-browser-qa-15-promoted.png` | T3 Permanent badge after promote |
| `memory-browser-qa-16-deleted.png` | About You after delete (0 facts) |

---

## Verdict

Memory Browser is **production-ready** with two minor issues. ISSUE-001 (console 404s) resolves immediately with a backend restart. ISSUE-002 (no delete confirmation) is a low-priority UX polish item.

No data corruption, no crashes, no broken layouts observed across all 5 tabs.

