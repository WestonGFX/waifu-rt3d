import sqlite3
from pathlib import Path

DB_PATH = Path("backend/storage/waifu.db")

def cleanup():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    
    # List all characters
    cur.execute("SELECT id, name FROM characters")
    chars = cur.fetchall()
    print("Current characters:")
    for c in chars:
        print(f"{c[0]}: {c[1]}")
        
    # Delete test artifacts
    targets = ["Debug Char", "New Char Unique", "To Update", "To Delete", "VoiceTestChar", "New Char", "Updated Name", "Glitch version 2"]
    
    deleted_count = 0
    for t in targets:
        cur.execute("DELETE FROM characters WHERE name = ?", (t,))
        if cur.rowcount > 0:
            print(f"Deleted '{t}'")
            deleted_count += cur.rowcount
            
    # Also check for likely variations
    cur.execute("DELETE FROM characters WHERE name LIKE 'Test%'")
    if cur.rowcount > 0:
        print(f"Deleted {cur.rowcount} characters starting with 'Test'")
        deleted_count += cur.rowcount

    con.commit()
    print(f"Total deleted: {deleted_count}")
    
    # Verify
    cur.execute("SELECT id, name FROM characters")
    chars = cur.fetchall()
    print("Remaining characters:")
    for c in chars:
        print(f"{c[0]}: {c[1]}")
        
    con.close()

if __name__ == "__main__":
    cleanup()
