# Ticket Template: V2 Hybrid Default Cutover

Use this template for the implementation issue/epic that controls the default switch from preview `/v2` to default `/`.

## Metadata
1. Owner: `<name>`
2. Target cutover date: `<YYYY-MM-DD>`
3. Rollback owner: `<name>`
4. QA owner: `<name>`
5. Observability owner: `<name>`

## Objective
Switch frontend default to v2 using the Hybrid track while preserving rollback safety and completing required reliability gates.

## Included at Cutover (must deliver before switch)
1. Chat:
- send/receive
- optimistic + retry
- stable failure microcopy
2. Character switching:
- viewer and context sync
3. Settings:
- HUD read/write persistence
4. Memory:
- graph live updates + explicit RAG fallback mode
5. Voice:
- mic and TTS visualizer paths with degraded-mode handling
6. Reliability slice:
- `npm run e2e`
- `npm run e2e:live`
- `pytest -q backend/tests`
- telemetry for API failures + memory fallback frequency

## Excluded at Cutover (defer; must be tracked)
1. Advanced memory search/filter/details UX.
2. Full visual polish sweep.
3. Full mobile visual parity.
4. Expanded asset library production batch.

## Acceptance Checklist
## Core and Contract
- [ ] `docs/V2_CUTOVER_CHECKLIST.md` sections A/B/C/E completed.
- [ ] Hybrid-specific section D completed.

## Testing
- [ ] Frontend checks pass:
`npm run lint`, `npm test`, `npm run build`, `npm run e2e`
- [ ] Live backend smoke passes:
`npm run e2e:live`
- [ ] Backend contract checks pass:
`pytest -q backend/tests`
- [ ] Unified preflight script passes:
`./tools/v2_hybrid_preflight.sh`

## Rollout Safety
- [ ] Legacy fallback route confirmed and tested.
- [ ] Rollback procedure dry-run completed.
- [ ] Post-switch 72-hour staffing plan approved.

## Exclusions Logged
- [ ] Exclusion #1 owner + target milestone recorded.
- [ ] Exclusion #2 owner + target milestone recorded.
- [ ] Exclusion #3 owner + target milestone recorded.
- [ ] Exclusion #4 owner + target milestone recorded.

## Task Breakdown
1. Hardening tasks:
- [ ] Stabilize live smoke environment and test data.
- [ ] Finalize telemetry events and dashboard.
- [ ] Resolve all open P0/P1 defects.
2. Cutover tasks:
- [ ] Flip default route to v2.
- [ ] Keep legacy fallback route active.
- [ ] Enforce hotfix-only mode for first 72 hours.
3. Post-cutover tasks:
- [ ] Execute deferred feature roadmap (beta phase).
- [ ] Begin RC hardening window.

## Execution Log
1. Cutover run date/time: `<YYYY-MM-DD HH:MM TZ>`
2. Monitoring snapshot at +24h:
`<summary>`
3. Monitoring snapshot at +72h:
`<summary>`
4. Outcome:
`<go/no-go/rolled-back>`
