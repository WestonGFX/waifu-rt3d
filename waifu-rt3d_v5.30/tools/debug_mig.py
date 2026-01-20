import sqlite3
from pathlib import Path
import sys

# Add parent dir to path
sys.path.append(str(Path(__file__).resolve().parents[1]))

DB_PATH = Path("backend/storage/waifu.db")

def debug_migration():
    if not DB_PATH.exists():
        print("WAIFU.DB NOT FOUND")
        return

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    
    # Check tables
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cur.fetchall()]
    print(f"Existing tables: {tables}")
    
    # Try running schema_v4 SQL
    schema_v4 = Path("backend/db/schema_v4.sql")
    sql = schema_v4.read_text()
    
    print("Attempting to run schema_v4.sql...")
    try:
        con.executescript(sql)
        print("SUCCESS")
    except Exception as e:
        print(f"FAILURE: {e}")
        
    con.close()

if __name__ == "__main__":
    debug_migration()
