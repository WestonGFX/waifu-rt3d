# Resume: Waifu-RT3D — Post-Workflow Overhaul (Mar 25, 2026)

## WHO I AM

I'm Chris. Sole developer of Waifu-RT3D, a commercial AI companion platform with 3D anime avatars + local LLM integration. AI-assisted implementation is ~12x faster than traditional estimates. Desktop-only app.

**3 dev machines:** Mac M2 Pro (24GB unified), Win RTX 5080 (16GB), Win RTX 3070 (8GB). M2 Pro is the GPU floor. 8-9B models run fast, 14B is too slow on M2 Pro.

## WHAT HAPPENED THIS SESSION (7 commits)

### Workflow Overhaul (Waves 1-5)
| Commit | What |
|--------|------|
| `80d3ca9` | Doc infrastructure: specs/, sessions/, decisions/, plan README + index |
| `3c64ebc` | Convention guides (4 files) + FEATURE_MASTERLIST.md + COMPLETED_FEATURES.md |
| `97e1cee` | Enhanced checkpoint skill + CLAUDE.md soul/research rules + CURRENT_STATUS/STATUS_HISTORY split |
| `3ba43a8` | Renamed 21 plan files to YYYY-MM-DD format + updated index |
| `603ae2a` | README update: schema v49→v60, tests 286→887, 8 new features/endpoints/tables |
| `7678fb0` | Committed 24 plan files to docs/plans/ (git-tracked now) |

### Earlier This Session (Phases 17-20A)
| Commit | Phase | What |
|--------|-------|------|
| `7d394ce` | 18C-D | Content gating frontend UI + legacy migration (schema v59) |
| `9fe3bf1` | 17 | Animation library + sequencer + state machine v2 |
| `b03fcae` | 19 | On-device learning — signals, behavior, privacy (schema v60) |
| `426f48f` | 20A | Model catalog (24 LLMs, 10 TTS, 6 STT) + workflow research |

**Tests: 887 passing. Schema: v60. tsc clean.**

## WHAT TO DO NOW

### Priority 1: Phase 16 — AI Model Ecosystem Analysis
- NOT STARTED. Needs research + planning first.
- Analyze current AI model landscape for companion apps
- Evaluate local vs cloud tradeoffs, new model releases

### Priority 2: docs/FEATURES.md
- Public-facing feature summary (Phase 20B remainder)
- Quick task — just a condensed version of FEATURE_MASTERLIST.md

### Priority 3 (optional): Settings Cleanup
- `.claude/settings.local.json` — 142 lines, could trim to ~30
- Cosmetic, everything works fine

## KEY FILES TO READ FIRST

1. `CURRENT_STATUS.md` — rolling window status (<50 lines)
2. `docs/FEATURE_MASTERLIST.md` — 56 features across 6 tiers
3. `docs/plans/PLAN_INDEX.md` — index of all plan files
4. `docs/DOCUMENT_LIFECYCLE.md` — where everything lives
5. `docs/STATUS_HISTORY.md` — full phase completion record + estimates

## KEY RULES

- **Resume = implement immediately.** Use `/go` to execute.
- **Desktop-only app** — no mobile
- **Use `.venv/bin/python`** for ALL Python commands
- **Commit after each task** with phase reference
- **Use TaskCreate** for visible progress tracking in Claude Code UI
- **Convention guides are docs, NOT rules** — live in docs/conventions/, not .claude/rules/
- **CURRENT_STATUS.md stays <50 lines** — overflow goes to STATUS_HISTORY.md
- **Plan files are git-tracked** in docs/plans/ AND ~/.claude/plans/

## ARCHITECTURE

| Component | Stack | Key Files |
|-----------|-------|-----------|
| Backend | FastAPI, SQLite v60, Python 3.14 | `backend/server.py` (~13K lines) |
| Frontend | React 19, Zustand, Vite | `frontends/sakura/src/` |
| 3D Viewer | Three.js, VRM (iframe) | `frontends/shared/viewer/viewer.html` (~5.7K lines) |
| Memory | sqlite-vec, EmbeddingProvider (MiniLM default) | `backend/memory/tiered_memory.py` |
| Content | 4-level gating + intimacy tracking | `backend/content/` |
| Adaptive | On-device learning + AI journal | `backend/adaptive/` |
| Bond | 0→100 progression + gifts + stories | `backend/bond/` |
| LLM | Smart fallback, 5 providers | `backend/llm/` |
| Tests | 887 pytest, tsc clean | `backend/tests/` |

**13 characters, 18 themes, schema v60, 887 tests.**
