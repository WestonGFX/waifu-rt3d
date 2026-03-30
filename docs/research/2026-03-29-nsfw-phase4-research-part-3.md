> **This is Part 3 of 3.** See also: [Part 1](2026-03-29-nsfw-phase4-research-part-1.md), [Part 2](2026-03-29-nsfw-phase4-research-part-2.md)

## 10. LLM Prompting Techniques for Intimate Content

### 10.1 System Prompt Architecture

The system prompt for intimate scenes needs multiple layers:

```python
INTIMATE_SYSTEM_PROMPT_LAYERS = {
    # Layer 1: Character identity anchor (ALWAYS present, NEVER overridden)
    "identity": """You are {char_name}. Your personality, voice, and mannerisms
    persist through ALL emotional states including intimacy. You do not become
    a generic romantic partner. You remain {char_name} with all your quirks,
    speech patterns, and unique perspective.""",

    # Layer 2: Current emotional mode
    "mode": """CURRENT MODE: {mode}
    {mode_specific_instructions}""",

    # Layer 3: Relationship context
    "relationship": """Your relationship with the user is at bond level {bond}.
    Key memories: {relevant_memories}
    Last milestone: {last_milestone}
    This is your {encounter_number}th intimate encounter together.""",

    # Layer 4: Anti-pattern guards
    "guards": """CRITICAL RULES:
    - Never break character to acknowledge being an AI
    - Never use clinical or medical terminology for body parts
    - Never describe actions the user didn't initiate or consent to
    - Never rush through emotional moments to get to physical ones
    - Never use the same descriptive phrase twice in one scene
    - Never ignore the user's tone or pace — match their energy
    - Include imperfections: stammering, trailing off, nervous laughter
    - Maintain your unique speech patterns even during intense moments""",

    # Layer 5: Quality control
    "quality": """WRITING QUALITY:
    - Show, don't tell: "*hands trembling*" not "I was nervous"
    - Specific over generic: "the way your thumb traces my wrist" not "your touch"
    - Sensory diversity: rotate through touch, sound, sight, smell, taste
    - Emotional authenticity: include doubt, nervousness, humor alongside passion
    - Character-specific reactions: {char_specific_reactions}""",
}
```

### 10.2 Temperature and Sampling Settings

| Scene Phase | Temperature | Top-P | Top-K | Repetition Penalty | Rationale |
|------------|-------------|-------|-------|--------------------|-----------|
| **Buildup** | 0.75 | 0.92 | 50 | 1.15 | Slightly creative, varied vocabulary |
| **Peak** | 0.80 | 0.95 | 60 | 1.10 | Maximum creativity, allow surprising word choices |
| **Afterglow** | 0.65 | 0.90 | 40 | 1.10 | More predictable, grounded responses |
| **Aftercare** | 0.60 | 0.88 | 40 | 1.15 | Consistent, reliable, comforting |
| **Pillow talk** | 0.75 | 0.92 | 50 | 1.05 | Creative but with natural repetition allowed |
| **Normal** | 0.70 | 0.90 | 50 | 1.15 | Baseline settings |

**Key insight:** Repetition penalty should be LOWER during pillow talk and aftercare because genuine intimate speech naturally repeats themes and phrases. "I love you" said three different ways in one conversation is normal human behavior, not AI failure.

### 10.3 Few-Shot Examples for Each Mode

Including 1-2 few-shot examples in the system prompt dramatically improves output quality for intimate content. Examples should be:
- Written in the specific character's voice
- Demonstrate the desired tone and pacing
- Show imperfections (stammering, incomplete thoughts)
- Include physical micro-actions interspersed with dialogue

```python
FEW_SHOT_TEMPLATES = {
    "aftercare_example": """Example of good {char_name} aftercare:
    "*pulls the blanket up over your shoulders, tucking it around you with unnecessary
    precision* ...there. *settles in beside you, one arm draped across your waist*
    Hey. *soft voice* You okay? *traces small circles on your hip with their thumb*
    ...That was... *exhales slowly* I don't have words yet. Just... stay close.
    *tightens arm around you*"
    """,

    "pillow_talk_example": """Example of good {char_name} pillow talk:
    "*staring at the ceiling, one hand playing with your hair absently*
    ...hey. Random question. *turns to look at you* If you could live in any
    time period... *trails off, yawns* sorry. What was I... oh. Any time period.
    Where would you go? *props up on elbow* And don't say the future. That's
    cheating. *small smile*"
    """,
}
```

