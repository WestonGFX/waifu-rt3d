# Voice & Audio Polish — Execution Plan

**Date:** 2026-05-08
**Status:** Draft — ready for review
**Schema:** v80 (no new migration required for Phase 1 or 2; Phase 3 adds one column)
**Effort estimate:** ~14–18h AI-assisted (~12x human-equivalent per project convention)
**Depends on:** No active in-flight PRs conflict with voice paths

---

## Context

The voice infrastructure in waifu-rt3d is architecturally mature but unpolished at the edges that matter most during daily use. The full picture verified via grep:

**What is shipped and working:**
- `VoiceDuplexSession` state machine (`backend/voice/duplex.py`) — 4-state cycle: `idle → listening → processing → speaking`. Barge-in (interrupt) is wired and working via a `{"type":"control","action":"interrupt"}` JSON frame.
- WebSocket endpoint `/ws/voice` at `backend/server.py:14586`. The session receives binary WebM/Opus frames, converts via ffmpeg (`audio_utils.py`), runs ASR, calls the LLM, and streams back TTS audio chunks as binary frames.
- **19 TTS adapters** in `backend/tts/adapters/`: Kokoro, ElevenLabs, Edge-TTS, Piper, Fish Audio, XTTS, Chatterbox, GPT-SoVITS, Kitten, MeloTTS, Bark, F5-TTS, MetaVoice, StyleTTS2, Parler, Dia, CosyVoice, Voxtral, PinokioGeneric. Resolved via `backend/tts/registry.py:get_tts(cfg)`.
- **Sentence-level chunked TTS** already exists (`server.py:5177–5188`, `_tts_chunk_async` at `5069`). The `use_chunked_tts` flag gates it; when active, sentences are synthesised as they complete rather than waiting for the full reply. This is the closest thing to streaming TTS the codebase has today.
- `VoiceModulator` (`backend/tts/voice_modulator.py`) — maps 25 emotions to provider-aware TTS parameter deltas (speed, pitch, energy, pause_before). Wired into the SSE stream via `_apply_emotion_tts`.
- **Per-character voice**: `voice_id`, `tts_provider`, `voice_config` JSON columns on `characters`. `_pick_tts_voice(char, emotion)` reads per-character voice ID and emotion overrides. The character object includes `emotion_voice_overrides` JSON.
- **VoiceOrb** (`frontends/sakura/src/components/VoiceOrb.tsx`) — 5 states: `disconnected | idle | listening | processing | speaking`. Driven by `inputLevel` and `outputLevel` floats from `useFullDuplexVoice.ts`.
- **VoiceConversationPanel** — renders the orb in two sizes (80px large view, 36px compact), driven by `useVoiceMode` hook in `ChatThread.tsx:323`.
- **Voice Gallery** (`VoiceGallery.tsx`) — card-based browser in Settings Voice tab (session 37, commit `8b32b6a`).
- **Voice Sample Uploader** (`VoiceSampleUploader.tsx`) — per-character sample upload at `/api/characters/{char_id}/voice-sample`.
- **Voxtral adapter** (Mistral cloud TTS), **Parler** adapter (local voice-description-driven cloning), voice wand endpoint, inline audio player, `voice_message_url` schema field (session 33, commit `000282d`, schema v74).

**Daily pain points (verified):**
1. No way to A/B compare TTS providers against the same text — "which one sounds better?" is a vibes call every time.
2. No latency telemetry — impossible to know if speech-to-first-audio is 400ms or 4s.
3. VoiceOrb has no "error" state variant — a failed connection looks the same as `disconnected`.
4. No live transcript display during voice mode — the user cannot see what the AI is saying.
5. Voice Gallery has no preview/play button, no rename, no delete, no set-as-default-for-character.
6. No per-character voice preset selector in the character card / quick settings.
7. `use_chunked_tts` reduces perceived latency but is not exposed in Settings as a toggle.

**What this plan does NOT do:**
- Lip sync via viseme detection (VRM blendshape → audio amplitude) — deferred; high-complexity, low-impact for personal use.
- Voice memo (user records audio, character "hears" it) — deferred; depends on Whisper integration work.
- Multi-language TTS — all adapters already accept whatever voice ID the user configures; no platform-level work needed.
- "Talk like X" celebrity clones — legally and technically risky; deferred.
- On-device Parler training / LoRA pipeline — that is AIE Phase C territory.

