---
name: investigate
description: "Structured debugging with hypothesis tracking and circuit breaker after 3 failures"
user_invocable: true
---

# Investigate Bug

Structured debugging workflow with a circuit breaker. User provides the bug description (e.g., `/investigate VRM arms stuck at T-pose after animation`).

## Steps

### 1. Reproduce
- Run the failing code, test, or scenario
- Confirm the bug exists and capture the exact error/behavior
- If it can't be reproduced, report that immediately and ask for more info

### 2. Hypothesize
- State ONE clear hypothesis: "I believe the cause is X because Y"
- Do NOT list multiple hypotheses. Pick the most likely one.

### 3. Test
- Design a minimal test for this hypothesis (add logging, write a test, inspect state)
- Run the test
- Record the result

### 4. Evaluate
- If hypothesis was CORRECT: proceed to fix, test, commit
- If hypothesis was WRONG: record what was ruled out, form the next hypothesis
- Go back to step 2

### 5. Circuit Breaker (after 3 failed hypotheses)
**STOP.** Present findings to user:

```
## Investigation Report — [bug description]

| # | Hypothesis | Test Performed | Result |
|---|------------|---------------|--------|
| 1 | [hypothesis] | [what you tested] | Ruled out: [reason] |
| 2 | [hypothesis] | [what you tested] | Ruled out: [reason] |
| 3 | [hypothesis] | [what you tested] | Ruled out: [reason] |

**What we know:**
- [confirmed facts]

**What's been ruled out:**
- [eliminated causes]

**Suggested next directions:**
- [option A]
- [option B]
```

Ask the user which direction to pursue before continuing. NEVER explore a 4th hypothesis without user approval.

## Hard Rules
- **ONE hypothesis at a time.** Never "try a few things and see what sticks."
- **Always test before concluding.** No armchair debugging.
- **Record everything.** Each hypothesis gets a row in the table.
- **3 strikes = stop.** The circuit breaker is non-negotiable.
