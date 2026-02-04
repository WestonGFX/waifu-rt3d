# Changelog - Waifu-RT3D

## [v5.31.0] - Hybrid & Rin - 2026-02-02

### Added

- **Hybrid Architecture**: Unified backend serving both active frontends.
  - Neon Glass UI (Default): `frontends/neon`
  - Classic Dashboard (Legacy): `frontends/classic`
- **Character: Rin (Fox)**:
  - Replaced generic "Friendly Assistant".
  - Deep Tsundere personality profile installed.
  - Custom system prompt with "Fiery Racer" vibe.
- **Frontend Switching**: Added "Switch to Classic Dashboard" button in Neon System Settings.
- **Documentation**: Established `docs/` folder structure.

### Changed

- **3D Viewer Upgrade**:
  - Refactored `viewer.html` to support `three-vrm` v1.0.
  - Replaced usage of deprecated `VRM.from` with `VRMLoaderPlugin`.
  - **Fixed T-Pose**: Enforced "A-Pose" arm rotation on load.
  - Added "Body Idle" animation (breathing + sway) to replace static pose.
- **Neon UI Repairs**:
  - Fixed `ConfigUI` initialization timing (Buttons now work).
  - Fixed `VRM` loading issues.
  - Fixed Chat Input connection logic (`llmConnected` flag).

### Fixed

- **Database**: Patched schema to include `tts_pitch` and `tts_rate` columns.
- **Scripts**: Updated `tools/init_personas.py` to support new character schema.

## [v5.30.0] - Retro Modernization (Archived)

- Attempted modernization of Classic frontend.
- *Status*: Deemed unstable; pivot to Hybrid model.

## [v4.0.0] - Baseline

- Original working version (Classic).
