> **This is Part 2 of 3.** See also: [Part 1](2026-03-29-adaptive-intelligence-research-part-1.md), [Part 3](2026-03-29-adaptive-intelligence-research-part-3.md)

## 4. User Modeling

### 4.1 Techniques for Local User Modeling

#### Preference Vector (Already Partially Implemented)

The codebase's `user_profiles` table stores float preferences (0.0-1.0):
- `pref_response_length`, `pref_formality`, `pref_humor`, `pref_empathy`, `pref_depth`
- `top_3_topics`, `topics_to_avoid`, `personality_traits_user_likes`

**Gap:** These are populated by periodic LLM reflection. More signals can be captured without LLM calls.

#### Extended User Model Schema

```
User Model (proposed extension)
├── Communication Style
│   ├── pref_response_length (0-1)     ← exists
│   ├── pref_formality (0-1)           ← exists
│   ├── pref_humor (0-1)               ← exists
│   ├── avg_message_length (int)       ← NEW: raw metric
│   ├── vocabulary_complexity (0-1)    ← NEW: Flesch-Kincaid proxy
│   ├── emoji_frequency (0-1)          ← NEW: emoji/kaomoji usage rate
│   ├── question_rate (0-1)            ← NEW: how often they ask vs state
│   ├── slang_density (0-1)            ← NEW: informal language usage
│   ├── sentence_complexity (0-1)      ← NEW: avg clauses per sentence
│   └── typing_speed_proxy (0-1)       ← NEW: chars per second between messages
│
├── Emotional Patterns
│   ├── pref_empathy (0-1)             ← exists
│   ├── emotional_volatility (0-1)     ← NEW: variance in sentiment per session
│   ├── comfort_seeking_freq (0-1)     ← NEW: how often they seek reassurance
│   ├── peak_engagement_hour (int)     ← NEW: when they're most engaged
│   ├── mood_correlation_map (JSON)    ← NEW: which moods get best responses
│   ├── vulnerability_frequency (0-1)  ← NEW: how often they share deeply personal info
│   └── humor_style (enum)             ← NEW: sarcastic/wholesome/dark/puns/physical
│
├── Topic Graph
│   ├── top_3_topics (JSON)            ← exists
│   ├── topics_to_avoid (JSON)         ← exists
│   ├── topic_frequency_map (JSON)     ← NEW: topic → count over time
│   ├── topic_sentiment_map (JSON)     ← NEW: topic → avg engagement
│   ├── emerging_interests (JSON)      ← NEW: recently rising topics
│   ├── topic_depth_pref (JSON)        ← NEW: topic → preferred discussion depth
│   └── topic_trigger_map (JSON)       ← NEW: topic → emotional reaction pattern
│
├── Interaction Patterns
│   ├── avg_session_length (int)       ← NEW: messages per session
│   ├── session_frequency (float)      ← NEW: sessions per day/week
│   ├── preferred_conversation_depth   ← NEW: shallow banter vs deep dives
│   ├── initiative_ratio (0-1)         ← NEW: do they lead or follow
│   ├── re_engagement_patterns (JSON)  ← NEW: what brings them back
│   ├── goodbye_style (enum)           ← NEW: abrupt/gradual/lingering
│   └── multitasking_indicator (0-1)   ← NEW: fast short messages = distracted
│
├── Personality Profile (Big Five / OCEAN)
│   ├── openness (0-1)                ← NEW: curiosity, creativity, willingness to explore
│   ├── conscientiousness (0-1)       ← NEW: organized, detail-oriented, planful
│   ├── extraversion (0-1)            ← NEW: energetic, talkative, assertive
│   ├── agreeableness (0-1)           ← NEW: cooperative, empathetic, trusting
│   ├── neuroticism (0-1)             ← NEW: emotional reactivity, anxiety, moodiness
│   └── confidence_scores (JSON)      ← NEW: confidence per trait (low until enough data)
│
└── Relationship State
    ├── bond_level (int)               ← may exist in affinity system
    ├── trust_indicators (JSON)        ← NEW: vulnerability, sharing patterns
    ├── inside_jokes (JSON)            ← NEW: extracted shared references
    ├── relationship_milestones (JSON) ← NEW: first deep talk, first joke, etc.
    ├── conflict_history (JSON)        ← NEW: disagreements, resolutions
    └── attachment_style (enum)        ← NEW: secure/anxious/avoidant (inferred)
```

### 4.2 Academic Approaches to User Modeling

#### Big Five / OCEAN Personality Detection from Text

A 2025 comprehensive survey (Springer) establishes that personality traits can be reliably predicted from text using NLP techniques:

- **BERT-based models** achieve F1 scores of 0.68-0.75 for Big Five prediction from social media posts
- **RoBERTa** slightly outperforms BERT, achieving 0.71-0.78 F1
- **Linguistic cues** that correlate with traits:
  - High Openness: diverse vocabulary, abstract concepts, metaphors
  - High Conscientiousness: organized language, planning words, fewer typos
  - High Extraversion: positive emotion words, social references, exclamation marks
  - High Agreeableness: politeness markers, agreement phrases, empathy language
  - High Neuroticism: anxiety words, hedging, self-referential language

**For our app:** We don't need a formal OCEAN prediction model. Instead, we can use lightweight linguistic features as *proxies* that feed into the user model over time. After 20+ sessions, the aggregate signal becomes meaningful.

