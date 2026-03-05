import shutil
import glob
import os

SOURCE_DIR = "/Users/chris/.gemini/antigravity/brain/f34dda2a-b271-4cf7-a75c-c9d71d8a4179"
DEST_DIR = "/Users/chris/Code/waifu-rt3d/backend/storage/images"

MAPPINGS = {
    "sable_bedroom": "sable_bedroom.png",
    "shiori_bedroom": "shiori_bedroom.png",
    "rin_bedroom": "rin_bedroom.png",
    "ayane_bedroom": "ayane_bedroom.png",
    "kitsune_bedroom": "kitsune_bedroom.png",
    "hana_bedroom": "hana_bedroom.png",
    "sable_data_room": "sable_data_room.png",
    "shiori_library": "shiori_library.png",
    "rin_street_race": "rin_street_race.png",
    "ayane_server_core": "ayane_server_core.png",
    "kitsune_live_concert": "kitsune_live_concert.png",
    "hana_garden": "hana_garden.png",
    "mika_bedroom": "mika_bedroom.png",
    "mika_beach": "mika_beach.png"
}

print(f"Restoring images from {SOURCE_DIR} to {DEST_DIR}...")

for key, dest_name in MAPPINGS.items():
    pattern = os.path.join(SOURCE_DIR, f"{key}_*.png")
    matches = glob.glob(pattern)
    
    if not matches:
        print(f"[MISSING] No match for pattern: {key}_*.png")
        continue
        
    # Valid matches found
    # Sort by modification time to get latest? Or just pick first.
    # We'll pick the one with most recent timestamp or just first.
    matches.sort(reverse=True) # Assuming newer timestamp is higher lexical? No, timestamp in name.
    source_file = matches[0]
    
    dest_path = os.path.join(DEST_DIR, dest_name)
    
    try:
        shutil.copy2(source_file, dest_path)
        print(f"[OK] Copied {os.path.basename(source_file)} -> {dest_name}")
    except Exception as e:
        print(f"[ERROR] Failed to copy {source_file}: {e}")

print("Restoration complete.")
