# Remaining Session Plan: Quick Wins After Commit

## Context

87-model catalog + avatar auto-select + helper retry are done and need committing. After commit, tackle 2-3 quick wins before ending session. Save the big settings refactor (16→5 tabs) for a fresh session.

## Step 1: Commit current work

Commit all 18 changed files as one logical commit: "Add 87-model marketplace catalog, avatar auto-select, helper retry polling"

## Step 2: Quick wins (pick 2-3)

### 2A. Content gating simplification (Priority 1C)
**File**: `src/components/settings/ContentSettingsPanel.tsx`
**Change**: Replace multi-dialog age verification with single inline toggle. One-time "I'm 18+" checkbox. Content ceiling selector front-and-center.
**Time**: ~15 min

### 2B. Chat input → textarea (Priority 2A)
**File**: `src/components/chat/ChatInputBar.tsx`
**Change**: Replace `<input type="text">` with auto-expanding `<textarea>`. Add Shift+Enter hint.
**Time**: ~10 min

### 2C. Tag consolidation (Priority 3D)
**File**: `helper/app/catalog.py`
**Change**: Script to reduce 85 unique tags → 15 core tags across all 87 entries.
**Time**: ~10 min

## Step 3: Commit quick wins, update PR

## Verification
- `npx tsc --noEmit` — clean
- `npx vitest run` — 374+ pass
- Python syntax clean
