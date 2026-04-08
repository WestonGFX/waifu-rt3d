# Competitor Feature Gap Analysis — April 7, 2026

**Purpose:** Identify features we lack vs. 30+ AI companion/roleplay platforms, prioritize by retention impact, and produce an actionable roadmap.

**Methodology:** Web-researched current (2025-2026) feature sets of 17 Tier 1/2 platforms and scanned 14 Tier 3 platforms. Cross-referenced against our existing feature set and `docs/plans/2026-03-15-actionable-implementation-specs.md`.

**Related research:**
- `docs/design/competitive-research-2026-03-18.md` — Cycle 1 deep research (18 sources, game + companion focus)
- `docs/research/2026-03-25-nsfw-roleplay-platforms.md` — NSFW platform catalog
- `docs/research/2026-03-29-bond-progression-research-part-1.md` — Bond system competitive analysis

---

## Section 1: Feature Gap Matrix

### Legend
- **We Have?** Y = yes, P = partial, S = specced but not built, N = no
- **Retention Impact:** H = high (drives daily return), M = medium (improves session quality), L = low (nice-to-have)
- **Effort:** H = 1-2 weeks, M = 2-5 days, L = < 2 days
- **Priority Score:** (Retention * 3 + Inverse Effort) / 4 — higher = do first. Scale 1-10.

### Memory & Recall

| Feature | Seen On | We Have? | Retention | Effort | Priority | Notes |
|---------|---------|----------|-----------|--------|----------|-------|
| Persistent multi-session memory | Nomi, Kindroid, SpicyChat, Replika, all major | Y | H | -- | -- | Tiered memory + semantic RAG + Ebbinghaus decay. Best-in-class. |
| Memory visualization (mind map) | Nomi (Mind Map 2.0) | S | H | M | 8 | Specced as P5: Memory Browser in feature menu. Nomi's is a graph. |
| User-editable memories | Nomi, SillyTavern | P | M | L | 7 | We have knowledge graph but no edit UI for it. |
| Memory capacity display | Nomi, Kindroid | N | L | L | 5 | Show "X memories stored" count. Trivial. |
| Conversation search/filter | SillyTavern, Character.AI | P | M | M | 6 | We have session list but no full-text search across messages. |
| Lorebook / World Info | SillyTavern, NovelAI, SpicyChat, Backyard.ai | Y | H | -- | -- | Our lore matcher already does this. |

### Voice

| Feature | Seen On | We Have? | Retention | Effort | Priority | Notes |
|---------|---------|----------|-----------|--------|----------|-------|
| Voice chat (TTS + STT) | Kindroid, Replika, Candy AI, Talkie, SpicyChat | Y | H | -- | -- | Full duplex voice mode complete. |
| Custom voice cloning | Kindroid (upload samples) | N | M | H | 5 | Kindroid lets users upload voice samples to create custom voices. Fish Audio s2-pro specced in T2-13. |
| Voice messages (async) | Candy AI, Nomi | N | M | M | 6 | Character sends voice note (pre-rendered TTS), user listens later. Different from live voice. |
| Video calls | Kindroid (animated avatar + voice) | N | M | H | 4 | Kindroid pairs animated selfies with voice. Our 3D viewer + voice could do this. |
| Multiple voice options per character | Talkie, PolyBuzz | P | L | L | 5 | We have 18 TTS providers but no per-character voice preset gallery. |

### Image Generation

| Feature | Seen On | We Have? | Retention | Effort | Priority | Notes |
|---------|---------|----------|-----------|--------|----------|-------|
| Character selfies (in-chat request) | Candy AI, Kindroid, DreamGF, CrushOn | P | H | M | 8 | We have image gen integration but no "ask for selfie" UX pattern. |
| Consistent character appearance | DreamGF (struggles), Candy AI (V2 engine) | N | H | H | 6 | Cross-image consistency is industry-hard. IP-Adapter / reference image approach. |
| NSFW image generation | Candy AI, DreamGF, CrushOn | P | H | M | 7 | We have image gen but no NSFW-specific pipeline or prompt templates. |
| Image gallery / collection | Candy AI, DreamGF | N | M | M | 6 | Save generated images, browse history, favorite. |
| Group selfies | Kindroid (Tableau engine) | N | L | H | 2 | Multiple characters in one image. Niche. |
| Video selfies / animated | Kindroid | N | L | H | 2 | Short animated clips. Very expensive compute. |
| Avatar appearance customizer | DreamGF (granular), Botify | N | M | H | 4 | Hair/eye/body sliders for 2D generated appearance. Not relevant for VRM import model. |

