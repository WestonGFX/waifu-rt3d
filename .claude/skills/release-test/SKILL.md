---
name: release-test
description: >
  Full release-readiness testing via real browser interaction. Claude uses
  Chrome computer-use to interact with the app as different user personas
  (new user, power user, chaos tester), evaluating both functionality and
  UX quality. Generates a comprehensive report with screenshots and GIFs.
  Use --major for full testing, --minor for targeted regression scan.
user_invocable: true
---

# Release Test — Human-Like Browser Acceptance Testing

Claude becomes a real user of the app, interacting through Chrome computer-use
to test functionality, catch bugs, and evaluate UX quality.

## Modes

| Flag | When to Use | Duration | What It Does |
|------|-------------|----------|-------------|
| `--major` | Major version releases, large feature completions | 30-60 min | Full 6-phase persona-based exploratory testing |
| `--minor` | Minor releases, small feature additions | 10-15 min | Git-diff targeted regression scan + quick visual check |
| `--quick` | Sanity check after refactors | 5 min | Screenshot key screens, check for obvious breaks |
| *(no flag)* | Default | — | Prompts which mode to use |

Parse the flag from ARGUMENTS. If no flag, ask the user which mode they want.

---

## Prerequisites Check (ALL modes)

Before ANY testing, verify the app is running. Run these in parallel:

1. `curl -s http://localhost:8080/api/health` — backend must return `{"ok": true}`
2. `curl -s http://localhost:5175/sakura/ -o /dev/null -w "%{http_code}"` — frontend must return 200

**If either fails:**
```
Release Test BLOCKED — App not running.
Start backend:  ./run.sh
Start frontend: cd frontends/sakura && npx vite --port 5175
Then re-run /release-test
```

Also run automated checks in parallel:
3. `.venv/bin/python -m pytest backend/tests/ -q --tb=line 2>&1 | tail -3`
4. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit 2>&1 | tail -3`

**If tests or TSC fail, STOP.** Fix automated issues before browser testing.

---

## Report Setup

Create the report file immediately after prerequisites pass:

```
docs/testing/release-test-YYYY-MM-DD.md
docs/testing/release-screenshots/   (mkdir -p)
```

Initialize the report with this header:

```markdown
# Release Test Report — vX.Y.Z

**Date:** YYYY-MM-DD
**Tester:** Claude Code (Opus 4.6, computer-use)
**Mode:** major / minor / quick
**App Version:** (read from /api/health response)
**Branch:** (git branch --show-current)
**Schema:** vNN
**Automated Tests:** XXXX passed, TSC clean

## Summary Table
| Phase | Pass | Fail | Warn | Notes |
|-------|------|------|------|-------|
| (filled in as testing progresses) |

## Issues Found
(filled in as testing progresses)
```

---

## Browser Setup

Load Chrome MCP tools using ToolSearch before starting:
1. `select:mcp__claude-in-chrome__tabs_context_mcp`
2. `select:mcp__claude-in-chrome__tabs_create_mcp`
3. `select:mcp__claude-in-chrome__navigate`
4. `select:mcp__claude-in-chrome__computer`
5. `select:mcp__claude-in-chrome__read_page`
6. `select:mcp__claude-in-chrome__javascript_tool`
7. `select:mcp__claude-in-chrome__read_console_messages`
8. `select:mcp__claude-in-chrome__gif_creator`
9. `select:mcp__claude-in-chrome__get_page_text`
10. `select:mcp__claude-in-chrome__resize_window`

Then:
1. Call `tabs_context_mcp` to see existing tabs
2. Create a new tab with `tabs_create_mcp`
3. Navigate to `http://localhost:5175/sakura/`
4. Take an initial screenshot with `computer` tool (action: screenshot)

**IMPORTANT:** Use the `computer` tool for ALL interactions — clicking, typing,
scrolling, taking screenshots. This provides true pixel-level computer use.

---

## --quick MODE (5 minutes)

Fast sanity check. Take screenshots of 5 key screens and check for obvious breaks:

1. **Main chat view** — screenshot, check layout is intact
2. **Settings modal** (Ctrl+,) — screenshot, verify it opens
3. **Theme switch** — toggle to a dark theme, screenshot
4. **Character switch** — select a different character, screenshot
5. **Console check** — `read_console_messages` for uncaught errors

