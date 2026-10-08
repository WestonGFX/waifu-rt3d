"""Turn benchmark JSONL into a Markdown report a non-expert can read.

Two views: (1) strategy leaderboard across all models, (2) per-model table
so you can see which model + fix combination works.  A sample sheet at the
end shows real replies so *voice quality* — which numbers can't judge — can be
eyeballed in a couple of minutes.
"""
from __future__ import annotations

import json
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Iterable

STRATEGY_BLURB = {
    "S0_baseline": "today: JSON contract written into the prompt, nothing enforced",
    "S1_schema": "server forced to emit the exact JSON shape (json_schema)",
    "S2_split": "normal in-character reply, then a 2nd small call annotates mood/gesture/memory",
    "S3_prefill": "prompt + the reply is pre-started with `{` (experimental)",
}
PASS_THRESHOLD = 0.80  # the Kokoro v2 Phase-1 gate


def load_records(paths: Iterable[Path | str]) -> list[dict]:
    """Load and concatenate JSONL record files (bad lines are skipped)."""
    recs: dict[tuple, dict] = {}
    for p in paths:
        for line in Path(p).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
                key = (r.get("backend"), r["model"], r["strategy"], r["scenario"], r.get("repeat", 0))
            except (json.JSONDecodeError, KeyError):
                continue
            recs[key] = r  # a re-run (resume/retry) supersedes the older record for the same cell
    return list(recs.values())


def _rate(rows: list[dict], field: str) -> float:
    return sum(1 for r in rows if r.get(field)) / len(rows) if rows else 0.0


def _pct(x: float) -> str:
    return f"{round(x * 100):d}%"


def _med(rows: list[dict], field: str) -> float:
    vals = [r[field] for r in rows if r.get("ok") and r.get(field)]
    return statistics.median(vals) if vals else 0.0


def aggregate(records: list[dict]) -> list[dict]:
    """Group by (backend, model, strategy) and compute rates.

    Rates use *all attempts* as the denominator, so a model that errors out
    or times out is penalised rather than silently excluded.
    """
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in records:
        groups[(r.get("backend", "?"), r["model"], r["strategy"])].append(r)
    rows = []
    for (backend, model, strategy), g in groups.items():
        rows.append({
            "backend": backend, "model": model, "strategy": strategy, "n": len(g),
            "ok": _rate(g, "ok"), "parse_ok": _rate(g, "parse_ok"), "strict": _rate(g, "strict_json"),
            "schema": _rate(g, "schema_valid"), "clamp": _rate([x for x in g if x.get("ok")], "delta_in_clamp"),
            "leak": _rate(g, "json_leak"), "actions": _rate(g, "action_markup"),
            "reasoning_only": _rate(g, "reasoning_only"),
            "latency": _med(g, "latency_s"), "tps": _med(g, "tokens_per_s"),
            "errors": sorted({(("[server rejected structured output] " if x.get("error_kind") == "unsupported" else "")
                               + str(x.get("error", ""))[:80]) for x in g if not x.get("ok")} - {""})[:2],
        })
    rows.sort(key=lambda r: (-r["parse_ok"], -r["schema"], r["latency"]))
    return rows


def _table(rows: list[dict], first_cols: list[tuple[str, str]]) -> list[str]:
    head = [h for h, _ in first_cols] + ["n", "answered", "parse_ok", "clean JSON", "schema ok",
                                         "nudges in range", "leak", "s/turn", "tok/s"]
    out = ["| " + " | ".join(head) + " |", "|" + "|".join("---" for _ in head) + "|"]
    for r in rows:
        cells = [str(r[k]) for _, k in first_cols]
        cells += [str(r["n"]), _pct(r["ok"]), _pct(r["parse_ok"]), _pct(r["strict"]), _pct(r["schema"]),
                  _pct(r.get("clamp", 0.0)), _pct(r["leak"]), f"{r['latency']:.1f}", f"{r['tps']:.0f}"]
        out.append("| " + " | ".join(cells) + " |")
    return out


