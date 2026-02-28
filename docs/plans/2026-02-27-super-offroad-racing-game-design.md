# Super Off-Road Racing Game — Design Document

> **Status:** Design complete. Implementation deferred — build as a dedicated session.
> **Inspiration:** Ivan 'Ironman' Stewart's Super Off Road (Leland/Tradewest, 1989).
> **Goal:** A high-quality browser-playable top-down dirt racing game where your AI character
> competes against you as a CPU driver with personality-driven commentary.

---

## Vision

A pixel-faithful spiritual successor to Super Off Road, playable inside the app via an iframe
overlay (same pattern as the 3D VRM viewer). The player races their truck against AI drivers
including their companion character, who provides live in-character commentary ("Catch me if you
can!"), reacts to crashes, and trash-talks in the post-race screen.

The game is fully self-contained in a single HTML file (`frontends/shared/racing/racing.html`)
with no external dependencies — pure Canvas 2D + vanilla JS. The companion character is wired in
via the existing SSE event system.

---

## Core Gameplay Loop (matching original)

1. **Race screen**: 4 trucks on a looping oval/figure-8 track. First to complete N laps wins.
2. **Nitro pickups**: Scattered on track. Collect to gain temporary speed boost.
3. **Money pickups**: Scattered on track. Collected between races to buy upgrades.
4. **Upgrade shop**: Between races — buy acceleration, top speed, nitro capacity.
5. **Campaign**: Progress through increasingly difficult tracks (more trucks, tighter turns).

---

## Architecture

```
App overlay (React GamePanel → ChessGame pattern)
  └─ <iframe src="/frontends/shared/racing/racing.html" />
       └─ racing.html (self-contained game engine)
            ├─ canvas.js         — Canvas 2D rendering, camera, track drawing
            ├─ physics.js        — Truck movement, collision, surface grip
            ├─ track.js          — Track definition format + collision mesh
            ├─ ai.js             — CPU driver pathfinding + difficulty tiers
            ├─ pickups.js        — Nitro + money item spawning/collection
            └─ companion.js      — postMessage bridge for AI commentary
```

The iframe communicates back to the React parent via `window.postMessage`, exactly like the
VRM viewer. The parent can inject the character name + send LLM-generated commentary lines
which appear as speech bubbles over the character's truck.

---

## Physics System

The original game's "feel" comes from a simplified but convincing vehicle physics model.
Key properties per truck:

```
Truck {
  x, y            — world position (pixels)
  angle            — heading in radians
  speed            — current forward velocity
  angular_vel      — current turning rate

  // Config (upgradeable)
  max_speed        — 180–400 px/s
  acceleration     — 40–120 px/s²
  deceleration     — natural drag + braking
  turn_rate        — radians/s at current speed (speed-dependent)
  nitro_capacity   — max nitro charges
  nitro_boost      — speed multiplier during nitro (1.6×)
}
```

### Surface friction model

The track has three surface zones (same as original):
- **Dirt track** — normal grip
- **Loose dirt shoulder** — reduced grip, slight slide
- **Grass/wall** — heavy friction, no grip

Grip factor multiplies the truck's acceleration and turn rate. When grip < 0.4, the truck
continues in its current direction (sliding) rather than turning sharply.

### Turn rate vs speed

Turn rate decreases as speed increases — high-speed corners require braking first.
Formula (approximate): `turn = base_turn * (1 - speed / max_speed * 0.6)`

This prevents the game from feeling like an ice rink at full speed.

---

## Track Format

Tracks are defined as a JSON structure readable by `track.js`:

```json
{
  "name": "Desert Valley",
  "laps": 3,
  "width": 1600,
  "height": 900,
  "background": "#c8a84b",
  "start_positions": [[100,450,0], [100,490,0], [100,530,0], [100,570,0]],
  "waypoints": [
    {"x": 300, "y": 450},
    {"x": 700, "y": 200},
    {"x": 1300, "y": 450},
    {"x": 700, "y": 700}
  ],
  "track_polygons": [...],   // solid racing surface (for grip detection)
  "walls": [...],            // collision boundaries
  "pickup_zones": [          // nitro / money spawn areas
    {"x": 500, "y": 300, "type": "nitro"},
    {"x": 900, "y": 500, "type": "money"}
  ],
  "jumps": [
    {"x": 600, "y": 350, "direction": 0, "length": 80}
  ]
}
```

The track renderer draws using layered Canvas operations:
1. Background fill (dirt texture via noise pattern)
2. Track surface polygons (lighter dirt tone)
3. Edge markings + lane lines
4. Jump ramps (3D perspective rectangles)
5. Pickup icons
6. Trucks (sprites or procedurally drawn)

**Phase 1 tracks (build these first):**
- Desert Valley — simple oval, gentle banked curves
- Canyon Run — figure-8 with crossover bridge
- Mountain Pass — tight switchbacks, narrower track

---

## AI Driver System

Three difficulty tiers, each layering on the previous:

### Tier 1 — Rookie (easy)
- Follows waypoints with 15% random angle offset
- Brakes 80px before corners
- Never uses nitro strategically (fires randomly)

### Tier 2 — Pro (medium, default)
- Smoothly interpolates between waypoints using bezier-style lookahead (2 waypoints ahead)
- Brakes proportionally to corner sharpness
- Uses nitro on straights > 200px

### Tier 3 — Champion (hard)
- Full racing line optimisation (cuts inside of corners)
- Reads ahead 3 waypoints; plans nitro use around lap fuel budget
- Rubber-bands slightly (reduces max speed by 8% when far ahead to keep race competitive)

### Your companion character's AI tier

The companion starts at Tier 2 and adjusts based on the affinity score:
- Affinity < 30: Tier 1 (lets you win, encourages you)
- Affinity 30–70: Tier 2 (fair competition)
- Affinity > 70: Tier 3 (plays seriously, trash-talks)

This makes the character feel more competitive as your relationship deepens.

---

## AI Commentary System

Commentary is generated by the LLM at key race moments and displayed as speech bubbles
floating over the companion's truck. The iframe sends events to the parent React component
via `postMessage`, which triggers an LLM request and posts the response back.

```
Moment triggers:
  - race_start        → "Ready? I'm not going easy on you~"
  - player_leads      → "Oh, you're actually fast!"
  - ai_leads          → "Try to keep up! ♪"
  - player_crash      → "Oops~ That corner had it out for you."
  - ai_crash          → "[Character name] slips... "Ugh, that was embarrassing.""
  - nitro_collected   → (silent — too frequent)
  - final_lap         → "Last lap! Give it everything!"
  - player_wins       → full win reaction (2-3 sentences, genuine)
  - ai_wins           → playful victory line
  - close_finish      → "That was SO close! Amazing race!"
```

Commentary is rate-limited: max 1 LLM call per 8 seconds, with a queue. Older queued
commentary is dropped if a newer, higher-priority trigger fires.

```
Priority (highest first): player_wins, ai_wins, close_finish, final_lap,
player_crash (if player was leading), race_start
```

---

## Upgrade Shop

Between races, a simple upgrade screen (HTML overlay, not canvas) shows:

```
╔═══════════════════════════════╗
║  RACE 1 COMPLETE              ║
║  You won! Prize: $250         ║
║  Your character says: "..."   ║
║                               ║
║  UPGRADES  — Cash: $450       ║
║  ☐ Acceleration    $200       ║
║  ☐ Top Speed       $300       ║
║  ☐ Nitro Boost     $150       ║
║  ☐ Nitro Capacity  $200       ║
║                               ║
║         [Next Race →]         ║
╚═══════════════════════════════╝
```

The companion character reacts to the upgrade choices in their commentary for the next race
("Oh, you upgraded nitro? Let's see if that helps!").

---

## App Integration

### React side (`RacingGame.tsx`)

```tsx
// Pattern identical to ChessGame.tsx and the VRM viewer
export function RacingGame({ charName, characterId, onExit }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Send character config to iframe once loaded
    iframeRef.current?.contentWindow?.postMessage({
      type: 'init',
      charName,
      aiTier: getAITier(affinity),
    }, '*');

    // Listen for commentary request events
    const handler = (e: MessageEvent) => {
      if (e.data.type === 'commentary_request') {
        fetchCommentary(e.data.moment, e.data.context).then(line => {
          iframeRef.current?.contentWindow?.postMessage({ type: 'commentary', line }, '*');
        });
      }
      if (e.data.type === 'race_result') {
        saveRaceResult(e.data); // store in game_sessions
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src="/frontends/shared/racing/racing.html"
      style={{ width: '100%', height: '100%', border: 'none' }}
    />
  );
}
```

### Backend side

- Add `'racing'` to `game_sessions.game_type` allowed values
- Store: laps completed, finish position (1st/2nd/3rd/4th), cash earned, upgrades purchased
- `GET /api/games/best-scores` already handles this automatically
- Add `POST /api/racing/commentary` — takes `moment + context`, returns 1-2 sentence LLM line
  (separate from game_move to allow faster, uncached responses)

---

## Art Style

Sprites will be procedurally drawn using Canvas arc/rect (no image assets needed):

```
Truck (top-down):
  - Body: rounded rectangle (~24×14px)
  - Wheels: 4 small filled circles at corners
  - Color: player = red, companion = character's theme color, CPU = grey/green/blue
  - Shadow: offset rectangle 2px down+right, semi-transparent black
  - Dust particles: 3-5 particles emitted from rear wheels, fade to transparent
```

Track textures use `ctx.createPattern()` with a procedural noise canvas — no image files.
Jump ramps use 3D perspective projection (simple foreshortening math, no WebGL needed).

---

## Implementation Phases

### Phase 1 — Core engine (3-4 days)
1. `racing.html` skeleton + game loop (requestAnimationFrame)
2. Truck physics — movement, turning, grip, collision with walls
3. Track renderer — single oval track (Desert Valley), no pickups yet
4. Keyboard input (WASD or arrow keys)
5. Camera follow (smooth lerp toward truck center)
6. Lap counter + win condition

### Phase 2 — AI + pickups (2-3 days)
7. Waypoint-following AI (Tier 1 + Tier 2)
8. Nitro pickup logic + boost effect
9. Money pickup + upgrade shop (HTML overlay)
10. 3-lap campaign progression

### Phase 3 — Companion + polish (1-2 days)
11. `companion.js` postMessage bridge
12. `RacingGame.tsx` React wrapper + commentary fetch
13. Character truck skin (companion theme color + name tag)
14. Second track (Canyon Run — figure-8)
15. Sound effects (Web Audio API, synthesised — no audio files)

### Phase 4 — Campaign + tracks (1-2 days)
16. Track 3 (Mountain Pass)
17. Race result storage in `game_sessions`
18. Post-race upgrade screen + companion reaction
19. Character knows race history in conversation

**Total: ~8-10 days for a genuinely good version.**

---

## What Makes It Feel Like the Original

| Original Feature | How We Replicate It |
|-----------------|---------------------|
| Dirt physics / sliding | Grip factor on surface zones + speed-dependent turning |
| 8 CPU drivers simultaneously | 3 CPU + 1 companion = 4 trucks total (simpler, still fun) |
| Nitro boost (distinct spray arc) | Speed multiplier + rear particle burst |
| Jump ramps | Perspective-foreshortened ramp + brief airtime (grip = 0, no turning) |
| Money pickups between laps | Random scatter on track, respawn after collection |
| Upgrade shop between races | HTML overlay, exactly matching original categories |
| Soundtrack | Web Audio API synthesised chiptune loop (~20 lines of code) |

---

## Files to Create

| File | Description |
|------|-------------|
| `frontends/shared/racing/racing.html` | Self-contained game (HTML + inline JS/CSS) |
| `frontends/shared/racing/tracks/desert_valley.json` | Track 1 definition |
| `frontends/shared/racing/tracks/canyon_run.json` | Track 2 definition |
| `frontends/shared/racing/tracks/mountain_pass.json` | Track 3 definition |
| `frontends/sakura/src/components/RacingGame.tsx` | React wrapper + commentary bridge |
| `backend/server.py` | Add `POST /api/racing/commentary` endpoint |

The game fits naturally into the existing `GamePanel.tsx` under the "Board & 2D Games" tab
alongside Chess, Tic-Tac-Toe, and Memory Match — no sidebar changes needed.

---

> **When ready to build:** Open a fresh session, reference this design doc, and start
> with Phase 1 (core physics engine). The physics is the foundation — get that right first
> before adding AI or companion integration.
