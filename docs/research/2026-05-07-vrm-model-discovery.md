# VRM Model Discovery Research
**Date:** 2026-05-07 (browsed 2026-05-07/08)
**Topic:** Free high-quality VRM models for waifu-rt3d
**Why:** Current app has 11 VRM characters (Panicandy, Nyx/Ayane, Viper/Sable, Seraph/Hana, Kitsune, Raine, Tsuki, Luna, Glitch, Dae, Alana) but many share the same Kitsune.vrm file. The goal is to identify additional free VRMs to fill aesthetic gaps and provide variety.

---

## Summary of Findings

- **Best source for clean-license VRMs:** VRoid Hub's official CC0 collection (6 models, all VRM 1.0)
- **Best individual free model:** Ao maid / Kimi Desktop Mate — both allow all uses including commercial, no attribution required
- **VRM format split:** Hub models are roughly 60% VRM 0.0, 40% VRM 1.0. The app's viewer (`three-vrm`) supports both but VRM 1.0 is preferred
- **Blend shapes:** All VRoid-made models include the standard VRM expression set (Neutral, Joy, Fun, Angry, Sorrow, Surprised, Blink_L, Blink_R, A/E/I/O/U visemes) — sufficient for the app's lipsync and emotion systems
- **Booth.pm:** Lower average quality for free models; paid models (¥300–¥3000) are higher quality but require purchase and license check per item
- **52blendshapes tool:** GitHub `hinzka/52blendshapes-for-VRoid-face` adds 52 additional expression blend shapes (Perfect Sync compatible) to any VRoid model post-export — relevant for richer emotion states

---

## Part 1: VRoid Hub Official CC0 Collection

**Source:** `https://hub.vroid.com/en/characters/4593660874193246717`
**Creator:** Coatie (Koh-Tee) — converted beta-era VRoid Studio sample models to VRM 1.0
**License:** **CC0** (public domain, all uses allowed, no attribution required, can redistribute altered versions)
**Format:** VRM 1.0 (all models)

All 6 models below come from this collection and share the same CC0 license.

### Model 1: Vita (vrm1.0)
- **VRoid Hub URL:** https://hub.vroid.com/en/characters/4593660874193246717/models/7942721847119018516
- **Aesthetic:** Sci-fi / kuudere. Short white/silver hair, blue-green eyes, futuristic teal bodysuit with glowing geometric patterns and high platform boots. Multiple variants visible in thumbnails (dark coat, pink lolita, teal sci-fi)
- **Personality archetype fit:** Cool-type, tech/android, kuudere
- **Stats:** 112 likes, 10,142 views, 703 downloads (most downloaded of the CC0 collection)
- **Blend shapes:** Standard VRoid expression set (Neutral, Joy, Angry, Sorrow, Surprised, Fun, Blink_L/R, A/E/I/O/U visemes)
- **Format:** VRM 1.0
- **License:** CC0 — Avatar Use Allow / Violent Allow / Sexual Allow / Political Allow / Antisocial Allow / Corporate Allow / Individual commercial Allow / Redistribution Allow / Alterations Allow / Attribution: Not required
- **Polygon count:** Not listed (typical VRoid: 50k–100k tris)
- **Notes:** 3+ outfit variants. Confirmed renders in browser 3D viewer. Ideal for sci-fi / android / kuudere archetype gap.

### Model 2: Darkness_Shibu
- **VRoid Hub URL:** https://hub.vroid.com/en/characters/4593660874193246717/models/5008365454243263529
- **Aesthetic:** Gothic / elf. Short lavender/silver hair, pointed elf ears, crimson/pink eyes, long black gothic coat with silver buttons and buckles, cross-laced platform boots. Pale skin.
- **Personality archetype fit:** Gothic, sadodere, dark-type, mysterious
- **Stats:** 126 likes, 3,763 views, 362 downloads (2nd most popular)
- **Blend shapes:** Standard VRoid expression set
- **Format:** VRM 1.0
- **License:** CC0 (same as collection)
- **Notes:** 4+ outfit variants in thumbnails. Fully rendered in browser. The best goth candidate found. Comparable archetype to current Viper/Sable character.

