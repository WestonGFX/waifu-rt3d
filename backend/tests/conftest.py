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
                capability_profile TEXT,
                animation_profile TEXT,
                emotion_voice_overrides TEXT,
                mood_enabled INTEGER DEFAULT 1,
                mood_intensity REAL DEFAULT 0.8,
                day_off INTEGER DEFAULT 0,
                affinity REAL DEFAULT 0.0,
                emotion_portraits_mode INTEGER DEFAULT 0,
                bible_path TEXT,
                bible_enabled INTEGER DEFAULT 0,
                bible_sections TEXT,
                system_prompt_lite TEXT DEFAULT NULL
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

            CREATE TABLE IF NOT EXISTS connection_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                server_url TEXT NOT NULL DEFAULT 'http://localhost:1234/v1',
                model TEXT DEFAULT '',
                context_size INTEGER DEFAULT 4096,
                temperature REAL DEFAULT 0.8,
                top_p REAL DEFAULT 0.95,
                repeat_penalty REAL DEFAULT 1.1,
                is_active INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    llm_pkg.__path__ = []  # Make it act as a package so submodule imports work

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

    # Stub submodules that the chat endpoint imports inline
    importance_mod = types.ModuleType("backend.llm.importance_scorer")
    importance_mod.score_message = lambda text, role, **kw: 0.5

    token_counter_mod = types.ModuleType("backend.llm.token_counter")
    token_counter_mod.count_tokens = lambda text, model=None: len(text) // 4
    token_counter_mod.count_messages_tokens = lambda msgs, model=None: sum(len(m.get("content", "")) // 4 for m in msgs)
    token_counter_mod.is_tiktoken_available = lambda: False

    context_assembler_mod = types.ModuleType("backend.llm.context_assembler")

    class _StubAssembledContext:
        """Minimal stub for AssembledContext dataclass."""
        def __init__(self, **kwargs):
            self.messages = kwargs.get("messages", [{"role": "system", "content": "stub"}])
            self.token_count = kwargs.get("token_count", 10)
            self.budget_summary = kwargs.get("budget_summary", {})
            self.history_count = kwargs.get("history_count", 0)
            self.summaries_included = kwargs.get("summaries_included", 0)
            self.high_importance_kept = kwargs.get("high_importance_kept", 0)

    def _stub_assemble_context(**kwargs):
        """Return a minimal assembled context with the user message."""
        user_text = kwargs.get("user_text", "")
        return _StubAssembledContext(
            messages=[
                {"role": "system", "content": "stub system prompt"},
                {"role": "user", "content": user_text},
            ],
        )

    context_assembler_mod.assemble_context = _stub_assemble_context
    context_assembler_mod.AssembledContext = _StubAssembledContext

    router_mod = types.ModuleType("backend.llm.router")
    router_mod.get_router = lambda cfg=None: None
    router_mod.ModelRouter = type("ModelRouter", (), {})

    monkeypatch.setitem(sys.modules, "backend.llm", llm_pkg)
    monkeypatch.setitem(sys.modules, "backend.llm.registry", registry_mod)
    monkeypatch.setitem(sys.modules, "backend.llm.importance_scorer", importance_mod)
    monkeypatch.setitem(sys.modules, "backend.llm.token_counter", token_counter_mod)
    monkeypatch.setitem(sys.modules, "backend.llm.context_assembler", context_assembler_mod)
    monkeypatch.setitem(sys.modules, "backend.llm.router", router_mod)


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
