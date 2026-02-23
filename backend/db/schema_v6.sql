PRAGMA journal_mode=WAL;

-- Schema v6: Separate 2D/3D Avatar Fields
-- Resolves semantic confusion between avatar icons and VRM models

-- Add new columns for separate 2D/3D assets
ALTER TABLE characters ADD COLUMN avatar_2d_url TEXT;
ALTER TABLE characters ADD COLUMN vrm_model_url TEXT;

-- Migrate existing data:
-- If avatar_url ends with .vrm, it's a 3D model → copy to vrm_model_url
UPDATE characters
SET vrm_model_url = avatar_url
WHERE avatar_url LIKE '%.vrm';

-- If avatar_url is a 2D image (not VRM), copy to avatar_2d_url
UPDATE characters
SET avatar_2d_url = avatar_url
WHERE avatar_url NOT LIKE '%.vrm' AND avatar_url IS NOT NULL AND avatar_url != '';

-- For characters still missing avatar_2d_url, use convention-based path
-- Names like "Fox (Rin)" → extract "rin"; plain names → use first word
UPDATE characters
SET avatar_2d_url = '/images/' ||
    LOWER(
        CASE
            WHEN INSTR(name, '(') > 0
            THEN SUBSTR(name, INSTR(name, '(') + 1, INSTR(name, ')') - INSTR(name, '(') - 1)
            ELSE SUBSTR(name, 1, INSTR(name || ' ', ' ') - 1)
        END
    ) || '_pixel_portrait.png'
WHERE avatar_2d_url IS NULL OR avatar_2d_url = '';

-- Note: We keep the old avatar_url column for backwards compatibility
-- It can be removed in schema_v7 after confirming all code uses new fields

-- Ensure schema version is updated
INSERT OR REPLACE INTO schema_version (version) VALUES (6);
