"""
Emotion detection module for waifu-rt3d.

Provides advanced sentiment analysis using HuggingFace transformer models.
"""

from backend.emotion.advanced_sentiment import AdvancedSentimentAnalyzer
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
