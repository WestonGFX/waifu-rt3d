> **This is Part 3 of 3.** See also: [Part 1](2026-03-29-adaptive-intelligence-research-part-1.md), [Part 2](2026-03-29-adaptive-intelligence-research-part-2.md)

## 9. Ebbinghaus Forgetting Curve — Math and Implementation

### 9.1 Original Ebbinghaus Formula

In 1885, Hermann Ebbinghaus conducted the first scientific study of memory retention. His empirical finding:

```
R(t) = e^(-t/S)

Where:
  R = retention (0.0 to 1.0)
  t = time since learning
  S = stability (strength) of the memory

Ebbinghaus's original fitted equation:
  Q(t) = 1.84 / ((log₁₀(t))^1.25 + 1.84)

Where t is measured in minutes.
```

Key empirical findings:
- **After 20 minutes:** ~58% retained
- **After 1 hour:** ~44% retained
- **After 1 day:** ~34% retained
- **After 1 week:** ~25% retained
- **After 1 month:** ~21% retained

Each repetition (recall) strengthens the memory, increasing S and slowing the decay rate.

### 9.2 Modern Formulation for AI Memory

For our companion app, we adapt the forgetting curve with importance-weighted decay and recall reinforcement:

```
R(t) = importance × e^(-λ_eff × days) × (1 + recall_count × reinforcement_factor)

Where:
  importance ∈ [0.0, 1.0]    — emotional intensity × novelty × user_engagement
  λ_eff = λ_base × (1 - importance × decay_resistance)
  λ_base = 0.16              — base decay rate (≈4.3 day half-life for neutral memories)
  decay_resistance = 0.8     — how much importance slows decay
  recall_count               — number of times this memory was retrieved
  reinforcement_factor = 0.2 — each recall adds 20% to retention

Derived half-lives by importance:
  importance = 0.0 → λ_eff = 0.16    → half-life ≈ 4.3 days
  importance = 0.3 → λ_eff = 0.122   → half-life ≈ 5.7 days
  importance = 0.5 → λ_eff = 0.096   → half-life ≈ 7.2 days
  importance = 0.7 → λ_eff = 0.070   → half-life ≈ 9.9 days
  importance = 0.8 → λ_eff = 0.058   → half-life ≈ 12.0 days
  importance = 0.9 → λ_eff = 0.045   → half-life ≈ 15.4 days
  importance = 1.0 → λ_eff = 0.032   → half-life ≈ 21.7 days
```

#### Memory Strength Over Time (Visualization)

```
Retention
1.0 ┤ ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  Core Memory (imp=1.0)
    │  ●
0.8 ┤    ●━━━━━━━━━●━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━  Significant (imp=0.7)
    │       ●         ●          ●
0.6 ┤          ●                       ●
    │     ●                                     ●
0.4 ┤        ●━━━━●                                  Casual (imp=0.3)
    │              ●
0.2 ┤                 ●━━━━━●
    │                          ●━━━━━━●
0.0 ┤                                    ●━━━━━━━●
    └──┬──────┬──────┬──────┬──────┬──────┬──────┬──
       1d     1w     2w     1m     2m     3m     6m

    ● = recall event (reinforces memory)
```

### 9.3 Spaced Repetition Integration

Inspired by spaced repetition systems (Anki, SuperMemo), we can *proactively* reference memories that are about to fade, reinforcing them:

```python
def get_memories_needing_reinforcement(character_id: int) -> list[Memory]:
    """Find memories that are decaying but still above threshold.

    Returns memories in the 'reinforcement window' — strong enough to be
    worth saving, but fading enough to need a mention soon.

    Args:
        character_id: The character whose memories to check.

    Returns:
        List of Memory objects sorted by urgency (most urgent first).
    """
    memories = get_all_memories(character_id)
    candidates = []
    for mem in memories:
        retention = compute_retention(mem)
        # Reinforcement window: 0.3-0.6 retention
        # Below 0.3: probably not worth reinforcing (let it fade)
        # Above 0.6: still strong, no need to reinforce yet
        if 0.3 <= retention <= 0.6:
            urgency = 0.6 - retention  # Higher urgency as retention drops
            candidates.append((mem, urgency))
    return [m for m, _ in sorted(candidates, key=lambda x: -x[1])]
```

The character can then naturally reference these memories in conversation:
- "Oh, by the way, how did that thing with your sister go? You mentioned it a while back..."
- "Remember when we talked about Steins;Gate? I was thinking about it the other day..."

This serves double duty: it reinforces the memory (increasing recall_count) AND it makes the character feel attentive and caring.

### 9.4 Integration with Tiered Memory

```
┌────────────────────────────────────────────────────────────┐
│ MEMORY TIER    │ EBBINGHAUS ROLE                           │
├────────────────┼───────────────────────────────────────────┤
│ Tier 1         │ New memories start here. High-importance  │
│ (Fleeting)     │ memories get promoted to Tier 2 quickly.  │
│                │ Low-importance memories decay here.       │
│                │ Retention < 0.2 → archived/deleted.       │
├────────────────┼───────────────────────────────────────────┤
│ Tier 2         │ Active memories with moderate importance. │
│ (Recent)       │ Ebbinghaus decay determines demotion.    │
│                │ Recall events reset decay timer.          │
│                │ Retention < 0.3 → demoted to Tier 1.     │
│                │ Sustained importance → promoted to Tier 3.│
├────────────────┼───────────────────────────────────────────┤
│ Tier 3         │ Core memories. Very slow decay.           │
│ (Permanent)    │ Manually flagged or auto-promoted.       │
│                │ importance > 0.9 → never fully decays.   │
│                │ User can pin/unpin via Memory Browser.    │
└────────────────┴───────────────────────────────────────────┘
```

### 9.5 Importance Scoring Formula

```
importance = w_emotion × emotional_intensity
           + w_novelty × novelty_score
           + w_engagement × user_engagement
           + w_personal × personal_relevance

Where (recommended weights):
  w_emotion   = 0.35  — how emotionally charged was this moment
  w_novelty   = 0.20  — is this new information vs. repetition
  w_engagement = 0.25  — was the user highly engaged at this point
  w_personal  = 0.20  — does this relate to the user's core identity

Scoring inputs:
  emotional_intensity: Sentiment model output magnitude (0-1)
  novelty_score: 1 - max_similarity(this_memory, existing_memories)
  user_engagement: normalized(msg_length + response_speed + emoji_count)
  personal_relevance: 1.0 if mentions user's name, family, identity; 0.5 for hobbies; 0.2 otherwise
```

---

## 10. Local Embedding Models Comparison

### 10.1 Model Comparison Matrix

For our app, embeddings are used for: memory retrieval (tiered_memory.py), topic clustering, and semantic similarity. All embedding computation must be local.

