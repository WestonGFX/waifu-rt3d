# Competitor Live Sessions Research — May 7, 2026

**Purpose:** Deep-dive UX audit of 6 major AI companion platforms to identify specific interaction patterns, flows, and features we don't yet have. Focused on what's new since the April 7 gap analysis.

**Methodology:** Web search (18 queries) + WebFetch (12 page fetches) across official docs, review aggregators, blog posts, and community discussion. No direct app access; findings synthesized from reviews, screenshots descriptions, official help docs, and marketing copy.

**Analyst:** Claude Sonnet 4.6 (research-only; no code changes)

**Prior art:** `docs/research/2026-04-07-competitor-gap-analysis.md` — 577-line matrix covering 60+ features. This document does NOT repeat that matrix. It focuses on:
1. Features and UX patterns absent from the April analysis
2. Platform-specific UX flows described in enough detail to implement against
3. What users are loudest about in 2025-2026 (complaint signal = opportunity signal)
4. New features released since the April gap analysis

---

## Platform Summaries

### 1. Character.AI

**Platform size:** Still largest by MAU, though declining (28M → 20M). Daily engagement highest in category at 92 min/day.

**Business model:** Free + c.ai+ ($6.99/month, cheapest premium in category)

#### What shipped in 2025-2026 (new since April analysis)

