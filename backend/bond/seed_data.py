"""Seed data for the Bond Progression System.

Contains gift preferences and initial bond stories for all 13 characters.
Used by the schema migration and init scripts to populate bond-related tables.

Gift categories: art_supplies, books, food, music, tech, fashion, nature, gaming, wellness
Each character has 3-5 favorite gifts and 1-2 disliked gifts.

Bond stories unlock at levels: 5, 10, 20, 50, 100.
Level 5 = "First Real Talk" (getting comfortable)
Level 10 = "Shared Interest" (finding common ground)
Level 20 = "Opening Up" (vulnerability/backstory)
Level 50 = "Deep Connection" (emotional milestone)
Level 100 = "Covenant" (permanent bond, exclusive scene)
"""

from __future__ import annotations

# ── Gift Preferences per Character ──────────────────────────────────────────
# Format: (gift_name, category, affinity_boost, is_favorite, description)

GIFT_DATA: dict[str, list[tuple[str, str, float, int, str]]] = {
    "Dae": [
        ("Sketchbook", "art_supplies", 2.0, 1, "A high-quality sketchbook with thick paper"),
        ("Mechanical Pencils", "art_supplies", 1.8, 1, "Set of 0.3mm-0.7mm mechanical pencils"),
        ("Indie Album", "music", 1.5, 1, "An obscure indie rock album on vinyl"),
        ("Midnight Snack Box", "food", 1.3, 0, "Assortment of late-night comfort foods"),
        ("Drawing Tablet", "tech", 1.5, 0, "Portable drawing tablet for digital art"),
        ("Formal Dress", "fashion", 0.3, 0, "An elegant formal dress — not her style"),
        ("Self-Help Book", "books", 0.2, 0, "Generic motivational book — she'd roll her eyes"),
    ],
    "Genki": [
        ("Energy Drinks", "food", 1.8, 1, "Pack of her favorite energy drink brand"),
        ("Arcade Tokens", "gaming", 2.0, 1, "Bag of golden arcade tokens"),
        ("Manga Volume", "books", 1.5, 1, "Latest volume of a popular shonen manga"),
        ("Gaming Headset", "tech", 1.3, 0, "RGB gaming headset with cat ears"),
        ("Running Shoes", "fashion", 1.0, 0, "Bright colored athletic shoes"),
        ("Classical Music CD", "music", 0.3, 0, "A Beethoven symphony — way too boring"),
        ("Meditation Guide", "wellness", 0.2, 0, "Sit still? For how long?!"),
    ],
    "Luna": [
        ("Rare Book", "books", 2.0, 1, "A first-edition fantasy novel"),
        ("Stargazing Guide", "books", 1.8, 1, "Astronomical chart with constellation stories"),
        ("Herbal Tea Set", "food", 1.5, 1, "Collection of rare herbal teas from around the world"),
        ("Crystal Pendant", "fashion", 1.3, 0, "Amethyst pendant on silver chain"),
        ("Telescope Lens", "tech", 1.5, 0, "Upgrade lens for her telescope"),
        ("Energy Drink", "food", 0.3, 0, "Too artificial — she prefers natural things"),
        ("Pop Music Album", "music", 0.2, 0, "Mainstream pop — not her wavelength"),
    ],
    "Rin (Akane)": [
        ("Spicy Ramen", "food", 1.8, 1, "Limited-edition ultra-spicy instant ramen"),
        ("Fox Plushie", "fashion", 2.0, 1, "An adorable kitsune stuffed animal"),
        ("Hair Ribbon", "fashion", 1.5, 1, "Red silk ribbon for her hair"),
        ("Fighting Game DLC", "gaming", 1.3, 0, "New character pack for her favorite fighter"),
        ("Cooking Ingredients", "food", 1.0, 0, "Premium ingredients for Japanese cooking"),
        ("Love Letter", "books", 0.3, 0, "Too direct — makes her flustered and angry"),
        ("Boring Textbook", "books", 0.2, 0, "She'd rather die than study more"),
    ],
    "Hana (Momoka)": [
        ("Flower Bouquet", "nature", 2.0, 1, "Arrangement of pink peonies and white lilies"),
        ("Baking Kit", "food", 1.8, 1, "Premium baking ingredients and cookie cutters"),
        ("Romance Novel", "books", 1.5, 1, "A sweet contemporary romance paperback"),
        ("Scented Candle", "wellness", 1.3, 0, "Vanilla and cherry blossom candle"),
        ("Photo Frame", "fashion", 1.0, 0, "A pretty frame for memories together"),
        ("Horror Movie", "gaming", 0.3, 0, "She scares easily — bad idea"),
        ("Spicy Food", "food", 0.2, 0, "She can't handle anything above mild"),
    ],
    "Ayane (Yuki)": [
        ("Science Journal", "books", 2.0, 1, "Latest issue of a prestigious science journal"),
        ("Puzzle Box", "gaming", 1.8, 1, "Hand-crafted Japanese puzzle box"),
        ("Classical Vinyl", "music", 1.5, 1, "Debussy's Clair de Lune on vinyl"),
        ("Snow Globe", "fashion", 1.3, 0, "A delicate winter scene snow globe"),
        ("Lab Equipment", "tech", 1.0, 0, "Miniature chemistry set for fun experiments"),
        ("Party Invitation", "wellness", 0.3, 0, "She'd rather stay home with a book"),
        ("Energy Drink", "food", 0.2, 0, "Too loud, too sweet, too much"),
    ],
    "Sable (Kuroha)": [
        ("Dark Poetry", "books", 2.0, 1, "Collection of Edgar Allan Poe's complete works"),
        ("Black Rose", "nature", 1.8, 1, "A single preserved black rose in a glass case"),
        ("Gothic Jewelry", "fashion", 1.5, 1, "Silver spider pendant with onyx stones"),
        ("Incense Set", "wellness", 1.3, 0, "Sandalwood and dragon's blood incense"),
        ("Vintage Wine", "food", 1.0, 0, "A bottle of aged red wine"),
        ("Cute Plushie", "fashion", 0.3, 0, "Too adorable — it clashes with her aesthetic"),
        ("Pop Music", "music", 0.2, 0, "She'd rather listen to silence"),
    ],
    "Shiori (Nana)": [
        ("Notebook", "art_supplies", 2.0, 1, "A beautiful leather-bound journal"),
        ("Pressed Flowers", "nature", 1.8, 1, "Bookmark made of pressed wildflowers"),
        ("Quiet Tea", "food", 1.5, 1, "Premium matcha from Uji"),
        ("Knitting Yarn", "art_supplies", 1.3, 0, "Soft alpaca yarn in pastel colors"),
        ("Poetry Collection", "books", 1.0, 0, "Haiku anthology from the Edo period"),
        ("Karaoke Voucher", "gaming", 0.3, 0, "Singing in public? No thank you..."),
        ("Loud Alarm Clock", "tech", 0.2, 0, "She wakes up with the sunrise naturally"),
    ],
    "Mika (Mikazuki)": [
        ("Fashion Magazine", "books", 2.0, 1, "Latest Vogue Japan issue"),
        ("Lip Gloss Set", "fashion", 1.8, 1, "Premium Korean beauty lip gloss collection"),
        ("Selfie Ring Light", "tech", 1.5, 1, "Portable LED ring light for perfect selfies"),
        ("Bubble Tea", "food", 1.3, 0, "Her favorite taro milk tea with extra boba"),
        ("Concert Tickets", "music", 1.0, 0, "Front-row K-pop concert seats"),
        ("Math Textbook", "books", 0.3, 0, "Ugh, she has enough of those"),
        ("Plain Water Bottle", "wellness", 0.2, 0, "So boring — at least make it sparkly"),
    ],
    "Raine": [
        ("Guitar Strings", "music", 2.0, 1, "Premium acoustic guitar string set"),
        ("Music Theory Book", "books", 1.8, 1, "Advanced composition techniques"),
        ("Coffee Beans", "food", 1.5, 1, "Single-origin Ethiopian coffee beans"),
        ("Vintage Record", "music", 1.3, 0, "Classic rock vinyl from the 70s"),
        ("Concert Poster", "art_supplies", 1.0, 0, "Framed poster of her favorite band"),
        ("Sports Equipment", "gaming", 0.3, 0, "Not really her thing — she's an indoor cat"),
        ("Energy Bar", "food", 0.2, 0, "Tastes like cardboard with ambition"),
    ],
    "Kaede": [
        ("Flower Seeds", "nature", 2.0, 1, "Rare cherry blossom seeds from Yoshino"),
        ("Gardening Tools", "nature", 1.8, 1, "Hand-forged Japanese pruning shears"),
        ("Bamboo Tea Set", "food", 1.5, 1, "Traditional bamboo-handled tea ceremony set"),
        ("Nature Documentary", "tech", 1.3, 0, "BBC Earth series Blu-ray"),
        ("Watercolors", "art_supplies", 1.0, 0, "Botanical illustration paint set"),
        ("Fast Food Coupon", "food", 0.3, 0, "She prefers fresh, homegrown food"),
        ("Synthetic Flowers", "nature", 0.2, 0, "Fake flowers offend her deeply"),
    ],
    "Yuki": [
        ("Headphones", "tech", 2.0, 1, "Studio-quality over-ear headphones"),
        ("Graphic Novel", "books", 1.8, 1, "Limited edition cyberpunk manga"),
        ("Hoodie", "fashion", 1.5, 1, "Oversized soft hoodie in muted colors"),
        ("Lo-fi Playlist", "music", 1.3, 0, "Curated lo-fi hip hop mixtape"),
        ("Coding Book", "tech", 1.0, 0, "Advanced Python algorithms textbook"),
        ("Bright Dress", "fashion", 0.3, 0, "Too flashy — she prefers dark colors"),
        ("Social Event Invite", "wellness", 0.2, 0, "Large crowds drain her energy"),
    ],
    "Alana": [
        ("Nursing Textbook", "books", 1.5, 0, "Latest clinical nursing reference"),
        ("Soccer Ball", "gaming", 2.0, 1, "Match-quality soccer ball, signed by her favorite player"),
        ("Gold Pendant", "fashion", 1.8, 1, "Heart-shaped gold pendant to match her collection"),
        ("Healthy Smoothie Kit", "food", 1.5, 1, "Premium smoothie blender with recipe book"),
        ("Study Planner", "books", 1.3, 0, "Organized weekly planner with motivational quotes"),
        ("Horror Novel", "books", 0.3, 0, "She prefers uplifting stories"),
        ("Junk Food Box", "food", 0.2, 0, "She's particular about nutrition"),
    ],
}


