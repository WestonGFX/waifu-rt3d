# API Contract Audit — 2026-05-07

**Backend:** `http://localhost:8080` (server.py, 258 routes loaded)  
**Frontend type source:** `frontends/sakura/src/lib/api.ts` + `types.ts`  
**Method:** curl all major endpoints, compare response shapes to TypeScript types

---

## Critical Finding: Backend Process Is Stale

The running server process was started before several feature commits landed. It exposes **258 routes** but is **missing**:
- All achievement endpoints (`/api/characters/{id}/achievements`, `/api/characters/{id}/achievements/grant`)
- `/api/feedback/preferences` (AIE Phase C)
- Any routes added in the last 3+ commit sessions

**Impact:** Features that depend on these endpoints silently fail in the running app. The UI may show empty states or 404 errors without surfacing them to the user.

**Fix:** Restart the backend server: `.venv/bin/python -m uvicorn backend.server:app --host 0.0.0.0 --port 8080`

---

## Endpoint Test Results

| Endpoint | HTTP | Shape Match | Notes |
|----------|------|-------------|-------|
| `GET /api/config` | 200 ✅ | ✅ | 65 keys returned, all expected |
| `GET /api/characters` | 200 ✅ | ✅ | 14 chars, all expected fields present |
| `GET /api/sessions` | 200 ✅ | ✅ | 403 sessions; `last_message_ts` present (unlisted in api.ts type) |
| `GET /api/sessions/{id}/messages` | 200 ✅ | ✅ | Newer fields (image_url, voice_message_url) omitted when null — correct |
| `GET /api/tts/voices` | 200 ✅ | ⚠️ | Returns `provider` not `engine`; api.ts normalizes via `v.engine \|\| v.provider` |
| `GET /api/tts/models` | 200 ✅ | ✅ | Full model catalog returned |
| `GET /api/characters/{id}/bond` | 200 ✅ | ✅ | `{ok, bond: {bond_level, bond_xp, xp_to_next, tier, relationship_mode}}` |
| `GET /api/characters/{id}/bond/unlocks` | 200 ✅ | ✅ | `{ok, bond_level, tier, unlocked[], next_unlock}` |
| `GET /api/characters/{id}/bond/xp-history` | 200 ✅ | ✅ | 8 events for Rin; empty for others |
| `GET /api/characters/{id}/bond/stories` | 200 ✅ | ✅ | 0 stories (fresh DB) |
| `GET /api/characters/{id}/memory/overview` | 200 ✅ | ✅ | `{ok, user_facts, journal_entries, profile, stats}` |
| `GET /api/v2/memory/list` | 200 ✅ | ✅ | 154 memories, paginated, `{memories, total}` |
| `GET /api/characters/{id}/user-facts` | 200 ✅ | ✅ | `{ok, facts[]}` — 0 facts (test fact was deleted) |
| `GET /api/characters/{id}/lore` | 200 ✅ | ✅ | `{ok, entries[]}` — 0 entries |
| `GET /api/scenarios/templates?char_id={id}` | 200 ✅ | ✅ | 5 templates for Rin |
| `GET /api/content-gate` | 200 ✅ | ⚠️ | Extra `per_character_ceilings` field not in api.ts type (harmless, additive) |
| `GET /api/stats` | 200 ✅ | ✅ | `{cpu, memory, memory_total, memory_percent, provider, llm_model, gpu}` |
| `GET /api/health` | 200 ✅ | ✅ | All services connected |
| `GET /api/characters/{id}/achievements` | 404 ❌ | N/A | Endpoint in server.py but NOT in running process |
| `GET /api/feedback/preferences` | 404 ❌ | N/A | Endpoint in server.py but NOT in running process |

---

## Type Drift Details

### ⚠️ VoiceEntry: `provider` vs `engine` field name
**API returns:** `{id, name, provider, language, gender}`  
**TypeScript type expects:** `{id, name, engine, language, gender, description}`  
**Status:** Handled — `api.ts:getVoices()` maps `v.engine || v.provider || 'unknown'`. No user-visible bug. `description` field is missing from installed Piper voices but optional.

### ⚠️ Session: unlisted `last_message_ts` field
**API returns:** `{id, title, created_ts, is_pinned, is_archived, tags, message_count, last_message_ts}`  
**api.ts type:** Doesn't include `last_message_ts` in the declared Session type  
**Status:** Additive — the field exists in the response and is probably used somewhere in the UI already. Not breaking but the type should be updated.

### ⚠️ Content gate: extra `per_character_ceilings` field
**API returns:** `{global_content_ceiling, age_verified, content_lock_enabled, per_character_ceilings}`  
**api.ts type:** Only types the first 3 fields  
**Status:** Additive, harmless. TypeScript narrowing still works.

---

## Recommendations

1. **Restart backend immediately** — achievement system and AIE feedback preferences are dead in the running server.
2. **Add `last_message_ts` to Session type in types.ts** — minor typing gap.
3. **Add `per_character_ceilings` to ContentGate type** — minor typing gap; field is already used.
4. **VoiceEntry `description` field** — consider making fully optional or adding a fallback in the Piper voice seed data.

