"""Content gating system — provider-aware ceiling, intimacy tracking, prompt injection.

Ported from AnimeGirly's battle-tested TypeScript implementation to Python,
with schema-backed persistence and FastAPI integration.

Modules:
    types   — ContentRatingLevel, IntimacyState, PhysicalState, ContentGateConfig
    gating  — Ceiling resolution, provider caps, bond-gated content unlocking,
               and content permission checks.
               Key exports: resolve_effective_ceiling, bond_allowed_ceiling,
               get_bond_gated_level, BOND_CONTENT_THRESHOLDS
    intimacy — Regex-based intimacy scoring and physical state tracking
    prompts  — Granular per-level LLM prompt directive builders
"""