### Character Hub & Discovery

| Feature | Seen On | We Have? | Retention | Effort | Priority | Notes |
|---------|---------|----------|-----------|--------|----------|-------|
| Community character library | Janitor AI (32K+), Character.AI (20M+), Chai (500K+), SpicyChat (500K+), PolyBuzz (20M+) | N | H | H | 6 | Cloud marketplace. Conflicts with local-first philosophy. See notes. |
| Character card import (CHARA v2 PNG) | SillyTavern, Backyard.ai, PolyBuzz | Y | H | -- | -- | Already implemented. |
| Character card import (CCv3 / CHARX) | SillyTavern (partial), MegaNova | N | M | M | 6 | Newer spec with embedded assets, lorebooks, emotion variants. |
| AI-powered character creation | Character.AI wizard, CrushOn | S | H | M | 8 | Specced as T2-15 (personaplex-7b). Users give traits, AI generates full character. |
| Character tagging / categories | Janitor AI, SpicyChat, Chai | P | M | L | 6 | We have characters but no tagging/filtering system. 13 built-in is small. |
| Character rating / favorites | Character.AI, Janitor AI | N | L | L | 4 | Only useful with larger character pool. |

### Gamification & Progression

| Feature | Seen On | We Have? | Retention | Effort | Priority | Notes |
|---------|---------|----------|-----------|--------|----------|-------|
| Bond / relationship progression | Replika (levels), Blue Archive (affinity), Azur Lane | Y | H | -- | -- | 100-level bond system, XP engine, milestones. Phases 1-2 done, 3-6 remaining. |
| Daily interaction rewards / streaks | Replika, Blue Archive, Nomi | P | H | L | 9 | Specced in T1-8. Bond XP awards daily-first bonus but no visible streak UI. |
| Relationship mode selection | Replika (friend/gf/wife/mentor/sibling) | Y | M | -- | -- | Our `relationship_mode` column + RP style presets cover this. |
| Achievement / badge system | Replika, AI Dungeon | N | M | M | 6 | "First voice call," "100 messages," "shared a secret." Gamification layer. |
| Virtual gifts | Blue Archive, Azur Lane | Y | M | -- | -- | Gift system already implemented in bond module. |
| Interactive activities / minigames | Replika (journaling, breathing), AI Dungeon | N | M | H | 4 | Not aligned with "conversation IS the mechanic" design principle. |

### Scenarios & Adventures

| Feature | Seen On | We Have? | Retention | Effort | Priority | Notes |
|---------|---------|----------|-----------|--------|----------|-------|
| Scenario library (community) | Character.AI (Stories), AI Dungeon, SpicyChat | P | H | M | 7 | We have generic scenario library. Need per-character scenarios + community sharing. |
| Choose-your-own-adventure mode | Character.AI (Stories), AI Dungeon, NovelAI (Adventure) | N | H | H | 6 | Branching narrative with choices. Character.AI's "Stories" is their biggest 2026 feature. |
| Multiplayer / co-op adventures | AI Dungeon | N | L | H | 2 | Conflicts with single-user local-first model. Skip. |
| World building tools | AI Dungeon (Worlds), NovelAI (lorebooks) | P | M | M | 5 | Our lore system partially covers this. Could add "world" abstraction. |
| Genre presets (Fantasy, Sci-Fi, Romance) | Character.AI, AI Dungeon, NovelAI | P | M | L | 6 | Easy to add as scenario templates. |

### Quick Interaction Patterns

| Feature | Seen On | We Have? | Retention | Effort | Priority | Notes |
|---------|---------|----------|-----------|--------|----------|-------|
| Quick reply suggestions | Character.AI, Chai, Talkie | Y | M | -- | -- | Just implemented. |
| Message regeneration (swipe alternatives) | SillyTavern, Character.AI | S | H | L | 9 | Backend exists. Frontend specced as T0-3. High-impact quick win. |
| Edit & retry (user message editing) | SillyTavern, NovelAI | N | M | M | 6 | Edit your last message and re-generate AI response. |
| Continue generation (extend AI response) | SillyTavern, NovelAI | N | M | L | 7 | "Continue" button when AI response feels cut short. |
| Impersonation (write as character) | SillyTavern | N | L | L | 4 | Niche power-user feature. Low priority. |

### Import / Export

