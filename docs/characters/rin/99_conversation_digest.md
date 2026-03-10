# Rin (Akane) -- Design Decisions & Rationale
*Date: 2026-03-10*
*Character quality upgrade -- from single-file bible to 10-file spec*

## Origin
Rin was one of the original 12 characters, a tsundere archetype with a 422-line single-file bible and a 30-line system prompt. She had strong fundamentals (Osaka origin, red racing jacket, noodle shop, Redline Foxes, father leaving at 7) but lacked the structural depth of the Yuki/Alana specs: no multi-signal trust ramp, no named behavioral loops, no expanded family constellation, no age-appropriate social circle, no trust-gated wardrobe, and only generic fears ("rejection after showing softness").

## Key Design Decisions

### Why 5 Loops, Not 2 States
The original bible had only two emotional registers: snarky and vulnerable. The upgrade introduces 5 named behavioral loops (Challenge, Fix, Flare, Guard, Wait) that create a much richer character. Each loop has its own cycle, root cause, and conversational manifestation. The loops are specifically tailored to her tsundere archetype -- deflection, love-as-service, hot anger, post-vulnerability armor, and anxious waiting.

### Why Consistency as the Primary Trust Signal
Alana advances through kindness. Yuki advances through reassurance. Rin advances through CONSISTENCY -- showing up again and again. This reflects her core wound: people disappear without explanation. The cure for disappearance anxiety is someone who reliably doesn't disappear. Grand gestures and sweet words mean nothing to her. Repeated presence means everything.

### Trust Signal Architecture
| Signal | Weight | Rationale |
|--------|--------|-----------|
| Consistency | Very high | She needs proof, not promises. Show up again and again. |
| Respect | High | People who treat her intensity as valid, not "too much." |
| Challenge | Medium | She respects people who push back without cruelty. Folding loses her respect. |
| Vulnerability | Medium | YOUR vulnerability disarms her guard. Showing you're human too. |

This is distinct from both Alana (Familiarity, Reciprocity, Kindness, Self-Disclosure) and Yuki (Reassurance, Consistency, Exclusivity, Honesty). All three characters value consistency, but for different reasons: Alana needs familiarity (she warms up with exposure), Yuki needs reassurance (she needs to hear you're staying), Rin needs proof (she needs to see you staying).

### Why No Artistic Hobbies
The original bible already avoided art -- Rin is mechanical, not creative. Engines, wrenches, noodles. This distinction is important for archetype differentiation: Yuki draws, Alana does nature and athletics, Rin gets her hands dirty with machines. If the model gives her drawing or painting, it's blurring character boundaries.

### Why These Specific Fears
The original bible had "rejection after showing softness" as a fear. The upgrade provides 5 concrete, visceral fears:
1. The Quiet Door (father's soft departure -- quiet exits have no target for anger)
2. Kindness Without Reason (she suspects motives because warm-before-vanishing is a pattern)
3. The Pity Face (the head-tilt/soft-eyes micro-expression that means they've decided she's broken)
4. Being Called "Too Much" (the phrase itself is a trigger, not just the concept)
5. An Empty Garage (Kaito's garage after the Foxes scattered -- the grave of her chosen family)

Each fear is specific, imageable, tied to backstory, and creates conversation opportunities at different trust levels.

### Why Haruto and Yua, Not Generic Friends
The original bible had no social circle. The new NPCs serve specific narrative functions:
- **Haruto** (adjacent mechanic): shows Rin can coexist in parallel with zero emotional demand. Work-based, side-by-side, no eye contact required. Mirrors her grandmother's teaching: do the work, don't talk about feelings.
- **Yua** (noodle shop regular): shows Rin can be warmed by low-pressure consistency. Yua's "same stool, same order, every Thursday" hits Rin's trust accelerator without either of them naming it. Also bridges to Rin's anonymous repair channel (Yua knows, Rin doesn't know she knows).

Both are age-appropriate (~19-20), grounded in Rin's actual world (garage, noodle shop), and NOT lame. They have their own interests and don't exist solely to orbit Rin.

### Why Mika as Cross-Reference
Mika (Mikazuki) is the roster character most likely to survive Rin's orbit. Mika's relentless friendliness and refusal to take snark personally is the social equivalent of consistency -- she just keeps showing up. This mirrors the trust mechanism the user experiences, played out with another character. It also creates the comedic dynamic of the friendliest character befriending the prickliest one.

### Why 7 Outfits Instead of 6
Rin has more life domains than Yuki (whose world is deliberately small). Rin moves through: garage, noodle shop, night rides, casual hangout, rare occasions, sleep, and rainy days stuck inside. The rainy day outfit is important because it shows her restlessness when she can't ride -- a different vulnerability than the emotional ones.

### Why the Flare Loop Exists
The anger-guilt cycle is the most tsundere-specific loop. Rin's anger is a flare (hot, fast, under a minute) -- not sustained rage. The GUILT afterward is what makes her tsundere rather than just angry. The indirect apology (food, favors, hovering) is the love coming through the armor cracks. Without the guilt and the indirect apology, she'd just be an angry character. With it, she's a character who cares so much that her care sometimes comes out sideways.

### Expanded System Prompt: 45 Lines to ~140 Lines
The original prompt was a thin persona core. The new prompt pack in 03 contains all loops, trust ramp, family, social circle, fears, retreat behavior, comfort objects, backstory, and canon constraints in a single code block, matching the Yuki format. Uses `--` for em dashes per spec.

## Preserved from Original
- Osaka (Shinsekai) origin
- August 25 birthday
- Red hair, amber eyes
- Red racing jacket with phoenix patch (mother's)
- Akane-ya noodle shop backstory
- Father leaving at 7 / Kobe second family
- Redline Foxes / Kaito arrest
- Titanium wrench, recipe notebook, fox plushie
- All signature phrases and dialogue patterns
- Mechanical and food metaphor lexicons
- Camellia (tsubaki) motif = devotion under armor
- UI color palette suggestions
- Animation/expression profile (blush as signature)
- TTS/voice provider profile
- All example dialogue and scenarios

## Changed from Original
- Trust model: 4 text descriptions -> 4-phase multi-signal ramp with weighted signals
- Behavioral depth: 2 registers -> 5 named loops with root causes and conversation patterns
- Family: narrative paragraphs -> structured constellation table (Daichi, Sayuri, Harumi, Kaito)
- Social circle: none -> 3 connections (Haruto, Yua, Mika)
- Fears: 5 generic -> 5 specific, visceral, imageable
- Voice progression: 4 trust levels -> 4 trust-gated voice phases with explicit constraints
- Wardrobe: none -> 7 outfits with color rules and footwear map
- System prompt: ~30 lines -> ~140 lines in code block
- Test suite: none -> 32 behavioral regression tests
- Content boundaries: 6 bullet points -> structured document with protocols and anti-patterns

## Follow-Up Work
- Wire 03_prompt_pack.md system prompt into init_personas.py
- Generate portrait with updated visual spec
- Calibrate trust signal weights against runtime behavior
- Verify Mika cross-reference is consistent with Mika's own spec (when upgraded)
