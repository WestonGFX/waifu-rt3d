import sys
import types


def test_telemetry_summary_starts_empty(client):
    response = client.get("/api/v2/telemetry/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["api"]["requests_total"] == 0
    assert payload["api"]["error_rate"] == 0.0
    assert payload["memory"]["graph_requests_total"] == 0
    assert payload["memory"]["fallback_rate"] == 0.0


def test_telemetry_tracks_api_errors_and_memory_fallback(client):
    client.get("/api/does-not-exist")
    client.get("/api/v2/memory/graph", params={"session_id": 1, "char_id": 1, "limit": 20})
    response = client.get("/api/v2/telemetry/summary")

    assert response.status_code == 200
    payload = response.json()
    assert payload["api"]["requests_total"] >= 2
    assert payload["api"]["errors_4xx"] >= 1
    assert payload["memory"]["graph_requests_total"] >= 1
    assert payload["memory"]["graph_fallback_total"] >= 1
    assert payload["memory"]["graph_session_mode_total"] >= 1


def test_telemetry_tracks_chat_failures(client, monkeypatch):
    llm_pkg = types.ModuleType("backend.llm")
    registry_mod = types.ModuleType("backend.llm.registry")

    class FailingAdapter:
        def chat(self, _messages, _model, _endpoint, _api_key):
            return {"ok": False, "error": "synthetic failure"}

    def get_client(_cfg):
        return FailingAdapter()

    registry_mod.get_client = get_client
    monkeypatch.setitem(sys.modules, "backend.llm", llm_pkg)
    monkeypatch.setitem(sys.modules, "backend.llm.registry", registry_mod)

    chat = client.post(
        "/api/chat",
        json={"text": "probe", "session_id": 1, "char_id": 1, "client_message_id": "m1"}
    )
    assert chat.status_code == 200
    assert chat.json()["ok"] is False

    response = client.get("/api/v2/telemetry/summary")
    payload = response.json()
    assert payload["chat"]["requests_total"] >= 1
    assert payload["chat"]["failures_total"] >= 1
    assert payload["chat"]["failure_rate"] > 0
