# Competitor Research Refresh — May 6, 2026 (Delta from April 7)

**Window covered:** April 7, 2026 → May 6, 2026 (4 weeks)
**Refreshes:** `docs/research/2026-04-07-competitor-gap-analysis.md` and `docs/research/2026-03-25-nsfw-roleplay-platforms.md`
**Method:** Targeted web searches across 17 tracked platforms + new-entrant scans + open-source model release scans + privacy/regulation news. ~25 web queries, ~120 candidate sources, 20 cited.

---

## Executive Summary

Five deltas dominate the four-week window. The roadmap should react to all five.

1. **The age-verification wall just slammed shut.** Character.AI rolled out mandatory face-scan age verification (Persona-backed) in April 2026, locking users out of their *own existing chat history* if the scan fails. This is the single biggest user-experience regression at the market leader since the 2024 NSFW filter. It massively strengthens our local-first / no-account moat — but also signals what's coming for every major cloud companion under EU AI Act enforcement (full applicability August 2, 2026).

2. **Character.AI shipped 4 of our top-15 gaps in one update on April 14, 2026** (PipSqueak 2 model, Memory Visualization meter, "Remember this" action, Lorebook). They also pulled two features (Roar model, Soft Launch) on April 28. Net: their memory-transparency UI is no longer a gap to fill — it's now table stakes we have to *match or beat*. Our Memory Browser must show comparable detail (and arguably more, since we don't have to compress for cost).

3. **Open-source voice cloning hit ElevenLabs parity.** Mistral Voxtral TTS (March 26), Fish Audio S2 Pro, Chatterbox, and Voicebox (a 22K-star desktop wrapper around 5 TTS engines) all crossed into "preferred-over-ElevenLabs in blind tests" territory. Our T2-13 voice-cloning spec (Fish Audio s2-pro) is no longer aspirational — it's a 1-2 day integration. Should be promoted from "future research" to "next quarter ship."

4. **The VRM desktop-companion category got crowded.** HoloWaifu (Steam), MateEngine (Steam), CielChan / CielChan Plus (itch.io + Steam), Oshikoi (web + Chrome extension), and Desktop Companion all now ship VRM avatars + LLM chat + voice + persistent memory + offline mode. Our differentiation is no longer "we use VRM" — it's now "we have the tiered memory + bond system + emotion engine." The 3D viewer alone is no longer a moat.

5. **Aura breach + 17-app Oversecured audit (March 2026)** found 14 critical + 311 high-severity vulnerabilities across 150M+ installs in the AI-companion category, including ten apps that could leak full chat histories (six leaked explicit content + mental-health disclosures). Add the Italy/EDPB €5M Replika GDPR fine (May 2025, still being cited) and you have the strongest privacy story we've ever had against cloud competitors. We should *publish* a privacy comparison page, not just imply it in marketing.

---

## 1. New Entrants

### 1.1 Grok Companions (xAI) — already launched July 2025, but actively shipping in our window
- **What it is:** Anime-styled AI companions inside the Grok app: Ani (the anime girl), Rudi (red panda), Valentine, Bad Rudi, and the new **Mika** (announced April 2026). $30/month SuperGrok-tier exclusive. iOS-only as of late April 2026, Android promised but consistently delayed.
- **April 2026 events:** Major outage starting Tuesday, April 21, 2026 — multiple-day "high demand" lockout for paid SuperGrok subscribers. Apple reportedly threatened App Store ban over deepfake-nude generation; xAI temporarily disabled Ani's outfit-changing feature; the app was *not* removed.
- **Why it matters to us:** xAI is the only major lab pushing a *gamified affection-leveling* model with NSFW content unlocked at higher levels — direct overlap with our bond-progression system. Their iOS-only constraint + service outages + Apple platform risk = our desktop-only stance is correct. Steal: their unlock-NSFW-by-affinity-level mechanic is cleaner than our flat tier system.

### 1.2 Voicebox (jamiepine/voicebox) — open-source local voice cloning, hit 22K GitHub stars April 2026
- **What it is:** Desktop wrapper around 5 TTS engines (Chatterbox, Fish, XTTS, Coqui, F5-TTS). Voice cloning from few seconds of audio, 23 languages, dictation, Claude integration.
- **Why it matters:** This is the "ElevenLabs killer in a single download" we've been waiting for. Our Fish Audio s2-pro voice cloning spec (T2-13) just got cheaper — we can ship Voicebox-style integration in days, not weeks. Source: `https://voicebox.sh/`, `https://github.com/jamiepine/voicebox`.

