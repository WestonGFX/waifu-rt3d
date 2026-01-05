# .claude Configuration Options - Simple Explanation

**Purpose:** Tell Claude Code how to work with YOUR specific project

Think of it like **training wheels** and **safety rules** for Claude Code when working on your app.

---

## What is `.claude/`?

It's a hidden folder that contains settings files that customize how Claude Code behaves when working in this directory.

**Location:** `/Users/chris/Code/waifu-rt3d/waifu-rt3d_v5.29_full/.claude/`

---

## Current Status

**What you have now:**
```
.claude/
└── settings.local.json  (minimal - just git permissions)
```

**What we can add:**
```
.claude/
├── settings.local.json  (what you have)
└── project.json         (what we'll create) ✨
```

---

## Option 1: Minimal Safety (Easiest) ⭐ RECOMMENDED FOR BEGINNERS

**What it does:** Just prevents Claude from doing dangerous things accidentally

**File:** `.claude/project.json`
```json
{
  "name": "waifu-rt3d",
  "version": "5.30",

  "permissions": {
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)"
    ]
  }
}
```

**In plain English:**
- **Never** let Claude run `rm -rf` (deletes everything)
- **Never** let Claude force-push to git (can break history)

**Benefits:**
- ✅ Super simple
- ✅ Prevents disasters
- ✅ Claude still works normally for everything else

**When to use:** If you're just getting started and want basic protection

---

## Option 2: Helpful Assistant (Balanced) ⭐ RECOMMENDED FOR YOU

**What it does:** Gives Claude context about your project + basic safety rules + helpful reminders

**File:** `.claude/project.json`
```json
{
  "name": "waifu-rt3d",
  "description": "AI Waifu with voice, 3D avatars, and real-time chat",
  "version": "5.30",

  "instructions": [
    "Always read files before editing them",
    "Create a checkpoint before major changes",
    "When adding new features, update docs/",
    "Follow the adapter pattern for LLM/TTS/ASR integrations",
    "Test Python syntax after changes (py_compile)"
  ],

  "permissions": {
    "allow": [
      "Bash(git add:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Read(**/*.py)",
      "Read(**/*.md)"
    ],

    "ask": [
      "Bash(git push:*)",
      "Bash(rm:*)",
      "Edit(backend/db/schema*.sql)"
    ],

    "deny": [
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)"
    ]
  }
}
```

**In plain English:**
- **instructions:** Reminds Claude of best practices for THIS project
- **allow:** Claude can do these without asking (safe operations)
- **ask:** Claude must get your permission first (risky operations)
- **deny:** Claude can never do these (destructive operations)

**Example:**
- ✅ Claude can read Python files without asking
- ❓ Claude asks before pushing to git
- ❌ Claude cannot run `rm -rf`

**Benefits:**
- ✅ Claude "remembers" project-specific rules
- ✅ Prevents accidents
- ✅ Still flexible for development
- ✅ You control risky operations

**When to use:** Most projects, including yours! Good balance of safety and convenience.

---

## Option 3: Detailed Guide (Advanced)

**What it does:** Gives Claude extensive knowledge about your project structure, patterns, and workflows

**File:** `.claude/project.json`
```json
{
  "name": "waifu-rt3d",
  "description": "Real-time 3D AI Waifu companion with voice interaction and VRM avatars",
  "version": "5.30",

  "context": {
    "tech_stack": [
      "FastAPI backend (Python)",
      "Vanilla JavaScript frontend",
      "Three.js for 3D rendering",
      "SQLite database",
      "LM Studio for LLM",
      "Fish Audio for TTS"
    ],

    "architecture": {
      "backend": "Adapter pattern for LLM/TTS/ASR",
      "frontend": "Component-based with viewer",
      "database": "Schema v4 with migrations"
    },

    "key_files": {
      "backend/server.py": "Main FastAPI app (364 lines)",
      "backend/preflight.py": "Startup checks and DB migration",
      "backend/asr/": "Speech recognition adapters",
      "frontend/index_v2.html": "Enhanced UI with sessions",
      "docs/": "Project documentation"
    }
  },

  "instructions": [
    "IMPORTANT: Always read files before editing",
    "IMPORTANT: Create checkpoint before major version changes",
    "When adding adapters: Follow pattern in llm/, tts/, or asr/",
    "When adding endpoints: Add to server.py with docstrings",
    "When modifying database: Update schema_vX.sql and preflight.py",
    "Document new features in docs/FEATURE_*.md format",
    "Test all Python files with py_compile before committing",
    "Update CHANGELOG.md for version changes"
  ],

  "workflows": {
    "adding_feature": [
      "1. Create checkpoint",
      "2. Implement feature with tests",
      "3. Update documentation",
      "4. Test syntax",
      "5. Commit with descriptive message"
    ],

    "fixing_bug": [
      "1. Reproduce the bug",
      "2. Identify root cause",
      "3. Fix and test",
      "4. Add regression test if possible",
      "5. Commit"
    ]
  },

  "permissions": {
    "allow": [
      "Bash(git add:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(python3 -m py_compile:*)",
      "Read(**/*.py)",
      "Read(**/*.md)",
      "Read(**/*.json)",
      "Write(docs/**)",
      "Write(CHECKPOINT_*.md)"
    ],

    "ask": [
      "Bash(git commit:*)",
      "Bash(git push:*)",
      "Bash(rm:*)",
      "Edit(backend/db/schema*.sql)",
      "Edit(backend/server.py)",
      "Edit(backend/config/app.json)",
      "Write(backend/**/*.py)"
    ],

    "deny": [
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)",
      "Bash(git reset --hard:*)",
      "Write(.env)"
    ]
  }
}
```

