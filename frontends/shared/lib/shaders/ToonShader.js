/**
 * GLSL chunks for anime-style toon/cel-shading via onBeforeCompile injection.
 *
 * Quantizes the diffuse lighting into discrete bands (2-3 levels) for the
 * hard-edged shadow look characteristic of anime. Applied only to
 * MeshStandardMaterial meshes; MToon materials (which are already toon-shaded
 * by the VRM spec) are skipped.
 *
 * Usage:
 *   import { injectToonShading, removeToonShading } from './ToonShader.js';
 *   injectToonShading(vrmScene, { levels: 3, softness: 0.02, shadowBias: 0.3 });
 *
 * @module ToonShader
 */

/** Uniform declarations prepended to the fragment shader. */
const TOON_UNIFORM_PARS = /* glsl */`
uniform float uToonLevels;
uniform float uToonSoftness;
uniform float uToonShadowBias;
`;

/**
 * Fragment shader chunk that quantizes lighting into discrete bands.
 * Injected after `#include <lights_fragment_begin>` which computes
 * `reflectedLight.directDiffuse` and `reflectedLight.directSpecular`.
 */
const TOON_QUANTIZE_CHUNK = /* glsl */`
{
    // Quantize the direct diffuse into discrete toon bands
    float toonLum = dot(reflectedLight.directDiffuse, vec3(0.299, 0.587, 0.114));
    float quantized = floor(toonLum * uToonLevels + 0.5) / uToonLevels;
    // Smoothstep at band edges for slight anti-aliasing
    quantized = smoothstep(0.0, uToonSoftness + 0.001, quantized);
    // Apply shadow darkening
    float toonFactor = mix(uToonShadowBias, 1.0, quantized);
    reflectedLight.directDiffuse *= toonFactor / max(toonLum, 0.001);
    // Flatten specular for anime look (reduce but don't eliminate)
    reflectedLight.directSpecular *= 0.3;
}
`;

/** WeakMap storing original onBeforeCompile functions for restoration. */
const _originalCompilers = new WeakMap();

/** WeakMap storing injected toon uniforms for runtime updates. */
const _toonUniforms = new WeakMap();

/**
 * Inject toon shading into all eligible materials in a scene.
 * Skips MToonMaterial and non-mesh objects.
 *
 * @param {THREE.Object3D} sceneRoot - The VRM model scene
 * @param {Object} [opts] - Toon shader options
 * @param {number} [opts.levels=3] - Number of discrete light bands (2 or 3)
 * @param {number} [opts.softness=0.02] - Edge softness between bands
 * @param {number} [opts.shadowBias=0.3] - Darkening factor for shadow band (0=black, 1=no shadow)
 * @returns {number} Count of materials modified
 */
function injectToonShading(sceneRoot, opts = {}) {
    const levels = opts.levels ?? 3;
    const softness = opts.softness ?? 0.02;
    const shadowBias = opts.shadowBias ?? 0.3;
    let count = 0;

    sceneRoot.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        for (const mat of materials) {
            // Skip MToon (already toon-shaded) and non-standard materials
            if (mat.isMToonMaterial || mat.type === 'MToonMaterial' || mat.type === 'ShaderMaterial') continue;
            if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) continue;
            // Skip if already injected
            if (_originalCompilers.has(mat)) continue;

            // Save original compiler
            _originalCompilers.set(mat, mat.onBeforeCompile || null);

            // Create per-material uniforms
            const uniforms = {
                uToonLevels: { value: levels },
                uToonSoftness: { value: softness },
                uToonShadowBias: { value: shadowBias },
            };
            _toonUniforms.set(mat, uniforms);

            mat.onBeforeCompile = (shader) => {
                // Merge our uniforms into the shader
                Object.assign(shader.uniforms, uniforms);

                // Prepend uniform declarations
                shader.fragmentShader = TOON_UNIFORM_PARS + shader.fragmentShader;

                // Inject quantization after lights calculation
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <lights_fragment_end>',
                    TOON_QUANTIZE_CHUNK + '\n#include <lights_fragment_end>'
                );
            };
            mat.needsUpdate = true;
            count++;
        }
    });

    return count;
}

/**
 * Remove toon shading from all previously injected materials.
 *
 * @param {THREE.Object3D} sceneRoot - The VRM model scene
 * @returns {number} Count of materials restored
 */
function removeToonShading(sceneRoot) {
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
            _toonUniforms.delete(mat);
            count++;
        }
    });

    return count;
}

/**
 * Update toon shader parameters on all injected materials.
 *
 * @param {THREE.Object3D} sceneRoot - The VRM model scene
 * @param {Object} opts - Partial options to update
 */
function updateToonParams(sceneRoot, opts) {
    sceneRoot.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        for (const mat of materials) {
            const uniforms = _toonUniforms.get(mat);
            if (!uniforms) continue;
            if (opts.levels !== undefined) uniforms.uToonLevels.value = opts.levels;
            if (opts.softness !== undefined) uniforms.uToonSoftness.value = opts.softness;
            if (opts.shadowBias !== undefined) uniforms.uToonShadowBias.value = opts.shadowBias;
        }
    });
}

export { injectToonShading, removeToonShading, updateToonParams };
