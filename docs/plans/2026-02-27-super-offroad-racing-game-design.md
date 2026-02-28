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

## Weapon System

> **Tone:** Vigilante 8 / Twisted Metal — gritty Nevada desert muscle car combat, not Mario Kart.
> Weapons feel heavy, industrial, and dangerous. Every shot has weight. Every explosion leaves a mark.
> Think: stolen military hardware bolted to monster trucks by desperate desert survivalists.

### Core Design Decisions

**Mystery Box pickups (not pre-labeled)**
Weapon crates on the track all look identical — a glowing amber box with a ? on the side.
You don't know what's inside until you collect it. The surprise is half the fun and prevents
players from specifically route-farming for their favourite weapon. Nitro/money remain labelled
(their utility is obvious; no ambiguity needed). Weapon box colour is distinct from both.

**Fixed spawn zones (per track), randomised weapon from the tier pool**
Each track has 4–6 weapon spawn points baked into its JSON definition. When a box spawns,
it draws randomly from the **tier-weighted pool** based on track campaign progress:
- Early tracks: 70% T1, 30% T2, 0% T3
- Mid tracks: 30% T1, 50% T2, 20% T3
- Final track: 10% T1, 40% T2, 50% T3

This means the further into the campaign, the heavier and more chaotic the weapons get.

**One weapon held at a time. Collecting a new box replaces current weapon (ammo lost).**

---

### HUD — Weapon Display

```
┌────────────────────────────────────────────────┐
│  [WEAPON ICON]  Rocket Launcher  ■■■□□  3/5    │
└────────────────────────────────────────────────┘
```

Displayed bottom-centre of screen (above minimap if present):
- **Icon**: 16×16px procedurally drawn weapon sprite (Canvas arc/rect, matches truck sprite)
- **Name label**: plain text (e.g. "Flamethrower")
- **Ammo pips**: filled/empty squares matching max ammo (max 8 pips; bullets show a compact
  "28/30" counter instead of pips)
- Flashes red when ammo = 1 remaining
- Animates off with a slide-down + fade when weapon expires

When no weapon is held: HUD slot is empty (semi-transparent "no weapon" icon, subtle)

---

### Weapon Tiers

#### Tier 1 — Common (spawn weight: high)

##### Ram Bumper
```
Type:         Passive melee — no fire button needed; activated by collision speed
Ammo:         5 charges (one per successful high-speed ram, speed ≥ 120px/s)
Damage:       20–55 HP based on collision speed (20 at 120px/s; 55 at max speed)
              Also sends target truck flying: angular_vel += 3.0 random, speed set to 0
Visual:       Massive steel bumper bolted to front of truck — widens the truck sprite
              slightly; chunky grey rectangles with rivet details, bull-bar style
Fire effect:  N/A — triggers automatically on collision when speed threshold met
Hit effect:   Metal crunch impact: 12 brown/grey debris particles radiate from point;
              target truck flips (spins 720° over 0.8s); dust cloud (20 particles, broad)
              Screen shake 300ms. Impact line flash (white, 1 frame) at collision point
Falloff anim: Bumper bends, then falls off front — bounces down the track behind you
Notes:        Does NOT consume a charge on low-speed nudges (<120px/s), only hard rams
```

##### Buckshot Shotgun
```
Type:         Single-fire spread (instant hitscan cone)
Ammo:         6 shells
Damage:       12–28 per shot (based on pellet hits; 8 pellets, 3.5 each)
Spread:       ±20° cone, effective range 100px (falloff beyond)
Visual:       Sawn-off shotgun strapped to passenger door, barrel pointing forward
Fire effect:  Massive muzzle flash (white bloom, 200ms); 8 pellet tracers fan out
              as short fat lines (4px × 8px), each fading independently
Hit effect:   Dust and debris spray (8 particles per pellet hit, brown/grey, gravity)
Falloff anim: Shotgun snaps loose from mount, spins behind truck
```

##### Machine Gun
```
Type:         Rapid-fire hitscan (held trigger, auto-fires while Space held)
Ammo:         30 rounds (fires 3/sec)
Damage:       7 per bullet hit
Visual:       Twin barrel protrusions on truck hood
Fire effect:  Alternating muzzle-flashes (yellow, 60ms each); fast yellow tracers
              (2px × 14px) race forward at full screen-width per second
Hit effect:   Small orange dust burst (5 particles, radial, slight gravity)
Falloff anim: Barrels spark, then detach and tumble off hood (physics arc, bounce)
```