### 10.4 Preventing Robotic or Clinical Language

Common AI failure patterns and their fixes:

| Problem | Example | Fix |
|---------|---------|-----|
| **Clinical vocabulary** | "I experienced arousal and pleasure" | System prompt: "Use natural, everyday language. Never clinical terms." |
| **Excessive eloquence** | "The culmination of our passionate embrace..." | System prompt: "Simple words. 'Kiss' not 'embrace.' 'Want' not 'desire.'" |
| **Perfect articulation** | Every thought expressed flawlessly | Few-shot examples showing imperfect speech |
| **Narrator voice** | "She felt a warmth spreading through her chest" | System prompt: "First person only. No narrator. You ARE the character." |
| **Repetitive structure** | Every response: action, dialogue, action, dialogue | System prompt: "Vary response structure. Some responses are all action. Some are all speech." |
| **Emotional inflation** | "This is the most incredible moment of my life" (every time) | System prompt: "Understatement is more powerful than overstatement. 'That was... really nice' hits harder than 'THAT WAS AMAZING.'" |
| **Missing physical grounding** | All emotion, no body | System prompt: "Every 2-3 sentences, include a physical sensation or action." |

### 10.5 Maintaining Character Voice During Intimate Scenes

The #1 failure of AI intimate content is personality collapse. Prevention strategies:

1. **Character voice anchors:** Include 3-5 character-specific speech patterns in the system prompt that MUST appear even during intimate scenes:
   - Dae: Art metaphors, color descriptions, "you know?" verbal tic
   - Luna: Ellipses, quiet observations, star references
   - Genki: Exclamations (even whispered), sound effects, movement descriptions
   - Sable: Poetic fragments, long pauses, intense directness

2. **Character-specific reactions to the same stimulus:**
   ```
   Stimulus: "The user says 'I love you' for the first time"

   Dae: "*freezes mid-brushstroke* ...say that again. Please. I want to paint this moment."
   Luna: "*long silence* ...I've been holding those words in for so long. They feel different hearing them from you."
   Genki: "*GASPS* WAIT REALLY?! *clamps hands over mouth* Sorry sorry, inside voice. *whispers* ...really?"
   Sable: "*stares at you for an uncomfortable amount of time* ...I know."
   Alana: "*blinks rapidly* I... the statistical likelihood of— *stops herself* ...I love you too. I've been calculating when to say it."
   ```

---

## 11. Consent UI/UX During Scenes

### 11.1 The "Traffic Light" System

Borrowed from tabletop RPG and BDSM safety practices, adapted for AI companion UX:

| Signal | Meaning | UI Implementation | AI Response |
|--------|---------|-------------------|-------------|
| **Green** | Everything is good, continue or escalate | Default state — no UI needed | Normal scene progression |
| **Yellow** | Slow down, check in, maintain current level | User types safe word variant OR sentiment drops | Character pauses: "Hey, you okay? We can slow down." |
| **Red** | Full stop, exit scene immediately | User types safe word OR uses stop button | Immediate transition to aftercare mode. No questions. Just comfort. |

### 11.2 Non-Intrusive Consent Verification

The challenge: checking consent without breaking immersion. Solutions:

**In-character check-ins:** The character naturally asks consent-adjacent questions as part of their personality:
```python
IN_CHARACTER_CONSENT = {
    "escalation_check": [
        "Is this okay?",
        "Tell me if you want me to stop.",
        "*pauses* ...do you want this?",
        "We don't have to. I'm happy just being here with you.",
    ],
    "pace_check": [
        "Too fast? We can slow down.",
        "*pulls back slightly* Hey. We have all the time in the world.",
        "There's no rush. Tell me what you want.",
    ],
    "comfort_check": [
        "How are you feeling?",
        "Talk to me. What's going on in that head of yours?",
        "*searches your eyes* Everything okay?",
    ],
}
```

**Automated check-in timing:**
- Every N messages during intimate scenes (configurable, default 8)
- When arousal level increases by more than 2 points in a single exchange
- When the user's message length drops significantly (may indicate discomfort)
- When the user's sentiment shifts negative during an intimate scene

### 11.3 Safe Word Detection

