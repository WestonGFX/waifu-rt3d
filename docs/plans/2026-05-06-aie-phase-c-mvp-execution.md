# AIE Phase C MVP — Execution Plan

**Date:** 2026-05-06
**Status:** Phase 0 IN PROGRESS (session 35)
**Scoping doc:** `docs/plans/2026-05-06-aie-phase-c-scoping.md`
**Tier:** MVP — single LoRA (Sakura) + basic DSPy (context_classifier)
**Schema starting point:** v75

> Architecture decisions locked in scoping doc (Section 6 Resolved):
> 1. Single locked base model (Qwen 2.5 7B Instruct)
> 2. Train on Windows (RTX 5080/3070), serve everywhere via PEFT
> 3. Hybrid feedback subsystem: explicit 👍/👎 + implicit signals, user-controlled per-source toggles

---

## Phase 0 — Feedback Subsystem (Prereq for Strands A & B)

**Est:** 16-24h · **Schema:** v76

### 0.1 Schema migration (v76)

File: `backend/preflight.py` — append `migrate_to_v76()` after `migrate_to_v75()`

```sql
-- Two new columns on privacy_settings (singleton, id=1):
ALTER TABLE privacy_settings ADD COLUMN explicit_signals_enabled INTEGER DEFAULT 1;
ALTER TABLE privacy_settings ADD COLUMN implicit_signals_enabled INTEGER DEFAULT 1;

-- Per-message feedback record
CREATE TABLE IF NOT EXISTS message_feedback (
  message_id     INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  explicit_signal INTEGER,        -- -1 (👎), +1 (👍), NULL (no click)
  implicit_score  REAL,           -- computed at session-end, [-1.0, +1.0]
  final_score     REAL,           -- weighted combination
  computed_at     TEXT NOT NULL,
  signal_version  INTEGER NOT NULL DEFAULT 1
);

-- Tunable per-implicit-signal weights
CREATE TABLE IF NOT EXISTS aie_signal_weights (
  signal_name TEXT PRIMARY KEY,
  weight      REAL NOT NULL,
  updated_at  TEXT NOT NULL
);
-- Seed defaults (INSERT OR IGNORE so re-runs are safe):
--   regenerate: -0.5
--   reply_length: +0.1
--   voice_toggle: +0.15
--   session_continuation: +0.1
--   abrupt_close: -0.05
--   llm_judge: +0.2 (placeholder, not yet computed)
```

Also update `ensure_db()`:
- Add `if version < 76:` block calling `migrate_to_v76(con)`
- Change final-version checks from 75 → 76
- Update log message

### 0.2 Backend feedback module

Files (all NEW):
- `backend/adaptive/feedback/__init__.py` — exports `collect_implicit_signals`, `score_message`, `record_explicit_signal`
- `backend/adaptive/feedback/signal_collector.py` — collect implicit signals at session boundary
- `backend/adaptive/feedback/scorer.py` — weighted-sum math from scoping doc Section 3.4.2

**scorer.py logic:**
```python
alpha_explicit = 0.7   # when explicit signal present
alpha_implicit = 0.3   # always present
# if no explicit click: alpha_explicit = 0
final = alpha_explicit * explicit + alpha_implicit * implicit_score
```

Pattern: follow `backend/adaptive/signals.py` structure (imports, logger, docstrings, type hints).

### 0.3 Server endpoints

Add to `backend/server.py` under `# --- ADAPTIVE INTELLIGENCE ---` section:

```
POST   /api/feedback/explicit/{message_id}   — record 👍/👎 click
GET    /api/feedback/preferences             — read explicit/implicit enabled flags from privacy_settings
PATCH  /api/feedback/preferences             — update those flags
```

Request body for POST explicit: `{"signal": 1}` or `{"signal": -1}` or `{"signal": null}` (clear)

### 0.4 TypeScript types

File: `frontends/sakura/src/lib/types.ts` — add:
```typescript
export interface FeedbackPreferences {
  explicit_signals_enabled: boolean;
  implicit_signals_enabled: boolean;
}

export interface MessageFeedback {
  message_id: number;
  explicit_signal: 1 | -1 | null;
  implicit_score: number | null;
  final_score: number | null;
}
```

### 0.5 API wrappers

File: `frontends/sakura/src/lib/api.ts` — add:
```typescript
recordFeedback(messageId: number, signal: 1 | -1 | null): Promise<void>
getFeedbackPreferences(): Promise<FeedbackPreferences>
setFeedbackPreferences(prefs: Partial<FeedbackPreferences>): Promise<FeedbackPreferences>
```

### 0.6 FeedbackButtons.tsx

File: `frontends/sakura/src/components/FeedbackButtons.tsx` (NEW)

- ThumbsUp / ThumbsDown Lucide icons
- Default opacity 30%, hover → 100%
- Click latches: first click sets signal, second click clears (toggle)
- Props: `messageId: number`, `initialSignal?: 1 | -1 | null`, `onSignalChange?: (signal) => void`
- Calls `api.recordFeedback()` on click
- Gated: only renders if `config.explicit_signals_enabled` is true
- Style: `var(--color-text-tertiary)` default, accent colors (ThumbsUp → green, ThumbsDown → red) when latched

