# V2 Cutover Checklist

Use this checklist for go/no-go when deciding whether `/v2` becomes default `/`.

## Track Profiles (choose one before running checklist)
1. Core-only cutover:
- Include at cutover: core chat/character/settings/memory/viewer functionality and test gates.
- Exclude from cutover: advanced polish/features; continue after switch.
2. Hybrid cutover (recommended):
- Include at cutover: core + reliability slice (live E2E smoke, telemetry baseline, robust fallback UX).
- Exclude from cutover: deep visual polish and expanded memory UX.
3. Full-before-default cutover:
- Include at cutover: core + nearly all planned v2 features and polish.
- Exclude from cutover: only low-priority backlog.

## A. Core Functionality (must pass for all tracks)
- [ ] Chat send/receive works across 20+ consecutive messages.
- [ ] Optimistic send + retry (`failed` -> resend) works.
- [ ] Character switching updates active viewer + context.
- [ ] Settings HUD persists and restores values after refresh.
- [ ] Memory Bank graph loads and updates with live session activity.
- [ ] RAG unavailable fallback shows session-only mode cleanly.
- [ ] Voice visualizer works with mic input and TTS playback.

## B. Backend/API Contract (must pass for all tracks)
- [ ] `GET /api/v2/memory/graph` returns valid mode/nodes/edges/stats.
- [ ] `GET /api/v2/memory/search` returns scored results.
- [ ] `POST /api/chat` additive fields are present and non-breaking.
- [ ] Canonical DB path resolves to `/Users/chris/Code/waifu-rt3d/backend/storage/app.db`.
- [ ] Migration rule validated (`waifu.db` -> `app.db` when needed).

## C. Quality Gates (must pass for all tracks)
- [ ] Frontend unit tests pass (`npm test`).
- [ ] Frontend lint/build pass (`npm run lint`, `npm run build`).
- [ ] Backend API tests pass (`pytest -q backend/tests`).
- [ ] Playwright mock core-flow E2E passes (`npm run e2e`).
- [ ] No data-loss bugs in chat/session history.

## D. Track-Specific Gates
### Core-only
- [ ] No open P0/P1 defects for 7 consecutive days.
- [ ] Legacy route remains available for immediate rollback.

### Hybrid (recommended)
- [ ] `npm run e2e:live` passes against running backend.
- [ ] Telemetry captures at least API error rate + memory fallback frequency.
- [ ] No open P0/P1 defects for 7 consecutive days.

### Full-before-default
- [ ] All Hybrid gates pass.
- [ ] Advanced memory UX (search/filter/details) is production-ready.
- [ ] HoloCard/viewer interaction polish complete.
- [ ] Asset pipeline integration is operational with final naming/import conventions.
- [ ] No open P0/P1 defects for 14 consecutive days.

## E. Rollout Safety (must pass for all tracks)
- [ ] `/` remains available or quickly restorable during rollout.
- [ ] Cutover rehearsal passes:
`./tools/v2_hybrid_cutover_rehearsal.sh`
- [ ] GO/NO-GO report generated:
`./tools/v2_hybrid_cutover_decision.sh`
- [ ] Rollback steps are documented and rehearsed.
- [ ] Release owner + rollback owner are named.
- [ ] 72-hour post-switch monitoring window is staffed.

## Explicit Exclusions at Cutover (fill this before final go/no-go)
- [ ] Excluded item 1 documented with owner + target milestone.
- [ ] Excluded item 2 documented with owner + target milestone.
- [ ] Excluded item 3 documented with owner + target milestone.

## Go/No-Go Rule
1. Go only if A/B/C/E are complete and all selected D-track gates are complete.
2. If any A/B/C gate is incomplete, default decision is NO-GO.
3. If exclusions are not explicitly documented, default decision is NO-GO.