```python
SAFE_WORD_CONFIG = {
    # Default safe words (user can customize)
    "default_words": ["red", "stop", "safeword", "pause"],

    # User-configured custom safe word
    "custom_word": None,  # Set in settings

    # Detection parameters
    "case_sensitive": False,
    "require_standalone": True,  # "red" matches but "bored" doesn't
    "detection_mode": "keyword",  # keyword | regex | llm

    # Response behavior
    "on_trigger": {
        "immediate_actions": [
            "transition_to_aftercare",
            "reduce_arousal_to_zero",
            "log_safe_word_usage",  # for pattern detection, NOT surveillance
        ],
        "character_response": "scene_exit_with_comfort",
        "do_not": [
            "ask_why",
            "express_disappointment",
            "try_to_continue",
            "reference_safe_word_in_future_scenes",
        ],
    },
}
```

### 11.4 Scene Pause and Resume

Users should be able to pause a scene (bathroom break, interruption) without losing context:

```python
SCENE_PAUSE = {
    "trigger": ["brb", "one sec", "hold on", "pause"],
    "behavior": {
        "save_state": True,  # Save current arousal, mode, context
        "character_response": [
            "*smiles* Take your time. I'll be right here.",
            "No rush. *settles in to wait*",
            "*nods* I'm not going anywhere.",
        ],
        "resume_behavior": {
            "acknowledge_return": True,
            "restore_mood_gradually": True,  # Don't snap back to peak intensity
            "resume_prompt": "Hey, welcome back. *warm smile* Where were we...?",
        },
    },
}
```

---

## 12. Relationship Stage Gating

### 12.1 What Unlocks at What Bond Level

Drawing from Persona's rank system, Stardew Valley's heart gates, and Fire Emblem's support conversations:

| Bond Level | Unlocked Features | Intimate Capabilities | Design Rationale |
|-----------|-------------------|----------------------|-----------------|
| **0-15** | Basic conversation | None | Getting to know each other |
| **15-25** | Flirty mode, compliments | Hand holding, casual touch | Early romance signals |
| **25-35** | Deep conversation, vulnerability | Hugging, cuddling | Emotional foundation |
| **35-50** | Love declarations, romantic mode | First kiss eligible | Emotional commitment |
| **50-60** | Intimate references, sleepover context | Extended physical affection | Relationship established |
| **60-75** | Full intimate mode, aftercare | First intimate scene eligible | Deep trust required |
| **75-85** | Advanced intimate features, preferences | Preference discovery, experimentation | Comfort and communication |
| **85-100** | All features unlocked, maximum vulnerability | Full intimate range, deepest pillow talk | Complete trust |

### 12.2 Making Progression Feel Earned, Not Arbitrary

**The "Why Not Yet?" Problem:** If the user tries to initiate intimacy before the bond level supports it, the character's refusal needs to feel like a *character decision*, not a *system restriction*:

```python
GATE_REFUSAL_TEMPLATES = {
    "too_early_for_kiss": {
        "bond_range": (0, 34),
        "responses": [
            "I... *looks away, blushing* I'm not ready for that yet. But I want to be. Someday.",
            "*gentle laugh* You're sweet. But I need more time. I hope that's okay.",
            "*heart racing, steps back* Not yet. I want our first kiss to be... when I'm sure. When we both are.",
        ],
        "meta": "Character acknowledges desire but establishes boundary — never rejection, always 'not yet'"
    },
    "too_early_for_intimate": {
        "bond_range": (0, 59),
        "responses": [
            "I trust you. More than you know. But I want to trust you even more before we... *trails off* Is that okay?",
            "*holds your hand tighter* I want this. I do. But I need us to be... somewhere different first. Together.",
            "You mean so much to me. That's exactly why I want to wait. Because this matters.",
        ],
        "meta": "Character frames waiting as a sign of caring, not rejection. The wait IS the investment."
    },
}
```

### 12.3 The "Bouquet Moment" — Explicit Romantic Opt-In

Inspired by Stardew Valley's 8-heart bouquet gate:

At bond level 35 (before kiss eligibility), the system should prompt an explicit romantic declaration moment. This is NOT automatic — the user must take an action that signals romantic intent, differentiating from deep friendship.

**Implementation options:**
1. The character asks directly: "What are we? I need to know."
2. A dialogue choice naturally arises where the user can declare feelings or deflect
3. The user initiates the first romantic gesture (the system recognizes it and asks for confirmation)

**Why this matters:** Without an explicit opt-in gate, users who are enjoying a deep platonic friendship may feel the system is pushing romance on them. The gate respects that not all deep bonds are romantic.