---

## Locked Decisions

| Decision | Resolution | Notes |
|---|---|---|
| Streaming TTS definition | Sentence-level chunking (already exists) | Token-by-token TTS requires adapter-level streaming APIs; none of the 19 adapters expose that. Sentence chunking is the practical ceiling. |
| Latency telemetry storage | In-memory rolling buffer only (no DB write) | Schema churn not worth it for personal-use metrics. Expose via a dedicated API endpoint. |
| TTS benchmark UI | Inline in Settings > Voice tab | Not a separate overlay. Reuse existing VoiceGallery card layout patterns. |
| Per-character voice preset | Already exists (`voice_id`, `voice_config` columns) | Polish = expose in the character's Quick Settings panel, not new schema. |
| Audio normalization | Server-side, post-synthesis | Normalise in `TTSAdapter.speak_cached()` return path using ffmpeg — same tool already used for audio conversion. |

---

## Phase 1 — TTS Provider Benchmark UI

**Why.** Choosing a TTS provider today is pure guesswork. A blind A/B test panel in Settings — same 5-sentence paragraph, every enabled provider, side-by-side audio players — turns "which one sounds best?" from a vibes question into an answerable one. This is highest-leverage: it directly addresses the daily pain of provider selection and takes under a day.

**How.**

### 1.1 Backend: `/api/tts/benchmark` endpoint

Add to `backend/server.py` in the `# --- TTS / AUDIO ---` section.

```python
@app.post("/api/tts/benchmark")
async def run_tts_benchmark(request: Request) -> JSONResponse:
    """Synthesise a test paragraph with every enabled TTS provider in parallel.

    Args:
        request: JSON body with optional ``text`` (str, max 500 chars).

    Returns:
        ``{"ok": True, "results": [{"provider": str, "audio_url": str,
           "latency_ms": int, "error": str | None}]}``
        One entry per provider in ``services.tts.providers`` that is enabled.
        Failed providers return ``"error"`` with the exception message and
        ``"audio_url": null`` — they do not abort the whole run.
    """
```

Implementation notes:
- Read enabled providers from `cfg["services"]["tts"]["providers"]` — skip any with `"enabled": false`.
- Synthesise in parallel via `asyncio.gather(*[run_in_threadpool(adapter.speak_cached, text, {}) for adapter in adapters], return_exceptions=True)`.
- Record wall-clock latency per provider with `time.perf_counter()` around each synthesis call.
- Return audio URLs as `/files/audio/<filename>` (existing file-serving route).
- Default benchmark text: a module-level `_BENCHMARK_PARAGRAPH` constant (5 sentences, ~120 words, includes punctuation, a question, and an emotional sentence — exercises prosody).

### 1.2 Frontend: Benchmark panel in Settings > Voice tab

File: `frontends/sakura/src/views/SettingsView.tsx` — find the existing Voice tab section (search for `VoiceGallery` render call). Add a collapsible `<details>` section below the gallery titled "Provider Benchmark".

UI layout:

```
╔═════════════════════════════════════════════╗
║  Provider Benchmark               [Run Now] ║
║  (runs all enabled providers, ~30s)         ║
╠═════════════════════════════════════════════╣
║  Kokoro        [▶ play]  412ms   ★ Pick     ║
║  Edge-TTS      [▶ play]  180ms   ★ Pick     ║
║  ElevenLabs    [▶ play]  920ms   ★ Pick     ║
║  Voxtral       [▶ play] 1840ms   ★ Pick     ║
║  ...                                        ║
║                                             ║
║  [Custom text field — override paragraph]   ║
╚═════════════════════════════════════════════╝
```

- "Run Now" button calls `api.post('/api/tts/benchmark', { text: customText || undefined })`.
- Each result row shows an `<audio controls>` element with `src={row.audio_url}`, latency in ms, and a "Pick" button that calls `api.saveConfig({ 'services.tts.active_provider': row.provider })` and refreshes the active provider indicator.
- Loading state: spinner per-row (providers complete at different speeds). Use `Promise.allSettled` semantics — each row renders independently as results arrive via polling or a second WebSocket event. Simpler: POST resolves after all providers complete; show a single spinner during the wait, then all rows at once. (Parallel streaming is over-engineering for personal use.)
- Error rows show the error string in `var(--color-text-muted)` italic with no play button.

