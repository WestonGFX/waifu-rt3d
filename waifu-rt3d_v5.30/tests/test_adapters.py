"""
Unit tests for TTS adapters
"""
import pytest
from unittest.mock import patch, MagicMock
import sys
from pathlib import Path
import json

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.tts.adapters.edge_tts import EdgeTTSAdapter

# Mock directory for audio
@pytest.fixture
def mock_audio_dir(tmp_path):
    return tmp_path / "audio"

class TestEdgeTTSAdapter:
    
    @patch("shutil.which")
    @patch("subprocess.run")
    def test_speak_success(self, mock_run, mock_which, mock_audio_dir):
        """Test successful TTS generation command"""
        # Mock dependencies
        mock_which.return_value = "/usr/bin/edge-tts"
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        
        adapter = EdgeTTSAdapter(mock_audio_dir)
        cfg = {
            "voice_id": "en-US-AriaNeural",
            "tts_rate": "+10%",
            "tts_pitch": "-5Hz"
        }
        
        # Call speak
        res = adapter.speak("Hello world", cfg)
        
        # Verify result
        assert res["ok"] is True
        assert "filename" in res
        assert res["meta"]["voice_id"] == "en-US-AriaNeural"
        
        # Verify subprocess call
        args = mock_run.call_args[0][0]
        assert args[0] == "edge-tts"
        assert "--text" in args
        assert "Hello world" in args
        assert "--voice" in args
        assert "en-US-AriaNeural" in args
        assert "--rate" in args
        assert "+10%" in args
        assert "--pitch" in args
        assert "-5Hz" in args
        assert "--write-media" in args

    @patch("shutil.which")
    def test_speak_missing_binary(self, mock_which, mock_audio_dir):
        """Test error when edge-tts binary is missing"""
        mock_which.return_value = None
        
        adapter = EdgeTTSAdapter(mock_audio_dir)
        res = adapter.speak("Test", {})
        
        assert res["ok"] is False
        assert "install edge-tts" in res["error"]

    @patch("shutil.which")
    @patch("subprocess.run")
    def test_speak_defaults(self, mock_run, mock_which, mock_audio_dir):
        """Test default parameters"""
        mock_which.return_value = "edge-tts"
        mock_run.return_value = MagicMock(returncode=0)
        
        adapter = EdgeTTSAdapter(mock_audio_dir)
        # Empty config
        res = adapter.speak("Default settings", {})
        
        assert res["ok"] is True
        # Check default voice
        assert res["meta"]["voice_id"] == "en-US-AriaNeural" # fallback default
        
        args = mock_run.call_args[0][0]
        # Verify defaults in command
        assert "+0%" in args # rate
        assert "+0Hz" in args # pitch