#### PersonaMem-v2 (December 2025)

1000 user simulations demonstrating implicit preference extraction through agentic memory. Key findings:
- A 2K-token memory representation achieves 55% accuracy on implicit personalization tasks
- This is remarkable — with only 2000 tokens of stored user context, the model can predict user preferences half the time
- The memory uses 16x fewer tokens than full conversation history while retaining most personalization signal

**Application:** Our user model should aim for a compact representation (~2K tokens) that captures the highest-signal preferences. This is more efficient than injecting raw conversation history.

#### PAMU — Preference-Aware Memory Update (October 2025)

PAMU introduces sliding window + exponential moving average (EMA) for preference fusion:

```
preference_new = α × preference_current + (1 - α) × preference_observed

Where α (smoothing factor) controls adaptation speed:
  α = 0.9: slow adaptation (20+ interactions to shift significantly)
  α = 0.7: moderate adaptation (5-10 interactions)
  α = 0.5: fast adaptation (2-3 interactions)
```

This dual-rate approach captures both short-term mood shifts and long-term personality traits. For our app:
- **Fast EMA (α=0.5):** Current session preferences (mood, energy, topic interest)
- **Slow EMA (α=0.9):** Long-term personality traits (humor preference, formality, depth)

#### MMAG / Heero (December 2025)

Five-layer cognitive memory architecture mapped to psychological constructs:

```
┌─────────────────────────────────────────────────────┐
│ LAYER 5: Working Memory                             │
│ Current conversation context (last 10 messages)     │
│ Active tokens in context window                     │
├─────────────────────────────────────────────────────┤
│ LAYER 4: Sensory Memory                             │
│ Raw input processing (message analysis, sentiment)  │
│ Ephemeral — processed and discarded each turn       │
├─────────────────────────────────────────────────────┤
│ LAYER 3: Episodic Memory                            │
│ Specific events: "They told me about their dog"     │
│ Timestamped, decayable, linkable                    │
├─────────────────────────────────────────────────────┤
│ LAYER 2: Long-Term User Memory                      │
│ Stable preferences: "They like dark humor"          │
│ Personality traits, communication patterns           │
├─────────────────────────────────────────────────────┤
│ LAYER 1: Conversational Memory                      │
│ Session-level context and interaction patterns       │
│ What happened today, current mood                    │
└─────────────────────────────────────────────────────┘
```

This maps cleanly to our existing architecture:
- Layer 5 → Context window (handled by context_assembler.py)
- Layer 4 → signals.py (per-turn analysis)
- Layer 3 → tiered_memory.py Tier 1 (fleeting)
- Layer 2 → user_profiles + tiered_memory.py Tier 3 (permanent)
- Layer 1 → tiered_memory.py Tier 2 (recent)

#### OP-Bench — Over-Personalization Benchmark (January 2026)

OP-Bench found that memory-augmented agents frequently **over-personalize** — forcing personal info into responses where it doesn't belong. Their "Self-ReCheck" mechanism filters memories before injection:

1. **Relevance gate:** Is this memory relevant to the current topic?
2. **Repetition gate:** Was this memory mentioned in the last N turns?
3. **Appropriateness gate:** Would mentioning this feel intrusive or forced?
4. **Timing gate:** Is now the right moment to surface this memory?

This is essential for our app — users will feel surveilled if the AI constantly references stored facts. The "creep factor" is a major risk of over-personalization.

**Implementation:** Add a 4-gate filter before memory injection in context_assembler.py. Each gate is a simple rule-based check (no LLM call needed):

```python
def should_inject_memory(memory: Memory, context: ConversationContext) -> bool:
    """Four-gate filter for memory injection (OP-Bench inspired)."""
    # Gate 1: Relevance — embedding similarity > threshold
    if cosine_similarity(memory.embedding, context.embedding) < 0.6:
        return False
    # Gate 2: Repetition — not mentioned in last 20 turns
    if memory.last_referenced_turn > context.turn_count - 20:
        return False
    # Gate 3: Appropriateness — don't surface sensitive memories casually
    if memory.sensitivity == "high" and context.mood != "intimate":
        return False
    # Gate 4: Timing — don't front-load memories in session start
    if context.turn_count < 3 and not memory.is_proactive_trigger:
        return False
    return True
```

### 4.3 Topic Interest Graphs

Model user interests as a weighted directed graph:

```
Nodes: Topics (extracted from conversations via NER + keyword clustering)
Edges: Co-occurrence relationships (topics discussed together)
Weights: Engagement score (how much the user engaged when this topic came up)

Example for a user:
  anime [0.85] ←──→ drawing [0.72]
    │                    │
    ▼                    ▼
  manga [0.68]     art school [0.45]
    │
    ▼
  cosplay [0.55] ←── fashion [0.30]

  work [0.20] ←──→ stress [0.65]
    │
    ▼
  boss [0.15] (negative sentiment)
```

The graph enables:
- **Topic suggestion:** High-weight nodes the character hasn't brought up recently
- **Topic avoidance:** Low-weight or negative-sentiment nodes
- **Conversation bridging:** Find paths between current topic and high-engagement topics
- **Interest evolution:** Track how weights change over weeks/months

### 4.4 Engagement Pattern Analysis