### 1.3 `api.ts` additions

```typescript
/**
 * Run TTS provider benchmark — synthesise test paragraph with all enabled providers.
 *
 * @param text - Optional override text (max 500 chars). Uses server default if omitted.
 * @returns Array of per-provider results with audio URLs and latency.
 */
benchmarkTTS(text?: string): Promise<{
  ok: boolean;
  results: Array<{
    provider: string;
    audio_url: string | null;
    latency_ms: number;
    error: string | null;
  }>;
}>
```

### Verification

```bash
# Backend endpoint
curl -s -X POST http://localhost:8080/api/tts/benchmark \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, this is a benchmark test sentence."}' | python3 -m json.tool
# Expect: ok:true, results array with one entry per enabled provider.

# Backend test suite clean
.venv/bin/python -m pytest backend/tests/ -q --tb=line

# Frontend TypeScript
cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit

# Manual: Settings > Voice tab → Benchmark → click "Run Now" →
#   results render with audio players → click Play on each → sound plays →
#   click "Pick" on preferred → active provider indicator updates
```

**Effort:** 4–5h

---

## Phase 2 — Latency Telemetry + Chunked TTS Toggle

**Why.** The VoiceModulator and chunked TTS paths exist but there is no visibility into whether they are actually helping. A rolling latency display in the voice panel gives concrete data ("p50 speech-to-first-audio: 620ms") and the chunked TTS toggle surfaces a knob that has real impact on perceived responsiveness.

**How.**

### 2.1 Backend: in-memory latency ring buffer

Add to `backend/server.py` near the voice endpoint section:

```python
import collections

# Rolling window of recent TTS and ASR timing samples — no DB persistence needed.
# Format: {"ts": float, "phase": str, "ms": int}
# "phase" values: "asr", "llm_first_token", "tts_first_chunk", "tts_total"
_VOICE_LATENCY_RING: collections.deque = collections.deque(maxlen=200)
```

In `VoiceDuplexSession.run()` and `_stream_chat_response()`, add `time.perf_counter()` bracketing around:
- ASR call → `"asr"` entry
- Time from speech end to first SSE token from LLM → `"llm_first_token"` entry
- Time from speech end to first TTS binary frame sent → `"tts_first_chunk"` entry
- Total TTS synthesis time → `"tts_total"` entry

Add endpoint:

```python
@app.get("/api/voice/latency-stats")
async def get_voice_latency_stats() -> JSONResponse:
    """Return rolling p50 and p95 latency stats for recent voice sessions.

    Returns:
        Dict keyed by phase name, each containing ``{"p50": int, "p95": int,
        "n": int}`` values in milliseconds.  Empty dict if no samples yet.
    """
```

Implementation: read `_VOICE_LATENCY_RING`, group by phase, compute p50/p95 via `statistics.quantiles`.

### 2.2 Frontend: Latency stats panel in VoiceConversationPanel

File: `frontends/sakura/src/components/VoiceConversationPanel.tsx`.

Add a small stats row beneath the VoiceOrb (visible only when `state !== 'disconnected'`):

```
   ┌─────────────────────────────────────┐
   │  [ORB 80px]                         │
   │                                     │
   │  ASR p50: 380ms  TTS p50: 540ms     │
   │  LLM p50: 210ms  (n=12 samples)     │
   └─────────────────────────────────────┘
```

- Poll `/api/voice/latency-stats` every 10s via `useEffect` + `setInterval` while voice is active.
- Render in `var(--color-text-muted)` 0.65rem monospace. No animation — this is diagnostic, not emotional UI.
- Only render when `n > 0` to avoid showing `p50: 0ms` on a fresh session.

### 2.3 Settings: Chunked TTS toggle

File: `frontends/sakura/src/views/SettingsView.tsx` — Voice tab, beneath the TTS provider selector.

Add a toggle: **"Start speaking immediately (sentence-by-sentence)"** with a subtitle: "Plays TTS as each sentence completes instead of waiting for the full reply. Reduces perceived latency but may stutter on slow hardware."