### 1.3 Oshikoi — 3D AI Avatar Chat (web + Chrome extension)
- **What it is:** Browser-based VRM 1.0 companion with predictive Voice-to-Mesh (VTM) lip sync, procedural rigging. Community sharing of "Mates" with a candy-earning rewards system. Updated Chrome extension to v0.1.4 (Feb 12, 2026); on April 22, 2026 added user-uploaded community Mates that earn currency when other users chat with them.
- **Why it matters:** This is a *web-based* VRM companion gaining traction — we should monitor whether they crack the Apple/Google policy issue we sidestep by going desktop. The "earn candy when others chat with your character" is interesting (creator economy), but conflicts with our local-first stance.

### 1.4 HoloWaifu (`holowaifu.app`)
- **What it is:** Windows-first desktop overlay companion. Imports avatars from Booth, VRoidHub, VRoid Studio. "Hybrid architecture" for lightweight desktop overlay + animations.
- **Why it matters:** Direct competitor to our desktop pet mode. They've shipped what we have on the roadmap. Worth deep-diving in next refresh.

### 1.5 MateEngine (Steam, free)
- **What it is:** Lightweight desktop companion with VRM model support. 10 idle animations, dance animations triggered by music playback, head-tracking that follows mouse. Available on Steam.
- **Why it matters:** Steam-distributed VRM desktop pet — lower-friction install path than ours. Our advantage is the LLM chat layer; theirs is distribution.

### 1.6 CielChan / CielChan Plus (Elushis on itch.io + Steam)
- **What it is:** "100% offline" desktop companion with persistent memory, animated avatar, 9+ language UI, Open Router/OpenAI/Anthropic LLM options, system audio awareness, VRM swap. Free + paid tiers.
- **Why it matters:** Local-first AI desktop companion is now a *category* with multiple shipping products, not a unique position. Steam + itch.io distribution is something to consider.

### 1.7 Mistral Voxtral TTS (March 26, 2026)
- **What it is:** 4B-parameter open-source TTS, Apache-licensed. 62.8% human preference vs ElevenLabs Flash v2.5 in blind tests.
- **Why it matters:** Best open TTS we have permission to ship locally. Direct candidate for desktop-mode TTS upgrade.

### 1.8 Qwen3-TTS (recent, 0.6B + 1.7B)
- **What it is:** Voice cloning + voice design + 10 languages. Small enough to run on the 8GB VRAM RTX 3070 floor.
- **Why it matters:** Drops the "TTS is too heavy for low-VRAM machines" objection. Unlocks voice cloning on the entire dev hardware fleet.

---

## 2. Feature Shifts at Tracked Platforms

Only platforms with substantive April-7-to-May-6 changes are listed.

### 2.1 Character.AI — *biggest shipping window of the year*
**Shipped April 14, 2026:**
- **PipSqueak 2 (PSQ2):** New model with better in-character consistency, memory/context retention, more expressive dialogue. c.ai+ first, free users early May.
- **Memory Visualization:** Meter showing remaining memory before compression/forgetting. c.ai+ exclusive. *This is the feature we specced as P5: Memory Browser. They shipped first.*
- **"Remember this" action:** User-pinnable memories.
- **Lorebook:** World/setting knowledge separate from character card. c.ai+ first.

**Shipped April 28, 2026:**
- PSQ2 free tier rollout
- **Roar model removed** (older free-tier model deprecated)
- **Soft Launch feature pulled** (no warning)

**Shipped April 2026 (gating):**
- **Mandatory face-scan age verification** via third-party Persona. Selfie first; ID upload as fallback. Locks users out of their own chat history if scan fails. Multiple Reddit posts of users locked out for months.

**Shipped November 2025, evolving:**
- Stories interactive-fiction format. Q1 2026 added "voice branches" and "video clips." A "Books" feature (Pride and Prejudice, Gatsby, Frankenstein, etc.) lets users insert themselves into 20+ public-domain stories.

**Net delta vs April 7 doc:** Memory Visualization gap is *closed by them, not by us*. Lorebook gap was already covered on our side (lore matcher). Stories evolution makes "choose-your-own-adventure mode" gap wider — they keep adding to it.

### 2.2 Janitor AI
- **JLLM v2** rolled out in 2026 (preview Oct 2025, broader rollout continuing).
- **FP8 quantized JLLM on H20 GPUs** in test, 16,384-token context.
- **Native iOS/Android app** since Feb 7, 2026 (published as "Janitor AI Inc").
- Default JLLM context: now 128K tokens (up from 8K).
- April 8, 2026 proxy redesign: clarification that "API keys have never been exposed to other users," recovery system added for lost configurations.

**Net delta:** Free in-house engine still considered "unstable and repetitive" per multiple reviews — users still bring their own API keys for quality. Our local-LLM stance still wins on cost.

