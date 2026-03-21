# Competitive Research Cycle 2A — Deep Dives (Top 12 Sources)

**Date**: 2026-03-21
**Focus**: Mature/18+ content platforms — AI companion apps, Steam adult games, 3D sims, open-source tools
**Method**: 3 parallel research agents, web search + community analysis per source

---

## NSFW AI Companion Platforms (Sources 1-4)

### 1. Crushon.AI (Score: 54, 20.6M monthly visits)

**Features**: Model selection in-chat (GPT-4o, Claude-3.5, branded models), per-chat NSFW toggle, multi-character scenes, character creation with persona traits/backstory/scenario. Pricing: Free (50-100 msgs), Standard ($8/mo), Premium ($30/mo), Deluxe (unlimited).

**Content Handling**: Minimal. 18+ age gate at signup (checkbox only). Binary NSFW toggle. No escalation system. ~45 trackers, data shared with TikTok/Reddit pixels. Poor privacy.

**Retention**: Weak. No bond progression, no streaks, no rewards. Retention driven entirely by "forbidden fruit" unfiltered access. High churn once users acclimate.

**Community Sentiment**: Overwhelmingly negative (Trustpilot). Bots forget NSFW mid-conversation, memory limited to 100 messages, pricing up to $50/mo feels predatory, payment redirects to "clothing boutique" raising security flags.

**Actionable Takeaway**: **In-chat model hot-swap without losing context.** Users want to try different models for different moods. Our `link_manager.py` with smart routing makes this natural. Effort: 12-18h production.

---

### 2. Janitor AI (Score: 53, 2M DAU, 70% female users)

**Features**: Character creation with personality/backstory, community library (thousands of bots), chat memory with manual flags, user-generated summaries, BYOK support (OpenAI/Anthropic keys), model selection (JLLM, DeepSeek, Chimera).

**Content Handling**: NSFW allowed with API keys but not on free JLLM tier. Natural escalation: free = SFW, paid = NSFW via own API key. No formal age verification beyond ToS.

**WHY 70% FEMALE**: (1) Narrative depth emphasis over explicit content, (2) community library skews toward romance/hurt-comfort/slow-burn scenarios from fanfiction culture, (3) welcoming community tone vs male-gaze marketing, (4) character creation UX emphasizes personality over appearance. **IMPLICATION: narrative-first features (bond progression, story scenes, journals) expand our audience beyond male otaku.**

**Retention**: Community library is primary driver. "Memory flag" system clever but manual. DeepSeek v3.0324 era described nostalgically as peak quality.

**Community Sentiment**: Declining. JLLM quality degraded (repetitive, robotic), memory loss mid-conversation, conversations randomly reset, aggressive free-tier ads.

**Actionable Takeaway**: **Auto-summarization at context boundaries.** Janitor makes users manually summarize. We should automate it — when `context_assembler.py` hits token budget and prunes, trigger LLM summarization into `tiered_memory`. **#1 most requested feature across ALL platforms.** Effort: 16-24h production.

---

### 3. Chub.ai NSFW (Score: 51)

**Features**: V2 character card spec (JSON in PNG tEXt chunks), forking system (git-style lineage trees), lorebook with recursive scanning (entries trigger other entries), Venus chat client with prompt macros, alternate greetings per character.

**Content Handling**: Fully unfiltered. No age gate beyond ToS. Content tags for discovery only, not restriction.

**Retention**: Fork system creates network effects — popular cards get hundreds of forks with attribution. Lorebook creation is a separate creative activity.

**Community Sentiment**: 54% positive (creative freedom, lorebook power), 28% negative (repetitive AI, memory lapses, confusing UI). Power users love it; casuals bounce.

**Actionable Takeaway**: **Recursive lorebook scanning.** Our `backend/lore/matcher.py` is single-pass. Adding recursion (injected entries trigger additional entries) brings us to Chub parity and makes imported character cards with recursive lorebooks work correctly. Effort: 8-12h production.

---

### 4. NovelAI (Score: 50, 4.5M monthly visits)

**Features**: Custom models (Kayra 13B, Erato 70B with 128K context), image generation V4.5 with "Full"/"Curated" variants, Author's Note, Memory block, Lorebook, generation presets (temperature/sampling profiles), Anlas virtual currency.

**Content Handling**: **Gold standard** for "no filter, adult responsibility." Zero text filters. Image gen: "Curated" model = SFW training data, "Full" model = includes NSFW. Two-model approach avoids runtime filtering. Everything encrypted at rest.

