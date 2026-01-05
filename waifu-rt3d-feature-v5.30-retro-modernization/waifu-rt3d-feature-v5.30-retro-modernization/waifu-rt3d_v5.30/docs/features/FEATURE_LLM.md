# LLM Integration - Complete Guide

**Feature:** Large Language Model Integration
**Status:** ✅ Implemented (v5.29)
**Module:** `backend/llm/`
**Providers:** LM Studio (more planned)

---

## Overview

The LLM (Large Language Model) integration provides the conversational AI brain for your waifu companion. It handles chat responses, maintains conversation context, and supports multiple LLM providers through an adapter pattern.

**Key Features:**
- 🧠 Conversational AI responses
- 💬 Message history management
- 🔌 Provider-agnostic adapter system
- ⚙️ Configurable context window
- 🔄 Easy provider switching

---

## Architecture

### Adapter Pattern

The LLM system uses the **adapter pattern** for extensibility:

```
backend/llm/
├── registry.py          # Factory for creating LLM clients
└── adapters/
    ├── base.py         # Abstract base class (LLMAdapter)
    └── lmstudio.py     # LM Studio implementation
```

**Benefits:**
- Add new providers without changing existing code
- Consistent interface across all LLM services
- Easy testing and mocking
- Provider-specific optimizations

---

## Supported Providers

### LM Studio (Local)

**Status:** ✅ Fully implemented
**Type:** Local/Self-hosted
**Privacy:** ✅ Complete (runs on your machine)
**Cost:** Free

**Setup:**
1. Download LM Studio: https://lmstudio.ai/
2. Download a model (recommended: Mistral 7B, Llama 2 13B)
3. Start local server on port 1234
4. Configure endpoint in app.json

**Advantages:**
- No API costs
- Full privacy
- No rate limits
- Works offline
- Model customization

**Disadvantages:**
- Requires good hardware (8GB+ RAM)
- Slower than cloud APIs
- Limited to models that fit in RAM

---

## Configuration

### File: `backend/config/app.json`

```json
{
  "llm": {
    "provider": "lmstudio",
    "endpoint": "http://127.0.0.1:1234/v1",
    "api_key": "lm-studio",
    "model": ""
  }
}
```