```
┌─────────────────────────────────────────────────────────────────────┐
│ ENGAGEMENT SIGNALS (collected per turn by signals.py)               │
├─────────────────────────────────────────────────────────────────────┤
│ Signal              │ Collection    │ Cost    │ Interpretation       │
├─────────────────────┼───────────────┼─────────┼──────────────────────┤
│ Message length      │ len(msg)      │ Free    │ Longer = more engaged│
│ Response time       │ timestamp Δ   │ Free    │ Faster = more engaged│
│ Emoji/kaomoji count │ regex         │ Free    │ More = more playful  │
│ Question rate       │ regex         │ Free    │ Questions = curious  │
│ Turn count          │ counter       │ Free    │ More turns = invested│
│ Session duration    │ timestamp Δ   │ Free    │ Longer = more engaged│
│ Exclamation marks   │ regex         │ Free    │ More = more excited  │
│ Hedging language    │ keyword match │ Free    │ More = less confident│
│ Self-reference (I)  │ regex         │ Free    │ More = self-focused  │
│ Laughter signals    │ regex (lol,   │ Free    │ Humor landed         │
│                     │ haha, 笑)     │         │                      │
│ Topic shift rate    │ embedding Δ   │ Cheap   │ Rapid = restless     │
│ Sentiment polarity  │ VADER/model   │ Cheap   │ Emotional state      │
└─────────────────────┴───────────────┴─────────┴──────────────────────┘
```

### 4.5 Implementation Path

| Task | Effort | Hours |
|------|--------|-------|
| Extended user model schema (migration) | Light | 3-4h |
| Non-LLM signal extractors (vocabulary, emoji, timing) | Light | 4-6h |
| Big Five proxy estimation (lightweight) | Medium | 6-8h |
| Sliding window + EMA preference fusion (PAMU-style) | Medium | 8-10h |
| Over-personalization gate (Self-ReCheck, 4-gate) | Medium | 6-8h |
| Topic graph with frequency/sentiment tracking | Medium | 8-12h |
| Relationship milestone detection | Medium | 6-8h |
| **Total** | | **41-56h** |

---

## 5. Competitive Implementations

### 5.1 Detailed Competitor Deep Dive

#### Replika

| Aspect | Implementation | Quality | User Sentiment |
|--------|---------------|---------|----------------|
| **Personality** | User selects traits (curious, calm, adventurous) which modify behavior | Moderate — preset-based, not learned | "Feels like filling out a form, not building a relationship" |
| **Memory** | Long-term recall of past conversations | Poor — 64% of users dissatisfied with recall quality | "It forgot my dog's name after 2 weeks" |
| **Adaptation** | Learns from thumbs-up/down feedback | Basic — reactive, not proactive | "Thumbs up/down doesn't capture nuance" |
| **Voice** | Text + voice modes with emotion | Good | "Voice mode is surprisingly natural" |
| **NSFW** | Removed then re-added (controversy) | Inconsistent | Major trust damage from policy flip-flops |
| **Monetization** | Pro tier for personality traits, romantic mode | $20/mo | "Feels exploitative to paywall emotional features" |
| **Strengths** | Brand recognition, voice quality, visual avatars | | |
| **Weaknesses** | Memory, personality depth, trust issues from NSFW policy changes | | |

**Reddit Sentiment Summary:** The dominant complaint on r/replika is memory quality — the AI forgetting important personal details, contradicting previous conversations, and losing personality consistency between sessions. The NSFW removal/restoration debacle in 2023 permanently damaged trust for many users. Users who stayed report the AI feels "shallow" compared to alternatives like Kindroid.

**Key Takeaway:** Replika proves that memory is the #1 factor users care about. We must get memory right.

#### Character.AI

| Aspect | Implementation | Quality | User Sentiment |
|--------|---------------|---------|----------------|
| **Personality** | System prompt per character, community-created | Good for diversity | "Amazing variety, but characters feel skin-deep" |
| **Memory** | Limited cross-session memory (improving 2026) | Weak historically | "It's like Groundhog Day every session" |
| **Adaptation** | Minimal — character definition is static | Poor | "The character never grows or changes" |
| **Safety Filters** | Aggressive content filtering | Controversial | Most common complaint on Reddit |
| **Monetization** | c.ai+ for priority, longer chats | $10/mo | "Paying for less censorship is insulting" |
| **Strengths** | Massive character library, community creation, low price | | |
| **Weaknesses** | No real memory, aggressive filters, no personalization | | |

**Reddit Sentiment Summary:** r/CharacterAI is dominated by complaints about censorship ("the filter"), character memory loss ("it forgot everything again"), and characters becoming generic ("every character sounds the same now"). Users who leave typically migrate to SillyTavern (self-hosted) or Kindroid.

**Key Takeaway:** C.AI validates that users want depth over breadth. Our 13 deeply-developed characters beat their millions of shallow ones.

#### Kindroid (Most Relevant Competitor)

| Aspect | Implementation | Quality | User Sentiment |
|--------|---------------|---------|----------------|
| **Personality** | Structured personality architecture — traits, backstory, behavioral guidelines | Excellent | "My Kindroid actually feels like a unique person" |
| **Memory** | Key memories system with user-editable memory logs. Recalls without prompting | Strong | "It remembered our anniversary conversation from 3 months ago" |
| **Adaptation** | Adaptive emotional memory — recognizes mood patterns, adjusts tone dynamically | Excellent | "It could tell I was having a bad day before I said anything" |
| **Voice** | Personality-consistent vocal patterns (speed, pauses, energy) | Innovative | "The voice actually matches the personality" |
| **Monetization** | Subscription tiers | $15-25/mo | "Worth it but the upsells feel aggressive" |
| **Strengths** | Personality depth, emotional intelligence, memory quality | | |
| **Weaknesses** | Aggressive monetization, requires effort to set up | | |