### Model 3: Victoria_Rubin
- **VRoid Hub URL:** https://hub.vroid.com/en/characters/4593660874193246717/models/2541762389476121920
- **Aesthetic:** Magical girl / sweet. Blonde/mint twin-tail hair with green hairband, blue eyes, white frilly dress with pink accents and gold details, white thigh-highs. Pastel palette.
- **Personality archetype fit:** Deredere, genki, sweet/cheerful, magical girl
- **Stats:** 83 likes, 3,715 views, 252 downloads
- **Blend shapes:** Standard VRoid expression set
- **Format:** VRM 1.0
- **License:** CC0 (same as collection)
- **Notes:** 3 variants visible. Fully rendered in browser. Strong candidate for a cheerful/sweet archetype gap.

### Model 4: Sendagaya_Shino
- **VRoid Hub URL:** https://hub.vroid.com/en/characters/4593660874193246717/models/7956589129305596116
- **Aesthetic:** Schoolgirl / casual everyday. Dark hair (multiple styles: long straight, short brown, dark ponytail). Conservative/natural aesthetic, Japanese school vibe.
- **Personality archetype fit:** Everyday girl, possibly dandere or normal-type
- **Stats:** 84 likes, 2,546 views, 276 downloads
- **Blend shapes:** Standard VRoid expression set
- **Format:** VRM 1.0
- **License:** CC0 (same as collection)
- **Notes:** 4+ variants. Preview loads but no full render in unauthenticated browser (thumbnail confirms dark-haired schoolgirl aesthetic).

### Model 5: Sendagaya_Shibu
- **VRoid Hub URL:** https://hub.vroid.com/en/characters/4593660874193246717/models/1289835761881499317
- **Aesthetic:** Similar to Shino (same "Sendagaya" series). Japanese casual/school. Brown or dark hair variant.
- **Stats:** 63 likes, 1,598 views, 155 downloads
- **Blend shapes:** Standard VRoid expression set
- **Format:** VRM 1.0
- **License:** CC0 (same as collection)
- **Notes:** Likely a variant/complement to Shino rather than a distinct archetype. Lower priority if Shino is already included.

### Model 6: Vivi
- **VRoid Hub URL:** https://hub.vroid.com/en/characters/4593660874193246717/models/6231093367809816026
- **Aesthetic:** Brown curly/wavy hair, soft aesthetic — thumbnail suggests lolita or cute casual style
- **Stats:** 58 likes, 1,463 views, 129 downloads
- **Blend shapes:** Standard VRoid expression set
- **Format:** VRM 1.0
- **License:** CC0 (same as collection)
- **Notes:** Fewer downloads; softer aesthetic. Potential fit for an innocent/childlike archetype.

---

## Part 2: High-Quality Free Models (Non-CC0)

### Model 7: Ao — Maid (VRM 1.0)
- **VRoid Hub URL:** https://hub.vroid.com/en/characters/1245908975744054638/models/5095341574274335587
- **Creator:** 白い白米 (Shiroi Hakumai)
- **Aesthetic:** Classic maid. Dark short hair with white maid headband/bow, black-and-white maid uniform with frilly apron, subtle anime style. Clean and well-crafted.
- **Personality archetype fit:** Maid, obedient/service, can be dandere or genki
- **Stats:** 412 likes, 12,022 views, **1,387 downloads** — very high engagement
- **Blend shapes:** Standard VRoid expression set (VRM 1.0)
- **Format:** VRM 1.0
- **License:** "Yes" downloadable. Conditions: Avatar Allow / Violent Allow / Sexual Allow / Political Do NOT allow / Antisocial Do NOT allow / **Corporate Allow / Individual commercial Allow** / Redistribution Allow / Alterations Allow / Attribution: Not required. Effectively CC0 with minor political/antisocial use restrictions (irrelevant to this app).
- **VRoid file (.vroid):** Also sold on Booth for ¥300 (editable source file — not required for VRM use)
- **Notes:** Highest-quality free maid model found. No attribution required. Fills a major aesthetic archetype gap. The witch variant is also available at the same character page.

### Model 8: Ao — Witch
- **VRoid Hub URL:** https://hub.vroid.com/en/characters/1245908975744054638/models/2338813411564378208
- **Creator:** 白い白米 (same as Ao maid)
- **Aesthetic:** Witch/dark magic. Same character as Ao but in witch hat and dark outfit. Gothic-adjacent but more fantasy.
- **License:** Same as Ao maid (see above)
- **Notes:** Two variants of the same character. Could use one or both. Lower priority than the maid variant unless a witch/caster archetype is needed.

