"""CLI: ``python -m tools.bench`` (run a sweep) / ``python -m tools.bench report FILE...``."""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.bench import prompts, report  # noqa: E402
from tools.bench.client import BenchClient, guess_backend_label  # noqa: E402
from tools.bench.runner import STRATEGIES, ResumeConfigMismatch, RunConfig, run_sweep  # noqa: E402
from tools.bench.scenarios import SCENARIOS  # noqa: E402

DEFAULT_OUT_DIR = ROOT / "docs" / "research" / "data" / "bench"


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m tools.bench",
        description="Benchmark local models on the Kokoro structured-response contract. "
                    "Use `report FILE...` to turn results into Markdown.",
    )
    p.add_argument("--base-url", default="http://localhost:1234/v1",
                   help="LM Studio: http://localhost:1234/v1 (default). Ollama: http://localhost:11434")
    p.add_argument("--backend-label", default=None, help="Label stored in results (default: guessed from port).")
    p.add_argument("--models", default="all",
                   help="Comma-separated model ids, or 'all' to test everything the server lists (default).")
    p.add_argument("--include", default=None, help="Regex: only models whose id matches.")
    p.add_argument("--exclude", default=None, help="Regex: skip models whose id matches.")
    p.add_argument("--strategies", default=",".join(STRATEGIES), help=f"Comma list from: {', '.join(STRATEGIES)}")
    p.add_argument("--turns", type=int, default=len(SCENARIOS), help="How many of the 20 fixed turns to use.")
    p.add_argument("--repeats", type=int, default=1, help="Repeat each turn N times (different sampling).")
    p.add_argument("--temperature", type=float, default=0.8)
    p.add_argument("--max-tokens", type=int, default=700)
    p.add_argument("--timeout", type=int, default=300, help="Seconds to wait for each reply.")
    p.add_argument("--persona", default=str(prompts.DEFAULT_PERSONA), help="Persona prompt-pack markdown file.")
    p.add_argument("--rp-style", default="explicit_rp", choices=["none", "light_rp", "full_rp", "explicit_rp"],
                   help="App RP-style preset to include (default matches your May config).")
    p.add_argument("--out", default=None, help="Results .jsonl path (default: docs/research/data/bench/<date>-<backend>.jsonl). "
                                               "Re-running with the same path resumes.")
    p.add_argument("--between-models-cmd", default=None,
                   help="Shell command run between models, e.g. 'lms unload --all' to free memory.")
    p.add_argument("--retry-failed", action="store_true",
                   help="On resume, also re-run turns that failed (skipped placeholders are always retried).")
    p.add_argument("--dry-run", action="store_true", help="Show the plan and prompt size; call no models.")
    return p


def _cmd_report(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="python -m tools.bench report")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out", default=None, help="Markdown output path (default: next to first file).")
    ap.add_argument("--title", default="Kokoro model benchmark")
    a = ap.parse_args(argv)
    out = a.out or str(Path(a.files[0]).with_suffix(".md"))
    path = report.write_report(a.files, out, title=a.title)
    print(f"Wrote {path}")
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "report":
        return _cmd_report(argv[1:])
    args = _build_parser().parse_args(argv)

    label = args.backend_label or guess_backend_label(args.base_url)
    strategies = [s.strip() for s in args.strategies.split(",") if s.strip()]
    bad = [s for s in strategies if s not in STRATEGIES]
    if bad:
        print(f"Unknown strategies: {bad}. Choose from {STRATEGIES}", file=sys.stderr)
        return 2
    scenarios = SCENARIOS[: max(1, args.turns)]

    persona = prompts.load_persona(args.persona)
    sysprompts = prompts.build_system_prompts(persona, args.rp_style)
    ctx_tokens = prompts.estimate_tokens(sysprompts["with_contract"])

    client = BenchClient(args.base_url, timeout=(10, args.timeout))
    try:
        if args.models.strip().lower() == "all":
            models = client.list_models(args.include, args.exclude)
        else:
            models = [m.strip() for m in args.models.split(",") if m.strip()]
    except RuntimeError as e:
        print(f"ERROR: {e}\nIs the server running? (LM Studio: start the local server / `lms server start`; "
              f"Ollama: `ollama serve`)", file=sys.stderr)
        return 1
    if not models:
        print("No chat models found on the server.", file=sys.stderr)
        return 1

    out = Path(args.out) if args.out else DEFAULT_OUT_DIR / f"{datetime.now():%Y-%m-%d}-{label}.jsonl"
    calls = len(models) * len(strategies) * len(scenarios) * args.repeats
    print(f"Backend: {label} @ {args.base_url}")
    print(f"Models ({len(models)}): " + ", ".join(models))
    print(f"Fixes: {', '.join(strategies)} | turns: {len(scenarios)} x {args.repeats} | ~{calls} turns total "
          f"(S2 makes 2 calls/turn)")
    print(f"System prompt ~{ctx_tokens} tokens. If a model errors with a context/length message, raise its "
          f"context length to >= 8192 (LM Studio: model settings -> Context Length).")
    print(f"Results file: {out}")
    if args.dry_run:
        print("(dry run - nothing sent)")
        return 0

    cfg = RunConfig(temperature=args.temperature, max_tokens=args.max_tokens, repeats=args.repeats,
                    between_models_cmd=args.between_models_cmd, retry_failed=args.retry_failed)

    def progress(rec: dict) -> None:
        flag = "ok " if rec["ok"] else "ERR"
        extra = "" if rec["ok"] else f"  {str(rec['error'])[:70]}"
        parsed = "parsed" if rec.get("parse_ok") else "prose "
        print(f"  [{flag}] {rec['model'][:34]:34} {rec['strategy']:12} {rec['scenario']:18} "
              f"{parsed} {rec['latency_s']:5.1f}s{extra}", flush=True)

    try:
        n = run_sweep(client, models, strategies, scenarios, sysprompts, out, backend_label=label,
                      cfg=cfg, on_record=progress)
    except ResumeConfigMismatch as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\nInterrupted - progress is saved. Re-run the same command to resume.")
        return 130
    print(f"\nWrote {n} new records. Build the report with:\n  python -m tools.bench report {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
