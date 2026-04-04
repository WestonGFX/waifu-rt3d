---
paths:
  - "frontends/sakura/**"
---

# Frontend & UI Rules

## Stack
- React 19, Zustand, Framer Motion, Vite. TypeScript strict mode.
- Verify: `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit`
- No `any` — use `unknown` with type narrowing.

## Stores (4 total — do NOT create a 5th)
- `appStore.ts` — app state, overlay registration, active character
- `chatStore.ts` — message history, send flow, streaming state
- `viewerStore.ts` — VRM/Live2D dispatcher, postMessage bridge
- `wizardStore.ts` — onboarding and setup wizard state

## Styling
- CSS variables for ALL colors: `var(--color-accent)`, `var(--color-surface)`, etc.
- 18 built-in themes (9 light / 9 dark). Hardcoded colors break 17 of them.
- Use inline styles, NOT Tailwind (this project doesn't use Tailwind).
- Icons: Lucide React only.

## Layout
- Right panel collapsed by default. Center panel (chat + viewer) is primary.
- New overlays: add to `Overlay` union type in `appStore.ts`, render in `App.tsx`.

## Animations
- Framer Motion for enter/exit transitions. Not raw CSS keyframes.
- `display:none` breaks Framer Motion exits — use `visibility:hidden` or conditional rendering.

## After UI Changes
Verify: transitions, panel reflow, image paths, settings modal rendering.
