from pathlib import Path
import json, sqlite3

ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT / "backend" / "config"
STORAGE = ROOT / "backend" / "storage"
AVATARS = STORAGE / "avatars"
AUDIO = STORAGE / "audio"
DB_PATH = STORAGE / "app.db"
APP_JSON = CONFIG_DIR / "app.json"

DEFAULT_CFG = {
  "profile": "auto",
  "input_mode": "text",
  "output_mode": "text+voice",
  "llm": {"provider":"lmstudio","endpoint":"http://127.0.0.1:1234/v1","api_key":"lm-studio","model":""},
  "tts": {"provider":"fish_audio","endpoint":"https://api.fish.audio/v1","api_key":"",
          "voice_id":"8ef4a238714b45718ce04243307c57a7","format":"mp3","sample_rate":24000,
          "fallback_chain":["piper_local","xtts_server","elevenlabs"]},
  "asr": {"enabled":False,"provider":"browser","endpoint":"","api_key":"","model":"whisper-1","language":"en"},
  "memory": {"max_history": 12}
}

def ensure_dirs():
    for p in (CONFIG_DIR, STORAGE, AVATARS, AUDIO):
        p.mkdir(parents=True, exist_ok=True)

def ensure_config():
    if not APP_JSON.exists():
        APP_JSON.write_text(json.dumps(DEFAULT_CFG, indent=2), encoding="utf-8")

def ensure_db():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    # Try to get current schema version
    try:
        cur.execute("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
        result = cur.fetchone()
        current_version = result[0] if result else 3
    except:
        # schema_version table doesn't exist, assume v3
        current_version = 3

    # Apply schema based on version
    if current_version < 4:
        # Check if v4 schema exists
        schema_v4 = ROOT / 'backend' / 'db' / 'schema_v4.sql'
        if schema_v4.exists():
            # Upgrade to v4
            con.executescript(schema_v4.read_text(encoding='utf-8'))
            print("✅ Database upgraded to schema v4")
        else:
            # Fall back to v3
            con.executescript((ROOT/'backend'/'db'/'schema_v3.sql').read_text(encoding='utf-8'))
            print("⚠️  Using schema v3 (v4 not found)")

    con.commit()
    con.close()

def run():
    ensure_dirs(); ensure_config(); ensure_db()

if __name__ == "__main__":
    run()
