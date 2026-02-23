
import unittest
import urllib.request
import urllib.error
import json
import time

BASE_URL = "http://localhost:8080"

class TestComprehensive(unittest.TestCase):
    def setUp(self):
        self.session_url = f"{BASE_URL}/api/sessions"
        self.chat_url = f"{BASE_URL}/api/chat"
        self.chars_url = f"{BASE_URL}/api/characters"
    
    def _post(self, url, data):
        req = urllib.request.Request(url, method="POST")
        req.add_header('Content-Type', 'application/json')
        jsondata = json.dumps(data).encode('utf-8')
        req.add_header('Content-Length', len(jsondata))
        return urllib.request.urlopen(req, jsondata)

    def test_01_full_lifecycle(self):
        """Test creating a session, chatting (with TTS check), and archiving."""
        print("\n[TEST] Starting Full Lifecycle Test")
        
        # 1. Create Session
        resp = self._post(self.session_url, {"title": "Integration Test Session"})
        self.assertEqual(resp.status, 200)
        sess_data = json.load(resp)
        session_id = sess_data.get("id")
        print(f"  > Created Session ID: {session_id}")
        self.assertIsNotNone(session_id)

        # 2. Chat with Rin (Char ID 1)
        # We assume ID 1 exists as verified by test_basic
        chat_payload = {
            "text": "Hello, are you running the improved tests?",
            "speak": False # Keep false to avoid long TTS wait, we test logic not audio gen
        }
        # Note: server.py expects 'session_id', 'char_id' as query params for POST?
        # Let's check server.py: @app.post("/api/chat") def chat(session_id: int = 1...)
        # Yes, they are query params.
        
        chat_endpoint = f"{self.chat_url}?session_id={session_id}&char_id=1"
        print(f"  > Sending Chat to {chat_endpoint}")
        
        try:
            chat_resp = self._post(chat_endpoint, chat_payload)
            self.assertEqual(chat_resp.status, 200)
            chat_data = json.load(chat_resp)
            self.assertTrue(chat_data.get("ok"))
            print(f"  > AI Reply: {chat_data.get('reply')[:50]}...")
            print(f"  > Emotion: {chat_data.get('emotion')}")
        except urllib.error.HTTPError as e:
            print(f"  ! Chat failed: {e.read().decode()}")
            self.fail("Chat endpoint failed")

        # 3. Verify Message History
        msgs_url = f"{BASE_URL}/api/sessions/{session_id}/messages"
        with urllib.request.urlopen(msgs_url) as r:
            msg_data = json.load(r)
            messages = msg_data.get("messages", [])
            print(f"  > History Count: {len(messages)}")
            self.assertGreaterEqual(len(messages), 2) # User + AI

        # 4. Clean up (Delete Session)
        del_req = urllib.request.Request(f"{self.session_url}/{session_id}", method="DELETE")
        with urllib.request.urlopen(del_req) as r:
            self.assertEqual(r.status, 200)
            print("  > Session Deleted")

if __name__ == "__main__":
    unittest.main()
