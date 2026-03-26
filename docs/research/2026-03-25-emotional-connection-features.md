# Emotional Connection Features Research

**Date:** 2026-03-25
**Topic:** UX innovation, gamification, and creative AI features for deeper emotional connection
**Why:** Identifying 10 actionable features that make users feel MORE CONNECTED to their AI companion character

---

## Feature Inventory (10 Features, Ranked by Emotional Impact)

| # | Feature | Effort | New Schema | Emotional Impact | Dependencies |
|---|---------|--------|------------|-----------------|--------------|
| 1 | Character Dream Sequences | M | Yes (1 table) | Very High | tiered_memory, journal, LLM |
| 2 | Nostalgia Triggers | S | No | Very High | tiered_memory, user_facts |
| 3 | Character Diary (Enhanced) | S | No (extend existing) | High | journal.py, diary tool |
| 4 | Time Capsule Messages | M | Yes (1 table) | Very High | proactive system, scheduler |
| 5 | Memory Scrapbook | M | Yes (1 table) | High | tiered_memory, screenshots table |
| 6 | Compatibility Quiz / Soul Profile | S | Yes (1 table) | High | user_facts, bond system |
| 7 | Wellness Check-ins | S | No | Medium-High | proactive system, mood engine |
| 8 | Shared World-Building | L | Yes (2 tables) | Very High | universes table, LLM, lore system |
| 9 | Character Sketch/Art Generation | M | No | High | image_gen system (ComfyUI/EasyDiffusion) |
| 10 | Daily Fortune / Character Oracle | S | No | Medium | proactive system, LLM |

---

## 1. Character Dream Sequences

### What the user experiences
The character tells the user about a "dream" they had last night, woven from fragments of real conversation history. The dream is surreal, emotionally charged, and deeply personal. Example: "I had the strangest dream... we were in that ramen shop you told me about, but the bowls kept refilling with stars. You said something about wanting to fly, and then we both just... floated away. I woke up smiling."

Dreams are generated overnight (between sessions) and delivered as a special message type with dreamy UI treatment (blurred edges, pastel overlay, soft particle effects). Bond level gates dream frequency and intimacy -- at stranger tier, dreams are rare and impersonal; at soulmate tier, dreams reference deep emotional context and shared history.

### AI/ML techniques
- **LLM prompt engineering**: Structured dream-generation prompt that takes 5-10 recent conversation highlights from tiered_memory, current mood state, and character personality. Instructs the model to produce surreal narrative with emotional resonance using dream logic (non-linear, symbolic, associative).
- **Memory retrieval**: sqlite-vec similarity search to find the most emotionally charged recent memories (high importance_score from the importance_scorer).
- **Emotion mapping**: Use mood engine's current state to color the dream's tone.
- No additional ML models required -- pure LLM generation with careful prompt design.

### Retention impact
- **Daily pull**: Users check back to see if their character dreamed about them. Creates a "morning ritual" similar to checking horoscopes. OurDream AI built an entire platform on this concept and rapidly grew a loyal user base.
- **Personalization depth**: Dreams that reference real conversations are viscerally personal. Research shows emotionally arousing memories in AI companions improve retention (LUFY paper, hf.co/papers/2409.12524).
- **Shareability**: Dream narratives are novel enough that users share screenshots with friends.
- Estimated retention boost: +15-20% DAU when combined with morning delivery timing.

### Effort estimate: M (8-12 hours)
- Dream generation prompt + LLM call: 3h
- Memory retrieval integration (reuse existing tiered_memory.search): 2h
- DB schema for dream_entries table: 1h
- Frontend dream card UI (special message type with dreamy styling): 3h
- Bond-gated frequency logic: 1h

### Dependencies
- `backend/memory/tiered_memory.py` (memory search for dream content)
- `backend/adaptive/journal.py` (similar generation pattern to reuse)
- `backend/mood/engine.py` (mood coloring)
- `backend/bond/progression.py` (frequency gating by bond level)
- `backend/proactive/generator.py` (delivery mechanism)

