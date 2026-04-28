# HUD Element Audit — Tier 0 Output

**Date:** 2026-04-27 (session 19)
**Plan:** `docs/plans/2026-04-27-hud-redesign-staged.md` Tier 0
**Bug:** `docs/bugs/2026-04-27-hud-cramped-overcrowded.md`
**Method:** 4 parallel codebase-analyst agents, one per zone group, with `git log -S` and `git log --diff-filter=A` for first-introduced commit per element.

---

## TL;DR — what the audit revealed

1. **The element count is much worse than the inventory snapshot suggested.**
   - Inventory said top toolbar = 8 icons. Reality = **9 icons + a hidden 8-element composer-row** above the input. **17 controls, not 8.**
   - Inventory said 3D viewer = 12+. Reality = **30+** (camera presets, custom slots, 5 status badges, 6+ panel toggles, 4 hint pills, 2 duplicate close buttons).
2. **The "floating Next: tooltip" bug is misdescribed.** The "Next:" line is an inline `<p>` inside `BondProgressBar`, not a floating element. The actual problem: BondProgressBar stacks 3 rows inside an already-tall sticky `z-40` StatusBar, which pushes chat content down. Fix in Tier 1 must address sticky-header height, not z-index.
3. **The "book/lore" toolbar icon doesn't exist.** Inventory had it wrong. The `BookOpen` icon opens **Scenario Library** (global). Lorebook is sidebar-only. No emoji button in the toolbar at all.
4. **Confirmed duplicate-feature confusion:** Scenario Library (`BookOpen`) + Scenario Picker (`Sparkles large`) are adjacent in the chat-area toolbar, opening two different but thematically identical overlays. Strong merge candidate.
5. **Confirmed duplicate-action waste:** "Back to Chat" (top of 3D panel) and "Close" (bottom of 3D panel) do the identical thing. Free delete.
6. **Wrong/stale labels:** `Ctrl+0` hint in viewer.html — actual reset is double-click on canvas. Fix or delete.
7. **Recent damage is concentrated.** Most "occasional" + "buried"-tier elements were added in 5 commits during the Phase 1-3 sprint (`1755a5f`), the major sprint (`0f8d932`), the NSFW frontend wave (`f10b809`), and the v10.0 mega-commit (`95df7c5`). Pruning these waves' UI footprint is where the largest visual relief lives.

---

## Zone 1 — Top right toolbar

Renderer: `frontends/sakura/src/components/StatusBar.tsx`, called from `ChatThread.tsx:830`.

| Element | File:line | Feature | First commit | Importance | Proposed tier |
|---|---|---|---|---|---|
| chat-threads icon (MessageSquare) | StatusBar.tsx:468–471 | Open session history drawer | `eefa04b` 2026-02-26 | essential | always |
| thread-search (Search) | StatusBar.tsx:473–476 | Search messages in current thread (inline expand) | `e45a1de` 2026-02-26 | common | always |
| global-search (Globe) | StatusBar.tsx:477–485 | Search all characters/sessions | `1755a5f` 2026-02-27 | common | always |
| export (Download) | StatusBar.tsx:487–559 | Export conversation .txt/.md/.json | `e45a1de` 2026-02-26 | occasional | one-click |
| soundscape (Music) | StatusBar.tsx:561–569 | Toggle ambient soundscape player | `38fa6a8` 2026-03-17 | occasional | one-click |
| model-browser (Box) | StatusBar.tsx:570–578 | Open 3D model browser overlay | `95df7c5` 2026-03-05 | occasional | one-click |
| settings (Settings) | StatusBar.tsx:579–587 | Open settings overlay | `6472545` 2026-02-26 | common | always |
| 3D-toggle (Eye + "3D" label) | StatusBar.tsx:588–605 | Toggle 3D character viewer | `517d238` 2026-02-26 | common | always |
| version pill (`v{APP_VERSION}`) | StatusBar.tsx:607–621 | Display version; 5-click → Developer Mode easter egg | `95df7c5` 2026-03-05 | never | buried |

**Notes:**
- **thread-search vs global-search are visually adjacent** (Search vs Globe icons next to each other) — confusing.
- **Export only renders when `onExport` props are passed.** Conditional, but always passed in normal chat → effectively always visible.
- **3D toggle is the only icon with a text label** ("3D"). Visual oddball.
- **Version pill is non-functional UI in 99% of sessions** (developer-mode unlock is invisible). Strong delete candidate; move to Settings → About.

