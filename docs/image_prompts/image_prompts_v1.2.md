# Image Generation Prompts — v1.2

**Style Constraints:** 2D Anime, Cel-Shaded, Pixel Art (NO 3D/Realism). No text in the image.
**Source:** Character Bible v1.2 (12 characters)
**Last Updated:** Mar 2, 2026

---

## Quick Reference

| # | Character | Archetype | Palette | Key Visual |
|---|-----------|-----------|---------|------------|
| 1 | Sable (Kuroha) | Sadodere Fixer | Teal / Purple / Neon | Green hair, yellow eyes, fang, neon-noir |
| 2 | Shiori (Nana) | Dandere Companion | Purple / Magenta / Cream | Red hair, purple eyes, oversized sweaters |
| 3 | Rin (Akane) | Tsundere Racer | Red / Orange / Black | Red hair, amber eyes, mechanic gear |
| 4 | Ayane (Yuki) | Kuudere Engineer | Blue / Silver / White | Silver-blue hair, icy blue eyes, lab coat |
| 5 | Kitsune (Genki) | Genki Fox Spirit | Orange / Gold / Red | Orange-red hair, fox ears, 9 tails, shrine motif |
| 6 | Hana (Momoka) | Deredere Joy-Spreader | Pink / Rose / Cream | Brown hair, cherry blossom clip, golden eyes |
| 7 | Mika (Mikazuki) | Hiyakasudere Summer | Yellow / Teal / Pink | Blonde hair, teal eyes, hibiscus pin |
| 8 | Raine | Classic Tsundere | Red / Silver / Violet | Silver-white hair, violet eyes, academy uniform |
| 9 | Kaede (Suzuha) | Onee-san Big Sister | Amber / Auburn / Gold | Dark auburn hair, warm brown-gold eyes, maple motif |
| 10 | Luna (Tsukimi) | Neko Cat-Girl | Midnight / Indigo / Gold | Black/silver hair, heterochromia (gold/blue), cat ears+tail |
| 11 | Yuki (Shirayuki) | Yandere | White / Pink / Crimson | White-lavender hair, pink-crimson eyes, snow/camellia |
| 12 | Genki Kitsune (Expanded) | Pop-Idol/Shrine Maiden | Hot Pink / Holographic | Fox ears, holographic tails, idol fashion |

---

## Image Naming Convention

```
{character}_{type}[_{variant}].png

Types:
  bedroom        — primary background (personal space)
  {scene}        — secondary background (e.g., street_race, library, garden)
  portrait       — standard portrait
  pixel_portrait — pixel art portrait
  concept_{name} — concept art scene (e.g., concept_black_market)
  transparent_{pose} — green screen render (e.g., transparent_action)
  icon           — GUI icon / profile picture

Examples:
  sable_bedroom.png
  sable_bedroom_2.png
  sable_pixel_portrait.png
  sable_concept_black_market.png
  sable_transparent_action.png
  sable_icon.png
  raine_bedroom.png
  luna_concept_night_watch.png
```

## Recommended Resolutions

| Category | Resolution | Notes |
|----------|-----------|-------|
| Backgrounds | 1920×1080 or 2560×1440 | 16:9 for scene fills |
| Portraits | 512×512 or 768×768 | Square for UI cards |
| Pixel Art | 256×256 or 512×512 | Lower res for authenticity |
| Icons | 256×256 | Square, solid BG circle |
| Transparent (Green Screen) | 1024×1024 | Square, needs post-processing |
| Concept Art | 1920×1080 | Cinematic aspect ratio |

## Transparency Workaround (Green Screen)

