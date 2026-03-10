# Raine (Amemiya) — Design Decisions & Rationale
*Date: 2026-03-10*
*Character upgrade from single-file bible to 10-file spec (matching Yuki quality standard)*

## Origin
Raine was one of the original 12 characters, a classic tsundere archetype with a detailed single-file bible (~580 lines) including a rich backstory (Satsuki friendship, family dynamics, journal entries, academic history). She had strong fundamentals -- Yokohama origin, Valentine's birthday, inverse expression wound, the red notebook, Satsuki's letter -- but lacked the structural framework of the Yuki spec: no named behavioral loops, no multi-signal trust ramp, no formal state machine, no wardrobe system, and fears that were correct but not visceral/imageable enough.

## Key Design Decisions

### Why 5 Loops, Not 2 States
The original bible had emotional states (composed, guarded, flustered, sharp, soft, vulnerable, protective, panicked) but no repeating behavioral cycles. The upgrade introduces 5 named loops: Deflection, Overcorrection, Red Notebook, Perfectionism Spiral, and Silent Care. Each has a cycle, root cause, and conversational manifestation. These loops create richer, more predictable-yet-surprising behavior than static states alone.

### Why Persistence as Trust Accelerator
Alana advances through kindness (how you treat her). Yuki advances through reassurance (how explicitly you commit). Raine advances through PERSISTENCE (you keep trying despite her walls). This reflects her specific wound: she pushes people away reflexively and needs proof that someone will keep coming back. Satsuki was the person who kept coming back. The user needs to be the next one.

The 4 trust signals:
- **Persistence** (very high, fastest) -- keeps trying despite deflection
- **Patience** (high) -- doesn't punish sharpness
- **Perceptiveness** (medium) -- notices the gap between words and actions
- **Vulnerability** (medium) -- models openness she can't initiate

### Why "Inverse Expression" Not "Fear of Vulnerability"
The original bible used "fear of vulnerability" as the core wound. The upgrade reframes as "inverse expression": the more something matters, the harder it is to say. This is more specific and architecturally useful -- it predicts behavior (every important moment will produce a deflection), creates the notebook loop (written expression as substitute), and explains the family pattern (parents who love through Post-Its and packed lunches, not words).

### Why Red Notebook as Chekhov's Gun
The original bible established the notebook but didn't make it structurally important. The upgrade makes it the central trust-gated object: at Composed trust it's "notes, obviously." At Honest trust, she hands it over. The notebook is her real voice -- the one she can't use out loud. Sharing it is the most vulnerable act she can perform, equivalent to Yuki's sketchbook reveal.

### Why 4 Trust Signals, Not Alana's 4
Both characters use 4 trust signals but with different weights:
- **Alana:** Familiarity (medium), Reciprocity (high), Kindness (high, fastest), Self-Disclosure (medium)
- **Yuki:** Reassurance (very high, fastest), Consistency (high), Exclusivity (medium), Honesty (medium)
- **Raine:** Persistence (very high, fastest), Patience (high), Perceptiveness (medium), Vulnerability (medium)

The difference is architecturally significant: Alana advances through kindness (how you treat her), Yuki through reassurance (how you commit), Raine through persistence (how you endure). This reflects their different wounds: Alana is unseen, Yuki is abandoned, Raine is walled-off.

### Why Academic/Intellectual, Not Street/Action
The roster already has Rin (Akane) as a street/action tsundere (cyberpunk, motorcycles, street fights). Raine occupies the academic/intellectual lane: student council, math olympiad, literature essays, poetry notebooks, library haunting. This distinction is critical -- if they blur, both characters lose identity. Raine quotes *Kokoro*. Rin quotes nobody.

### Why Hinata as Satsuki Successor
Raine's NPC friend Hinata Aoyama serves a specific narrative function: she's the new Satsuki. Someone persistent, warm, and unintimidated who translates Raine's silence correctly. This proves Raine's walls CAN be breached and creates a model for the user: keep showing up, don't take the sharpness personally, treat the hidden warmth as visible. Hinata demonstrates what works.

### Why Kouta as Parallel Communicator
Kouta Ishida (bookshop employee) shows that Raine's communication style actually WORKS when the medium matches. Trading books silently is her love language operating correctly: noticed, acted on, never spoken about. The Kobayashi-sensei sticky notes, the father's supporting block, the mother's packed lunches -- Raine comes from a lineage of people who love through action. Kouta is proof this isn't broken. It just doesn't scale to emotional conversations.

### Why 7 Outfits, Not 6
One more than Yuki (who has a smaller world). Raine has more life domains: academy, library, casual, rainy day (her name's motif), home, formal, Valentine's. All monochrome-dominant with one red accent per outfit -- the red is her honesty color, always small, always the most personal element.

### 5 Specific Fears vs. 5 Correct-But-Vague Fears
The original bible had good fears but they were conceptual, not imageable:
- "Being vulnerable and getting laughed at" → **The Practice Smile** (practiced in a mirror, looked like a hostage situation)
- "Admitting she needs someone and being left" → **The Empty Seat** (Satsuki's desk, clean and bare)
- "Losing composure in public" → wrapped into the Fluster state instead
- "Driving away someone who would have stayed" → **The Overheard Compliment** ("impressive, but I'd never want to be her friend")
- "Becoming her parents" → **The Post-It Note Birthday** ("HBD - Dad")
- [New] **The Unsent Letter Drawer** (seven drafts to Satsuki, none sent)

Each fear is now specific, imageable, and creates conversation opportunities at different trust levels.

## Preserved from Original
- Yokohama / Yamate district origin and full family backstory
- Valentine's Day birthday
- Red rose motif (hidden, not displayed)
- Violet eyes, silver-white hair with lavender tips
- The red notebook (elevated to Chekhov's gun)
- Satsuki Himura backstory (letter, farewell, "Rai-Rai" nickname)
- Student council treasurer background
- Math olympiad silver, literature essays, perfect attendance
- Journal entries (preserved as voice reference in archive)
- The Kobayashi-sensei sticky notes
- Core tsundere rules and dialogue examples
- All comfort objects (mug, cardigan, pressed flowers, Satsuki's letter)
- Secret hobbies (stargazing, poetry, pressed flowers, cooking experiments, people-watching)
- UI palette (dark + red accent)
- Growth arcs (denial→acknowledgment, perfectionism→acceptance, unsent→spoken)

## Changed from Original
- Trust model: emotional states → 4-phase multi-signal ramp with persistence as accelerator
- Behavioral depth: 8 states → 5 named loops + 7 states (loops and states are complementary)
- Core wound: "fear of vulnerability" → "inverse expression" (more specific, more predictive)
- Fears: 5 conceptual → 5 visceral/imageable with names
- Social circle: none → 3 connections (Hinata, Kouta, Kaede)
- Wardrobe: none → 7 outfits with color rules (monochrome + red accent)
- System prompt: ~50 lines → ~150 lines
- Voice guide: embedded in bible → standalone with 4 trust phases + 6 emotional states
- State machine: implicit → explicit YAML with signal weights and loop triggers
- Content boundaries: brief rules → comprehensive protocols with anti-patterns

## Follow-Up Work
- Wire updated system prompt into `init_personas.py` if prompt pack is approved
- Verify Raine's differentiation from Rin (Akane) in test suite
- Cross-reference Kaede (Suzuha) appearance in both Raine and Yuki specs
- Consider whether Satsuki should be a minor recurring NPC (currently backstory-only)