##### Oil Slick
```
Type:         Rear-deployed trap
Ammo:         2 slicks
Damage:       0 HP — forces grip = 0.0 for 2.5 seconds (full uncontrolled slide)
Visual:       Industrial drum on rear bumper, nozzle pointing back
Fire effect:  Dark ellipse spreads behind truck (0 → 50×25px over 0.6s)
              Persists 10 seconds, fades to transparent. Rainbow sheen shimmer via
              Canvas gradient overlay (thin iridescent band sweeping across puddle)
Hit effect:   Truck loses steering — angular_vel thrashes randomly (0.8–2.2× current)
              Tyre screech sound cue. Leaves visible tyre marks across the slick.
Falloff anim: Drum splits open, drains, mount falls off rear
```

---

#### Tier 2 — Uncommon (spawn weight: medium)

##### Rocket Launcher
```
Type:         Single-shot projectile (medium speed, slight tracking)
Ammo:         5 rockets
Damage:       65 HP direct hit; 30 HP within 35px splash radius
Visual:       Shoulder-launched tube mounted on truck roof, angled forward
Fire effect:  Blinding white exhaust plume (cone of 16 particles, 400ms fade);
              smoke trail (grey particles, drift upward, persist 2s)
Projectile:   Orange cylinder (8×5px) with physics: mild gravity curve,
              slight yaw wobble to feel like a real rocket, not a bullet
Hit effect:   Large explosion (22 particles: ring burst + 5 secondary debris chunks
              that travel outward with gravity); screen shake 250ms; scorch mark
              decal left on track surface (dark ellipse that persists for 30s)
Falloff anim: Tube vents steam, sags, drops off truck with sparks
```

##### Flamethrower
```
Type:         Continuous short-range stream (held fire, drains ammo fast)
Ammo:         90 "units" (drains 10/sec while held; 9 seconds total)
Damage:       5 per frame while target is in flame cone (at 60fps ≈ 300/sec
              theoretical max, but effective hit rate ~25/sec due to range limit)
Range:        80px forward cone, ±12° spread
Visual:       Fuel tank on truck bed + nozzle on roof rack pointing forward;
              tank has a visible fuel gauge that empties
Fire effect:  Continuous orange→yellow→white gradient flame stream; 20+ particles/frame,
              each with short life (0.1–0.3s), bright at source, darkens to smoke at edges
              Lights up nearby ground with an animated orange glow (ctx.shadowBlur)
Hit effect:   Target truck emits smoke + flame particles continuously while burning;
              "On fire" status for 1.5s after leaving range (lingering damage 8/s)
Falloff anim: Tank pressure vents, then tank itself pops off truck in a small fireball
```

##### Proximity Mine
```
Type:         Rear-deployed delayed trap
Ammo:         4 mines
Damage:       50 HP per mine
Visual:       Mine rack on rear; canisters are distinct cylinders, count decrements visually
Fire effect:  Mine drops straight down behind truck with a clank; lands and
              activates after 0.5s arming delay (blinks red LED every 500ms)
Projectile:   Static world object (9px circle, dark grey, red LED blink)
              Triggers on any truck within 22px radius
Hit effect:   Moderate explosion (14 particles, radial); shorter screen shake (150ms)
Falloff anim: Empty rack folds flat onto truck rear
```

