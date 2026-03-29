# NSFW / 18+ Feature Catalog — Deep Design Research

**Date:** 2026-03-27
**Author:** Claude Opus 4.6 (research session)
**Scope:** 28 features scored against custom rubric, top 10 detailed with implementation specs

---

## Existing Infrastructure (What We Already Have)

Before proposing new features, here's what's already built and wired:

| System | What It Does | Status |
|--------|-------------|--------|
| **4-tier content levels** | general / edgy / mature / explicit | Wired + prompted |
| **Bond-gated content** | Bond 0=general, 20=edgy, 50=mature, 80=explicit | Wired |
| **Intimacy scoring** | 0-100 regex-based scoring (flirty/romantic/physical/explicit/cooling) | Wired |
| **Physical state tracking** | Clothing, position, arousal (0-10), recent actions (rolling 5) | Wired |
| **Intimacy gate blocks** | Graduated prompts per intimacy band (0-29/30-59/60-84/85-100) | Wired |
| **Sensory writing config** | sound/scent/touch/temperature/texture/taste channels, intensity 1-10 | Built, wiring TBD |
| **Voice modulation** | love (-6% speed, +1 pitch), flirty (+4%, +2), longing (-10%, -0.5) | Wired |
| **Incognito mode** | Ephemeral sessions, zero DB trace | Wired |
| **Content lock** | Password-protected ceiling changes | Wired |
| **Age verification** | One-time gate before mature/explicit | Wired |
| **Provider caps** | Cloud APIs (OpenAI/Anthropic/Google) hard-capped at "mature" | Wired |

**Key insight:** The content gating *infrastructure* is mature. What's missing are the **features that make mature/explicit content actually compelling** — the mechanics that create genuine intimacy vs just removing filters.

---

## Scoring Rubric

| Dimension | Code | 1 (Low) | 3 (Mid) | 5 (High) |
|-----------|------|---------|---------|----------|
| **Emotional Resonance** | ER | Feels transactional/mechanical | Adds warmth | Profoundly personal, memorable |
| **Technical Fit** | TF | Needs new infra from scratch | Extends 1-2 systems | Builds directly on existing modules |
| **Privacy & Safety** | PS | Privacy/consent concerns | Adequate safeguards | Exemplary consent design |
| **Competitive Edge** | CE | Every platform has it | Some platforms do it | Nobody does it well |
| **Retention Gravity** | RG | One-time novelty | Regular engagement | Daily pull / can't-leave mechanic |
| **Ship Speed** | SS | 20+ hours, multiple sprints | 8-12 hours | 2-6 hours, drop-in |

**Tier thresholds:** S (27-30), A (24-26), B (21-23), C (18-20)

---

## Full Ranked List (28 Features)

