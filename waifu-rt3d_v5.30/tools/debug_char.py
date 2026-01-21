import sqlite3
import json
from pathlib import Path

DB_PATH = Path("backend/storage/waifu.db")

def debug_create():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    
    name = "Debug Char"
    sys_prompt = "Prompt"
    avatar = ""
    voice = ""
    prov = ""
    traits = json.dumps(["debug"])
    
    print("Attempting INSERT...")
    try:
        cur.execute("INSERT INTO characters (name, system_prompt, avatar_url, voice_id, tts_provider, personality_traits) VALUES (?, ?, ?, ?, ?, ?)", 
                    (name, sys_prompt, avatar, voice, prov, traits))
        print("INSERT SUCCESS")
        con.commit()
    except Exception as e:
        print(f"INSERT FAILURE: {e}")
        
    con.close()

if __name__ == "__main__":
    debug_create()
