# Codebase Fixables Audit — 2026-05-31

**Why:** User requested a massive list of fixes/improvements tackled by an agent team. Read-only fan-out scan (8 parallel scouts) → 77 raw findings → deduped/triaged to 47.

**Method:** `discover-fixables` workflow (run `wf_b8931b72-0cf`, 8 scouts: backend-server, backend-modules, frontend-stores, frontend-components, tests-coverage, lint-types, deadfiles-docs, config-build) → triage agent dedup + sensitivity/independence classification.

## ⚠ Triage agent false positives (caught in main-Claude verification)

The triage agent flagged these as "0 importers / dead" — **all three were WRONG**, verified live:
- `VocabPanel.tsx` — **2 importers** (NOT dead) → keep
- `WhatsNewModal.tsx` — **4 importers** (NOT dead) → keep
- `chess.js` dep — **USED** by `GamePanel.tsx` + `ChessGame.tsx` → keep

Lesson: never auto-delete on a scout's "0 callers" claim without a direct grep. Only `StreakBadge.tsx` was genuinely orphaned (0 importers, confirmed) and deleted.

Also: `ChatThread.tsx` is in `src/views/`, not `src/components/`.

## Disposition legend
- **TEAM** — auto-fix agent team (worktree fix → verify → merge)
- **TEAM+QA** — fix + dedicated psych-qa-hunter recall-correctness test (user-approved for memory)
- **INLINE** — main Claude did it directly (cruft/cleanup)
- **HELD** — manual review (runtime-drift config, viewer/cross-store, sensitive layout/context)

## High (5)

| # | Finding | File | Disposition |
|---|---------|------|-------------|
| 1 | POST /api/tts re-wraps `HTTPException(400)` as 500 via broad except | server.py:6779 | TEAM (user-approved) |
| 2 | Orphan git worktree (579MB dup tree) | .claude/worktrees/agent-a0d87ae7 | INLINE |
| 3 | ChatThread.tsx (1382 lines) zero test coverage (Priority #5) | views/ChatThread.tsx | TEAM (new test) |
| 4 | `llm.link` flat keys contradict nested object (save flips routing) | app.json:117-118 | HELD (runtime file) |
| 5 | `auto_start_lmstudio` nested=false vs top-level=true | app.json:58/130 | HELD (runtime file) |

## Med (18)

| Finding | File | Disposition |
|---------|------|-------------|
| Lore keyword naive substring containment | lore/matcher.py | TEAM |
| Tiered memory over-fetch k*4 → can return <top_k | memory/tiered_memory.py:303 | TEAM+QA |
| Decay rerank assumes cosine[0,1], vec0 defaults L2 | memory/tiered_memory.py:806 | TEAM+QA |
| wizardStore.dismissTip refs non-existent advanceQueue | stores/wizardStore.ts:156 | TEAM |
| deleteCharacter leaves chatStore/viewer stale | stores/appStore.ts:308 | HELD (cross-store/viewer) |
| Dead pendingMemorialScene fires fetches | stores/appStore.ts:226 | HELD |
| useSchedulerPoller recreates interval per char switch | hooks/useSchedulerPoller.ts:38 | TEAM |
| Auto-compact write can land on wrong session | stores/chatStore.ts:491 | TEAM |
| Voice WS reconnect re-arms connect() after unmount | hooks/useFullDuplexVoice.ts:322 | TEAM |
| biome.json broken under 2.4.10 → lints 0 files | biome.json:2 | TEAM |
| MemoryBrowser 14 icon buttons no aria | components/MemoryBrowser.tsx | TEAM |
| SettingsView 4857 lines only export/import coverage | components/SettingsView.tsx | HELD (SettingsContext drift) |
| chatStore.pin known flake | test/chatStore.pin.test.ts | TEAM |
| ASR config conflict browser vs faster_whisper | app.json:71/132 | HELD (runtime file) |
| 19 keys absent from _KNOWN_CFG_KEYS | server.py:194 | TEAM (user-approved) |
| requirements.txt unbounded >= deps | requirements.txt | INLINE (pin) |
| Stale .disabled presets + lock | .claude/ | INLINE ✅ done |
| Stray DB/audio scratch blobs | backend/data.db etc. | INLINE ✅ done |

## Low (24)

| Finding | File | Disposition |
|---------|------|-------------|
| ModelRouter.route substring false positives | llm/router.py | TEAM |
| OpenAI parse IndexError on empty choices | server.py:4251 | TEAM (user-approved) |
| count_messages_tokens ignores list/tool_calls | llm/token_counter.py:103 | TEAM (user-approved) |
| extract_facts auto-accepts confidence-less facts | knowledge/extractor.py | TEAM |
| mood get_mood_prefix unguarded subscripts | mood/engine.py | TEAM |
| AgentRunner protocol-detection swallows all exc | agent/runner.py | TEAM |
| VoiceModulator drops pitch most providers | tts/voice_modulator.py | TEAM |
| duplex _send_json logs serialize-fail + continues | voice/duplex.py | TEAM |
| TieredMemoryManager fresh conn per call | memory/tiered_memory.py:728 | TEAM+QA |
| SSE event payload typed `any` | stores/chatStore.ts:368 | HELD (boundary) |
| Dead StreakBadge (0 importers) | components/StreakBadge.tsx | INLINE ✅ deleted |
| ~~Dead VocabPanel~~ FALSE — 2 importers | components/VocabPanel.tsx | KEEP |
| ~~Dead WhatsNewModal~~ FALSE — 4 importers | components/WhatsNewModal.tsx | KEEP |
| ~~chess.js orphan~~ FALSE — used | package.json | KEEP |
| chatStore.continueGeneration zero callers | stores/chatStore.ts:725 | TEAM (delete) |
| 6× <img> missing alt | Gallery/Lightbox/MoodBoard/Portfolio/ModelPanel/ModelArena | TEAM |
| Sidebar avatar img missing alt | components/Sidebar.tsx:1117 | HELD (sensitive layout) |
| ScenarioPicker/PhotoModeOverlay icon buttons no aria | components/ | TEAM |
| smoke-test.spec.ts.bak | e2e/ | INLINE ✅ done |
| MemoryBrowser PRD/md in src | src/components/ | INLINE ✅ →docs/specs/ |
| incrementMessageCount fragile read-after-set | stores/wizardStore.ts:188 | TEAM |
| No lint/format/typecheck npm scripts | package.json | INLINE |
| default_frontend='neon' stale | app.json:2 | HELD (runtime file) |

## Inline cleanup completed this session
- Trashed: backend/data.db (0b), artifacts/tsc.txt, smoke-test.spec.ts.bak, scheduled_tasks.lock, 0-byte audio mp3s, playwright dump
- Moved: waifu.db.bak → _BACKUP_ROOT/db-baks/, 3 .disabled presets → .claude/settings-presets/, MemoryBrowser.md + .PRD.md → docs/specs/
- Deleted: StreakBadge.tsx (confirmed orphan)
- .gitignore: +.DS_Store, artifacts/, .playwright-mcp/, *.db.bak, .claude/*.lock
- Worktree removal (.claude/worktrees/agent-a0d87ae7, 579MB): in progress
</content>
</invoke>