Report: List any visual breaks or console errors. If clean, report "Quick check passed."

---

## --minor MODE (10-15 minutes)

Targeted regression scan based on what changed since last release.

### Step 1: Identify Changed Areas

```bash
git diff --name-only HEAD~10  # or since last tag
```

Map changed files to affected feature areas:

| Changed File Pattern | Test Area |
|---------------------|-----------|
| `backend/server.py` | API responses, chat flow |
| `backend/llm/*` | Chat quality, context assembly |
| `backend/mood/*` | Character mood display |
| `backend/voice/*` | Voice pipeline |
| `frontends/sakura/src/stores/*` | State management, all features |
| `frontends/sakura/src/views/ChatThread*` | Chat UI, composer, messages |
| `frontends/sakura/src/views/Settings*` | Settings modal |
| `frontends/sakura/src/components/Sidebar*` | Navigation, character list |
| `frontends/sakura/src/components/*Overlay*` | Overlay panels |
| `frontends/shared/viewer/*` | 3D viewer, model display |
| `backend/preflight.py` | Database schema, data integrity |
| Any CSS/theme file | Visual consistency |

### Step 2: Test Only Affected Areas

For each affected area, perform a focused browser test:
1. Navigate to the feature
2. Perform 3-5 key interactions
3. Take a screenshot
4. Check console for errors
5. Record pass/fail in report

### Step 3: Quick Visual Spot-Check

Regardless of what changed, always do these:
1. App loads without errors
2. Chat input works (type + send)
3. Theme is applied correctly
4. No obvious layout breaks

Report: Focused findings with screenshots of affected areas only.

---

## --major MODE (30-60 minutes)

Full persona-based exploratory testing. This is the real deal.

### CRITICAL TESTING MINDSET

You are NOT following a test script. You are BEING a user. At each step:
- Look at the screen and react to what you SEE
- If something looks wrong, investigate it
- If something is confusing, that IS a bug (UX bug)
- If something delights you, note it (positive feedback matters too)
- Take screenshots liberally — they're evidence

### Phase 1: First Impressions (New User "Alex") — 5 min

**Persona:** You've never seen this app before. You just downloaded it.
You don't know what any button does. You're curious but impatient.

**Approach:**
1. Look at the initial screen. What stands out? What's confusing?
2. Try the most obvious action — what would a new user do first?
3. Can you figure out how to chat without reading docs?
4. Can you find the settings?
5. Is there any onboarding or guidance?
6. What's the first thing that feels "off" or unintuitive?

**Evaluate and record:**
- [ ] First-load visual impression (1-5 rating)
- [ ] Time to first successful chat message
- [ ] Discoverability of key features (settings, characters, themes)
- [ ] Any confusion points or dead ends
- [ ] Console errors on first load

**Screenshots:** `first-load.png`, `first-chat.png`, `first-confusion.png` (if any)

### Phase 2: Core Workflows (Daily User "Sam") — 10 min

**Persona:** You use this app every day. You have a favorite character.
You know the basics but don't use every feature. Speed matters to you.

**Test these flows end-to-end:**

**Flow A: Chat Conversation**
1. Select a character from the sidebar
2. Type a message and send it
3. Wait for and read the response
4. Send a follow-up message
5. Try the toolbar controls (reply length, RP style, content filter)
6. Test message hover actions (regenerate, reactions)

**Flow B: Character Management**
1. Switch to a different character
2. Check that chat history changes
3. Open Settings > Character tab
4. Verify character info displays correctly

**Flow C: Customization**
1. Open Settings (Ctrl+,)
2. Navigate through each tab — do they all render?
3. Change the theme
4. Close settings — does the theme persist?
5. Reopen settings — is the change saved?

**Flow D: Panel Management**
1. Toggle the sidebar (Ctrl+\)
2. Toggle the model/viewer panel
3. Resize the divider between panels
4. Collapse and expand the right panel

**Evaluate and record:**
- [ ] All 4 flows complete without errors
- [ ] State persistence (theme, panel positions, selected character)
- [ ] Response times feel snappy (< 1s for UI, LLM streaming starts within 3s)
- [ ] No layout shifts or visual glitches during interactions

