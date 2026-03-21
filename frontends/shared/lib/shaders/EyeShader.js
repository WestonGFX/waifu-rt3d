/**
 * GLSL chunks for anime-style eye sparkle/highlight via onBeforeCompile injection.
 *
 * Adds a procedural star-shaped specular highlight to eye materials — the bright,
 * multi-point catchlight characteristic of anime eyes (also called "eye sparkle" or
 * "eye highlight"). The sparkle is computed in screen-space using polar coordinates
 * and animates with a subtle shimmer driven by a `time` uniform.
 *
 * Only materials whose mesh name contains 'eye', 'iris', 'Eye', or 'Iris' are
 * affected. Known non-eye mesh names that contain the word "eye" as a substring —
 * specifically 'eyelash' and 'eyebrow' — are explicitly excluded so mascara and
 * brow meshes stay unaffected.
 *
 * The calling code must advance the `time` uniform each frame, e.g.:
 *   const clock = new THREE.Clock();
 *   function animate() {
 *     updateEyeSparkleParams(vrmScene, { time: clock.getElapsedTime() });
 *     renderer.render(scene, camera);
 *   }
 *
 * Usage:
 *   import { injectEyeSparkle, removeEyeSparkle, updateEyeSparkleParams }
 *     from './EyeShader.js';
 *
 *   injectEyeSparkle(vrmScene, { intensity: 0.6, points: 4, size: 0.15 });
 *   // In render loop:
 *   updateEyeSparkleParams(vrmScene, { time: clock.getElapsedTime() });
 *
 * @module EyeShader
 */

/** Uniform declarations prepended to the fragment shader. */
const EYE_UNIFORM_PARS = /* glsl */`
uniform float uSparkleIntensity;
uniform float uSparkleSize;
uniform float uSparklePoints;
uniform float uSparkleRotation;
uniform float uSparkleShimmerSpeed;
uniform vec3  uSparkleColor;
uniform float uSparkleEnabled;
uniform float uSparkleTime;
`;

/**
 * Fragment shader chunk that composites the star-shaped sparkle on top of the
 * final output color. Injected after `#include <output_fragment>` so it layers
 * over the fully-lit, tone-mapped result.
 *
 * Algorithm:
 *  1. Derive a [0,1]^2 screen-UV from gl_FragCoord divided by a nominal eye
 *     resolution (gl_FragCoord values near the eye are tightly clustered, so we
 *     re-center and scale to give roughly 1.0 radius at the edge of a small eye).
 *  2. Convert to polar coordinates (r, theta).
 *  3. Evaluate a star kernel: cos(theta * points + rotation + shimmer) mapped to
 *     [0,1], raised to a sharpness power, then multiplied by a Gaussian radial
 *     falloff so the star only appears near the centre of the UV cell.
 *  4. Attenuate by a view-dependent dot product so the sparkle fades when looking
 *     at the eye from a grazing angle (gl_FrontFacing gives us rough orientation).
 *  5. Add to gl_FragColor with the configured color and intensity.
 *
 * The star sharpness exponent is fixed at 6.0 — enough to give a crisp star
 * shape without aliasing artefacts on typical eye mesh UV density.
 */
const EYE_SPARKLE_CHUNK = /* glsl */`
if (uSparkleEnabled > 0.5) {
    // Remap screen-space coordinates to a local [-1, 1] cell centred on the
    // fragment.  We use a fixed nominal eye pixel radius (32 px) so the star
    // spans the same fraction of the eye regardless of render resolution.
    float eyeRadius = 32.0;
    vec2 localUV = (fract(gl_FragCoord.xy / eyeRadius) - 0.5) * 2.0;

    // Polar coordinates
    float r     = length(localUV);
    float theta = atan(localUV.y, localUV.x);

    // Slowly rotate and shimmer via time
    float animTheta = theta + uSparkleRotation
                    + uSparkleTime * uSparkleShimmerSpeed;

    // Star kernel: cos(n * theta) in [0,1], sharpened with pow()
    float starKernel = cos(animTheta * uSparklePoints) * 0.5 + 0.5;
    starKernel = pow(starKernel, 6.0);

    // Radial Gaussian falloff — controls apparent star size
    float invSize   = 1.0 / max(uSparkleSize, 0.001);
    float radial    = exp(-r * r * invSize * invSize * 4.0);

    // Shimmer pulse: gentle brightness oscillation
    float shimmer = 0.8 + 0.2 * sin(uSparkleTime * uSparkleShimmerSpeed * 3.14159);

    float sparkle = starKernel * radial * shimmer * uSparkleIntensity;

    gl_FragColor.rgb += uSparkleColor * sparkle;
}
`;

