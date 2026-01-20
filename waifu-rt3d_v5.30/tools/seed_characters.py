import sqlite3
import re
import os

DB_PATH = 'backend/storage/waifu.db'
DOCS_PATH = 'docs/characters'

# Character Data (Base metadata, prompts will be loaded from MD)
CHARACTERS = [
    {
        "name": "Nyx",
        "description": "Cyberpunk hacker and security specialist.",
        "avatar_image": "frontend/assets/characters/nyx/nyx_portrait.png", 
        "background_image": "frontend/assets/characters/nyx/nyx_bedroom_bg.png",
        "personality": "Rebellious, Tech-savvy, Cool",
        "voice_id": "en-US-JennyNeural",
        "tts_provider": "edge-tts",
        "tts_pitch": "-5Hz",
        "tts_rate": "+0%"
    },
    {
        "name": "Tsuki",
        "description": "Mystical moon goddess and data seer.",
        "avatar_image": "frontend/assets/characters/tsuki/tsuki_portrait.png",
        "background_image": "frontend/assets/characters/tsuki/tsuki_bedroom_bg.png",
        "personality": "Mystic, Calm, Ethereal",
        "voice_id": "en-US-MichelleNeural",
        "tts_provider": "edge-tts",
        "tts_pitch": "+10Hz",
        "tts_rate": "-10%"
    },
    {
        "name": "Panicandy",
        "description": "Hyper-active digital pop idol.",
        "avatar_image": "frontend/assets/characters/panicandy/panicandy_portrait.png",
        "background_image": "frontend/assets/characters/panicandy/panicandy_bedroom_bg.png",
        "personality": "Energetic, Loud, Kawaii",
        "voice_id": "en-US-AnaNeural",
        "tts_provider": "edge-tts",
        "tts_pitch": "+20Hz",
        "tts_rate": "+20%"
    },
     {
        "name": "Viper",
        "description": "Hardcore toxic gamer girl.",
        "avatar_image": "frontend/assets/characters/viper/viper_portrait.png",
        "background_image": "frontend/assets/characters/viper/viper_bedroom_bg.png",
        "personality": "Toxic, Sarcastic, Gamer",
        "voice_id": "en-US-AriaNeural",
        "tts_provider": "edge-tts",
        "tts_pitch": "+5Hz",
        "tts_rate": "+15%"
    },
    {
        "name": "Seraph",
        "description": "Angelic medical and optimization AI.",
        "avatar_image": "frontend/assets/characters/seraph/seraph_portrait.png",
        "background_image": "frontend/assets/characters/seraph/seraph_bedroom_bg.png",
        "personality": "Clinical, Angelic, Perfectionist",
        "voice_id": "en-GB-SoniaNeural",
        "tts_provider": "edge-tts",
        "tts_pitch": "0Hz",
        "tts_rate": "0%"
    },
    {
        "name": "Glitch",
        "description": "Fragmented rogue AI.",
        "avatar_image": "frontend/assets/characters/glitch/glitch_portrait.png",
        "background_image": "frontend/assets/characters/glitch/glitch_bedroom_bg.png",
        "personality": "Chaotic, Glitchy, Curious",
        "voice_id": "en-US-AvaNeural",
        "tts_provider": "edge-tts",
        "tts_pitch": "-10Hz",
        "tts_rate": "+5%"
    },
     {
        "name": "Kitsune",
        "description": "Cybernetic shrine maiden.",
        "avatar_image": "frontend/assets/characters/kitsune/kitsune_portrait.png",
        "background_image": "frontend/assets/characters/kitsune/kitsune_bedroom_bg.png",
        "personality": "Traditional, Playful, Mystical",
        "voice_id": "en-GB-MaisieNeural",
        "tts_provider": "edge-tts",
        "tts_pitch": "+5Hz",
        "tts_rate": "-5%"
    },
     {
        "name": "Raine",
        "description": "Lo-fi companion for rainy days.",
        "avatar_image": "frontend/assets/characters/raine/raine_portrait.png",
        "background_image": "frontend/assets/characters/raine/raine_bedroom_bg.png",
        "personality": "Melancholic, Cozy, Quiet",
        "voice_id": "en-US-AnaNeural",
        "tts_provider": "edge-tts",
        "tts_pitch": "-10Hz",
        "tts_rate": "-10%"
    }
]

