# V2 Implementation Tracks: Core-Only vs Full vs Hybrid

Date: 2026-02-11

This document gives you three concrete rollout tracks from `/v2` preview to default frontend, then through MVP beta and 1.0 RC.

## Current Baseline (already implemented)
1. `/v2` preview app scaffold and backend static serving.
2. Additive memory APIs and additive chat response fields.
3. Canonical DB path migration to `backend/storage/app.db`.
4. Zustand optimistic chat with retry + local history persistence.
5. Settings HUD persistence (`/api/config`) and bootstrap wiring.
6. Memory panel hardening with loading/error/refresh states.
7. Mocked Playwright core-flow E2E + backend API contract tests.
8. Live-backend Playwright smoke mode wired (requires running backend).

## Option A: Core-Feature Gated Cutover
Default switch occurs as soon as core flow is stable.

How it works:
1. Keep focus on chat, character switching, settings persistence, memory panel, viewer controls.
2. Make `/v2` default after passing cutover gates.
3. Continue advanced feature build after switch on the new default surface.

Pros:
1. Fastest time to value.
2. Low coordination overhead.
3. Earlier real-user feedback loop on the new UI stack.

Cons:
1. Default UI may still be missing premium polish features.
2. Temporary expectation-management burden with users.

## Option B: Full-Feature Before Default
Default switch is delayed until nearly all planned v2 features are done.

How it works:
1. Keep `/v2` as preview for full implementation (HUD polish, HoloCard depth, advanced memory UX, asset pipeline execution, performance envelopes, mobile fallback polish).
2. Switch default only once near-beta completeness is reached.

Pros:
1. Strong first impression at cutover.
2. Fewer “still coming soon” gaps at default launch.

Cons:
1. Longer period carrying two frontends.
2. Higher integration risk accumulation before broad usage.
3. Slower signal on real-world regressions.

## Option C: Hybrid (Recommended)
Default switch after core + selected high-leverage features, then complete the rest post-switch.

How it works:
1. Treat core flow as the hard gate.
2. Add a thin “quality slice” before cutover:
- Live backend E2E smoke in CI.
- Memory panel reliability + explicit fallback UX.
- HUD persistence and bootstrap defaults.
- Voice visualizer fallback reliability (mic denied, autoplay blocked).
- Basic telemetry for API errors + fallback frequency.
3. Switch default after this quality slice passes.
4. Finish advanced/visual depth items on default surface with strict test gates.

Pros:
1. Better quality than core-only with modest delay.
2. Lower risk than full-before-default.
3. Keeps momentum and shortens dual-maintenance window.

Cons:
1. Requires discipline to hold scope at cutover.
2. Needs clear “not in cutover” list to prevent scope creep.

## Comparison Snapshot
1. Time to default:
- Core-only: Fast (shortest).
- Hybrid: Medium.
- Full-before-default: Slowest.
2. Cutover risk:
- Core-only: Medium.
- Hybrid: Low-medium.
- Full-before-default: Medium-high (large pre-cutover scope).
3. Commercial readiness at switch:
- Core-only: Moderate.
- Hybrid: High enough for controlled default.
- Full-before-default: Highest initial completeness.

## Recommended Feature Sets By Stage
Use these as strict scope boundaries.

### Stage 1: Default-Cutover Required (Hybrid recommendation)
1. Chat core:
- optimistic send/retry
- failure microcopy + retry control
- typing indicator stability
2. Character context:
- roster switching updates viewer and chat context
3. Settings:
- HUD persist/load (`voice pitch`, `creativity`, `speech_auto`)
4. Memory:
- graph loads, refreshes, handles RAG unavailable fallback
5. Voice:
- mic + TTS visualizer paths with graceful fallback
6. Quality gates:
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run e2e` (mock core flow)
- `npm run e2e:live` (against running backend)
- `pytest -q backend/tests`
7. Safety:
- rollback route and owner documented
- legacy route available for one release cycle

### Stage 2: MVP Beta Required (post-default)
1. Memory UX:
- search/filter UI and richer node inspection
2. Viewer polish:
- HoloCard and portrait interactions tuned to consistent fps
3. Asset pipeline execution:
- prompt catalog + naming + integration scripts actively used
4. Telemetry:
- error-rate dashboards + fallback frequency alerts
5. Mobile fallback:
- functional completion of key actions on narrow viewport
6. Release quality:
- accessibility pass (keyboard flow, focus states, contrast)

### Stage 3: 1.0 RC Required
1. Performance budgets:
- stable desktop interaction near target fps under normal load
- degraded effects policy validated on lower-end hardware
2. Reliability:
- zero open P0/P1 for 14-day burn-in
- no data-loss defects in chat/session/settings
3. Product polish:
- finalized microcopy and visual consistency pass
- loading/empty/error states complete across modules
4. Operational readiness:
- runbooks for deploy, rollback, incident response
- reproducible CI pipeline for frontend + backend test gates

## Step-by-Step Execution Plan (Recommended Hybrid)
1. Milestone H1 (1 week): Cutover hardening
- Enable live-backend smoke test in CI/pre-merge.
- Resolve remaining failing or flaky paths.
- Finish telemetry event wiring for memory fallback + chat errors.
2. Milestone H2 (1 week): Controlled default switch
- Switch frontend default to v2 with legacy fallback route.
- Monitor 72-hour error/fallback trends.
- Hotfix only; no feature expansion during the first 72 hours.
3. Milestone H3 (2-3 weeks): MVP beta completion
- Implement deferred beta-scope features.
- Run full regression + exploratory QA.
- Freeze scope for beta sign-off.
4. Milestone H4 (2-3 weeks): RC hardening
- Performance/accessibility/polish pass.
- 14-day stability window with no P0/P1.
- Ship 1.0 RC candidate build.

## Decision Rule
Pick Hybrid unless both conditions are true:
1. You can absorb a longer timeline without losing momentum.
2. You need near-complete polish before exposing v2 as default.

If both are true, pick Full-before-default.
If time-to-value dominates, pick Core-only.
