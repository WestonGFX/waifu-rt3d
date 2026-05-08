# Database Health Audit — 2026-05-07

**DB:** `backend/storage/app.db`  
**Schema version in DB:** v75  
**Latest schema in code:** v78  
**Tables audited:** all non-virtual tables  

---

## Critical Issues

### CRIT-001 — Schema lag: DB at v75, code at v78
**Impact:** High — migrations v76, v77 (`character_loras`), v78 (`dspy_compiled_programs`) tables are missing from the live DB. Any backend code that writes to those tables will get `sqlite3.OperationalError: no such table`. The AIE Phase C LoRA and DSPy features will silently fail on first use.  
**Fix:** Backend needs preflight to run on next start. It should auto-apply when the server restarts.

### CRIT-002 — 3 characters missing relationship rows
**Impact:** High — Mika (Mikazuki) [9], Kaede (Suzuha) [10], Luna (Tsukimi) [11] have no row in `character_relationships`. Bond/affinity tracking, XP accumulation, covenant features won't work for them.  
**Fix:** Run `INSERT OR IGNORE INTO character_relationships (char_id, affinity) VALUES (9, 0.5), (10, 0.5), (11, 0.5)` (preflight migration or seed script).

---

## High Priority Issues

### HIGH-001 — `interactions` counter stuck at 0 for all characters
**Impact:** High — every character shows `interactions=0` even though Rin has 8 XP events and 132 XP. The counter that tracks how many messages have been exchanged isn't being incremented.  
**Fix:** Investigate `character_relationships` update path — likely the increment is missing from the message-receive handler.

### HIGH-002 — bond_xp in `character_relationships` inconsistent with `bond_xp_events`
**Impact:** High — Brittney and Dae show `bond_xp=26` in `character_relationships` but have 0 rows in `bond_xp_events`. Either xp was set directly (bypassing the events table) or events were deleted but xp wasn't reset.  
**Affected:** Brittney (xp=26, 0 events), Dae/Neciridae (xp=26, 0 events)

### HIGH-003 — All 14 characters missing `backstory`, `chara_description`, `image_style`
**Impact:** High for character richness — these fields power the Character Bible, CHARA export, and image generation style. All are NULL for all 14 characters.  
**Fix:** Character Bible + `apply_character_styles.py` work (already on roadmap).

---

## Medium Priority Issues

### MED-001 — 372 empty sessions (93% of 403 total)
**Impact:** Medium — most sessions have no messages. These are ghost sessions from character switching, onboarding, or uncompleted conversations. Wastes storage and muddies any "session count" analytics.  
**Fix:** Add a cleanup job that deletes sessions older than N days with 0 messages. Or add a schema-level trigger.

### MED-002 — 47 messages with NULL `char_id`
**Impact:** Medium — these messages can't be attributed to a character. Likely system-injected messages or messages from pre-char_id schema. Won't cause errors but skews per-character message counts.

### MED-003 — Brittney missing `system_prompt_lite`
**Impact:** Medium — the `lite` prompt variant is used in compact context mode. Brittney falls back to full prompt in all contexts. She's the only character missing this.

---

## Low Priority / Informational

| Item | Value | Note |
|------|-------|------|
| Lore entries | 0 | Lorebook is empty — no content yet |
| Scenario templates | 65 | 65 builtin, 0 custom |
| Scenario categories | null | `category` column appears empty for all rows |
| Memories distribution | T1:86, T2:131, T3:1 | Healthy. Only 1 permanent memory. |
| Memories without embedding | 0 | All have embeddings set |
| Orphaned messages | 0 | Clean |
| Content gate | explicit/age_verified=true | As configured |
| Only Rin has XP history | 132 XP, 8 events | All others at 0 (fresh dev DB) |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| Critical | 2 | Schema lag (v75 vs v78), 3 chars missing relationship rows |
| High | 3 | interactions=0 bug, bond_xp inconsistency, all chars missing Bible fields |
| Medium | 3 | 372 empty sessions, 47 null char_id messages, Brittney missing lite prompt |
| Low | 5 | No lore entries, no custom scenarios, null category, few T3 memories, only Rin has XP |

