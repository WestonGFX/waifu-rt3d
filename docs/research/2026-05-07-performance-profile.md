# Performance Profile — 2026-05-07

**Environment:** Dev server (`localhost:5175/sakura/`), stale backend (`localhost:8080`)  
**Method:** Playwright browser automation, `performance` API introspection  
**Build:** master, session 37

---

## Page Load Timing (Navigation API)

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| TTFB | 6ms | <200ms | ✅ Excellent |
| DOM Interactive | 15ms | <1000ms | ✅ Excellent |
| DOM Content Loaded | 159ms | <1800ms | ✅ Excellent |
| First Paint | 176ms | <1800ms | ✅ Excellent |
| First Contentful Paint (FCP) | 176ms | <1800ms | ✅ Excellent |
| Load Complete | 185ms | <3000ms | ✅ Excellent |

**Initial render is very fast.** The app is interactive in under 200ms.

> Note: These numbers are from Vite dev server with HTTP caching warm. Production build
> will be faster (fewer requests) but similar FCP since the shell renders before API data.

---

## JavaScript Memory (Heap)

| Metric | Value | Notes |
|--------|-------|-------|
| Used JS Heap | 37 MB | Healthy baseline |
| Total JS Heap | 56 MB | 34% headroom |
| Heap Limit | 4096 MB | M2 Pro allows large heaps |

No memory concern at startup.

---

## Resource Sizes (Encoded)

| Type | Count | Size | Notes |
|------|-------|------|-------|
| API/fetch calls | 49 | ~8 MB | Includes duplicate calls (see below) |
| JS modules | ~184 | 2,373 KB | Dev mode (unbundled) |
| CSS | 1 | 88 KB | themes.css + components.css |
| PNG portraits | 14 | 7,034 KB | **Loaded eagerly — optimization target** |

**Total encoded on load: ~17.5 MB** (dev mode; production would be ~5 MB without portraits)

### Top 5 Largest Individual Resources

| Resource | Size |
|----------|------|
| panicandy_portrait.png | 1,055 KB |
| react-dom_client.js (Vite bundle) | 982 KB |
| kitsune_portrait.png | 867 KB |
| tsuki_portrait.png | 815 KB |
| lucide-react.js (Vite bundle) | 787 KB |

---

## API Performance — ⚠️ P1 ISSUE FOUND

### Duplicate API Calls on Startup

**49 total API calls for 21 unique endpoints** — 28 are duplicates.

| Endpoint | Call Count | Est. Time (ms) | Issue |
|----------|-----------|----------------|-------|
| `/api/characters/1/relationship` | **11×** | ~1,563ms each | P1 — no deduplication |
| `/api/stats` | **6×** | ~2,559ms each | P1 — no deduplication |
| `/api/config` | **3×** | ~1,500ms | P2 — minor |
| `/api/characters` | 2× | ~1,500ms | P2 |
| `/api/characters/1/streak` | 2× | ~1,500ms | P2 |
| (9 more endpoints) | 2× each | ~1,500ms | P2 |

**Root cause:** Multiple components each independently fetch the same data on mount with no
shared cache or request deduplication. The `useEffect(() => { fetch(...) }, [])` pattern
appears in many components that all render on startup.

**Impact:** The backend handles 49 requests (instead of 21) on every cold load. With
`/api/stats` at 2.5s and `/api/characters/1/relationship` at 1.5s, the server processes
~90 seconds of query time serially per page load (the calls are parallel from the frontend
but still hit the DB serially).

### Slowest API Calls

| Endpoint | Duration | Notes |
|----------|----------|-------|
| `/api/stats` | 2,559ms | Aggregates many tables |
| `/api/characters/1/relationship` | 1,677ms | Called 11× |
| `/api/characters/1/bond` | 1,670ms | |
| `/api/characters/1/bond/unlocks` | 1,670ms | |
| `/api/scan/models3d` | 1,629ms | Filesystem scan on every load |
| `/api/characters/1/diary` | 1,628ms | |

> All API calls are 1.5-2.5s. This is likely because the running backend process is stale
> (started pre-session, accumulated state). A backend restart should reduce latency.
> However, the duplicate call problem is architecture-level and persists after restart.

---

## Portrait Image Loading — P2 ISSUE

All 14 character portrait PNGs load eagerly on startup regardless of which character is
selected. Combined: 7 MB of portrait images loaded before any interaction.

**Fix:** Lazy-load portraits. Only load the selected character's portrait immediately;
load others on `<img loading="lazy">` or `IntersectionObserver`.

---

## Issues Summary

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| PERF-001 | **P1** | `/api/characters/1/relationship` called 11× on load | Add a Zustand-based API cache or SWR-style hook; share response across components |
| PERF-002 | **P1** | `/api/stats` called 6× on load | Same — cache at store level, invalidate on relevant mutations |
| PERF-003 | P2 | All 14 character portrait PNGs loaded eagerly (7 MB) | `loading="lazy"` + consider WebP conversion |
| PERF-004 | P2 | `/api/scan/models3d` scans filesystem on every load | Cache result in memory or DB; invalidate only when avatar directory changes |
| PERF-005 | P3 | Production bundle analysis not run | Run `npx vite build && npx vite-bundle-analyzer` to check prod bundle sizes |

---

## Verdict

**Initial render is excellent** (FCP 176ms, interactive in 185ms). The app *appears* fast.

**Backend load is the bottleneck.** The duplicate API call pattern means the server
processes 2-3× more queries than needed per page load. At 1.5-2.5s per call, user-visible
data (bond stats, sessions, relationship) takes 1.5-2.5s to appear after the shell renders.
This is the primary UX performance gap.

**Priority fix:** A simple `Map<string, Promise>` request deduplicator in the API layer
(`frontends/sakura/src/lib/api.ts`) would eliminate PERF-001 and PERF-002 immediately
without touching any component code.
