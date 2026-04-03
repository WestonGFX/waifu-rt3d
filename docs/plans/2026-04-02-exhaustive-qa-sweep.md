# Exhaustive QA Browser Testing Sweep

**Date:** 2026-04-02
**Branch:** master
**Schema:** v65
**Goal:** Manually test every interactive element in the Sakura frontend using Playwright browser automation, with screenshots as proof and a comprehensive QA report.

---

## Context

The user performed a QA sweep using `docs/testing/qa-questionnaire.html` and found **TONS of issues**. We need to:
1. Systematically test every button, toggle, overlay, setting, and interaction
2. Take screenshots at every step for proof
3. Document exactly what was tested, what was observed, pass/fail status
4. Create a comprehensive QA report markdown file
5. Then triage and fix all issues found

## Approach: Playwright Browser Automation

Using Playwright (already configured in the project) rather than Chrome MCP because:
- Built-in `screenshot()` API with named files
- Already has project config (`frontends/sakura/playwright.config.ts`)
- Programmatic control over clicks, scrolls, resizes, keyboard input
- Can run against the real app (no mocks) for authentic testing

## Prerequisites

1. Start backend: `./run.sh` (port 8080)
2. Start frontend: `cd frontends/sakura && npx vite --port 5175`
3. Ensure at least 1 character exists in the database
4. Create screenshot output directory: `docs/testing/qa-screenshots/`
5. Create QA report file: `docs/testing/qa-report-2026-04-02.md`

## Test Phases (16 Phases, ~400 test cases)

### Phase 1: App Startup & Initial State
- [ ] App loads at localhost:5175/sakura/ without errors
- [ ] Console has no critical errors (warnings OK)
- [ ] Sidebar renders with character list
- [ ] Welcome screen shows when no character selected
- [ ] Status bar shows LLM connection status
- [ ] Screenshot: initial-state.png

### Phase 2: Sidebar & Navigation
- [ ] Sidebar sections switch: Chats → Characters → Create
- [ ] Character list loads and shows all characters
- [ ] Clicking a character selects it and loads chat
- [ ] Sidebar collapse/expand (Ctrl+\)
- [ ] Sidebar width is correct (280px)
- [ ] Help dropdown opens from sidebar header
- [ ] Screenshot: sidebar-sections.png, sidebar-collapsed.png

### Phase 3: Chat Composer & Message Sending
- [ ] Chat input renders and accepts text
- [ ] Send button enabled when text present
- [ ] Send button disabled when empty
- [ ] Draft persistence (type text, switch character, switch back)
- [ ] Quick-reply chips appear and are clickable
- [ ] Message sends and appears in chat thread
- [ ] Streaming response renders token-by-token
- [ ] Cancel button appears during generation
- [ ] Screenshot: chat-composer.png, message-sent.png

### Phase 4: Chat Toolbar Controls
- [ ] Reply Length cycles: Brief → Normal → Detailed → Auto
- [ ] Content Filter cycles: Off → NSFW → SFW
- [ ] RP Style cycles: Chat → Light RP → Full RP → Explicit RP
- [ ] VN Mode toggle works
- [ ] Gesture & Expression Picker opens
- [ ] Director Mode toggle works
- [ ] Scenario Library button opens overlay
- [ ] Whisper Mode toggle (if bond level sufficient)
- [ ] QuickFire Mode toggle (if bond level sufficient)
- [ ] Temperature Meter displays
- [ ] Screenshot: toolbar-controls.png, each cycle state

### Phase 5: Message Interactions
- [ ] Message hover shows action buttons
- [ ] Regenerate button works
- [ ] Copy button copies to clipboard
- [ ] Delete button removes message (with confirmation?)
- [ ] Edit button on user messages opens inline editor
- [ ] Branch/Fork creates alternate path
- [ ] Emoji reaction picker opens and reacts
- [ ] Screenshot: message-actions.png