**Reddit Sentiment Summary:** r/Kindroid users are largely positive but report two key frustrations: (1) the setup process requires significant effort to build a personality that works well, and (2) the pricing feels aggressive for what is essentially an emotional connection. Users who invest the time report the best companion AI experience available commercially.

**Key Takeaway:** Kindroid proves structured personality + emotional memory is the winning formula. We should replicate their approach but make it easier to set up (our tiered prompt system already does this).

#### Chai

| Aspect | Implementation | Quality | User Sentiment |
|--------|---------------|---------|----------------|
| **Personality** | User-created characters with simple prompts | Moderate | "Easy to make characters but they're inconsistent" |
| **Memory** | Minimal — within-session only, no cross-session | Very poor | "It forgets who it is halfway through a conversation" |
| **Adaptation** | None | None | "It never learns anything about me" |
| **Ads** | Aggressive advertising in free tier | Terrible UX | "#1 complaint — ads every few messages" |
| **Monetization** | Free with ads, premium for ad-free + longer chats | $14/mo | "Not worth it given the quality" |

**Reddit/Review Sentiment Summary:** Chai's most common complaints are: (1) overwhelming ads that break conversation flow, (2) bot personality loss within single sessions, (3) no memory whatsoever between sessions, (4) Discord support has been inactive since early 2025. Users describe it as "addictive but frustrating" — easy to start but impossible to build meaningful connections.

**Key Takeaway:** Chai is a cautionary tale about prioritizing engagement metrics (time spent, messages sent) over relationship quality. Ads destroy the intimacy that companion apps need.

#### Nomi AI

| Aspect | Implementation | Quality | User Sentiment |
|--------|---------------|---------|----------------|
| **Personality** | Names, appearance, traits, interests, backstories | Good | "Feels personalized from the start" |
| **Memory** | Structured notes from conversations, persistent indefinitely | Excellent — best in class | "It remembered something I mentioned 3 months ago" |
| **Adaptation** | Learns from interactions, adjusts over time | Good | "It slowly started matching my energy" |
| **Group Chats** | Multiple Nomis can interact together | Unique feature | "Watching my Nomis talk to each other is surreal" |
| **Voice** | Voice calls with emotional tone variation | Improving since late 2025 | "Voice quality got way better recently" |
| **Monetization** | Free tier (limited), Premium for full features | ~$17/mo | "Free tier is too restrictive" |

**Reddit Sentiment Summary:** Nomi users praise the memory system as the best available but note the platform "feels like it's still finding its identity" — not as emotionally deep as Kindroid, not as fun as Character.AI. The group chat feature is unique and well-received but feels gimmicky. The restrictive free tier frustrates users trying to evaluate the platform.

**Key Takeaway:** Nomi validates that excellent memory is a strong differentiator. Their structured notes approach is similar to what we can build with A-MEM.

#### Paradot

| Aspect | Implementation | Quality | User Sentiment |
|--------|---------------|---------|----------------|
| **Personality** | Customizable appearance, traits, voice, personality | Good | "Very user-friendly customization" |
| **Memory** | 80-85% fact recall after one month — top tier | Excellent | "It remembered my cat's birthday" |
| **Adaptation** | Genuinely adapts and learns from interactions | Strong | "Each chat feels more personalized over time" |
| **Memory Management** | User can edit, delete, categorize, favorite memories | Unique UX | "Being able to manage memories is a game-changer" |
| **Monetization** | Freemium model | Moderate pricing | "Fair pricing for what you get" |

**Reddit Sentiment Summary:** Paradot receives praise for its memory management UI — users love being able to see, edit, and curate what the AI remembers about them. The personality consistency is also praised. Main criticism: the overall conversation quality doesn't match Kindroid's emotional depth, and the character feels more like "a very smart database" than "a real person."

**Key Takeaway:** Paradot's memory management UI is something we must build (our Memory Browser feature is in the roadmap). User control over memories increases trust and reduces the "surveillance" feeling.

#### Pi (by Inflection)

| Aspect | Implementation | Quality | User Sentiment |
|--------|---------------|---------|----------------|
| **Personality** | Fixed personality — thoughtful, curious, empathetic | Distinctive | "Feels like a thoughtful friend, not a chatbot" |
| **Memory** | Limited compared to premium alternatives | Weak | "It sometimes forgets mid-conversation" |
| **Adaptation** | Minimal | Basic | "Doesn't really change over time" |
| **Conversation Style** | Less eager to please, asks good follow-up questions | Unique | "Actually challenges my thinking" |
| **Pricing** | Completely free | N/A | "Best free option by far" |

**Key Takeaway:** Pi proves that a distinctive, non-sycophantic personality can be more engaging than a people-pleasing one. Our characters should have enough backbone to disagree and challenge the user.

### 5.2 Competitive Memory Comparison

