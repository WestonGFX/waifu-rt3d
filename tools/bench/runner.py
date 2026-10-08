"""Run the strategy x model x scenario sweep and append JSONL records.

Strategies (the candidate fixes for "Kokoro parse_ok is ~0% in practice"):

* ``S0_baseline`` - today's behaviour: contract appended in prose, no server help.
* ``S1_schema``   - same prompt + server-side ``response_format: json_schema``.
* ``S2_split``    - persona-only in-character reply first, then a small second
                    call (schema-forced) that annotates face/gesture/memory/delta.
* ``S3_prefill``  - S0 plus an assistant prefill of ``{`` (experimental; some
                    chat templates mishandle a trailing assistant turn).

Every record is flushed to disk immediately and keyed, so an interrupted
multi-hour sweep resumes exactly where it stopped.
"""
from __future__ import annotations

import json
import logging
import os
import re
import shlex
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional

from backend.kokoro.response_schema import response_format_for

from . import metrics, prompts
from .client import BenchClient, ChatResult
from .scenarios import Scenario

logger = logging.getLogger(__name__)

STRATEGIES = ("S0_baseline", "S1_schema", "S2_split", "S3_prefill")
MAX_CONSECUTIVE_FAILURES = 3


@dataclass
class RunConfig:
    """Knobs for one sweep (all recorded alongside results)."""
    temperature: float = 0.8
    max_tokens: int = 700
    repeats: int = 1
    between_models_cmd: Optional[str] = None
    retry_failed: bool = False
    between_models_timeout: float = 120.0
    # S2's second (annotation) call. 500 leaves headroom so verbose models are not cut off mid-JSON,
    # which would be misread as a model failure rather than a harness cap.
    extractor_temperature: float = 0.2
    extractor_max_tokens: int = 500


def record_key(rec: dict) -> tuple:
    """Identity of a record for resume/dedup."""
    return (rec["backend"], rec["model"], rec["strategy"], rec["scenario"], rec["repeat"])


def load_done_keys(path: Path, *, retry_failed: bool = False) -> set:
    """Read an existing JSONL file and return the keys already completed.

    Placeholder records written by the fail-fast guard (``skipped``) are never
    "done": the failure that tripped the guard may have been transient (model
    still loading, LM Studio swapping models), so a re-run must retry them.

    Args:
        path: Results file.
        retry_failed: Also treat every ``ok=False`` record as not done.
    """
    keys: set = set()
    if not path.exists():
        return keys
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
            if rec.get("skipped") or (retry_failed and not rec.get("ok")):
                continue
            keys.add(record_key(rec))
        except (json.JSONDecodeError, KeyError):
            continue
    return keys


class ResumeConfigMismatch(ValueError):
    """The results file was produced with different sampling settings than this run."""


def check_resume_compat(path: Path, cfg: "RunConfig") -> None:
    """Refuse to mix cells generated with different ``temperature``/``max_tokens``.

    Resume keys deliberately ignore run config (so a re-run fills gaps), but
    silently blending old and new sampling settings in one file would make the
    comparison between cells meaningless.

    Raises:
        ResumeConfigMismatch: If any real record in ``path`` used other settings.
    """
    if not path.exists():
        return
    seen: set = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if rec.get("skipped") or "temperature" not in rec:
            continue
        seen.add((rec.get("temperature"), rec.get("max_tokens"),
                  rec.get("extractor_max_tokens", cfg.extractor_max_tokens),
                  rec.get("extractor_temperature", cfg.extractor_temperature)))
    mine = (cfg.temperature, cfg.max_tokens, cfg.extractor_max_tokens, cfg.extractor_temperature)
    if seen and seen != {mine}:
        raise ResumeConfigMismatch(
            f"{path} already holds results with (temperature, max_tokens, extractor_max_tokens, extractor_temperature) = {sorted(seen)}, but this run uses "
            f"{mine}. Use the same settings to resume, or pass a different --out file."
        )


