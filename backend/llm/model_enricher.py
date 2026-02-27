"""LLM model capability enrichment via HuggingFace API.

Given a local model identifier (LM Studio path, Ollama name, HuggingFace
repo ID), this module resolves the corresponding HuggingFace model card and
config.json to auto-detect:

- Context window size (``max_position_embeddings`` from config.json)
- Vision capability (pipeline_tag, tags, name patterns)
- Tool/function-calling capability (tags, name patterns, instruct heuristics)
- Reasoning/thinking mode (QwQ, DeepSeek-R1, Qwen3 thinking, etc.)
- Architecture family (``model_type`` from config.json)
- Parameter count → intelligence tier (tiny/small/medium/large/xl)

All HF HTTP calls are synchronous and bounded by ``HF_TIMEOUT`` seconds.
Results are **not** cached at this layer — call sites should cache as needed.

Example::

    >>> from backend.llm.model_enricher import enrich_model
    >>> caps = enrich_model("lmstudio-community/Qwen3-8B-GGUF/Qwen3-8B-Q4_K_M.gguf")
    >>> caps['tier']
    'medium'
    >>> caps['supports_thinking']
    True
    >>> caps['context_window']
    32768
"""

from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

HF_API = "https://huggingface.co/api"
HF_CDN = "https://huggingface.co"
HF_TIMEOUT = 8.0  # seconds per request — keep snappy for UI interactions

# ── Capability signal sets ────────────────────────────────────────────────────

_VISION_PIPELINE_TAGS = {"image-text-to-text", "visual-question-answering"}
_VISION_TAGS = {"vision", "multimodal", "vlm", "image-text-to-text",
                "visual-question-answering", "image-understanding"}
_VISION_PATTERNS = ["llava", "vision", "vlm", "bakllava", "moondream",
                    "cogvlm", "qwen-vl", "internvl", "minicpm-v", "phi-3-vision",
                    "phi-4-vision", "phi3v", "pixtral", "molmo", "paligemma",
                    "idefics", "chameleon", "fuyu"]

_TOOL_TAGS = {"function-calling", "tool-use", "tool_use",
              "function_calling", "json-mode", "structured-output"}
_TOOL_PATTERNS = ["hermes", "functionary", "gorilla", "nexusraven",
                  "toolbench", "mistral-nemo", "granite"]
# Modern instruct families that universally support tool calling:
_TOOL_INSTRUCT_FAMILIES = ["llama-3", "llama3", "gemma-3", "gemma3",
                            "qwen2", "qwen3", "mistral", "phi-3", "phi-4",
                            "phi3", "phi4", "command-r", "claude"]

_THINKING_TAGS = {"reasoning", "thinking", "chain-of-thought",
                  "extended-thinking", "o1"}
_THINKING_PATTERNS = ["qwq", "-r1", "deepseek-r1", "deepseek-r2",
                      "reasoning", "o1-", "o3-", "cogito", "sky-t1",
                      "thinker", "-thinking"]
# Qwen3 supports thinking mode when enabled (not the default)
_QWEN3_THINKING_PATTERN = re.compile(r"qwen3", re.IGNORECASE)


# ── HF resolution helpers ─────────────────────────────────────────────────────

def _extract_hf_repo(model_id: str) -> Optional[str]:
    """Extract a HuggingFace repo ID from a raw model identifier.

    Handles three common formats::

        "lmstudio-community/Qwen3-8B-GGUF/Qwen3-8B-Q4_K_M.gguf"
            → "lmstudio-community/Qwen3-8B-GGUF"  (3-part LM Studio GGUF path)

        "google/gemma-3-12b"
            → "google/gemma-3-12b"  (already a valid HF repo ID)

        "qwen3-8b"
            → None  (short name — needs HF search)

    Args:
        model_id: Raw model identifier string from LM Studio, config, etc.

    Returns:
        A ``publisher/repo`` string or ``None`` if the ID is a short name.
    """
    model_id = model_id.strip().strip("\"'")
    if not model_id or ":" in model_id:
        # Ollama format "model:tag" — no HF path can be extracted
        return None

    parts = model_id.split("/")
    if len(parts) >= 3:
        # e.g. "lmstudio-community/Qwen3-8B-GGUF/Qwen3-8B-Q4_K_M.gguf"
        last = parts[-1]
        if last.endswith((".gguf", ".bin", ".safetensors", ".pt", ".ggml")):
            return f"{parts[0]}/{parts[1]}"
        # 3-part without extension — take first two
        return f"{parts[0]}/{parts[1]}"
    elif len(parts) == 2:
        return model_id  # Already "publisher/repo"

    return None  # Short name — caller must use _search_hf_repo()


