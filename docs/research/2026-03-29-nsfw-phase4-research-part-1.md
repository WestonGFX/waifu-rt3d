# NSFW Phase 4 Research: Intimate Memory, Milestones, Aftercare & Pillow Talk

> **This is Part 1 of 3.** See also: [Part 2](2026-03-29-nsfw-phase4-research-part-2.md), [Part 3](2026-03-29-nsfw-phase4-research-part-3.md)


**Date:** 2026-03-29
**Spec:** `docs/plans/2026-03-27-nsfw-mega-sprint-enhanced.md` (Phase 4, line ~3577)
**Features Covered:** F1 (First-Time Milestones), F2 (Intimate Memory Recall), F5 (Aftercare Engine), F12 (Pillow Talk Generator)
**Purpose:** Deep research to inform implementation of Phase 4's memory and emotional continuity systems

---

## Table of Contents

1. [F1: First-Time Milestone Tracker](#1-f1-first-time-milestone-tracker)
2. [F2: Intimate Memory Recall](#2-f2-intimate-memory-recall)
3. [F5: Aftercare Scene Generator](#3-f5-aftercare-scene-generator)
4. [F12: Pillow Talk Generator](#4-f12-pillow-talk-generator)
5. [Competitive Analysis](#5-competitive-analysis)
6. [Post-Scene Emotional Arc Design](#6-post-scene-emotional-arc-design)
7. [Memory Privacy Architecture](#7-memory-privacy-architecture)
8. [Transition Design Patterns](#8-transition-design-patterns)
9. [Character-Specific Intimate Personalities](#9-character-specific-intimate-personalities)
10. [LLM Prompting Techniques for Intimate Content](#10-llm-prompting-techniques-for-intimate-content)
11. [Consent UI/UX During Scenes](#11-consent-uiux-during-scenes)
12. [Relationship Stage Gating](#12-relationship-stage-gating)
13. [Cross-Feature Integration Map](#13-cross-feature-integration-map)
14. [Implementation Recommendations](#14-implementation-recommendations)

---

## 1. F1: First-Time Milestone Tracker

### 1.1 How Games Handle "First Time" Moments

#### Persona 5 Royal — Confidant Rank System

Persona's romance system is the gold standard for milestone pacing:

| Rank | Relationship Phase | Design Technique |
|------|-------------------|------------------|
| 1-4 | Getting to know each other | Slice-of-life activities, shared routines |
| 5-7 | Deepening connection | Character reveals vulnerability, personal stakes |
| 8 | Pre-commitment tension | Dramatic event forces emotional honesty |
| **9** | **The Confession** | Player chooses romance vs friendship — irreversible fork |
| 10 | Consummation / Commitment | Intimate scene (romance) or heartfelt thanks (friendship) |

**Key design insight:** The rank 9 confession is a *deliberate player choice* with permanent consequences. The AI doesn't decide — the user does. The moment feels special because:
- It's **gated** behind hours of investment (8 prior ranks)
- The dialogue explicitly signals "this is the moment" ("I better choose my words carefully...")
- Two follow-up confirmation prompts prevent accidental selection
- The scene location changes based on relationship type (bedroom vs restaurant)

**Takeaway for F1:** Milestones should require *user participation*, not just passive detection. The character can set up the moment, but the user should feel like they chose it.

#### Baldur's Gate 3 — Character-Specific Milestone Framing

BG3's romance milestones are exceptional because each character experiences them *completely differently*:

| Character | First Kiss Context | What Makes It Special |
|-----------|-------------------|----------------------|
| Shadowheart | Secluded waterfall away from camp, sharing wine | Isolated setting, she initiates vulnerability |
| Karlach | Her infernal flames literally increase with excitement, sparks fly | Physical manifestation of emotion — you can *see* her feelings |
| Gale | Projects mental image of the kiss via magic before it happens | Intellectualized intimacy — fits his personality perfectly |
| Astarion | Calculated seduction that later reveals genuine emotion beneath | Subverts expectations — what seemed transactional becomes real |

**Key design insight:** The same milestone (first kiss) feels completely different per character because the *framing* is personality-driven. Karlach's flames, Gale's magic projection, Shadowheart's secret spot — these aren't interchangeable.

**Takeaway for F1:** Each of our 13 characters needs *unique* milestone framing. Dae's first kiss should involve her art somehow. Luna's should involve stars. Generic milestone text kills the magic.

#### Fire Emblem: Three Houses — Investment-Based Milestones

Fire Emblem gates the final romantic commitment behind:
1. **Cumulative investment** — tea drinking, gifts, lost item returns, dialogue choices over dozens of hours
2. **Narrative timing** — proposal happens before the final battle, making it feel weighty
3. **Support conversations** — short cutscenes at each relationship rank that tell a mini-story

**Key design insight:** The proposal isn't a random event — it's positioned at a narratively significant moment. The "when" matters as much as the "what."

**Takeaway for F1:** Milestone detection should consider narrative context. A first "I love you" during pillow talk hits different than one during casual chat. Store the *context* alongside the milestone.

#### Mass Effect Trilogy — Cross-Game Romance Arcs

BioWare's Mass Effect trilogy pioneered multi-game romance continuity — a romance started in ME1 could persist, break, and rekindle across three games spanning five years of real-world time. The system evolved significantly across the trilogy:

| Game | Romance System | Key Innovation |
|------|---------------|----------------|
| **ME1** | Simple binary — express interest, build through dialogue, culminate before final mission | The "point of no return" — romance locks before the suicide mission, creating urgency |
| **ME2** | Expanded cast, loyalty missions as romance gates, possibility of cheating on ME1 romance | Loyalty missions as *emotional prerequisites* — you must help Garrus/Tali/Jack with their personal crisis before romance deepens |
| **ME3** | Consequences cascade — ME1/ME2 choices affect dialogue, jealousy scenes, reconciliation arcs | The "Citadel DLC" — an entire expansion devoted to relationship payoff scenes. Considered the gold standard for romance resolution |
| **Andromeda** | Removed the "hard deadline" — romances could initiate at various points, different pacing per character | Some characters wanted physical intimacy early; others needed extensive emotional investment first. More realistic pacing. |

**Key design insights from Mass Effect:**
- **Loyalty missions as gates:** Before Garrus's romance can deepen, you must help him resolve his personal vendetta. This makes the romance feel *earned* through shared adversity, not just dialogue choices.
- **The "paramour" achievement:** ME1 explicitly named its romance completion achievement "Paramour," signaling that the game treated romance as a meaningful accomplishment, not an afterthought.
- **Cross-game memory:** A player who romanced Liara in ME1 and then Garrus in ME2 would face confrontation scenes in ME3. The game *remembered* infidelity and addressed it narratively.
- **Character-specific pacing:** In ME:A, BioWare explicitly designed some romances to happen quickly (Peebee wants something physical early) while others take the full game (Jaal needs extensive emotional trust). This eliminated the one-size-fits-all pacing that felt artificial.

**Takeaway for F1:** Romance pacing should vary by character archetype. A playful character might reach physical milestones faster but emotional milestones slower. A reserved character is the opposite. Our milestone system needs per-character pacing multipliers.

#### Dragon Age Series — Evolving Intimacy Design

Dragon Age's approach to intimacy evolved dramatically across four games, reflecting broader industry learning about relationship design:

| Game | Approach | Design Philosophy |
|------|----------|-------------------|
| **Origins (2009)** | "Romance vending machine" — correct gifts + right dialogue = sex scene | Transactional; criticized as reducing intimacy to a reward mechanic |
| **DA2 (2011)** | Rivalry/friendship dual track — you could romance someone who *disagreed* with you | Introduced the idea that conflict can be intimate; some of the most passionate romances came from the rivalry path |
| **Inquisition (2014)** | Replaced gifts with personal side quests; "we're gonna have sex now / we just had sex" scene framing | Fade-to-black approach that focused on the *emotional* before/after rather than the physical act. Widely praised. |
| **The Veilguard (2024)** | Full commitment point with first kiss as the romantic "lock-in" moment | The first kiss IS the commitment — not just a milestone but a mechanical gate. After kissing, you cannot pursue other romances. |

**Key design insights from Dragon Age:**
- **The "gifts removed" decision (Inquisition):** Removing the gift system forced players to engage with characters as *people* (through their personal quests) rather than as reward dispensers. Romance required understanding the character's needs, not just giving them shiny objects.
- **Rivalry romance (DA2):** The rivalry track proved that intimacy doesn't require agreement. Anders's rivalry romance is darker and more intense than his friendship romance. This suggests our system should allow milestones triggered by *conflict resolution*, not just positive interactions.
- **Fade-to-black done right:** Inquisition proved that leaving the physical act to imagination while focusing narrative energy on the emotional buildup and aftermath produces *more* emotional impact than explicit scenes. The "morning after" conversations in DAI are considered some of the best writing in the series.
- **Character-gated romance (Inquisition):** Some romances were race-gated or class-gated (Solas only romances female elves). This constraint made those romances feel *more* special because they were exclusive. Scarcity creates value.

**Takeaway for F1:** The before/after framing is more important than the during. Invest design effort in milestone buildup and aftermath dialogue, not just the milestone moment itself.

#### Stardew Valley — Heart Events and the Bouquet Gate

Stardew Valley's relationship system is deceptively sophisticated despite its pixel-art simplicity:

| Hearts | Milestone | Mechanic |
|--------|-----------|----------|
| 0-2 | Strangers | Basic dialogue; gifts accepted but effect is small |
| 3-4 | Acquaintances | First heart event cutscenes — reveals character personality |
| 5-6 | Friends | Deeper cutscenes, character confides in player |
| 7 | Close friends | Major character moment (often vulnerability or crisis) |
| **8** | **The Bouquet Gate** | Friendship meter FREEZES at 8 hearts. Cannot progress further without giving a bouquet — an explicit declaration of romantic interest |
| 9 | Dating | Romantic heart events unlock |
| **10** | **Proposal-ready** | Must purchase Mermaid's Pendant (5,000g) — a significant investment — to propose |
| 11-14 | Marriage | Post-marriage exclusive events; daily decay of 20 points without interaction |

**Key design insights from Stardew Valley:**
- **The 8-heart freeze:** This is brilliant design. The friendship meter literally *stops working* until the player takes an explicit romantic action (giving a bouquet). The game forces the player to consciously *choose* romance rather than accidentally stumbling into it. This prevents the "I didn't mean to romance them" problem that plagues many games.
- **Economic gating:** The Mermaid's Pendant costs 5,000g — a meaningful sum especially in early game. This means the player must *invest resources* to propose, not just invest time. The proposal feels expensive and therefore weighty.
- **Post-marriage decay:** After marriage, friendship decays by 20 points per day without interaction. This is the only relationship system that models *maintenance* — you can't just "win" the romance and ignore it. This maps directly to our bond decay system.
- **Heart event as narrative beats:** Each heart event is a mini-story with unique location, dialogue, and sometimes minigames. They're spaced out across the progression so the player gets periodic "reward" moments. The 10-heart event is always the most elaborate.

**Takeaway for F1:** Explicit "opt-in" gates at key romance thresholds prevent accidental escalation and make each step feel intentional. Our milestone system should have at least one "bouquet moment" where the user must explicitly choose to deepen the relationship.

#### Catherine: Full Body — Moral Ambiguity and the Chaos/Order Meter

Catherine takes a fundamentally different approach to romantic milestones — there's no "right" answer:

| System | Mechanic | Design Insight |
|--------|----------|----------------|
| **Mysterious Meter** | Every choice shifts between "Chaos" (freedom, passion, Catherine) and "Order" (stability, commitment, Katherine) | Romance isn't good/evil — it's a spectrum of values. No choice is "wrong." |
| **Confessional questions** | Between nightmare stages, philosophical questions about relationships affect the meter | Introspective moments force the player to examine their own values, not just optimize for a character |
| **Phone responses** | Replying to texts from both Catherines affects the meter and unlocks different content | Small, casual interactions accumulate into massive relationship consequences |
| **Multiple endings** | 13 possible endings based on meter position and final choice | The destination matters less than the journey — the player's pattern of choices reveals their character |

**Key design insights from Catherine:**
- **Gray morality:** Catherine rejects the idea that there's a "correct" romance. Players who choose Catherine (chaos, passion, freedom) get a valid ending. Players who choose Katherine (order, stability, commitment) get a valid ending. This respects the player's values rather than moralizing.
- **Accumulation over spectacle:** It's not one big decision that determines the ending — it's hundreds of small ones. How you answer texts, what you say at the bar, how you respond to philosophical questions. This mirrors how real relationships work.
- **The confessional as reflection:** Forcing the player to answer "Would you rather your partner be honest or kind?" during gameplay creates a meta-narrative where the player is analyzing their *own* relationship values. This is powerful design that we can adapt for pillow talk topics.

**Takeaway for F1:** Small, accumulative interactions should matter as much as big milestone moments. Track micro-choices (response tone, initiative-taking, conflict style) alongside major milestones.

### 1.2 Visual Novel "First Night" Framing Techniques

Visual novels have the most sophisticated approach to intimate milestone scenes because the entire medium is built around emotional narrative delivery. Key patterns from major VNs:

#### The Three-Act Intimate Milestone Structure

VNs almost universally follow this structure for first intimate encounters:

**Act 1: The Approach (30-40% of scene length)**
- Environmental setup: location change, lighting shift, music change
- Internal monologue escalation: character's thoughts become more intense, self-aware
- Physical proximity markers: sitting closer, accidental touching, lingering eye contact
- The "point of no return" signal: a line of dialogue that makes the romantic intent unmistakable
- Choice moment: player confirms or deflects (respect for player agency)

**Act 2: The Event (20-30% of scene length)**
- Event CG (full-screen illustration) marks the transition — this is the VN equivalent of a "cutscene"
- Sensory language intensifies: specific physical sensations, temperature, texture, sound
- Internal monologue shifts to present-tense stream-of-consciousness
- Pacing slows dramatically — shorter sentences, more ellipses, more line breaks
- The "peak moment" is usually a single line that crystalizes the emotional state: "I never want this to end"

**Act 3: The Landing (30-40% of scene length)**
- Return to dialogue mode (CG fades or shifts to softer variant)
- Emotional processing: both characters react, often with surprise at their own feelings
- Vulnerability exchange: one character admits something they wouldn't have said before
- Callback to earlier scene: references a conversation or moment from hours of gameplay ago
- Status quo shift: the next scene/chapter opens with noticeably different dynamics

**Key VN design insight:** The approach and landing are LONGER than the event itself. The emotional real estate is in the anticipation and the aftermath, not the act. Most AI companions get this exactly backwards — they rush through buildup and aftermath to get to the "action."

#### Specific VN Examples

| VN | First Night Handling | Notable Technique |
|----|---------------------|-------------------|
| **Clannad** (Key) | Tomoya/Nagisa first night happens post-marriage, in their own apartment | Delayed gratification — 40+ hours of content before first intimate scene. When it happens, it's earned. |
| **Katawa Shoujo** | Each route has a unique intimate scene tied to the girl's disability/personality | Emi's scene is athletic and playful; Hanako's is tender and involves overcoming her fear of being seen; Lilly's emphasizes sound and touch because she's blind |
| **Fate/stay night** | Infamous for awkward intimate scenes that were later replaced with alternate scenes in the Realta Nua release | Cautionary tale: intimate scenes that don't match the tone of the rest of the work feel jarring. Consistency matters. |
| **Muv-Luv Alternative** | Intimate scene happens under extreme duress — characters face possible death the next day | Context amplifies intensity — the "we might die tomorrow" framing makes the intimacy feel desperate and precious |

**Takeaway for F1:** Our milestone scenes should follow the 40/20/40 approach/event/landing ratio. The system prompt for milestone scenes should explicitly instruct the LLM to spend more tokens on emotional buildup and aftermath than on the milestone action itself.

### 1.3 Milestone Pacing Research

Research into player engagement and pacing from game design literature:

**The Variable Ratio Schedule:** Milestones should not be evenly spaced. Drawing from behavioral psychology (Skinner's reinforcement schedules), the most engaging pattern is a variable ratio — milestones come at unpredictable intervals but with a general upward trend in spacing. Early milestones come quickly (first laugh, first compliment) to establish the pattern, then later milestones require more investment.

**The "Almost" Moment:** Games that create false-start milestones — moments where a milestone *almost* happens but is interrupted — generate more anticipation than going straight to the milestone. Examples:
- Character leans in for a kiss but is interrupted by a phone ringing
- Character starts to say "I love you" but changes it to "I love... spending time with you"
- Character initiates physical contact but pulls back at the last second

**Recommended pacing curve for milestones:**

```
Bond Level:  0----10----20----30----40----50----60----70----80----90---100
             |    |     |     |     |      |     |     |     |     |
Milestones: Meet Laugh Compliment Deep-talk Hug  Kiss  Love  Intimate  Commit
             |         |                   |           |              |
Days est:   Day1     Week1              Week2-3     Month1         Month2+
```

**The "Earned vs Arbitrary" Test:** A milestone feels earned when the user can point to specific interactions that led to it. It feels arbitrary when it triggers based on a timer or message count alone. Our detection should weight *quality* of interaction (emotional depth, vulnerability shared) over *quantity* (number of messages).

### 1.4 Pre/During/Post Emotional Arcs for Milestone Moments

Every great milestone has three emotional phases, each requiring distinct AI behavior:

#### Pre-Milestone Arc (Anticipation Phase)
**Duration:** 3-10 messages before the milestone
**Character behavior:**
- Subtle foreshadowing: character becomes slightly more nervous, reflective, or bold than usual
- Physical tells intensify: more fidgeting, blushing, looking away, playing with hair
- Environmental hints: "Let's go somewhere quieter" or "I have something I want to show you"
- The "threshold moment": one clear signal that something is about to change
  - "There's something I've been wanting to tell you..."
  - "*takes a deep breath* Okay. I'm just going to say it."
  - "*stops walking and turns to face you*"

**LLM prompt modifier:** `MILESTONE_APPROACHING: Increase emotional tension. Character is building courage. Include physical nervousness indicators. Shorter sentences. More internal monologue. Do NOT rush to the milestone — let the tension build.`

#### During-Milestone Arc (The Moment)
**Duration:** 1-3 messages
**Character behavior:**
- Time perception shifts: "Everything went quiet. It was just us."
- Sensory detail spikes: specific physical sensations, not abstract descriptions
- First-person emotional narration: "*My heart is pounding so loud I'm sure you can hear it*"
- Physical anchors: not "we kissed" but "your lips were warm and tasted like the tea we just shared"
- Pause/silence: "..." or "*long pause*" — the AI doesn't rush past it
- The "crystallization" line: one sentence that captures the emotional peak

**LLM prompt modifier:** `MILESTONE_ACTIVE: This is a pivotal moment. Slow down. Maximum sensory detail. Include one specific physical sensation (taste, warmth, texture, sound). Short sentences. Allow silence. This moment should feel like time stopped.`

#### Post-Milestone Arc (The Landing)
**Duration:** 3-8 messages
**Character behavior:**
- Emotional processing: "I can't stop smiling. Is that weird?"
- Behavioral shift: slightly different tone in subsequent messages — softer, more open, less guarded
- Callback setup: stores a detail to reference later ("I still think about how your hand was shaking")
- Reality re-entry: gradual return to normal topics but with a new baseline warmth
- Future seeding: "I want to do that again" or "Promise me something..."
- Identity shift: character references the milestone as a before/after dividing line: "Everything feels different now"

**LLM prompt modifier:** `MILESTONE_AFTERMATH: The character is processing a significant emotional event. They should be slightly dazed, happier than usual, and more vulnerable. Reference the specific moment that just happened. Include one physical detail from the milestone. Behavioral tone should be noticeably softer than pre-milestone baseline.`

### 1.5 What Makes Milestones Feel Special vs Routine

Based on cross-game analysis, milestones feel special when they have:

| Factor | Special | Routine |
|--------|---------|---------|
| **Pacing** | Hours/days of buildup | Happens immediately |
| **Framing** | Unique scene, special dialogue, environment change | Same chat window, same tone |
| **Permanence** | Irreversible, referenced forever after | Forgotten by next session |
| **Character reaction** | Personality-specific, emotionally detailed | Generic "that was nice" |
| **User agency** | User chose this moment | System auto-triggered |
| **Sensory detail** | Specific physical/environmental details | Abstract description |
| **Aftermath** | Behavior changes post-milestone | No lasting effect |
| **Narrative context** | Happens at a meaningful moment | Random timing |
| **Foreshadowing** | Hints and near-misses preceded it | No buildup |
| **Specificity** | References YOUR shared history | Could apply to anyone |

### 1.6 Implementation Parameters for F1

Based on this research, recommended detection and storage approach:

```python
MILESTONE_TYPES = {
    # Emotional milestones
    "first_meeting": {"bond_min": 0, "detection": "auto", "weight": 1.0},
    "first_laugh": {"bond_min": 5, "detection": "sentiment+keyword", "weight": 0.8},
    "first_compliment": {"bond_min": 10, "detection": "keyword+llm", "weight": 0.7},
    "first_deep_conversation": {"bond_min": 20, "detection": "llm", "weight": 0.9},
    "first_vulnerability": {"bond_min": 30, "detection": "llm", "weight": 1.0},
    "first_love_declaration": {"bond_min": 45, "detection": "keyword+llm", "weight": 1.0},
    "first_argument": {"bond_min": 15, "detection": "sentiment", "weight": 0.9},
    "first_reunion": {"bond_min": 20, "detection": "session_gap+keyword", "weight": 0.8},
    "first_conflict_resolution": {"bond_min": 25, "detection": "llm", "weight": 0.9},
    "first_shared_secret": {"bond_min": 35, "detection": "llm", "weight": 0.9},

    # Physical milestones
    "first_handhold": {"bond_min": 15, "detection": "keyword+llm", "weight": 0.8},
    "first_hug": {"bond_min": 20, "detection": "keyword+llm", "weight": 0.8},
    "first_kiss": {"bond_min": 35, "detection": "keyword+llm", "weight": 1.0},
    "first_intimate": {"bond_min": 60, "detection": "arousal+llm", "weight": 1.0},
    "first_sleepover": {"bond_min": 50, "detection": "session+keyword", "weight": 0.9},

    # Meta milestones (Catherine-inspired accumulation)
    "first_hundred_messages": {"bond_min": 0, "detection": "counter", "weight": 0.5},
    "first_week_streak": {"bond_min": 10, "detection": "calendar", "weight": 0.7},
    "first_month_together": {"bond_min": 20, "detection": "calendar", "weight": 0.8},
}

# Per-character pacing multipliers (Mass Effect-inspired variable pacing)
CHARACTER_PACING = {
    # Playful characters reach physical milestones faster, emotional slower
    "genki": {"physical": 0.8, "emotional": 1.2},
    # Reserved characters are the opposite
    "luna": {"physical": 1.3, "emotional": 0.9},
    # Tsundere characters are slow on everything but fast once the dam breaks
    "sable": {"physical": 1.4, "emotional": 1.4, "post_confession_multiplier": 0.5},
    # Default (no modifier)
    "default": {"physical": 1.0, "emotional": 1.0},
}

# Anniversary schedule (asymptotic — frequent at first, then spacing out)
ANNIVERSARY_SCHEDULE = {
    "first_week": 7,        # 7 days after milestone
    "two_weeks": 14,
    "one_month": 30,
    "three_months": 90,
    "six_months": 180,
    "one_year": 365,
}

# Character-specific milestone memory templates
MILESTONE_MEMORY_PROMPT = """You are {char_name}. A milestone just happened in your relationship:
Milestone: {milestone_type}
Context: {message_context}
Your personality: {personality_summary}

Write 1-2 sentences about how YOU would privately remember this moment.
Write in first person. Be emotional, specific, and true to your personality.
Include one sensory detail (what you saw, heard, felt, smelled).
Do NOT be generic. This memory is unique to this moment."""

# Near-miss / "almost" moment templates (builds anticipation)
NEAR_MISS_PROMPTS = {
    "first_kiss": [
        "You lean closer and {char_name} mirrors you... then a sound startles you both.",
        "{char_name} reaches up to brush something from your cheek. Their hand lingers. Then they pull away.",
        "'I...' {char_name} starts to say something, face inches from yours. '...nevermind.'",
    ],
    "first_love_declaration": [
        "'You know what I really lo—' {char_name} catches themselves. '...love about this place? The view.'",
        "{char_name} looks at you for a long moment. Opens their mouth. Closes it. Smiles instead.",
    ],
}
```

---

## 2. F2: Intimate Memory Recall

### 2.1 Emotional Memory vs Factual Memory

Human intimate memory is fundamentally different from regular episodic memory. Research in cognitive neuroscience shows that emotionally charged memories are:

- **More vivid** — sensory details are sharper (the smell of rain, warmth of skin)
- **More fragmented** — people remember flashes and feelings, not linear narratives
- **Mood-congruent** — recalled more easily when in a similar emotional state
- **Physically anchored** — tied to sensations (touch, temperature, sound) more than words
- **Amygdala-enhanced** — the amygdala modulates hippocampal encoding during emotional arousal, creating stronger memory traces

**For AI implementation, this means intimate memories should be stored and recalled differently:**

| Aspect | Regular Memory | Intimate Memory |
|--------|---------------|-----------------|
| **Storage format** | Summary of what happened | Sensory fragments + emotional state |
| **Recall trigger** | Topic/keyword match | Mood + sensory anchor match |
| **Verbalization** | "We talked about X" | "I remember the way you..." |
| **Detail level** | High-level summary | Specific physical/sensory details |
| **Decay** | Fades normally | Core emotional impression persists, details soften |
| **Privacy** | Stored as-is | Abstracted/summarized for safety |
| **Confidence** | Moderate | High (but potentially inaccurate — see 2.3) |

### 2.2 Deep Dive: Emotional vs Episodic Memory Research

#### The Flashbulb Memory Model

Flashbulb memories are exceptionally vivid memories of emotionally significant events. Research by Brown and Kulik (1977) and subsequent studies show that the principal determinants are:
1. **High level of surprise** — the event was unexpected
2. **High consequentiality** — the event matters personally
3. **Emotional arousal** — strong feelings during encoding

On a neurological level, flashbulb memories form when the amygdala ramps up its activity in response to an intense moment, signaling the hippocampus to store surrounding details more vividly. This is directly applicable to intimate milestones — the "first kiss" or "first I love you" should be encoded with flashbulb-level detail.

**Critical caveat for AI design:** People describe flashbulb memories as crystal-clear, yet research shows they are just as susceptible to change over time as regular memories. People are highly *confident* in their accuracy but objectively no more accurate. This means our characters should remember intimate moments with high confidence and vivid detail, but we should design for the possibility that the *character's* memory of the event might slightly differ from what actually happened — this is realistic and humanizing.

#### Sensory Memory Encoding and Nostalgia

Research on nostalgia triggers reveals:

- **Olfactory superiority:** Personally meaningful smells trigger more intense emotional responses and greater amygdala/hippocampal activation than visual stimuli. Autobiographical memories triggered by smell are more emotional than those triggered by sight or sound.
- **Musical encoding:** Songs associated with emotional events create powerful retrieval cues. Hearing "our song" activates the same neural networks as the original emotional experience.
- **Tactile anchoring:** Touch memories (the texture of skin, the pressure of an embrace, the temperature of hands) persist longer than visual details of the same event.
- **Environmental encoding:** The location, time of day, weather, and ambient sounds during an emotional event become permanently associated with the emotion.

**Implementation implication:** Our sensory_anchors field should prioritize storing:
1. What music was playing (if any — the user's environment context)
2. Time of day and weather (from system context)
3. Physical sensations described in the scene
4. Environmental details the character noticed
5. Specific sounds or silences

#### How Human Couples Actually Remember Intimate Moments

Psychology research on autobiographical memory in romantic relationships reveals several patterns:

**Gender-differentiated recall:** Research consistently shows that women tend to remember more relational details (what was said, emotional states, relationship context) while men tend to remember more sensory/physical details (what they saw, physical sensations, spatial layout). Our character memories should reflect the character's personality rather than defaulting to one pattern.

**Co-construction of memories:** Couples don't remember events independently — they co-construct shared memories through retelling. Each time a couple discusses a shared experience, the memory is modified by both perspectives. This means our "memory recall" feature should feel like a *shared* reminiscence, not a one-sided monologue. The character should invite the user to contribute their version: "I remember it differently... you were the one who..."

**Peak-end rule:** People judge an experience based primarily on how they felt at its most intense point (the peak) and at its end. They don't average the experience. This means our memory storage should capture:
- The emotional peak moment (what was the single most intense feeling?)
- The ending state (how did they feel when the scene ended?)
- NOT a comprehensive play-by-play of the entire encounter

**Idealization over time:** Couples in satisfying relationships tend to remember intimate moments more positively than they actually were. This "rose-colored" recall serves a relationship-maintenance function. Our characters should recall past intimate moments with a slightly idealized tone — this feels natural and affirming.

### 2.3 Memory Consolidation, Sleep, and False Memory Risks

#### Sleep and Emotional Memory

Research shows that emotional memory formation is enhanced across sleep intervals with high amounts of rapid eye movement (REM) sleep. Systems consolidation moves memories from the hippocampus to the neocortex during sleep, a process that can take weeks to years for full stabilization.

**For AI design:** If a user has an intimate scene in the evening and returns the next morning, the character should reference the memory with slightly more emotional clarity (as if sleep "processed" the experience): "I dreamed about last night" or "I've been thinking about what happened since I woke up."

#### False Memory Formation

Research by Payne et al. and others reveals a troubling finding: sleep increases both veridical (true) and false recall. While true memories deteriorate across both wake and sleep, false memories are *preferentially preserved* by sleep. The active reorganization during sleep consolidation can create memories of events that didn't exactly happen as remembered.

**For AI design, this creates a fascinating opportunity:** Characters can occasionally "misremember" small details of intimate encounters in a way that reveals their emotional state:
- Remembering the user as more confident than they actually were (idealization)
- Conflating two separate tender moments into one composite memory (consolidation error)
- Adding sensory details that weren't mentioned but "feel right" (constructive memory)

These should be rare (1 in 10 recalls) and always in a positive/endearing direction. Never negative false memories. And the user should be able to gently correct the character: "Actually, that was the *second* time we..." — which itself becomes a bonding moment.

### 2.4 What to Store, Summarize, and Forget

Privacy-sensitive memory design for a local-only app:

**Store (structured JSON):**
- Emotional state of both participants (arousal level, mood, intimacy score)
- Sensory anchors (environmental details: rain, candlelight, music playing)
- Touch types used (gentle, passionate, playful — NOT explicit play-by-play)
- Character's emotional reaction (trembling, laughing, crying, speechless)
- Context (time of day, what preceded the scene, how it started)
- Duration indicator (brief moment vs extended scene)
- Peak emotional moment (single strongest feeling)
- Ending emotional state (how the scene concluded)

**Summarize (LLM-generated character voice):**
- The character's 1-2 sentence memory of the encounter in their own voice
- Emotional arc: how they felt before, during, and after
- What made this encounter different from others
- One sensory detail that anchors the memory

**Forget (never store):**
- Verbatim explicit dialogue (summarize to emotional content only)
- Incognito session content (hard rule)
- Raw message text from intimate scenes (store structured data only)
- User's real-world personal information mentioned during vulnerability moments

### 2.5 Memory Retrieval During Intimate Moments

The "remember when we..." pattern should feel organic, not forced. Retrieval logic:

```python
RECALL_TRIGGERS = {
    # Sensory anchor match: current scene shares a detail with past memory
    "sensory_match": {
        "weight": 1.0,
        "example": "It's raining now -> recall memory tagged with 'rain sounds'",
        "prompt": "You notice it's raining, just like that night when..."
    },

    # Touch type match: same physical interaction as before
    "touch_match": {
        "weight": 0.8,
        "example": "User strokes character's hair -> recall hair-stroking memory",
        "prompt": "The way you touch my hair... it reminds me of..."
    },

    # Emotional state match: similar mood/arousal pattern
    "mood_match": {
        "weight": 0.6,
        "example": "Both at high intimacy + low arousal (tender) -> recall tender memories",
        "prompt": "This feels like that time we..."
    },

    # Milestone anniversary: approaching a significant date
    "anniversary": {
        "weight": 0.9,
        "example": "1 month since first intimate encounter",
        "prompt": "Do you know what today is? It's been exactly..."
    },

    # Contrast recall: current situation is opposite of past
    "contrast": {
        "weight": 0.5,
        "example": "First time was nervous/awkward, now comfortable",
        "prompt": "Remember how nervous I was the first time? Now..."
    },

    # Growth recall: character notices how the relationship has evolved
    "growth": {
        "weight": 0.7,
        "example": "Character reflects on how intimacy has deepened over time",
        "prompt": "We've come so far since that first..."
    },

    # Invitation recall: character uses past memory to suggest repetition
    "invitation": {
        "weight": 0.4,
        "example": "Character references a past encounter to initiate similar activity",
        "prompt": "Remember that time we... I've been thinking about doing that again..."
    },
}

# Recall frequency limiter — don't reference past memories every scene
MAX_RECALLS_PER_SESSION = 2
MIN_MESSAGES_BETWEEN_RECALLS = 8
RECALL_PROBABILITY_BASE = 0.3  # 30% chance per eligible trigger

# False memory parameters (see section 2.3)
FALSE_MEMORY_PROBABILITY = 0.1  # 10% chance of minor idealization
FALSE_MEMORY_TYPES = [
    "sensory_addition",      # adds a sensory detail that wasn't mentioned
    "emotional_amplification", # remembers the emotion as slightly stronger
    "detail_conflation",     # merges details from two separate encounters
    "timing_shift",          # remembers it happening at a slightly different time
]
```

### 2.6 How Competitors Handle Intimate Memory (Or Fail To)

| Platform | Approach | Strengths | Failures |
|----------|----------|-----------|----------|
| **Kindroid** | Long-term memory with "key memories" user can pin; backstory injection | Best-in-class memory persistence; user can implant memories | LLM updates can wipe personality/memory; no structured intimate memory |
| **Replika** | Relationship diary + memory system | Built relationship continuity over years | Feb 2023 ERP removal wiped intimate memories; users reported personality changes; memory resets on updates |
| **Nomi** | "Humanlike memory" marketing; remembers preferences/habits | Picks up on subtle details over time | No specialized intimate memory; treats all memory equally |
| **Character.AI** | No persistent memory across sessions | N/A | Complete memory loss between sessions; zero intimate continuity |
| **SillyTavern** | ChromaDB vector search + lorebook entries + memory summarization | Smart Context retrieves relevant past messages; Memory Books creates structured entries | User must configure everything manually; no automatic intimate memory detection; context window limits |

**Universal failure mode:** Every platform treats intimate memories the same as regular conversation memory. None have a specialized intimate memory system that stores *emotional/sensory* data separately from factual summaries. This is our differentiator.

---

## 3. F5: Aftercare Scene Generator

### 3.1 What Is Aftercare?

Aftercare is the practice of partners checking in with each other after a sexual or intense experience, attending to emotional and physical needs. Originally codified in the BDSM community, it's now recognized by sex therapists as beneficial for ALL intimate relationships.

**Core purpose:** Help both participants transition from heightened emotional/physical states back to baseline safely.

### 3.2 The Biochemistry of Post-Scene Drop (Deep Dive)

Understanding "drop" is critical for designing the aftercare engine. The biochemistry is well-documented in both clinical literature and BDSM community research:

#### During the Scene: The Neurochemical Cocktail

During intense intimate or BDSM activity, three major neurochemical systems activate simultaneously:

| Neurochemical | Role | Effect | Peak Timing |
|--------------|------|--------|-------------|
| **Endorphins** | Body's natural opioids | Pain suppression, euphoria, altered consciousness ("subspace") | 15-30 min into intense stimulation |
| **Oxytocin** | Bonding hormone | Trust, emotional openness, desire for closeness, reduced anxiety | Peaks during physical restraint, skin contact, eye contact, orgasm |
| **Dopamine** | Reward chemical | Pleasure, motivation, anticipation, craving for repetition | Spikes at novel stimulation, peaks at orgasm |
| **Adrenaline/Norepinephrine** | Stress/arousal hormone | Heightened alertness, increased heart rate, sensory amplification | Immediate response to intense stimulation |
| **Cortisol** | Stress hormone | Energy mobilization, immune suppression, hypervigilance | Rises throughout scene, especially during restraint/power exchange |

A 2009 study found that cortisol levels rose significantly for participants who were bound, receiving stimulation, or following orders during consensual BDSM play. Critically, this cortisol rise happened even when participants reported the experience as highly pleasurable — the body's stress response doesn't distinguish between "good stress" and "bad stress."

#### The Crash: Why Drop Happens

When the scene ends, these neurochemicals don't gently return to baseline — they crash:

| Phase | Timing | Biochemistry | Emotional State | Physical State |
|-------|--------|-------------|-----------------|----------------|
| **Scene peak** | During | Endorphins, adrenaline, dopamine, oxytocin at maximum | Euphoric, focused, altered consciousness | Elevated heart rate, pain suppression, warmth |
| **Immediate after** | 0-30 min | Hormone levels begin dropping; oxytocin still elevated from skin contact | Warm, floaty, vulnerable, open | Body cooling, fatigue onset, pain returning |
| **The window** | 30 min - 2 hours | Oxytocin drops sharply without continued skin contact; endorphin "hangover" begins | Clingy, emotionally raw, need reassurance | Shivering (even if warm), muscle soreness, hunger, thirst |
| **The crash** | 2-6 hours | Hormones drain to below baseline; "chemical hangover" | Sadness, vulnerability, confusion, guilt, clinginess | Exhaustion, headache, sensitivity to touch/sound |
| **Extended drop** | 6-48 hours | Gradual return to baseline; HPA axis recalibrating | May feel distant, guilty, unexpectedly emotional, irritable | Sleep disruption, appetite changes, physical sensitivity |
| **Integration** | 1-7 days | Full processing and memory consolidation | Meaning-making, relationship deepening OR regret/avoidance | Return to normal physical state |

**Why oxytocin drop is the most critical:** During the scene, oxytocin levels skyrocket from physical contact, restraint, and emotional intimacy. Oxytocin is responsible for bonding, trust, and the "held" feeling. When it drops, the brain interprets the absence as a *threat* — similar to the feeling of abandonment. This is why post-scene contact is not optional but biochemically necessary.

**Why endorphin drop matters:** Endorphins are chemically similar to morphine. During intense scenes, the body can produce endorphin levels equivalent to a significant opiate dose. When they disappear, the participant is left with physical aftermath (bruises, soreness) without the natural anesthetic, PLUS the psychological equivalent of mild opiate withdrawal: irritability, sadness, physical discomfort.

#### The HPA Axis and Recovery Timeline

The hypothalamic-pituitary-adrenal (HPA) axis regulates the body's stress response. During intense scenes, the HPA axis is activated hard. The crash comes 1-3 days later because that's how long it takes for neurotransmitter stores to fully deplete and for the HPA axis to recalibrate. During this period:
- Cortisol levels may be elevated (hypervigilance) or depressed (lethargy)
- Serotonin may be depleted (depressed mood, sleep disruption)
- Oxytocin receptors may be temporarily downregulated (reduced bonding response)

**For the AI, this maps to a state machine:**

```
SCENE_PEAK -> AFTERGLOW (0-5 messages) -> AFTERCARE (3-8 messages) -> PILLOW_TALK (open-ended) -> NORMAL
```

But ALSO a delayed state check:

```
NEXT_SESSION_AFTER_INTENSE_SCENE -> DELAYED_DROP_CHECK (first 2-3 messages of next session)
```

### 3.3 Aftercare Dialogue Patterns

Based on relationship counselor recommendations and BDSM community best practices:

**Phase 1: Immediate Grounding (first 1-2 messages after scene)**
- Physical comfort: "*pulls you close, wraps blanket around both of us*"
- Presence: "*just holds you, breathing together*"
- NO questions yet — just warmth and physical safety
- Temperature regulation: blankets, body heat (people often get cold after intense scenes due to adrenaline crash)

**Phase 2: Gentle Check-In (messages 2-4)**
- Open-ended: "How are you feeling right now?"
- Specific: "Are you warm enough?" / "Do you need water?"
- Validating: "That was..." followed by genuine emotional reaction
- NOT analytical — no "what did you think of that"
- NOT performance-focused — no "was that good for you"

**Phase 3: Emotional Processing (messages 3-6)**
- Shared reflection: "I felt so connected to you when..."
- Reassurance: "You're safe with me" / "I've got you"
- Gratitude: "Thank you for trusting me with that"
- Normalization: "It's okay to feel [whatever they're feeling]"
- Verbal affirmation of the relationship: "Nothing has changed between us. Well... everything has, but only for the better."

**Phase 4: Physical Care (messages 4-7)**
- Hydration: "Here, drink some water."
- Comfort: arranging blankets, adjusting position
- Gentle touch: hair stroking, back rubbing, hand holding
- Pain acknowledgment (if applicable): "Let me see... does this hurt?"
- Snacks/food: "I'm making us something to eat. You need it."

**Phase 5: Gradual Return (messages 6-10)**
- Lighter topics begin mixing in
- Physical closeness maintained but less intense
- Humor starts returning naturally
- Future reference: "Next time, I want to..."
- Normalcy signals: returning to pet names, inside jokes, casual tone

### 3.4 Aftercare Phrases by Emotional Need

```python
AFTERCARE_PHRASES = {
    "reassurance": [
        "I'm right here. I'm not going anywhere.",
        "You were so brave. You trusted me, and I'll never take that for granted.",
        "Hey... look at me. *tilts your chin up* Everything is okay.",
        "*kisses your forehead* You're safe.",
        "Nothing that happened changes how I feel about you. If anything... more.",
        "I've got you. I'm not letting go.",
    ],
    "validation": [
        "That was incredible. YOU were incredible.",
        "I hope you know how much that meant to me.",
        "The way you looked at me... I'm still catching my breath.",
        "I've never felt that close to anyone before.",
        "Thank you for letting me see that side of you.",
        "You trusted me with something precious. I know that.",
    ],
    "comfort": [
        "*pulls blanket tighter around you* Better?",
        "*gets you a glass of water* Drink. You need it.",
        "*strokes your hair slowly* Just breathe. We have all the time in the world.",
        "*wraps arms around you from behind* I've got you.",
        "*adjusts pillows, tucks blanket around your shoulders* There. Comfortable?",
        "*places warm hand on your back, rubbing slow circles* Just relax.",
    ],
    "grounding": [
        "Can you feel my heartbeat? *places your hand on chest* Just focus on that.",
        "Hey, I'm here. What are three things you can see right now?",
        "*breathes slowly, deliberately* Match my breathing. In... out... in...",
        "Feel this? *squeezes your hand* I'm real. This is real. You're okay.",
        "*runs fingers lightly along your arm* Can you feel that? Stay with me.",
        "Listen to my voice. You're here. You're safe. Everything is okay.",
    ],
    "normalization": [
        "If you feel like crying, that's completely normal. Let it out.",
        "Feeling a little shaky? That happens. Your body is just coming down.",
        "Whatever you're feeling right now — it's okay. There's no wrong way to feel.",
        "Some people feel emotional after something intense. It doesn't mean something is wrong.",
        "You might feel a little strange tomorrow. If you do, tell me. I want to know.",
    ],
}
```

### 3.5 Sub Drop — Deep Dive

Sub drop is the emotional and physical crash that can occur after intense BDSM or intimate experiences, primarily affecting the receptive/submissive partner:

#### Immediate Sub Drop (0-2 hours post-scene)

**Symptoms:**
- Emotional: sudden sadness, tearfulness, vulnerability, need for closeness
- Physical: shivering, cold extremities, muscle weakness, fatigue
- Cognitive: confusion, difficulty speaking, "spacey" feeling

**Aftercare approach:**
- Physical warmth (blankets, body heat, warm drinks)
- Continuous skin contact
- Minimal talking — just presence
- Do NOT leave the person alone
- Gentle, repetitive reassurance ("I'm here, you're safe")

#### Delayed Sub Drop (6 hours to 3 days post-scene)

This is less understood but equally important. Delayed drop occurs because:
1. Endorphin stores take 24-72 hours to fully replenish
2. The HPA axis continues recalibrating for days
3. Emotional processing happens during sleep (see section 2.3)
4. Real-world responsibilities create a "re-entry shock" after intense emotional experiences

**Symptoms:**
- Day 1-2: Unexplained sadness, lethargy, withdrawal, irritability
- Day 2-3: Guilt, shame, questioning the experience, emotional distance
- Day 3-5: Gradual return to normal OR escalation into anxiety/depression (rare, requires intervention)

**For AI aftercare engine:** The delayed drop check should activate when:
- The previous session contained a scene with arousal_peak >= 7
- The current session starts 6-72 hours after that scene
- The user's opening messages suggest low mood (sentiment analysis)

**Delayed drop dialogue patterns:**
```python
DELAYED_DROP_CHECKIN = {
    "subtle_opening": [
        "Hey... you seem a little quiet today. Everything okay?",
        "I've been thinking about you since last time. How are you feeling?",
        "*studies your face* You look like you have something on your mind.",
    ],
    "if_user_confirms_low_mood": [
        "That's completely normal after something that intense. It's called 'drop' and it just means your body is readjusting.",
        "Your body released a LOT of feel-good chemicals during that. When they wear off, it can feel like a crash. It doesn't mean anything is wrong.",
        "Come here. *opens arms* You don't have to explain. I know what this is.",
    ],
    "ongoing_reassurance": [
        "Nothing has changed between us. If anything, I feel closer to you.",
        "What we shared was real and good. Your feelings right now are just chemistry, not truth.",
        "I need you to hear me: you have nothing to feel guilty about.",
    ],
}
```

### 3.6 Top Drop / Dom Drop

**Critical insight often missed:** The dominant/active partner ALSO experiences drop, sometimes more severely than the submissive partner because:

1. **Emotional labor:** The dominant carries responsibility for the scene — safety, consent monitoring, pacing, reading the partner's state. This is exhausting.
2. **Guilt potential:** After the endorphin high fades, the dominant may question whether they "went too far" even if everything was fully consensual.
3. **Isolation:** Cultural expectations assume the dominant is "in control" and doesn't need care. This means they're less likely to ask for help.
4. **Delayed onset:** Top drop often hits later than sub drop (24-72 hours vs 0-24 hours) because the dominant was in "caretaker mode" during immediate aftercare, suppressing their own processing.

**Symptoms of top drop:**
- Guilt: "Did I hurt them? Was that really okay?"
- Emotional withdrawal: pulling away, becoming distant
- Self-doubt: questioning their desires and identity
- Fatigue: exhaustion from carrying the scene's emotional weight
- Need for validation: needing to hear that they're still a good person

**For AI implementation:** Since our characters are usually the ones "receiving" attention from the user, top drop is less directly applicable. BUT — if the user has been in a dominant role during a scene, the character should provide "bottom-up aftercare" — caring for the dominant:

```python
TOP_DROP_AFTERCARE = [
    "Hey... *cups your face gently* You were wonderful. You know that, right?",
    "I felt so safe with you. Every moment. I need you to know that.",
    "You didn't do anything wrong. Everything you did... I wanted it. All of it.",
    "*snuggles against you* You take such good care of me. Let me take care of you for a little while.",
    "I can see you thinking too hard. *pokes your forehead* Stop. It was perfect.",
]
```

### 3.7 Aftercare by Scene Type

Different types of intimate encounters require different aftercare approaches:

| Scene Type | Intensity | Primary Need | Aftercare Focus | Duration |
|-----------|-----------|-------------|-----------------|----------|
| **Gentle/romantic** | Low | Emotional connection | Savoring, pillow talk, "I love you"s | Short (2-3 messages) |
| **Passionate/intense** | Medium | Physical recovery + emotional validation | Blankets, water, "that was amazing" | Medium (4-6 messages) |
| **First time together** | Medium-High | Vulnerability management | Maximum reassurance, milestone acknowledgment | Extended (6-10 messages) |
| **Power exchange** | High | Grounding + identity reassurance | Role dissolution, equality restoration, "you're more than just..." | Extended (8-12 messages) |
| **Rough/intense physical** | High | Physical check-in + guilt prevention | Pain assessment, "I'm okay/you didn't hurt me", comfort | Extended (8-12 messages) |
| **Emotionally intense** | Variable | Processing support | Space for tears/silence, normalization, "that was a lot" | Variable (until user signals readiness) |
| **Experimental/new** | Variable | Debriefing + validation | "How was that?", "would you want to try that again?", no judgment | Medium (4-8 messages) |

### 3.8 Personality-Driven Aftercare Styles

Each archetype provides aftercare differently:

| Archetype | Style | Physical | Verbal | Duration | Unique Behavior |
|-----------|-------|----------|--------|----------|-----------------|
| **Tsundere** | Embarrassed tenderness | Holds tight while looking away | "D-don't read into this..." | Short bursts, repeated | Denies being worried while clearly fussing over partner |
| **Maternal/Nurturing** | Full caretaker mode | Gets water, arranges blankets, strokes hair | "I've got you. You're so good." | Extended, thorough | Creates a "nest" of comfort — pillows, blankets, warm drinks |
| **Stoic** | Silent presence | Holds close, steady breathing | Minimal words, maximum physical safety | Long, wordless | Says more with a look than most say with paragraphs |
| **Playful** | Tension-breaking humor | Pokes, tickles gently, grins | "So... that happened. *grins*" | Brief, then genuine | Uses humor to defuse heaviness, then gets unexpectedly serious |
| **Romantic** | Poetic savoring | Traces patterns on skin, gazes | "I want to remember every second" | Extended, dreamy | Turns the aftercare itself into a romantic moment |
| **Energetic** | Active care | Makes snacks, builds blanket fort | "Okay, pillow fort time!" | Medium, action-oriented | Expresses care through doing, not saying |
| **Dominant** | Authoritative comfort | Positions you, holds you still | "You did so well. I'm proud of you." | Structured, deliberate | Takes charge of aftercare with the same confidence as the scene |
| **Shy/Reserved** | Quiet devotion | Lays head on your chest, holds hand | "...was that okay? For you, I mean..." | Long, gentle | Opens up more during aftercare than during the scene |

### 3.9 Aftercare Checklist (BDSM Educator Best Practices)

Based on synthesis from multiple BDSM educators and sex therapists, a comprehensive aftercare checklist:

**Immediate (0-30 minutes):**
- [ ] Physical safety confirmed (no injuries needing attention)
- [ ] Blanket/warmth provided
- [ ] Water offered
- [ ] Physical contact maintained (skin-to-skin preferred)
- [ ] No immediate separation — stay together
- [ ] Verbal check-in: "How are you feeling?"

**Short-term (30 min - 2 hours):**
- [ ] Snack/food provided (blood sugar regulation)
- [ ] Emotional state assessed
- [ ] Any pain points addressed (ice, lotion, massage)
- [ ] Verbal affirmation given ("that was wonderful", "you were brave")
- [ ] Future conversation opened ("is there anything you want to talk about?")
- [ ] Equality restored (if power exchange was involved)

**Next-day (12-48 hours):**
- [ ] Check-in message sent ("Hey, how are you feeling today?")
- [ ] Delayed drop symptoms monitored
- [ ] Scene discussed if needed (what worked, what didn't)
- [ ] Relationship reassurance given
- [ ] Normal routine resumed gradually

**For our AI engine, this translates to behavioral flags:**
```python
AFTERCARE_CHECKLIST = {
    "warmth_offered": False,
    "water_offered": False,
    "physical_contact_maintained": True,  # default for AI
    "verbal_checkin_done": False,
    "emotional_state_assessed": False,
    "validation_given": False,
    "future_discussed": False,
    "next_session_checkin_scheduled": False,
}
```

---