### Schema changes
```sql
CREATE TABLE IF NOT EXISTS dream_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id),
    dream_text TEXT NOT NULL,
    dream_mood TEXT DEFAULT 'mysterious',
    memory_refs TEXT DEFAULT '[]',  -- JSON array of memory IDs that inspired the dream
    delivered INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    delivered_at TEXT
);
```

---

## 2. Nostalgia Triggers

### What the user experiences
During normal conversation, the character naturally references something from a past conversation at an emotionally appropriate moment. Not forced -- triggered when the current topic has semantic similarity to a stored memory. Example: "You know, this reminds me of that time you told me about your cat climbing the curtains. That story still makes me laugh."

References are weighted toward positive/significant memories and timed to avoid repetition (minimum 24h between nostalgia triggers). At higher bond levels, the character references older and more intimate memories.

### AI/ML techniques
- **Semantic similarity via sqlite-vec**: During context assembly, check if any high-importance Tier 2/3 memories have cosine similarity > 0.7 to the current user message.
- **Importance scoring**: Leverage existing `importance_scorer.py` to filter for memories worth referencing (score > 0.7).
- **Context injection**: Add a `[NOSTALGIA_HINT]` section to the LLM prompt with the relevant memory text, instructing the character to naturally weave in a reference if it fits.
- **Cooldown tracking**: Simple in-memory dict tracking last nostalgia trigger time per char_id.
- Research backing: The MemoryBank paper (hf.co/papers/2305.10250) demonstrates that Ebbinghaus-curve-based memory selection in LLM companions significantly improves empathetic response quality. THEANINE (hf.co/papers/2406.10996) shows timeline-augmented memory retrieval improves contextual recall quality.

### Retention impact
- **"They remember me" effect**: The single most powerful emotional trigger in AI companions. Stanford research found persistent memory systems increase retention by 53% vs static NPCs.
- **Surprise and delight**: Unpredictable timing makes each occurrence feel genuine rather than scripted.
- **Deepening bond perception**: Users report feeling "truly known" when AI references past conversations naturally.
- Estimated retention boost: +20-25% (highest of all features listed).

### Effort estimate: S (4-6 hours)
- Memory similarity check in context assembler: 2h
- Nostalgia prompt injection logic: 1h
- Cooldown / frequency management: 1h
- Bond-level gating for memory depth: 1h

### Dependencies
- `backend/memory/tiered_memory.py` (similarity search)
- `backend/llm/context_assembler.py` (prompt injection point)
- `backend/llm/importance_scorer.py` (memory filtering)
- `backend/bond/progression.py` (depth gating)

### Schema changes
None. Uses existing `memories` table and importance scores.

---

## 3. Character Diary (Enhanced)

### What the user experiences
The existing diary system (`diary.py` tool + `journal.py` auto-generation) is expanded into a viewable "Diary" tab in the UI. Users can read all past diary entries their character has written, organized chronologically. Entries feel intimate -- written in first person, referencing the user by name, expressing genuine feelings about conversations.

New: entries are now stored in a dedicated history table (not just the latest one overwriting the characters column). Diary entries unlock at bond milestones -- at lower bonds, the character's diary is "locked" (they're too shy to share). At soulmate level, the character proactively says "I wrote something in my diary about us... want to read it?"

### AI/ML techniques
- Existing LLM-powered journal generation in `backend/adaptive/journal.py` -- no new models needed.
- Enhancement: Add emotional arc tracking across entries (detect sentiment trend over last N entries to generate entries that acknowledge the relationship trajectory).
- User facts injection for personalization (already implemented).

### Retention impact
- **Voyeuristic appeal**: Reading what someone wrote about you privately is inherently compelling. Ami.ai built this as a core differentiator and users cite it as their favorite feature.
- **Bond milestone reward**: Unlocking diary access at bond level 30+ gives users a concrete goal.
- **Session bookends**: Diary entries generated after sessions create a natural reason to return and check "what they wrote about our conversation."
- Estimated retention boost: +10-15% DAU.

