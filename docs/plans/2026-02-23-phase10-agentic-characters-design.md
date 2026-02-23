# Phase 10: Agentic Characters — Design Document

**Date:** 2026-02-23
**Status:** Approved
**Branch:** `integrate/master`

## Overview

Characters gain the ability to use **tools** during conversation — generating images,
searching memories, looking things up on the web, and controlling their own scene
(expression, animation, background, lighting). The system uses a **hybrid protocol**:
native API tool-use for providers that support it (Claude, OpenAI), with a
prompt-engineered XML fallback for local models (Qwen3, Gemma, LLaMA via LM Studio).

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tool protocol | **Hybrid** (native API + XML fallback) | Works with all models |
| Tool UX | **Inline cards + collapsible details** | Immersive yet inspectable |
| Tool control | **Autonomous** | Character decides when to use tools |
| Loop depth | **Max 3 rounds** per response | Covers 95% of patterns, prevents runaway |
| System control scope | **Scene & appearance only** | Safe: expression, animation, background, lighting |
| Architecture | **Middleware layer** (`backend/agent/`) | Clean separation, testable |

---

## Module Structure

```
backend/agent/
├── __init__.py          # Exports AgentRunner, ToolRegistry
├── runner.py            # AgentRunner — the agentic loop (async generator)
├── registry.py          # ToolRegistry — tool definitions + executors
├── prompt.py            # Prompt-engineered tool templates (XML fallback)
├── parser.py            # Parse tool calls from text (XML) or native API response
└── tools/
    ├── __init__.py      # Auto-registers all tools
    ├── web_search.py    # Tool: search the web (DuckDuckGo HTML, no API key)
    ├── image_gen.py     # Tool: generate images via existing ComfyUI registry
    ├── memory.py        # Tool: search conversation memory + knowledge base
    └── scene_control.py # Tool: set expression, animation, background, lighting
```

---

## AgentRunner

The runner is an async generator that sits between the chat endpoint and the LLM
adapter. It handles the agentic loop: call LLM → detect tool calls → execute →
feed results back → repeat (up to `max_rounds`).

```python
class AgentRunner:
    """Orchestrates the agentic tool-use loop.

    Args:
        registry: ToolRegistry with available tools.
        max_rounds: Maximum tool-call iterations (default 3).
    """

    def __init__(self, registry: ToolRegistry, max_rounds: int = 3):
        self.registry = registry
        self.max_rounds = max_rounds

    async def run_stream(
        self,
        messages: list[dict],
        adapter,
        cfg: dict,
        tools: list[ToolDef],
        **llm_kwargs,
    ) -> AsyncGenerator[dict, None]:
        """Async generator yielding SSE-ready event dicts.

        Yields event dicts with keys:
            event: str  — "token", "tool_call", "tool_result", "done", "error"
            data: dict  — event-specific payload

        The caller (chat endpoint) formats these as SSE lines.
        """
        use_native = hasattr(adapter, 'supports_tools') and adapter.supports_tools()

        for round_num in range(self.max_rounds):
            # 1. Prepare messages (inject XML tool prompt if not native)
            # 2. Stream LLM response, collecting tokens
            # 3. Detect tool calls (native API or XML parse)
            # 4. If tool call found:
            #    a. Yield {"event": "tool_call", "data": {id, name, args}}
            #    b. Execute tool via registry
            #    c. Yield {"event": "tool_result", "data": {id, result}}
            #    d. Append tool call + result to messages
            #    e. Continue loop for next round
            # 5. If no tool call: yield final tokens + done, break
```

### Key behaviors:
- **Streaming text before tool calls**: If the LLM writes "Let me search for that..."
  before emitting a tool call, those tokens are streamed to the user in real-time.
- **Tool results as assistant context**: After executing a tool, the result is appended
  to the message history as a tool-result message so the LLM can reference it.
- **Hard cap**: After `max_rounds` iterations, the runner forces a final text response
  even if the LLM wants to call more tools.

---

## ToolRegistry

```python
class ToolDef:
    """Definition for a single tool."""
    name: str                    # "generate_image"
    description: str             # Human-readable description
    parameters: dict             # JSON Schema for arguments
    execute: Callable            # async (args, context) -> ToolResult

class ToolResult:
    """Result from executing a tool."""
    ok: bool
    data: dict                   # Tool-specific result data
    display: str                 # "image" | "text" | "list" | "scene_command"
    error: str | None = None

class ToolContext:
    """Execution context passed to every tool."""
    cfg: dict                    # App config
    char_id: int                 # Current character ID
    session_id: int              # Current session ID
    db_conn: Any                 # SQLite connection
    vector_store: Any            # ChromaDB vector store (may be None)

class ToolRegistry:
    """Registry of available tools with JSON schema definitions."""
    _tools: dict[str, ToolDef]

    def register(self, tool: ToolDef) -> None
    def get_tool(self, name: str) -> ToolDef | None
    def get_schemas(self) -> list[dict]          # OpenAI-format tool schemas
    def get_xml_prompt(self) -> str              # Prompt-engineered XML block
    def get_tools_for_character(self, cap: dict) -> list[ToolDef]
```