**Tier 2 implication:** Keep visible {chat-threads, settings, 3D-toggle} OR {global-search, settings, 3D-toggle}. **Merge** thread-search into global-search (one search affordance, scope toggle inside). Move {export, soundscape, model-browser} to `⋯` overflow. Move version to Settings.

---

## Zone 2 — Composer (text input + voice + send)

Renderer: `ChatThread.tsx`, input row 1423–1560.

| Element | File:line | Feature | First commit | Importance | Proposed tier |
|---|---|---|---|---|---|
| textarea | ChatThread.tsx:1425–1453 | Compose message text | `21e58a5` 2026-02-26 | essential | always |
| mic (Mic, push-to-talk Whisper) | ChatThread.tsx:1456–1474 | Hold-to-record Whisper | `5b3c2d4` 2026-02-14 | common | always |
| mic-alt (Mic, Web Speech dictation) | ChatThread.tsx:1477–1494 | Web Speech API dictation (Chrome/Edge only — conditional render) | `1755a5f` 2026-02-27 | occasional | one-click |
| voice-mode (Radio) | ChatThread.tsx:1497–1511 | Toggle voice-first auto-send | `8245d95` 2026-02-27 | occasional | one-click |
| phone (Phone, full-duplex) | ChatThread.tsx:1514–1527 | Start full-duplex voice conversation | `dcf5f36` 2026-02-28 | occasional | one-click |
| send (Send / Square cancel) | ChatThread.tsx:1529–1559 | Send / abort streaming | `21e58a5` 2026-02-26 | essential | always |

**Notes:**
- **mic + mic-alt are both `<Mic size={16}/>` icons adjacent.** Same icon, different behavior. Easy to fail to distinguish. Consolidate: drop mic-alt (Web Speech is unreliable; PTT Whisper is the better path) OR put mic-alt behind a long-press menu.
- **send doubles as Cancel during streaming** (icon swaps to `Square`). This is the correct pattern, no change needed.

**Tier 3 implication:** Collapse `{mic-alt, voice-mode, phone}` into a single voice-mode picker popover with a `Mic ▾` chevron next to PTT mic. Surface 1 always-visible voice button instead of 4.

---

## Zone 3 — Composer secondary toolbar (NOT in original inventory)

This is the row above the input that the inventory missed. Always visible.

| Element | File:line | Feature | First commit | Importance | Proposed tier |
|---|---|---|---|---|---|
| Whisper toggle (MessageCircle) | ChatThread.tsx:1277 + ChatModeToggles.tsx:47 | Whisper mode (RP-gated, only when `Style:` ≠ none) | `f10b809` | occasional | conditional (already) |
| QuickFire toggle (Zap) | ChatThread.tsx:1281 + ChatModeToggles.tsx:110 | QuickFire mode (RP-gated) | `f10b809` | occasional | conditional (already) |
| Scenario Library (BookOpen) | ChatThread.tsx:1293 | Opens `scenarios` overlay (global library) | `1755a5f` | occasional | one-click |
| Scenario Picker (Sparkles large) | ChatThread.tsx:1304 | Opens `scenariopicker` (per-character) | `bd7e3dc` | occasional | one-click |
| VN Mode (Tv) | ChatThread.tsx:1315 | Visual Novel reader layout | `b835787` | occasional | one-click |
| Gesture picker (Drama) | ChatThread.tsx:1331 | Inline gesture/expression picker | `0f8d932` | occasional | one-click |
| Director mode (Clapperboard) | ChatThread.tsx:1347 | OOC stage-direction input mode | `0f8d932` | occasional | one-click |
| `Len:` pill | ChatThread.tsx:1366 | Cycles reply length: brief/normal/detailed/auto | `1755a5f` | common | always |
| `Filter:` pill | ChatThread.tsx:1390 | Cycles content filter: Off/18+/SFW | `b127411` | common | always |
| `Style:` pill | ChatThread.tsx:1406 | Cycles RP style: Chat/Light/Full/Explicit | `03d91aa` | common | always |
| TemperatureMeter (hidden) | ChatThread.tsx:1363 | F21 arousal — hardcoded `temperature={0}`, invisible | (n/a) | never | delete-or-defer |