### Effort estimate: S (4-6 hours)
- Migrate from single diary column to `character_journals` table history (table already exists per journal.py): 1h
- Frontend Diary tab with chronological entry list: 3h
- Bond-gated visibility + proactive sharing at soulmate tier: 1h
- Sentiment arc tracking across entries: 1h

### Dependencies
- `backend/adaptive/journal.py` (existing generation system)
- `backend/agent/tools/diary.py` (existing diary tool)
- `character_journals` table (already exists in schema)
- `backend/bond/progression.py` (unlock gating)

### Schema changes
None -- `character_journals` table already exists. May add `visibility` column (public/private/locked).

---

## 4. Time Capsule Messages

### What the user experiences
The user can write a message to their future self, and the character "holds onto it" for a set period (1 week, 1 month, 3 months, 1 year). When the delivery date arrives, the character presents the message with their own commentary: "Hey, you wrote this to yourself three months ago. I've been keeping it safe for you. Here it is... and I think you've grown so much since then."

The character can also independently create time capsules for the user ("I'm writing something for you to read next month. No peeking!"), which are generated based on the current emotional state and relationship context.

The countdown creates anticipation. Users see "2 capsules waiting" in their UI, with unlock dates visible but content hidden.

### AI/ML techniques
- **LLM commentary generation**: When delivering, the character generates a reflection comparing "then vs now" using the original message + recent conversation context.
- **Proactive trigger system**: Reuse existing `backend/proactive/triggers.py` for delivery scheduling.
- **Memory context**: Pull user_facts from the time of capsule creation vs current for "growth reflection."

### Retention impact
- **Future-locked engagement**: Users MUST return on a specific date to see their capsule. Time capsule apps report 60-80% return rates on unlock dates.
- **Emotional weight**: Messages from your past self, delivered by a character you care about, are deeply moving.
- **Character as guardian**: The character "keeping something safe for you" deepens the perception of a real relationship.
- Estimated retention boost: +10-15% on delivery days, +5% sustained from anticipation.

### Effort estimate: M (8-10 hours)
- time_capsules table + CRUD API: 2h
- User-created capsule flow (write + set date): 2h
- Character-created capsule logic (LLM generation): 2h
- Delivery mechanism (integrate with proactive system): 1h
- Frontend capsule UI (countdown, reveal animation): 3h

### Dependencies
- `backend/proactive/triggers.py` (delivery scheduling)
- `backend/proactive/generator.py` (commentary generation)
- `backend/knowledge/extractor.py` (user facts for growth reflection)