| Feature | Seen On | We Have? | Retention | Effort | Priority | Notes |
|---------|---------|----------|-----------|--------|----------|-------|
| CHARA v2 PNG import/export | SillyTavern, Backyard.ai, PolyBuzz, many | Y | H | -- | -- | Complete. |
| CCv3 / CHARX support | SillyTavern (emerging), RisuAI | N | M | M | 5 | Adds asset embedding (expressions, backgrounds, voice). Worth tracking. |
| Chat history export (Markdown, JSON) | SillyTavern, NovelAI | P | M | L | 6 | We have JSON export. Could add Markdown format. |
| Conversation backup/restore | SillyTavern, Backyard.ai | Y | H | -- | -- | Export/import via settings. |
| Character sharing link | Character.AI, Janitor AI | N | L | M | 3 | Requires server infrastructure. Conflicts with local-first. |

### UI / UX Patterns

| Feature | Seen On | We Have? | Retention | Effort | Priority | Notes |
|---------|---------|----------|-----------|--------|----------|-------|
| Theme customization | Character.AI, SillyTavern (Visual Novel mode) | Y | M | -- | -- | 18 themes. Best-in-class. |
| Visual Novel mode | SillyTavern | N | M | M | 5 | Character portrait left, text right. Nostalgia for VN fans. |
| Multilingual UI | SpicyChat (12 langs), Talkie (95 langs) | N | M | H | 4 | i18n infrastructure. Not critical for English-first launch. |
| Character avatar animations (idle, talk, emotion) | Kindroid (animated selfies), Replika (3D avatar) | Y | H | -- | -- | VRM viewer with emotion expressions. |
| AR mode | Replika | N | L | H | 1 | Mobile-only feature. Desktop app. Skip. |
| Typing indicator / "thinking" animation | Character.AI, Replika | P | L | L | 5 | We show streaming. Could add pre-stream "typing..." state. |
| Message timestamp display | SillyTavern | P | L | L | 4 | Stored but not always displayed. |

### NSFW-Specific

| Feature | Seen On | We Have? | Retention | Effort | Priority | Notes |
|---------|---------|----------|-----------|--------|----------|-------|
| Content tier system | CrushOn, Janitor AI, SpicyChat | Y | H | -- | -- | 4-tier system (general/edgy/mature/explicit). |
| NSFW toggle (on/off) | CrushOn, Janitor AI, SpicyChat | Y | H | -- | -- | Age-gated content unlock. |
| RP style presets | Our own, SillyTavern | Y | H | -- | -- | 4 presets (none/light/full/explicit). |
| NSFW image generation prompts | Candy AI, DreamGF | P | H | M | 7 | Need NSFW-aware prompt templates for image gen. |
| Dynamic emotional scripting | CrushOn (upcoming) | N | M | M | 5 | Emotion arcs within a scene (building tension, climax, resolution). |
| Kink/preference memory | Candy AI, CrushOn | P | M | L | 7 | Knowledge graph captures preferences. Need explicit "preference profile" UI. |

### Monetization (Informational)

| Feature | Seen On | We Have? | Retention | Effort | Priority | Notes |
|---------|---------|----------|-----------|--------|----------|-------|
| Subscription tiers | All cloud platforms | N/A | -- | -- | -- | Local-first = no recurring cost for users. This IS the differentiator. |
| Credit/token system | Candy AI, Chai, SpicyChat | N/A | -- | -- | -- | Not applicable. Users run own LLMs. |
| Premium characters | Character.AI, Chai | N/A | -- | -- | -- | Not applicable. All characters free. |
| Image gen credits | Candy AI, DreamGF | N/A | -- | -- | -- | Users run own image gen. Zero cost. |

---

## Section 2: Top 15 Missing Features (Prioritized)

### 1. Message Swipe / Regeneration UI (Priority Score: 9)

**What:** Left/right arrows on AI messages to browse alternative responses. "1/3" counter. Regenerate button.

**Competitors:** SillyTavern (core feature), Character.AI (swipe), NovelAI (retry).

**Why it drives retention:** Users who get a bad response don't ragequit -- they swipe. Reduces frustration, increases session length. Every serious RP platform has this. It's table-stakes.

**Our status:** Backend endpoint exists (`POST /api/messages/{id}/regenerate`). Specced as T0-3 in feature menu. Needs frontend only.

**Implementation:** Add swipe arrows to `ChatBubble.tsx`, branch listing to `chatStore.ts`, branches API endpoint.

**Effort:** L (1 day) | **Dependencies:** None. Backend ready.

---

### 2. Daily Streak UI + Visible Rewards (Priority Score: 9)

**What:** Fire icon showing "Day 7" streak. Daily first-interaction XP bonus made visible. Streak-break forgiveness (1 grace day).