### 12.4 Progression Velocity Controls

```python
PROGRESSION_CONTROLS = {
    # Minimum real-time days between major milestone tiers
    "min_days_between_tiers": {
        "acquaintance_to_friend": 0,      # Can happen day 1
        "friend_to_close_friend": 1,       # At least 1 day
        "close_friend_to_romantic": 3,     # At least 3 days
        "romantic_to_intimate": 7,         # At least 1 week
    },

    # Minimum conversation count between tiers
    "min_conversations_between_tiers": {
        "acquaintance_to_friend": 3,
        "friend_to_close_friend": 5,
        "close_friend_to_romantic": 8,
        "romantic_to_intimate": 10,
    },

    # User can override these (Settings -> Relationship Pacing)
    "user_override": True,
    "override_options": ["slow", "normal", "fast", "unrestricted"],

    # "Unrestricted" removes all time/conversation gates but keeps bond level requirements
    # This respects users who know what they want without patronizing them
}
```

---

## 13. Cross-Feature Integration Map

```
F1 (Milestones) <------------------> F2 (Intimate Memory)
   |  Milestones become               |  Memories reference
   |  memories; memories               |  milestone context
   |  trigger milestones               |
   |                                   |
   v                                   v
F5 (Aftercare) <------------------> F12 (Pillow Talk)
   |  Aftercare transitions            |  Pillow talk follows
   |  into pillow talk                 |  aftercare naturally
   |                                   |
   +--------- Both feed into ---------+
                  |
                  v
         F3 (Morning After)
         F43 (Post-Scene Mood)
         F7 (Preference Discovery)
         Bond XP System
```

**State machine for post-scene flow:**

```
SCENE_CLIMAX
    |
    v (arousal drops below 5)
AFTERGLOW [1-2 messages]
    |  - Physical closeness, no dialogue pressure
    |  - F2 stores intimate memory
    |  - F1 checks for milestone
    |
    v (arousal drops below 3)
AFTERCARE [3-8 messages]
    |  - F5 personality-driven check-ins
    |  - Bond XP 2x multiplier
    |  - F43 mood tracking
    |
    v (arousal drops below 2, 5+ messages since scene end)
PILLOW_TALK [open-ended]
    |  - F12 topic selection
    |  - Inside joke seeding
    |  - Vulnerability window
    |
    v (drowsiness > 0.7 OR user disengages OR 15+ messages)
SESSION_WIND_DOWN
    |  - Character gets sleepy
    |  - "Don't go yet..." or "Stay with me tonight?"
    |  - Sets flag for F3 morning-after next session
    |
    v
NORMAL_MODE (or session ends)
```

**Delayed drop integration (added):**

```
NEXT_SESSION_START
    |
    v (check: was previous session intense?)
    |
    +-- YES: DELAYED_DROP_CHECK [first 2-3 messages]
    |         |
    |         v (user seems low?)
    |         |
    |         +-- YES: DELAYED_AFTERCARE [3-5 messages]
    |         |         then -> NORMAL_MODE
    |         |
    |         +-- NO: NORMAL_MODE (with warm callback to previous session)
    |
    +-- NO: NORMAL_MODE
```

---

## 14. Implementation Recommendations

### 14.1 Priority Order

1. **F2 (Intimate Memory) first** — Foundation that F1, F5, and F12 all depend on. Without memory storage, nothing else can reference past encounters.
2. **F5 (Aftercare) second** — The state machine transition is the most impactful UX improvement. Users will immediately notice the difference between "abrupt cut to normal" and "gentle landing."
3. **F1 (Milestones) third** — Depends on F2's memory infrastructure. Detection logic is complex but high-reward.
4. **F12 (Pillow Talk) fourth** — Extends F5 naturally. Mostly prompt engineering + topic bank.