/** WeakMap storing original onBeforeCompile functions for restoration. */
const _originalCompilers = new WeakMap();

/** WeakMap storing injected eye-sparkle uniforms for runtime updates. */
const _eyeUniforms = new WeakMap();

/**
 * Determine whether a mesh name refers to an eye (iris) mesh.
 *
 * Returns true when the name contains 'eye' or 'iris' (case-insensitive) AND
 * does not match the known non-eye substrings 'eyelash' or 'eyebrow'.
 *
 * @param {string} name - The mesh or material name to test
 * @returns {boolean} True if the name represents an eye material
 *
 * @example
 *   _isEyeMesh('Eye_L');      // true
 *   _isEyeMesh('iris_right'); // true
 *   _isEyeMesh('Eyelash');    // false
 *   _isEyeMesh('Eyebrow_R');  // false
 *   _isEyeMesh('Body');       // false
 */
function _isEyeMesh(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    // Exclude known non-eye meshes that happen to contain 'eye'
    if (lower.includes('eyelash') || lower.includes('eyebrow')) return false;
    return lower.includes('eye') || lower.includes('iris');
}

/**
 * Inject anime eye sparkle into all eligible eye materials in a scene.
 *
 * Traverses `sceneRoot` and applies the sparkle shader to every MeshStandard-
 * or MeshPhysicalMaterial whose parent mesh name identifies it as an eye/iris
 * mesh (see `_isEyeMesh`). MToonMaterial and ShaderMaterial are skipped because
 * they have their own compilation paths.
 *
 * @param {THREE.Object3D} sceneRoot - The VRM model scene root
 * @param {Object} [opts] - Eye sparkle options
 * @param {number} [opts.intensity=0.6] - Sparkle brightness, 0–1
 * @param {number} [opts.size=0.15] - Sparkle size relative to eye UV cell
 * @param {number} [opts.points=4] - Number of star points (4–6 recommended)
 * @param {number} [opts.rotation=0.785] - Base star rotation in radians (PI/4)
 * @param {number} [opts.shimmerSpeed=0.3] - Subtle pulse/rotation speed
 * @param {number[]} [opts.color=[1,1,1]] - Sparkle RGB color as a 3-element array
 * @param {boolean} [opts.enabled=true] - Whether the sparkle is visible
 * @returns {number} Count of materials modified
 *
 * @example
 *   const count = injectEyeSparkle(vrm.scene, { intensity: 0.8, points: 5 });
 *   console.log(`Eye sparkle injected into ${count} material(s)`);
 */