**In plain English:**
- **context:** Tells Claude what technologies you're using
- **key_files:** Points Claude to important files
- **instructions:** Step-by-step best practices
- **workflows:** How to handle common tasks
- **permissions:** Very granular control over what Claude can do

**Benefits:**
- ✅ Claude has deep understanding of your project
- ✅ Follows your specific workflows
- ✅ Very safe (asks before most changes)
- ✅ Great for team projects

**Drawbacks:**
- ⚠️ Requires more setup time
- ⚠️ Claude asks permission more often
- ⚠️ Can be overly restrictive for rapid prototyping

**When to use:** Large projects, team environments, or when maximum safety is needed

---

## Comparison Table

| Feature | Option 1: Minimal | Option 2: Balanced | Option 3: Detailed |
|---------|------------------|-------------------|-------------------|
| **Complexity** | Very Simple | Simple | Complex |
| **Setup Time** | 30 seconds | 2 minutes | 5-10 minutes |
| **Safety** | Basic | Good | Excellent |
| **Flexibility** | High | Medium-High | Medium |
| **Asks Permission** | Rarely | Sometimes | Often |
| **Best For** | Beginners | Most projects | Teams/Production |

---

## My Recommendation

**Use Option 2 (Balanced)** because:

1. ✅ **You're solo developer** - Don't need team-level restrictions
2. ✅ **Active development** - Need flexibility to move fast
3. ✅ **Good safety net** - Prevents disasters without being annoying
4. ✅ **Project-specific guidance** - Claude remembers your patterns
5. ✅ **Easy to adjust** - Can add more rules later if needed

---

## How Permissions Work

### "allow" (Green Light 🟢)
Claude can do these **without asking you**
- Example: Reading files, running git status
- Use for: Safe, common operations

### "ask" (Yellow Light 🟡)
Claude **must ask permission first**
- Example: Committing code, pushing to git
- Use for: Important but not dangerous operations

### "deny" (Red Light 🔴)
Claude **cannot do these, ever**
- Example: `rm -rf`, force push
- Use for: Destructive operations

---

## How to Create

### For Option 2 (Recommended):

I'll create `.claude/project.json` for you with balanced settings:

```bash
# File will be created at:
# .claude/project.json
```

**What happens after:**
1. Claude Code will read this file automatically
2. Claude will follow the instructions
3. Claude will respect the permissions
4. You can edit it anytime to add/change rules

---

## Common Questions

**Q: Will this slow down Claude?**
A: No! It just adds safety checks. Claude still works the same speed.

**Q: Can I change it later?**
A: Yes! Just edit `.claude/project.json` anytime.

**Q: What if Claude asks permission for something safe?**
A: Move that operation from "ask" to "allow" in the config.

**Q: What if I want Claude to do something it's "denied"?**
A: Remove it from "deny" and add to "ask" instead. You'll approve it each time.

**Q: Can I have different settings per branch?**
A: Yes! Use `.claude/settings.local.json` (not committed to git).

---

## Should You Use It?

**YES if:**
- ✅ You want to prevent accidental file deletion
- ✅ You want Claude to remember project-specific patterns
- ✅ You've had files accidentally deleted before (like v5.30!)
- ✅ You want better control over risky operations

**NO if:**
- ❌ You like living dangerously
- ❌ You want maximum speed at the cost of safety
- ❌ You're just doing quick experiments

---

## Next Steps

**I recommend:** Let me create **Option 2 (Balanced)** for you.

It will:
1. ✅ Prevent the v5.30 situation from happening again
2. ✅ Give Claude helpful reminders about your project
3. ✅ Ask permission before risky operations
4. ✅ Let you work normally for safe operations

**Want me to create it?** Just say "yes" and I'll set it up with sensible defaults for your waifu-rt3d project!

---

## Summary

**What `.claude/project.json` does:**
- 🧠 Gives Claude memory about YOUR project
- 🛡️ Adds safety guardrails
- 📋 Reminds Claude of best practices
- 🎛️ Lets you control what Claude can/can't do

**Think of it as:** A custom instruction manual that Claude reads every time before doing something in your project.

**Bottom line:** It's like having a smart assistant who knows your project's rules and won't accidentally break things!