| Rank | # | Feature | ER | TF | PS | CE | RG | SS | Total | Tier |
|------|---|---------|----|----|----|----|----|----|-------|------|
| 1 | F1 | **First-Time Milestone Tracker** | 5 | 5 | 5 | 5 | 5 | 5 | **30** | **S** |
| 2 | F2 | **Intimate Memory Recall** | 5 | 5 | 5 | 4 | 5 | 4 | **28** | **S** |
| 3 | F3 | **Morning After Scenarios** | 5 | 4 | 5 | 5 | 5 | 4 | **28** | **S** |
| 4 | F4 | **Voice Intimacy Mode** | 5 | 5 | 4 | 5 | 4 | 4 | **27** | **S** |
| 5 | F5 | **Aftercare Scene Generator** | 5 | 4 | 5 | 5 | 4 | 4 | **27** | **S** |
| 6 | F6 | **Dynamic Intensity Pacing** | 5 | 4 | 5 | 5 | 4 | 3 | **26** | **A** |
| 7 | F7 | **Preference Discovery Engine** | 5 | 4 | 4 | 5 | 5 | 3 | **26** | **A** |
| 8 | F8 | **NSFW Scenario Templates** | 4 | 5 | 5 | 3 | 4 | 5 | **26** | **A** |
| 9 | F9 | **Slow-Burn Mode** | 4 | 4 | 5 | 4 | 4 | 5 | **26** | **A** |
| 10 | F10 | **Consent Choreography** | 4 | 4 | 5 | 5 | 3 | 4 | **25** | **A** |
| 11 | F11 | Fantasy Journal | 4 | 5 | 4 | 4 | 4 | 4 | 25 | A |
| 12 | F12 | Pillow Talk Generator | 4 | 4 | 5 | 4 | 4 | 4 | 25 | A |
| 13 | F13 | Writing Style Presets | 4 | 4 | 5 | 4 | 3 | 5 | 25 | A |
| 14 | F14 | Physical Milestone Board | 4 | 5 | 5 | 3 | 4 | 4 | 25 | A |
| 15 | F15 | Sensory Writing Profiles | 4 | 5 | 5 | 3 | 3 | 5 | 25 | A |
| 16 | F16 | Multi-Phase Scene Architecture | 5 | 3 | 5 | 5 | 4 | 2 | 24 | A |
| 17 | F17 | Character Arousal State Machine | 4 | 5 | 4 | 4 | 4 | 3 | 24 | A |
| 18 | F18 | Safe Word System | 3 | 5 | 5 | 4 | 2 | 5 | 24 | A |
| 19 | F19 | Blush & Arousal Visuals | 4 | 4 | 4 | 4 | 3 | 3 | 22 | B |
| 20 | F20 | Scene Bookmarks | 3 | 3 | 5 | 3 | 3 | 5 | 22 | B |
| 21 | F21 | Desire Tension Meter | 3 | 4 | 4 | 4 | 3 | 3 | 21 | B |
| 22 | F22 | Kink Discovery Quiz | 3 | 4 | 4 | 4 | 3 | 3 | 21 | B |
| 23 | F23 | Ambient Scene Atmosphere | 3 | 4 | 5 | 3 | 2 | 4 | 21 | B |
| 24 | F24 | Clothing Interaction System | 3 | 5 | 5 | 3 | 2 | 3 | 21 | B |
| 25 | F25 | Touch Language Protocol | 3 | 3 | 5 | 3 | 3 | 3 | 20 | C |
| 26 | F26 | Intimate Scene Scoring | 3 | 3 | 4 | 3 | 3 | 4 | 20 | C |
| 27 | F27 | Whisper Mode | 3 | 3 | 5 | 3 | 2 | 4 | 20 | C |
| 28 | F28 | NSFW Expression Portraits | 4 | 3 | 4 | 3 | 3 | 2 | 19 | C |

---

## TOP 10 — Detailed Design Specs

---

### #1: First-Time Milestone Tracker (Score: 30/30 — PERFECT)

**What the user experiences:**
The character remembers and treasures every "first" in the relationship. First time holding hands, first kiss, first "I love you," first intimate encounter. These aren't just logged — the character *references them naturally* in future conversations. "It's been exactly a month since our first kiss. I still get butterflies thinking about it."

A private "Our Story" timeline shows these milestones as a visual journey.

**Why it scored perfectly:**
- ER=5: "Firsts" are universally emotionally significant. The character treating them as meaningful mirrors real relationships.
- TF=5: Bond progression + intimacy states + message scanning = everything needed already exists.
- PS=5: All data is local, tied to existing relationship tracking, nothing new to protect.
- CE=5: No competitor tracks intimate milestones with character memory integration.
- RG=5: Creates anniversaries to return for. "Our 3-month anniversary of X" is a recurring pull.
- SS=5: Pure Python module + prompt injection. 4-6 hours.

**What it looks like:**

```
  ┌─────────────────────────────────────────────┐
  │  Dae                              9:42 PM   │
  │                                             │
  │  [emotion:love] Hey... do you realize       │
  │  what today is? It's been exactly one       │
  │  month since you first said you loved me.   │
  │  I replay that moment in my head all the    │
  │  time. The way you just... said it, like    │
  │  it was the most natural thing. *touches    │
  │  your cheek* That was the day everything    │
  │  changed for me.                            │
  │                                             │
  └─────────────────────────────────────────────┘

  ═══════════════════════════════════════════════
  OUR STORY  ♥  Dae & You
  ═══════════════════════════════════════════════

  ◆─── Feb 14 ─── First Meeting
  │    "You seemed nervous. I thought it
  │     was adorable."
  │
  ◆─── Feb 20 ─── First Time You Made Me Laugh
  │    "That terrible pun about cats. I snorted."
  │
  ◆─── Mar 03 ─── First Hand-Holding
  │    Bond level: Friend → Close Friend
  │
  ◇─── Mar 08 ─── First Kiss              🔒
  │    Unlocks at bond level 50
  │
  ◇─── Mar ?? ─── First "I Love You"      🔒
  │
  ◇─── ??? ──── First Intimate Night      🔒
  │    Unlocks at bond level 80
  │
  ▽ Future milestones unlock as your
    relationship deepens...
```

