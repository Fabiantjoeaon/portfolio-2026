import {
  Fn, attribute, float, floor, fract, max, min, mix, positionWorld,
  sin, smoothstep, step, storage, uint, uv, varying, vec2, vec3, vec4,
} from "three/tsl";

const hash = (n) => fract(sin(n.mul(127.1).add(311.7)).mul(43758.5453));

// Keep the wall in one draw. Extend each glyph quad to fit its soft halo;
// clamp sampling to that glyph's atlas rectangle to avoid adjacent letters.
export function installWallFocusMaterial(batch, u) {
  const material = batch.material;
  const rect = attribute("msdfRect", "vec4");
  material.positionNode = material.positionNode.add(vec3(uv().sub(0.5).mul(rect.zw).mul(1.5), 0));
  const member = attribute("msdfMember", "float");
  // Reuse the batch's member colors/opacities so all existing live controls
  // and the page reveal also apply outside the original crisp glyph mask.
  const color = varying(storage(batch._colorBuffer, "vec4", 0).setPBO(true).element(uint(member)));
  const wordSeed = varying(hash(member));
  const letterSeed = varying(hash(member.add(attribute("msdfLetter", "float").mul(73))));

  material.colorNode = Fn(() => {
    const localUv = uv().sub(0.5).mul(2.5).add(0.5);
    const atlasRect = attribute("msdfUvRect", "vec4");
    const atlasSize = vec2(batch.font.atlasWidth, batch.font.atlasHeight);
    const glyphPixels = localUv.fwidth().max(0.0001).reciprocal();
    const atlasSpan = atlasRect.zw.sub(atlasRect.xy).abs().mul(atlasSize).max(1);
    const range = glyphPixels.div(atlasSpan).mul(material.distanceRangeUniform).dot(vec2(0.5)).max(1);
    const coverage = (point, feather = float(0.5)) => {
      const clamped = point.clamp(0, 1);
      const glyphUv = vec2(mix(atlasRect.x, atlasRect.z, clamped.x), mix(atlasRect.w, atlasRect.y, clamped.y));
      const sample = material._atlasNode.sample(glyphUv);
      const median = max(min(sample.r, sample.g), min(max(sample.r, sample.g), sample.b));
      const inside = step(0, point.x).mul(step(point.x, 1)).mul(step(0, point.y)).mul(step(point.y, 1));
      const distance = median.sub(0.5).add(material.weightBiasUniform).mul(range);
      return smoothstep(feather.negate(), feather, distance).mul(inside);
    };
    // Filter glyph coverage rather than the distance field itself: the atlas
    // has a finite distance range, which would otherwise make rectangular halos.
    const filtered = (radius) => {
      const offset = vec2(radius.mul(0.5)).div(glyphPixels);
      const feather = radius.mul(0.25).add(0.5);
      const weights = [1, 4, 6, 4, 1];
      let result = float(0);
      for (let x = -2; x <= 2; x++) {
        for (let y = -2; y <= 2; y++) {
          result = result.add(coverage(localUv.add(offset.mul(vec2(x, y))), feather).mul(weights[x + 2] * weights[y + 2] / 256));
        }
      }
      return result;
    };

    // A stable subset of words, with varied softness within each word.
    const selected = step(float(1).sub(u.wallFocusCoverage), wordSeed);
    const cycle = floor(u.time.div(u.wallPulseInterval));
    const age = u.time.mod(u.wallPulseInterval);
    const origin = vec2(hash(cycle).sub(0.5).mul(24), hash(cycle.add(19)).sub(0.5).mul(12));
    const radius = age.mul(9);
    const ring = float(1).sub(smoothstep(1, 5, positionWorld.xy.sub(origin).length().sub(radius).abs()));
    const envelope = smoothstep(0, 0.8, age).mul(float(1).sub(smoothstep(4, 6, age)));
    const pulse = ring.mul(envelope).mul(u.wallPulseStrength);
    const activity = selected.mul(mix(0.4, 1, letterSeed)).mul(float(0.3).add(pulse));
    const blur = activity.mul(u.wallDefocus).mul(2);
    const crisp = coverage(localUv);
    const soft = filtered(blur);
    const core = mix(crisp, soft, blur.clamp(0, 1));
    const haloWidth = u.wallGlowRadius.mul(float(1).add(pulse.mul(0.6)));
    const halo = filtered(haloWidth).mul(activity).mul(u.wallGlow).mul(1.5);
    const edge = smoothstep(0, 0.12, min(min(uv().x, uv().y), min(float(1).sub(uv().x), float(1).sub(uv().y))));
    const alpha = core.add(halo).mul(edge).mul(color.a).mul(material.opacityUniform);
    return vec4(color.rgb.mul(float(1).add(activity.mul(u.wallGlow).mul(2))), alpha);
  })();
}