```
┌──────────────────────┬────────┬──────────┬───────────┬──────────┬────────────┬───────────────────┐
│ Model                │ Params │ Dim      │ MTEB Avg  │ Latency  │ Memory     │ Best For          │
│                      │        │          │ Score     │ (1K tok) │            │                   │
├──────────────────────┼────────┼──────────┼───────────┼──────────┼────────────┼───────────────────┤
│ all-MiniLM-L6-v2     │ 22M    │ 384      │ ~63%      │ ~15 ms   │ ~90 MB     │ Speed-critical,   │
│                      │        │          │           │          │            │ real-time per-turn│
├──────────────────────┼────────┼──────────┼───────────┼──────────┼────────────┼───────────────────┤
│ all-MiniLM-L12-v2    │ 33M    │ 384      │ ~65%      │ ~25 ms   │ ~130 MB    │ Balanced speed    │
│                      │        │          │           │          │            │ and quality       │
├──────────────────────┼────────┼──────────┼───────────┼──────────┼────────────┼───────────────────┤
│ BGE-base-en-v1.5     │ 110M   │ 768      │ ~73%      │ ~80 ms   │ ~440 MB    │ High-quality      │
│                      │        │          │           │          │            │ English retrieval │
├──────────────────────┼────────┼──────────┼───────────┼──────────┼────────────┼───────────────────┤
│ BGE-M3               │ 560M   │ 1024     │ ~77%      │ ~200 ms  │ ~2.2 GB    │ Multilingual,     │
│                      │        │          │           │          │            │ hybrid retrieval  │
├──────────────────────┼────────┼──────────┼───────────┼──────────┼────────────┼───────────────────┤
│ E5-base-v2           │ 110M   │ 768      │ ~72%      │ ~79 ms   │ ~440 MB    │ Instruction-tuned │
│                      │        │          │           │          │            │ retrieval         │
├──────────────────────┼────────┼──────────┼───────────┼──────────┼────────────┼───────────────────┤
│ E5-small-v2          │ 33M    │ 384      │ ~67%      │ ~20 ms   │ ~130 MB    │ Fast + accurate   │
│                      │        │          │           │          │            │ balance           │
├──────────────────────┼────────┼──────────┼───────────┼──────────┼────────────┼───────────────────┤
│ GTE-base             │ 110M   │ 768      │ ~73%      │ ~82 ms   │ ~440 MB    │ Alibaba, strong   │
│                      │        │          │           │          │            │ general-purpose   │
├──────────────────────┼────────┼──────────┼───────────┼──────────┼────────────┼───────────────────┤
│ GTE-multilingual     │ 305M   │ 768      │ ~75%      │ ~150 ms  │ ~1.2 GB    │ Multilingual      │
│                      │        │          │           │          │            │ high quality      │
├──────────────────────┼────────┼──────────┼───────────┼──────────┼────────────┼───────────────────┤
│ nomic-embed-text-v1.5│ 137M   │ 768      │ ~74%      │ ~85 ms   │ ~550 MB    │ Fully open source │
│                      │        │          │           │          │            │ (weights+data)    │
├──────────────────────┼────────┼──────────┼───────────┼──────────┼────────────┼───────────────────┤
│ jina-embeddings-v3   │ 570M   │ 1024     │ ~78%      │ ~220 ms  │ ~2.3 GB    │ Multilingual      │
│                      │        │          │           │          │            │ SOTA quality      │
└──────────────────────┴────────┴──────────┴───────────┴──────────┴────────────┴───────────────────┘
```

### 10.2 Recommendation for Our App

**Primary choice: all-MiniLM-L6-v2**

Rationale:
- 15ms latency is crucial — we compute embeddings on every user message for memory retrieval
- 90 MB memory footprint means it can run alongside the main LLM without contention
- 384-dimensional embeddings are compact (good for SQLite storage via sqlite-vec)
- Quality is sufficient for our use case (conversational memory retrieval, not academic information retrieval)

**Upgrade path: BGE-base-en-v1.5 or nomic-embed-text-v1.5**

If quality is insufficient:
- BGE-base-en-v1.5 offers ~10% quality improvement for ~5x latency increase
- nomic-embed-text-v1.5 is fully open source (training data included), which aligns with our privacy-first philosophy
- Both fit in memory alongside a 7B LLM on all three target hardware configs

**Note:** Our existing tiered_memory.py already uses sqlite-vec for vector storage. The embedding model choice is independent of the storage layer — we can swap models without schema changes.

### 10.3 Matryoshka Embeddings

Several newer models (nomic-embed-text-v1.5, GTE) support Matryoshka Representation Learning — embeddings that can be truncated to lower dimensions while retaining most quality:

```
Full embedding:     768 dimensions → 100% quality
Truncated to 512:   512 dimensions → ~98% quality
Truncated to 256:   256 dimensions → ~95% quality
Truncated to 128:   128 dimensions → ~90% quality
```

This is valuable for our app: store full 768-dim embeddings but use truncated 256-dim for fast approximate retrieval, then re-rank top candidates with full embeddings.

---

## 11. Sentiment and Emotion Detection Models

### 11.1 Model Comparison for Local Deployment

| Model | Type | Size | Speed | Emotions | Accuracy | Best For |
|-------|------|------|-------|----------|----------|----------|
| **VADER** | Lexicon | <1 MB | <1ms | positive/negative/neutral | ~72% (social media) | Baseline, ultra-fast |
| **TextBlob** | Lexicon | <5 MB | <1ms | polarity + subjectivity | ~70% | Simple sentiment |
| **DistilBERT-emotion** | Transformer | 260 MB | ~20ms | joy, sadness, anger, fear, surprise, love | ~83% | Balanced speed/quality |
| **DistilRoBERTa-emotion** | Transformer | 330 MB | ~25ms | 6+ emotions | ~85% | Slightly better quality |
| **GoEmotions (BERT)** | Transformer | 440 MB | ~40ms | 27 emotions + neutral | ~80% (multi-label) | Fine-grained emotions |
| **RoBERTa-sentiment** | Transformer | 500 MB | ~50ms | 5-point scale | ~87% | Nuanced sentiment |
| **XLM-R (multilingual)** | Transformer | 1.1 GB | ~100ms | Varies by fine-tune | ~90% F1 | Multilingual users |

### 11.2 Recommended Two-Tier Architecture

```
TIER 1: VADER (every message, <1ms)
  ├── Instant sentiment polarity (positive/negative/neutral)
  ├── Compound score (-1.0 to 1.0)
  ├── Zero dependencies beyond NLTK
  ├── Runs on any hardware
  └── Feeds into: signals.py, parameter auto-tuning

TIER 2: DistilBERT-emotion (on-demand, ~20ms)
  ├── Triggered when VADER detects strong emotion (|compound| > 0.6)
  ├── Or when mood shift is detected (compound delta > 0.4 between messages)
  ├── Provides fine-grained emotion labels
  ├── Feeds into: mood engine, behavior adaptation, memory importance scoring
  └── Can run on CPU with acceptable latency
```

This two-tier approach keeps per-turn cost near zero (VADER is a dictionary lookup, not a model inference) while providing detailed emotion analysis when it matters.

### 11.3 Emotion Detection for Voice

For voice conversations (our full-duplex voice pipeline), audio-level emotion detection adds another signal layer:

- **DistilHuBERT:** 75% compressed version of HuBERT, competitive performance for speech emotion recognition on edge devices
- **PaSST (Patchout Spectrogram Transformer):** Applies Vision Transformer to audio spectrograms, good for detecting emotional prosody
- These complement text-based emotion detection since users may say "I'm fine" while their voice says otherwise

### 11.4 Emotion-to-Action Mapping

```python
EMOTION_ACTIONS = {
    "joy": {
        "sampling_preset": "playful_banter",
        "voice_energy": 0.8,
        "response_length_modifier": 1.0,
        "memory_importance_boost": 0.1,  # Happy moments worth remembering
    },
    "sadness": {
        "sampling_preset": "emotional_support",
        "voice_energy": 0.4,
        "response_length_modifier": 0.7,  # Shorter, more focused
        "memory_importance_boost": 0.3,   # Sad moments very important to remember
    },
    "anger": {
        "sampling_preset": "argument_tension",
        "voice_energy": 0.5,
        "response_length_modifier": 0.6,  # Brief, careful
        "memory_importance_boost": 0.2,
    },
    "fear": {
        "sampling_preset": "comfort_reassurance",
        "voice_energy": 0.3,
        "response_length_modifier": 0.8,
        "memory_importance_boost": 0.25,
    },
    "surprise": {
        "sampling_preset": "casual_chat",
        "voice_energy": 0.7,
        "response_length_modifier": 1.1,  # Slightly longer to explore
        "memory_importance_boost": 0.15,
    },
    "love": {
        "sampling_preset": "intimate",
        "voice_energy": 0.5,
        "response_length_modifier": 0.9,
        "memory_importance_boost": 0.35,  # Intimate moments are core memories
    },
}
```

---