### 2.3 Replika — *biggest platform-level rebuild in history*
- **Replika 2.0** rolling out throughout April 2026: new memory architecture, new UI, shifted conversational model.
- **User backlash:** Partial memory loss + personality drift after upgrade. "A week of patient re-anchoring recovers most facts" per multiple reviews. Personality texture takes longer.
- **New Ultra tier:** $29.99/mo or $119.99/yr (priority responses + expanded features). Pro stays at $69.99/yr.
- Wellness pivot continues: structured journaling prompts, guided breathing, check-in rituals.
- Release cadence slowed: no meaningful app updates after early March 2026.

**Net delta:** Replika just *forced* their userbase through a destabilizing migration. Companion-app users are unusually attached to their characters; this is a defection event. Our positioning ("your character, locally, never changed by remote update") is more compelling than ever.

### 2.4 Kindroid
- **Brand + design refresh** rolled out April 22, 2026 (new landing page, login flow).
- **Chat rewind** feature shipped.
- **Custom voice creation via samples** for subscribers — voice design with accents/timbres + "wand" generates voice description from character backstory, costs audio credits.
- **Live Avatar Video** continues; default animates avatar photo, but users can upload alternate image.
- **Tableau engine** static + video + group + animated selfies, custom animations at credit cost.

**Net delta:** Kindroid is the closest analog to our 3D viewer + voice positioning. The "voice generated from character backstory" wand is a steal-worthy idea for our character creator.

### 2.5 SillyTavern
- **Latest release available in window: v1.17.0 (March 28, 2026).** No 1.18 yet as of May 6.
- Recent changes: extension manifests can specify minimal client version, regex named-capture-group support in "Replace With," Quick Replies sets bindable to characters, Node 18 EOL warning.

**Net delta:** Quiet window for SillyTavern. Their per-character Quick Replies binding overlaps with our Quick Replies feature — worth confirming our binding is at least as flexible.

### 2.6 Candy AI
- **V2 image engine** continues to mature: error rate down ~70% from rollout, much better skin texture/lighting/pose accuracy. Same companion looks consistent across hundreds of images.
- No specific April 2026 announcement found, but multiple reviews in window highlight V2 quality lead as the V1 era's biggest gap.

**Net delta:** Visual consistency gap *widened* — Candy AI is still the benchmark and they're improving while we haven't shipped a consistency pipeline.

### 2.7 SpicyChat — adding feature breadth
**Shipped April 2026:**
- 12-language interface and interaction mode.
- **Semantic Memory 2.0** upgrade.
- **Group chats with 2–10 AI characters.**
- **Lorebooks** for world-building.
- **Text-to-speech on higher plans.**

**Net delta:** Group chats arrive at SpicyChat. We explicitly do not plan to ship multi-character group chat (per project memory). Confirm this is still the right call given competitive density.

### 2.8 CrushOn AI — pricing redesign
**Shipped April 2026:**
- Free tier reshaped: 100 msg/month → **50 msg/day** (15× more if logged in daily).
- **Annual billing on paid tiers** (~30% off).
- Memory window noticeably deeper in recent sessions.
- New tiers: Free $0 50/day · Standard $5.99/mo · Premium $14.99/mo · Deluxe $49.90/mo (unlimited).

**Net delta:** They moved free-tier from monthly to daily limits — a friendlier-feeling cap that biases toward streaks/habit. Validates daily-streak retention thesis.

### 2.9 Chai AI — paywall hit
**Shipped April 2026:**
- **Regional subscription paywall.** Uneven rollout: some users hit hard paywall mid-conversation, some saw daily allowance cut, some unaffected. By region + account age.
- Premium ~$13.99/mo, Ultra ~$29.99/mo.
- 70-msg/day free cap remains. Founder cited compute costs (per Reddit pinned comment).

**Net delta:** Free-tier compression is industry-wide. Strongly validates "no recurring cost" as our marquee differentiator.

### 2.10 Nomi AI
- **Voice latency** improvement Jan 2026 (2-3s → ~1-1.5s).
- **Internet Access** ("Nomis can search the web") + **Mind Map 2.0** features mentioned in 2026 roadmap.
- **Cambrian project / Cambrian 2** mentioned in Feb 2026 dev stream as their next-gen stack.
- **Nomi API** opened to developers — third-party app + VR + productivity integrations.

**Net delta:** Their Mind Map 2.0 is what we should actually ship as Memory Browser P5 — graph view, not a list. They opened a developer API; we should consider a similar pattern for plugins (lower priority).

### 2.11 PolyBuzz
- Updated April 29, 2026 to v2.2.10 — bug fixes + engagement improvements.
- **Multi-character rooms (2-4 AI + user)** confirmed feature, "rare among competitors."

