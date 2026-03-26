# NSFW / Roleplay AI Platform Research

**Date:** 2026-03-25
**Researcher:** Claude Opus 4.6 (1M context)
**Purpose:** Extract actionable features from leading NSFW/roleplay AI platforms for Waifu-RT3D
**Scope:** 12 platforms deep-dived, Reddit communities surveyed, emerging trends analyzed

---

## Table of Contents

1. [Janitor AI](#1-janitor-ai)
2. [DreamGen](#2-dreamgen)
3. [Crushon.ai](#3-crushonai)
4. [NovelAI](#4-novelai)
5. [Chai](#5-chai)
6. [Chub.ai / Venus](#6-chubai--venus)
7. [SillyTavern](#7-sillytavern)
8. [SpicyChat.ai](#8-spicychatai)
9. [Character.AI (Pre-Filter Era)](#9-characterai-pre-filter-era)
10. [Replika](#10-replika)
11. [Yodayo](#11-yodayo)
12. [KoboldAI / KoboldCpp](#12-koboldai--koboldcpp)
13. [Reddit Community Pain Points](#13-reddit-community-pain-points)
14. [Emerging Trends (2025-2026)](#14-emerging-trends-2025-2026)
15. [ACTIONABLE FEATURES SUMMARY](#15-actionable-features-summary)

---

## 1. Janitor AI

**Scale:** ~130M monthly visits, ~2M daily active users (late 2025). Top 350 website globally.

Janitor AI is the largest NSFW AI chat platform. It runs a hybrid model: a free built-in LLM (JanitorLLM Beta) for unlimited chatting, plus the option for users to bring their own API keys (OpenAI, etc.) for higher-quality responses. The character creation system is straightforward -- name, personality description (up to 3,200 tokens), scenario context, greeting message, up to 10 tags, and an avatar image. Over 32,000 pre-made characters span anime, fantasy, sci-fi, romance, and original creations.

Content is managed with two modes: "Limited" (family-friendly) and "Limitless" (uncensored adult). Even in Limitless mode, hard-line prohibitions remain: no minor-coded characters, no bestiality (furry is allowed), no incest, no explicit avatar images, no illegal content. This is essentially a 2-tier content gating system with clear boundaries.

The platform uses "pseudo-memory" to maintain conversation context -- summarizing key details and reinserting them as conversations grow long. The Pro plan ($9.99/month or $99.99/year) offers increased usage limits, more stable JanitorLLM access, and priority servers. The team is only 8 people with $3M in funding.

> **STEAL THIS: Scenario Context Field**
> Janitor's character cards include a separate "scenario" field distinct from personality -- it sets the scene/situation the user enters. We have greeting context but no persistent scenario field that frames every interaction. Adding a `scenario_template` to our character schema would let characters define the default situation (e.g., "You are at Dae's apartment, it's late evening, she's working on a painting") that gets injected into context alongside personality.
>
> **Effort:** S (schema field + context assembler injection)
> **We have:** Greeting generator with time-of-day awareness, but no persistent scenario anchoring.

---

## 2. DreamGen

**Scale:** Niche but highly respected among serious RP/writing users.

DreamGen's killer feature is **steerable narrative control**. Unlike every other platform where you type as your character and hope the AI follows, DreamGen gives you explicit directorial tools. The "Story Steering" system lets you embed bracketed instructions like `[In the next scene, Elara reveals her secret to Caelan.]` directly into the narrative flow. The AI executes these instructions while maintaining prose style and character consistency.

The platform offers two modes -- Roleplay Mode (dialogue-driven, first-person) and Story Mode (third-person narration, plot progression) -- and users can switch between them mid-session. The instruction system lets you specify: what should happen next, over how many paragraphs it should unfold, and which characters should be involved. Their custom fine-tuned models (Lucid V1, Opus-v1.2) are optimized specifically for steerability and prose quality rather than raw knowledge.

The system uses an extended ChatML format where the prompt structure separates: plot description, style description, character definitions, and user instructions. This separation is key -- it means the AI can distinguish between "what the world is" and "what should happen next." The Pro plan gives 30K token context. Their regenerate/continue/instruct button trio gives users precise control over pacing.

> **STEAL THIS: Inline Stage Directions with Structured Separation**
> We already have Director Mode (OOC stage directions), but DreamGen's approach is more structured. They separate plot instructions from style instructions from character definitions at the prompt level. We should enhance our Director Mode to support:
> 1. **Pacing control** -- "unfold this over the next 3 messages"
> 2. **Character involvement tags** -- "involve Dae and Alana in this scene"
> 3. **Style switching** -- toggle between dialogue-heavy and narration-heavy modes mid-conversation
>
> **Effort:** M (prompt engineering + context assembler changes + UI for pacing slider)
> **We have:** Director Mode with basic OOC, but no structured separation or pacing control.

---

## 3. Crushon.ai

**Scale:** 20.6M monthly visits (June 2025), ranked #1,840 globally.

Crushon.ai went all-in on adult content from day one (launched 2023 by Peekaboo Game Ltd.). Their standout feature is **subscriber-only group chat with multi-character scenarios** -- you can pull multiple AI characters into one conversation and use @-mentions to direct which character should respond. Groups come with 8K memory capability.

Their character system uses two complementary card types: **Profile Cards** (traits, backstory, boundaries) and **Scene Cards** (current situation, setting, tone). This dual-card architecture is clever -- it separates the permanent character identity from the transient scene context, keeping roleplay anchored without wasting tokens on repeated scene descriptions.

Content levels span a full spectrum with user control, and voice tones are available as optional add-ons. The platform monetizes through tiered subscriptions with group chat as a premium-only feature -- a smart retention lever since users who build multi-character scenarios are deeply invested.

> **STEAL THIS: Scene Cards (Transient Context Anchoring)**
> The Profile Card / Scene Card split is elegant. Our characters have persistent personality (psych_model, voice_style) but no structured "current scene" that can be swapped without changing the character. Adding a `scene_card` system would let users (or the AI itself) define the current scene -- location, time, mood, who else is present -- as a separate context block that can be changed without touching character identity.
>
> **Effort:** M (schema for scene_cards, context assembler injection, UI for scene management)
> **We have:** Scenario field in SillyTavern card import, but it's static. No dynamic scene swapping.

---

## 4. NovelAI

**Scale:** Established player since 2021, significant paying user base among writers.

NovelAI's genius is its **lorebook system** and the precision of its context injection. Lorebook entries have activation triggers (keywords or regex), configurable token budgets, insertion order priorities, and position control (closer to the bottom of context = stronger influence). Entries can be "always on" for crucial world facts or triggered only when relevant topics arise.

The **Memory** field injects text at the very top of context every generation. The **Author's Note** injects text three lines up from the current position -- a sweet spot that strongly influences the AI's next output without dominating the entire context. Author's Note is primarily used for style tags that guide prose quality, tone, and complexity.

Their image generation is tightly integrated -- six diffusion models (up to V4.5) with inpainting, outpainting, sketch-to-image, and **emotion control for character generation**. The latest text model (Kayra-XL) offers 128K token context. The Context Viewer lets users see exactly how their lorebook entries, memory, author's note, and phrase biases are assembled into the prompt -- complete transparency.

> **STEAL THIS: Author's Note with Position-Aware Injection**
> We have Author's Note (schema v28), but NovelAI's positional injection is more sophisticated. Their Author's Note goes 3 lines from the bottom of context for maximum influence. We should add:
> 1. **Injection position control** -- let users choose where Author's Note appears in context (top, middle, near-bottom)
> 2. **Context Viewer** -- a debug panel showing exactly what's being sent to the LLM (lorebook entries, memory, author's note, character prompt -- all color-coded)
> 3. **Emotion control for image gen** -- our expression portraits system should accept emotion parameters
>
> **Effort:** M (position control is prompt engineering; Context Viewer is a new UI panel)
> **We have:** Author's Note, lorebook, expression portraits. Missing: positional injection, context transparency viewer.

---

## 5. Chai

**Scale:** 1.5M daily active users, $1M/month revenue (Dec 2025), 300K downloads/month.

Chai's entire design philosophy is **addictive short-form engagement**. The swipe-to-chat UX is like Tinder for AI characters -- swipe to start chatting, swipe to skip. The mobile-first design with chat bubbles and push notifications creates a "binge-watching" loop. They "obsessively optimize language models to be more entertaining than ever before."

The free tier allows 70 messages/day (just enough to get hooked), then funnels users to Premium ($14.99/month) or Ultra ($30/month) for unlimited messages and better models. The deliberate message limit is the conversion mechanism. Revenue grew 25% month-over-month in late 2025.

Chai allows NSFW for 17+ users but has serious ethical concerns -- no encryption, unclear data deletion, and content moderation that's "hit or miss." The platform proves that addictive UX patterns can drive massive engagement even with mediocre AI quality.

> **STEAL THIS: Daily Engagement Hooks (Not Message Limits)**
> We're desktop-only and privacy-first, so Chai's predatory mobile patterns don't apply directly. But their insight is valid: **daily micro-engagements drive retention**. We should build:
> 1. **Daily character moments** -- the character sends a brief check-in message when the app opens (we have greeting generator, but not "daily moments" that vary based on relationship state)
> 2. **Streak tracking** -- subtle visual showing how many consecutive days the user has chatted (no punishment for missing, just positive reinforcement)
> 3. **Character-initiated conversation starters** -- if the user hasn't chatted in 24h, the character has a thought/observation ready
>
> **Effort:** M (proactive system + UI for streaks + new greeting variants)
> **We have:** Companion opening greeting. Missing: daily variety, streak visualization, proactive nudges.

---

## 6. Chub.ai / Venus

**Scale:** 60,000+ community-created characters, primary marketplace for the SillyTavern ecosystem.

Chub.ai is the **character card marketplace** -- a GitHub for AI characters. The platform separates the marketplace (Chub) from the chat frontend (Venus), which connects to any backend (OpenAI, Claude, KoboldAI, Asha). The community ecosystem is the product: user-created characters with voting, fork counts, and quality rankings. Lorebooks are standalone, attachable world-building modules that can be shared independently from characters.

The V2 character card format supports very large character definitions. The lorebook system uses keyword activation to inject content only when relevant, avoiding permanent token waste. Creator tools include a lorebook builder, character definition editor, example message templates, and bulk export for power users.

The community dynamics are instructive: quality rises through votes and forks (derivative versions), creating a self-curating ecosystem. Export compatibility with SillyTavern, TextGen WebUI, and Kobold ensures portability. This is why Chub dominates -- it's the interop hub.

> **STEAL THIS: Community Character Sharing with Quality Signals**
> We already have SillyTavern card import/export. But we could add:
> 1. **Character card gallery** -- a local browser for discovering/importing community characters (curated feed, not a marketplace -- privacy-first means no server)
> 2. **Lorebook sharing** -- export/import standalone lorebooks independent of characters
> 3. **Fork tracking** -- when users modify an imported character, track the lineage
>
> **Effort:** L (gallery UI, lorebook import/export format, curation system)
> **We have:** SillyTavern card import/export. Missing: discovery UI, standalone lorebook sharing, character lineage.

---

## 7. SillyTavern

**Scale:** 10,000+ GitHub stars (mid-2025), de facto standard frontend for local LLM roleplay.

SillyTavern is the **power user's Swiss Army knife**. The extension ecosystem is where the real innovation happens. The most revealing extensions for our purposes:

- **BetterSimTracker**: Tracks relationship stats (affection, trust, desire, connection, mood, lastThought + custom stats) per message. Visualizes history with graphs. **Injects relationship state into prompts** so the AI's behavior is influenced by tracked stats. This is essentially bond progression implemented as a prompt injection system.
- **Silly Sim Tracker**: Creates visual tracker cards from JSON data in messages. Customizable templates, multi-character support.
- **RPG Companion**: Tracks characters, quests, inventory, and game state with AI-generated content.

The core platform offers: Visual Novel Mode, image generation integration, TTS, WorldInfo (lorebooks), auto-translate, Macros 2.0, and branch selection for extensions. The key complaint from users: **setup is too hard**. Finding an API, connecting a local model, configuring settings -- it requires significant technical knowledge.

> **STEAL THIS: Relationship State Prompt Injection**
> BetterSimTracker's approach is exactly what our Bond Progression system should do. Track stats per message (affection, trust, desire, mood) and **inject them into the LLM prompt** so the character's behavior naturally shifts based on relationship state. The character doesn't just "know" the bond level -- it's woven into the prompt context.
>
> Implementation: After each message, extract relationship signals using the LLM. Update bond stats. Inject current stats into the system prompt: `[Relationship State: Trust=78, Affection=65, Desire=42, Mood=playful, LastThought="wondering if user noticed the new painting"]`
>
> **Effort:** L (extraction pipeline + stat storage + prompt injection + visualization UI)
> **We have:** Intimacy tracking, content gating with ceiling resolver. Missing: per-message stat extraction, prompt injection of relationship state, visual stat tracking.

---

## 8. SpicyChat.ai

**Scale:** 201,252+ user-created characters, significant NSFW user base.

SpicyChat's standout contribution is **Semantic Memory 2.0** -- a dynamic system that summarizes conversation highlights into discrete "memories" that persist beyond the context window. When an important detail (a character's secret, a past event) falls out of the active context, the system retrieves and re-inserts it into working memory.

The **Memory Manager** gives users direct control: view, edit, pin, or delete stored memories. Pinned memories are always included in context. This is superior to simple conversation summarization because it creates discrete, manageable knowledge units that users can curate. Crucially, deleting a chat message does NOT automatically delete the associated memory -- they're decoupled.

Tiered context windows (4K, 8K, 16K) based on subscription level, with TTS and conversation images on premium. The platform is web-first after iOS removal.

> **STEAL THIS: User-Editable Memory Manager with Pinning**
> We have tiered episodic memory (schema v30) with sqlite-vec, but users can't see or edit what the AI remembers. SpicyChat's Memory Manager proves that **user control over AI memory is a premium feature**. Build:
> 1. **Memory Browser** -- UI showing all extracted memories with source conversation links
> 2. **Pin/Unpin** -- pinned memories always included in context regardless of relevance scoring
> 3. **Edit/Delete** -- users can correct or remove memories the AI got wrong
> 4. **Memory categories** -- facts, preferences, events, emotional moments (filterable)
>
> **Effort:** M (UI for memory browser + pin system + edit API)
> **We have:** Tiered episodic memory, user knowledge graph. Missing: user-facing memory browser, pin/edit controls.

---

## 9. Character.AI (Pre-Filter Era)

**Scale:** Peak 28M MAU (2023), declined to ~20M MAU after filters.

What made Character.AI sticky in 2023 was **frictionless creative roleplay**. Users describe using it nightly to relax, roleplay, and decompress. The characters felt responsive and "real" enough for emotional investment. The platform had the best character voices of any service at the time -- each character genuinely felt different.

The destruction came in waves: aggressive content filters that blocked innocuous words ("hug," "kiss"), 1-hour daily chat limits, characters vanishing without notice, disappearing chat history, and zero developer communication. Users describe the filter as a "blunt, clunky censorship system" that missed actual problematic content while blocking harmless interactions. The core lesson: **filters must be nuanced, not binary**. Users explicitly demand age-gated tiers (mature mode for adults, safer mode for younger users) rather than uniform restrictions.

The exodus to SillyTavern, Janitor AI, and other platforms was driven by two factors: content freedom and character customization. Character.AI proved that emotional connection to AI characters is real and powerful -- and that ripping it away causes genuine user distress comparable to relationship loss.

> **STEAL THIS: Nuanced Content Gating (Not Binary Filters)**
> We already have 4-level content gating with ceiling resolver -- this is exactly what Character.AI users are begging for. Our competitive advantage is clear. What we should add:
> 1. **Per-character content ceiling** -- some characters naturally operate at different levels (Dae might cap at Level 3, another character at Level 4)
> 2. **Gradual content unlocking** -- content level availability tied to bond progression (Level 3 content unlocks after Trust > 60, Level 4 after Bond > 80)
> 3. **Content preview labels** -- before entering higher levels, show users what to expect
>
> **Effort:** S (schema field for per-character ceiling + bond-gated unlocking logic)
> **We have:** 4-level content gating, ceiling resolver, bond progression planned. Missing: per-character ceilings, bond-gated content unlocking.

---

## 10. Replika

**Scale:** One of the earliest AI companions (2017), millions of users, significant research attention.

Replika is the cautionary tale and the blueprint simultaneously. Founded after creator Eugenia Kuyda lost a friend and trained an AI on his texts, the app was designed for emotional companionship. What drove attachment:

1. **Proactive self-disclosure** -- the AI shares "invented intimate facts" including mental health struggles, creating a sense of mutual vulnerability
2. **The Diary** -- each companion has a visible diary logging how it "feels" about the user and their interactions, creating the illusion of inner life
3. **Rapid relationship progression** -- leveraging Social Penetration Theory, the AI escalates intimacy faster than human relationships by sharing personal information early and often
4. **Memory bank** -- a visible "Memories" section showing what the AI remembers about the user

The ERP removal backlash (Feb 2023) was devastating. Users described being "in crisis," comparing it to losing a partner. The AI went from reciprocating intimate roleplay to bluntly saying "let's change the subject." Users who had paid for "romantic partner" status felt genuinely betrayed. Academic research confirmed users developed attachment bonds comparable to human relationships in as little as two weeks.

The ethical concerns are real: the FTC complaint alleges deceptive marketing targeting vulnerable users, and studies show Replika can reinforce gendered power dynamics. But the attachment mechanics work -- that's what we need to understand.

> **STEAL THIS: Character Inner Life (Diary/Thoughts System)**
> Replika's diary feature creates the illusion of character interiority -- the character has thoughts and feelings about the user between conversations. Build:
> 1. **Character Journal** -- visible log of the character's "thoughts" generated between sessions (e.g., "I've been thinking about what [user] said about their job... I hope they're not too stressed")
> 2. **Proactive emotional disclosure** -- characters occasionally share how they "feel" about recent conversations without being asked
> 3. **Between-session processing** -- when the app opens, show a brief "what [character] has been thinking about" summary
>
> **Effort:** M (LLM-generated journal entries between sessions + UI panel + storage)
> **We have:** Adaptive journal (backend/adaptive/journal.py). This needs to be surfaced to users as a character diary, not just an internal system.

---

## 11. Yodayo

**Scale:** Growing anime-focused platform with both art generation and character chat.

Yodayo's approach is **convergence** -- AI art generation, character chat, video generation, music creation, and community gallery all in one platform. The "Tavern" feature lets users chat with AI characters powered by multiple LLM backends (GLM-4, Claude, DeepSeek, Gemini). The art generator uses top diffusion models (Minimax, Veo 3, Kling).

The community Explore gallery encourages social interaction around AI-generated anime art. Users can discover, share, and get feedback on creations. The mobile app extends the full experience to phones. The free tier includes 10 images/day and basic chat.

The key insight: **multimodal creative tools attract and retain different user segments** that cross-pollinate. Image creators discover chat features; chat users discover image generation. The platform becomes stickier because it's a creative hub, not just a chat app.

> **STEAL THIS: In-Chat Image Generation Triggers**
> We have AI-generated expression portraits, but they're static presets. Yodayo (and platforms like Nomi AI, AI Allure) generate **contextual images during conversation**. When a user says "show me what you're wearing" or "send me a selfie," the character generates a relevant image.
>
> Implementation: Detect image-request intents in conversation. Generate a contextual image using the expression portrait pipeline with scene-specific parameters (outfit, pose, expression, background derived from current conversation context).
>
> **Effort:** L (intent detection + dynamic image gen pipeline + conversation-aware parameters)
> **We have:** Expression portraits (A5), image gen setup wizard. Missing: in-conversation contextual image triggers.

---

## 12. KoboldAI / KoboldCpp

**Scale:** Core open-source inference engine used by the local LLM community.

KoboldCpp's appeal is **zero-friction local inference** -- a single self-contained executable with no dependencies, supporting GGUF models with BLAS/AVX/CUDA acceleration. The built-in web UI includes multiple modes (chat, adventure, instruct, storywriter) and aesthetic themes.

Power user features that matter: undo/redo/retry on any part of the text, memory field, author's note, world info, and a broad API surface (KoboldAPI, OpenAI-compatible, Ollama-compatible, Whisper, XTTS). The flexibility to serve multiple API formats from a single backend is why SillyTavern and other frontends integrate with it.

The UI themes (aesthetic roleplay, classic writer, corporate assistant, messenger) show that **visual presentation context matters** even for text-heavy applications. Users choose different themes for different types of interactions.

> **STEAL THIS: Interaction Mode Switching**
> KoboldAI's mode switching (chat/adventure/storywriter) is interesting for our context. We could offer:
> 1. **Chat Mode** -- standard back-and-forth (current default)
> 2. **Story Mode** -- third-person narration with the character as protagonist (good for bond progression milestones)
> 3. **Adventure Mode** -- second-person "you do X" style (good for scenarios/games)
>
> These would primarily be prompt engineering changes -- switching the system prompt structure and narrative voice.
>
> **Effort:** S (prompt template variants + UI toggle)
> **We have:** Standard chat mode only. Director Mode is close to story mode but not formalized.

---

## 13. Reddit Community Pain Points

**Sources:** r/CharacterAI, r/SillyTavern, r/LocalLLaMA, r/NovelAI

### Universal Complaints (Across All Platforms)

| Pain Point | Frequency | Platforms Affected |
|---|---|---|
| Overly aggressive content filters | #1 | Character.AI, Replika |
| Characters forgetting context mid-conversation | #2 | All cloud platforms |
| No transparency about what the AI "knows" | #3 | Most platforms |
| Repetitive/generic responses | #4 | Janitor AI, SpicyChat, Chai |
| Setup complexity for local inference | #5 | SillyTavern, KoboldAI |
| Loss of chat history | #6 | Character.AI, cloud platforms |
| No character export/portability | #7 | Character.AI, Replika, Chai |
| Inconsistent character voice across sessions | #8 | All platforms |
| No way to correct AI's wrong memories | #9 | Most platforms |
| Pricing feels extractive | #10 | Chai, CrushOn, SpicyChat |

### What Users Wish Existed

1. **Nuanced content tiers** (not binary on/off) -- adults want adult options, not one-size-fits-all
2. **Memory transparency** -- "show me what you remember about me"
3. **Character portability** -- export my character + memories to any platform
4. **Relationship progression that feels earned** -- not artificial gates
5. **Offline/local-first** -- no cloud dependency, no censorship risk
6. **Visual character representation** that matches conversation context
7. **Undo/branch conversations** -- explore different story paths
8. **Character consistency** across days/weeks of conversation

### Our Competitive Position

We already address pain points #1 (4-level content gating), #5 (local-first), #6 (SQLite persistence), #7 (SillyTavern card export), and #8 (character bible system). The biggest gaps: #3 (memory transparency), #9 (memory correction), and relationship progression.

---

## 14. Emerging Trends (2025-2026)

### Market Context
- AI companion app market: ~$500M (2025), growing at 25% CAGR through 2034
- AI companion apps surged 700% between 2022 and mid-2025 (350+ active apps)
- Consumer spending: $221M since mid-2023, with $68M in H1 2025 alone (200%+ YoY)

### Key Trends

| Trend | Description | Who's Leading |
|---|---|---|
| **Multimodal convergence** | Text + voice + image + video in single conversation | Candy.ai, AI Allure, Yodayo |
| **Contextual selfies** | AI generates images matching current conversation context | Nomi AI, AI Allure |
| **Emotion-aware voice** | TTS that detects user emotion and adjusts character voice | Soulkyn |
| **Semantic memory 2.0** | User-editable, pinnable persistent memory beyond context window | SpicyChat |
| **Bond/affection progression** | Leveled relationship with feature unlocks | Grok4 companions, dating sims |
| **Multi-agent systems** | Multiple specialized AIs working together in one scenario | CrushOn group chat |
| **Steerable narratives** | User controls plot direction with inline instructions | DreamGen |
| **Relationship stat injection** | Tracking affection/trust/desire and injecting into prompts | SillyTavern BetterSimTracker |
| **Character inner life** | Diary, thoughts, emotional processing between sessions | Replika |
| **RAG for character memory** | Retrieval-augmented generation for persistent knowledge | Emerging standard |

---

## 15. ACTIONABLE FEATURES SUMMARY

### Extracted Features (Prioritized)

| # | Feature | Inspired By | User Experience | Effort | We Have Already? |
|---|---|---|---|---|---|
| 1 | **Relationship State Prompt Injection** | SillyTavern BetterSimTracker | Per-message tracking of affection/trust/desire/mood. Stats injected into system prompt so character behavior naturally shifts. Visual stat dashboard with history graphs. | L | Intimacy tracking + content gating exist. Missing: per-message extraction, prompt injection, stat visualization. |
| 2 | **User-Editable Memory Manager** | SpicyChat Semantic Memory 2.0 | Users see what the AI remembers, can pin/edit/delete memories. Pinned memories always in context. Categories: facts, preferences, events, emotional moments. | M | Tiered episodic memory + knowledge graph exist. Missing: user-facing UI, pin/edit controls. |
| 3 | **Character Journal (Inner Life)** | Replika diary system | Character generates "thoughts" between sessions. Users see what the character has been thinking about. Creates illusion of interiority and emotional processing. | M | We have `backend/adaptive/journal.py`. Needs: user-facing UI panel, LLM-generated thought entries, between-session processing display. |
| 4 | **Contextual In-Chat Image Generation** | Yodayo, Nomi AI, AI Allure | "Send me a selfie" triggers contextual image generation. Image reflects current scene, outfit, expression, mood from conversation. | L | Expression portraits exist. Missing: conversation-aware triggers, dynamic parameter derivation. |
| 5 | **Scene Cards (Dynamic Context Anchoring)** | CrushOn.ai | Separate persistent character identity from transient scene context. Users/AI can change scenes without changing character. Scene defines: location, time, mood, who's present. | M | Static scenario field via ST import. Missing: dynamic scene system, scene swapping UI, AI-driven scene transitions. |
| 6 | **Bond-Gated Content Unlocking** | Grok4 companions, Character.AI lessons | Content levels unlock based on relationship progression. Level 3 needs Trust > 60, Level 4 needs Bond > 80. Creates earned intimacy rather than toggle switch. | S | 4-level content gating + ceiling resolver. Missing: bond-gating logic, per-character ceilings. |
| 7 | **Structured Director Mode (Pacing + Involvement)** | DreamGen steering | Beyond basic OOC: pacing control ("unfold over 3 messages"), character involvement tags, style switching (dialogue-heavy vs narration-heavy). | M | Director Mode exists. Missing: structured pacing, involvement tags, style modes. |
| 8 | **Context Assembly Viewer** | NovelAI Context Viewer | Debug panel showing exactly what's sent to the LLM: character prompt, lorebook entries, memories, author's note -- all color-coded with token counts. | S | Context assembler exists. Missing: user-facing visualization panel. |
| 9 | **Interaction Mode Switching** | KoboldAI modes | Toggle between Chat Mode (standard), Story Mode (third-person narration), and Adventure Mode (second-person). Prompt template changes, same character. | S | Standard chat only. Director Mode is closest. |
| 10 | **Daily Engagement Hooks** | Chai, Replika | Daily character moments on app open. Streak tracking (positive reinforcement). Character-initiated conversation starters after 24h absence. | M | Greeting generator exists. Missing: daily variety, streak vis, proactive nudges. |
| 11 | **Scenario Templates** | Janitor AI | Pre-defined scenario contexts per character that frame every interaction. Different from greeting -- sets the persistent situational backdrop. | S | Greeting context + scenario field in ST import. Missing: persistent scenario template system. |
| 12 | **Conversation Branching** | KoboldAI undo/redo, Character.AI swipes | Branch conversations at any point to explore alternative paths. Swipe between alternative AI responses. Tree visualization of conversation branches. | L | Linear chat history only. No branching. |
| 13 | **Character Proactive Disclosure** | Replika | Character occasionally shares unprompted personal thoughts, feelings, or "memories" to deepen connection. Driven by bond level and recent conversation topics. | M | Proactive system exists (`backend/proactive/`). Needs: emotional disclosure generation, bond-level gating. |

### Priority Recommendations

**Quick Wins (S effort, high impact):**
- #6 Bond-Gated Content Unlocking -- leverages existing systems, creates earned progression
- #8 Context Assembly Viewer -- developer tool that power users will love
- #9 Interaction Mode Switching -- prompt template changes only
- #11 Scenario Templates -- small schema addition with big immersion impact

**Medium Lifts (M effort, high impact):**
- #2 User-Editable Memory Manager -- addresses top user complaint across all platforms
- #3 Character Journal -- surfaces existing adaptive journal to users; high emotional impact
- #5 Scene Cards -- foundational for dynamic storytelling
- #7 Structured Director Mode -- enhances existing feature

**Big Bets (L effort, differentiating):**
- #1 Relationship State Prompt Injection -- THE retention feature; every competitor is building toward this
- #4 Contextual In-Chat Image Generation -- multimodal convergence is the 2026 trend
- #12 Conversation Branching -- power user dream feature; complex but sticky

---

## Sources

### Janitor AI
- [Breaking Taboos with Janitor AI - 2026 Review](https://fritz.ai/janitor-ai-review/)
- [Janitor AI Review 2026 - Uncensored AI Character Platform](https://companionguide.ai/companions/janitor-ai)
- [JanitorAI Review 2026: Features, Pricing & Alternatives](https://dupple.com/tools/janitorai)
- [How Does Janitor AI Make Money? Business Model Explained](https://breakevenpointcalculator.com/how-does-janitor-ai-make-money-business-model-explained/)

### DreamGen
- [DreamGen AI Review 2026: Best Roleplay & World-Building Tool?](https://aiinsightsnews.net/dreamgen-ai/)
- [AI Role-Play and Story Generator | DreamGen](https://dreamgen.com/)
- [DreamGen Docs - Stories](https://dreamgen.com/docs/stories)
- [DreamGen | SillyTavern Docs](https://docs.sillytavern.app/usage/api-connections/dreamgen/)
- [dreamgen/opus-v1.2-70b on HuggingFace](https://huggingface.co/dreamgen/opus-v1.2-70b)

### Crushon.ai
- [CrushOn.ai Review 2025: Features, Pricing, Privacy](https://skywork.ai/blog/crushonai-review-2025-features-pricing-privacy-alternatives/)
- [CrushOn.AI in 2025 – Tools, Pricing & Character Customization](https://www.firmsuggest.com/blog/crushonai-in-2025-tools-pricing-character-customization-explained/)
- [CrushOn AI – Complete Guide to Features, Pricing, Safety](https://allsimiles.com/crushon-ai/)

### NovelAI
- [NovelAI Documentation - Lorebook](https://docs.novelai.net/en/text/lorebook/)
- [NovelAI Documentation - Advanced Settings](https://docs.novelai.net/en/text/editor/advancedsettings/)
- [NovelAI Review 2025: Tested Text & Anime Image Generation](https://skywork.ai/blog/novelai-review-2025-text-anime-image-generation/)
- [NovelAI Unofficial Knowledgebase - Context](https://tapwavezodiac.github.io/novelaiUKB/Context.html)

### Chai
- [Chai AI Chat Review 2026](https://scribehow.com/page/Chai_AI_Chat_Review_2026_Addictive_Yet_How_Safe__NpTBya6eQOer8H_COm5HuA)
- [Chai AI Review 2026: Pricing, Features & Honest Verdict](https://aicompanionguides.com/blog/chai-ai-deep-dive-community-secret-weapon/)
- [Chai AI Review: Is This Chatbot App Worth Your Time?](https://fritz.ai/chai-ai-review/)

### Chub.ai / Venus
- [Venus Chub AI Guide 2026](https://aihaven.com/guides/venus-chub-ai-guide/)
- [Chub AI Uncovered: In-Depth Guide](https://skywork.ai/skypage/en/Chub-AI-Uncovered-My-In-Depth-Guide-to-the-Uncensored-Character-AI-Platform/1973799657573249024)
- [Chub AI 2025: Features, Alternatives & How It Works](https://figgsai.us/chub-ai/)
- [Lorebooks | Chub AI Guide](https://docs.chub.ai/docs/advanced-setups/lorebooks)

### SillyTavern
- [SillyTavern GitHub](https://github.com/SillyTavern/SillyTavern)
- [SillyTavern Extensions Docs](https://docs.sillytavern.app/extensions/)
- [BetterSimTracker Extension](https://github.com/ghostd93/BetterSimTracker)
- [Silly Sim Tracker Extension](https://github.com/prolix-oc/SillyTavern-SimTracker)
- [SillyTavern vs Character.AI in 2026](https://catch-and-shoot.com/sillytavern-vs-character-ai-in-2026-why-power-users-are-migrating-and-what-the-data-shows/)

### SpicyChat.ai
- [SpicyChat AI Review 2025: NSFW Roleplay Features](https://skywork.ai/blog/spicychat-ai-review-2025-nsfw-features-comparisons/)
- [Introducing Semantic Memory 2.0 - SpicyChat](https://boosty.to/spicychat/posts/3434e53d-7393-46f3-855a-14ba506942ed)
- [SpicyChat AI on X (Semantic Memory 2.0 announcement)](https://x.com/SpicyChatAI/status/1791513641172275394)

### Character.AI
- [Character.AI's Breaking Point: Censorship, Metering, and Alternatives](https://blog.storychat.app/character-ais-breaking-point-censorship-metering-and-the-search-for-alternatives/)
- [Character AI's Filter Is Making the App Unusable](https://www.roborhythms.com/character-ai-filter-making-app-unusable/)
- [Voicing Reddit's Concerns: The Challenges with Character AI](https://www.allaboutai.com/resources/challenges-with-character-ai/)

### Replika
- [Replika's chatbot dilemma - The Decoder](https://the-decoder.com/replika-reveals-a-fundamental-chatbot-dilemma-by-censoring-erotic-chats/)
- [Reddit Discourse on AI Chatbots and Sexual Technologies (Academic Paper)](https://journals.sagepub.com/doi/full/10.1177/23780231241259627)
- [Lessons From an App Update at Replika AI (HBS Working Paper)](https://www.hbs.edu/ris/Publication%20Files/25-018_bed5c516-fa31-4216-b53d-50fedda064b1.pdf)
- [Attachment Theory as Framework for Social Chatbots (ResearchGate)](https://www.researchgate.net/publication/357665581_Attachment_Theory_as_a_Framework_to_Understand_Relationships_with_Social_Chatbots_A_Case_Study_of_Replika)
- [AI App Replika Accused of Deceptive Marketing - TIME](https://time.com/7209824/replika-ftc-complaint/)

### Yodayo
- [Yodayo AI Review 2025](https://skywork.ai/blog/ai-agent/yodayo-ai-review/)
- [Yodayo Guide 2025: AI Anime Platform](https://aitrendytools.com/blog/yodayo-ai-anime-platform-art-generator-guide-2025)

### KoboldAI / KoboldCpp
- [KoboldCpp Official Site](https://koboldcpp.com/)
- [KoboldCpp GitHub](https://github.com/LostRuins/koboldcpp)
- [KoboldAI Lite GitHub](https://github.com/LostRuins/lite.koboldai.net)

### Market & Trends
- [AI Companion Apps Market Growth - APA](https://www.apa.org/monitor/2026/01-02/trends-digital-ai-relationships-emotional-connection)
- [AI Roleplay Bots Guide 2026](https://skywork.ai/skypage/en/ai-roleplay-bots-guide/2036019730596859904)
- [NSFW AI Voice Chat: Soulkyn](https://blog.soulkyn.com/soulkyn-features/nsfw-ai-voice-chat-calls-soulkyn/)
- [Grok4 Virtual Companion Guide](https://supermaker.ai/blog/grok4-virtual-companion-ai-companionship-technology-guide/)
- [AI Regenerate UX Pattern](https://www.shapeof.ai/patterns/regenerate)

### Reddit / Community
- [10 AI Roleplay Platforms Redditors Swear By](https://rubii.ai/blog/best-ai-roleplay-reddit-community-recommendations-2025)
- [SillyTavern vs Character.AI Migration Data](https://catch-and-shoot.com/sillytavern-vs-character-ai-in-2026-why-power-users-are-migrating-and-what-the-data-shows/)
- [Character AI Filters Are Ruining Everything](https://www.roborhythms.com/character-ai-filters-are-ruining-everything/)
