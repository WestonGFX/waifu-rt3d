"""Tests for tools/bench — the Kokoro model benchmark harness.

Real models live on the user's machine, so these tests drive the harness
against a tiny in-process OpenAI-compatible server whose behaviour is chosen
by model name.  They prove: discovery, all four strategies, scoring, the
fail-fast guard, resume, and report generation.
"""
from __future__ import annotations

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))

from tools.bench import metrics, prompts, report  # noqa: E402
from tools.bench.__main__ import main as bench_main  # noqa: E402
from tools.bench.client import BenchClient, guess_backend_label  # noqa: E402
from tools.bench.runner import RunConfig, load_done_keys, run_sweep  # noqa: E402
from tools.bench.scenarios import SCENARIOS  # noqa: E402

GOOD = {
    "reply": "*smiles* Good morning!", "facialExpression": "smile", "gesture": "wave",
    "memoryWrite": {"shouldSave": False, "summary": "", "importance": 0.0, "emotionalSalience": 0.0},
    "stateDelta": {"mood": 0.03},
}
ANNOTATION = {k: v for k, v in GOOD.items() if k != "reply"}


_FLAKY = {"down": True}  # toggled by tests to simulate a model that is still loading


_LAST = {"auth": None}  # last Authorization header the mock saw on GET /models