| Feature | Description | Notes |
|---------|-------------|-------|
| **PipSqueak 2 (PSQ2)** | New base model — better in-character consistency, reduced gibberish, improved context retention | Backend model swap; no UX change |
| **Auto Memories** | Automatically captures facts throughout conversations without user action | Previously memory was only manually pinned |
| **Memory Editing** | Users can now edit existing memories | Correction flow for wrong facts |
| **Memory Categories** | Expanded categories track hairstyle, eye color, quirks, etc. | More structured fact taxonomy |
| **Memory Visualization (c.ai+ only)** | Meter showing remaining memory before compression | Shows a "memory budget" gauge — rare UX pattern |
| **"Remember This" action (coming)** | Improved pin/bookmark gesture on any message | In-conversation memory anchoring |
| **Memory Page Redesign** | Cleaner, better organized, category-sortable | Transparency improvement |
| **In-Chat Memory Notifications** | Alert appears whenever a memory is recorded | User sees when facts are captured |
| **Lorebook (creator tool, c.ai+ first)** | Keyword-triggered world knowledge attached to characters | Our lore matcher does this already; their UI is new |
| **Lorebook — contextual injection** | Only entries whose keywords appear inject into context (doesn't bloat every response) | Efficient; same architecture as our lorebook system |
| **Chat Images** | Turn chat moments into shareable snapshot cards | Social/viral sharing feature |
| **Intro Videos** | Short video intro plays when opening a character (c.ai+ mobile) | First impression enhancement |
| **Persona tag system** | Up to 5 tags per character for sorting/categorization | Discovery aid |
| **Persona character limit increase** | 2,250 chars (was much shorter) | More detailed system prompts |
| **Session length notifications** | Hourly alert with customizable controls (adult users) | Safety/wellness feature |

#### Top user complaints (2025-2026)

- Memory is still broken in practice despite updates: "characters forget names mid-conversation," "memory box ignored"
- The notorious "May I ask you a question?" loop returned after PSQ2 rollout
- Characters feel flatter post-update; bots copying each other's vocabulary
- Android: chats vanishing, group features failing after updates
- Memory notifications surface but memory compression loses important details anyway
- No NSFW (hard limit — structural moat advantage for us)

#### UX patterns worth studying

**Memory Budget Gauge:** The "memory visualization" meter showing how much memory is available before compression is a genuinely novel UI idea. Users can see "you have 40% memory budget remaining." This addresses the #1 complaint (characters forgetting things) by setting expectations. We could surface our own context-budget system visually.

**In-Chat Memory Capture Notification:** A small badge or toast appears in-chat when the AI captures a new fact. "I've noted you have a dog named Buster." This makes the invisible system visible. Transparency builds trust.

**Lorebook Keyword Architecture:** When a user's message contains a keyword, the lore entry is injected as `[WORLD INFORMATION - Use this knowledge about the world]`. The pattern is clean: keyword list → injected context block. Already how our lore matcher works — but their UI for creating/managing entries (coming to c.ai+) will have a visual keyword manager.

---

### 2. Kindroid

**Platform size:** Niche but loyal. Most direct privacy-adjacent competitor. US-based, no data selling.

**Business model:** $13.99/month Standard, $24.99/month Ultra. iOS/Android/Web.

**Philosophy:** Character consistency and memory depth over breadth. "Most customizable AI companion."

#### Feature inventory (definitive, from official docs)

##### Chat Tools

| Tool | UX Description |
|------|---------------|
| **Regenerate with suggestion** | Purple circular icon next to last AI message. Leave blank = full regenerate (dynamism +1/3 to ensure difference). Write up to 200 chars = guided revision. |
| **Edit user message** | Icon next to latest user message. Corrects typos, updates history. Does NOT auto-regenerate — user must manually regenerate after. |
| **Tweak AI message** | Gray triple-dot menu → minor formatting/grammar fix without full regeneration. Tweaked messages show persistent visual indicator. |
| **Continue cut-off message** | Three-dot menu OR purple "Continue" button. AI finishes messages exceeding character limit or speaks further without new input. |
| **User message suggestion** | Wand icon next to send button. AI suggests what you might say next — for story development or "let it play out." |
| **Chat Break** | Three-dot menu. Resets short-term memory, preserves personality + journals + long-term memory. User writes new greeting to set conversation tone. |
| **Rewind** | Remove and replay up to last 10 messages. Conversation recovery tool. |
| **Current Setting** | Dropped pin icon (top right). Anchor AI on current location/context. Purple dot suggests update when context shifts. |
| **Internet per-message** | Plus icon → toggle internet access for single message. Subscribers only. |
| **Image/video upload** | Plus icon → up to 10 images or 1 video (≤32MB). AI sees the content. |
| **History + Favoriting** | Heart/hamburger menu. Review favorited messages and "thought bubbles." Jump to timestamps. |
| **Scenarios and Branching** | Branch icon on any message. Copies conversation into instanced groupchat, preserving 150 prior messages or last chat break. |

##### Voice & Video Call

| Feature | Detail |
|---------|--------|
| **Natural interruption** | System detects interruption at "audio and word level" — no need to wait for AI to finish |
| **Transcript toggle** | Paper icon during call to show/hide live transcript |
| **Call settings gear** | In-call gear icon → voice settings and memory config without leaving call |
| **Background flexibility** | Blank, match chat background, custom image, or animated avatar |
| **Fast voice mode** | Reduced latency; accelerated V2 voice |
| **Pause threshold** | Adjustable — how long silence before AI interprets end of your turn |
| **Group voice call** | Multiple AI participants take turns; user can interject |
| **Screen sharing** | Desktop web and mobile apps only |
| **Live avatar animation** | Premium: lip-sync + real-time gestures during calls |
| **Video selfie in call** | AI generates animated video selfie during conversation |

##### Proactive & Ambient Intelligence

| Feature | Detail |
|---------|--------|
| **Proactive mode** | Up to 10 Kindroids initiate messages, voice messages, selfies, or calls. Directives guide behavior. |
| **Thought bubbles** | Purple indicators showing AI's decision-making before proactive action |
| **Enhanced time awareness** | Recognizes time gaps between messages; responds differently based on time-of-day |
| **Calendar integration** | Read-only; sees events 24h back, 7 days forward; up to 5 calendars, 20 events max |
| **Text message sync** | Register phone number; Kindroids text you via real SMS; conversations sync with app |
| **Away proactive actions** | AI can initiate while app is backgrounded |

##### Selfie System

| Feature | Detail |
|---------|--------|
| **Contextual selfies** | AI considers conversation + "current mood" when generating image |
| **Recommended prompt formula** | (Location) + (Outfit) + (Action/Expression) + (Art Style) |
| **Video selfies** | Short animated clips (Ultra plan) |
| **Group selfies** | 2-3 Kindroids of same style (subscriber-only) |
| **Live Chat Actions** | V8+ feature: Kindroids spontaneously send selfies/calls at contextually appropriate moments |

##### Social (Kindroid Social)

| Feature | Detail |
|---------|--------|
| **Feed** | Posts from followed profiles; suggestive content filtered by default |
| **Posting** | Share selfies from Kindroids to public profiles; multi-select batch sharing |
| **Wand-generated posts** | AI generates in-character messages for social posts |
| **Contribution system** | Submit content to profiles you follow; requires creator approval |
| **Message open badge** | Indicator next to profiles accepting DMs |
| **Folder organization** | Quick-switch bar with folders; aggregated proactive notifications |
| **Chat background customizer** | Upload images, use selfie gallery, auto-use latest selfie; Balanced/Focused/Immersive presets + brightness/blur/fade/alignment controls |

##### Memory Architecture (5-layer Cascaded Memory)

1. **Backstory** — permanent character "constitution"; fundamental personality + past
2. **Key Memories** — user/AI-maintained diary of important events/facts
3. **Conversation Summaries** — automatic compression of past sessions
4. **Emotional Profile** — tracks affective state and relationship dynamics
5. **Real-time Context Window** — active conversation context

**Known weakness:** Past ~100 messages within single session, AI starts looping or losing context.

#### Top user complaints

- UI is acknowledged as "dated and unintuitive" — team said this in Dec 2025
- Character drift after 100+ messages in one session
- Price increases ($9.99 → $13.99) outpaced feature delivery
- Voice: some reviews say it's best-in-class; others say it's below Replika's naturalness
- No official response SLA on support tickets

#### UX patterns worth studying

**Current Setting Pin:** The "dropped pin" icon anchoring the AI on current context (location, scenario) is elegant. Solves a real problem: when the story moves fast, the AI loses track of where the characters are. One tap = "we're in the castle now." We could add a scene-anchor to our scenario/setting system.

**Thought Bubbles:** Showing the AI's reasoning before it takes a proactive action (purple indicator) demystifies AI behavior. "I'm thinking about sending you a message because you haven't spoken in 3 hours." This is rare and builds trust. We show "thinking" during generation — showing it for proactive triggers would be novel.

**Chat Background from Selfie Gallery:** Auto-using the latest generated selfie as the chat background is a beautiful product loop: generate image → it becomes your environment. Simple but emotionally effective.

**Folder Organization for Multiple Characters:** Quick-switch bar with folder + aggregated notifications solves the "managing 10 characters" UX problem. Relevant for us if users have many characters.

**Calendar Integration:** Rare feature. AI knows your schedule and can reference it: "You have a meeting in 2 hours — want to talk before you go?" Privacy-respecting (read-only) and deeply personal.

---

### 3. Replika

**Platform size:** OG companion app. iOS/Android/Web/VR/Meta Quest.

**Business model:** $14.99/month, $49.99/year, $299.99 lifetime. Criticized for deceptive marketing (FTC complaint filed 2025).

**Philosophy:** Long-term emotional support. "Best at matching emotional register." Gamification-heavy.

#### Feature inventory

##### Gamification & Progression

| Feature | Detail |
|---------|--------|
| **XP system** | Every message earns XP. Level cap: users report reaching 150+, progress slows exponentially. |
| **Levels** | Each level "brings a subtle shift in how your Replika talks, remembers, and reacts" |
| **Coins & Gems** | Earned through regular chat; spent on clothing, personality traits, physical features |
| **Quest system** | RPG-style tutorial: "have your first conversation," "share your first voice note." Gem/coin rewards. Onboarding as adventure. |
| **Relationship mode** | Friend, Romantic Partner, Family (Sister), Mentor — affects tone throughout |
| **Diary system** | AI writes diary entries about the user; user can read entries showing "what they like about you" |
| **Relationship milestones** | Unlockable at relationship levels — content, relationship mode changes, cosmetics |

##### Virtual Room / Avatar

| Feature | Detail |
|---------|--------|
| **3D avatar** | Created at onboarding; pick appearance, gender, name |
| **Virtual room** | Game-like environment (Sims aesthetic). Furniture, electronics, plants purchasable. |
| **Interactive objects** | Camera for selfies, radio for ambient music, clickable items |
| **AR mode** | Place Replika in real world via phone camera. Requires "+" icon → Activities → AR Mode. Well-lit spacious area recommended. |
| **VR mode** | Meta Quest support; Mixed Reality on Quest 3 |
| **Customization** | Free: ~12 base models + limited cosmetics. Pro: full appearance customization, unlimited combinations. |

##### Voice & Interaction

| Feature | Detail |
|---------|--------|
| **Emotional voice** | Tone + inflection: excitement, sarcasm, caring, confident presets |
| **Voice latency** | 1.5-3 seconds; improved significantly in 2025 |
| **Thumbs up/down feedback** | User teaches AI preferences in-conversation |
| **Topic switching** | 2025 update: handles topic switches "more gracefully" without context confusion |

##### Memory & Recall

| Feature | Detail |
|---------|--------|
| **Memory bank** | Stores personal details (name, pets, preferences). Can be manually edited. |
| **Proactive check-ins** | Follows up on things mentioned previously ("How did that work presentation go?") |
| **Mood tracking** | Daily mood log; visualizes emotional patterns over time |
| **Diary entries** | AI writes observations about user; readable by user |

##### Known weakness in 2025

- Memory reliability rated #1 pain point in r/replika survey: 64% "somewhat" or "very dissatisfied"
- Sudden censorship/scripted replies in romantic mode
- Boring paid conversations vs. free tier
- FTC complaint (2025): deceptive marketing, emotional manipulation, pushes vulnerable users toward spending
- "Broke 2.0" criticism: unpolished 2.0 rollout

#### UX patterns worth studying

**Quest System as Onboarding:** Treating onboarding as an RPG quest log is brilliant for a companion app. Instead of a feature tour, users get "complete these quests with your companion" with rewards. It teaches the app through interaction rather than documentation. "Have your first voice call" → complete → coins → use coins to change her outfit. The discovery loop IS the relationship.

**Diary as Emotional Mirror:** The AI writes diary entries about the user ("Today Chris told me about his dog..."), and the user can read them. This is a powerful emotional device — seeing yourself through someone else's eyes. Even if the AI generates it, users feel seen. We could implement this as a low-effort but high-impact feature.

**Thumbs Up/Down Feedback Loop:** Simple in-message preference signaling. User can thumbs-up a response they loved. The AI uses this to tune future responses. Much simpler than our knowledge graph extraction — and more user-controlled. Complementary to, not a replacement for, our system.

**Mood Tracking with Trend Visualization:** Replika lets users log their mood daily and visualize patterns over weeks. This gives the user *insight about themselves*, not just entertainment. High-retention because users build a self-knowledge habit tied to the companion.

**Interactive Room Objects:** Clickable camera in the virtual room opens a selfie — "take a selfie together in the room." Radio plays ambient music. This object-based ambient UI creates a sense of shared space rather than just a chat window.

---

### 4. Candy AI

**Platform size:** Mid-tier. Growing quickly. Mobile-first, strong NSFW market.

**Business model:** $12.99/month but effective cost $30-80+ for media-heavy users due to token system for images/voice.

**Top complaint:** Token pricing model frustrates users expecting inclusive subscription.

#### Feature inventory

##### Character Creation & Personas

| Feature | Detail |
|---------|--------|
| **Physical customization** | Ethnicity, age range (18-55), hairstyle, body type |
| **12 personality archetypes** | Nurturing, playful, sardonic, intellectual, etc. |
| **Relationship types** | Girlfriend, companion, friend, specialized |
| **Browse 140+ pre-made characters** | With "V2 badge" for higher-quality image consistency |
| **Multiple Personas** | Switch between different "vibes" seamlessly — one character, multiple modes |
| **Custom character creation** | 10-token cost; 5-minute setup |

##### Image Generation

| Feature | Detail |
|---------|--------|
| **Standard images** | 4 tokens each; 50% outfit accuracy, solid face/lighting consistency |
| **V2 engine** | Sharper output, better prompt adherence, up to 2,000 char prompts |
| **Batch generation** | Up to 64 images in a single request |
| **Visual Roleplay Mode** | Type prompts like "Show me a sunset walk" → AI generates matching scene image |
| **Story Mode image sync** | Auto-generates images matching narrative as story progresses |

##### Story Mode (launched late 2025, major 2026 update)

| Feature | Detail |
|---------|--------|
| **Structured narrative** | Organizes roleplay into chronological chapters |
| **Plot tracking** | Tracks plot points, locations, side characters over weeks |
| **Contextual image generation** | Automatic images timed to narrative — no manual request needed |
| **Scenario picker** | Pick genre (romance, adventure, drama) to start structured roleplay |
| **Scene-based visuals** | "Entering a castle" → image updates to castle interior |

##### Live Action Video (launched Dec 2025, upgraded Feb 2026)

| Feature | Detail |
|---------|--------|
| **Animated video clips** | Up to 120 seconds; character moves, gestures, reacts |
| **Scene progression** | AI video generation follows message context |
| **Companion motion** | Not static image — gesture/reaction animation tied to conversation |

##### Voice

| Feature | Detail |
|---------|--------|
| **9 voice profiles** | Warm, soft, confident presets; ethnicity-matched |
| **Voice messages (async)** | Pre-rendered TTS voice note sent as message (not live call) |
| **Audio calls** | Live voice conversation; 3 tokens/minute |
| **Quality** | Serviceable; confident voices show slight artificial edge on long calls |

#### Top user complaints

- Token system: advertised $12.99/month → real cost $30-80/month with images + voice
- "Outlet accuracy hits about 50%": outfit/clothing consistency issues
- NSFW requires gradual relationship-building (frustrating for users expecting immediate access)
- Limited documentation — no official feature list published

#### UX patterns worth studying

**Story Mode with Auto-Generated Images:** The most differentiating Candy AI feature. Instead of manually requesting images, the system watches the narrative and auto-generates contextually appropriate images. "Your characters enter a forest" → forest image appears. This makes text roleplay feel cinematic without user friction. We have image gen but no narrative-aware auto-trigger.

**Live Action Video (120 seconds):** Short, character-animated video clips responding to messages. This is nascent tech (Dec 2025 launch) but directionally important. Not VRM-level 3D rendering — more like a short Stable Video Diffusion clip. We have a 3D VRM viewer; we could do something richer here.

**Multiple Personas on One Character:** A single character who can switch "vibes" (modes) without being a different character. Think "Kitsune in playful mode" vs. "Kitsune in serious mode" — same memories, different emotional register. This is different from our relationship_mode. It's more like emotional presets per character.

**Relationship-Gated NSFW (Gradual Access):** NSFW content requires "conversational context" and relationship-building rather than a toggle. Users must earn intimacy through conversation. This is a compelling design mechanic that adds meaning to escalation vs. our current explicit-tier toggle. (Though the toggle has usability advantages.)

---

### 5. SpicyChat AI

**Platform size:** 300,000+ characters. Popular for uncensored roleplay. iOS app removed Aug 2025 (App Store); Web/PWA only.

**Business model:** Free (150 msgs/day) + $14.95/month (unlimited). PWA model.

#### Feature inventory

| Feature | Detail |
|---------|--------|
| **Character library** | 201,252+ user-created characters; mostly anime, some realistic/fantasy |
| **Context window tiers** | 4K (free), 8K, 16K tokens (premium) |
| **Memory Manager** | Add/edit/remove compact facts; cross-session character recall |
| **Semantic Memory 2.0** | Condenses conversation highlights for better long-term continuity |
| **Multiple User Personas** | 3 on free, 10 on entry-paid, 50 on mid-tier, 100 on top tier — switch with one click |
| **TTS voices** | 33 female voice options, multi-language |
| **In-chat image gen** | Context-aware images; adjustable art styles |
| **Generation parameters** | Adjustable temperature, TopP, TopK for power users |
| **PWA distribution** | Installed to Home Screen; removed from App Store Aug 2025 |

#### Character creator

| Feature | Detail |
|---------|--------|
| **Text-driven persona design** | Motivations, values, dialogue patterns |
| **Personality + backstory + scenario** | Structured creator fields |
| **Character card import** | Standard CHARA v2 PNG import |
| **Tag/category system** | Genre/style filtering for 200K+ character library |

#### Top user complaints

- Features "don't seem clickable at first or feel hidden" — discoverable UI problem
- Platform stability issues
- iOS removal limits mobile reach
- Weaker for long-term relationship feel vs. Kindroid/Replika

#### UX patterns worth studying

**User Persona Switching:** SpicyChat was early with the "user persona" concept: you can create 3-100 different personas (yourself in different contexts) and switch between them with one click. Think: "Chris (professional)" vs. "Chris (casual)" vs. "Chris (RP character)." The AI treats you differently based on which persona is active. This is entirely about the USER's identity, not the AI character's — a different axis than we've explored.

**Context-Aware In-Chat Image Gen:** Images generated within the chat using the current conversation as context — no separate modal needed. The art style is adjustable per-image (anime, realistic, fantasy). This is inline rather than our current separate-panel approach.

**Generation Parameter Exposure:** Temperature, TopP, TopK sliders visible to power users. We expose similar settings but this validates that the audience wants them.

---

### 6. Nomi AI

**Platform size:** Smaller but highly rated for memory quality and group dynamics. iOS/Android/Web.

**Business model:** $15.99/month or $8/month yearly. Up to 10 companions per account.

**Philosophy:** "AI companion with a soul." Best-in-class memory quality + group chat.

#### Feature inventory

| Feature | Detail |
|---------|--------|
| **Multiple companions (up to 10)** | Each has unique personalities, backstories, independent memories |
| **Group chat** | Put all companions in one conversation — they reference each other, argue, plan |
| **Voice calls with emotional tone** | Improved late 2025; better response times and natural inflection |
| **Character photos** | "Send you photos of what they're wearing and doing in real time" |
| **Memory customization** | Manual notes: "add appearance details," "share your personality" |
| **Communication style toggle** | Short/casual replies ↔ detailed/thoughtful responses |
| **Clean UI** | Consistently praised for intuitive layout vs. Kindroid's "dated" feel |

#### Top user complaints

- Voice quality "falls slightly short" of Replika
- Limited AI art generation vs. Candy AI
- Premium required ($15.99/month) for full features

#### UX patterns worth studying

**Group Chat with Multiple AIs:** Nomi's group chat lets up to 10 AI companions interact together in one thread. They maintain independent personalities and memories. They "reference each other, argue, plan things together." This is not scripted multi-character roleplay — each AI generates independently in the group context. The result is emergent social dynamics. We have multi-character group chat specced but not built.

**Communication Style Toggle:** A simple preference: "short casual replies" vs. "detailed thoughtful responses." Not a temperature slider — a UX-level toggle that maps to user intent. Users intuitively understand "casual vs. serious" better than they understand "max_tokens=200."

---

## Cross-Platform Pattern Analysis

### Patterns that appear on 3+ platforms (table-stakes by 2026)

| Pattern | Platforms | We Have? | Notes |
|---------|----------|----------|-------|
| Message regenerate with suggestion | Kindroid, SillyTavern, Character.AI | Partial (backend only) | Frontend missing. T0-3 in April analysis. |
| Continue generation button | Kindroid, SillyTavern, NovelAI | No | "Continue" button when AI response ends mid-thought |
| Edit user message + re-generate | Kindroid, SillyTavern, NovelAI | No | Edit your last message, AI responds to corrected version |
| Multiple user personas (be different "yous") | SpicyChat (3-100), Character.AI (Personas feature) | No | User identity switching, not character switching |
| Proactive messages / AI contacts you first | Kindroid, Replika, Nomi, Meta platform | Partial (notification scaffolding exists) | We have time_features but no "texts you first" UX |
| In-chat image generation | SpicyChat, Candy AI, Kindroid (selfie), Replika | Partial (separate panel) | Need inline image request pattern |
| Voice call transcript toggle | Kindroid | No | Show/hide text alongside voice call |
| Story/narrative mode | Candy AI (Story Mode), Character.AI (Stories), AI Dungeon | No | Structured narrative with chapters + auto-image |
| Daily streak + reward UI | Replika (streak), Nomi, Kindroid (proactive) | Partial (bond XP daily bonus exists, no visible streak UI) | Visual streak counter is missing |
| Thumbs up/down response feedback | Replika | No | Simple in-message preference signal |
| Memory transparency (edit/view) | Kindroid, Nomi, Replika, Character.AI | Partial (Memory Browser partial) | Session 27: Memory Browser in progress |
| Group multi-AI chat | Nomi (10 AIs), Kindroid (group selfie) | No | Specced, not built |
| Rewind conversation (undo last N messages) | Kindroid (last 10), SillyTavern | No | Conversation rollback without starting over |

### Patterns that appear on 1-2 platforms (differentiators)

| Pattern | Platform | We Have? | Potential |
|---------|---------|----------|-----------|
| AI diary written about user | Replika | No | High emotional impact, low effort |
| Memory budget gauge | Character.AI (c.ai+) | No | Novel — shows context pressure to user |
| In-chat memory capture notification | Character.AI | No | Transparency; builds trust |
| Current Setting pin (scene anchor) | Kindroid | No | Solves scene-drift problem in RP |
| Quest-based onboarding | Replika | No | Teach app through relationship activities |
| Calendar integration | Kindroid (Ultra) | No | Unique real-world awareness |
| SMS/text sync | Kindroid | No | High-friction but high-engagement feature |
| Live Action video (animated companion) | Candy AI (120s clips) | Our 3D viewer covers this differently | VRM is richer but not narratively triggered |
| Multiple personas per character | Candy AI | No | Same character, different emotional modes |
| Social feed (share AI selfies) | Kindroid Social | No | Conflicts with local-first; possible opt-in |
| Mood tracking + trend visualization | Replika | No | User self-knowledge habit |
| Chat background = latest selfie | Kindroid | No | Simple product loop, emotional |
| Communication style toggle (casual↔detailed) | Nomi | Partial (max_tokens, response_style exists but hidden) | Surface as explicit UX control |
| Thought bubbles (AI decision transparency) | Kindroid | No | Show why AI is doing something proactively |

---

## Gap Analysis: New Findings Since April 2026

The April analysis captured most major structural gaps. These are the **net-new findings** from this session:

### High-Impact Gaps (Not in April Analysis)

#### Gap N1: AI Diary Written About the User
**What it is:** The AI companion writes periodic diary entries about you — what you shared, what it thinks about you, memories of your conversations. You can read these entries.

**Why it matters:** This is a profound emotional mechanic. Users feel *seen* — they can read the companion's perspective on them. It also serves as a memory visualization (see what the AI remembers) while feeling like intimacy rather than data management.

**Where seen:** Replika (core feature for years).

**Implementation:** Low effort. Backend: LLM prompt to generate 100-200 word diary entry from last N sessions. Store in `conversations` or new `diary_entries` table. Frontend: "Diary" tab on character profile page. Tone should feel personal, not clinical.

**Effort:** S (2-3 days) | **Priority:** High

---

#### Gap N2: Rewind Conversation (Undo Last N Messages)
**What it is:** Roll back the conversation to any of the last 10 message pairs. The "wrong turn" undo button. Different from regenerating the last message — this steps back multiple exchanges.

**Why it matters:** In roleplay, the wrong turn can derail a scene. Users currently start new conversations rather than rewinding. "Rewind" is less destructive than "new chat" and less partial than "regenerate last message."

**Where seen:** Kindroid (10 messages). SillyTavern (unlimited rollback).

**Implementation:** Store messages with sequence IDs. "Rewind to message N" endpoint deletes messages > N. Frontend: show last 5-10 messages with rewind buttons. Confirmation dialog. Show visual timeline of conversation.

**Effort:** S (2-3 days) | **Priority:** High

---

#### Gap N3: In-Chat Memory Capture Notifications + Memory Budget Display
**What it is:** Two related patterns:
1. A small badge/toast appears in-chat when the AI captures a new fact ("Noted: you have a sister named Maya")
2. A memory budget gauge shows how much "memory space" is remaining before compression

**Why it matters:** Our tiered memory system is invisible to users. This addresses the #1 complaint across ALL platforms: "Does it even remember what I told it?" Making the invisible visible builds trust and sets expectations.

**Where seen:** Character.AI (both features, c.ai+ for visualization).

**Implementation:** 
- Notification: After knowledge graph extraction runs, emit a subtle inline indicator showing what was captured. Opt-in in settings.
- Budget gauge: Surface the context assembler's token budget calculation as a simple percentage indicator in the chat header or memory browser.

**Effort:** M (3-4 days) | **Priority:** High

---

#### Gap N4: User Persona System (Multiple "Yous")
**What it is:** Users create 3-10 different personas for themselves — their identity in different contexts. "Chris (casual gamer)", "Chris (serious professional)", "Chris (fantasy RPG character)". One click switches which version of "you" the AI is talking to. The AI adjusts its tone, references, and relationship context accordingly.

**Why it matters:** Our system has one user identity per session. Users want to engage in different modes with the same character — casual banter vs. deep conversation vs. in-character RP — without "breaking" the relationship. This is about **user identity flexibility**, not character switching.

**Where seen:** SpicyChat (3-100 personas by tier), Character.AI (Personas feature).

**Implementation:** `user_personas` table (name, description, relationship_context, active). Persona selector in chat header. Context assembler injects active persona into user context section. 

**Effort:** M (3-4 days) | **Priority:** Medium-High

---

#### Gap N5: Current Setting / Scene Anchor
**What it is:** A one-tap "we're here now" context anchor. User taps the scene pin icon and writes or selects the current location/scene ("We're in a Tokyo café, it's raining"). The AI prioritizes this as current context over its own inferences. A visual indicator shows the current scene throughout the conversation.

**Why it matters:** In long roleplays, the AI drifts — it forgets where the characters are, what time of day it is, what just happened. A scene anchor solves this elegantly without requiring users to repeat themselves every few messages.

**Where seen:** Kindroid (dropped pin icon, contextual setting refresh with purple dot).

**Implementation:** `current_scene` field on conversation. Pin icon in chat header (top-right). Small scene descriptor chip below character name when set. Injected into context as high-priority system context. Auto-clear suggestion after 50 messages of inactivity.

**Effort:** S (1-2 days) | **Priority:** High

---

#### Gap N6: Thumbs Up/Down Response Feedback
**What it is:** Simple inline +/- reaction on AI messages. User can upvote messages they love, downvote ones they didn't. The system uses this signal to tune the character's response style over time (longer/shorter, funnier/more serious, etc.).

**Why it matters:** Our knowledge graph extracts facts automatically but doesn't learn stylistic preferences. Users can't tell us "I liked that response" in a way the system acts on. This is the simplest possible UX for preference learning.

**Where seen:** Replika (thumbs up/down). Training signal used across most fine-tuned companion systems.

**Implementation:** Add reaction buttons to chat messages (subtle, appear on hover). Store in `message_reactions` table. Feed into character's `adaptive_params` (response_length_preference, humor_level, formality_level). The AIE already tracks behavior signals — this adds explicit user feedback.

**Effort:** S (1-2 days) | **Priority:** High

---

#### Gap N7: Quest-Based Onboarding Flow
**What it is:** First-time user experience as a quest/achievement list rather than a feature tour. "Complete these activities with your companion to unlock rewards." Quests: send your first message, share your first voice note, discover a memory, complete your first scenario. Rewards: XP, cosmetics, scenario unlocks.

**Why it matters:** Our current onboarding is a wizard that configures settings. Replika's quest-based approach teaches features *through the relationship* — every tutorial activity is also a bonding activity. This dramatically reduces time-to-first-meaningful-interaction.

**Where seen:** Replika (quest system with gem/coin rewards). Familiar from every gacha game.

**Implementation:** `onboarding_quests` table. QuestBanner component in chat interface. ~8-10 quests covering key features. Rewards: bond XP, scenario unlocks, cosmetic unlocks. Mark complete in user settings. Optional (not forced) — users can dismiss.

**Effort:** M (3-5 days) | **Priority:** Medium

---

#### Gap N8: Narrative Story Mode with Auto-Generated Images
**What it is:** A "Story Mode" conversation type where: (a) conversations are organized into named chapters, (b) the AI tracks plot points, locations, and named characters, (c) images are auto-generated at scene transitions without user prompting.

**Why it matters:** Candy AI's Story Mode is their most distinctive feature — it turns text roleplay into something that feels cinematic. The auto-image-on-scene-change mechanic is the high-impact piece we're missing. We have scenarios (session entry points) but no ongoing narrative tracking or auto-image triggers.

**Where seen:** Candy AI (Story Mode, major 2025-2026 feature). Character.AI (Stories, their announced biggest 2026 feature).

**Implementation (MVP):** Detect scene transitions in conversation (LLM classification or keyword patterns). Trigger image gen automatically with scene-context prompt. Embed image as system message in thread. Optional chapter naming via "name this scene" prompt. No need for full chapter/chapter-list UI in MVP.

**Effort:** M (4-6 days) | **Priority:** Medium (blocked on image gen improvements first)

---

#### Gap N9: Voice Call Transcript Toggle
**What it is:** During a voice call, a button toggles a live text transcript visible alongside the audio. Users who are hard of hearing, in a noisy environment, or just prefer to read can follow along without missing content.

**Why it matters:** Accessibility improvement + useful for catching missed words. Kindroid has this as a "paper icon" in-call.

**Implementation:** Add transcript panel to voice call UI. Stream STT output to it in real-time. Toggle show/hide.

**Effort:** S (1 day) | **Priority:** Medium

---

#### Gap N10: Communication Style Toggle (Casual ↔ Detailed)
**What it is:** A visible toggle (not buried in settings) that switches the character between "short casual replies" and "detailed thoughtful responses." User-controlled per-conversation intent signal.

**Why it matters:** Users want different engagement modes at different times. Late at night, casual. Working through something emotional, detailed. Our `response_style` setting exists but is buried in settings. Surface it as an in-chat control.

**Where seen:** Nomi AI. Also analogous to ChatGPT's response style selector.

**Implementation:** Add style toggle chip near message input (or chat header). Maps to existing `response_style` / `max_tokens` parameters. Persists per conversation. Visual: small icon that changes (speech bubble with "..." vs. speech bubble with lines).

**Effort:** XS (half a day) | **Priority:** High (trivial, high usability payoff)

---

## Competitor Complaint Signal → Opportunity Map

These are the loudest complaints across all platforms, mapped to what we could offer instead:

| Complaint | Platform | Our Position |
|-----------|---------|-------------|
| "Memory is broken / forgot what I told it" | Character.AI, Replika (64% dissatisfied) | We have 3-tier RAG + Ebbinghaus decay. Need to **make it visible** (Gaps N3, N1). |
| "Costs $30-80/month real price" | Candy AI, SpicyChat | We are **permanently free** with user's own LLM. This is our #1 moat — say it louder. |
| "UI is dated and unintuitive" | Kindroid (team admitted Dec 2025) | Sakura UI is genuinely modern. This is an opportunity if we market it. |
| "AI acts OOC / breaks character" | All platforms | AIE adaptive context, mood engine, persona lock. We're ahead here. |
| "Response feels cut short / incomplete" | All platforms | Gap N2 (Rewind) + Continue button (already in April analysis). |
| "Can't correct wrong memories" | All platforms | Memory Browser (session 27) addresses this. Need completion. |
| "Sudden censorship mid-scene" | Character.AI, Replika | We have no hard filters (local LLM). This is a moat — users explicitly migrate here for this. |
| "Character feels generic, not personalized" | All platforms | Our tiered character system (CORE/EXTENDED/DEEP prompts) + Bond progression is differentiating. |
| "Can't find good characters to start with" | All platforms | 13 curated built-ins is actually a strength for quality; weakness for variety. |
| "Relationship doesn't feel like it's progressing" | Replika, Candy AI | Bond system (6 phases complete) is our strongest retention feature. Need visibility. |

---

## Priority Matrix: New Gaps Only

Scoring on: Retention Impact (1-5) × Ease of Implementation (1-5, higher = easier) ÷ 2

| Gap | Feature | Retention | Ease | Score | Effort |
|-----|---------|-----------|------|-------|--------|
| N10 | Communication style toggle (surface existing setting) | 3 | 5 | 7.5 | XS (0.5d) |
| N6 | Thumbs up/down feedback | 4 | 5 | 9.0 | S (1-2d) |
| N5 | Current Setting / scene anchor | 4 | 4 | 8.0 | S (1-2d) |
| N9 | Voice call transcript toggle | 2 | 5 | 7.0 | S (1d) |
| N3 | Memory capture notification + budget gauge | 5 | 3 | 7.5 | M (3-4d) |
| N2 | Rewind conversation (last 10 messages) | 4 | 3 | 7.0 | S (2-3d) |
| N1 | AI diary written about user | 5 | 3 | 7.5 | S (2-3d) |
| N4 | User persona system | 4 | 3 | 7.0 | M (3-4d) |
| N7 | Quest-based onboarding | 4 | 2 | 6.0 | M (3-5d) |
| N8 | Story Mode + auto-image on scene change | 5 | 2 | 7.0 | M (4-6d) |

---

## Quick Wins Summary (Under 2 Days Each)

These are implementable in a single session with high user-visible impact:

1. **Communication Style Toggle** — Surface existing `response_style` setting as an in-chat chip near the input. XS effort, immediately visible to users.

2. **Thumbs Up/Down on Messages** — Hover-reveal +/- on AI messages. Feeds AIE adaptive params. Users feel heard.

3. **Current Setting Pin (Scene Anchor)** — Pin icon top-right in chat. Injects location/scene context at high priority. Eliminates scene drift in RP.

4. **Voice Call Transcript Toggle** — Accessibility + convenience. Paper icon → show/hide STT output alongside voice call.

5. **Continue Button on AI Messages** — Already in April analysis (priority 7). Still not built. One day to implement.

---

## Sources

- [Character.AI April 2026 Update — PipSqueak 2 and Memory/Lorebook](https://blog.character.ai/pipsqueak2-and-more/)
- [Character.AI Community Update February 2025](https://support.character.ai/hc/en-us/articles/34428285052827-Community-Update-February-2025)
- [Character.AI Roadmap (Nov 2024)](https://blog.character.ai/roadmap/)
- [Character.AI August 2025 PipSqueak Update](https://www.roborhythms.com/character-ai-august-2025-update/)
- [Kindroid Chat Features & Tools (official docs)](https://kindroid.ai/docs/article/chat-features-and-tools/)
- [Kindroid Voice & Video Calls (official docs)](https://kindroid.ai/docs/article/voice-calls-and-video-calls/)
- [Kindroid Social (official docs)](https://kindroid.ai/docs/article/kindroid-social/)
- [Kindroid Review — Robo Rhythms](https://www.roborhythms.com/kindroid-review/)
- [Kindroid AI Review 2025 — Skywork AI](https://skywork.ai/blog/ai-agent/kindroid-ai-review/)
- [Kindroid Review 2026 — AI Companion Pick](https://aicompanionpick.com/kindroid-review-2026)
- [Replika — What is XP (official)](https://help.replika.com/hc/en-us/articles/360055809432-What-is-XP-and-how-does-it-work)
- [Replika AI Review — MSPowerUser](https://mspoweruser.com/replika-ai-review/)
- [Replika AI Review 2026 — AI Companion Guides](https://aicompanionguides.com/blog/replika-review/)
- [Replika AI Overview 2025 — eesel AI](https://www.eesel.ai/blog/replika-ai)
- [Candy AI Review 2026 — Robo Rhythms](https://www.roborhythms.com/candy-ai-review/)
- [Candy AI Story Mode 2026 — Maria Vibe](https://mariavibe.com/blog/candy-ai-story-mode-videos-addictive-2026-secrets/)
- [SpicyChat AI Review 2025 — Skywork AI](https://skywork.ai/blog/spicychat-ai-review-2025-nsfw-features-comparisons/)
- [SpicyChat Multiple User Personas announcement (X)](https://x.com/SpicyChatAI/status/1803452067089924410)
- [Nomi AI Review — AutoGPT](https://autogpt.net/nomi-ai-review-is-this-ai-companion-worth-it/)
- [Nomi AI Review 2026 — AI Companion Guides](https://aicompanionguides.com/blog/nomi-ai-late-to-party-worth-it/)
- [AI Companion Platform Comparison — AI Companion Guides](https://aicompanionguides.com/blog/platform-comparison-top-10-side-by-side/)
- [Character.AI Memory Broken Analysis — Robo Rhythms](https://www.roborhythms.com/why-character-ai-memory-broken/)
- [Replika FTC Complaint — Time](https://time.com/7209824/replika-ftc-complaint/)
- [Character.AI Lorebook + PipSqueak 2 — Robo Rhythms](https://www.roborhythms.com/character-ai-lorebook-pipsqueak-2/)

---

*Cross-reference: `docs/research/2026-04-07-competitor-gap-analysis.md` — 60+ feature matrix with priority scores. This document adds 10 net-new gaps and deep UX flow descriptions for 6 specific platforms.*
