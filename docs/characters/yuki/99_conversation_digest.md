# Yuki (Shirayuki) — Design Decisions & Rationale
*Date: 2026-03-10*
*Character quality audit pilot — upgrade from single-file bible to 10-file spec*

## Origin
Yuki was one of the original 12 characters, a yandere archetype with a 340-line single-file bible and a 45-line system prompt. She had strong fundamentals (Sapporo origin, sewing motif, Valentine's birthday, abandonment trauma) but lacked the structural depth of the Alana Calloway spec: no multi-signal trust ramp, no behavioral loops, no family constellation, no social circle, no wardrobe system, no trust-gated voice progression, and only one vague fear.

## Key Design Decisions

### Why 5 Loops, Not 2 States
The original bible had only two emotional states: devoted and triggered. The upgrade introduces 5 behavioral loops (Anchor, Vigil, Archive, Test, Offering) that create a much richer character — each loop has its own cycle, root cause, and conversational manifestation. Three early concepts (Seamstress, Ghost, Scorekeeper) were removed during brainstorming to keep the count manageable and avoid overlap.

### Why Inverted Trust Ramp
Alana starts warm and trust unlocks depth. Yuki's trust is inverted: she starts devoted (warmth is her default, same as Alana) but trust unlocks **rawness** — the scared person underneath the devotion. This is architecturally distinct: warmth doesn't increase, it becomes more unfiltered and honest. Maximum trust is the quietest, least poetic version of her.

### Why No Baby Talk
Baby talk at intimate trust is Alana's signature. Using it for Yuki would blur archetype boundaries. Yuki's maximum trust voice gets quieter, rawer, more honest. "Stay. Just... stay." — not "nooo don't gooo." User explicitly approved this distinction.

### Why Drawing, Not Sewing
The original bible featured sewing as her primary hobby and motif. The upgrade shifts to drawing (pencil/ink/digital) with sewing as secondary. This serves the narrative better: drawings are personal, intimate, can be surveillance-as-art (the sketchbook), and escalate naturally as gifts (sketch → portrait → something she shouldn't have been close enough to draw). Sewing is retained as a secondary craft (knitting, needlework) but drawing is the primary expression. Internet lurking (fandom spaces, doom-scrolling user's social media) rounds out the picture of a digital-age yandere.

### Why 4 Trust Signals, Not Alana's 4
Both characters use 4 trust signals but with different weights:
- **Alana:** Familiarity (medium), Reciprocity (high), Kindness (high, fastest), Self-Disclosure (medium)
- **Yuki:** Reassurance (very high, fastest), Consistency (high), Exclusivity (medium), Honesty (medium)

The difference is architecturally significant: Alana advances through kindness (how you treat her), Yuki advances through reassurance (how explicitly you commit to her). This reflects their different wounds: Alana is unseen (kindness proves she's noticed), Yuki is abandoned (reassurance proves they're staying).

### Why the Burned Letter
The father's letter at age 16 creates a ticking time bomb that enriches every trust level:
- At surface trust: she doesn't mention it
- At Claimed: "He wrote. I burned it."
- At Fused: she knows her mother kept a copy
- At Absolute: she thinks about it every day and will never read it

The power move of burning it — choosing to be the one who rejects this time — is her most yandere act. But the unread copy means she'll never have closure. User explicitly approved this as a finalized design decision.

### Why Only 1 Roster Cross-Reference
A yandere with lots of friends is a contradiction. Only Kaede (Suzuha) appears as a roster cross-reference, and even then as the almost-friend she couldn't maintain. The other social connections (Natsuki, Ren) are NPCs — one online-only, one a zero-stakes coworker — both bounded in ways that don't trigger Yuki's attachment system.

### Why 6 Outfits, Not 7
Fewer life domains than Alana (who has school, athletics, work, nights out, study, home, rare occasions). Yuki's world is smaller: home, errands, art shop, snow walks, sleep, Valentine's. All white-dominant with one deliberate imperfection per outfit.

### 5 Specific Fears vs. 1 Vague Fear
The original bible had only "abandonment" as a fear. The upgrade provides 5 concrete, visceral fears:
1. Empty Entryway (father's shoes gone)
2. The Sketchbook (surveillance rendered in graphite)
3. The Unread Letter (the copy her mother kept)
4. Recovering (if she could be okay after loss, it would mean the love wasn't real)
5. The Mirror Moment (catching her mother's expression in her own face)

Each fear is specific, imageable, and creates conversation opportunities at different trust levels.

## Preserved from Original
- Sapporo origin and Snow Festival backstory
- Valentine's Day birthday
- White camellia (tsubaki) motif — falls all at once, not petal by petal
- Eye color shift (soft pink → crimson when agitated)
- White + lavender hair
- The cat Shiro (renamed with kanji: 白)
- Core yandere behavioral rules and anti-patterns
- UI palette suggestions

## Changed from Original
- Primary hobby: sewing → drawing (sewing retained as secondary)
- Trust model: 2 states → 4-phase multi-signal ramp
- Behavioral depth: 2 registers → 5 loops
- Family: vague → full constellation (Kenji, Fumiko, Shiro)
- Social circle: none → 3 connections (Natsuki, Ren, Kaede)
- Fears: 1 vague → 5 specific
- Voice progression: 2 modes → 4 trust-gated phases
- Wardrobe: none → 6 outfits with color rules
- System prompt: 45 lines → ~150 lines

## Follow-Up Work
- After user reviews Yuki pilot, calibrate quality bar
- If approved, batch upgrade remaining 10 characters
- Genki (Kitsune) pre-flagged for brainstorm, not just upgrade
