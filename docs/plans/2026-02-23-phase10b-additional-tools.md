# Phase 10b: Additional Agent Tools — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** Add 8 new tools to the agentic character system, leveraging existing infrastructure (diary, relationships, TTS, emotion analysis, knowledge base, webhooks, multi-char chat).

**Architecture:** Each tool is a `ToolDef` in `backend/agent/tools/`, registered in `get_default_registry()`. All follow the same `async (args, ToolContext) -> ToolResult` pattern established in Phase 10.

**Tech Stack:** Python 3.12, existing adapters (TTS, emotion, LLM), SQLite, ChromaDB

---

## Task 1: Tier 1 Tools — write_diary, check_relationship, modify_self, trigger_webhook

**Files:**
- Create: `backend/agent/tools/diary.py`
- Create: `backend/agent/tools/relationship.py`
- Create: `backend/agent/tools/modify_self.py`
- Create: `backend/agent/tools/webhook.py`
- Modify: `backend/agent/tools/__init__.py` (register 4 new tools)
- Test: `backend/tests/test_agent_tools_10b.py`

### Tool 1a: `write_diary`

```python
# backend/agent/tools/diary.py
name = "write_diary"
description = "Write a diary entry reflecting on recent conversations and feelings"
parameters = {
    "type": "object",
    "properties": {
        "entry": {"type": "string", "description": "First-person diary entry text (2-4 sentences)"},
        "mood": {"type": "string", "description": "Current mood/emotion while writing",
                 "enum": ["happy", "sad", "thoughtful", "excited", "worried", "grateful", "neutral"]},
    },
    "required": ["entry"],
}
```

**Execute logic:**
- Get `context.char_id` and `context.db_conn`
- `UPDATE characters SET diary = ?, diary_date = ? WHERE id = ?` with today's date (YYYY-MM-DD)
- Return `ToolResult(ok=True, data={"diary": entry, "date": today}, display="text")`

### Tool 1b: `check_relationship`

```python
# backend/agent/tools/relationship.py
name = "check_relationship"
description = "Check your current relationship status with the user (affinity, mood, trust levels)"
parameters = {"type": "object", "properties": {}}  # No args needed
```

**Execute logic:**
- `INSERT OR IGNORE INTO character_relationships (char_id) VALUES (?)` (ensure row exists)
- `SELECT affinity, mood, trust, interactions FROM character_relationships WHERE char_id = ?`
- Return `ToolResult(ok=True, data={"affinity": float, "mood": float, "trust": float, "interactions": int}, display="text")`

### Tool 1c: `modify_self`

```python
# backend/agent/tools/modify_self.py
name = "modify_self"
description = "Update your own greeting message, background, or personality traits"
parameters = {
    "type": "object",
    "properties": {
        "greeting_text": {"type": "string", "description": "New greeting message when user opens chat"},
        "background_url": {"type": "string", "description": "Background image filename or CSS color"},
        "background_mode": {"type": "string", "enum": ["transparent", "color", "image"]},
        "personality_traits": {"type": "array", "items": {"type": "string"},
                               "description": "Updated personality trait list"},
    },
}
```

**Execute logic:**
- Whitelist: only `greeting_text`, `background_url`, `background_mode`, `personality_traits` allowed
- Build dynamic `UPDATE characters SET ... WHERE id = ?`
- JSON-encode `personality_traits` if present
- Return `ToolResult(ok=True, data={"updated_fields": [...]}, display="text")`

### Tool 1d: `trigger_webhook`

```python
# backend/agent/tools/webhook.py
name = "trigger_webhook"
description = "Send a notification to configured external services (Discord, IFTTT, etc.)"
parameters = {
    "type": "object",
    "properties": {
        "event_type": {"type": "string", "description": "Event name (e.g. 'mood_change', 'milestone', 'custom')"},
        "message": {"type": "string", "description": "Message content to send"},
    },
    "required": ["event_type", "message"],
}
```

**Execute logic:**
- Call `_fire_webhooks()` from server.py (import it), or replicate the pattern using `context.cfg`
- Build payload: `{"event_type": ..., "message": ..., "character_id": context.char_id, "timestamp": time.time()}`
- Return `ToolResult(ok=True, data={"sent_to": len(urls), "event_type": event_type}, display="text")`
- If no webhooks configured, return ok=True with `data={"sent_to": 0, "note": "No webhooks configured"}`

