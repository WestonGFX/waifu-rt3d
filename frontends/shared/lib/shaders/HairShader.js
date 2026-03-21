/**
 * Kajiya-Kay anisotropic specular shader for anime-style hair.
 *
 * Injects a two-highlight anisotropic specular model into MeshStandardMaterial
 * meshes whose names contain "hair" (case-insensitive). The Kajiya-Kay model
 * replaces the standard isotropic Blinn-Phong specular with a highlight that
 * follows the hair strand direction, producing the characteristic "ring of
 * light" seen in anime hair renders.
 *
 * Two specular lobes are added:
 *   - Primary: tight white highlight (high specPower)
 *   - Secondary: broad colored highlight shifted along the tangent (low
 *     specPower, lavender tint by default)
 *
 * The tangent direction is approximated in the fragment shader from the
 * cross product of the interpolated normal and a world-space up vector
 * (vec3(0,1,0)), which is a reasonable approximation for typical anime hair
 * geometry where strands run roughly top-to-bottom.
 *
 * Usage:
 *   import { injectHairShading, removeHairShading, updateHairParams } from './HairShader.js';
 *   injectHairShading(vrmScene, {
 *     shiftPrimary: 0.0,
 *     shiftSecondary: 0.3,
 *     specPower: 80,
 *     specPowerSecondary: 20,
 *     specColor: [1.0, 1.0, 1.0],
 *     specColorSecondary: [0.8, 0.6, 1.0],
 *   });
 *
 * @module HairShader
 */

/** Uniform declarations prepended to the fragment shader. */
const HAIR_UNIFORM_PARS = /* glsl */`
uniform float uHairEnabled;
uniform float uHairShiftPrimary;
uniform float uHairShiftSecondary;
uniform float uHairSpecPower;
uniform float uHairSpecPowerSecondary;
uniform vec3  uHairSpecColor;
uniform vec3  uHairSpecColorSecondary;
`;

/**
 * Fragment shader chunk implementing Kajiya-Kay anisotropic specular.
 *
 * The standard MeshStandardMaterial `lights_fragment_begin` block loops over
 * all direct lights and accumulates into `reflectedLight.directSpecular`.
 * This chunk runs after that loop, zeroing out the standard isotropic
 * specular and replacing it with two Kajiya-Kay lobes computed against the
 * first directional light (index 0).
 *
 * The tangent T is approximated as normalize(cross(normal, up)).  Where the
 * normal is nearly parallel to up (crown of the head), a fallback right-
 * vector (1,0,0) is used to avoid a degenerate cross product.
 *
 * The Kajiya-Kay specular term for a single lobe is:
 *   spec = pow(sqrt(1.0 - dot(T_shifted, H)^2), exponent)
 *
 * where T_shifted = normalize(T * cos(shift) + B * sin(shift)) moves the
 * highlight band up or down the strand for the characteristic dual-ring look.
 *
 * Injected after `#include <lights_fragment_begin>`.
 */
const HAIR_KAJIYA_CHUNK = /* glsl */`
#if NUM_DIR_LIGHTS > 0
if (uHairEnabled > 0.5) {
    // --- Reconstruct tangent from normal + world up ---
    vec3 hairNormal = normalize(vNormal);
    vec3 worldUp    = vec3(0.0, 1.0, 0.0);

    // Fallback to right-vector when normal is nearly parallel to up
    float upDot = abs(dot(hairNormal, worldUp));
    vec3  ref   = (upDot > 0.9) ? vec3(1.0, 0.0, 0.0) : worldUp;

    // Tangent and bitangent (strand-direction basis)
    vec3 T = normalize(cross(hairNormal, ref));
    vec3 B = normalize(cross(hairNormal, T));

    // --- Light direction from first directional light ---
    DirectionalLight dirLight0 = directionalLights[0];
    vec3  L = normalize(dirLight0.direction);
    vec3  V = normalize(vViewPosition);   // view direction (MeshStandard provides this)
    vec3  H = normalize(L + V);

    // Clear the isotropic standard specular so we don't double-count
    reflectedLight.directSpecular = vec3(0.0);

    // --- Primary highlight (tight, white) ---
    // Shift the tangent along the bitangent
    vec3  Tp     = normalize(T + uHairShiftPrimary * B);
    float TdotH1 = dot(Tp, H);
    float sinTH1 = sqrt(max(0.0, 1.0 - TdotH1 * TdotH1));
    float spec1  = pow(sinTH1, uHairSpecPower);

    // --- Secondary highlight (broad, tinted) ---
    vec3  Ts     = normalize(T + uHairShiftSecondary * B);
    float TdotH2 = dot(Ts, H);
    float sinTH2 = sqrt(max(0.0, 1.0 - TdotH2 * TdotH2));
    float spec2  = pow(sinTH2, uHairSpecPowerSecondary);

    // Light color already factored in; combine the two lobes
    vec3 hairSpecular =
        spec1 * uHairSpecColor * dirLight0.color +
        spec2 * uHairSpecColorSecondary * dirLight0.color;

    reflectedLight.directSpecular += hairSpecular;
}
#endif
`;