**Notes:**
- **Scenario Library + Scenario Picker = duplicate icons opening duplicate overlays.** This is the single biggest single-merge win in the audit. Recommend Tier 3: collapse to one `Scenarios ▾` button with two list items inside.
- **Two `<Sparkles>` icons in this row** (scenario-picker + RP-style badge). Icon ambiguity.
- **TemperatureMeter is dead UI** — `temperature={0}` hardcoded means it never shows. Either wire F21 or delete the import.
- **5 mode icons (BookOpen, Sparkles, Tv, Drama, Clapperboard) are all "click to open overlay/toggle a mode"** — exactly the cluster that Tier 3 of the plan calls out for collapse into a `⚙ Modes` popover.

**Tier 3 implication:** Replace 5 mode icons with one `⚙ Modes` button → vertical popover listing {Scenarios, VN, Gestures, Director} as toggles with current state. Collapse 3 status pills (`Len`, `Filter`, `Style`) into one segmented `Brief · Off · 18+RP` tri-pill.

---

## Zone 4 — Bond strip / chat header

Renderer: `StatusBar.tsx` (sticky, `z-40`). BondProgressBar inline.

| Element | File:line | Feature | First commit | Importance | Proposed tier |
|---|---|---|---|---|---|
| Avatar (32px circle) | StatusBar.tsx:374–398 | Character identity anchor | `21e58a5` | essential | always |
| Character name | StatusBar.tsx:402–404 | Identity + active session label | `21e58a5` | essential | always |
| Online dot (green pulse) | StatusBar.tsx:405–411 | "Character present" warmth cue | `21e58a5` | common | always |
| Time-of-day badge | StatusBar.tsx:412–428 | Mood slot (afternoon/evening/etc.) | `1755a5f` | occasional | one-click |
| Author's Note badge ("AN") | StatusBar.tsx:429–430 | Active author-note reminder (B4) | `0723c00` | occasional | one-click |
| Streak badge (fire + N) | StatusBar.tsx:431–432 | Daily streak motivation | `ba29996` | common | always |
| Bond tier + level ("Lv23 Devoted") | StatusBar.tsx:433–451 | Bond progression identity | `dcd635f` | common | always |
| Idle phrase ("daydreaming...") | StatusBar.tsx:453–455 | Ambient aliveness | `21e58a5` | common | always |
| Affinity tier text (Devoted/Close/etc.) | StatusBar.tsx:126–142 | Relationship phase label | `7a8ea3b` | common | one-click |
| ♥ Affinity bar | StatusBar.tsx:144–161 | Affinity metric | `7a8ea3b` | common | one-click |
| ✦ Mood bar | StatusBar.tsx:144–161 | Mood metric | `7a8ea3b` | occasional | one-click |
| ◈ Trust bar | StatusBar.tsx:144–161 | Trust metric | `7a8ea3b` | occasional | one-click |
| Interaction count (`N×`) | StatusBar.tsx:163–165 | Total interactions counter | `7a8ea3b` | occasional | buried |
| Affinity sparkline (SVG) | StatusBar.tsx:168–195 | Last-10-msg affinity trend | `1755a5f` | occasional | buried |
| BondProgressBar card | StatusBar.tsx:458–464 + BondProgressBar.tsx:152–255 | Bond XP progress | `604a478` | common | one-click |
| "Next:" unlock teaser line | BondProgressBar.tsx:259–271 | Next unlock motivation | `604a478` | occasional | buried |
| 3D toggle pill | StatusBar.tsx:588–605 | Toggle 3D model panel | `21e58a5` | common | always |

**Notes — corrected diagnosis of the "floating Next: tooltip" bug:**
The "Next:" element is **NOT floating**. It is an inline `<p style="margin:0; fontSize:11px; color: var(--color-text-tertiary)">` rendered as the third child of the BondProgressBar card. No `position: absolute`, no `zIndex`. The actual cause of the chat-overlap symptom: the StatusBar is `position: sticky; z-40`, and BondProgressBar stacks **3 rows** (level-row + XP-bar + "Next:"-line) inside it. The header grows tall, pushing the visible chat content downward beneath. The bug is **header height bloat**, not z-index conflict.

**Tier 1 fix (corrected):** Two options —
- (a) Drop the "Next:" inline line into a hover-only tooltip on the bond pill.
- (b) Drop the per-character bars (♥/✦/◈) into a hover/click-expand panel on the bond pill.
Either reduces the sticky header by 1 row. Both = Tier 4 territory but option (a) is small enough to bundle into Tier 1 as a layout bug fix.

