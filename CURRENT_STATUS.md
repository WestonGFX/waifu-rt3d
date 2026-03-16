# Current Status
- **Phase:** Photo Mode complete + game fixes + MoE agent system
- **Last completed:** Photo Mode, Gallery, game celebration, notification cleanup, inline fact editing
- **Schema:** v51 (screenshots table for Photo Mode gallery)
- **Failing tests:** 0 pytest failures (302 passed), 0 tsc errors
- **Branch:** master
- **Updated:** 2026-03-16

## Session 3 (Mar 16) — 10 commits

| Commit | Feature | Category |
|--------|---------|----------|
| `64ab9e9` | Photo Mode gallery backend — schema v51, GalleryManager, 6 API endpoints | Major Feature |
| `3ea4481` | Viewer extensions — enterPhotoMode, holdGesture, getCameraState, quality capture | Feature |
| `5aef474` | Photo Mode overlay — expression, pose, camera, background, capture controls | Major Feature |
| `92454c6` | Gallery overlay — thumbnail grid, lightbox, filtering, useGallery hook | Feature |
| `124444b` | Photo Mode hotkeys (Ctrl+Shift+P/G/S), watermark utility, quick capture | Feature |
| `922f846` | Photo Mode camera button in status bar toolbar | UX |
| `d3bba13` | Fix: 20 Questions wrong guess no longer ends game immediately | Bug Fix |
| `9b985e5` | Game win celebration — confetti + animated banner on all 7 games | Feature |
| `1a21a29` | Fix: subtler toasts, disable popup tips, remove What's New modal | UX Fix |
| `471c429` | Inline fact editing in Knowledge Graph panel (T2-16 partial) | Feature |

Also in this session:
- Fixed server version mismatch (5.31.0→5.34.0) that caused infinite What's New modal loop
- Health endpoint now uses `app.version` instead of hardcoded string
- MoE agent system: 7 specialized agents in `.claude/agents/` + upgraded `/go` skill (max 8 parallel)

## Session 2 (Mar 15) — 7 commits

| Commit | Feature | Category |
|--------|---------|----------|
| `a0d310f` | InsForge MCP + Antigravity Kit | Tools |
| `ba29996` | StreakBadge + FormatRulesEditor + Groq ASR dropdown | Frontend UI |
| `4b62a0b` | Portfolio "Share as Card" (CHARA v2 export) | Frontend UI |
| `5d9f786` | Expanded model catalog (30 → 45 models) | Data |
| `b8822c0` | Hardware-aware model catalog with HF links | Major Refactor |
| `344c1b1` | Tooltips and user guidance across new components | UX |
| `b16c5af` | Comprehensive README update (v49, 286 tests, 8 features) | Docs |

## Previous Sprint (Mar 15 Session 1) — 11 commits

| Commit | Feature | Category |
|--------|---------|----------|
| `1c293af` | T0-24: GGUF quant reference table | Docs |
| `a4361dc` | T0-1: Desktop pet mute state | Fix |
| `cfd9c78` | T0-2: Portfolio export (html2canvas) | Feature |
| `35d89c5` | T0-22+23: Content + quality model ratings | Data |
| `ed1e03e` | T1-27: Director Mode (dual-layer OOC) | Major Feature |
| `905f6a7` | T0-4: Prompt template macros | Feature |
| `434dc0c` | T0-3: Message branch navigation | Feature |
| `3966fd1` | T0-25: Stream reset sentinel | Robustness |
| `43ad059` | T1-7: Regex output formatting (v48) | Feature |
| `ba29897` | T1-8: Interaction rewards/streaks (v49) | Feature |
| `57ce9dd` | T1-5: Groq ASR integration | Feature |

## Next Tasks
1. Nyx (Dae) character bible (BLOCKED — awaiting archetype from user)
2. T2-12: Emotion Mirroring via Webcam
3. T2-13: Local TTS Expansion (Fish Audio, Dia, F5-TTS)
4. T1-6: Soundscape Player audio assets (DEFERRED)
5. Pick next items from feature menu — `docs/plans/2026-03-15-actionable-implementation-specs.md`

## Assessed as Already Done
- T2-11: Proactive AI Messages — Feature C scheduler already built (v16/v17)
- T1-9: Character Card PNG Export — Feature A8 already built
- T2-16: Memory Visualization — MemoryPanel + UserKnowledgePanel cover it (inline edit added this session)
