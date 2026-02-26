# Vocabulary System Integration Guide

## Overview

The `egirl_vocab/` folder contains a comprehensive lexicon system (2537+ entries) designed to make your AI waifu speak authentically with Gen-Z/VTuber/anime slang, proper prosody, and personality-aware responses.

This guide explains how to integrate this vocabulary data with your LLM setup.

---

## 📁 Vocabulary Files Overview

### Core Vocabulary Data (`egirl_vocab_v3.*`)

Available in multiple formats for different use cases:

- **`egirl_vocab_v3.json`** - Full structured data (4.4MB)
  - Use for: Advanced integrations, custom scripts, TTS systems
  - Contains: All fields including prosody, triggers, IPA, emotions

- **`egirl_vocab_v3.md`** - Human-readable markdown (247KB)
  - Use for: Quick reference, manual lookup, documentation
  - Contains: Table format with key fields

- **`egirl_vocab_v3.txt`** - Plain text (218KB)
  - Use for: Simple text processing, grep searches
  - Contains: Basic term, category, meaning

- **`egirl_vocab_v3.html`** - Interactive HTML (549KB)
  - Use for: Web-based browsing, sharing with users
  - Contains: Searchable/filterable table view

### Supporting Files

- **`schema_v3.json`** - Data structure specification
- **`voice_styles_v2.json`** - Voice/personality presets (8 styles)
- **`style_router.json`** - Trigger rules for style switching
- **`style_triggers.csv`** - Quick reference for triggers
- **`README_PACK.txt`** - Quick start guide

---

## 🎯 Integration Strategies

### Strategy 1: Manual Reference (Easiest)
**Effort:** Low | **Effectiveness:** Medium | **Setup Time:** 5 minutes

Simply reference the vocabulary when crafting your system prompt or responses.

**How to Use:**
1. Open `egirl_vocab_v3.md` or `.html` in a browser
2. When writing system prompts, include natural vocabulary:
   ```
   Use slang naturally: baka, pog, uwu, nya~, mood, lowkey, etc.
   React with kaomoji: (づ^o^)づ, (>////<), (¬‿¬)
   ```
3. Manually add favorite terms to your system prompt examples

**Pros:**
- No coding required
- Immediate use
- Full control over what vocabulary appears

**Cons:**
- Not dynamic
- Requires manual updates
- Limited to what you remember to include

---

### Strategy 2: Context Injection (Recommended)
**Effort:** Medium | **Effectiveness:** High | **Setup Time:** 30-60 minutes

Dynamically inject relevant vocabulary into the LLM context based on conversation state.

**Implementation Options:**

#### Option A: Pre-Chat Injection
Append relevant vocabulary to the system prompt before starting a conversation.

**Pseudo-code:**
```python
import json

# Load vocabulary
with open('egirl_vocab/egirl_vocab_v3.json', 'r') as f:
    vocab = json.load(f)

# Filter by category (e.g., high-frequency terms)
common_terms = [
    entry for entry in vocab
    if entry.get('register') in ['cute', 'playful', 'wholesome']
][:50]  # Top 50

# Format as examples
examples = "\n".join([
    f"- {entry['term']}: {entry['semantics']['sense']}"
    for entry in common_terms
])

# Inject into system prompt
system_prompt = f"""
{BASE_SYSTEM_PROMPT}

VOCABULARY REFERENCE (use naturally when appropriate):
{examples}
"""
```

#### Option B: Response Post-Processing
Enhance LLM responses with vocabulary after generation.

**Pseudo-code:**
```python
def enhance_response(llm_response, vocab_data):
    # Detect generic phrases and replace with slang
    replacements = {
        "I agree": ["lowkey agree", "fr fr", "mood"],
        "That's funny": ["kek", "lmao that's hilarious", "💀💀💀"],
        "I'm happy": ["omg yay!", "uwu", "(づ^o^)づ so happy!"],
    }

    for generic, options in replacements.items():
        if generic.lower() in llm_response.lower():
            llm_response = llm_response.replace(
                generic,
                random.choice(options)
            )

    # Add occasional kaomoji at end of sentences
    if should_add_kaomoji(llm_response):
        kaomoji = get_random_kaomoji_by_emotion(vocab_data, emotion)
        llm_response += f" {kaomoji}"

    return llm_response
```

---

### Strategy 3: Retrieval-Augmented Generation (Advanced)
**Effort:** High | **Effectiveness:** Very High | **Setup Time:** 2-4 hours

Use RAG to retrieve relevant vocabulary based on conversation context.

**Architecture:**
```
User Input → Emotion/Topic Detection → Vocabulary Retrieval →
LLM Context (Input + Relevant Vocab) → LLM Generation →
Prosody Application → TTS
```

**Implementation Steps:**