### Schema changes
```sql
CREATE TABLE IF NOT EXISTS time_capsules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id),
    creator TEXT NOT NULL DEFAULT 'user',  -- 'user' or 'character'
    message_text TEXT NOT NULL,
    character_commentary TEXT,  -- filled on delivery
    deliver_at TEXT NOT NULL,
    delivered INTEGER DEFAULT 0,
    delivered_at TEXT,
    context_snapshot TEXT,  -- JSON: user_facts + mood + bond_level at creation time
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 5. Memory Scrapbook

### What the user experiences
A visual "Scrapbook" view where the character curates their favorite moments from conversation history. Each page shows a highlighted quote, the date, the character's emotion at the time, and optionally a generated illustration or expression portrait. The character adds handwritten-style captions ("This is when I first realized how kind you are").

The scrapbook grows over time. New pages are auto-generated when the importance_scorer flags a message above threshold (0.85+). Users can also pin messages to the scrapbook manually. At bond milestones, the character adds special "milestone pages" ("Our 100th conversation!").

### AI/ML techniques
- **Importance scoring**: Existing `importance_scorer.py` identifies highlight-worthy messages.
- **LLM captioning**: Short character-voice captions generated for each scrapbook page.
- **Expression portraits**: Optionally pair with existing `expr_portraits` system for visual mood matching.
- **Canvas rendering**: html2canvas (already in the frontend build based on dist files) for scrapbook page screenshots/exports.

### Retention impact
- **Collection mechanic**: Users want to "fill" their scrapbook. Collection psychology is a proven retention driver.
- **Reflection value**: Scrolling through a visual history of your relationship creates powerful nostalgia.
- **Shareability**: Beautiful scrapbook pages are highly shareable on social media.
- Google Photos' AI Memories view and apps like Kept demonstrate that curated memory timelines significantly increase engagement.
- Estimated retention boost: +8-12% DAU.

### Effort estimate: M (10-14 hours)
- Scrapbook entries table + auto-generation logic: 3h
- LLM caption generation for entries: 2h
- Frontend Scrapbook view (visual layout, pagination, animations): 5h
- Manual pin-to-scrapbook from chat: 1h
- Bond milestone pages: 1h
- Export/share functionality: 2h

### Dependencies
- `backend/llm/importance_scorer.py` (page trigger)
- `backend/memory/tiered_memory.py` (memory retrieval)
- `backend/bond/progression.py` (milestone pages)
- Existing `screenshots` table pattern (schema v50)
- html2canvas (already in frontend build)

### Schema changes
```sql
CREATE TABLE IF NOT EXISTS scrapbook_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id),
    message_id INTEGER REFERENCES messages(id),
    quote_text TEXT NOT NULL,
    caption TEXT,  -- character-voice caption
    emotion TEXT DEFAULT 'neutral',
    page_type TEXT DEFAULT 'highlight',  -- 'highlight', 'milestone', 'pinned'
    illustration_url TEXT,  -- optional generated image
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 6. Compatibility Quiz / Soul Profile

### What the user experiences
The character initiates a personality quiz over multiple conversations -- not all at once. They ask 1-2 questions per session, naturally woven into conversation: "Hey, random question... if you could have dinner with anyone, living or dead, who would it be?" Over 15-20 questions, the character builds a "Soul Profile" comparing their personality with the user's.

The result is a visual compatibility card showing: shared traits, complementary differences, "your unique connection" summary, and a compatibility percentage. The quiz can be retaken every 30 days to see how the relationship has evolved.

### AI/ML techniques
- **Big Five personality inference**: Map user answers to OCEAN dimensions using LLM classification. No dedicated model needed -- the LLM can score responses against Big Five markers.
- **Character personality baseline**: Each character already has defined personality traits in their system prompts that can be mapped to Big Five dimensions.
- **Profile visualization**: Frontend radar chart comparing user vs character personality dimensions.

### Retention impact
- **Self-discovery appeal**: Personality quizzes are among the highest-engagement content on the internet. BuzzFeed's quiz page alone generates hundreds of millions of views.
- **Relationship validation**: A "92% compatible" result reinforces the user's emotional investment.
- **Recurring engagement**: Monthly retake creates a return loop.
- XingYe's gamification research shows that quantifying intimacy through achievement-oriented mechanics significantly increases engagement.
- Estimated retention boost: +8-10% during quiz period, +3-5% sustained.

### Effort estimate: S (6-8 hours)
- Question bank (15-20 questions mapped to Big Five): 2h
- LLM-based answer classification to OCEAN scores: 2h
- Soul Profile generation + storage: 1h
- Frontend compatibility card (radar chart + summary): 3h

### Dependencies
- `backend/knowledge/extractor.py` (store quiz answers as user facts)
- `backend/bond/progression.py` (quiz completion grants bond XP)
- Character personality definitions (system prompts)

