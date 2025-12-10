# Git Setup Instructions for Fresh Claude Session

## 📋 Session Context

**Date:** November 20, 2025
**Task:** Initialize git repository with proper structure
**Previous Session:** Created comprehensive documentation (system prompts, vocabulary integration, VRM integration)

---

## ✅ What's Already Done

### Files In Place:
- ✅ **vrm/** folder - Contains VRM model files
- ✅ **vocab/** folder - Contains egirl_vocab v3 files (latest version)
- ✅ **docs/** folder - Contains original project docs + needs 4 new documentation files copied

### What Needs To Be Copied:
From `/Users/chris/Code/waifu-rt3d/docs/` → `./docs/`:
- `SYSTEM_PROMPTS.md` (10 ranked LLM system prompts)
- `VOCABULARY_INTEGRATION.md` (2,537-entry vocab integration guide)
- `VRM_INTEGRATION.md` (Three.js + VRM technical guide)
- `CHECKPOINT_2025-11-20.md` (Project state summary)

---

## 🚀 Tasks for Fresh Session

### Step 1: Copy Documentation

```bash
# You should already be in: /Users/chris/Code/waifu-rt3d/waifu-rt3d_v5.29_full

# Copy the 4 documentation files
cp ../docs/SYSTEM_PROMPTS.md docs/
cp ../docs/VOCABULARY_INTEGRATION.md docs/
cp ../docs/VRM_INTEGRATION.md docs/
cp ../docs/CHECKPOINT_2025-11-20.md docs/

# Verify
ls -la docs/
```

### Step 2: Verify VRM Files

```bash
# Check if Panicandy-no-outline.vrm is in vrm/ folder
ls -la vrm/

# If missing, copy it:
# cp "../VRM models/Panicandy-no-outline.vrm" vrm/
```

### Step 3: Initialize Git

```bash
# Initialize git repository
git init
git branch -m main
```

### Step 4: Create .gitignore

```bash
cat > .gitignore << 'EOF'
# Python
__pycache__/
*.py[cod]
*$py.class
.venv/
venv/
env/
*.egg-info/
*.egg

# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# OS
.DS_Store
*.swp
*.swo
*~
Thumbs.db

# IDE
.vscode/
.idea/
*.sublime-project
*.sublime-workspace
.vscode-test/

# Logs
*.log
logs/
*.log.*

# Environment
.env
.env.local
.env.*.local
.env.production

# Build outputs
dist/
build/
*.pyc
.next/
out/

# Testing
coverage/
.nyc_output/
.pytest_cache/

# Temporary files
*.tmp
*.temp
.cache/
EOF
```

### Step 5: Add and Commit

```bash
# Stage all files
git add .

# Check what will be committed
git status

# Create initial commit
git commit -m "Initial commit: AI Waifu RT3D v5.29 with documentation

Added comprehensive production-ready documentation:
- 10 ranked LLM system prompts for AI waifu personalities
- Vocabulary integration guide (2,537-entry egirl_vocab v3 system)
- VRM model integration guide (Three.js + @pixiv/three-vrm)
- Project checkpoint and implementation roadmap

Included assets:
- VRM models (Panicandy, Tsuki, Panicandy-no-outline)
- egirl_vocab v3 with voice styles and prosody data
- Original v5.29 app codebase (backend + frontend)

🤖 Generated with Claude Code
https://claude.com/claude-code

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Step 6: Verify Setup

```bash
# Check commit
git log --oneline

# Check status (should be clean)
git status

# See what files are tracked
git ls-files | head -20
```

---

## 📊 Expected Final Structure

```
waifu-rt3d_v5.29_full/
├── .git/                    ← Git repository
├── .gitignore              ← Proper exclusions
├── backend/                ← Python backend
├── frontend/               ← HTML/JS frontend
├── docs/                   ← Documentation
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── SYSTEM_PROMPTS.md          ← NEW
│   ├── VOCABULARY_INTEGRATION.md   ← NEW
│   ├── VRM_INTEGRATION.md          ← NEW
│   └── CHECKPOINT_2025-11-20.md    ← NEW
├── vrm/                    ← VRM 3D models
│   ├── Panicandy.vrm
│   ├── Panicandy-no-outline.vrm
│   └── Tsuki.vrm
├── vocab/                  ← egirl_vocab v3 system
│   ├── egirl_vocab_v3.json
│   ├── egirl_vocab_v3.md
│   ├── egirl_vocab_v3.txt
│   ├── voice_styles_v2.json
│   ├── style_router.json
│   ├── schema_v3.json
│   ├── style_triggers.csv
│   └── README_PACK.txt
├── tests/
├── tools/
├── README.md
├── requirements.txt
├── run.sh
└── install.sh
```

---

## 🎯 After Git Setup

Once git is initialized, you're ready to:

1. **Start Development:**
   - Read `docs/SYSTEM_PROMPTS.md` - Pick an LLM personality
   - Set up LM Studio with chosen system prompt
   - Test conversation flow

2. **Integrate VRM Models:**
   - Follow `docs/VRM_INTEGRATION.md`
   - Install Three.js and @pixiv/three-vrm
   - Create VRMViewer component

3. **Add Vocabulary System:**
   - Follow `docs/VOCABULARY_INTEGRATION.md`
   - Implement Context Injection strategy (recommended)
   - Test slang/emoji frequency

---

## 💡 Quick Reference

**Documentation Quick Links:**
- System Prompts: `docs/SYSTEM_PROMPTS.md` (Start here!)
- Vocabulary: `docs/VOCABULARY_INTEGRATION.md`
- VRM Models: `docs/VRM_INTEGRATION.md`
- Checkpoint: `docs/CHECKPOINT_2025-11-20.md`

**Key Assets:**
- Recommended VRM: `vrm/Panicandy-no-outline.vrm`
- Main Vocab: `vocab/egirl_vocab_v3.json`
- Voice Styles: `vocab/voice_styles_v2.json`

---

## ✅ Success Checklist

After running the commands above, you should have:
- [ ] Git repository initialized on `main` branch
- [ ] All 4 new documentation files in `docs/`
- [ ] Clean `.gitignore` excluding build/cache files
- [ ] Initial commit with all project files
- [ ] Clean `git status` output
- [ ] Ready to start development!

---

**Next Session Command:**
```bash
cd /Users/chris/Code/waifu-rt3d/waifu-rt3d_v5.29_full
claude
```

Then run the steps above! 🚀
