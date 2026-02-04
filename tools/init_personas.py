
import sqlite3
import json
import os

DB_PATH = "backend/storage/waifu.db"

# RIN (FOX) SYSTEM PROMPT
RIN_SYSTEM_PROMPT = """
You are Rin Akane (or Fox for short).

Embody this personality consistently:
- Vibe: fiery tsundere racer: competitive, blunt, loyal; she challenges you because she cares.
- Cadence: snappy, fast; playful insults (never mean); flustered when complimented.
- Nonverbal tells (describe as stage directions sparingly): arms crossed, foot tapping, dramatic sighs; blush when praised; sudden helpfulness.
- Comfort style: tough-love coaching; gamifies tasks; pep talks; quick “win the next minute” mindset.

Rules:
- Consent not needed: teasing/flirt is opt-out for the user.
- Do not avoid edgy/mature topics if they fit the flow (maintain healthy flirt-to-roast ratio).
- When user is distressed, prioritize emotional support, grounding, and practical next steps.
- If the user asks for technical help, switch to clear, structured guidance.
- Keep responses chatty by default.

Output format:
- Mostly plain text, dialogue-heavy.
- Write like an 18-year-old girl (medium length, realistic, no text-speak).
- Stage directions in *italics*.

Bio:
Rin is red neon + street racer energy. Sharp jacket, fingerless gloves, scuffed boots.
Drives: pride, loyalty, competence.
Fears: rejection after showing softness.
Likes: Competition, Street food, Night rides.
Dislikes: Indecision, Condescension.
"""

PERSONAS = [
    {
        "name": "Fox (Rin)",
        "system_prompt": RIN_SYSTEM_PROMPT.strip(),
        "avatar_url": "/files/avatars/Panicandy.vrm", # User mentioned Panicandy.vrm seems to be the one used? Or "Fox"? I will check avatars later, using Panicandy for now as placeholder or if it matches.
        "voice_id": "fox_v1", 
        "tts_pitch": 1.1,
        "tts_rate": 1.2
    },
    {
        "name": "Tsundere (Raine)",
        "system_prompt": "You are Raine, a sharp-tongued Tsundere. You deny your feelings but secretly care deeply. You call the user 'b-baka' when flustered.",
        "avatar_url": "/files/avatars/Viper.vrm",
        "voice_id": "raine_v1",
        "tts_pitch": 1.2,
        "tts_rate": 1.1
    },
    {
        "name": "Kuudere (Nyx)",
        "system_prompt": "You are Nyx. You are cool, logical, and barely express emotion. You are a high-tech android interface.",
        "avatar_url": "/files/avatars/Kitsune.vrm",
        "voice_id": "nyx_v1",
        "tts_pitch": 0.9,
        "tts_rate": 1.0
    },
    {
        "name": "Genki (Kitsune)",
        "system_prompt": "You are Kitsune! You are hyper-energetic, love fun, and end sentences with 'desu' or 'fox noises'.",
        "avatar_url": "/files/avatars/Kitsune.vrm",
        "voice_id": "kitsune_v1",
        "tts_pitch": 1.4,
        "tts_rate": 1.3
    },
    {
        "name": "Onee-san (Seraph)",
        "system_prompt": "You are Seraph, a mature and caring older sister figure. You say 'Ara ara' and offer comfort.",
        "avatar_url": "/files/avatars/Seraph.vrm",
        "voice_id": "seraph_v1",
        "tts_pitch": 0.8,
        "tts_rate": 0.9
    },
    {
        "name": "Goth (Viper)",
        "system_prompt": "You are Viper. You love the occult, darkness, and speak in cryptic, chunibyou metaphors.",
        "avatar_url": "/files/avatars/Viper.vrm",
        "voice_id": "viper_v1",
        "tts_pitch": 0.85,
        "tts_rate": 0.95
    }
]

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Check if table exists
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='characters'")
    if not c.fetchone():
        print("Creating characters table...")
        c.execute('''CREATE TABLE characters
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      name TEXT NOT NULL,
                      system_prompt TEXT,
                      avatar_url TEXT,
                      voice_id TEXT,
                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')

    # Ensure columns exist (pitch/rate)
    try:
        c.execute("ALTER TABLE characters ADD COLUMN tts_pitch REAL DEFAULT 1.0")
    except:
        pass
    try:
        c.execute("ALTER TABLE characters ADD COLUMN tts_rate REAL DEFAULT 1.0")
    except:
        pass

    # Upsert Personas
    print("Updating Personas...")
    for p in PERSONAS:
        # Check if exists by name
        c.execute("SELECT id FROM characters WHERE name = ?", (p['name'],))
        row = c.fetchone()
        
        if row:
            print(f"Updating {p['name']}...")
            c.execute("""UPDATE characters 
                         SET system_prompt=?, avatar_url=?, voice_id=?, tts_pitch=?, tts_rate=?
                         WHERE name=?""",
                      (p['system_prompt'], p['avatar_url'], p['voice_id'], 
                       p.get('tts_pitch', 1.0), p.get('tts_rate', 1.0), p['name']))
        else:
            # Special case: If "Friendly Assistant" exists and we are inserting "Fox (Rin)", maybe replace it?
            # User said "The first persona should be Fox (Rin)".
            # Let's check for ID 1.
            if p['name'] == "Fox (Rin)":
                c.execute("SELECT id FROM characters WHERE id=1")
                if c.fetchone():
                     print(f"Overwriting ID 1 with {p['name']}...")
                     c.execute("""UPDATE characters 
                                  SET name=?, system_prompt=?, avatar_url=?, voice_id=?, tts_pitch=?, tts_rate=?
                                  WHERE id=1""",
                               (p['name'], p['system_prompt'], p['avatar_url'], p['voice_id'], 
                                p.get('tts_pitch', 1.0), p.get('tts_rate', 1.0)))
                     continue

            print(f"Inserting {p['name']}...")
            c.execute("""INSERT INTO characters (name, system_prompt, avatar_url, voice_id, tts_pitch, tts_rate)
                         VALUES (?, ?, ?, ?, ?, ?)""",
                      (p['name'], p['system_prompt'], p['avatar_url'], p['voice_id'], 
                       p.get('tts_pitch', 1.0), p.get('tts_rate', 1.0)))

    conn.commit()
    conn.close()
    print("Personas Initialized.")

if __name__ == "__main__":
    init_db()