##### Dust Storm
```
Type:         Deployed expanding cloud — drifts across the track over time
Ammo:         2 canisters
Damage:       0 HP — dual disruption: grip loss + vision impairment
              Grip inside cloud: 0.2 (heavy sand drag, near-uncontrollable slide)
              Vision inside cloud: other trucks rendered at 25% opacity; track
              markings invisible; HUD blurs (CSS filter: blur(2px) on canvas)
Duration:     8 seconds total; cloud expands for first 3s (radius 0 → 90px),
              drifts for 5s in a randomised "wind" direction (±30° off track axis,
              speed 15px/s), then disperses (radius 90 → 0 over 1.5s)
Visual:       Industrial sand blaster canister bolted to truck roof; fires a
              high-pressure burst of sand forward and upward when triggered
Fire effect:  Canister vents with a crack; large dust plume launches 40px ahead
              of truck and immediately begins expanding — 80+ tan/brown/ochre
              semi-transparent particles per frame (radius 8–25px each, slow drift,
              very low decay: 0.003–0.006 so particles live 150–300 frames)
              Cloud has a swirling motion: each particle has a slight angular velocity
              around the cloud centre, creating a rotating dust devil texture
              At cloud edge: particles fade (alpha proportional to distance from centre)
              Ground underneath tints a sandy brown (ctx.fillStyle rgba overlay, 15% opacity)
Hit effect:   Trucks entering cloud: immediate grip drop; dust particles stream off
              their wheels; headlights (small white circles on truck sprite) visible
              but dimmed through the haze
Falloff anim: Canister cracks, hisses, then crumbles off roof mount
Notes:        The drift direction is set on deployment and stays consistent for
              that cloud's lifetime — players who watch the cloud can navigate around it.
              Your own truck is NOT immune — drive through your own storm at your peril.
              Tier 3 AI deploys this on wide straights where it has run-off room
              but pursuing trucks have nowhere to dodge.
```

---

#### Tier 3 — Rare (spawn weight: low; campaign late-game only)

##### Plasma Ray
```
Type:         Continuous beam — instantaneous hitscan, no travel time
Ammo:         60 units (drains 10/sec; 6 seconds of fire)
Damage:       18 per frame while beam is on target (~1080/sec theoretical;
              effective ~200–400/sec due to aiming difficulty at speed)
Range:        Full track width — the beam travels until it hits a wall
Visual:       Plasma cannon grafted to truck hood; emits faint blue glow at rest,
              brightens when charging before first fire (0.3s wind-up)
Fire effect:  Electric blue beam (3px wide, full-length) with animated energy
              arcing: 4 sub-beams oscillate ±2px from centre axis (sine wave),
              beam colour shifts blue→white at core, fade rings at edges
              Ground underneath beam glows with moving blue light reflection
Hit effect:   Target truck takes continuous damage; emits arcing electricity
              sparks (white/blue, 6 particles/frame, jump randomly across truck sprite)
              Plasma impact point leaves a small blue scorch growing over time
Falloff anim: Cannon overheats — glows red-orange, then cracks and falls off hood
              with a dramatic explosion (8 particles, blue-white)
```

##### Homing Missile Barrage
```
Type:         Multi-shot homing projectiles (locks onto nearest truck ahead)
Ammo:         3 salvos of 2 missiles each = 6 missiles total
Damage:       45 HP per missile (homing makes them hard to dodge)
Lock time:    0.4s targeting delay before each salvo fires (HUD shows "LOCK" flash)
Visual:       Dual side-pod launchers on truck flanks; each pod holds 3 tubes
Fire effect:  Both missiles launch with rocket trails; each curves independently
              toward target using simple proportional navigation (adjusts heading
              by up to 90°/sec toward target's predicted position)
Projectile:   Small bright-white cylinder (5×3px), intense contrail, constant sparks
Hit effect:   Same as rocket but smaller (15 particles, moderate screen shake 150ms)
Falloff anim: Empty pods jettison from sides, tumble off-screen
```

##### Napalm Bomb
```
Type:         Lobbed arc projectile — lands and creates a fire zone
Ammo:         2 bombs
Damage:       20 per second to any truck inside the fire zone
Zone:         60px radius burn area, persists 6 seconds, pulses visibly
Visual:       Mortar tube on truck bed, angled upward
Fire effect:  Bomb launches in a high arc (real ballistic trajectory — high initial vy,
              gravity = 0.8); tumbles end-over-end during flight (rotation animation)
              On landing: shockwave ring + ignition flash
Hit effect:   Burn zone: animated orange/red fire particles (30+/frame, drift upward,
              yellow at base fading to dark smoke at tips); trucks inside emit smoke
Falloff anim: Mortar tube melts from heat, drips off truck bed
```

---

### Particle Physics Spec

All projectiles and effects use a shared 2D particle pool (`max 300 active particles`, oldest
replaced when full to maintain 60fps):

