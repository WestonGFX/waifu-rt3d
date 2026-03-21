/**
 * Screen-space god rays (radial blur) shader.
 *
 * Creates volumetric light beams by sampling the framebuffer radially
 * outward from a light source position. The light position is typically
 * the character's head bone projected to screen coordinates.
 *
 * Uses 32 radial samples with exponential decay. Cost: ~0.8ms at full
 * resolution on M2 Pro. Can be reduced to 16 samples for low-end GPUs.
 *
 * @module GodRaysShader
 */
import { Vector2, Color } from 'three';

/**
 * God rays shader definition for use with ShaderPass.
 *
 * Uniforms:
 * - tDiffuse: Input framebuffer texture (auto-set by ShaderPass)
 * - uLightPos: Screen-space origin (0-1 range, updated per frame from head bone)
 * - uIntensity: Ray brightness multiplier
 * - uDecay: Exponential falloff per sample (0.9-0.99)
 * - uDensity: Ray density / sampling distance
 * - uTint: Color tint for the rays (emotion-driven)
 */
const GodRaysShader = {
    name: 'GodRaysShader',

    uniforms: {
        tDiffuse:    { value: null },
        uLightPos:   { value: new Vector2(0.5, 0.7) },
        uIntensity:  { value: 0.4 },
        uDecay:      { value: 0.96 },
        uDensity:    { value: 0.8 },
        uWeight:     { value: 0.4 },
        uTint:       { value: new Color(0xffffee) },
    },

    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec2 uLightPos;
        uniform float uIntensity;
        uniform float uDecay;
        uniform float uDensity;
        uniform float uWeight;
        uniform vec3 uTint;
        varying vec2 vUv;

        #define NUM_SAMPLES 32

        void main() {
            vec2 texCoord = vUv;
            vec2 deltaTexCoord = (texCoord - uLightPos) * (1.0 / float(NUM_SAMPLES)) * uDensity;

            vec4 baseColor = texture2D(tDiffuse, vUv);
            vec4 accumColor = vec4(0.0);
            float illuminationDecay = 1.0;

            for (int i = 0; i < NUM_SAMPLES; i++) {
                texCoord -= deltaTexCoord;
                vec4 sample_color = texture2D(tDiffuse, texCoord);
                sample_color *= illuminationDecay * uWeight;
                accumColor += sample_color;
                illuminationDecay *= uDecay;
            }

            // Blend accumulated rays with base image, tinted by emotion color
            vec3 rays = accumColor.rgb * uIntensity * uTint;
            gl_FragColor = vec4(baseColor.rgb + rays, baseColor.a);
        }
    `,
};

export { GodRaysShader };