**Retention**: Strongest of all platforms. Anlas currency (use-it-or-lose-it), model quality (Erato 70B gets 9.5/10), generation presets as collector meta-game, integrated text + image creative loop.

**Community Sentiment**: Most positive. Praise for narrative quality, privacy, anime image gen. Complaints: Anlas runs out, dated text UI, high pricing vs open-source alternatives.

**Actionable Takeaway**: **Generation presets as shareable profiles.** Expose LLM sampling parameters as named presets ("Romantic," "Action," "Playful") that users can save/share/import. Near-zero engineering cost, creates power-user engagement. Effort: 8-12h production.

---

## Adult 3D Games & Simulations (Sources 5-8)

### 5. Honey Select 2 Libido DX (Score: 50)

**Features**: Hundreds of character sliders (672+ with mods), character card as PNG with embedded binary data, photo-to-face feature detection, Studio NEO V2 (IK/FK posing, multi-character scenes, 20+ environments, camera keyframes), BepInEx modding.

**Content Handling**: Sold as adult title. Steam censored, HF Patch uncensors. No in-game content toggles.

**Retention**: Creation IS the game (80%+ time in creator/studio). Card sharing economy (r/HoneySelect 100K+ members). Screenshot culture as social currency. Mod dependency chains.

**Actionable Takeaway**: **Character card as preview PNG.** Polish our card export so the PNG IS the shareable artifact — embed all data (persona, lorebook, portrait) in PNG metadata. The card image is both preview and complete import. Effort: 4-6h production.

---

### 6. DreamGen (Score: 49, 100K+ stories)

**Features**: Scenario Codex (structured story bible with setting/plot/style/characters), per-message creativity steering slider, dual mode (story-writing + role-play), multi-character scenes with distinct voices, custom open-source models (Lucid V1 12B, Opus V0 70B on HuggingFace), 5K-30K context by tier.

**Content Handling**: Unfiltered. Content settings user-controlled. Custom fine-tuning trains models to follow scenario constraints — author-defined boundaries, not platform-defined.

**Retention**: Story persistence (codex saves across sessions), model quality lock-in (Lucid models noticeably better), steering as engagement, free tier as funnel.

**Actionable Takeaway**: **Per-message creativity steering.** A slider in Director Mode: creativity vs adherence, mapped to temperature + presence_penalty + system prompt modifiers. Gives users DreamGen-level control. Effort: 6-8h production.

---

### 7. Virt-A-Mate / VaM (Score: 48)

**Features**: Physics-based 3D characters (soft-body, joint physics, skin-accurate collisions), Atom system (compositional architecture), C# plugin ecosystem, Voxta AI integration (LLM conversation → animation state machine), Routimator (conversation-driven animation transitions), desktop + VR dual mode.

**Content Handling**: Fully adult. Content in user-created scenes. No platform-level filtering.

**Retention**: Plugin discovery loop, VaM Hub scene sharing, VR immersion, tinkerer identity ("I built this"), Voxta AI adds conversation.

**Actionable Takeaway**: **Conversation-to-Animation state bridge.** Map LLM emotion/action tags to VRM animation crossfades in real-time. Viewer already has gesture infrastructure (Phase 6). Wire it to LLM output so avatar feels responsive to conversation. Effort: 12-16h production.

---

### 8. Custom Order Maid 3D2 / COM3D2 (Score: 47)

**Features**: 5-tier relationship progression (Stranger→Friend→Trust→Lover→Lover+→Bride, 0-250+ favor), daily schedule system (Day/Night activities: Lessons, Work, Communication), 5 trainable maid stats, 12 facility slots, event trigger system (parameter thresholds × relationship × story × facility state), DLC personality packs, dance mode, VR.

**Content Handling**: Steam = SFW, R18 patch from KISS directly. Content escalation built into relationship system — higher tiers unlock more intimate interactions. NTR content sold as separate opt-in DLC.

**Retention**: Daily loop (schedule→work→communicate→events = "one more day"), visible favor number (0-250+), multi-maid management, gated narrative rewards (Bride requires clearing event chains, not just grinding), DLC as content refresh.

