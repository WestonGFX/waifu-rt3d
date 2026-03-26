# Execution Plan: Plan 002 — Character Cards, Phase 1

## Context

Executing Phase 1 of `docs/plans/002-character-cards.md`: "Enhance Gallery Panel with Import/Export."
Phase 0 (tracking setup) is already complete — ROADMAP.md, 001-psychology-engine.md, SOURCES.md all exist.

The character card service layer is ~90% built. Phase 1 adds the UI to use it.

## Progress Tracker

- **Plan**: 002 — Character Card Import/Export
- **Phase**: 1 of 6 — Enhance Gallery Panel
- **ROADMAP status**: 🔨 WIP

## What Phase 1 Adds (from the existing plan)

- **1a**: Import upload section — file picker + drag-and-drop zone
- **1b**: "My Characters" section — user-imported personas list with export/delete
- **1c**: Export buttons on ALL personas (curated gallery too)

## Files to Modify

| File | Change | Step |
|------|--------|------|
| `src/types/characterCard.ts` | Add `persona` field to `CardImportResult` | 1 |
| `src/services/characterCardService.ts` | Return `persona` in import results | 1 |
| `src/services/appDb.ts` | Add `deletePersona()`, `deleteLorebookEntriesForPersona()` | 1 |
| `src/context/CompanionContext.tsx` | Add `deletePersona` to context | 1 |
| `src/components/settings/CharacterGalleryPanel.tsx` | Import UI, My Characters, export buttons | 2-4 |

## Execution Steps

### Step 1: Service layer prerequisites
- Add `persona` field to `CardImportResult` type (so import returns the constructed persona)
- Add `persona` to return objects in `importCardFromPng()` and `importCardFromJson()`
- Add `deletePersona()` and `deleteLorebookEntriesForPersona()` to `appDb.ts`
- Wire `deletePersona` into `CompanionContext`
- **Verify**: `npx tsc --noEmit`

### Step 2: Phase 1a — Import upload section
- Add file input ref + import state + drag-and-drop handlers to `CharacterGalleryPanel.tsx`
- Add imports: `importCardFromPng`, `importCardFromJson`, `downloadBlob`, etc.
- Add drag-and-drop zone JSX above the gallery grid
- Reuse file input pattern from `EnvironmentUploader.tsx`
- **Verify**: `npx tsc --noEmit`

### Step 3: Phase 1b — "My Characters" section
- Filter `state.personas` for `id.startsWith('persona-card-')`
- Render cards with name, archetype, dere tags, import date
- Add Export PNG, Export JSON, Delete buttons per card
- Inline delete confirmation (not a dialog)
- **Verify**: `npx tsc --noEmit`

### Step 4: Phase 1c — Export on curated gallery cards
- Add download button to existing `CharacterCard` component
- Handler fetches card from `downloadUrl` and triggers download via `downloadBlob()`
- **Verify**: `npx tsc --noEmit`

### Step 5: Final verification
- `npx tsc --noEmit` — full type check
- `npx vitest run` — existing tests still pass
- Manual test: import a .json card, see it in "My Characters", export it back

## Key Reuse Points

- **File input pattern**: `EnvironmentUploader.tsx` (ref + sr-only input + click trigger)
- **UI primitives**: `SettingsPrimitives.tsx` (`SETTINGS_PANEL_SUBCARD`, `SettingsSectionHeader`, `Button`)
- **Service functions**: All import/export already built in `characterCardService.ts`
- **Context**: `useCompanion()` provides `savePersona`, `state.personas`, `createThread`
- **Notifications**: `toast` from `sonner`

## After Phase 1

Update `docs/plans/002-character-cards.md` to mark Phase 1 as complete. Update ROADMAP.md notes. Phase 2 (ImportPreviewDialog) is next.
