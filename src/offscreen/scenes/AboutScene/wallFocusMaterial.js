import {
  Fn, attribute, float, floor, fract, max, min, mix, positionWorld,
  sin, smoothstep, step, storage, texture, uint, uv, varying, vec2, vec3, vec4,
} from "three/tsl";
import { bindWallFocusAtlas, createWallFocusAtlas, FOCUS_RADII } from "./wallFocusAtlas.js";

const hash = n => fract(sin(n.mul(127.1).add(311.7)).mul(43758.5453));

export function installWallFocusMaterial(batch, u) {
  const material = batch.material;
  const atlas = createWallFocusAtlas(batch.font, material._atlasNode.value);
  const rect = attribute("msdfRect", "vec4");
  const atlasRect = attribute("msdfUvRect", "vec4");
  const atlasSpan = atlasRect.zw.sub(atlasRect.xy).abs()
    .mul(vec2(batch.font.atlasWidth, batch.font.atlasHeight)).max(1);
  const member = attribute("msdfMember", "float");
  const selected = step(float(1).sub(u.wallFocusCoverage), hash(member));
  const expansion = vec2(atlas.padding * 2).div(atlasSpan).mul(selected);
  material.positionNode = material.positionNode.add(vec3(uv().sub(0.5).mul(rect.zw).mul(expansion), 0));
  const color = varying(storage(batch._colorBuffer, "vec4", 0).setPBO(true).element(uint(member)));
  const localUv = uv().sub(0.5).mul(varying(expansion).add(1)).add(0.5);

  // Word selection and pulse math run per vertex, not for every fragment.
  const cycle = floor(u.time.div(u.wallPulseInterval));
  const age = u.time.mod(u.wallPulseInterval);
  const origin = vec2(hash(cycle).sub(0.5).mul(24), hash(cycle.add(19)).sub(0.5).mul(12));
  const ring = float(1).sub(smoothstep(1, 5, positionWorld.xy.sub(origin).length().sub(age.mul(9)).abs()));
  const envelope = smoothstep(0, 0.8, age).mul(float(1).sub(smoothstep(4, 6, age)));
  const pulse = varying(ring.mul(envelope).mul(u.wallPulseStrength));
  const letterSeed = hash(member.add(attribute("msdfLetter", "float").mul(73)));
  const activity = varying(selected.mul(mix(0.4, 1, letterSeed))).mul(float(0.3).add(pulse));
  const focusTexture = texture(atlas.texture);

  material.colorNode = Fn(() => {
    const clamped = localUv.clamp(0, 1);
    const glyphUv = vec2(mix(atlasRect.x, atlasRect.z, clamped.x), mix(atlasRect.w, atlasRect.y, clamped.y));
    const sample = material._atlasNode.sample(glyphUv);
    const median = max(min(sample.r, sample.g), min(max(sample.r, sample.g), sample.b));
    const glyphPixels = localUv.fwidth().max(0.0001).reciprocal();
    const pixelsPerTexel = glyphPixels.div(atlasSpan).dot(vec2(0.5));
    const range = pixelsPerTexel.mul(material.distanceRangeUniform).max(1);
    const inside = step(0, localUv.x).mul(step(localUv.x, 1)).mul(step(0, localUv.y)).mul(step(localUv.y, 1));
    const crisp = median.sub(0.5).add(material.weightBiasUniform).mul(range).add(0.5).clamp(0, 1).mul(inside);

    const focusRect = attribute("wallFocusRect", "vec4");
    const focusUv = vec2(localUv.x, float(1).sub(localUv.y)).mul(atlasSpan)
      .add(atlas.padding).div(atlasSpan.add(atlas.padding * 2));
    const blurred = focusTexture.sample(focusRect.xy.add(focusUv.mul(focusRect.zw)));
    const filtered = radius => {
      const texels = radius.div(pixelsPerTexel.max(0.001));
      let result = mix(crisp, blurred.r, texels.div(FOCUS_RADII[0]).clamp(0, 1));
      for (let i = 1; i < FOCUS_RADII.length; i++) {
        result = mix(result, blurred.element(i), texels.sub(FOCUS_RADII[i - 1])
          .div(FOCUS_RADII[i] - FOCUS_RADII[i - 1]).clamp(0, 1));
      }
      return result;
    };
    const blur = activity.mul(u.wallDefocus).mul(2);
    const core = filtered(blur);
    const halo = filtered(u.wallGlowRadius.mul(float(1).add(pulse.mul(0.6))))
      .mul(activity).mul(u.wallGlow).mul(1.5);
    const alpha = core.add(halo).mul(color.a).mul(material.opacityUniform);
    return vec4(color.rgb.mul(float(1).add(activity.mul(u.wallGlow).mul(2))), alpha);
  })();
  return bindWallFocusAtlas(batch, atlas);
}
