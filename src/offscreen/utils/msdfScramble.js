import * as THREE from "three/webgpu";
import {
  Fn,
  attribute,
  clamp,
  dot,
  float,
  fwidth,
  int,
  max,
  min,
  mix,
  step,
  textureSize,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec4,
} from "three/tsl";

export const SCRAMBLE_LENGTH = 10;
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";

function pickScrambleRects(font, count = SCRAMBLE_LENGTH) {
  const rects = [];
  for (let i = 0; i < count; i++) {
    const ch = CHARSET[(Math.random() * CHARSET.length) | 0];
    const glyph = font.getGlyph(ch.charCodeAt(0));
    const uvRect = glyph?.uvRect ?? [0, 0, 0, 0];
    rects.push(new THREE.Vector4(uvRect[0], uvRect[1], uvRect[2], uvRect[3]));
  }
  return rects;
}

function msdfGlyphUv(uvRect) {
  return vec2(
    mix(uvRect.x, uvRect.z, uv().x),
    mix(uvRect.w, uvRect.y, uv().y),
  );
}

function msdfCoverage(atlas, glyphUv, distanceRange, weightBias) {
  const sample = atlas.sample(glyphUv);
  const sd = max(min(sample.r, sample.g), min(max(sample.r, sample.g), sample.b));
  const pxRange = vec2(distanceRange).div(vec2(textureSize(atlas)));
  const screenPx = vec2(1).div(fwidth(glyphUv));
  const range = max(dot(pxRange, screenPx).mul(0.5), float(1));
  return clamp(sd.sub(0.5).add(weightBias).mul(range).add(0.5), 0, 1);
}

/**
 * Port of the old Troika scramble: keep real glyph layout, swap atlas UVs
 * through 10 random glyphs, stagger by `msdfLetter`, fade alpha with t.
 * progress 0 = hidden/scrambled, 1 = resolved.
 * @param {import('three-blocks/msdf-text').BatchedMSDFText} batch
 * @param {import('three-blocks/msdf-text').MSDFFont} font
 * @returns {{ progress: import('three/tsl').TSLUniformNode } | null}
 */
export function installMSDFScramble(batch, font) {
  const material = batch?.material;
  if (!material?._atlasNode) return null;

  const progress = uniform(1);
  const scrambleRects = uniformArray(pickScrambleRects(font), "vec4");
  const originalUv = attribute("msdfUvRect", "vec4");
  const letter = attribute("msdfLetter", "float");
  const baseColor = material.colorNode;

  material.colorNode = Fn(() => {
    const base = vec4(baseColor).toVar();
    const delay = float(1).sub(letter).mul(4);
    const t = clamp(progress.mul(delay.add(1)), 0, 1).toVar();
    const i = int(clamp(t.mul(SCRAMBLE_LENGTH), 0, SCRAMBLE_LENGTH - 1));
    const uvRect = mix(scrambleRects.element(i), originalUv, step(float(0.95), t));
    const coverage = msdfCoverage(
      material._atlasNode,
      msdfGlyphUv(uvRect),
      material.distanceRangeUniform,
      material.weightBiasUniform,
    );
    return vec4(base.rgb, coverage.mul(t).mul(material.opacityUniform));
  })();
  material.needsUpdate = true;

  return { progress };
}
