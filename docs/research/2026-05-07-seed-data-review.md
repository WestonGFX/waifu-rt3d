# Character Seed Data Review — 2026-05-07

**Source:** `backend/storage/app.db` (schema v75)  
**Characters:** 14 total (IDs 1-6, 8-15)

---

## Summary Matrix

| ID | Name | System Prompt | Lite Prompt | VRM | Voice Provider | Avatar Source | Mood | Proactive |
|----|------|:---:|:---:|:---:|---|---|:---:|:---:|
| 1 | Rin (Akane) | ✅ 11.3k | ✅ 1.9k | Panicandy | edge-tts | rin_street_race | ❌ off | ❌ |
| 2 | Tsundere (Raine) | ⚠️ 1.5k* | ✅ 2.2k | Viper | ❌ blank | raine_portrait | ✅ | ❌ |
| 3 | Ayane (Yuki) | ✅ 14.1k | ✅ 2.5k | Nyx | ❌ blank | nyx_portrait | ✅ | ❌ |
| 4 | Genki (Kitsune) | ✅ 3.4k | ✅ 2.0k | ❌ none | ❌ blank | kitsune_portrait | ✅ | ❌ |
| 5 | Hana (Momoka) | ✅ 10.4k | ✅ 2.4k | Seraph | ❌ blank | seraph_portrait | ✅ | ❌ |
| 6 | Sable (Kuroha) | ✅ 12.9k | ✅ 2.4k | Viper | ❌ blank | viper_portrait | ✅ | ❌ |
| 8 | Shiori (Nana) | ✅ 12.8k | ✅ 2.1k | ❌ none | ❌ "None" | shiori_pixel | ✅ | ❌ |
| 9 | Mika (Mikazuki) | ✅ 14.1k | ✅ 2.4k | ❌ none | ❌ "None" | ⚠️ sable_data_room | ✅ | ❌ |
| 10 | Kaede (Suzuha) | ✅ 12.2k | ✅ 2.0k | ❌ none | ❌ "None" | ⚠️ seraph_sky_garden | ✅ | ❌ |
| 11 | Luna (Tsukimi) | ✅ 13.8k | ✅ 2.7k | ❌ none | ❌ "None" | tsuki_portrait | ✅ | ❌ |
| 12 | Yuki (Shirayuki) | ✅ 12.7k | ✅ 1.8k | ❌ none | ❌ "None" | ⚠️ panicandy_portrait | ✅ | ❌ |
| 13 | Dae (Neciridae) | ✅ 6.7k | ✅ 1.8k | Panicandy | edge-tts | ⚠️ kitsune_live_concert | ❌ off | ✅ |
| 14 | Alana Calloway | ✅ 14.4k | ✅ 1.8k | ❌ none | ❌ "None" | alana_avatar | ✅ | ❌ |
| 15 | Brittney | ⚠️ 58 chars | ❌ empty | ❌ none | piper | ⚠️ viper_portrait | ✅ | ❌ |

---

## Issues by Priority

### P1 — Brittney is a stub character
**system_prompt:** Only 58 characters — clearly a test/placeholder. No lite prompt.  
**personality_traits:** Empty array. No scenario, no chara tags.  
**Avatar:** Reuses Sable's `viper_portrait.png`.  
**Recommendation:** Either flesh out fully or hide from the character list until ready.

### P2 — Voice provider is blank/invalid for 11 of 14 characters
Characters 2-6 have `provider = ""` (empty string). Characters 8-14 have `provider = "None"` (the Python string literal, not NULL).  
**Impact:** TTS will fail silently or fall back to default voice. The voice selector in Settings shows the voice_id (`raine_v1`, `ayane_v1`, etc.) as a custom voice, but there's no mapping to an actual TTS provider.  
**Recommendation:** Set these characters to a known working provider (e.g., edge-tts with a valid voice_id, or piper with an installed voice).

### P2 — Avatar URL mismatches (4 characters using wrong images)
- **Mika [9]** → `sable_data_room.png` (Sable's concept art, not Mika's)
- **Kaede [10]** → `seraph_sky_garden.png` (Hana/Seraph concept art)
- **Yuki [12]** → `panicandy_portrait.png` (Rin's VRM model screenshot)
- **Dae [13]** → `kitsune_live_concert.png` (Genki's concept art)
- **Brittney [15]** → `viper_portrait.png` (Sable's portrait)

### P2 — Tsundere's lite prompt is LONGER than full prompt
`system_prompt`: 1,491 chars | `system_prompt_lite`: 2,166 chars  
The lite version should be a compressed subset for compact context mode. Having lite > full is backwards.  
**Recommendation:** Review and compress Tsundere's system_prompt_lite.

### P2 — 8 of 14 characters have no VRM model
Characters without VRM: Genki, Shiori, Mika, Kaede, Luna, Yuki, Alana, Brittney.  
The 3D viewer renders a blank/placeholder for these characters.  
**Recommendation:** Either assign shared VRM models (acceptable placeholder) or source new VRM files.

### P3 — Rin and Dae have mood system disabled (`mood_enabled=0`)
All other characters have mood enabled. Rin (the primary character) is missing mood-driven emotional responses.  
**Recommendation:** Enable mood for Rin unless there's a deliberate design reason.

### P3 — Personality traits NULL for 6 characters
Shiori, Mika, Kaede, Luna, Yuki, Alana, Dae all have NULL `personality_traits`.  
The traits field is used by mood engine and context assembly.

### P3 — All 14 characters missing CHARA V2 fields
`backstory`, `chara_description`, `image_style`, `mes_example`, `scenario`, `post_history_instructions`, `creator_notes`, `chara_tags` — all NULL for all characters.  
**Known/planned:** Character Bible work + `apply_character_styles.py` on roadmap.

### P3 — VRM model sharing
Rin and Dae both use `Panicandy.vrm`. Tsundere and Sable both use `Viper.vrm`.  
Visually identical 3D models for different characters. Acceptable as a placeholder but should be flagged for future sourcing.

---

## Characters with No Issues
- **Ayane (Yuki)**: Most complete after Rin. Full prompt, lite, VRM, valid avatar. Just needs voice + Bible fields.
- **Hana (Momoka)**: Strong prompt, has VRM (Seraph), valid avatar.
- **Sable (Kuroha)**: Strong prompt, has VRM, valid avatar.

## Immediate Fixes Needed (can be done in one DB update)

```sql
-- Fix voice providers
UPDATE characters SET tts_provider = 'edge-tts' WHERE tts_provider IN ('', 'None') AND id != 15;
-- Fix Brittney to piper (already has a valid piper voice)
-- Fix mood for Rin
UPDATE characters SET mood_enabled = 1 WHERE id = 1;
-- Fix mood for Dae
UPDATE characters SET mood_enabled = 1 WHERE id = 13;
```