**Tier 4 implication:** Collapse the entire bond display to one inline pill: `▮ Lv 23 · Devoted · 0/150 XP · 48🔥`. Move {3 bars, time-of-day, author's note, sparkline, interaction count, "Next:" teaser} into a hover/click-expand `BondDetail` popover.

---

## Zone 5 — Context budget pill

| Element | File:line | Feature | First commit | Importance | Proposed tier |
|---|---|---|---|---|---|
| Pill button (dot + "1.7k / 262.1k (0.6%)") | ContextBudgetPill.tsx:160–210 | Context window usage display | `95df7c5` | occasional | one-click |
| Expanded breakdown (per-section bars + Compact Now) | ContextBudgetPill.tsx:213–280+ | Manual context compress / debug | `95df7c5` | occasional | buried |

**Anchor:** `ChatThread.tsx:888` — `position: absolute; top:8 right:12 zIndex:50` inside `.flex-1.min-h-0` message-list wrapper.

**Overlap with conversation starters confirmed:** Pill (z:50) + dropdown (z:60) cover the upper-right of the empty-state block. Starters render statically inside `.chat-area` with `minHeight:60vh`, no positioning override → top-right starter is physically behind the pill on first session.

**Tier 1 fix:** Move the pill into the StatusBar right-side icon group (alongside settings/3D toggle) — eliminates absolute positioning + the overlap entirely. Tradeoff: pill is wider than other icons; may need to compress the format to `0.6%` only with hover-tooltip for full numbers.

---

## Zone 6 — Conversation starters

| Element | File:line | Feature | First commit | Importance | Proposed tier |
|---|---|---|---|---|---|
| "Tell me about yourself" | ChatThread.tsx:966–984 | Onboarding prompt shortcut | `8245d95` | common | always |
| "How are you feeling today?" | ChatThread.tsx:966–984 | Onboarding prompt shortcut | `8245d95` | common | always |
| "What do you want to talk about?" | ChatThread.tsx:966–984 | Onboarding prompt shortcut | `8245d95` | common | always |

Hardcoded strings, gated by `showQuickChips` AND empty chat. Fine as-is once Tier 1 moves the pill out of the way.

---

## Zone 7 — Chat-area mid toolbar

(Same as Zone 3 above — agents found these all live in ChatThread.tsx:1273–1420 which is the composer secondary row, not a separate "mid toolbar". Original inventory split this into two zones; reality is one row. Counted once in Zone 3.)

---

## Zone 8 — Sidebar bottom

Renderer: `Sidebar.tsx:339–392` (collapsed) + `407–491` (HelpDropdown).

| Element | File:line | Feature | First commit | Importance | Proposed tier |
|---|---|---|---|---|---|
| Memory (Brain) | Sidebar.tsx:340 | Memory Browser overlay (4 tabs) | `9592dcf` | essential | always |
| Lore (BookMarked) | Sidebar.tsx:341 | Lorebook / World Info | `15a2e19` | common | always |
| Games (Gamepad2) | Sidebar.tsx:342 | Trivia + 20Q mini-games | `c01eb35` | occasional | one-click |
| Stats (BarChart2) | Sidebar.tsx:343 | Bond analytics dashboard | `7323998` | occasional | one-click |
| Ctx (Cpu) | Sidebar.tsx:344 | LLM prompt construction debug | `b4b2529` | occasional | buried (dev tool) |
| Help (HelpCircle, dropdown) | Sidebar.tsx:362 | 3-item dropdown (guides/shortcuts/what's new) | `dcf5f36` | occasional | always |
| NotificationBadge | Sidebar.tsx:362, 388 | Cross-character notifications | (n/a — wrapper) | common | always |

**Notes:**
- **Ctx (Context Viewer) is a developer/power-user debug tool.** Zero regular-user value. Strongest single-element delete candidate from this zone.
- **Stats overlay = Bond analytics, not general app stats.** Naming is misleading.
- **Games (Trivia + 20Q) is non-essential to companion use.** Could move under Help dropdown or delete entirely.

**Tier 5 implication:** Keep visible {Memory, Lore, Help + NotificationBadge}. Move {Games, Stats, Ctx} into a "More tools" expander OR delete Ctx outright (move into Settings → Developer).

---

## Zone 9 — 3D viewer overlay (30+ controls, not 12+)

Renderer: `ModelPanel.tsx` (React) + `viewer.html` (iframe).

| Element | File:line | Feature | First commit | Importance | Proposed tier |
|---|---|---|---|---|---|
| **Camera presets — 6** | | | | | |
| Full | ModelPanel.tsx:579 (rendered :901) | Camera fullbody | `21e58a5` | common | hover-reveal |
| Bust | :580 (:901) | Camera bust/upper | `21e58a5` | common | hover-reveal |
| Face | :581 (:901) | Camera close-up | `21e58a5` | common | hover-reveal |
| 3/4 | :582 (:901) | Camera three-quarter | `21e58a5` | common | hover-reveal |
| Side | :583 (:901) | Camera side profile | `21e58a5` | occasional | hover-reveal |
| Low | :584 (:901) | Camera low angle | `21e58a5` | occasional | hover-reveal |
| Camera reset (↺) | ModelPanel.tsx:984 | Reset camera | `21e58a5` | occasional | hover-reveal |
| Save custom (★) | ModelPanel.tsx:965 | Save custom slot | `1755a5f` | occasional | buried |
| Custom slots (View 1–5) | ModelPanel.tsx:925 | Restore saved camera | `1755a5f` | occasional | buried |
| **Interaction hints — 4 (rendered IN viewer.html, no React control)** | | | | | |
| L-Drag hint | viewer.html:7820 | Orbit hint (25% opacity always) | `90858f1` | first-time | inactivity-fade |
| Scroll hint | viewer.html:7821 | Zoom hint | `90858f1` | first-time | inactivity-fade |
| R-Drag hint | viewer.html:7822 | Pan hint | `90858f1` | first-time | inactivity-fade |
| Ctrl+0 hint | viewer.html:7823 | **STALE — actual reset is double-click** | `90858f1` | never | delete |
| **Bottom bar — 6** | | | | | |
| Close | ModelPanel.tsx:1013 | Toggle 3D panel off | `21e58a5` | essential | always |
| Back to Chat (top bar) | ModelPanel.tsx:667 | **DUPLICATE of Close** | `21e58a5` | essential | delete one |
| Models | ModelPanel.tsx:1028 | Open Model Browser | `95df7c5` | occasional | one-click |
| Photo | ModelPanel.tsx:1047 | Photo Mode overlay | `5aef474` | occasional | one-click |
| Floating chat (MessageSquare) | ModelPanel.tsx:1066 | Toggle FloatingComposer | `984d9f3` | occasional | one-click |
| Screenshot (Camera right) | ModelPanel.tsx:1084 | Capture viewport PNG | `1755a5f` | occasional | one-click |
| Hide/Show controls (Eye/EyeOff) | ModelPanel.tsx:1106 | Toggle all controls visibility | `984d9f3` | occasional | one-click |
| Show controls rescue pill | ModelPanel.tsx:1126 | Recover after hiding | `984d9f3` | conditional | always (when hidden) |
| **Status badges — 5 (top corners)** | | | | | |
| FPS badge | ModelPanel.tsx:789 | Live frame rate | `1755a5f` | occasional | inactivity-fade |
| Motion backend badge (Proc/AI/GPU) | ModelPanel.tsx:810 | Click → GPU server wizard | `8245d9` | occasional | buried |
| Emotion badge | ModelPanel.tsx:829 | Active character emotion | `5b3c2d4` | occasional | inactivity-fade |
| Tool protocol badge (OpenAI/XML) | ModelPanel.tsx:842 | LLM tool-calling mode | `083f0ae` | never | delete |
| Expression editor toggle (Sliders) | ModelPanel.tsx:869 | Open VRM blend shape editor | `77de4cb` | occasional | one-click |
| **Collapsible side panels — 4+** | | | | | |
| Spring Bones panel | SpringBonePanel.tsx (rendered :1151) | VRM physics tuning | `95df7c5` | occasional | buried |
| Visual Effects panel | EffectsPanel.tsx (:1155) | Bloom, color grading, particles | `95df7c5` | occasional | buried |
| Animation Library | AnimationBrowser.tsx (:1159) | Browse/play clip animations | `95df7c5` | occasional | buried |
| Morph Targets (GLB only) | ModelPanel.tsx:1165 | GLB blend shape sliders | `1755a5f` | occasional | buried |
| Remote GPU Wizard | ModelPanel.tsx:1219 | Connect Win GPU server | `8245d9` | occasional | buried |
| Expression Editor drawer | ModelPanel.tsx:1424 | VRM blend shape sliders + presets | `77de4cb` | occasional | buried |

**Notes:**
- **Ctrl+0 hint is wrong.** Actual reset shortcut is double-click on canvas (viewer.html:321). Either fix label to "dbl-click" or delete the hint.
- **Hint pills currently never auto-dismiss.** Permanently visible at 25% opacity. Recommend 5-second inactivity fade to opacity:0 with `transition: opacity 1s`. Re-show on next hover or after `localStorage.lastViewerOpen > 24h`.
- **Two duplicate Close controls** — "Back to Chat" (top) and "Close" (bottom). Delete the bottom one; "Back to Chat" is more discoverable (text label) and stays visible regardless of `controlsVisible` state.
- **Tool protocol badge** (OpenAI/XML mode) — pure debug, zero user value. Delete and surface in Settings → Developer if anyone needs it.
- **Status badges (FPS, Emotion, Motion backend) all clutter top corners simultaneously.** Recommend single condensed `STATUS` pill in one corner that expands on hover to show all 4 metrics. Or push them to a `~` debug overlay key.

**Tier 6 implication (ratifies plan):**
- Camera presets → single floating `📷 Camera ▾` button → horizontal preset bar on hover/click
- Hint pills → 5s inactivity fade
- Spring Bones / Effects / Animation / Morph / GPU Wizard → all collapse into one `⚙ Settings` popover (drawer on the right edge)
- {FPS, Emotion, Motion backend, Tool protocol} → consolidate into one status pill OR move to dev overlay
- Photo / Models / Floating Chat / Screenshot / Hide controls → keep visible as bottom bar (5 buttons, manageable)
- **Delete:** duplicate Close, Tool protocol badge, Ctrl+0 hint label

---

## Master "delete or move" recommendations (free wins, no design needed)

These can ship as part of Tier 1 or Tier 2 without changing any visual design language:

| What | Action | Tier | Effort |
|---|---|---|---|
| Version pill in top toolbar | Move to Settings → About | Tier 2 | trivial |
| `Back to Chat` (top of 3D panel) OR `Close` (bottom) | Delete one (recommend bottom) | Tier 6 prep | trivial |
| Ctrl+0 hint in viewer.html | Delete or fix label to "dbl-click" | Tier 1 | trivial |
| TemperatureMeter (hardcoded `temperature={0}`) | Delete import or wire F21 | Tier 1 | trivial |
| Tool protocol badge (OpenAI/XML) | Delete; move to Settings → Developer | Tier 6 prep | trivial |
| Ctx (Cpu) sidebar icon | Move to Settings → Developer | Tier 5 | trivial |
| `mic-alt` (Web Speech) duplicate Mic icon | Drop or behind long-press menu on PTT mic | Tier 3 | small |

These together = ~7 elements removed from always-visible surface with zero UX risk and zero new design.

---

## Visibility-tier rollup (counts)

Sum across all 9 zones (de-duplicated; conditional/dead UI excluded):

| Tier | Count today | Count post-redesign target |
|---|---|---|
| always | ~24 elements | ~14 |
| one-click | ~14 | ~16 |
| hover-reveal / inactivity-fade | 0 | ~10 |
| buried (settings) | ~12 | ~22 |
| **Total visible at rest** | **~24 always + ~5 hint** = **~29** | **~14 always + 0 hint** = **~14** |

Target: roughly halve always-visible HUD element count, push the rest behind hover/click/settings.

---

## Tier escalation map (which audit findings drive which tier)

| Tier | Findings that drive it | Audit-supported "stop condition" |
|---|---|---|
| **Tier 1** (bug fixes) | Pill overlap (Zone 5), header height bloat misdiagnosed (Zone 4 notes), Ctrl+0 stale label (Zone 9), TemperatureMeter dead UI (Zone 3) | Bugs gone. Still busy → continue. |
| **Tier 2** (top toolbar) | 9-element top bar (Zone 1), version pill never used | Top bar drops 9 → 4. Single biggest peak-screen relief. |
| **Tier 3** (chat-area mid) | 8 always-visible secondary-row items (Zone 3), Scenario Library + Picker duplication, 5 mode icons clustered, 3 status pills clustered | Composer area drops 8 → 4. |
| **Tier 4** (bond strip) | Header has 17 elements stacked across 4 rows (Zone 4), affinity bars + sparkline + interaction count are debug-tier | Header collapses to 1 line. **First "frontend-design" preview tier** — generate 3 variants, user picks. |
| **Tier 5** (sidebar) | Ctx is dev-only, Games/Stats are occasional (Zone 8) | Sidebar drops 6 → 3 + expander. |
| **Tier 6** (3D viewer) | 30+ controls (Zone 9), 4 hint pills never fade, 5 status badges, 6 collapsible panels open by default, duplicate Close | Avatar visible, not chrome. **Second "frontend-design" preview tier.** |
| **Tier 7** (density toggle) | Three modes need visual previews to set defaults | **Third "frontend-design" preview tier.** |
| **Tier 8** (full IA redesign) | Only if all above insufficient | n/a |

---

## Where `frontend-design` skill (browser preview) fits

Per session-19 directive: use the superpowers `frontend-design` skill at visual-decision tiers, not as a separate tier.

- **Tier 1, 2, 3, 5:** SKIP. One right answer per element. Mechanical / data-driven.
- **Tier 4 (bond strip):** USE. Pill format + bar style + streak placement have aesthetic tradeoffs. Generate 3 sandbox HTML variants, side-by-side preview, user picks A/B/C, implement chosen.
- **Tier 6 (viewer overlay):** USE. Camera preset bar layout, hover behavior, settings drawer position have aesthetic tradeoffs.
- **Tier 7 (density modes):** USE. Cozy/Standard/Minimal need visual reference points to set defaults sensibly.

---

## Surprises uncovered (not in original plan)

1. **Composer secondary row was missed entirely** — adds 8 always-visible elements that the bug doc didn't account for. The "cramped" feeling is worse than the screenshot-counted 45.
2. **Bond bug root cause is height, not z-index.** The Tier 1 fix needs a 1-row removal from the bond card, not a position/z-index change.
3. **3D viewer is 30+ elements, more than 2× the inventory count.** Tier 6's effort estimate (3-4h) likely undershoots. Recommend revising upward to 6-8h.
4. **Inventory said "book/lore" toolbar icon — there is none.** Lorebook only lives in sidebar. The `BookOpen` icon in the toolbar opens Scenario Library. Bug doc and plan should be corrected.
5. **Two duplicate Close controls in viewer.** Free 1-element deletion.
6. **Ctrl+0 hint label is wrong** — actual reset is double-click. User-visible incorrect documentation.

---

## Recommended Tier 1 scope (revised based on audit)

Original Tier 1 = "fix overlapping tooltip + context-pill overlap". Revised Tier 1 (still ~30-45 min, all bug fixes):

1. **Move ContextBudgetPill** from `position:absolute top:8 right:12 z:50` (`ChatThread.tsx:888`) into the StatusBar right-side icon group. Eliminates the conversation-starter overlap entirely. Compress format to `0.6%` with hover tooltip for full numbers if width is a concern.
2. **Delete the inline "Next:" line** from BondProgressBar (`BondProgressBar.tsx:259–271`). Move to a hover tooltip on the bond pill. Reduces sticky header by 1 row → chat content shifts up.
3. **Delete or fix Ctrl+0 hint** in viewer.html:7823 — change to "dbl-click" or remove the line entirely.
4. **Delete TemperatureMeter import** from `ChatThread.tsx:1363` — currently dead UI (`temperature={0}` hardcoded).
5. **Delete duplicate "Close" button** from 3D viewer bottom bar (`ModelPanel.tsx:1013`). Keep "Back to Chat" in top bar (more discoverable).

All 5 are pure deletes/moves. Total LOC delta: ~50 lines removed, ~10 added. No new design, no theme work, no behavior change. Single commit.

---

## Methodology notes

- 4 parallel `codebase-analyst` agent dispatches, one per zone group
- All elements traced via `git log -S "<unique-string>"` or `git log --diff-filter=A -- <file>`
- Read-only — zero file modifications during audit
- Importance ranking is heuristic (essential / common / occasional / never) based on element name + feature served, not telemetry
- Visibility tier is a recommendation, not a binding decision — chris reviews and marks green/yellow/red before Tier 1 begins

---

## Gate

Per plan: chris reviews this audit table. Mark green / yellow / red on each proposed visibility tier and on each "delete or move" recommendation. The marked-up version becomes the source of truth for Tiers 1–6.

Stop condition (per plan): if chris reads this and says "just delete X, Y, Z and we're done", we go straight to a small delete-only commit and skip the rest of the ladder.

If chris says "proceed to Tier 1", I run the revised 5-item Tier 1 scope above.
