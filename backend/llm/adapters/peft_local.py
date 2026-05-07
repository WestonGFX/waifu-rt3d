"""PEFT LoRA inference adapter for local character-specific fine-tuned models.

Implements the :class:`~backend.llm.adapters.base.LLMAdapter` interface for
serving a PEFT LoRA adapter merged on top of a HuggingFace base model.

Requires the optional ``torch``, ``peft``, and ``transformers`` packages.  On
machines where these are not installed (e.g. the Mac dev box), the module
imports cleanly but :class:`PeftLocalAdapter` raises :exc:`ImportError` at
instantiation, so the rest of the application remains unaffected.

Typical usage:

    >>> adapter = PeftLocalAdapter(
    ...     adapter_path="backend/storage/models/loras/Sakura",
    ...     base_model="Qwen/Qwen2.5-7B-Instruct",
    ... )
    >>> result = adapter.chat(
    ...     messages=[{"role": "user", "content": "Hello!"}],
    ...     model="", endpoint="", api_key="",
    ... )
    >>> print(result["reply"])

On machines without PEFT:

    >>> from backend.llm.adapters.peft_local import _PEFT_AVAILABLE
    >>> _PEFT_AVAILABLE
    False
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any, Generator

from backend.llm.adapters.base import LLMAdapter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional heavy-dep import block — degrades gracefully when torch/peft absent
# ---------------------------------------------------------------------------

try:
    import threading  # noqa: E402 — inside try so it's co-located with deps

    import torch  # type: ignore[import]
    from peft import PeftModel  # type: ignore[import]
    from transformers import (  # type: ignore[import]
        AutoModelForCausalLM,
        AutoTokenizer,
        TextIteratorStreamer,
    )

    _PEFT_AVAILABLE = True
except ImportError:
    _PEFT_AVAILABLE = False
    logger.info(
        "PEFT/transformers not available — PeftLocalAdapter will raise on use"
    )


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------


class PeftLocalAdapter(LLMAdapter):
    """LLM adapter that serves a PEFT LoRA adapter on top of a base model.

    Loads a HuggingFace base model via ``transformers`` and applies a PEFT
    LoRA adapter checkpoint on top of it, enabling inference for a
    character-specific fine-tuned model.  All computation runs locally using
    the machine's GPU (or CPU as a fallback).

    This adapter is intended for the Windows RTX training rig and any machine
    with ``torch`` + ``peft`` + ``transformers`` installed.  On the Mac dev
    box — where these packages are absent — instantiation raises
    :exc:`ImportError` immediately so the caller can fall back to a remote
    adapter (e.g. :class:`~backend.llm.adapters.lmstudio.LMStudioAdapter`).

    Args:
        adapter_path: Filesystem path to the saved PEFT adapter directory
            (the directory that contains ``adapter_config.json``).
        base_model: HuggingFace model ID or local path for the base model
            that the adapter was trained on.  Defaults to
            ``"Qwen/Qwen2.5-7B-Instruct"``.
        device: Device map string passed to ``from_pretrained``.  ``"auto"``
            lets ``accelerate`` decide; pass ``"cpu"`` to force CPU-only.
        load_in_4bit: When ``True``, loads the base model in 4-bit
            quantisation via ``bitsandbytes`` for reduced VRAM usage.

    Raises:
        ImportError: If ``torch``, ``peft``, or ``transformers`` are not
            installed in the current Python environment.

    Example:
        >>> # On a machine with CUDA + peft installed:
        >>> adapter = PeftLocalAdapter(
        ...     adapter_path="backend/storage/models/loras/Sakura",
        ...     base_model="Qwen/Qwen2.5-7B-Instruct",
        ...     load_in_4bit=True,
        ... )
        >>> result = adapter.chat(
        ...     messages=[{"role": "user", "content": "Hi Sakura!"}],
        ...     model="", endpoint="", api_key="",
        ... )
        >>> result["ok"]
        True
    """

    def __init__(
        self,
        adapter_path: str | Path,
        base_model: str = "Qwen/Qwen2.5-7B-Instruct",
        device: str = "auto",
        load_in_4bit: bool = True,
    ) -> None:
        """Initialise the adapter by loading the base model and LoRA weights.

        Args:
            adapter_path: Path to the PEFT adapter directory.
            base_model: HuggingFace model ID for the base model.
            device: Device map string for ``from_pretrained`` (``"auto"`` |
                ``"cpu"`` | ``"cuda"``).
            load_in_4bit: Load the base model in 4-bit quantisation.

        Raises:
            ImportError: When ``torch`` / ``peft`` / ``transformers`` are
                missing from the environment.
        """
        if not _PEFT_AVAILABLE:
            raise ImportError(
                "PeftLocalAdapter requires torch, peft, and transformers. "
                "Install them on the training rig: "
                "pip install torch peft transformers accelerate bitsandbytes"
            )

        self._adapter_path = Path(adapter_path)
        self._base_model = base_model
        self._device = device

        logger.info(
            "PeftLocalAdapter: loading base model '%s' (4bit=%s, device=%s)",
            base_model,
            load_in_4bit,
            device,
        )

        # Load the base model — 4-bit quantisation is optional; fall back to
        # fp16 when bitsandbytes is unavailable.
        self._model = AutoModelForCausalLM.from_pretrained(
            base_model,
            device_map=device,
            load_in_4bit=load_in_4bit,
            torch_dtype=torch.float16,
        )

        logger.info(
            "PeftLocalAdapter: applying LoRA adapter from '%s'",
            self._adapter_path,
        )
        self._model = PeftModel.from_pretrained(self._model, str(self._adapter_path))

        # Try loading tokenizer from the adapter directory first; fall back to
        # the base model when the adapter was saved without a tokenizer.
        try:
            self._tokenizer = AutoTokenizer.from_pretrained(str(self._adapter_path))
            logger.info(
                "PeftLocalAdapter: tokenizer loaded from adapter directory"
            )
        except (OSError, ValueError):
            self._tokenizer = AutoTokenizer.from_pretrained(base_model)
            logger.info(
                "PeftLocalAdapter: tokenizer loaded from base model '%s'",
                base_model,
            )

    # ------------------------------------------------------------------
    # LLMAdapter interface
    # ------------------------------------------------------------------

    def chat(
        self,
        messages: list[dict[str, Any]],
        model: str,
        endpoint: str,
        api_key: str,
        **kw: Any,
    ) -> dict[str, Any]:
        """Non-streaming chat completion using the loaded LoRA model.

        Applies the tokenizer's chat template to *messages*, runs a forward
        pass, and returns the decoded reply.

        Args:
            messages: OpenAI-style list of ``{"role": str, "content": str}``
                dicts.  The ``"system"`` role is passed through the chat
                template when present.
            model: Unused — the model is fixed at construction time.
            endpoint: Unused — inference is local.
            api_key: Unused — no remote API involved.
            **kw: Optional generation overrides:
                - ``max_tokens`` (int, default 512): Maximum new tokens.
                - ``temperature`` (float, default 0.7): Sampling temperature.

        Returns:
            Dict with shape::

                {
                    "ok": True,
                    "reply": str,
                    "model": str,       # base model ID
                    "adapter": str,     # adapter path as string
                }

            On failure::

                {"ok": False, "error": str, "reply": ""}

        Example:
            >>> result = adapter.chat(
            ...     messages=[{"role": "user", "content": "Hello!"}],
            ...     model="", endpoint="", api_key="",
            ...     max_tokens=256, temperature=0.8,
            ... )
            >>> result["ok"]
            True
        """
        try:
            prompt: str = self._tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )

            inputs = self._tokenizer(prompt, return_tensors="pt").to(
                self._model.device
            )

            max_new_tokens: int = int(kw.get("max_tokens", 512))
            temperature: float = float(kw.get("temperature", 0.7))

            with torch.no_grad():
                output_ids = self._model.generate(
                    **inputs,
                    max_new_tokens=max_new_tokens,
                    temperature=temperature,
                    do_sample=temperature > 0,
                )

            # Decode only the newly generated tokens (skip the prompt prefix).
            new_ids = output_ids[0][inputs["input_ids"].shape[-1]:]
            reply: str = self._tokenizer.decode(new_ids, skip_special_tokens=True)

            return {
                "ok": True,
                "reply": reply,
                "model": self._base_model,
                "adapter": str(self._adapter_path),
            }

        except Exception as exc:  # noqa: BLE001 — broad catch per adapter pattern
            logger.error("PeftLocalAdapter.chat failed: %s", exc, exc_info=True)
            return {"ok": False, "error": str(exc), "reply": ""}

    def chat_stream(
        self,
        messages: list[dict[str, Any]],
        model: str,
        endpoint: str,
        api_key: str,
        **kw: Any,
    ) -> Generator[str, None, None]:
        """Streaming chat completion using :class:`TextIteratorStreamer`.

        Runs the forward pass in a background thread so that tokens can be
        yielded to the caller as they are generated.

        Args:
            messages: OpenAI-style message list.
            model: Unused — model is fixed at construction time.
            endpoint: Unused — inference is local.
            api_key: Unused — no remote API involved.
            **kw: Same optional generation overrides as :meth:`chat`.

        Yields:
            str: Individual decoded token strings as they are produced.

        Example:
            >>> for token in adapter.chat_stream(
            ...     messages=[{"role": "user", "content": "Tell me a story."}],
            ...     model="", endpoint="", api_key="",
            ... ):
            ...     print(token, end="", flush=True)
        """
        try:
            prompt: str = self._tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )

            inputs = self._tokenizer(prompt, return_tensors="pt").to(
                self._model.device
            )

            max_new_tokens: int = int(kw.get("max_tokens", 512))
            temperature: float = float(kw.get("temperature", 0.7))

            streamer = TextIteratorStreamer(
                self._tokenizer,
                skip_prompt=True,
                skip_special_tokens=True,
            )

            generation_kwargs = {
                **inputs,
                "max_new_tokens": max_new_tokens,
                "temperature": temperature,
                "do_sample": temperature > 0,
                "streamer": streamer,
            }

            thread = threading.Thread(
                target=self._model.generate,
                kwargs=generation_kwargs,
                daemon=True,
            )
            thread.start()

            for token_text in streamer:
                yield token_text

            thread.join()

        except Exception as exc:  # noqa: BLE001
            logger.error(
                "PeftLocalAdapter.chat_stream failed: %s", exc, exc_info=True
            )
            yield ""

    def supports_tools(self) -> bool:
        """Returns False — local LoRA models do not reliably support tool calling.

        Returns:
            Always ``False``.
        """
        return False

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def adapter_path(self) -> Path:
        """Filesystem path to the PEFT adapter directory.

        Returns:
            :class:`pathlib.Path` pointing to the adapter checkpoint.
        """
        return self._adapter_path

    # ------------------------------------------------------------------
    # Class-level factory
    # ------------------------------------------------------------------

    @classmethod
    def from_db(cls, db_path: str | Path, char_id: int) -> "PeftLocalAdapter":
        """Construct an adapter from the active LoRA row for a character.

        Queries the ``character_loras`` table for the row where
        ``char_id = char_id`` and ``is_active = 1``, then returns a
        :class:`PeftLocalAdapter` built from that row's ``adapter_path`` and
        ``base_model`` columns.

        Args:
            db_path: Filesystem path to the app SQLite database.
            char_id: Integer primary key of the character in the
                ``characters`` table.

        Returns:
            A fully initialised :class:`PeftLocalAdapter` ready for inference.

        Raises:
            ValueError: If no active LoRA row exists for *char_id*.
            ImportError: Propagated from :meth:`__init__` when PEFT deps are
                missing.
            sqlite3.Error: If the database cannot be opened.

        Example:
            >>> adapter = PeftLocalAdapter.from_db(
            ...     db_path="backend/storage/app.db",
            ...     char_id=3,
            ... )
            >>> adapter.adapter_path
            PosixPath('backend/storage/models/loras/Sakura')
        """
        con = sqlite3.connect(str(db_path))
        try:
            con.row_factory = sqlite3.Row
            row = con.execute(
                "SELECT adapter_path, base_model"
                " FROM character_loras"
                " WHERE char_id = ? AND is_active = 1"
                " LIMIT 1",
                (char_id,),
            ).fetchone()
        finally:
            con.close()

        if row is None:
            raise ValueError(
                f"No active LoRA adapter found for char_id={char_id} in "
                f"character_loras table. Train one first with "
                f"scripts/train_character_lora.py."
            )

        return cls(
            adapter_path=row["adapter_path"],
            base_model=row["base_model"],
        )