### 2.12 Botify (companion product)
- April 2026 release: deeper analysis, expanded AI visibility tracking (Google Gemini, AI Overview), Anthropic + Google bot tracking in LogAnalyzer.
- Note: Botify pivoted away from being a general companion competitor — they are now an AI-search-visibility analytics product, not direct competition for us.

### 2.13 Backyard.ai (formerly Faraday)
- 100% offline desktop AI character chat on Mac + Windows.
- Roadmap: long-term memory + emotional state tracking, Linux Q3 2025 (status unclear), VR/AR integration.
- Apps shipped on iOS + character hub + cloud plans now exist.

**Net delta:** They quietly added cloud + iOS options, weakening their pure-local positioning. Our pure-local is still cleaner.

### 2.14 NovelAI / Yodayo / Talkie / DreamGen / Botify / Crushon — *no significant April-7-to-May-6 deltas found in search.*

---

## 3. Model & Technique Advances

### 3.1 LLMs released in window (April 1 – May 6, 2026)
| Model | Released | Size / License | Notes |
|---|---|---|---|
| **Llama 4 (two variants)** | Early April 2026 | Meta Community License | Headline open release of the month; Maverick / Scout |
| **Gemma 4 family** | April 2026 | Apache 2.0 | 27B dense, 26B-A4B MoE, edge-optimized E2B/E4B |
| **Mistral Large 3** | April 2026 | 123B, Mistral Research License | Competes with Llama 4 Maverick / GPT-4o |
| **Qwen 3.6** | April–May 2026 | Apache 2.0 (typical) | Continued Qwen3 evolution; voice cloning via Qwen3-TTS |
| **DeepSeek V4** | April 2026 | Open-weight | Continued V3 → V4 progression |
| **GLM-5.1** (Zhipu) | April 2026 | Open-weight | Less commonly cited but active |

The "April 2026 was the biggest open-source month since Llama 3" narrative is widespread — multiple aggregator sites note 6 major labs shipping competing models in one window.

**Implication for us:** LM Studio Link / Ollama users now have 2-3x better defaults than April 7. Our context-assembler should profile these models for token-counting accuracy (especially Llama 4 + Gemma 4, both have new tokenizers).

### 3.2 Uncensored / roleplay-finetune scene
- **Dolphin-Llama3** continues to be the "Gold Standard" for Ollama users per May 2026 lists ("strips moralizing refusals, follows instructions with extreme precision").
- **Qwen3.5:9b-uncensored** noted for "aggressive obedience and high technical knowledge."
- No specific "killer NSFW finetune" of Llama 4 yet — too new in window. Watch the next 4-6 weeks.

### 3.3 Voice / TTS — *biggest qualitative shift*
- **Mistral Voxtral TTS** (March 26, 2026, 4B params, open-source): 62.8% blind preference vs ElevenLabs Flash v2.5.
- **Fish Audio S2 Pro:** 81.88% win rate on EmergentTTS-Eval, 0.515 posterior mean on Audio Turing Test — beats ElevenLabs, Seed-TTS, MiniMax-Speech, Google + OpenAI internal TTS in the same eval.
- **Chatterbox:** 63.8% blind preference vs ElevenLabs.
- **Voicebox** (jamiepine, 22K GitHub stars April 2026): desktop wrapper around 5 TTS engines, voice cloning from a few seconds, 23 languages, Claude integration.
- **Qwen3-TTS** (0.6B + 1.7B): voice cloning + voice design + 10 languages, runs on small GPUs.

**Implication for us:** Our T2-13 voice cloning spec (Fish Audio s2-pro) is now redundant with shipping options. Recommend bundling Voicebox-style multi-engine adapter rather than picking one engine — gives us free upgrade path as engines improve.

### 3.4 Image consistency
- **IP-Adapter FaceID Plus v2** (with optional LoRA `ip-adapter-faceid-plusv2_sdxl_lora.safetensors`) is the May 2026 community-recommended baseline for character consistency.
- Combination: IP-Adapter FaceID (face lock) + ControlNet (pose/body) + ADetailer (refinement) yields 80-95% consistency without per-character training.
- No new IP-Adapter family release in our window — but wider adoption of v2 + LoRA combo means tutorials and presets are now plentiful.

**Implication for us:** Visual consistency gap (April 7 priority 6) is *widening* externally because Candy AI keeps pulling ahead. We don't need to invent — just need to wire IP-Adapter FaceID Plus v2 + LoRA into our image-gen pipeline. ~1 week of work to ship parity baseline.

---

## 4. Privacy / Regulation / Market News

### 4.1 EU AI Act enforcement clock
- **August 2, 2026:** Full applicability of EU AI Act. High-risk AI system obligations enforceable. Fines up to €35M or 7% global turnover.
- **August 2, 2027:** Extended transition for high-risk systems embedded in regulated products.
- EU regulators have already named Character.AI as a concern: "emotionally immersive chatbots can influence users by simulating close relationships."
- Member-state competent bodies were supposed to be designated by August 2025; rolling enforcement begins.