This writes `cfg["tts"]["chunked"]` (boolean). The backend already reads `use_chunked_tts` from `cfg.get("tts", {}).get("chunked", True)` at `server.py:5179` — verify the exact key name and ensure the default matches the current default.

### Verification

```bash
# Latency stats endpoint
curl -s http://localhost:8080/api/voice/latency-stats | python3 -m json.tool
# After a voice session: expect phases asr/llm_first_token/tts_first_chunk/tts_total with p50/p95

# Manual: open VoiceConversationPanel → have a voice exchange → observe
#   latency rows update after the exchange completes
# Manual: Settings → Voice → toggle "Start speaking immediately" off → have exchange →
#   confirm full reply synthesised before any audio plays
```

**Effort:** 3–4h

---

## Phase 3 — Voice Gallery Polish (Preview, Rename, Delete, Set-Default)

**Why.** The Voice Gallery (session 37) shows voice cards but they are read-only display items. A gallery you cannot interact with is just a list. Preview playback, rename, delete, and set-as-character-default turn it into a tool the user actually manages day-to-day.

**How.**

### 3.1 Backend: three new voice-gallery endpoints

Add to `backend/server.py` in the existing voice section near `upload_voice_sample` at line 8933:

```python
@app.post("/api/voice-gallery/{voice_id}/preview")
async def preview_voice_gallery_item(voice_id: int) -> JSONResponse:
    """Synthesise a short preview clip for a voice gallery entry.

    Uses the voice's stored sample path (if available) or the active TTS
    adapter with the voice's ``voice_id`` field.  Returns an audio URL.
    """

@app.patch("/api/voice-gallery/{voice_id}/rename")
async def rename_voice_gallery_item(voice_id: int, request: Request) -> JSONResponse:
    """Rename a voice gallery entry.  Body: ``{"name": str}``."""

@app.delete("/api/voice-gallery/{voice_id}")
async def delete_voice_gallery_item(voice_id: int) -> JSONResponse:
    """Delete a voice gallery entry and its associated sample file."""
```

The "set as default for character" action uses the existing `PATCH /api/characters/{char_id}` endpoint with `{"voice_id": gallery_entry.voice_id}` — no new endpoint needed.

### 3.2 Frontend: VoiceGallery card actions

File: `frontends/sakura/src/components/VoiceGallery.tsx`.

Add three action buttons to each card footer row (Lucide icons: `Play`, `Pencil`, `Trash2`):

```
╔══════════════════════════════╗
║  [waveform / avatar]         ║
║  Voice Name          ★ 4.2   ║
║  ─────────────────────────   ║
║  [▶ Preview] [✎ Rename] [🗑] ║
╚══════════════════════════════╝
```

- **Preview:** calls `/api/voice-gallery/{id}/preview`, receives `audio_url`, plays via `new Audio(url).play()`. Button shows a spinner while loading; icon switches to a stop-square while playing.
- **Rename:** shows an inline text input replacing the name label (on confirm, `PATCH /api/voice-gallery/{id}/rename`). Blur or Enter confirms, Escape cancels.
- **Delete:** shows a confirm popover ("Delete this voice? This cannot be undone.") — two-step to prevent accidental deletion.

Add a "Set as default for character" button only when a character is active (read `activeCharId` from `appStore`). On click: `PATCH /api/characters/{activeCharId}` with `{ voice_id: entry.voiceId }`.

### 3.3 `api.ts` additions

```typescript
previewVoiceGalleryItem(voiceId: number): Promise<{ ok: boolean; audio_url: string }>;
renameVoiceGalleryItem(voiceId: number, name: string): Promise<{ ok: boolean }>;
deleteVoiceGalleryItem(voiceId: number): Promise<{ ok: boolean }>;
```

### Verification

```bash
# Preview endpoint
curl -s -X POST http://localhost:8080/api/voice-gallery/1/preview | python3 -m json.tool
# Expect: ok:true, audio_url pointing to /files/audio/...

# Delete endpoint (use a test entry, not a real one)
curl -s -X DELETE http://localhost:8080/api/voice-gallery/999 | python3 -m json.tool
# Expect: ok:false, error:"not found" (safe — 999 doesn't exist)

# Manual: Settings > Voice tab → VoiceGallery →
#   card appears → click Preview → audio plays →
#   click Rename → type new name → Enter → card updates →
#   click Delete → confirm popover → entry removed from list
```

