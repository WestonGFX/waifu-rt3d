# Critical Bug Fixes - February 13, 2026

## Issues Found During Testing & Fixes Applied

### 1. ✅ **CRITICAL: Chat Endpoint Crash**
**Error:** `TypeError: int() argument must be a string, a bytes-like object or a real number, not 'NoneType'`
**Location:** `backend/server.py:274`

**Fix:**
```python
# Before (crashes if session_id is None):
session_id = int(body.get("session_id", session_id))

# After (safely handles None):
session_id = int(body.get("session_id") or session_id or 1)
```

---

### 2. ✅ **Settings Modal Layout Issues**
**Problems:**
- Huge blank space cutting off settings controls
- Sidebar taking too much space
- Layout breaks after closing modal

**Fixes:**
- Made modal responsive: `width: 90vw; max-width: 1000px; height: 80vh`
- Reduced sidebar width: `250px → 200px`
- Added `overflow: hidden` to prevent modal breaking main layout
- Fixed close() handler to restore layout CSS variables
- Added `min-height: 0` to scroll area for proper flex shrinking

**Files:** `frontends/neon/css/settings_modal.css`, `frontends/neon/js/components/SettingsModal.js`

---

### 3. ✅ **Right Panel Layout Improvements**
**Problems:**
- Right panel open by default (should be closed)
- Right panel takes too much space

**Fixes:**
- Removed `right-open` class from default HTML (now closed by default)
- Reduced right panel width: `300px → 240px`
- Left panel: 260px (character roster - most used)
- Center panel: 1fr (main view - always visible)
- Right panel: 240px (memory/stats - rarely used, collapsed by default)

**Files:** `frontends/neon/index.html`, `frontends/neon/css/cyber_glass.css`

---

### 4. ✅ **Blank Character Images**
**Problem:** After schema v6 migration, `avatar_2d_url` was NULL for existing characters

**Fix:** Enhanced schema_v6.sql migration to:
- Properly detect VRM files (`.vrm` or `/files/` paths)
- Populate `avatar_2d_url` from existing `avatar_url` if not VRM
- Auto-generate convention-based paths (`/images/{name}_pixel_portrait.png`) for NULL values

**File:** `backend/db/schema_v6.sql`

---

### 5. ✅ **Replaced Simulated Ping with Real LLM Response Time**
**Problems:**
- Ping was simulated fake data
- No visibility into actual LLM performance

**Fix:**
- Removed fake ping stat
- Added real LLM round-trip timing using `performance.now()`
- Shows actual milliseconds from request → response
- Highlights red if > 5 seconds (performance warning)
- Updated dashboard to show: CPU%, RAM GB, LLM ms

**Files:** `frontends/neon/index.html`, `frontends/neon/js/components/Dashboard.js`, `frontends/neon/js/components/ChatInterface.js`

---

## Testing Instructions

After applying these fixes:

1. **Test Chat:**
   ```bash
   # Start backend
   python -m backend.server

   # Open http://localhost:8080
   # Send a message - should work without crashing
   ```

2. **Test Settings Modal:**
   - Open settings (Config button or Ctrl+,)
   - Verify controls are visible and scrollable
   - Close settings
   - Verify layout doesn't break

3. **Test Layout:**
   - Right panel should be hidden by default
   - Left panel shows character roster
   - Center panel (main view) should be large and centered

4. **Test Character Images:**
   - Characters should show their pixel portraits in the grid
   - No blank images

5. **Test LLM Timing:**
   - Send a message
   - Check right panel (if opened) - should show real response time in ms

---

## Remaining Issues (Not Yet Fixed)

Based on user report, these may still need attention:

1. **Text overlapping viewer** - Need screenshot/details to diagnose
2. **Status message clarity** - Which status message is confusing?
3. **Tons of error codes** - Need to see browser console to identify remaining errors

---

## Next Steps

1. **Test all fixes** - Verify they resolve the issues
2. **Update Claude Code** - Upgrade to 2.1.42
3. **Report remaining issues** - Provide browser console errors and screenshots
4. **Consider reverting features** - If too unstable, can rollback to pre-UX-improvements commit

---

## Rollback Instructions (If Needed)

If these fixes don't resolve issues and you want to revert:

```bash
# See recent commits
git log --oneline -10

# Revert to before UX improvements
git checkout <commit-before-improvements>

# Or create a clean branch from that point
git checkout -b stable-pre-ux <commit-hash>
```
