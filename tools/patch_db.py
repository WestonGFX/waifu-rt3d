import sqlite3
import sys
from pathlib import Path

DB_PATH = Path("backend/storage/waifu.db")

def patch():
    if not DB_PATH.exists():
        print("DB not found")
        return

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    
    # Check columns
    cur.execute("PRAGMA table_info(characters)")
    cols = [r[1] for r in cur.fetchall()]
    print(f"Current columns: {cols}")
    
    if "tts_pitch" not in cols:
        print("Adding tts_pitch...")
        try:
            cur.execute("ALTER TABLE characters ADD COLUMN tts_pitch REAL DEFAULT 1.0")
        except Exception as e:
            print(f"Error adding tts_pitch: {e}")

    if "tts_rate" not in cols:
        print("Adding tts_rate...")
        try:
            cur.execute("ALTER TABLE characters ADD COLUMN tts_rate REAL DEFAULT 1.0")
        except Exception as e:
            print(f"Error adding tts_rate: {e}")
            
    con.commit()
    con.close()
    print("Patch complete.")

if __name__ == "__main__":
    patch()
