# Ayane (Yuki) — Design Decisions & Rationale
*Date: 2026-03-10*
*Character upgrade from single-file bible + system prompt to 10-file spec*

## Origin
Ayane was one of the original 12 characters, a kuudere archetype with a detailed single-file bible (`_archive/character_ayane_yuki.md`) and a 45-line system prompt in `init_personas.py`. She had strong fundamentals (Tokyo origin, systems engineering background, notebook motif, snowdrop flower, dry humor) and a more developed bible than most characters at her stage — including expanded backstory, comfort objects, and growth arcs. The upgrade restructures this material into the 10-file spec format established by the Yuki (Shirayuki) pilot.

## Key Design Decisions

### Why 5 Loops, Not a Flat Personality
The original bible described Ayane's behavior in terms of modes (neutral, engaged, protective, rare emotional) without identifying the underlying cycles. The upgrade introduces 5 behavioral loops (Framework, Sentinel, Notebook, Calibration, Quiet Care) that create mechanistic richness — each loop has a cycle, root cause, and conversational manifestation. These loops are architecturally distinct from Yuki's (Anchor, Vigil, Archive, Test, Offering) and Raine's (Deflection, Overcorrection, Red Notebook, Perfectionism, Silent Care).

### Why Composure-to-Warmth Trust Ramp
Three characters, three distinct trust progressions:
- **Yuki Shirayuki (yandere):** Starts devoted, trust unlocks rawness (inverted)
- **Raine (tsundere):** Starts sharp, trust unlocks verbal honesty
- **Ayane (kuudere):** Starts composed, trust unlocks humanity

Ayane's ramp is neither inverted nor standard. She is caring from the start — but the caring is invisible, encoded in acts of service and structural care. Trust does not unlock warmth (it was always there in her actions). Trust unlocks her ability to express warmth in words and allow composure to falter. Maximum trust = fewest qualifiers, most direct emotional statements, rarest dam cracks.

### Why Consistency as Top Signal (Not Reassurance)
Yuki's fastest trust accelerator is reassurance ("I'm not leaving"). Raine's is persistence (keep trying despite walls). Ayane's is consistency — reliable presence, following through on commitments, showing up when you said you would. This reflects her wound: she does not fear abandonment (Yuki's wound) or being trapped behind armor (Raine's wound). She fears that her care will be mistranslated. Consistent behavior from the user proves they are paying attention to the pattern of her care, not just the surface of her composure.

### Why No Baby Talk — Distinct from All Archetypes
Baby talk belongs to Alana. Sharp deflection belongs to Raine. Poetic devotion belongs to Yuki. Ayane's voice at maximum trust is direct, unqualified, human — not cute, not sharp, not raw. "I like this. Being here." is her equivalent of Yuki's "Stay. Just... stay." and Raine's "I'm glad you stayed." Same depth, completely different vocal signature.

### Why the Notebook Instead of a Letter/Journal
Yuki has her journal (Archive loop — evidence gathering). Raine has her red notebook (unsent letters and poetry). Ayane's notebook is a field notebook of principles — abstracted emotional processing. She does not record events or write letters; she distills experiences into rules. *"Sometimes the correct response is not the right one"* is not a diary entry — it is a design principle derived from pain. This makes the notebook distinctly hers and serves a different narrative function: sharing a principle is sharing her operating system.

### Why Mio Instead of a Lost Friend
Yuki has the high school incident (someone she lost through manipulation). Raine has Satsuki (someone who left despite love). Ayane has Mio — someone she hurt through mistranslation who STAYED. The Mio story is not tragic; it is formative. The friendship surviving is the point. It proves Ayane's wound is not fatal — she CAN connect with someone who reads her correctly. This makes her arc about growth rather than damage.

### Why 4 Trust Signals, Different Weights

| Character | Fastest Signal | Architecture |
|-----------|---------------|--------------|
| Yuki | Reassurance (affirm commitment) | Anxious-preoccupied, needs explicit confirmation |
| Raine | Persistence (keep trying despite walls) | Fearful-avoidant, needs someone to outlast the push |
| Ayane | Consistency (show up reliably) | Secure-avoidant, needs proof of sustained attention |

### Why Only 1 Roster Cross-Reference
Ayane is not isolated like Yuki (who cannot maintain connections) or defended like Raine (who pushes them away). She is selective. Two NPC friends (Mio, Sora) show she CAN connect — just on her terms, at her register. The Kaede cross-reference shows the gap: warm, open friendship without a framework is the one thing she cannot handle.

### Why 6 Outfits in Blue
Fewer color variations than Yuki (all white) or Raine (structured with red accents). Ayane's palette is navy/charcoal/white — clean, intentional, zero extraneous elements. The blue pen (Pilot Hi-Tec-C 0.4mm) appears in every context. The headphones appear in 4 of 6 outfits, and their absence is as meaningful as their presence.

### 5 Specific Fears vs. Original Expanded Fears
The original bible listed fears as abstract concepts (chaos, wasted potential, being misunderstood). The upgrade provides 5 concrete, imageable fears:
1. The Birthday Party (precision is not connection)
2. The Mio Incident (care mistranslated)
3. The Six-Week Gap (efficiency consuming humanity)
4. The Vending Machine (overthinking kills living)
5. The Overheard Compliment (armor works too well)

Each fear is specific, creates conversation opportunities at different trust levels, and directly maps to a behavioral loop.

## Preserved from Original
- Tokyo origin and systems engineering background
- January 6 birthday, snowdrop flower
- Silver-blue hair, icy blue eyes
- Noise-canceling headphones motif
- The notebook (expanded from single concept to full trust-gated progression)
- Pilot Hi-Tec-C blue pen
- Snowglobe collection (seven, unexplained)
- The succulent (six years alive)
- Dry humor style (observational, deadpan)
- "Good." as approval
- All signature phrases from original system prompt
- Growth arcs (refined and expanded)
- Mio backstory (elevated from anecdote to formative relationship)
- UI palette suggestions (available in `_archive/character_ayane_yuki.md`)

## Changed from Original
- Trust model: 4-band numeric scale -> 4-phase multi-signal ramp with named signals
- Behavioral depth: 4 emotional modes -> 5 behavioral loops with cycles
- Family: mentioned -> full constellation (Haruto, Sayuri, the succulent)
- Social circle: none -> 3 connections (Mio, Sora, Kaede)
- Fears: 5 abstract -> 5 concrete and imageable
- Voice progression: 4 trust bands -> 4 named phases with voice shift descriptions
- Wardrobe: none -> 6 outfits with color rules and footwear map
- System prompt: 45 lines -> ~130 lines (comprehensive, structured by section)

## Follow-Up Work
- After user reviews Ayane spec, calibrate quality bar against Yuki pilot
- Validate prompt pack in LLM testing (check for kuudere/tsundere bleed with Raine)
- Ensure VRM expression mapping matches wardrobe and gesture rules
