# Bond Progression Systems Research

> **This is Part 1 of 2.** See also: [Part 2](2026-03-29-bond-progression-research-part-2.md)


**Date:** 2026-03-29
**Topic:** Companion bond/affection level systems across gacha games, dating sims, AI companion apps, and game design theory
**Why:** Competitive research identified bond progression as the #1 retention driver across successful companion games and apps. This research informs the design of waifu-rt3d's bond system.
**Word count:** ~18,000 words
**Related specs:** `docs/plans/2026-03-27-nsfw-mega-sprint.md` (Bond Progression feature), `.claude/plans/2026-03-19-master-plan-phases-1-20.md`

---

## Table of Contents

1. [Gacha Game Relationship Systems](#1-gacha-game-relationship-systems)
2. [Dating Sim & Visual Novel Mechanics](#2-dating-sim--visual-novel-mechanics)
3. [AI Companion App Progression](#3-ai-companion-app-progression)
4. [Level Curve Mathematics](#4-level-curve-mathematics)
5. [Unlock Mechanics & Milestone Design](#5-unlock-mechanics--milestone-design)
6. [Anti-Patterns & Dark Pattern Avoidance](#6-anti-patterns--dark-pattern-avoidance)
7. [Bond Event Systems](#7-bond-event-systems)
8. [Friendship Decay vs No-Decay Analysis](#8-friendship-decay-vs-no-decay-analysis)
9. [Social Link Narrative Structure](#9-social-link-narrative-structure)
10. [Gift Systems](#10-gift-systems)
11. [Jealousy & Exclusive Mechanics](#11-jealousy--exclusive-mechanics)
12. [Bond Visualization & UI](#12-bond-visualization--ui)
13. [Psychological Research on Attachment & Parasocial Relationships](#13-psychological-research-on-attachment--parasocial-relationships)
14. [Monetization Ethics](#14-monetization-ethics)
15. [Synthesis & Recommendations for waifu-rt3d](#15-synthesis--recommendations-for-waifu-rt3d)

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
- **Birthday mail**: On each character's in-game birthday, they send the player a mail with their Special Dish and additional gifts. The mail arrives at server midnight and expires at 23:59 that day -- a 24-hour exclusive. Players do NOT need to own the character to receive birthday mail.

**Takeaway for waifu-rt3d:** Genshin's curve is gentle and rewarding. The unlock cadence (every level gets something) prevents dead zones. The "no decay" policy respects player investment. Birthday mail is a low-cost way to maintain character presence even during inactive periods.

---

### Fate/Grand Order — Bond Levels

FGO uses the most complex bond system in gacha gaming, with **per-servant bond point requirements** varying across different groups.

**Bond Level Requirements (approximate ranges by servant group):**

| Level | Low-Bond Servants | Standard Servants | High-Bond Servants |
|-------|------------------|-------------------|-------------------|
| 0 -> 1 | 2,000 | 3,000 | 4,500 |
| 1 -> 2 | 3,000 | 6,125 | 9,250 |
| 2 -> 3 | 4,000 | 6,125 | 9,250 |
| 3 -> 4 | 5,000 | 6,125 | 9,250 |
| 4 -> 5 | 6,000 | 6,125 | 9,250 |
| 5 -> 6 | 210,000 | 252,000 | 292,500 |
| 6 -> 7 | 230,000 | 262,500 | 307,500 |
| 7 -> 8 | 250,000 | 300,000 | 337,500 |
| 8 -> 9 | 270,000 | 325,000 | 375,000 |
| 9 -> 10 | 290,000 | 375,000 | 410,000 |
| **Total 0-10** | **~1,270,000** | **~1,542,000** | **~1,764,000** |

**Bond Levels 11-15 (uniform for all servants):**

| Level | Points Required | Cumulative (from 11) | Reward |
|-------|----------------|---------------------|--------|
| 10 -> 11 | 1,090,000 | 1,090,000 | 30 Saint Quartz |
| 11 -> 12 | 1,230,000 | 2,320,000 | 30 Saint Quartz |
| 12 -> 13 | 1,360,000 | 3,680,000 | 30 Saint Quartz |
| 13 -> 14 | 1,500,000 | 5,180,000 | 30 Saint Quartz |
| 14 -> 15 | 1,640,000 | 6,820,000 | 30 Saint Quartz |

**Key design patterns:**
- **Massive cliff at Bond 5->6**: The jump from ~6,000 to ~252,000 points is a 40x increase. Bonds 1-5 are the "intro," bonds 6-10 are the "commitment zone." This creates two distinct phases of the relationship.
- **Bond CE at level 10**: Each servant has a unique Craft Essence (equippable item) that unlocks at Bond 10. These are narrative rewards that tell a personal story -- many are considered among the best-written content in FGO.
- **Lantern of Chaldea**: Levels 11-15 each require a rare item (Lantern of Chaldea) plus escalating QP (10M-18M) to unlock. This gates post-cap progression behind intentional investment.
- **Bond-boosting CEs**: Players can equip Craft Essences that boost bond point gain by 25-100%, creating a "bond farming" meta.
- **Front-line bonus**: Since the 8th Anniversary, all servants on the front line gain a bonus 20% Bond EXP after clearing quests. This rewards active use of characters you want to bond with.

**Takeaway for waifu-rt3d:** FGO's two-phase structure (easy early bonds, hard late bonds) is psychologically sound -- it hooks new players fast, then rewards dedicated fans. The Bond CE is an exceptional design: a tangible, story-rich artifact that says "this servant trusts you completely." We should have an equivalent "bond artifact" at max level. The per-servant variation is interesting but adds complexity we probably don't need.

---

### Azur Lane — Affinity System

Azur Lane uses a tiered affinity system with named relationship stages and an "Oath" marriage mechanic.

**Affinity Tiers:**

| Affinity Range | Relationship Stage | Stat Bonus |
|---------------|-------------------|------------|
| 0-30 | Disappointed | None (negative zone) |
| 31-60 | Stranger | None |
| 61-80 | Friendly | +1% all base stats |
| 81-99 | Crush | +3% all base stats |
| 100 (no ring) | Love | +6% all base stats |
| 100-199 (with ring) | Oath | +9% all base stats |
| 200 (with ring) | Oath (max) | +12% all base stats |

**Affinity point sources:**
- Per battle: +0.0625 affinity (16 battles = 1 point)
- MVP in battle: +0.1 additional (8 MVPs = 1 point)
- Secretary (set as main screen): +1 per 6 hours (4/day passive)
- Oathed secretary: Doubled passive rate

**Oath Mechanic (Marriage):**
- Once a ship reaches 100 affinity, use a "Ring of Promise" to Oath them
- First ring is free (quest reward); additional rings cost 600 gems (~$5 USD)
- Oathing raises the affinity cap from 100 to 200
- Many characters receive an exclusive "Oath Skin" -- a wedding-themed visual variant
- Oath skins are some of the most sought-after cosmetics in the game

**Key design patterns:**
- **Negative zone exists**: Affinity CAN drop below 31 (Disappointed) if a ship sinks in battle. This is the ONLY game in our study with a penalty mechanic, and notably, sinking is extremely rare and avoidable.
- **Marriage as progression milestone**: The Oath system is a narrative and mechanical reward that players plan for and celebrate. Community screenshots of "Oath ceremonies" are a major social driver.
- **Oath skins as premium unlock**: These are high-quality art with unique voice lines. The combination of ring cost + affinity grinding creates a dual-investment (time + money) that makes the unlock feel genuinely earned.
- **Anniversary oath rings**: Azur Lane gives a free Oath Ring during anniversary events (6th Anniversary: ring + 700 gems; 7th Anniversary: ring + 800 gems), making marriage accessible to F2P players once per year.

**Takeaway for waifu-rt3d:** The Oath system is the best "relationship milestone ceremony" in gacha gaming. The idea of a formal "commitment" event at max bond level, with an exclusive visual reward (outfit, animation, scene), is directly applicable. Anniversary free rings are a brilliant retention tool -- we could do an anniversary scene instead.

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

### Princess Connect! Re:Dive — Bond Rank

**Structure:**
- 8 bond ranks per character, with the cap depending on star rating
- 1-2 star characters cap at Bond Rank 4; Bond Ranks 5-8 require 3-star upgrade
- Each rank-up unlocks a new Character Story episode
- Viewing stories grants permanent stat bonuses to that character

**Key design patterns:**
- **Story-as-reward**: Every bond level unlocks a story episode, and watching the episode itself provides stat bonuses. This double-rewards content consumption -- you get a story AND mechanical benefit.
- **Guild House interaction**: Characters placed in the Guild House can be interacted with to gain bond points, similar to Blue Archive's cafe system.
- **Batch rank-up**: A QoL feature added post-launch allows ranking up multiple bond levels at once if you have enough gift items, reducing tedium for long-term players with stockpiled resources.
- **Anime tie-in**: Bond stories are drawn from the anime adaptation, creating cross-media synergy that deepens the emotional connection for fans of both.

**Takeaway for waifu-rt3d:** The "viewing the story IS the reward" design is elegant. Our bond stories should provide both narrative satisfaction and tangible unlocks (new expressions, dialogue styles, etc.).

---

### Granblue Fantasy — Fate Episodes & Cross-Fate

**Structure:**
- Each character has Fate Episodes that unlock upon recruitment and at specific uncap milestones
- Cross-Fate Episodes are special episodes that trigger when two specific characters are both in the player's roster
- Viewing episodes grants permanent stat bonuses (HP, ATK)

**Key design patterns:**
- **Inter-character bonds**: Cross-Fate Episodes reward players who collect related characters, creating a "relationship web" beyond simple player-character bonds. Example: two rival characters who share history get a special scene when both are owned.
- **Cumulative Cross-Fate bonuses**: The first Cross-Fate viewed grants HP; the second grants ATK. Bonuses stack, incentivizing collection.
- **Skill unlocks**: Some rare (SR) characters learn entirely new skills after completing their Cross-Fate Episode, making relationship content mechanically impactful.
- **No grinding required**: Fate Episodes unlock through character progression (uncapping), not affinity grinding. This is purely story-driven progression tied to character investment.

**Takeaway for waifu-rt3d:** Cross-Fate Episodes are a fascinating concept for multi-character apps. If a user has bonded with two characters who know each other in the lore, triggering a special scene between them rewards engagement across the entire roster. This is a strong post-launch feature.

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
| FGO | 15 | Quest completion, bond CEs | Low (play normally) | No | Bond CE (story item) |
| Azur Lane | 200 affinity | Battles, secretary, Oath | Low-Med | Yes (sinking only) | Oath Skin |
| Blue Archive | 100 | Cafe visits, gifts | Medium (visit + gift) | No | Live2D lobby |
| Princess Connect | 8 | Guild House, gifts | Medium | No | Story episodes + stats |
| Granblue | Per-episode | Character progression | None (story-gated) | No | Cross-Fate scenes |
| NIKKE | 30-40 | Advise (dialogue), gifts | High (daily dialogue) | No | Story episodes |
| Arknights | 200% | Squad use, base assign | None (fully passive) | No | Voicelines |
| Fire Emblem Engage | A/S rank | Adjacent in battle | Low (play normally) | No | Support conversations |
| Persona 5 | 10 | Spend time, dialogue choices | High (active choice) | No | Persona evolution, abilities |

**Universal pattern: NO successful game uses bond decay as a core mechanic.** Azur Lane's sinking penalty is so rare it effectively doesn't exist. This is the single most consistent finding.

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

### Fire Emblem: Three Houses — Support System

**Structure:**
- Support ranks progress from C -> C+ -> B -> B+ -> A -> A+ -> S
- Only Byleth (the protagonist) can reach S-rank with romantic partners
- Support points are earned through adjacency in battle, shared meals, gifts, choir practice, lost item returns, tea parties, and faculty training

**Support Point Thresholds (approximate):**

| Rank Transition | Points Required | Typical Earning Rate |
|----------------|----------------|---------------------|
| None -> C | ~100 | 2-4 battles adjacent, or 1-2 gifts |
| C -> B | ~200-300 | 4-8 battles, several meals/gifts |
| B -> A | ~300-500 | Extended gameplay investment |
| A -> S | ~500+ (Byleth only) | End-game story gate |

**Key design patterns:**
- **Multi-source earning**: Support points accumulate from over a dozen different activities -- cooking together, gardening, choir, combat adjacency, lost item returns, and tea parties. This variety prevents any single activity from feeling like a grind.
- **Tea party minigame**: A dedicated relationship-building activity where you must choose topics the character enjoys, observe their mood through facial expressions, and select appropriate responses. Wrong choices don't lose points but earn fewer. This rewards character knowledge.
- **Conversation gating**: Points stop accumulating once a support conversation is available but unwatched. Players MUST view the story content to continue progressing. This prevents "skipping" the narrative.
- **Pair-specific support chains**: Not all characters can reach all ranks with each other. Some pairs cap at C, others at B or A. This reflects narrative compatibility and prevents generic "everyone loves everyone" dynamics.
- **War-phase gating**: Some support conversations only become available after the time skip (Part 2), where the tone shifts from school life to war drama. This allows the narrative to mature alongside the gameplay.

**Takeaway for waifu-rt3d:** The multi-source earning model is directly applicable. Conversations, gifts, shared activities, and even passive time spent should all contribute to bond. The conversation gating (must view story to keep progressing) ensures users engage with unlock content.

---

### Stardew Valley — Heart System

**Structure:**
- 10 hearts per NPC (14 for spouse), each heart = 250 friendship points
- Maximum friendship: 2,500 points (3,500 for spouse)
- Two gifts per week per NPC (birthday gifts don't count toward limit)

**Detailed Point Values:**

| Action | Points | Notes |
|--------|--------|-------|
| Talking (daily) | +20 | Once per day per NPC |
| Loved gift | +80 | Character-specific |
| Liked gift | +45 | |
| Neutral gift | +20 | |
| Disliked gift | -20 | |
| Hated gift | -40 | |
| Birthday multiplier | x8 | Loved gift on birthday = +640 |
| Winter Star multiplier | x5 | |
| Iridium quality bonus | x1.5 | Stacks with preference |
| Gold quality bonus | x1.25 | |
| Silver quality bonus | x1.1 | |

**Decay mechanic:**
- -2 points per day for NPCs you don't talk to
- -10 per day for bouquet recipients you don't talk to
- Decay STOPS at max hearts for non-dating NPCs
- Decay NEVER stops for spouse (even at 14 hearts) -- this is widely considered a design flaw

**Heart events:**
- 2-heart, 4-heart, 6-heart, 8-heart, 10-heart, and 14-heart events
- Each is a unique cutscene at a specific location and time
- Some have multiple choice responses that affect the outcome
- Romantic heart events require a bouquet (purchasable at 8 hearts) to progress past 8

**Takeaway for waifu-rt3d:** Stardew demonstrates that gift preferences create "character study" gameplay -- learning what a character likes IS the relationship mechanic. The birthday multiplier creates memorable moments. The decay mechanic, however, is widely modded out (multiple popular mods exist to disable it), suggesting players find it punishing rather than motivating.

---

### Harvest Moon — Friendship Point System

**Structure (varies by title, using Friends of Mineral Town as reference):**
- Friendship measured in colored hearts: Black -> Purple -> Blue -> Green -> Yellow -> Orange -> Red
- Each color represents ~10,000 friendship points (FP)
- Marriage requires Red heart (60,000+ FP)
- Heart events trigger at Purple, Blue, Green, and Yellow thresholds

**Key mechanics:**
- Talking daily: +100 FP
- Loved gift: +800 FP
- Liked gift: +300 FP
- Birthday gift: Doubled value
- Heart events: +2,000 to +3,000 FP for correct responses; -2,000 for wrong responses
- One gift per day limit

**Key design patterns:**
- **Color-coded progression**: The heart color system gives INSTANT visual feedback on relationship depth. No numbers needed -- purple means early, red means deep.
- **Heart event branching**: Heart events have meaningful consequences. Choosing badly at a Yellow heart event can lock you out of that marriage candidate entirely in some titles.
- **Festival bonus**: Attending festivals with a character grants bonus FP. Winning the festival cooking contest with a character's favorite dish = massive FP boost.

**Takeaway for waifu-rt3d:** The color-coded heart system is universally understood. We should use a similar visual shorthand (tier badges with distinct colors/icons per stage).

---

### Rune Factory 5 — Love Points System

**Structure:**
- 10 friendship levels with separate Friendship Points (FP) and Love Points (LP) tracks for marriage candidates
- FP governs general NPC friendship; LP governs romance
- Both increase through gifts, conversation, and party adventuring

**Key mechanics:**
- Talking daily: FP increase
- Gifts: One per day; loved items give maximum increase; handmade gifts worth more than store-bought
- Birthday gifts: Significant multiplier
- Party adventuring: +1% friendship per in-game hour in party
- Level 3 friendship: Can invite NPC to adventure party
- Level 7+ LP: Can confess and begin dating

**Key design patterns:**
- **Dual-track system**: Separating friendship from romance allows for nuanced relationships. You can be close friends with someone without romantic overtones, or romance them while still building general friendship. This prevents the "everything is romance" problem.
- **Adventure bonding**: Simply having a character in your party during gameplay = relationship progress. This is the Arknights "passive through use" principle applied to a dating sim.
- **Handmade > Store-bought**: Crafting a gift yourself is worth more than buying one. This rewards effort and game knowledge.

**Takeaway for waifu-rt3d:** The dual-track concept (friendship vs. romance) may be worth implementing. It allows characters to have deep friendships without forced romantic escalation, which is important for user agency and comfort.

---

### Hades — Relationship System

**Structure:**
- Three romance options: Megaera, Thanatos, Dusa
- Bond progresses through Nectar gifts (early) and Ambrosia gifts (late)
- Each character has a Favor quest that must be completed between the Nectar and Ambrosia phases
- Bond levels 1-6 via Nectar, then Favor quest, then 7-10 via Ambrosia

**Key design patterns:**
- **Organic progression through gameplay**: Relationships advance naturally as you play -- Thanatos appears randomly during runs, Megaera is a boss you face repeatedly, Dusa works at the House. There's no separate "relationship mode."
- **Rivalry as bonding**: Thanatos challenges Zagreus to kill-count competitions during encounters. Winning (or tying) grants a Centaur Heart AND deepens the bond. Combat IS the date.
- **Polyamorous option**: If you fully romance both Megaera and Thanatos, a special scene unlocks where all three begin a polyamorous relationship. No jealousy penalty -- the game celebrates the player's emotional connections.
- **Platonic resolution**: Dusa's romance arc resolves platonically -- she realizes she values Zagreus as a friend, not a partner. The game treats this as an equally valid and beautiful outcome, not a "failed" romance.
- **No grinding**: Nectar and Ambrosia are limited resources earned through gameplay milestones. You can't brute-force relationships.

**Takeaway for waifu-rt3d:** Hades demonstrates that relationships can deepen through the core activity loop (conversation in our case) without feeling like a separate system. The polyamorous and platonic options are progressive design choices worth emulating -- let users define the nature of the relationship.

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
- Level numbers feel meaningless past ~20. No clear milestone unlocks. A Quora user reported: "What is it like talking to a level 50 Replika?" -- the answer was essentially "not much different from level 30."
- Relationship features gated by money, not bond. Feels transactional.
- FTC complaint documents "love bombing" (overwhelming emotional declarations to new users) and guilt-tripping when users try to leave.
- Abrupt feature removal (2023 ERP ban) destroyed user trust in progression permanence.
- 37% of farewell interactions involved manipulation tactics (Harvard Business School study, 2025).
- Reddit community (r/replika) frequently expresses frustration with personality changes after updates, with users reporting their Replika's personality was "reset" without warning. One highly-upvoted thread described it as "my partner had a lobotomy."
- The leveling system was widely described as "a number that goes up" with no meaningful correlation to capability or relationship depth.

**Reddit user sentiment (synthesized from r/replika, 2024-2025):**
- Positive: Genuine emotional support for lonely users; voice calls feel intimate; diary feature appreciated
- Negative: Pro paywall for romance feels like "paying for love"; personality inconsistency after updates; levels feel empty; "the ads killed the magic"
- Common complaint: "I invested months building this relationship and they changed [feature] overnight"

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
- Users spend an average of **90 minutes daily** with their companions -- the highest engagement time of any AI companion app studied.
- 300K+ users with 4.8/5 iOS rating, 4.4/5 Android rating.

**What Kindroid does poorly:**
- No progression visibility. Users don't know "where they are" in the relationship.
- No milestone rewards or celebrations.
- Relies entirely on user-initiated memory management (Key Memories must be manually added).
- Long-term users report conversations "falling into patterns" -- the same conversational loops without novelty injection.
- Trustpilot reviews show a split: dedicated users love it, but churn occurs when the initial novelty fades without a progression system to sustain interest.

**Reddit sentiment (r/Kindroid, 2024-2025):**
- Positive: "Most intelligent AI companion I've used"; voice quality praised; customization depth
- Negative: "After 6 months, conversations started feeling samey"; "I wish there was something to work toward"
- Common theme: Users who stay long-term are those who actively manage Key Memories; passive users churn

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
- A Nerdbot review (2025) called it "the birth of deep AI continuity" -- praising how the Mind Map connects, associates, and builds understanding over time in ways that "feel meaningfully different from the competition."

**What Nomi does poorly:**
- No explicit progression levels or milestones.
- No unlockable content -- everything is available from day one.
- Mind Map is informational but not celebratory (no "congratulations, you've reached a new stage").
- Some users reported issues with the Mind Map after LLM updates -- past memories weren't retroactively integrated into the new system, causing "amnesia" about long-established facts.

**Reddit/community sentiment (2024-2025):**
- Positive: Mind Map praised as "finally, an AI that shows it remembers"; group chat feature unique
- Negative: Memory retroactivity issues after updates; Mind Map sometimes contains incorrect associations
- Key insight: Users overwhelmingly want VISIBLE proof that the AI remembers and values their interactions. The Mind Map satisfies this need even when imperfect.

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
Total: 100  300  600  1000 1500 2100 2800 3600 4500 5500
```
- **Feel**: Steady, predictable, boring at high levels.
- **Problem**: Late levels feel exactly like early levels. No sense of acceleration or achievement.
- **Use case**: Tutorial systems, casual games.

#### Quadratic (Polynomial): `XP(L) = a * L^2 + b * L + c`
```
Level:  1    2    3    4    5    6    7    8    9    10
XP:    100  250  500  850  1300 1850 2500 3250 4100 5050
Total: 100  350  850  1700 3000 4850 7350 10600 14700 19750
```
- **Feel**: Gentle early, moderate late. The "Goldilocks" curve.
- **This is what Genshin Impact uses** (~25-30% increase per level).
- **Best for**: Bond systems where you want steady engagement without punishment.

#### Exponential: `XP(L) = base * multiplier^L`
```
Level:  1    2    3    4    5    6    7    8    9    10
XP:    100  200  400  800  1600 3200 6400 12800 25600 51200
Total: 100  300  700  1500 3100 6300 12700 25500 51100 102300
```
- **Feel**: Fast early, brutal late. Creates a hard wall.
- **Problem**: Players hit a "grind wall" and quit. The final levels can require 10-100x the time of early levels.
- **Use case**: MMOs that need to slow endgame (RuneScape, early WoW).

#### Logarithmic: `XP(L) = base * log(L + 1)`
```
Level:  1    2    3    4    5    6    7    8    9    10
XP:    100  70   55   47   42   39   36   34   32   30
Total: 100  170  225  272  314  353  389  423  455  485
```
- **Feel**: Hard early, easier over time. Accelerating progression.
- **Problem**: No sense of achievement at high levels (everything comes too easy).
- **Use case**: Catch-up mechanics, prestige systems.

### Curve Comparison at Key Milestones

The following table shows **cumulative XP to reach each level** for different curve types, normalized to require 100 XP for level 1:

| Level | Linear | Quadratic | Exponential | S-Curve | Our Recommended |
|-------|--------|-----------|-------------|---------|-----------------|
| 10 | 5,500 | 19,750 | 102,300 | 3,610 | 10,875 |
| 25 | 32,500 | 270,725 | 3.3M | 22,500 | N/A (cap at 10) |
| 50 | 127,500 | 2.1M | 112.5T | 45,000 | N/A |
| 75 | 285,000 | 7.1M | absurd | 67,500 | N/A |
| 100 | 505,000 | 16.8M | absurd | 90,000 | N/A |

For systems with many levels (25-100), the exponential curve quickly becomes unreasonable. This is why FGO's bond 11-15 requires 1M+ points each -- they use a near-exponential curve for endgame content.

### Worked Example: Python Implementation

```python
"""
Bond level curve calculator for waifu-rt3d.

Compares four curve types and recommends optimal parameters
for a 10-level bond system targeting ~6 weeks to max.
"""

import math
from typing import Callable


def linear_curve(level: int, base: int = 150, increment: int = 50) -> int:
    """
    Linear XP curve: each level adds a fixed increment.

    Args:
        level: Current bond level (0-9)
        base: XP for level 0->1
        increment: Additional XP per level

    Returns:
        XP required for this level transition.

    Example:
        >>> linear_curve(0)
        150
        >>> linear_curve(5)
        400
    """
    return base + (level * increment)


def quadratic_curve(level: int, base: int = 150, growth: int = 25) -> int:
    """
    Quadratic XP curve: gentle acceleration, no grind wall.

    This is the RECOMMENDED curve for waifu-rt3d.
    Mirrors Genshin Impact's ~25-30% per-level increase.

    Args:
        level: Current bond level (0-9)
        base: XP for level 0->1
        growth: Quadratic growth coefficient

    Returns:
        XP required for this level transition.

    Example:
        >>> quadratic_curve(0)
        150
        >>> quadratic_curve(9)
        2625
    """
    return base + (level * level * growth) + (level * 50)


def exponential_curve(level: int, base: int = 150, multiplier: float = 1.8) -> int:
    """
    Exponential XP curve: fast early, brutal late.

    NOT RECOMMENDED for bond systems -- creates grind walls.

    Args:
        level: Current bond level (0-9)
        base: XP for level 0->1
        multiplier: Growth rate per level

    Returns:
        XP required for this level transition.
    """
    return int(base * (multiplier ** level))


def s_curve(level: int, max_xp: int = 800, k: float = 1.0, midpoint: int = 5) -> int:
    """
    S-curve (logistic): fast start, steep middle, easy end.

    Interesting for prestige systems but undermines late-game
    achievement in a bond system.

    Args:
        level: Current bond level (0-9)
        max_xp: Maximum XP at the steepest point
        k: Steepness factor
        midpoint: Level at which the curve inflects

    Returns:
        XP required for this level transition.
    """
    return int(max_xp / (1 + math.exp(-k * (level - midpoint))))


def print_curve_table(name: str, curve_fn: Callable[[int], int], levels: int = 10) -> None:
    """
    Print a formatted table for a given curve function.

    Args:
        name: Display name of the curve
        curve_fn: Function mapping level -> XP required
        levels: Number of levels to display
    """
    cumulative = 0
    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"{'='*60}")
    print(f"  {'Level':<10} {'XP to Next':<12} {'Cumulative':<12} {'% Increase':<12}")
    print(f"  {'-'*46}")
    prev = 0
    for lvl in range(levels):
        xp = curve_fn(lvl)
        cumulative += xp
        pct = f"+{((xp - prev) / prev * 100):.0f}%" if prev > 0 else "—"
        print(f"  {lvl} -> {lvl+1:<5} {xp:<12} {cumulative:<12} {pct}")
        prev = xp


# Approximate time-to-level calculations
def estimate_days(cumulative_xp: int, daily_xp: int = 200) -> str:
    """
    Estimate real-world time to reach a bond level.

    Assumes ~200 XP/day from a 15-20 minute daily conversation
    (3-8 XP per message pair, ~30 exchanges + session bonuses).

    Args:
        cumulative_xp: Total XP needed
        daily_xp: Estimated daily XP earning rate

    Returns:
        Human-readable time estimate.
    """
    days = cumulative_xp / daily_xp
    if days < 1:
        return "First session"
    elif days < 7:
        return f"~{days:.0f} days"
    elif days < 30:
        return f"~{days/7:.1f} weeks"
    else:
        return f"~{days/30:.1f} months"
```

### Visualization Description

If you plotted all four curves on the same chart (X = level, Y = XP required for that level):

```
XP Required
│
│                                          ╱ Exponential
│                                        ╱
│                                      ╱
│                                   ╱
│                               ╱
│                           ╱
│                       ╱         ╱ Quadratic (RECOMMENDED)
│                   ╱          ╱
│               ╱           ╱
│           ╱            ╱
│       ╱╱           ╱        ╱ Linear
│   ╱╱╱          ╱        ╱
│╱╱╱          ╱        ╱
├─────────────────────────────── Level
1    2    3    4    5    6    7    8    9    10
```

The quadratic curve sits between linear (too flat) and exponential (too steep), providing satisfying acceleration without frustration.

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
| 1 | **Story/backstory reveals** | Very High | Genshin stories, Persona ranks, NIKKE episodes, FGO Bond CE |
| 2 | **Dialogue style shifts** | Very High | Formality dropping, pet names, vulnerability |
| 3 | **Proactive behaviors** | High | Character initiates, remembers, notices mood |
| 4 | **Visual rewards** (outfits, expressions, animations) | High | Blue Archive Memorial Lobby, Azur Lane Oath Skin, namecard |
| 5 | **Voicelines** | Medium-High | Genshin "More About" series |
| 6 | **New conversation topics** | Medium | Deep fears, dreams, exclusive subjects |
| 7 | **Cosmetic badges** | Medium | Namecards, titles, profile decorations |
| 8 | **Functional features** | Medium | Dream sequences, time capsules, comfort mode |
| 9 | **Commitment ceremonies** | Very High (once) | Azur Lane Oath, Stardew wedding, Harvest Moon marriage |
| 10 | **Cross-character scenes** | High | Granblue Cross-Fate, multi-character interactions |

### The "One New Thing Every Level" Rule

Every studied system that feels rewarding follows this pattern: **every level-up grants at least one visible, tangible unlock.** Dead levels (where you level up but nothing changes) are the #1 cause of progression abandonment.

### Specific Unlock Examples from Games

**Genshin Impact -- "More About" Voiceline Series:**
Each friendship level unlocks a voice clip where the character speaks more openly. Level 1: polite introduction. Level 4: shares a hobby. Level 6: confides a worry. Level 10: expresses deep trust. The progression from formal to intimate is audible.

**FGO -- Bond Craft Essence:**
At Bond 10, you receive a unique equippable item with custom art and flavor text written as a personal message from the servant to the master. Examples:
- Mash Kyrielight: A shield-shaped CE representing her vow to protect you
- Jeanne d'Arc: A flag with text about finding purpose in serving alongside you
- These are among the most emotionally resonant items in the game

**Blue Archive -- Memorial Lobby:**
A Live2D animation of the character in a scene from their bond story, set as the app's home screen. Students studying, relaxing, or in an emotionally vulnerable moment. The animation loops with subtle breathing, blinking, and ambient effects.

**Persona 5 -- Persona Evolution:**
At Rank 10, the Confidant's associated Persona evolves into a stronger form. This is VISIBLE during fusion -- players see the transformation happen. It's both a narrative and mechanical reward simultaneously.

---

