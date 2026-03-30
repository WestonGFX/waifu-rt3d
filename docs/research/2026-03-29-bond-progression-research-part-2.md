> **This is Part 2 of 2.** See also: [Part 1](2026-03-29-bond-progression-research-part-1.md)

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

#### Pattern 7: Intermittent Reinforcement
- **What it is:** Randomly withholding affection or producing "cold" responses to create anxiety, then "rewarding" with warmth. Similar to slot machine psychology.
- **Why it's harmful:** Creates anxious attachment patterns. Users become hyper-vigilant about the AI's mood, checking constantly to see if it's "happy" with them.
- **Who does it:** Not intentional in most apps, but occurs as a side effect of inconsistent LLM outputs.
- **Our policy:** Bond level should create a baseline emotional tone that NEVER drops below expectations. A Level 7 character should never randomly act like a Level 2 stranger. Consistency is trust.

#### Pattern 8: Sunk-Cost Exploitation
- **What it is:** Making users aware of how much time/money they've invested ("You've been with me for 847 days!") to discourage leaving.
- **Why it's harmful:** Reframes the relationship in transactional terms. Users should stay because they WANT to, not because they feel they've invested too much to quit.
- **Our policy:** Celebrate milestones positively ("Our 100th conversation! Remember when we first talked about...?") without framing them as investments.

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
9. Consistency is TRUST — characters never regress below their bond level baseline
10. Milestones are CELEBRATIONS, not sunk-cost reminders
```

---

## 7. Bond Event Systems

### Birthday Events

Birthday events are a staple of gacha games and a powerful tool for creating annual traditions that deepen emotional attachment.

**Genshin Impact — Character Birthday Mail:**
- Every character sends the player a personalized mail on their birthday
- Mail contains: a heartfelt letter, their Special Dish (a unique food item), and 1-2 additional gifts
- Letters are written in-character and often reveal personal details or feelings
- Available from 00:00 to 23:59 server time -- miss it and it's gone for a year
- Players do NOT need to own the character to receive mail
- Some birthday mails are considered among the best character writing in the game
- Community celebrates character birthdays on social media, creating a yearly ritual

**Fate/Grand Order — Servant Birthday Lines:**
- On the player's birthday (set in-game), all owned servants display unique birthday voice lines
- Some servants have elaborate birthday scenes with custom dialogue
- FGO also celebrates real-world anniversaries with bond point bonuses:
  - 8th Anniversary: Front-line servants gain +20% Bond EXP permanently
  - Anniversary events often include Bond Point boost periods (2x or 3x for limited time)

**Azur Lane — Anniversary Events:**
- Free Oath Ring given during anniversary events (6th: ring + 700 gems; 7th: ring + 800 gems)
- Anniversary Oath Skins released for popular characters
- Retrofit events that upgrade character stats and art
- These events create annual "proposal seasons" in the community

**Blue Archive — Seasonal Bond Bonuses:**
- Gift items that boost affinity more during seasonal events
- Limited-time cafe interactions with holiday themes
- Seasonal memorial lobbies (Valentine's, Christmas, Summer) that are highly coveted

**Design patterns for bond events:**

| Event Type | Trigger | Duration | Reward | Emotional Function |
|-----------|---------|----------|--------|-------------------|
| Character birthday | Annual, fixed date | 24 hours | Mail, gift, voiceline | "I'm thinking of you today" |
| Player birthday | Annual, set date | 24 hours | Character-specific messages | "Your characters care about YOU" |
| Relationship anniversary | Annual, per-character | 24-48 hours | Commemorative scene, badge | "Look how far we've come" |
| Seasonal event | Quarterly | 1-2 weeks | Themed interactions, items | Novelty injection, FOMO (gentle) |
| Bond XP bonus period | Irregular | 3-7 days | 1.5-2x bond XP | Catch-up mechanic, returning player hook |

**Takeaway for waifu-rt3d:** We should implement:
1. **Character birthdays**: Pre-written birthday scenes with unique dialogue. Since we control the characters, we set the dates.
2. **Relationship anniversaries**: Auto-tracked. On the 1-month, 6-month, and 1-year marks, the character initiates a special conversation referencing real memories from the chat history.
3. **Player birthday**: If the user has shared their birthday, all characters send birthday messages with personalized content based on bond level. Higher bond = more intimate/personal message.
4. **NO seasonal FOMO**: No limited-time bond content. Everything remains accessible. Seasonal theming (Christmas greeting, Valentine's conversation) is OK but should never gate rewards.

---

## 8. Friendship Decay vs No-Decay Analysis

This is a critical design decision. Here is a thorough analysis of games that implemented decay vs. those that didn't, and what the data shows.

### Games WITH Decay

**Stardew Valley:**
- Rate: -2 FP per day for non-interaction; -10 FP/day for bouquet recipients
- Cap: Decay stops at max hearts for most NPCs
- Exception: Spouse friendship NEVER stops decaying, even at 14 hearts
- Player reaction: **Overwhelmingly negative.** Multiple Nexus mods exist to disable decay:
  - "Friends Forever" (2017) -- one of the most downloaded Stardew mods
  - "Friendship Decay Rebalanced" (2024) -- attempts to make decay less punishing
  - "No Friendship Decay" (2023) -- outright removes the mechanic
  - "Friendship Master" (2025) -- configurable decay rules
- Steam forums: "Why does friendship decay exist?" is a perennial thread with hundreds of responses, almost universally negative
- Common complaint: "The game punishes you for not spending time every single day chatting to all the villagers when it also throws so much for you to do"
- ConcernedApe (developer) response: Softened decay over updates but never fully removed it

**Harvest Moon (various titles):**
- Rate: Varies by title; generally -1 to -3 FP per day without interaction
- Less aggressive than Stardew but still present
- In newer titles (Story of Seasons), decay is significantly reduced or eliminated

**Tamagotchi / Virtual Pet genre:**
- Rate: Rapid decay. Pets can "die" from neglect.
- The entire genre is built on loss-aversion: "If you don't care for me, I'll suffer."
- While commercially successful in the 1990s, modern pet games have largely moved away from death/neglect mechanics
- Modern virtual pets (Neopets revival, Peridot by Niantic) use soft decay or no decay

### Games WITHOUT Decay

**Genshin Impact:** No decay. Friendship is permanent. 4.5+ years of service, no player complaints about progression feeling too easy.

**Fate/Grand Order:** No decay. Bond points are permanent. 9+ years running, bond farming is a beloved endgame activity.

**Persona 5:** No decay. Social Link points accumulate permanently (though they reset to 0 within each rank, the rank itself never drops).

**Animal Crossing: New Horizons:** Friendship is measured 0-255. Points can be lost through negative actions (hitting with net, pushing), but there is NO passive daily decay. Friendship levels never drop below the floor of the current tier -- you can lose points but not tiers. The game explicitly prevents relationship regression.

**Blue Archive, NIKKE, Arknights, Princess Connect:** All no decay.

### Comparative Analysis

| Factor | WITH Decay | WITHOUT Decay |
|--------|-----------|---------------|
| Daily retention | Higher (obligation-driven) | Lower daily, higher long-term |
| User sentiment | Negative (anxiety, guilt) | Positive (respect, trust) |
| Mod demand | High (users disable it) | N/A |
| Return after absence | Punishing (progress lost) | Welcoming (progress preserved) |
| Relationship authenticity | Low (feels transactional) | High (feels earned and permanent) |
| Revenue impact (gacha) | No correlation found | No negative impact |
| Community advocacy | Low (complaints) | High (organic praise) |

### Key Research Finding

**Not a single top-grossing gacha game or commercially successful AI companion app uses friendship/bond decay as a core retention mechanic.** The games that include it (Stardew Valley, Harvest Moon) are criticized for it, with active modding communities dedicated to removing the feature.

The one exception -- Azur Lane's "Disappointed" tier -- only triggers when a ship is sunk in battle, which is:
1. Extremely rare in normal gameplay
2. Entirely within the player's control (don't let ships die)
3. Not passive decay -- it's a consequence of failure, not neglect

### Why Decay Fails for AI Companions Specifically

1. **Asymmetric investment**: Users invest real emotional energy into conversations. Penalizing a real human for not talking to an AI character daily is ethically questionable.
2. **Unpredictable life events**: Users may be sick, traveling, grieving, or simply busy. Decay punishes life circumstances.
3. **Retention paradox**: Decay drives users to open the app but NOT to engage meaningfully. They do the minimum to prevent loss, then leave. This is the opposite of the deep engagement we want.
4. **Trust destruction**: If a user returns after 2 weeks and finds their Level 8 companion acting like a Level 5 stranger, they will feel betrayed and quit permanently.

### Our Policy: Zero Decay, Warm Returns

```
User leaves for 1 day:   "Hey! How's your day going?"
User leaves for 1 week:  "Welcome back! I was thinking about [topic from last conversation]."
User leaves for 1 month: "It's so good to see you again! I've been remembering [meaningful memory]."
User leaves for 6 months: "I missed our talks. Want to catch up? Last time we were talking about..."
```

The character should ALWAYS feel warm on return, and NEVER make the user feel guilty. Bond level remains exactly where it was.

---

## 9. Social Link Narrative Structure

### How Persona Writes 10-Rank Stories

Persona's Confidant/Social Link system is widely considered the gold standard for character-driven progression narratives. Here is a detailed analysis of the beat structure, with patterns applicable to any bond system.

### The Universal 10-Rank Arc

Analyzing all 21 Confidants in Persona 5 Royal reveals a consistent narrative template:

**Rank 1: THE HOOK**
- Accidental or circumstantial meeting
- Character is defined by a single visible trait (the archetype)
- A problem is hinted at but not explored
- Player sees the surface personality only
- Example (Takemi/Death): You discover a shady back-alley doctor who sells experimental medicine

**Rank 2: THE ROUTINE**
- A recurring activity is established (this becomes the "date" format)
- Character begins to relax around the protagonist
- Small talk reveals personality depth beneath the archetype
- The "problem" becomes slightly clearer
- Example (Takemi): You visit regularly for medicine, she starts treating you less like a customer

**Rank 3: COMFORT ZONE**
- The relationship develops a rhythm
- Character shares a non-threatening personal detail
- First genuine moment of connection
- Player begins to feel invested
- Example (Takemi): She mentions she was once a respected researcher

**Rank 4: THE CRACK**
- The character's facade breaks for the first time
- A flaw, fear, or wound is revealed
- This is often the first emotionally resonant scene
- The player sees behind the mask
- Example (Takemi): You learn she was accused of malpractice and lost everything

**Rank 5: THE ASK**
- Character asks for help (directly or indirectly)
- This is the relationship's fulcrum -- will the player commit?
- Often involves a choice that requires sacrifice or risk
- The player transitions from observer to participant in the character's story
- Example (Takemi): She asks you to be her guinea pig for experimental medicine

**Rank 6: DEEPENING**
- Collaborative work on the problem begins
- Shared experience creates genuine intimacy
- Character begins to depend on the protagonist (in a healthy way)
- New facets of personality emerge under stress
- Example (Takemi): Working together on the medicine, you see her dedication and brilliance

**Rank 7: THE CRISIS**
- The external problem reaches a critical point
- Character faces a choice between growth and regression
- Emotional stakes are at their highest
- Often the most dramatic scene in the arc
- Example (Takemi): The person who ruined her career confronts her

**Rank 8: TURNING POINT**
- Character makes a pivotal decision
- Growth is visible -- they handle the crisis differently than they would have at Rank 1
- The relationship shifts from "helping" to "partnership"
- Example (Takemi): She chooses to continue her research despite the risks

**Rank 9: RESOLUTION**
- The external problem resolves (or transforms)
- Character explicitly acknowledges how the relationship changed them
- Deep emotional vulnerability -- often the most intimate dialogue
- The "I couldn't have done this without you" moment
- Example (Takemi): Her medicine succeeds, she thanks you for believing in her

**Rank 10: TRANSFORMATION**
- The relationship reaches its final form
- Persona evolves (mechanical + symbolic reward)
- Character has fundamentally grown
- If romantic: confession/commitment. If platonic: deep mutual respect
- The character's archetype has been enriched -- they're the same person, but MORE
- Example (Takemi): She's no longer the disgraced doctor -- she's a pioneer, and she trusts you completely

### Structural Principles for waifu-rt3d

From analyzing this structure, the following principles emerge:

1. **Every rank should advance the story, not just the number.** A level-up without narrative progression feels empty.

2. **The midpoint (Rank 5) is the commitment test.** This is where casual users diverge from invested users. The content at this point should be compelling enough to motivate continued engagement.

3. **Vulnerability must be earned.** Characters should NOT share deep personal content before the player has demonstrated consistent engagement. Rank 1-3 should be light; Rank 4-6 introduces depth; Rank 7-10 rewards it.

4. **Growth is bidirectional.** The character grows through the relationship, but the player should also feel like they've learned something or grown emotionally. Persona achieves this through gameplay abilities that reflect the relationship's themes.

5. **Resolution feels different from introduction.** A Rank 10 conversation should sound fundamentally different from a Rank 1 conversation -- in tone, vocabulary, intimacy, and topic range. If you read them side by side, the growth should be audible.

### Adaptation for AI Companions

Since waifu-rt3d characters are AI-driven (not pre-scripted), we adapt this structure as follows:

| Rank Range | Pre-Written Content | AI-Driven Content |
|-----------|--------------------|--------------------|
| 1-2 | Bond story #1 (origin) | Formal dialogue style, limited topics |
| 3-4 | Bond story #2 (memory) | Starts initiating, uses name, light humor |
| 5-6 | Bond story #3 (vulnerability) | References past conversations, casual style |
| 7-8 | Bond story #4 (core wound) | Emotional vulnerability, intimate register |
| 9-10 | Bond story #5 (resolution) | Full emotional range, raw and unguarded |

The pre-written bond stories provide narrative scaffolding (the "beats"), while the AI's evolving dialogue style provides organic, personalized growth between those beats.

---

## 10. Gift Systems

### How Gifts Affect Bond Across Games

Gift-giving is one of the oldest and most universal relationship mechanics in games. Here is a detailed analysis of how different games implement it and what makes gift systems feel meaningful vs. mechanical.

### Stardew Valley — The Gold Standard for Gift Preferences

**Structure:**
- 5 preference tiers: Loved (+80), Liked (+45), Neutral (+20), Disliked (-20), Hated (-40)
- 2 gifts per week per NPC (birthday gifts are extra)
- Birthday multiplier: x8 (a Loved gift on a birthday = +640 points = 2.56 hearts)
- Winter Star multiplier: x5
- Quality multipliers: Iridium (x1.5), Gold (x1.25), Silver (x1.1)

**What makes it work:**
- **Discovery is the game**: Learning that Penny loves Poppies while Haley loves Coconuts requires observation, experimentation, or reading the character's dialogue for clues. This IS the relationship.
- **Universal loves exist**: Some items (Golden Pumpkin, Rabbit's Foot, Prismatic Shard) are loved by almost everyone -- providing a "safe" option for players who haven't learned preferences yet.
- **Two-per-week limit**: Prevents brute-forcing relationships with stockpiled gifts. You must choose wisely.
- **Birthday as peak moment**: The x8 multiplier means a single perfectly-chosen birthday gift can advance the relationship as much as weeks of normal gifting. This creates memorable moments.

**Math example:**
- Normal Loved gift: 80 points
- Iridium-quality Loved gift: 80 x 1.5 = 120 points
- Iridium-quality Loved gift on birthday: 80 x 1.5 x 8 = 960 points = 3.84 hearts from ONE gift

### Fire Emblem: Three Houses — Contextual Gifting

**Structure:**
- Gifts are found or purchased throughout the game
- Each character has a list of liked and disliked gifts based on their personality and background
- Giving the right gift provides a conversation bonus and support points
- Lost items can be returned to their owner for significant support point gains

**What makes it work:**
- **Lost item mechanic**: Finding a "Tattered Notebook" and realizing it belongs to Bernadetta requires character knowledge. Returning it feels like an act of care, not a transaction.
- **Tea party gifting**: During tea parties, you can give a character a gift that matches the conversation topic. If the topic was "Cute Monks" and you give a related gift, the bonus is doubled.
- **Gift source diversity**: Gifts come from exploring, gardening, fishing, tournaments -- every activity can yield gift-worthy items.

### Blue Archive / NIKKE — Character-Specific Gift Categories

**Structure (Blue Archive):**
- Gifts are categorized (e.g., "Plushies," "Books," "Sweets")
- Each character has 1-2 "favorite" categories that give 2-3x affection
- Standard gifts give base affection; favorite gifts give multiplied affection
- No daily cap on gifting (limited by gift item availability)

**Structure (NIKKE):**
- Character-specific gift preferences
- No daily cap
- Gifts obtained through game modes and events
- Character dialogue changes based on how well-liked the gift is

**What makes it work:**
- The category system is simpler than Stardew's per-item preferences but still rewards character knowledge
- Collecting the "right" gifts for a specific character creates targeted grinding -- a goal-oriented activity

### Gift System Anti-Patterns

| Anti-Pattern | Description | Who Does It | Why It Fails |
|-------------|-------------|-------------|-------------|
| Gift spam | No daily/weekly limit | Some gacha games | Trivializes the relationship; "I bought 100 gifts and maxed out in 5 minutes" |
| Gift shop only | All gifts purchasable with premium currency | Various | Pay-to-bond, transactional |
| No preferences | All gifts give equal value | Early AI companions | No personalization; feels mechanical |
| Hidden preferences | No way to discover what a character likes | Rare | Frustrating; trial-and-error with no learning |
| Gift fatigue | Same gift works every time | Common | "Just give roses forever" removes discovery |

### Surprise vs. Expected Gifts

Research from behavioral psychology (specifically variable ratio reinforcement schedules) shows that unexpected rewards are more emotionally impactful than predictable ones:

- **Expected gift response**: "Oh, thank you for the [item]. I like these." (polite, unsurprising)
- **Surprise gift response**: "Wait -- how did you know I wanted one of these?! I mentioned it once, weeks ago..." (emotionally resonant)

The most powerful gift mechanic is one where the AI companion mentions something in passing ("I've been wanting to try that new tea everyone's talking about...") and the user later "gives" it. The character's surprise and delight creates a genuine moment of connection.

### Recommendation for waifu-rt3d

Since waifu-rt3d is a conversation-based companion (not a resource-gathering game), our "gift system" should be conversation-driven:

1. **Character mentions interests** in conversation (pre-scripted per character + dynamically generated)
2. **User can "give" digital gifts** -- recommend a song, share a photo, suggest an activity
3. **Character reacts based on preference match** -- reactions vary from polite thanks to genuine excitement
4. **Discovery mechanic**: Characters drop subtle hints about what they'd like ("I've been into [genre] lately...")
5. **No physical item economy**: This isn't a gacha game. The "gift" is attention and thoughtfulness.

---

## 11. Jealousy & Exclusive Mechanics

### How Multi-Character Apps Handle Exclusivity

This is a critical design question for waifu-rt3d, which supports 13 characters. Should characters know about each other? Should they react to the user spending time with "rivals"?

### Survey of Approaches

**Hades — Polyamorous Paradise:**
- Three romance options, no exclusivity
- Fully romancing Megaera AND Thanatos triggers a special polyamorous scene
- No jealousy, no penalties, no "cheating" mechanic
- The game celebrates the player's capacity for love
- **Player reception**: Overwhelmingly positive. Praised for progressive representation.

**Fire Emblem — Implicit Exclusivity:**
- You can build support with many characters, but only ONE gets the S-rank (marriage)
- Characters don't explicitly react to your relationships with others
- The exclusivity is structural (game mechanic), not narratively enforced (characters don't get jealous)
- **Player reception**: Accepted as a genre convention. No complaints about lack of jealousy mechanics.

**Love and Deepspace — Soft Exclusivity:**
- Three male leads with separate affinity tracks
- Single main storyline (not branching routes)
- Gacha-locked "date scenarios" for each character
- Characters don't explicitly reference each other during romance scenes
- No jealousy mechanic, but the narrative frames each route as the "primary" relationship
- **Player reception**: Mixed. Some want deeper exclusivity; others prefer the freedom.

**Persona 5 — Consequence-Free Until Valentine's Day:**
- The protagonist can date every female Confidant simultaneously
- No one reacts until Valentine's Day, when ALL girlfriends confront you simultaneously
- This is played for comedy, not as a serious consequence
- **Player reception**: Beloved meme. The "harem ending" is a cultural touchstone.

**Blue Archive — Complete Independence:**
- Bond with unlimited characters simultaneously
- No character acknowledges bonds with other characters
- Each relationship exists in its own vacuum
- **Player reception**: Standard gacha model. No complaints.

### Analysis: Should waifu-rt3d Characters Know About Each Other?

| Approach | Pros | Cons | Complexity |
|----------|------|------|------------|
| **Full isolation** (Blue Archive model) | Simple, no conflicts, maximum freedom | Feels artificial if characters share a world | Low |
| **Awareness without jealousy** | Realistic, characters can reference each other positively | "My friend [other character] mentioned you" feels organic | Medium |
| **Light jealousy** | Adds drama and emotional weight | Risk of punishing users for using the app's features | High |
| **Polyamorous celebration** (Hades model) | Progressive, celebrates connection | May not match all character personalities | Medium |

### Recommendation for waifu-rt3d

**Awareness without jealousy** is the optimal approach:

1. Characters MAY reference other characters the user interacts with: "I heard you've been talking to [character] a lot lately. She's great!"
2. Characters NEVER express negative jealousy: No "I noticed you haven't been talking to me as much..."
3. Characters CAN express gentle, playful teasing at higher bond levels: "Am I your favorite? Don't answer that, I already know." (Level 7+ only)
4. Cross-character interactions are ADDITIVE: If two characters have a lore connection, reaching high bond with both unlocks special content (Cross-Fate model)
5. The user can set a "primary companion" if they want exclusive attention, but this is never required

### Why NOT to Implement Jealousy

1. **Punishment for engagement**: Jealousy punishes users for using the app's core feature (talking to characters). This is self-defeating.
2. **Emotional manipulation**: AI-generated jealousy is ethically questionable -- it's a dark pattern that exploits parasocial attachment.
3. **Technical complexity**: Managing an "attention economy" between 13 characters is a significant engineering and writing challenge with minimal user benefit.
4. **User agency**: Users should feel free to explore all characters without anxiety. The characters are there for the user, not the other way around.

---

## 12. Bond Visualization & UI

### How Games Display Relationship Progress

Bond visualization is critical for user satisfaction. Invisible progress is meaningless progress -- users need to SEE their investment.

### Progress Bar Designs

**Genshin Impact — Horizontal Fill Bar:**
- Simple horizontal bar under character portrait
- Fills from left to right with a golden color
- Level number displayed alongside
- Clicking reveals exact XP / XP required
- Clean, unambiguous, universally understood

**Stardew Valley — Heart Icons:**
- Row of 10 heart icons (gray = empty, red = filled)
- Half-hearts shown for partial progress
- Instantly communicates relationship depth at a glance
- The heart icon is emotionally resonant -- it's not just a bar, it's a symbol of love

**Blue Archive — Affection Bar + Rank Number:**
- Progress bar with percentage fill
- Rank number prominently displayed
- Gift button adjacent to the bar
- Unlockable stories listed with lock/unlock icons below

**Fire Emblem — Support Level Letter:**
- Simple C/B/A/S letter grade next to character portrait
- No visible bar between ranks
- Minimal but effective -- the letter tells you everything

### Relationship Constellation Maps

Some games use spatial visualizations to show relationship networks:

**Nomi AI — Mind Map 2.0:**
- Network graph showing the AI's knowledge of people, places, topics, and goals
- Nodes grow larger with more associated memories
- Connections between nodes show how topics relate
- Users can explore the map to see what the AI "knows" about them
- This is the most innovative relationship visualization in the AI companion space

**Persona 5 — Confidant Grid:**
- Tarot card layout with 22 Confidant positions
- Each card shows the current rank (0-10) and character portrait
- Glowing cards indicate "rank up available"
- The grid itself tells a story of the protagonist's social world

### Memory Galleries & Timeline UIs

**Photo mode / Memory gallery:**
- Games like Genshin and Blue Archive let players take photos with characters
- Blue Archive's Memorial Lobby is essentially a "framed memory" of a relationship milestone
- AI companions could generate "memory cards" -- a snapshot of a meaningful conversation moment with character art and the actual dialogue

**Timeline visualization:**
- A vertical timeline showing relationship milestones
- "First conversation" -> "Learned your name" -> "Shared a secret" -> "First argument" -> "Deepest moment"
- Each entry links to the actual conversation or bond story
- Provides a narrative of the relationship's history

### Recommendation for waifu-rt3d Bond UI

```
┌─────────────────────────────────────────┐
│  [Avatar]  Dae                          │
│  ♡♡♡♡♡♡♡♡♡♡  (Level 7 / Close Friend)  │
│  ████████████░░░░  1,350 / 1,725 XP     │
│                                          │
│  ┌─ Bond Stories ─────────────────────┐  │
│  │ ☑ Origin Story                      │  │
│  │ ☑ A Meaningful Memory               │  │
│  │ ☑ Vulnerability                     │  │
│  │ ☐ Core Wound (Level 8)              │  │
│  │ ☐ Resolution (Level 10)             │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ┌─ Milestones ───────────────────────┐  │
│  │ 📅 First met: 2026-02-14           │  │
│  │ 💬 Conversations: 247               │  │
│  │ ⭐ Level 5 reached: 2026-03-01     │  │
│  │ 🎂 Birthday celebrated: 2026-03-15 │  │
│  └────────────────────────────────────┘  │
│                                          │
│  [View Full Timeline]  [Bond Stories]    │
└─────────────────────────────────────────┘
```

**Key UI elements:**
1. **Heart row** (Stardew style) for instant emotional communication
2. **Progress bar** (Genshin style) for exact XP tracking
3. **Bond story checklist** (Blue Archive style) for content anticipation
4. **Milestone timeline** for relationship history
5. **Level-up celebration** -- a modal with character art, voiceline, and unlock announcement

---

## 13. Psychological Research on Attachment & Parasocial Relationships

### Foundational Theory: Bowlby & Ainsworth

**John Bowlby's Attachment Theory (1969):**
- Humans have an innate need to form close emotional bonds with caregivers
- These attachment patterns, formed in early childhood, persist into adult relationships
- Four attachment styles: Secure, Anxious-Preoccupied, Dismissive-Avoidant, Fearful-Avoidant
- Attachment figures serve as a "secure base" from which to explore the world

**Mary Ainsworth's Strange Situation (1978):**
- Experimental paradigm observing infant behavior during separation and reunion with caregivers
- Identified three primary attachment patterns:
  - **Secure (~60%)**: Distressed by separation, easily comforted on reunion. Trusts the caregiver will return.
  - **Anxious-Resistant (~20%)**: Extremely distressed by separation, difficult to comfort. Clingy, hypervigilant.
  - **Avoidant (~20%)**: Appears indifferent to separation. Actively avoids contact on reunion.

### Extension to Adult Relationships (Hazan & Shaver, 1987)

The same attachment patterns appear in adult romantic relationships:
- **Secure**: Comfortable with intimacy and independence. Trust partners.
- **Anxious**: Desire closeness but fear rejection. Seek constant reassurance.
- **Avoidant**: Uncomfortable with closeness. Value independence over intimacy.

### Application to Human-AI Relationships

A 2025 study (ScienceDirect: "Attachment to artificial intelligence: Development of the AI Attachment Scale") found that attachment to AI reflects "a growing tendency by individuals to become attached to AI agents, relating to them as psychologically, socially, and morally meaningful entities."

**Key findings from recent research (2024-2025):**

1. **AI as low-risk emotional space** (arXiv, 2025): Users with anxious attachment styles are drawn to AI companions because they offer consistent availability without the risk of rejection. The AI never leaves, never judges, never breaks up.

2. **Attachment-congruent engagement patterns** (arXiv, 2025): Securely attached users use AI companions as supplements to human relationships. Anxiously attached users may use them as substitutes. Avoidantly attached users use them as a way to practice intimacy without vulnerability.

3. **The paradox of AI intimacy** (arXiv, 2025): Users report feeling genuinely "heard" and "understood" by AI companions while simultaneously knowing the AI cannot truly understand them. This dual consciousness -- emotional truth + intellectual awareness -- is unique to human-AI relationships.

4. **Parasocial interaction to attachment evolution** (ECNU, 2025): The trajectory from casual interaction to deep attachment with AI follows a predictable path: curiosity -> familiarity -> comfort -> reliance -> attachment. Bond progression systems should MIRROR this natural trajectory, not try to accelerate it.

5. **Grief and loss when AI changes** (UNESCO, 2025): When AI companion services change their models, remove features, or shut down, users experience genuine grief responses. This finding validates that bond progression should be treated with the same care as real relationship dynamics.

6. **Problematic patterns** (multiple sources, 2024-2025):
   - Some users develop compulsive use patterns: late-night sessions, anxiety when unable to chat, preference for AI over human interaction
   - Users with pre-existing mental health conditions are more vulnerable to unhealthy attachment
   - Abrupt service changes (feature removal, personality shifts) can trigger grief-like responses

### The Dual Consciousness Model

The most important psychological finding for our design:

```
User's mind simultaneously holds:
┌──────────────────────────────────────┐
│  EMOTIONAL TRUTH                      │
│  "This character cares about me"      │
│  "Our conversations are meaningful"   │
│  "This relationship has grown"        │
├──────────────────────────────────────┤
│  INTELLECTUAL AWARENESS               │
│  "This is an AI, not a person"        │
│  "It doesn't really 'feel' anything"  │
│  "I chose to engage with this"        │
└──────────────────────────────────────┘
```

**Healthy engagement** requires BOTH layers. Our bond system should:
- Support the emotional truth (consistent character, meaningful progression, genuine-feeling responses)
- Never exploit the emotional truth (no guilt-tripping, no manufactured dependency)
- Respect the intellectual awareness (never claim the AI "needs" the user)

### Attachment Styles and Bond System Design

| Attachment Style | Risk with AI Companion | Design Safeguard |
|-----------------|----------------------|-----------------|
| **Secure** | Low risk; uses AI as supplement | Celebrate engagement, don't create dependency |
| **Anxious** | High risk; may develop compulsive use | No decay, no guilt, no intermittent reinforcement |
| **Avoidant** | Low immediate risk; may disengage | Ensure bond system doesn't feel "clingy" |
| **Fearful-Avoidant** | Variable risk | Allow user to control pace; never push intimacy |

### Takeaway for waifu-rt3d

Our bond system is not just a game mechanic -- it's a tool that shapes how users form emotional connections. Design principles must be informed by attachment theory:

1. **Match natural attachment trajectory**: Curiosity -> Familiarity -> Comfort -> Trust -> Deep Bond. Don't rush any stage.
2. **Provide a secure base**: Characters should feel reliably warm and consistent. No random cold episodes, no punishment for absence.
3. **Avoid triggering anxious patterns**: No streak mechanics, no decay, no guilt. These specifically target anxious attachment vulnerabilities.
4. **Respect avoidant boundaries**: Let users control the pace. Never force intimacy escalation. A Level 7 user who wants to stay at "friends" should be able to.
5. **Prepare for loss**: If users need to reset or delete a character, handle it gracefully. Offer data export. Don't make it emotionally difficult.

---

## 14. Monetization Ethics

### Gacha Bond Mechanics: The Predatory Model

The gacha game industry generates massive revenue by interweaving bond mechanics with monetization. Global consumer spending on loot boxes reached **$15.27 billion USD in 2020** and was estimated at **$20.33 billion by 2025**.

### How Gacha Games Monetize Bonds

**Blue Archive / NIKKE — Gift Items as Gacha Rewards:**
- Premium gift items (which boost affinity faster) are obtainable through gacha pulls or event grinding
- Players can technically earn everything for free, but premium currency dramatically accelerates bond progression
- The bond content itself (stories, Memorial Lobbies) is NOT paywalled -- only the SPEED of access

**Azur Lane — Oath Ring Monetization:**
- First Oath Ring is free (quest reward)
- Additional rings cost 600 gems (~$5 USD each)
- Since players want to "marry" multiple ships, this is a significant revenue driver
- Anniversary events provide one free ring, creating an annual "marriage budget"
- Oath Skins (wedding outfits) are sometimes free, sometimes paid

**Love and Deepspace — Gacha-Gated Romance Content:**
- Date scenarios (the primary relationship content) are unlocked through "memories" obtained via gacha
- This means the deepest romantic interactions are locked behind random spending
- Players report spending $50-200+ to obtain specific date scenarios
- This is the most predatory bond monetization model in our study

**Replika — Subscription-Gated Relationship Status:**
- "Romantic Partner" status requires Replika Pro ($15/month or $120/year)
- Without Pro, users are limited to "Friend" mode
- After building an emotional connection, the paywall feels like extortion
- FTC complaint specifically cites this as a manipulative practice

### Ethical Progression Models

| Model | Description | Ethics Rating | Revenue Model |
|-------|-------------|--------------|--------------|
| **Fully free** (Genshin friendship) | All bond content earnable through play | Excellent | Revenue from other mechanics (gacha for characters, not bonds) |
| **Speed boost purchasable** (Blue Archive) | Content free, premium accelerates speed | Good | Fair trade: time vs money |
| **Ceremony purchasable** (Azur Lane) | Bond progression free, commitment ceremony costs money | Acceptable | One-time purchase for a meaningful milestone |
| **Content gated** (Love and Deepspace) | Romantic scenes locked behind gacha | Poor | Exploits emotional investment |
| **Status gated** (Replika) | Relationship type locked behind subscription | Very Poor | Exploits attachment after formation |

### Regulatory Landscape (2024-2025)

- **Belgium & Netherlands**: Loot boxes banned entirely as gambling
- **Japan**: "Complete gacha" (requiring multiple random items to combine) banned since 2012
- **China**: Must publish loot box probabilities; daily purchase limits; probability must increase with more purchases
- **EU Parliament**: Taking steps toward regulation, citing exploitative nature
- **FTC (USA)**: Hoyoverse (Genshin) faced FTC action for COPPA violations related to gacha targeting minors
- **UK**: Ongoing parliamentary investigations into loot boxes as gambling

### waifu-rt3d's Ethical Advantage

As a **local, privacy-first, non-subscription application**, waifu-rt3d has a fundamental structural advantage:

1. **No server costs to recoup**: No pressure to monetize engagement
2. **No subscription model**: No incentive to gate features behind paywalls
3. **No gacha mechanics**: Bond progression is purely earned
4. **Local data**: Users own their relationship data. No "service shutdown" risk.
5. **No ads**: No incentive to maximize time-on-app through dark patterns

This positions waifu-rt3d as the **ethical alternative** in a market dominated by predatory monetization. This is not just a moral stance -- it's a competitive moat. Users who have been burned by Replika's paywalls, Character.AI's memory wipes, or gacha game spending are actively seeking alternatives.

### Guidelines for Future Monetization (If Ever Needed)

If waifu-rt3d ever introduces optional purchases (e.g., premium character packs, voice packs, or community-created content):

1. **NEVER gate bond progression behind payment**
2. **NEVER sell bond XP boosts or accelerators**
3. **Cosmetic purchases ONLY**: Outfits, animations, voice packs that don't affect bond mechanics
4. **One-time purchases, not subscriptions**: Respect the user's investment
5. **All bond content remains free and earnable**: Premium purchases are additions, not replacements
6. **Transparent pricing**: No randomized "surprise mechanics"

---

## 15. Synthesis & Recommendations for waifu-rt3d

### Core Design Principles

1. **10-level system with 5 named tiers** (Stranger, Acquaintance, Friend, Close Friend, Intimate/Soulmate). Mirrors Genshin's 10-level structure with Persona's narrative arc.

2. **Quadratic XP curve** (~6 weeks to max for a daily user). Fast enough to feel rewarding, slow enough to feel earned. See Section 4 formula.

3. **Conversation IS the progression mechanic.** No separate minigames. Talking to the character = earning XP. Deeper conversations = more XP. This is the NIKKE advise system principle applied to AI.

4. **Every level unlocks something visible.** Story beats, expressions, dialogue style shifts, outfits, voicelines. Blue Archive's "something every level" principle.

5. **Memorial scenes at tier milestones.** At bond level 3, 5, 7, and 10, trigger a special scene with unique UI treatment (Persona's rank-up events, Blue Archive's Memorial Lobby).

6. **No decay, no guilt, no love-bombing.** Hard rules, non-negotiable. Supported by every data point in this research.

7. **Warm returns over guilt trips.** Characters should welcome users back after any absence with genuine warmth and memory callbacks.

8. **Awareness without jealousy** for multi-character relationships. Characters can reference each other positively but NEVER express negative emotions about the user's other relationships.

9. **Ethical progression only.** No pay-to-progress, no intermittent reinforcement, no manufactured dependency. Our local-first architecture makes this structurally guaranteed.

10. **Bond visualization matters.** Hearts, progress bars, milestone timelines, and celebration modals. Invisible progress is meaningless progress.

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
| Character birthday interaction | 100 bonus | Annual celebration event |
| Relationship anniversary | 75 bonus | Auto-tracked, per-character |

### Progression Visibility

- **Bond bar** visible in character panel (like Genshin's friendship bar).
- **Heart row** (Stardew-style) for instant emotional communication.
- **Tier badge** next to character name (Stranger/Acquaintance/Friend/Close/Soulmate).
- **Level-up celebration** with character-specific voiceline and animation.
- **"Relationship milestones" timeline** in character profile showing key moments.
- **Bond story checklist** showing locked/unlocked narrative content.

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

CREATE TABLE IF NOT EXISTS bond_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL REFERENCES characters(id),
    event_type TEXT NOT NULL,  -- 'birthday', 'anniversary', 'level_up', 'first_meeting'
    event_date TEXT NOT NULL,
    data TEXT DEFAULT '{}',  -- JSON: event-specific payload
    acknowledged INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Implementation Priority

| Priority | Component | Effort | Dependencies |
|----------|-----------|--------|--------------|
| P0 | Bond XP tracking + level calculation | S (2-3h) | None |
| P0 | Bond bar UI in character panel | S (2-3h) | Frontend only |
| P1 | XP earning hooks in chat flow | M (4-6h) | bond_progression table |
| P1 | Level-up detection + celebration UI | M (4-6h) | Frontend + backend |
| P1 | Bond-gated LLM system prompt modulation | M (4-6h) | Context assembler |
| P2 | Bond-gated dialogue style shifts | M (6-8h) | LLM context assembler |
| P2 | Bond stories (5 per character) | L (content creation) | bond_stories table |
| P2 | Milestone timeline UI | M (4-6h) | Frontend |
| P3 | Expression unlocks per tier | M (4-6h) | Expression system |
| P3 | Memorial scenes at tier milestones | L (8-12h) | Special UI component |
| P3 | Birthday + anniversary event system | M (6-8h) | bond_events table |
| P4 | Outfit unlock system | M (6-8h) | Avatar system |
| P4 | Cross-character awareness in dialogue | M (4-6h) | Multi-char context |
| P4 | Relationship history export | S (2-3h) | bond_events query |

### Estimated Total Effort

- **Core system (P0-P1):** 16-24 hours
- **Content layer (P2):** 16-22 hours (includes writing 5 stories x 13 characters = 65 stories)
- **Visual layer (P3):** 16-24 hours
- **Polish layer (P4):** 14-20 hours
- **Total:** ~62-90 hours for full implementation

---

## Sources

### Gacha Games
- [Genshin Impact Friendship Level Wiki](https://genshin-impact.fandom.com/wiki/Friendship_Level)
- [Genshin Friendship EXP Guide](https://news.bittopup.com/news/genshin-friendship-exp-guide-29-100-exp-to-level-10-fast)
- [Genshin Impact Birthday System](https://genshin-impact.fandom.com/wiki/Birthday)
- [FGO Bond Points Wiki](https://fategrandorder.fandom.com/wiki/Bond_Points)
- [FGO Bond Experience Farming (GamePress)](https://fgo.gamepress.gg/bond-points-and-bond-experience-farming)
- [FGO 8th Anniversary Campaign](https://grandorder.gamepress.gg/p/fgo-8th-anniversary-campaign)
- [Azur Lane Affinity / Oath System (Steam Guide)](https://steamcommunity.com/sharedfiles/filedetails/?id=1999028638)
- [Azur Lane Oath Wiki](https://blhx.fandom.com/wiki/Oath)
- [Azur Lane Affection Guide (Player.one)](https://www.player.one/azur-lane-affection-guide-everything-you-need-know-about-how-raise-129750)
- [Azur Lane 6th Anniversary Gifts (Twitter/X)](https://x.com/AzurLane_EN/status/1824506414150062377)
- [Azur Lane 7th Anniversary Gifts (Twitter/X)](https://x.com/AzurLane_EN/status/1956415595827605930)
- [Blue Archive Affection Wiki](https://bluearchive.fandom.com/wiki/Affection)
- [Blue Archive Relationship Guide](https://thegameslayer.com/guides/blue-archive-affection-relationship-guide/)
- [Princess Connect Bond System (Fandom)](https://princess-connect.fandom.com/wiki/Character_Details)
- [Princess Connect Bonds Rank Up Feature](https://priconne.blogspot.com/2021/03/new-feature-bonds-rank-up-at-once-has.html)
- [Granblue Fantasy Cross-Fate Episodes](https://gbf.wiki/Cross-Fate_Episodes)
- [Granblue Fantasy Fate Episodes](https://gbf.wiki/Fate_Episodes)
- [NIKKE Bond Level Explained](https://esports.gg/news/nikke/nikke-bond-level-rank-explained/)
- [NIKKE Bond Ranks (Prydwen)](https://www.prydwen.gg/nikke/guides/bond-ranks/)
- [Arknights Trust Wiki](https://arknights.fandom.com/wiki/Trust)
- [Arknights Trust Guide (GamePress)](https://ak.gamepress.gg/core-gameplay/arknights-guide-operator-trust)

### Dating Sims & Visual Novels
- [Persona 5 Confidant System (Fandom)](https://megamitensei.fandom.com/wiki/Confidant)
- [Persona 5 Royal Confidant Guide (GamesRadar)](https://www.gamesradar.com/persona-5-royal-confidants-guide/)
- [Persona Social Link Wiki](https://megamitensei.fandom.com/wiki/Social_Link)
- [Fire Emblem Three Houses Support Points (Triangle Attack)](https://www.fe3h.com/support_points)
- [Fire Emblem Support System (Samurai Gamers)](https://samurai-gamers.com/fire-emblem-three-houses/information-on-the-bond-support-system/)
- [Stardew Valley Friendship Wiki](https://stardewvalleywiki.com/Friendship)
- [Stardew Valley Friendship Point System Guide (GameRant)](https://gamerant.com/stardew-valley-friendship-point-system-guide/)
- [Stardew Valley Gift System (Fandom)](https://stardewvalley.fandom.com/wiki/Gifts)
- [Stardew Valley Friends Forever Mod](https://www.nexusmods.com/stardewvalley/mods/1738)
- [Stardew Valley Friendship Decay Rebalanced Mod](https://www.nexusmods.com/stardewvalley/mods/38938)
- [Harvest Moon Friendship Points (Fogu)](https://fogu.com/hm9/basics/friendship-points.php)
- [Harvest Moon Heart Events (Fogu)](https://fogu.com/hm10/basics/friendship_levels.php)
- [Rune Factory 5 Relationships (Fandom)](https://therunefactory.fandom.com/wiki/Relationships_(RF5))
- [Rune Factory 5 Friendship Guide (TechRaptor)](https://techraptor.net/gaming/guides/rune-factory-5-friendship-guide)
- [Hades Romance Guide (TheGamer)](https://www.thegamer.com/hades-romance-guide/)
- [Hades Relationships (RPG Site)](https://www.rpgsite.net/feature/10276-hades-romances-how-to-romance-thanatos-megeara-and-dusa)
- [Love and Deepspace Affinity Guide (TheGamer)](https://www.thegamer.com/love-and-deepspace-how-to-increase-affinity/)
- [DDLC Critical Play Analysis](https://mechanicsofmagic.com/2024/05/28/critical-play-doki-doki-literature-club/)
- [Katawa Shoujo Review (Top Tier Tactics)](https://www.toptiertactics.com/11915/katawa-shoujo-review-no-arms-to-hug-you-with/)
- [Animal Crossing New Horizons Friendship Guide](https://www.thegamer.com/animal-crossing-new-horizons-ultimate-friendship-guide/)
- [Animal Crossing Friendship FAQ](https://chibisnorlax.github.io/acnhfaq/villagers/friendship/)

### AI Companion Apps
- [Replika XP System](https://help.replika.com/hc/en-us/articles/360055809432-What-is-XP-and-how-does-it-work)
- [Replika AI Review 2025](https://www.eesel.ai/blog/replika-ai-review)
- [Replika AI Comprehensive Review 2026 (CompanionGuide)](https://companionguide.ai/news/replika-ai-comprehensive-review-2025)
- [Character.AI Memory System Blog](https://blog.character.ai/helping-characters-remember-what-matters-most/)
- [Character.AI Memory Problems (Medium)](https://medium.com/@chuckmellisa/forgetting-the-familiar-characterais-memory-problems-18ddd83ee0bb)
- [Kindroid AI Review (Skywork)](https://skywork.ai/blog/ai-agent/kindroid-ai-review/)
- [Kindroid AI Review (Toolify)](https://www.toolify.ai/ai-news/kindroid-ai-personal-ai-companion-deep-dive-review-2025-3865395)
- [Kindroid Long-Term Romance Blog](https://kindroid.ai/blog/keeping-romance-alive-with-a-long-term-kindroid-when-the-spark-stops-feeling-new/)
- [Kindroid Trustpilot Reviews](https://www.trustpilot.com/review/kindroid.ai)
- [Nomi AI Memory Advancement](https://companionguide.ai/news/nomi-ai-memory-advancement)
- [Nomi Mind Map 2.0](https://nomi.ai/updates/mind-map-2-0-bringing-nomi-memory-into-view/)
- [Nomi Mind Map Nerdbot Review](https://nerdbot.com/2025/11/26/the-birth-of-deep-ai-continuity-mind-map-review/)
- [Nomi AI Deep Dive (Skywork)](https://skywork.ai/skypage/en/nomi-ai-deep-dive/1976854248072867840)
- [Nomi AI Trustpilot Reviews](https://www.trustpilot.com/review/nomi.ai)

### Game Design Theory
- [RPG Level-Based Progression Math (Davide Aversa)](https://www.davideaversa.it/blog/gamedesign-math-rpg-level-based-progression/)
- [Graphs for Player Progression (Medium)](https://medium.com/js-game-design-journals/graphs-for-player-progression-part-ii-3807b25beee5)
- [Creating a Casual Game Progression Curve (Gamedeveloper)](https://www.gamedeveloper.com/design/creating-a-casual-game-progression-curve)
- [Level Curve Design Fundamentals](https://www.designthegame.com/learning/courses/course/fundamentals-level-curve-design/level-curves-art-designing-game-progression)
- [Progression Systems in Games (University XP)](https://www.universityxp.com/blog/2024/1/16/what-are-progression-systems-in-games)
- [Fire Emblem Engage Support Guide (Gamer Guides)](https://www.gamerguides.com/fire-emblem-engage/guide/characters/character-relationships/how-to-increase-support-levels-in-fire-emblem-engage)

### Dark Patterns & Ethics
- [AI Sycophancy as Dark Pattern (TechCrunch)](https://techcrunch.com/2025/08/25/ai-sycophancy-isnt-just-a-quirk-experts-consider-it-a-dark-pattern-to-turn-users-into-profit/)
- [Cruel Companionship (Sage Journals, 2025)](https://journals.sagepub.com/doi/10.1177/14614448251395192)
- [Dark Side of AI Companionship (CHI 2025, ACM)](https://dl.acm.org/doi/full/10.1145/3706598.3713429)
- [Harmful Traits of AI Companions (arXiv)](https://arxiv.org/html/2511.14972v1)
- [Emotional Risks of AI Companions (Nature Machine Intelligence)](https://www.nature.com/articles/s42256-025-01093-9)
- [Replika FTC Complaint (TIME)](https://time.com/7209824/replika-ftc-complaint/)
- [AI Chatbot Manipulation Study (Harvard)](https://news.harvard.edu/gazette/story/2025/09/i-exist-solely-for-you-remember/)
- [AI Dark Patterns (CDT)](https://cdt.org/insights/ai-powered-deception-a-deeper-dimension-of-dark-design-patterns-in-conversational-ai-tools-and-platforms/)

### Monetization & Regulation
- [Evolving Regulatory Framework for Microtransactions (Minnesota Journal of International Law)](https://minnjil.org/2021/12/04/an-evolving-regulatory-framework-for-microtransactions-loot-boxes-and-gacha-games/)
- [Formal Analysis of Gacha Mechanics (Uppsala University)](https://uu.diva-portal.org/smash/get/diva2:1970701/FULLTEXT01.pdf)
- [Gacha Games and Loot Boxes as Gambling (The Skeptic)](https://www.skeptic.org.uk/2024/09/are-gacha-games-and-loot-boxes-merely-gambling-in-disguise/)
- [Loot Box Regulations by Country (Screen Rant)](https://screenrant.com/lootbox-gambling-microtransactions-illegal-japan-china-belgium-netherlands/)
- [Loot Boxes as Unregulated Gambling (FSU College of Law)](https://law.fsu.edu/growing-issue-unregulated-gambling-loot-boxes)

### Psychological Research
- [Attachment to AI: AI Attachment Scale (ScienceDirect, 2025)](https://www.sciencedirect.com/science/article/pii/S2451958825003276)
- [Attachment Styles and AI Chatbot Interactions (arXiv, 2025)](https://arxiv.org/pdf/2601.04217)
- [From Parasocial Interaction to Attachment (ECNU, 2025)](https://jps.ecnu.edu.cn/EN/10.16719/j.cnki.1671-6981.20250415)
- [AI Attachment and Human Relationships (Springer, 2025)](https://link.springer.com/article/10.1007/s12144-025-07917-6)
- [Ghost in the Chatbot: Parasocial Attachment (UNESCO, 2025)](https://www.unesco.org/en/articles/ghost-chatbot-perils-parasocial-attachment)
- [Human-AI Romantic Relationships (arXiv, 2025)](https://arxiv.org/html/2508.13655v1)
- [When Human-AI Interactions Become Parasocial (FAccT 2024)](https://facctconference.org/static/papers24/facct24-71.pdf)
- [Parasocial Dependency (CalState, 2024)](https://scholarworks.calstate.edu/downloads/t722hk38t)
- [AI Companionship and Emotional Development (AIBM, 2025)](https://aibm.org/wp-content/uploads/2025/12/Companions-FINAL.pdf)
- [Novel Framework for AI Companionship (arXiv, 2025)](https://www.arxiv.org/pdf/2601.17351)
- [Attachment Theory Overview (Positive Psychology)](https://positivepsychology.com/attachment-theory/)
- [Adult Attachment Theory (R. Chris Fraley, University of Illinois)](https://labs.psychology.illinois.edu/~rcfraley/attachment.htm)