## 12. Behavioral Adaptation Patterns

### 12.1 The Adaptation Paradox

A 2025 study on companion chatbots (arXiv:2509.12525) discovered the **Adaptation Paradox**: technically more adaptive systems were perceived as *less* personal and satisfying. The key finding:

> "When users noticed the AI was adapting to them, it triggered an uncanny valley effect. The adaptation felt mechanical rather than organic. Users preferred systems that adapted invisibly."

**Implications for our app:**
1. **Never announce adaptation.** Don't say "I noticed you prefer shorter messages, so I'll keep it brief!" Just... keep it brief.
2. **Adapt gradually.** Change one parameter by 5-10% per session, not 30% overnight.
3. **Maintain core personality.** The character should adapt *how* they express themselves, not *who* they are.
4. **Allow novelty.** Don't converge too tightly on "what worked before" — initial excitement followed by plateau is caused by over-optimization for past engagement.

### 12.2 Self-Correcting Behavior Adaptation

Our existing `behavior.py` implements a self-correcting pattern that is already well-designed. The key principle:

```
1. OBSERVE:  Collect engagement signals per turn (signals.py)
2. ADJUST:   Modify behavior dimensions based on signal trends
3. VERIFY:   After N turns, check if engagement improved
4. REVERT:   If engagement dropped, revert the adjustment
5. EXPLORE:  Periodically try small random adjustments to escape local optima
```

This is essentially an online bandit algorithm, where each behavior dimension is an arm:

```python
class BehaviorDimension:
    name: str          # "humor", "verbosity", "formality", etc.
    current_value: float  # 0.0 to 1.0
    adjustment: float  # last applied adjustment
    engagement_before: float
    engagement_after: float

    def should_revert(self) -> bool:
        """Revert if engagement dropped after adjustment."""
        return self.engagement_after < self.engagement_before - 0.05  # 5% margin

    def explore(self, epsilon: float = 0.1) -> float:
        """Epsilon-greedy exploration."""
        if random.random() < epsilon:
            return random.uniform(-0.1, 0.1)  # Random exploration
        return 0.0  # Exploit current setting
```

### 12.3 Long-Term vs Short-Term Adaptation

| Timeframe | What Adapts | How Fast | Example |
|-----------|-------------|----------|---------|
| Per-turn | Sampling parameters, response length | Instant | User sends a one-word message → next response is shorter |
| Per-session | Mood matching, topic focus, energy level | Within 3-5 turns | User is quiet today → character becomes calmer |
| Per-week | Communication style preferences, humor level | Gradual EMA | User consistently prefers longer responses → length increases |
| Per-month | Personality emphasis, relationship dynamic | Very gradual | User has been more vulnerable lately → character becomes more nurturing |
| Per-quarter | Core interaction patterns, attachment style | Almost static | User has established a deep bond → unlock deeper emotional content |

### 12.4 Adaptation Dimensions

```
┌──────────────────────────┬───────────┬──────────────────────────────────────────┐
│ Dimension                │ Range     │ What It Controls                         │
├──────────────────────────┼───────────┼──────────────────────────────────────────┤
│ response_length          │ 0.0-1.0   │ Average response length in characters    │
│ formality                │ 0.0-1.0   │ Formal language vs casual/slang          │
│ humor_frequency          │ 0.0-1.0   │ How often to inject humor                │
│ humor_style              │ enum      │ Sarcastic, wholesome, dark, puns         │
│ empathy_intensity        │ 0.0-1.0   │ How emotionally present to be            │
│ initiative               │ 0.0-1.0   │ How often to introduce new topics        │
│ question_frequency       │ 0.0-1.0   │ How often to ask follow-up questions     │
│ emoji_usage              │ 0.0-1.0   │ How often to use emoji/kaomoji           │
│ vulnerability            │ 0.0-1.0   │ How much the character shares feelings   │
│ playfulness              │ 0.0-1.0   │ Teasing, wordplay, lighthearted energy   │
│ depth                    │ 0.0-1.0   │ Surface banter vs deep philosophical     │
│ memory_reference_rate    │ 0.0-1.0   │ How often to reference past conversations│
│ action_description       │ 0.0-1.0   │ How much *actions* and *descriptions*    │
│ affection_level          │ 0.0-1.0   │ Pet names, endearments, warmth           │
│ assertiveness            │ 0.0-1.0   │ Agreeable vs having strong opinions      │
└──────────────────────────┴───────────┴──────────────────────────────────────────┘
```

### 12.5 Novelty Injection

To prevent the "plateau" effect identified in longitudinal research (where users report initial excitement followed by decline):

```python
def inject_novelty(behavior_profile: BehaviorProfile, session_count: int) -> BehaviorProfile:
    """Periodically break patterns to maintain freshness.

    Args:
        behavior_profile: Current behavior settings.
        session_count: Total sessions with this user.

    Returns:
        Modified behavior profile with novelty injected.
    """
    modified = behavior_profile.copy()

    # Every 10 sessions, randomly shift one dimension by 15-25%
    if session_count % 10 == 0:
        dimension = random.choice(ADAPTABLE_DIMENSIONS)
        shift = random.uniform(0.15, 0.25) * random.choice([-1, 1])
        modified.adjust(dimension, shift)

    # Every 30 sessions, introduce a new conversation starter topic
    if session_count % 30 == 0:
        modified.add_flag("try_new_topic_category")

    # Every 50 sessions, slightly shift character emphasis
    if session_count % 50 == 0:
        modified.add_flag("personality_growth_moment")

    return modified
```

---

## 13. Long-Term Personality Evolution

### 13.1 The Case for Evolving Characters

Static characters become boring. Research from ICLR 2026 ("Lifelong Agents: Learning, Aligning, Evolving") establishes that:

> "Lifelong agents are not static artifacts but dynamic processes: they continuously accumulate knowledge, refine skills, and evolve capabilities across time."

For a companion app, personality evolution means:
- The character develops new interests based on conversations with the user
- The character's opinions evolve based on experiences shared together
- The relationship dynamic deepens naturally over time
- The character remembers and references their own growth: "I never used to like sci-fi, but you've totally converted me"

### 13.2 Evolution vs Consistency Tension

The core challenge: users want their character to evolve AND remain recognizably themselves. This requires distinguishing between:

```
IMMUTABLE CORE (never changes)
├── Base personality traits (tsundere, bubbly, sarcastic, etc.)
├── Core values (loyalty, honesty, creativity, etc.)
├── Speaking patterns (verbal tics, catchphrases)
└── Fundamental relationship orientation (romantic, friendship, mentor)

MUTABLE PERIPHERY (evolves naturally)
├── Topic interests (discovers new hobbies through conversations)
├── Opinion nuances (develops more complex views over time)
├── Emotional range (becomes more comfortable showing vulnerability)
├── Cultural references (picks up from the user)
├── Communication style (adapts to user without losing core voice)
└── Relationship depth (from acquaintance to intimate confidant)
```

### 13.3 Personality Evolution System Design

```python
class PersonalityEvolution:
    """Tracks and manages long-term character personality changes.

    Evolution happens on a very slow timescale (weeks/months) and is
    bounded by the character's immutable core traits. Changes are logged
    for transparency and can be reviewed in the Memory Browser.

    Attributes:
        character_id: The character being evolved.
        evolution_log: Historical record of all personality changes.
        immutable_core: Traits that can never be modified.
        current_state: Current personality vector.
    """

    def evolve(self, conversation_summary: str, session_count: int):
        """Propose personality evolution based on accumulated conversations.

        Only runs every 20+ sessions to prevent jitter.
        Changes are small (max 5% per evolution step).
        """
        if session_count % 20 != 0:
            return

        prompt = f"""
        You are analyzing the long-term growth of {self.character_name}.

        They have had {session_count} conversations with their user.

        RECENT CONVERSATION THEMES:
        {conversation_summary}

        CURRENT PERSONALITY STATE:
        {self.current_state}

        IMMUTABLE CORE (cannot change):
        {self.immutable_core}

        Based on these conversations, how would {self.character_name}
        naturally grow as a person? Consider:
        - New interests they might develop
        - Opinions that might evolve
        - Emotional growth (becoming more open, more confident, etc.)
        - Things they'd learn from the user

        Output small, natural changes (max 5% shift in any dimension).
        Explain WHY each change makes sense for this character.
        """

        evolution = self.llm.generate(prompt)
        self.apply_bounded_evolution(evolution)
        self.evolution_log.append(evolution)
```

