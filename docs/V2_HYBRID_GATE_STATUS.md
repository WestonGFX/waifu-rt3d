# V2 Hybrid Gate Status

Updated: 2026-02-11

This is the live status board for Hybrid cutover gates.

## Gate Status
1. Frontend lint: PASS
- command: `npm run lint` in `frontends/v2`
2. Frontend unit tests: PASS
- command: `npm test` in `frontends/v2`
3. Frontend build: PASS
- command: `npm run build` in `frontends/v2`
4. Mocked E2E core flow: PASS
- command: `npm run e2e` in `frontends/v2`
5. Backend API contracts: PASS
- command: `pytest -q backend/tests`
6. Live backend E2E smoke: PASS
- command: `npm run e2e:live` in `frontends/v2`
- latest result: pass when backend was running on `http://127.0.0.1:8080`
7. Telemetry instrumentation: PASS
- endpoint: `GET /api/v2/telemetry/summary`
- captures: API error rate + memory fallback frequency
8. Telemetry policy document: PASS
- policy: `docs/V2_HYBRID_TELEMETRY_POLICY.md`
9. Telemetry threshold enforcement in preflight: PASS
- command: `./tools/v2_hybrid_preflight.sh`
- supports threshold overrides via `WAIFU_PREFLIGHT_*` env vars

## What is blocking Hybrid cutover now
1. Fill named owners and accountable roles in:
- `docs/V2_HYBRID_EXECUTION_PLAN.md`
2. Run the 7-day P0/P1 + telemetry threshold window and record evidence:
- policy: `docs/V2_HYBRID_TELEMETRY_POLICY.md`

## Next 5 Actions
1. CI preflight workflow added:
- `.github/workflows/v2-hybrid-preflight.yml`
2. Wire dashboard/reporting query around `/api/v2/telemetry/summary`.
3. Fill owner fields in `docs/V2_HYBRID_EXECUTION_PLAN.md`.
4. Create cutover issue from `docs/V2_HYBRID_CUTOVER_TICKET_TEMPLATE.md`.
5. Run 7-day P0/P1 + telemetry threshold window for cutover approval.