**Effort:** 4–5h

---

## Phase 4 — VoiceOrb Error State + Live Transcript

**Why.** When the WebSocket drops or TTS fails, the orb goes silent and `disconnected` — indistinguishable from a clean session end. Adding an explicit `error` state with a red pulse gives the user the signal they need to restart. Live transcript display (scrolling text of what the AI is saying as it speaks) dramatically reduces the "did it hear me?" anxiety during voice sessions.

**How.**

### 4.1 VoiceOrb: error state

File: `frontends/sakura/src/components/VoiceOrb.tsx`.

Add `'error'` to the `VoiceSessionState` union type in `useFullDuplexVoice.ts` (and export it). In `VoiceOrb`, add a new animation branch for `state === 'error'`:

```typescript
state === 'error'
  ? { scale: [1, 1.08, 1], opacity: [0.8, 0.4, 0.8] }  // slow red pulse
  : ...
```

Core orb background for `error` state: `radial-gradient(circle at 35% 35%, #ff6b6b 0%, #e03131 100%)` — the only intentional hardcoded color in this file, because error is semantic and should NOT adapt to theme accent color. Document this exception in a comment.

State label text: `"error"` (already handled by the generic fallback — just ensure the label renders).

In `useFullDuplexVoice.ts`, transition to `'error'` state on receiving `{ type: 'error' }` events from the WebSocket, or on WebSocket `onerror`/unexpected close (anything that is not a user-initiated `disconnect()`).

In `useVoiceMode.ts`, propagate the error state up and show a toast notification via `appStore` with the error message.

### 4.2 VoiceConversationPanel: live AI transcript

File: `frontends/sakura/src/components/VoiceConversationPanel.tsx`.

The `useFullDuplexVoice` hook already fires `onAIToken` callbacks (verified: `VoiceEvent.type === 'ai_token'` at `useFullDuplexVoice.ts:11`). Add a `transcript` string state to the panel, build it by accumulating `onAIToken` tokens, reset it on each new `listening` state transition.

Render the transcript below the orb in a fixed-height scrollable `div` (max 4 lines, `overflow: hidden`, `text-overflow: ellipsis` on last line):

```
   ┌─────────────────────────────────────┐
   │         [ORB 80px]                  │
   │                                     │
   │  "I was just thinking about what    │
   │   you said earlier, actually. It    │
   │   reminded me of..."                │
   └─────────────────────────────────────┘
```

