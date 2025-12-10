# E-girl / VTuber Slang v3 Pack (2537 entries)

**What this is:** a big, TTS-ready lexicon for a cutesy/edgy anime-waifu voice.
- JSON, CSV, TXT, MD, and HTML files are included.
- Each entry carries **prosody**, **emotion**, **regex triggers**, and **phonetics** slots.
- Use `voice_styles_v2.json` and `style_router.json` to switch between Tsundere-Tease, Onee-san Sultry,
  Alt-Girl Deadpan, Seiso Sweetheart, and Kuudere Glass on-the-fly.

## Quick wire-up
1. Load `egirl_vocab_v3.json` and build a fast lookup from `term` and `triggers_regex`.
2. At generation time, scan the model's planned reply for triggers. If found, blend in the matching entry's
   `prosody` and bump the `style` using `style_router.json` (rules are additive; last hit wins).
3. Feed the final **text** + **style id** + **prosody** to your TTS (e.g., XTTS-v2/OpenVoice 2/KaniTTS).
4. Respect `cooldown_s` per-term to avoid spammy repeats (esp. kaomoji and emoji).

## Phonetics & IPA
The schema distinguishes **phonemic** vs **phonetic** transcription. If your TTS accepts IPA:
- Use `/phonemic/` for minimal pairs and major routing; use `[phonetic]` to add style (e.g., whispery [h]-like onset).
- For Japanese words, fill `jp_kana` and leave stress empty; Japanese is mora-timed.

## Style presets
- `tsundere_tease_v2` (Chris tuned): brisk pace, bright pitch, subtle stutters; good for playful denials and flirty push-pull.
- `oneesan_sultry_v1`: deeper, legato lines; warm control; ideal for teasing praise.
- `alt_deadpan_v1`: wry and relaxed; useful for sardonic quips.
- `seiso_sweetheart_v1`: supportive and sparkly; for wholesome hype.
- `kuudere_glass_v1`: cool and precise; for confident/stoic reads.