def _search_hf_repo(query: str) -> Optional[str]:
    """Search HuggingFace for the best matching repo for a short model name.

    Sorts by download count so popular community models rank first.

    Args:
        query: A short search query (e.g. "qwen3-8b" or "llama-3.1-8b-instruct").

    Returns:
        The top-ranked repo ID string or ``None`` if search failed.
    """
    # Normalise: Ollama "model:tag" → "model tag"
    query = re.sub(r"[:_]", " ", query).split(".")[0].strip()
    if not query:
        return None

    try:
        import requests as _req
        resp = _req.get(
            f"{HF_API}/models",
            params={"search": query, "sort": "downloads", "direction": -1, "limit": 5},
            timeout=HF_TIMEOUT,
        )
        if resp.status_code == 200:
            results = resp.json()
            if results:
                return results[0].get("id")
    except Exception as exc:
        logger.debug("HF search failed for '%s': %s", query, exc)
    return None


def _fetch_model_card(repo_id: str) -> dict:
    """Fetch HuggingFace model card metadata for a repo.

    Args:
        repo_id: HuggingFace repo ID (``publisher/repo``).

    Returns:
        Raw metadata dict (pipeline_tag, tags, card_data, etc.) or ``{}``.
    """
    try:
        import requests as _req
        resp = _req.get(f"{HF_API}/models/{repo_id}", timeout=HF_TIMEOUT)
        if resp.status_code == 200:
            return resp.json()
    except Exception as exc:
        logger.debug("HF model card fetch failed for '%s': %s", repo_id, exc)
    return {}


def _fetch_config_json(repo_id: str) -> dict:
    """Fetch ``config.json`` from a HuggingFace repo.

    This is the ground truth for ``max_position_embeddings`` (true context
    window maximum), ``model_type``, and ``architectures``.

    Args:
        repo_id: HuggingFace repo ID.

    Returns:
        Parsed config.json dict or ``{}``.
    """
    try:
        import requests as _req
        url = f"{HF_CDN}/{repo_id}/resolve/main/config.json"
        resp = _req.get(url, timeout=HF_TIMEOUT, allow_redirects=True)
        if resp.status_code == 200:
            return resp.json()
    except Exception as exc:
        logger.debug("HF config.json fetch failed for '%s': %s", repo_id, exc)
    return {}


def _resolve_base_model_config(card: dict) -> dict:
    """Follow ``base_model:`` tags to fetch config.json from the original model.

    GGUF community repos (e.g. ``lmstudio-community/Qwen3-8B-GGUF``) don't
    include ``config.json``, so ``max_position_embeddings`` is unavailable
    directly. HuggingFace standardises a ``base_model:publisher/repo`` tag
    that points to the upstream model — we follow it to get accurate metadata.

    Args:
        card: HuggingFace model card dict (may be empty).

    Returns:
        config.json dict from the base model, or ``{}``.

    Example::

        >>> card = {'tags': ['base_model:Qwen/Qwen3-8B', 'gguf']}
        >>> cfg = _resolve_base_model_config(card)
        >>> cfg.get('max_position_embeddings')
        40960
    """
    tags: list[str] = card.get("tags") or []
    # Select non-quantized base_model tags: "base_model:publisher/repo"
    # Skip "base_model:quantized:..." tags that reference intermediate formats.
    for tag in tags:
        if tag.startswith("base_model:") and "quantized" not in tag:
            base_repo = tag[len("base_model:"):]
            if "/" in base_repo:
                logger.debug("Following base_model tag to %s for config.json", base_repo)
                cfg = _fetch_config_json(base_repo)
                if cfg:
                    return cfg
    return {}


# ── Tier estimation ───────────────────────────────────────────────────────────

def estimate_tier(model_name: str) -> str:
    """Estimate model intelligence tier from parameter count in the model name.

    Parses common naming patterns (``8b``, ``12.5b``, ``70b``) and maps to
    tier labels matching the capability_profile schema.

    Args:
        model_name: Model name or ID string.

    Returns:
        One of ``"tiny"``, ``"small"``, ``"medium"``, ``"large"``, ``"xl"``,
        or ``"unknown"``.

    Example::

        >>> estimate_tier("qwen3-8b-instruct-q4")
        'medium'
        >>> estimate_tier("Meta-Llama-3.1-70B")
        'xl'
    """
    match = re.search(r"(\d+\.?\d*)b", model_name.lower())
    if not match:
        return "unknown"
    params = float(match.group(1))
    if params <= 3:
        return "tiny"
    if params <= 7:
        return "small"
    if params <= 14:
        return "medium"
    if params <= 32:
        return "large"
    return "xl"