### Phase 6: Settings Modal — All 10 Tabs
- [ ] Settings opens (Ctrl+,)
- [ ] **General tab**: Layout mode, keyboard shortcuts editor, theme picker, quick-chips config
- [ ] **Character tab**: Portrait, name, greeting, persona fields render and save
- [ ] **Brain tab**: LLM provider dropdown, model selector, system prompt, sampling params (temp, top_p, etc.)
- [ ] **Voice tab**: TTS/STT provider, model picker, voice samples
- [ ] **Safety tab**: Content filtering toggles, boundary settings
- [ ] **Intimacy tab**: Jealousy slider, power dynamics, spontaneity, time features
- [ ] **AI Art tab**: Image gen provider, model settings
- [ ] **System tab**: Storage info, logs, cache, dev mode toggle
- [ ] **TTS Models tab**: Model browser/installer renders
- [ ] **LM Models tab**: Language model browser renders
- [ ] Settings tier toggle (Normal → Advanced → Developer) changes visible fields
- [ ] Settings changes persist after close/reopen
- [ ] Screenshot: every tab individually

### Phase 7: Overlays & Panels (36 types)
Test every overlay opens, renders content, and closes cleanly:
- [ ] Memory Browser (Ctrl+M)
- [ ] Vocabulary Manager (Alt+V)
- [ ] Analytics Panel (Alt+A)
- [ ] Session Summary (Alt+S)
- [ ] Diary Panel
- [ ] Stats/Timeline
- [ ] Schedule
- [ ] Global Search (Ctrl+K)
- [ ] Scenario Library
- [ ] MoodBoard Editor
- [ ] Model Arena
- [ ] Character Portfolio
- [ ] Session Replay (Alt+R)
- [ ] Relationship Web
- [ ] Universe Panel
- [ ] Lore Panel
- [ ] User Knowledge
- [ ] Context Viewer (Alt+C or similar)
- [ ] Model Browser
- [ ] Photo Mode (Ctrl+Shift+P)
- [ ] Gallery (Ctrl+Shift+G)
- [ ] Compression Preview Modal
- [ ] NSFW: Intimate Scenario Browser
- [ ] NSFW: Desire Tree (Alt+Shift+D)
- [ ] NSFW: Fantasy Journal
- [ ] NSFW: Milestone Timeline (Alt+Shift+M)
- [ ] NSFW: Intimate Memory Browser
- [ ] NSFW: Scene Bookmarks (Alt+Shift+K)
- [ ] NSFW: Intimate Gallery
- [ ] NSFW: Love Letter Modal
- [ ] NSFW: Audio Story Player
- [ ] NSFW: Intimate Quiz
- [ ] NSFW: Shared Fantasy Builder
- [ ] NSFW: Persona Picker
- [ ] NSFW: Scene Replay Viewer
- [ ] Game Panel
- [ ] Screenshot: every overlay

### Phase 8: Keyboard Shortcuts (30+)
Test every shortcut fires correctly:
- [ ] Ctrl+, → Settings
- [ ] Ctrl+M → Memory Browser
- [ ] Ctrl+K → Quick Search
- [ ] Ctrl+\ → Toggle Sidebar
- [ ] Ctrl+I → Cinematic Mode
- [ ] Ctrl+Shift+P → Photo Mode
- [ ] Ctrl+Shift+G → Gallery
- [ ] Ctrl+Shift+S → Quick Capture
- [ ] Ctrl+Shift+V → Voice Mode
- [ ] ? → Shortcut Help Modal
- [ ] Escape → Close current overlay
- [ ] Alt+V → Vocabulary
- [ ] Alt+A → Analytics
- [ ] Alt+S → Session Summary
- [ ] Alt+R → Session Replay
- [ ] Alt+Shift+K → Bookmarks
- [ ] Alt+Shift+M → Milestones
- [ ] Alt+Shift+D → Desire Tree
- [ ] All other registered shortcuts
- [ ] No shortcut conflicts (two shortcuts for same key combo)
- [ ] Screenshot: shortcut-help-modal.png