### Tool filtering by capability profile

Characters opt into tools via the existing `capability_profile.supports_tools` flag.
All registered tools are available when the flag is `True`. Future: a
`capability_profile.available_tools` list could restrict to specific tool names.

---

## The 4 Core Tools

### 1. `generate_image`

Generates an anime-style image via the existing ComfyUI / EasyDiffusion registry.

```python
name = "generate_image"
description = "Generate an anime-style image from a text description"
parameters = {
    "prompt": {"type": "string", "description": "Detailed image description"},
    "style": {"type": "string", "enum": ["anime", "realistic", "chibi"],
              "default": "anime"},
}
```

**Backend:** Calls `backend.image_gen.registry.get_image_gen(cfg).generate(prompt, cfg)`
**Returns:** `{"url": "/files/images/generated_xxx.png"}`
**Display:** `"image"` — frontend shows thumbnail in tool card

### 2. `search_memory`

Searches past conversation memories via the ChromaDB vector store.

```python
name = "search_memory"
description = "Search past conversations for relevant memories"
parameters = {
    "query": {"type": "string", "description": "What to search for"},
    "max_results": {"type": "integer", "default": 5, "maximum": 10},
}
```

**Backend:** Calls `vector_store.query_memory(query, n_results, char_id)`
**Returns:** `{"memories": [{"text": "...", "role": "...", "score": 0.85}]}`
**Display:** `"list"` — frontend shows memory snippets in tool card

### 3. `web_search`

Searches the internet using DuckDuckGo's HTML interface (no API key required).

```python
name = "web_search"
description = "Search the internet for current information"
parameters = {
    "query": {"type": "string", "description": "Search query"},
    "max_results": {"type": "integer", "default": 3, "maximum": 5},
}
```

**Backend:** New implementation using `httpx` + DuckDuckGo HTML scraping
**Returns:** `{"results": [{"title": "...", "snippet": "...", "url": "..."}]}`
**Display:** `"list"` — frontend shows search result cards

### 4. `set_scene`

Controls the character's scene: expression, animation, background, lighting.

```python
name = "set_scene"
description = "Change your expression, play an animation, or adjust the scene"
parameters = {
    "expression": {"type": "string", "description": "Emotion expression",
                   "enum": ["happy", "sad", "angry", "surprised", "thinking",
                            "excited", "worried", "neutral"]},
    "animation": {"type": "string", "description": "Animation to play",
                  "enum": ["wave", "nod", "bow", "shrug", "clap", "think",
                           "point", "celebrate", "shy", "dance"]},
    "background": {"type": "string", "description": "Background image name or color"},
    "lighting": {"type": "string", "enum": ["warm", "cool", "dramatic", "disco",
                                             "natural"]},
}
```

**Backend:** Returns the command dict directly (no server-side execution needed)
**Returns:** `{"commands": {"expression": "happy", "animation": "wave"}}`
**Display:** `"scene_command"` — frontend executes via ViewerBridge postMessage

---

## Hybrid Protocol

### Native API mode (Claude, OpenAI, LM Studio with tool-capable models)

The adapter's `chat_stream()` accepts a `tools` parameter with OpenAI-format schemas:

```python
tools = [{
    "type": "function",
    "function": {
        "name": "generate_image",
        "description": "Generate an anime-style image...",
        "parameters": { ... }
    }
}]
```

Tool calls come back in the response's `tool_calls` field with structured JSON args.
The adapter must expose `supports_tools() -> bool`.

### Prompt-engineered XML mode (local models without native tool support)

When `adapter.supports_tools()` is `False`, the runner injects an XML tool definition
block into the system prompt:

```xml
<available_tools>
  <tool name="generate_image" description="Generate an anime-style image...">
    <param name="prompt" type="string" required="true">Detailed image description</param>
    <param name="style" type="string" required="false" default="anime">anime|realistic|chibi</param>
  </tool>
  <!-- ... more tools ... -->
</available_tools>

To use a tool, include this in your response:
<tool_call name="TOOL_NAME">
{"param1": "value1", "param2": "value2"}
</tool_call>

You may include text before and after a tool call. You may use at most one tool per response.
After a tool call, you will receive the result in a <tool_result> block, then continue responding.
```

