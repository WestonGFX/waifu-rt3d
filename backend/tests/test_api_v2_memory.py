import sqlite3


def _seed_messages(db_path, texts):
    con = sqlite3.connect(db_path)
    try:
        cur = con.cursor()
        cur.execute("INSERT OR IGNORE INTO sessions(id,title) VALUES (?,?)", (1, "Session 1"))
        for role, text in texts:
            cur.execute(
                "INSERT INTO messages(session_id, role, text) VALUES (?, ?, ?)",
                (1, role, text),
            )
        con.commit()
    finally:
        con.close()


def test_memory_search_returns_empty_when_vector_store_offline(client):
    response = client.get(
        "/api/v2/memory/search",
        params={"char_id": 1, "query": "hello", "n_results": 5},
    )

    assert response.status_code == 200
    assert response.json() == {"results": []}


def test_memory_search_maps_result_shape_and_score(client, server_module):
    class StubVectorStore:
        def query_memory(self, query, n_results=5, char_id=None):
            assert query == "hello"
            assert n_results == 2
            assert char_id == 1
            return [
                {
                    "id": "mem-1",
                    "text": "prior hello",
                    "role": "assistant",
                    "dist": 0.22,
                    "session_id": 7,
                    "timestamp": 1234,
                }
            ]

    server_module.vector_store = StubVectorStore()

    response = client.get(
        "/api/v2/memory/search",
        params={"char_id": 1, "query": "hello", "n_results": 2},
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["results"]) == 1
    result = payload["results"][0]
    assert result["id"] == "mem-1"
    assert result["text"] == "prior hello"
    assert result["role"] == "assistant"
    assert result["score"] == 0.78
    assert result["session_id"] == 7
    assert result["timestamp"] == 1234


def test_memory_graph_session_mode_contract(client, db_path):
    _seed_messages(
        db_path,
        [
            ("user", "Hello"),
            ("assistant", "Hi there"),
            ("user", "Remember this"),
        ],
    )

    response = client.get(
        "/api/v2/memory/graph",
        params={"session_id": 1, "char_id": 1, "limit": 20},
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["mode"] == "session"
    assert isinstance(payload["nodes"], list)
    assert isinstance(payload["edges"], list)
    assert payload["stats"]["sessionMessages"] == 3
    assert payload["stats"]["memoryHits"] == 0
    assert payload["stats"]["ragAvailable"] is False

    assert len(payload["nodes"]) == 3
    assert all("id" in node and "label" in node and "role" in node for node in payload["nodes"])
    assert len(payload["edges"]) == 2
    assert all(edge["kind"] == "sequence" for edge in payload["edges"])


def test_memory_graph_rag_mode_adds_retrieval_nodes(client, db_path, server_module):
    _seed_messages(
        db_path,
        [
            ("user", "Find old context"),
            ("assistant", "Working on it"),
        ],
    )

    class StubVectorStore:
        def query_memory(self, query, n_results=5, char_id=None):
            assert "Working on it" in query
            return [
                {
                    "id": "mem-9",
                    "text": "Archived context",
                    "role": "assistant",
                    "dist": 0.1,
                    "session_id": 1,
                    "timestamp": 888,
                }
            ]

    server_module.vector_store = StubVectorStore()

    response = client.get(
        "/api/v2/memory/graph",
        params={"session_id": 1, "char_id": 1, "limit": 20},
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["mode"] == "rag"
    assert payload["stats"]["memoryHits"] == 1
    assert payload["stats"]["ragAvailable"] is True

    retrieval_nodes = [node for node in payload["nodes"] if node["role"] == "memory"]
    retrieval_edges = [edge for edge in payload["edges"] if edge["kind"] == "retrieval"]

    assert len(retrieval_nodes) == 1
    assert len(retrieval_edges) == 1