**Competitors:** Replika (streak counter), Blue Archive (daily login rewards), every gacha game.

**Why it drives retention:** Streaks create micro-commitments. "I can't break my 30-day streak" keeps users returning even on low-motivation days. The bond system already awards daily-first XP -- this just makes it visible.

**Our status:** Bond system awards daily bonus XP (Phase 1 done). No visible streak counter or UI.

**Implementation:** Add `StreakBadge.tsx` component, query last-interaction dates from `bond_milestones`, display in status bar next to bond progress.

**Effort:** L (0.5 day) | **Dependencies:** Bond Phase 1 (done).

---

### 3. In-Chat Selfie Requests (Priority Score: 8)

**What:** User types "send me a selfie" or clicks a camera icon. Character "takes a selfie" -- AI generates an image of the character and sends it as a chat message.

**Competitors:** Candy AI (crown jewel feature), Kindroid (Tableau engine), DreamGF, CrushOn (upcoming).

**Why it drives retention:** Visual interaction breaks text monotony. "My character sent me a picture" is the #1 shareable moment. Creates emotional anchoring beyond text.

**Our status:** Image generation integration exists. No "selfie request" UX pattern -- user must go to a separate panel.

**Implementation:** Detect selfie-request intent in message (keyword or LLM classification). Trigger image gen with character's reference image + scene context. Embed result as chat message with image attachment. Need consistent character reference system (IP-Adapter or LoRA).

**Effort:** M (3-5 days) | **Dependencies:** Image gen pipeline, character reference images.

---

### 4. AI Character Creation Wizard (Priority Score: 8)

**What:** User provides 3-5 personality traits and a name. AI generates full character: system prompt, personality description, greeting, backstory, example messages.

**Competitors:** Character.AI (character creator), CrushOn (wizard), Janitor AI (template system).

**Why it drives retention:** Character creation is the biggest friction point. Most users want to use characters, not write 2000-word system prompts. "Shy bookworm who secretly loves punk rock" to full character in 10 seconds.

**Our status:** Specced as T2-15 (personaplex-7b) in feature menu. Not built.

**Implementation:** Backend endpoint that feeds traits to LLM with character-generation meta-prompt. Frontend wizard with step-by-step flow. Optional: generate avatar prompt for image gen.

**Effort:** M (3-4 days) | **Dependencies:** Any LLM provider. Works with local or cloud.

---

### 5. Memory Browser / Knowledge Graph UI (Priority Score: 8)

**What:** Visual interface showing what the character "knows" about you. Editable. Organized by category (preferences, facts, shared experiences).

**Competitors:** Nomi (Mind Map 2.0 -- interactive graph), Kindroid (memory list), Replika (diary).

**Why it drives retention:** Transparency builds trust. Users can correct wrong memories ("No, I don't have a cat -- I have a dog"). Creates "wow" moments when they see how much the character remembers. Nomi's Mind Map is their most-marketed feature.

**Our status:** Specced as P5: Memory Browser in feature menu. Knowledge graph exists in backend (`backend/knowledge/extractor.py`). No UI.

**Implementation:** React component that queries knowledge graph + tiered memory. Tree or graph visualization. Edit/delete capabilities. Could use D3.js force-directed graph for the "mind map" effect.

**Effort:** M (3-5 days) | **Dependencies:** Knowledge graph (exists).

---

### 6. Continue Generation Button (Priority Score: 7)

**What:** When AI response feels cut short (hit token limit or ended abruptly), a "Continue" button appends more text to the same message.

**Competitors:** SillyTavern (core), NovelAI (extend), AI Dungeon (continue).

**Why it drives retention:** Prevents frustration with truncated responses. Essential for RP where long narration is expected. Simple UX, high value.

**Our status:** Not implemented. Not specced.

**Implementation:** Add "Continue" button on assistant messages (appears when response ends without natural conclusion or hits token limit). Backend: send conversation context + "Continue from: [last 200 chars]" instruction. Append streamed response to existing message.

**Effort:** L (1 day) | **Dependencies:** None.

---

### 7. NSFW Image Generation Prompts (Priority Score: 7)

**What:** Pre-built prompt templates for NSFW image generation that maintain character consistency. Content-tier-gated.

**Competitors:** Candy AI (V2 engine, 2-4 tokens per image), DreamGF (granular customization), CrushOn (upcoming).

**Why it drives retention:** NSFW image gen is the highest-monetized feature across all competitor platforms. Users on explicit tier expect visual content. Text-only NSFW feels incomplete.