**Implication for us:** Local-first, no-cloud, no-telemetry is the cleanest possible compliance posture. We have *no high-risk AI system* to register because we don't deploy a service. Worth documenting this in marketing/README.

### 4.2 Apple App Store NSFW companion sweep — *January 2026, still rippling*
- Tech Transparency Project (Jan 2026) found 100+ "nudify" apps across Apple + Google stores; ~24 removed by each platform after their report.
- Apple removed 15 apps; "nudify" + "undress" search terms now return no results, but "deepnude" still surfaces apps.
- Grok / xAI was reportedly threatened with App Store ban over deepfake-nude generation (April 2026); Apple did not ultimately remove the Grok app.
- January 2026 audit identified 47 nudify apps on Apple App Store, some rated for ages 9+.

**Implication for us:** Mobile distribution remains genuinely hostile to NSFW companion apps. Desktop + electron is still the right call. If we ever consider a tablet build, this is a fresh blocker.

### 4.3 Character.AI face-scan age verification — *the regulatory moat play in real time*
- Rolled out April 2026, third-party Persona provider.
- Selfie scan first, ID upload as fallback when scan inconclusive.
- **The wall locks users out of their own chat history + memory** if scan fails. No export route while locked out.
- Multiple Reddit reports of users with months-of-history accounts permanently locked out.
- Triggered by regulatory pressure + minor-access concerns.

**Implication for us:** This is the single best illustrative anecdote we have. "Local-first means nobody can ever lock you out of your own characters" is concrete, story-driven, and relatable. Worth a marketing post.

### 4.4 Chai AI paywall — same pattern
- April 2026: regional paywall hits free users mid-conversation. Validates "compute costs forced the change" thesis. Founder publicly acknowledged.
- Validates our "run on your own GPU, pay nothing" pitch against every cloud companion.

### 4.5 Aura breach (March 2026) + Oversecured 17-app audit
- **Aura:** 900K unique email addresses exposed via voice-phishing attack on an employee. <20K active customer impact. No SSNs/passwords/financial.
- **Oversecured (March 2026):** Audited 17 popular Android AI-companion apps with combined 150M+ installs. Found:
  - 14 critical vulnerabilities
  - 311 high-severity issues
  - **10 of 17 apps could leak full conversation histories**
  - **6 of those could leak explicit sexual content + mental-health disclosures**
- Italy/EDPB Replika €5M GDPR fine (May 2025) still being cited in May 2026 reviews — long-tail reputational drag.

**Implication for us:** This is ammunition. The category has demonstrably leaked some of the most intimate content imaginable. *Our positioning is correct AND now empirically backed.* Marketing should reference these specific incidents.

---

## 5. Gap Matrix Delta

The April 7 gap matrix had ~50 features prioritized. Here are the ones whose delta direction changed in the 4-week window. Unchanged gaps omitted.