/** WeakMap storing original onBeforeCompile functions for restoration. */
const _originalCompilers = new WeakMap();

/** WeakMap storing injected hair uniforms for runtime updates. */
const _hairUniforms = new WeakMap();

/**
 * Returns true when the mesh name contains "hair" (case-insensitive).
 *
 * @param {THREE.Mesh} mesh - The mesh to test
 * @returns {boolean} Whether the mesh is a hair mesh
 */
function _isHairMesh(mesh) {
    return /hair/i.test(mesh.name);
}

/**
 * Inject Kajiya-Kay anisotropic hair shading into eligible hair materials.
 *
 * Only meshes whose name contains "hair" (case-insensitive) are affected.
 * MToonMaterial and ShaderMaterial instances are skipped, as are materials
 * that have already been injected.
 *
 * @param {THREE.Object3D} sceneRoot - The VRM model scene (or any Object3D)
 * @param {Object} [opts] - Hair shader options
 * @param {number} [opts.shiftPrimary=0.0] - Tangent shift for primary highlight (moves band up/down)
 * @param {number} [opts.shiftSecondary=0.3] - Tangent shift for secondary highlight
 * @param {number} [opts.specPower=80] - Exponent for primary specular lobe (higher = tighter)
 * @param {number} [opts.specPowerSecondary=20] - Exponent for secondary specular lobe (broader)
 * @param {number[]} [opts.specColor=[1,1,1]] - RGB color of primary highlight
 * @param {number[]} [opts.specColorSecondary=[0.8,0.6,1.0]] - RGB color of secondary highlight
 * @param {boolean} [opts.enabled=true] - Whether the hair shader is active
 * @returns {number} Count of materials modified
 *
 * @example
 *   const count = injectHairShading(vrm.scene, { shiftSecondary: 0.25, specPower: 100 });
 *   console.log(`Injected into ${count} hair materials`);
 */
function injectHairShading(sceneRoot, opts = {}) {
    const shiftPrimary        = opts.shiftPrimary        ?? 0.0;
    const shiftSecondary      = opts.shiftSecondary      ?? 0.3;
    const specPower           = opts.specPower           ?? 80;
    const specPowerSecondary  = opts.specPowerSecondary  ?? 20;
    const specColor           = opts.specColor           ?? [1.0, 1.0, 1.0];
    const specColorSecondary  = opts.specColorSecondary  ?? [0.8, 0.6, 1.0];
    const enabled             = opts.enabled             ?? true;

    let count = 0;

    sceneRoot.traverse((child) => {
        if (!child.isMesh) return;
        if (!_isHairMesh(child)) return;

        const materials = Array.isArray(child.material) ? child.material : [child.material];

        for (const mat of materials) {
            // Skip MToon (already specialised), ShaderMaterial (no injection slot)
            if (mat.isMToonMaterial || mat.type === 'MToonMaterial' || mat.type === 'ShaderMaterial') continue;
            if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) continue;
            // Skip if already injected
            if (_originalCompilers.has(mat)) continue;

            // Persist original compiler for removal
            _originalCompilers.set(mat, mat.onBeforeCompile || null);

            // Per-material uniform objects (shared by reference with the shader)
            const uniforms = {
                uHairEnabled:            { value: enabled ? 1.0 : 0.0 },
                uHairShiftPrimary:       { value: shiftPrimary },
                uHairShiftSecondary:     { value: shiftSecondary },
                uHairSpecPower:          { value: specPower },
                uHairSpecPowerSecondary: { value: specPowerSecondary },
                uHairSpecColor:          { value: { x: specColor[0], y: specColor[1], z: specColor[2] } },
                uHairSpecColorSecondary: { value: { x: specColorSecondary[0], y: specColorSecondary[1], z: specColorSecondary[2] } },
            };
            _hairUniforms.set(mat, uniforms);

            mat.onBeforeCompile = (shader) => {
                // Merge our uniforms into the shader program
                Object.assign(shader.uniforms, uniforms);

                // Prepend uniform declarations to the fragment source
                shader.fragmentShader = HAIR_UNIFORM_PARS + shader.fragmentShader;

                // Inject Kajiya-Kay chunk immediately after the lights loop
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <lights_fragment_end>',
                    HAIR_KAJIYA_CHUNK + '\n#include <lights_fragment_end>'
                );
            };

            mat.needsUpdate = true;
            count++;
        }
    });

    return count;
}

