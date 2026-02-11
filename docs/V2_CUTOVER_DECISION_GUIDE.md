# V2 Default-Cutover Decision Guide

## Goal
Choose between:
1. Core-first cutover (recommended): promote after core flow + hardening gates pass.
2. Full-feature cutover: hold default switch until near-complete feature parity.
3. Hybrid cutover (recommended in practice): core + reliability slice, then switch default.

For full scope and stage-based feature boundaries, see `docs/V2_IMPLEMENTATION_TRACKS.md`.

## Recommendation
Use core-first cutover unless one of these is true:
1. You are contractually blocked from shipping partial capability.
2. You cannot support a temporary `/legacy` fallback.
3. You have enough capacity to absorb a longer stabilization window.

## Fast Decision Tree
1. Is chat/character/settings/memory/viewer your primary user path?
- No: use full-feature cutover.
- Yes: continue.

2. Can `/v2` and legacy run side-by-side for 1 release cycle?
- No: use full-feature cutover.
- Yes: continue.

3. Can you monitor and rollback within 30 minutes?
- No: use full-feature cutover.
- Yes: core-first cutover.

## Scorecard (0-2 each)
Score both options and pick the higher total.

1. Time-to-value
- 0: 6+ weeks to visible value
- 1: 3-5 weeks
- 2: 1-2 weeks

2. Delivery risk
- 0: high integration uncertainty
- 1: moderate uncertainty
- 2: low uncertainty with safe fallback

3. Team load
- 0: context-switch heavy, high burnout risk
- 1: manageable with some crunch
- 2: sustainable weekly pace

4. Rollback safety
- 0: rollback unclear or costly
- 1: rollback possible with manual steps
- 2: rollback is quick and rehearsed

5. User impact
- 0: users blocked if a feature is missing
- 1: mild disruption
- 2: core value intact

Interpretation:
- 9-10: pick this option confidently.
- 7-8: valid, but add mitigation before commit.
- <=6: avoid this option.

## Practical Defaults
1. Keep `/` as current Neon until cutover gate passes.
2. Keep `/v2` as preview and test surface.
3. Promote `/v2` to default only when:
- Core flow parity passes.
- 7-day stability window has no P0/P1 defects.
- Rollback drill is tested.
4. Keep legacy route available for at least one release cycle after cutover.
