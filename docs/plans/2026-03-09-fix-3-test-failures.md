# Fix 3 Pre-existing Test Failures

## Context
3 tests fail because the test DB schema in `conftest.py` is missing columns added in schema v36 (`bible_path`, `bible_enabled`, `bible_sections`). The server's `list_characters()` SELECT references these columns, fails silently, and falls back to a minimal 11-column query that omits `background_url`, `background_mode`, and `capability_profile`.

## Root Cause
- `backend/tests/conftest.py:_create_schema()` — test `characters` table missing `bible_path TEXT`, `bible_enabled INTEGER DEFAULT 0`, `bible_sections TEXT`
- `backend/server.py:4926-4937` — main SELECT includes all 37 columns including bible fields
- `backend/server.py:4938-4948` — except fallback returns only 11 columns → all positional lookups for idx > 10 return None

## Fix (single file change)

### `backend/tests/conftest.py`
Add 3 columns to the `characters` CREATE TABLE (after `emotion_portraits_mode`):
```sql
bible_path TEXT,
bible_enabled INTEGER DEFAULT 0,
bible_sections TEXT
```

## Files to modify
- `backend/tests/conftest.py` — add 3 missing columns to test schema

## Verification
1. `cd /Users/chris/Code/waifu-rt3d && .venv/bin/python -m pytest backend/tests/test_capability_profile.py backend/tests/test_character_settings.py -v`
2. `cd /Users/chris/Code/waifu-rt3d && .venv/bin/python -m pytest backend/tests/ -q --tb=line` — expect 250 passed, 0 failed