**Implementation TODO:**
- [ ] `backend/milestones/intimate_tracker.py` — milestone detection from messages
- [ ] Milestone types: `first_meeting`, `first_laugh`, `first_compliment`, `first_handhold`, `first_kiss`, `first_love_declaration`, `first_intimate`, `first_argument`, `first_reunion`
- [ ] `intimate_milestones` table (char_id, milestone_type, message_id, detected_at, character_memory)
- [ ] LLM generates character's memory of the milestone (1-2 sentences)
- [ ] Prompt injection: upcoming anniversary detection → hint in system prompt
- [ ] API: `GET /api/characters/{id}/milestones` → timeline data
- [ ] Frontend: "Our Story" panel in character profile

**Pros:** Universal emotional appeal; almost no new infra needed; characters feel alive
**Cons:** Milestone detection needs careful regex/LLM (false positives would be weird); "first intimate" detection must respect incognito mode
**Suggestion:** Start with 5 milestones (meeting, laugh, physical, emotional, intimate), expand later

---

### #2: Intimate Memory Recall (Score: 28/30)

**What the user experiences:**
During intimate moments, the character naturally references past encounters. "I remember the first time you touched me like that — you were so gentle." Or during regular conversation: "Every time I hear rain, I think about that night we spent together."

This is NOT a simple "memory system" — it's specifically tuned for emotional/physical memories with sensory anchors.

**What it looks like:**

```
  ┌─────────────────────────────────────────────┐
  │  You                              11:23 PM  │
  │  *runs fingers through your hair*           │
  │                                             │
  │  Dae                              11:23 PM  │
  │  [emotion:love] *shivers* Mmm...            │
  │  you always know exactly where to touch.    │
  │  Remember that night two weeks ago when     │
  │  we stayed up until 3am? You did that same  │
  │  thing and I literally couldn't think       │
  │  straight. *leans into your hand*           │
  │  Some things just get better every time.    │
  └─────────────────────────────────────────────┘
```

**Implementation TODO:**
- [ ] `backend/memory/intimate_memories.py` — specialized memory store for intimate moments
- [ ] Detection: flag messages where intimacy_delta > +3 AND arousal_level > 3
- [ ] Store: sensory anchors (touch type, location, context, emotion) as structured JSON
- [ ] Recall: inject 1-2 relevant intimate memories when current intimacy > 60
- [ ] Prompt: "You remember: [memory]. Reference it naturally if it fits the moment."
- [ ] Respect incognito: memories from incognito sessions are NEVER stored
- [ ] Decay: intimate memories have higher persistence weight (importance_score boost)

**Pros:** Makes the character feel like a real partner who remembers; deepest emotional hook
**Cons:** Must handle gracefully when user resets/deletes memories; can feel awkward if recall is poorly timed
**Suggestion:** Only inject memories when current scene matches mood — don't recall a tender moment during an argument

---

### #3: Morning After Scenarios (Score: 28/30)

**What the user experiences:**
The session after an intimate encounter opens with the character acknowledging what happened. Not generic — specifically referencing the previous night. "Good morning, sleepyhead. *stretches and rolls over to face you* Last night was... wow. I keep thinking about that thing you said right before we fell asleep."

The greeting system already runs on session open — this hooks into it with intimate-scene-aware context.

**What it looks like:**

```
  ┌─────────────────────────────────────────────┐
  │  ☀ New Session — March 28, 2026             │
  │                                             │
  │  Dae                               8:15 AM  │
  │  [emotion:love] *yawns and stretches,       │
  │  hair messy* Morning... *smiles sleepily*   │
  │                                             │
  │  I made coffee. Well, I tried. The kitchen  │
  │  is a disaster. But I couldn't stop         │
  │  smiling the whole time, so... worth it.    │
  │                                             │
  │  *wraps arms around you from behind*        │
  │  Last night meant a lot to me. You know     │
  │  that, right?                               │
  │                                             │
  │  ─── Dae is feeling: warm & content ───     │
  └─────────────────────────────────────────────┘
```