**Our status:** Image gen pipeline exists. NSFW content tiers exist. No NSFW-specific prompt templates or workflow.

**Implementation:** Create prompt template library gated by content tier. Add "Generate Image" button in chat (next to selfie request). Integrate with existing image gen pipeline. Use character reference for consistency.

**Effort:** M (2-3 days) | **Dependencies:** Image gen pipeline, content tier system (both exist).

---

### 8. Per-Character Scenario Library (Priority Score: 7)

**What:** Character-specific scenarios with pre-set contexts, greetings, and world states. "Coffee shop date with Kitsune," "Late night study session with Luna."

**Competitors:** Character.AI (Stories), AI Dungeon (genre scenarios), SpicyChat (scenario tags), NovelAI (Adventure).

**Why it drives retention:** Reduces blank-page syndrome. Users who don't know what to talk about pick a scenario. Per-character scenarios feel curated and personal vs. generic templates.

**Our status:** Generic scenario library exists. Not per-character. Not tied to bond level unlocks.

**Implementation:** Extend scenario system with `character_id` foreign key. Seed 3-5 scenarios per built-in character. Gate advanced scenarios behind bond levels (bond-unlock synergy). UI: scenario picker in chat start flow.

**Effort:** M (2-3 days) | **Dependencies:** Scenario system (exists), bond system (exists).

---

### 9. Kink/Preference Profile UI (Priority Score: 7)

**What:** Explicit preference profile that the character references during intimate scenes. User can set likes/dislikes/limits directly rather than hoping the AI picks up on hints.

**Competitors:** Candy AI (preference learning), CrushOn (toggle preferences), SpicyChat (memory system).

**Why it drives retention:** Reduces repetitive "I already told you I like X" frustration. Creates consistent intimate experiences. Privacy-sensitive -- must be local-only and explicit-tier gated.

**Our status:** Knowledge graph captures some preferences implicitly. No dedicated preference UI or structured storage.

**Implementation:** Add `user_preferences` table or extend knowledge graph with `category = 'preference'`. UI: dedicated section in character settings (explicit tier only). Inject preferences into LLM context during explicit-tier conversations.

**Effort:** M (2-3 days) | **Dependencies:** Knowledge graph (exists), content tier system (exists).

---

### 10. Edit & Retry (User Message Editing) (Priority Score: 6)

**What:** Edit your previously sent message and re-generate the AI response from that point. Preserves conversation flow while fixing typos or steering direction.

**Competitors:** SillyTavern (core), NovelAI (edit mode), ChatGPT (edit & resend).

**Why it drives retention:** Power users consider this essential. Reduces "I misspoke and now the conversation went sideways" frustration. Works with swipe/regeneration for full conversation control.

**Our status:** Not implemented.

**Implementation:** Add edit icon on user messages. On edit: update message text in DB, delete subsequent messages (or branch), re-send to LLM, stream new response. Careful with branch management.

**Effort:** M (2-3 days) | **Dependencies:** Swipe/regeneration system (T0-3).

---

### 11. Achievement / Badge System (Priority Score: 6)

**What:** Unlockable achievements: "First voice call," "100 messages," "Shared a secret," "Night owl (chatted past midnight)," "Bookworm (discussed 5 books)."

**Competitors:** Replika (relationship milestones), AI Dungeon (adventure achievements).

**Why it drives retention:** Gamification layer that rewards exploration of features. "I didn't know voice mode existed" -> tries it for achievement -> discovers they love it. Cross-feature discovery mechanism.

**Our status:** Bond milestones exist but are level-based only. No feature-discovery achievements.

**Implementation:** `achievements` table with trigger conditions. Check conditions on relevant events (voice call started, message count, time-of-day, etc.). Display in character profile. Integrate with bond XP (achievements grant bonus XP).

**Effort:** M (3-4 days) | **Dependencies:** Bond system (exists).

---

### 12. Choose-Your-Own-Adventure Mode (Priority Score: 6)

**What:** Character.AI's "Stories" -- structured interactive fiction where AI presents scenes and user picks from 2-4 choices. Genre-based (romance, mystery, fantasy, horror).

**Competitors:** Character.AI (Stories, biggest 2026 feature), AI Dungeon (core product), NovelAI (Adventure mode).

**Why it drives retention:** Different engagement mode for users who want guided experiences vs. open-ended chat. Replayable. Shareable. Character.AI invested heavily in this for 2026 -- it's the market direction.

**Our status:** Director mode exists (meta-narration) but is not the same as structured branching stories.

