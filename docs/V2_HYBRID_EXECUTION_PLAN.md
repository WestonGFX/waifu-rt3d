# V2 Hybrid Execution Plan (Selected Track)

Date selected: 2026-02-11  
Track: Hybrid (core + reliability slice, then default switch)

## Why Hybrid
1. Faster than full-before-default while avoiding core-only quality risk.
2. Keeps rollback safety and operational confidence at cutover.
3. Preserves momentum by shipping default earlier, then polishing on one primary surface.

## Scope Boundaries
### Included for default cutover
1. Core chat flow:
- send/receive
- optimistic pending state
- failed state + retry path
2. Character flow:
- roster switch updates viewer and chat context
3. Settings persistence:
- HUD load/save for `voice_pitch`, `creativity`, `speech_auto`
4. Memory reliability:
- graph loads/refreshes
- RAG unavailable fallback to session mode
5. Voice reliability:
- mic + TTS visualizer paths
- graceful behavior when mic permission denied/autoplay blocked
6. Reliability slice:
- mock E2E and live-backend E2E smoke
- backend API contract tests
- basic telemetry for API errors and fallback frequency

### Excluded from cutover (post-switch)
1. Advanced memory exploration UX (search/filter/deep node inspection).
2. High-fidelity visual polish pass for all cards/animations.
3. Full mobile visual parity.
4. Full asset-library productionization breadth.

## Milestones and Dates
## M1: Hybrid Hardening (2026-02-11 to 2026-02-18)
Goal: close reliability slice and eliminate cutover blockers.

Checklist:
1. Make live-backend smoke executable in CI or a release preflight job.
2. Ensure telemetry events exist for:
- chat API failures
- memory fallback (`rag` -> `session`)
- settings save failures
3. Resolve any flaky tests in v2 unit/integration/E2E.
4. Confirm rollback route plan is documented and owned.

Exit criteria:
1. `npm run lint` passes.
2. `npm test` passes.
3. `npm run build` passes.
4. `npm run e2e` passes.
5. `npm run e2e:live` passes against running backend.
6. `pytest -q backend/tests` passes.

## M2: Controlled Default Switch (2026-02-19 to 2026-02-25)
Goal: switch default frontend to v2 with guarded rollout.

Checklist:
1. Route strategy:
- default `/` -> v2
- keep legacy route addressable (for example `/legacy`).
2. Freeze net-new feature work for first 72 hours after switch.
3. Staff monitoring and rollback owner coverage.
4. Run cutover checklist in `docs/V2_CUTOVER_CHECKLIST.md` with `Hybrid` profile.

Exit criteria:
1. 72-hour post-switch period has no unresolved P0/P1.
2. Rollback drill validated within target response window.

## M3: MVP Beta Completion (2026-02-26 to 2026-03-18)
Goal: fill deferred feature gaps on the now-default v2 surface.

Checklist:
1. Implement deferred memory UX.
2. Implement deferred visual polish for HoloCard/viewer/motion.
3. Improve mobile fallback usability and consistency.
4. Expand telemetry dashboards and alert thresholds.
5. Complete accessibility and usability pass for beta.

Exit criteria:
1. Beta feature checklist completed and signed off.
2. Regression pass across chat, settings, memory, viewer, voice complete.

## M4: 1.0 RC Hardening (2026-03-19 to 2026-04-08)
Goal: production-grade quality bar for RC.

Checklist:
1. Performance budget pass on representative desktop profiles.
2. Polish pass across empty/loading/error states and microcopy consistency.
3. No data-loss defects in chat/session/settings.
4. 14-day burn-in with no open P0/P1.
5. Final operational runbooks and incident playbook validated.

Exit criteria:
1. 1.0 RC candidate approved for deployment.

## Test Strategy by Phase
## Continuous (every PR)
1. `npm run lint`
2. `npm test`
3. `npm run build`
4. `pytest -q backend/tests`

## Cutover-critical (M1/M2)
1. `npm run e2e` for mocked deterministic flow.
2. `npm run e2e:live` for real backend smoke flow.
3. Manual sanity:
- character switch
- retry flow
- settings persist across refresh
- memory fallback rendering

## Beta/RC
1. Expanded Playwright scenarios for network failure, degraded backend, and settings rollback.
2. Performance profiling and regression baselines.
3. Accessibility checks and keyboard-only path validation.

## Roles and Ownership (fill before M2 starts)
1. Release owner: `<name>`
2. Rollback owner: `<name>`
3. Frontend quality owner: `<name>`
4. Backend/API owner: `<name>`
5. QA lead: `<name>`
6. Observability owner: `<name>`

## Risks and Mitigations
1. Risk: lingering dual-route complexity.
- Mitigation: keep legacy available for one release cycle only; document sunset date.
2. Risk: live E2E environment drift.
- Mitigation: pin backend launch command and test seed data for smoke runs.
3. Risk: scope creep before cutover.
- Mitigation: enforce included/excluded scope list in cutover ticket.

## Definition of Done: Default Cutover
All items below must be true:
1. Hybrid profile checklist complete in `docs/V2_CUTOVER_CHECKLIST.md`.
2. Excluded features logged with owner + milestone.
3. Monitoring and rollback owners confirmed in writing.
4. 72-hour post-switch watch window staffed and executed.
