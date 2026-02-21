
import unittest
import urllib.request
import json
import time

BASE_URL = "http://localhost:8080"

class TestBackend(unittest.TestCase):
    def setUp(self):
        self.health_url = f"{BASE_URL}/api/healthcheck"
        self.chars_url = f"{BASE_URL}/api/characters"

    def test_01_healthcheck(self):
        """Verify the server is running and healthy."""
        try:
            with urllib.request.urlopen(self.health_url) as response:
                self.assertEqual(response.status, 200)
                data = json.load(response)
                self.assertTrue(data.get("ok"))
                print(f"\n[PASS] Healthcheck: {data}")
        except Exception as e:
            self.fail(f"Healthcheck failed: {e}")

    def test_02_characters(self):
        """Verify characters list contains Rin."""
        try:
            with urllib.request.urlopen(self.chars_url) as response:
                self.assertEqual(response.status, 200)
                data = json.load(response)
                self.assertIn("characters", data)
                chars = data["characters"]
                
                # Find ID 1
                rin = next((c for c in chars if c["id"] == 1), None)
                self.assertIsNotNone(rin, "Character ID 1 not found")
                
                # Check Name
                print(f"\n[PASS] Found Character ID 1: {rin['name']}")
                self.assertIn("Fox", rin["name"], "Character 1 should be Fox/Rin")
                self.assertIn("Rin", rin["name"])
        except Exception as e:
            self.fail(f"Character check failed: {e}")

if __name__ == "__main__":
    print(f"Running tests against {BASE_URL}...")
    unittest.main()
