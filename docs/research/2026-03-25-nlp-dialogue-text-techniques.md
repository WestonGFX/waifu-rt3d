# NLP, Dialogue & Text Processing Techniques for Waifu-RT3D

**Date:** 2026-03-25
**Purpose:** Actionable feature research for enhancing companion conversation quality
**Hardware targets:** Mac M2 Pro (24GB), Win RTX 5080 (16GB), Win RTX 3070 (8GB)

---

## Summary

12 actionable features identified across 10 categories. All models are small enough to run locally alongside the main LLM. Total additional VRAM for all 12 features combined: ~3-4 GB (most are CPU-viable). These are companion-pipeline models, not replacements for the main LLM.

---

## Feature 1: Sarcasm & Irony Detection

**What the user gets:** The character recognizes when the user is being sarcastic and responds appropriately instead of taking everything literally. "Oh sure, my day was GREAT" triggers an empathetic response, not a cheerful one.

| Field | Value |
|-------|-------|
| Model | `cardiffnlp/twitter-roberta-base-irony` |
| HF Link | https://huggingface.co/cardiffnlp/twitter-roberta-base-irony |
| Parameters | ~125M (RoBERTa-base) |
| VRAM | ~500 MB (runs fine on CPU too) |
| License | Apache 2.0 (via TweetEval) |
| Integration | **Low** -- `pipeline("text-classification")` one-liner |

**How it integrates:** Run on every user message before sending to the main LLM. If sarcasm is detected (confidence > 0.7), inject a system hint: `[The user appears to be sarcastic. Respond to their actual underlying emotion, not the literal words.]` This feeds into the existing context assembler's `system_note` slot.

**Alternative:** `jkhan447/sarcasm-detection-RoBerta-base-POS` (fine-tuned specifically for sarcasm, same architecture). For even lighter weight, DistilBERT variants offer ~1.7x speedup with slight accuracy loss.

---

## Feature 2: Dialogue Act Classification

**What the user gets:** The character knows the *type* of thing the user said -- a question, a joke, a request for comfort, flirting, venting, sharing news -- and adjusts its response style accordingly. Venting gets empathy first; jokes get playfulness; questions get direct answers.

| Field | Value |
|-------|-------|
| Model | Fine-tuned classifier on DailyDialog/SWDA acts |
| Approach | DistilBERT fine-tuned on Switchboard Dialogue Act corpus |
| Parameters | ~66M |
| VRAM | ~250 MB |
| License | MIT (DistilBERT base) |
| Integration | **Medium** -- requires fine-tuning + act taxonomy design |

**Taxonomy for companion app (10 acts):**
1. `question` -- user is asking something
2. `request` -- user wants the character to do something
3. `opinion` -- user is sharing a view
4. `joke` -- user is being humorous
5. `flirt` -- user is being romantic/playful
6. `vent` -- user is expressing frustration/sadness
7. `comfort_seek` -- user wants reassurance
8. `share_news` -- user is reporting something that happened
9. `greeting` -- hello/goodbye
10. `other` -- catch-all

**How it integrates:** Classify every user message into one of 10 acts. Pass the act label to the context assembler as a response-strategy hint. The main LLM uses this to select its tone: `[dialogue_act: vent -> prioritize empathy and validation before any advice]`. Also feeds into the emotion engine for bond progression -- responding correctly to comfort-seeking increases bond faster.

**Training data:** Switchboard Dialogue Act Corpus (1,155 conversations, 42 act types mappable to our 10) + DailyDialog (13K dialogues with act annotations). Fine-tuning takes ~2 hours on M2 Pro.

---

## Feature 3: GLiNER Zero-Shot NER

**What the user gets:** The character automatically remembers names, places, media, and events the user mentions. "I watched Spirited Away with Sarah last weekend" extracts `Sarah (person)`, `Spirited Away (media)`, `last weekend (time)` and feeds them into the knowledge graph without any explicit tagging.

| Field | Value |
|-------|-------|
| Model | `urchade/gliner_small-v2.1` |
| HF Link | https://huggingface.co/urchade/gliner_small-v2.1 |
| Parameters | ~166M |
| VRAM | ~600 MB (CPU-viable at ~200ms/message) |
| License | Apache 2.0 |
| Integration | **Low** -- `pip install gliner`, 5 lines of code |

**Why GLiNER over traditional NER:** Zero-shot -- you define entity types at inference time, no fine-tuning needed. Perfect for a companion app where you want to extract `person`, `place`, `media_title`, `food`, `pet_name`, `hobby`, `event` without training a custom model for each.

