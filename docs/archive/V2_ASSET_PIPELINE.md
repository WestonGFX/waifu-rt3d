# V2 Asset Pipeline (Prompt-Driven)

## Purpose
Define a repeatable prompt-to-asset workflow for Neon v2 so generated visuals are consistent, testable, and easy to wire into the UI.

## Asset Classes
1. Character portrait: `backend/storage/images/<character>_pixel_portrait.png`
2. Character background: `backend/storage/images/<character>_<scene>.png`
3. UI reference board: `docs/assets/v2/<feature>_moodboard.png`
4. Icon variant: `backend/storage/images/<character>_icon_<variant>.png`

## Naming Rules
1. Lowercase only.
2. Use `_` separators.
3. Character prefix is required.
4. Keep file extension to `.png` unless transparency is not needed.

## Prompt Metadata (store next to output)
For each generated image, track:
1. Source prompt id (`p1`..`p10`)
2. Model/tool name
3. Generation date
4. Seed (if available)
5. Final path

Suggested manifest file:
`docs/assets/v2/manifest.json`

## Integration Targets
1. Character roster/HoloCard image: `avatar_url` in `/api/characters`.
2. Viewer background: config key `bg_image` from `/api/config`.
3. Settings HUD previews: local asset list from `/api/scan/images`.

## Quality Gate
Before committing generated assets:
1. Confirm no text/watermark artifacts.
2. Verify portrait crop readability at 96x96 and 160x160.
3. Verify background does not reduce chat contrast.
4. Keep file size under 1.2 MB unless explicitly required.

## Fallback Policy
If generation quality fails after 3 attempts:
1. Keep existing asset.
2. Log rejected variants in `docs/assets/v2/rejected/`.
3. Continue implementation without blocking release.