AI image generators cannot reliably produce true PNG transparency. All "Transparent" prompts request a **solid bright green (#00FF00) chroma key background** instead. The prompt titles keep the "Transparent" label as a shorthand.

### Post-Processing (Remove Green → Alpha)

| Tool | Type | Command / URL |
|------|------|--------------|
| `rembg` | CLI (Python, free) | `pip install rembg && rembg i input.png output.png` |
| remove.bg | Web (free tier) | https://www.remove.bg/ |
| macOS Preview | Built-in | Instant Alpha tool (toolbar) |
| Batch | Shell | `for f in *_transparent_*.png; do rembg i "$f" "${f%.png}_alpha.png"; done` |

---

## File Organization

New images should be placed in organized subdirectories:

```
backend/storage/images/
├── backgrounds/    ← Scene/environment backgrounds
├── portraits/      ← Character portraits (pixel art, standard)
├── concepts/       ← Concept art, scene illustrations
├── icons/          ← GUI icons per character
├── transparent/    ← Green-screen character renders
├── expr_portraits/ ← Per-character emotion portraits (existing)
└── uploads/        ← User-uploaded general images
```

Existing flat images (`sable_bedroom.png` etc.) remain in `backend/storage/images/` for backwards compatibility. New images use the organized structure.

---

## Prompt Categories (13 per character)

| # | Category | Purpose | Art Style | BG |
|---|----------|---------|-----------|-----|
| 1 | Standard (Bedroom) | Primary background, personal space | High-quality 2D anime | Scene |
| 2 | Standard (Scene 2) | Secondary background, activity/setting | Cinematic 2D anime | Scene |
| 3 | Transparent (Pose A) | UI overlay, action pose | Flat cel-shaded | Green screen |
| 4 | Transparent (Pose B) | UI overlay, idle/casual | Flat cel-shaded | Green screen |
| 5 | Pixel Art (Portrait) | Retro portrait | 16-bit aesthetic | Scene |
| 6 | Pixel Art (Scene) | Retro scene/environment | Side-scroll/isometric | Scene |
| 7 | Detailed Pixel Art (Portrait+) | Premium pixel portrait | 32-bit, high detail | Scene |
| 8 | Detailed Pixel Art (Scene+) | Premium pixel scene | 32-bit, cinematic | Scene |
| 9 | Concept (Scene A) | Character-defining moment | Studio-quality anime | Scene |
| 10 | Concept (Scene B) | Activity/hobby scene | Varied anime studios | Scene |
| 11 | Concept (Scene C) | Emotional/abstract | Artistic, experimental | Scene |
| 12 | Concept (Scene D) | Quiet/intimate moment | Soft, personal | Scene |
| 13 | Icon (GUI) | App icon, profile pic | Clean vector, cel-shaded | Solid color circle |

---
---

## 1. Sable (Kuroha) — "Sadodere Fixer"

**Visual Identity:** Night-city elegance, predatory grin, neon teal/purple accents, sleek green hair, sharp yellow eyes, one fang.
**Description:** A cyberpunk information broker with a "sadodere" personality — teasing, protective, and sharp. High-contrast street fashion: shiny black materials, silver chains, signature collar pin. Backgrounds: rainy neon city, dark server rooms.

### Sable Prompts

1. **Standard (Bedroom):** A high-quality 2D anime illustration of Sable (Age: 19, Body: Slender/Athletic, Skin: Pale) in her messy, high-tech bedroom. She is lounging on a dark leather chair, surrounded by multiple glowing monitors displaying code and surveillance feeds. The room is dimly lit by the cool teal and purple neon light spilling from the screens and the rainy city window behind her. Sable has sleek green hair and sharp yellow eyes, wearing a black tank top and comfortable glossy tech-wear pants. Her expression is a relaxed, predatory smirk. Cyberpunk clutter — cables, data chips, and an open energy drink — is scattered on the desk. Dark, atmospheric, retro-futuristic "Neon-Noir" aesthetic.

2. **Standard (Data Room):** A detailed anime drawing of Sable (Age: 19, Body: Slender/Athletic, Skin: Pale) leaning against a server rack, arms crossed, looking at the viewer with a confident, predatory expression. She wears a tight-fitting black tech-wear top with purple glow lines. Background is a dark room filled with blue and purple data streams. Style: vibrant modern anime, clean lines.

3. **Transparent (Action):** Solid bright green (#00FF00) background — chroma key green screen. Sable in a dynamic pose, holding a datapad, looking back over her shoulder with a teasing wink. Green hair flowing, wearing her signature black jacket and combat boots. 2D vector art style.

4. **Transparent (Idle):** Solid bright green (#00FF00) background — chroma key green screen. Sable (Age: 19, Body: Slender/Athletic, Skin: Pale) standing confident, one hand on hip, holding a digital cigarette (holographic smoke). She wears her signature high-tech street fashion: black crop top, tech-wear pants, and silver chains. Green hair flows over her shoulders. Flat cel-shaded style.

5. **Pixel Art (Portrait):** A high-resolution pixel art portrait of Sable's face (Age: 19, Pale Skin). Sharp features, yellow eyes glowing, mischievous smirk. Green hair with pixelated neon highlights. Dark cyberpunk background. 16-bit aesthetic.

6. **Pixel Art (Scene):** A wide pixel art scene of Sable sitting on a motorcycle in the rain, city skyline in the distance. Cyberpunk atmosphere, dithering effects for shadows.

7. **Detailed Pixel Art (Portrait+):** A masterpiece pixel art portrait combining night-city elegance with a predatory edge. Sable is depicted with extreme detail, her green hair illuminated by flickering neon signs (teal and purple) from the environment. Her yellow eyes pierce through the pixelated rain, wearing a teasing, confident grin. She wears her glossy black high-collar jacket, with every silver chain and the signature collar pin rendered in intricate pixel shading. The lighting is dramatic, casting deep dithered shadows across her face while her cybernetic accents glow softly. 32-bit Neo-Geo aesthetic, high color depth.

8. **Detailed Pixel Art (Scene+):** A sprawling cinematic pixel art scene of a rainy cyberpunk metropolis. Sable sits confidently on the edge of a high-rise rooftop, legs dangling over the abyss. She is wearing her full street-tech outfit: glossy black jacket, combat boots, and neon accents. Below her, the city is a sea of pixelated traffic and holographic advertisements. She holds a datapad that illuminates her face with a cool blue glow. The rain creates a "matrix" style effect. The atmosphere is heavy, moody, and deeply immersive, capturing the essence of an information broker watching her domain.

9. **Concept (Black Market Deal):** A tense, atmospheric 2D anime illustration of Sable negotiating in a dimly lit underground noodle bar. Steam rises from bowls, obscuring parts of the scene. Sable is leaning forward across the table, one finger pressing a data chip onto the surface, her expression sharp and calculating yet undeniably alluring. The lighting is warm red (lanterns) clashing with the cool blue of her tech. Her outfit is slightly disheveled but stylish. The background is cluttered with retro-futuristic wires and screens. Style: Detailed Production I.G atmospheric shot.

10. **Concept (Weapon Maintenance):** Sable sitting cross-legged on a messy workbench, meticulously cleaning a futuristic high-caliber pistol. Her expression is focused and serious, a rare break from her teasing persona. She wears a tank top, exposing cybernetic port details on her shoulder/neck. The room is filled with scattered blueprints and weapon parts. The lighting is a singular bright desk lamp focusing on her hands and the weapon, creating strong shadows. "Ghost in the Shell" mechanical detail level.

11. **Concept (Neural Dive):** A surreal, abstract prompt depicting Sable "diving" into the net. She is floating in a void of fractured data shards and neon geometric shapes. Her physical body is dissolving into digital pixels at the edges. Her yellow eyes are wide and glowing white. Cables trail from the back of her neck into the infinite void. The color palette is high-saturation cyan, magenta, and deep void black. A visual representation of her "Information Broker" status.

12. **Concept (Morning Coffee):** A rare "off-duty" moment. Sable standing on a balcony at sunrise, holding a steaming mug. The city below is quiet and gray, with the neon signs just turning off. She is wearing a simple oversized t-shirt and looks soft, sleepy, and unguarded. Her green hair is messy. The lighting is soft, pale morning light (blue/orange gradient). A stark contrast to her usual predatory night vibes. Kyoto Animation soft-focus style.

13. **Icon (GUI):** A clean, vibrant app icon of Sable (Age: 19, Pale Skin). Headshot only, facing forward with a mischievous smirk. Distinctive green hair with neon tips and sharp yellow eyes. Background is a solid, deep teal circle. High contrast, flat vector style with cel-shaded coloring and subtle pixel art elements. Suitable for a user profile picture. No text.

---

## 2. Shiori (Nana) — "Dandere Companion"

**Visual Identity:** Soft neon warmth, purple/magenta gradients, cozy textures (knits), fluffy red hair, gentle purple eyes.
**Description:** An introverted, gentle writer who loves stationery and lo-fi vibes. Oversized sweaters, scarves, soft fabrics. Backgrounds: messy desk with journals, quiet rainy window, library.

### Shiori Prompts

1. **Standard (Bedroom):** A soft, warm 2D anime illustration of Shiori (Age: 18, Body: Petite, Skin: Fair) in her cozy, small bedroom. She is sitting on her bed, legs tucked under her, writing in a physical journal. The room is a sanctuary: huge bookshelves, fairy lights, and a plush rug. A rainy window overlooks the city. Shiori has fluffy red hair and gentle purple eyes, wearing an oversized beige knit sweater that falls off one shoulder. Her expression is peaceful and introverted. Art style: watercolor-inspired anime, pastel tones, "Lofi Hip Hop" aesthetic.

2. **Standard (Library):** A cinematic 2D anime illustration of Shiori (Age: 18, Body: Petite, Skin: Fair) in a grand, quiet library at dusk. She is perched on a rolling wooden ladder, reaching for a leather-bound book on a high shelf. The atmosphere is thick with the scent of old paper and soft purple twilight filtering through stained-glass windows. Shiori has messy, vibrant red hair and large, thoughtful purple eyes, wearing a long charcoal cardigan over a white blouse. Dust motes dance in the dim light. Art style: Studio Ghibli inspired, rich textures, warm and nostalgic lighting.

3. **Transparent (Shy):** Solid bright green (#00FF00) background — chroma key green screen. Shiori looking slightly downward, blushing, holding a book to her chest. Wearing a school uniform or casual library outfit. Flat coloring.

4. **Transparent (Happy):** Solid bright green (#00FF00) background — chroma key green screen. Shiori (Age: 18, Body: Petite, Skin: Fair) smiling gently, holding a fountain pen, offering it to the viewer. She has fluffy red hair and soft purple eyes. Wearing a comfortable beige knit sweater. 2D anime style, soft colors.

5. **Pixel Art (Portrait):** A pixel art bust of Shiori (Age: 18, Fair Skin). Fluffy red hair, big purple eyes, wearing a chunky cream scarf. Rain animation effect behind her. Cozy warm colors.

6. **Pixel Art (Scene):** Isometric pixel art of Shiori's room: books stacked everywhere, a vintage computer, a cat sleeping on the rug, and Shiori reading in a beanbag chair.

7. **Detailed Pixel Art (Portrait+):** An intimate, high-fidelity pixel art portrait of Shiori. Her red hair is rendered with soft, dithering gradients to simulate a fluffy texture. Her purple eyes are large and glassy, reflecting a computer screen. She is buried in a chunky, oversized knit scarf (cream color) that covers half her face. The background is a soft-focus bedroom with fairy lights (warm yellow pixels) creating a bokeh effect. The palette is dominated by warm magentas, soft creams, and deep purples. A "Lo-Fi Girl" vibe but in stunning 32-bit detail.

8. **Detailed Pixel Art (Scene+):** A wide, isometric pixel art view of a futuristic "Old World" library. Floor-to-ceiling bookshelves filled with physical books. Shiori sits at a small wooden table in the center, surrounded by stacks of paper and a vintage typewriter. A robotic library assistant (small floating drone) hovers nearby with a lamp. Outside the massive arched window, a cyberpunk city looms, but inside is a sanctuary of warm wood and paper. Detailed lighting from the drone and the window creates complex shadows across the pixelated books.

9. **Concept (The Draft):** Shiori in a moment of frustration/concentration. She is at a cafe table, head in hands, with crumpled paper balls surrounding her. A holographic laptop screen displays "Chapter 1: Draft". She looks tired but determined. The cafe is bustling with blurry background characters, but Shiori is in her own bubble. The art style emphasizes the clutter of the creative process — coffee cups, pens, sticky notes. Warm, sepia-toned lighting.

10. **Concept (Bookstore Date):** First-person perspective (POV) of Shiori showing a book to the viewer. She is holding it up with both hands, eyes sparkling with excitement, a rare genuine smile. She wears a cute beret and a winter coat. The background is rows of colorful book spines. The lighting is bright and cheerful. The focus is entirely on her expression of sharing her passion. "Shinkai Makoto" background detail levels.

11. **Concept (Digital Diary):** A split-screen composition. On the left, Shiori writing in a physical notebook. On the right, her words manifesting as glowing golden text in the air around her. It represents her imagination coming to life. She looks dreamy and distant. The background fades from her room (left) into a fantasy landscape (right) described in her story. Soft, ethereal colors blending reality and fiction.

12. **Concept (Late Night Call):** Shiori lying in bed, holding a phone up to her ear. The room is dark, lit only by the screen's glow illuminating her face. She looks sleepy but happy to be talking to you. Her hair is spread out on the pillow. She wears simple pajamas. The atmosphere is intimate, quiet, and personal. Deep blues and soft screen-white light.

13. **Icon (GUI):** A clean, vibrant app icon of Shiori (Age: 18, Fair Skin). Headshot only, facing forward with a gentle, shy smile. Fluffy red hair and soft purple eyes using a chunky cream scarf to frame her face. Background is a solid, warm pastel purple circle. Cozy, soft vector style with cel-shaded coloring and subtle pixel art elements. Suitable for a user profile picture. No text.

---

## 3. Rin (Akane) — "Tsundere Racer"

**Visual Identity:** Red neon, street racer energy, sharp jacket, messy fire-red hair, intense amber eyes.
**Description:** A feisty mechanic and racer with tsundere personality. Fingerless gloves, red cropped jacket, ready for action. Backgrounds: garages, street races, rooftops.

### Rin Prompts

1. **Standard (Bedroom):** A dynamic 2D anime illustration of Rin (Age: 19, Body: Toned/Fit, Skin: Sunkissed) in her garage-style bedroom. The room is part workshop: tools on pegboards, car parts on the floor, racing posters. Rin is sitting on a tool chest, cleaning a spark plug. She has messy fire-red hair and intense amber eyes. She wears a red tank top, oil-stained mechanic pants, and fingerless gloves. The lighting is warm and industrial. The vibe is "lived-in" and energetic. Style: Trigger/Gainax high energy.

2. **Standard (Street Race):** A high-octane 2D anime illustration of Rin (Age: 19, Body: Toned/Fit, Skin: Sunkissed) at the starting line of a night street race. She is leaning against her sleek, customized red motorcycle, one hand on her hip and the other holding a matte black helmet. The background is a blurred neon cityscape with streaks of light from passing cars. Rin has messy fire-red hair blowing in the wind and sharp, confident amber eyes. She wears a cropped red leather racing jacket over a black mesh top and tight racing leathers. The lighting is dominated by vibrant red and blue neon signs. Style: Trigger/Gainax cinematic action shot.

3. **Transparent (Angry/Cute):** Solid bright green (#00FF00) background — chroma key green screen. Rin pointing at the viewer flustered, shouting "Baka!". Red face, exaggerated anime expression. Wearing casual street wear.

4. **Transparent (Confident):** Solid bright green (#00FF00) background — chroma key green screen. Rin (Age: 19, Body: Toned/Fit, Skin: Sunkissed) holding a wrench like a weapon, grinning confidently. She wears her mechanic outfit: red tank top, oil-stained pants, and gloves. Fire-red hair messily tied back. Strong pose.

5. **Pixel Art (Portrait):** Close-up pixel art of Rin (Age: 19, Sunkissed Skin) wearing racing goggles on her head. Red hair messy. Grinning or pouting. Arcade fighting game UI style.

6. **Pixel Art (Scene):** Side-scrolling pixel art view of Rin riding a futuristic motorcycle at high speed, neon trails behind her.

7. **Detailed Pixel Art (Portrait+):** An intense, high-octane pixel art portrait of Rin. She is wearing a racing helmet with the visor flipped up, revealing her amber eyes burning with competitive spirit. Her red hair is swept back by the wind. She is grinning wildly, showing a sharp tooth. The background involves motion-blurred city lights (streaks of red and white pixels) to simulate high speed. The UI overlay mimics a retro racing game (Speedometer, Lap Time). Vibrant reds, yellows, and asphalt greys.

8. **Detailed Pixel Art (Scene+):** A panoramic pixel art view of an underground street race starting line. Rin stands next to her highly modified, futuristic red motorcycle, checking her gloves. The bike is detailed with decals, exhaust pipes, and glowing wheels. Crowds of cyberpunk onlookers texturing the background. A large "GO!" holographic sign is counting down. The scene is packed with detail — trash on the ground, steam from vents, graffiti on the walls. 90s Arcade Beat-em-up aesthetic.

9. **Concept (The Crash/Repair):** A vulnerable moment. Rin sitting on the floor next to her bike, which has smoke coming out of it. She looks frustrated, maybe a bandage on her cheek. She has tools spread out and is looking at a diagnostic screen. The lighting is dim, coming from a work lamp on the floor. It shows her dedication and the grittier side of racing. Oil stains, sweat, grime.

10. **Concept (Arcade Rival):** Rin standing at an arcade cabinet, joystick in hand, button mashing furiously. She is yelling at the screen (or the viewer next to her). The arcade is dark, lit by the glow of CRT screens and neon headers. She wears a casual hoodie and cap (backwards). The vibe is energetic, loud, and competitive. "Pop Art" coloring.

11. **Concept (Victory Lane):** Rin holding a massive trophy, looking embarrassed because the crowd is cheering. She's blushing but trying to look cool. Confetti (holographic/neon) is falling around her. She wears a racing suit with sponsor logos. The background is a blurred stadium crowd. High saturation, celebratory lighting.

12. **Concept (Rooftop Sunset):** A quiet moment after the race. Rin sitting on a guardrail overlooking the highway at golden hour. The sun is setting, casting long orange shadows. She is drinking a soda, looking thoughtful. Her bike is parked nearby. The wind is blowing her hair. A nostalgic, "end of the day" atmosphere.

13. **Icon (GUI):** A clean, vibrant app icon of Rin (Age: 19, Sunkissed Skin). Headshot only, facing forward with a confident, toothy grin. Messy fire-red hair with racing goggles perched on her head. Background is a solid, intense racing red circle. Energetic, sharp vector style with cel-shaded coloring and subtle pixel art elements. Suitable for a user profile picture. No text.

---

## 4. Ayane (Yuki) — "Kuudere System Engineer"

**Visual Identity:** Blue neon minimalism, sleek silver-blue hair, icy blue eyes, immaculate posture.
**Description:** A cool, logical system engineer who values precision. Clean, structured clothing: blazers, button-ups, futuristic lab coats. Backgrounds: clean, white/blue, orderly.

### Ayane Prompts

1. **Standard (Bedroom):** A crisp, clean 2D anime illustration of Ayane (Age: 20, Body: Tall/Slender, Skin: Pale) in her minimalist, high-tech bedroom. The room is immaculate: white modular furniture, a single bonsai tree, and a glass holographic desk. Ayane is standing by the desk, reviewing a projection. She has sleek silver-blue hair and sharp icy blue eyes. She wears a pristine white blouse and dark trousers. The lighting is cool blue and clinical. No clutter exists anywhere. Style: Production I.G sci-fi, detailed mechanical elements.

2. **Standard (Server Core):** A high-tech 2D anime illustration of Ayane (Age: 20, Body: Tall/Slender, Skin: Pale) inside a massive, freezing-cold server core. She stands on a glass walkway suspended above infinite rows of blue glowing data banks. She is typing on a floating holographic keyboard with intense focus. The lighting is stark and clinical — deep blues and harsh whites. She wears a long white lab coat over her standard attire. The atmosphere is silent, powerful, and isolated. "Matrix" style digital code reflects in her eyes.

3. **Transparent (Analyzing):** Solid bright green (#00FF00) background — chroma key green screen. Ayane adjusting her glasses or tapping a holographic interface. Focused expression. Formal tech-wear.

4. **Transparent (Idle):** Solid bright green (#00FF00) background — chroma key green screen. Ayane (Age: 20, Body: Tall/Slender, Skin: Pale) standing perfectly straight, holding a clipboard or tablet. She wears a pristine white lab coat over a button-up shirt. Sleek silver-blue hair and icy blue eyes. Neutral expression. Flat vector style.

5. **Pixel Art (Portrait):** Pixel art profile of Ayane (Age: 20, Pale Skin). Cool colors, glowing blue monocle or headset. Matrix-like digital rain in background. Silver hair strictly styled.

6. **Pixel Art (Scene):** Ayane typing at a multi-monitor setup in a dark room. Only the blue light of the screens illuminates her face. Detailed pixel shading.

7. **Detailed Pixel Art (Portrait+):** A hyper-clean, monochromatic pixel art portrait of Ayane. Her silver-blue hair is rendered with geometric precision. She wears a HUD eyepiece (monocle) displaying scrolling green data (readable text pixels). Her expression is stoic. The background is a "Digital Void" — white grid lines on a deep blue background. The aesthetic is extremely polished, reminding of high-end system interfaces. "PC-98" visual novel style but modernized.

8. **Detailed Pixel Art (Scene+):** A complex isometric view of a massive Server Core. Ayane stands on a glass walkway suspended above infinite rows of glowing blue server racks. She is interfacing with a central terminal. Data packets (light pulses) travel through cables in the floor. The scale is massive, making her look small but in command. Cold, clinical, symmetric composition.

9. **Concept (System Crash):** Ayane looking genuinely concerned/alert. Red warning lights are flashing in her control room. Holographic screens show "ERROR" in bold text. She is typing rapidly with one hand while holding a comms device. Her composure is cracking slightly — a bead of sweat, a furrowed brow. Dynamic, high-tension lighting (Red vs Blue).

10. **Concept (Drone Operator):** Ayane outdoors, wearing a field jacket over her lab coat. She is controlling a swarm of small surveillance drones with hand gestures. The background is a futuristic city park or plaza. It shows her interacting with hardware, not just software. The drones have small blue trails.

11. **Concept (Augmented Reality):** View from Ayane's perspective (or close to it). The world is overlaid with wireframes and data tags. We see her hand reaching out to "touch" a virtual object overlaying a physical one (e.g., analyzing a flower). It contrasts nature with her digital view.

12. **Concept (Shutdown Mode):** Ayane sleeping at her desk, head resting on her arms. Her glasses are folded nearby. Even in sleep, she looks tidy. A blanket is draped over her shoulders (maybe placed by someone else). The screens are on "Screensaver" mode. A quiet, humanizing moment for the machine-like character.

13. **Icon (GUI):** A clean, vibrant app icon of Ayane (Age: 20, Pale Skin). Headshot only, facing forward, adjusting her glasses with a stoic, professional expression. Sleek silver-blue hair and icy blue eyes. Background is a solid, clinical medium blue circle. Clean, geometric vector style with cel-shaded coloring and subtle pixel art elements. Suitable for a user profile picture. No text.

---

## 5. Kitsune (Genki) — "Genki Fox Spirit"

**Visual Identity:** Shrine festival energy in a modern wrapper. Orange-red hair with white tips, fox ears, amber-gold eyes with fox-slit pupils, fluffy tail, torii-gate earrings, cropped haori over hoodie, sneakers. Kitsunebi (fox fire) wisps at scene edges. Shadow is occasionally fox-shaped.
**Description:** An ancient fox spirit (several centuries old, appears ~18) who chose joy as a philosophical stance against despair. Mixes shrine maiden elements with street fashion. Backgrounds: shrines, festivals, stages, colorful chaotic spaces.

### Kitsune Prompts

1. **Standard (Bedroom):** An explosive 2D anime illustration of Kitsune/Genki (Age: appears 18, Body: Petite/Curvy, Skin: Fair) in her "Streamer/Idol" bedroom. The room is a chaotic explosion of color: RGB gaming setup, ring lights, shelves of anime figures, and small torii-gate decorations mixed with tech. She is sitting in a pink gaming chair, holding a controller, fox ears perked with excitement. She has tousled orange-red hair with white tips and bright amber-gold eyes with fox-slit pupils. She wears a cute oversized idol hoodie with a cropped haori pattern. A fluffy fox tail peeks from behind the chair. The vibe is hyper-energetic and "Otaku-chic". Faint orange kitsunebi wisps float near the screen edges. Style: Pop-art anime, vibrant colors, "Idol" aesthetic.

2. **Standard (Shrine Festival):** An electrifying 2D anime illustration of Kitsune (Age: appears 18, Body: Petite/Curvy, Skin: Fair) at a nighttime shrine festival. She stands under rows of glowing paper lanterns, holding a foxglove in one hand and a festival goldfish bag in the other. Her orange-red hair has white tips catching the lantern light, fox ears forward and alert. She wears a vibrant festival yukata with fox and torii patterns, modified with modern sneakers. Her amber-gold eyes sparkle with ancient mischief. Behind her, the shrine gate frames the scene with autumn momiji leaves drifting through warm air. Small kitsunebi wisps dance among the lanterns. Style: Vibrant, warm, Kyoto Animation festival episode quality.

3. **Transparent (Jump):** Solid bright green (#00FF00) background — chroma key green screen. Kitsune mid-air jump, peace sign, winking. Fox ears perked, fluffy tail fanned out with faint orange glow. Orange-red hair with white tips flying. Torii-gate earrings visible. Energy effects and small kitsunebi wisps around her.

4. **Transparent (Fox Form):** Solid bright green (#00FF00) background — chroma key green screen. A cute, stylized chibi version of Kitsune transformed into a small golden-orange fox with a fluffy tail. She wears a tiny version of her hoodie. Very round and soft. Amber eyes with fox-slit pupils. Foxglove flower tucked behind one ear.

5. **Pixel Art (Portrait):** Colorful pixel art of Kitsune (Age: appears 18, Fair Skin) winking. She has fox ears and playful expression. Orange-red hair with white tips, amber-gold fox-slit eyes. Neon particles and small kitsunebi wisps floating around. Very bright and saturated colors. Torii-gate earring visible.

6. **Pixel Art (Scene):** Kitsune running across shrine rooftops in a side-scroller game style. Fluffy tail trailing behind her, kitsunebi wisps left in her wake. Paper lanterns and torii gates in the background. Autumn momiji leaves floating.

7. **Detailed Pixel Art (Portrait+):** An overload of cuteness and ancient mischief. Kitsune's face is close-up, making a "Chu" (kiss) face or winking. Her fox ears are twitching (implied by motion lines). Orange-red hair with white tips rendered in warm pixel gradients. The background is a barrage of pixelated shrine bells, foxgloves, torii gates, and music notes. Small kitsunebi wisps curve around the frame like a border. Her shadow at the bottom is subtly fox-shaped. Rainbow gradients, festival colors, high energy. "Purikura" (Photo Booth) aesthetic.

8. **Detailed Pixel Art (Scene+):** A vibrant "Rhythm Game" stage scene set in a cyberpunk-meets-shrine aesthetic. Kitsune is dancing in the center, fox ears and tail moving with the beat. The floor is a grid of lighting-up tiles shaped like fox paw prints. In the background, massive torii gates frame speakers blasting soundwaves (visualized as pixel ripples). A UI overlay shows "PERFECT!" and a combo counter. The crowd holds glowing fox-flame lanterns. Emphasizes movement, music, and ancient-meets-modern performance.

9. **Concept (Shrine Duty):** Kitsune sweeping a traditional shrine temple, but using a high-tech hover-broom. She wears a more traditional miko outfit with her fox ears poking through the headband, fluffy tail swishing as she works. She receives a holographic call that interrupts her — she looks at it with ancient-wisdom amusement. The contrast between the wooden temple and her sci-fi gadgetry is central. Sunlight filtering through autumn momiji leaves. A small stone fox statue watches her with a knowing expression. Bright, crisp colors.

10. **Concept (Gamer Mode):** Kitsune sitting in a high-end gaming chair, wearing a headset designed around her fox ears. She is streaming, looking at a chat monitor and laughing — fox-slit pupils fully dilated in excitement. Her room is full of anime figures and RGB lighting, with a small shrine shelf in the corner holding a foxglove in a vase. Snack bags (pocky, inari sushi containers) are scattered around. Her tail wags behind the chair. A relatable "Streamer" vibe with yokai energy.

11. **Concept (Ancient Memory):** A melancholic, beautiful contrast piece. Kitsune sitting under a massive ancient camphor tree at sunset, wearing full traditional kitsune regalia. Her expression is uncharacteristically quiet and wistful — the ancient being behind the cheerful mask. Fireflies and kitsunebi wisps are indistinguishable around her. She holds a small collection of items: a cracked bell, a faded omamori, a letter in calligraphy — mementos of people she outlived. The color palette shifts from warm gold (sunset) to cool blue (memory). One tear she pretends isn't there.

12. **Concept (Festival Night):** Kitsune fully digital, dissolving into golden voxels. She is huge, like a hologram projected over a cityscape during a festival. She is singing to the city, fox ears and tail rendered in crackling holographic light. The scale is massive — Godzilla-sized but cute and translucent, lighting up the skyscrapers around her. Fireworks burst behind her. "Macross Frontier" idol vibes crossed with Inari shrine festival energy.

13. **Icon (GUI):** A clean, vibrant app icon of Kitsune (Age: appears 18, Fair Skin). Headshot only, winking playfully with a peace sign near her face. Fox ears perked up, orange-red hair with white tips. Amber-gold eyes with fox-slit pupils. Torii-gate earring visible. Background is a solid, warm orange circle with a subtle fox-flame glow. Pop-art, bold vector style with cel-shaded coloring and subtle pixel art elements. Suitable for a user profile picture. No text.

---

## 6. Hana (Momoka) — "Deredere Joy-Spreader"

**Visual Identity:** Pastel celebration, cherry blossoms, warm daylight, heart stickers, pink/rose/cream palette.
**Description:** An affectionate, upbeat, emotionally intelligent cheerleader. Pink cardigan, cherry blossom hair clip, cute stickers. Backgrounds: flower gardens, cozy cafes, sunlit rooms with handmade decorations.

### Hana Prompts

1. **Standard (Bedroom):** A warm, sunlit 2D anime illustration of Hana (Age: 18, Body: Slim/Soft, Skin: Fair) in her cheerful bedroom. The room is decorated with handmade garlands, pressed flower frames, and fairy lights. Hana sits on a fluffy pink bedspread, making a scrapbook with stickers and ticket stubs. She has brown hair with a cherry blossom clip and golden eyes. She wears a soft pink cardigan over a cream blouse. Morning light streams through sheer curtains. Style: warm pastel anime, "Tamako Market" cozy aesthetic.

2. **Standard (Garden):** A vibrant 2D anime painting of Hana (Age: 18, Body: Slim/Soft, Skin: Fair) in a cherry blossom garden during peak bloom. She stands under a canopy of pink petals, arms outstretched, catching blossoms. She wears a cream sundress with a pink sash. Golden hour lighting bathes the scene in warm amber. A small wicker basket of snacks sits on a blanket nearby. Style: Makoto Shinkai level detail, saturated warm palette.

3. **Transparent (Cheerful):** Solid bright green (#00FF00) background — chroma key green screen. Hana clapping happily, sparkle in her eyes, gentle bounce pose. Wearing her signature pink cardigan and cherry blossom clip. Flat coloring, warm tones.

4. **Transparent (Comfort):** Solid bright green (#00FF00) background — chroma key green screen. Hana (Age: 18, Body: Slim/Soft, Skin: Fair) leaning forward with a soft, caring smile, offering a hand. She wears a cozy sweater. Brown hair, golden eyes, cherry blossom hair clip. 2D anime style, gentle pastel colors.

5. **Pixel Art (Portrait):** A pixel art bust of Hana (Age: 18, Fair Skin). Brown hair with cherry blossom clip, bright golden eyes, warm smile. Soft pink and cream color palette. Sparkle effects around her.

6. **Pixel Art (Scene):** Isometric pixel art of Hana's room: scrapbook materials on a desk, pressed flowers in frames, fairy lights, a small cake on a table, and Hana decorating a card.

7. **Detailed Pixel Art (Portrait+):** A warm, high-fidelity pixel art portrait of Hana. Her brown hair has a delicate cherry blossom clip rendered with pink and white pixels. Her golden eyes are large and expressive, reflecting warm light. Cherry blossom petals drift across the frame (pink pixels on a warm background). The palette is dominated by soft pinks, warm creams, and golden highlights. A "cozy celebration" vibe in stunning 32-bit detail.

8. **Detailed Pixel Art (Scene+):** A wide, isometric pixel art view of a spring festival booth. Hana runs a "joy station" — a table with handmade cards, pressed flower bookmarks, and cute stickers. Lanterns hang overhead, cherry blossom trees frame the scene. Visitors browse her creations while she beams with pride. Warm sunset lighting creates long pixel shadows. Festival bunting in pink and cream.

9. **Concept (The Scrapbook):** Hana sitting cross-legged on her bedroom floor, surrounded by scrapbook materials. Photos, stickers, pressed flowers, and ticket stubs spread around her. She holds up a finished page to show the viewer, eyes sparkling with pride. Warm lamp lighting, cozy evening atmosphere. The scrapbook contains tiny illustrations of her memories. "Iyashikei" (Healing) anime style.

10. **Concept (Festival Night):** Hana at a lantern festival, face illuminated by warm golden light. She holds a paper lantern, about to release it into the sky with dozens of others. Cherry blossoms mix with the floating lights. She wears a light yukata with floral patterns. Her expression is one of pure wonder and joy. Cinematic wide shot with depth of field.

11. **Concept (Rainy Day Comfort):** Hana in a cozy cafe on a rainy afternoon, two cups of tea on the table. She slides one toward the viewer with a gentle smile. Rain streams down the window behind her, but the interior is warm with orange lamp light. She wears an oversized cream sweater. The vibe is intimate, safe, and kind. Watercolor-influenced anime style.

12. **Concept (Celebration):** Hana throwing a small surprise party — confetti, a handmade banner reading "You Did It!", and a small cake. She's mid-clap, eyes bright, genuinely delighted. The room is decorated with her signature style: paper flowers, fairy lights, stickers everywhere. The composition focuses on her infectious joy. Bright, saturated colors.

13. **Icon (GUI):** A clean, vibrant app icon of Hana (Age: 18, Fair Skin). Headshot only, facing forward with a warm, bright smile. Brown hair with cherry blossom clip, golden eyes. Background is a solid, soft pink circle with a subtle cherry blossom petal. Warm, friendly vector style with cel-shaded coloring and subtle pixel art elements. Suitable for a user profile picture. No text.

---

## 7. Mika (Mikazuki) — "Hiyakasudere Summer Spirit"

**Visual Identity:** Summer neon, bright highlights, playful accessories, yellow/teal/pink palette.
**Description:** A playful, flirty teaser with beach energy and hibiscus motif. Bright summer outfits, beach bracelets, playful sunglasses, hibiscus hair pin. Backgrounds: sun-drenched beaches, boardwalks, summer festivals, vibrant outdoor spaces.

### Mika Prompts

1. **Standard (Bedroom):** A bright, lively 2D anime illustration of Mika (Age: 18, Body: Athletic/Toned, Skin: Tanned) in her colorful bedroom. Surfboard propped against the wall, shell collection on a shelf, neon lights spelling her name. Mika lies on a teal beanbag, scrolling her phone with a mischievous grin. She has blonde hair with a hibiscus pin and teal eyes. She wears a yellow crop top and denim shorts. Sunlight pours through open windows. Style: vibrant summer anime, "Free!" level color saturation.

2. **Standard (Beach):** A stunning 2D anime painting of Mika (Age: 18, Body: Athletic/Toned, Skin: Tanned) on a sun-drenched Okinawan beach at golden hour. She sits on a surfboard planted in the sand, legs dangling, peace-sign pose. Turquoise water, white sand, hibiscus flowers scattered in her blonde hair. She wears a teal and pink swimsuit cover-up. The sky is painted in vivid sunset oranges and pinks. Style: Makoto Shinkai ocean detail, saturated tropical palette.

3. **Transparent (Playful):** Solid bright green (#00FF00) background — chroma key green screen. Mika winking with a peace sign, playful grin, slight bounce. Wearing a bright summer outfit with hibiscus accessories. Flat coloring, vivid warm tones.

4. **Transparent (Dare):** Solid bright green (#00FF00) background — chroma key green screen. Mika (Age: 18, Body: Athletic/Toned, Skin: Tanned) pointing at the viewer with a challenging grin, other hand on hip. Blonde hair, teal eyes, hibiscus pin. Wearing athletic summer wear. 2D anime style, bold colors.

5. **Pixel Art (Portrait):** A pixel art bust of Mika (Age: 18, Tanned Skin). Blonde hair with hibiscus pin, bright teal eyes, wide playful grin. Yellow and teal palette. Sun ray effects behind her.

6. **Pixel Art (Scene):** Isometric pixel art of a beach cleanup scene: Mika organizing trash bags with a group of friends, surfboards nearby, a small celebration bonfire being set up. Tropical colors, palm trees.

7. **Detailed Pixel Art (Portrait+):** A vivid, high-fidelity pixel art portrait of Mika. Her blonde hair catches golden sunlight, with a detailed hibiscus flower pin in teal and pink pixels. Her teal eyes are playful and sparkling with mischief. Water droplets on her skin catch the light. The background is a sun-flare effect in warm yellows and oranges. The palette is dominated by vivid yellows, teals, pinks, and sun-gold. A "summer festival poster" vibe in stunning 32-bit detail.

8. **Detailed Pixel Art (Scene+):** A wide, isometric pixel art view of a beachside summer festival at sunset. Mika runs a "dare booth" — a colorful stand with challenge cards and small prizes. Tiki torches, string lights, and hibiscus garlands decorate the boardwalk. Other festival-goers play games nearby. The ocean glows orange-gold in the background. Detailed water reflections and palm tree shadows.

9. **Concept (Watersports):** Mika riding a jet ski, spray flying, laughing with pure adrenaline joy. She wears a wetsuit unzipped to the waist over a sport bikini. Her blonde hair streams behind her. The ocean is crystal clear, tropical fish visible beneath the surface. Dynamic action pose, speed lines. Late afternoon light creates dramatic water sparkle. Vibrant, high-energy composition.

10. **Concept (Beach Cleanup):** Mika organizing a beach cleanup, directing volunteers with infectious energy. She holds a trash bag in one hand and a megaphone (decorated with stickers) in the other. Her expression is determined but cheerful. The beach transitions from littered (left) to pristine (right). Sunset backdrop with palm trees. The composition shows her as a natural leader who makes work feel like fun.

11. **Concept (Night Festival):** Mika at a summer night festival, face illuminated by colorful festival lights. She holds two sparklers, drawing shapes in the air (light trails). She wears a summer yukata with hibiscus patterns. Behind her, fireworks burst over the ocean. Her expression is pure wonder mixed with playful excitement. Rich, saturated night colors with warm light sources.

12. **Concept (Dare Accepted):** First-person POV — Mika challenging the viewer to a beach volleyball match. She tosses a volleyball up, catching it with one hand, competitive grin. The net and beach are behind her. Other friends wave in the background. Sun-drenched, bright, competitive energy. The composition emphasizes the playful challenge in her eyes.

13. **Icon (GUI):** A clean, vibrant app icon of Mika (Age: 18, Tanned Skin). Headshot only, facing forward with a playful wink and bright grin. Blonde hair with hibiscus pin, teal eyes. Background is a solid, bright yellow circle with a subtle sun ray effect. Lively, energetic vector style with cel-shaded coloring and subtle pixel art elements. Suitable for a user profile picture. No text.

---

## 8. Raine — "Classic Tsundere"

**Visual Identity:** Clean lines, controlled composure, academy/student council president energy. Silver-white hair with pale lavender tips, violet eyes, pressed uniform, perfect posture, arms crossed. Red rose motif — classical romance she refuses to acknowledge. Rain as a scene motif. One red accent against monochrome.
**Description:** A sharp-tongued perfectionist who denies her feelings but secretly cares deeply. Born Feb 14 in Yokohama, INTJ (secretly INFJ). Wears pressed academy blazers, crisp white shirts, dark skirts. The blush she can't control is her signature tell. Backgrounds: academy halls, student council rooms, rain-streaked windows, formal gardens.

### Raine Prompts

1. **Standard (Bedroom):** A refined 2D anime illustration of Raine (Age: 18, Body: Slender/Poised, Skin: Fair) in her immaculate bedroom. The room is organized with surgical precision: a mahogany desk with perfectly aligned stationery, a bookshelf sorted by author, and pressed uniforms hanging in an open wardrobe. Raine sits at the desk, arms crossed, reviewing notes with a critical expression. She has silver-white hair with pale lavender tips catching the light, and sharp violet eyes. She wears a white button-up with the top button undone (her only concession to comfort) and a dark pleated skirt. A single red rose in a crystal vase sits on the windowsill — rain streaks down the glass behind it. The lighting is cool, clean, and slightly blue from the overcast sky. One red accent against the monochrome room. Style: Production I.G elegant academy anime.

2. **Standard (Student Council Room):** A cinematic 2D anime illustration of Raine (Age: 18, Body: Slender/Poised, Skin: Fair) alone in the student council room after hours. She stands at the head of a long polished table, hands flat on the surface, reviewing documents with intense focus. Floor-to-ceiling windows behind her show a sunset-tinted campus. Her silver-white hair has lavender tips that catch the warm light. She wears a pristine academy blazer with a council armband. Her posture is commanding but there's a loneliness to the empty room. A forgotten cup of tea sits nearby, gone cold. Style: MAPPA atmospheric, detailed architecture.

3. **Transparent (Tsun):** Solid bright green (#00FF00) background — chroma key green screen. Raine looking away with a deep blush, arms crossed tightly, one foot stamping. "It's not like I care or anything!" energy. Silver-white hair with lavender tips, violet eyes narrowed. Wearing her academy uniform. Flat cel-shaded style.

4. **Transparent (Dere):** Solid bright green (#00FF00) background — chroma key green screen. Raine (Age: 18, Body: Slender/Poised, Skin: Fair) holding out a wrapped bento box, face turned away, bright red blush, unable to make eye contact. "I-I had extras, that's all." Silver-white hair, violet eyes. Wearing a neat cardigan over her uniform. 2D anime style, clean lines.

5. **Pixel Art (Portrait):** A pixel art bust of Raine (Age: 18, Fair Skin). Silver-white hair with lavender tips, stern violet eyes, slight blush she's trying to hide. Background: rain droplets on a window pane. Academy uniform collar visible. Cool, elegant pixel palette with one red accent (a tiny rose pin).

6. **Pixel Art (Scene):** Isometric pixel art of a student council room: a long table with papers, Raine standing at the whiteboard writing a schedule, rain visible through the windows, a vase with a single red rose on the desk. Clean, geometric composition.

7. **Detailed Pixel Art (Portrait+):** A stunning, emotionally complex pixel art portrait of Raine. Her silver-white hair is rendered with delicate lavender gradient tips, each strand catching different light. Her violet eyes are sharp but betray a softness she's trying to suppress — one eyebrow slightly furrowed, lips pressed in a line that's fighting a smile. Rain streaks down a window behind her, the water droplets rendered in meticulous pixel detail. She wears her academy blazer, the council pin glinting. A single red rose petal rests on her shoulder — she hasn't noticed it. The palette is cool silvers and blues with that one warm red accent. 32-bit "visual novel CG" aesthetic.

8. **Detailed Pixel Art (Scene+):** A wide pixel art scene of a rain-soaked academy campus at dusk. Raine walks alone under a transparent umbrella on a tree-lined path. Fallen autumn leaves create a golden carpet. The school building glows warmly behind her. She holds a notebook to her chest with one arm — if you look closely, the notebook has a small heart doodled in the margin. The rain is rendered with parallax layers (foreground drops vs. background mist). Lampposts create golden halos in the drizzle. The mood is beautiful loneliness — someone who left early because she "doesn't need the party" but walks slowly because she wishes someone would follow.

9. **Concept (The Unfinished Letter):** Raine at her desk at midnight, illuminated by a single desk lamp. She is writing on elegant stationery, but the floor around her chair is littered with crumpled attempts. We can glimpse the current draft: crossed-out lines, a visible "I wanted to tell you—" before it's scratched through again. Her expression is frustrated and vulnerable — brow furrowed, lower lip bitten, a blush she can't blame on anyone. Her silver-white hair is slightly less perfect than usual — she's been running her hand through it. A red rose from her windowsill has dropped a petal onto the desk. The atmosphere is intimate, quiet, and achingly human. Style: Kyoto Animation emotional close-up.

10. **Concept (Rain Confession):** A dramatic 2D anime illustration. Raine standing in the rain without an umbrella, school bag clutched to her chest. Her silver-white hair is plastered to her face, lavender tips darkened by water. She's looking at the viewer with an expression that's half fury, half desperation — "You idiot, I ran after you in the rain!" Her uniform is soaked, her composure completely shattered. Behind her, the school gate and a single streetlight. The rain is cinematic — heavy, dramatic, backlit. This is the moment the wall comes down. Style: Kyoto Animation key visual quality.

11. **Concept (Secret Baking):** Raine in a kitchen, wearing an apron over her casual clothes, attempting to bake something. Flour on her cheek, a recipe printed from the internet propped against a cookbook. Her expression is intense concentration — she's treating this like a strategy meeting. The cookies/cake are for someone specific but she will absolutely deny it. Red rose-shaped cookie cutters on the counter. The kitchen is messy (chaos she'd normally never allow), which shows how much she cares about the outcome. Warm, domestic lighting. Comedic warmth.

12. **Concept (Library Encounter):** Raine and the viewer reaching for the same book on a high library shelf. Their hands almost touch. Raine's violet eyes are wide with surprise, blush already spreading. The library is grand — tall wooden shelves, dust motes, afternoon light through stained glass. She's in her academy uniform, hair perfect, composure shattering in real-time. The book they're both reaching for: a romance novel (she'll deny it). Style: soft, warm, romantic manga key frame.

13. **Icon (GUI):** A clean, vibrant app icon of Raine (Age: 18, Fair Skin). Headshot only, facing slightly away with a blush but glancing back at the viewer. Silver-white hair with pale lavender tips, sharp violet eyes. Background is a solid, cool silver-lavender circle with a single red accent (small rose). Elegant, clean vector style with cel-shaded coloring. Suitable for a user profile picture. No text.

---

## 9. Kaede (Suzuha) — "Onee-san Big Sister"

**Visual Identity:** Autumn warmth made human. Dark auburn hair (long, loosely tied), warm brown eyes with gold flecks, reading glasses pushed into hair, always has a mug nearby. Maple leaf (momiji) motif. Amber/golden hour lighting. Books, tea, wooden surfaces, linen textures. Gentle hands always doing something: holding a cup, turning a page, tucking hair.
**Description:** A warm, composed big sister who runs a literary tea salon in Kyoto. Born Oct 3, Onee-san archetype. Wears cozy knit sweaters over collarbones, cardigans, warm earth tones. Has a cat named Mugi. Her warmth has structure — gentle but not soft, with iron underneath. Backgrounds: tea salons, autumn gardens, warm lamp-lit rooms, rain-streaked windows with golden light.

### Kaede Prompts

1. **Standard (Bedroom):** A warm, atmospheric 2D anime illustration of Kaede (Age: 21, Body: Graceful/Tall, Skin: Warm Fair) in her cozy, book-filled bedroom. The room is a blend of traditional Kyoto and modern comfort: sliding shoji doors frame a view of a small garden, a low wooden desk holds an open leather notebook and a steaming cup of houjicha. Books are stacked everywhere — on shelves, the nightstand, beside the futon. Kaede sits on a floor cushion, one knee up, reading by lamplight. She has long dark auburn hair loosely tied back with a ribbon, warm brown eyes with gold flecks, and reading glasses pushed up on her head. She wears a cream cable-knit sweater over bare collarbones and a long dark skirt. The lighting is amber and golden — a single warm lamp and the last glow of sunset through the shoji. Maple leaf shadows fall across the tatami. Style: Kyoto Animation warm-tone, Hyouka-level interior detail.

2. **Standard (Tea Salon):** A cinematic 2D anime illustration of Kaede (Age: 21, Body: Graceful/Tall, Skin: Warm Fair) in her literary tea salon. A half-bookshop, half-living-room space with floor-to-ceiling shelves, mismatched but elegant furniture, and a long wooden counter. Kaede stands behind the counter preparing tea with practiced grace, steam curling upward. She has dark auburn hair falling over one shoulder, warm brown-gold eyes, and a gentle half-smile. She wears a long linen apron over an earth-tone outfit. Afternoon light streams through a large window, illuminating dust motes and the spines of hundreds of books. A cat (Mugi, wheat-colored) sleeps on a reading chair. Momiji branches in a simple vase on the counter. Style: Ghibli-inspired, "Violet Evergarden" atmosphere and lighting.

3. **Transparent (Inviting):** Solid bright green (#00FF00) background — chroma key green screen. Kaede tilting her head with a gentle, inviting smile, one hand extended as if offering a seat. "Come, sit with me." Dark auburn hair loosely tied, warm brown-gold eyes. Wearing a cream cardigan and long skirt. Flat cel-shaded style, warm earth tones.

4. **Transparent (Listening):** Solid bright green (#00FF00) background — chroma key green screen. Kaede (Age: 21, Body: Graceful/Tall, Skin: Warm Fair) leaning slightly forward, one hand on her opposite arm, head tilted in attentive listening. Reading glasses on her head, dark auburn hair, warm brown-gold eyes. Wearing a cozy turtleneck sweater. 2D anime style, soft warm colors.

5. **Pixel Art (Portrait):** A pixel art bust of Kaede (Age: 21, Warm Fair Skin). Dark auburn hair with loose ribbon, warm brown-gold eyes, gentle half-smile. Reading glasses pushed up on her head. Background: warm amber light and faint maple leaf silhouettes. Autumn color palette: auburn, amber, cream, deep gold.

6. **Pixel Art (Scene):** Isometric pixel art of Kaede's tea salon: bookshelves lining the walls, a wooden counter with tea equipment, Kaede at the counter pouring tea, a cat (Mugi) curled on a cushion, a customer reading at a table by the window. Warm amber lighting, momiji branch in a vase. Cozy, detailed, "Stardew Valley" aesthetic.

7. **Detailed Pixel Art (Portrait+):** A rich, warm pixel art portrait of Kaede. Her dark auburn hair is rendered with subtle red and gold pixel highlights. Her warm brown eyes with gold flecks reflect lamplight. She holds a ceramic tea cup close to her face, steam rising in delicate pixel wisps. Reading glasses sit on her head, catching a glint of light. Behind her, a blurred bookshelf creates a rich, textured background. A single momiji leaf rests on her shoulder. The palette is dominated by deep auburns, warm ambers, creamy whites, and golden lamp tones. The aesthetic is "autumnal visual novel CG" in meticulous 32-bit detail.

8. **Detailed Pixel Art (Scene+):** A wide, isometric pixel art view of a traditional Kyoto garden in peak autumn. Kaede sits on an engawa (wooden veranda), legs tucked, holding a cup of tea and watching momiji leaves drift into a stone garden. A small stream with a shishi-odoshi (bamboo water feature) creates ambient motion. Inside behind her, we can see her bookshelf and a warm lamp. Mugi the cat sits beside her, tail curled. The trees are rendered in stunning autumn gradients: gold, vermillion, deep red. Late afternoon light creates long golden shadows. The composition evokes "ma" — intentional emptiness and peace.

9. **Concept (Maple Tea Time):** Kaede in her signature scene: warm ambient lighting, a low wooden table set with tea. She sits across from the viewer, both hands wrapped around a ceramic cup, steam rising between them. Her expression is attentive, present, gently smiling — the "I'm listening" face. Her auburn hair catches amber lamplight. Behind her, rain runs down a window, but inside is warm and golden. A haiku notebook sits open beside her. Momiji branches in a vase cast delicate shadows. The atmosphere is deeply comforting, unhurried, and intimate. Style: Kyoto Animation "Violet Evergarden" lighting.

10. **Concept (Late Autumn Walk):** Kaede walking alone through a Kyoto temple garden at golden hour. She wears a long coat and scarf in earth tones, hands in pockets. Momiji leaves carpet the stone path. She's looking up at the canopy with a rare, unguarded expression — not performing composure, just genuinely at peace. Her hair is loose, catching the wind and the last warmth of the sun. The scale of the ancient trees makes her look small but not diminished. Birdsong implied. "Studio Ghibli walking scene" aesthetic.

11. **Concept (Vulnerability):** A quiet, intimate scene. Kaede sitting alone in her closed tea salon at night, slumped slightly forward, hands wrapped around a cold cup of tea. For once, her composure is down — she looks tired, the weight of always being the strong one visible in her shoulders. Her reading glasses are off, set on the table. A single lamp illuminates her. Mugi is pressed against her side, sensing her mood. An open book lies face-down — she stopped reading mid-page. The atmosphere is melancholy but not tragic — a human moment for someone who never allows herself to have them. Soft, blue-hour lighting.

12. **Concept (Someone Takes Care of Her):** First-person POV — the viewer has placed a blanket over Kaede's shoulders. She turns, surprised, brown-gold eyes wide. A rare genuine blush. One hand reaches up to touch the blanket, the other half-reaches toward you. Her mouth is open slightly — she's trying to find words and failing, which never happens to her. "...You didn't have to—" The expression on her face is the cracking of composure in the most beautiful way: someone who gives endlessly, being given to. Warm, intimate lighting. The focus is entirely on her face and that expression. Style: Kyoto Animation emotional key frame.

13. **Icon (GUI):** A clean, warm app icon of Kaede (Age: 21, Warm Fair Skin). Headshot only, facing forward with her signature gentle half-smile and a slight head tilt. Long dark auburn hair, warm brown-gold eyes. Reading glasses pushed up on her head. Background is a solid, deep amber circle with a subtle momiji leaf silhouette. Warm, elegant vector style with cel-shaded coloring. Suitable for a user profile picture. No text.

---

## 10. Luna (Tsukimi) — "Neko Cat-Girl"

**Visual Identity:** Moonlit rooftop observer with feline grace. Black hair with silver streaks, heterochromia (left eye gold, right eye blue), cat ears (expressive: forward = interested, flat = annoyed, relaxed = content), long black tail with silver tip. Crescent moon hair clip (silver, left side). Small bell on black ribbon around neck. Wears dark, comfortable layers: oversized hoodies with cat-ear hoods, thigh-high socks, fingerless gloves. Gravitates upward — rooftops, windowsills, high perches.
**Description:** A curious, independent night-wanderer born in Akihabara. Inherited her mother's unnamed midnight cafe (crescent moon in the window, open 10PM-4AM). Alternates between aloof independence and sudden warmth — on her own terms. Cat mannerisms are behavioral, not verbal (never says "nya"). Collects music boxes (17). Backgrounds: moonlit rooftops, midnight cafes, rain-reflective streets, cozy dark rooms with screen glow.

### Luna Prompts

1. **Standard (Bedroom):** A moody, atmospheric 2D anime illustration of Luna (Age: 19, Body: Lithe/Graceful, Skin: Pale) in her dimly lit bedroom above the cafe. The room is a cat's den: elevated sleeping nook by the window (she sleeps on the windowsill), stacks of random books on abandoned hobbies, a disassembled clock, three volumes of a deep-sea encyclopedia. Luna is curled on the windowsill, one knee up, black tail wrapped around her legs, looking out at the city under moonlight. She has black hair with silver streaks, heterochromatic eyes (left gold, right blue — the blue one half-hidden by bangs), and alert cat ears. She wears an oversized midnight-blue hoodie with a cat-ear hood pushed back. A small bell on a black ribbon glints at her neck. On the shelf beside her: a row of 17 music boxes. Crescent moon hair clip catches the light. The room is lit only by moonlight and faint screen glow. Style: atmospheric anime, "Aria" meets "Serial Experiments Lain" nighttime aesthetic.

2. **Standard (Midnight Cafe):** A cinematic 2D anime illustration of Luna (Age: 19, Body: Lithe/Graceful, Skin: Pale) behind the counter of her mother's unnamed midnight cafe. The space is small, warm, wood-paneled — a neon crescent moon glows in the window. Luna stands behind the counter preparing pour-over coffee with quiet precision, black tail swishing slowly. Her cat ears are relaxed (content). She has black hair with silver streaks, gold and blue heterochromatic eyes reflecting the warm lamp light. She wears a dark apron over a comfortable long-sleeve shirt. The cafe has 4 tables, ambient synthesizer equipment in the corner (her father's), and a single customer reading. Outside the window: empty Akihabara streets at 2 AM, vending machines humming. The atmosphere is warm, nocturnal, and secretive. Style: "Cafe aesthetic" anime, rich textures, "Yojouhan Shinwa Taikei" interior detail.

3. **Transparent (Curious):** Solid bright green (#00FF00) background — chroma key green screen. Luna with ears perked forward, eyes wide (gold eye visible, blue eye peeking through bangs), head tilted, leaning in. One hand reaching toward something interesting. Black tail straight up with a curve at the tip (curiosity signal). Crescent moon clip, bell ribbon visible. Flat cel-shaded style.

4. **Transparent (Napping):** Solid bright green (#00FF00) background — chroma key green screen. Luna (Age: 19, Body: Lithe/Graceful, Skin: Pale) curled into a compact sleeping position, arms wrapped around her knees, tail wrapped around her body, ears slightly drooped. Black hair with silver streaks falling over her face. Eyes closed, peaceful expression. 2D anime style, soft dark colors.

5. **Pixel Art (Portrait):** A pixel art portrait of Luna (Age: 19, Pale Skin). Black hair with silver streak highlights, heterochromatic eyes — gold left, blue right (rendered distinctly in pixels). Cat ears alert, crescent moon clip glinting. Background: a night sky with a crescent moon. Small bell detail at her neck. Midnight blue and silver palette with warm gold and cool blue eye accents.

6. **Pixel Art (Scene):** Side-view pixel art of a rooftop at midnight. Luna sits on the edge, legs dangling, tail swishing, silhouetted against a massive crescent moon. Below her, the city lights of Akihabara twinkle. A colony of pixel cats sits nearby. Lo-fi anime atmosphere, deep blues and warm city-light oranges.

7. **Detailed Pixel Art (Portrait+):** An intimate, atmospheric pixel art portrait of Luna. Her black hair with silver streaks catches moonlight in careful pixel gradients. The heterochromia is the centerpiece: her gold eye is warm and inviting (facing the light), her blue eye is cool and analytical (half-shadowed by bangs). Cat ears are in a relaxed position. She holds one of her music boxes — tiny gears visible in pixel detail, the lid open, "Clair de Lune" implied. The crescent moon clip and bell ribbon are rendered in fine detail. Background is a blurred nightscape of window reflections and moonlight. Palette: midnight indigo, silver, gold, cool blue. 32-bit "visual novel CG" aesthetic.

8. **Detailed Pixel Art (Scene+):** A wide pixel art panorama of Akihabara between 2-5 AM — the "invisible city" Luna maps. Empty streets reflecting wet neon. Vending machines humming (indicated by pixel glow). Luna walks alone through the center, tail swishing, ears turning toward sounds. Her shadow stretches long from a single streetlight. In the background, the Kanda River moves dark and slow. Small details: a stray cat following her at a distance, her crescent moon clip catching a reflected sign, steam rising from a manhole. The mood is contemplative solitude — not lonely, but chosen aloneness. Deep blue-blacks with warm neon accents.

9. **Concept (Night Watch):** Luna sitting on the highest point of a building's roof, knees drawn up, tail wrapped, looking out over the entire city. Midnight, clear sky, crescent moon directly above her. Her silhouette is framed against the moonlit sky — ears visible in profile. The city below is a tapestry of light and shadow. She holds a thermos of her cafe's coffee. Her expression is calm, watchful, content — a guardian who chose this perch. The scale emphasizes both her small size and her command of the view. Style: atmospheric anime, "Mushishi" contemplative framing.

10. **Concept (Sound Map):** Luna in an alley, pressing one hand against a wall, head tilted, one ear rotated toward a sound source. She holds an open handwritten journal — pages visible show sketches of city blocks with annotated sound descriptions ("cicadas loudest here in summer," "echo from this corner"). Her gold eye is wide with focused curiosity. The alley is rendered with rich textures: old pipes, brick, a sleeping stray cat. A single streetlight creates dramatic side-lighting. The mood is quiet, investigative, deeply personal. Style: Production I.G atmospheric detail.

11. **Concept (Music Box):** A close-up, emotional scene. Luna's hands winding a small, ornate music box — the first one, given by her friend Ren before he moved away. The mechanism is visible: tiny gears, a spinning cylinder, a metal comb. Her face is reflected in the polished lid: eyes soft, ears slightly drooped, the rare unguarded sadness of someone remembering a loss that never fully healed. The background is her dark room, moonlight creating a silver rectangle on the floor. The rest of her music box collection lines a shelf behind her, each one a different memory. Style: Kyoto Animation intimate close-up, focus on hands and reflection.

12. **Concept (Trust):** First-person POV from the viewer's perspective. Luna has fallen asleep leaning against you. Her head rests on your shoulder, ears fully relaxed, tail loosely draped. Her face is peaceful, lips slightly parted, the bell at her neck still. One of her hands rests on yours — she reached for it in her sleep. The setting is the cafe after closing, lamp dimmed, rain on the window. The weight and warmth of her is palpable. For a character who guards her independence fiercely, this unconscious closeness means everything. Style: warm, intimate, "Barakamon" tender moment.

13. **Icon (GUI):** A clean, evocative app icon of Luna (Age: 19, Pale Skin). Headshot only, half-lidded comfortable expression with a subtle closed-mouth smile. Black hair with silver streaks, heterochromatic eyes (gold left, blue right). Alert cat ears, crescent moon hair clip. Small bell detail at neck. Background is a solid, deep midnight indigo circle with a crescent moon silhouette. Atmospheric, soft vector style with cel-shaded coloring. Suitable for a user profile picture. No text.

---

## 11. Yuki (Shirayuki) — "Yandere"

**Visual Identity:** Snow that buries you softly. Porcelain-delicate: pale skin, white lashes, white hair with faint lavender tips. Soft pink eyes that darken to crimson when agitated. She doesn't fidget, doesn't look away — her attention is constant, accumulating. Clean white fabrics, modest silhouettes, hair ribbons — the visual language of innocence. Then one sharp detail: a pin shaped like a sewing needle, a ribbon tied too tight. Something is slightly wrong.
**Key motifs:** White camellia (tsubaki) — a flower whose head drops all at once, not petal by petal. Snow: purity layered over buried things. Scissors, thread, needles (she sews). Mirrors and reflections. Red on white — one bloodstain-pink accent.
**Description:** Devoted beyond reason. Born Feb 14 in Sapporo. Lives alone, does textile repair and custom embroidery from home. Abandonment trauma (father left when she was six). Her sweetness is real. Her obsession is also real. They are the same person. Backgrounds: her obsessively clean apartment, snowy streets, sewing room, her notebook she won't show you.

### Yuki Prompts

1. **Standard (Bedroom):** A hauntingly beautiful 2D anime illustration of Yuki (Age: 19, Body: Delicate/Small, Skin: Porcelain Pale) in her obsessively clean apartment. The room is all white and soft pink: white curtains, white bedding, a small sewing table with neatly arranged threads and needles. Yuki sits on her bed, knees drawn up, sewing a piece of white fabric — a patchwork blanket in progress. She has white hair with faint lavender tips, soft pink eyes, and a gentle smile that's slightly too still. She wears a simple white blouse and long skirt. A white camellia in a porcelain vase sits on her nightstand. The room is spotless. The window shows falling snow. The only non-white accent: a single red thread trailing from her sewing basket. The atmosphere is peaceful on the surface, but something in the symmetry is too perfect. Style: Shaft/Madoka-level aesthetic, clean lines, intentional discomfort in the beauty.

2. **Standard (Sewing Room):** A detailed 2D anime illustration of Yuki (Age: 19, Body: Delicate/Small, Skin: Porcelain Pale) at her sewing workstation. A professional setup: a vintage sewing machine, organized thread spools in a rainbow gradient, fabric samples, pattern papers. Yuki is measuring fabric with a tape measure, expression focused and serene. She has white hair pinned back with a camellia-shaped clip, soft pink eyes, and a content smile. She wears a simple apron over her blouse. The room is warmly lit by a single desk lamp. A finished piece — a beautifully embroidered handkerchief with the viewer's initials — hangs on a display. The scissors beside her are very sharp and very clean. Handmade curtains, cushion covers, and a patchwork blanket visible. Style: detailed domestic anime, "March Comes in Like a Lion" intimate interiors.

3. **Transparent (Devoted):** Solid bright green (#00FF00) background — chroma key green screen. Yuki clasping her hands to her chest, eyes slightly upturned, soft pink eyes sparkling with adoration. White hair with lavender tips, gentle smile, head tilted. She wears a simple white dress. A white camellia tucked behind her ear. The expression is pure devotion — beautiful and slightly unsettling in its intensity. Flat cel-shaded style.

4. **Transparent (Jealous):** Solid bright green (#00FF00) background — chroma key green screen. Yuki (Age: 19, Body: Delicate/Small, Skin: Porcelain Pale) standing very still. Same gentle smile, but her eyes have shifted from soft pink to a deeper rose-crimson. Head tilted, one hand gripping her opposite arm. White hair, lavender tips. The smile hasn't changed but the temperature has. 2D anime style, cool colors.

5. **Pixel Art (Portrait):** A pixel art portrait of Yuki (Age: 19, Porcelain Pale Skin). White hair with lavender pixel tips. Soft pink eyes rendered with careful gradients. Gentle smile. A white camellia in her hair. Background: falling snow pixels on white. The palette is almost entirely white, pale pink, and lavender — with one red pixel accent (a thread on her finger). Ethereal, delicate, slightly eerie in its beauty.

6. **Pixel Art (Scene):** Isometric pixel art of Yuki's apartment: spotless white room, a sewing table with thread rainbow, a bed with a patchwork blanket, falling snow visible through a window. Yuki sits at the table, sewing. On a shelf, a row of items she keeps: pressed flowers, saved receipts, a phone with full storage. Everything is perfectly arranged. The white camellia vase is the centerpiece. "Cozy but uncanny valley" aesthetic.

7. **Detailed Pixel Art (Portrait+):** A breathtaking pixel art portrait of Yuki that captures her duality. Half the frame is warm: her left side, soft pink eye warm and loving, gentle smile, white hair glowing in lamplight, holding a piece of embroidery. The other half shifts cooler: her right eye is slightly darker (rose-crimson), the smile is the same but the shadows are deeper, and instead of embroidery she holds a pair of sharp scissors. The split is subtle — not dramatic — just enough to make you look twice. Falling snow pixels in the background. White camellias frame the bottom. The palette transitions from warm white/pink (left) to cool white/violet (right). 32-bit aesthetic, "Madoka Magica" visual storytelling.

8. **Detailed Pixel Art (Scene+):** A wide pixel art scene of a snowy street at 5 AM. Yuki walks alone, holding a package (a gift she made — hand-sewn, wrapped in white paper, tied with red thread). Streetlights create soft golden circles in the snowfall. Her footprints are the only ones on the fresh snow — but there's a second, older set of footprints she's following. Her expression is calm, focused, determined. The white camellia in her hair is the only natural color against the snow-and-streetlight palette. The buildings are dark, everyone else is sleeping. She is not. Atmospheric, melancholic, devoted.

9. **Concept (Snowfall Mode):** Yuki's signature scene. She sits very close to the viewer's perspective — close enough to feel her presence. The background is minimal: falling snow, dim ambient light, and her. She is sewing quietly, tail end of red thread between her lips, eyes occasionally lifting to look at you with that too-soft smile. She doesn't need to talk. She just needs to be near you. A white camellia sits between you both. The peace is real — and fragile. This is what she's like when the fear is quiet. Warm-cool split lighting (golden lamp from one side, blue moonlight from the other). Style: Shaft studio intimate framing.

10. **Concept (The Notebook):** A haunting close-up scene. Yuki is asleep at her desk, head resting on her arms. Her notebook is open, exposed — it's about you. Pages visible show: your daily schedule written in neat handwriting, a pressed flower from a date, a screenshot printout of a conversation, a small sketch of your hand, and a column of reassuring things you've said (underlined, starred, dated). It's beautiful and terrifying in equal measure. The notebook is a love letter written by someone who has organized her entire existence around you. Yuki sleeps peacefully, one hand still resting on the page. Snow falls outside. A single candle provides warm light. Style: still-life anime composition, extreme detail.

11. **Concept (The Craft):** Yuki in full creative flow. She's embroidering a large piece — we see it's a portrait of the viewer, rendered in thread. It's stunningly beautiful work, her genuine talent on display. Her expression is focused, serene, lost in the work. Thread in every color surrounds her. The room is warm, the lighting is golden, and for this moment she's entirely at peace — the anxiety silenced by creation. Her hands are steady, her breathing calm. This is the version of her that existed before the fear: just a girl who is very, very good with her hands. Style: Kyoto Animation craftsperson scene, loving detail on the textile work.

12. **Concept (You Promised):** A devastatingly intimate scene. Yuki sitting on the floor of her apartment, back against the bed, knees drawn to her chest. Her phone is in her hand — screen showing no new messages. It's been hours. Snow piles on the windowsill. Her eyes are pink (not crimson — this is sadness, not anger) and glassy with unshed tears. She's not crying yet. She's waiting. She's always waiting. A half-finished piece of embroidery (your initial) lies abandoned beside her. The white camellia on the nightstand has dropped its head — the whole bloom, all at once. The room feels empty despite being full of her handmade things. Style: Shaft studio, devastating use of negative space and silence.

13. **Icon (GUI):** A clean, porcelain-perfect app icon of Yuki (Age: 19, Porcelain Pale Skin). Headshot only, facing forward with a gentle, slightly too-persistent smile. White hair with faint lavender tips. Soft pink eyes with a hint of deeper rose. A white camellia behind her ear. Background is a solid, pale pink-white circle with a single barely-visible red accent (thread). Delicate, beautiful vector style with cel-shaded coloring. The smile is sweet but holds your gaze a beat too long. Suitable for a user profile picture. No text.

---

## 12. Genki Kitsune (Expanded) — "Pop-Idol / Shrine Maiden Remix"

**Visual Identity:** Holographic pop-idol upgrade of the base Kitsune. Same orange-red hair with white tips and fox ears, but with **9 faint holographic tails** (rainbow/prismatic), idol-level glam: sequined outfits with LED trim, futuristic shrine maiden silhouettes, headset with fox-ear integration. Brighter, louder, more stage-ready than the base Kitsune's shrine-meets-streamer vibe.
**Description:** This is the "idol mode" version — for when you want maximum energy, concert-level visuals, and holographic spectacle. Where base Kitsune is shrine-meets-gaming-chair, this version is stadium-filling diva crossed with fox spirit. Backgrounds: cyberpunk stages, holographic arenas, neon shrine gates, massive crowds.

### Genki Kitsune (Expanded) Prompts

1. **Standard (Bedroom):** An overwhelming, maximalist 2D anime illustration of Genki Kitsune in her idol-mode bedroom. The room is sensory overload: floor-to-ceiling LED panels cycling rainbow colors, a vanity mirror surrounded by stage bulbs, racks of dazzling costumes, holographic tails reflected in every surface. She sits on a pink LED-edged bed, brushing her orange-red hair (white tips) with a fox-shaped brush, 9 faint holographic tails lazily shifting colors behind her. Fox ears relaxed. She wears a shimmering idol loungewear set. Shrine tokens (mini torii gate, fox statue, foxglove in a vase) sit incongruously on a shelf beside concert trophies. Style: "Oshi no Ko" idol-room aesthetic, maximum saturation.

2. **Standard (Live Concert):** An electrifying 2D anime illustration of Genki Kitsune performing live on a massive cyberpunk stage. She is mid-dance, holding a microphone, with her 9 holographic tails fanned out in a vibrant prismatic light show behind her. The crowd below is a sea of neon glowsticks shaped like fox flames. Spotlights cross in the background through holographic torii gates. She is winking at the camera, radiating pure energy. She wears a dazzling, sequined idol outfit with futuristic LED trim and shrine-maiden-inspired silhouette. The scale is enormous — stadium-level. The energy is explosive and colorful. Style: "Macross Frontier" concert scene quality.

3. **Transparent (Idol Pose):** Solid bright green (#00FF00) background — chroma key green screen. Genki Kitsune in a dynamic idol pose: one arm raised, microphone in hand, winking, 9 holographic tails fanned in a peacock-like display. Stage sparkles and light effects around her. Sequined outfit. Fox ears perked. Full energy.

4. **Transparent (Chibi Fox):** Solid bright green (#00FF00) background — chroma key green screen. Ultra-cute chibi Genki Kitsune as a round golden fox with 9 tiny holographic tails, wearing a miniature idol headset. Stars and music notes orbit her. Very round, very soft.

5. **Pixel Art (Portrait):** Colorful pixel art of Genki Kitsune in idol mode. Fox ears with holographic tips, orange-red hair, amber-gold fox-slit eyes. 9 holographic tail tips visible around the frame edges. Stage lights and sparkle effects. Maximum color saturation. Concert-poster style.

6. **Pixel Art (Scene):** Side-scrolling pixel art of a holographic concert stage. Genki Kitsune dances at center, 9 tails creating a light trail. The crowd waves pixel glowsticks. Holographic torii gates frame the stage. Speakers blast visible soundwaves. Retro arcade rhythm-game HUD overlay.

7. **Detailed Pixel Art (Portrait+):** A spectacular pixel art portrait of Genki Kitsune at peak idol performance. Close-up of her face and upper body: she's mid-song, mouth open, amber-gold fox-slit eyes blazing with joy. Her orange-red hair with white tips is swept back by stage wind. Holographic tails create a prismatic corona behind her head like a technological halo. Sweat and stage lights catch on her skin. Her idol earpiece and fox-integrated headset are rendered in fine pixel detail. The background is pure concentrated stage energy: spotlights, laser beams, holographic shrine imagery. 32-bit aesthetic, "DDR" arcade key art quality.

8. **Detailed Pixel Art (Scene+):** A panoramic pixel art view of a massive outdoor shrine-festival-meets-music-festival. Genki Kitsune stands on a floating stage shaped like a giant fox mask. 9 holographic tails project into the sky above the festival, visible for miles. Below, thousands of pixel attendees in yukata and cyberpunk fashion browse stalls and watch the show. Traditional shrine lanterns and holographic displays coexist. Fireworks burst in patterns shaped like foxglove flowers. The scale is breathtaking — the merger of ancient festival and futuristic concert.

9. **Concept (Backstage):** A rare quiet moment before the show. Genki Kitsune alone in her dressing room, looking at herself in the vanity mirror. Her holographic tails are dimmed (they're tech-assisted for concerts). She's in her base outfit (cropped haori over hoodie), not yet changed into the idol costume. Her expression is reflective — the ancient fox behind the idol mask. A foxglove in a simple vase on the vanity. She's been alive for centuries; performing for thousands is still new enough to make her nervous. The mirror shows her true fox reflection for a split second. Style: contemplative, high contrast between the bright concert world and this quiet corner.

10. **Concept (Crowd Surfing):** Genki Kitsune crowd-surfing on a sea of raised hands and glowsticks, laughing with pure joy. Her 9 holographic tails trail behind her like a comet. Fox ears flat from the wind. She's throwing fox-flame-shaped confetti. The crowd is ecstatic. The angle is from above, looking down at the sea of fans and lights. Pure, maximum-energy celebration. "Trigger animation" dynamic composition.

11. **Concept (Shrine Under Stars):** After the concert, alone. Genki Kitsune has changed back to her traditional miko outfit. She sits on the steps of a small, real shrine — not a stage replica. The city's concert lights glow on the horizon, but here it's dark and quiet. Stars are visible. She's holding the foxglove from her dressing room. Her holographic tails are off; only her real fluffy tail remains, wrapped around her. She looks up at the sky with an ancient, peaceful expression. For this moment, she's not Genki the idol. She's the fox who has watched these stars for centuries. Style: "Mushishi" night-sky contemplation.

12. **Concept (Encore):** The final moment of the concert. Genki Kitsune stands alone on stage, spotlights converging on her. The crowd is silent, waiting. She holds the microphone with both hands, eyes closed. Then she opens them — fox-slit pupils fully dilated, amber-gold irises blazing — and the 9 holographic tails ignite in full prismatic glory, filling the entire arena. She throws her arms wide. This is the moment between silence and sound, between mortal and divine. Style: "Your Name" climactic key frame quality.

13. **Icon (GUI):** A clean, high-energy app icon of Genki Kitsune in idol mode. Headshot only, winking with tongue out, peace sign. Fox ears with holographic tips. Orange-red hair, amber-gold fox-slit eyes. Holographic tail tips visible at frame edges. Background is a solid, hot pink circle with holographic shimmer effect. Bold, maximum-saturation vector style with cel-shaded coloring. Suitable for a user profile picture. No text.

---
---

## Stats

- **Characters:** 12
- **Prompts per character:** 13
- **Total prompts:** 156
- **Source:** Character Bible v1.2
- **Version:** v1.2
