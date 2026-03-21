"""Content gating system — provider-aware ceiling, intimacy tracking, prompt injection.

Ported from AnimeGirly's battle-tested TypeScript implementation to Python,
with schema-backed persistence and FastAPI integration.

Modules:
    types — ContentRatingLevel, IntimacyState, PhysicalState, ContentGateConfig
    gating — Ceiling resolution, provider caps, content permission checks
    intimacy — Regex-based intimacy scoring and physical state tracking
    prompts — Granular per-level LLM prompt directive builders
"""