def classify_error(error: str) -> str:
    """Bucket an error string: ``unsupported`` (server rejected structured output) or ``error``.

    Lets the report distinguish "this server/model can't do json_schema" from a
    crash or timeout — they mean very different things for the decision.
    """
    e = (error or "").lower()
    if not e:
        return ""
    # The adapter formats API failures as "API Error <status>: <body>"; match the
    # status explicitly so a stray "400" in a port or a duration can't qualify.
    rejected = bool(re.search(r"api error (400|422)\b|\bstatus(?: code)?[ :=]+(400|422)\b|\bhttp (400|422)\b", e))
    mentions_structure = any(k in e for k in ("response_format", "json_schema", "schema", "grammar"))
    if rejected and mentions_structure:
        return "unsupported"
    return "error"


def _tokens(*results: ChatResult) -> tuple[int, int]:
    return sum(r.prompt_tokens for r in results), sum(r.completion_tokens for r in results)


def run_one(
    client: BenchClient,
    model: str,
    strategy: str,
    system_prompts: dict[str, str],
    scenario: Scenario,
    cfg: RunConfig,
) -> dict:
    """Execute one (model, strategy, scenario) cell and return a flat record.

    Never raises: transport/API errors become ``ok=False`` records.
    """
    kw = {"temperature": cfg.temperature, "max_tokens": cfg.max_tokens}
    user = {"role": "user", "content": scenario.text}
    text2 = ""
    extra_fields: dict = {}

    if strategy == "S0_baseline":
        r = client.chat([{"role": "system", "content": system_prompts["with_contract"]}, user], model, **kw)
        ok, text, error = r.ok, r.text, r.error
        scores = metrics.score_structured(text) if ok else {}
        reasoning_only, latency = r.reasoning_only, r.latency_s
        ptok, ctok = _tokens(r)

    elif strategy == "S1_schema":
        r = client.chat(
            [{"role": "system", "content": system_prompts["with_contract"]}, user], model,
            response_format=response_format_for(), **kw,
        )
        ok, text, error = r.ok, r.text, r.error
        scores = metrics.score_structured(text) if ok else {}
        reasoning_only, latency = r.reasoning_only, r.latency_s
        ptok, ctok = _tokens(r)

    elif strategy == "S3_prefill":
        msgs = [{"role": "system", "content": system_prompts["with_contract"]}, user,
                {"role": "assistant", "content": "{"}]
        r = client.chat(msgs, model, **kw)
        ok, error = r.ok, r.error
        text = r.text
        stitched = False
        if ok and not text.lstrip().startswith("{"):
            # Servers that *continue* the prefill return the text after the "{".
            # Stitch only if that actually yields a JSON object — otherwise the
            # server ignored the prefill (prose/code fence) and we must not
            # corrupt its output.
            try:
                if isinstance(json.loads("{" + text), dict):
                    text, stitched = "{" + text, True
            except (json.JSONDecodeError, ValueError):
                pass
        extra_fields = {"prefill_stitched": stitched}
        scores = metrics.score_structured(text) if ok else {}
        reasoning_only, latency = r.reasoning_only, r.latency_s
        ptok, ctok = _tokens(r)

    elif strategy == "S2_split":
        r1 = client.chat([{"role": "system", "content": system_prompts["plain"]}, user], model, **kw)
        if not r1.ok:
            ok, text, error, scores = False, "", r1.error, {}
            reasoning_only, latency = r1.reasoning_only, r1.latency_s
            ptok, ctok = _tokens(r1)
        else:
            text = r1.text
            r2 = client.chat(
                [{"role": "system", "content": prompts.EXTRACTOR_SYSTEM},
                 {"role": "user", "content": prompts.extractor_user(scenario.text, text)}],
                model, response_format={
                    "type": "json_schema",
                    "json_schema": {"name": "annotation", "strict": True, "schema": prompts.extractor_schema()},
                },
                temperature=cfg.extractor_temperature, max_tokens=cfg.extractor_max_tokens,
            )
            text2, ok, error = r2.text, r2.ok, r2.error
            scores = {}
            if r2.ok:
                scores = metrics.score_structured(text2, require_reply=False)
                # Visible-reply properties come from the in-character call.
                scores.update(metrics.score_prose(text))
            reasoning_only = r1.reasoning_only or r2.reasoning_only
            latency = r1.latency_s + r2.latency_s
            ptok, ctok = _tokens(r1, r2)
    else:
        raise ValueError(f"unknown strategy {strategy!r}")

    return {
        "model": model, "strategy": strategy, "scenario": scenario.id, "tone": scenario.tone,
        "ok": bool(ok), "error": error, "error_kind": classify_error(error), "latency_s": round(latency, 3),
        "prompt_tokens": ptok, "completion_tokens": ctok,
        "tokens_per_s": round(ctok / latency, 2) if latency > 0 and ctok > 0 else 0.0,
        "reasoning_only": bool(reasoning_only),
        "text": text, "text2": text2,
        "reply": (text if strategy == "S2_split" else metrics.visible_reply(text)) if ok else "",
        **extra_fields,
        **scores,
    }