**How it integrates:** Run on every user message. Extracted entities feed directly into the existing `backend/knowledge/extractor.py` (FactExtractor). Currently, FactExtractor uses regex + LLM calls for entity extraction -- GLiNER replaces the expensive LLM calls with a fast local model. Entities go into the `user_facts` table (schema v27).

**Variants:**
- `gliner_small-v2.1` (~166M) -- best speed/accuracy for our use case
- `gliner_medium-v2.1` (~306M) -- slightly better accuracy
- `gliner_multi-v2.1` -- multilingual support

---

## Feature 4: Conversation Summarization

**What the user gets:** After long conversations, the character can recall what you talked about in a natural, condensed form. "Last time we chatted about your job interview and how nervous you were about the coding challenge" -- not a robotic list of topics but a warm, contextual summary.

| Field | Value |
|-------|-------|
| Model | `philschmid/bart-large-cnn-samsum` |
| HF Link | https://huggingface.co/philschmid/bart-large-cnn-samsum |
| Parameters | ~406M (BART-large) |
| VRAM | ~1.6 GB |
| License | MIT |
| Integration | **Low** -- `pipeline("summarization")` |

**Why dialogue-specific:** General summarization models (BART-CNN, T5) are trained on news articles. SAMSum models are trained on 16K messenger-style conversations, so they understand turn-taking, informal language, and emotional subtext.

**How it integrates:** Replaces or augments the existing episodic memory summarization in `backend/memory/tiered_memory.py`. Currently, conversation summaries are generated by the main LLM (expensive). This model runs as a dedicated summarizer:
1. After each session ends, summarize the full conversation into 2-3 sentences
2. Store the summary in the `episodic_memories` table
3. When assembling context for the next session, retrieve these summaries instead of raw messages

**Lighter alternative:** `t5-small` fine-tuned on SAMSum (~60M params, ~250 MB VRAM) for lower quality but much faster inference. Good enough for background summarization.

---

## Feature 5: Tiny Toxicity Detection

**What the user gets:** Content boundaries are enforced instantly and locally -- no cloud API needed. The character gracefully deflects when content crosses configured boundaries, and the system logs boundary events for the adaptive intelligence engine.

| Field | Value |
|-------|-------|
| Model | `AssistantsLab/Tiny-Toxic-Detector` |
| HF Link | https://huggingface.co/AssistantsLab/Tiny-Toxic-Detector |
| Parameters | ~2M |
| VRAM | ~8 MB (yes, 8 megabytes) |
| License | CC-BY-NC-SA 4.0 |
| Integration | **Low** -- standard transformers pipeline |

**Performance:** 90.26% on ToxiGen, 87.34% on Jigsaw. At 2M params, this is practically free to run.

**How it integrates:** Runs on both user input AND LLM output as a safety gate in the existing content boundary system (`docs/characters/*/06_content_boundaries.md`). Two integration points:
1. **Pre-LLM:** Flag user messages that cross content boundaries before they reach the main LLM
2. **Post-LLM:** Catch any LLM responses that violate character content rules

Results feed into the `content_gating` system -- if a user repeatedly hits boundaries, the adaptive engine adjusts its approach.

**Alternative for production:** `unitary/unbiased-toxic-roberta` (~125M params, ~500MB) is more accurate and handles multi-label toxicity (threat, obscenity, insult, identity hate) but uses 60x more resources. For a companion app, the tiny model is sufficient as a first-pass filter with the main LLM as backup.

---

## Feature 6: Cross-Encoder Reranker for Memory Retrieval

**What the user gets:** When the character recalls past conversations, it retrieves the *most relevant* memories, not just the most similar embeddings. "Remember when we talked about cooking?" pulls up the actual cooking conversation from 3 months ago, not the time you mentioned a cooking show in passing.

| Field | Value |
|-------|-------|
| Model | `cross-encoder/ms-marco-MiniLM-L6-v2` |
| HF Link | https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2 |
| Parameters | ~22M (6-layer MiniLM) |
| VRAM | ~100 MB |
| License | Apache 2.0 |
| Downloads | 14.3M (most popular reranker on HF) |
| Integration | **Medium** -- requires retrieval pipeline changes |

