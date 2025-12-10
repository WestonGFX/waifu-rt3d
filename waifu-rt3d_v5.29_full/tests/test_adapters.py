"""
Unit tests for LLM and TTS adapters
"""
import pytest
import sys
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.llm.adapters.lmstudio import LMStudioAdapter
from backend.tts.adapters.base import TTSAdapter
from backend.tts.adapters.fish_audio import FishAudioAdapter


class TestLMStudioAdapter:
    """Test LMStudio LLM adapter"""

    def test_successful_chat(self):
        """Test successful chat completion"""
        adapter = LMStudioAdapter()
        messages = [{"role": "user", "content": "Hello"}]

        # Mock the requests.post call
        with patch('requests.post') as mock_post:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                'choices': [{'message': {'content': 'Hello back!'}}]
            }
            mock_post.return_value = mock_response

            result = adapter.chat(
                messages=messages,
                model="test-model",
                endpoint="http://127.0.0.1:1234/v1",
                api_key="test-key"
            )

            assert result['ok'] is True
            assert result['reply'] == 'Hello back!'
            assert 'raw' in result

    def test_connection_error(self):
        """Test connection error handling"""
        adapter = LMStudioAdapter()
        messages = [{"role": "user", "content": "Hello"}]

        with patch('requests.post') as mock_post:
            mock_post.side_effect = ConnectionError("Connection refused")

            result = adapter.chat(
                messages=messages,
                model="test-model",
                endpoint="http://127.0.0.1:1234/v1",
                api_key="test-key"
            )

            assert result['ok'] is False
            assert 'error' in result
            assert 'Connection refused' in result['error']

    def test_api_error(self):
        """Test API error response"""
        adapter = LMStudioAdapter()
        messages = [{"role": "user", "content": "Hello"}]

        with patch('requests.post') as mock_post:
            mock_response = Mock()
            mock_response.status_code = 500
            mock_response.text = "Internal Server Error"
            mock_post.return_value = mock_response

            result = adapter.chat(
                messages=messages,
                model="test-model",
                endpoint="http://127.0.0.1:1234/v1",
                api_key="test-key"
            )

            assert result['ok'] is False
            assert 'error' in result

    def test_malformed_response(self):
        """Test malformed API response"""
        adapter = LMStudioAdapter()
        messages = [{"role": "user", "content": "Hello"}]

        with patch('requests.post') as mock_post:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {'invalid': 'structure'}
            mock_post.return_value = mock_response

            result = adapter.chat(
                messages=messages,
                model="test-model",
                endpoint="http://127.0.0.1:1234/v1",
                api_key="test-key"
            )

            assert result['ok'] is False
            assert 'Unexpected LLM payload' in result['error']


class TestTTSAdapter:
    """Test TTS base adapter"""

    def test_filename_generation(self):
        """Test unique filename generation"""
        temp_dir = Path("/tmp/test_audio")
        temp_dir.mkdir(exist_ok=True)

        adapter = TTSAdapter(temp_dir)

        # Same key should generate same hash
        name1 = adapter._mk_name("test|voice|hello", "mp3")
        name2 = adapter._mk_name("test|voice|hello", "mp3")

        # Both should have mp3 extension
        assert name1.endswith('.mp3')
        assert name2.endswith('.mp3')

        # Hash part should be same
        hash1 = name1.split('_')[1].split('.')[0]
        hash2 = name2.split('_')[1].split('.')[0]
        assert hash1 == hash2

        # Different key should generate different hash
        name3 = adapter._mk_name("test|voice|goodbye", "mp3")
        hash3 = name3.split('_')[1].split('.')[0]
        assert hash1 != hash3

    def test_speak_not_implemented(self):
        """Test that base class speak raises NotImplementedError"""
        temp_dir = Path("/tmp/test_audio")
        adapter = TTSAdapter(temp_dir)

        with pytest.raises(NotImplementedError):
            adapter.speak("test", {})


class TestFishAudioAdapter:
    """Test Fish Audio TTS adapter"""

    def test_successful_tts(self):
        """Test successful TTS generation"""
        temp_dir = Path("/tmp/test_audio")
        temp_dir.mkdir(exist_ok=True)

        adapter = FishAudioAdapter(temp_dir)

        tts_cfg = {
            'endpoint': 'https://api.fish.audio/v1',
            'api_key': 'test-key',
            'voice_id': 'test-voice',
            'format': 'mp3',
            'sample_rate': 24000
        }

        with patch('requests.post') as mock_post:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.headers = {'Content-Type': 'audio/mpeg'}
            mock_response.content = b'fake audio data'
            mock_post.return_value = mock_response

            result = adapter.speak("Hello world", tts_cfg)

            assert result['ok'] is True
            assert 'filename' in result
            assert result['filename'].endswith('.mp3')
            assert result['meta']['provider'] == 'fish_audio'

            # Verify file was created
            audio_file = temp_dir / result['filename']
            assert audio_file.exists()
            assert audio_file.read_bytes() == b'fake audio data'

            # Cleanup
            audio_file.unlink()

    def test_api_error(self):
        """Test Fish Audio API error"""
        temp_dir = Path("/tmp/test_audio")
        adapter = FishAudioAdapter(temp_dir)

        tts_cfg = {
            'endpoint': 'https://api.fish.audio/v1',
            'api_key': 'invalid-key',
            'voice_id': 'test-voice'
        }

        with patch('requests.post') as mock_post:
            mock_response = Mock()
            mock_response.status_code = 401
            mock_response.text = "Invalid API key"
            mock_post.return_value = mock_response

            result = adapter.speak("Hello", tts_cfg)

            assert result['ok'] is False
            assert 'error' in result
            assert '401' in result['error']

    def test_connection_timeout(self):
        """Test connection timeout"""
        temp_dir = Path("/tmp/test_audio")
        adapter = FishAudioAdapter(temp_dir)

        tts_cfg = {
            'endpoint': 'https://api.fish.audio/v1',
            'voice_id': 'test-voice'
        }

        with patch('requests.post') as mock_post:
            mock_post.side_effect = TimeoutError("Request timed out")

            result = adapter.speak("Hello", tts_cfg)

            assert result['ok'] is False
            assert 'error' in result


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