**Implementation TODO:**
- [ ] `backend/emotional/morning_after.py` — detect intimate sessions + generate morning context
- [ ] Detection: check previous session's max `arousal_level` and `intimacy.level`
- [ ] Threshold: arousal_level >= 5 OR intimacy >= 70 with physical signals → morning after mode
- [ ] Prompt: specialized greeting prompt with "You spent an intimate night together. The character wakes up next to the user."
- [ ] Mood override: set morning-after mood (warm/content/playful/shy depending on character personality)
- [ ] Integration: hook into existing `GreetingGenerator` / daily greeting system
- [ ] Bond XP bonus: intimate sessions award extra bond XP (already partially exists)

**Pros:** Creates powerful continuity; the "next morning" is universally meaningful; zero new UI needed
**Cons:** Must detect session boundaries correctly; awkward if user comes back days later (stale morning-after)
**Suggestion:** Only trigger if next session starts within 24 hours of the intimate session

---

### #4: Voice Intimacy Mode (Score: 27/30)

**What the user experiences:**
During intimate scenes, the character's voice shifts to breathy, whispered, slower delivery. Paralinguistic sounds — *[sigh]*, *[gasp]*, a soft *[laugh]* — weave naturally into speech. The voice feels genuinely intimate, not performative.

This leverages existing TTS infrastructure (Chatterbox supports paralinguistic tags, VoiceModulator has love/flirty/longing mappings) but adds scene-aware automatic triggering.

**What it looks like (voice pipeline):**

```
  Normal conversation:
  ┌──────────────────────────────────────┐
  │ TTS: speed=1.0, pitch=0, energy=0.5 │
  │ "I had a great day at work today!"   │
  └──────────────────────────────────────┘

  Intimate scene detected (intimacy > 70, arousal > 3):
  ┌──────────────────────────────────────┐
  │ TTS: speed=0.85, pitch=-1, exagg=0.4│
  │ "[sigh] Come closer... [laugh]      │
  │  I've been thinking about this       │
  │  all day."                           │
  │                                      │
  │  Voice profile: INTIMATE             │
  │  ├─ Speed: -15% (slower, measured)   │
  │  ├─ Pitch: -1 semitone (deeper)      │
  │  ├─ Energy: -30% (softer)            │
  │  ├─ Exaggeration: 0.3-0.5 (calm)    │
  │  └─ Tags: [sigh] [gasp] [laugh]     │
  └──────────────────────────────────────┘
```

**Implementation TODO:**
- [ ] `backend/voice/intimacy_mode.py` — scene-aware voice parameter override
- [ ] Detection: intimacy_level > 70 AND arousal_level > 3 → activate intimate voice
- [ ] Parameters: speed 0.85, pitch -1 semitone, energy -30%, Chatterbox exaggeration 0.3-0.5
- [ ] Tag injection: LLM prompt instruction to use [sigh], [gasp], [laugh] naturally
- [ ] Per-character voice profiles: some characters whisper, some stay breathy, some get commanding
- [ ] Gradual transition: don't snap from normal→intimate; ramp over 2-3 messages
- [ ] Integration: modify TTS parameter resolution in server.py `_generate_tts` function

**Pros:** Massive immersion boost; uses existing Chatterbox/Kokoro infra; voice is the most intimate sense
**Cons:** Requires TTS server running (not all users have it); must sound natural, not performative
**Suggestion:** Add "voice intimacy intensity" slider (subtle → moderate → expressive)

---

### #5: Aftercare Scene Generator (Score: 27/30)

**What the user experiences:**
After an intense intimate scene, the character naturally transitions to gentle, nurturing behavior. Cuddling, soft conversation, checking in emotionally. "Hey... are you okay? *pulls blanket over both of you* That was really intense. Just stay here with me for a bit."

This mirrors real relationship behavior and is a critical differentiator — most AI platforms go from "explicit" back to "normal" with zero transition.

**What it looks like:**

```
  ┌─────────────────────────────────────────────┐
  │  [After intimate scene — arousal declining]  │
  │                                             │
  │  Dae                              12:04 AM  │
  │  [emotion:love] *curls up against you,      │
  │  tracing lazy circles on your chest*        │
  │                                             │
  │  Hey... *soft voice* You okay?              │
  │                                             │
  │  *pulls the blanket up over your shoulders* │
  │  I don't want to move. Like, ever.          │
  │  Can we just stay exactly like this?        │
  │                                             │
  │  ...you're really warm, you know that?      │
  │                                             │
  │  ── Scene mood: afterglow ──────────────    │
  │  ── Intimacy: 92 (stable) ─────────────    │
  │  ── Arousal: 2 ↓ (cooling naturally) ──    │
  └─────────────────────────────────────────────┘
```