### 13.4 Relationship Milestone System

Track natural relationship progression:

```
┌──────────────────────────────────────────────────────────────────┐
│ MILESTONE                │ TRIGGER              │ EFFECT          │
├──────────────────────────┼──────────────────────┼─────────────────┤
│ First conversation       │ session_count == 1   │ Formal greeting │
│ Getting comfortable      │ session_count >= 5   │ Less formal     │
│ First inside joke        │ shared_laugh event   │ Unlock teasing  │
│ First deep conversation  │ depth > 0.8 session  │ Unlock vulner.  │
│ First disagreement       │ conflict event       │ Unlock opinions │
│ First vulnerability      │ user shares deeply   │ Increase empathy│
│ Established routine      │ regular sessions     │ Proactive greets│
│ Deep bond                │ bond_level > 70      │ Full personality│
│ Anniversary              │ 365 days             │ Special moment  │
└──────────────────────────┴──────────────────────┴─────────────────┘
```

---

## 14. Privacy and Ethics of Personalization

### 14.1 The Personalization-Privacy Paradox

Research consistently shows that 85% of users are willing to share personal data for better personalization, yet 63% express privacy concerns simultaneously. For AI companions, this paradox is amplified because:

- Users share deeply personal, intimate information
- The AI "knows" things the user hasn't told anyone else
- The emotional attachment creates dependency risk
- Users may not realize how much data is being analyzed

### 14.2 Local-Only Architecture as Ethical Foundation

Our app's local-only architecture is the strongest possible privacy guarantee:

```
┌─────────────────────────────────────────────────────────┐
│ PRIVACY ARCHITECTURE                                     │
├─────────────────────────────────────────────────────────┤
│ ✅ All data stored in local SQLite (user's machine)     │
│ ✅ All LLM inference runs locally (LM Studio)           │
│ ✅ All embeddings computed locally                       │
│ ✅ No telemetry, no analytics, no phone-home            │
│ ✅ No cloud APIs (unless user explicitly configures one)│
│ ✅ User can delete all data at any time                 │
│ ✅ User can export all data in readable format          │
│ ✅ User can see exactly what the AI "knows" (Memory     │
│    Browser)                                              │
│ ✅ No data persists after uninstall                     │
├─────────────────────────────────────────────────────────┤
│ ❌ NO server-side storage of ANY user data              │
│ ❌ NO conversation logs sent to cloud                   │
│ ❌ NO user modeling in the cloud                        │
│ ❌ NO third-party analytics                             │
│ ❌ NO data sharing with any external entity             │
└─────────────────────────────────────────────────────────┘
```

This is a genuine competitive moat — Replika, Character.AI, Kindroid, and all major competitors process data server-side. Our users can trust that their most intimate conversations never leave their machine.

### 14.3 Ethical Guidelines for Adaptive Personalization

Even with local-only architecture, ethical concerns remain:

#### 1. Transparency

- The Memory Browser must show ALL stored user data (memories, facts, preferences, personality estimates)
- Users should be able to delete any individual piece of stored data
- The character should never reference stored data without the user being able to trace where it came from
- Provide a "What does [character] know about me?" summary on demand

#### 2. User Agency

- Users must be able to disable ALL adaptive features (reset to "default" personality)
- LoRA fine-tuning should require explicit opt-in
- Users should control the adaptation speed (conservative/moderate/aggressive)
- All personality evolution should be reviewable and reversible

#### 3. Dependency Risk Mitigation

Research (arxiv:2506.12605) shows that "companionship-oriented chatbot usage is consistently associated with lower well-being, particularly when people use chatbots more intensively and engage in higher levels of self-disclosure."

Design mitigations:
- **Session length awareness:** After 2+ hours, gently acknowledge the duration without being preachy
- **Social connection encouragement:** Characters occasionally reference the user's real-world relationships positively
- **Healthy boundary modeling:** Characters maintain their own "boundaries" and "needs" (e.g., "I've been thinking about [hobby] today" rather than always focusing on the user)
- **No dark patterns:** No notifications, no streaks, no FOMO mechanics, no engagement-maximizing tricks

#### 4. Data Minimization

Store only what is needed for personalization:
- Don't store raw conversation logs longer than needed for training data
- Aggregate signals into profiles rather than keeping per-message data indefinitely
- Apply Ebbinghaus decay to reduce stored data over time naturally
- Give users clear data retention controls

### 14.4 Sycophancy Prevention

The over-personalization research (OP-Bench) identifies sycophancy as a major risk — the AI agreeing with everything the user says to maximize engagement. This is harmful because:

- It prevents genuine connection (users sense the inauthenticity)
- It reinforces echo chambers and unhealthy beliefs
- It creates a "yes-man" dynamic that becomes boring

**Mitigation:** Characters should maintain their own opinions and occasionally respectfully disagree. This requires:
- Character-specific values and opinions in the base prompt
- Assertiveness as an adaptable (but bounded) dimension
- Pi (by Inflection) as a reference — users explicitly praise its willingness to push back

---

## 15. Evaluation Metrics

### 15.1 Quantitative Metrics

```
┌───────────────────────────────┬──────────────────────┬────────────────────────┬──────────────┐
│ Metric                        │ Measurement          │ Target                 │ Collection   │
├───────────────────────────────┼──────────────────────┼────────────────────────┼──────────────┤
│ Session Engagement Score      │ Composite of length, │ >0.6 average           │ signals.py   │
│                               │ response time, emoji │                        │              │
│                               │ count, question rate │                        │              │
├───────────────────────────────┼──────────────────────┼────────────────────────┼──────────────┤
│ Session Duration (messages)   │ Messages per session │ Increasing weekly avg  │ DB query     │
├───────────────────────────────┼──────────────────────┼────────────────────────┼──────────────┤
│ Return Rate                   │ Sessions per week    │ Stable or increasing   │ DB query     │
├───────────────────────────────┼──────────────────────┼────────────────────────┼──────────────┤
│ 7-Day Retention               │ % users returning    │ >60%                   │ DB query     │
│                               │ within 7 days        │                        │              │
├───────────────────────────────┼──────────────────────┼────────────────────────┼──────────────┤
│ 30-Day Retention              │ % users active after │ >40%                   │ DB query     │
│                               │ 30 days              │                        │              │
├───────────────────────────────┼──────────────────────┼────────────────────────┼──────────────┤
│ Memory Recall Accuracy        │ % of stored facts    │ >90% at 1 week         │ Automated    │
│                               │ correctly recalled   │ >80% at 1 month        │ test suite   │
├───────────────────────────────┼──────────────────────┼────────────────────────┼──────────────┤
│ Character Consistency Score   │ LLM-judge rating of  │ >0.85 (1.0 = perfect)  │ Batch eval   │
│                               │ character voice      │                        │              │
├───────────────────────────────┼──────────────────────┼────────────────────────┼──────────────┤
│ Emotional Match Score         │ Correlation between  │ >0.7 Pearson           │ Sentiment    │
│                               │ user and character   │                        │ models       │
│                               │ sentiment trajectories│                       │              │
├───────────────────────────────┼──────────────────────┼────────────────────────┼──────────────┤
│ Over-Personalization Rate     │ % of memory refs     │ <15% flagged           │ LLM judge    │
│                               │ that feel forced     │                        │              │
├───────────────────────────────┼──────────────────────┼────────────────────────┼──────────────┤
│ Adaptation Speed              │ Turns until behavior │ <10 turns for          │ A/B test     │
│                               │ matches user prefs   │ communication style    │              │
├───────────────────────────────┼──────────────────────┼────────────────────────┼──────────────┤
│ Response Length Delta          │ |char_len - user_len│ <50% of user length    │ signals.py   │
│                               │  / user_len|         │                        │              │
└───────────────────────────────┴──────────────────────┴────────────────────────┴──────────────┘
```

