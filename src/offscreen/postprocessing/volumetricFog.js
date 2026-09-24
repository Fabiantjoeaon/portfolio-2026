import { Color } from "three/webgpu";
import { Fn, Loop, float, vec2, vec3, uniform, texture, time, exp, mix, screenCoordinate } from "three/tsl";

/** Depth-terminated world-space fog. Put in scenePostprocessingChain so each
 * scene is fogged before its transition. Caller owns the repeating noise map.
 * Optional live screenLight supplies rectangular area illumination. The live
 * sample count is bounded to 8–64; single scattering has no shadow rays.
 * `holeyness` raises a hard noise-coverage cutoff: 0 is connected fog and 1
 * is sparse banks separated by locally zero-density air.
 *
 * Usage: this.scenePostprocessingChain = [createVolumetricFog({
 *   noiseTexture: this.fogNoiseTexture, fogMinY: groundY, screenLight,
 * })];
 * Returned effect.uniforms are live. The compositor checks effect.needsRebuild
 * when the step count crosses the specialized eight-sample boundary.
 */
export function createVolumetricFog({
  noiseTexture, screenLight = null,
  fogColor = new Color(0x102c40), fogColor2 = new Color(0x427488),
  fogDensity = 0.028, fogAlpha = 0.88, fogSpeed = 0.45,
  frequency = 0.055, heightFactor = 0.24, fogMinY = 0,
  maxDistance = 180, steps = 24,
  billowHeight = 7, ambientStrength = 1, lightStrength = 0.12,
  holeyness = 0.45,
} = {}) {
  const uniforms = {
    fogColor: uniform(fogColor), fogColor2: uniform(fogColor2),
    fogDensity: uniform(fogDensity), fogAlpha: uniform(fogAlpha),
    fogSpeed: uniform(fogSpeed), frequency: uniform(frequency),
    heightFactor: uniform(heightFactor), fogMinY: uniform(fogMinY),
    maxDistance: uniform(maxDistance),
    steps: uniform(Math.max(8, Math.min(64, Math.round(steps))), "int"),
    billowHeight: uniform(billowHeight),
    ambientStrength: uniform(ambientStrength),
    lightStrength: uniform(lightStrength),
    holeyness: uniform(holeyness),
  };
  let compiledUnrolled;
  const useUnrolled = () => uniforms.steps.value <= 8;
  const effect = (input, context) => {
    const unrolled = compiledUnrolled = useUnrolled();
    const world = context.world ?? context.prevWorld;
    if (!noiseTexture || !world || !context.cameraMatrixWorld) return input;
    const u = uniforms;
    return Fn(() => {
      const origin = context.cameraMatrixWorld[3].xyz;
      const delta = world.worldPosition.sub(origin);
      const distance = delta.length().max(0.001);
      const direction = delta.div(distance);
      const count = unrolled ? float(8) : u.steps.clamp(8, 64);
      const stepLength = distance.min(u.maxDistance).div(count);
      // Static jitter avoids shimmer without a temporal history buffer.
      const jitter = screenCoordinate.xy.dot(vec2(0.06711056, 0.00583715)).fract().mul(52.9829189).fract();
      const transmittance = float(1).toVar();
      const scattering = vec3(0).toVar();
      const drift = time.mul(u.fogSpeed);
      let lightCenter, lightNormal, lightArea, lightColor;
      if (screenLight) {
        const { p0, p1, p2, p3 } = screenLight.corners;
        lightCenter = p0.add(p1).add(p2).add(p3).mul(0.25).toVar();
        const cross = p1.sub(p0).cross(p3.sub(p0));
        lightArea = cross.length().max(0.001).toVar();
        lightNormal = cross.div(lightArea).toVar();
        // Broad area average, sampled once outside the march.
        const light = screenLight.lightTextureNode;
        lightColor = light.sample(vec2(0.25, 0.25)).level(0).rgb
          .add(light.sample(vec2(0.75, 0.25)).level(0).rgb)
          .add(light.sample(vec2(0.25, 0.75)).level(0).rgb)
          .add(light.sample(vec2(0.75, 0.75)).level(0).rgb)
          .mul(0.25).mul(screenLight.color).mul(screenLight.intensity).toVar();
      }
      const sampleFog = (i) => {
        const p = origin.add(direction.mul(float(i).add(jitter).mul(stepLength))).toVar();
        const q = p.add(vec3(drift, 0, drift.mul(0.37))).mul(u.frequency);
        // Two oriented slices give spatial billows without a volume texture.
        // Explicit LOD keeps sampling valid inside a loop.
        const broad = texture(noiseTexture, q.xz.add(q.y.mul(0.31))).level(0).r;
        const detail = texture(noiseTexture, q.xy.mul(2.07).add(q.z.mul(0.43))).level(0).g;
        const cloud = broad.mul(0.7).add(detail.mul(0.3));
        const billow = cloud.smoothstep(0.4, 0.65);
        // A density bias can only thin the whole volume. This coverage mask
        // instead clips low-noise regions to exactly zero density, producing
        // distinct cloud banks with genuinely clear air between them.
        const cutoff = mix(0.18, 0.78, u.holeyness);
        const coverage = cloud.smoothstep(cutoff, cutoff.add(0.055));
        const height = p.y.sub(u.fogMinY).sub(billow.mul(u.billowHeight)).max(0);
        const density = exp(height.mul(u.heightFactor).negate())
          .mul(billow).mul(coverage).mul(1.68).mul(u.fogDensity);
        const opacity = float(1).sub(exp(density.mul(stepLength).negate()));
        const tint = mix(u.fogColor, u.fogColor2, billow);
        const illumination = tint.mul(u.ambientStrength).toVar();
        if (screenLight) {
          const toLight = lightCenter.sub(p);
          const distanceSq = toLight.dot(toLight).max(0.01);
          const lightDir = toLight.div(distanceSq.sqrt());
          const solidAngle = lightArea.div(distanceSq.add(lightArea))
            .mul(lightNormal.dot(lightDir).abs());
          // Broad scattering: rotating away from the emitter must not switch
          // the visible medium off (the old forward lobe varied by ~4.6x).
          const phase = direction.dot(lightDir).mul(0.15).add(0.45);
          illumination.addAssign(lightColor.mul(tint).mul(solidAngle).mul(phase).mul(u.lightStrength));
        }
        scattering.addAssign(illumination.mul(transmittance).mul(opacity));
        transmittance.mulAssign(float(1).sub(opacity));
      };
      // The default eight samples can be scheduled together by the GPU rather
      // than carried through a dynamic loop. Higher Inspector counts retain
      // the same general integration path and exact sample positions.
      if (unrolled) {
        for (let i = 0; i < 8; i++) sampleFog(i);
      } else {
        Loop({ start: 0, end: count, type: "int", condition: "<" }, ({ i }) => sampleFog(i));
      }
      return mix(input.rgb, input.rgb.mul(transmittance).add(scattering), u.fogAlpha);
    })();
  };
  effect.uniforms = uniforms;
  // Rebuild only when crossing between the default and general shader. Counts
  // above eight remain a live uniform; all Inspector settings retain behavior.
  effect.needsRebuild = () => compiledUnrolled !== useUnrolled();
  return effect;
}

export function volumetricFog(colorNode, context, config = {}) {
  return createVolumetricFog(config)(colorNode, context);
}
