import sqlite3
import sys
import types
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _ensure_runtime_dirs() -> None:
    frontend = ROOT / "frontends" / "neon"
    storage = ROOT / "backend" / "storage"
    for directory in (
        frontend / "assets",
        frontend / "js",
        frontend / "css",
        frontend / "viewer",
        frontend / "lib",
        storage / "live2d",
        storage / "images",
        storage / "avatars",
        storage / "audio",
    ):
        directory.mkdir(parents=True, exist_ok=True)


_ensure_runtime_dirs()

import backend.server as server

DEFAULT_CONFIG = {
    "llm": {
        "provider": "stub",
        "model": "stub-model",
        "endpoint": "http://stub.local",
        "api_key": "stub-key",
    },
    "memory": {"max_history": 12},
    "tts": {"provider": "stub"},
}


def _create_schema(db_path: Path) -> None:
    con = sqlite3.connect(db_path)
    try:
        cur = con.cursor()
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY,
                title TEXT,
                created_ts INTEGER DEFAULT (strftime('%s','now')),
                archived INTEGER DEFAULT 0,
                summary TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                text TEXT NOT NULL,
                ts INTEGER DEFAULT (strftime('%s','now')),
                char_id INTEGER,
                is_active INTEGER DEFAULT 1,
                emotion TEXT,
                parent_id INTEGER,
                token_count INTEGER,
                input_token_count INTEGER,
                generation_time_ms INTEGER,
                tokens_per_second REAL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            );

            CREATE TABLE IF NOT EXISTS characters (
                id INTEGER PRIMARY KEY,
                name TEXT,
                system_prompt TEXT,
                avatar_url TEXT,
                voice_id TEXT,
                tts_provider TEXT,
                tts_pitch TEXT,
                tts_rate TEXT,
                personality_traits TEXT,
                live2d_model TEXT,
                model_type TEXT,
                avatar_2d_url TEXT,
                vrm_model_url TEXT,
                greeting_text TEXT,
                greeting_animation TEXT,
                background_url TEXT,
                background_mode TEXT DEFAULT 'transparent',
                voice_sample_path TEXT,
                vocab_categories TEXT,
                llm_endpoint TEXT,
                llm_model TEXT,
                llm_temperature REAL,
                last_emotion TEXT DEFAULT 'neutral',
                voice_config TEXT,
                expr_portraits TEXT,
                last_chat_date TEXT,
                first_chat_date TEXT,
                diary TEXT,
                diary_date TEXT,
                capability_profile TEXT
            );

            CREATE TABLE IF NOT EXISTS character_relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                char_id INTEGER UNIQUE NOT NULL,
                affinity REAL DEFAULT 0.5,
                mood REAL DEFAULT 0.5,
                trust REAL DEFAULT 0.5,
                interactions INTEGER DEFAULT 0,
                last_updated INTEGER DEFAULT (strftime('%s','now')),
                FOREIGN KEY(char_id) REFERENCES characters(id)
            );
            """
        )
        cur.execute(
            """
            INSERT OR REPLACE INTO characters (
                id, name, system_prompt, avatar_url, voice_id, tts_provider,
                tts_pitch, tts_rate, personality_traits, live2d_model, model_type,
                avatar_2d_url, vrm_model_url, background_url, background_mode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                1,
                "Default",
                "You are a helpful assistant.",
                "",
                "",
                "",
                "",
                "",
                "[]",
                "",
                "3d",
                "",
                "",
                "",
                "transparent",
            ),
        )
        con.commit()
    finally:
        con.close()


def _install_fake_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    llm_pkg = types.ModuleType("backend.llm")
    registry_mod = types.ModuleType("backend.llm.registry")

    class StubAdapter:
        def chat(self, _messages, _model, _endpoint, _api_key, **kwargs):
            """Return a canned OK response regardless of kwargs (temperature, max_tokens, etc.)."""
            return {
                "ok": True,
                "reply": "[emotion:happy] [gesture:wave] Stubbed assistant reply"
            }

    def get_client(_cfg):
        return StubAdapter()

    registry_mod.get_client = get_client

    monkeypatch.setitem(sys.modules, "backend.llm", llm_pkg)
    monkeypatch.setitem(sys.modules, "backend.llm.registry", registry_mod)


@pytest.fixture()
def server_module(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    db_path = tmp_path / "app.db"
    _create_schema(db_path)
    _install_fake_llm(monkeypatch)

    monkeypatch.setattr(server, "DB_PATH", db_path)
    monkeypatch.setattr(server, "load_config", lambda: DEFAULT_CONFIG.copy())
    monkeypatch.setattr(server, "vector_store", None)
    if hasattr(server, "reset_telemetry_metrics"):
        server.reset_telemetry_metrics()

    return server


@asynccontextmanager
async def _noop_lifespan(app):
    """No-op lifespan that skips real startup/shutdown for tests."""
    yield


@pytest.fixture()
def client(server_module):
    # Bypass the real lifespan so tests use the monkeypatched server state
    # (e.g. vector_store=None, stub LLM) instead of running full startup.
    original_lifespan = server_module.app.router.lifespan_context
    server_module.app.router.lifespan_context = _noop_lifespan

    try:
        with TestClient(server_module.app) as test_client:
            yield test_client
    finally:
        server_module.app.router.lifespan_context = original_lifespan


@pytest.fixture()
def db_path(server_module):
    return Path(server_module.DB_PATH)
