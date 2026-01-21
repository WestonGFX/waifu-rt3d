
import os
import shutil

# Config
CHARACTERS = ["nyx", "tsuki", "panicandy", "viper", "seraph", "glitch", "kitsune", "raine"]
ASSETS_DIR = "frontend/assets"
CHAR_DIR = os.path.join(ASSETS_DIR, "characters")
SOURCE_IMG = os.path.join(ASSETS_DIR, "avatar_nano.png")

def fix_assets():
    if not os.path.exists(SOURCE_IMG):
        print(f"CRITICAL: Base placeholder {SOURCE_IMG} not found!")
        return

    if not os.path.exists(CHAR_DIR):
        os.makedirs(CHAR_DIR)
        print(f"Created {CHAR_DIR}")

    for char in CHARACTERS:
        # Create char specific dir
        char_path = os.path.join(CHAR_DIR, char)
        if not os.path.exists(char_path):
            os.makedirs(char_path)
            print(f"Created dir: {char_path}")
        
        # Copy placeholder to portrait
        dest = os.path.join(char_path, f"{char}_portrait.png")
        if not os.path.exists(dest):
            shutil.copy(SOURCE_IMG, dest)
            print(f"Created placeholder: {dest}")
            
        # Also copy for background if missing
        bg_dest = os.path.join(char_path, f"{char}_bedroom_bg.png")
        if not os.path.exists(bg_dest):
             shutil.copy(SOURCE_IMG, bg_dest) # Use same placeholder for now
             print(f"Created BG placeholder: {bg_dest}")

if __name__ == "__main__":
    fix_assets()
