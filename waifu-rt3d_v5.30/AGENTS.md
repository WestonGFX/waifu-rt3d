# waifu-rt3d v5.30 - Agent Development Guide

This document provides essential guidelines for agentic coding agents working in this repository.

## Quick Reference

### Development Commands
```bash
# Server
python3 backend/server.py                    # Start development server
./run.sh                                      # Production start script

# Testing
pytest tests/ -v                             # Run all tests
pytest tests/test_server.py::TestConfigEndpoints::test_get_config -v  # Single test
pytest tests/test_server.py -k "test_get_config" -v  # All tests matching name

# Code Quality (optional - not in requirements.txt)
pip install black flake8 mypy pytest         # Install dev tools
black backend/ tests/                         # Format code
flake8 backend/ --max-line-length=100       # Lint
mypy backend/                                 # Type check
python3 -m py_compile backend/server.py     # Syntax check
```

### Project Structure
```
backend/
├── server.py              # Main FastAPI app (803 lines)
├── preflight.py           # Initialization
├── {service}/
│   ├── registry.py        # Provider factory
│   └── adapters/          # Provider implementations
└── storage/               # Runtime data (SQLite, files)
frontend/
├── index.html             # SPA (no build step)
└── assets/css/            # Styling
```

## Code Style Guidelines

### Python
- **Style**: Black formatting (max-line-length=100)
- **Type Hints**: Required on all function signatures
- **Docstrings**: Google-style for public APIs
- **Imports**: Standard library → third-party → local
- **Error Handling**: Specific exceptions, never bare except

```python
# Correct import order
import asyncio
import logging
from pathlib import Path
from typing import Dict, List, Optional

import fastapi
import requests

from backend.llm.adapters.base import LLMAdapter
from backend.utils.helpers import format_response

def process_data(data: List[str], config: Dict[str, str]) -> Optional[Dict[str, str]]:
    """
    Process input data with configuration.
    
    Args:
        data: List of strings to process
        config: Configuration dictionary
        
    Returns:
        Processed data dictionary or None if failed
        
    Raises:
        ValueError: If data is empty
        ConfigError: If configuration is invalid
    """
    if not data:
        raise ValueError("Data cannot be empty")
    # Implementation...
```

### Adapter Pattern
All external services use adapter pattern:

```python
# backend/{service}/adapters/myprovider.py
from .base import BaseServiceAdapter

class MyProviderAdapter(BaseServiceAdapter):
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.endpoint = config.get("endpoint", "")
    
    async def process(self, input_data: str) -> Dict[str, Any]:
        """Implement required method from base class."""
        try:
            # Implementation
            return {"ok": True, "result": "..."}
        except requests.RequestException as e:
            logger.error(f"Network error: {e}")
            return {"ok": False, "error": f"Connection failed: {e}"}
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return {"ok": False, "error": "Internal error"}

# Register in backend/{service}/registry.py
def get_client(config: Dict[str, Any]) -> BaseServiceAdapter:
    provider = config.get("provider", "default")
    if provider == "myprovider":
        return MyProviderAdapter(config)
    # ... other providers
```

### Database Operations
- **Always use parameterized queries** (SQL injection prevention)
- **Connection management**: Use `with sqlite3.connect(...)` or explicit close
- **Schema changes**: Create new schema_vX.sql, update preflight.py

```python
def get_user_sessions(user_id: int) -> List[Dict[str, Any]]:
    """Get all sessions for a user."""
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, title, created_ts 
            FROM sessions 
            WHERE user_id = ? 
            ORDER BY created_ts DESC
        """, (user_id,))
        return [{"id": row[0], "title": row[1], "created_ts": row[2]} 
                for row in cur.fetchall()]
    finally:
        conn.close()
```

### JavaScript (Frontend)
- **Style**: ES6+ features, no transpilation
- **Modules**: Native ES6 imports
- **Error Handling**: Try-catch on all async operations
- **Comments**: JSDoc for complex functions