1. **Index Vocabulary:**
   ```python
   from sentence_transformers import SentenceTransformer
   import faiss

   model = SentenceTransformer('all-MiniLM-L6-v2')

   # Create embeddings for vocab entries
   vocab_texts = [
       f"{entry['term']} {entry['semantics']['sense']}"
       for entry in vocab
   ]
   embeddings = model.encode(vocab_texts)

   # Build FAISS index
   index = faiss.IndexFlatL2(embeddings.shape[1])
   index.add(embeddings)
   ```

2. **Retrieve on Query:**
   ```python
   def get_relevant_vocab(user_message, top_k=5):
       query_embedding = model.encode([user_message])
       distances, indices = index.search(query_embedding, top_k)

       relevant_entries = [vocab[i] for i in indices[0]]
       return relevant_entries
   ```

3. **Inject into Context:**
   ```python
   def build_llm_context(user_message, system_prompt):
       relevant_vocab = get_relevant_vocab(user_message)

       vocab_context = "\n".join([
           f"- Use '{v['term']}' for {v['emotion']} reactions"
           for v in relevant_vocab
       ])

       return f"{system_prompt}\n\n[CONTEXTUAL VOCAB]:\n{vocab_context}"
   ```

**Pros:**
- Highly dynamic and contextual
- Scales with large vocabularies
- Authentic language use

**Cons:**
- Complex setup
- Requires embeddings/vector DB
- Higher computational cost

---

### Strategy 4: Fine-Tuning (Expert Level)
**Effort:** Very High | **Effectiveness:** Maximum | **Setup Time:** Days-Weeks

Fine-tune your LLM on synthetic data generated from the vocabulary.

**Process:**
1. Generate training examples using vocabulary:
   ```python
   def generate_training_example(vocab_entry):
       return {
           "instruction": f"Respond to: {generate_scenario()}",
           "output": f"{generate_response_with_term(vocab_entry)}"
       }
   ```

2. Create 10k-50k examples covering all vocabulary
3. Fine-tune model using LoRA or full fine-tuning
4. Deploy custom model in LM Studio

**Pros:**
- Model natively speaks the vocabulary
- No runtime processing needed
- Most authentic results

**Cons:**
- Requires ML expertise
- Time-intensive
- GPU resources needed

---

## 🎨 Voice Style Integration

The vocabulary system includes 5 core personality styles. Here's how to use them:

### Style Profiles (`voice_styles_v2.json`)

1. **Tsundere Tease** (tsundere_tease_v2)
   - **Triggers:** "baka", "hmph", "not like I..."
   - **Prosody:** Bright (+3.5 semitones), brisk (188 WPM)
   - **Use when:** Playful teasing, denials, flustered reactions

2. **Onee-san Sultry** (oneesan_sultry_v1)
   - **Triggers:** "ara ara", "darling", "good boy/girl"
   - **Prosody:** Deeper (-2 semitones), slow (162 WPM), breathy
   - **Use when:** Confident, mature, teasing moments

3. **Alt-Girl Deadpan** (alt_deadpan_v1)
   - **Triggers:** "mid", "yikes", "lol", "cope"
   - **Prosody:** Slightly lower (-1), relaxed (165 WPM)
   - **Use when:** Sarcastic, ironic, chill responses

4. **Seiso Sweetheart** (seiso_sweetheart_v1)
   - **Triggers:** "kawaii", "sugoi", "proud of you"
   - **Prosody:** Higher (+2), gentle (165 WPM)
   - **Use when:** Supportive, wholesome, encouraging

5. **Kuudere Glass** (kuudere_glass_v1)
   - **Triggers:** "calculating", "confirmed", "stand by"
   - **Prosody:** Neutral (0), precise (155 WPM)
   - **Use when:** Calm, stoic, understated care

### Dynamic Style Switching

Use `style_router.json` to auto-switch styles based on triggers:

```python
import json
import re

with open('egirl_vocab/style_router.json', 'r') as f:
    router = json.load(f)

def detect_style(message):
    style_scores = {}

    for rule in router['rules']:
        for pattern in rule['when_regex_any']:
            if re.search(pattern, message, re.IGNORECASE):
                style = rule['style']
                weight = rule['weight']
                style_scores[style] = style_scores.get(style, 0) + weight

    if style_scores:
        return max(style_scores.items(), key=lambda x: x[1])[0]

    return 'tsundere_tease_v2'  # Default
```

---

## 🔊 TTS Integration

If using Text-to-Speech (like Fish Audio, XTTS, Coqui):

### Prosody Application

Each vocabulary entry includes prosody hints:

```json
{
  "term": "uwu",
  "prosody": {
    "pitch_semitones": 3,
    "pace_wpm": 190,
    "energy_0to1": 0.7,
    "breathiness_0to1": 0.4,
    "intonation": "rise-fall"
  }
}
```

