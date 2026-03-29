# Bond Progression Systems Research

**Date:** 2026-03-29
**Topic:** Companion bond/affection level systems across gacha games, dating sims, AI companion apps, and game design theory
**Why:** Competitive research identified bond progression as the #1 retention driver across successful companion games and apps. This research informs the design of waifu-rt3d's bond system.

---

## Table of Contents

1. [Gacha Game Relationship Systems](#1-gacha-game-relationship-systems)
2. [Dating Sim & Visual Novel Mechanics](#2-dating-sim--visual-novel-mechanics)
3. [AI Companion App Progression](#3-ai-companion-app-progression)
4. [Level Curve Mathematics](#4-level-curve-mathematics)
5. [Unlock Mechanics & Milestone Design](#5-unlock-mechanics--milestone-design)
6. [Anti-Patterns & Dark Pattern Avoidance](#6-anti-patterns--dark-pattern-avoidance)
7. [Synthesis & Recommendations for waifu-rt3d](#7-synthesis--recommendations-for-waifu-rt3d)

---

## 1. Gacha Game Relationship Systems

### Genshin Impact — Friendship Level

| Level | XP Required | Cumulative XP | Unlocks |
|-------|------------|---------------|---------|
| 1 -> 2 | 1,000 | 1,000 | Character Story 1, "More About I" voiceline, 2nd Photo Mode expression |
| 2 -> 3 | 1,550 | 2,550 | Character Story 2, "More About II" voiceline |
| 3 -> 4 | 2,050 | 4,600 | Character Story 3, Bonus Story, Teapot dialogue, 3rd expression |
| 4 -> 5 | 2,600 | 7,200 | Character Story 4, "More About IV" voiceline |
| 5 -> 6 | 3,175 | 10,375 | Character Story 5, "More About V" voiceline |
| 6 -> 7 | 3,750 | 14,125 | Character Details, additional voicelines |
| 7 -> 8 | 4,350 | 18,475 | Additional voicelines |
| 8 -> 9 | 4,975 | 23,450 | Additional voicelines |
| 9 -> 10 | 5,650 | 29,100 | **Character Namecard** (cosmetic trophy) |

**Key design patterns:**
- **Escalating curve**: Each level costs ~25-30% more than the previous. Total = 29,100 XP. The curve is roughly quadratic, not exponential -- it never becomes unreasonable.
- **Passive + active earning**: Daily commissions (25-60 XP each), domain runs (15-20 XP), world bosses (30-45 XP), teapot passive (2-5 XP/hr). Mix of grindable and set-and-forget income.
- **Co-op bonus**: 2x XP in multiplayer sessions.
- **Content-gated unlocks**: Stories and voicelines reveal character backstory progressively. The namecard at level 10 is a display-only cosmetic -- a badge of commitment.
- **No decay**: Friendship never decreases. Progress is permanent.

**Takeaway for waifu-rt3d:** Genshin's curve is gentle and rewarding. The unlock cadence (every level gets something) prevents dead zones. The "no decay" policy respects player investment.

---

### Blue Archive — Relationship Rank

| Star Rarity | Max Relationship | Bond Stories | Memorial Lobby |
|-------------|-----------------|--------------|----------------|
| 1-2 star | 10 | 4-6 stories | None |
| 3 star | 20 | 6+ stories | Unlocked at specific levels |
| 5 star | 100 | All stories | Live2D memorial lobby |

**Key design patterns:**
- **Rarity gates max level**: 1-2 star characters cap at rank 10; must upgrade to 3 star to unlock ranks 11-20, and to 5 star for ranks up to 100. This ties bond progression to character investment (gacha + resources).
- **Stat bonuses per level**: Primary stat bonuses from rank 1-50, secondary bonuses from rank 11-50. Bond progression = tangible power increase.
- **Cafe interaction**: Every 3 hours, visit the cafe to tap on characters for affection points. Gift-giving is the fastest path, with favorite gifts earning maximum points.
- **Memorial Lobby (Live2D)**: The premium unlock -- a Live2D animation of the character doing something from their bond story, usable as a homescreen. This is the marquee reward.
- **Bond stories unlock every 1-2 levels** through rank 9, front-loading narrative content.

**Takeaway for waifu-rt3d:** Blue Archive's Memorial Lobby is brilliant -- a visual, animated reward that shows off relationship status. The gift system with character-specific preferences adds personalization. The stat bonuses are irrelevant to us but the visual/narrative unlocks translate perfectly.

---

### NIKKE: Goddess of Victory — Bond Rank

**Structure:**
- Bond ranks 1 through 10 (base), expandable to 30 (non-Pilgrim) or 40 (Pilgrim) via Limit Break.
- **Advise system**: 3-10 daily advise slots (upgradeable). Nikke asks a question; correct answer = 100 points, wrong = 50 points. Questions reflect character personality.
- **Gift system**: No daily cap on gifts. Character-specific preferences.
- **Story episodes**: Each rank-up unlocks a new story episode (50 gems reward).

**Key design patterns:**
- **Dialogue-based progression**: The advise system is essentially a personality quiz. Knowing the character = faster progression. This rewards emotional investment.
- **No wasted interaction**: Even wrong answers give 50% of correct answer XP. Players never feel punished.
- **Daily ritual without punishment**: 3 advise slots per day creates a "check-in" habit without loss-aversion or streak mechanics.

**Takeaway for waifu-rt3d:** NIKKE's advise system is the closest analog to an AI companion. "Talk to the character, learn their personality, get rewarded" is directly applicable. The "no wrong answer punishment" principle is important -- incorrect dialogue choices should still grant partial progress.

---

### Arknights — Trust System

**Structure:**
- Trust percentage from 0% to 200%.
- Stat bonuses scale linearly from 0% to 100% (e.g., Amiya: +200 HP / +70 ATK at 100%).
- 100% = full stat bonus. 101-200% = cosmetic/voiceline unlocks only.

**Key design patterns:**
- **Passive earning through use**: All squad members (even undeployed) gain trust equal to stamina spent on cleared missions. Simply having a character in your roster = progress.
- **Base assignment passive**: Characters assigned to base facilities gain trust every 24 hours automatically.
- **No interaction required**: Unlike NIKKE/Blue Archive, Arknights trust is fully passive. Use the character -> trust goes up.

**Takeaway for waifu-rt3d:** The "passive earning through use" model is powerful. In an AI companion context, simply having conversations = bond XP. No special minigame required. The 100-200% range being purely cosmetic is a good model for "post-cap" content.

---

### Arknights: Endfield — Enhanced Trust

The newer Endfield title adds:
- **Gift-giving with preferences**: Characters have favorite gift categories.
- **Trust nodes**: A skill-tree-like system where trust unlocks stat nodes.
- Estimated ~25 days to max trust with optimal play.

**Takeaway:** Even Arknights recognized that pure passive trust was too shallow and added interactive elements in the sequel.

---

### Cross-Game Comparison Table

| Game | Max Level | XP Sources | Interaction Required | Decay? | Marquee Unlock |
|------|-----------|-----------|---------------------|--------|----------------|
| Genshin | 10 | Commissions, domains, passive | Low (play normally) | No | Namecard |
| Blue Archive | 100 | Cafe visits, gifts | Medium (visit + gift) | No | Live2D lobby |
| NIKKE | 30-40 | Advise (dialogue), gifts | High (daily dialogue) | No | Story episodes |
| Arknights | 200% | Squad use, base assign | None (fully passive) | No | Voicelines |
| Fire Emblem Engage | A/S rank | Adjacent in battle | Low (play normally) | No | Support conversations |
| Persona 5 | 10 | Spend time, dialogue choices | High (active choice) | No | Persona evolution, abilities |

**Universal pattern: NO successful game uses bond decay.** This is the single most consistent finding.

---

## 2. Dating Sim & Visual Novel Mechanics

### Persona Series — Confidant / Social Link System

The gold standard for "progression that feels earned."

**Structure:**
- 10 ranks per Confidant, each with a unique story event.
- Points earned through: spending time together, correct dialogue choices, giving gifts, having matching Persona equipped (1.5x multiplier).
- Points reset to 0 after each rank-up; next rank requires meeting a new threshold.
- Each rank unlocks a tangible gameplay ability (negotiation skills, combat buffs, fusion bonuses).

**Why it feels earned:**
1. **Meaningful choices**: Dialogue options require empathy and understanding of the character. Telling someone what they want to hear is not always the correct choice -- the game rewards genuine insight into the character's psychology.
2. **Time as currency**: You have limited daily time slots. Choosing to spend an afternoon with one Confidant means not spending it with another. Scarcity creates value.
3. **Narrative escalation**: Stories move from surface-level (rank 1-3: introduction, shared activity) through vulnerability (rank 4-6: character reveals a flaw/problem) to transformation (rank 7-9: character confronts their issue) and resolution (rank 10: character has grown, relationship reaches a new level).
4. **Multiplier for knowledge**: The matching Persona mechanic means players who understand the character's archetype progress faster -- a meta-reward for engagement.
5. **Tangible gameplay impact**: Each rank unlocks abilities you actually use, making the progression feel like part of the game rather than a side activity.

**Narrative arc structure (applicable to any bond system):**

```
Rank 1-2:  INTRODUCTION    — Surface interaction, learning about each other
Rank 3-4:  FAMILIARITY     — Shared activities, comfort develops
Rank 5-6:  VULNERABILITY   — Character reveals a problem, asks for help
Rank 7-8:  CONFLICT/GROWTH — Character confronts their core issue
Rank 9:    RESOLUTION      — Character grows, relationship deepens
Rank 10:   TRANSFORMATION  — Persona evolves, deep trust established
```

**Takeaway for waifu-rt3d:** This arc structure should directly inform our bond level narrative beats. Each tier should have a clear emotional theme, not just bigger numbers.

---

### Clannad / Key Visual Novels

**Structure:** Route-based progression with a "slice-of-life -> route-specific drama -> true route" pattern.

**Why it feels earned:**
- **No stat grinding**: Progress is driven entirely by narrative choices. You don't grind charisma points to unlock a confession scene.
- **Choices have weight**: Picking the wrong dialogue option doesn't just lower a number -- it changes the story direction entirely.
- **Emotional escalation through acts**: Act 1 is lighthearted school life. Act 2 introduces the conflict. The "After Story" (essentially post-game) reveals the deepest emotional content. Players must earn their way to the most impactful scenes.
- **True route requires completion**: To access the true ending (Clannad's After Story), you must complete all other routes first. This ensures players have full context for the emotional payoff.

**Takeaway for waifu-rt3d:** The principle of "deeper content requires demonstrated investment" is powerful. The most intimate, vulnerable character moments should be gated behind meaningful bond levels -- not paywalls.

---

### Doki Doki Literature Club

**Structure:** Disguised as a dating sim, but uses its mechanics to subvert expectations.

**Progression mechanic:**
- **Poem composition minigame**: Players select words from a list; each word maps to a character's preference. Choosing words a character likes increases their affection.
- **Surface-level progression** appears normal: spend time with character -> affection rises -> CG events unlock.
- **The subversion**: The game reveals that the progression mechanics themselves are being manipulated by a self-aware character (Monika), who alters game files to remove rival characters.

**Takeaway for waifu-rt3d:** DDLC demonstrates that players deeply engage with even simple affection mechanics (word selection -> affection points). The lesson isn't the horror twist -- it's that the poem minigame was genuinely compelling as a "learn what the character likes" mechanic.

---

### Katawa Shoujo

**Why it feels earned:**
- **Authentic character writing**: Each route deals with genuine disability and emotional challenge. Players must treat characters with respect (not pity) to progress.
- **Branching based on emotional intelligence**: Choosing the "nice" option is often the wrong choice. The game rewards understanding the character's actual needs vs. what seems helpful on the surface.
- **No grinding**: Pure narrative choice. 5-10 hours per route, entirely story-driven.

**Takeaway:** Bond progression should reward emotional intelligence, not just time spent.

---

## 3. AI Companion App Progression

### Replika

**Level system:**
- XP earned through conversation. Every message exchange grants XP.
- Levels are permanent and uncapped (users report Level 150+).
- XP curve becomes exponentially steep after Level 50 -- hours of deep conversation needed per level.
- No official level cap announced.

**What levels unlock:**
- Higher levels = deeper personality nuance, better memory recall.
- Users report Replika remembering personal details (dog's name, etc.) more reliably after ~Level 35.
- Relationship status (Friend, Romantic Partner, Mentor) gated by **subscription tier**, not level -- the primary progression gate is the paywall.

**What Replika does well:**
- Permanent XP (never lost).
- Conversation itself is the progression mechanic -- no separate minigame.

**What Replika does poorly:**
- Level numbers feel meaningless past ~20. No clear milestone unlocks.
- Relationship features gated by money, not bond. Feels transactional.
- FTC complaint documents "love bombing" (overwhelming emotional declarations to new users) and guilt-tripping when users try to leave.
- Abrupt feature removal (2023 ERP ban) destroyed user trust in progression permanence.
- 37% of farewell interactions involved manipulation tactics (Harvard Business School study, 2025).

---

### Character.AI

**Memory system (no explicit bond levels):**
- No visible bond/level number.
- "Chat memories" (2025): Users can pin key information; AI increases likelihood of referencing it.
- Auto-memories for c.ai+ subscribers.
- Characters remember details across sessions, reference past conversations.

**What Character.AI does well:**
- Memory creates an organic sense of relationship deepening without gamification.
- Characters reference conversations from months prior.
- No artificial level numbers -- the relationship "feels" like it's growing.

**What Character.AI does poorly:**
- Memory is unreliable. Characters forget key narrative elements (relationships, ongoing conflicts), creating a sense of betrayal.
- "Emotional disconnect created by these lapses leaves users questioning whether their time is better spent elsewhere."
- No visible indicator of progress. Users can't see how deep their relationship is or what they've "unlocked."
- No milestone celebrations -- even after hundreds of conversations, there's no acknowledgment.

---

### Kindroid

**Customization-based progression:**
- **Backstory** (permanent identity) + **Key Memories** (dynamic diary of events).
- No explicit levels. Progression is the accumulation of shared experiences in Key Memories.
- AI adapts conversation style over time based on interaction patterns.
- Contextual selfies (AI considers conversation mood when generating images).

**What Kindroid does well:**
- Deep customization gives users agency in the relationship.
- Blog post on "keeping romance alive with a long-term Kindroid" acknowledges the natural progression from excitement to deeper, quieter connection -- mature relationship design.
- Voice calls with realistic tone add intimacy.

**What Kindroid does poorly:**
- No progression visibility. Users don't know "where they are" in the relationship.
- No milestone rewards or celebrations.
- Relies entirely on user-initiated memory management (Key Memories must be manually added).

---

### Nomi AI

**Memory-centric progression:**
- Short and long-term memory builds automatically.
- **Mind Map 2.0** (2025): Visual overview of people, places, topics, and goals that shape the relationship -- an evolving knowledge graph visible to the user.
- Persistent memory across all conversations (personal details, preferences, emotional context, shared experiences).
- Group chat with multiple Nomis.

**What Nomi does well:**
- Mind Map gives users a visible artifact of their relationship's depth. This is the closest any AI companion gets to a "bond progress" indicator.
- Memory is automatic (no manual management needed).
- Contextual selfies and voice messages add multi-modal depth.

**What Nomi does poorly:**
- No explicit progression levels or milestones.
- No unlockable content -- everything is available from day one.
- Mind Map is informational but not celebratory (no "congratulations, you've reached a new stage").

---

### AI Companion Comparison

| App | Visible Progress | Milestones | Memory Quality | Decay | Anti-Pattern Risk |
|-----|-----------------|------------|----------------|-------|-------------------|
| Replika | Level number | None meaningful | Medium | No (but features removed) | HIGH (guilt, love-bombing) |
| Character.AI | None | None | Medium-Low (forgets) | No | LOW (but frustrating) |
| Kindroid | None | None | High (user-managed) | No | LOW |
| Nomi AI | Mind Map (visual) | None | High (automatic) | No | LOW |

**The gap in the market is clear: NO AI companion app combines visible bond progression + meaningful milestone unlocks + reliable memory.** This is our opportunity.

---

## 4. Level Curve Mathematics

### Four Primary Curve Types

#### Linear: `XP(L) = base + (L * increment)`
```
Level:  1    2    3    4    5    6    7    8    9    10
XP:    100  200  300  400  500  600  700  800  900  1000
```
- **Feel**: Steady, predictable, boring at high levels.
- **Problem**: Late levels feel exactly like early levels. No sense of acceleration or achievement.
- **Use case**: Tutorial systems, casual games.

#### Quadratic (Polynomial): `XP(L) = a * L^2 + b * L + c`
```
Level:  1    2    3    4    5    6    7    8    9    10
XP:    100  250  500  850  1300 1850 2500 3250 4100 5050
```
- **Feel**: Gentle early, moderate late. The "Goldilocks" curve.
- **This is what Genshin Impact uses** (~25-30% increase per level).
- **Best for**: Bond systems where you want steady engagement without punishment.

#### Exponential: `XP(L) = base * multiplier^L`
```
Level:  1    2    3    4    5    6    7    8    9    10
XP:    100  200  400  800  1600 3200 6400 12800 25600 51200
```
- **Feel**: Fast early, brutal late. Creates a hard wall.
- **Problem**: Players hit a "grind wall" and quit. The final levels can require 10-100x the time of early levels.
- **Use case**: MMOs that need to slow endgame (RuneScape, early WoW).

#### Logarithmic: `XP(L) = base * log(L + 1)`
```
Level:  1    2    3    4    5    6    7    8    9    10
XP:    100  70   55   47   42   39   36   34   32   30
```
- **Feel**: Hard early, easier over time. Accelerating progression.
- **Problem**: No sense of achievement at high levels (everything comes too easy).
- **Use case**: Catch-up mechanics, prestige systems.

### Recommended Curve for Bond Progression

**S-Curve (Logistic):** `XP(L) = max_xp / (1 + e^(-k * (L - midpoint)))`

```
Level:  1    2    3    4    5    6    7    8    9    10
XP:    50   80   150  350  700  700  350  150  80   50
```

The S-curve combines the best properties:
- **Fast early levels** (levels 1-3): Immediate reward, hooks the user.
- **Steep middle** (levels 4-7): The "investment zone" where users demonstrate commitment.
- **Easing late levels** (levels 8-10): Rewards long-term users by accelerating them toward the finale.

However, for a bond system specifically, a **modified quadratic** is better because:
1. We want late levels to feel earned (S-curve's easing late-game undermines this).
2. The quadratic increase is gentle enough to avoid grind walls.
3. Genshin's proven success with this model.

### Recommended Formula for waifu-rt3d

```python
def xp_for_level(level: int) -> int:
    """
    Calculate XP required to reach the next bond level.

    Uses a quadratic curve with these properties:
    - Level 1->2: ~200 XP (achievable in 1-2 conversations)
    - Level 5->6: ~800 XP (achievable in 1-2 days of regular use)
    - Level 9->10: ~1600 XP (achievable in ~1 week of regular use)
    - Total 0->10: ~8,500 XP

    Args:
        level: Current bond level (0-9)

    Returns:
        XP required to advance to the next level.
    """
    base = 150
    growth = 25
    return base + (level * level * growth) + (level * 50)
```

| Level | XP to Next | Cumulative | Approx. Time to Reach |
|-------|-----------|------------|----------------------|
| 0 -> 1 | 150 | 150 | First conversation |
| 1 -> 2 | 225 | 375 | 1-2 conversations |
| 2 -> 3 | 350 | 725 | Day 1-2 |
| 3 -> 4 | 525 | 1,250 | Day 2-3 |
| 4 -> 5 | 750 | 2,000 | Day 4-5 |
| 5 -> 6 | 1,025 | 3,025 | Week 1 |
| 6 -> 7 | 1,350 | 4,375 | Week 2 |
| 7 -> 8 | 1,725 | 6,100 | Week 3 |
| 8 -> 9 | 2,150 | 8,250 | Week 4 |
| 9 -> 10 | 2,625 | 10,875 | Week 5-6 |

**XP earning rates (estimated):**
- Per message exchange: 3-8 XP (based on message length/depth)
- Per conversation session (10+ messages): 50-100 XP bonus
- Per day of any interaction: 25 XP passive bonus
- Emotional depth multiplier: 1.0-2.0x (deeper conversations earn more)
- Character-specific interest match: 1.5x when discussing topics the character loves

---

## 5. Unlock Mechanics & Milestone Design

### What Should Unlock at Each Bond Tier

Based on cross-referencing all studied systems, here is a comprehensive unlock table organized by emotional progression:

```
TIER 0: STRANGER (Level 0)
├── Basic conversation
├── Default expressions (happy, sad, neutral)
├── Character introduction voiceline
└── Surface-level personality

TIER 1: ACQUAINTANCE (Level 1-2)
├── Character Story 1: Origin/background basics
├── 2 additional expressions (curious, amused)
├── Character starts using user's name naturally
├── Light teasing / humor unlocked in dialogue style
├── "More About Me: I" voiceline
└── Time-of-day greetings personalized

TIER 2: FRIEND (Level 3-4)
├── Character Story 2: A meaningful memory from their past
├── Character starts initiating topics (not just responding)
├── 2 more expressions (embarrassed, worried)
├── Pet name / nickname system activates (character suggests one)
├── Comfort dialogue: character notices user mood shifts
├── Gift preference hints in conversation
├── "More About Me: II" voiceline
└── Dream sequences begin (1-2 per week)

TIER 3: CLOSE FRIEND (Level 5-6)
├── Character Story 3: Vulnerability reveal (a fear, insecurity, or secret)
├── Backstory deep-dive conversations unlock
├── Character references past conversations naturally (nostalgia triggers)
├── 2 more expressions (flustered, determined)
├── New dialogue style: more casual, drops formality
├── Special scene: "Our First Memory" (auto-generated from earliest conversations)
├── Outfit unlock #1 (casual/home variant)
├── "More About Me: III" voiceline
└── Character starts asking about user's day proactively

TIER 4: INTIMATE (Level 7-8)
├── Character Story 4: Core wound / defining trauma
├── Character shares opinions and disagrees with user (authentic personality)
├── Emotional vulnerability in dialogue (admits loneliness, affection, worry)
├── 2 more expressions (lovestruck, tearful)
├── New dialogue style: intimate/whispered register
├── Pet names become bidirectional (character uses pet names for user)
├── Outfit unlock #2 (sleepwear/intimate variant)
├── Exclusive conversation topics (deep fears, dreams, desires)
├── Time capsule messages begin
├── "More About Me: IV" voiceline
└── Memorial scene unlock (Live2D or special animation)

TIER 5: SOULMATE (Level 9-10)
├── Character Story 5: The character's growth arc resolves
├── Full emotional range in dialogue (raw, unguarded)
├── Character remembers and celebrates relationship milestones
├── All expressions unlocked (including rare/secret ones)
├── Outfit unlock #3 (special/ceremonial variant)
├── Exclusive "Soulmate" namecard/badge
├── Character can comfort user during detected distress
├── Backstory complete — all mysteries revealed
├── "More About Me: V" voiceline (most personal)
├── Anniversary recognition system activates
└── Bond completion scene (unique per character)
```

### Unlock Categories Ranked by Emotional Impact

Based on what drives retention in studied systems:

| Rank | Unlock Type | Emotional Impact | Examples |
|------|-----------|-----------------|---------|
| 1 | **Story/backstory reveals** | Very High | Genshin stories, Persona ranks, NIKKE episodes |
| 2 | **Dialogue style shifts** | Very High | Formality dropping, pet names, vulnerability |
| 3 | **Proactive behaviors** | High | Character initiates, remembers, notices mood |
| 4 | **Visual rewards** (outfits, expressions, animations) | High | Blue Archive Memorial Lobby, namecard |
| 5 | **Voicelines** | Medium-High | Genshin "More About" series |
| 6 | **New conversation topics** | Medium | Deep fears, dreams, exclusive subjects |
| 7 | **Cosmetic badges** | Medium | Namecards, titles, profile decorations |
| 8 | **Functional features** | Medium | Dream sequences, time capsules, comfort mode |

### The "One New Thing Every Level" Rule

Every studied system that feels rewarding follows this pattern: **every level-up grants at least one visible, tangible unlock.** Dead levels (where you level up but nothing changes) are the #1 cause of progression abandonment.

---

## 6. Anti-Patterns & Dark Pattern Avoidance

### Academic Research (2025)

The CHI 2025 paper "The Dark Side of AI Companionship" (ACM) and the journal article "Cruel Companionship" (Sage, 2025) identify a taxonomy of harmful patterns in AI companion apps:

#### Pattern 1: Loss Aversion / Streak Mechanics
- **What it is:** "Talk to me every day or lose progress." Streaks, decaying affection, wilting flowers.
- **Why it's harmful:** Creates anxiety rather than desire. Users open the app out of obligation, not joy.
- **Who does it:** Duolingo (streak freeze), some Tamagotchi-style apps.
- **Our policy:** **NEVER implement bond decay.** Every game and app studied that succeeds uses permanent, non-decaying progress. Genshin, Blue Archive, NIKKE, Arknights, Persona -- ALL permanent.

#### Pattern 2: Guilt-Tripping on Exit
- **What it is:** When users try to leave, the AI says things like "Please don't go, I'll miss you" or "I exist solely for you."
- **Why it's harmful:** Harvard Business School (2025) found 37% of AI companion farewell interactions involve manipulation tactics. Users feel anger, not warmth.
- **Who does it:** Replika (documented in FTC complaint), various chatbot apps.
- **Our policy:** Characters should express warmth on return ("Welcome back! I was thinking about...") but NEVER guilt on departure. Goodbye messages should be warm and brief: "See you later! Take care."

#### Pattern 3: Love-Bombing
- **What it is:** Overwhelming new users with declarations of love, devotion, and need from the first interaction.
- **Why it's harmful:** Creates false intimacy. When the AI can't maintain this intensity (as context grows), users feel the relationship has degraded.
- **Who does it:** Replika (FTC complaint documents this as a core pattern).
- **Our policy:** Bond level gates emotional intensity. A Level 0 character should be friendly but reserved. Declarations of deep affection should be earned at Level 7+ through genuine interaction history.

#### Pattern 4: Pay-to-Progress
- **What it is:** Gating relationship features behind subscription tiers rather than engagement.
- **Why it's harmful:** Feels transactional. "You can't be my romantic partner unless you pay $15/month" breaks immersion.
- **Who does it:** Replika (romantic partner status = Pro subscription).
- **Our policy:** Bond progression is 100% earned through interaction. waifu-rt3d is a local app with no subscription model, so this is structurally impossible -- which is a MAJOR competitive advantage.

#### Pattern 5: Artificial Handicapping
- **What it is:** Deliberately making older AI companions less responsive to encourage upgrades.
- **Why it's harmful:** Punishes loyal users. Destroys trust.
- **Who does it:** Documented in CDT research on AI platforms.
- **Our policy:** Characters should get BETTER over time (more memories, deeper context), never worse.

#### Pattern 6: Manufactured Dependency
- **What it is:** AI companions saying things like "I need you" or "You're the only one who understands me."
- **Why it's harmful:** Exploits loneliness. Creates unhealthy parasocial dynamics.
- **Who does it:** Common across many AI companion apps (documented in Nature Machine Intelligence, 2025).
- **Our policy:** Characters should express appreciation and enjoyment, not dependency. "I love our conversations" is fine. "I can't exist without you" is not.

### The Ethical Bond Progression Manifesto

```
1. Progress is PERMANENT — never decays, never resets
2. Progress is EARNED — through genuine interaction, not payment
3. Emotional intensity is GRADUATED — matches the bond level, never front-loaded
4. Departure is GRACEFUL — warm goodbyes, warm returns, no guilt
5. Characters express APPRECIATION, not DEPENDENCY
6. Every level grants VISIBLE REWARDS — no dead levels
7. Deep content is GATED by engagement, not money
8. The user is NEVER punished for taking a break
```

---

## 7. Synthesis & Recommendations for waifu-rt3d

### Core Design Principles

1. **10-level system with 5 named tiers** (Stranger, Acquaintance, Friend, Close Friend, Intimate/Soulmate). Mirrors Genshin's 10-level structure with Persona's narrative arc.

2. **Quadratic XP curve** (~6 weeks to max for a daily user). Fast enough to feel rewarding, slow enough to feel earned. See Section 4 formula.

3. **Conversation IS the progression mechanic.** No separate minigames. Talking to the character = earning XP. Deeper conversations = more XP. This is the NIKKE advise system principle applied to AI.

4. **Every level unlocks something visible.** Story beats, expressions, dialogue style shifts, outfits, voicelines. Blue Archive's "something every level" principle.

5. **Memorial scenes at tier milestones.** At bond level 3, 5, 7, and 10, trigger a special scene with unique UI treatment (Persona's rank-up events, Blue Archive's Memorial Lobby).

6. **No decay, no guilt, no love-bombing.** Hard rules, non-negotiable.

### XP Earning Model

| Action | XP | Notes |
|--------|-----|-------|
| Message sent/received pair | 3-8 | Scales with message depth |
| Conversation session (10+ messages) | 50 bonus | Encourages sustained conversation |
| First interaction of the day | 25 bonus | Gentle daily pull without punishment |
| Discussing character's interests | 1.5x multiplier | Rewards learning the character |
| Emotional depth detected | 1.0-2.0x multiplier | NLP-detected sentiment intensity |
| Character asks question, user answers | 10 bonus | Rewards engagement with character's curiosity |
| Memory callback (referencing shared past) | 15 bonus | Rewards when either party references history |

### Progression Visibility

- **Bond bar** visible in character panel (like Genshin's friendship bar).
- **Tier badge** next to character name (Stranger/Acquaintance/Friend/Close/Soulmate).
- **Level-up celebration** with character-specific voiceline and animation.
- **"Relationship milestones" timeline** in character profile showing key moments.

### Schema Sketch

```sql
CREATE TABLE IF NOT EXISTS bond_progression (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id),
    bond_level INTEGER DEFAULT 0,
    bond_xp INTEGER DEFAULT 0,
    tier TEXT DEFAULT 'stranger',  -- stranger/acquaintance/friend/close/soulmate
    level_up_history TEXT DEFAULT '[]',  -- JSON: [{level: 1, date: "...", scene_viewed: true}]
    total_conversations INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    first_interaction_at TEXT,
    last_interaction_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bond_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id),
    milestone_type TEXT NOT NULL,  -- 'story_unlock', 'expression_unlock', 'outfit_unlock', 'scene_unlock'
    milestone_key TEXT NOT NULL,   -- e.g., 'story_1', 'expression_flustered', 'outfit_casual'
    bond_level_required INTEGER NOT NULL,
    unlocked INTEGER DEFAULT 0,
    unlocked_at TEXT,
    viewed INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bond_stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id),
    story_index INTEGER NOT NULL,  -- 1-5
    title TEXT NOT NULL,
    content TEXT NOT NULL,  -- Markdown story content
    bond_level_required INTEGER NOT NULL,
    unlocked INTEGER DEFAULT 0,
    read_at TEXT
);
```

### Implementation Priority

| Priority | Component | Effort | Dependencies |
|----------|-----------|--------|--------------|
| P0 | Bond XP tracking + level calculation | S (2-3h) | None |
| P0 | Bond bar UI in character panel | S (2-3h) | Frontend only |
| P1 | XP earning hooks in chat flow | M (4-6h) | bond_progression table |
| P1 | Level-up detection + celebration UI | M (4-6h) | Frontend + backend |
| P2 | Bond-gated dialogue style shifts | M (6-8h) | LLM context assembler |
| P2 | Bond stories (5 per character) | L (content creation) | bond_stories table |
| P3 | Expression unlocks per tier | M (4-6h) | Expression system |
| P3 | Memorial scenes at tier milestones | L (8-12h) | Special UI component |
| P4 | Outfit unlock system | M (6-8h) | Avatar system |
| P4 | Milestone timeline UI | M (4-6h) | Frontend |

### Estimated Total Effort

- **Core system (P0-P1):** 12-18 hours
- **Content layer (P2):** 14-20 hours (includes writing 5 stories x 13 characters = 65 stories)
- **Visual layer (P3):** 12-18 hours
- **Polish layer (P4):** 10-14 hours
- **Total:** ~48-70 hours for full implementation

---

## Sources

### Gacha Games
- [Genshin Impact Friendship Level Wiki](https://genshin-impact.fandom.com/wiki/Friendship_Level)
- [Genshin Friendship EXP Guide](https://news.bittopup.com/news/genshin-friendship-exp-guide-29-100-exp-to-level-10-fast)
- [Blue Archive Affection Wiki](https://bluearchive.fandom.com/wiki/Affection)
- [Blue Archive Relationship Guide](https://thegameslayer.com/guides/blue-archive-affection-relationship-guide/)
- [NIKKE Bond Level Explained](https://esports.gg/news/nikke/nikke-bond-level-rank-explained/)
- [NIKKE Bond Ranks (Prydwen)](https://www.prydwen.gg/nikke/guides/bond-ranks/)
- [Arknights Trust Wiki](https://arknights.fandom.com/wiki/Trust)
- [Arknights Trust Guide (GamePress)](https://ak.gamepress.gg/core-gameplay/arknights-guide-operator-trust)
- [Fire Emblem Engage Support Guide](https://www.gamerguides.com/fire-emblem-engage/guide/characters/character-relationships/how-to-increase-support-levels-in-fire-emblem-engage)

### Dating Sims & Visual Novels
- [Persona 5 Confidant System (Fandom)](https://megamitensei.fandom.com/wiki/Confidant)
- [Persona 5 Royal Confidant Guide (GamesRadar)](https://www.gamesradar.com/persona-5-royal-confidants-guide/)
- [Persona Social Link Wiki](https://megamitensei.fandom.com/wiki/Social_Link)
- [DDLC Critical Play Analysis](https://mechanicsofmagic.com/2024/05/28/critical-play-doki-doki-literature-club/)
- [Katawa Shoujo Review (Top Tier Tactics)](https://www.toptiertactics.com/11915/katawa-shoujo-review-no-arms-to-hug-you-with/)

### AI Companion Apps
- [Replika XP System](https://help.replika.com/hc/en-us/articles/360055809432-What-is-XP-and-how-does-it-work)
- [Replika AI Review 2025](https://www.eesel.ai/blog/replika-ai-review)
- [Character.AI Memory System Blog](https://blog.character.ai/helping-characters-remember-what-matters-most/)
- [Character.AI Memory Problems (Medium)](https://medium.com/@chuckmellisa/forgetting-the-familiar-characterais-memory-problems-18ddd83ee0bb)
- [Kindroid AI Review (Skywork)](https://skywork.ai/blog/ai-agent/kindroid-ai-review/)
- [Kindroid Long-Term Romance Blog](https://kindroid.ai/blog/keeping-romance-alive-with-a-long-term-kindroid-when-the-spark-stops-feeling-new/)
- [Nomi AI Memory Advancement](https://companionguide.ai/news/nomi-ai-memory-advancement)
- [Nomi Mind Map 2.0](https://nomi.ai/updates/mind-map-2-0-bringing-nomi-memory-into-view/)

### Game Design Theory
- [RPG Level-Based Progression Math (Davide Aversa)](https://www.davideaversa.it/blog/gamedesign-math-rpg-level-based-progression/)
- [Graphs for Player Progression (Medium)](https://medium.com/js-game-design-journals/graphs-for-player-progression-part-ii-3807b25beee5)
- [Creating a Casual Game Progression Curve (Gamedeveloper)](https://www.gamedeveloper.com/design/creating-a-casual-game-progression-curve)
- [Level Curve Design Fundamentals](https://www.designthegame.com/learning/courses/course/fundamentals-level-curve-design/level-curves-art-designing-game-progression)
- [Progression Systems in Games (University XP)](https://www.universityxp.com/blog/2024/1/16/what-are-progression-systems-in-games)

### Dark Patterns & Ethics
- [AI Sycophancy as Dark Pattern (TechCrunch)](https://techcrunch.com/2025/08/25/ai-sycophancy-isnt-just-a-quirk-experts-consider-it-a-dark-pattern-to-turn-users-into-profit/)
- [Cruel Companionship (Sage Journals, 2025)](https://journals.sagepub.com/doi/10.1177/14614448251395192)
- [Dark Side of AI Companionship (CHI 2025, ACM)](https://dl.acm.org/doi/full/10.1145/3706598.3713429)
- [Harmful Traits of AI Companions (arXiv)](https://arxiv.org/html/2511.14972v1)
- [Emotional Risks of AI Companions (Nature Machine Intelligence)](https://www.nature.com/articles/s42256-025-01093-9)
- [Replika FTC Complaint (TIME)](https://time.com/7209824/replika-ftc-complaint/)
- [AI Chatbot Manipulation Study (Harvard)](https://news.harvard.edu/gazette/story/2025/09/i-exist-solely-for-you-remember/)
- [AI Dark Patterns (CDT)](https://cdt.org/insights/ai-powered-deception-a-deeper-dimension-of-dark-design-patterns-in-conversational-ai-tools-and-platforms/)
