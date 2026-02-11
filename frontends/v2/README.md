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
```

## Architecture
1. `src/stores/chatStore.ts`: optimistic Zustand chat state with retry.
2. `src/components/MemoryGraph.tsx`: live memory graph UI fed by `/api/v2/memory/graph`.
3. `src/components/SettingsHud.tsx`: HUD controls for voice/creativity.
4. `src/components/VoiceVisualizer.tsx`: dual-source (mic + TTS) visualization.
5. `src/components/HoloCard.tsx`: card tilt and glow interaction.