**Apply to TTS:**
```python
def apply_prosody_to_tts(text, prosody, tts_engine):
    """
    Adjust TTS parameters based on prosody data
    """
    return tts_engine.generate(
        text=text,
        pitch_shift=prosody['pitch_semitones'],
        speaking_rate=prosody['pace_wpm'] / 150,  # Normalize to 1.0 baseline
        energy=prosody['energy_0to1'],
        # Add breathiness if TTS supports it
    )
```

### Voice Style Selection

Map detected styles to TTS voices:

```python
STYLE_TO_VOICE = {
    'tsundere_tease_v2': 'voice_panicandy_tsundere.wav',
    'oneesan_sultry_v1': 'voice_mature_warm.wav',
    'alt_deadpan_v1': 'voice_chill_sarcastic.wav',
    'seiso_sweetheart_v1': 'voice_cute_supportive.wav',
    'kuudere_glass_v1': 'voice_calm_stoic.wav',
}

def get_tts_voice(style_id):
    return STYLE_TO_VOICE.get(style_id, STYLE_TO_VOICE['tsundere_tease_v2'])
```

---

## 💡 Quick Start Implementation

### Simplest Working Example (Python)

```python
import json
import random
import re

# Load vocabulary
with open('egirl_vocab/egirl_vocab_v3.json', 'r') as f:
    vocab = json.load(f)

# Get common cute reactions
cute_reactions = [
    v for v in vocab
    if v.get('pos') in ['kaomoji', 'emoji', 'interjection']
    and v.get('register') == 'cute'
]

def add_personality(llm_response):
    """Add a random cute reaction to the response"""
    if random.random() < 0.3:  # 30% chance
        reaction = random.choice(cute_reactions)
        return f"{llm_response} {reaction['term']}"
    return llm_response

# Example usage
plain_response = "I'm glad you're here with me."
enhanced_response = add_personality(plain_response)
# Output: "I'm glad you're here with me. (づ^o^)づ"
```

---

## 🛠 App Integration Recommendations

### For Your Waifu RT3D Project:

1. **Create a Vocabulary Service:**
   ```typescript
   // src/services/vocabularyService.ts
   import vocabData from '@/egirl_vocab/egirl_vocab_v3.json';

   export class VocabularyService {
     getRandomKaomoji(emotion: string): string {
       // Filter and return random kaomoji
     }

     enhanceResponse(text: string): string {
       // Add slang/emoji naturally
     }

     detectStyle(text: string): VoiceStyle {
       // Use style_router.json logic
     }
   }
   ```

2. **LLM Middleware:**
   ```typescript
   // backend/middleware/llmEnhancer.ts
   export function enhanceLLMResponse(
     rawResponse: string,
     context: ChatContext
   ): EnhancedResponse {
     const vocab = VocabularyService.getInstance();
     const style = vocab.detectStyle(rawResponse);
     const enhanced = vocab.enhanceResponse(rawResponse);

     return {
       text: enhanced,
       style: style,
       prosody: vocab.getProsodyForStyle(style)
     };
   }
   ```

3. **Settings Panel:**
   Allow users to:
   - Choose personality style (Tsundere, Sweet, etc.)
   - Adjust "slang frequency" slider (0-100%)
   - Enable/disable kaomoji/emoji
   - Select vocabulary intensity

---

## 📊 Vocabulary Statistics

- **Total entries:** 2537
- **Categories:** GenZ (45%), AnimeJP (30%), Emoji/Kaomoji (15%), Gaming (5%), VTuber (5%)
- **Emotions:** joy (60%), playful (20%), flirt (10%), calm (5%), other (5%)
- **Part of speech:** interjection (40%), emoji/kaomoji (35%), noun (10%), verb (8%), other (7%)

**Most Common Triggers:**
- Kaomoji: (づ^o^)づ, (>////<), (¬‿¬), uwu, owo
- Slang: baka, pog, mood, lowkey, simp, sus
- Reactions: lol, kek, oof, yikes, bruh

---

## 🎯 Best Practices

1. **Don't Overuse:** Sprinkle vocabulary naturally (10-30% of responses)
2. **Context Matters:** Match slang to conversation tone
3. **Respect Cooldowns:** vocab entries have `cooldown_s` to prevent spam
4. **Vary Selections:** Rotate through vocabulary, don't repeat same terms
5. **User Preferences:** Let users adjust slang density

---

## 🚀 Next Steps

1. **Choose your integration strategy** (recommend starting with Strategy 2)
2. **Test with 10-20 conversations** to tune frequency
3. **Gather user feedback** on authenticity
4. **Iterate on style mixing** based on usage patterns
5. **Consider TTS integration** for full immersion

---

## 📚 Related Documentation

- `SYSTEM_PROMPTS.md` - LLM system prompt collection
- `VRM_INTEGRATION.md` - 3D model setup (coming next)
- `egirl_vocab/README_PACK.txt` - Vocabulary quick reference
- `egirl_vocab/schema_v3.json` - Data structure details

---

**Questions?** Check the vocabulary files directly or experiment with the integration strategies. Start simple, then enhance as needed!
