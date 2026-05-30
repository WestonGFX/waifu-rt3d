# Dev Note — Embodied Listening Cue (Bundle C)

**Date:** 2026-05-30 · **Branch:** `feat/psych-memory-engine`
**Type:** Avatar embodiment · **Backend/schema impact:** none

## What this is

The avatar now reacts when the *user* is speaking. The voice-duplex session
(`backend/voice/duplex.py`) already emits `{type:'state', state:'listening'|...}`
frames to the client — that backend was complete. The gap was purely that the
frontend never routed listening to the avatar. Now it does.

While the session is actively **listening**, she attends: gaze settles toward the
user and blinking calms. On release she returns to cursor-follow + neutral blink
so idle behaviour resumes.

## Flow

```
duplex.py _set_state(LISTENING) → {type:'state', state:'listening'}  [already existed]
  → useFullDuplexVoice handleEvent 'state'
  → useViewerStore.dispatchListeningState(state === 'listening')      [NEW]
  → postMessage {type:'listeningState', payload:{active}}
  → viewer.html: LookAt world-target → user (0,1.3,2.0) + BlinkController 'calm'
                 (release → setWorldTarget(null) + 'neutral')          [NEW, additive]
```

## Files changed
- `frontends/sakura/src/stores/viewerStore.ts` — `'listeningState'` command kind + `dispatchListeningState(active)`.
- `frontends/sakura/src/hooks/useFullDuplexVoice.ts` — route the existing `state` frame to `dispatchListeningState`.
- `frontends/shared/viewer/viewer.html` — additive `listeningState` handler reusing the LookAt world-target API + BlinkController (no new engine).
- `frontends/sakura/src/test/viewerStore.kokoroGaze.test.ts` — `dispatchListeningState` unit tests.

## Verified
- tsc clean; store dispatch unit tests pass (command kind, active flag, _seq).

## ⚠ Visual QA owed (not done — no live VRM headless)
The viewer.html cue is additive and reuses the exact LookAt API the shipped Kokoro
gaze wiring already uses, so it is low-risk — but it has **not been eyeballed on a
live avatar**. Before relying on it, walk this checklist with a VRM loaded + voice
mode on:

- [ ] Start voice mode → speak → avatar gaze settles toward you, blink visibly calms.
- [ ] Stop speaking (session leaves listening) → gaze returns to cursor-follow/idle, blink normal.
- [ ] Rapid listen→idle→listen cycles → no stuck gaze, no blink lock.
- [ ] During AI speaking (TTS) → listening cue not fighting the talk/lipsync layer.
- [ ] Tab hide/restore mid-listen → no stuck attentive target.
- [ ] Model-load failure / non-VRM mode → dispatch is a no-op (no throw).

If the gaze feels too fixed, soften by targeting cursor mode instead of a fixed
point: change `new THREE.Vector3(0,1.3,2.0)` to `null` for the active branch (then
listening just calms blink + keeps cursor-follow).

## Deferred (backlog)
**Greeting-on-return** — the `proactive/` system already generates context-aware
greetings; wiring it to fire on app startup/session-resume is a separate
startup-integration task (touches App.tsx/chatStore + a proactive trigger on mount).
Kept out of this change to avoid coupling avatar embodiment with the app-boot flow.

## For the next agent
The listening cue is wired end-to-end and unit-tested at the store boundary. The
only open item is visual tuning (above). For greeting-on-return, reuse
`backend/proactive/generator.py` + `triggers.py` (idle/return triggers already
exist) — route its output into the chat thread on mount; do not rebuild it.
