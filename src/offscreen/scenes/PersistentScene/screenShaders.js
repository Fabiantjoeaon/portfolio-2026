/**
 * Screen Plane Shader Registry
 *
 * Each shader factory returns { colorNode, uniforms } for a NodeMaterial.
 * Shared uniforms (uIsIntro, uIntroHovered, etc.) are passed in.
 */

import {
  uv,
  vec3,
  vec4,
  float,
  sin,
  cos,
  abs,
  mix,
  clamp,
  fract,
  max,
  time,
  Fn,
  Loop,
} from "three/tsl";
import * as THREE from "three/webgpu";

// ============================================================================
// NOISE GLOW SHADER
// Animated FBM-like wavy glow lines with intro state support
// ============================================================================
export function createNoiseGlowShader(sharedUniforms) {
  const {
    uIsIntro,
    uIntroHovered,
    uHoverTransition,
    uGlowSpeed,
    uGlowIntensity,
  } = sharedUniforms;

  // Constants
  const OSCILLATION = 0.7;
  const LINE_THICKNESS = 0.008;
  const LINE_BASE_LEN = 0.25;
  const TILE_DIFF = 0.088;
  const LINE_START = 0.818 + TILE_DIFF;

  // Simplified horizontal line for axis-aligned
  const drawHLine = Fn(([uvCoord, lineY, startX, endX]) => {
    const thickness = float(LINE_THICKNESS);
    const inY = abs(uvCoord.y.sub(lineY)).lessThan(thickness);
    const inX = uvCoord.x.greaterThan(startX).and(uvCoord.x.lessThan(endX));
    return inY.and(inX).toFloat();
  });

  const colorNode = Fn(() => {
    const uvCoord = uv();
    const t = time;
    const noiseTime = t.mul(uGlowSpeed ?? float(0.1));

    // FBM noise glow (manually unrolled)
    const nUvX = uvCoord.x.mul(4.0).toVar();
    const nUvY = uvCoord.y.mul(4.0).toVar();

    nUvX.addAssign(
      float(OSCILLATION).mul(cos(float(2.5).mul(nUvY).add(noiseTime))),
    );
    nUvY.addAssign(
      float(OSCILLATION).mul(cos(float(1.5).mul(nUvX).add(noiseTime))),
    );
    nUvX.addAssign(
      float(OSCILLATION / 2).mul(cos(float(5.0).mul(nUvY).add(noiseTime))),
    );
    nUvY.addAssign(
      float(OSCILLATION / 2).mul(cos(float(3.0).mul(nUvX).add(noiseTime))),
    );
    nUvX.addAssign(
      float(OSCILLATION / 3).mul(cos(float(7.5).mul(nUvY).add(noiseTime))),
    );
    nUvY.addAssign(
      float(OSCILLATION / 3).mul(cos(float(4.5).mul(nUvX).add(noiseTime))),
    );
    nUvX.addAssign(
      float(OSCILLATION / 4).mul(cos(float(10.0).mul(nUvY).add(noiseTime))),
    );
    nUvY.addAssign(
      float(OSCILLATION / 4).mul(cos(float(6.0).mul(nUvX).add(noiseTime))),
    );

    // Glow calculation
    const sinVal = abs(sin(noiseTime.sub(nUvY).sub(nUvX)));
    const glowBase = float(0.1).div(max(sinVal, float(0.001)));
    const glowClamped = clamp(
      glowBase.mul(uGlowIntensity ?? float(0.1)),
      float(0.0),
      float(0.8),
    );

    const defaultColor = vec3(
      glowClamped.mul(0.7),
      glowClamped.mul(0.7),
      glowClamped.mul(1.05),
    ).toVar();

    return vec4(defaultColor, float(1.0));
  })();

  return { colorNode };
}

