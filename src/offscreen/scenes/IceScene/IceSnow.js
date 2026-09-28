import { Color } from "three/webgpu";
import {
  Fn, If, cameraPosition, float, getDistanceAttenuation, lightPosition, mix, mx_cell_noise_float,
  normalWorldGeometry, positionWorld, reference, sin, smoothstep, texture, uniform, vec2, vec3,
} from "three/tsl";

/**
 * Snow shared by the ice floor, cave walls and falling flakes. Coverage and
 * glitter live in world space so patches and sparkles run across the
 * floor/wall seam. The mask is blended into the ice material before lighting.
 */
export class IceSnow {
  constructor(settings, { noiseTexture, ambientLight, pointLights = [], screenLight }) {
    this.noiseTexture = noiseTexture;
    this.ambientLight = ambientLight;
    this.pointLights = pointLights;
    this.screenLight = screenLight;
    this.enabled = uniform(settings.snowEnabled ? 1 : 0);
    this.time = uniform(0);
    for (const [key, value] of Object.entries(settings)) {
      if (!key.startsWith("snow") || key === "snowEnabled") continue;
      const name = key[4].toLowerCase() + key.slice(5);
      this[name] = uniform(typeof value === "number" && key.endsWith("Color") ? new Color(value) : value);
    }
    this.screenFront = uniform(settings.screenLightScale);
    this.screenBack = uniform(settings.screenBackLightScale);
  }

  update(seconds) {
    this.time.value = seconds;
  }

  /** Diffuse radiance of a white, normal-less scatterer at `position`. */
  incidentLight(position) {
    const ambient = this.ambientLight;
    let light = ambient
      ? reference("color", "color", ambient).mul(reference("intensity", "float", ambient))
      : vec3(0);
    for (const point of this.pointLights) {
      const attenuation = getDistanceAttenuation({
        lightDistance: lightPosition(point).distance(position),
        cutoffDistance: reference("distance", "float", point),
        decayExponent: reference("decay", "float", point),
      });
      light = light.add(reference("color", "color", point)
        .mul(reference("intensity", "float", point)).mul(attenuation));
    }
    const screen = this.screenLight;
    if (screen) {
      // Small Lambertian emitter: E = L * A * cos / d², softened by +A in the
      // near field. The blurred screen colour is taken where the point projects.
      const { p0, p1, p3 } = screen.corners;
      const right = p1.sub(p0);
      const up = p3.sub(p0);
      const cross = right.cross(up);
      const area = cross.length().max(0.0001);
      const center = p0.add(right.add(up).mul(0.5));
      const toPoint = position.sub(center);
      const distanceSq = toPoint.dot(toPoint);
      const facing = cross.div(area).dot(toPoint).div(distanceSq.sqrt().max(0.0001));
      const emit = facing.max(0).mul(this.screenFront).add(facing.negate().max(0).mul(this.screenBack));
      const local = position.sub(p0);
      const coord = vec2(
        local.dot(right).div(right.dot(right).max(0.001)),
        local.dot(up).div(up.dot(up).max(0.001)),
      ).clamp(0.001, 0.999);
      const radiance = screen.blurredLightNode.sample(vec2(coord.x, coord.y.oneMinus())).level(0).rgb
        .mul(screen.color).mul(screen.intensity);
      light = light.add(radiance.mul(area).mul(emit).div(distanceSq.add(area)));
    }
    return light.mul(this.lightResponse).mul(1 / Math.PI);
  }

