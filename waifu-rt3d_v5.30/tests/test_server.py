"""
Integration tests for FastAPI server endpoints
"""
import pytest
from fastapi.testclient import TestClient
import sys
from pathlib import Path
import tempfile
import shutil

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.server import app


@pytest.fixture
def client():
    """Create a test client"""
    return TestClient(app)


class TestConfigEndpoints:
    """Test configuration endpoints"""

    def test_get_config(self, client):
        """Test GET /api/config"""
        response = client.get("/api/config")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_put_config(self, client):
        """Test PUT /api/config"""
        new_config = {
            "llm": {
                "model": "test-model"
            }
        }
        response = client.put("/api/config", json=new_config)
        assert response.status_code == 200
        data = response.json()
        assert data['ok'] is True
        assert 'config' in data


class TestHealthCheck:
    """Test health check endpoint"""

    def test_healthcheck(self, client):
        """Test GET /api/healthcheck"""
        response = client.get("/api/healthcheck")
        assert response.status_code == 200
        data = response.json()
        assert 'ok' in data
        assert 'version' in data
        assert 'llm' in data
        assert 'status' in data


class TestSessionEndpoints:
    """Test session management endpoints"""

    def test_list_sessions(self, client):
        """Test GET /api/sessions"""
        response = client.get("/api/sessions")
        assert response.status_code == 200
        data = response.json()
        assert 'sessions' in data
        assert isinstance(data['sessions'], list)

    def test_create_session(self, client):
        """Test POST /api/sessions"""
        response = client.post("/api/sessions", json={"title": "Test Session"})
        assert response.status_code == 200
        data = response.json()
        assert 'id' in data
        # Check against returned 'id', expecting matching title
        assert data['title'] == "Test Session"

    def test_update_session(self, client):
        """Test PUT /api/sessions/{id}"""
        create_response = client.post("/api/sessions", json={"title": "Original"})
        session_id = create_response.json()['id']
        response = client.put(f"/api/sessions/{session_id}", json={"title": "Updated"})
        assert response.status_code == 200
        assert response.json()['ok'] is True

    def test_delete_session(self, client):
        """Test DELETE /api/sessions/{id}"""
        create_response = client.post("/api/sessions", json={"title": "To Delete"})
        session_id = create_response.json()['id']
        response = client.delete(f"/api/sessions/{session_id}")
        assert response.status_code == 200
        assert response.json()['ok'] is True

    def test_archive_session(self, client):
        """Test archiving/unarchiving session"""
        # Create
        res = client.post("/api/sessions", json={"title": "To Archive"})
        sid = res.json()['id']
        
        # Archive (logic moved to PUT /api/sessions/{id})
        assert client.put(f"/api/sessions/{sid}", json={"archived": True}).status_code == 200
        
        # Verify not in default list
        list_res = client.get("/api/sessions")
        ids = [s['id'] for s in list_res.json()['sessions']]
        assert sid not in ids
        
        # Verify in archived list
        arch_res = client.get("/api/sessions?archived=true")
        arch_ids = [s['id'] for s in arch_res.json()['sessions']]
        assert sid in arch_ids
        
        # Unarchive
        assert client.put(f"/api/sessions/{sid}", json={"archived": False}).status_code == 200
        
        # Verify back in default list
        list_res = client.get("/api/sessions")
        ids = [s['id'] for s in list_res.json()['sessions']]
        assert sid in ids

    def test_session_persistence(self, client):
        """Test that sessions persist"""
        title = "Persistent Session"
        res = client.post("/api/sessions", json={"title": title})
        sid = res.json()['id']
        
        # Check list immediately
        list_res = client.get("/api/sessions")
        sessions = list_res.json()['sessions']
        found = next((s for s in sessions if s['id'] == sid), None)
        assert found is not None
        assert found['title'] == title


class TestCharacterEndpoints:
    """Test character management endpoints"""

    def test_list_characters(self, client):
        """Test GET /api/characters"""
        response = client.get("/api/characters")
        assert response.status_code == 200
        data = response.json()
        assert 'characters' in data
        assert isinstance(data['characters'], list)
        
    def test_create_character(self, client):
        """Test POST /api/characters"""
        # Ensure cleanup if exists from previous run
        # We can't easily iterate and delete by name without listing all.
        # So we use a unique name or try to delete first.
        
        char_name = "New Char Unique"
        
        # Cleanup potential leftover
        # This is hacky. Better to list and delete.
        chars = client.get("/api/characters").json()['characters']
        for c in chars:
            if c['name'] == char_name:
                client.delete(f"/api/characters/{c['id']}")

        new_char = {
            "name": char_name,
            "system_prompt": "You are new.",
            "personality_traits": ["new"]
        }
        response = client.post("/api/characters", json=new_char)
        assert response.status_code == 200
        data = response.json()
        assert data['name'] == char_name
        assert 'id' in data
        
        # Cleanup
        client.delete(f"/api/characters/{data['id']}")

    def test_update_character(self, client):
        """Test PUT /api/characters/{id}"""
        # Cleanup
        chars = client.get("/api/characters").json()['characters']
        for c in chars:
            if c['name'] == "To Update":
                client.delete(f"/api/characters/{c['id']}")

        # Create
        new_char = {"name": "To Update", "system_prompt": "Prompt"}
        create_res = client.post("/api/characters", json=new_char)
        char_id = create_res.json()['id']

        # Update
        response = client.put(f"/api/characters/{char_id}", json={"name": "Updated Name"})
        assert response.status_code == 200
        assert response.json()['ok'] is True
        
        # Cleanup
        client.delete(f"/api/characters/{char_id}")

    def test_delete_character(self, client):
        """Test DELETE /api/characters/{id}"""
        # Cleanup
        chars = client.get("/api/characters").json()['characters']
        for c in chars:
            if c['name'] == "To Delete":
                client.delete(f"/api/characters/{c['id']}")

        # Create
        new_char = {"name": "To Delete", "system_prompt": "Prompt"}
        create_res = client.post("/api/characters", json=new_char)
        char_id = create_res.json()['id']

        # Delete
        response = client.delete(f"/api/characters/{char_id}")
        assert response.status_code == 200
        assert response.json()['ok'] is True

    def test_delete_default_character(self, client):
        """Test that deleting default character (id=1) fails"""
        response = client.delete("/api/characters/1")
        assert response.status_code == 400