```js
Particle {
  x, y        — world position
  vx, vy      — velocity px/frame
  life        — 0.0–1.0 (decremented by `decay` each frame)
  decay       — life reduction rate (0.02 = ~50 frame life; 0.1 = ~10 frame)
  r           — current radius (some particles shrink: r -= 0.05 * (1 - life))
  color       — CSS color string
  alpha       — opacity driven by life (alpha = life * baseAlpha)
  gravity     — vy += gravity each frame (0 for plasma/tracers; 0.15–0.4 for debris)
  bounce      — vy *= -0.5 on floor contact (for tumbling debris/rocket parts)
}

Persistent world objects (mines, oil slicks, burn zones, scorch marks):
  tracked in separate `world_effects[]` array — have collision detection,
  decay on their own timers, rendered below trucks in the canvas layer order
```

---

### Damage & Health System

Each truck starts with **100 HP**. HP bar displayed above truck sprite (all trucks visible to player).

**On reaching 0 HP:**
- Truck spins out (angular_vel = 5.0 random dir, 1.5s duration)
- Continuous smoke trail from hood
- **Respawns at nearest waypoint** after 2.0s with 60 HP (no elimination — keeps race flowing)
- Brief invincibility shield (1.5s) on respawn (cyan glow ring)

```
Damage Reference (Tier 1 — Common):
  Ram Bumper (max speed):   55 HP + knockback
  Shotgun (full spread):    28 HP max
  Machine Gun (3 bullets):  21 HP
  Oil Slick:                 0 HP (grip loss only)

Damage Reference (Tier 2 — Uncommon):
  Rocket (direct):          65 HP + 30 HP splash
  Flamethrower (1s):        ~25 HP effective
  Proximity Mine:           50 HP
  Dust Storm (inside):       0 HP (grip 0.2 + vision 25%, 8s duration)

Damage Reference (Tier 3 — Rare):
  Plasma Ray (1s):          ~200–400 HP (melts trucks)
  Homing Missile (each):    45 HP
  Napalm (full zone, 6s):   120 HP max
```

---

### Weapon Pickup Spawning

Pickup zones in track JSON:

```json
{
  "pickup_zones": [
    {"x": 400, "y": 250, "type": "weapon_box", "respawn_s": 15},
    {"x": 900, "y": 180, "type": "weapon_box", "respawn_s": 15},
    {"x": 200, "y": 600, "type": "nitro"},
    {"x": 1100, "y": 550, "type": "money"}
  ]
}
```

All weapon boxes look identical on track — glowing amber crate with `?` on side (40×30px,
pulsing ambient glow). Respawn time: 15s (weapon boxes are rare; don't respawn instantly).

Track weapon density: **4–6 weapon boxes** per track, **6–8 nitro**, **8–12 money**.

---

### AI Weapon Usage

AI trucks pick up and use weapons based on difficulty tier:

| Tier | Behaviour |
|------|-----------|
| Rookie | Fires immediately when a weapon is picked up, random direction |
| Pro | Waits until target is within ±20° of heading and 180px range, then fires |
| Champion | Weapon-specific logic: saves plasma/homing for the race leader; drops oil slick when being tailgated within 50px; places mines on corners; never wastes T3 weapons on trucks already behind |

The **companion character** uses Pro-tier weapon AI but has a "mercy rule": if the player is
in 1st place on the final lap by <2 seconds, she holds fire — she wants a fair fight, and her
post-race commentary reflects whether she chose to let you win or actually couldn't catch up.

---

### Controls Addition

```
Keyboard:   Space         = Fire weapon (hold for auto-fire weapons)
Gamepad:    B button      = Fire
Mobile:     🔥 button     = Fire (right thumb, red, bottom-right zone)
```

Holding Space works for flamethrower and machine gun (auto-fire while held).
Single tap for rocket/shotgun/plasma (one shot per press).
Rear-deploy weapons (oil slick, mine, napalm) fire backward automatically — no aim needed.

---

### Upgrade Shop Addition

Two new weapon upgrade slots available from Race 2 onward:

```
☐ Weapon Damage   +15% damage multiplier (stacks ×3 max)    $300
☐ Ammo Capacity   +1 extra charge per weapon picked up       $250
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
