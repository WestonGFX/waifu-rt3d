"""LoRA fine-tuning pipeline for per-character model adaptation.

This package provides tools to build training corpora from conversation history
and fine-tune character-specific LoRA adapters using Unsloth.
"""
from backend.adaptive.finetune.corpus_builder import build_corpus

__all__ = ["build_corpus"]
