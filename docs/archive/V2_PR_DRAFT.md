# Title
feat(v2): preview-gated React frontend with memory APIs, voice upgrades, and cutover framework

## Summary
This PR introduces Neon v2 as a preview-gated React application at `/v2` while preserving the current Neon route at `/`.

It adds:
1. New v2 frontend scaffold and core architecture (React + TS + Tailwind + Zustand + R3F + Framer Motion).
2. Additive backend API upgrades for memory graph/search and chat response metadata.
3. DB path standardization to `backend/storage/app.db` with startup migration from `waifu.db`.
4. Graceful RAG/vector-store fallback behavior.
5. Decision and rollout docs for safe default promotion.

## Why
1. Reduce cutover risk by shipping behind `/v2` first.
2. Validate core flow parity before making v2 default.
3. Keep backward compatibility for existing `/api/*` consumers.

## Scope Implemented
### Frontend (`frontends/v2`)
1. Cyber-glass shell with left roster, center viewer/chat, right memory panel.
2. Zustand chat store with optimistic updates, failed retry, typing debounce, local persistence.
3. Neural Link microcopy system.
4. Voice visualizer abstraction (mic/TTS with fallback).
5. Memory graph payload transforms and tests.

### Backend
1. `GET /v2` and static assets serving for built v2 app.
2. `GET /api/v2/memory/graph`
3. `GET /api/v2/memory/search`
4. Additive response fields for `POST /api/chat`.
5. Canonical DB migration logic and startup preflight consistency.

## Verification
1. Frontend lint/build/test pass.
2. Python compile checks pass.
3. Manual smoke checks for memory endpoints and startup fallback.

## Risk and Mitigation
1. Risk: vector-store dependency mismatch in some environments.
- Mitigation: fallback to session-only graph mode without app crash.

2. Risk: backend schema/path drift.
- Mitigation: single canonical `app.db` path and one-time migration guard.

## Rollout Plan
1. Keep `/` on legacy Neon.
2. Enable `/v2` preview testing.
3. Run cutover checklist in `docs/V2_CUTOVER_CHECKLIST.md`.
4. Promote default only after all gates pass.

## Follow-up Work
1. Phase 2: finalize chat UX polish + microcopy coverage + full visualizer QA.
2. Phase 3: Settings HUD refinements + HoloCard polish + live memory graph hardening.
3. Phase 4: asset pipeline execution + full parity report.

## Reviewer Focus
1. Non-breaking backend contract changes.
2. DB migration safety and rollback path.
3. Stability of `/v2` serving and fallback behavior.