### Phase 9: Theme Switching (18 themes)
- [ ] Switch through all 9 light themes — verify colors apply
- [ ] Switch through all 9 dark themes — verify colors apply
- [ ] Theme persists after page reload
- [ ] No broken colors or unreadable text in any theme
- [ ] Screenshot: 2-3 representative themes

### Phase 10: Layout Modes & Special Modes
- [ ] Chat-first layout
- [ ] Model-first layout
- [ ] Split layout
- [ ] Cinematic mode (Ctrl+I) — hides sidebar, full-screen
- [ ] VN (Visual Novel) mode — portrait + textbox
- [ ] Normal / Compact / Mobile layout modes
- [ ] Window resize behavior (drag to resize)
- [ ] Model panel collapse/expand
- [ ] Screenshot: each layout mode

### Phase 11: Mini-Games (9 games)
- [ ] Game Panel opens
- [ ] Memory Match launches and plays
- [ ] Hangman launches and plays
- [ ] Trivia launches and plays
- [ ] Riddles launches and plays
- [ ] Word Association launches and plays
- [ ] Chess launches and plays
- [ ] Tic-Tac-Toe launches and plays
- [ ] 20 Questions launches and plays
- [ ] Game celebration overlay appears on win
- [ ] Screenshot: game-panel.png, each game

### Phase 12: 3D Viewer & Model Panel
- [ ] Model panel renders with VRM model (or placeholder)
- [ ] Camera controls (orbit, zoom, pan)
- [ ] Settings button opens Spring Bone + Effects panels
- [ ] Reset button returns to defaults
- [ ] Visibility toggle hides/shows model
- [ ] Reload model button
- [ ] Gesture indicator/selector
- [ ] Expression changes reflect on model
- [ ] Screenshot: model-panel.png, effects-panel.png

### Phase 13: Voice Pipeline
- [ ] VoiceOrb renders in chat area
- [ ] Mic button starts recording (if browser allows)
- [ ] Push-to-talk (hold) behavior
- [ ] Voice dictation toggle
- [ ] TTS playback of responses
- [ ] Screenshot: voice-orb.png

### Phase 14: Character Management
- [ ] Character creation flow (from sidebar Create section)
- [ ] Character editing (from Settings → Character tab)
- [ ] Character deletion (with confirmation)
- [ ] SillyTavern card import
- [ ] SillyTavern card export
- [ ] AI character generation wizard
- [ ] Screenshot: character-create.png

### Phase 15: Window Resize & Responsiveness
- [ ] Resize window to various sizes (1920x1080, 1440x900, 1280x720)
- [ ] All panels reflow correctly
- [ ] No overflow/clipping issues
- [ ] Sidebar auto-collapses at narrow widths (if configured)
- [ ] Screenshot: each resolution

### Phase 16: Console Error Audit
- [ ] Check browser console after each phase
- [ ] Log all errors (not warnings)
- [ ] Note which interactions trigger errors
- [ ] Screenshot: console-errors.png (if any)

---

## Output Files

| File | Purpose |
|------|---------|
| `docs/testing/qa-report-2026-04-02.md` | Full QA report with pass/fail, observations, issues |
| `docs/testing/qa-screenshots/` | Screenshot evidence directory |

## Verification

After testing, the QA report should contain:
1. Total test cases run
2. Pass/fail counts
3. Issue list with severity (Critical / Major / Minor / Cosmetic)
4. Screenshots linked for every test phase
5. Console error inventory
6. Recommended fix priority list

## Execution Strategy

Use Playwright's `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_take_screenshot`, `browser_press_key`, `browser_resize`, and `browser_fill_form` tools to:
1. Navigate to the app
2. Take a snapshot (accessibility tree) to identify elements
3. Click/interact with elements by ref ID
4. Take screenshots after each interaction
5. Record results in the QA report markdown file

Work through phases sequentially. After each phase, update the QA report with findings before moving to the next phase.