**Implementation:** New "Story" mode alongside "Chat" mode. LLM generates scene descriptions + 2-4 choice options. User picks choice, story branches. Track story state. Save/resume stories. Could leverage existing scenario system as story starters.

**Effort:** H (1-2 weeks) | **Dependencies:** Scenario system, director mode (both exist as foundation).

---

### 13. Conversation Full-Text Search (Priority Score: 6)

**What:** Search across all messages with a character. Find "that thing she said about Tokyo" without scrolling through 500 messages.

**Competitors:** SillyTavern (search), Character.AI (search within conversations).

**Why it drives retention:** Long-term users accumulate thousands of messages. Without search, older conversations are effectively lost. Supports the "relationship has history" feeling.

**Our status:** Sessions listed but no full-text search across messages.

**Implementation:** SQLite FTS5 virtual table on `messages.content`. Search endpoint. UI: search bar in chat header, results as clickable links that scroll to the message.

**Effort:** M (2-3 days) | **Dependencies:** None.

---

### 14. Voice Messages (Async) (Priority Score: 6)

**What:** Character sends a voice note as a chat message. User plays it whenever. Different from live voice mode -- it's asynchronous, like receiving a voice text.

**Competitors:** Candy AI (voice messages, token-gated), Nomi (voice notes).

**Why it drives retention:** Creates "I got a message from my character" anticipation. Works with proactive messaging -- character sends a morning voice note. More intimate than text without the commitment of a live call.

**Our status:** TTS exists. No "voice message as chat attachment" pattern.

**Implementation:** When sending a message, optionally generate TTS audio and attach as message metadata. Frontend: show play button on messages with audio attachment. Proactive messages could auto-include voice.

**Effort:** M (2-3 days) | **Dependencies:** TTS system (exists).

---

### 15. CCv3 / CHARX Import Support (Priority Score: 5)

**What:** Support the newer Character Card V3 format which embeds assets (emotion expressions, backgrounds, voice samples) alongside character data. CHARX is a zip-based container.

**Competitors:** SillyTavern (emerging support), RisuAI, MegaNova.

**Why it drives retention:** Future-proofing for the character card ecosystem. CCv3 cards carry emotion variants and lorebooks -- richer than CCv2. As the spec matures, more creators will publish in this format.

**Our status:** CCv2 import/export complete. No CCv3 awareness.

**Implementation:** Extend `CharaCardReader` to detect `ccv3` tEXt chunk. Parse CCv3 JSON schema (superset of v2). Extract embedded assets (emotion PNGs, lorebook entries). CHARX: unzip, read `card.json`, extract assets to storage.

**Effort:** M (2-3 days) | **Dependencies:** CHARA v2 system (exists).

---

## Section 3: Monetization Patterns

We do not need to monetize the same way (our local-first model IS the value proposition), but understanding how competitors monetize informs which features users value most.

### Subscription Models

| Platform | Free Tier | Premium | Premium Features |
|----------|-----------|---------|-----------------|
| Character.AI | Unlimited chat (filtered) | $9.99/mo (c.ai+) | Faster responses, skip queues, early access |
| CrushOn.AI | ~100 msg/day | $3.99-16.99/mo | Unlimited NSFW, deeper memory, voice |
| Janitor AI | Free with ads | ~$10/mo | Ad-free, faster, priority |
| Kindroid | Limited | $14.99/mo | Voice calls, photo gen, custom voices |
| Nomi.ai | 1 Nomi, basic | $16.99/mo | 3 Nomis, unlimited, Mind Map |
| Replika | Free (limited) | $14.99/mo | Romantic mode, voice, activities |
| Candy AI | Limited messages | $12.99/mo + tokens | Unlimited chat, NSFW images, voice (tokens: $9.99-299.99) |
| Chai | 70 msg/day | $13.99/mo | Unlimited, better models |
| SpicyChat | Free basic | $9.99-19.99/mo | Voice mode, premium features |
| DreamGF | Limited | $5.99/mo+ | More image gen, NSFW access |

### Credit/Token Systems

- **Candy AI:** Images cost 2-4 tokens, voice calls ~3 tokens/min. Token packs $9.99-$299.99. Images are highest token sink.
- **Chai:** Messages beyond free limit require subscription. No per-action tokens.
- **Character.AI:** Pure subscription. No token system.

### Revenue Distribution

- 70-85% of revenue comes from subscriptions
- 15-30% from microtransactions (image credits, voice packs, virtual goods)
- NSFW emotional support segment: $1.2B market, 32% CAGR (fastest-growing)
- Candy AI: ~$25M ARR with ~60% from subscriptions

