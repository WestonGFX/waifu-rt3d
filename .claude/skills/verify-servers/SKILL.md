---
name: verify-servers
description: Probe expected dev services (backend, sakura, dashboard, viewer), curl health endpoints, scan recent logs for ABI/import errors, report one status table. Use before claiming "servers running" — closes the verification gap from the ABI-mismatch session.
user_invocable: true
---

# Verify Servers

Read-only diagnostic. Confirms that dev services are actually running AND responding — not just that a `uvicorn` or `vite` command was typed. Output is a status table. Never restarts or modifies anything; if something is down, report and stop.

Invoked by `/go` before it declares "servers running," and by the user manually when they suspect a silent failure (process alive but wedged, socket bound but handler crashed, ABI load failure mid-boot).

## Services Expected

| Name | Port | Probe URL | Evidence of aliveness |
|---|---|---|---|
| Backend (FastAPI / uvicorn) | 8080 | `http://127.0.0.1:8080/` | HTTP 200 with HTML body (Sakura landing page served at `/`) |
| Sakura frontend (Vite dev) | 5175 | `http://127.0.0.1:5175/` | HTTP 200 with `<script type="module">` pointing at `/src/main.tsx` |
| Dashboard | 3333 | `http://127.0.0.1:3333/dashboard.html` | HTTP 200 with `<title>` containing "Dashboard" |
| Viewer iframe | served via 5175 | `http://127.0.0.1:5175/shared/viewer/viewer.html` | HTTP 200 with `AnimationDirector` string in body |

Backend is the only mandatory service. Sakura/Dashboard/Viewer are considered optional — flag as "not running" but do not treat as failure unless user specifically started them.

## Steps

Run these in parallel.

1. **Process check** — `lsof -iTCP:8080 -sTCP:LISTEN -P -n 2>/dev/null | tail -n +2`. Repeat for 5175 and 3333. Capture the PID and command name for each port.

2. **Curl each probe URL** with a 3-second timeout:
   ```
   curl --silent --show-error --max-time 3 -o /dev/null -w '%{http_code} %{size_download}B %{time_total}s' <url>
   ```
   Interpret: `200` = alive and serving. `000` = connection refused (nothing listening). `5xx` = listening but handler broken. `timeout` = wedged.

3. **Body-content sanity** — for the backend probe, also fetch the first 200 bytes and confirm it looks like HTML (`<!DOCTYPE` or `<html`). A process can bind a port and return garbage; we want a content check too.

4. **Log scan** — if `.venv/bin/python` is running, scan the last 200 lines of stderr for recent ABI-mismatch indicators. Common patterns to grep for (report each match):
   - `ImportError`
   - `Symbol not found`
   - `undefined symbol`
   - `better_sqlite3` followed by `NODE_MODULE_VERSION`
   - `onnxruntime` followed by any `error`
   - `segmentation fault`
   - `sqlite3.OperationalError`

   Log sources to check: `backend/storage/backend.log` if present, `~/Library/Logs/waifu-rt3d/` if present, otherwise the tail of any stdout captured via `run.sh`.

5. **Report table** — emit to stdout in this exact shape:
   ```
   === Server Status ===

   Service       | Port | PID    | Status  | Latency  | Body check
   --------------|------|--------|---------|----------|------------
   Backend       | 8080 | 47291  | OK 200  | 0.012s   | HTML ✓
   Sakura        | 5175 | 47352  | OK 200  | 0.008s   | module script ✓
   Dashboard     | 3333 | —      | DOWN    | —        | —
   Viewer iframe | 5175 | (same) | OK 200  | 0.021s   | AnimationDirector ✓

   Log scan: 0 ABI errors found in last 200 lines.
   Overall: backend alive, 1 optional service down (dashboard).
   ```

## Rules

- **Do not start anything.** If backend is down, say so and stop. The user decides whether to restart.
- **Do not claim success on non-200.** 4xx and 5xx are failures for a liveness probe even though they are "technically a response."
- **Time out aggressively.** 3 seconds per probe. A wedged server should be reported quickly, not blocked on.
- **Never modify files.** No log rotation, no process killing, no config edits. Report-only.
- **If Chrome/browser tools are available**, also verify the Sakura page actually renders (open the URL, check for a React-mounted `#root`). This catches the "server returns HTML but React failed to boot" case that pure curl misses. If Chrome tools are unavailable, say so in the report — do not silently skip.

## Integration with /go

When `/go` starts a service as part of a phase, it should immediately invoke `/verify-servers` before declaring that phase complete. Fail-fast is cheaper than discovering a silent boot failure three commits later.