# ── Architecture detection ────────────────────────────────────────────────────

def _infer_arch(model_id: str, config_json: dict) -> Optional[str]:
    """Detect architecture family from model name and/or config.json.

    Args:
        model_id: Raw model identifier.
        config_json: Parsed config.json (may be empty).

    Returns:
        Short architecture label (e.g. ``"qwen3"``) or ``None``.
    """
    # config.json is authoritative
    arch = config_json.get("model_type") or (
        config_json.get("architectures") or [None]
    )[0]
    if arch:
        return str(arch).lower()

    # Name heuristics as fallback
    n = model_id.lower()
    for pattern, label in [
        ("qwen3", "qwen3"), ("qwen2", "qwen2"), ("qwen", "qwen"),
        ("llama-3", "llama3"), ("llama3", "llama3"), ("llama-2", "llama2"),
        ("llama2", "llama2"), ("llama", "llama"),
        ("gemma-3", "gemma3"), ("gemma3", "gemma3"), ("gemma", "gemma"),
        ("mistral", "mistral"), ("mixtral", "mixtral"),
        ("deepseek-r1", "deepseek_r1"), ("deepseek", "deepseek"),
        ("phi-4", "phi4"), ("phi-3", "phi3"), ("phi4", "phi4"),
        ("phi3", "phi3"), ("phi", "phi"),
        ("command-r", "command_r"),
        ("llava", "llava"), ("whisper", "whisper"),
    ]:
        if pattern in n:
            return label
    return None


# ── Capability detection ──────────────────────────────────────────────────────