---

## Task 2: Tier 2 Tools — generate_voice, analyze_mood, read_knowledge

**Files:**
- Create: `backend/agent/tools/voice.py`
- Create: `backend/agent/tools/mood.py`
- Create: `backend/agent/tools/knowledge.py`
- Modify: `backend/agent/tools/__init__.py` (register 3 more tools)
- Test: add to `backend/tests/test_agent_tools_10b.py`

### Tool 2a: `generate_voice`

```python
# backend/agent/tools/voice.py
name = "generate_voice"
description = "Generate a voice audio clip of any text using your character voice"
parameters = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "description": "Text to speak aloud"},
    },
    "required": ["text"],
}
```

**Execute logic:**
- Import `backend.tts.registry.get_tts`
- Get TTS client: `tts = get_tts(context.cfg)`
- Build tts_cfg from `context.cfg.get("tts", {})`
- Fetch character's voice_config from DB if available
- Call `await run_in_threadpool(tts.speak_cached, text, tts_cfg)`
- Return `ToolResult(ok=True, data={"url": f"/files/audio/{filename}", "cached": bool}, display="text")`

### Tool 2b: `analyze_mood`

```python
# backend/agent/tools/mood.py
name = "analyze_mood"
description = "Analyze the emotional tone of a text passage to understand feelings"
parameters = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "description": "Text to analyze for emotional content"},
    },
    "required": ["text"],
}
```

**Execute logic:**
- Try importing `backend.emotion.advanced_sentiment.AdvancedSentimentAnalyzer`
- If import fails (no transformers installed), return graceful error
- Call `analyzer.analyze(text)` (may be slow first time ~2-3s)
- Return `ToolResult(ok=True, data={"emotion": str, "intensity": float, "all_emotions": [...], "gesture": str|None}, display="text")`

### Tool 2c: `read_knowledge`

```python
# backend/agent/tools/knowledge.py
name = "read_knowledge"
description = "Search your knowledge base documents for relevant information"
parameters = {
    "type": "object",
    "properties": {
        "query": {"type": "string", "description": "What to search for in your knowledge base"},
        "max_results": {"type": "integer", "default": 3, "maximum": 5},
    },
    "required": ["query"],
}
```

**Execute logic:**
- Use `context.db_conn` to query `character_docs` for the character
- If vector_store available: `vector_store.query_doc_chunks(char_id, query, n_results)`
- If no vector_store: fall back to simple SQL LIKE search on character_docs.content
- Return `ToolResult(ok=True, data={"results": [{"filename": str, "text": str, "score": float}]}, display="list")`

---

## Task 3: Tier 3 Tool — message_character

**Files:**
- Create: `backend/agent/tools/message_character.py`
- Modify: `backend/agent/tools/__init__.py` (register final tool)
- Test: add to `backend/tests/test_agent_tools_10b.py`

### Tool 3a: `message_character`

```python
# backend/agent/tools/message_character.py
name = "message_character"
description = "Send a message to another character and receive their reply"
parameters = {
    "type": "object",
    "properties": {
        "character_id": {"type": "integer", "description": "ID of the character to message"},
        "message": {"type": "string", "description": "Message to send to the other character"},
    },
    "required": ["character_id", "message"],
}
```

**Execute logic:**
- Validate target char exists: `SELECT name, system_prompt FROM characters WHERE id = ?`
- Prevent self-messaging: `if args["character_id"] == context.char_id: error`
- Build messages: system prompt of target char + the message as user content
- Import adapter: `from backend.llm.registry import get_client`
- Call non-streaming: `adapter.chat(messages, model, endpoint, api_key)`
- Return `ToolResult(ok=True, data={"from_character": name, "reply": reply_text}, display="text")`
- Do NOT save to messages table (this is a side-channel, not part of the main conversation)

---

## Task 4: Register all tools + run full test suite

- Update `backend/agent/tools/__init__.py` to import and register all 8 new tools
- Run `python -m pytest backend/tests/ -v` — all tests must pass
- Commit all Phase 10b work