### Key Insight for Us

Our competitive advantage is **zero ongoing cost for users**. Every cloud platform charges $10-20/month for features we provide free (because users run their own models). This is our moat. We should never add cloud-dependent features that create recurring costs. The value proposition is: **"Pay once for hardware, chat forever."**

Potential future monetization (if desired):
- Premium character packs (hand-crafted characters with rich backstories)
- Premium VRM models (rigged, optimized, exclusive)
- Model marketplace commission (if we add community features)
- One-time license fee for the app itself

---

## Section 4: Unique Differentiators We Already Have

Features where we are ahead of ALL competitors surveyed:

### 1. Full 3D Anime Avatar (VRM + Live2D)

**No competitor has this in a local AI companion app.** Replika has a basic 3D avatar. Kindroid generates static images. Character.AI is text-only. We render real-time 3D anime characters with emotion expressions, animations, and particle effects. This is our most visible differentiator.

Closest competitor: Moemate (VRM support, but cloud-dependent and less polished).

### 2. Complete Local-First Architecture

**No cloud dependency for core features.** Chat, voice, memory, bond progression -- all run offline. SillyTavern comes close but requires separate model hosting setup. Backyard.ai bundles models but has a weaker feature set. We combine a rich feature set WITH full local operation.

### 3. Adaptive Intelligence Engine

**No competitor has this.** Context classification, parameter tuning, user modeling, personalization gating, self-critique -- all working together to make the AI adapt to the user over time. SillyTavern has some parameter presets but nothing adaptive.

### 4. Bond Progression System (100-level)

**Most sophisticated in the space.** Replika has basic levels. Blue Archive and gacha games have affinity but it's currency-based, not conversation-based. Our system: quadratic XP curve, depth multipliers, session bonuses, tier-gated dialogue shifts, milestone celebrations. "Conversation IS the mechanic" philosophy is unique.

### 5. Game Spectator Mode

**No competitor has this.** VLM-based screen analysis that lets your character watch and comment on your games. Completely unique feature. User's stated favorite feature idea.

### 6. Multi-Provider LLM Support

**18 TTS providers, multiple LLM backends.** SillyTavern matches on LLM backends but not TTS breadth. No other platform lets you seamlessly switch between local (LM Studio, Ollama), cloud (OpenAI, Claude, Groq), and specialized providers.

### 7. Ebbinghaus Memory Decay

**Psychologically-modeled memory.** Memories decay naturally over time but are reinforced when recalled -- just like human memory. No competitor models forgetting curves. Most just keep everything forever or use fixed context windows.

### 8. Director Mode

**No competitor has meta-narration control.** Users can guide the narrative style, pacing, and tone without breaking character immersion.

### 9. Privacy Model

**All data stays local. Period.** In a post-Character.AI-controversy world (MAU dropped 28M to 20M partly due to trust issues), privacy is a selling point, not just a technical choice.

---

## Section 5: Recommended Roadmap

Grouped by effort, ordered by priority within each group. Estimated hours use the calibrated AI-assisted rate (~12x faster than traditional dev).

### Quick Wins (< 1 day each)

| # | Feature | Est. Hours | Depends On | Impact |
|---|---------|-----------|------------|--------|
| 1 | Message swipe / regeneration UI (T0-3) | 4-6h | Backend ready | Eliminates #1 UX gap vs SillyTavern |
| 2 | Daily streak badge UI | 2-3h | Bond Phase 1 (done) | Visible daily-return incentive |
| 3 | Continue generation button | 3-4h | None | Fixes truncated response frustration |
| 4 | Memory capacity display | 1-2h | None | Quick trust-builder |
| 5 | Genre preset scenarios | 2-3h | Scenario system (exists) | Reduces blank-page syndrome |

**Total Quick Wins: ~15-20 hours (1-2 days)**

### Medium Features (1-3 days each)