/**
 * Remove hair shading from all previously injected materials under sceneRoot.
 *
 * Restores the original `onBeforeCompile` function (or a no-op if there was
 * none) and forces a shader recompile via `needsUpdate`.
 *
 * @param {THREE.Object3D} sceneRoot - The VRM model scene
 * @returns {number} Count of materials restored
 *
 * @example
 *   const restored = removeHairShading(vrm.scene);
 *   console.log(`Removed from ${restored} materials`);
 */
function removeHairShading(sceneRoot) {
    let count = 0;

    sceneRoot.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        for (const mat of materials) {
            if (!_originalCompilers.has(mat)) continue;

            const original = _originalCompilers.get(mat);
            mat.onBeforeCompile = original || (() => {});
            mat.needsUpdate = true;

            _originalCompilers.delete(mat);
            _hairUniforms.delete(mat);
            count++;
        }
    });

    return count;
}

/**
 * Update hair shader parameters on all injected materials under sceneRoot.
 *
 * Only the keys present in `params` are updated; unspecified keys retain
 * their current values. Uniform changes take effect on the next render frame
 * without triggering a shader recompile.
 *
 * @param {THREE.Object3D} sceneRoot - The VRM model scene
 * @param {Object} params - Partial parameters to update
 * @param {boolean}  [params.enabled]             - Toggle the hair shader on/off
 * @param {number}   [params.shiftPrimary]         - Tangent shift for primary highlight
 * @param {number}   [params.shiftSecondary]       - Tangent shift for secondary highlight
 * @param {number}   [params.specPower]            - Primary specular exponent
 * @param {number}   [params.specPowerSecondary]   - Secondary specular exponent
 * @param {number[]} [params.specColor]            - Primary highlight RGB [r, g, b]
 * @param {number[]} [params.specColorSecondary]   - Secondary highlight RGB [r, g, b]
 *
 * @example
 *   // Tighten the primary highlight at runtime
 *   updateHairParams(vrm.scene, { specPower: 120, shiftSecondary: 0.4 });
 */
function updateHairParams(sceneRoot, params) {
    sceneRoot.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        for (const mat of materials) {
            const uniforms = _hairUniforms.get(mat);
            if (!uniforms) continue;

            if (params.enabled !== undefined) {
                uniforms.uHairEnabled.value = params.enabled ? 1.0 : 0.0;
            }
            if (params.shiftPrimary !== undefined) {
                uniforms.uHairShiftPrimary.value = params.shiftPrimary;
            }
            if (params.shiftSecondary !== undefined) {
                uniforms.uHairShiftSecondary.value = params.shiftSecondary;
            }
            if (params.specPower !== undefined) {
                uniforms.uHairSpecPower.value = params.specPower;
            }
            if (params.specPowerSecondary !== undefined) {
                uniforms.uHairSpecPowerSecondary.value = params.specPowerSecondary;
            }
            if (params.specColor !== undefined) {
                uniforms.uHairSpecColor.value.x = params.specColor[0];
                uniforms.uHairSpecColor.value.y = params.specColor[1];
                uniforms.uHairSpecColor.value.z = params.specColor[2];
            }
            if (params.specColorSecondary !== undefined) {
                uniforms.uHairSpecColorSecondary.value.x = params.specColorSecondary[0];
                uniforms.uHairSpecColorSecondary.value.y = params.specColorSecondary[1];
                uniforms.uHairSpecColorSecondary.value.z = params.specColorSecondary[2];
            }
        }
    });
}

export { injectHairShading, removeHairShading, updateHairParams };