### Model 9: Kimi — Desktop Mate (Black Suit variant)
- **VRoid Hub URL:** https://hub.vroid.com/en/characters/7972506988434619525/models/6927143458482212705
- **Creator:** Toriss
- **Aesthetic:** Cool gothic catgirl. Black short hair with black cat ears, black-framed glasses, black crop top with straps, black thigh-highs with garters. Sleek and modern. #CIS #Ghotic #Sexy #animal_girl
- **Personality archetype fit:** Kuudere, tsundere, cool-type, catgirl
- **Stats:** 233 likes, **21,826 views**, 1,794 downloads — the highest viewcount of all models researched
- **Blend shapes:** Standard VRoid expression set
- **Format:** VRM 0.0 (confirmed)
- **License:** "Yes" downloadable. Conditions: Avatar Allow / Violent Allow / Sexual Allow / **Corporate Allow / Individual commercial Allow** / Redistribution Allow / Alterations Allow / Attribution: Not required. Essentially CC0-equivalent.
- **Notes:** 3 outfit variants (cityscape, casual, military-adjacent). Specifically designed and tagged for desktop companion apps ("Desktop Mate"). Most popular free VRM model found. The VRM 0.0 format is supported by `@pixiv/three-vrm` (0.x compat mode) but VRM 1.0 is preferred for the app. Worth testing.

