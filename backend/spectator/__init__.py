"""Game Spectator & Coach — VLM-powered game companion.

Provides AI character reactions to browser games via screen capture → VLM
analysis → emotion-tagged commentary.  Supports two modes:

- **Watch mode**: User plays, character spectates and reacts.
- **Play mode**: Character plays autonomously via Playwright input injection.

Architecture:
    FrameAnalyzer  — Stateful VLM game frame analysis with rolling context
    ReactionThrottle — Frequency control (quiet/normal/hyped presets)
    InputController  — Playwright browser automation for AI-plays mode
"""
