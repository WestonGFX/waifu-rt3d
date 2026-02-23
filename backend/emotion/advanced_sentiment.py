"""
Advanced emotion detection using HuggingFace transformers.

This module provides state-of-the-art sentiment analysis using the
j-hartmann/emotion-english-distilroberta-base model, which detects
7 Ekman emotions: anger, disgust, fear, joy, neutral, sadness, surprise.

Example:
    >>> analyzer = AdvancedSentimentAnalyzer()
    >>> result = analyzer.analyze("I'm so happy to see you!")
    >>> print(result["emotion"])  # "joy"
    >>> print(result["intensity"])  # 0.95
"""

from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
import torch
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


class AdvancedSentimentAnalyzer:
    """
    Advanced emotion detection using HuggingFace transformers.

    Uses j-hartmann/emotion-english-distilroberta-base for accurate
    emotion classification with 7 Ekman emotions.

    Attributes:
        model_name: HuggingFace model identifier
        device: Compute device (0 for GPU, -1 for CPU)
        classifier: Transformers pipeline for inference
        emotion_gestures: Mapping of emotions to suggested gestures
    """

    def __init__(
        self,
        model_name: str = "j-hartmann/emotion-english-distilroberta-base",
        use_gpu: bool = False
    ):
        """
        Initialize sentiment analyzer with HuggingFace model.

        Args:
            model_name: HuggingFace model identifier
            use_gpu: Whether to use GPU if available (default: False for CPU-first)

        Example:
            >>> analyzer = AdvancedSentimentAnalyzer()
            >>> # Model loads in ~2-3 seconds on first use
        """
        self.model_name = model_name
        self.device = 0 if (use_gpu and torch.cuda.is_available()) else -1

        logger.info(f"Loading emotion model: {model_name}")
        logger.info(f"Device: {'GPU' if self.device == 0 else 'CPU'}")

        # Load model and tokenizer
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModelForSequenceClassification.from_pretrained(model_name)

            # Create pipeline for easy inference
            self.classifier = pipeline(
                "text-classification",
                model=self.model,
                tokenizer=self.tokenizer,
                device=self.device,
                top_k=None,  # Return all emotions with scores
                max_length=512,
                truncation=True
            )

            logger.info("✅ Emotion model loaded successfully")

        except Exception as e:
            logger.error(f"Failed to load emotion model: {e}")
            raise

        # Emotion to gesture mapping
        self.emotion_gestures = {
            "joy": "nod",
            "surprise": "tilt",
            "fear": "shrug",
            "sadness": None,
            "anger": None,
            "disgust": "tilt",
            "neutral": None
        }

    def analyze(
        self,
        text: str,
        min_confidence: float = 0.3
    ) -> Dict:
        """
        Detect emotion from text with confidence scores.

        Args:
            text: Input text to analyze
            min_confidence: Minimum confidence threshold for emotion detection (0-1)

        Returns:
            dict: {
                "emotion": str,  # Primary emotion (anger/disgust/fear/joy/neutral/sadness/surprise)
                "intensity": float,  # Confidence score (0-1)
                "gesture": str|None,  # Suggested gesture animation
                "all_emotions": List[Dict],  # All predictions with scores
                "secondary_emotion": str|None,  # Second-highest emotion if confident
                "model": str  # Model name used
            }

        Example:
            >>> result = analyzer.analyze("I can't believe this happened!")
            >>> print(result["emotion"])  # "surprise"
            >>> print(result["intensity"])  # 0.89
            >>> print(result["secondary_emotion"])  # "joy"
        """
        # Handle empty/short text
        if not text or len(text.strip()) < 3:
            return self._neutral_response()

        try:
            # Run inference
            predictions = self.classifier(text)[0]  # Returns list of {label, score} dicts

            # Sort by score descending
            predictions = sorted(predictions, key=lambda x: x['score'], reverse=True)

            primary = predictions[0]
            secondary = predictions[1] if len(predictions) > 1 else None

            emotion = primary['label']
            intensity = primary['score']

            # Only return emotion if confidence exceeds threshold
            if intensity < min_confidence:
                emotion = "neutral"
                intensity = 1.0 - primary['score']  # Confidence in neutrality

            # Get gesture for emotion
            gesture = self.emotion_gestures.get(emotion)

            # Include secondary emotion if confident enough
            secondary_emotion = None
            if secondary and secondary['score'] > 0.25:
                secondary_emotion = secondary['label']

            logger.debug(f"Emotion detected: {emotion} ({intensity:.2f})")

            return {
                "emotion": emotion,
                "intensity": round(intensity, 3),
                "gesture": gesture,
                "all_emotions": predictions,
                "secondary_emotion": secondary_emotion,
                "model": self.model_name
            }

        except Exception as e:
            logger.error(f"Emotion analysis failed: {e}")
            return self._neutral_response()

    def _neutral_response(self) -> Dict:
        """
        Return neutral emotion response.

        Returns:
            dict: Neutral emotion data structure
        """
        return {
            "emotion": "neutral",
            "intensity": 1.0,
            "gesture": None,
            "all_emotions": [{"label": "neutral", "score": 1.0}],
            "secondary_emotion": None,
            "model": self.model_name
        }

    def batch_analyze(self, texts: List[str]) -> List[Dict]:
        """
        Analyze multiple texts in batch for efficiency.

        Batch processing is faster than analyzing texts one-by-one.

        Args:
            texts: List of text strings to analyze

        Returns:
            List of emotion analysis dicts

        Example:
            >>> texts = ["I love this!", "This is terrible", "Hmm interesting"]
            >>> results = analyzer.batch_analyze(texts)
            >>> [r["emotion"] for r in results]
            ['joy', 'anger', 'surprise']
        """
        return [self.analyze(text) for text in texts]

    def get_emotion_distribution(self, text: str) -> Dict[str, float]:
        """
        Get probability distribution over all emotions.

        Useful for visualizing emotional complexity.

        Args:
            text: Input text to analyze

        Returns:
            dict: Emotion name -> probability mapping

        Example:
            >>> dist = analyzer.get_emotion_distribution("I'm happy but nervous")
            >>> print(dist)
            {'joy': 0.65, 'fear': 0.25, 'neutral': 0.07, ...}
        """
        result = self.analyze(text)
        return {
            pred['label']: round(pred['score'], 3)
            for pred in result['all_emotions']
        }
