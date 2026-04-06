---
globs: frontends/sakura/src/test/**
---

# Frontend Testing Conventions (Vitest + React Testing Library)

Test files live in `frontends/sakura/src/test/`. Config is in `vite.config.ts` (test block). Environment: jsdom. Setup: `src/test/setup.ts` imports `@testing-library/jest-dom`.

## 7 Established Patterns

Follow these patterns from the existing 12 test files. Do NOT invent new patterns.

### Pattern 1: Zustand Store-Direct Testing (fastest)
Test store logic without rendering React components:
```typescript
const store = useAppStore.getState();
store.someAction();
expect(useAppStore.getState().someValue).toBe(expected);
```
Used in: `appStore.layoutMode`, `appStore.settingsTier`, `wizardStore`

### Pattern 2: Store + API Mock
Mock the API module at the top of the file:
```typescript
vi.mock('../lib/api', () => ({ api: { loadConfig: vi.fn(), saveConfig: vi.fn() } }));
// Then per test:
vi.mocked(api.loadConfig).mockResolvedValue({ ... });
```
Used in: `appStore.configLoaded`, `chatStore.autoTitle`, `SettingsView.exportImport`

### Pattern 3: SSE Stream Simulation
For testing streaming chat responses:
```typescript
const stream = new ReadableStream({ start(c) { c.enqueue(encoder.encode('data: {...}\n\n')); c.close(); } });
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
```
Used in: `chatStore.autoTitle`

### Pattern 4: Framer Motion Stub (ALWAYS use for component tests)
Every component test MUST mock framer-motion:
```typescript
vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...p }: any) => <div {...p}>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));
```
Used in: ALL component test files

### Pattern 5: Fake Timers with waitFor Ordering
CRITICAL: Activate fake timers AFTER initial render and waitFor completes:
```typescript
const { ... } = render(<Component />);
await waitFor(() => expect(...).toBeTruthy()); // Real timers
vi.useFakeTimers(); // NOW switch to fake
act(() => { vi.advanceTimersByTime(1000); });
```
Reason: `waitFor` uses real `setTimeout` internally — fake timers break it.
Used in: `SessionDrawer.swipe`, `useFeatureDiscovery`

### Pattern 6: DOM Touch Event Testing
For gesture/swipe interactions:
```typescript
fireEvent.touchStart(element, { touches: [{ clientX: 300, clientY: 0 }] });
fireEvent.touchMove(element, { touches: [{ clientX: 100, clientY: 0 }] });
fireEvent.touchEnd(element);
```
Used in: `SessionDrawer.swipe`

### Pattern 7: Browser Blob/FileReader Stubbing
For file import/export:
```typescript
vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:...'), revokeObjectURL: vi.fn() });
// For FileReader: create a class that defers onload via Promise.resolve().then()
```
Used in: `SettingsView.exportImport`

## Naming Conventions

- File: `featureName.context.test.ts(x)` (e.g., `appStore.layoutMode.test.ts`)
- Describe blocks: `describe('FeatureName', () => { ... })`
- Test names: descriptive, action-focused: `it('cycles through layout modes on toggle', ...)`

## Priority Test Targets (highest coverage gaps)

1. `chatStore.ts` — sendMessage SSE flow, abort, loadMessages (only autoTitle tested)
2. `viewerStore.ts` — zero tests, all of VRM/Live2D bridge untested
3. `useKeyboardShortcuts` — dispatches all 30+ shortcuts, zero tests
4. `useVoiceMode` — voice recording state machine, zero tests
5. `ChatThread.tsx` — 1,382 lines, zero tests, core product surface
6. `SettingsView.tsx` — 4,857 lines, only export/import tested

## Running Tests

```bash
cd frontends/sakura && npx vitest run          # All tests
cd frontends/sakura && npx vitest run src/test/myTest.test.ts  # Single file
cd frontends/sakura && npx vitest --watch       # Watch mode
```
