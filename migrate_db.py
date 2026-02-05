import sqlite3
import os

DB_PATH = "backend/storage/waifu.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print("No DB found")
        return

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    try:
        cur.execute("ALTER TABLE characters ADD COLUMN live2d_model TEXT DEFAULT ''")
        print("Added live2d_model column")
    except Exception as e:
        print(f"Skipped live2d_model: {e}")

    try:
        cur.execute("ALTER TABLE characters ADD COLUMN model_type TEXT DEFAULT '3d'")
        print("Added model_type column")
    except Exception as e:
        print(f"Skipped model_type: {e}")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    migrate()
