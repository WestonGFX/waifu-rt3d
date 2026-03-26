# Frontend & UI Conventions

## Stack

- React 19, Zustand, Framer Motion, Vite. Sakura (`frontends/sakura/`) is the only active frontend.
- TypeScript strict mode. Verify with `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` before reporting done.
- No `any` — use `unknown` with type narrowing instead.

## Stores

Four Zustand stores — use the existing one, do not create a fifth:
- `appStore.ts` — app state, overlay registration, active character
- `chatStore.ts` — message history, send flow, streaming state
- `viewerStore.ts` — VRM/Live2D dispatcher, postMessage bridge to viewer iframe
- `wizardStore.ts` — onboarding and setup wizard state

New overlays must be registered in the `Overlay` union type in `appStore.ts` and rendered in `App.tsx`.

## Styling

- Use CSS variables for ALL colors — `var(--color-accent)`, `var(--color-surface)`, etc. Never hardcode hex or rgb values in components.
- 18 built-in themes (9 light / 9 dark). Any hardcoded color will break at least 17 of them.
- Use inline styles, not Tailwind (this project does not use Tailwind).
- Icons: Lucide React only.

## Layout

- Right panel is collapsed by default — do not force it open.
- Center panel (chat + viewer) is the most important surface. Don't let new UI crowd it.

## Animations

- Use Framer Motion for enter/exit transitions. Do not use raw CSS keyframes for component-level animation.
- Check `display:none` vs `visibility:hidden` during transitions — `display:none` breaks Framer Motion exit animations.

## Components and Hooks

- Components go in `src/components/`. Reusable logic goes in `src/hooks/use*.ts`.
- Lazy-load large overlays and wizards with `React.lazy()` — see the pattern in `App.tsx`.
- After UI changes, manually verify: transitions, panel reflow, image paths, and settings modal rendering.
