import { Vector4 } from "three/webgpu";
import { float, floor, hash, max, min, mix, texture, uint, uniform, uniformArray, uv, varying, vec2 } from "three/tsl";
import { createGlyphCoverageAtlas, GLYPH_BLUR_RADII } from "../utils/glyphCoverageAtlas.js";

/** Space Mono (or any parsed Three Blocks MSDFFont) random glyphs.
 * One MSDF sample for the core and one preblurred glyph sample for the halo.
 * The shared font/map remain owned by loadMSDFFont, never by a particle system.
 */
export function createGlyphAppearance({ font, map, characters = "0123456789!@#$%&*", interval = 0.8, intervalVariation = 0.45, glow = 0.4, glowRadius = 0.25 }) {
  if (!characters.length) throw new Error("Glyph particles require at least one character.");
  const glyphs = Array.from(characters, char => {
    if (!font.has(char.codePointAt(0))) throw new Error(`Missing particle glyph: ${char}`);
    return font.getGlyph(char.codePointAt(0));
  });
  const rects = uniformArray(glyphs.map(g => new Vector4(...g.uvRect)), "vec4");
  const planes = uniformArray(glyphs.map(g => new Vector4(...g.planeBounds)), "vec4");
  const atlas = texture(map);
  // Reuse the About typography's padded, prefiltered glyph atlas. Generate
  // only this character set, once; no blur passes run during rendering.
  const glowAtlas = createGlyphCoverageAtlas(font, map, glyphs);
  const glowTexture = texture(glowAtlas.texture);
  const glowRects = uniformArray(glyphs.map(g => new Vector4(...glowAtlas.rects.get(glowAtlas.key(g.uvRect)))), "vec4");
  const controls = {
    interval: uniform(interval),
    intervalVariation: uniform(intervalVariation),
    glow: uniform(glow),
    glowRadius: uniform(glowRadius),
  };
  const centerX = glyphs[0].advance * 0.5;

  const appearance = ({ clock, seed, uniforms }) => {
    const cadenceVariation = hash(uint(seed.mul(65535)).add(uint(31337)));
    const cadenceScale = mix(
      1,
      mix(0.5, 1.5, cadenceVariation),
      controls.intervalVariation.clamp(0, 1),
    );
    const cadence = controls.interval.max(0.05).mul(cadenceScale);
    const tick = floor(clock.div(cadence).add(seed));
    const index = floor(hash(uint(tick).mul(uint(7919)).add(uint(seed.mul(65535))))
      .mul(glyphs.length)).min(glyphs.length - 1).toInt();
    const rect = varying(rects.element(index));
    const plane = varying(planes.element(index));
    const glowRect = varying(glowRects.element(index));
    // Expand geometry and UVs together: the glyph keeps its size while the
    // halo can extend beyond the atlas rectangle without sampling its neighbors.
    const radius = controls.glowRadius.clamp(0.01, 1);
    const span = radius.mul(4).add(1.2);
    const point = uv().sub(0.5).mul(span).add(vec2(centerX, 0.35));
    const local = point.sub(plane.xy).div(plane.zw.sub(plane.xy));
    const st = local.clamp(0, 1);
    const coord = vec2(mix(rect.x, rect.z, st.x), mix(rect.w, rect.y, st.y));
    const sample = atlas.sample(coord);
    const median = max(min(sample.r, sample.g), min(max(sample.r, sample.g), sample.b));
    const distance = median.sub(0.5);
    const aa = distance.fwidth().max(0.001);
    const core = distance.div(aa).add(0.5).clamp(0, 1);
    const edge = min(min(local.x, local.y), min(float(1).sub(local.x), float(1).sub(local.y)));
    const inside = edge.greaterThanEqual(0).toFloat();
    const glyphPixels = rect.zw.sub(rect.xy).abs().mul(vec2(font.atlasWidth, font.atlasHeight));
    const paddedUv = vec2(local.x, float(1).sub(local.y)).mul(glyphPixels)
      .add(glowAtlas.padding).div(glyphPixels.add(glowAtlas.padding * 2));
    const blurred = glowTexture.sample(glowRect.xy.add(paddedUv.clamp(0, 1).mul(glowRect.zw)));
    const blurRadius = radius.mul(7);
    let haloCoverage = blurred.r;
    for (let i = 1; i < GLYPH_BLUR_RADII.length; i++) {
      haloCoverage = mix(haloCoverage, blurred.element(i),
        blurRadius.sub(GLYPH_BLUR_RADII[i - 1])
          .div(GLYPH_BLUR_RADII[i] - GLYPH_BLUR_RADII[i - 1]).clamp(0, 1));
    }
    const halo = haloCoverage.mul(controls.glow.max(0)).mul(2);
    const coverage = core.mul(inside);
    const energy = coverage.add(halo);
    return {
      // Keep HDR glow energy in RGB so alpha clamping cannot flatten it.
      colorNode: uniforms.color.mul(energy.max(1)),
      opacityNode: energy.min(1),
      scaleNode: vec2(span),
    };
  };
  return { appearance, controls, dispose: () => glowAtlas.texture.dispose() };
}
