# Python Setup Guide

> Everything you need to know about Python versions, virtual environments,
> and running this project without long janky commands.

---

## TL;DR — just run the app

```bash
./run.sh          # start the server on http://localhost:8080
./run.sh dev      # start with hot-reload (auto-restarts on code changes)
./run.sh test     # run all backend unit tests
./run.sh both     # start backend + Sakura frontend dev server together
```

That's it. You never need to think about Python paths or venvs again.

---

## Why your machine has multiple Pythons

You have three Python installations:

| Command | Path | Version | Source |
|---------|------|---------|--------|
| `python` | `/opt/anaconda3/bin/python` | 3.x (Anaconda) | Conda (prepended to PATH by `conda init` in `~/.zshrc`) |
| `python3` | `/opt/homebrew/opt/python@3.14/bin/python3.14` | 3.14.3 | Homebrew |
| `python3.14` | same as above | 3.14.3 | Homebrew |

**The conflict:** `conda init` in your `~/.zshrc` runs every time you open a terminal and prepends `/opt/anaconda3/bin` to `PATH`, so `python` always resolves to Anaconda's Python — not the project's Python.

`python3` and `python3.14` both point to Homebrew Python 3.14.3 (they're the same binary), which is what this project uses.

---

## What is a virtual environment (.venv)?

A virtual environment is an isolated copy of Python + its packages.
Instead of installing every project's dependencies globally (where they'd conflict),
each project gets its own sandbox.

```
waifu-rt3d/
├── .venv/               ← the virtual environment for this project
│   ├── bin/
│   │   ├── python       ← Python 3.14.3 (symlink to Homebrew)
│   │   ├── python3      ← same
│   │   ├── pip          ← pip for this env only
│   │   └── pytest       ← test runner, installed into this env
│   └── lib/
│       └── python3.14/
│           └── site-packages/   ← fastapi, uvicorn, etc. all live here
```

The `.venv/` for this project was created with `python3 -m venv .venv` and has
all dependencies from `requirements.txt` installed inside it.

---

## The three ways to use the venv

### Option 1: Use `run.sh` (recommended)
The `run.sh` script calls `.venv/bin/python` directly. No activation needed.

```bash
./run.sh              # server
./run.sh test         # tests
./run.sh dev          # hot-reload dev server
```

### Option 2: Activate the venv for your terminal session
```bash
source .venv/bin/activate
```
After this, `python`, `pip`, `pytest` all point into `.venv/` automatically
until you close the terminal or run `deactivate`.

```bash
source .venv/bin/activate
python -m uvicorn backend.server:app --port 8080     # works
pytest backend/tests/                                # works
deactivate                                           # done
```

### Option 3: Use explicit paths (what Claude Code does internally)
```bash
.venv/bin/python -m uvicorn backend.server:app --host 0.0.0.0 --port 8080
.venv/bin/python -m pytest backend/tests/ -q
.venv/bin/pip install some-package
```

This works from any directory and without activating — useful for scripts.

---

## Making Python "just work" system-wide (optional)

If you want `python` in a new terminal to always be Homebrew Python 3.14
(instead of Anaconda), add this to the **end** of your `~/.zshrc`
(after the conda block):

```zsh
# Prefer Homebrew Python 3.14 as default `python`
# (overrides Anaconda's python without disabling conda itself)
alias python="python3.14"
alias python3="python3.14"
alias pip="pip3.14"
```

Then `source ~/.zshrc` and verify:
```bash
python --version   # should say Python 3.14.3
```

> **Note:** This doesn't break conda. `conda activate myenv` still works —
> activating a conda environment always overrides these aliases.

### Auto-activating the project venv with direnv (power-user option)

Install `direnv` and it will auto-activate `.venv` whenever you `cd` into
the project directory:

```bash
brew install direnv

# Add to ~/.zshrc (after conda block):
eval "$(direnv hook zsh)"
```

Then in the project root:
```bash
echo 'source .venv/bin/activate' > .envrc
direnv allow
```

Now any `cd ~/Code/waifu-rt3d` automatically activates the venv and
`cd` out deactivates it.

---

## Fixing a broken venv

If the venv is missing or broken, just re-run the setup script:

```bash
./setup.sh --repair
```

Or rebuild it from scratch:
```bash
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Quick reference

| Task | Command |
|------|---------|
| Start server | `./run.sh` |
| Start with hot-reload | `./run.sh dev` |
| Run tests | `./run.sh test` |
| Start frontend dev | `./run.sh frontend` |
| Start both | `./run.sh both` |
| Install a new package | `source .venv/bin/activate && pip install pkg` |
| Add to requirements.txt | Add the package name, then commit |
| Check Python version | `.venv/bin/python --version` |
| Check installed packages | `.venv/bin/pip list` |
