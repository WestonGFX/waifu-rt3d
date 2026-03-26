# Backend & API Conventions

## Python Environment

- Always run Python as `.venv/bin/python` — NEVER bare `python` or `python3` (Conda intercepts them and uses the wrong interpreter).
- Run tests as `.venv/bin/python -m pytest backend/tests/ -q --tb=line`. The `./run.sh test` wrapper does the same.
- Install packages with `.venv/bin/pip install <package>`, never system pip.

## server.py

- `backend/server.py` is ~13K lines. Do not refactor it. Add new endpoints at the bottom of the file, inside the relevant section comment block.
- Group endpoints under existing `# --- SECTION NAME ---` comment blocks. Create a new block only if no suitable one exists.
- Never delete or reorder existing endpoints — other features depend on their relative position for grep-based navigation.

## Database

- All schema changes go in `backend/preflight.py` as a new `migrate_to_vN()` function. Never ALTER tables directly in application code.
- Every migration must increment the schema version constant and be called from the `run_preflight()` chain.
- Use the `db_pool.get_connection()` context manager for all DB access — never open raw `sqlite3.connect()` calls in endpoint handlers.
- Wrap multi-statement writes in a single `with conn:` block so SQLite rolls back on failure.

## Code Style

- Google-style docstrings on every function, class, and module — include Args, Returns, Raises, and at least one Example for public APIs.
- Type hints on all function signatures. Use `Optional[X]` or `X | None`, not bare untyped params.
- Check f-strings for backslash expressions before committing — Python 3.11 and earlier reject backslashes inside `{}`. Use a variable instead.
- Inline comments only for non-obvious logic. Do not comment every line.

## FastAPI Patterns

- Use `run_in_threadpool()` for any blocking SQLite or file I/O called from an async endpoint.
- Return `JSONResponse` for error payloads; raise `HTTPException` for 4xx client errors.
- Pydantic `BaseModel` for all request bodies — never accept raw `dict` from `Request.json()`.
- Log with `logger = logging.getLogger(__name__)`, not `print()`.
