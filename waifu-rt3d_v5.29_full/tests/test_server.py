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
        assert data['ok'] is True
        assert 'session_id' in data
        assert data['title'] == "Test Session"

    def test_update_session(self, client):
        """Test PUT /api/sessions/{id}"""
        # Create a session first
        create_response = client.post("/api/sessions", json={"title": "Original"})
        session_id = create_response.json()['session_id']

        # Update it
        response = client.put(f"/api/sessions/{session_id}", json={"title": "Updated"})
        assert response.status_code == 200
        assert response.json()['ok'] is True

    def test_delete_session(self, client):
        """Test DELETE /api/sessions/{id}"""
        # Create a session first
        create_response = client.post("/api/sessions", json={"title": "To Delete"})
        session_id = create_response.json()['session_id']

        # Delete it
        response = client.delete(f"/api/sessions/{session_id}")
        assert response.status_code == 200
        assert response.json()['ok'] is True


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
