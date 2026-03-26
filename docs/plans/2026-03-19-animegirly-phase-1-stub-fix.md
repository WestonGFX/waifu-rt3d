# AnimeGirly — Phase 1: Stub Elimination & Foundation Fix

## Context

Codebase audit found 5 non-functional stub implementations plus CSS variable issues. The most critical is TTS/STT providers not registered in the frontend registry — backend implementations exist but the frontend only lists `webSpeech`.

## Tasks

### Task 1: Register ALL TTS/STT providers in frontend registry
**File**: `src/providers/registry.ts`
- Import and register HelperTTSProvider for edge-tts, elevenlabs, kokoro, piper
- Import and register HelperWhisperSTTProvider
- Verify `src/providers/stt/helperWhisper.ts` implements STTProvider interface

### Task 2: Wire backupService.ts into BackupRestorePanel.tsx
**Files**: `src/services/backupService.ts`, `src/components/settings/BackupRestorePanel.tsx`
- Fix import path so real service loads instead of falling back to stubs
- Remove stub fallbacks once real service confirmed working

### Task 3: Wire character card import
**File**: `src/components/settings/CharacterGalleryPanel.tsx`
- Replace console.info stub with real logic using characterCardService.ts parser
- Create PersonaProfile from parsed card, call savePersona() from CompanionContext
- Show toast on success/failure

### Task 4: Fix undefined CSS variables (dark borders)
**Files**: `src/styles/global.css`, affected components
- Define `--control-border-soft` and `--card-bg-soft` in theme block
- Or replace with existing Tailwind classes

### Task 5: Fix voice clone stub (returns silence)
**File**: `helper/app/services/voice_clone_service.py`
- Return error response instead of silent WAV
- Message: "Voice cloning requires Fish Speech, F5-TTS, or CosyVoice. Install one via the Model Manager."

### Task 6: Improve character gallery data
**File**: `src/services/characterGalleryService.ts`
- Replace placeholder downloadUrl values with real paths
- Add more curated entries (8 → 12)
- Add source tag for future CDN support

## Parallelism
- Tasks 1, 2, 4, 5 can run in parallel (no file conflicts)
- Task 3 depends on reading characterCardService.ts first
- Task 6 is independent

## Verification
```bash
npx tsc --noEmit
npx vitest run
```
