---
paths:
  - "backend/**"
---

# Backend & API Rules

## Python Environment
- Always run as `.venv/bin/python` — NEVER bare `python` or `python3` (Conda intercepts).
- Tests: `.venv/bin/python -m pytest backend/tests/ -q --tb=line`
- Install: `.venv/bin/pip install <package>`

## server.py (~17K lines)
- Do not refactor. Add new endpoints at the bottom, inside relevant `# --- SECTION ---` comment blocks.
- Never delete or reorder existing endpoints.

## Database
- Schema changes go in `backend/preflight.py` as `migrate_to_vN()`. Never ALTER tables in application code.
- Use `db_pool.get_connection()` context manager. Never open raw `sqlite3.connect()` in handlers.
- Wrap multi-statement writes in `with conn:` for automatic rollback on failure.

## FastAPI Patterns
- Use `run_in_threadpool()` for blocking SQLite/file I/O in async endpoints.
- Return `JSONResponse` for error payloads; raise `HTTPException` for 4xx.
- Pydantic `BaseModel` for all request bodies — never accept raw `dict`.
- Log with `logger = logging.getLogger(__name__)`, not `print()`.

## Code Style
- Google-style docstrings. Type hints on all signatures.
- Check f-strings for backslash expressions (illegal in Python 3.11-).