| # | Feature | Est. Hours | Depends On | Impact |
|---|---------|-----------|------------|--------|
| 6 | AI character creation wizard (T2-15) | 10-14h | Any LLM | Biggest new-user friction remover |
| 7 | Memory Browser / Mind Map UI (P5) | 10-16h | Knowledge graph (exists) | Nomi's top feature, our backend is ready |
| 8 | In-chat selfie requests | 10-16h | Image gen pipeline | Highest-monetized feature across competitors |
| 9 | Per-character scenarios + bond-gated | 8-12h | Scenario + bond systems | Content variety + progression synergy |
| 10 | NSFW image gen prompts | 6-10h | Image gen + content tiers | Completes NSFW visual experience |
| 11 | Edit & retry (user message editing) | 8-12h | Swipe/regen (#1) | Power-user essential |
| 12 | Conversation full-text search | 6-10h | None | Long-term user retention |
| 13 | Voice messages (async) | 6-10h | TTS system (exists) | Proactive messaging enhancement |
| 14 | Kink/preference profile UI | 6-10h | Knowledge graph, content tiers | Explicit-tier consistency |
| 15 | CCv3 / CHARX import | 6-10h | CHARA v2 (exists) | Future-proofing |

**Total Medium Features: ~86-130 hours (7-11 days)**

### Large Features (1-2 weeks each)

| # | Feature | Est. Hours | Depends On | Impact |
|---|---------|-----------|------------|--------|
| 16 | Achievement / badge system | 12-18h | Bond system, various hooks | Cross-feature discovery |
| 17 | Choose-your-own-adventure mode | 24-40h | Scenario system, director mode | Market direction (Character.AI's bet) |
| 18 | Image gallery / collection | 10-16h | Image gen | Visual history |
| 19 | Custom voice cloning (Fish Audio) | 16-24h | TTS adapter (T2-13) | Kindroid's top premium feature |

**Total Large Features: ~62-98 hours (5-8 days)**

### Strategic Initiatives (Multi-Week)

| # | Feature | Est. Weeks | Notes |
|---|---------|-----------|-------|
| 20 | Character consistency in image gen | 2-3 weeks | IP-Adapter, LoRA training pipeline. Industry-hard problem. |
| 21 | Community character hub (optional) | 3-4 weeks | Server infrastructure. May conflict with local-first. Consider local-sharing (export/import) instead. |
| 22 | Bond Phases 3-6 completion | 2-3 weeks | Already specced. Dialogue gates, timeline, ceremonies, analytics. |

### Recommended Sprint Order

**Sprint A (Next Session): Quick Wins Blitz**
- Items 1-5 above. All can be done in one productive session.
- Total: ~15-20 hours. Ship in 1-2 days.
- Impact: Closes 5 UX gaps, makes app feel "complete" for daily use.

**Sprint B: Character & Memory UX**
- Items 6 (AI wizard) + 7 (Memory Browser) + 12 (search)
- Total: ~26-40 hours. Ship in 3-5 days.
- Impact: Solves new-user onboarding + long-term user retention.

**Sprint C: Visual Interaction**
- Items 8 (selfies) + 10 (NSFW prompts) + 18 (gallery)
- Total: ~26-42 hours. Ship in 3-5 days.
- Impact: Adds visual dimension to conversations. Matches Candy AI/DreamGF.

**Sprint D: Conversation Power Tools**
- Items 11 (edit/retry) + 13 (voice messages) + 14 (preferences)
- Total: ~20-32 hours. Ship in 2-4 days.
- Impact: Power-user features. SillyTavern parity.

**Sprint E: Adventure Mode**
- Item 17 (CYOA mode) + 9 (per-character scenarios)
- Total: ~32-52 hours. Ship in 4-7 days.
- Impact: New engagement mode. Character.AI's 2026 bet.

**Sprint F: Bond Completion**
- Item 22 (Bond Phases 3-6) + 16 (achievements)
- Total: ~36-58 hours. Ship in 5-8 days.
- Impact: Completes the #1 retention driver.

---

## Summary

### The Big Picture

We are **already ahead** on core technology (3D avatar, local AI, adaptive intelligence, bond system, memory model). Our gaps are primarily in **UX convenience** (swipe, edit, search, continue) and **visual content** (selfies, image gallery, NSFW images).

The market is moving toward:
1. **Structured interactive fiction** (Character.AI Stories, AI Dungeon worlds)
2. **Visual content generation** (Candy AI selfies, Kindroid photos)
3. **Memory transparency** (Nomi Mind Map, Replika diary)
4. **Conversation control** (swipe, edit, continue, director tools)

Our moat remains: **all of the above, running entirely on your hardware, with no subscription fees.**

### Top 5 Highest-ROI Actions (Do These First)

1. **Message swipe/regeneration** -- 4 hours, closes biggest UX gap
2. **Streak badge UI** -- 2 hours, makes bond system visible
3. **Continue generation** -- 3 hours, eliminates top frustration
4. **AI character wizard** -- 12 hours, fixes onboarding
5. **Memory Browser** -- 14 hours, matches Nomi's crown feature