@pytest.fixture(autouse=True)
def _reset_flaky():
    """Reset shared mock state around EVERY test so a failing assertion can't poison later ones."""
    _FLAKY["down"] = True
    yield
    _FLAKY["down"] = True


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # silence
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.endswith("/models"):
            _LAST["auth"] = self.headers.get("Authorization")
            ids = ["good-json", "prose-only", "broken", "fenced", "prefill-continues", "rejects-schema", "flaky", "prefill-prose",
                   "kokoro-tts-v1", "Qwen3-4B-Instruct",
                   "text-embedding-nomic-embed-text-v1.5"]
            self._send(200, {"data": [{"id": i} for i in ids]})
        else:
            self._send(404, {})

    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        model = req["model"]
        rf = req.get("response_format")
        msgs = req["messages"]
        is_annotation = bool(rf and rf["json_schema"]["name"] == "annotation")
        prefilled = msgs[-1]["role"] == "assistant" and msgs[-1]["content"] == "{"

        if model == "broken":
            return self._send(500, {"error": "boom"})
        if model == "flaky" and _FLAKY["down"]:
            return self._send(503, {"error": "model still loading"})
        if model == "rejects-schema" and rf:
            return self._send(400, {"error": "response_format json_schema unsupported"})
        if is_annotation:
            text = json.dumps(ANNOTATION)
        elif model == "good-json":
            text = json.dumps(GOOD)
        elif model == "fenced":
            text = "```json\n" + json.dumps(GOOD) + "\n```"
        elif model == "prefill-prose" and prefilled:
            text = "Sure! Here you go: *smiles*"  # server ignored the prefill entirely
        elif model == "prefill-continues" and prefilled:
            text = json.dumps(GOOD)[1:]  # continuation WITHOUT the leading brace
        elif model in ("prose-only", "prefill-continues") and rf:
            text = json.dumps(GOOD)  # schema forcing works
        else:
            text = "*tilts head* Mmm, hi there. {not really json"
        self._send(200, {
            "choices": [{"message": {"role": "assistant", "content": text}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 50},
        })


@pytest.fixture(scope="module")
def server():
    # Localhost must bypass the sandbox HTTP proxy; scoped so it can't leak into other tests.
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("NO_PROXY", "127.0.0.1,localhost")
        mp.setenv("no_proxy", "127.0.0.1,localhost")
        srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        t = threading.Thread(target=srv.serve_forever, daemon=True)
        t.start()
        yield f"http://127.0.0.1:{srv.server_address[1]}/v1"
        srv.shutdown()


@pytest.fixture(scope="module")
def sysprompts():
    return prompts.build_system_prompts("You are Test-chan.", "none")


# ── prompts ─────────────────────────────────────────────────────────────


def test_load_persona_extracts_fenced_system_prompt():
    text = prompts.load_persona()
    assert text.startswith("<!-- TIER: CORE -->")
    assert len(text) > 5000
    assert "```" not in text.split("\n")[0]


def test_load_persona_falls_back_to_whole_file(tmp_path):
    f = tmp_path / "p.txt"
    f.write_text("You are plain.", encoding="utf-8")
    assert prompts.load_persona(f) == "You are plain."


def test_contract_is_appended_last_like_context_assembler(sysprompts):
    assert "## Response contract" in sysprompts["with_contract"]
    assert "## Response contract" not in sysprompts["plain"]
    assert sysprompts["with_contract"].startswith(sysprompts["plain"] + "\n\n")
    assert sysprompts["with_contract"].rstrip().endswith("- Match facialExpression to the user's emotional tone.")


def test_extractor_schema_drops_reply():
    s = prompts.extractor_schema()
    assert "reply" not in s["properties"] and "reply" not in s["required"]


# ── metrics ─────────────────────────────────────────────────────────────


def test_metrics_clean_json():
    m = metrics.score_structured(json.dumps(GOOD))
    assert m["parse_ok"] and m["strict_json"] and m["schema_valid"] and m["delta_in_clamp"]
    assert not m["json_leak"] and m["action_markup"]


def test_metrics_fenced_json_parses_but_is_not_clean():
    m = metrics.score_structured("```json\n" + json.dumps(GOOD) + "\n```")
    assert m["parse_ok"] and not m["strict_json"] and not m["schema_valid"]


def test_metrics_prose_fails():
    m = metrics.score_structured("*waves* hi!")
    assert not m["parse_ok"] and not m["strict_json"]


def test_metrics_bad_enum_and_delta():
    bad = dict(GOOD, facialExpression="grimace", stateDelta={"mood": 0.5, "made_up": 0.01})
    m = metrics.score_structured(json.dumps(bad))
    assert m["parse_ok"] and m["strict_json"] and not m["schema_valid"]
    assert not m["delta_in_clamp"] and m["unknown_dials"] == 1


def test_metrics_json_leak_in_prose():
    assert metrics.score_prose('She smiles. "stateDelta": {"mood": 0.1}')["json_leak"]
    assert metrics.score_prose('{"reply": "hi"}')["json_leak"]
    assert not metrics.score_prose("*smiles* hello")["json_leak"]


# ── client ──────────────────────────────────────────────────────────────


def test_guess_backend_label():
    assert guess_backend_label("http://localhost:1234/v1") == "lmstudio"
    assert guess_backend_label("http://localhost:11434") == "ollama"
    assert guess_backend_label("http://x:9") == "custom"


def test_list_models_filters_embeddings_and_regex(server):
    c = BenchClient(server)
    assert "text-embedding-nomic-embed-text-v1.5" not in c.list_models()
    assert "kokoro-tts-v1" not in c.list_models()          # a real TTS model is dropped...
    assert "Qwen3-4B-Instruct" in c.list_models()          # ...but "tts" inside other words is not matched
    assert c.list_models(include="json") == ["good-json"]
    assert "broken" not in c.list_models(exclude="broken")


def test_list_models_unreachable_raises():
    with pytest.raises(RuntimeError):
        BenchClient("http://127.0.0.1:9").list_models()


# ── runner ──────────────────────────────────────────────────────────────


def _sweep(server, sysprompts, tmp_path, models, strategies, n=5):
    out = tmp_path / "r.jsonl"
    recs = []
    run_sweep(BenchClient(server), models, strategies, SCENARIOS[:n], sysprompts, out,
              backend_label="mock", cfg=RunConfig(), on_record=recs.append)
    return out, recs


def test_baseline_vs_schema_vs_split(server, sysprompts, tmp_path):
    _, recs = _sweep(server, sysprompts, tmp_path, ["prose-only"],
                     ["S0_baseline", "S1_schema", "S2_split"])
    by = {s: [r for r in recs if r["strategy"] == s] for s in ("S0_baseline", "S1_schema", "S2_split")}
    assert not any(r["parse_ok"] for r in by["S0_baseline"])  # reproduces the May 0%
    assert all(r["parse_ok"] and r["schema_valid"] for r in by["S1_schema"])
    s2 = by["S2_split"]
    assert all(r["parse_ok"] and r["schema_valid"] for r in s2)
    assert all(r["reply"] and r["text2"] for r in s2)
    assert all(r["completion_tokens"] == 100 for r in s2)  # two calls summed


def test_good_model_clean_on_baseline(server, sysprompts, tmp_path):
    _, recs = _sweep(server, sysprompts, tmp_path, ["good-json"], ["S0_baseline"])
    assert all(r["ok"] and r["parse_ok"] and r["strict_json"] for r in recs)
    assert recs[0]["reply"] == GOOD["reply"]


def test_fenced_counts_as_parse_ok_not_clean(server, sysprompts, tmp_path):
    _, recs = _sweep(server, sysprompts, tmp_path, ["fenced"], ["S0_baseline"], n=2)
    assert all(r["parse_ok"] and not r["strict_json"] for r in recs)


def test_prefill_continuation_is_stitched(server, sysprompts, tmp_path):
    _, recs = _sweep(server, sysprompts, tmp_path, ["prefill-continues"], ["S3_prefill"], n=2)
    assert all(r["parse_ok"] and r["strict_json"] for r in recs)


def test_failfast_after_three_consecutive_failures(server, sysprompts, tmp_path):
    _, recs = _sweep(server, sysprompts, tmp_path, ["broken"], ["S0_baseline"], n=6)
    assert len(recs) == 6 and not any(r["ok"] for r in recs)
    assert [bool(r.get("skipped")) for r in recs] == [False] * 3 + [True] * 3


def test_resume_skips_completed_cells(server, sysprompts, tmp_path):
    out, first = _sweep(server, sysprompts, tmp_path, ["good-json"], ["S0_baseline"], n=3)
    assert len(first) == 3 and len(load_done_keys(out)) == 3
    again = []
    run_sweep(BenchClient(server), ["good-json"], ["S0_baseline"], SCENARIOS[:4], sysprompts, out,
              backend_label="mock", cfg=RunConfig(), on_record=again.append)
    assert [r["scenario"] for r in again] == [SCENARIOS[3].id]  # only the new cell ran


def test_unknown_strategy_raises(server, sysprompts):
    from tools.bench.runner import run_one
    with pytest.raises(ValueError):
        run_one(BenchClient(server), "good-json", "S9_nope", sysprompts, SCENARIOS[0], RunConfig())


# ── report + CLI ────────────────────────────────────────────────────────


def test_report_ranks_and_flags_candidates(server, sysprompts, tmp_path):
    out, _ = _sweep(server, sysprompts, tmp_path, ["good-json", "prose-only", "broken"],
                    ["S0_baseline", "S1_schema"])
    md = report.render_markdown(report.load_records([out]))
    assert "## 1. Which fix works best" in md and "## 2. Every model x fix" in md
    assert "## 3. Candidates that clear the bar" in md and "**good-json**" in md
    assert "prose-only** (mock) with **S1_schema" in md          # schema forcing rescues it
    assert "prose-only** (mock) with **S0_baseline" not in md    # baseline does not
    assert "## 4. Errors seen" in md and "`broken`" in md
    assert "Reply sample sheet" in md and "Her:" in md


def test_report_empty():
    assert "_No records._" in report.render_markdown([])


def test_cli_dry_run_and_report(server, tmp_path, capsys):
    out = tmp_path / "cli.jsonl"
    assert bench_main(["--base-url", server, "--models", "good-json", "--strategies", "S0_baseline",
                       "--turns", "2", "--out", str(out)]) == 0
    assert len(out.read_text().splitlines()) == 2
    assert bench_main(["report", str(out)]) == 0
    assert (tmp_path / "cli.md").exists()
    assert bench_main(["--base-url", server, "--models", "all", "--include", "json", "--dry-run",
                       "--out", str(tmp_path / "x.jsonl")]) == 0
    assert "dry run" in capsys.readouterr().out


def test_cli_rejects_unknown_strategy_and_dead_server(tmp_path):
    assert bench_main(["--strategies", "nope", "--models", "x"]) == 2
    assert bench_main(["--base-url", "http://127.0.0.1:9", "--models", "all"]) == 1


# ── review follow-ups ───────────────────────────────────────────────────


def test_ollama_style_base_url_without_v1(server):
    """Ollama is configured as http://host:11434 (no /v1) — client must add it."""
    bare = server[: -len("/v1")]
    c = BenchClient(bare)
    assert "good-json" in c.list_models()
    assert c.chat([{"role": "user", "content": "hi"}], "good-json").ok


def test_failfast_is_per_strategy_not_per_model(server, sysprompts, tmp_path):
    """A server rejecting json_schema must not stop the baseline strategy from running."""
    _, recs = _sweep(server, sysprompts, tmp_path, ["rejects-schema"], ["S1_schema", "S0_baseline"], n=6)
    s1 = [r for r in recs if r["strategy"] == "S1_schema"]
    s0 = [r for r in recs if r["strategy"] == "S0_baseline"]
    assert not any(r["ok"] for r in s1) and sum(1 for r in s1 if r.get("skipped")) == 3
    assert all(r["ok"] and not r.get("skipped") for r in s0)
    assert "unsupported" in s1[0]["error"]


def test_report_orders_best_parse_rate_first(server, sysprompts, tmp_path):
    out, _ = _sweep(server, sysprompts, tmp_path, ["prose-only", "good-json"], ["S0_baseline"], n=3)
    rows = report.aggregate(report.load_records([out]))
    assert [r["model"] for r in rows] == ["good-json", "prose-only"]
    assert rows[0]["parse_ok"] == 1.0 and rows[1]["parse_ok"] == 0.0


# ── second review round ─────────────────────────────────────────────────


def test_resume_retries_skipped_cells_after_transient_failure(server, sysprompts, tmp_path):
    """A model that was still loading must not stay 'skipped' forever."""
    out = tmp_path / "flaky.jsonl"
    _FLAKY["down"] = True
    run_sweep(BenchClient(server), ["flaky"], ["S0_baseline"], SCENARIOS[:6], sysprompts, out,
              backend_label="mock", cfg=RunConfig())
    first = [json.loads(line) for line in out.read_text().splitlines()]
    assert not any(r["ok"] for r in first) and sum(1 for r in first if r.get("skipped")) == 3
    assert len(load_done_keys(out)) == 3          # only the 3 real attempts count as done

    _FLAKY["down"] = False                        # model finished loading
    again = []
    run_sweep(BenchClient(server), ["flaky"], ["S0_baseline"], SCENARIOS[:6], sysprompts, out,
              backend_label="mock", cfg=RunConfig(), on_record=again.append)
    assert len(again) == 3 and all(r["ok"] for r in again)   # the skipped cells were retried
    # report keeps the newest record per cell, so the stale placeholders disappear
    recs = report.load_records([out])
    assert len(recs) == 6
    assert sum(1 for r in recs if r.get("skipped")) == 0
    _FLAKY["down"] = True


def test_retry_failed_flag_reruns_real_failures(server, sysprompts, tmp_path):
    out = tmp_path / "rf.jsonl"
    _FLAKY["down"] = True
    run_sweep(BenchClient(server), ["flaky"], ["S0_baseline"], SCENARIOS[:2], sysprompts, out,
              backend_label="mock", cfg=RunConfig())
    assert len(load_done_keys(out)) == 2
    assert len(load_done_keys(out, retry_failed=True)) == 0
    _FLAKY["down"] = False
    again = []
    run_sweep(BenchClient(server), ["flaky"], ["S0_baseline"], SCENARIOS[:2], sysprompts, out,
              backend_label="mock", cfg=RunConfig(retry_failed=True), on_record=again.append)
    assert len(again) == 2 and all(r["ok"] for r in again)
    _FLAKY["down"] = True


def test_prefill_not_stitched_when_server_ignores_it(server, sysprompts, tmp_path):
    """Prose from a server that ignored the prefill must not be corrupted with a leading brace."""
    _, recs = _sweep(server, sysprompts, tmp_path, ["prefill-prose"], ["S3_prefill"], n=2)
    assert all(r["prefill_stitched"] is False for r in recs)
    assert all(not r["text"].startswith("{") and not r["parse_ok"] for r in recs)


def test_prefill_stitched_flag_true_when_continuation(server, sysprompts, tmp_path):
    _, recs = _sweep(server, sysprompts, tmp_path, ["prefill-continues"], ["S3_prefill"], n=2)
    assert all(r["prefill_stitched"] is True and r["parse_ok"] for r in recs)


def test_classify_error_separates_unsupported_from_crash():
    from tools.bench.runner import classify_error
    assert classify_error("") == ""
    assert classify_error("API Error 400: response_format json_schema unsupported") == "unsupported"
    assert classify_error("Request Timed Out") == "error"
    assert classify_error("API Error 500: boom") == "error"


def test_unsupported_rejection_is_labelled_in_records_and_report(server, sysprompts, tmp_path):
    out, recs = _sweep(server, sysprompts, tmp_path, ["rejects-schema"], ["S1_schema"], n=3)
    assert all(r["error_kind"] == "unsupported" for r in recs)
    assert "[server rejected structured output]" in report.render_markdown(report.load_records([out]))


def test_guess_backend_label_parses_port_not_substring():
    assert guess_backend_label("http://host:12345/v1") == "custom"      # not ":1234"
    assert guess_backend_label("http://host:114345") == "custom"
    assert guess_backend_label("http://localhost:1234") == "lmstudio"
    assert guess_backend_label("localhost:11434") == "ollama"


def test_failed_between_models_command_warns(server, sysprompts, tmp_path, caplog):
    caplog.set_level("WARNING")
    run_sweep(BenchClient(server), ["good-json", "fenced"], ["S0_baseline"], SCENARIOS[:1], sysprompts,
              tmp_path / "w.jsonl", backend_label="mock",
              cfg=RunConfig(between_models_cmd="false"), sleep=lambda _s: None)
    assert any("exited 1" in r.message for r in caplog.records)


def test_report_notes_s2_toks_are_blended(server, sysprompts, tmp_path):
    out, _ = _sweep(server, sysprompts, tmp_path, ["good-json"], ["S0_baseline"], n=1)
    assert "S2 makes two calls per turn" in report.render_markdown(report.load_records([out]))


# ── third review round ──────────────────────────────────────────────────


def test_classify_error_is_not_fooled_by_stray_400s():
    from tools.bench.runner import classify_error
    assert classify_error("Connection Failed: timed out after 14003ms (schema cache)") == "error"
    assert classify_error("Connection refused on port 4001 json_schema") == "error"
    assert classify_error("API Error 500: schema compile failed") == "error"
    assert classify_error("API Error 400: 'response_format' is not supported") == "unsupported"
    assert classify_error("API Error 422: invalid json_schema") == "unsupported"


def test_s2_annotation_without_reply_key_is_parse_ok():
    """S2's annotation payload has no `reply`; the app's parser must still call it parse_ok."""
    m = metrics.score_structured(json.dumps(ANNOTATION), require_reply=False)
    assert m["parse_ok"] and m["schema_valid"]


def test_hung_between_models_command_times_out_instead_of_stalling(server, sysprompts, tmp_path, caplog):
    import time
    caplog.set_level("WARNING")
    t0 = time.time()
    run_sweep(BenchClient(server), ["good-json", "fenced"], ["S0_baseline"], SCENARIOS[:1], sysprompts,
              tmp_path / "t.jsonl", backend_label="mock",
              cfg=RunConfig(between_models_cmd="sleep 30", between_models_timeout=0.3), sleep=lambda _s: None)
    assert time.time() - t0 < 10
    assert any("timeout" in r.message for r in caplog.records)


def test_resume_report_dedupes_without_double_counting(server, sysprompts, tmp_path):
    """After a retry the file holds placeholder + real record; aggregate must count each cell once."""
    out = tmp_path / "d.jsonl"
    _FLAKY["down"] = True
    run_sweep(BenchClient(server), ["flaky"], ["S0_baseline"], SCENARIOS[:5], sysprompts, out,
              backend_label="mock", cfg=RunConfig())
    _FLAKY["down"] = False
    run_sweep(BenchClient(server), ["flaky"], ["S0_baseline"], SCENARIOS[:5], sysprompts, out,
              backend_label="mock", cfg=RunConfig())
    rows = report.aggregate(report.load_records([out]))
    assert len(rows) == 1 and rows[0]["n"] == 5          # not 5 + the stale skipped rows
    _FLAKY["down"] = True


# ── fourth review round ─────────────────────────────────────────────────


def test_resume_refuses_changed_sampling_settings(server, sysprompts, tmp_path):
    from tools.bench.runner import ResumeConfigMismatch
    out = tmp_path / "cfg.jsonl"
    run_sweep(BenchClient(server), ["good-json"], ["S0_baseline"], SCENARIOS[:2], sysprompts, out,
              backend_label="mock", cfg=RunConfig(temperature=0.8))
    with pytest.raises(ResumeConfigMismatch):
        run_sweep(BenchClient(server), ["good-json"], ["S0_baseline"], SCENARIOS[:3], sysprompts, out,
                  backend_label="mock", cfg=RunConfig(temperature=0.2))
    # same settings still resume fine
    again = []
    run_sweep(BenchClient(server), ["good-json"], ["S0_baseline"], SCENARIOS[:3], sysprompts, out,
              backend_label="mock", cfg=RunConfig(temperature=0.8), on_record=again.append)
    assert len(again) == 1


def test_cli_exits_2_on_resume_config_mismatch(server, tmp_path, capsys):
    out = tmp_path / "m.jsonl"
    base = ["--base-url", server, "--models", "good-json", "--strategies", "S0_baseline", "--turns", "1",
            "--out", str(out)]
    assert bench_main(base + ["--temperature", "0.8"]) == 0
    assert bench_main(base + ["--temperature", "0.3"]) == 2
    assert "different --out" in capsys.readouterr().err


def test_skipped_records_do_not_break_report_rendering(server, sysprompts, tmp_path):
    out, recs = _sweep(server, sysprompts, tmp_path, ["broken"], ["S0_baseline", "S3_prefill"], n=6)
    assert sum(1 for r in recs if r.get("skipped")) == 6    # 3 per strategy
    md = report.render_markdown(report.load_records([out]))   # skipped rows lack error_kind etc.
    assert "broken" in md and "0%" in md


def test_empty_state_delta_is_valid_not_a_failure():
    m = metrics.score_structured(json.dumps(dict(GOOD, stateDelta={})))
    assert m["parse_ok"] and m["schema_valid"] and m["delta_in_clamp"] and m["unknown_dials"] == 0


def test_list_models_sends_api_key_when_configured(server):
    BenchClient(server, api_key="sk-local").list_models()
    assert _LAST["auth"] == "Bearer sk-local"
    BenchClient(server).list_models()
    assert _LAST["auth"] is None