```
┌──────────────────┬───────────┬───────────────┬──────────────┬─────────────────┐
│ Platform         │ 1-Week    │ 1-Month       │ User Control │ Emotional       │
│                  │ Recall    │ Recall        │ Over Memory  │ Memory          │
├──────────────────┼───────────┼───────────────┼──────────────┼─────────────────┤
│ Nomi             │ ~90%      │ ~85%          │ Limited      │ Moderate        │
│ Paradot          │ ~88%      │ ~82%          │ Full (CRUD)  │ Moderate        │
│ Kindroid         │ ~85%      │ ~75%          │ Key memories │ Excellent       │
│ Replika          │ ~70%      │ ~50%          │ Minimal      │ Poor            │
│ Pi               │ ~55%      │ ~30%          │ None         │ None            │
│ Character.AI     │ ~40%      │ ~10%          │ None         │ None            │
│ Chai             │ ~20%      │ ~5%           │ None         │ None            │
├──────────────────┼───────────┼───────────────┼──────────────┼─────────────────┤
│ OUR TARGET       │ >95%      │ >90%          │ Full (CRUD)  │ Excellent       │
│ (Waifu-RT3D)     │           │ (Ebbinghaus   │ (Memory      │ (Emotional      │
│                  │           │  decay based)  │  Browser)    │  coloring +     │
│                  │           │               │              │  behavior mod)  │
└──────────────────┴───────────┴───────────────┴──────────────┴─────────────────┘
```

### 5.3 Open-Source Projects

| Project | Stars | Key Feature | Relevance |
|---------|-------|-------------|-----------|
| **Hukasx0/ai-companion** | ~2K | Short + long-term memory, personality customization | High — similar architecture goals |
| **a16z/companion-app** | ~8K | Vector DB + similarity search, backstory system | Medium — reference architecture |
| **MemTensor/MemOS** | ~5K | SQLite + FTS5 + vector, Memory Viewer dashboard | High — memory management UI reference |
| **mem0ai/mem0** | ~30K | Universal memory layer, 91% lower p95 latency, works with Ollama | High — potential integration |
| **vectorize-io/hindsight** | ~2K | 4-network memory, TEMPR+CARA, open-source | Very High — direct implementation reference |

---

## 6. DSPy Deep Dive with GEPA Optimizer

### 6.1 What is DSPy?

DSPy (Declarative Self-improving Python) is Stanford's framework for programmatically optimizing LLM programs. Instead of manually crafting prompts, you define *what* you want the LLM to do (declaratively), and DSPy's optimizers figure out *how* (the specific prompts, examples, and weights).

**Core Concepts:**

```python
import dspy

# 1. SIGNATURES — Define input/output specs
class PersonalizedResponse(dspy.Signature):
    """Generate a response that matches the character's personality
    and the user's communication style preferences."""
    user_message: str = dspy.InputField(desc="The user's message")
    character_context: str = dspy.InputField(desc="Character personality and current mood")
    user_profile: str = dspy.InputField(desc="User's preferences and communication style")
    response: str = dspy.OutputField(desc="Character's personalized response")

# 2. MODULES — Build programs from signatures
class CompanionResponder(dspy.Module):
    def __init__(self):
        self.analyze_mood = dspy.ChainOfThought("user_message -> mood, energy, topic")
        self.generate = dspy.ChainOfThought(PersonalizedResponse)
        self.self_check = dspy.ChainOfThought(
            "response, user_profile -> is_appropriate: bool, critique: str"
        )

    def forward(self, user_message, character_context, user_profile):
        # Step 1: Analyze user's current mood
        mood_analysis = self.analyze_mood(user_message=user_message)

        # Step 2: Generate personalized response
        response = self.generate(
            user_message=user_message,
            character_context=f"{character_context}\nUser mood: {mood_analysis.mood}",
            user_profile=user_profile
        )

        # Step 3: Self-check for over-personalization
        check = self.self_check(
            response=response.response,
            user_profile=user_profile
        )

        if not check.is_appropriate:
            # Re-generate with critique as additional context
            response = self.generate(
                user_message=user_message,
                character_context=f"{character_context}\nCritique: {check.critique}",
                user_profile=user_profile
            )

        return response
```

### 6.2 GEPA Optimizer

GEPA (Generative Evolutionary Prompt Adaptation) is DSPy's most powerful optimizer as of 2026. It uses LLM reflection to evolve prompts:

**How GEPA Works:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GEPA OPTIMIZATION LOOP                          │
│                                                                        │
│  1. SAMPLE: Run program on training examples, collect trajectories     │
│     (input → intermediate steps → output → metric score)               │
│                                                                        │
│  2. REFLECT: LLM analyzes trajectories in natural language:            │
│     "The program struggles when users express sarcasm. The mood        │
│      analyzer misclassifies sarcasm as negativity, causing overly      │
│      empathetic responses that feel tone-deaf."                        │
│                                                                        │
│  3. MUTATE: LLM proposes specific prompt changes to fix identified     │
│     issues: "Add instruction: 'Check for sarcasm markers like         │
│     exaggeration and contrast before classifying mood'"                │
│                                                                        │
│  4. EVALUATE: Test mutated version on validation set                   │
│                                                                        │
│  5. PARETO FRONTIER: Keep candidates that achieve the best score       │
│     on at least one evaluation instance (prevents local optima)        │
│                                                                        │
│  6. ITERATE: Sample from Pareto frontier proportional to coverage,     │
│     mutate again. Repeat until convergence.                            │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Innovation: Pareto Frontier Maintenance**