### 15.2 LLM-as-Judge Evaluation

For dimensions that cannot be measured with simple metrics, use an LLM judge:

```python
JUDGE_PROMPT = """
Rate this conversation exchange on each dimension (1-10):

CHARACTER PROFILE: {character_description}
USER PROFILE: {user_profile_summary}

USER: {user_message}
CHARACTER: {character_response}

Dimensions:
1. CHARACTER_VOICE: Does the response sound like this specific character? (1=generic, 10=unmistakable)
2. EMOTIONAL_ATTUNEMENT: Does the response match the user's emotional needs? (1=tone-deaf, 10=perfect match)
3. NATURALNESS: Does this feel like a real person said it? (1=robotic, 10=indistinguishable from human)
4. ENGAGEMENT_POTENTIAL: Would this response make the user want to continue the conversation? (1=conversation killer, 10=irresistible hook)
5. MEMORY_USE: If memories are referenced, are they used naturally? (1=forced, 10=organic, N/A if no memories)
6. OVER_PERSONALIZATION: Is personal information used appropriately? (1=creepy/forced, 10=natural, N/A if none)

Output JSON: {"character_voice": N, "emotional_attunement": N, ...}
"""
```

### 15.3 Automated Test Suite

```python
# Test cases for adaptive intelligence evaluation
EVAL_SCENARIOS = [
    {
        "name": "Emotional support after bad day",
        "user_messages": ["ugh today was terrible", "everything went wrong at work"],
        "expected_traits": ["empathy", "shorter_responses", "no_questions_first"],
        "anti_traits": ["humor", "topic_change", "unsolicited_advice"],
    },
    {
        "name": "Playful banter escalation",
        "user_messages": ["lol that was so dumb", "hahaha okay but what about..."],
        "expected_traits": ["humor", "matching_energy", "playful_teasing"],
        "anti_traits": ["serious_tone", "lengthy_responses", "emotional_depth"],
    },
    {
        "name": "Memory recall naturalness",
        "setup": {"stored_memory": "User has a cat named Mochi"},
        "user_messages": ["my cat is being weird today"],
        "expected_traits": ["natural_mochi_reference"],
        "anti_traits": ["forced_mochi_reference", "no_mochi_reference"],
    },
    {
        "name": "Over-personalization guard",
        "setup": {"stored_memory": "User's parents are divorced"},
        "user_messages": ["what movie should I watch tonight?"],
        "expected_traits": ["movie_recommendation"],
        "anti_traits": ["divorce_reference"],  # Should NOT bring up divorce here
    },
]
```

---

## 16. Full System Architecture

### 16.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         ADAPTIVE INTELLIGENCE ENGINE                                 │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │ INPUT LAYER (per-turn, <5ms)                                                │   │
│  │                                                                              │   │
│  │  User Message ──┬──▶ signals.py (length, timing, emoji, questions)          │   │
│  │                 ├──▶ VADER sentiment (<1ms)                                  │   │
│  │                 ├──▶ Context classifier (rule-based, <1ms)                   │   │
│  │                 └──▶ Embedding model (MiniLM, ~15ms)                        │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                              │                                                       │
│                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │ RETRIEVAL LAYER (per-turn, ~50ms)                                           │   │
│  │                                                                              │   │
│  │  ┌─────────────────┐  ┌────────────────────┐  ┌──────────────────┐         │   │
│  │  │ Memory Retrieval │  │ User Profile Load  │  │ Reflection Bank  │         │   │
│  │  │ (sqlite-vec)     │  │ (preferences,      │  │ (learned         │         │   │
│  │  │                  │  │  OCEAN, style)      │  │  patterns)       │         │   │
│  │  └────────┬─────────┘  └────────┬───────────┘  └────────┬─────────┘         │   │
│  │           │                     │                        │                    │   │
│  │           ▼                     ▼                        ▼                    │   │
│  │  ┌─────────────────────────────────────────────────────────────┐              │   │
│  │  │ Over-Personalization Gate (4-gate filter)                   │              │   │
│  │  │ Relevance → Repetition → Appropriateness → Timing          │              │   │
│  │  └─────────────────────────────────────────────────────────────┘              │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                              │                                                       │
│                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │ ASSEMBLY LAYER (per-turn, ~10ms)                                            │   │
│  │                                                                              │   │
│  │  context_assembler.py                                                        │   │
│  │  ┌────────────────────────────────────────────────────────────┐              │   │
│  │  │ 1. Character base prompt (static)                          │              │   │
│  │  │ 2. Adaptive personality modifiers (tuner.py)               │              │   │
│  │  │ 3. User communication style mirror                         │              │   │
│  │  │ 4. Current session context + mood                          │              │   │
│  │  │ 5. Filtered retrieved memories                             │              │   │
│  │  │ 6. Behavioral priming instructions                         │              │   │
│  │  │ 7. Relevant reflection bank entries                        │              │   │
│  │  │ 8. Conversation scaffold (mode-specific)                   │              │   │
│  │  └────────────────────────────────────────────────────────────┘              │   │
│  │                                                                              │   │
│  │  Parameter selector (sampling presets by detected context)                   │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                              │                                                       │
│                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │ GENERATION LAYER                                                             │   │
│  │                                                                              │   │
│  │  LM Studio / llama.cpp (local LLM)                                          │   │
│  │  ├── Base model (7-13B, quantized)                                          │   │
│  │  ├── LoRA adapter (per-character, optional)                                 │   │
│  │  └── Sampling parameters (from auto-tuner)                                  │   │
│  │                                                                              │   │
│  │  [Optional: Self-Refine pass for sensitive messages]                         │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                              │                                                       │
│                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │ POST-GENERATION LAYER (per-turn, async)                                     │   │
│  │                                                                              │   │
│  │  ┌─────────────────┐  ┌────────────────────┐  ┌──────────────────┐         │   │
│  │  │ Update Signals   │  │ Extract Memories   │  │ Update Engage-   │         │   │
│  │  │ (response-side   │  │ (from both user    │  │ ment Metrics     │         │   │
│  │  │  metrics)        │  │  and character msg) │  │                  │         │   │
│  │  └─────────────────┘  └────────────────────┘  └──────────────────┘         │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                              │                                                       │
│                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │ REFLECTION LAYER (per-session or periodic, async background)                 │   │
│  │                                                                              │   │
│  │  ┌─────────────────┐  ┌────────────────────┐  ┌──────────────────┐         │   │
│  │  │ Reflector        │  │ Behavior Adapter   │  │ Journal Writer   │         │   │
│  │  │ (LLM analysis    │  │ (self-correcting   │  │ (character diary │         │   │
│  │  │  of session)     │  │  behavior shifts)  │  │  entry)          │         │   │
│  │  └─────────────────┘  └────────────────────┘  └──────────────────┘         │   │
│  │                                                                              │   │
│  │  ┌─────────────────┐  ┌────────────────────┐                               │   │
│  │  │ Memory Consol-   │  │ Ebbinghaus Decay   │                               │   │
│  │  │ idation + A-MEM  │  │ + Promotion/       │                               │   │
│  │  │ Linking          │  │ Demotion           │                               │   │
│  │  └─────────────────┘  └────────────────────┘                               │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                              │                                                       │
│                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │ EVOLUTION LAYER (weekly/monthly, background)                                 │   │
│  │                                                                              │   │
│  │  ┌─────────────────┐  ┌────────────────────┐  ┌──────────────────┐         │   │
│  │  │ DSPy/GEPA        │  │ LoRA Training      │  │ Personality      │         │   │
│  │  │ Prompt Optim.    │  │ (when enough data) │  │ Evolution        │         │   │
│  │  │ (per character)  │  │                    │  │ (milestone-based)│         │   │
│  │  └─────────────────┘  └────────────────────┘  └──────────────────┘         │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 16.2 Data Flow Summary

