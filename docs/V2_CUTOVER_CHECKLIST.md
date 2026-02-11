# V2 Cutover Checklist

Use this checklist for go/no-go when deciding whether `/v2` becomes default `/`.

## A. Core Functionality (must pass)
- [ ] Chat send/receive works across 20+ consecutive messages.
- [ ] Optimistic send + retry (`failed` -> resend) works.
- [ ] Character switching updates active viewer + context.
- [ ] Settings HUD persists and restores values after refresh.
- [ ] Memory Bank graph loads and updates with live session activity.
- [ ] RAG unavailable fallback shows session-only mode cleanly.
- [ ] Voice visualizer works with mic input and TTS playback.

## B. Backend/API Contract (must pass)
- [ ] `GET /api/v2/memory/graph` returns valid mode/nodes/edges/stats.
- [ ] `GET /api/v2/memory/search` returns scored results.
- [ ] `POST /api/chat` additive fields are present and non-breaking.
- [ ] Canonical DB path resolves to `/Users/chris/Code/waifu-rt3d/backend/storage/app.db`.
- [ ] Migration rule validated (`waifu.db` -> `app.db` when needed).

## C. Quality Gates (must pass)
- [ ] Frontend unit tests pass.
- [ ] Backend API tests pass.
- [ ] Playwright E2E passes for `/v2` core flow.
- [ ] No open P0/P1 bugs for 7 consecutive days.
- [ ] No data-loss bugs in chat/session history.

## D. Performance and UX (must pass)
- [ ] Desktop interaction remains smooth under normal use.
- [ ] Particle/blur fallbacks trigger correctly under load.
- [ ] Mobile fallback layout is functional (not parity, but usable).
- [ ] Error microcopy is Neural Link themed and actionable.

## E. Rollout Safety (must pass)
- [ ] `/` remains available or quickly restorable during rollout.
- [ ] Rollback steps are documented and rehearsed.
- [ ] Monitoring captures API error rate and fallback frequency.
- [ ] Release owner + rollback owner are named.

## Go/No-Go Rule
Go only if every A-E checkbox is complete.
If any A/B/C item is incomplete, default decision is NO-GO.
