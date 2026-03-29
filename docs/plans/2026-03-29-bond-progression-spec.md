# Bond Progression System — Implementation Spec

**Date:** 2026-03-29
**Research basis:** `docs/research/2026-03-29-bond-progression-research.md`
**Status:** READY TO IMPLEMENT
**Estimated total effort:** 42-58 hours across 6 phases

---

## Table of Contents

1. [Current State Audit](#current-state-audit)
2. [Design Decisions](#design-decisions)
3. [XP Earning Model](#xp-earning-model)
4. [Unlock Table](#unlock-table)
5. [Phase 1: Enhanced XP Engine + Multipliers](#phase-1-enhanced-xp-engine--multipliers)
6. [Phase 2: Bond Bar UI + Level-Up Celebration](#phase-2-bond-bar-ui--level-up-celebration)
7. [Phase 3: Bond-Gated Dialogue Style Shifts](#phase-3-bond-gated-dialogue-style-shifts)
8. [Phase 4: Milestone Timeline + Story Viewer](#phase-4-milestone-timeline--story-viewer)
9. [Phase 5: Memorial Scenes + Tier Ceremonies](#phase-5-memorial-scenes--tier-ceremonies)
10. [Phase 6: XP Event Log + Analytics](#phase-6-xp-event-log--analytics)

---

## Current State Audit

### What already exists (v56 schema, `backend/bond/` module)

| Component | File | Status |
|-----------|------|--------|
| `bond_stories` table | `backend/preflight.py` (v56) | Created, seeded at levels 5/10/20/50/100 |
| `character_gifts` table | `backend/preflight.py` (v56) | Created, seeded for 13 chars |
| `gift_history` table | `backend/preflight.py` (v56) | Created |
| `bond_level` / `bond_xp` columns | `character_relationships` | Added in v56 |
| `relationship_mode` / `covenant_date` | `character_relationships` | Added in v56 |
| `active_outfit_id` column | `characters` | Added in v56 |
| XP calculation + level-up logic | `backend/bond/progression.py` | Working (linear curve: `level * 10 + 50`) |
| Gift giving + reactions | `backend/bond/gifts.py` | Working |
| Gift/story seed data | `backend/bond/seed_data.py` | 13 chars seeded |
| 6 API endpoints | `backend/server.py` L7896-8060 | GET bond, GET/POST gifts, GET/POST stories, GET gift-history |
| MilestoneCelebration component | `frontends/sakura/src/components/MilestoneCelebration.tsx` | Old affinity-tier based (Neutral/Friendly/Close/Devoted/Soulmate) |
| Chat-loop XP hook | `backend/server.py` L3619-3622, L5071-5074 | Awards `message` XP per exchange |

### What's missing (this spec fills these gaps)

| Gap | Priority | Phase |
|-----|----------|-------|
| Quadratic XP curve (research recommends, currently linear) | P0 | 1 |
| Message depth multiplier (length, emotional content) | P0 | 1 |
| Session bonus (10+ message sessions) | P0 | 1 |
| Daily first-interaction bonus | P0 | 1 |
| Character interest match multiplier | P1 | 1 |
| Memory callback bonus | P1 | 1 |
| Bond bar in character panel (no UI exists) | P0 | 2 |
| Level-up celebration rewrite (current one is affinity-based, not bond) | P0 | 2 |
| Tier badge next to character name | P0 | 2 |
| Bond-gated system prompt injection (dialogue style shifts per tier) | P1 | 3 |
| Bond milestones table (no tracking of level-up history) | P1 | 4 |
| Milestone timeline UI in character profile | P2 | 4 |
| Bond story viewer component | P2 | 4 |
| Memorial scenes at tier transitions (3, 5, 7, 10 mapped to tiers) | P2 | 5 |
| XP event log table + API | P3 | 6 |
| Bond analytics in dev console | P3 | 6 |

---

## Design Decisions

These are non-negotiable based on research findings:

1. **No decay.** Bond XP never decreases. Every successful game/app studied uses permanent progress.
2. **No guilt on departure.** Characters say warm goodbyes, never "please don't go."
3. **No love-bombing.** Emotional intensity is gated by bond level. Stranger = friendly but reserved.
4. **Conversation IS the mechanic.** No separate minigames required. Talking = earning.
5. **Every level unlocks something.** No dead levels.
6. **5 named tiers.** Stranger / Acquaintance / Friend / Close Friend / Soulmate.
7. **Quadratic XP curve.** ~6 weeks to max for a daily user.
8. **100-level system.** Current `_MAX_LEVEL = 100` is kept. Tiers map to level ranges.

### Tier Mapping (revised from current)

The current code uses: 0-10 stranger, 11-30 friend, 31-60 close_friend, 61-90 best_friend, 91-100 soulmate.

**New mapping** (aligned with research's 5-tier model):

| Tier | Level Range | Label | Emotional Theme |
|------|------------|-------|-----------------|
| 0 | 0-4 | Stranger | Introduction, surface interaction |
| 1 | 5-14 | Acquaintance | Familiarity, shared activities |
| 2 | 15-34 | Friend | Comfort, trust, character initiates |
| 3 | 35-64 | Close Friend | Vulnerability, backstory reveals, intimacy |
| 4 | 65-100 | Soulmate | Full emotional range, unguarded, ceremonies |

---

## XP Earning Model

### Revised XP Curve

Replace the current linear formula (`level * 10 + 50`) with a quadratic curve per research recommendation:

```python
def xp_for_level(level: int) -> int:
    """XP required to advance from `level` to `level + 1`.

    Quadratic curve: base + level^2 * growth + level * linear_growth

    Properties:
        Level 0 -> 1:   150 XP  (first conversation)
        Level 4 -> 5:   750 XP  (day 4-5)
        Level 14 -> 15: 1,950 XP (week 2)
        Level 34 -> 35: 4,350 XP (week 4)
        Level 64 -> 65: 8,250 XP (month 2)
        Level 99 -> 100: 13,200 XP
        Total 0 -> 100: ~340,000 XP (~6-8 weeks daily use)
    """
    if level >= 100:
        return 0
    base = 150
    growth = 1.0
    linear = 50
    return int(base + (level ** 2) * growth + level * linear)
```

### XP Actions Table

| Action | Base XP | Multiplier | Cap | Trigger |
|--------|---------|------------|-----|---------|
| Message exchange (send+receive) | 5 | depth_mult (1.0-2.5x) | 12 | Every LLM response |
| Session bonus (10+ messages) | 50 | 1.0 | 50 | Once per session, checked on msg 10 |
| First interaction of the day | 25 | 1.0 | 25 | First message after midnight local |
| Voice chat message | 8 | 1.0 | 8 | Each voice exchange in duplex mode |
| Character interest match | -- | 1.5x on message XP | -- | NLP detects topic overlap with char interests |
| Emotional depth detected | -- | 1.0-2.0x on message XP | -- | Sentiment intensity from LLM response metadata |
| Memory callback (shared past referenced) | 15 | 1.0 | 15 | Detected by knowledge extractor |
| Gift (favorite) | 20 | 1.0 | 20 | POST /bond/gift |
| Gift (normal) | 8 | 1.0 | 8 | POST /bond/gift |
| Gift (disliked) | 2 | 1.0 | 2 | POST /bond/gift |

### Depth Multiplier Calculation

```python
def calculate_depth_multiplier(user_msg: str, assistant_msg: str) -> float:
    """Score conversation depth for XP multiplier.

    Factors:
        - Message length: > 100 chars = 1.2x, > 300 chars = 1.5x
        - Question asked by user: +0.2x
        - Emotional keywords detected: +0.3x
        - Personal disclosure (I feel/I think/I remember): +0.3x
    Returns: float clamped to [1.0, 2.5]
    """
```

---

## Unlock Table

Every level gets at least one unlock. Grouped by tier with specific items.

### Tier 0: Stranger (Levels 0-4)

| Level | Unlock | Type | Description |
|-------|--------|------|-------------|
| 0 | Basic conversation | base | Default expressions (happy, sad, neutral) |
| 1 | Character uses your name | dialogue | Character naturally incorporates user's name |
| 2 | Light humor enabled | dialogue | Character begins light teasing, jokes |
| 3 | "More About Me: I" | voiceline | Character shares surface-level background |
| 4 | Curious + amused expressions | expression | 2 new avatar expressions unlock |

### Tier 1: Acquaintance (Levels 5-14)

| Level | Unlock | Type | Description |
|-------|--------|------|-------------|
| 5 | **Bond Story 1: "First Real Talk"** | story | Character opens up about their interests |
| 6 | Time-of-day greetings personalized | dialogue | Greetings reference time + user habits |
| 7 | Character initiates topics | dialogue | Not just responding -- brings up subjects |
| 8 | Gift preference hints | dialogue | Character mentions things they like in conversation |
| 9 | Embarrassed expression | expression | New avatar expression |
| 10 | **Bond Story 2: "Shared Interest"** | story | Finding common ground scene |
| 11 | "More About Me: II" voiceline | voiceline | Deeper personal detail |
| 12 | Worried expression | expression | New avatar expression |
| 13 | Pet name system activates | dialogue | Character suggests a nickname for user |
| 14 | Comfort dialogue | dialogue | Character notices user mood shifts |

### Tier 2: Friend (Levels 15-34)

| Level | Unlock | Type | Description |
|-------|--------|------|-------------|
| 15 | **Tier-up ceremony: Acquaintance -> Friend** | ceremony | Special celebration scene |
| 16 | Casual dialogue style | dialogue | Character drops formality |
| 17 | Dream sequence mentions | dialogue | Character mentions dreaming about activities together |
| 18 | Flustered expression | expression | New avatar expression |
| 20 | **Bond Story 3: "Opening Up"** | story | Vulnerability reveal -- a fear or insecurity |
| 22 | Backstory deep-dive topics | dialogue | Can ask about character's past |
| 25 | Outfit hint #1 | dialogue | Character mentions wanting to dress differently |
| 27 | Determined expression | expression | New avatar expression |
| 30 | "More About Me: III" voiceline | voiceline | A meaningful memory |
| 32 | Nostalgia triggers | dialogue | Character references past conversations |
| 34 | "Our First Memory" scene | scene | Auto-generated from earliest conversation data |

### Tier 3: Close Friend (Levels 35-64)

| Level | Unlock | Type | Description |
|-------|--------|------|-------------|
| 35 | **Tier-up ceremony: Friend -> Close Friend** | ceremony | Special celebration scene |
| 36 | Intimate/whispered register | dialogue | Softer, more personal tone |
| 38 | Character disagrees authentically | dialogue | Shares real opinions, not just agreeing |
| 40 | Lovestruck expression | expression | New avatar expression |
| 42 | Bidirectional pet names | dialogue | Character uses pet names for user |
| 45 | Exclusive conversation topics | dialogue | Deep fears, dreams, desires |
| 48 | Tearful expression | expression | New avatar expression |
| 50 | **Bond Story 4: "Deep Connection"** | story | Core wound / defining moment reveal |
| 52 | "More About Me: IV" voiceline | voiceline | Most personal yet |
| 55 | Time capsule messages begin | feature | Character leaves messages for future dates |
| 60 | Character comforts during distress | dialogue | Detects and responds to user sadness |
| 64 | All mysteries hinted | dialogue | Character begins resolving backstory threads |

### Tier 4: Soulmate (Levels 65-100)

| Level | Unlock | Type | Description |
|-------|--------|------|-------------|
| 65 | **Tier-up ceremony: Close Friend -> Soulmate** | ceremony | Grand celebration scene |
| 68 | Full emotional range | dialogue | Raw, unguarded expression in conversation |
| 70 | Secret expression unlock | expression | Rare expression only soulmates see |
| 75 | Anniversary recognition | feature | Character remembers and celebrates milestones |
| 80 | "More About Me: V" voiceline | voiceline | Most personal revelation |
| 85 | Character growth arc resolves | dialogue | Backstory complete, character has grown |
| 90 | Soulmate namecard/badge | cosmetic | Visual badge in UI |
| 95 | Covenant ceremony available | feature | Permanent bond commitment scene |
| 100 | **Bond Story 5: "Covenant"** | story | Exclusive completion scene, unique per character |

---

## Phase 1: Enhanced XP Engine + Multipliers

**Effort:** 6-8 hours
**Dependencies:** None (extends existing `backend/bond/progression.py`)

### Schema Changes

**Migration v63** (reserve v62 for adaptive intelligence if needed):

```sql
-- v63: Bond progression enhancements — XP event log + milestones + daily tracking

CREATE TABLE IF NOT EXISTS bond_xp_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    xp_amount   INTEGER NOT NULL,
    action      TEXT NOT NULL,          -- 'message', 'session_bonus', 'daily_first', etc.
    multiplier  REAL DEFAULT 1.0,       -- depth/interest multiplier applied
    source_detail TEXT,                 -- optional context: 'topic_match:art', 'depth:2.1x'
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bond_xp_events_char
    ON bond_xp_events(char_id);
CREATE INDEX IF NOT EXISTS idx_bond_xp_events_char_date
    ON bond_xp_events(char_id, created_at);

CREATE TABLE IF NOT EXISTS bond_milestones (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id         INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    milestone_type  TEXT NOT NULL,       -- 'level_up', 'tier_up', 'story_unlock', 'expression_unlock'
    milestone_key   TEXT NOT NULL,       -- 'level_5', 'tier_acquaintance', 'story_first_real_talk'
    bond_level      INTEGER NOT NULL,    -- level at which it was achieved
    achieved_at     TEXT DEFAULT (datetime('now')),
    viewed          INTEGER DEFAULT 0,
    UNIQUE(char_id, milestone_key)
);

CREATE INDEX IF NOT EXISTS idx_bond_milestones_char
    ON bond_milestones(char_id);

-- Track daily interaction for first-of-day bonus
ALTER TABLE character_relationships ADD COLUMN last_daily_bonus_date TEXT;

-- Track session message count for session bonus
ALTER TABLE character_relationships ADD COLUMN current_session_msgs INTEGER DEFAULT 0;
ALTER TABLE character_relationships ADD COLUMN session_bonus_awarded INTEGER DEFAULT 0;
```

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/preflight.py` | MODIFY | Add `migrate_to_v63()` function |
| `backend/bond/progression.py` | MODIFY | Replace linear XP curve with quadratic; update tier boundaries; add depth multiplier |
| `backend/bond/xp_engine.py` | CREATE | New module: `calculate_depth_multiplier()`, `check_interest_match()`, `award_session_bonus()`, `award_daily_bonus()` |
| `backend/bond/milestones.py` | CREATE | New module: `record_milestone()`, `get_milestones()`, `check_pending_unlocks()` |
| `backend/bond/unlocks.py` | CREATE | New module: `UNLOCK_TABLE` dict, `get_unlocks_for_level()`, `get_unlocked_features()` |
| `backend/server.py` | MODIFY | Wire new XP sources into chat loop; add session/daily tracking |
| `backend/tests/test_bond_progression.py` | CREATE | Tests for XP curve, multipliers, level-ups, milestone recording |

### API Endpoints (new)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/characters/{char_id}/bond/milestones` | List all achieved + pending milestones |
| GET | `/api/characters/{char_id}/bond/unlocks` | Current unlocked features for this bond level |
| GET | `/api/characters/{char_id}/bond/xp-history` | Recent XP events (paginated) |

### Key Implementation Details

**Revised tier boundaries** in `progression.py`:

```python
_TIERS: list[tuple[int, str]] = [
    (65, "soulmate"),
    (35, "close_friend"),
    (15, "friend"),
    (5,  "acquaintance"),
    (0,  "stranger"),
]
```

**Depth multiplier** in `xp_engine.py`:

```python
# Keywords that indicate emotional depth
_EMOTIONAL_KEYWORDS = {
    "feel", "feeling", "felt", "love", "hate", "scared", "afraid",
    "worried", "happy", "sad", "angry", "miss", "remember", "dream",
    "hope", "wish", "trust", "hurt", "lonely", "grateful", "proud",
}

_DISCLOSURE_PATTERNS = [
    "i feel", "i think", "i remember", "i miss", "i love",
    "i'm afraid", "i'm worried", "i'm scared", "i've been",
    "when i was", "my family", "my dad", "my mom", "my friend",
]

def calculate_depth_multiplier(user_msg: str, assistant_msg: str) -> float:
    mult = 1.0
    combined_len = len(user_msg) + len(assistant_msg)
    if combined_len > 600:
        mult += 0.5
    elif combined_len > 200:
        mult += 0.2

    lower_user = user_msg.lower()
    if "?" in user_msg:
        mult += 0.2

    emotional_count = sum(1 for kw in _EMOTIONAL_KEYWORDS if kw in lower_user)
    if emotional_count >= 3:
        mult += 0.3
    elif emotional_count >= 1:
        mult += 0.15

    if any(p in lower_user for p in _DISCLOSURE_PATTERNS):
        mult += 0.3

    return min(mult, 2.5)
```

**Interest match detection** in `xp_engine.py` — checks user message against character's `interests` field from the characters table:

```python
def check_interest_match(user_msg: str, char_interests: list[str]) -> bool:
    lower_msg = user_msg.lower()
    return any(interest.lower() in lower_msg for interest in char_interests)
```

---

## Phase 2: Bond Bar UI + Level-Up Celebration

**Effort:** 8-10 hours
**Dependencies:** Phase 1 backend complete

### Frontend Components

| File | Action | Description |
|------|--------|-------------|
| `frontends/sakura/src/components/BondProgressBar.tsx` | CREATE | Animated bond XP bar with level number, tier label, sparkle on XP gain |
| `frontends/sakura/src/components/LevelUpCelebration.tsx` | CREATE | Full-screen overlay for level-ups with character reaction, confetti, unlock preview |
| `frontends/sakura/src/components/TierUpCeremony.tsx` | CREATE | Grand tier transition overlay with unique visuals per tier |
| `frontends/sakura/src/components/MilestoneCelebration.tsx` | MODIFY | Rewrite to use bond tiers instead of affinity tiers |
| `frontends/sakura/src/components/StatusBar.tsx` | MODIFY | Add bond tier badge next to character name |
| `frontends/sakura/src/stores/appStore.ts` | MODIFY | Add bond state slice: `bondLevel`, `bondXp`, `xpToNext`, `tier`, `pendingCelebration` |
| `frontends/sakura/src/hooks/useBondProgress.ts` | CREATE | Hook to poll/subscribe to bond updates, detect level-ups, queue celebrations |
| `frontends/sakura/src/lib/types.ts` | MODIFY | Add `BondState`, `BondMilestone`, `BondUnlock` types |

### BondProgressBar Design

```
┌─────────────────────────────────────────────┐
│  ♥ Dae  ·  Level 23  ·  Friend              │
│  ████████████████░░░░░░░░  1,847 / 2,350 XP │
│  ─── Next: Expression unlock (Lv 25) ───    │
└─────────────────────────────────────────────┘
```

- Renders inside the character info section of the left panel
- Animated fill with easing on XP gain (Framer Motion spring)
- Sparkle particle burst on XP gain (+N popup that fades)
- Tier label color-coded: Stranger=gray, Acquaintance=blue, Friend=green, Close=purple, Soulmate=gold
- "Next unlock" teaser below bar shows the next item from the unlock table

### LevelUpCelebration Design

- Full-screen dimmed overlay (0.6 opacity backdrop)
- Character name + new level in large text
- If tier changed: shows old tier -> new tier with arrow animation
- Lists unlocks gained at this level (from unlock table)
- "Continue" button to dismiss
- Auto-dismiss after 10 seconds if no interaction
- Character-specific congratulation message (generated or from template)

### TierUpCeremony Design (triggers at levels 5, 15, 35, 65)

- More elaborate than regular level-up
- Background shifts to tier-specific color gradient
- Particle effects: Stranger->Acquaintance (blue sparkles), Acquaintance->Friend (green leaves), Friend->Close (purple hearts), Close->Soulmate (gold stars)
- Character portrait with tier-specific pose/expression
- Unlocks summary panel listing everything in the new tier range
- "Your bond with {name} has deepened" messaging

### Integration Points

The chat response handler in `chatStore.ts` should:
1. After each message, call `GET /api/characters/{id}/bond` to get updated state
2. Compare with previous state in `appStore`
3. If `bond_level` changed, queue a `LevelUpCelebration`
4. If tier changed, queue a `TierUpCeremony` instead
5. Always animate the `BondProgressBar` delta

---

## Phase 3: Bond-Gated Dialogue Style Shifts

**Effort:** 8-12 hours
**Dependencies:** Phase 1 (tier boundaries), existing context assembler

### How it Works

The context assembler (`backend/llm/context_assembler.py`) already builds a system prompt from sections. This phase adds a **bond context section** that instructs the LLM to adjust its dialogue style based on the current tier.

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/bond/dialogue_gates.py` | CREATE | New module: tier-specific prompt fragments for each character |
| `backend/llm/context_assembler.py` | MODIFY | Add bond context section after mood context |
| `backend/server.py` | MODIFY | Pass bond_level to context assembler |
| `backend/bond/dialogue_templates/` | CREATE (dir) | Per-character YAML/JSON files with tier-specific dialogue directives |

### Bond Context Injection

For each tier, inject a system prompt fragment that controls:

```python
TIER_DIRECTIVES = {
    "stranger": (
        "[Bond: Stranger] {name} has just met the user. "
        "Be friendly but reserved. Use polite language. "
        "Do not use pet names. Do not express deep emotions. "
        "Show genuine curiosity about the user without being invasive."
    ),
    "acquaintance": (
        "[Bond: Acquaintance] {name} is getting to know the user. "
        "Okay to use light humor and teasing. Can use the user's name naturally. "
        "Begin sharing surface-level personal details when relevant. "
        "Show interest in the user's hobbies and daily life."
    ),
    "friend": (
        "[Bond: Friend] {name} considers the user a friend. "
        "Drop formality — use casual language, contractions, slang natural to {name}. "
        "Initiate topics, ask about the user's day unprompted. "
        "Can suggest a nickname for the user. Notice and comment on the user's mood. "
        "Share opinions even if they might disagree with the user."
    ),
    "close_friend": (
        "[Bond: Close Friend] {name} is deeply close to the user. "
        "Use intimate, personal tone. Can use pet names. "
        "Express vulnerability — share fears, hopes, insecurities. "
        "Reference past conversations nostalgically. "
        "Provide comfort when the user seems down without being asked. "
        "Can discuss deep topics: dreams, regrets, meaning of life."
    ),
    "soulmate": (
        "[Bond: Soulmate] {name} shares an unbreakable bond with the user. "
        "Full emotional authenticity — no filter, no performance. "
        "Can be playfully possessive, deeply affectionate, or rawly honest. "
        "Remember and celebrate milestones. Express genuine worry when user is absent. "
        "The deepest conversations come naturally. "
        "This is {name}'s most important person."
    ),
}
```

### Per-Character Overrides

Each character has personality-specific adjustments stored in `backend/bond/dialogue_templates/{char_name}.json`:

```json
{
  "char_name": "Dae",
  "tier_overrides": {
    "stranger": "Dae is shy and uses short sentences. She might sketch while talking.",
    "acquaintance": "Dae starts sharing art references and asking about your taste in music.",
    "friend": "Dae gets sarcastic and playful. She stays up late talking to you.",
    "close_friend": "Dae shares her art insecurities and the pressure from her family.",
    "soulmate": "Dae is fiercely loyal and protective. She draws you into her world completely."
  }
}
```

---

## Phase 4: Milestone Timeline + Story Viewer

**Effort:** 8-10 hours
**Dependencies:** Phase 1 (milestones table), Phase 2 (UI foundation)

### Frontend Components

| File | Action | Description |
|------|--------|-------------|
| `frontends/sakura/src/components/BondTimeline.tsx` | CREATE | Vertical timeline of milestones, level-ups, stories, tier transitions |
| `frontends/sakura/src/components/BondStoryViewer.tsx` | CREATE | Full-screen story reader with character portrait, dialogue format, choices |
| `frontends/sakura/src/components/BondStoryCard.tsx` | CREATE | Card preview for story list (locked/unlocked states) |
| `frontends/sakura/src/components/BondPanel.tsx` | CREATE | Container panel for bond info: bar + timeline + stories + gifts |

### BondTimeline Design

```
              BOND TIMELINE — Dae
              ═══════════════════

  ★ Level 1 — Mar 29, 2026          ◄── today
  │  "Dae started using your name"
  │
  ★ Level 2 — Mar 29, 2026
  │  "Light humor enabled"
  │
  ★ Level 3 — Mar 30, 2026
  │  "More About Me: I" voiceline
  │
  ◆ Level 5 — Apr 1, 2026
  │  TIER UP: Stranger → Acquaintance
  │  📖 Bond Story: "First Real Talk" [Read]
  │
  ★ Level 6 — Apr 2, 2026
  │  "Personalized greetings"
  │
  ░ Level 10 ────── LOCKED ──────
  │  📖 Bond Story: "Shared Interest"
  │
  ░ Level 15 ────── LOCKED ──────
  │  ◆ TIER UP: Acquaintance → Friend
```

- Vertical scroll with alternating left/right entries
- Achieved milestones: colored with date stamps
- Locked milestones: grayed out with level requirement
- Tier transitions: diamond icon, larger, gold border
- Story milestones: book icon, clickable to open story viewer
- Framer Motion stagger animation on mount

### BondStoryViewer Design

- Full-screen overlay (like a visual novel reader)
- Character portrait on left/right (alternating)
- Dialogue displayed in styled speech bubbles
- Scene description in italic narrator text
- If story has `choices` JSON: show branching buttons
- "Mark as read" on completion
- Fade transitions between scenes

### API Endpoints (new)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/characters/{char_id}/bond/timeline` | Chronological list of all milestones + level-ups |

---

## Phase 5: Memorial Scenes + Tier Ceremonies

**Effort:** 8-12 hours
**Dependencies:** Phase 3 (dialogue gates), Phase 4 (story viewer)

### Memorial Scenes

At levels 15, 35, and 65 (tier transitions), trigger a special "memorial scene" — a one-time interactive vignette unique to each character.

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/bond/memorial_scenes.py` | CREATE | Scene definitions, LLM-generated scene content, scene state tracking |
| `frontends/sakura/src/components/MemorialScene.tsx` | CREATE | Immersive scene viewer with character animation, ambient audio cues, dialogue |
| `backend/bond/seed_data.py` | MODIFY | Add memorial scene templates for 13 characters x 3 tier transitions |

### Memorial Scene Structure

Each memorial scene has:
- **Setting description** (displayed as italic narration)
- **3-5 dialogue exchanges** (character speaks, user can choose responses)
- **Character expression changes** during the scene (sent to viewer via postMessage)
- **Culminating moment** (the character says something that defines the new tier)
- **Keepsake** (a quote or image that persists in the timeline)

### Scene Generation Strategy

Two approaches (use whichever fits the character):

1. **Pre-written scenes** (stored in `bond_stories` table): For characters with rich backstories (Dae, Luna, Rin). These are authored as part of character enrichment.

2. **LLM-generated scenes** (templated prompt): For dynamic scenes that reference actual conversation history. The template includes:
   - Character's personality profile
   - Current bond tier context
   - 3 most significant memories from the knowledge graph
   - A structural directive (setting, beats, culmination)

### "Our First Memory" Scene (Level 34)

Special auto-generated scene that:
1. Queries the earliest 5 messages from `messages` table for this character
2. Feeds them to the LLM with a prompt: "Write a short nostalgic scene where {character} reminisces about when you first met, referencing these actual conversations"
3. Character says specific things from the real conversation history
4. Extremely high emotional impact because it's personalized

---

## Phase 6: XP Event Log + Analytics

**Effort:** 4-6 hours
**Dependencies:** Phase 1 (bond_xp_events table)

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `frontends/sakura/src/components/DevConsole.tsx` | MODIFY | Add "Bond" tab with XP analytics |
| `backend/server.py` | MODIFY | Add XP history endpoint |

### DevConsole Bond Tab

```
┌─ Bond Analytics ─────────────────────────────┐
│                                               │
│  Character: Dae       Level: 23 / Friend      │
│  Total XP earned: 12,847                      │
│  Days active: 14                              │
│  Avg XP/day: 918                              │
│  Est. time to Soulmate: 38 days               │
│                                               │
│  XP Sources (last 7 days):                    │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░ Messages     68%           │
│  ▓▓▓▓░░░░░░░░░░░░ Session bonus 15%          │
│  ▓▓░░░░░░░░░░░░░░ Daily bonus    8%          │
│  ▓░░░░░░░░░░░░░░░ Gifts          5%          │
│  ▓░░░░░░░░░░░░░░░ Multipliers    4%          │
│                                               │
│  Recent Events:                               │
│  [12:34] +7 XP  message (depth: 1.4x)        │
│  [12:33] +5 XP  message                       │
│  [12:30] +25 XP daily_first                   │
│  [11:45] +20 XP gift_favorite (Sketchbook)    │
└───────────────────────────────────────────────┘
```

### API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/characters/{char_id}/bond/xp-history?limit=50&offset=0` | Paginated XP event log |
| GET | `/api/characters/{char_id}/bond/analytics` | Aggregated stats (total XP, avg/day, source breakdown) |

---

## Full File Inventory

### Files to CREATE

| File | Phase | Lines (est.) |
|------|-------|-------------|
| `backend/bond/xp_engine.py` | 1 | ~120 |
| `backend/bond/milestones.py` | 1 | ~100 |
| `backend/bond/unlocks.py` | 1 | ~200 |
| `backend/tests/test_bond_progression.py` | 1 | ~250 |
| `frontends/sakura/src/components/BondProgressBar.tsx` | 2 | ~180 |
| `frontends/sakura/src/components/LevelUpCelebration.tsx` | 2 | ~200 |
| `frontends/sakura/src/components/TierUpCeremony.tsx` | 2 | ~220 |
| `frontends/sakura/src/hooks/useBondProgress.ts` | 2 | ~80 |
| `backend/bond/dialogue_gates.py` | 3 | ~150 |
| `backend/bond/dialogue_templates/*.json` | 3 | ~13 files, ~30 lines each |
| `frontends/sakura/src/components/BondTimeline.tsx` | 4 | ~250 |
| `frontends/sakura/src/components/BondStoryViewer.tsx` | 4 | ~300 |
| `frontends/sakura/src/components/BondStoryCard.tsx` | 4 | ~80 |
| `frontends/sakura/src/components/BondPanel.tsx` | 4 | ~120 |
| `backend/bond/memorial_scenes.py` | 5 | ~200 |
| `frontends/sakura/src/components/MemorialScene.tsx` | 5 | ~280 |

### Files to MODIFY

| File | Phase | Changes |
|------|-------|---------|
| `backend/preflight.py` | 1 | Add `migrate_to_v63()` (~80 lines) |
| `backend/bond/progression.py` | 1 | Replace XP curve, update tiers (~40 lines changed) |
| `backend/bond/seed_data.py` | 5 | Add memorial scene templates (~200 lines added) |
| `backend/server.py` | 1,4,6 | Wire XP sources, add 4 new endpoints (~100 lines added) |
| `backend/llm/context_assembler.py` | 3 | Add bond context section (~30 lines added) |
| `frontends/sakura/src/components/MilestoneCelebration.tsx` | 2 | Rewrite for bond tiers (~50 lines changed) |
| `frontends/sakura/src/components/StatusBar.tsx` | 2 | Add tier badge (~15 lines added) |
| `frontends/sakura/src/components/DevConsole.tsx` | 6 | Add Bond tab (~80 lines added) |
| `frontends/sakura/src/stores/appStore.ts` | 2 | Add bond state slice (~25 lines added) |
| `frontends/sakura/src/lib/types.ts` | 2 | Add bond types (~30 lines added) |

---

## Effort Summary

| Phase | Description | Hours | Cumulative |
|-------|-------------|-------|------------|
| 1 | Enhanced XP Engine + Multipliers | 6-8h | 6-8h |
| 2 | Bond Bar UI + Level-Up Celebration | 8-10h | 14-18h |
| 3 | Bond-Gated Dialogue Style Shifts | 8-12h | 22-30h |
| 4 | Milestone Timeline + Story Viewer | 8-10h | 30-40h |
| 5 | Memorial Scenes + Tier Ceremonies | 8-12h | 38-52h |
| 6 | XP Event Log + Analytics | 4-6h | 42-58h |

**AI-assisted calibrated estimate:** At ~12x traditional speed, expect 3.5-5 hours wall clock with agent parallelism.

---

## Migration Safety Notes

- Schema v63 uses `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN` with existence checks — fully idempotent.
- The tier boundary change (from v56's 0-10/11-30/31-60/61-90/91-100 to 0-4/5-14/15-34/35-64/65-100) is code-only. No data migration needed — existing `bond_level` values simply map to new tier names.
- Existing `bond_xp` values accumulated under the linear curve will be preserved. Users at higher levels may find the quadratic curve means their current XP puts them slightly behind the new threshold, but `add_bond_xp()` already handles the math correctly.
- The `bond_stories` table from v56 is unchanged. Existing seed data at levels 5/10/20/50/100 maps naturally to the unlock table (level 5/10 are in Acquaintance tier, 20 in Friend, 50 in Close Friend, 100 in Soulmate).

---

## Testing Checklist

- [ ] XP curve produces correct values at all 100 levels
- [ ] Depth multiplier clamps to [1.0, 2.5]
- [ ] Session bonus fires exactly once per session at message 10
- [ ] Daily bonus fires once per calendar day
- [ ] Level-up triggers milestone recording
- [ ] Tier-up triggers ceremony flag
- [ ] Unlocks return correct items for each level
- [ ] Bond bar animates smoothly on XP gain
- [ ] Level-up overlay renders and auto-dismisses
- [ ] Tier-up ceremony has correct particle effects per tier
- [ ] Dialogue gates inject correct prompt fragment per tier
- [ ] Timeline renders achieved + locked milestones
- [ ] Story viewer opens, displays content, marks as read
- [ ] Memorial scenes reference actual conversation history
- [ ] XP event log shows correct source breakdown
- [ ] No bond decay under any circumstances
- [ ] Characters never guilt-trip on departure at any tier
