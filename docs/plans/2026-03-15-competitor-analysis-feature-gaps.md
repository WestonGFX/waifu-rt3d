# Competitor Analysis & Feature Gap Report
**Date:** 2026-03-15
**Apps Researched:** SillyTavern, Open WebUI, LibreChat, Agnai, KoboldCpp, Backyard AI

## Feature Gap Analysis

| # | Feature | Who Has It | Priority | Effort | Notes |
|---|---------|-----------|----------|--------|-------|
| 1 | **Conversation Forking** | LibreChat, KoboldCpp | HIGH | Medium | Fork from any message to explore alternate story paths |
| 2 | **Full-Text Message Search** | LibreChat | HIGH | Low | SQLite FTS5 makes this near-free; Ctrl+K search modal |
| 3 | **Web Search Integration** | Open WebUI (15 providers), KoboldCpp | HIGH | Medium | Tool call + search API + context injection |
| 4 | **Slash Commands** | SillyTavern (STscript) | MED-HIGH | Medium | `/character`, `/mood`, `/game`, `/retry`, `/edit` |
| 5 | **Connection Profiles** | SillyTavern, Open WebUI | MED-HIGH | Low | Save/switch LLM backend configs with one click |
| 6 | **Prompt Assembly Debugger** | SillyTavern | MEDIUM | Low | Backend already returns budget_summary |
| 7 | **Multi-Character Group Chat** | SillyTavern, Agnai, Backyard AI | MEDIUM | High | Unique with 3D avatars |
| 8 | **Document Upload to Chat** | Open WebUI, SillyTavern | MEDIUM | Medium | Drag PDF/text into chat as context |
| 9 | **Conversation Bookmarks** | LibreChat | MEDIUM | Low | Star messages + bookmark panel |
| 10 | **Adventure/Story Mode** | KoboldCpp | LOW-MED | Medium | Narrator mode + `>` action input |

## Our Competitive Advantages (nobody else has)
- 3D VRM + Live2D avatar rendering with expression automation
- Game spectator mode (screen capture + AI commentary)
- Full-duplex voice chat with VAD + barge-in
- Desktop pet mode (Electron transparent overlay)
- Emotion-driven expression portraits
- 18 built-in themes across 3 frontends (Neon, Sakura, Nova)

## Implementation Suggestions

### 1. Conversation Forking
- Add `forked_from_session_id` + `forked_at_message_id` columns to sessions table
- Copy messages up to fork point into new session
- Add "Fork" button to message context menu
- New endpoint: `POST /api/sessions/fork`

### 2. Full-Text Message Search
- Add FTS5 virtual table on messages table
- `GET /api/messages/search?q=...&character_id=...`
- SearchModal.tsx triggered by Ctrl+K (Nova already has CommandPalette — extend it)

### 3. Web Search Integration
- Add `web_search` tool to capability_detector.py
- Call search API (SearXNG self-hosted or Brave/Google with API key)
- Inject snippets into context via context_assembler.py
- Settings toggle: "Allow web search" with provider selection

### 4. Slash Commands
- SlashCommandParser intercepts messages starting with `/`
- Register commands from subsystems (games, mood, memory, characters)
- Autocomplete dropdown in InputBar triggered by `/` keypress
- Start with 10-15 core commands

### 5. Connection Profiles
- `connection_profiles` table (name, server_url, model, context_size, temperature, top_p)
- CRUD endpoints: `/api/profiles`
- Profile selector dropdown in chat header
- One-click switching between models

### 6. Prompt Assembly Debugger
- Frontend panel showing context_assembler's budget_summary
- Stacked bar chart: system prompt, persona, lorebook, memory, history
- "View Full Prompt" button showing raw assembled text
- backend already returns this data — just needs UI

## Per-App Feature Highlights

### SillyTavern
- Connection Profiles (save/switch backends)
- STscript (slash command scripting language)
- Group Chats with Multi-Model (each character uses different LLM)
- Prompt Manager with visual token budget
- Regex Scripts for output formatting
- Data Bank (attach files for RAG-like injection)
- Extension ecosystem with built-in manager

### Open WebUI
- RAG with 9 vector databases + inline citations
- Knowledge Collections bound to models
- Web Search (15+ providers)
- Channels (Discord-style collaborative rooms)
- Arena Evaluation (blind A/B model testing)
- Pipelines & Custom Functions (Python code in browser)

### LibreChat
- MCP (Model Context Protocol) first-class support
- Agents with tool calling + code interpreter
- Artifacts (rendered React/HTML side panel)
- Conversation Forking from any message
- Conversation Bookmarks + Message Search
- Multi-provider model switching mid-conversation

### Agnai
- Zero-friction onboarding (no account required)
- Privacy-first (browser-local data by default)
- Multiple persona schemas (W++, SBF, Boostyle)
- AI Horde integration (free distributed compute)

### KoboldCpp
- Single-file zero-install executable
- Multi-modal: LLM + Stable Diffusion + Whisper + TTS in one binary
- 3 interaction modes: Chat, Story, Adventure
- Advanced sampler controls

### Backyard AI
- Consumer-grade polish (product, not dev tool)
- Community Hub (browse/share/remix characters)
- Voice Calls (StyleTTS2, 24 voices)
- Parties (2-4 character group chat)
- Mobile-first design (iOS, Android)