// ============================================================================
// GRADIENT SHADER
// Simple animated gradient with wave pattern
// ============================================================================
export function createGradientShader(sharedUniforms) {
  const { uIsIntro, uIntroHovered } = sharedUniforms;

  const colorNode = Fn(() => {
    const uvCoord = uv();
    const t = time;

    // Gradient colors
    const color1 = vec3(0.102, 0.122, 0.235); // Deep blue-purple
    const color2 = vec3(0.051, 0.067, 0.161); // Dark navy
    const color3 = vec3(0.082, 0.106, 0.2); // Midnight blue

    const speed = float(0.3);

    // Animated wave pattern
    const wave1 = sin(uvCoord.y.mul(3.0).add(t.mul(speed)))
      .mul(0.5)
      .add(0.5);
    const wave2 = cos(uvCoord.x.mul(2.0).sub(t.mul(speed.mul(0.7))))
      .mul(0.5)
      .add(0.5);
    const blend = wave1.mul(0.6).add(wave2.mul(0.4));
    const diagonal = uvCoord.x.add(uvCoord.y).mul(0.5);

    const mixedColor1 = mix(color1, color2, diagonal);
    const mixedColor2 = mix(color2, color3, blend);
    const baseColor = mix(mixedColor1, mixedColor2, blend.mul(0.5).add(0.25));

    // Intro/hover state mixing (optional)
    const orangeRedBg = vec3(
      clamp(sin(t.mul(0.7)), 0.6, 1.0),
      clamp(sin(t.mul(0.6)), 0.0, 0.2),
      float(0.0),
    );

    const colorWithIntro = mix(baseColor, orangeRedBg.mul(0.3), uIsIntro);
    const finalColor = mix(colorWithIntro, orangeRedBg, uIntroHovered);

    return vec4(finalColor, float(1.0));
  })();

  return { colorNode };
}

// ============================================================================
// PLASMA SHADER
// Classic plasma effect with flowing colors
// ============================================================================
export function createPlasmaShader(sharedUniforms) {
  const { uIsIntro, uIntroHovered } = sharedUniforms;

  const colorNode = Fn(() => {
    const uvCoord = uv();
    const t = time.mul(0.5);

    // Plasma calculation
    const cx = uvCoord.x.sub(0.5);
    const cy = uvCoord.y.sub(0.5);

    const v1 = sin(cx.mul(10.0).add(t));
    const v2 = sin(cy.mul(10.0).add(t));
    const v3 = sin(cx.mul(10.0).add(cy.mul(10.0)).add(t));
    const v4 = sin(cx.mul(cx).add(cy.mul(cy)).mul(10.0).add(t));

    const v = v1.add(v2).add(v3).add(v4).mul(0.25);

    // Color mapping
    const r = sin(v.mul(3.14159)).mul(0.5).add(0.5);
    const g = sin(v.mul(3.14159).add(2.094)).mul(0.5).add(0.5);
    const b = sin(v.mul(3.14159).add(4.188)).mul(0.5).add(0.5);

    const baseColor = vec3(r.mul(0.3), g.mul(0.2), b.mul(0.8));

    // State mixing
    const orangeRedBg = vec3(
      clamp(sin(time.mul(0.7)), 0.6, 1.0),
      clamp(sin(time.mul(0.6)), 0.0, 0.2),
      float(0.0),
    );

    const colorWithIntro = mix(baseColor, orangeRedBg.mul(0.5), uIsIntro);
    const finalColor = mix(colorWithIntro, orangeRedBg, uIntroHovered);

    return vec4(finalColor, float(1.0));
  })();

  return { colorNode };
}

// ============================================================================
// SOLID COLOR SHADER
// Simple solid color for debugging/testing
// ============================================================================
export function createSolidShader(
  sharedUniforms,
  color = new THREE.Color(0x1a1f3c),
) {
  const colorNode = Fn(() => {
    return vec4(color.r, color.g, color.b, float(1.0));
  })();

  return { colorNode };
}

// ============================================================================
// SHADER REGISTRY
// Maps shader names to their factory functions
// ============================================================================
export const SCREEN_SHADERS = {
  "noise-glow": createNoiseGlowShader,
  gradient: createGradientShader,
  plasma: createPlasmaShader,
  solid: createSolidShader,
};

/**
 * Get list of available shader names
 */
export function getAvailableShaders() {
  return Object.keys(SCREEN_SHADERS);
}