**How it integrates:** Two-stage retrieval for the existing tiered memory system:
1. **Stage 1 (existing):** sqlite-vec cosine similarity retrieves top-20 candidate memories
2. **Stage 2 (new):** Cross-encoder reranks candidates by relevance to the current query, returns top-5

This is a drop-in upgrade to `backend/memory/tiered_memory.py`. The cross-encoder sees both the query and each candidate together (unlike bi-encoders), so it catches semantic nuance that embedding similarity misses.

**Variant ladder:**
- `ms-marco-MiniLM-L2-v2` (~11M, fastest, good enough for real-time)
- `ms-marco-MiniLM-L6-v2` (~22M, best speed/accuracy balance) **<-- recommended**
- `ms-marco-MiniLM-L12-v2` (~33M, highest accuracy)

---

## Feature 7: HyDE (Hypothetical Document Embeddings) for Memory Search

**What the user gets:** Memory retrieval works even when the user's query doesn't match the exact words used in past conversations. "How did I feel about my promotion?" correctly retrieves the conversation where the user said "I got the senior dev role and I'm terrified" -- even though "promotion" never appeared.

| Field | Value |
|-------|-------|
| Model | No additional model needed -- uses existing LLM |
| Technique | Generate a hypothetical answer, embed it, search |
| VRAM | 0 additional (uses main LLM + existing embedder) |
| License | N/A (technique, not model) |
| Integration | **Low-Medium** -- ~50 lines added to memory retrieval |

**How it works:**
1. User asks something that triggers memory retrieval
2. Instead of embedding the raw query, ask the main LLM: "Write a short paragraph that would appear in a conversation about [query]"
3. Embed that hypothetical paragraph
4. Search sqlite-vec with the hypothetical embedding (which lives in "answer space" alongside stored memories)

**How it integrates:** Add a `hyde_search()` method to `backend/memory/tiered_memory.py` that wraps the existing `search()` with an LLM-generated hypothetical document. Use conditionally -- only when standard cosine similarity returns low-confidence results (< 0.6 threshold). Combines well with Feature 6 (reranker) as a pipeline: HyDE -> retrieve top-20 -> rerank -> top-5.

**Latency concern:** Adds one LLM inference call (~200-500ms local). Only trigger when the retrieval confidence is low, so most queries skip HyDE entirely.

---

## Feature 8: LLMLingua-2 Prompt Compression

**What the user gets:** The character can remember more context in each conversation because the system fits 2-3x more history into the same token budget. Longer effective memory means more coherent, contextual responses.

| Field | Value |
|-------|-------|
| Model | `microsoft/llmlingua-2-xlm-roberta-large-meetingbank` |
| HF Link | https://huggingface.co/microsoft/llmlingua-2-xlm-roberta-large-meetingbank |
| Parameters | ~355M (XLM-RoBERTa-large) |
| VRAM | ~1.4 GB |
| License | MIT |
| Integration | **Medium** -- requires context assembler changes |

**Why LLMLingua-2 over v1:** 3-6x faster compression, better out-of-domain generalization, task-agnostic (works on any text without domain-specific tuning). Formulated as token classification -- each token gets a keep/drop decision.

**How it integrates:** Add a compression step to `backend/llm/context_assembler.py`. When the assembled context exceeds the token budget:
1. Compress episodic memory blocks (least important to most important)
2. Compress lorebook entries
3. Never compress the system prompt or latest user message

Achieves 2-5x compression with <5% quality loss on downstream tasks. This directly addresses the token budget pressure in context assembly.

**Lighter alternative:** `microsoft/llmlingua-2-bert-base-meetingbank-compr-token` (~110M, ~450MB) -- BERT-base version, faster but slightly less accurate. Better suited for real-time compression.

**Install:** `pip install llmlingua`

---

## Feature 9: Language Detection

**What the user gets:** The character automatically detects when the user switches languages and responds appropriately. A Japanese user who occasionally types in English gets seamless language switching. Also enables future multilingual character voices.

| Field | Value |
|-------|-------|
| Model | `facebook/fasttext-language-identification` |
| HF Link | https://huggingface.co/facebook/fasttext-language-identification |
| Parameters | ~1M (fastText shallow model) |
| VRAM | ~1 MB (CPU-only, near-instant) |
| License | CC-BY-SA 3.0 |
| Languages | 217 languages supported |
| Integration | **Low** -- 3 lines of code |

**How it integrates:** Run on every user message (sub-millisecond). Store detected language in the session state. Two uses:
1. **Prompt routing:** If user language != character language, add a translation instruction to the system prompt
2. **Analytics:** Track language distribution in the adaptive intelligence engine for personalization