**Options:**
- `provider`: Which LLM adapter to use (currently: "lmstudio")
- `endpoint`: API endpoint URL
- `api_key`: Authentication key (lmstudio uses placeholder)
- `model`: Model name (empty = use LM Studio's loaded model)

---

## Code Structure

### Base Adapter (`backend/llm/adapters/base.py`)

```python
class LLMAdapter(ABC):
    """Base class for LLM adapters."""

    @abstractmethod
    def chat(self, messages, model, endpoint, api_key):
        """
        Send chat request to LLM.

        Args:
            messages: List of {role, content} dicts
            model: Model name/ID
            endpoint: API endpoint
            api_key: Authentication key

        Returns:
            {"ok": bool, "reply": str, "error": str}
        """
        pass
```

**Key Method:** `chat(messages, model, endpoint, api_key)`
- Takes conversation history
- Returns AI response
- Handles errors gracefully

### LM Studio Adapter (`backend/llm/adapters/lmstudio.py`)

```python
class LMStudioAdapter(LLMAdapter):
    def chat(self, messages, model, endpoint, api_key):
        # Format messages for OpenAI-compatible API
        # Make HTTP request to LM Studio
        # Parse response
        # Return formatted result
```

**Implements:** OpenAI-compatible API format
**Endpoint:** `/v1/chat/completions`
**Method:** POST

---

## API Integration

### Chat Endpoint (`/api/chat`)

**File:** `backend/server.py:98`

**Request:**
```json
POST /api/chat?session_id=1

{
  "text": "Hello! How are you?",
  "speak": false
}
```

**Response:**
```json
{
  "ok": true,
  "reply": "Hi! I'm doing great, thanks for asking! How can I help you today?",
  "audio": null,
  "session_id": 1
}
```

**Flow:**
1. User message saved to database
2. Conversation history retrieved (last N messages)
3. System prompt prepended
4. LLM adapter called
5. Response saved to database
6. Optional TTS generation
7. Response returned to user

---

## Message History

### Context Window

Controlled by: `config.memory.max_history` (default: 12)

**Example:**
```json
{
  "memory": {
    "max_history": 12
  }
}
```

**Behavior:**
- Retrieves last N messages from database
- Reverses to chronological order
- Prepends system prompt
- Sends to LLM

**Database Query:**
```sql
SELECT role, text
FROM messages
WHERE session_id=?
ORDER BY id DESC
LIMIT ?
```

---

## System Prompts

### Default Prompt

**Location:** `backend/server.py:111`

```python
messages = [
    {"role": "system", "content": "You are a friendly anime companion."}
] + history
```

### Character-Specific Prompts (v5.30)

With character system in v5.30, prompts are dynamic:

```python
# Get character's system prompt from database
character_system_prompt = get_character_prompt(character_id)

messages = [
    {"role": "system", "content": character_system_prompt}
] + history
```

**See:** `docs/features/FEATURE_CHARACTERS.md` for details

### Custom System Prompts

**Available:** 10 ranked personalities in `docs/guides/SYSTEM_PROMPTS.md`

**Examples:**
- Playful Companion
- Tsundere Personality
- Supportive Friend
- Curious Student
- Professional Assistant

---

## Error Handling

### Adapter Level

```python
try:
    # Make LLM request
    response = requests.post(...)
    response.raise_for_status()
    return {"ok": True, "reply": result["choices"][0]["message"]["content"]}
except Exception as e:
    return {"ok": False, "error": str(e)}
```

### Server Level

```python
res = adapter.chat(messages, cfg["llm"]["model"], ...)
if not res.get("ok"):
    return {"ok": False, "error": res.get("error", "adapter failed")}
```

**User sees:** Error message in response, not crash

---

## Adding New Provider

### Step 1: Create Adapter

**File:** `backend/llm/adapters/openai.py` (example)

```python
from .base import LLMAdapter
import requests

class OpenAIAdapter(LLMAdapter):
    def chat(self, messages, model, endpoint, api_key):
        try:
            response = requests.post(
                f"{endpoint}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": 0.7
                },
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            return {
                "ok": True,
                "reply": result["choices"][0]["message"]["content"]
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}
```

### Step 2: Register Adapter

**File:** `backend/llm/registry.py`

```python
from .adapters.lmstudio import LMStudioAdapter
from .adapters.openai import OpenAIAdapter  # Add import

LLM_ADAPTERS = {
    "lmstudio": LMStudioAdapter,
    "openai": OpenAIAdapter,  # Add to registry
}
```

### Step 3: Configure

**File:** `backend/config/app.json`

```json
{
  "llm": {
    "provider": "openai",
    "endpoint": "https://api.openai.com/v1",
    "api_key": "sk-...",
    "model": "gpt-4"
  }
}
```

### Step 4: Test

```bash
python3 -m py_compile backend/llm/adapters/openai.py
```

---

## Testing

### Manual Test (cURL)

```bash
curl -X POST "http://localhost:8000/api/chat?session_id=1" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello! Tell me a joke.",
    "speak": false
  }'
```

**Expected:**
```json
{
  "ok": true,
  "reply": "Why did the AI go to therapy? It had too many neural issues!",
  "audio": null,
  "session_id": 1
}
```

### Unit Test

**File:** `tests/test_adapters.py`

```python
def test_lmstudio_adapter():
    adapter = LMStudioAdapter()
    messages = [{"role": "user", "content": "Hi"}]
    result = adapter.chat(messages, "", "http://127.0.0.1:1234/v1", "lm-studio")
    assert result.get("ok") == True
    assert "reply" in result
```

---

## Troubleshooting

### Issue: "LLM probe: Connection refused"

**Cause:** LM Studio not running
**Solution:**
1. Start LM Studio
2. Load a model
3. Start local server (button in LM Studio)
4. Check endpoint: http://127.0.0.1:1234/v1/models

### Issue: "Adapter error: timeout"

**Cause:** LLM taking too long to respond
**Solution:**
- Use smaller model
- Reduce max_history (less context)
- Increase timeout in adapter code

### Issue: "Empty response"

**Cause:** Model not loaded or crashed
**Solution:**
- Check LM Studio console for errors
- Reload model in LM Studio
- Try different model

### Issue: "Invalid model"

**Cause:** Model name mismatch
**Solution:**
- Leave `model` field empty for LM Studio
- Or use exact model name from LM Studio

---

## Performance Optimization

### Tips:
1. **Reduce context window:**
   ```json
   {"memory": {"max_history": 6}}
   ```

2. **Use faster model:**
   - Mistral 7B (fast)
   - Llama 2 7B (fast)
   - Avoid 13B/70B unless needed

3. **Enable GPU acceleration:**
   - LM Studio → Settings → Use GPU

4. **Quantized models:**
   - Q4 quantization = 4x faster, minimal quality loss

---

## Future Enhancements

**Planned for v5.31+:**
- [ ] OpenAI adapter
- [ ] Anthropic Claude adapter
- [ ] Ollama adapter
- [ ] Streaming responses (SSE)
- [ ] Response caching
- [ ] Multi-turn optimization

---

## Related Documentation

- **System Prompts:** `docs/guides/SYSTEM_PROMPTS.md`
- **Character System:** `docs/features/FEATURE_CHARACTERS.md`
- **API Reference:** `docs/api/API_REFERENCE.md`
- **Troubleshooting:** `docs/guides/TROUBLESHOOTING.md`

---

## Quick Reference

**Files:**
- `backend/llm/registry.py` - Adapter factory
- `backend/llm/adapters/base.py` - Base class
- `backend/llm/adapters/lmstudio.py` - LM Studio
- `backend/server.py` - Chat endpoint
- `backend/config/app.json` - Configuration

**Endpoints:**
- `POST /api/chat` - Send message, get response

**Config Keys:**
- `llm.provider` - Which adapter to use
- `llm.endpoint` - API URL
- `llm.api_key` - Authentication
- `llm.model` - Model name
- `memory.max_history` - Context window

---

**Last Updated:** 2025-11-24
**Version:** v5.30
**Status:** Production Ready ✅
