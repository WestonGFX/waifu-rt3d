# V2 Default-Cutover Decision Guide

## Decision Modes
1. Keep preview-gated (`/v2` only).
2. Promote v2 to default (`/`).
3. Roll back to Neon v1 if instability appears.

## Required Cutover Gates
Promote v2 only when all gates pass.

1. Core Flow Parity
- Chat send/receive works with retries.
- Character switching updates viewer context.
- Settings HUD persists key config.
- Memory Bank graph renders with RAG fallback.
- Voice visualizer works with TTS and mic toggle.

2. Stability Window
- 7 consecutive days without P0/P1 defects.
- No data-loss bug in sessions/messages.

3. Performance
- Desktop median interaction feels smooth.
- No repeated browser lockups or GPU crashes.

4. Safe Rollback
- `/` can return to Neon v1 quickly.
- No irreversible schema migration is required for rollback.

## Fast Scoring Rubric
Score each category 0-2.

1. Functional parity
2. Stability
3. Performance
4. Observability
5. Rollback confidence

Interpretation:
- 9-10: Promote to default.
- 7-8: Stay preview-gated, fix high-impact gaps.
- <=6: Do not cut over.

## Recommended Strategy
Use `core + hardening` rather than waiting for complete feature parity.

1. Keep `/v2` as default candidate.
2. Run gate checks daily.
3. Cut over only when score is >=9 and no open P0/P1 issues.
4. Keep `/legacy` or equivalent fallback route available for at least one release cycle.