**Why fastText:** At <1MB and sub-millisecond inference, this is essentially free. No reason not to include it. More accurate than regex-based detection and covers 217 languages.

**Install:** `pip install fasttext-langdetect` (wrapper) or use `fasttext` directly.

---

## Feature 10: ColBERT Late-Interaction Retriever

**What the user gets:** Memory search is both fast AND accurate. The character can search through thousands of past conversations in milliseconds on CPU, finding semantically relevant memories even when the exact words differ.

| Field | Value |
|-------|-------|
| Model | `answerdotai/answerai-colbert-small-v1` |
| HF Link | https://huggingface.co/answerdotai/answerai-colbert-small-v1 |
| Parameters | ~33M |
| VRAM | <500 MB (designed for CPU deployment) |
| License | Apache 2.0 |
| Downloads | 1.3M |
| Integration | **High** -- requires index rebuild + retrieval pipeline swap |

**Why ColBERT over standard bi-encoders:** Late interaction means each token in the query interacts with each token in the document independently, then scores are aggregated. This captures fine-grained semantic matches that single-vector embeddings miss. The "small" variant outperforms ColBERTv2 on BEIR benchmarks despite being 4x smaller.

**How it integrates:** This would replace or supplement the existing sqlite-vec retrieval in `backend/memory/tiered_memory.py`. Instead of storing single vectors per memory, store per-token ColBERT embeddings. Use RAGatouille library for easy indexing/search.

**Trade-off:** Higher storage (per-token vectors vs single vector per document) but much better retrieval quality. Best suited for the long-term memory tier where accuracy matters most.

**Install:** `pip install ragatouille`

**Recommendation:** Start with Feature 6 (cross-encoder reranker) as a quick win on top of existing sqlite-vec. Graduate to ColBERT only if retrieval quality remains insufficient.

---

## Feature 11: Text Style Consistency via Few-Shot Steering

**What the user gets:** The character's voice stays consistent across conversations -- same vocabulary, sentence rhythm, formality level, and personality quirks. Dae always sounds like Dae, not like a generic chatbot that occasionally remembers to be sarcastic.

| Field | Value |
|-------|-------|
| Model | No additional model -- technique using existing LLM |
| Technique | Style exemplar injection + constrained decoding hints |
| VRAM | 0 additional |
| License | N/A |
| Integration | **Medium** -- requires character prompt engineering + eval pipeline |

**How it works (3 layers):**

1. **Style exemplar bank:** For each character, maintain 10-15 "golden" response examples that perfectly capture their voice. Inject 3-5 randomly selected exemplars into the system prompt each turn as few-shot demonstrations. These are more effective than descriptive style guides.

2. **Style consistency scoring:** After each LLM response, run a lightweight classifier (DistilBERT fine-tuned on character dialogue) that scores how "in-character" the response is. If the score is below threshold, regenerate with stronger exemplars. This creates a feedback loop for the adaptive engine.

3. **Vocabulary constraints:** Maintain per-character word lists (preferred terms, banned terms, catchphrases). Post-process LLM output to substitute generic words with character-specific ones. E.g., Dae says "nah" not "no", "sick" not "cool".

**How it integrates:** Extends the existing tiered prompt system (CORE/EXTENDED/DEEP) with a new STYLE tier in `backend/llm/context_assembler.py`. The exemplar bank lives alongside the character bible files in `docs/characters/*/`.

---

## Feature 12: Topic Modeling from Conversation History

**What the user gets:** The character develops awareness of what topics matter most to the user. "You've been talking about your art a lot lately -- how's that watercolor project going?" The character proactively brings up topics the user cares about, creating a sense of genuine interest.

| Field | Value |
|-------|-------|
| Model | BERTopic (library) + existing sentence embeddings |
| HF Link | https://huggingface.co/docs/hub/bertopic |
| Parameters | Uses existing embedder (~0 additional) |
| VRAM | ~0 additional (CPU library) |
| License | MIT |
| Integration | **Medium** -- requires topic tracking + proactive mention system |

**How it works:**
1. Cluster user messages over time using BERTopic (HDBSCAN + class-based TF-IDF)
2. Track topic frequency and recency per user
3. Maintain a "topic interest profile" that decays over time
4. Feed top-3 active topics into the greeting generator and proactive conversation system