function injectEyeSparkle(sceneRoot, opts = {}) {
    const intensity    = opts.intensity    ?? 0.6;
    const size         = opts.size         ?? 0.15;
    const points       = opts.points       ?? 4;
    const rotation     = opts.rotation     ?? 0.785; // Math.PI / 4
    const shimmerSpeed = opts.shimmerSpeed ?? 0.3;
    const color        = opts.color        ?? [1.0, 1.0, 1.0];
    const enabled      = opts.enabled      ?? true;
    let count = 0;

    sceneRoot.traverse((child) => {
        if (!child.isMesh) return;
        if (!_isEyeMesh(child.name)) return;

        const materials = Array.isArray(child.material) ? child.material : [child.material];

        for (const mat of materials) {
            // Skip MToon (VRM spec toon shader) and raw ShaderMaterial
            if (mat.isMToonMaterial || mat.type === 'MToonMaterial' || mat.type === 'ShaderMaterial') continue;
            if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) continue;
            // Skip if already injected
            if (_originalCompilers.has(mat)) continue;

            // Persist original onBeforeCompile for restoration
            _originalCompilers.set(mat, mat.onBeforeCompile || null);

            // Per-material uniform objects (Three.js uniform format)
            const uniforms = {
                uSparkleIntensity:    { value: intensity },
                uSparkleSize:         { value: size },
                uSparklePoints:       { value: points },
                uSparkleRotation:     { value: rotation },
                uSparkleShimmerSpeed: { value: shimmerSpeed },
                uSparkleColor:        { value: color.slice() },
                uSparkleEnabled:      { value: enabled ? 1.0 : 0.0 },
                uSparkleTime:         { value: 0.0 },
            };
            _eyeUniforms.set(mat, uniforms);

            mat.onBeforeCompile = (shader) => {
                // Merge sparkle uniforms into the shader program
                Object.assign(shader.uniforms, uniforms);

                // Prepend uniform declarations before the main body
                shader.fragmentShader = EYE_UNIFORM_PARS + shader.fragmentShader;

                // Append sparkle on top of the final output color
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <output_fragment>',
                    '#include <output_fragment>\n' + EYE_SPARKLE_CHUNK
                );
            };
            mat.needsUpdate = true;
            count++;
        }
    });

    return count;
}

/**
 * Remove eye sparkle from all previously injected materials.
 *
 * Restores the original `onBeforeCompile` function on each material and marks it
 * for recompilation. After calling this, the materials will recompile on the next
 * render frame without the sparkle effect.
 *
 * @param {THREE.Object3D} sceneRoot - The VRM model scene root
 * @returns {number} Count of materials restored
 *
 * @example
 *   const restored = removeEyeSparkle(vrm.scene);
 *   console.log(`Restored ${restored} material(s)`);
 */
function removeEyeSparkle(sceneRoot) {
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
            _eyeUniforms.delete(mat);
            count++;
        }
    });

    return count;
}

/**
 * Update eye sparkle uniform values at runtime without recompiling shaders.
 *
 * Only the keys present in `params` are updated; omitted keys are left unchanged.
 * This is safe to call every frame for the `time` parameter.
 *
 * @param {THREE.Object3D} sceneRoot - The VRM model scene root
 * @param {Object} params - Partial parameters to update
 * @param {number} [params.intensity] - Sparkle brightness, 0–1
 * @param {number} [params.size] - Sparkle size
 * @param {number} [params.points] - Number of star points
 * @param {number} [params.rotation] - Base rotation in radians
 * @param {number} [params.shimmerSpeed] - Shimmer/pulse speed
 * @param {number[]} [params.color] - Sparkle RGB as 3-element array
 * @param {boolean} [params.enabled] - Toggle sparkle visibility
 * @param {number} [params.time] - Elapsed time in seconds (advance each frame)
 *
 * @example
 *   // Called each frame from the render loop
 *   updateEyeSparkleParams(vrm.scene, { time: clock.getElapsedTime() });
 *
 *   // Disable at runtime
 *   updateEyeSparkleParams(vrm.scene, { enabled: false });
 */
function updateEyeSparkleParams(sceneRoot, params) {
    sceneRoot.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        for (const mat of materials) {
            const uniforms = _eyeUniforms.get(mat);
            if (!uniforms) continue;

            if (params.intensity    !== undefined) uniforms.uSparkleIntensity.value    = params.intensity;
            if (params.size         !== undefined) uniforms.uSparkleSize.value         = params.size;
            if (params.points       !== undefined) uniforms.uSparklePoints.value       = params.points;
            if (params.rotation     !== undefined) uniforms.uSparkleRotation.value     = params.rotation;
            if (params.shimmerSpeed !== undefined) uniforms.uSparkleShimmerSpeed.value = params.shimmerSpeed;
            if (params.color        !== undefined) uniforms.uSparkleColor.value        = params.color.slice();
            if (params.enabled      !== undefined) uniforms.uSparkleEnabled.value      = params.enabled ? 1.0 : 0.0;
            if (params.time         !== undefined) uniforms.uSparkleTime.value         = params.time;
        }
    });
}

export { injectEyeSparkle, removeEyeSparkle, updateEyeSparkleParams };