**Screenshots:** Each flow at key steps. **GIF:** Record the chat send+response flow.

### Phase 3: Feature Depth (Power User "Morgan") — 10 min

**Persona:** You use every feature. You know all the keyboard shortcuts.
You expect things to work and get annoyed when they don't.

**Test all overlays — open each one, verify it renders, close it:**

Use keyboard shortcuts where available. For each overlay:
1. Open it (shortcut or button)
2. Verify content renders (not empty/blank)
3. Interact with one element inside it
4. Close it (Escape or close button)
5. Verify the main app is back to normal

**Priority overlays (test these carefully):**
- Memory Browser (Ctrl+M)
- Global Search (Ctrl+K)
- Analytics Panel (Alt+A)
- Settings Modal (Ctrl+,) — all 10 tabs
- Scenario Library
- Photo Mode (Ctrl+Shift+P)

**Other overlays (open/close check is sufficient):**
- Vocabulary Manager, Session Summary, Diary, Stats/Timeline
- Schedule, MoodBoard, Model Arena, Character Portfolio
- Session Replay, Relationship Web, Universe/Lore panels
- All NSFW overlays (if content filter allows)
- Game Panel + at least 1 mini-game

**Test keyboard shortcuts:**
Run through at least 15 keyboard shortcuts. Check for:
- Conflicts (two shortcuts opening the same thing)
- Dead shortcuts (nothing happens)
- Shortcuts that open something but Escape doesn't close it

**Evaluate and record:**
- [ ] All overlays open and close cleanly
- [ ] No overlay leaves a broken state behind
- [ ] Keyboard shortcuts work as documented
- [ ] No focus traps (can always Escape back to main app)

**Screenshots:** Any overlay that looks broken. Skip screenshots for ones that work fine.

### Phase 4: Stress Testing (Chaos User "Jordan") — 5 min

**Persona:** You're trying to break things. You click fast, submit garbage,
and do things in unexpected orders.

**Stress tests:**

1. **Rapid clicking:** Click the same button 10 times fast
   - Send button, theme toggle, sidebar items, overlay toggles
   - Check: No duplicate submissions, no UI freezes

2. **Empty/invalid input:**
   - Send empty message (should be blocked)
   - Send very long message (1000+ chars) — does it render?
   - Paste special characters, emoji, HTML tags into chat

3. **State corruption:**
   - Open settings, switch character without closing settings
   - Open two overlays in quick succession
   - Toggle theme while an overlay is open
   - Resize window while typing a message

4. **Navigation stress:**
   - Switch characters rapidly (click 5 different characters in 2 seconds)
   - Open and close the sidebar 5 times fast
   - Toggle between layout modes quickly

5. **Recovery:**
   - After all the above chaos, can you still:
     - Send a normal message?
     - Open settings?
     - Switch themes?
     - The app is in a usable state?

**Evaluate and record:**
- [ ] No JS errors from rapid interactions
- [ ] No frozen/unresponsive UI
- [ ] App recovers gracefully from all stress tests
- [ ] No duplicate API calls from rapid clicking

**Screenshots:** Any broken states. **GIF:** Record the rapid-click test if it causes issues.

### Phase 5: Visual & UX Audit (Inspector "Reese") — 5 min

**Persona:** You're a UI designer reviewing the app for visual polish.
You care about consistency, spacing, typography, and "feel."