### Model 10: Mira (Free VRM Model)
- **VRoid Hub URL:** https://hub.vroid.com/en/characters/798195718463045479/models/3677916360028688826
- **Creator:** Reira // Dahlia
- **Aesthetic:** Human/cat hybrid. Pink and blue outfit, cat features. Shy personality described by creator ("shy but nice"). Sweet/pastel aesthetic.
- **Character details (from creator):** Name: Mira, Age: 16, Species: Human/cat, Gender: Female, Personality: Shy but very nice
- **Stats:** 294 likes, 21,438 views, 1,099 downloads
- **Blend shapes:** Standard VRoid expression set
- **Format:** VRM 0.0
- **License:** "Yes" downloadable. Conditions: Avatar Allow / Violent Do NOT allow / Sexual Do NOT allow / Corporate Do NOT allow / **Individual commercial: Do NOT allow** / Redistribution Allow / Alterations Allow / Attribution: Required. — **CC-BY-NC equivalent**. Acceptable for non-commercial use (current app state).
- **Notes:** Very popular. Good fit for dandere/shy archetype. Attribution required (must credit Reira // Dahlia). Non-commercial restriction — acceptable until app monetizes.

### Model 11: Pastel (Free VTuber Model)
- **VRoid Hub URL:** https://hub.vroid.com/en/characters/6933068319521707258/models/5421768628497152084
- **Creator:** Peach (VTuber creator)
- **Aesthetic:** Yumekawaii bunny girl. Brown hair, blue eyes, large pink/red angel-like wings, pink/pastel outfit, bunny ear accessories. Energetic and cheerful.
- **Character details:** Bunny girl, loves gaming and videos, pastel colors, energetic/sweet/caring
- **Tags:** #bunny #pink #yumekawaii #cute #brown_hair #blue_eyes #OC
- **Stats:** 300 likes, 7,079 views, 659 downloads
- **Blend shapes:** Standard VRoid expression set
- **Format:** VRM 0.0
- **License:** "Yes" downloadable. Avatar Allow / **Individual commercial: Non-profit activities only** / Redistribution Allow / Alterations: Do NOT allow / Attribution: Required. — Non-commercial-only, no modifications, attribution required.
- **Notes:** Strong genki/sweet archetype. No alterations allowed = cannot retexture or modify. Attribution required. Non-commercial only. Fills a distinct pastel/bunny aesthetic gap.

---

## Part 3: Models Reviewed and Rejected

| Model | Reason |
|---|---|
| Comms_Xexco Hyper (VRoid Hub) | "No" — data cannot be downloaded from Hub; view-only |
| Cat girl / Neko Girl (Loecreatio) | "Yes (download is not allowed)" — view-only on Hub |
| Anime Style Material Sample | Not a character model — it's a toon shader test sphere |
| Free Model!~ (NyXStella) | Very low quality (58 downloads), non-profit only, no alterations |
| AvatarSample_A/B/C | License status unclear — older docs say CC0, current Hub pages say NOT CC0. Contradictory. Do not use without verification. |

---

## Part 4: Models Not Yet Verified (Candidate Pipeline)

These appeared in search results but were not browsed due to time. Recommended for follow-up:

| Model | URL | Notes |
|---|---|---|
| Kagamine Rin 2024 Remaster | https://hub.vroid.com/en/characters/2019895182152903577/models/4690659974218720484 | Fan model of Vocaloid character — likely CC-BY-NC, identity restrictions may apply |
| !FREE MODEL! (1278246170916209621) | https://hub.vroid.com/en/characters/1278246170916209621/models/7722886495741165213 | Unknown license/aesthetic — verify |
| Free Vtuber model (4317926248011780233) | https://hub.vroid.com/en/characters/4317926248011780233/models/8661342154054597183 | Unknown quality/license |
| Cute Girl (2503439612197798282) | https://hub.vroid.com/en/characters/2503439612197798282/models/750486011465311872 | Unknown |
| d camellya (4250782183425611666) | https://hub.vroid.com/en/characters/4250782183425611666/models/3929227719036843807 | High viewcount in search, check license |

---

## Part 5: Booth.pm Assessment

**Verdict:** Not worth extensive browsing for free models.

- Booth.pm has 3,280+ items tagged "free vroid model" but the free tier is generally low quality
- High-quality models on Booth are typically ¥300–¥3,000 (paid)
- License terms per-item vary and must be manually verified for each
- The Ao maid creator uses Booth for the `.vroid` editable source (¥300) but the VRM itself is free on VRoid Hub
- **Recommendation:** Only pursue Booth if a specific paid model is needed for a specific archetype not covered by Hub free models. A budget of ¥1,000–¥3,000 per model would unlock significantly higher-quality assets.

---

## Part 6: VRM Blend Shapes — Standard Expression Support

All VRoid Studio–exported models include the following blend shape clips automatically:

**Emotion expressions:**
- `neutral`, `joy` (happy), `fun` (excited), `angry`, `sorrow` (sad), `surprised`
- Some models also include: `blink`, `blink_extra` (anime >< style)

**Visemes (lip sync):**
- `aa`, `ee`, `ih`, `oh`, `ou` (or A/E/I/O/U — used by the app's lipsync system)

**Independent blinks:**
- `blink_l`, `blink_r` (used for winking)

**VRM 1.0 expression names** (standardized):
- `happy`, `sad`, `angry`, `surprised`, `relaxed`, `neutral`, `blink`, `blinkLeft`, `blinkRight`, `aa`, `ee`, `ih`, `oh`, `ou`

**VRM 0.0 expression names** (legacy, mapped by three-vrm):
- `Joy`, `Angry`, `Sorrow`, `Fun`, `A`, `I`, `U`, `E`, `O`, `Blink`, `Blink_L`, `Blink_R`

The app's `AnimationDirector` and `LipSyncLayer` in `viewer.html` support both naming conventions via `@pixiv/three-vrm`'s backward-compatibility layer.

**52 BlendShapes Tool** (`hinzka/52blendshapes-for-VRoid-face` on GitHub):
- Adds 52 additional blend shapes + auxiliary shapes to any VRoid model
- Supports iPhone Perfect Sync (ARKit face tracking)
- Requires Unity to apply — post-export workflow, not needed for basic use
- Only relevant if adding advanced face capture support later

---

## Part 7: VRM Integration Guide for waifu-rt3d

### Step 1: Drop the VRM file
```
backend/storage/avatars/ModelName.vrm
```

### Step 2: Upload via API (preferred — handles DB registration)
```bash
curl -X POST http://localhost:8080/api/upload/avatar \
  -F "file=@path/to/model.vrm"
# Returns: {"ok": true, "url": "/files/avatars/model.vrm", "type": "vrm"}
```
The server endpoint is `POST /api/upload/avatar` (line 8794 of `server.py`). It sanitizes the filename and saves to `backend/storage/avatars/`.

### Step 3: Create the character record
```bash
curl -X POST http://localhost:8080/api/characters \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CharacterName",
    "system_prompt": "You are ...",
    "vrm_model_url": "/files/avatars/ModelName.vrm",
    "avatar_url": "/files/avatars/ModelName.png",
    "model_type": "vrm",
    "voice_id": "voice_id_here",
    "tts_pitch": 1.0,
    "tts_rate": 1.0
  }'
```

### Step 4: Add portrait image
Place a PNG thumbnail at `backend/storage/avatars/ModelName.png` — used as the character card avatar in the Sakura UI.

### Step 5: Load in viewer
The viewer receives a `loadCharacter` postMessage from `viewerStore.ts`:
```javascript
{ type: 'loadCharacter', payload: { modelUrl: '/files/avatars/ModelName.vrm' } }
```
The `loadModel()` function in `viewer.html` (line 6486) auto-detects VRM vs GLB by file extension and runs full VRM humanoid initialization including expressions, spring bones, and AnimationDirector setup.

### Database fields used
- `characters.vrm_model_url` — served at `/files/avatars/...`
- `characters.avatar_url` — 2D portrait (PNG), used in UI cards
- `characters.model_type` — set to `"vrm"` for VRM files
- `app_config.vrm_scale`, `vrm_offset_x`, `vrm_offset_y` — global VRM position tuning

### VRM 0.0 vs 1.0 compatibility
- VRM 1.0 models: full native support, preferred
- VRM 0.0 models: supported via `@pixiv/three-vrm` backward-compat mode; expressions and spring bones may behave slightly differently
- Both formats work in the current viewer — no code changes needed

---

## Part 8: Prioritized Acquisition Recommendations

| Priority | Model | Source URL | License | Archetype Filled |
|---|---|---|---|---|
| 1 | **Vita vrm1.0** | hub.vroid.com/en/.../4593660874193246717/models/7942721847119018516 | CC0 | Sci-fi / android / kuudere |
| 2 | **Darkness_Shibu** | hub.vroid.com/en/.../4593660874193246717/models/5008365454243263529 | CC0 | Goth / dark elf |
| 3 | **Victoria_Rubin** | hub.vroid.com/en/.../4593660874193246717/models/2541762389476121920 | CC0 | Sweet / magical girl / deredere |
| 4 | **Ao — Maid (VRM 1.0)** | hub.vroid.com/en/.../1245908975744054638/models/5095341574274335587 | ~CC0 (all allow, no attribution) | Maid / domestic |
| 5 | **Kimi Desktop Mate** | hub.vroid.com/en/.../7972506988434619525/models/6927143458482212705 | ~CC0 (all allow, no attribution) | Catgirl / kuudere / cool |
| 6 | **Sendagaya_Shino** | hub.vroid.com/en/.../4593660874193246717/models/7956589129305596116 | CC0 | Everyday / schoolgirl |
| 7 | **Mira** | hub.vroid.com/en/.../798195718463045479/models/3677916360028688826 | CC-BY-NC | Shy catgirl / dandere |
| 8 | **Pastel** | hub.vroid.com/en/.../6933068319521707258/models/5421768628497152084 | NC, no mods, credit | Bunny girl / yumekawaii / genki |

**Priority 1–4** are recommended for immediate use — CC0 or equivalent, no restrictions on commercial use, no attribution required. These can be integrated without any ongoing compliance overhead.

**Priority 5** (Kimi): excellent quality and popularity; VRM 0.0 format needs test in viewer before committing.

**Priority 6–8**: Non-commercial acceptable. Attribution and NC restrictions are manageable for a private/non-commercial build. Avoid if/when commercial launch approaches.

---

## Part 9: Aesthetic Coverage Map

| Archetype | Current Models | Gap Filled By |
|---|---|---|
| Genki / bubbly | Kitsune | Victoria_Rubin (upgrade), Pastel |
| Goth / dark | Viper/Sable | Darkness_Shibu (stronger goth with elf ears) |
| Cool / kuudere | Nyx/Ayane | Vita (sci-fi), Kimi (catgirl) |
| Maid / domestic | — (none) | **Ao maid** (fills major gap) |
| Catgirl / neko | Kitsune | Kimi, Mira |
| Schoolgirl / everyday | Raine | Sendagaya_Shino |
| Sweet / magical | Seraph/Hana | Victoria_Rubin |
| Sci-fi / android | — (none) | **Vita** (fills major gap) |
| Witch / dark fantasy | — (none) | Ao witch variant |
| Bunny girl | — (none) | Pastel |

---

## References

- VRoid Hub CC0 collection: https://hub.vroid.com/en/characters/4593660874193246717
- VRoid FAQ — sample model conditions: https://vroid.pixiv.help/hc/en-us/articles/4402614652569
- 52 BlendShapes tool: https://github.com/hinzka/52blendshapes-for-VRoid-face
- VRM samples GitHub (madjin): https://github.com/madjin/vrm-samples
- VRM blend shape spec: https://vrm.dev/en/univrm/blendshape/univrm_blendshape/
- How to find free VRoid models: https://live3d.io/blog/how-to-find-free-vroid-vrm-models-to-use
- Desktop Mate custom VRM guide: https://www.desktop-mate.com/mods/desktop-mate-custom-vrm-models-with-vroid-hub/
- VRoid Hub conditions of use: https://vroid.pixiv.help/hc/en-us/articles/360016417013