**How it integrates:** New module `backend/knowledge/topic_tracker.py` that runs BERTopic on the user's message history (batch job, not real-time). Results feed into:
- `backend/greeting/generator.py` -- greetings reference recent topics
- `backend/proactive/` -- proactive messages ask about active interests
- `backend/mood/engine.py` -- topic engagement affects mood/bond

**Install:** `pip install bertopic`

---

## Implementation Priority Matrix

| Priority | Feature | VRAM | Effort | Impact | Quick Win? |
|----------|---------|------|--------|--------|------------|
| **P0** | F3: GLiNER NER | 600 MB | Low | High | YES |
| **P0** | F5: Tiny Toxicity | 8 MB | Low | High | YES |
| **P0** | F9: Language Detection | 1 MB | Low | Medium | YES |
| **P1** | F6: Cross-Encoder Reranker | 100 MB | Medium | High | -- |
| **P1** | F1: Sarcasm Detection | 500 MB | Low | Medium | YES |
| **P1** | F4: Dialogue Summarization | 1.6 GB | Low | High | -- |
| **P2** | F2: Dialogue Act Classification | 250 MB | Medium | High | -- |
| **P2** | F7: HyDE Memory Search | 0 | Low-Med | Medium | -- |
| **P2** | F12: Topic Modeling | 0 | Medium | Medium | -- |
| **P2** | F8: LLMLingua-2 Compression | 1.4 GB | Medium | Medium | -- |
| **P3** | F11: Style Consistency | 0 | Medium | High | -- |
| **P3** | F10: ColBERT Retriever | 500 MB | High | Medium | -- |

**P0 features** are drop-in, require minimal code changes, and immediately improve the experience.
**P1 features** require moderate integration but have strong payoff.
**P2 features** are architectural enhancements best done during a focused sprint.
**P3 features** require pipeline redesign or significant prompt engineering iteration.

---

## VRAM Budget (Running All Simultaneously)

| Component | VRAM |
|-----------|------|
| Main LLM (7B Q4) | ~4.5 GB |
| GLiNER NER (F3) | 600 MB |
| Sarcasm detector (F1) | 500 MB |
| Cross-encoder reranker (F6) | 100 MB |
| Dialogue summarizer (F4) | 1.6 GB |
| Toxicity detector (F5) | 8 MB |
| Language detection (F9) | 1 MB |
| LLMLingua-2 (F8) | 450 MB (BERT-base variant) |
| **Total** | **~7.8 GB** |

Fits within RTX 3070 (8GB) with the main LLM. On M2 Pro (24GB unified), all features run comfortably with room for a 13B model.

Features F2, F7, F10, F11, F12 use either the existing LLM or CPU-only libraries, adding 0 additional VRAM.

---

## Sources

- [GLiNER GitHub](https://github.com/urchade/GLiNER)
- [cardiffnlp/twitter-roberta-base-irony](https://huggingface.co/cardiffnlp/twitter-roberta-base-irony)
- [cross-encoder/ms-marco-MiniLM-L6-v2](https://huggingface.co/cross-encoder/ms-marco-MiniLM-L6-v2)
- [AssistantsLab/Tiny-Toxic-Detector](https://huggingface.co/AssistantsLab/Tiny-Toxic-Detector)
- [philschmid/bart-large-cnn-samsum](https://huggingface.co/philschmid/bart-large-cnn-samsum)
- [answerdotai/answerai-colbert-small-v1](https://huggingface.co/answerdotai/answerai-colbert-small-v1)
- [facebook/fasttext-language-identification](https://huggingface.co/facebook/fasttext-language-identification)
- [LLMLingua-2 paper](https://hf.co/papers/2403.12968)
- [LLMLingua GitHub](https://github.com/microsoft/LLMLingua)
- [HyDE paper](https://arxiv.org/abs/2212.10496)
- [HyDE implementation guide (Haystack)](https://docs.haystack.deepset.ai/docs/hypothetical-document-embeddings-hyde)
- [BERTopic documentation](https://maartengr.github.io/BERTopic/)
- [RAGatouille for ColBERT](https://github.com/bclavie/RAGatouille)
- [Jina ColBERT v2 multilingual](https://jina.ai/news/jina-colbert-v2-multilingual-late-interaction-retriever-for-embedding-and-reranking/)
- [unitary/unbiased-toxic-roberta](https://huggingface.co/unitary/unbiased-toxic-roberta)
- [dslim/distilbert-NER](https://huggingface.co/dslim/distilbert-NER)