class TestVoiceEndpoints:
    """Test Voice and TTS endpoints"""

    def test_api_tts_direct(self, client):
        """Test POST /api/tts direct generation"""
        # We assume edge-tts might be available or fallback logic handles it.
        # This test mainly checks parameter parsing and response structure.
        payload = {
            "text": "Hello test.",
            "provider": "edge-tts",
            "voice_id": "en-US-AriaNeural"
        }
        # Note: This might fail if edge-tts is not installed/net access blocked,
        # but we check for structure or graceful error.
        response = client.post("/api/tts", json=payload)
        
        # We expect either 200 OK (generated) or 400/500 if tool missing.
        # But we primarily want to verify the logic doesn't crash.
        # If real generation happens, 'url' will be present.
        if response.status_code == 200:
            data = response.json()
            assert data['ok'] is True
            assert 'url' in data
            assert 'meta' in data
            assert data['meta'].get('voice_id') == "en-US-AriaNeural"

    def test_tts_validation(self, client):
        """Test validation logic for TTS"""
        # 1. Missing text
        res = client.post("/api/tts", json={"provider": "edge-tts"})
        assert res.status_code == 400
        
        # 2. Empty text
        res = client.post("/api/tts", json={"text": "   ", "provider": "edge-tts"})
        assert res.status_code == 400

    def test_chat_voice_params(self, client):
        """Test /api/chat with speak=True picking up character voice"""
        from unittest.mock import patch, MagicMock

        # Cleanup
        chars = client.get("/api/characters").json()['characters']
        for c in chars:
            if c['name'] == "VoiceTestChar":
                client.delete(f"/api/characters/{c['id']}")

        # 1. Create character with specific voice
        char_payload = {
            "name": "VoiceTestChar",
            "system_prompt": "You are a test.",
            "voice_id": "en-US-GuyNeural",
            "tts_provider": "edge-tts",
            "tts_pitch": "+5Hz",
            "tts_rate": "+10%"
        }
        char_res = client.post("/api/characters", json=char_payload)
        char_id = char_res.json()['id']

        # 2. Setup mocks for LLM and TTS
        mock_llm_client = MagicMock()
        mock_llm_client.chat.return_value = {"ok": True, "reply": "This is a mocked reply."}

        mock_tts_client = MagicMock()
        mock_tts_client.speak.return_value = {"ok": True, "filename": "mock.mp3", "meta": {}}

        # Debug: Check if character was saved correctly
        get_char = client.get(f"/api/characters")
        chars = get_char.json()['characters']
        saved = next((c for c in chars if c['id'] == char_id), None)
        print(f"DEBUG: Saved character: {saved}")
        assert saved['voice_id'] == "en-US-GuyNeural"

        # Patch where they are used. Note: imported inside chat() function
        with patch('backend.llm.registry.get_client', return_value=mock_llm_client), \
             patch('backend.tts.registry.get_tts', return_value=mock_tts_client) as mock_get_tts:
            
            # 3. Chat with this character
            chat_payload = {
                "text": "Hello.",
                "speak": True
            }
            response = client.post(f"/api/chat?char_id={char_id}", json=chat_payload)
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify LLM was called
            mock_llm_client.chat.assert_called_once()
            
            # Verify TTS was initialized with merged config
            # get_tts(cfg) is called. Verify cfg has character params.
            print(f"DEBUG: Mock TTS call args: {mock_get_tts.call_args}")
            if mock_get_tts.call_args:
                called_cfg = mock_get_tts.call_args[0][0]
                print(f"DEBUG: Config passed to get_tts: {called_cfg.get('tts')}")
                assert called_cfg['tts']['voice_id'] == "en-US-GuyNeural"
                assert called_cfg['tts']['provider'] == "edge-tts"
                assert called_cfg['tts']['tts_pitch'] == "+5Hz"
            else:
                pytest.fail("get_tts was not called")

            # Verify TTS functionality
            assert data['ok'] is True
            assert data['audio'] == "/files/audio/mock.mp3"
            assert data['reply'] == "This is a mocked reply."

        # Clean up
        client.delete(f"/api/characters/{char_id}")


class TestErrorHandling:
    """Test error handling"""

    def test_404_on_invalid_endpoint(self, client):
        """Test that invalid endpoints return 404"""
        response = client.get("/api/nonexistent")
        assert response.status_code == 404

    def test_400_on_missing_required_field(self, client):
        """Test validation on required fields"""
        # POST /api/chat requires 'text'
        response = client.post("/api/chat", json={})
        assert response.status_code == 400