  /**
   * `planar` surfaces (the floor) sample one projection; walls blend three and
   * keep snow to ledges and a drift band above `floorY`.
   * Returns { mask, color, roughness, normal (encoded tangent space), emissive }.
   */
  surface({ planar = false, floorY = null } = {}) {
    const p = positionWorld;
    const n = normalWorldGeometry;
    const noise = (coord) => texture(this.noiseTexture, coord);
    const weights = n.abs().pow(vec3(4));
    const blend = weights.div(weights.x.add(weights.y).add(weights.z).max(0.0001));
    const projected = (scale) => planar
      ? noise(p.xz.mul(scale))
      : noise(p.zy.mul(scale)).mul(blend.x)
        .add(noise(p.xz.mul(scale)).mul(blend.y))
        .add(noise(p.xy.mul(scale)).mul(blend.z));
    const patch = projected(this.scale);
    const detail = projected(this.scale.mul(4.7));
    const grainCoord = planar
      ? p.xz
      : n.y.abs().greaterThan(0.6).select(p.xz, n.x.abs().greaterThan(n.z.abs()).select(p.zy, p.xy));
    const grain = noise(grainCoord.mul(this.grainScale));

    let coverage = this.floorCoverage;
    if (!planar) {
      const ledge = smoothstep(this.slope, this.slope.add(0.3), n.y);
      const drift = floorY
        ? p.y.sub(floorY).div(this.wallHeight.max(0.01)).oneMinus().clamp(0, 1)
        : float(0);
      coverage = this.wallCoverage.mul(ledge.max(drift));
    }
    const field = patch.r
      .add(detail.g.sub(0.5).mul(this.breakup))
      .add(grain.b.sub(0.5).mul(this.breakup).mul(0.35));
    const threshold = mix(0.85, 0.2, coverage.clamp(0, 1));
    const mask = smoothstep(threshold.sub(this.softness), threshold.add(this.softness), field)
      .mul(smoothstep(0, 0.1, coverage)).mul(this.enabled);

    const shade = smoothstep(0.3, 0.7, detail.b.mul(0.5).add(grain.r.mul(0.5)));
    const color = mix(this.shadowColor, this.color, shade).mul(this.brightness);

    // One flake per world-space cell: a jittered disc, a random facet tilt
    // and a view/time-dependent twinkle. Fades once cells shrink below a pixel.
    const cell = p.mul(this.sparkleDensity);
    const id = cell.floor();
    const pick = mx_cell_noise_float(id);
    const jitter = vec3(
      mx_cell_noise_float(id.add(vec3(17, 59, 3))),
      mx_cell_noise_float(id.add(vec3(41, 7, 83))),
      mx_cell_noise_float(id.add(vec3(5, 97, 29))),
    );
    const size = this.sparkleSize.clamp(0.02, 0.45);
    const center = jitter.mul(size.mul(-2).add(1)).add(size);
    const distance = cell.fract().sub(center).length();
    const aa = distance.fwidth().max(0.0001);
    const footprint = cell.fwidth().length();
    const flake = float(1).sub(smoothstep(size.sub(aa), size.add(aa), distance))
      .mul(pick.greaterThan(this.sparkleAmount.oneMinus()).toFloat())
      .mul(float(1).sub(smoothstep(0.6, 1.6, footprint)))
      .mul(mask);
    const tilt = jitter.sub(0.5);
    const view = cameraPosition.sub(p).normalize();
    const twinkle = sin(view.dot(tilt).mul(60).add(this.time.mul(this.sparkleSpeed)).add(pick.mul(40)))
      .mul(0.5).add(0.5).pow(6);

    const bump = grain.rg.sub(0.5).mul(2).add(detail.rg.sub(0.5))
      .mul(this.bump).add(tilt.xy.mul(flake).mul(2.5));
    const normal = vec3(bump, 1).normalize().mul(0.5).add(0.5);
    const roughness = mix(this.roughness, this.sparkleRoughness, flake);
    // Almost every pixel has no flake: skip its light gather there.
    const emissive = Fn(() => {
      const coverage = flake.toVar();
      const tint = color.toVar();
      const result = vec3(0).toVar();
      If(coverage.greaterThan(0), () => {
        result.assign(this.incidentLight(p).mul(tint)
          .mul(coverage.mul(twinkle).mul(this.sparkleIntensity)));
      });
      return result;
    })();
    return { mask, color, roughness, normal, emissive };
  }
}
