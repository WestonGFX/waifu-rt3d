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
        assert 'libs' in data
        assert 'lmstudio' in data


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
        assert 'session_id' in data
        assert data['id'] == data['session_id']
        assert data['title'] == "Test Session"

    def test_update_session(self, client):
        """Test PUT /api/sessions/{id}"""
        create_response = client.post("/api/sessions", json={"title": "Original"})
        session_id = create_response.json()['session_id']
        response = client.put(f"/api/sessions/{session_id}", json={"title": "Updated"})
        assert response.status_code == 200
        assert response.json()['ok'] is True

    def test_delete_session(self, client):
        """Test DELETE /api/sessions/{id}"""
        create_response = client.post("/api/sessions", json={"title": "To Delete"})
        session_id = create_response.json()['session_id']
        response = client.delete(f"/api/sessions/{session_id}")
        assert response.status_code == 200
        assert response.json()['ok'] is True

    def test_archive_session(self, client):
        """Test archiving/unarchiving session"""
        # Create
        res = client.post("/api/sessions", json={"title": "To Archive"})
        sid = res.json()['session_id']
        
        # Archive
        assert client.put(f"/api/sessions/{sid}/archive").status_code == 200
        
        # Verify not in default list
        list_res = client.get("/api/sessions")
        ids = [s['id'] for s in list_res.json()['sessions']]
        assert sid not in ids
        
        # Verify in archived list
        arch_res = client.get("/api/sessions?archived=true")
        arch_ids = [s['id'] for s in arch_res.json()['sessions']]
        assert sid in arch_ids
        
        # Unarchive
        assert client.put(f"/api/sessions/{sid}/unarchive").status_code == 200
        
        # Verify back in default list
        list_res = client.get("/api/sessions")
        ids = [s['id'] for s in list_res.json()['sessions']]
        assert sid in ids

    def test_session_persistence(self, client):
        """Test that sessions persist (simulated by creating then listing)"""
        # This is implicitly tested by other tests but making it explicit:
        title = "Persistent Session"
        res = client.post("/api/sessions", json={"title": title})
        sid = res.json()['session_id']
        
        # Check list immediately
        list_res = client.get("/api/sessions")
        sessions = list_res.json()['sessions']
        found = next((s for s in sessions if s['id'] == sid), None)
        assert found is not None
        assert found['title'] == title


class TestAvatarEndpoints:
    """Test avatar management endpoints"""

    def test_list_avatars(self, client):
        """Test GET /api/avatars"""
        response = client.get("/api/avatars")
        assert response.status_code == 200
        data = response.json()
        assert 'avatars' in data
        assert isinstance(data['avatars'], list)

    def test_upload_avatar_invalid_type(self, client):
        """Test upload with invalid file type"""
        files = {'file': ('test.txt', b'not an avatar', 'text/plain')}
        response = client.post("/api/avatars/upload", files=files)
        assert response.status_code == 400


class TestCharacterEndpoints:
    """Test character management endpoints"""

    def test_list_characters(self, client):
        """Test GET /api/characters"""
        response = client.get("/api/characters")
        assert response.status_code == 200
        data = response.json()
        assert 'characters' in data
        assert isinstance(data['characters'], list)
        # Should have at least the default character
        assert len(data['characters']) >= 1
        assert data['characters'][0]['id'] == 1

    def test_create_character(self, client):
        """Test POST /api/characters"""
        new_char = {
            "name": "New Char",
            "system_prompt": "You are new.",
            "personality_traits": ["new"]
        }
        response = client.post("/api/characters", json=new_char)
        assert response.status_code == 200
        data = response.json()
        assert data['name'] == "New Char"
        assert 'id' in data

    def test_update_character(self, client):
        """Test PUT /api/characters/{id}"""
        # Create
        new_char = {"name": "To Update", "system_prompt": "Prompt"}
        create_res = client.post("/api/characters", json=new_char)
        char_id = create_res.json()['id']

        # Update
        response = client.put(f"/api/characters/{char_id}", json={"name": "Updated Name"})
        assert response.status_code == 200
        assert response.json()['ok'] is True

    def test_delete_character(self, client):
        """Test DELETE /api/characters/{id}"""
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



class TestErrorHandling:
    """Test error handling"""

    def test_404_on_invalid_endpoint(self, client):
        """Test that invalid endpoints return 404"""
        response = client.get("/api/nonexistent")
        assert response.status_code == 404

    def test_400_on_missing_required_field(self, client):
        """Test that missing required fields return 400"""
        response = client.put("/api/sessions/1", json={})
        assert response.status_code == 400


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
