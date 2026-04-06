---
name: new-component
description: >
  Scaffold a new React component for the Sakura frontend following project
  conventions: Framer Motion, Lucide icons, CSS variables, overlay registration.
user_invocable: true
---

# New Component Scaffolding

Creates a new React component following Sakura frontend conventions.

## Usage

`/new-component <ComponentName> <type>`

Types:
- `overlay` — Full-screen overlay panel (registered in appStore, rendered in App.tsx)
- `inline` — Inline component (used within views/other components)
- `toolbar` — Chat toolbar button/widget

Examples:
- `/new-component DesireHeatmap overlay`
- `/new-component EmotionBadge inline`
- `/new-component MoodIndicator toolbar`

## Step 1: Read Conventions

Read these files to understand current patterns:
1. `frontends/sakura/src/App.tsx` — overlay rendering, lazy imports
2. `frontends/sakura/src/stores/appStore.ts` — Overlay union type
3. An existing component of the same type for pattern reference

## Step 2: Create Component File

**Location:** `frontends/sakura/src/components/<ComponentName>.tsx`

### Overlay Template:
```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

/**
 * <ComponentName> — <brief description>.
 *
 * Opened via: <keyboard shortcut or button>.
 * Closed via: Escape key or X button.
 */
export default function ComponentName() {
  const closeOverlay = useAppStore((s) => s.closeOverlay);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={(e) => e.target === e.currentTarget && closeOverlay()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        style={{
          background: 'var(--color-surface)',
          borderRadius: 12,
          padding: 24,
          width: '80%',
          maxWidth: 800,
          maxHeight: '80vh',
          overflow: 'auto',
          color: 'var(--color-text)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Component Title</h2>
          <button onClick={closeOverlay} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            <X size={20} />
          </button>
        </div>
        {/* Content here */}
      </motion.div>
    </motion.div>
  );
}
```

### Inline Template:
```tsx
/**
 * <ComponentName> — <brief description>.
 */
export default function ComponentName({ /* props */ }: { /* types */ }) {
  return (
    <div style={{ color: 'var(--color-text)' }}>
      {/* Content */}
    </div>
  );
}
```

## Step 3: Wire Into App (overlay type only)

### 3a. Add to Overlay union type in appStore.ts:
Find the `Overlay` type union and add the new name.

### 3b. Add lazy import in App.tsx:
```tsx
const ComponentName = lazy(() => import('./components/ComponentName'));
```

### 3c. Add render case in App.tsx:
Find the overlay switch/conditional block and add:
```tsx
{overlay === 'componentName' && (
  <Suspense fallback={null}>
    <ComponentName />
  </Suspense>
)}
```

### 3d. (Optional) Add keyboard shortcut:
In the keyboard shortcuts handler (useKeyboardShortcuts hook or App.tsx), add:
```tsx
case 'Alt+Shift+X': openOverlay('componentName'); break;
```

## Conventions (MUST follow)

- **CSS variables** for ALL colors — `var(--color-*)`, never hardcoded hex/rgb
- **Framer Motion** for all enter/exit animations — never raw CSS keyframes
- **Lucide React** for icons — never import from other icon libraries
- **Inline styles only** — no Tailwind classes (project convention)
- **AnimatePresence** wraps conditionally rendered animated elements
- Use `display:none` sparingly — it breaks Framer Motion exit animations. Prefer conditional rendering.
- Overlay backdrop: always `onClick` to close on outside click
- Escape key: must close the overlay (handled by global keyboard shortcuts)

## Step 4: Verify

1. `cd frontends/sakura && npx tsc --project tsconfig.app.json --noEmit` — type check
2. Visually verify: component renders, theme colors apply, Escape closes it
3. Check 1 light + 1 dark theme for color consistency