### 0.7 DialogueBubble.tsx modification

Slot `<FeedbackButtons>` under assistant messages in the hover action bar.
- Only render for `message.role === 'assistant'`
- Gated by `feedbackEnabled` prop (passed from ChatThread reading appStore config)
- Position: BEFORE the delete button, AFTER the continue button

### 0.8 SettingsView.tsx modification

In Settings → Privacy pane, add "Feedback Signals" subsection:
- Two toggle switches: "Show feedback buttons on messages" + "Allow implicit feedback collection"
- One-paragraph explainer: "Feedback stays local. Used to improve how your character responds over time."
- Calls `api.setFeedbackPreferences()` on toggle
- Reads initial state from `api.getFeedbackPreferences()` on mount

### 0.9 Tests

**Backend** (`backend/tests/test_feedback.py`):
- `test_record_explicit_feedback_thumbs_up`
- `test_record_explicit_feedback_thumbs_down`
- `test_record_explicit_feedback_clear`
- `test_get_feedback_preferences_defaults`
- `test_update_feedback_preferences`
- `test_scorer_with_explicit_signal`
- `test_scorer_implicit_only`
- `test_scorer_no_signal`
- `test_signal_weights_seeded_on_migration`

**Frontend** (`frontends/sakura/src/test/FeedbackButtons.test.tsx`):
- renders nothing when `explicit_signals_enabled` is false
- renders ThumbsUp + ThumbsDown when enabled
- clicking ThumbsUp calls recordFeedback with +1
- clicking ThumbsUp twice clears (sends null)
- ThumbsDown sets -1

---

## Phase 1 — Strand A: LoRA Fine-Tuning (MVP, 1 character)

**Est:** 24-30h · **Schema:** v77

### Files

| Action | Path |
|--------|------|
| NEW | `backend/adaptive/finetune/__init__.py` |
| NEW | `backend/adaptive/finetune/corpus_builder.py` |
| NEW | `backend/adaptive/finetune/trainer.py` (Unsloth wrapper) |
| NEW | `backend/adaptive/finetune/eval_harness.py` |
| NEW | `backend/llm/adapters/peft_local.py` |
| NEW | `scripts/train_character_lora.py` |
| MODIFY | `backend/preflight.py` — `migrate_to_v77()`: character_loras table |
| MODIFY | `backend/server.py` — training-status, wipe-loras, force-retrain endpoints |

### v77 schema

```sql
CREATE TABLE IF NOT EXISTS character_loras (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  char_id      INTEGER NOT NULL REFERENCES characters(id),
  base_model   TEXT NOT NULL,
  adapter_path TEXT NOT NULL,
  trained_at   REAL NOT NULL,
  eval_score   REAL,
  is_active    INTEGER DEFAULT 0,
  meta         TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_char_loras_active ON character_loras(char_id) WHERE is_active=1;
```

### Decision gate

After training Sakura's LoRA: does her voice audibly sharpen in 30 manual eval prompts? If yes → Standard tier. If no → kill Strand A, reroute to memory improvements.

---

## Phase 2 — Strand B: Basic DSPy (context_classifier)

**Est:** 8-12h · **Schema:** v78

### Files

| Action | Path |
|--------|------|
| NEW | `backend/adaptive/dspy_modules/__init__.py` |
| NEW | `backend/adaptive/dspy_modules/context_classifier_dspy.py` |
| NEW | `backend/adaptive/dspy_modules/optimizer_runner.py` |
| MODIFY | `backend/adaptive/context_classifier.py` — feature-flag switch |
| MODIFY | `backend/preflight.py` — `migrate_to_v78()`: dspy_compiled_programs table |

### v78 schema

```sql
CREATE TABLE IF NOT EXISTS dspy_compiled_programs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  module_name  TEXT NOT NULL,
  version      INTEGER NOT NULL,
  signature    TEXT NOT NULL,
  fewshot_json TEXT,
  compiled_at  REAL NOT NULL,
  optimizer    TEXT NOT NULL,
  score        REAL,
  is_active    INTEGER DEFAULT 0
);
```

---

## Status Log

- 2026-05-06 Phase 0: ✓ DONE (session 35) — commit `6af30cc`. schema v76, feedback module, 3 endpoints, FeedbackButtons UI, 57 new tests (2762 backend / 276 frontend all passing).
- 2026-05-06 Phase 1: ✓ DONE (session 36) — commits `c59dc10` + `420eeea`. schema v77 (character_loras), corpus_builder, trainer, eval_harness, peft_local adapter, CLI script, 3 server endpoints (status/wipe/retrain), 28 new tests (2790 backend all passing).
- 2026-05-06 Phase 2: ✓ DONE (session 36) — commit `e00c80c`. schema v78 (dspy_compiled_programs), DSPy Signature+Module+optimizer_runner, feature-flag switch in context_classifier, recursion-safe fallback via _classify_rule_based, 53 new tests (2843 backend all passing).