```javascript
/**
 * Send chat message to API.
 * @param {string} message - Message text
 * @param {boolean} speak - Whether to generate TTS
 * @returns {Promise<Object>} Response data
 */
async function sendChatMessage(message, speak = false) {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({text: message, speak})
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error);
        return data;
    } catch (error) {
        console.error('Chat failed:', error);
        showToast(error.message, 'error');
    }
}
```

## API Development Patterns

### FastAPI Endpoints
- **Path**: `/api/{resource}` for REST endpoints
- **Methods**: GET (list), POST (create), PUT (update), DELETE
- **Request**: JSON body with validation
- **Response**: `{"ok": bool, "data": any, "error": str}`

```python
@app.post("/api/sessions")
async def create_session(req: Request):
    """Create new chat session."""
    body = await req.json()
    if not body or "title" not in body:
        raise HTTPException(400, "Missing title")
    
    conn = db()
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO sessions (title) VALUES (?)", (body["title"],))
        session_id = cur.lastrowid
        conn.commit()
        return {"ok": True, "id": session_id, "title": body["title"]}
    finally:
        conn.close()
```

### Error Handling
- **HTTP Exceptions**: Use FastAPI's HTTPException
- **Global Handler**: Server has global exception middleware
- **Logging**: Always log errors with context

```python
# Specific error
if not user_id:
    raise HTTPException(400, "User ID required")

# Network operation with error handling
try:
    response = requests.get(url, timeout=5)
    response.raise_for_status()
    return response.json()
except requests.Timeout:
    logger.error(f"Timeout connecting to {url}")
    raise HTTPException(503, "Service unavailable")
except requests.RequestException as e:
    logger.error(f"Network error: {e}")
    raise HTTPException(502, "Bad gateway")
```

## Testing Guidelines

### Test Structure
- **File naming**: `test_{module}.py`
- **Class naming**: `Test{FeatureName}`
- **Method naming**: `test_{specific_behavior}`

```python
class TestSessionEndpoints:
    def test_create_session(self, client):
        """Test creating a new session."""
        response = client.post("/api/sessions", json={"title": "Test"})
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert "id" in data
```

### Running Tests
```bash
# All tests
pytest tests/ -v

# Specific test file
pytest tests/test_server.py -v

# Specific test method
pytest tests/test_server.py::TestSessionEndpoints::test_create_session -v

# Tests matching pattern
pytest tests/ -k "session" -v
```

## File Patterns

### Adding New Provider
1. Create `backend/{service}/adapters/{provider}.py`
2. Inherit from base adapter class
3. Implement required methods
4. Register in `backend/{service}/registry.py`
5. Add to frontend dropdown
6. Write tests

### Adding New Endpoint
1. Add to `backend/server.py`
2. Use FastAPI decorators
3. Add type hints and docstrings
4. Use HTTPException for errors
5. Write integration test

### Database Schema Changes
1. Create `backend/db/schema_v{X}.sql`
2. Update migration logic in `backend/preflight.py`
3. Test with fresh database

## Important Constants

- **Server Port**: 8080-8090 (auto-scans for free port)
- **Database**: `backend/storage/app.db` (SQLite with WAL mode)
- **Config**: `backend/config/app.json`
- **Audio Cache**: `backend/storage/audio/`
- **Avatars**: `backend/storage/avatars/`

## Security Notes

- **SQL Injection**: Always use parameterized queries
- **File Uploads**: Validate file types and sanitize names
- **API Keys**: Store in config, never log
- **Input Validation**: Use FastAPI's request validation

## Common Pitfalls

1. **Forgetting to close database connections** - Use try/finally or context managers
2. **Not handling async properly** - Use await for async operations
3. **Missing error handling** - Always wrap external service calls
4. **Hardcoding paths** - Use Path objects and relative paths
5. **Not testing edge cases** - Test empty inputs, network failures, etc.

## Development Workflow

1. **Read existing code** - Follow established patterns
2. **Write tests first** - If adding new functionality
3. **Implement feature** - Following style guidelines
4. **Test manually** - `python3 -m py_compile` and run server
5. **Run test suite** - Ensure no regressions
6. **Update documentation** - If needed

Remember: This is a local-first, privacy-focused application. Prioritize user data protection and offline functionality.