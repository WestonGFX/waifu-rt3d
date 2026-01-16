# Research: Claude Code Integration & "Multi-Vibe" Workflows

**Source**: Web Search (Jan 2026)
**Goal**: Integrate Anthropic's "Claude Code" CLI agent into the Waifu-RT3D dev workflow to allow "Multi-Agent" collaborative coding (User + Gemini + Claude).

## 1. What is Claude Code?

Claude Code is a CLI agentic coding tool that provides:

- **Direct Terminal Access**: Lives in your shell, understands file structure.
- **Project Awareness**: Reads `CLAUDE.md` to understand conventions/architecture.
- **Autonomous Coding**: Can plan, edit, debug, and run tests via `claude "fix this bug"`.
- **MCP Support**: Connects to external tools (Model Context Protocol).

## 2. The "Multi-Vibe" Coding Workflow

Recent "Vibe Coding" trends involve using multiple AI assistants sequentially or in parallel.

### Workflow A: The "Relay Race" (Sequential)

1. **Architect (Gemini/Antigravity)**: Plans the feature, writes `implementation_plan.md`.
2. **Builder (Claude Code)**: User runs `claude "Implement the plan in implementation_plan.md"`.
3. **Reviewer (Gemini)**: User asks Gemini to review the changes made by Claude.

### Workflow B: The "Specialist Council" (Parallel)

- **Terminal 1 (Gemini)**: Focuses on Backend/Infrastructure.
- **Terminal 2 (Claude)**: Focuses on Frontend/React/CSS.
- **Shared Memory**: Both read/write to `docs/project_context.md`. This should actually work probably differently though, so we can preserve the context window for the main agent and have sub agents that are run in different terminals that are or are not really sub agents but rather mutiple agents running in separate terminal windows from different providers (codex,gemini,claude code,opencode and other similar) and each of these agents can have their own context window and can have their own system prompt and can have their own tools and can have their own API keys and can have their own other settings and can have their own docs and can have things specific to them as well as subagents of their own. It is better not to have a shared memory in the context window but rather in a markdown file on the disk and have it updated regularly by the models as they work and have rules that tell them to do so (both read and write to the shared memory on disk file in our project that we create a file for and log to and make the max file size unlimited for this markdown file but we may want to make a new one every so often in terms of its size in MB or GB or something or in terms of lines of words or lines of code or something else that makes sense but make it a large maximum and have a proper system for compacting this context if we do swap over to a new file after the old one is too big and have a system or rules for searching in old contexts if this is needed but for now it is not.)

## 3. Integration Plan for Waifu-RT3D

To support this "Commercial App" feature:

### Step 1: Create `CLAUDE.md`

This file acts as the "System Prompt" for the Claude CLI tool. There already may be a claude.md file and if there is then observe it and find out how it works and see what is SPECIFIC to this project inside of it and check if we can improve it or if it is "good how it is" and it likely will be fine without our additions or changes. Also save the old version as a copy and move the copy before changes to a backup folder or something as well if you do edit this.

- **Location**: Project Root.
- **Content**: (this is just something quickly generated and should not be used as actual code going forward and needs to be improved and upated...this applies to almost this entire file and every part of it actually!)
  - Coding Standards (Functions, Variables).
  - Architecture Overview (information here you add, be very specific and very detailed and have lots of information here).
  - Build/Run commands (`python -m backend.server`). This may be a wrong command so make sure it is not like (`python server.py`) or something else.

### Step 2: "Session Handoff" Protocol

We can create a script `scripts/handoff.sh` that:

1. Summarizes recent git changes.
2. Updates `task.md`.
3. Generates a prompt for the next agent: "Claude, please pick up task #3 in task.md".

### Step 3: MCP Server (Advanced)

We could build a custom MCP server for Waifu-RT3D that allows Claude to:

- Directly query the running Waifu server status.
- Inject text into the Waifu Chat loop during development.

## 4. Proposed Feature: "Dev-Mode Agent Swarm"

A UI toggle in the "Dev" tab that switches the "Backend LLM" from the local model to an external Agent API (like Claude or GPT-4o) for complex coding tasks *inside* the virtual world.

- **User**: "Waifu, add a calendar widget to your own code."
- **Waifu (Agent)**: Reads code, creates widget, reloads itself. (Self-Modifying Code).
