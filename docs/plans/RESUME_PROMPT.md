# Resume Prompt — Pointer Stub

This file used to carry per-session "next session" instructions, but it
drifts stale when sessions only run `/handoff` (which writes
`docs/SESSION_HANDOFF.md`) and skip `/checkpoint` (which used to refresh
this file). Treat the canonical sources as authoritative:

1. **`CURRENT_STATUS.md`** (project root) — durable status, schema version,
   completed milestones, prioritized "Next Tasks" list.
2. **`docs/SESSION_HANDOFF.md`** — ephemeral, overwritten by `/handoff`
   every session. Holds the freshest "what's pushed / what's broken /
   what to do next" snapshot.
3. **Latest plan in `docs/plans/YYYY-MM-DD-*.md`** — sorted by mtime,
   the most recent file is usually the active multi-phase plan.

If you are reading this from a `/pre-session` cold start, scan the three
files above instead. This stub exists only so `/pre-session` doesn't
report a missing-file warning.

If you want per-session resume instructions back, run `/checkpoint` and
the full ritual will rewrite this file.