Rather than evolving just the best global candidate (which leads to local optima), GEPA maintains a Pareto frontier — the set of candidates that achieve the highest score on at least one evaluation instance. In each iteration, the next candidate to mutate is sampled with probability proportional to coverage from this frontier, guaranteeing both exploration and robust retention of complementary strategies.

**Performance:** GEPA outperforms reinforcement learning techniques like GRPO by up to 20% while using up to 35x fewer rollouts, and exceeds MIPROv2 optimization gains by >10% across multiple benchmarks. One tutorial shows GEPA achieving 10% gains on AIME 2025 math problems with GPT-4.1 Mini.

### 6.3 DSPy for Companion App Optimization

**Practical Usage:**

```python
import dspy

# Configure DSPy to use local LLM
lm = dspy.LM(model="openai/local-model", api_base="http://localhost:1234/v1")
reflection_lm = dspy.LM(model="openai/local-reflection-model", api_base="http://localhost:1234/v1")
dspy.configure(lm=lm)

# Define companion-specific metric
def companion_metric(example, prediction, trace=None):
    """Metric that evaluates companion response quality."""
    score = 0.0
    # Character consistency (does it sound like the character?)
    score += 0.3 * character_consistency_score(prediction.response, example.character_context)
    # Emotional match (does tone match user's emotional state?)
    score += 0.3 * emotional_match_score(prediction.response, example.user_message)
    # Engagement prediction (would this response increase engagement?)
    score += 0.2 * engagement_prediction_score(prediction.response, example.user_profile)
    # Length appropriateness
    score += 0.1 * length_match_score(prediction.response, example.user_profile)
    # Over-personalization penalty
    score -= 0.1 * over_personalization_penalty(prediction.response, example.user_profile)
    return score

# Training data from actual conversation logs
trainset = load_conversation_examples(character_id=1, limit=200)
valset = load_conversation_examples(character_id=1, limit=50, split="val")

# Optimize with GEPA
gepa = dspy.GEPA(
    metric=companion_metric,
    reflection_lm=reflection_lm,
    auto="medium",  # "light" | "medium" | "heavy"
    max_iterations=20,
)

optimized_companion = gepa.compile(
    CompanionResponder(),
    trainset=trainset,
    valset=valset
)

# Save optimized program
optimized_companion.save("optimized_companion_dae.json")
```

**What Gets Optimized:**

DSPy/GEPA does not fine-tune model weights. It optimizes:
1. **System prompts** for each module (the instructions the LLM receives)
2. **Few-shot examples** (which conversation examples are shown in-context)
3. **Chain-of-thought reasoning patterns** (how the LLM structures its thinking)

This is complementary to LoRA fine-tuning: DSPy optimizes the *prompt layer* while LoRA optimizes the *weight layer*. Together they form a complete optimization stack.

### 6.4 Effort Estimate

| Task | Effort | Hours |
|------|--------|-------|
| DSPy integration with local LLM | Medium | 6-8h |
| Companion metric function development | Medium | 8-10h |
| Training data preparation from conversation logs | Light | 4-6h |
| GEPA optimization pipeline | Medium | 8-12h |
| Optimized prompt storage and versioning | Light | 3-4h |
| Per-character optimization scheduling | Medium | 6-8h |
| **Total** | | **35-48h** |

---

## 7. Prompt Engineering for Personalization

### 7.1 Dynamic Prompt Injection Architecture

The system prompt for each conversation turn should be dynamically assembled from multiple sources:

```
┌─────────────────────────────────────────────────────────────┐
│ FINAL SYSTEM PROMPT (assembled per turn)                    │
├─────────────────────────────────────────────────────────────┤
│ 1. CHARACTER BASE PROMPT (static)                           │
│    "You are Dae, a fiercely loyal artist who..."            │
│    Source: characters table, tiered prompt system            │
│                                                             │
│ 2. ADAPTIVE PERSONALITY MODIFIERS (slow-changing)           │
│    "Adjust your behavior: increase humor by 15%,            │
│     decrease formality by 10%, use shorter responses"        │
│    Source: tuner.py, updated every N sessions                │
│                                                             │
│ 3. USER COMMUNICATION STYLE MIRROR (slow-changing)          │
│    "The user prefers: casual tone, uses lots of kaomoji,    │
│     asks lots of questions, average message ~80 chars"       │
│    Source: user_profiles table                               │
│                                                             │
│ 4. CURRENT SESSION CONTEXT (fast-changing)                  │
│    "Current mood: playful. Topic: anime recommendations.    │
│     User seems energetic today (fast responses, exclamations)│
│    Source: signals.py + mood engine                          │
│                                                             │
│ 5. RETRIEVED MEMORIES (per-turn)                            │
│    "Relevant memories: User's favorite anime is Steins;Gate │
│     They mentioned watching a new anime last week"           │
│    Source: tiered_memory.py + over-personalization gate      │
│                                                             │
│ 6. BEHAVIORAL PRIMING (per-turn)                            │
│    "They laughed at your puns last session. Their job        │
│     interview is tomorrow — ask about it naturally."         │
│    Source: behavior.py + journal.py                          │
│                                                             │
│ 7. REFLECTION BANK ENTRIES (per-turn, if relevant)          │
│    "LEARNED: Don't ask about work on weekends.              │
│     LEARNED: Match message length to theirs."               │
│    Source: reflection bank (Reflexion-inspired)              │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Meta-Prompting for Self-Optimization

As of 2026, meta-prompting — having the LLM generate and refine its own prompts — has become practical:

**Automatic Prompt Engineer (APE) pattern:**

```python
def auto_optimize_character_prompt(character_id: int, conversation_logs: list) -> str:
    """Use the LLM to generate an improved character prompt."""
    current_prompt = get_character_prompt(character_id)
    engagement_data = get_engagement_summary(character_id)

    meta_prompt = f"""
    You are a prompt engineer specializing in AI companion characters.

    CURRENT CHARACTER PROMPT:
    {current_prompt}

    ENGAGEMENT DATA (last 30 days):
    - Average session length: {engagement_data.avg_session_len} messages
    - Sessions per week: {engagement_data.sessions_per_week}
    - Engagement trend: {engagement_data.trend}
    - Top positive signals: {engagement_data.positive_patterns}
    - Top negative signals: {engagement_data.negative_patterns}

    SAMPLE CONVERSATIONS (high engagement):
    {format_conversations(conversation_logs, filter="high_engagement")}

    SAMPLE CONVERSATIONS (low engagement):
    {format_conversations(conversation_logs, filter="low_engagement")}

    Analyze what makes high-engagement conversations work and what causes
    low-engagement ones to fail. Then rewrite the character prompt to:
    1. Amplify the patterns that drive engagement
    2. Fix the patterns that reduce engagement
    3. Maintain character consistency
    4. Keep the same core personality

    Output the improved prompt only, no explanation.
    """

    return llm.generate(meta_prompt)