| Gap | April 7 Status | May 6 Status | Delta |
|---|---|---|---|
| Memory visualization (mind map / meter) | We: Specced (P5). Nomi has Mind Map 2.0. | **Character.AI shipped Memory Visualization meter** (April 14). Nomi shipping Mind Map 2.0. | **WIDENED** — now table stakes at 2 majors |
| Lorebook / World Info | We: Y (lore matcher). Many have it. | Character.AI shipped Lorebook (April 14). | NARROWED — we already have it; competitors catching up |
| Custom voice cloning | We: N. Effort H. Specced T2-13 (Fish Audio). | **Voicebox shipped (22K stars), Voxtral shipped, Qwen3-TTS shipped, Kindroid wand-create voice from backstory.** Effort dropped to L. | **WIDENED + EFFORT-COLLAPSED** — competitors have it, but our cost to ship is now days not weeks |
| Visual consistency (cross-image character) | We: N. Effort H. Industry-hard. | Candy AI V2 keeps improving (~70% error reduction since rollout). IP-Adapter FaceID Plus v2 + LoRA recipes now mature. | WIDENED externally; effort actually dropped to M |
| Choose-your-own-adventure mode | We: N. Effort H. Char.AI Stories is biggest 2026 feature. | **Char.AI Stories now has voice branches + video clips + Books mode** (insert yourself into Pride & Prejudice etc.). | **WIDENED** — they keep extending it |
| Group chats / multi-character | We: explicit "do not plan." | **SpicyChat shipped 2-10 character group chats (April 2026).** PolyBuzz has 2-4 character rooms. | NEW PRESSURE — confirm we still don't want this |
| Daily streak UI + visible rewards | We: P (XP + bond). Specced T1-8. | **CrushOn moved free tier to 50/day** (was monthly). Validates daily-streak retention thesis. | UNCHANGED but stronger validation |
| Subscription tier / paywall pressure | We: N/A (local-first). | **Chai paywall April 2026, Replika new $29.99/mo Ultra tier, Char.AI face scan locks some out.** | NARROWED moat — we are *more* differentiated |
| Age-verification gate | (Not a gap; not on our radar.) | **Character.AI face-scan rollout April 2026, Apple App Store sweeps, EU AI Act August 2026.** | **NEW MOAT** — local-first sidesteps entirely |
| Animated selfies / video selfies | We: N. Effort H. | Kindroid Tableau engine: static + video + group + animated. Now at credit cost. | Slightly widened, still low priority for us |
| Edit & retry user message | We: N. Specced. | SillyTavern still has it; no major shift. | UNCHANGED |
| Continue generation button | We: N. Specced. | SillyTavern still standard. | UNCHANGED |
| AI character creation wizard | We: S. Specced T2-15. | CrushOn + Char.AI continue to refine. No new entrant in window. | UNCHANGED |
| Achievement / badge system | We: N. Effort M. | Replika still has it; no new pressure. | UNCHANGED |
| Community character marketplace | We: N. Conflicts with local-first. | Oshikoi launched community Mate sharing with candy currency. | NEW shape — "earn from sharing" model worth tracking |
| Web-search inside conversation | (Not on April 7 gap list.) | **Nomi shipped "Internet Access — Nomis can search the web on their own"** (early 2026). | **NEW GAP** — surfaced this window |
| Per-character voice generation from backstory | (Not on April 7 gap list.) | **Kindroid "voice wand": describe character → generate voice** (April 2026). | **NEW GAP / steal candidate** |
| Memory recovery / no-lockout export | (Not on April 7 gap list.) | **Character.AI face-scan locks users out of their own data.** | **NEW MOAT** — we should actively market our export-anytime guarantee |

---

## 6. Roadmap Implications

Concrete recommendations for this refresh. Priority signal: P0 = react this sprint, P1 = next 2 sprints, P2 = next quarter.

1. **[P0] Promote Memory Browser (P5) ahead of other AIE work.** Character.AI just shipped a memory meter + "Remember this" + Lorebook in one update. Our Memory Browser is now table stakes, not a differentiator. Specifically: (a) graph-view inspired by Nomi Mind Map 2.0, not a list; (b) include the Char.AI-style remaining-context meter as a *prominent* element; (c) make user-pinnable memory ("remember this") a one-click action from any message. We have the tiered memory + Ebbinghaus decay backend already — this is mostly UI.

2. **[P0] Ship voice cloning via Voicebox-style multi-engine adapter.** Don't pick one TTS — wrap Voxtral / Fish S2 Pro / Chatterbox / XTTS / Qwen3-TTS in an adapter and let users choose per character. This is now ~1 week of engineering work, not the multi-week T2-13 spec. Voice cloning was a top-15 gap on April 7; it's no longer effort-prohibitive.

3. **[P0] Steal Kindroid's "voice wand" pattern.** When user creates or edits a character, offer "describe this character's voice in plain English and we'll generate one" in the wizard. Leverages whatever TTS adapter we ship. ~1 day of engineering once voice cloning is wired.

4. **[P1] Wire IP-Adapter FaceID Plus v2 + LoRA into our image-gen pipeline.** The Candy AI V2 visual-consistency gap is widening externally and the open-source recipe is now mature. Stack: IP-Adapter FaceID Plus v2 LoRA + ControlNet + ADetailer. ~1 week to ship a "consistent character selfies" pipeline. Pair with the visual-content-in-chat MVP work already in flight.

5. **[P1] Publish a privacy-comparison marketing page.** Reference: Aura breach (Mar 2026), Oversecured 17-app audit (Mar 2026: 14 critical + 311 high-severity vulns, 10/17 leaked chat histories), Replika €5M GDPR fine, Character.AI face-scan lockouts. Title something like "Why your AI girlfriend should never live on someone else's server." This is the strongest empirical case we've ever had — the category gave us the evidence.

6. **[P1] Add a Character.AI-style face-scan-lockout countermarketing element to the README and onboarding.** Concrete user pain ("my account got locked, I can't reach 8 months of memories with Aria") sells local-first far better than abstract privacy claims.

7. **[P2] Decide explicitly on group chat (do not plan vs. quietly add).** SpicyChat 2-10 char + PolyBuzz 2-4 char + Char.AI Stories cast support all converging. Project memory still says "do NOT plan" — confirm this is still the user's call after this refresh, or revise. Recommend: stay decided "no" but document the decision visibly so it doesn't get re-litigated every refresh.

