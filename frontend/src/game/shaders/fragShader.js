import Phaser from 'phaser';

/**
 * Shared ColorSwap pipeline using Phaser's per-vertex tint (`outTint.bgr` + `outTint.a`).
 * Decodes Among Us 3-channel mask sprites:
 * - Red channel   -> chosen suit primary color
 * - Blue channel  -> chosen suit shadow color
 * - Green channel -> icy cyan visor glass (preserving white specular & dark outline)
 */
const colorSwapFragShader = `
precision mediump float;
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
varying vec4 outTint;

void main() {
    vec4 tex = texture2D(uMainSampler, outTexCoord);
    if (tex.a < 0.01) {
        discard;
    }

    vec3 chosen = outTint.bgr;
    vec3 shadow = chosen * 0.58;
    vec3 outColor = tex.rgb;

    // 1. Primary body (Red mask)
    if (tex.r > 0.32 && tex.r > tex.g * 1.35 && tex.r > tex.b * 1.35) {
        outColor = chosen * tex.r;
    }
    // 2. Shadowed body / legs (Blue mask)
    else if (tex.b > 0.32 && tex.b > tex.r * 1.35 && tex.b > tex.g * 1.35) {
        outColor = shadow * tex.b;
    }
    // 3. Visor glass (Green mask -> authentic Among Us cyan visor)
    else if (tex.g > 0.32 && tex.g > tex.r * 1.25 && tex.g > tex.b * 1.25) {
        vec3 visorDark = vec3(0.24, 0.48, 0.58);
        vec3 visorBright = vec3(0.64, 0.90, 0.96);
        float t = clamp((tex.g - 0.32) / 0.68, 0.0, 1.0);
        outColor = mix(visorDark, visorBright, t) * tex.a;
    }

    gl_FragColor = vec4(outColor * outTint.a, tex.a * outTint.a);
}
`;

export const ColorSwapPipeline = new Phaser.Class({
    Extends: Phaser.Renderer.WebGL.Pipelines.SinglePipeline,
    initialize: function (game) {
        Phaser.Renderer.WebGL.Pipelines.SinglePipeline.call(this, {
            game,
            fragShader: colorSwapFragShader,
        });
    },
});

const grayFragShader = `
precision mediump float;
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;
varying vec4 outTint;

void main() {
    vec4 color = texture2D(uMainSampler, outTexCoord);
    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(vec3(gray * 0.7) * outTint.a, color.a * outTint.a);
}
`;

export const GrayPipeline = new Phaser.Class({
    Extends: Phaser.Renderer.WebGL.Pipelines.SinglePipeline,
    initialize: function (game) {
        Phaser.Renderer.WebGL.Pipelines.SinglePipeline.call(this, {
            game,
            fragShader: grayFragShader,
        });
    },
});

// Atmospheric Fog-of-War shader with smooth flashlight falloff and cool dark shadow outside vision
const visionRadiusFragShader = `
#define SHADER_NAME VISION_RADIUS_FS
precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2 uPlayerPosition;
uniform float uVisionRadius;
uniform vec2 uTextureOrigin;
uniform vec2 uTextureSize;

varying vec2 outTexCoord;

void main() {
    vec4 color = texture2D(uMainSampler, outTexCoord);
    vec2 worldPos = uTextureOrigin + (outTexCoord * uTextureSize);
    float dist = distance(worldPos, uPlayerPosition);

    float falloffStart = uVisionRadius * 0.58;
    float falloffEnd = uVisionRadius;
    float visibility = 1.0 - smoothstep(falloffStart, falloffEnd, dist);

    // Subtle cool dark ambiance outside vision radius
    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    vec3 darkAmbient = vec3(lum * 0.16, lum * 0.19, lum * 0.27);
    vec3 litColor = color.rgb * 1.04;

    vec3 finalColor = mix(darkAmbient, litColor, visibility);
    gl_FragColor = vec4(finalColor, color.a);
}
`;

export const VisionRadiusPipeline = new Phaser.Class({
    Extends: Phaser.Renderer.WebGL.Pipelines.SinglePipeline,
    initialize: function (game) {
        Phaser.Renderer.WebGL.Pipelines.SinglePipeline.call(this, {
            game,
            fragShader: visionRadiusFragShader,
            uniforms: [
                'uPlayerPosition',
                'uVisionRadius',
                'uTextureOrigin',
                'uTextureSize',
            ],
        });
    },
});
