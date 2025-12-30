import sqlite3
import json
import os

db_path = "backend/storage/app.db"
prompt_path = "SYTEM_PROMPTS_v2.md"

if not os.path.exists(prompt_path):
    print(f"Error: {prompt_path} not found")
    exit(1)

with open(prompt_path, "r") as f:
    new_prompt = f.read().strip()

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Update Character 1
cur.execute("UPDATE characters SET name=?, system_prompt=? WHERE id=?", ("Fox", new_prompt, 1))

# Let's also create placeholders for 3 and 4 with the same prompt but different names
cur.execute("UPDATE characters SET name=?, system_prompt=? WHERE id=?", ("Tsuki", new_prompt, 3))
cur.execute("UPDATE characters SET name=?, system_prompt=? WHERE id=?", ("Dae", new_prompt, 4))

conn.commit()
conn.close()
print("Database updated successfully.")
