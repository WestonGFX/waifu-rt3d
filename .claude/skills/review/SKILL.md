# UI Review Checklist
Before committing any frontend changes:
1. Grep for `display: none` in modified CSS — prefer `visibility: hidden` or `opacity: 0` for transitions
2. Check all modified HTML templates for broken image/asset paths
3. Verify settings modal still renders by reading settings-related JS
4. Run `python -m pytest tests/ -x --tb=short` if tests exist
5. List all files changed and potential side effects