def run_sweep(
    client: BenchClient,
    models: Iterable[str],
    strategies: Iterable[str],
    scenarios: Iterable[Scenario],
    system_prompts: dict[str, str],
    out_path: Path,
    *,
    backend_label: str,
    cfg: RunConfig,
    on_record: Optional[Callable[[dict], None]] = None,
    sleep: Callable[[float], None] = time.sleep,
) -> int:
    """Run the full sweep, appending to ``out_path`` and skipping done cells.

    Returns:
        Number of new records written this call.
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    check_resume_compat(out_path, cfg)
    done = load_done_keys(out_path, retry_failed=cfg.retry_failed)
    scenarios = list(scenarios)
    strategies = list(strategies)
    written = 0
    with out_path.open("a", encoding="utf-8") as fh:
        for mi, model in enumerate(models):
            if mi > 0 and cfg.between_models_cmd:
                try:
                    rc = subprocess.run(shlex.split(cfg.between_models_cmd, posix=(os.name != "nt")), check=False,
                                        timeout=cfg.between_models_timeout).returncode
                except subprocess.TimeoutExpired:
                    rc = "timeout"   # a hung unload must not stall a multi-hour sweep
                if rc != 0:
                    # A failed unload would silently skew the next model's numbers.
                    logger.warning("between-models command %r exited %s (non-zero or timeout) - the previous model may still be "
                                   "loaded, which can skew memory/speed numbers",
                                   cfg.between_models_cmd, rc)
                sleep(2)
            for strategy in strategies:
                streak = 0
                for sc in scenarios:
                    for rep in range(cfg.repeats):
                        key = (backend_label, model, strategy, sc.id, rep)
                        if key in done:
                            continue
                        if streak >= MAX_CONSECUTIVE_FAILURES:
                            rec = {"model": model, "strategy": strategy, "scenario": sc.id, "tone": sc.tone,
                                   "ok": False, "error": f"skipped after {MAX_CONSECUTIVE_FAILURES} consecutive failures",
                                   "latency_s": 0.0, "prompt_tokens": 0, "completion_tokens": 0,
                                   "tokens_per_s": 0.0, "reasoning_only": False, "text": "", "text2": "",
                                   "reply": "", "skipped": True}
                        else:
                            rec = run_one(client, model, strategy, system_prompts, sc, cfg)
                            streak = 0 if rec["ok"] else streak + 1
                        rec.update({"backend": backend_label, "repeat": rep,
                                    "temperature": cfg.temperature, "max_tokens": cfg.max_tokens,
                                    "extractor_max_tokens": cfg.extractor_max_tokens,
                                    "extractor_temperature": cfg.extractor_temperature})
                        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                        fh.flush()
                        written += 1
                        if on_record:
                            on_record(rec)
    return written