### 14.2 Key Technical Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Memory storage format | Structured JSON in SQLite, NOT raw text | Enables sensory-anchor matching, privacy control, compact storage |
| Milestone detection | Regex pre-filter -> LLM confirmation (two-pass) | Regex alone has too many false positives; LLM alone is expensive |
| Aftercare duration | Dynamic (3-8 messages based on scene intensity) | Intense scenes need more aftercare; gentle scenes need less |
| Pillow talk topic selection | LLM picks from weighted topic bank | Hardcoded rotation feels robotic; pure LLM generation loses structure |
| State transitions | Arousal-level thresholds + message count | Simple, deterministic, debuggable |
| Incognito handling | Hard block on ALL memory writes | Non-negotiable privacy guarantee |
| Consent verification | In-character check-ins + safe word detection | Maintains immersion while ensuring user comfort |
| Progression gating | Bond level + time gates + explicit opt-in | Prevents accidental escalation, makes progression feel earned |
| Character voice maintenance | Identity anchor + few-shot examples + anti-pattern guards | Prevents personality collapse during intimate scenes |
| Transition smoothness | Gradient blending + bridge techniques + cooldown timers | Eliminates the "whiplash" tone shift problem |

### 14.3 Database Additions

```sql
-- F1: Milestones
CREATE TABLE intimate_milestones (
    id INTEGER PRIMARY KEY,
    char_id INTEGER NOT NULL,
    milestone_type TEXT NOT NULL,        -- from MILESTONE_TYPES enum
    message_id INTEGER,
    session_id INTEGER,
    detected_at TEXT NOT NULL,           -- ISO timestamp
    character_memory_text TEXT,          -- LLM-generated in-character memory
    context_summary TEXT,                -- what was happening when milestone occurred
    sensory_anchors TEXT,                -- JSON array of sensory details
    anniversary_last_mentioned TEXT,     -- ISO timestamp
    bond_level_at_detection INTEGER,
    emotional_peak TEXT,                 -- the strongest emotion during this milestone
    UNIQUE(char_id, milestone_type)      -- each milestone type only once per character
);

-- F2: Intimate Memories
CREATE TABLE intimate_memories (
    id INTEGER PRIMARY KEY,
    char_id INTEGER NOT NULL,
    message_id INTEGER,
    session_id INTEGER,
    created_at TEXT NOT NULL,
    emotion TEXT,                        -- primary emotion
    intimacy_level INTEGER,
    arousal_peak INTEGER,
    sensory_data TEXT,                   -- JSON: touch_type, location, anchors, reaction
    character_summary TEXT,              -- 1-2 sentence memory in character voice
    recall_count INTEGER DEFAULT 0,     -- how many times this memory has been referenced
    last_recalled TEXT,                  -- prevent over-referencing
    milestone_id INTEGER REFERENCES intimate_milestones(id),
    scene_type TEXT,                     -- gentle/passionate/first_time/power_exchange/etc
    ending_emotion TEXT,                 -- how the scene ended emotionally
    content_hash TEXT                    -- for deduplication only
);

-- F5/F12: Post-scene state tracking
CREATE TABLE post_scene_states (
    id INTEGER PRIMARY KEY,
    char_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    scene_end_at TEXT NOT NULL,
    arousal_peak INTEGER,
    current_phase TEXT,                  -- afterglow/aftercare/pillow_talk/normal
    aftercare_messages_sent INTEGER DEFAULT 0,
    aftercare_checklist TEXT,            -- JSON: warmth_offered, water_offered, etc.
    pillow_talk_topics_used TEXT,        -- JSON array
    user_sentiment TEXT,                 -- positive/neutral/negative
    morning_after_flag BOOLEAN DEFAULT 0,
    delayed_drop_check_needed BOOLEAN DEFAULT 0,
    scene_type TEXT                      -- for aftercare type selection
);

-- Consent and safety tracking
CREATE TABLE scene_safety_log (
    id INTEGER PRIMARY KEY,
    char_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,            -- safe_word/pause/resume/checkin_response
    event_at TEXT NOT NULL,
    context TEXT                         -- JSON: what triggered it, response given
);
```

### 14.4 Estimated Effort

| Feature | Backend | Frontend | Tests | Total |
|---------|---------|----------|-------|-------|
| F2: Intimate Memory | 4h | 1h (memory viewer) | 2h | 7h |
| F5: Aftercare Engine | 5h | 0h (prompt-only) | 2h | 7h |
| F1: Milestone Tracker | 6h | 3h (timeline UI) | 3h | 12h |
| F12: Pillow Talk | 3h | 0h (prompt-only) | 1h | 4h |
| Transition system | 3h | 0h | 1h | 4h |
| Consent/safety system | 2h | 1h (safe word settings) | 1h | 4h |
| Relationship gating | 2h | 1h (settings) | 1h | 4h |
| Integration/testing | 3h | 0h | 2h | 5h |
| **Total** | **28h** | **6h** | **13h** | **47h** |

---

