---
description: Standard workflow for adding a new feature to the frontend.
---

# Workflow: New Frontend Feature

Follow this process strictly to maintain architectural integrity.

## Phase 1: Preparation
1.  **Update `task.md`:** Add the new feature as a pending task.
2.  **Check `FRONTEND_DESIGN_SPEC.md`:** Does this feature align with the design system? If not, update the spec.

## Phase 2: Scaffolding
// turbo
1.  **Create Component:** Use the `frontend-wizard` skill to generate the component file.
2.  **Add to Store:** If the feature needs global state, update `useAppStore` in `src/store/index.ts`.

## Phase 3: Implementation
1.  **Logic:** Implement the core logic using React hooks (e.g., `useEffect`, custom hooks).
2.  **Styling:** Apply Tailwind utility classes consistent with "Neural Glass".
3.  **Integration:** Connect to `server.py` API if needed.

## Phase 4: Verification
1.  **Run Dev Server:** `npm run dev`.
2.  **Manual Test:** Interact with the feature in the browser.
3.  **Cross-Browser Check:** Verify layout on standard resolutions.