def _detect_capabilities(
    model_id: str,
    card: dict,
    config_json: dict,
) -> dict:
    """Detect capabilities from model metadata.

    Uses a three-pass strategy:
    1. HuggingFace model card tags and pipeline_tag (most reliable)
    2. Model name pattern matching (fast fallback)
    3. Architecture-level heuristics for tool use (instruct families)

    Args:
        model_id: Raw model identifier (used for name heuristics).
        card: HuggingFace model card dict (may be empty).
        config_json: HuggingFace config.json dict (may be empty).

    Returns:
        Dict with keys: supports_vision, supports_tools, supports_thinking,
        context_window, architecture, tier.
    """
    name = model_id.lower()
    tags = {t.lower() for t in (card.get("tags") or [])}
    pipeline_tag = (card.get("pipeline_tag") or "").lower()

    # ── Vision ────────────────────────────────────────────────────────────
    supports_vision = (
        pipeline_tag in _VISION_PIPELINE_TAGS
        or bool(tags & _VISION_TAGS)
        or any(p in name for p in _VISION_PATTERNS)
    )

    # ── Tool / function calling ───────────────────────────────────────────
    supports_tools = bool(tags & _TOOL_TAGS) or any(p in name for p in _TOOL_PATTERNS)
    if not supports_tools:
        # Heuristic: modern instruct-tuned members of major families support tools.
        # Use word-boundary patterns so "-it" or "-instruct" suffixes match but
        # "community" does not (avoids false positive on lmstudio-community paths).
        is_instruct = bool(
            re.search(r"[-/.]instruct(?:[^a-z]|$)", name)
            or re.search(r"[-/.]chat(?:[^a-z]|$)", name)
            or re.search(r"[-/.](it|ift)(?:[^a-z]|$)", name)
        )
        family_match = any(f in name for f in _TOOL_INSTRUCT_FAMILIES)
        if is_instruct and family_match:
            supports_tools = True

    # ── Reasoning / thinking mode ─────────────────────────────────────────
    supports_thinking = (
        bool(tags & _THINKING_TAGS)
        or any(p in name for p in _THINKING_PATTERNS)
        or bool(_QWEN3_THINKING_PATTERN.search(name))  # Qwen3 has thinking mode
    )

    # ── Context window ────────────────────────────────────────────────────
    # config.json max_position_embeddings is the ground truth.
    # Some models use seq_length or n_positions instead.
    ctx_window: Optional[int] = (
        config_json.get("max_position_embeddings")
        or config_json.get("seq_length")
        or config_json.get("n_positions")
        or config_json.get("max_sequence_length")
    )

    # ── Architecture & tier ───────────────────────────────────────────────
    architecture = _infer_arch(model_id, config_json)
    tier = estimate_tier(model_id)

    return {
        "supports_vision": supports_vision,
        "supports_tools": supports_tools,
        "supports_thinking": supports_thinking,
        "context_window": int(ctx_window) if ctx_window else None,
        "architecture": architecture,
        "tier": tier,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def enrich_model(
    model_id: str,
    lm_context_length: Optional[int] = None,
) -> dict:
    """Enrich a model identifier with HuggingFace capability metadata.

    This is the main entry point. The function tries HuggingFace first for
    accurate data, falling back to pure name heuristics if HF is unreachable.

    Resolution order:
    1. Extract HF repo from ``model_id`` (handles LM Studio GGUF paths)
    2. Fetch model card + ``config.json`` from HF
    3. If HF lookup fails, fall back to HF search by short name
    4. Run capability detection (tags → name patterns → instruct heuristics)
    5. Merge ``lm_context_length`` as fallback if HF didn't provide one

    Args:
        model_id: Model identifier. Supported formats:

            - LM Studio GGUF path: ``"lmstudio-community/Qwen3-8B-GGUF/file.gguf"``
            - HuggingFace repo ID: ``"google/gemma-3-12b-it"``
            - Short name: ``"qwen3-8b"``
            - Ollama format: ``"qwen3:8b"`` (search fallback)

        lm_context_length: Context length currently reported by the local
            LLM server (LM Studio, Ollama). Used as fallback when HF's
            ``config.json`` doesn't have ``max_position_embeddings``.

    Returns:
        Dict with the following keys:

        - ``model_id`` (str): Original input identifier.
        - ``hf_repo`` (str|None): Resolved HuggingFace repo ID.
        - ``source`` (str): ``"hf"`` | ``"heuristic"`` | ``"unknown"``.
        - ``tier`` (str): ``"tiny"`` | ``"small"`` | ``"medium"`` | ``"large"`` | ``"xl"`` | ``"unknown"``.
        - ``architecture`` (str|None): Architecture family (e.g. ``"qwen3"``).
        - ``context_window`` (int|None): True max context in tokens (from HF config.json).
        - ``lm_context_length`` (int|None): Context window reported by the local server.
        - ``supports_vision`` (bool): Vision/image input capable.
        - ``supports_tools`` (bool): Function/tool calling capable.
        - ``supports_thinking`` (bool): Extended reasoning / thinking mode.

    Example::

        >>> caps = enrich_model(
        ...     "lmstudio-community/Qwen3-8B-GGUF/Qwen3-8B-Q4_K_M.gguf",
        ...     lm_context_length=8192
        ... )
        >>> caps['tier']
        'medium'
        >>> caps['supports_thinking']
        True
        >>> caps['architecture']
        'qwen3'
    """
    repo_id: Optional[str] = None
    card: dict = {}
    config_json: dict = {}
    source = "unknown"

    # ── Step 1: Resolve HF repo ID ────────────────────────────────────────
    candidate_repo = _extract_hf_repo(model_id)

    if candidate_repo:
        card = _fetch_model_card(candidate_repo)
        if card:
            repo_id = candidate_repo
            source = "hf"
            config_json = _fetch_config_json(repo_id)
            # GGUF repos typically lack config.json; follow base_model: tag
            # to get max_position_embeddings from the original model.
            if not config_json:
                config_json = _resolve_base_model_config(card)
        else:
            # Repo path extracted but 404 — try searching by the repo name
            # (e.g. "Qwen3-8B-GGUF" → search "Qwen3 8B GGUF")
            repo_name = model_id.split("/")[1] if "/" in model_id else model_id
            repo_id = _search_hf_repo(repo_name)
            if repo_id:
                card = _fetch_model_card(repo_id)
                config_json = _fetch_config_json(repo_id)
                if not config_json:
                    config_json = _resolve_base_model_config(card)
                if card:
                    source = "hf"
    else:
        # Short name or Ollama format — search HF
        short_name = re.sub(r"[:_]", " ", model_id).split(".")[0]
        repo_id = _search_hf_repo(short_name)
        if repo_id:
            card = _fetch_model_card(repo_id)
            config_json = _fetch_config_json(repo_id)
            if card:
                source = "hf"

    # ── Step 2: Detect capabilities ───────────────────────────────────────
    caps = _detect_capabilities(model_id, card, config_json)

    # If HF lookup succeeded but no context window in config.json, this is
    # a GGUF repo that doesn't have config.json — use LM Studio's value.
    if caps["context_window"] is None and source == "hf":
        caps["context_window"] = lm_context_length

    # For pure heuristic path, always use LM Studio value as-is
    if caps["context_window"] is None:
        caps["context_window"] = lm_context_length

    if source == "unknown" and (caps["tier"] != "unknown" or caps["architecture"]):
        source = "heuristic"

    return {
        "model_id": model_id,
        "hf_repo": repo_id,
        "source": source,
        "lm_context_length": lm_context_length,
        **caps,
    }
