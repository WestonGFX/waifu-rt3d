# Waifu RT3D Frontend V2

React 19 + Vite + Tailwind + Zustand preview frontend for Neon migration.

## Dev
```bash
cd /Users/chris/Code/waifu-rt3d/frontends/v2
npm install
npm run dev
```

The dev server runs on port `5174` and proxies `/api`, `/files`, `/viewer`, `/images`, and `/live2d` to `http://127.0.0.1:8080`.

## Build
```bash
npm run build
```

Build output is written to `dist/` and served by backend route `/v2`.

## Test
```bash
npm test
npm run e2e
```

### E2E modes
Mocked core-flow E2E (default):
```bash
npm run e2e
```

Live backend smoke E2E (requires backend running at `http://127.0.0.1:8080` and serving `/v2`):
```bash
npm run e2e:live
```

Optional custom backend URL:
```bash
E2E_LIVE_BACKEND=1 E2E_BASE_URL=http://127.0.0.1:8080 npx playwright test e2e/v2-live-backend.spec.ts
```

Hybrid gate preflight from repo root:
```bash
./tools/v2_hybrid_preflight.sh
```

## Architecture
1. `src/stores/chatStore.ts`: optimistic Zustand chat state with retry.
2. `src/components/MemoryGraph.tsx`: live memory graph UI fed by `/api/v2/memory/graph`.
3. `src/components/SettingsHud.tsx`: HUD controls for voice/creativity.
4. `src/components/VoiceVisualizer.tsx`: dual-source (mic + TTS) visualization.
5. `src/components/HoloCard.tsx`: card tilt and glow interaction.
