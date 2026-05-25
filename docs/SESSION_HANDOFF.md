# Session Handoff — 2026-05-25 (session 48)

## Branch: master · 15 commits this session · all pushed to origin
## Test Status: **3,051 backend pytest passing** · **456 vitest passing** · TSC clean
## Schema version: v86 (`kokoro_parse_log` table added)

## TL;DR

Session 48 started with two user screenshots showing Rin (Akane) calling herself "Kokoro-chan" —
traced to the `## Kokoro Mind State` header making small LLMs read the Kokoro engine as their
own identity. Fixed with a two-layer guard (header rename + `_fix_identity_slip()` post-process
regex). Then ran 7 parallel agent dispatches to implement Kokoro v2 Phase 1 parse_ok rate
tracking infrastructure: schema v86, QA endpoint extension, HUD badge (green/yellow/red), and
74+ new tests across backend and frontend.

**Net session:** 15 commits, schema v85→v86, +74 new tests (3051 backend + 456 frontend), all pushed.

## Completed This Session

### Identity Fix (Rin calling herself "Kokoro-chan")
- **`5e5d321`** — `fix(kokoro)`: `## Kokoro Mind State` → `## Current Emotional State` in `build_kokoro_fragment()`. Small LLMs (llama-3.2-1b) were reading the engine header as their own name.
- **`d892475`** — `feat(kokoro)`: `_fix_identity_slip()` post-process guard in `finalize_turn()` — regex replaces `Kokoro-{honorific}` with character's actual first name; exempt if char is actually named Kokoro.
- **`83a096b`** — `test(kokoro)`: 10 tests for `_fix_identity_slip` and `finalize_turn` integration.

### AIE Cost Mitigations
- **`2d59579`** — `perf(aie)`: 5-minute TTL in-process cache for `tuner.load_user_profile()` and `compute_behavior_modifiers()` in `server.py`. Reduces ~3 DB reads/turn to ~1 per 5 min under full AIE mode.
- **`c73b017`** — `chore(aie)`: Deprecation notice in `adaptive/milestones.py` → points to `bond.milestones`.
- **`cac43a1`** — `docs(aie)`: Research doc updated — 3 recommendations marked ✅ DONE with commit refs.

### Settings Drawer Clipping Fix
- **`a3334e1`** — `fix(overlay)`: `ModelPanel.tsx` — all three viewer paths (Unity iframe, Live2D div, VRM iframe) get `visibility: hidden` when `activeOverlay` is non-null. Browsers create compositor layers for iframes that paint above `fixed` React overlays regardless of z-index. `visibility: hidden` preserves the GPU context unlike `display: none`.

### Kokoro v2 Phase 1 — Parse OK Rate Tracking
- **`33d0918`** — `feat(kokoro/schema)`: Schema v86 adds `kokoro_parse_log` table with `(character_id, session_id, parse_ok, raw_text_len, created_at)` + index on `(character_id, created_at)`.
- **`d0c47ee`** — `feat(kokoro/service)`: `_log_parse_result()` in `service.py` — inserts one row per turn in `finalize_turn()`. Silent on missing table (pre-v86 DBs).
- **`c703e52`** — `test(kokoro)`: 10 tests for parse_ok logging (migration idempotency + `_log_parse_result` + `finalize_turn` integration).
- **`ba1ef49`** — `feat(hud)`: `KokoroDebugPanel.tsx` — `ParseOkBadge` component (green ≥80%, yellow 50-79%, red <50%) + exported `KokoroQaResponse` interface.
- **`e43035c`** — `feat(kokoro/api)`: `/api/kokoro/qa/{char_id}` extended with `parse_ok_total`, `parse_ok_count`, `parse_ok_rate`; default window changed to 48h. `api.ts kokoroQa()` typed method added. `App.tsx` fetches and passes `qa={kokoroQaData}` to `<KokoroDebugPanel />`.
- **`a979c16`** — `test(kokoro)`: 13 backend tests for `/api/kokoro/qa` endpoint (rate calculation, hours window, char isolation, graceful missing-table).
- **`8e2e043`** — `test(hud)`: 8 frontend tests for `KokoroDebugPanel` parse_ok badge (n/a, green, yellow, red, boundary cases).
- **`7c72752`** — `test(voice)`: 20 frontend tests for `useVoiceMode` hook state machine (errors, VAD, transcribe path, unmount cleanup).
- **`2fe8abe`** — `fix(test)`: `chatStore.pin.test.ts` — added `grantAchievement: vi.fn()` to mock. The missing stub caused a synchronous TypeError when `togglePin` called `api.grantAchievement()`, which the outer catch block caught and reverted the optimistic update, failing the assertion.

## Key Architecture Notes

### Kokoro identity-slip fix
- Layer 1 (preventive): neutral header `## Current Emotional State` in `build_kokoro_fragment()` (`backend/kokoro/prompt_fragment.py`)
- Layer 2 (corrective): `_fix_identity_slip()` in `finalize_turn()` (`backend/kokoro/service.py:169`) — regex `\bKokoro[-\s]?(chan|kun|…)?\b` substituted with character's first name; Kokoro-named characters are exempt

### Settings drawer compositor layer issue
- `ModelPanel.tsx` — when any overlay is active, all viewer elements get `visibility: hidden`. Do NOT switch to `display: none` — it destroys the Three.js/Live2D WebGL context.

### AIE TTL cache location
- `backend/server.py` — `_AIE_PROFILE_CACHE` and `_AIE_BEHAVIOR_CACHE` module-level dicts (key=char_id, value=(timestamp, data)). TTL=300s. Cache invalidated when engagement regression triggers revert.

### parse_ok rate badge thresholds
- HUD badge in `KokoroDebugPanel.tsx`: ≥80% green, 50-79% yellow, <50% red. `parse_ok_total=0` shows "n/a".

## Next Priorities (for session 49)

1. **Live parse_ok validation** — Start server + LM Studio, open `?debug=kokoro` HUD, run 10 turns, confirm `parse_ok_rate ≥ 0.80` with user's local model. Chrome extension was not connected this session.
2. **Kokoro v2 Phase 2 (Emotional RAG)** — Schema v87: `mind_state_snapshot` JSON column on `memories` table. Memory retrieval re-ranking using cosine similarity against current dial vector. See `docs/research/2026-05-24-memory-architectures.md`.
3. **Memory Browser QA** — Chrome hands-on: Ctrl+M, all 4 tabs, real backend data. The overlay wiring has regression coverage; safe to QA.
4. **#14 server.py refactor** — 17K-line file split into domain modules. Multi-session. Only tackle when no active features are in-flight.
5. **#13 NSFW endpoint cleanup** — 7 endpoints with no callers per session-46 audit. Blocked by CLAUDE.md rule — needs explicit user override.

## Pre-existing Working-Tree Drift (unchanged, user routinely reverts)
- `backend/config/app.json` — LM Studio host/model from persona testing
- `backend/storage/app.db` — runtime DB
- `frontends/sakura/e2e/smoke-test.spec.ts` — e2e test drift
- `frontends/sakura/src/hooks/useTheme.ts` — theme hook drift
- `frontends/sakura/src/styles/themes.css` — theme CSS drift
- Untracked avatars: `Glitch.png`, `melon_r18_*`, `melon_wear.png`

## Push Gate Check
No active `OPEN BUG`, `UNFIXED`, or `BLOCKER` markers. All 15 session commits pushed to origin/master.
