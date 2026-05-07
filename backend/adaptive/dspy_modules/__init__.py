"""DSPy-powered adaptive intelligence modules for prompt optimization.

These modules wrap rule-based classifiers in DSPy Signatures so they can be
optimized using few-shot examples derived from user feedback data.
"""

from backend.adaptive.dspy_modules.context_classifier_dspy import (
    classify_context_dspy,
    load_compiled_classifier,
)

__all__ = ["classify_context_dspy", "load_compiled_classifier"]
