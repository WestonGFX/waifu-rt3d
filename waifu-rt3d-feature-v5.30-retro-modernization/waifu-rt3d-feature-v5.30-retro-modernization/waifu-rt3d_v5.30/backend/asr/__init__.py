"""
ASR (Automatic Speech Recognition) module.
Provides adapters for speech-to-text services.
"""

from .registry import get_asr_adapter

__all__ = ['get_asr_adapter']