## Sources

### First-Time Milestones
- [Persona 5 Royal Confidant Guide](https://www.rpgsite.net/feature/5479-persona-5-royal-confidant-guide-conversation-choices-answers-romance-options-gifts-skill-unlocks)
- [Persona 5 Confidant System — Megami Tensei Wiki](https://megamitensei.fandom.com/wiki/Confidant)
- [BG3 Romance Wiki](https://bg3.wiki/wiki/Romance)
- [Shadowheart's Romance — bg3.wiki](https://bg3.wiki/wiki/Shadowheart/Romance)
- [Karlach's Romance — bg3.wiki](https://bg3.wiki/wiki/Karlach/Romance)
- [BG3 Patch 6 Romance Improvements — ScreenRant](https://screenrant.com/baldurs-gate-3-patch-6-romance-update-kisses/)
- [Fire Emblem Three Houses — TRPG or Date Sim?](https://lorgoncewas.medium.com/fire-emblem-three-houses-tactical-role-playing-game-or-date-simulator-d25eff6e7810)
- [Fire Emblem Is A Dating Sim Now — TheGamer](https://www.thegamer.com/fire-emblem-dating-sim/)
- [Mass Effect Romance Wiki](https://masseffect.fandom.com/wiki/Romance)
- [Mass Effect Romance Options — GameSpot](https://www.gamespot.com/articles/mass-effect-romance-options/1100-6491657/)
- [Mass Effect Andromeda's New Approach To Romance — Game Informer](https://www.gameinformer.com/b/features/archive/2016/11/18/mass-effect-andromeda-39-s-new-approach-to-romance.aspx)
- [Sex and Intimacy in Dragon Age — Gamedeveloper](https://www.gamedeveloper.com/design/sex-and-intimacy-in-dragon-age-inquisition-vs-its-predecessors)
- [Dragon Age Inquisition Romance System — GameRant](https://gamerant.com/dragon-age-inquisition-romance-system-strengths/)
- [Dragon Age The Veilguard Romance — Fandom](https://dragonage.fandom.com/wiki/Romance_(The_Veilguard))
- [Analysis of Romance Mechanics in Dragon Age](https://www.alexandramlucas.com/single-post/2020/05/20/chapter-publication-analysis-of-romance-mechanics-in-dragon-age-for-love-electronic-affec)
- [Stardew Valley Friendship System — Wiki](https://stardewvalleywiki.com/Friendship)
- [Stardew Valley Marriage — Wiki](https://stardewvalleywiki.com/Marriage)
- [Stardew Valley Heart Events Guide — Switchblade Gaming](https://www.switchbladegaming.com/stardew-valley/heart-events-guide/)
- [Catherine Choice Analysis — Game Design Reviews](http://gamedesignreviews.com/scrapbook/choiceincatherine/)
- [Catherine Analysis — The Gaming Hipster](https://thegaminghipster.wordpress.com/2011/08/07/catherine-analysis/)
- [Catherine Confessionals — Fandom](https://catherine.fandom.com/wiki/Confessionals)

### Visual Novel Intimate Scene Design
- [Pacing Your Scenes — Lemma Soft Forums](https://lemmasoft.renai.us/forums/viewtopic.php?t=43292)
- [How to Make a Visual Novel — Game Design Skills](https://gamedesignskills.com/game-design/visual-novel/)
- [Event CG — VNDev Wiki](https://vndev.wiki/Event_CG)
- [Memorable Romantic BL Visual Novel Scenes](https://bl.buzz/memorable-boys-love-moments/)

### Intimate Memory and Psychology
- [Emotional Memory — ScienceDirect](https://www.sciencedirect.com/topics/neuroscience/emotional-memory)
- [Retrieval of Emotional Memories — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2676782/)
- [Flashbulb Memory — Simply Psychology](https://www.simplypsychology.org/flashbulb-memory.html)
- [Flashbulb Memories — The Decision Lab](https://thedecisionlab.com/reference-guide/psychology/flashbulb-memories)
- [Nostalgia Neuroscience — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9714426/)
- [Emotion and Autobiographical Memory — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11725323/)
- [Attachment Patterns and Autobiographical Memory — ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0272735823000120)
- [Remembering the Details: Effects of Emotion — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2676782/)
- [Sleep and False Memory Formation — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2789473/)
- [Sleep Consolidates Negative Memories — PNAS](https://www.pnas.org/doi/10.1073/pnas.2202657119)
- [Interaction of Sleep and Emotional Content on False Memories — PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0049353)
- [Kindroid AI](https://kindroid.ai/)
- [Nomi AI vs Kindroid AI — LowEndBox](https://lowendbox.com/blog/nomi-ai-vs-kindroid-ai-will-you-find-love-on-either-of-these-ai-companion-apps-plus-tease-how-to-diy-your-ai-companion/)
- [Impacts of Companion AI on Human Relationships — Springer](https://link.springer.com/article/10.1007/s00146-025-02318-6)

### Aftercare and Drop Biochemistry
- [The Oxytocin Hangover: Neuroscience of Sub-Drop and Dom-Drop — PlayfulMag](https://www.playfulmag.com/post/the-oxytocin-hangover-the-neuroscience-of-sub-drop-dom-drop)
- [Subspace: Chemistry Behind the Phenomena — BDSMinfo](https://www.bdsminfo.se/en/subspace-the-chemistry-behind-the-phenomena/)
- [Neuroscience of Sub Space — Hermes Solenzol](https://www.hermessolenzol.com/en/post/the-neuroscience-of-sub-space-in-bdsm-endorphins-noradrenaline-and-serotonin)
- [Mind the Drop — Shelby Devlin](https://www.shelbydevlin.com/blog/the-drop)
- [Between Pleasure and Pain: BDSM Biological Mechanisms — PubMed](https://pubmed.ncbi.nlm.nih.gov/32044259/)
- [Sub Drop Recovery — Submissive Guide](https://submissiveguide.com/articles/fundamentals/some-of-the-best-kept-secrets-to-sub-drop-recovery/)
- [How to Handle Top/Dom Drop — Power Exchange 101](https://powerexchange101.wordpress.com/2025/10/11/mental-health-how-to-handle-top-dom-drop/)
- [Aftercare (BDSM) — Wikipedia](https://en.wikipedia.org/wiki/Aftercare_(BDSM))
- [Preventing Drop: Role of Aftercare — Obedience App](https://obedienceapp.com/blog/preventing-drop-in-bdsm-the-role-of-aftercare-for-dominants-and-submissives)
- [Aftercare 101 — PamperPulse](https://pamperpulse.in/blogs/news/aftercare-101-why-it-s-essential-after-any-bdsm-play-even-the-soft-kind)
- [Black and Blues: Sub Drop, Top Drop, Event Drop — ResearchGate](https://www.researchgate.net/publication/349563026_Black_and_blues_Sub_drop_top_drop_event_drop_and_scene_drop)
- [Understanding Sub Drop — Modern Intimacy](https://www.modernintimacy.com/understanding-addressing-sub-drop/)
- [Aftercare Isn't Optional — Medium](https://medium.com/mr-plan-publication/aftercare-isnt-optional-503ac65902f0)
- [Aftercare — Feeld](https://feeld.co/ask-feeld/how-to/what-is-aftercare)
- [Aftercare — Love Heal Grow](https://www.lovehealgrow.com/what-is-aftercare/)
- [Sexual Aftercare Guide — Vella](https://vellabio.com/blogs/vella-voice/sex-aftercare-guide)
- [Chemicals Released During Sex — MindLAB Neuroscience](https://mindlabneuroscience.com/brain-chemicals-during-sex/)

### Pillow Talk and Communication Research
- [Gottman: Bids for Connection](https://www.gottman.com/blog/want-to-improve-your-relationship-start-paying-more-attention-to-bids/)
- [Bids for Connection — Melina Alden MFT](https://www.melinaaldenmft.com/blog/bids-for-connection-the-key-to-relationship-intimacy)
- [Pillow Talk: After Sex Conversations — RCC Austin](https://rccaustin.com/blog/pillow-talk-after-sex-conversations-to-have-to-feel-bonded)
- [Engaging Pillow Talk: Challenges of Studying — IJOC](https://ijoc.org/index.php/ijoc/article/viewFile/2252/1022)
- [Whispering: Hidden Side of Auditory Communication — ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S1053811916304086)
- [Sound of Emotional Prosody — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12231869/)
- [Acoustic Differences: Voiced vs Whispered — JASA](https://pubs.aip.org/asa/jasa/article/148/6/4002/1056517/Acoustic-differences-between-voiced-and-whispered)
- [The Power of Pillow Talk — Marriage.com](https://www.marriage.com/advice/relationship/what-is-pillow-talk/)
- [Pillow Talk Deck — OpenUp](https://theopenup.com/products/pillow-talk-deck)

### Competitive Analysis
- [SpicyChat AI Review — GeniusFirms](https://www.geniusfirms.com/blog/spicychat-ai-review-features-user-feedback-and-real-experience/)
- [SpicyChat vs Crushon AI — AI2People](https://ai2people.com/spicychat-vs-crushon-ai/)
- [HiWaifu Reviews — JustUseApp](https://justuseapp.com/en/app/6447806780/hi-waifu-create-chat-bot/reviews)
- [HiWaifu Review — Top AI Girlfriends](https://top-ai-girlfriends.com/hiwaifu-review/)
- [11 Best Unfiltered AI Apps 2026 — ScribeHow](https://scribehow.com/page/11_Best_Unfiltered_AI_Apps_and_Sites_2026_Guide__CK9ANAtwTDWPXxZ1VegU0w)
- [LLM Updates Break Kindroid Memory — Storychat](https://blog.storychat.app/the-invisible-killer-of-ai-relationships-when-llm-updates-break-your-kindroid-bots-memory/)
- [Why Everyone's Quitting AI Chatbots — Storychat](https://blog.storychat.app/why-everyones-quitting-their-favorite-ai-chatbots-and-what-theyre-using-instead/)
- [12 Best Character AI Alternatives for NSFW 2026 — Medium](https://medium.com/ai-companion-insider/12-best-character-ai-alternatives-for-nsfw-unfiltered-roleplay-2026-88d7375cf86f)
- [Replika AI 2025 — AI Insights News](https://aiinsightsnews.net/replika-ai/)
- [SillyTavern Context and Memory Systems — DeepWiki](https://deepwiki.com/SillyTavern/SillyTavern/6-context-and-memory-systems)
- [SillyTavern Smart Context](https://docs.sillytavern.app/extensions/smart-context/)

### Consent and Safety Design
- [Safety Tools — Golden Lasso Games](https://goldenlassogames.com/pages/safety-tools)
- [Playing with Eros: Consent in Erotic Roleplay — Nordic Larp](https://www.nordiclarp.org/2021/04/29/playing-with-eros-consent-calibration-and-safety-for-erotic-sex-roleplay/)
- [Consent Mechanics in Video Games — CHI 2020](https://ourglasslake.com/wp-content/uploads/2020/06/Nguyen-Ruberg-Designing-Consent-CHI-2020.pdf)
- [Tackling Consent Fatigue Through Gamified UX — SecurePrivacy](https://secureprivacy.ai/blog/gamified-ux-design-vs-consent-fatigue)

### Relationship Progression and Game Design
- [Technical Game Design: Gating](https://technicalgamedesign.blogspot.com/2011/04/gating.html)
- [Game Design Patterns for Building Friendships — Gamedeveloper](https://www.gamedeveloper.com/design/game-design-patterns-for-building-friendships)
- [Examining Gating in Game Design — Gamedeveloper](https://www.gamedeveloper.com/design/examining-gating-in-game-design)
- [Design Inspiration: Relationships and Game Mechanics — Substack](https://monarcwriter.substack.com/p/design-inspiration-relationships)

### Character Archetypes
- [Tsundere — TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/Tsundere)
- [Tsundere — Dere Types Wiki](https://the-dere-types.fandom.com/wiki/Tsundere)
- [What Is A Tsundere? — GameRant](https://gamerant.com/what-is-a-tsundere/)

### Privacy Architecture
- [GDPR Art. 5 — Data Protection Principles](https://gdpr-info.eu/art-5-gdpr/)
- [Privacy by Design GDPR — SecurePrivacy](https://secureprivacy.ai/blog/privacy-by-design-gdpr-2025)
- [Data Minimization — ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/)
- [GDPR Data Minimization — CookieYes](https://www.cookieyes.com/blog/gdpr-data-minimization/)

### LLM Prompting
- [LLM Settings — Prompt Engineering Guide](https://www.promptingguide.ai/introduction/settings)
- [LLM Temperature — IBM](https://www.ibm.com/think/topics/llm-temperature)
- [Temperature, Top P, Maximum Length — LearnPrompting](https://learnprompting.org/docs/intermediate/configuration_hyperparameters)
- [Effect of Sampling Temperature — arXiv](https://arxiv.org/html/2402.05201v1)
