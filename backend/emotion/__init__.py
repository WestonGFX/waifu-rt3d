"""
Emotion detection module for waifu-rt3d.

Provides advanced sentiment analysis using HuggingFace transformer models.
``AdvancedSentimentAnalyzer`` is loaded lazily (PEP 562) so that importing
lightweight submodules (``backend.emotion.normalize``,
``backend.emotion.arousal_visuals``) does not pull ``transformers``/``torch``
into every consumer's process — heavy imports happen only when the analyser
class is actually accessed.
"""

from backend.emotion.normalize import (
    CANONICAL_EMOTIONS,
    EMOTION_CATEGORIES,
    EMOTION_LIST,
    ALIAS_MAP,
    EMOTION_EMOJI,
    normalize_emotion,
)

__all__ = [
    "AdvancedSentimentAnalyzer",
    "CANONICAL_EMOTIONS",
    "EMOTION_CATEGORIES",
    "EMOTION_LIST",
    "ALIAS_MAP",
    "EMOTION_EMOJI",
    "normalize_emotion",
]


def __getattr__(name: str):
    if name == "AdvancedSentimentAnalyzer":
        from backend.emotion.advanced_sentiment import AdvancedSentimentAnalyzer
        return AdvancedSentimentAnalyzer
    raise AttributeError(f"module 'backend.emotion' has no attribute {name!r}")
