# Animation Packs — Download Script URLs Are All Dead

**Date filed:** 2026-05-06 (session 29 wave 2 → formalized session 30)
**Severity:** P2
**Component:** `tools/download_animation_packs.py`, `backend/data/animation_manifest.json`, `frontends/sakura/src/components/AnimationBrowser.tsx`
**Discovered via:** session 29 wave 2 browser QA + manual URL probe

## Summary

The Animation Library UI lists 36 clips in `backend/data/animation_manifest.json`, but 0/36 files exist on disk. Every clip renders as greyed-out / unclickable. The download script `tools/download_animation_packs.py` references two source packs whose URLs all return 404:

- `--pack sillytavern` → `https://github.com/SillyTavern/SillyTavern-VRM-Assets.git` returns 404. The actual SillyTavern org has `Extension-VRM` but no animation files in it.
- `--pack vrm-expression-library` → multiple jsdelivr CDN URLs all return 404.

Result: every user has a working Animation Library UI that cannot animate anything.

## Repro

1. Open Sakura, select character with VRM model.
2. Open 3D viewer panel.
3. Click "Animation Library" accordion.
4. **Expected:** browseable list of clips, click → plays on character.
5. **Actual:** 36 clip rows render but all are greyed out (file not on disk); click does nothing.

Direct probe:
```bash
curl -sI https://github.com/SillyTavern/SillyTavern-VRM-Assets.git
# HTTP/2 404
```

## Suggested Fix Direction

Three options, in order of long-term durability:

1. **Bundle a small CC0 set with the app.** Find ~12-20 CC0-licensed VRMA clips (idle, talk, wave, nod, shake-head, surprised, sad, happy, dance) and bundle them in `backend/data/animations/`. Pros: zero network dependency, works offline, fastest restore of feature. Cons: ~5-15MB repo size growth, need to vet licenses.
2. **Find current working VRMA sources.** Survey: VRoid Hub public anims, Mixamo (FBX → VRMA conversion), individual creators on BOOTH. Update script URLs and resume the download flow. Pros: keeps script-driven workflow, smaller repo. Cons: external sources can disappear again (this bug is the second time we've hit this), manual conversion steps.
3. **Hybrid — bundle minimum CC0 set + opt-in download for expanded library.** App ships functional out of the box; download script becomes additive ("download 30 more from XYZ source") rather than required. Pros: best UX. Cons: most work — both options 1 + 2 in one PR.

Recommend option (1) for now (~1-2h) + add option (3) as a follow-up plan.

## Pre-existing animation crash (already fixed)

Note: the AnimationBrowser used to crash the entire app when this list rendered, because `clip.emotions.join()` ran on an undefined `emotions` field for tag-less clips. Fixed session 29 wave 2 commit `10519fa` with `clip.emotions?.join(', ') ?? ''`. The browser now renders the empty list cleanly — this bug is the next layer down (no clips to animate even when the list works).

## Related

- Session 29 wave 2 QA sweep `docs/testing/qa-sweep-2026-05-06-wave1.md` flagged this as P1 there; downgraded to P2 here because chat works without animations and 3D viewer renders idle animations from the bundled VRM. Animations are a polish layer, not core path.
