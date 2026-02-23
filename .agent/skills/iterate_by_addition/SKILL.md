# Skill: Iterate by Addition (User Preference)

## Description

This skill enforces the user's preferred workflow of "Iterative Addition" rather than "Refactoring/Rewriting". It prioritizes OBJECTIVE progress (functional code) over SUBJECTIVE polish (docs/wording) unless explicitly requested.

## Rules

1. **Iterate by Addition**:
   - Do NOT rewrite entire files to change wording or style.
   - Append new sections or features.
   - Only modify existing code if it is BROKEN or explicitly requested.

2. **Objective Over Subjective**:
   - Focus on *Features* (e.g., "Add a button", "Fix a bug").
   - Avoid "Improving" things that aren't broken (e.g., "Refining the tone of the README").

3. **Stop & Check**:
   - Don't guess what "Perfect" is.
   - Implement the functional minimum, then ASK.

4. **Preservation**:
   - Never delete legacy files/code unless confirmed "Safe to Delete".
   - Use `_BACKUP_ROOT` for archiving if needed.
