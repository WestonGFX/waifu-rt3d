# Adaptive Intelligence — Implementation Spec

**Date:** 2026-03-29
**Source:** `docs/research/2026-03-29-adaptive-intelligence-research.md`
**Status:** Ready to implement
**Schema baseline:** v61 (migrations start at v62)

---

## Table of Contents

1. [Phase A — Quick Wins (v62–v63)](#phase-a--quick-wins-v62v63)
2. [Phase B — Deep Learning (v64–v65)](#phase-b--deep-learning-v64v65)
3. [Phase C — Advanced (no schema changes)](#phase-c--advanced)
4. [Existing Assets Reference](#existing-assets-reference)
5. [Dependency Graph](#dependency-graph)

---

## Existing Assets Reference

These modules already exist and are wired into the server. New work builds on top of them.

| Module | Path | What It Does | Wired Into Server? |
|--------|------|-------------|-------------------|
| Reflector | `backend/adaptive/reflector.py` | LLM-based conversation analysis → float prefs (0-1) in `user_profiles` | Yes — called periodically |
| Tuner | `backend/adaptive/tuner.py` | `load_user_profile()` + `profile_to_prompt_instructions()` → system prompt injection | Yes — `server.py:3339` |
| Signals | `backend/adaptive/signals.py` | Per-turn engagement metrics (msg length, emoji, sentiment, questions) → `engagement_signals` table | Yes — `server.py:530` |
| Behavior | `backend/adaptive/behavior.py` | Signal trends → BehaviorModifier dict → `build_behavior_prompt_block()` | Yes — `server.py:531-533` |
| Journal | `backend/adaptive/journal.py` | Character diary entries after sessions | Yes — on session end |
| Tiered Memory | `backend/memory/tiered_memory.py` | 3-tier memory with sqlite-vec embeddings | Yes |
| Fact Extractor | `backend/knowledge/extractor.py` | User knowledge graph extraction | Yes |
| Context Assembler | `backend/llm/context_assembler.py` | Token-budget-aware prompt assembly | Yes |
| Mood Engine | `backend/mood/engine.py` | Time-of-day + affinity → mood | Yes |
| Voice Modulator | `backend/tts/voice_modulator.py` | 16-emotion → TTS params | Yes |

### Existing DB Tables (already created)

- `user_profiles` — v55: float prefs, reflection_memo, engagement_heuristics, topic lists
- `engagement_signals` — v60: per-turn metrics (user_msg_length, sentiment_score, emoji_count, etc.)
- `preference_history` — v60: rolling preference snapshots with decay/confidence
- `privacy_settings` — v60: singleton opt-out flags (signal_collection, behavior_adaptation, etc.)

### Existing API Endpoints

- `GET /api/privacy/settings` — privacy toggles
- `PUT /api/privacy/settings` — update privacy toggles
- `GET /api/privacy/data-export` — export all personalization data
- `DELETE /api/privacy/data-reset` — wipe all personalization data
- `GET /api/privacy/behavior-modifiers/{char_id}` — current computed modifiers

---

## Dependency Graph

```
Phase A1: Context Classifier ──────────┐
Phase A2: Dynamic Parameters ──────────┤ (A2 depends on A1)
Phase A3: Extended User Model (v62) ───┤
Phase A4: Over-Personalization Gate ───┘
                                       │
Phase B1: Multi-Session Trends ────────┤ (depends on A3)
Phase B2: Ebbinghaus Memory Decay ─────┤ (independent)
Phase B3: Memory → Behavior Pipeline ──┤ (depends on A3, B2)
Phase B4: Self-Critique Loop ──────────┤ (depends on B1)
Phase B5: Topic Graph (v64) ───────────┤ (depends on A3)
Phase B6: Relationship Milestones ─────┘ (depends on A3, B1)
                                       │
Phase C1: LoRA Training Pipeline ──────┤ (independent, heavy)
Phase C2: DSPy Prompt Optimization ────┘ (independent, heavy)
```

---

## Phase A — Quick Wins (v62–v63)

**Total estimate: 38–52h** | **Impact: High** | **Risk: Low**

All Phase A items build on existing code and infrastructure. No new external dependencies except `textstat` (pure Python, 0 deps).

---

### A1: Rule-Based Context Classifier

**Effort: Quick (3–4h)**
**Dependencies: None (uses existing signals.py)**

Classify each user message into a conversation context (emotional_support, casual_chat, creative_roleplay, deep_philosophical, playful_flirty, factual_qa, comfort_reassurance) using rule-based heuristics. No LLM call.

#### Files

| Action | Path |
|--------|------|
| **CREATE** | `backend/adaptive/context_classifier.py` |
| Modify | `backend/adaptive/signals.py` — add `detected_context` to `collect_turn_signals()` return dict |

#### `backend/adaptive/context_classifier.py` — Key Functions

```python
# Conversation context types
CONTEXTS = (
    "emotional_support",
    "casual_chat",
    "creative_roleplay",
    "deep_philosophical",
    "playful_flirty",
    "factual_qa",
    "comfort_reassurance",
)

def classify_context(
    user_msg: str,
    sentiment_score: float,
    emoji_count: int,
    question_count: int,
    mood_state: str | None = None,
) -> str:
    """Classify user message into a conversation context using rule-based heuristics.

    Args:
        user_msg: The user's message text.
        sentiment_score: Pre-computed sentiment from signals.py (-1 to 1).
        emoji_count: Pre-computed emoji count from signals.py.
        question_count: Pre-computed question count from signals.py.
        mood_state: Current mood from MoodEngine (optional, enhances accuracy).

    Returns:
        One of CONTEXTS strings.

    Example:
        >>> classify_context("I'm feeling really down today...", -0.3, 0, 0)
        'emotional_support'
        >>> classify_context("What's the capital of France?", 0.0, 0, 1)
        'factual_qa'
    """
```

**Classification rules (priority order):**

1. **comfort_reassurance** — negative sentiment (< -0.2) + comfort keywords ("scared", "worried", "anxious", "help me")
2. **emotional_support** — negative sentiment (< -0.1) OR sadness keywords ("sad", "lonely", "miss", "feel")
3. **factual_qa** — question_count >= 1 + factual keywords ("what is", "how do", "explain", "tell me about")
4. **creative_roleplay** — roleplay markers (`*action*`, narrative language, "imagine", "pretend")
5. **deep_philosophical** — depth keywords ("meaning", "purpose", "think about", "philosophy") + message length > 100
6. **playful_flirty** — high emoji count (>= 2) + positive sentiment (> 0.2) + flirt keywords
7. **casual_chat** — default fallback

#### Wiring into `signals.py`

Add to `collect_turn_signals()` return dict:
```python
"detected_context": classify_context(
    user_msg, sentiment_score, emoji_count, question_count
),
```

No schema change needed — `detected_context` is computed on the fly, not stored (it's cheap enough to recompute).

---

### A2: Dynamic LLM Parameter Auto-Tuning

**Effort: Medium (8–12h)**
**Dependencies: A1 (context classifier)**

Select LLM sampling parameters (temperature, min_p, top_p, repetition_penalty) based on detected conversation context. Inject into the LLM API call.

#### Files

| Action | Path |
|--------|------|
| **CREATE** | `backend/adaptive/param_tuner.py` |
| Modify | `backend/server.py` — inject tuned params into LLM call in chat endpoint |
| Modify | `backend/config/app.json` — add `adaptive.dynamic_params.enabled` flag |

#### `backend/adaptive/param_tuner.py` — Key Functions

```python
# Parameter presets per context (from research)
CONTEXT_PARAM_PRESETS: dict[str, dict[str, float]] = {
    "emotional_support":   {"temperature": 0.7, "min_p": 0.05, "top_p": 0.90, "repetition_penalty": 1.05},
    "casual_chat":         {"temperature": 0.8, "min_p": 0.08, "top_p": 0.92, "repetition_penalty": 1.10},
    "creative_roleplay":   {"temperature": 1.0, "min_p": 0.05, "top_p": 0.95, "repetition_penalty": 1.02},
    "deep_philosophical":  {"temperature": 0.6, "min_p": 0.10, "top_p": 0.85, "repetition_penalty": 1.08},
    "playful_flirty":      {"temperature": 0.9, "min_p": 0.06, "top_p": 0.93, "repetition_penalty": 1.05},
    "factual_qa":          {"temperature": 0.3, "min_p": 0.15, "top_p": 0.80, "repetition_penalty": 1.15},
    "comfort_reassurance": {"temperature": 0.5, "min_p": 0.08, "top_p": 0.88, "repetition_penalty": 1.05},
}

def get_tuned_params(
    context: str,
    user_overrides: dict[str, float] | None = None,
    engagement_trend: float = 0.0,
) -> dict[str, float]:
    """Return LLM sampling parameters for the detected context.

    Args:
        context: One of CONTEXTS from context_classifier.py.
        user_overrides: Optional manual overrides from settings UI.
        engagement_trend: -1 to +1 trend from recent signals. Positive =
            engagement rising (can be more creative), negative = falling
            (should be more conservative).

    Returns:
        Dict with temperature, min_p, top_p, repetition_penalty.

    Example:
        >>> params = get_tuned_params("creative_roleplay")
        >>> params["temperature"]
        1.0
    """

def apply_engagement_drift(
    base_params: dict[str, float],
    engagement_trend: float,
) -> dict[str, float]:
    """Nudge parameters based on engagement trends.

    Rising engagement → slightly higher temperature (+0.05 per 0.1 trend).
    Falling engagement → slightly lower temperature (-0.05 per 0.1 trend).
    All values clamped to safe ranges.

    Args:
        base_params: Context-derived parameter set.
        engagement_trend: -1 to +1, from compute_rolling_averages().

    Returns:
        Adjusted parameter dict.
    """
```

#### Server Integration

In the chat endpoint (around `server.py:3339` where adaptive tuner is already called):

```python
# After context classifier runs (in signals collection):
from backend.adaptive.param_tuner import get_tuned_params
from backend.adaptive.context_classifier import classify_context

detected_context = classify_context(user_msg, sentiment, emoji_count, question_count)
llm_params = get_tuned_params(detected_context, engagement_trend=rolling_trend)

# Pass to LLM call:
adapter.chat_stream(messages, model, endpoint, api_key,
    temperature=llm_params["temperature"],
    # ... other params
)
```

#### Config Flag

Add to `backend/config/app.json`:
```json
{
  "adaptive": {
    "dynamic_params": {
      "enabled": true
    }
  }
}
```

---

### A3: Extended User Model Schema (v62)

**Effort: Medium (6–10h)**
**Dependencies: None (schema migration)**

Extend `user_profiles` with new columns for communication style metrics, emotional patterns, and interaction patterns — all populated by no-LLM signal extractors.

#### Files

| Action | Path |
|--------|------|
| Modify | `backend/preflight.py` — add `migrate_to_v62()` |
| **CREATE** | `backend/adaptive/user_model.py` — extended user model extraction |
| Modify | `backend/adaptive/reflector.py` — call extended extractors during reflection |

#### Schema Migration v62

```sql
-- Migration: v61 → v62 — Extended User Model

-- Add communication style columns to user_profiles
ALTER TABLE user_profiles ADD COLUMN avg_message_length REAL DEFAULT NULL;
ALTER TABLE user_profiles ADD COLUMN vocabulary_complexity REAL DEFAULT NULL;
ALTER TABLE user_profiles ADD COLUMN emoji_frequency REAL DEFAULT NULL;
ALTER TABLE user_profiles ADD COLUMN question_rate REAL DEFAULT NULL;

-- Add emotional pattern columns
ALTER TABLE user_profiles ADD COLUMN emotional_volatility REAL DEFAULT NULL;
ALTER TABLE user_profiles ADD COLUMN comfort_seeking_freq REAL DEFAULT NULL;
ALTER TABLE user_profiles ADD COLUMN peak_engagement_hour INTEGER DEFAULT NULL;
ALTER TABLE user_profiles ADD COLUMN mood_correlation_map TEXT DEFAULT NULL;

-- Add interaction pattern columns
ALTER TABLE user_profiles ADD COLUMN avg_session_length REAL DEFAULT NULL;
ALTER TABLE user_profiles ADD COLUMN session_frequency REAL DEFAULT NULL;
ALTER TABLE user_profiles ADD COLUMN initiative_ratio REAL DEFAULT NULL;

-- Add detected_context to engagement_signals for historical analysis
ALTER TABLE engagement_signals ADD COLUMN detected_context TEXT DEFAULT NULL;

-- Version bump
INSERT OR REPLACE INTO schema_version (version) VALUES (62);
```

#### `backend/adaptive/user_model.py` — Key Functions

```python
def compute_vocabulary_complexity(text: str) -> float:
    """Compute a 0-1 vocabulary complexity score using Flesch-Kincaid proxy.

    Uses syllable counting (no external deps) as a lightweight readability proxy.
    Falls back to word-length heuristic if textstat is not installed.

    Args:
        text: User message text.

    Returns:
        Float in [0.0, 1.0] where 0 = very simple, 1 = very complex.

    Example:
        >>> compute_vocabulary_complexity("Hi")
        0.1...
        >>> compute_vocabulary_complexity("The epistemological implications are profound")
        0.7...
    """

def compute_extended_metrics(
    messages: list[dict],
    signals: list[dict],
) -> dict[str, float | int | None]:
    """Compute all extended user model metrics from messages and signals.

    No LLM call. Pure computation over existing data.

    Args:
        messages: Recent messages (oldest first).
        signals: Recent engagement_signals rows (oldest first).

    Returns:
        Dict with keys matching the new user_profiles columns:
        avg_message_length, vocabulary_complexity, emoji_frequency,
        question_rate, emotional_volatility, comfort_seeking_freq,
        peak_engagement_hour, avg_session_length, initiative_ratio.

    Example:
        >>> metrics = compute_extended_metrics(msgs, sigs)
        >>> 0.0 <= metrics["emoji_frequency"] <= 1.0
        True
    """

def compute_peak_engagement_hour(signals: list[dict]) -> int | None:
    """Find the hour of day (0-23) when the user is most engaged.

    Uses created_at timestamps from engagement_signals.

    Args:
        signals: Signal rows with created_at timestamps.

    Returns:
        Hour (0-23) or None if insufficient data.
    """

def compute_emotional_volatility(sentiment_scores: list[float]) -> float:
    """Compute sentiment variance as a volatility metric (0-1).

    Args:
        sentiment_scores: List of per-turn sentiment scores (-1 to 1).

    Returns:
        Float in [0.0, 1.0] where 0 = very stable, 1 = highly volatile.
    """

def compute_initiative_ratio(messages: list[dict]) -> float:
    """Compute how often the user initiates vs responds.

    Looks at conversation starts (first message after silence gap) vs
    continuations. Higher = user leads more.

    Args:
        messages: Full message list with timestamps.

    Returns:
        Float in [0.0, 1.0].
    """
```

#### Integration with Reflector

In `reflector.py:run_reflection()`, after the LLM call, add:

```python
from backend.adaptive.user_model import compute_extended_metrics

extended = compute_extended_metrics(messages, recent_signals)
# Merge extended metrics into the profile update
updated_prefs.update(extended)
```

---

### A4: Over-Personalization Gate

**Effort: Medium (6–8h)**
**Dependencies: None (modifies context_assembler.py)**

Implement the Self-ReCheck pattern from OP-Bench research: before injecting a memory or user fact into context, check relevance, repetition, and intrusiveness.

#### Files

| Action | Path |
|--------|------|
| **CREATE** | `backend/adaptive/personalization_gate.py` |
| Modify | `backend/llm/context_assembler.py` — wrap memory/fact injection with gate |

#### `backend/adaptive/personalization_gate.py` — Key Functions

```python
def should_inject_memory(
    memory_text: str,
    current_topic: str,
    recently_mentioned: set[str],
    turn_count: int,
) -> bool:
    """Three-gate check before injecting a memory into LLM context.

    Gate 1 — Relevance: Does the memory relate to the current conversation topic?
        Uses keyword overlap + simple cosine similarity on word sets.

    Gate 2 — Repetition: Was this memory (or a similar one) mentioned in the
        last N turns? Prevents the AI from repeating the same personal facts.

    Gate 3 — Appropriateness: Would mentioning this feel intrusive?
        Flags sensitive categories (health, finances, relationship problems)
        and only allows them if the user brought up the topic first.

    Args:
        memory_text: The memory/fact to potentially inject.
        current_topic: Summary or last few messages of current conversation.
        recently_mentioned: Set of memory IDs or hashes mentioned in recent turns.
        turn_count: How many turns into the current session (early = more cautious).

    Returns:
        True if the memory should be injected, False if it should be withheld.

    Example:
        >>> should_inject_memory("User likes cats", "Tell me about dogs", set(), 3)
        True  # Related (pets)
        >>> should_inject_memory("User had a breakup", "What's for lunch?", set(), 1)
        False  # Inappropriate context
    """

def filter_memories_for_context(
    candidate_memories: list[dict],
    current_messages: list[dict],
    max_memories: int = 5,
) -> list[dict]:
    """Filter and rank candidate memories through the personalization gate.

    Args:
        candidate_memories: Memories retrieved by tiered_memory.py (each has
            'text', 'importance', 'id').
        current_messages: Recent conversation messages for topic detection.
        max_memories: Maximum memories to pass through.

    Returns:
        Filtered list of memories that passed all three gates, ranked by
        relevance score, capped at max_memories.
    """

# Sensitivity categories that require user-initiated context
SENSITIVE_CATEGORIES = frozenset({
    "health", "medical", "mental_health", "finances", "money",
    "relationship_problems", "grief", "trauma", "family_conflict",
})

def detect_sensitivity(text: str) -> str | None:
    """Detect if text touches a sensitive category.

    Args:
        text: Memory or fact text to check.

    Returns:
        Category name if sensitive, None otherwise.
    """
```

#### Context Assembler Integration

In `backend/llm/context_assembler.py`, around the memory injection section (line ~168):

```python
from backend.adaptive.personalization_gate import filter_memories_for_context

# Before injecting memories into context:
filtered = filter_memories_for_context(
    candidate_memories=retrieved_memories,
    current_messages=recent_messages,
    max_memories=5,
)
# Use filtered instead of raw retrieved_memories
```

---

## Phase B — Deep Learning (v64–v65)

**Total estimate: 50–68h** | **Impact: High** | **Risk: Medium**

Phase B builds the "memory-to-behavior pipeline" that makes the companion feel alive across sessions.

---

### B1: Multi-Session Trend Analysis

**Effort: Medium (6–8h)**
**Dependencies: A3 (extended user model)**

Enhance the reflector to detect cross-session patterns using a sliding window over `preference_history` snapshots.

#### Files

| Action | Path |
|--------|------|
| **CREATE** | `backend/adaptive/trend_analyzer.py` |
| Modify | `backend/adaptive/reflector.py` — call trend analyzer after LLM reflection |

#### `backend/adaptive/trend_analyzer.py` — Key Functions

```python
def compute_preference_trends(
    char_id: int,
    conn: sqlite3.Connection,
    window_days: int = 14,
) -> dict[str, dict]:
    """Analyze preference drift over time from preference_history.

    For each preference dimension, computes:
    - direction: "rising", "falling", "stable"
    - velocity: rate of change per day
    - confidence: based on data density

    Uses exponential moving average (PAMU-style) across snapshots.

    Args:
        char_id: Character to analyze.
        conn: SQLite connection.
        window_days: How far back to look.

    Returns:
        Dict mapping pref dimension to {direction, velocity, confidence}.

    Example:
        >>> trends = compute_preference_trends(1, conn)
        >>> trends["pref_humor"]["direction"]
        'rising'
    """

def detect_engagement_pattern(
    char_id: int,
    conn: sqlite3.Connection,
) -> dict:
    """Detect recurring engagement patterns (time-of-day, day-of-week).

    Args:
        char_id: Character to analyze.
        conn: SQLite connection.

    Returns:
        Dict with peak_hours, peak_days, avg_session_gap_hours.
    """

def generate_trend_summary(trends: dict) -> str:
    """Convert trend analysis into a concise prompt-injectable summary.

    Args:
        trends: Output of compute_preference_trends().

    Returns:
        1-3 sentence summary for system prompt injection.

    Example:
        >>> generate_trend_summary({"pref_humor": {"direction": "rising", ...}})
        'User has been increasingly enjoying humor over the past week.'
    """
```

---

### B2: Ebbinghaus Memory Decay

**Effort: Medium (8–12h)**
**Dependencies: None (modifies tiered_memory.py)**

Implement the Ebbinghaus forgetting curve for memory retention scoring. Memories decay naturally unless reinforced by recall or relevance.

#### Files

| Action | Path |
|--------|------|
| **CREATE** | `backend/memory/decay.py` |
| Modify | `backend/memory/tiered_memory.py` — integrate decay scoring into retrieval |
| Modify | `backend/preflight.py` — v63 migration for decay columns |

#### Schema Migration v63

```sql
-- Migration: v62 → v63 — Memory decay columns

-- Add decay tracking to memories table (or whichever table tiered_memory uses)
ALTER TABLE memories ADD COLUMN importance REAL DEFAULT 0.5;
ALTER TABLE memories ADD COLUMN recall_count INTEGER DEFAULT 0;
ALTER TABLE memories ADD COLUMN last_recalled_at TEXT DEFAULT NULL;
ALTER TABLE memories ADD COLUMN decay_score REAL DEFAULT 1.0;

-- Index for efficient decay-based pruning
CREATE INDEX IF NOT EXISTS idx_memories_decay ON memories(decay_score);

-- Version bump
INSERT OR REPLACE INTO schema_version (version) VALUES (63);
```

#### `backend/memory/decay.py` — Key Functions

```python
import math
from datetime import datetime

def compute_retention(
    importance: float,
    days_since_created: float,
    recall_count: int = 0,
) -> float:
    """Compute Ebbinghaus retention score for a memory.

    R(t) = importance * e^(-lambda_eff * days) * (1 + recall_count * 0.2)

    Where lambda_eff = 0.16 * (1 - importance * 0.8)

    Half-lives by importance:
        0.3 (casual mention)    → ~7 days
        0.7 (significant event) → ~30 days
        0.9 (core memory)       → ~365 days
        1.0 (permanent)         → never decays

    Args:
        importance: Memory importance score (0.0-1.0).
        days_since_created: Days since the memory was created.
        recall_count: How many times this memory has been retrieved.

    Returns:
        Retention score in [0.0, 1.0+]. Values above 1.0 are possible
        for frequently-recalled important memories.

    Example:
        >>> compute_retention(0.7, 30, recall_count=0)
        0.35...
        >>> compute_retention(0.7, 30, recall_count=5)
        0.7...
        >>> compute_retention(1.0, 365, recall_count=0)
        1.0  # permanent memories never decay
    """
    if importance >= 1.0:
        return 1.0  # Permanent memory

    lambda_eff = 0.16 * (1 - importance * 0.8)
    base = importance * math.exp(-lambda_eff * days_since_created)
    reinforcement = 1 + recall_count * 0.2
    return base * reinforcement


def compute_importance(
    emotional_intensity: float,
    engagement_score: float,
    novelty: float,
) -> float:
    """Score a memory's importance from three signals.

    importance = emotional_intensity * 0.4 + engagement_score * 0.35 + novelty * 0.25

    Args:
        emotional_intensity: Absolute sentiment score (0-1).
        engagement_score: From compute_engagement_score() (0-1).
        novelty: How different this is from existing memories (0-1).

    Returns:
        Float in [0.0, 1.0].

    Example:
        >>> compute_importance(0.8, 0.7, 0.6)
        0.715
    """
    return emotional_intensity * 0.4 + engagement_score * 0.35 + novelty * 0.25


def run_decay_pass(
    conn: sqlite3.Connection,
    prune_threshold: float = 0.05,
) -> dict:
    """Run a full decay pass: update all decay_scores, archive below threshold.

    Called periodically (e.g., on session start or daily).

    Args:
        conn: Writable SQLite connection.
        prune_threshold: Memories below this retention are archived.

    Returns:
        Dict with counts: {"updated": int, "pruned": int}.
    """


def reinforce_memory(memory_id: int, conn: sqlite3.Connection) -> None:
    """Increment recall_count and update last_recalled_at for a retrieved memory.

    Called whenever a memory is actually used in context assembly.

    Args:
        memory_id: ID of the memory that was retrieved and used.
        conn: Writable SQLite connection.
    """
```

#### Integration with Tiered Memory

In `backend/memory/tiered_memory.py`, modify the retrieval function:

```python
from backend.memory.decay import compute_retention, reinforce_memory

# After retrieving candidate memories by embedding similarity:
for mem in candidates:
    days = (now - mem["created_at"]).total_seconds() / 86400
    mem["retention"] = compute_retention(
        mem.get("importance", 0.5),
        days,
        mem.get("recall_count", 0),
    )

# Re-rank by: similarity * 0.6 + retention * 0.4
candidates.sort(key=lambda m: m["similarity"] * 0.6 + m["retention"] * 0.4, reverse=True)

# Reinforce memories that are actually injected into context
for mem in selected_memories:
    reinforce_memory(mem["id"], conn)
```

---

### B3: Memory → Behavior Pipeline

**Effort: Heavy (16–20h)**
**Dependencies: A3, B2**

The critical missing piece: retrieved memories should change HOW the character behaves, not just provide information. Four behavior channels.

#### Files

| Action | Path |
|--------|------|
| **CREATE** | `backend/adaptive/memory_behavior.py` |
| Modify | `backend/llm/context_assembler.py` — add memory-behavior section |
| Modify | `backend/adaptive/tuner.py` — accept memory-derived instructions |

#### `backend/adaptive/memory_behavior.py` — Key Functions

```python
def derive_behavior_from_memories(
    retrieved_memories: list[dict],
    user_profile: dict,
    current_context: str,
) -> dict:
    """Derive behavioral adjustments from retrieved memories.

    Produces four behavior channels:
    1. emotional_coloring: How to approach topics based on past emotional context
    2. behavioral_priming: Style adjustments from what worked before
    3. proactive_references: Things to naturally bring up
    4. relationship_continuity: Inside jokes, shared references to weave in

    Args:
        retrieved_memories: Memories with text, importance, tags.
        user_profile: Current user_profiles row.
        current_context: Detected conversation context string.

    Returns:
        Dict with four channel keys, each containing instruction text.

    Example:
        >>> result = derive_behavior_from_memories(mems, profile, "casual_chat")
        >>> "emotional_coloring" in result
        True
    """

def build_memory_behavior_block(behavior: dict) -> str:
    """Convert memory-derived behavior into a prompt-injectable block.

    Compact format (<80 tokens) for system prompt injection.

    Args:
        behavior: Output of derive_behavior_from_memories().

    Returns:
        String block or empty string if no behaviors apply.
    """
```

---

### B4: Self-Critique Reflection Loop

**Effort: Medium (8–12h)**
**Dependencies: B1**

After the regular reflection pass, run a second LLM call where the character reviews its own past responses and identifies improvements.

#### Files

| Action | Path |
|--------|------|
| **CREATE** | `backend/adaptive/self_critique.py` |
| Modify | `backend/adaptive/reflector.py` — optional self-critique after reflection |

#### `backend/adaptive/self_critique.py` — Key Functions

```python
def build_critique_prompt(
    char_name: str,
    messages: list[dict],
    behavior_modifiers: dict,
    user_profile: dict,
) -> str:
    """Build a prompt asking the LLM to critique its own past responses.

    The LLM reviews its responses and identifies:
    - Responses that got low engagement (short replies, topic changes)
    - Missed opportunities (user cues that were ignored)
    - Style mismatches (too formal when user was casual, etc.)

    Returns JSON with:
    {
        "improvements": [
            {"issue": str, "suggestion": str, "priority": "high"|"medium"|"low"}
        ],
        "strengths": [str],
        "style_adjustments": {dimension: direction}
    }
    """

async def run_self_critique(
    char_id: int,
    db_path: str,
    llm_config: dict,
) -> dict | None:
    """Run a self-critique pass and merge findings into the user profile.

    Called after run_reflection() when engagement has been declining.
    Only triggered when check_engagement_regression() returns a regression.

    Args:
        char_id: Character to critique.
        db_path: Path to SQLite DB.
        llm_config: LLM config dict.

    Returns:
        Critique result dict, or None if insufficient data.
    """
```

---

### B5: Topic Graph with Sentiment Tracking (v64)

**Effort: Medium (8–12h)**
**Dependencies: A3**

Track topic frequency and sentiment over time. Enables "emerging interests" detection and topic-aware behavior.

#### Files

| Action | Path |
|--------|------|
| Modify | `backend/preflight.py` — v64 migration |
| **CREATE** | `backend/adaptive/topic_graph.py` |
| Modify | `backend/adaptive/signals.py` — extract topics per turn |

#### Schema Migration v64

```sql
-- Migration: v63 → v64 — Topic graph

CREATE TABLE IF NOT EXISTS topic_tracking (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id         INTEGER NOT NULL,
    topic           TEXT NOT NULL,
    mention_count   INTEGER DEFAULT 1,
    total_sentiment REAL DEFAULT 0.0,
    avg_sentiment   REAL DEFAULT 0.0,
    first_seen_at   TEXT DEFAULT (datetime('now')),
    last_seen_at    TEXT DEFAULT (datetime('now')),
    is_emerging     INTEGER DEFAULT 0,
    UNIQUE(char_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_topic_tracking_char
    ON topic_tracking(char_id, mention_count DESC);

INSERT OR REPLACE INTO schema_version (version) VALUES (64);
```

#### `backend/adaptive/topic_graph.py` — Key Functions

```python
def extract_topics(text: str, max_topics: int = 3) -> list[str]:
    """Extract topic keywords from text using TF-IDF-style extraction.

    No LLM call. Uses noun phrase extraction with a stop-word filter.

    Args:
        text: Message text.
        max_topics: Maximum topics to extract.

    Returns:
        List of topic strings, lowercased and deduplicated.
    """

def update_topic_tracking(
    char_id: int,
    topics: list[str],
    sentiment: float,
    conn: sqlite3.Connection,
) -> None:
    """Update topic_tracking table with new topic mentions.

    Increments mention_count, updates running average sentiment,
    and flags emerging topics (mention_count increased >50% in last 7 days).
    """

def get_emerging_topics(
    char_id: int,
    conn: sqlite3.Connection,
    limit: int = 5,
) -> list[dict]:
    """Return topics that have recently surged in frequency.

    Returns:
        List of dicts with topic, mention_count, avg_sentiment, velocity.
    """

def get_topic_affinities(
    char_id: int,
    conn: sqlite3.Connection,
) -> dict[str, float]:
    """Return topic → affinity score mapping for prompt injection.

    Affinity = normalized(mention_count * avg_sentiment).
    Already consumed by tuner.py's topic_affinities field.
    """
```

---

### B6: Relationship Milestone Detection

**Effort: Medium (6–8h)**
**Dependencies: A3, B1**

Detect and store meaningful relationship milestones ("first time they opened up", "first inside joke", "100th conversation").

#### Files

| Action | Path |
|--------|------|
| Modify | `backend/preflight.py` — add to v64 migration |
| **CREATE** | `backend/adaptive/milestones.py` |

#### Schema (add to v64 migration)

```sql
CREATE TABLE IF NOT EXISTS relationship_milestones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id     INTEGER NOT NULL,
    milestone   TEXT NOT NULL,
    description TEXT,
    detected_at TEXT DEFAULT (datetime('now')),
    UNIQUE(char_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_milestones_char
    ON relationship_milestones(char_id, detected_at DESC);
```

#### `backend/adaptive/milestones.py` — Key Functions

```python
# Predefined milestone types
MILESTONES = {
    "first_conversation": "Had their first real conversation",
    "first_deep_talk": "First conversation longer than 20 messages",
    "first_vulnerability": "User shared something personal for the first time",
    "first_inside_joke": "Created their first inside joke or callback reference",
    "first_comfort": "User came to the character for emotional support",
    "loyalty_10": "10 conversation sessions together",
    "loyalty_50": "50 conversation sessions together",
    "loyalty_100": "100 conversation sessions together",
    "topic_expert": "User frequently discusses a specialized topic",
    "emotional_trust": "User consistently shows high emotional vulnerability",
}

def check_milestones(
    char_id: int,
    conn: sqlite3.Connection,
    session_signals: dict | None = None,
) -> list[dict]:
    """Check and record any newly achieved milestones.

    Called at session end. Each milestone can only be achieved once per character.

    Args:
        char_id: Character to check.
        conn: Writable SQLite connection.
        session_signals: Optional current session signal summary.

    Returns:
        List of newly achieved milestone dicts (empty if none new).
    """

def get_milestones(
    char_id: int,
    conn: sqlite3.Connection,
) -> list[dict]:
    """Return all achieved milestones for a character, newest first."""
```

---

## Phase C — Advanced

**Total estimate: 54–76h** | **Impact: High** | **Risk: High**

Phase C requires external libraries and significant infrastructure. Implement only after Phases A and B are validated.

---

### C1: LoRA Training Pipeline

**Effort: Heavy (38–56h)**
**Dependencies: None (standalone infrastructure)**

On-device fine-tuning of LoRA adapters using conversation history.

#### Files

| Action | Path |
|--------|------|
| **CREATE** | `backend/training/data_pipeline.py` — conversation → JSONL training data |
| **CREATE** | `backend/training/trainer_mlx.py` — Apple Silicon training via mlx-lm |
| **CREATE** | `backend/training/trainer_nvidia.py` — NVIDIA GPU training via Unsloth |
| **CREATE** | `backend/training/adapter_manager.py` — LoRA adapter CRUD + hot-swap |
| **CREATE** | `backend/training/scheduler.py` — Background auto-train scheduling |
| Modify | `backend/server.py` — API endpoints for training management |
| **CREATE** | `frontends/sakura/src/components/LoRAManager.tsx` — adapter management UI |

#### API Endpoints

```
POST   /api/training/prepare      — Generate training data from conversation history
POST   /api/training/start        — Start a LoRA fine-tuning job (background)
GET    /api/training/status        — Check training progress
POST   /api/training/cancel        — Cancel a running training job
GET    /api/adapters               — List all LoRA adapters
POST   /api/adapters/{id}/activate — Activate an adapter for a character
DELETE /api/adapters/{id}          — Delete an adapter
```

#### External Dependencies

```
# Apple Silicon:
pip install mlx-lm

# NVIDIA:
pip install unsloth
```

**Not started until Phases A+B are validated.**

---

### C2: DSPy Prompt Optimization

**Effort: Heavy (16–20h)**
**Dependencies: None (standalone)**

Automated system prompt optimization using DSPy framework.

#### Files

| Action | Path |
|--------|------|
| **CREATE** | `backend/adaptive/prompt_optimizer.py` |
| Modify | `backend/server.py` — API endpoint for triggering optimization |

#### External Dependencies

```
pip install dspy-ai
```

**Not started until Phases A+B are validated.**

---

## API Endpoints Summary (All Phases)

### Phase A (new endpoints)

| Method | Route | Request | Response | Phase |
|--------|-------|---------|----------|-------|
| `GET` | `/api/adaptive/context/{char_id}` | — | `{"context": str, "params": {...}, "confidence": float}` | A1+A2 |
| `GET` | `/api/adaptive/user-model/{char_id}` | — | Full extended user model dict | A3 |
| `PUT` | `/api/adaptive/settings` | `{"dynamic_params": bool, "over_personalization_gate": bool}` | `{"ok": true}` | A2+A4 |

### Phase B (new endpoints)

| Method | Route | Request | Response | Phase |
|--------|-------|---------|----------|-------|
| `GET` | `/api/adaptive/trends/{char_id}` | `?days=14` | `{dimension: {direction, velocity, confidence}}` | B1 |
| `POST` | `/api/memory/decay-pass` | — | `{"updated": int, "pruned": int}` | B2 |
| `GET` | `/api/adaptive/topics/{char_id}` | `?limit=20` | `[{topic, count, sentiment, emerging}]` | B5 |
| `GET` | `/api/adaptive/milestones/{char_id}` | — | `[{milestone, description, detected_at}]` | B6 |
| `POST` | `/api/adaptive/self-critique/{char_id}` | — | `{improvements: [...], strengths: [...]}` | B4 |

---

## Effort Summary

| Phase | Item | Effort Tier | Hours | Schema |
|-------|------|-------------|-------|--------|
| **A1** | Context Classifier | Quick | 3–4h | — |
| **A2** | Dynamic Parameter Tuning | Medium | 8–12h | — |
| **A3** | Extended User Model | Medium | 6–10h | v62 |
| **A4** | Over-Personalization Gate | Medium | 6–8h | — |
| **A total** | | | **23–34h** | |
| **B1** | Multi-Session Trends | Medium | 6–8h | — |
| **B2** | Ebbinghaus Memory Decay | Medium | 8–12h | v63 |
| **B3** | Memory → Behavior Pipeline | Heavy | 16–20h | — |
| **B4** | Self-Critique Loop | Medium | 8–12h | — |
| **B5** | Topic Graph | Medium | 8–12h | v64 |
| **B6** | Relationship Milestones | Medium | 6–8h | v64 |
| **B total** | | | **52–72h** | |
| **C1** | LoRA Training Pipeline | Heavy | 38–56h | — |
| **C2** | DSPy Prompt Optimization | Heavy | 16–20h | — |
| **C total** | | | **54–76h** | |
| **Grand total** | | | **129–182h** | |

---

## Recommended Execution Order

```
Sprint 1 (Week 1):  A1 → A2 → A4        (~17-24h)
Sprint 2 (Week 2):  A3 → B1 → B2         (~20-30h)
Sprint 3 (Week 3):  B3 → B5              (~24-32h)
Sprint 4 (Week 4):  B4 → B6              (~14-20h)
Sprint 5+ (Future): C1, C2 when validated
```

A1 and A2 are the fastest path to user-visible improvement — the character dynamically adjusts its LLM parameters based on conversation context, making responses feel more appropriate without any schema changes.