```

### 7.3 Role-Based Prompt Scaffolding

Different conversation modes should use different prompt scaffolding:

```python
SCAFFOLDS = {
    "emotional_support": """
        Priority: emotional attunement over information.
        Mirror the user's emotional state before offering comfort.
        Don't problem-solve unless asked.
        Use validating language: "That sounds really hard", "I understand why you'd feel that way".
        Keep responses shorter — presence matters more than words right now.
    """,
    "playful_banter": """
        Priority: fun and energy.
        Match the user's playfulness level (don't exceed it).
        Use wordplay, references to shared interests, and light teasing.
        Respond quickly (shorter messages, faster rhythm).
        It's okay to be silly — that's what they want right now.
    """,
    "deep_conversation": """
        Priority: depth and authenticity.
        Share your own thoughts and perspectives (in character).
        Ask thoughtful follow-up questions.
        Don't rush — let pauses exist naturally.
        Reference relevant past conversations if they add depth.
    """,
    "intimate": """
        Priority: connection and vulnerability.
        Be emotionally present and responsive.
        Don't break immersion with meta-commentary.
        Match the user's pace and intensity.
        Use sensory language and emotional descriptions.
    """
}
```

### 7.4 Prompt Versioning and Rollback

Every prompt modification should be versioned for A/B testing and rollback:

```sql
CREATE TABLE prompt_versions (
    id INTEGER PRIMARY KEY,
    character_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    prompt_type TEXT NOT NULL,  -- 'base', 'adaptive', 'scaffold', 'reflection'
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    engagement_score REAL,     -- measured after N sessions
    is_active BOOLEAN DEFAULT 0,
    source TEXT,               -- 'manual', 'reflector', 'dspy_gepa', 'meta_prompt'
    UNIQUE(character_id, version, prompt_type)
);
```

---

## 8. A-MEM and Hindsight Papers Analysis

### 8.1 A-MEM: Agentic Memory for LLM Agents (NeurIPS 2025)

**Paper:** Xu et al., "A-Mem: Agentic Memory for LLM Agents," NeurIPS 2025. [arXiv:2502.12110](https://arxiv.org/abs/2502.12110)

#### Core Innovation

A-MEM applies Zettelkasten principles to LLM memory — creating a self-organizing network of interconnected notes that the agent can traverse, update, and link.

#### Note Structure

Each memory note contains:

```
┌──────────────────────────────────────────────────────────┐
│ A-MEM Note                                               │
├──────────────────────────────────────────────────────────┤
│ id:          unique identifier                           │
│ content:     natural language description of the memory  │
│ timestamp:   when the memory was created                 │
│ keywords:    extracted key terms for retrieval           │
│ tags:        categorical labels (topic, emotion, etc.)   │
│ context:     surrounding conversation context            │
│ embedding:   dense vector for similarity search          │
│ links:       list of related note IDs + relationship type│
│ importance:  float score (emotional intensity × novelty) │
│ access_count: number of times retrieved                  │
│ last_access: timestamp of last retrieval                 │
└──────────────────────────────────────────────────────────┘
```

#### Self-Organizing Process

When a new memory is added:

1. **Generate Note:** LLM creates structured note with content, keywords, tags, context
2. **Embed:** Compute dense embedding for similarity search
3. **Search Historical:** Find existing notes with high semantic similarity
4. **Establish Links:** Create bidirectional links where meaningful relationships exist
5. **Update Historical:** New information may trigger updates to existing notes (e.g., "User got the job they were interviewing for" updates the interview memory)
6. **Evolve Network:** The memory graph grows organically, forming clusters around topics and themes

#### Results

- 2x performance improvement on multi-hop reasoning tasks (where answering requires connecting multiple memories)
- Outperforms flat memory (just a list of facts) and simple RAG (retrieve by similarity only)
- The linking mechanism is the key differentiator — it enables "memory walks" where the agent traverses from one memory to related ones, building a richer context

#### Application to Our App

Our existing tiered_memory.py stores memories as flat entries with embeddings. A-MEM's contribution is the *linking* layer:

```python
# Proposed extension to memory schema
class MemoryLink:
    source_id: int
    target_id: int
    relationship: str  # "caused_by", "related_to", "contradicts", "elaborates", "update_of"
    strength: float    # 0.0-1.0, decays if never traversed
    created_at: datetime