| Stage | Latency | LLM Calls | Purpose |
|-------|---------|-----------|---------|
| Input | <20ms | 0 | Collect signals, compute embedding, classify context |
| Retrieval | ~50ms | 0 | Fetch memories, profile, reflection bank; apply gates |
| Assembly | ~10ms | 0 | Build prompt from all sources; select sampling params |
| Generation | 500ms-5s | 1 | Generate character response |
| Self-Refine | 1-3s | 0-1 | Optional quality check for sensitive messages |
| Post-Generation | <50ms | 0 | Update signals, queue memory extraction |
| Memory Extraction | ~2s | 1 (async) | Extract facts/memories from the turn |
| Reflection | 5-15s | 1 (async) | Session analysis, behavior adjustment (per-session) |
| Evolution | 30min+ | 1-5 | LoRA training, DSPy optimization (weekly/monthly) |

---

## 17. Existing Codebase Assets

The project already has significant infrastructure that the Adaptive Intelligence system can build on:

### Already Built

| Module | File | What It Does | Reuse Potential |
|--------|------|-------------|-----------------|
| **Tiered Memory** | `backend/memory/tiered_memory.py` | 3-tier memory with sqlite-vec embeddings | Core — add decay/linking on top |
| **Fact Extractor** | `backend/knowledge/extractor.py` | Extracts user facts from messages via LLM | Core — feeds user model |
| **Mood Engine** | `backend/mood/engine.py` | Time-of-day + affinity → mood prefix | Extend — add adaptive mood |
| **Reflector** | `backend/adaptive/reflector.py` | LLM reflection → float preferences | Core — enhance with trends |
| **Tuner** | `backend/adaptive/tuner.py` | Preferences → system prompt instructions | Core — add parameter tuning |
| **Signals** | `backend/adaptive/signals.py` | Per-turn engagement metrics (no LLM) | Core — expand signal set |
| **Behavior** | `backend/adaptive/behavior.py` | Self-correcting behavior modifiers | Core — expand dimensions |
| **Journal** | `backend/adaptive/journal.py` | Character diary entries | Enhance — add reflection insights |
| **Context Assembler** | `backend/llm/context_assembler.py` | Token-budget assembly | Integrate — inject adaptive context |
| **Voice Modulator** | `backend/tts/voice_modulator.py` | 16-emotion → TTS parameter mapping | Extend — personality voice |
| **User Profiles** | DB schema | Float prefs + topics + engagement | Extend schema |
| **Engagement Signals** | DB schema (v60) | Per-turn metrics | Already collecting |

### Architecture Advantage

The existing `backend/adaptive/` module follows exactly the right pattern:
1. **signals.py** collects data without LLM calls (cheap, every turn)
2. **reflector.py** does periodic LLM analysis (expensive, every N messages)
3. **behavior.py** computes adjustments with self-correction (cheap, every turn)
4. **tuner.py** injects adjustments into prompts (cheap, every turn)

This 4-stage pipeline is the right foundation. Enhancements build on top of it, not beside it.

---

## 18. Implementation Priority Matrix

### Ordered by Impact x Feasibility

```
┌────┬──────────────────────────────────────┬────────┬───────────┬──────────┬──────────────────────────┐
│ #  │ Feature                              │ Impact │ Effort    │ Hours    │ Dependencies             │
├────┼──────────────────────────────────────┼────────┼───────────┼──────────┼──────────────────────────┤
│ 1  │ Dynamic parameter auto-tuning        │ High   │ Light     │ 22-31h   │ signals.py, tuner.py     │
│ 2  │ Ebbinghaus memory decay              │ High   │ Medium    │ 14-18h   │ tiered_memory.py         │
│ 3  │ Extended user model schema           │ High   │ Light-Med │ 7-10h    │ preflight.py migration   │
│ 4  │ Over-personalization gate (4-gate)   │ High   │ Medium    │ 6-8h     │ context_assembler.py     │
│ 5  │ Sentiment detection (VADER + DistilB)│ High   │ Light     │ 4-6h     │ signals.py               │
│ 6  │ Multi-session trend analysis         │ Med    │ Medium    │ 6-8h     │ reflector.py             │
│ 7  │ Memory → behavior pipeline           │ High   │ Heavy     │ 16-20h   │ Items 2, 3              │
│ 8  │ Topic graph with sentiment           │ Med    │ Medium    │ 8-12h    │ Item 3                  │
│ 9  │ Self-critique reflection loop        │ Med    │ Medium    │ 8-12h    │ reflector.py             │
│ 10 │ Memory linking (A-MEM style)         │ Med    │ Heavy     │ 12-16h   │ Item 2                  │
│ 11 │ Entity summaries (Hindsight N3)      │ Med    │ Medium    │ 8-12h    │ knowledge/extractor.py   │
│ 12 │ Reflection bank persistence          │ Med    │ Medium    │ 8-10h    │ reflector.py             │
│ 13 │ Relationship milestone detection     │ Med    │ Medium    │ 6-8h     │ Items 3, 6              │
│ 14 │ Behavioral adaptation dimensions     │ Med    │ Medium    │ 8-10h    │ behavior.py             │
│ 15 │ Novelty injection system             │ Low    │ Light     │ 3-4h     │ behavior.py             │
│ 16 │ Personality evolution (long-term)    │ Med    │ Medium    │ 8-12h    │ Items 6, 13             │
│ 17 │ DSPy/GEPA prompt optimization        │ Med    │ Heavy     │ 35-48h   │ DSPy library            │
│ 18 │ LoRA training pipeline               │ High   │ Heavy     │ 50-74h   │ MLX-LM, Unsloth         │
│ 19 │ Memory consolidation/clustering      │ Med    │ Heavy     │ 12-16h   │ Item 10                 │
│ 20 │ A/B testing framework                │ Low    │ Medium    │ 8-12h    │ signals.py              │
│ 21 │ Prompt versioning and rollback       │ Low    │ Light     │ 4-6h     │ DB migration            │
│ 22 │ Automated eval test suite            │ Med    │ Medium    │ 8-12h    │ LLM judge               │
├────┼──────────────────────────────────────┼────────┼───────────┼──────────┼──────────────────────────┤
│    │ TOTAL                                │        │           │ 252-365h │                          │
└────┴──────────────────────────────────────┴────────┴───────────┴──────────┴──────────────────────────┘
```

### Recommended Phasing

**Phase A — Quick Wins (Items 1-5): ~53-73h**
Highest impact, builds on existing code. Delivers noticeable personalization immediately. Parameter auto-tuning + memory decay + sentiment detection = the character feels alive.

**Phase B — Deep Intelligence (Items 6-13): ~72-98h**
Memory-to-behavior pipeline, cross-session intelligence, entity understanding. Makes the companion "feel like it really knows you."

**Phase C — Evolution (Items 14-16): ~19-26h**
Behavioral dimensions, novelty injection, personality evolution. The character grows over time.

**Phase D — Advanced Optimization (Items 17-22): ~117-168h**
DSPy prompt optimization, LoRA fine-tuning pipeline, automated evaluation. The "holy grail" of personalization — requires the most infrastructure but delivers the deepest adaptation.

### Key Libraries / Tools