def load_system_prompt(char_name):
    """Parses the character markdown file to extract the System Prompt."""
    filename = f"{char_name.lower()}.md"
    path = os.path.join(DOCS_PATH, filename)
    
    if not os.path.exists(path):
        print(f"Warning: Doc file not found for {char_name} at {path}")
        return f"You are {char_name}, an anime companion."

    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Regex to find the code block inside the System Prompt section
        # Looks for ## 🧠 System Prompt ... ```text ...content... ```
        match = re.search(r'## 🧠 System Prompt.*?```text\n(.*?)```', content, re.DOTALL)
        if match:
            return match.group(1).strip()
        
        print(f"Warning: Could not extract specific prompt for {char_name}, using default.")
        return f"You are {char_name}, a friendly anime companion."
        
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return f"You are {char_name}, a helpful assistant."

def seed_db():
    # Ensure DB directory exists
    db_dir = os.path.dirname(DB_PATH)
    if not os.path.exists(db_dir):
        print(f"Creating database directory: {db_dir}")
        os.makedirs(db_dir, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Ensure table exists
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            description TEXT,
            avatar_image TEXT,
            background_image TEXT,
            system_prompt TEXT,
            personality TEXT,
            voice_id TEXT,
            tts_provider TEXT,
            tts_pitch TEXT,
            tts_rate TEXT
        )
    ''')
    
    # Migration check for new columns
    cursor.execute("PRAGMA table_info(characters)")
    columns = [info[1] for info in cursor.fetchall()]
    
    if 'voice_id' not in columns:
        print("Migrating: Adding voice columns...")
        cursor.execute("ALTER TABLE characters ADD COLUMN voice_id TEXT")
        cursor.execute("ALTER TABLE characters ADD COLUMN tts_provider TEXT")
        cursor.execute("ALTER TABLE characters ADD COLUMN tts_pitch TEXT")
        cursor.execute("ALTER TABLE characters ADD COLUMN tts_rate TEXT")

    if 'personality' not in columns:
        print("Migrating: Adding personality column...")
        cursor.execute("ALTER TABLE characters ADD COLUMN personality TEXT")

    for char in CHARACTERS:
        print(f"Seeding {char['name']}...")
        
        # Hydrate system prompt from file
        prompt = load_system_prompt(char['name'])
        
        cursor.execute('''
            INSERT INTO characters (name, description, avatar_image, background_image, system_prompt, personality, voice_id, tts_provider, tts_pitch, tts_rate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                description=excluded.description,
                avatar_image=excluded.avatar_image,
                background_image=excluded.background_image,
                system_prompt=excluded.system_prompt,
                personality=excluded.personality,
                voice_id=excluded.voice_id,
                tts_provider=excluded.tts_provider,
                tts_pitch=excluded.tts_pitch,
                tts_rate=excluded.tts_rate
        ''', (
            char['name'], 
            char['description'], 
            char['avatar_image'], 
            char['background_image'], 
            prompt,
            char['personality'],
            char.get('voice_id', 'en-US-AriaNeural'),
            char.get('tts_provider', 'edge-tts'),
            char.get('tts_pitch', '+0Hz'),
            char.get('tts_rate', '+0%')
        ))

    conn.commit()
    conn.close()
    print("Database seeding completed.")

if __name__ == "__main__":
    # Get the directory where the script is located (tools/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Resolve paths relative to the script directory
    # DB is in ../backend/storage/waifu.db
    DB_PATH = os.path.join(script_dir, '..', 'backend', 'storage', 'waifu.db')
    
    # Docs are in ../docs/characters/
    DOCS_PATH = os.path.join(script_dir, '..', 'docs', 'characters')
    
    # Normalize paths (removes ..)
    DB_PATH = os.path.normpath(DB_PATH)
    DOCS_PATH = os.path.normpath(DOCS_PATH)
    
    print(f"Using DB Path: {DB_PATH}")
    print(f"Using Docs Path: {DOCS_PATH}")
        
    seed_db()