**Actionable Takeaway**: **Daily favor cap + return incentive.** Cap daily XP gain to encourage return visits. Named relationship tiers with unlock ceremonies. Event gating at tier boundaries (not just number thresholds). Directly enhances Bond Progression (#1 retention driver). Effort: 8-12h on top of existing bond system.

---

## Remaining Sources (9-12)

### 9. SpicyChat AI (Score: 46)

**Features**: SFW/NSFW profile-level toggle, Semantic Memory 2.0 (viewable/editable, persists across sessions), memory tiers by subscription (4K-16K context), voice mode, large character library.

**Content Handling**: Binary SFW/NSFW toggle (global, not per-conversation). Age verification via OAuth. Despite "uncensored" marketing, users report mid-conversation refusals. Gap between marketing and reality is major frustration.

**Retention**: Memory persistence ("she remembers me"), character library browsing, subscription tiers gate memory depth. Queue wait times create artificial scarcity/frustration.

**Actionable Takeaway**: **Content ceiling toggle (port Girly 4-tier system).** We already have the full type system in Girly frontend. The work is porting to Sakura + backend. Effort: 10-18h production.

---

### 10. AI Shoujo (Score: 46)

**Features**: Personality archetypes (Shy, Tsundere, Vengeful, etc.), 4-axis behavior parameters (Instinct/Gloom/Social/Caution), mood system affecting compliance, 0-3 heart relationship phases, autonomous NPC routines (sleep, eat, explore), skill acquisition over time.

**Content Handling**: Steam censored, HF Patch uncensors. "User applies own patch" model.

**Retention**: Watching NPCs develop autonomy, heart progression, "pet simulation" appeal.

**Actionable Takeaway**: **Autonomous activity simulation.** When user isn't chatting, companion "does things" (reading, cooking, hobbies) that generate journal entries. Feeds into proactive messaging + bond progression. "I was practicing guitar while you were gone." Effort: 14h personal-use.

---

### 11. SillyTavern NSFW Config (Score: 45)

**Features**: Expression auto-switch (28 emotions via distilbert ONNX), Expressions+ extension (range rules, combination rules, per-character profiles), lorebook as behavior guide (keyword-triggered tone shifts), NSFW via lorebook toggle, model recommendations.

**Content Handling**: NO platform-level filtering. Content determined by: model choice, system prompt, lorebook entries. "NSFW as a lorebook entry" pattern is elegant — toggleable per-conversation.

**Retention**: Infinite customization, lorebook depth, expression sprites making conversations feel alive, card sharing community.

**Actionable Takeaway**: **Lorebook directive entries** (behavior modifiers, not just lore). Add `entry_type` column to lorebook table (`lore` | `directive`). Directives go after system prompt, lore goes into context. Enables NSFW-as-lorebook + tone modulation. Effort: 5-7h production.

---

### 12. Koikatsu Party + HF Patch (Score: 52)

**Features**: PNG steganography card format (data after PNG IEND marker), BepisDB card sharing hub, BepInEx plugin system (zip-based sideloader), HF Patch curated mega-installer (updated biweekly, v3.38 Mar 2026), card data extensibility (custom data blocks survive unmodded games).

**Content Handling**: Three-layer model: Steam censored, official adult patch, community HF Patch fully uncensored. Plausible deniability at each level.

**Retention**: Character creation as core loop, card sharing social proof, studio screenshot culture, modding ecosystem, HF Patch "patch day" events.

**Actionable Takeaway**: **Extended character card format** with `waifu_rt3d_extensions` block embedding 3D model refs (VRM hash/URL, expression mapping, Live2D reference, viewer settings). Ignored by SillyTavern, fully used by our app. Makes our cards the richest in the ecosystem. Effort: 8-16h production.

---

## Cross-Cutting Insights

### 1. #1 Feature We're Missing (Multiple Sources Have It)
**Content level management with graceful escalation/de-escalation.** SpicyChat (binary toggle), SillyTavern (lorebook-activated), AI Shoujo (mood-gated), Koikatsu (layered patching). We have the BEST type system for this in Girly's `content.ts` — it's just not wired into Sakura or the backend.

### 2. #1 Retention Mechanic Across All Sources
**Persistent memory that the user can see and verify.** Every platform where users stay has visible, editable memory. Users want to see "she knows I like coffee" and correct "she thinks I have a dog." We have the Knowledge Graph — we lack a **Memory Inspector UI**.

### 3. Biggest Content Escalation UX Pattern
**User controls the ceiling. AI fills the space but never exceeds it.** Content level set by USER, not AI. AI operates within the band. Girly's intimacy tracker (0-100 with automatic band detection + hard ceiling) is the most nuanced version — AI naturally escalates within allowed band, hard-stops at ceiling.

### 4. Biggest Failure Mode to Avoid
**AI forgetting context mid-conversation.** #1 complaint across SpicyChat, Janitor AI, AI Shoujo. Users tolerate slow responses, ugly UI, paywalls. They do NOT tolerate the companion forgetting who they are. Every token on memory > every token on personality.

### 5. Single Quickest Win (<1 Day)
**Lorebook directive entries.** 3-5 hours. Add `entry_type` column, place directives after system prompt. Instantly enables: NSFW-as-lorebook, mood-triggered tone shifts, keyword-activated scene instructions. Zero new infrastructure.

---

## Combined Priority Feature Table

| Priority | Feature | Source(s) | Effort | Impact |
|----------|---------|-----------|--------|--------|
| **P0** | Auto-summarization at context boundaries | Janitor AI | 16-24h | Critical — #1 complaint |
| **P0** | Content ceiling toggle (port Girly 4-tier) | SpicyChat, SillyTavern, AI Shoujo | 12-18h | Critical — enables content spectrum |
| **P0** | Memory Inspector UI (browse/edit facts) | SpicyChat, SillyTavern | 8-12h | High — #1 retention mechanic |
| **P0** | Daily favor cap + return incentive | COM3D2 | 8-12h | High — enhances bond progression |
| **P1** | Recursive lorebook scanning | Chub.ai | 8-12h | High — Chub card compatibility |
| **P1** | Lorebook directive entries | SillyTavern | 5-7h | High — NSFW-as-lorebook + tone |
| **P1** | Conversation-to-animation bridge | VaM/Voxta | 12-16h | High — avatar feels responsive |
| **P1** | Relationship-gated content tiers | COM3D2 | 8-12h | High — bond levels have meaning |
| **P1** | Autonomous activity simulation | AI Shoujo | 14h | High — emotional resonance |
| **P2** | Per-message creativity steering | DreamGen | 6-8h | Medium — Director Mode enhancement |
| **P2** | In-chat model hot-swap | Crushon | 12-18h | Medium — power user + multi-machine |
| **P2** | Generation presets (shareable) | NovelAI | 8-12h | Medium — free engagement loop |
| **P2** | Character card as preview PNG | Honey Select 2 | 4-6h | Medium — card sharing UX |
| **P2** | Extended card format (3D refs) | Koikatsu | 8-16h | Medium — ecosystem differentiation |
| **P2** | Context budget health bar | SpicyChat (anti-pattern) | 3h | Medium — prevents frustration |
| **P3** | Screenshot studio mode | Honey Select 2 | 12-16h | Medium — creation as retention |
| **P3** | 28-emotion expression classification | SillyTavern Expressions+ | 6-8h | Medium — richer avatar |

---

## Strategic Takeaways

1. **Memory is the battlefield.** Auto-summarization + Memory Inspector = highest ROI investment.
2. **Privacy is an underexploited moat.** We're local-first by default (stronger than NovelAI). Market it.
3. **70% female audience exists.** Narrative depth + bond progression + journals serve this demographic. Don't let "waifu" branding obscure the opportunity.
4. **Chub lorebook spec is the standard.** Our card import (A8) needs recursive scanning for full compatibility.
5. **Generation presets are free engagement.** Near-zero cost, creates power-user meta-game.
6. **COM3D2's daily loop is the retention model.** Schedule→work→communicate→events = "one more day."
7. **Content escalation must be user-controlled.** AI fills the space but never exceeds the ceiling.

---

## Cycle 2B: Queued Sources (12 remaining, deferred to future session)

| # | Source | Key Research Question |
|---|--------|---------------------|
| 13 | HuniePop 2 | How does Baggage system (personality-as-mechanic) work? |
| 14 | Subverse | What made it reach #2 on Steam? Tactical + VN + adult? |
| 15 | PepHop AI | 4,600+ characters — how managed? Filter architecture? |
| 16 | Chai App | Mobile-first user expectations? Why demand personas? |
| 17 | r/SillyTavern | Power user model configs for RP? |
| 18 | r/CharacterAI_NSFW | Why users leave CharacterAI? |
| 19 | Candy AI | Multimodal integration (voice + images + video + chat)? |
| 20 | Yodayo/Moescape | What went wrong with SFW/NSFW split? |
| 21 | Nastia AI | Emotional depth features that retain? |
| 22 | ChatGPT Adult Mode | Persona-based age verification implementation? |
| 23 | r/waifuism | Long-term emotional attachment — what do they want? |
| 24 | Koikatsu Sunshine | Improvements over Koikatsu Party? |
