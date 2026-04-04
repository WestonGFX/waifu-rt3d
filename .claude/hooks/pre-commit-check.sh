#!/bin/bash
# PreToolUse hook: Run pytest + tsc before git commit
# Exit 0 = allow commit, Exit 2 = block commit

cd /Users/chris/Code/waifu-rt3d || exit 0

# Run TypeScript check first (faster, catches compile errors)
TSC_OUTPUT=$(cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit 2>&1)
TSC_EXIT=$?

if [ $TSC_EXIT -ne 0 ]; then
  echo "TYPE CHECK FAILED — commit blocked"
  echo "$TSC_OUTPUT" | tail -15
  exit 2
fi

# Run pytest
TEST_OUTPUT=$(.venv/bin/python -m pytest backend/tests/ -q --tb=line 2>&1)
TEST_EXIT=$?

if [ $TEST_EXIT -ne 0 ]; then
  echo "TESTS FAILED — commit blocked"
  echo "$TEST_OUTPUT" | tail -30
  exit 2
fi

# Show test summary for visibility
echo "$TEST_OUTPUT" | grep -E "passed|failed" | tail -2
echo "All checks passed — commit allowed"
exit 0