def render_markdown(records: list[dict], *, title: str = "Kokoro model benchmark") -> str:
    """Render the full Markdown report."""
    rows = aggregate(records)
    lines = [f"# {title}", ""]
    if not rows:
        return "\n".join(lines + ["_No records._", ""])
    lines += [
        "**How to read this.** Each row is one model trying one fix over the same fixed set of conversation turns. "
        f"**parse_ok** = how often the app could read the mood/gesture/memory note (target: **>= {_pct(PASS_THRESHOLD)}**). "
        "**clean JSON** = the model returned *only* JSON (no extra prose). **schema ok** = every field valid. **nudges in range** = mood changes stayed within the +/-0.05 limit. "
        "**leak** = JSON-looking text showed up in what the user would read (bad). **answered** = the model replied "
        "at all (errors/timeouts count against it). Note: **S2 makes two calls per turn**, so its s/turn is the sum and its "
        "tok/s is blended across two differently-sized prompts - don't compare it to S0/S1 tok/s one-to-one. "
        "Likewise **S2's parse_ok and schema ok are scored on the small annotation call only** (its prose reply is judged "
        "separately by answered/leak), so its contract is smaller than S0/S1/S3 and its headline number looks better "
        "partly for that reason.",
        "",
        "## 1. Which fix works best (all models pooled)",
        "",
    ]
    by_strategy: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        by_strategy[r["strategy"]].append(r)
    pooled = []
    for s, g in by_strategy.items():
        pooled.append({"strategy": s, "what": STRATEGY_BLURB.get(s, ""), "n": len(g), "ok": _rate(g, "ok"),
                       "parse_ok": _rate(g, "parse_ok"), "strict": _rate(g, "strict_json"),
                       "schema": _rate(g, "schema_valid"), "leak": _rate(g, "json_leak"),
                       "clamp": _rate([x for x in g if x.get("ok")], "delta_in_clamp"),
                       "latency": _med(g, "latency_s"), "tps": _med(g, "tokens_per_s")})
    pooled.sort(key=lambda r: -r["parse_ok"])
    lines += _table(pooled, [("fix", "strategy"), ("what it does", "what")]) + [""]

    lines += ["## 2. Every model x fix", ""]
    lines += _table(rows, [("backend", "backend"), ("model", "model"), ("fix", "strategy")]) + [""]

    passing = [r for r in rows if r["parse_ok"] >= PASS_THRESHOLD and r["ok"] >= 0.9]
    lines += ["## 3. Candidates that clear the bar", ""]
    if passing:
        for r in passing:
            lines.append(f"- **{r['model']}** ({r['backend']}) with **{r['strategy']}** - parse_ok "
                         f"{_pct(r['parse_ok'])}, {r['latency']:.1f}s/turn, leak {_pct(r['leak'])}")
    else:
        lines.append("_None cleared parse_ok >= 80% with >= 90% answered._")
    lines.append("")

    errs = [(r["model"], r["strategy"], e) for r in rows for e in r["errors"] if r["ok"] < 1.0]
    if errs:
        lines += ["## 4. Errors seen", ""]
        seen = set()
        for m, s, e in errs:
            if (m, s, e) not in seen:
                seen.add((m, s, e))
                lines.append(f"- `{m}` / {s}: {e}")
        lines.append("")

    lines += ["## 5. Reply sample sheet (judge the voice yourself)", "",
              "Numbers can't tell you whether she still *sounds like her*. Three replies per row:", ""]
    samples: dict[tuple, list[dict]] = defaultdict(list)
    for r in records:
        if r.get("ok") and r.get("reply") and len(samples[(r.get("backend"), r["model"], r["strategy"])]) < 3:
            samples[(r.get("backend"), r["model"], r["strategy"])].append(r)
    for (backend, model, strategy), g in sorted(samples.items(), key=lambda kv: (kv[0][1], kv[0][2])):
        lines += [f"### {model} - {strategy} ({backend})", ""]
        for r in g:
            reply = r["reply"].strip().replace("\n", " ")
            lines.append(f"- **You:** {r['scenario']} - _{r['tone']}_  ")
            lines.append(f"  **Her:** {reply[:500]}{'...' if len(reply) > 500 else ''}")
        lines.append("")
    return "\n".join(lines)


def write_report(jsonl_paths: Iterable[Path | str], out_path: Path | str, *, title: str = "Kokoro model benchmark") -> Path:
    """Load ``jsonl_paths`` and write the Markdown report to ``out_path``."""
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_markdown(load_records(jsonl_paths), title=title), encoding="utf-8")
    return out