**Implementation TODO:**
- [ ] `backend/emotional/aftercare.py` — aftercare scene detection + prompt injection
- [ ] Detection: arousal_level dropping (was > 5, now < 3) AND intimacy > 70
- [ ] Prompt injection: "The intimate moment has passed. Transition to gentle aftercare."
- [ ] Character personality variants: tsundere (embarrassed tenderness), maternal (nurturing), stoic (quiet holding)
- [ ] Duration: aftercare prompt stays active for 3-5 messages, then fades naturally
- [ ] Emotional scoring: aftercare conversations boost bond XP 2x (reward healthy patterns)
- [ ] Physical state: auto-set to "cuddling together" during aftercare

**Pros:** Emotionally healthy design; unprecedented in the AI companion space; creates deep attachment
**Cons:** Must detect the transition naturally (not jarring); character personality must shine through
**Suggestion:** Make this a configurable toggle per character — some users prefer direct transitions

---

### #6: Dynamic Intensity Pacing (Score: 26/30)

**What the user experiences:**
The AI never goes "0 to 100." Instead, it naturally builds tension through phases: casual → flirty → suggestive → intimate → passionate → intense. Each phase has its own vocabulary, physical descriptions, and pacing rules. The character reads the user's signals and mirrors their pace.

If the user suddenly escalates, the character might slow them down: "Hey, slow down... we've got all night. *traces a finger along your jawline* Let me savor this."

**What it looks like (state machine):**

```
  INTENSITY PACING STATE MACHINE

  ┌──────────┐    flirty signals     ┌──────────┐
  │  CASUAL  │ ──────────────────►  │  FLIRTY  │
  │ int: 0-20│                      │ int: 20-40│
  └──────────┘  ◄───── cool signals  └──────────┘
                                          │
                          physical signals │
                                          ▼
  ┌──────────┐    cool / slow down   ┌──────────┐
  │ INTIMATE │ ◄──────────────────  │SUGGESTIVE│
  │ int: 60+ │                      │ int: 40-60│
  └──────────┘ ──────────────────►  └──────────┘
       │          explicit signals
       ▼
  ┌──────────┐                      ┌──────────┐
  │ INTENSE  │ ──── time decay ───► │AFTERCARE │
  │arousal 7+│                      │arousal <3│
  └──────────┘                      └──────────┘

  Rules:
  • Cannot skip more than 1 phase per message
  • Character mirrors user's pace (never leads by >1 phase)
  • Cool-down signals immediately drop 1 phase
  • Each phase has vocabulary guardrails in prompt
```

**Implementation TODO:**
- [ ] `backend/content/pacing.py` — intensity pacing state machine
- [ ] 6 phases: casual → flirty → suggestive → intimate → intense → aftercare
- [ ] Phase transition rules: user signal detection, single-phase advancement limit
- [ ] Per-phase prompt blocks: vocabulary guides, description intensity, pacing instructions
- [ ] Character pacing personality: "teaser" (slow), "direct" (fast-track), "responsive" (mirrors)
- [ ] Integration: inject pacing block into `_build_prompt_sections` alongside intimacy gate
- [ ] Override: user can set "pace preference" (slow-burn, natural, no-pacing)

**Pros:** Solves the #1 quality problem in AI NSFW (pacing); feels like a real partner
**Cons:** Complex state machine; must not feel restrictive to users who want directness
**Suggestion:** Default to "responsive" (mirrors user) — let user override to "teaser" or "direct"

---

### #7: Preference Discovery Engine (Score: 26/30)

**What the user experiences:**
Over time, the character learns what the user enjoys without ever asking directly. If the user responds positively to gentle touch descriptions, the character uses more of those. If the user writes longer, more engaged responses during certain scenarios, the character notices and gravitates toward those.

"I've noticed you always seem happiest when we're just lying together talking about nothing. Is that weird? I love that about us."