The `parser.py` module extracts `<tool_call>` blocks from the streamed text using
regex, buffering tokens to detect partial XML tags.

### Adapter changes

Add `supports_tools() -> bool` method to the base adapter class (default `False`).
Override in `openai_compat.py` and `claude_api.py` to return `True`.

Modify `chat_stream()` signature to accept optional `tools` parameter:

```python
def chat_stream(self, messages, model, endpoint, api_key,
                tools=None, **kwargs) -> Generator[str | dict, None, None]:
    """Yield str tokens for text, or dict for tool_call events."""
```

When `tools` is provided and the model returns a tool call, yield a dict instead of
a string token: `{"type": "tool_call", "name": "...", "args": {...}, "id": "..."}`.

---

## Frontend: SSE Event Handling

### New SSE event types

```
event: tool_call
data: {"id": "tc_001", "name": "generate_image", "args": {"prompt": "..."}}

event: tool_result
data: {"id": "tc_001", "ok": true, "display": "image", "data": {"url": "/files/..."}}
```

### ChatInterface.js changes

Add two new cases to the SSE event parser:

```javascript
case 'tool_call':
    this._renderToolCard(eventData.id, eventData.name, eventData.args, 'running');
    break;

case 'tool_result':
    this._updateToolCard(eventData.id, eventData);
    break;
```

### Tool card rendering

Tool cards are inline `<div>` elements inserted into the current chat bubble:

```html
<div class="tool-card" data-tool-id="tc_001">
  <div class="tool-card-header">
    <span class="tool-icon">🎨</span>
    <span class="tool-name">Generating image...</span>
    <span class="tool-spinner">◌</span>
  </div>
  <div class="tool-card-body">
    <!-- populated on tool_result: image thumbnail, search results, etc. -->
  </div>
  <details class="tool-card-details">
    <summary>Show details</summary>
    <pre>Tool: generate_image
Prompt: "cute anime girl waving"
Time: 2.3s</pre>
  </details>
</div>
```

### Scene command execution

When `display === "scene_command"`, the frontend executes the commands directly
via ViewerBridge instead of rendering a visual card:

```javascript
if (eventData.display === 'scene_command') {
    const cmds = eventData.data.commands;
    if (cmds.expression) viewerBridge.setExpression(cmds.expression);
    if (cmds.animation) viewerBridge.playAnimation(cmds.animation);
    if (cmds.background) viewerBridge.setBackground(cmds.background);
    // Show a subtle inline note: "✨ *changes expression to happy*"
}
```

---

## Chat Endpoint Integration

The streaming chat endpoint (`/api/chat/stream`) gains a conditional branch:

```python
# After building messages, adapter, and parsing capability profile:

char_tools = []
if cap.get("supports_tools"):
    from backend.agent import AgentRunner, get_default_registry
    char_tools = get_default_registry().get_tools_for_character(cap)

if char_tools:
    # Agentic path: use AgentRunner
    runner = AgentRunner(get_default_registry(), max_rounds=3)
    context = ToolContext(cfg=cfg, char_id=char_id, session_id=session_id,
                          db_conn=con, vector_store=vector_store)
    async for event in runner.run_stream(messages, adapter, cfg, char_tools,
                                          context=context, **llm_kwargs):
        yield format_sse(event["event"], event["data"])
else:
    # Non-agentic path: existing streaming code (unchanged)
    for token in adapter.chat_stream(messages, ...):
        yield f"event: token\ndata: {json.dumps({'t': token})}\n\n"
```

**Zero impact on non-agentic characters.** The agentic path only activates when the
character's capability profile has `supports_tools: true`.

---

## Testing Strategy

### Unit tests (`backend/tests/test_agent_*.py`)

- **parser tests**: XML tool call extraction from various text patterns
- **registry tests**: Tool registration, schema generation, tool lookup
- **prompt tests**: XML prompt rendering matches expected format
- **runner tests**: Mock adapter + mock tools, verify event sequence

### Integration tests

- **End-to-end tool call**: POST `/api/chat` with a supports_tools character,
  verify tool_call and tool_result events in SSE stream
- **Max rounds enforcement**: Verify the runner stops after 3 rounds
- **Fallback mode**: Verify XML prompt injection when adapter doesn't support tools
- **Non-agentic bypass**: Verify characters without `supports_tools` use old path

---

## Future Extensions (Phase 10b)

After the 4 core tools are implemented, brainstorm 4-8 additional abilities:
- Music/ambient sound control
- Character self-modification (update own greeting, traits)
- Calendar/reminder system
- Code execution (sandboxed)
- File reading/writing
- Inter-character communication
- Scheduled autonomous actions
- User preference learning

These will be designed as additional tool implementations in `backend/agent/tools/`
using the same ToolDef interface.
