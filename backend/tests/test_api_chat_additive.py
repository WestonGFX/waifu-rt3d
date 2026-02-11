def test_chat_response_keeps_legacy_and_additive_fields(client):
    response = client.post(
        "/api/chat",
        json={
            "text": "Hello there",
            "session_id": 1,
            "char_id": 1,
            "speak": False,
            "client_message_id": "client-abc-1",
        },
    )

    assert response.status_code == 200
    payload = response.json()

    # Legacy contract fields
    assert payload["ok"] is True
    assert isinstance(payload["reply"], str) and payload["reply"]
    assert "audio" in payload
    assert payload["session_id"] == 1

    # Additive fields
    assert payload["status"] == "ok"
    assert payload["client_message_id"] == "client-abc-1"
    assert isinstance(payload["user_message_id"], int)
    assert isinstance(payload["assistant_message_id"], int)
    assert isinstance(payload["memory_hits"], list)


def test_chat_returns_empty_memory_hits_when_vector_store_unavailable(client, server_module):
    server_module.vector_store = None

    response = client.post(
        "/api/chat",
        json={
            "text": "No vector store",
            "session_id": 2,
            "char_id": 1,
            "speak": False,
            "client_message_id": "client-abc-2",
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["ok"] is True
    assert payload["memory_hits"] == []
    assert payload["client_message_id"] == "client-abc-2"


def test_chat_maps_memory_hits_when_vector_store_available(client, server_module):
    class StubVectorStore:
        def __init__(self):
            self.calls = []

        def add_memory(self, session_id, char_id, role, text):
            self.calls.append((session_id, char_id, role, text))

        def query_memory(self, query, char_id=None, n_results=5):
            self.calls.append((query, char_id, n_results))
            return [
                {
                    "text": "Stored memory",
                    "role": "assistant",
                    "dist": 0.35,
                    "session_id": 5,
                    "timestamp": 456,
                }
            ]

    server_module.vector_store = StubVectorStore()

    response = client.post(
        "/api/chat",
        json={
            "text": "Use memory",
            "session_id": 3,
            "char_id": 1,
            "speak": False,
            "client_message_id": "client-abc-3",
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["ok"] is True
    assert len(payload["memory_hits"]) == 1

    memory = payload["memory_hits"][0]
    assert memory["text"] == "Stored memory"
    assert memory["role"] == "assistant"
    assert memory["score"] == 0.65
    assert memory["session_id"] == 5
    assert memory["timestamp"] == 456
