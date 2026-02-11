# V2 Hybrid Telemetry Policy

Date: 2026-02-11

This policy defines telemetry thresholds for the Hybrid track from preflight to cutover approval.

## Source Endpoint
`GET /api/v2/telemetry/summary`

Metrics used:
1. `api.error_rate`
2. `memory.fallback_rate`
3. `chat.failure_rate`
4. `api.requests_total`
5. `memory.graph_requests_total`

## Policy Profiles
## A. Preflight Smoke Policy (local + CI)
Purpose: ensure instrumentation works and obvious regressions fail fast.

Defaults enforced by `./tools/v2_hybrid_preflight.sh`:
1. `api.error_rate <= 0.05`
2. `memory.fallback_rate <= 1.00`
3. `chat.failure_rate <= 1.00`
4. `api.requests_total >= 1`
5. `memory.graph_requests_total >= 1`

Why memory fallback allows `1.00` in smoke:
1. Smoke preflight starts backend with `WAIFU_DISABLE_VECTOR_STORE=1`.
2. Session-only mode is expected in this path.

## B. Cutover Approval Policy (7-day window, vector store enabled)
Purpose: decide go/no-go for default switch.

Recommended thresholds:
1. `api.error_rate <= 0.03` (rolling 1h)
2. `memory.fallback_rate <= 0.35` (rolling 1h, vector store enabled)
3. `chat.failure_rate <= 0.10` (rolling 1h)
4. Minimum traffic for valid sample:
- `api.requests_total >= 200` per evaluation window
- `memory.graph_requests_total >= 50` per evaluation window

Hard no-go conditions:
1. Any P0 defect related to data loss.
2. Telemetry unavailable for more than one evaluation window.
3. Any threshold breach sustained across two consecutive windows.

## Commands
Default smoke policy:
```bash
./tools/v2_hybrid_preflight.sh
```

Daily telemetry evidence capture:
```bash
./tools/v2_hybrid_capture_telemetry.sh
```

Override thresholds if needed:
```bash
WAIFU_PREFLIGHT_MAX_API_ERROR_RATE=0.03 \
WAIFU_PREFLIGHT_MAX_MEMORY_FALLBACK_RATE=0.35 \
WAIFU_PREFLIGHT_MAX_CHAT_FAILURE_RATE=0.10 \
WAIFU_PREFLIGHT_MIN_API_REQUESTS=5 \
WAIFU_PREFLIGHT_MIN_MEMORY_GRAPH_REQUESTS=2 \
./tools/v2_hybrid_preflight.sh
```

Override cutover telemetry thresholds/sampling for capture script:
```bash
WAIFU_CUTOVER_MAX_API_ERROR_RATE=0.03 \
WAIFU_CUTOVER_MAX_MEMORY_FALLBACK_RATE=0.35 \
WAIFU_CUTOVER_MAX_CHAT_FAILURE_RATE=0.10 \
WAIFU_CUTOVER_MIN_API_REQUESTS=200 \
WAIFU_CUTOVER_MIN_MEMORY_GRAPH_REQUESTS=50 \
./tools/v2_hybrid_capture_telemetry.sh
```

## Ownership
1. Observability owner sets dashboard queries and alerting.
2. Release owner confirms threshold compliance before cutover sign-off.
