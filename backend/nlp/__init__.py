"""Natural language processing utilities for waifu-rt3d.

Exposes lightweight NLP helpers that run on user messages before they
reach the main LLM.  All modules degrade gracefully when optional
dependencies (transformers, torch) are not installed.
"""

from backend.nlp.sarcasm_detector import SarcasmDetector, SarcasmResult

__all__ = ["SarcasmDetector", "SarcasmResult"]