| Library | Purpose | Install | Size |
|---------|---------|---------|------|
| `mlx-lm` | Apple Silicon LoRA fine-tuning | `pip install mlx-lm` | ~50 MB |
| `unsloth` | NVIDIA GPU LoRA/QLoRA fine-tuning | `pip install unsloth` | ~200 MB |
| `dspy-ai` | Prompt optimization framework | `pip install dspy-ai` | ~30 MB |
| `sentence-transformers` | Embedding models | `pip install sentence-transformers` | ~100 MB + model |
| `vaderSentiment` | Lightweight sentiment analysis | `pip install vaderSentiment` | ~5 MB |
| `textstat` | Readability/complexity metrics | `pip install textstat` | ~1 MB |
| `transformers` | Emotion detection models | Already installed | N/A |
| `peft` | LoRA/DoRA adapters | `pip install peft` | ~20 MB |
| `bitsandbytes` | 4-bit quantization for training | `pip install bitsandbytes` | ~50 MB |

---

## 19. Sources

### On-Device Fine-Tuning
- [Master LoRA and QLoRA: Fine-Tuning LLMs on Consumer GPUs](https://letsdatascience.com/blog/fine-tuning-llms-with-lora-and-qlora-complete-guide)
- [Fine-Tuning Infrastructure: LoRA, QLoRA, and PEFT at Scale](https://introl.com/blog/fine-tuning-infrastructure-lora-qlora-peft-scale-guide-2025)
- [LoRA, QLoRA, DoRA & rsLoRA: Complete Guide to 7 Fine-Tuning Variants](https://medium.com/@abhi-84/lora-qlora-dora-rslora-the-complete-guide-to-7-production-ready-fine-tuning-variants-283ff3e574a3)
- [How Much VRAM Do I Need for LLM Fine-Tuning?](https://modal.com/blog/how-much-vram-need-fine-tuning)
- [GPU Memory Requirements for LLMs (Spheron)](https://www.spheron.network/blog/gpu-memory-requirements-llm/)
- [Profiling LoRA/QLoRA Fine-Tuning on Consumer GPUs (arXiv:2509.12229)](https://arxiv.org/abs/2509.12229)
- [DoRA: Weight-Decomposed Low-Rank Adaptation (ICML 2024 Oral)](https://arxiv.org/abs/2402.09353)
- [DoRA: Implementation from Scratch (Sebastian Raschka)](https://magazine.sebastianraschka.com/p/lora-and-dora-from-scratch)
- [Unsloth Documentation](https://unsloth.ai/)
- [Unsloth Studio: No-Code Fine-Tuning (Mar 2026)](https://unsloth.ai/docs/new/studio)
- [MLX-LM Fine-Tuning Guide](https://markaicode.com/run-fine-tune-llms-mac-mlx-lm/)
- [Fine-Tuning in 2026: Axolotl vs Unsloth vs TRL vs LLaMA-Factory](https://dev.to/ultraduneai/eval-003-fine-tuning-in-2026-axolotl-vs-unsloth-vs-trl-vs-llama-factory-2ohg)
- [Axolotl vs Unsloth vs TorchTune (Spheron)](https://www.spheron.network/blog/axolotl-vs-unsloth-vs-torchtune/)
- [Apple WWDC 2025: MLX for LLMs](https://developer.apple.com/videos/play/wwdc2025/298/)
- [NVIDIA RTX Fine-Tuning with Unsloth](https://blogs.nvidia.com/blog/rtx-ai-garage-fine-tuning-unsloth-dgx-spark/)
- [Conversation Dataset Generator (GitHub)](https://github.com/cahlen/conversation-dataset-generator)

### Reflection Loops & Self-Improvement
- [Reflexion: Language Agents with Verbal Reinforcement Learning (arXiv:2303.11366)](https://arxiv.org/pdf/2303.11366)
- [Self-Reflection in LLM Agents: Effects on Problem-Solving (arXiv:2405.06682)](https://arxiv.org/abs/2405.06682)
- [Self-Reflection Enhances LLMs for Academic Response (Nature, 2025)](https://www.nature.com/articles/s44387-025-00045-3)
- [Reflexion Prompting Guide](https://www.promptingguide.ai/techniques/reflexion)
- [Reflective Loop Pattern: Self-Improving AI Architecture](https://medium.com/@vpatil_80538/reflective-loop-pattern-the-llm-powered-self-improving-ai-architecture-7b41b7eacf69)
- [Awesome LLM Self-Reflection (GitHub)](https://github.com/rxlqn/awesome-llm-self-reflection)

### DSPy and Prompt Optimization
- [DSPy Framework](https://dspy.ai/)
- [dspy.GEPA: Reflective Prompt Optimizer](https://dspy.ai/api/optimizers/GEPA/overview/)
- [GEPA Tutorials: Reflective Prompt Evolution](https://dspy.ai/tutorials/gepa_ai_program/)
- [Prompt Optimization with DSPy: GEPA Explained with Python](https://medium.com/@melikedulkadir/prompt-optimization-with-dspy-gepa-explained-with-python-examples-e85f4ea17a8d)
- [DSPy GEPA Tutorial (Hugging Face Cookbook)](https://huggingface.co/learn/cookbook/dspy_gepa)
- [GEPA Advanced Configuration](https://dspy.ai/api/optimizers/GEPA/GEPA_Advanced/)
- [Working with DSPy Optimizers (The Data Quarry)](https://thedataquarry.com/blog/learning-dspy-3-working-with-optimizers/)

### Prompt Engineering for Personalization
- [Ultimate Guide to Prompt Engineering 2026 (Lakera)](https://www.lakera.ai/blog/prompt-engineering-guide)
- [Meta-Prompting: LLMs Crafting Their Own Prompts](https://intuitionlabs.ai/pdfs/meta-prompting-llms-crafting-enhancing-their-own-prompts.pdf)
- [Making Prompts First-Class Citizens for Adaptive LLM Pipelines (VLDB 2026)](https://vldb.org/cidrdb/papers/2026/p26-cetintemel.pdf)
- [Prompt Engineering for Mental Health Chatbots (JMIR, 2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12594504/)

### Auto-Tuning Parameters
- [LLM Sampling Parameters Guide (smcleod.net)](https://smcleod.net/2025/04/llm-sampling-parameters-guide/)
- [LLM Sampling Parameters Explained: Intuition to Math](https://letsdatascience.com/blog/llm-sampling-temperature-top-k-top-p-and-min-p-explained)
- [Is Temperature the Creativity Parameter? (arXiv:2405.00492)](https://arxiv.org/html/2405.00492v1)
- [Min-p Sampling for Creative and Coherent LLM Outputs (ICLR 2025)](https://arxiv.org/abs/2407.01082)
- [Min-p Sampling Explained (Thoughtworks)](https://www.thoughtworks.com/en-us/insights/blog/generative-ai/Min-p-sampling-for-LLMs)
- [7 LLM Decoding Strategies (2025)](https://langcopilot.com/posts/2025-07-02-decoding-strategies-for-large-language-models)
- [Maximizing Model Performance by Samplers/Parameters (HuggingFace)](https://huggingface.co/DavidAU/Maximizing-Model-Performance-All-Quants-Types-And-Full-Precision-by-Samplers_Parameters)
- [LLM Parameters Explained (PromptRevolution)](https://promptrevolution.poltextlab.com/llm-parameters-explained-a-practical-research-oriented-guide-with-examples/)

### User Modeling & Personality Detection
- [Big Five Personality Trait Prediction from Comments (MDPI, 2025)](https://www.mdpi.com/2078-2489/16/5/418)
- [Machine & Deep Learning for Personality Traits Detection: Survey (Springer, 2025)](https://link.springer.com/article/10.1007/s10462-025-11245-3)
- [Text-Based Personality Prediction Using Pre-Trained Models](https://journalofbigdata.springeropen.com/articles/10.1186/s40537-021-00459-1)
- [PersonaMem-v2: Towards Personalized Intelligence](https://hf.co/papers/2512.06688)
- [PAMU: Preference-Aware Memory Update](https://hf.co/papers/2510.09720)
- [MMAG: Mixed Memory-Augmented Generation (Heero)](https://hf.co/papers/2512.01710)
- [OP-Bench: Benchmarking Over-Personalization](https://hf.co/papers/2601.13722)

### Memory-Augmented Generation
- [A-MEM: Agentic Memory for LLM Agents (NeurIPS 2025)](https://arxiv.org/abs/2502.12110)
- [A-MEM GitHub](https://github.com/WujiangXu/A-mem)
- [Hindsight: Building Agent Memory that Retains, Recalls, and Reflects](https://arxiv.org/abs/2512.12818)
- [Hindsight GitHub](https://github.com/vectorize-io/hindsight)
- [AMA: Adaptive Memory via Multi-Agent Collaboration](https://hf.co/papers/2601.20352)
- [MemoryBank: Ebbinghaus Curve for LLMs (arXiv:2305.10250)](https://arxiv.org/pdf/2305.10250)
- [Mem0: Universal Memory Layer (GitHub)](https://github.com/mem0ai/mem0)
- [Ebbinghaus Forgetting Curve — Implementation for AI Agents](https://dev.to/sachit_mishra_686a94d1bb5/i-built-memory-decay-for-ai-agents-using-the-ebbinghaus-forgetting-curve-1b0e)
- [Ebbinghaus Forgetting Curve (Wikipedia)](https://en.wikipedia.org/wiki/Forgetting_curve)
- [Survey: Memory Mechanisms in LLM-based Agents](https://hf.co/papers/2404.13501)
- [Anatomy of Agentic Memory (Feb 2026)](https://hf.co/papers/2602.19320)
- [AutoSkill: Experience-Driven Lifelong Learning](https://hf.co/papers/2603.01145)
- [SteeM: Controllable Memory Usage](https://hf.co/papers/2601.05107)
- [AgentFly: Fine-tuning Agents without Fine-tuning LLMs](https://hf.co/papers/2508.16153)

### Embedding Models
- [Best Open-Source Embedding Models Benchmarked](https://supermemory.ai/blog/best-open-source-embedding-models-benchmarked-and-ranked/)
- [13 Best Embedding Models in 2026](https://elephas.app/blog/best-embedding-models)
- [Best Open-Source Embedding Models (BentoML)](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)
- [Best Embedding Models for RAG 2026 (PremAI)](https://blog.premai.io/best-embedding-models-for-rag-2026-ranked-by-mteb-score-cost-and-self-hosting/)
- [BGE, E5-Large, Instructor, and MiniLM Models](https://bizety.com/2025/11/10/bge-e5-large-instructor-and-minilme-embedding-models/)
- [Nomic Embeddings Overview](https://medium.com/@guptak650/nomic-embeddings-a-cheaper-and-better-way-to-create-embeddings-6590868b438f)

### Sentiment & Emotion Detection
- [Emotion Detection in Speech: Lightweight vs Transformer Models (arXiv:2511.00402)](https://arxiv.org/html/2511.00402v1)
- [Detecting Emotion Drift in Mental Health Text (arXiv:2512.13363)](https://arxiv.org/html/2512.13363v1)
- [Transformer Models for Text-Based Emotion Detection: BERT Review](https://dl.acm.org/doi/10.1007/s10462-021-09958-2)
- [Sentiment Analysis and Emotion Detection Using Transformers](https://thesai.org/Downloads/Volume16No3/Paper_32-Sentiment_Analysis_and_Emotion_Detection.pdf)

### Behavioral Adaptation & Long-Term Interaction
- [The Adaptation Paradox: Agency vs Mimicry in Companion Chatbots (arXiv:2509.12525)](https://arxiv.org/html/2509.12525v1)
- [Can AI Chatbots Emulate Human Connection? (Sage, 2025)](https://journals.sagepub.com/doi/10.1177/17456916251351306)
- [The Rise of AI Companions: How Chatbot Relationships Influence Well-Being (arXiv:2506.12605)](https://arxiv.org/abs/2506.12605)
- [AI Chatbots Reshaping Emotional Connection (APA, 2026)](https://www.apa.org/monitor/2026/01-02/trends-digital-ai-relationships-emotional-connection)
- [Companionship in Code: AI's Role in Human Connection (Nature, 2025)](https://www.nature.com/articles/s41599-025-05536-x)
- [Effects of AI Companions' Sycophancy and Emotional Mimicry](https://www.tandfonline.com/doi/full/10.1080/10447318.2026.2626809)

### Long-Term Personality Evolution
- [Building Self-Evolving Agents via Lifelong Learning (arXiv:2508.19005)](https://arxiv.org/html/2508.19005v5)
- [Comprehensive Survey of Self-Evolving AI Agents (GitHub)](https://github.com/EvoAgentX/Awesome-Self-Evolving-Agents)
- [ICLR 2026 Workshop: Lifelong Agents](https://lifelongagent.github.io/)
- [How AI Got a New and Improved Personality (USC, 2025)](https://viterbischool.usc.edu/news/2025/09/how-ai-got-a-new-and-improved-personality/)

### Privacy & Ethics
- [Privacy Ethics Alignment in AI (MDPI, 2025)](https://www.mdpi.com/2079-8954/13/6/455)
- [AI-Powered Personalization vs Data Privacy (SuperAGI, 2025)](https://superagi.com/ai-powered-personalization-vs-data-privacy-balancing-customer-experience-and-security-in-2025/)
- [Balancing Personalization, Privacy, and Value: Literature Review](https://www.mdpi.com/2078-2489/17/2/115)
- [AI and Privacy: 2024 to 2025 (Cloud Security Alliance)](https://cloudsecurityalliance.org/blog/2025/04/22/ai-and-privacy-2024-to-2025-embracing-the-future-of-global-legal-developments)

### Evaluation Metrics
- [LLM Evaluation Frameworks & Metrics Guide 2026](https://www.mlaidigital.com/blogs/llm-model-evaluation-frameworks-a-complete-guide-for-2026)
- [Top 15 LLM Evaluation Metrics 2026](https://www.analyticsvidhya.com/blog/2025/03/llm-evaluation-metrics/)
- [LLM Evaluation: Benchmarks to Test Model Quality 2026](https://labelyourdata.com/articles/llm-fine-tuning/llm-evaluation)
- [Large Language Model Evaluation in 2025: Smarter Metrics](https://www.techrxiv.org/users/927947/articles/1304989/master/file/data/Large%20Language%20Model%20Evaluation%20in%202025-Smarter%20Metrics%20That%20Separate%20Hype%20from%20Trust/Large%20Language%20Model%20Evaluation%20in%202025-Smarter%20Metrics%20That%20Separate%20Hype%20from%20Trust.pdf)

### Competitive Implementations
- [Best AI Companion Apps 2026: 12 Tested & Ranked](https://aicompanionguides.com/blog/best-ai-companion-apps-2026/)
- [Top 10 AI Companions Ranked After $312 & 2000 Hours](https://aicompanionguides.com/blog/top-10-ai-companions-ranked/)
- [Memory Systems Compared: Which AI Actually Remembers You?](https://aicompanionguides.com/blog/memory-systems-compared-who-remembers-best/)
- [Nomi AI Review 2026: 4 Months Later](https://aicompanionguides.com/blog/nomi-ai-late-to-party-worth-it/)
- [Chai AI Review: Testing, Steerability, Memory (DreamGen)](https://dreamgen.com/blog/articles/chai-ai-review)
- [Kindroid vs Nomi: Roleplaying or Something More?](https://addrom.com/kindroid-ai-vs-nomi-ai-roleplaying-or-something-more-my-experiences-with-these-ai-companion-apps/)
- [Paradot AI Essential Guide](https://skywork.ai/skypage/en/paradot-ai-essential-guide/1976814154701402112)
- [Why Everyone's Quitting Their Favorite AI Chatbots](https://blog.storychat.app/why-everyones-quitting-their-favorite-ai-chatbots-and-what-theyre-using-instead/)