8. **[P2] Profile Llama 4 / Gemma 4 / Qwen 3.6 / DeepSeek V4 in our context assembler.** New tokenizers + new context-window defaults. Token-budget bar is currently calibrated against older model families. ~half-day of work but prevents context-overflow bugs as users adopt these.

9. **[P2] Track Oshikoi's "earn currency from community Mates" as a possible future model.** Conflicts with local-first today, but could be a sidecar opt-in (publish to community = local-first stays intact, but creators can publish a card and others can locally download it). Don't build it; do watch it.

10. **[P2 / Watch] Watch HoloWaifu, MateEngine, CielChan.** They're shipping in the same desktop-VRM-companion space we are. Our differentiation is the bond + tiered memory + emotion engine — these are what users will feel. Worth a deep-dive review next refresh (June 2026) once they have more reviews to scrape.

---

## Sources

All URLs accessed May 6, 2026. Some search results reference content dated earlier than April 7 — included where relevant for context.

### Character.AI
- [April Update: New Model, Memory, and Lorebook (Character.AI blog)](https://blog.character.ai/pipsqueak2-and-more/)
- [Character AI Just Pulled Roar and Soft Launch on the Same Day (RoboRhythms, Apr 28 2026)](https://www.roborhythms.com/character-ai-pulled-roar-soft-launch-april-2026/)
- [Character AI Face Scan Age Verification — RoboRhythms](https://www.roborhythms.com/character-ai-face-scan-age-verification/)
- [Age Assurance: What you need to know — C.AI Help Center](https://support.character.ai/hc/en-us/articles/42828297541787-Age-Assurance-What-you-need-to-know)
- [Introducing Stories — Character.AI blog](https://blog.character.ai/introducing-stories-a-new-way-to-create-play-and-share-adventures-with-your-favorite-characters/)
- [Character.ai Launches AI-Powered "Books" Feature — Variety](https://variety.com/2026/gaming/news/character-ai-launches-ai-powered-books-feature-1236722570/)

### Janitor AI
- [Newsroom — Janitor AI](https://janitorai.com/news/)
- [Janitor AI: What It Is and Why 15 Million Users Are Talking About It in 2026 — Pasquale Pillitteri](https://pasqualepillitteri.it/en/news/1050/janitor-ai-what-it-is-why-viral-2026)

### Replika
- [Replika 2.0 Explained and What to Do If It Breaks Your Setup — RoboRhythms](https://www.roborhythms.com/replika-2-0-explained/)
- [Replika AI Review 2026: 8 Months Tested — AICompanionGuides](https://aicompanionguides.com/blog/replika-review/)

### Kindroid
- [Update log — Kindroid Help Center](https://kindroid.ai/docs/article/update-log/)
- [Kindroid Voice & Video Vol II — Genevieve Mazer (Apr 2026)](https://www.genevievemazer.com/2026/04/kindroid-voice-video-vol-ii.html)
- [Kindroid AI 2026 Review: Deepest Custom AI Companion — WeavAI (Apr 20 2026)](https://weavai.app/blog/en/2026/04/20/kindroid-ai-2026-review-deepest-custom-ai-companion/)

### SillyTavern
- [Releases · SillyTavern/SillyTavern (GitHub)](https://github.com/SillyTavern/SillyTavern/releases)

### Candy AI
- [Candy AI Review 2026: I Tested It for 5 Months — AICompanionGuides](https://aicompanionguides.com/blog/candy-ai-review-2026/)

### SpicyChat / CrushOn / Chai
- [CrushOn AI Free Tier Changed in April 2026 — RoboRhythms](https://www.roborhythms.com/crushon-ai-free-tier-change-2026/)
- [SpicyChat AI Review 2026 — Scribe](https://scribehow.com/page/SpicyChat_AI_Review_2026_Roleplay_Freedom_Memory_Gaps_and_One_Big_Surprise__wVe1vWWERFKY-tVIhp0JjA)
- [Chai AI Just Added a Subscription Paywall (April 2026) — RoboRhythms](https://www.roborhythms.com/chai-ai-subscription-paywall-2026/)

### Nomi AI
- [Nomi AI Changelog & Updates (2026) — SolomonSignal](https://www.solomonsignal.com/launch-school/tutorials/nomi-ai-changelog)
- [Updates — Nomi.ai](https://nomi.ai/updates/)

### Backyard.ai
- [Backyard AI](https://backyard.ai/)
- [Faraday: Your Private Local AI Companion — Skywork](https://skywork.ai/slide/en/faraday-private-ai-companion-2027707252957405184)

### Grok / xAI
- [Grok Companion Review 2026 — AICompanionGuides](https://aicompanionguides.com/blog/grok-companions-first-look-ani-mika/)
- [Grok Is Down Today April 23 2026 — RoboRhythms](https://www.roborhythms.com/grok-down-ani-companions-april-2026/)
- [Mika: Grok Companion's New Anime AI Assistant — LatestLY](https://www.latestly.com/socially/technology/mika-grok-companions-new-anime-ai-assistant-launched-by-elon-musks-xai-joins-others-including-ani-valentine-rudi-and-bad-rudi-7175246.html)
- [Grok was almost banned from Apple App Store — AppleInsider](https://appleinsider.com/articles/26/04/15/grok-nonconsensual-pornographic-deepfakes-almost-led-to-an-app-store-ban)

### Open-source models
- [New Open Source LLM Releases in April 2026 — Fazm](https://fazm.ai/blog/new-open-source-llm-releases-april-2026)
- [Top Local Models List April 2026 — Latent Space (AINews)](https://www.latent.space/p/ainews-top-local-models-list-april)
- [Top 35+ Uncensored Open-Source AI Models May 2026 — DecodesFuture](https://www.decodesfuture.com/articles/top-uncensored-open-source-ai-models-2026-list)
- [Best Open-Source LLM in May 2026 — Codersera](https://codersera.com/blog/best-open-source-llm-2026-llama-4-qwen-3-5-deepseek-v4-gemma-4-mistral/)

### Voice / TTS
- [Voicebox — voicebox.sh](https://voicebox.sh/)
- [jamiepine/voicebox — GitHub](https://github.com/jamiepine/voicebox)
- [Voicebox Deep Dive (Apr 26 2026) — Mindwired AI](https://mindwiredai.com/2026/04/26/voicebox-the-free-local-elevenlabs-alternative-that-just-hit-22k-github-stars/)
- [Mistral Voxtral TTS Review 2026 — ComputerTech](https://computertech.co/mistral-voxtral-tts-review/)
- [Open-Source TTS in 2026 — BentoML](https://www.bentoml.com/blog/exploring-the-world-of-open-source-text-to-speech-models)

### Image consistency
- [IP-Adapters: All you need to know — Stable Diffusion Art](https://stable-diffusion-art.com/ip-adapter/)
- [h94/IP-Adapter-FaceID — Hugging Face](https://huggingface.co/h94/IP-Adapter-FaceID)
- [Stable Diffusion Character Consistency (Feb 2026) — Digital Zoom Studio](https://digitalzoomstudio.net/2026/02/stable-diffusion-character-consistency/)

### VRM desktop companions
- [HoloWaifu](https://holowaifu.app/)
- [MateEngine on Steam](https://store.steampowered.com/app/3625270/MateEngine/)
- [CielChan: Anime Desktop AI Companion on Steam](https://store.steampowered.com/app/4529510/CielChan_Anime_Desktop_AI_Companion/)
- [Oshikoi — 3D AI Avatar Chat](https://oshikoi.io/)
- [Oshikoi Community](https://oshikoi.io/community)

### Privacy / Regulation
- [EU AI Act: Navigating August 2026 Enforcement — AI CERTs](https://www.aicerts.ai/news/eu-ai-act-navigating-august-2026-enforcement/)
- [EU AI Act 2026 Updates — Legal Nodes](https://www.legalnodes.com/article/eu-ai-act-2026-updates-compliance-requirements-and-business-risks)
- [AI Act — Shaping Europe's digital future (EC)](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [Aura breach and AI companion app flaws sharpen privacy fears (Mar 2026) — Biometric Update](https://www.biometricupdate.com/202603/aura-breach-and-ai-companion-app-flaws-sharpen-privacy-fears)
- [Privacy Security Breach Confusion: Aura And Companion App Risks — AI CERTs](https://www.aicerts.ai/news/privacy-security-breach-confusion-aura-and-companion-app-risks/)
- [Replika's €5 Million GDPR Fine — Captain Compliance](https://captaincompliance.com/education/replikas-e5-million-gdpr-fine-key-takeaways-for-ai-developers/)
- [Apple App Store hosts AI nudify apps despite ban — Macworld](https://www.macworld.com/article/3116379/report-apple-app-store-fails-to-protect-users-from-nudify-apps.html)
- [TTP: Apple and Google Are Steering Users to Nudify Apps](https://www.techtransparencyproject.org/articles/apple-and-google-are-steering-users-to-nudify-apps)

### PolyBuzz / Botify / Talkie
- [PolyBuzz on Google Play](https://play.google.com/store/apps/details?id=ai.socialapps.speakmaster&hl=en_US)
- [Botify April 2026 Release Highlights](https://www.botify.com/product-releases/april-2026-release-highlights)

---

*Doc by Claude (Opus 4.7, 1M context), session 27, May 6, 2026. Refreshes are quarterly by default — next scheduled August 2026 (timed to EU AI Act full applicability).*