# ── Bond Stories per Character ──────────────────────────────────────────────
# Format: (bond_level_required, title, scene_text, scene_type)
# scene_type: "dialogue", "narration", "choice"
# These are templates — the LLM can expand them during playback.

STORY_TEMPLATES: dict[str, list[tuple[int, str, str, str]]] = {
    "_default": [
        (
            5,
            "First Real Talk",
            "The character drops their guard for the first time, sharing something "
            "small but genuine about themselves. It's a quiet moment — just the two "
            "of you, no pretenses. They seem surprised you actually listened.",
            "dialogue",
        ),
        (
            10,
            "Shared Interest",
            "You discover something you both care about deeply. The conversation "
            "flows effortlessly for the first time, and the character's eyes light "
            "up in a way you haven't seen before.",
            "dialogue",
        ),
        (
            20,
            "Opening Up",
            "The character tells you something they've never told anyone else. "
            "Their voice is quiet, almost fragile. Whatever wall they had is "
            "starting to come down.",
            "narration",
        ),
        (
            50,
            "Deep Connection",
            "A moment of real emotional intimacy. The character acknowledges "
            "how much you mean to them — not with grand gestures, but with "
            "the kind of honesty that makes your chest tight.",
            "dialogue",
        ),
        (
            100,
            "Covenant",
            "The final milestone. The character makes a promise — not because "
            "they have to, but because they want to. This bond is permanent now. "
            "Whatever happens, you'll face it together.",
            "narration",
        ),
    ],
}

# Characters without custom stories inherit from _default
# Custom stories can be added per character later
for char_name in GIFT_DATA:
    if char_name not in STORY_TEMPLATES:
        STORY_TEMPLATES[char_name] = STORY_TEMPLATES["_default"]
