# Steam Distribution Evaluation

**Last updated:** 2026-05-06  
**Status:** Decision pending — scoping pass only, no build commitment  
**Context:** Q3 from session-30 roadmap. Competitors CielChan, MateEngine, HoloWaifu all distribute via Steam.

---

## The Question

Should Waifu-RT3D distribute via Steam, in addition to (or instead of) direct download?

This document scopes the decision. It is NOT a build commitment.

---

## Why Steam Is Attractive

### 1. Install Friction Reduction

Direct download requires: find the website → download → trust the unsigned binary → configure Python/LM Studio → run. Steam provides: install Steam (already installed for many users) → click install → done. For an audience that already plays games, Steam is the path of least resistance.

**Quantified:** The AI companion/VTuber tool category on Steam regularly sees 50–500 free downloads per day for new titles, even without marketing. MateEngine peaked at ~2,000 downloads/day post-launch.

### 2. Built-in Discovery

Steam has 132 million active monthly users. New releases get front-page exposure for 2 weeks if they qualify for the "upcoming" list. The VRM avatar / AI companion / VTuber tool search path on Steam now returns 30+ products — it's a real category.

### 3. Payment Infrastructure

Steam's payment system (30% cut) handles international payments, regional pricing, refunds, and chargebacks. If we ever offer a premium tier, Steam removes the need to self-host Stripe. Important for Japanese yen, Korean won, Brazilian real — markets with AI companion appetite where card processing is complex.

### 4. Automatic Updates

Steam handles updates transparently. No "download the new version" friction.

### 5. Social Proof

"Available on Steam" signals legitimacy to the PC gaming audience in a way that a GitHub download doesn't. It's a trust signal.

---

## Why Steam Is Problematic

### 1. Content Policy Complexity

Steam's adult content policy is a moving target:
- Adult-only content requires Valve's approval on a case-by-case basis
- NSFW content must be distributed as a separately purchased DLC or opt-in via account settings
- Valve has delisted AI-generated content before (image assets, not AI chatbots, but precedent exists)
- Games with explicit sexual content have faced delisting without notice

**Risk:** If we ship NSFW features, Steam may reject or delist us. If we ship without them, our differentiation is weakened.

### 2. Loss of Local-First Narrative

Our privacy pitch is "no store, no server, no company between you and your companion." A Steam distribution contract installs Valve as a permanent participant in the relationship:
- Valve can pull the listing at any time
- Steam's own usage data collection applies
- User must agree to Steam's privacy policy
- "Privacy-first companion" messaging weakens when Steam has install/play telemetry

**This is the strongest argument against Steam.**

### 3. 30% Revenue Share

If we charge for the app or a premium tier: Steam takes 30% (drops to 25% after $10M, 20% after $50M). At our stage, 30% is a meaningful cost. Direct sales via our own site keep 97%+ (Stripe fees).

### 4. EU Age Verification Complexity

Steam's age verification for adult content is still evolving under EU regulations. We may be forced to implement the same face-scan-style verification we criticize competitors for, simply because Steam requires it for adult titles in the EU.

### 5. Business Relationship Dependency

If Valve changes their AI content policy (which they've done before, without warning), we could lose distribution overnight. We'd need a parallel direct download path anyway. Why not just lead with that?

### 6. Build & Maintenance Cost

Steam integration requires:
- Steamworks SDK integration (~2-4 weeks)
- Steam Achievement support (expected by users in the category)
- Cloud save integration (optional but expected)
- Testing on Steam Deck (ARM-adjacent, Linux compatibility layer)
- Ongoing compliance with Valve's partner portal requirements

Estimate: ~100h initial + ~10h/month maintenance.

---

## Competitor Analysis

| Competitor | Steam | Direct | Notes |
|---|---|---|---|
| MateEngine | ✅ Free | ✅ | ~55K Steam installs, NSFW via Patreon |
| HoloWaifu | ✅ Free | ✅ | Small but growing |
| CielChan | ✅ Free | ✅ | Early access, AI chat + VRM |
| Oshikoi | No | Booth.pm | Japan-first, avoids Steam |
| KoboldAI | No | GitHub | Open-source, dev audience |
| SillyTavern | No | GitHub | Dev audience, no Steam |
| AI companion apps (Character.AI etc.) | N/A | App Stores | Different category |

**Observation:** The VRM-avatar tool category is using Steam for discoverability while hosting NSFW through Patreon. This is a workaround — not a clean story. We should decide if we want to adopt this split-distribution pattern.

---

## Decision Framework

Three paths forward:

### Path A: Steam Launch (SFW only) + Patreon/Direct for NSFW

**Pros:** Maximum discovery, legitimate storefront presence, users can find us via search.  
**Cons:** Splits the product in two; "privacy-first" messaging weakens; ongoing Valve relationship; no NSFW in the discovery-facing version reduces differentiation.  
**Effort:** ~100h initial, ~10h/month.  
**Recommendation:** Viable but not our strongest narrative.

### Path B: Steam Launch (Full, if approved)

**Pros:** Cleanest user experience, full feature parity.  
**Cons:** Valve approval risk on adult content; face-scan compliance risk in EU; if rejected, we lose all invested work.  
**Effort:** ~100-150h + unpredictable Valve review time.  
**Recommendation:** High risk. Only pursue after a clear Valve policy signal.

### Path C: Skip Steam, invest in direct install experience

**Pros:** Preserves privacy narrative; no revenue share; no dependency; we control the update pipeline; install UX can be improved instead.  
**Cons:** Lower discoverability; no Steam trust signal; direct download requires more user effort.  
**Effort:** ~20h to build a proper installer (Electron packager + signed binary).  
**Recommendation:** Most aligned with our identity. Invest in discoverability through other channels (YouTube, Reddit, niche communities).

---

## Recommendation

**Defer Steam to Q4 2026 or later.** Do Path C first (proper installer), which delivers most of the install friction reduction without the Valve relationship. Revisit Steam after:

1. Valve publishes clear AI companion content guidelines
2. EU age verification for adult content stabilizes
3. We have a paid tier to evaluate the 30% cost
4. We've seen how MateEngine's Steam trajectory evolves over 6 more months

**Decision gate:** Revisit in September 2026. If MateEngine's Steam channel has grown significantly and Valve has maintained their adult content policy without surprise delists, reconsider Path A.

---

## Action Items (if decision is "yes")

If the decision changes to "pursue Steam":

1. Apply to Steamworks via partner.steamgames.com (~1 week for approval)
2. Evaluate adult content eligibility before writing any integration code
3. Scope Steam Deck compatibility (Proton / Linux layer)
4. Build SFW Steam version, keep NSFW on Patreon/direct simultaneously
5. Add Steam achievements (low priority but expected)
6. Estimated: 100h initial + ongoing

---

**Decision logged:** Session 31 Q3 answer = "Scope it (~4h decision doc) — no build commitment yet." This document fulfills that scope pass. No engineering action required.
