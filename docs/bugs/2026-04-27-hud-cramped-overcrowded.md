# Bug: HUD massively cramped / overcrowded after recent feature additions

**Reported:** 2026-04-27 (session 18 hand-on QA)
**Reporter:** chris
**Severity:** P1 (degraded daily UX — affects every session, every interaction)
**Status:** Confirmed by user, needs UX triage

## Symptom

User: "the HUD is massively cramped and crowded now from all the new
stuff we added holy moly".

Recent feature waves that each added HUD/toolbar surface area:
- Bond progression (Phases 1-6) — bond bar, level-up overlay, dev tab
- AIE Phases A+B — adaptive intelligence indicators
- NSFW mega-sprint — toolbar buttons (3+), 11 new overlays, intimacy tab
- Per-character scenarios — ScenarioPicker entry point
- AI Quick Replies
- Memory Browser entry (Ctrl+M shortcut also visible somewhere)
- Voice Orb / VoiceMode controls
- Director Mode controls
- 3 keyboard-shortcut additions in session 4

Each was a justified feature in isolation — together they've crossed
into UI saturation.

## What "cramped" likely means (to verify with screenshot)

- Toolbar / sidebar overflow: buttons running off-screen or wrapping
  awkwardly on M2 Pro at typical window size
- Visual noise: too many badges/dots/indicators competing for attention
- Discoverability collapse: new users (or returning users) can no longer
  scan and locate the feature they want
- Dead clicks: tightly packed buttons mean accidental hits

## Triage approach

This is not a single bug — it's a UX debt accumulation. Three viable
responses:

1. **Visibility tiers** — surface only the top-N most-used controls;
   hide the rest behind an "more" overflow menu (browser-style toolbar
   customization). Lowest disruption, doesn't kill any feature.
2. **Mode-based HUDs** — different toolbar contents in chat mode vs
   voice mode vs director mode vs intimacy mode. Already partially the
   case; could be much more aggressive.
3. **Settings-driven trim** — let the user toggle which HUD modules
   render. Heaviest config burden but maximum personalization.

Recommend (1) + a light dose of (2). Don't ship (3) first — it pushes
the curation problem onto the user.

## Next steps

1. Get a screenshot of the current HUD in normal chat mode.
2. Inventory every toolbar/HUD button + which feature added it + last
   session it was used (if telemetry exists).
3. AskUserQuestion: priority N controls to keep visible vs collapse.
4. Implement overflow menu pattern in shared toolbar component.
5. Estimate: ~8–12h for inventory + design + implementation + theme
   verification across 18 themes.

## Linked

- Known Sensitive Area: "No surprise UI elements — never add visible
  UI elements without explicit user approval" — this rule has been
  drifted-against multiple times across recent feature waves; the
  consequence is now visible.