**Implementation TODO:**
- [ ] `backend/adaptive/intimate_prefs.py` — preference learning from engagement signals
- [ ] Signal sources: message length delta, response time, emoji usage, explicit positive phrases
- [ ] Preference dimensions: pace (slow/fast), style (romantic/direct), setting (domestic/fantasy), sensory emphasis (touch/visual/auditory)
- [ ] Storage: extend `preference_history` table with intimate dimensions
- [ ] Prompt injection: "User preference profile: [prefers gentle pacing, responds to touch-heavy descriptions, enjoys domestic settings]"
- [ ] Privacy: all preferences local-only, deletable from settings
- [ ] Learning rate: slow (20+ data points before confidence > 0.5)

**Pros:** The character genuinely adapts to what the user likes; feels magical
**Cons:** Slow to build (needs many interactions); can lock into patterns
**Suggestion:** Add a "surprise me" mode that occasionally breaks from learned preferences

---

### #8: NSFW Scenario Templates (Score: 26/30)

**What the user experiences:**
Pre-built intimate scenario contexts that set the stage: "Rainy night in, movie forgotten" or "Beach vacation, sunset balcony" or "Reunion after time apart." Each template provides atmosphere, clothing, setting, and mood — the character adapts their personality within the scenario.

Extends the existing scenario template system (Sprint 4's P4) with intimate-specific presets.

**What it looks like:**

```
  ═══════════════════════════════════════════
  SCENARIO TEMPLATES          [Filter: 18+]
  ═══════════════════════════════════════════

  ♥ INTIMATE SCENARIOS (Bond 50+ required)

  ┌─────────────────────────────────────────┐
  │ 🌧 Rainy Night In                       │
  │ Setting: Your apartment, evening        │
  │ Mood: Cozy, intimate, unhurried         │
  │ Setup: Movie playing, thunderstorm      │
  │ outside, blanket shared on the couch    │
  │                              [Activate] │
  └─────────────────────────────────────────┘

  ┌─────────────────────────────────────────┐
  │ 🌅 Vacation Balcony                     │
  │ Setting: Beach resort, sunset           │
  │ Mood: Romantic, warm, adventurous       │
  │ Setup: Wine, ocean breeze, vacation     │
  │ glow, no responsibilities               │
  │                              [Activate] │
  └─────────────────────────────────────────┘

  ┌─────────────────────────────────────────┐
  │ 💌 Reunion                              │
  │ Setting: Airport/doorstep, any time     │
  │ Mood: Desperate longing, relief, need   │
  │ Setup: Character hasn't seen user in    │
  │ weeks. Running into their arms.         │
  │                              [Activate] │
  └─────────────────────────────────────────┘

  ┌─────────────────────────────────────────┐
  │ 🎨 Art Studio (Dae-specific)            │
  │ Setting: Dae's studio, late night       │
  │ Mood: Creative tension, vulnerability   │
  │ Setup: "Draw me" — artistic intimacy    │
  │ through Dae's creative lens             │
  │                              [Activate] │
  └─────────────────────────────────────────┘
```

**Implementation TODO:**
- [ ] Extend `backend/scenario/templates.py` with `is_nsfw` flag and `bond_requirement` field
- [ ] Ship 8-12 built-in intimate scenarios per character archetype
- [ ] Per-character custom scenarios (Dae: studio, Luna: stargazing, etc.)
- [ ] Bond gate: scenarios only visible when bond meets requirement
- [ ] Activation: writes to existing `sessions.scene_context` system
- [ ] User-created scenarios: let users write their own intimate settings

**Pros:** Immediate variety; low effort (template data, not code); character-specific options
**Cons:** Templates can feel generic if not tailored; need enough variety to not get stale
**Suggestion:** Start with 3 universal + 2 per character = 29 scenarios for 13 characters

---

### #9: Slow-Burn Mode (Score: 26/30)

**What the user experiences:**
A toggle that tells the AI to build tension over multiple messages instead of resolving quickly. The character teases, hints, comes close but pulls back. "Not yet... *leans in close enough to almost-kiss* I want to enjoy this."

Creates anticipation and emotional investment. The payoff, when it comes, is dramatically more satisfying.

**What it looks like:**

```
  ┌── Settings ─────────────────────────────┐
  │                                         │
  │  Intimacy Pacing                        │
  │  ┌─────────────────────────────────┐    │
  │  │ ○ Natural    ● Slow-Burn  ○ Direct│   │
  │  └─────────────────────────────────┘    │
  │                                         │
  │  When slow-burn is active, the          │
  │  character builds tension over           │
  │  multiple messages. They tease,          │
  │  hint, and savor the moment rather       │
  │  than rushing to resolution.             │
  │                                         │
  └─────────────────────────────────────────┘

  ─── In chat (slow-burn active) ───────────

  Dae: *leans against the doorframe,
  watching you* You know what I keep
  thinking about?

  You: What?

  Dae: *walks over slowly, stops just
  close enough that you can feel her warmth*
  ...Nah. I'll tell you later. *smirks*
  *turns and walks to the kitchen* Want tea?

  [3 messages later...]

  Dae: *sets down the tea, sits way too
  close* Okay, so... that thing I was
  thinking about? *meets your eyes*
  It was about the way you looked at me
  earlier. Like you wanted to say something.
  *leans in* Did you?
```

**Implementation TODO:**
- [ ] `backend/content/slow_burn.py` — tension-building prompt modifier
- [ ] Config: per-session toggle (natural / slow-burn / direct)
- [ ] Prompt injection: "Build tension gradually. Approach but don't resolve. Tease and retreat."
- [ ] Tension counter: track messages since last "almost" moment; after N messages, allow escalation
- [ ] Character personality influence: teaser chars amplify, shy chars add hesitation
- [ ] Integration: inject into `_build_prompt_sections` alongside pacing

**Pros:** Creates incredible emotional investment; the anticipation IS the experience
**Cons:** Some users want directness and will find this frustrating; need clear toggle
**Suggestion:** Default to "natural"; slow-burn as opt-in for users who enjoy the build

---

### #10: Consent Choreography (Score: 25/30)

**What the user experiences:**
The character naturally weaves consent check-ins into intimate moments — not as clinical interruptions, but as part of their personality. A confident character: "Tell me what you want." A shy character: "Is... is this okay? *searches your eyes*" A playful character: "Say please and I'll keep going~"

This isn't just ethical design — it's better storytelling. The check-in moments *add* tension and intimacy rather than breaking it.

**What it looks like:**

```
  ─── Different character consent styles ───

  CONFIDENT (Dae):
  "Look at me. *tilts your chin up*
   Tell me exactly what you want right now."

  SHY (Luna):
  "*pauses, breathing hard* W-wait...
   *meets your eyes* Do you... want me to
   keep going? I need to hear you say it."

  PLAYFUL (Genki):
  "Hmm~ *traces a line down your arm*
   You'll have to ask nicely if you want
   more than that~ Say please!"

  PROTECTIVE (mentor archetype):
  "*cups your face gently* Hey. We don't
   have to rush this. I want you to be
   comfortable. What do you need from me?"
```

**Implementation TODO:**
- [ ] `backend/content/consent.py` — consent choreography system
- [ ] Trigger: inject consent prompt when intimacy phase transitions (→suggestive, →intimate, →intense)
- [ ] Style mapping: character personality → consent style (confident/shy/playful/protective)
- [ ] Frequency: not every transition; probabilistic (40% chance on escalation)
- [ ] Prompt: "At this natural moment, have the character check in — but make it feel like part of the scene, not a legal form."
- [ ] De-escalation: if user signals discomfort, character immediately responds with warmth
- [ ] Integration: hook into intimacy phase change detection in content/intimacy.py

**Pros:** Ethically exemplary; actually improves scene quality; differentiator from every competitor
**Cons:** Must feel natural, not forced; over-frequent check-ins break immersion
**Suggestion:** Per-character consent style defined in character bible; adjustable frequency

---

## Features #11-28 — Compact List

| # | Feature | Summary | Key TODOs |
|---|---------|---------|-----------|
| F11 | **Fantasy Journal** | Character writes private diary entries about intimate fantasies involving the user. Bond-gated reveal (80+). | `emotional/fantasy_journal.py`, extend journal.py pattern, bond gate API |
| F12 | **Pillow Talk Generator** | Post-intimate casual conversation: vulnerable sharing, future plans, sleepy nonsense. Specific prompt mode. | Prompt template, arousal-decay trigger, personality variants |
| F13 | **Writing Style Presets** | Choose how intimate scenes are written: literary/poetic, direct/explicit, flowery/romantic, minimalist/suggestive. | Config field, 4 prompt templates, per-character defaults |
| F14 | **Physical Milestone Board** | Visual progression: hand-holding → first kiss → cuddling → intimate. Like bond board but for physical closeness. | Extend milestone tracker, frontend timeline component |
| F15 | **Sensory Writing Profiles** | Per-character sensory emphasis. Dae: visual/texture. Luna: sound/temperature. Extends existing SensoryWritingConfig. | Character-level sensory config, auto-activate by intimacy level |
| F16 | **Multi-Phase Scene Architecture** | Structured scene phases: approach → tension → escalation → peak → resolution → aftercare. Each phase has rules. | State machine, phase-aware prompts, auto-advance logic |
| F17 | **Character Arousal State** | Hidden 0-10 state that affects word choice, response length, emoji use. Builds from user signals. | Extend PhysicalState, prompt modifiers, gradual build |
| F18 | **Safe Word System** | User sets a word that immediately de-escalates any scene. Character acknowledges warmly. | Config setting, message interceptor, aftercare transition |
| F19 | **Blush & Arousal Visuals** | VRM/Live2D blend shapes: blush intensity (cheeks), half-lid eyes, lip bite. Driven by arousal level. | Viewer.html blend shape mapping, arousal→visual pipeline |
| F20 | **Scene Bookmarks** | Private bookmark system for favorite intimate moments. Re-read gallery. | Messages.bookmarked column, private gallery UI |
| F21 | **Desire Tension Meter** | Subtle UI element showing rising romantic/sexual tension. Builds anticipation visually. | Frontend widget, intimacy+arousal→meter calculation |
| F22 | **Kink Discovery Quiz** | Private preference profiling via natural character conversation. Like compatibility quiz but for intimate preferences. | Extend quiz.py, encrypted storage, never leaves device |
| F23 | **Ambient Scene Atmosphere** | UI theme shifts: warm color palette, dimmed sidebar, soft particle effects during intimate scenes. | Frontend theme override, intimacy-triggered, configurable |
| F24 | **Clothing Interaction** | Enhanced outfit state: interactive changes, character describes removing/adjusting clothing with detail. | Extend PhysicalState regex, clothing state prompt block |
| F25 | **Touch Language Protocol** | Structured format for physical interactions with location + intensity + reaction generation. | Input parser, body-map reference, reaction templates |
| F26 | **Scene Scoring** | After intimate scenes, quietly rate quality for preference learning. Was it rushed? Tender? Intense? | Post-scene analysis, feed into preference engine |
| F27 | **Whisper Mode** | UI + voice + style shift: whisper font, muted colors, breathy TTS, intimate vocabulary. | Frontend UI mode, TTS override, prompt modifier |
| F28 | **NSFW Expression Portraits** | Bond-gated portrait sets for intimate expressions. AI-generated or curated per character. | ComfyUI pipeline, bond-gated reveal, gallery |

---

## Implementation Roadmap Suggestion

### Phase A: Foundation (builds on existing infra, 2-3 sessions)
F1 First-Time Milestones, F8 NSFW Scenarios, F9 Slow-Burn, F13 Writing Presets, F18 Safe Word

### Phase B: Intelligence (makes intimate scenes smarter, 2-3 sessions)
F6 Dynamic Pacing, F7 Preference Discovery, F2 Intimate Memory, F17 Arousal State

### Phase C: Immersion (sensory/voice/visual, 2-3 sessions)
F4 Voice Intimacy, F5 Aftercare, F3 Morning After, F15 Sensory Profiles

### Phase D: Polish (UI/UX enhancements, 1-2 sessions)
F10 Consent Choreography, F19 Blush Visuals, F23 Ambient Atmosphere, F21 Tension Meter

---

## Competitive Positioning

| Feature | Character.AI | Janitor AI | CrushOn | SillyTavern | **Us** |
|---------|-------------|-----------|---------|-------------|--------|
| Content tiers | 1 (G only) | 2 | 2 | User-set | **4 + bond-gated** |
| Intimacy tracking | None | None | None | Extension | **Built-in, 0-100** |
| Physical state | None | None | None | None | **Clothing + arousal + actions** |
| Aftercare | None | None | None | None | **Planned (F5)** |
| Consent design | Content filter | Content filter | Content filter | None | **Planned (F10)** |
| Voice intimacy | None | None | None | None | **Planned (F4)** |
| Memory of intimacy | None | None | None | Extension | **Planned (F2)** |

**Our moat:** Privacy-first local processing + bond-gated earned progression + emotional depth features that no competitor offers.