Style: `var(--color-text-secondary)` 0.85rem italic, fade-in animation on first character using Framer Motion `AnimatePresence`. Clear to empty string when state transitions back to `idle` after speech ends (300ms delay so the last words don't flash away).

The user transcript (what the user said) already appears via `onTranscript` — display it above the AI transcript in `var(--color-text-primary)` non-italic, smaller (0.75rem).

### Verification

```bash
# TypeScript — VoiceSessionState union must include 'error'
cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit

# Manual: start voice session → intentionally close backend → observe orb
#   transitions to red error pulse → status label reads "error"
# Manual: start voice session → speak a sentence → watch AI transcript
#   build token-by-token below the orb during speaking state
```

**Effort:** 3–4h

---

## File-Level Change-Set Summary

| Path | Status | Phase |
|---|---|---|
| `backend/server.py` | MODIFIED | 1, 2, 3 |
| `backend/voice/duplex.py` | MODIFIED | 2 (latency timing hooks) |
| `backend/tests/test_tts_benchmark.py` | NEW | 1 |
| `backend/tests/test_voice_latency.py` | NEW | 2 |
| `frontends/sakura/src/lib/api.ts` | MODIFIED | 1, 3 |
| `frontends/sakura/src/views/SettingsView.tsx` | MODIFIED | 1, 2 |
| `frontends/sakura/src/components/VoiceGallery.tsx` | MODIFIED | 3 |
| `frontends/sakura/src/components/VoiceOrb.tsx` | MODIFIED | 4 |
| `frontends/sakura/src/components/VoiceConversationPanel.tsx` | MODIFIED | 2, 4 |
| `frontends/sakura/src/hooks/useFullDuplexVoice.ts` | MODIFIED | 4 |
| `frontends/sakura/src/hooks/useVoiceMode.ts` | MODIFIED | 4 |

**No schema migration required for Phases 1, 2, or 4.** Phase 3 (rename/delete) operates on existing voice gallery rows — verify the voice gallery table structure before starting if the column names are unclear.

---

## Verification Matrix

| Phase | Automated | Manual |
|---|---|---|
| 1 — Benchmark | `pytest backend/tests/test_tts_benchmark.py -q` + `npx tsc --noEmit` | Settings > Voice > Benchmark → "Run Now" → every enabled provider renders a card with working audio player; "Pick" button updates active provider |
| 2 — Latency + Toggle | `pytest backend/tests/test_voice_latency.py -q` | `/api/voice/latency-stats` returns phases after a voice exchange; latency rows appear in VoiceConversationPanel; chunked TTS toggle changes synthesis behaviour |
| 3 — Gallery Polish | `npx tsc --noEmit` + manual endpoint curls above | Preview plays audio; Rename updates card label; Delete removes card with two-step confirm; Set-default changes character's voice_id |
| 4 — Orb Error + Transcript | `npx tsc --noEmit` | Error state visible on backend kill; live transcript builds during AI speech; user transcript appears above AI transcript; both clear on next listening cycle |
| All | `pytest backend/tests/ -q --tb=line` + `npx tsc --noEmit` — both clean before each commit | Full voice conversation (3 turns) completes without regression to existing barge-in, silence detection, or session reconnect behaviour |

**Audio listening checks** — for each phase that produces audio:
- Phase 1: same benchmark paragraph across 3+ providers. Confirm all play at similar perceptible volume (within ~6dB). If one is noticeably louder/quieter, note it — normalization is Phase 4's post-processing task.
- Phase 3: preview clip sounds like the stored voice sample (not the system default).
- Phase 4: live transcript matches what the character actually said (no truncation, no missed tokens).

---

## Risks + Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Benchmark hangs if one provider is slow (60s+ for Bark/MetaVoice on CPU) | Medium | Add a 30s per-provider timeout to `asyncio.gather` using `asyncio.wait_for`. Timed-out providers return `{"error": "timeout after 30s"}` and do not block other results. |
| `_VOICE_LATENCY_RING` grows stale across sessions | Low | `deque(maxlen=200)` is bounded. Old samples age out automatically. Stats endpoint documents that p50/p95 reflect the last 200 samples. |
| VoiceOrb `error` state hardcodes red color | Low | Document in-file that this is intentional — error color is semantic and must not follow theme accent. |
| `onAIToken` callback fires from the SSE stream path, not the duplex WS path — live transcript in VoiceConversationPanel may receive no tokens | High | Verify before implementing: check if the duplex `/ws/voice` path sends `ai_token` WS frames vs only final `ai_text`. If `ai_token` is absent in the WS path, implement a simpler character-by-character typewriter effect on the `ai_text` payload instead. |
| Gallery delete removes a file that is referenced as a character's `voice_sample_path` | Medium | Delete endpoint checks `characters` table for any row with `voice_sample_path` matching the file. If found, null out the column (or reject and ask the frontend to show a warning). |
| Benchmark POST blocks the FastAPI event loop if providers are slow | Medium | Use `asyncio.gather` with `run_in_threadpool` wrappers per provider — all providers synthesise in parallel without blocking the loop. Cap total providers at 10 per call. |
| WebSocket reconnect after backend restart already fragile | Existing | This plan does NOT touch reconnect logic. If reconnect breaks during testing, stop and document in CURRENT_STATUS.md before continuing. |

---

## Sequencing Notes

**Phase 1 first.** The benchmark endpoint is the highest-leverage item and touches no sensitive state. It can ship as a standalone commit without risk.

**Phase 2 second.** The latency ring buffer is additive and low-risk. The chunked TTS toggle is the one item that modifies existing behaviour — verify the key name `cfg["tts"]["chunked"]` exactly matches what `server.py:5179` reads before implementing the Settings toggle.

**Phase 3 third.** Voice Gallery changes are frontend-heavy with three new backend endpoints. No schema changes. Run the existing test suite before starting — the gallery table structure must be confirmed from `preflight.py` before writing DELETE logic.

**Phase 4 last.** The `error` state change touches `useFullDuplexVoice.ts`, which is the core WS state machine. The live transcript change requires verifying whether `ai_token` frames are actually sent over the duplex WS (the risk noted above). Resolve that before writing frontend code — do not implement a transcript that will never receive tokens.

**Commit cadence:** one commit per phase. Phases 1 and 2 can ship in the same session. Phases 3 and 4 are independent and can be done in either order if Phase 4's token-verification check resolves cleanly.

---

## Reuse Hooks

| Existing code | File:line | How this plan reuses it |
|---|---|---|
| `TTSAdapter.speak_cached()` | `backend/tts/adapters/base.py:91` | Phase 1 benchmark — call `speak_cached` on each adapter for cache-friendly repeated benchmark runs |
| `get_tts(cfg)` | `backend/tts/registry.py:23` | Phase 1 — instantiate one adapter per enabled provider for the benchmark |
| `run_in_threadpool` | `backend/server.py` (multiple) | Phase 1, 2 — wrap synchronous `speak_cached` calls from async endpoints |
| `_tts_chunk_async` | `backend/server.py:5069` | Phase 2 — add latency timing hooks around existing chunked synthesis calls |
| `DEFAULT_SILENCE_TIMEOUT_MS`, `DEFAULT_VAD_THRESHOLD` | `backend/voice/duplex.py:48,54` | Phase 2 — document in the latency stats response alongside the timing data |
| `VoiceEvent` type | `frontends/sakura/src/hooks/useFullDuplexVoice.ts:10` | Phase 4 — extend union with `'error'` state; `onAIToken` callback already in interface at line 40 |
| `useFullDuplexVoice` `onAIToken` callback | `useFullDuplexVoice.ts:40` | Phase 4 — wire into `VoiceConversationPanel` transcript accumulator |
| `appStore` toast/overlay registration | `frontends/sakura/src/stores/appStore.ts` | Phase 4 — show error notification on voice session failure |
| `VoiceGallery` card render loop | `frontends/sakura/src/components/VoiceGallery.tsx` | Phase 3 — add action buttons to existing card footer |
| `api.saveConfig` pattern | `frontends/sakura/src/views/SettingsView.tsx` (multiple) | Phase 1 benchmark "Pick" action, Phase 2 chunked TTS toggle |
| `_IMAGES_DIR` / file-serving pattern | `backend/server.py` (image gen section) | Phase 1 — same `/files/audio/<filename>` serving path already exists for TTS output |

---

## References

- `docs/conventions/llm-and-voice.md` — voice pipeline architecture, VoiceModulator usage, audio conversion via ffmpeg
- `backend/voice/duplex.py` — state machine, barge-in, silence detection constants
- `backend/tts/voice_modulator.py` — 25-emotion parameter profiles, provider-aware param names
- `backend/tts/registry.py` — 19 adapter routing, config key structure
- `backend/tts/adapters/base.py` — `TTSAdapter` base class, `speak_cached` cache contract
- `frontends/sakura/src/hooks/useFullDuplexVoice.ts` — WS lifecycle, `VoiceSessionState` type, `onAIToken` callback
- `frontends/sakura/src/components/VoiceOrb.tsx` — existing 5-state animation system
- `MEMORY.md` ("Active Work") — 8 commits unpushed, push gate clear, next tasks list

---

## Forward-Looking

After this plan ships, the natural next frontier for voice is **lip sync**. The `viewerStore.ts` already has a `playTTS` route that dispatches to the VRM iframe (`frontends/sakura/src/stores/viewerStore.ts:121`). The viewer (`frontends/shared/viewer/viewer.html`) has a `ParticleSystem` and `EffectComposer` but no viseme system. A Phase 5 could wire audio amplitude from TTS binary frames into VRM blendshape weights (`VRM.expressionManager`) for a simple "mouth open/close" effect — not phoneme-accurate, but visually impactful at low implementation cost. That work belongs in a separate plan after this one ships.

**Conversational pacing** (micro-pauses between sentences, end-of-utterance breath sounds) is already partially implemented via `pause_before` in the VoiceModulator emotion profiles. Completing it would require injecting silent PCM frames between TTS chunks in `_tts_chunk_async` — achievable in ~2h as a follow-on.

---

## Locked Decisions — Post-Draft Session 2026-05-08

After the prd-writer agent drafted this plan, the user requested verification of the two open codebase-fact questions. Both verified by the orchestrator below.

| # | Question | Verified Answer | Plan Impact |
|---|----------|----------------|-------------|
| 8 | Does duplex `/ws/voice` send `ai_token` frames? | **YES.** `backend/voice/duplex.py:501-504` emits `{"type": "ai_token", "data": {"token": ...}}` per LLM token; final `ai_text` event sent on `done`. | Phase 4 live transcript display is **unblocked**. Build directly on `ai_token` stream. Typewriter-on-`ai_text` fallback not needed. |
| 9 | Voice gallery exact table + schema | **No dedicated table.** Cloned voice samples are stored as files at `backend/storage/voice_samples/{char_id}/voice_sample.{ext}` and tracked via the `characters.voice_sample_path` column (one sample per character). The "Voice Gallery" UI in Settings (`frontends/sakura/src/components/VoiceGallery.tsx`) is a TTS-provider-voice browser (read-only, served via `/api/tts/voices`), NOT a cloned-sample manager. | **Plan Phase 3 conflated two surfaces.** See Phase 3 re-scope below. |

### Phase 3 Re-Scope (Voice Cloning Sample Management)

The original Phase 3 assumed a multi-row "voice gallery" table. There isn't one. The actual surfaces are:

1. **TTS provider voices** — already polished via the session-37 `VoiceGallery.tsx` card-based browser. No further work needed.
2. **Cloned voice samples** — one-per-character, file-system + `characters.voice_sample_path`. The "preview / rename / delete / set-as-default" verbs from the original Phase 3 don't fully apply: there's only one sample per character, so "set-as-default" is automatic on upload, "rename" is meaningless (file name is fixed), and "delete" = clear the column + remove the file.

Replace original Phase 3 with:

**Phase 3 — Voice Cloning Sample UX Polish (3-4h)**

- **Preview button on `VoiceCloning` Settings section** (frontends/sakura/src/views/SettingsView.tsx Voice tab). Plays the existing `voice_sample_path` audio inline. Audio element + Play/Pause toggle. ~30 min.
- **Re-record / replace flow.** The current upload flow likely either appends or silently overwrites. Make replacement explicit: when a sample exists, show "Replace sample" button instead of "Upload sample"; confirmation modal. ~45 min.
- **Two-step delete.** "Clear voice sample" button: first click reveals "Confirm delete?"; second click removes file + nulls column. New endpoint `DELETE /api/characters/{char_id}/voice-sample` (calls `unlink()` + DB UPDATE). ~1h.
- **Waveform preview on upload.** When user picks a file, render a static waveform via `<canvas>` from sample's PCM bytes (decoded via `AudioContext.decodeAudioData`). Length validation: warn under 6s, hard-cap over 60s. ~1.5h.

Total Phase 3 effort: 3-4h (was 4-5h with the original misframing).

If the user wants a multi-sample-per-character gallery in the future (allow Sakura to have 5 cloned voices for variety), that's a **separate schema-design plan** requiring a `voice_samples` table with `(id, char_id, name, file_path, created_at, is_default)` columns. Out of scope for this polish plan.

### Phase 4 Confirmation (No Changes)

Per Decision #8, Phase 4 (VoiceOrb error state + live transcript) ships as originally planned, using the confirmed `ai_token` event stream. No re-scope.

Total plan effort revised: 14-18h → **13-17h** AI-eq (Phase 3 saved ~1h via re-scope).

---
## Status Log
- 2026-05-09 Phase 1: ✓ TTS benchmark endpoint + Settings UI — commit 0e79979
- 2026-05-09 Phase 2: ✓ Latency ring buffer, ASR/TTS instrumentation, /api/voice/latency-stats, VoiceConversationPanel stats row — commit 8cebf27
- 2026-05-09 Phase 3: ✓ VoiceSampleUploader — waveform preview, two-step delete, explicit replace label, length validation — commit dc28c5c
- 2026-05-09 Phase 4: ✓ VoiceOrb error state, useFullDuplexVoice error transitions, toast on voice error — commit 9dd1744