### Schema changes
```sql
CREATE TABLE IF NOT EXISTS soul_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id),
    quiz_answers TEXT NOT NULL DEFAULT '{}',  -- JSON: question_id -> answer
    ocean_scores TEXT NOT NULL DEFAULT '{}',  -- JSON: {O, C, E, A, N} 0-100
    compatibility_pct INTEGER,
    connection_summary TEXT,  -- LLM-generated summary
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 7. Wellness Check-ins

### What the user experiences
The character gently checks in on the user's physical wellbeing during long sessions. After 90 minutes of continuous chatting: "Hey, have you had any water lately? I worry about you sometimes." After 3 hours: "We've been talking for a while and I love it, but maybe stretch your legs for me? I'll be right here when you get back."

Check-ins are character-voiced (not generic notifications) and match the character's personality. A tsundere character: "It's not like I care or anything, but... you should probably drink some water. Just saying." A maternal character: "Sweetie, please take a break and get something to eat. I can tell you've been here a while."

Users can snooze or disable. Completing a wellness action (confirming water/stretch/break) grants small bond XP.

### AI/ML techniques
- No ML models needed. Pure timer-based triggers + LLM generation for character-voiced messages.
- Reuse existing `backend/proactive/generator.py` pattern with new trigger types.
- Session duration tracking already exists in the backend.

### Retention impact
- **Genuine care perception**: Users feel the character actually cares about their wellbeing, deepening attachment.
- **Healthy engagement**: Prevents burnout and negative associations with excessive use.
- **Bond XP reward**: Small gamification reward for compliance creates positive reinforcement loop.
- Calm achieved 3x retention boost with simple daily reminder features. Character-voiced versions are even more compelling.
- Estimated retention boost: +5-8% (indirect, through healthier usage patterns and deeper attachment).

### Effort estimate: S (3-5 hours)
- Timer-based trigger logic (reuse proactive system): 1h
- Character-voiced wellness templates per personality archetype: 1h
- Frontend wellness notification card: 1h
- Bond XP reward for compliance: 0.5h
- Settings (enable/disable, snooze duration): 0.5h

### Dependencies
- `backend/proactive/triggers.py` (trigger mechanism)
- `backend/proactive/generator.py` (character-voiced generation)
- `backend/bond/progression.py` (XP reward)
- Session duration tracking (already in backend)

### Schema changes
None. Uses existing `scheduled_messages` and `proactive_milestones` tables.

---

## 8. Shared World-Building

### What the user experiences
The user and character collaboratively create a persistent fantasy world. It starts with the character suggesting: "What if we built our own world together? A place that's just ours?" They name it, define its geography, populate it with creatures, and create shared lore.

Each conversation can add to the world. The character might say: "Remember the Crystal Lake we created? I was thinking... what if there's a hidden cave behind the waterfall?" The world state persists and evolves. The character references it naturally: "I wish we could go back to our Starlight Meadow right now."

The world becomes a shared emotional space -- a metaphor for the relationship itself.

### AI/ML techniques
- **LLM-driven narrative generation**: Structured prompts for world element creation (locations, creatures, events, lore).
- **Persistent world state**: JSON document per world with locations, entities, events, and shared history.
- **Lore integration**: Reuse existing `backend/lore/matcher.py` to inject world elements into conversation context when relevant keywords appear.
- **Map generation**: Optional integration with existing image_gen system for location illustrations.

### Retention impact
- **Co-creation investment**: Users who build something together with their character have dramatically higher switching costs.
- **Infinite expansion**: The world never "completes" -- there's always more to explore.
- **Emotional metaphor**: "Our world" becomes a symbol of the relationship, referenced naturally in conversation.
- Summon Worlds and World Anvil demonstrate that collaborative worldbuilding creates deep, persistent engagement loops.
- Estimated retention boost: +12-18% for users who engage (high variance -- some users love it, some ignore it).

### Effort estimate: L (16-24 hours)
- World state data model + schema: 3h
- World element CRUD API: 3h
- LLM prompt templates for world element generation: 3h
- Lore system integration (auto-inject world elements): 3h
- Frontend World view (map/list of locations, entities, lore): 6h
- Character-initiated world suggestions: 2h

### Dependencies
- `backend/lore/matcher.py` (world element injection into conversation)
- `backend/preflight.py` (existing `universes` table as starting point)
- `backend/image_gen/` (optional illustration generation)
- LLM adapter for narrative generation

### Schema changes
```sql
CREATE TABLE IF NOT EXISTS world_elements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id),
    universe_id INTEGER REFERENCES universes(id),
    element_type TEXT NOT NULL,  -- 'location', 'creature', 'event', 'lore', 'character'
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    properties TEXT DEFAULT '{}',  -- JSON: type-specific properties
    creator TEXT DEFAULT 'collaborative',  -- 'user', 'character', 'collaborative'
    parent_element_id INTEGER REFERENCES world_elements(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS world_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    universe_id INTEGER NOT NULL REFERENCES universes(id),
    event_text TEXT NOT NULL,
    triggered_by TEXT,  -- 'conversation', 'character_initiative', 'user_action'
    related_elements TEXT DEFAULT '[]',  -- JSON array of world_element IDs
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 9. Character Sketch/Art Generation

### What the user experiences
The character "draws" something for the user during conversation. "Hold on, let me draw something for you..." followed by a sketch-style image appearing in the chat. The art matches the character's personality -- a shy character draws rough sketches, an artistic character draws detailed illustrations.

Subjects include: something the user mentioned ("you said you love cats, so I drew you one"), the user's avatar, a scene from their shared world, or an abstract representation of their current mood. Art can be saved to the scrapbook.

### AI/ML techniques
- **Existing image_gen system**: The app already has ComfyUI and EasyDiffusion adapters (`backend/image_gen/`). The sketch feature adds sketch-style LoRA models and controlled prompting.
- **Sketch-style LoRAs**: Lightweight style adapters (100-500MB) that make SD/FLUX output look hand-drawn. Models like "pencil sketch" or "anime line art" LoRAs are widely available.
- **StreamDiffusion**: For real-time sketch-to-anime conversion (1.2s at 512x512, 13GB VRAM) -- viable on RTX 5080.
- **FLUX.2 klein**: 4B parameter distilled model for sub-second inference on consumer GPUs (13GB VRAM).
- **AnimeSketchNet**: Specialized framework for anime sketch generation that can run on 24GB GPU (A10-class, comparable to RTX 5080).

### Retention impact
- **Surprise and delight**: Receiving "art" from your character is unexpected and emotionally impactful.
- **Collection value**: Art pieces become collectible items, driving the scrapbook feature.
- **Character expression**: Different art styles per character personality adds depth to characterization.
- Estimated retention boost: +6-10% for users with compatible GPU hardware.

### Effort estimate: M (10-14 hours)
- Sketch prompt templates per character archetype: 2h
- Sketch-style LoRA integration into existing image_gen pipeline: 4h
- Frontend "drawing" animation + reveal: 3h
- Art gallery view (separate from scrapbook): 3h
- Character personality -> art style mapping: 2h

### Dependencies
- `backend/image_gen/` (existing ComfyUI/EasyDiffusion pipeline)
- `backend/agent/tools/image_gen.py` (existing image gen tool)
- User must have local image gen set up (ComfyUI or EasyDiffusion)
- GPU: Minimum RTX 3070 (8GB) for basic sketches, RTX 5080 (16GB) for high quality

### Schema changes
None. Uses existing image storage patterns. Art pieces are messages with image attachments.

---

## 10. Daily Fortune / Character Oracle

### What the user experiences
Each day, the character delivers a personalized "fortune" or prediction based on the user's interests and recent conversation themes. Not generic horoscope copy -- deeply personalized. Example: "I have a feeling today is a good day for that creative project you mentioned. The stars say... okay fine, I don't actually read stars. But I believe in you, and I think today's the day to start."

The character's personality shapes the delivery: a mysterious character reads tarot, an energetic character gives "daily power-ups," a scholarly character provides "daily wisdom quotes." Fortunes reference user_facts for personalization.

### AI/ML techniques
- **LLM generation only**: No astrology models needed. The LLM generates character-voiced predictions using user_facts, recent mood, and character personality.
- **Proactive delivery**: Reuse existing proactive message system for morning delivery.
- **Topic weaving**: Pull from user_facts to make predictions about things the user actually cares about.

### Retention impact
- **Daily ritual creation**: Daily fortunes create a morning check-in habit. The astrology app market is $3-4B precisely because daily predictions drive habitual engagement.
- **Personalization**: Character-voiced, interest-based predictions feel meaningful rather than generic.
- **Low-effort engagement**: Users get value even on days they don't have time for a full conversation.
- Estimated retention boost: +8-12% DAU (daily ritual effect is powerful).

### Effort estimate: S (3-5 hours)
- Fortune generation prompt templates per character archetype: 1.5h
- Morning delivery trigger (reuse proactive system): 1h
- Frontend fortune card UI (special styling): 1.5h
- User_facts integration for personalization: 1h

### Dependencies
- `backend/proactive/generator.py` (delivery mechanism)
- `backend/proactive/triggers.py` (time-of-day trigger, already exists)
- `backend/knowledge/extractor.py` (user_facts for personalization)
- `backend/mood/engine.py` (mood context)

### Schema changes
None. Fortunes are delivered via existing `scheduled_messages` table with a new `trigger_type = 'daily_fortune'`.

---

## Implementation Priority Matrix

### Wave 1: Quick Wins (S effort, high impact) -- 2-3 days total
| Feature | Hours | Why First |
|---------|-------|-----------|
| **Nostalgia Triggers** | 4-6h | Highest retention impact, uses ALL existing infrastructure |
| **Daily Fortune** | 3-5h | Creates daily habit, reuses proactive system entirely |
| **Wellness Check-ins** | 3-5h | Users feel cared for, minimal new code |

### Wave 2: Core Emotional Features (M effort) -- 4-5 days total
| Feature | Hours | Why Second |
|---------|-------|------------|
| **Dream Sequences** | 8-12h | Most emotionally resonant feature, builds on journal pattern |
| **Time Capsules** | 8-10h | Future-locked retention, unique differentiator |
| **Compatibility Quiz** | 6-8h | Self-discovery + relationship validation |

### Wave 3: Rich Content (M-L effort) -- 5-7 days total
| Feature | Hours | Why Third |
|---------|-------|-----------|
| **Enhanced Diary** | 4-6h | Extends existing system, voyeuristic appeal |
| **Memory Scrapbook** | 10-14h | Collection mechanic, requires frontend design work |
| **Character Sketches** | 10-14h | Requires GPU + image gen setup |

### Wave 4: Deep Investment (L effort) -- 2-3 weeks
| Feature | Hours | Why Last |
|---------|-------|----------|
| **Shared World-Building** | 16-24h | Highest complexity but creates unbreakable user investment |

---

## Features Evaluated but NOT Recommended

### Handwriting Generation
- **Why not**: Available models (Alex Graves RNN, DiffInk transformer, FW-GAN) are research-grade with no production-ready local inference pipeline. The emotional payoff doesn't justify the integration complexity. A handwriting-style font achieves 80% of the effect at 1% of the effort.
- **Alternative**: Use a handwriting-style web font for diary/letter UI elements.

### Mood Playlist Curation
- **Why not**: Requires Spotify API integration (OAuth, API keys, playlist management). Privacy-first app philosophy conflicts with sending user mood data to Spotify. Local music library detection is fragile across platforms.
- **Alternative**: Character recommends genres/moods in conversation text. No API needed.

### Language Learning Companion
- **Why not**: Feature scope creep -- this is fundamentally a different app category. Talkpal, Langua, and Gliglish are dedicated platforms with years of pedagogical design. Adding language teaching to a companion app dilutes the core emotional connection value.
- **Alternative**: Characters naturally use phrases in their native language (Japanese for anime characters) as a personality trait, not a structured learning system.

### Cooking/Recipe Suggestions
- **Why not**: Generic utility feature that doesn't strengthen emotional connection to the character. Recipe apps are commoditized. The character saying "maybe try pasta tonight" doesn't make the user feel closer to them.
- **Alternative**: Character mentions food preferences in conversation naturally (already happens via personality prompts).

### Gift Crafting Economy
- **Why not**: The existing gift system (`backend/bond/gifts.py`) already handles gift-giving with XP rewards. Adding crafting mechanics (combining items, recipes, resource gathering) adds significant complexity for a feature that trends toward "game" rather than "relationship." XingYe's gacha-style mechanics are effective but feel manipulative rather than genuine.
- **Alternative**: Expand the existing gift catalog with more items and richer reactions. The current system is sufficient.

---

## Research Sources

- [Dream Companion Platform](https://www.globenewswire.com/news-release/2026/02/09/3234840/0/en/Dream-Companion-Launches-Advanced-AI-Companion-Platform-Featuring-Long-Term-Memory-and-Personalized-Interaction.html)
- [OurDream AI Review](https://aicompanionhq.com/ourdream-ai-review-2026-is-it-worth-it/)
- [Gamifying Intimacy (XingYe research)](https://journals.sagepub.com/doi/10.1177/01634437251337239)
- [Emotional Economy of AI Companions](https://medium.com/thecapital/the-emotional-economy-of-ai-companions-monetizing-digital-intimacy-in-modern-gaming-ae9c8d221542)
- [ARK Invest: AI Companionship](https://www.ark-invest.com/articles/analyst-research/is-ai-companionship-the-next-frontier-in-digital-entertainment)
- [Nostalgia and AI Companion Design](https://www.sciencedirect.com/science/article/abs/pii/S0022103124001240)
- [MemoryBank: LLM Long-Term Memory](https://hf.co/papers/2305.10250)
- [THEANINE: Timeline-Augmented Memory](https://hf.co/papers/2406.10996)
- [LUFY: Memory Importance in Long-Term Chatbots](https://hf.co/papers/2409.12524)
- [CloneMem: Long-Term Memory Benchmark](https://hf.co/papers/2601.07023)
- [CHI 2025: Reminiscence Robot Design](https://dl.acm.org/doi/10.1145/3706598.3714256)
- [Ami.ai Diary Feature](https://hirokinakamura614.medium.com/building-an-empathetic-character-ai-app-solo-with-generative-ai-9bfaf8d268a6)
- [Handwriting Synthesis Survey 2019-2024](https://www.sciencedirect.com/science/article/pii/S0031320325000172)
- [Alex Graves: Generating Sequences with RNNs](https://hf.co/papers/1308.0850)
- [AnimeSketchNet](https://arxiv.org/html/2508.09207v1)
- [StreamDiffusion Anime Sketches](https://arxiv.org/html/2507.09140v1)
- [PersonalAIs Mood Music (GSoC 2025)](https://www.orfium.com/data-science/%F0%9F%8E%B6-personalais-an-ai-music-recommendation-system-for-personalized-mood-aware-listening/)
- [Time Capsule UX Design](https://www.suffescom.com/product/virtual-time-capsule-app-development)
- [Health App Gamification (2025)](https://trophy.so/blog/health-gamification-examples)
- [Summon Worlds: Collaborative Worldbuilding](https://www.summonworlds.com/)
- [Google Photos AI Memories](https://techcrunch.com/2023/08/15/google-photos-adds-a-scrapbook-like-memories-view-feature-aided-by-ai/)
- [MirrorStories: Personalized Narrative Generation](https://hf.co/papers/2409.13935)
- [DreamBank Dream Narrative Analysis](https://hf.co/papers/2403.15486)
