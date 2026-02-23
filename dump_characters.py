import sqlite3
import json

def dump_chars():
    try:
        # Correct path found via find_by_name
        conn = sqlite3.connect('backend/storage/waifu.db')
        # Check server.py initialization
        # It imports `db` from somewhere or defines it. 
        # In the snippet `conn = db()`, `db` is likely a function connecting to a file.
        # Let's try 'waifu.db' first, then 'backend/waifu.db'.
        
        cursor = conn.cursor()
        cursor.execute("SELECT name, system_prompt, personality_traits FROM characters")
        rows = cursor.fetchall()
        
        print(f"Found {len(rows)} characters.")
        for row in rows:
            print(f"\n--- {row[0]} ---")
            print(f"Prompt: {row[1][:200]}...") # Truncate for brevity
            print(f"Traits: {row[2]}")
            
    except Exception as e:
        print(f"Error accessing DB: {e}")
        # Try finding the DB file
        import glob
        dbs = glob.glob("**/*.db", recursive=True)
        print(f"Found DB files: {dbs}")

if __name__ == "__main__":
    dump_chars()
