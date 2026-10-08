# Docs Index — start here (humans and Claude chats)

**Last updated:** 2026-10-08. If you are a Claude session (new or already running in another chat), read this file first, then the three "read first" files below. Keep this index current: when you add a plan, reference doc or mock-up, add a line here in the same commit.

## Read first, in this order
1. [`CURRENT_STATUS.md`](../CURRENT_STATUS.md) — live state: branch, schema version, test counts, active work.
2. [`docs/plans/RESUME_PROMPT.md`](plans/RESUME_PROMPT.md) — what to do next, overwritten each session.
3. [`docs/SESSION_HANDOFF.md`](SESSION_HANDOFF.md) — ephemeral hand-off detail from the last session.
4. The newest plan for the thread you are joining (table below).

## Active work threads (so chats know about each other)
| Thread | Owner doc | State on 2026-10-08 |
|---|---|---|
| **Kokoro model benchmark → fix → Emotional RAG** (Mac session) | [`plans/2026-10-04-kokoro-model-bench-and-fix.md`](plans/2026-10-04-kokoro-model-bench-and-fix.md), `tools/bench/README.md` | Harness built, real-model sweep NOT run yet. Emotional RAG migration is now **v91** (v90 taken, see below). |
| **Script-style chat · thinking card · reply animation** (UI session) | [`plans/2026-10-08-script-style-chat-segments.md`](plans/2026-10-08-script-style-chat-segments.md) + [`reference/chat-script-and-thinking.md`](reference/chat-script-and-thinking.md) | Phases 1–3 + reply animation shipped locally on `claude/busy-planck-rg90lh` (PR #5). Pending: polish look pick, composer live-colouring (phase 4), model prompt for tags (phase 5), opt-in training export. |
| Avatar motion / embodiment (Stage 2–3) | `plans/2026-06-14-stage3-ai-motion.md`, `plans/2026-06-14-stage2b-p1-click-to-walk.md` | Paused since 2026-06-22. |

**Shared facts that bite across threads:** schema is **v90** (`messages.thinking`, `messages.raw_output`); any new migration is v91+. PR #5 bundles the bench harness *and* the chat fixes. Dev server defaults to the dark Blurple theme. Never test chat in incognito (it drops the user's message from the prompt).

## Where things live
| Need | Go to |
|---|---|
| Every setting + HUD element (frontend prefs, screens, shortcuts, themes) | [`reference/settings-and-hud-inventory.md`](reference/settings-and-hud-inventory.md) |
| Backend config keys (`backend/config/app.json`) | [`SETTINGS_REFERENCE.md`](SETTINGS_REFERENCE.md) |
| How script messages / thinking card / reply animation work | [`reference/chat-script-and-thinking.md`](reference/chat-script-and-thinking.md) |
| Visual mock-ups (open in a browser; light/dark toggles) | [`design/`](design/) — `2026-10-08-script-chat-looks-mockup.html`, `2026-10-08-thinking-panel-options-mockup.html` |
| Plans (cumulative — append, never overwrite) | [`plans/`](plans/) and [`plans/PLAN_INDEX.md`](plans/PLAN_INDEX.md) |
| Research | [`research/`](research/) (dated files) |
| Conventions per code area | [`conventions/`](conventions/) |
| Architecture decisions | [`decisions/`](decisions/) |
| What gets saved where and when | [`DOCUMENT_LIFECYCLE.md`](DOCUMENT_LIFECYCLE.md) |
| Release / QA reports | [`testing/`](testing/) |
| Session summaries | [`sessions/`](sessions/) |

## House rules that apply to every thread
Project rules are in [`CLAUDE.md`](../CLAUDE.md). The ones people forget: schema changes only through `backend/preflight.py` (append-only); no push/PR while an active `OPEN BUG` / `UNFIXED` / `⚠ BLOCKER` marker is in `CURRENT_STATUS.md` or `SESSION_HANDOFF.md`; no single-letter keyboard shortcuts; Lucide icons only (no emoji); theme variables only (check 1 light + 1 dark theme); no new visible UI without the owner's approval.