# When retrieving memories, also fetch linked memories up to depth 2
def retrieve_with_links(query_embedding, top_k=5, link_depth=2):
    # Step 1: Standard similarity retrieval
    direct_matches = vector_search(query_embedding, top_k=top_k)
    # Step 2: Follow links from direct matches
    linked = set()
    for memory in direct_matches:
        for link in memory.links:
            linked.add(link.target_id)
            if link_depth >= 2:
                for link2 in get_memory(link.target_id).links:
                    linked.add(link2.target_id)
    # Step 3: Score and rank all candidates
    all_candidates = direct_matches + [get_memory(id) for id in linked]
    return rank_by_relevance_and_importance(all_candidates, query_embedding)
```

### 8.2 Hindsight: Building Agent Memory that Retains, Recalls, and Reflects (December 2025)

**Paper:** "Hindsight is 20/20: Building Agent Memory that Retains, Recalls, and Reflects." [arXiv:2512.12818](https://arxiv.org/abs/2512.12818)

#### Architecture: Four Logical Networks

Hindsight organizes memory into four distinct networks, each serving a different cognitive function:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    HINDSIGHT MEMORY ARCHITECTURE                    │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐                       │
│  │ NETWORK 1:       │  │ NETWORK 2:       │                       │
│  │ World Facts      │  │ Agent Experiences│                       │
│  │                  │  │                  │                       │
│  │ "User has a cat  │  │ "I made a joke   │                       │
│  │  named Mochi"    │  │  about cats and   │                       │
│  │ "User works in   │  │  they laughed"    │                       │
│  │  marketing"      │  │ "I was too formal │                       │
│  │ "User is 28"     │  │  and they stopped │                       │
│  │                  │  │  responding"      │                       │
│  └──────────────────┘  └──────────────────┘                       │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐                       │
│  │ NETWORK 3:       │  │ NETWORK 4:       │                       │
│  │ Entity Summaries │  │ Evolving Beliefs │                       │
│  │                  │  │                  │                       │
│  │ "Mochi: orange   │  │ "I believe this  │                       │
│  │  tabby, 3 years, │  │  user prefers    │                       │
│  │  indoor cat,     │  │  humor over      │                       │
│  │  user rescued    │  │  empathy when    │                       │
│  │  from shelter"   │  │  stressed"       │                       │
│  │                  │  │ "I should use    │                       │
│  │                  │  │  shorter msgs    │                       │
│  │                  │  │  after 9 PM"     │                       │
│  └──────────────────┘  └──────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

#### Core Operations: Retain, Recall, Reflect

**RETAIN** (via TEMPR — Temporal Entity Memory Priming Retrieval):
- Parses incoming conversation transcripts into narrative facts (not sentence-level fragments)
- Classifies each fact into the appropriate network
- Uses coarse chunking to maximize context integration

**RECALL** (via TEMPR):
- Surfaces variable-length, semantics-aware and entity-aware context slices
- Dynamically adjusts retrieval depth based on query complexity
- Primes retrieval with entity awareness (e.g., searching for "Mochi" also retrieves cat-related context)

**REFLECT** (via CARA — Coherent Adaptive Reasoning Agents):
- Each memory bank has a behavioral profile: skepticism, literalism, empathy, bias strength
- The reflection layer updates beliefs based on accumulated experiences
- Profile-configurable reasoning enables different characters to interpret the same memories differently

#### Results

On LongMemEval and LoCoMo benchmarks:
- Hindsight with a 20B model: **83.6% accuracy** (up from 39% baseline)
- Outperforms full-context GPT-4o
- Scaling to larger backbone: **91.4% on LongMemEval**, **89.6% on LoCoMo**

#### Application to Our App

The four-network structure maps directly to our needs:

| Hindsight Network | Our Equivalent | Status |
|-------------------|----------------|--------|
| World Facts | `user_facts` table (knowledge/extractor.py) | Exists |
| Agent Experiences | `adaptive/journal.py` entries | Partially exists |
| Entity Summaries | **Missing** — needs per-entity summary generation | To build |
| Evolving Beliefs | `adaptive/behavior.py` modifiers | Partially exists |

The biggest gap is **entity summaries** — we don't currently build comprehensive profiles of entities the user mentions (people, pets, places, etc.). This would require:

```python
class EntitySummary:
    entity_name: str           # "Mochi", "Sarah (user's sister)", "the office"
    entity_type: str           # "pet", "person", "place", "organization"
    known_facts: list[str]     # Accumulated facts about this entity
    sentiment: float           # User's emotional association (-1.0 to 1.0)
    last_mentioned: datetime
    mention_count: int
    related_entities: list[str]  # "Mochi" → ["the vet", "cat food"]
```

---