**Theme audit:**
1. Switch to 3 different light themes — screenshot each
2. Switch to 3 different dark themes — screenshot each
3. Check for:
   - Unreadable text (low contrast)
   - Inconsistent colors (elements that don't match the theme)
   - Hardcoded colors that don't change with theme

**Layout audit:**
1. Resize window to 1920x1080 — screenshot
2. Resize to 1440x900 — screenshot
3. Resize to 1280x720 — screenshot
4. Check for:
   - Overflow/clipping
   - Broken layouts
   - Content that disappears

**Animation/transition audit:**
1. Open/close sidebar — smooth transition?
2. Open/close overlays — smooth?
3. Send a message — streaming animation smooth?
4. Switch themes — transition or jarring snap?

**Typography audit:**
1. Long character names — truncated or overflowing?
2. Long messages — word wrap correct?
3. Empty states — helpful or confusing?

**Evaluate and record:**
- [ ] Theme consistency across light and dark variants
- [ ] Layout integrity at common resolutions
- [ ] Animations are smooth (no janky transitions)
- [ ] Typography handles edge cases (long text, empty states)

**Screenshots:** Every theme tested, every resolution tested.

### Phase 6: Console & Network Audit — 3 min

**Finish by checking under the hood.**

1. **Console errors:** Use `read_console_messages` with pattern for "error" and "Error"
   - Categorize: Critical (uncaught exception) vs Warning (missing resource) vs Noise
   - Note which user action triggered each error

2. **Network failures:** Use `read_network_requests` to check for:
   - 404 responses (missing resources)
   - 500 responses (server errors)
   - Failed requests (timeouts, connection refused)

3. **Memory check (if possible):**
   - Use `javascript_tool` to run `performance.memory` (Chrome only)
   - Note JS heap size — is it reasonable?

**Evaluate and record:**
- [ ] No uncaught exceptions
- [ ] No 500 errors
- [ ] 404s documented (may be expected for missing portraits)
- [ ] No memory warnings

---

## Report Finalization (ALL modes)

After testing is complete, finalize the report:

### 1. Fill in Summary Table

```markdown
## Summary Table
| Phase | Pass | Fail | Warn | Notes |
|-------|------|------|------|-------|
| First Impressions | X | Y | Z | ... |
| Core Workflows | X | Y | Z | ... |
| Feature Depth | X | Y | Z | ... |
| Stress Testing | X | Y | Z | ... |
| Visual/UX | X | Y | Z | ... |
| Console/Network | X | Y | Z | ... |
| **TOTAL** | **X** | **Y** | **Z** | |
```

### 2. Categorize All Issues

```markdown
## Critical Issues (MUST FIX before release)
Functional breakage, data loss, crashes, security issues.

## Major Issues (SHOULD FIX before release)
Features that don't work, significant UX problems, broken workflows.

## Minor Issues (FIX in next cycle)
Cosmetic issues, edge cases, non-critical UX rough edges.

## UX Observations (NOT BUGS — design feedback)
Things that work but could be better. Confusing flows, missing affordances.

## Positive Observations
Things that work particularly well. Delightful moments. Good UX.
```

### 3. Release Verdict

```markdown
## Verdict

**READY FOR RELEASE** — No critical or major issues found.
OR
**NOT READY** — N critical, M major issues must be fixed first.
OR
**CONDITIONAL** — Ready if [specific issues] are accepted as known issues.
```

### 4. Issue Tracking

For each Critical and Major issue, create a one-line entry:

```markdown
## Fix Checklist
- [ ] [CRITICAL] Description — file:line
- [ ] [MAJOR] Description — file:line
```

---

## Hard Rules

- **ALWAYS use Chrome MCP `computer` tool for interactions.** This is real computer-use testing.
- **NEVER skip the prerequisites check.** No testing with a broken backend.
- **NEVER fabricate test results.** If you can't test something, say so.
- **ALWAYS take screenshots as evidence.** Screenshots are proof.
- **Record GIFs for complex interactions** (chat flow, rapid clicking issues).
- **Check console after EVERY phase** (not just Phase 6).
- **Do NOT fix bugs during testing.** Document them. Fix later.
- **Do NOT add test assertions to the codebase.** This is exploratory, not automated.
- **Save the report to disk** before reporting to the user.
- **If the app crashes or freezes**, document exactly what caused it, restart, and continue.

## Anti-Patterns to Watch For (Specific to Waifu-RT3D)

These have regressed 10+ times. Pay EXTRA attention:
- Avatar aspect ratio / grounding — model looks squished or floating
- Column resize / layout reflow — panels break when toggled
- Theme color inheritance — hardcoded colors that don't match theme
- Surprise UI elements — pull tabs, dividers, badges that shouldn't be there
- Chat input width — has been as narrow as 40px (P0 bug, fixed but watch for regression)
- Help dropdown soft-lock — overlay that blocks all interaction
- Settings modal tab rendering — tabs that show blank content
- Focus traps — overlays that capture keyboard and don't release on Escape
