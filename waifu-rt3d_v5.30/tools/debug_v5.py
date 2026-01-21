import sqlite3
from pathlib import Path
import sys

# Add parent dir to path
sys.path.append(str(Path(__file__).resolve().parents[1]))
from backend.preflight import get_schema_version, migrate_to_v5

DB_PATH = Path("backend/storage/waifu.db")

def debug_v5():
    if not DB_PATH.exists():
        print("WAIFU.DB NOT FOUND")
        return

    con = sqlite3.connect(DB_PATH)
    
    # Check version
    try:
        ver = get_schema_version(con)
        print(f"Current Version: {ver}")
        
        if ver < 5:
            print("Attempting migration to v5...")
            try:
                if migrate_to_v5(con):
                    print("Migration SUCCESS")
                else:
                    print("Migration SKIPPED (Already applied?)")
            except Exception as e:
                print(f"Migration FAILED: {e}")
        else:
            print("Already at v5")
            
    except Exception as e:
        print(f"Error: {e}")
        
    con.close()

if __name__ == "__main__":
    debug_v5()
