import * as THREE from "three/webgpu";
import {
  Fn, If, Loop, abs, cameraPosition, cameraProjectionMatrixInverse,
  cameraWorldMatrix, cross, dot, exp, float, int, length, max, min, mix,
  normalize, screenUV, select,
  smoothstep, storage, texture, uniform, vec2, vec3, vec4,
} from "three/tsl";
import { VolumetricPass, createMarchMaterial, marchJitter } from "../../postprocessing/volumetrics.js";

/**
 * Single-scattering light shafts cast by the persistent screen through the
 * glass grid. Drawn additively after the glass so the beams sit in the air in
 * front of the tiles. The haze is uniform and independent of scene fog, so
 * fog height cut-offs never clip the screen's light.
 *
 * Each march sample takes its light from the screen point below it (blended
 * toward the screen center by `convergence`, jittered by `softness` for an
 * area-light penumbra), samples the emission there, and attenuates it where
 * that path crosses a tile. Tile footprints come straight from the grid's
 * compute buffer, so hover push, pop and the exit wave move the shadows.
 */
export class ScreenShafts {
  constructor({ renderer, screenLight, grid, settings }) {
    this.renderer = renderer;
    this.screenLight = screenLight;
    this.grid = grid;
    this.enabled = settings.shaftsEnabled;
    this.uniforms = {
      shaftIntensity: uniform(settings.shaftIntensity),
      shaftDensity: uniform(settings.shaftDensity),
      shaftLength: uniform(settings.shaftLength),
      shaftFalloff: uniform(settings.shaftFalloff),
      shaftAnisotropy: uniform(settings.shaftAnisotropy),
      shaftConvergence: uniform(settings.shaftConvergence),
      shaftSoftness: uniform(settings.shaftSoftness),
      shaftTileTransmission: uniform(settings.shaftTileTransmission),
      shaftDetail: uniform(settings.shaftDetail),
      shaftSteps: uniform(settings.shaftSteps, "int"),
    };
    this.resolution = settings.shaftResolution;
    this.visibility = uniform(1);
    // Page transitions animate this multiplier without overwriting the
    // artist-controlled shaftIntensity value exposed in the debug panel.
    this.transitionIntensity = uniform(1);
    this._gridPosition = uniform(new THREE.Vector3());
    this._cornerRadius = uniform(0);
    this._variants = new Map();
    this._offsetBuffer = null;

    this.pass = new VolumetricPass("ScreenShafts", this.uniforms.shaftSteps);
    this.mesh = this.pass.mesh;
  }

  /**
   * March this frame's shafts into the reduced-resolution target. Sized from
   * the viewport: wipes can hand in reduced-resolution scene depths.
   * @returns {?THREE.Mesh} the additive composite to draw after the glass,
   *   or null when nothing is visible
   */
  prepare(camera, prevDepth, nextDepth, mixNode, { width, height, devicePixelRatio }) {
    const compute = this.grid?.compute;
    if (!this.enabled || !prevDepth || !compute) return null;
    if (this.visibility.value <= 0 || this.transitionIntensity.value <= 0 || this.uniforms.shaftIntensity.value <= 0) return null;

    if (compute.offsetBuffer !== this._offsetBuffer) {
      this._disposeVariants();
      this._offsetBuffer = compute.offsetBuffer;
    }
    const next = nextDepth ?? prevDepth;
    // Scene gbuffers are pooled: rebind the depth nodes, keyed on whether the
    // transition blends two depths and on each depth's MSAA shader type.
    const blend = next !== prevDepth;
    const key = `${blend}|${prevDepth.renderTarget?.samples > 1}|${next.renderTarget?.samples > 1}`;
    this._prevDepth ??= texture(prevDepth);
    this._nextDepth ??= texture(next);
    this._prevDepth.value = prevDepth;
    this._nextDepth.value = next;
    let material = this._variants.get(key);
    if (!material) this._variants.set(key, (material = this._createMaterial(blend, mixNode)));
    this.pass.material = material;

    this.grid.getWorldPosition(this._gridPosition.value);
    this._cornerRadius.value = this.grid.config.cornerRadius ?? 0;

    this.pass.render(
      this.renderer,
      camera,
      Math.floor(width * devicePixelRatio) * this.resolution,
      Math.floor(height * devicePixelRatio) * this.resolution,
    );
    return this.mesh;
  }

  _createMaterial(blend, mixNode) {
    const u = this.uniforms;
    const light = this.screenLight;
    const { p0, p1, p3 } = light.corners;
    const compute = this.grid.compute;
    const cu = compute.uniforms;
    const tileSize = this.grid.interfaceUniforms.tileSize;
    const gridPosition = this._gridPosition;
    const cornerRadius = this._cornerRadius;
    // Fragment storage reads need the WebGPU backend; WebGL keeps the haze
    // without tile shadows.
    const offsets = this.renderer.backend?.isWebGPUBackend
      ? storage(compute.offsetBuffer, "vec4", compute.count).toReadOnly()
      : null;
    const gridOrigin = vec2(cu.originX, cu.originY);

    const tileOcclusion = (p, target) => {
      const occlusion = float(1).toVar();
      const dz = target.z.sub(p.z);
      const along = gridPosition.z.sub(p.z).div(select(abs(dz).lessThan(1e-5), float(1e-5), dz));
      If(along.greaterThan(0).and(along.lessThan(1)), () => {
        const local = mix(p.xy, target.xy, along).sub(gridPosition.xy).toVar();
        const cell = local.sub(gridOrigin).div(cu.cellSize).add(0.5).floor().toVar();
        const inGrid = cell.x.greaterThanEqual(0).and(cell.y.greaterThanEqual(0))
          .and(cell.x.lessThan(cu.cols)).and(cell.y.lessThan(cu.rows));
        If(inGrid, () => {
          const tile = offsets.element(int(cell.y.mul(cu.cols).add(cell.x)));
          const center = cell.mul(cu.cellSize).add(gridOrigin).add(tile.xy);
          const scale = tile.w.max(0);
          const radius = cornerRadius.mul(tileSize).mul(scale);
          const q = abs(local.sub(center)).sub(tileSize.mul(0.5).mul(scale).sub(radius));
          const distance = length(max(q, 0)).add(min(max(q.x, q.y), 0)).sub(radius);
          const edge = cu.cellSize.mul(0.02);
          const inside = smoothstep(edge.negate(), edge, distance).oneMinus();
          occlusion.assign(mix(float(1), u.shaftTileTransmission, inside));
        });
      });
      return occlusion;
    };

    const shafts = Fn(() => {
      const depth = blend
        ? mix(this._prevDepth.sample(screenUV).x, this._nextDepth.sample(screenUV).x, mixNode)
        : this._prevDepth.sample(screenUV).x;
      const ndc = vec4(screenUV.x.mul(2).sub(1), screenUV.y.oneMinus().mul(2).sub(1), depth, 1);
      const world = cameraWorldMatrix.mul(cameraProjectionMatrixInverse.mul(ndc));
      const toSurface = world.xyz.div(world.w).sub(cameraPosition);
      const surfaceDistance = toSurface.length().max(1e-3);
      const direction = toSurface.div(surfaceDistance).toVar();

      const v1 = p1.sub(p0).toVar();
      const v2 = p3.sub(p0).toVar();
      const normal = normalize(cross(v1, v2)).toVar();
      const center = p0.add(v1.mul(0.5)).add(v2.mul(0.5)).toVar();
      const invV1 = float(1).div(dot(v1, v1).max(1e-6));
      const invV2 = float(1).div(dot(v2, v2).max(1e-6));
      const axisU = normalize(v1).toVar();
      const axisV = normalize(v2).toVar();

      // Samples can only receive light inside this screen-aligned box: beyond
      // it every jittered target falls off the emitter.
      const reach = u.shaftSoftness.mul(u.shaftLength).mul(0.5);
      const spreadScale = float(1).div(u.shaftConvergence.oneMinus().max(0.05));
      const halfU = length(v1).mul(0.5).add(reach).mul(spreadScale);
      const halfV = length(v2).mul(0.5).add(reach).mul(spreadScale);
      const boxMax = vec3(halfU, halfV, u.shaftLength);
      const boxMin = vec3(halfU.negate(), halfV.negate(), 0);
      const relative = cameraPosition.sub(center);
      const origin = vec3(dot(relative, axisU), dot(relative, axisV), dot(relative, normal));
      const safe = (x) => select(abs(x).lessThan(1e-6), float(1e-6), x);
      const inverse = vec3(
        float(1).div(safe(dot(direction, axisU))),
        float(1).div(safe(dot(direction, axisV))),
        float(1).div(safe(dot(direction, normal))),
      );
      const t1 = boxMin.sub(origin).mul(inverse).toVar();
      const t2 = boxMax.sub(origin).mul(inverse).toVar();
      const tMin = min(t1, t2);
      const tMax = max(t1, t2);
      const tNear = max(max(tMin.x, tMin.y), tMin.z).max(0).toVar();
      const tFar = min(min(tMax.x, tMax.y), tMax.z).min(surfaceDistance).toVar();

      const result = vec3(0).toVar();
      If(tFar.greaterThan(tNear), () => {
        const count = this.pass.steps.clamp(4, 64);
        const stepLength = tFar.sub(tNear).div(float(count)).toVar();
        const stepTransmittance = exp(u.shaftDensity.mul(stepLength).negate()).toVar();
        const jitter = marchJitter().toVar();
        const transmittance = float(1).toVar();
        const g = u.shaftAnisotropy;
        const g2 = g.mul(g);

        Loop({ start: int(0), end: count, type: "int", condition: "<" }, ({ i }) => {
          const fi = float(i);
          const p = cameraPosition.add(direction.mul(tNear.add(fi.add(jitter).mul(stepLength)))).toVar();
          const height = dot(p.sub(center), normal).max(0).toVar();
          const spread = vec2(fi.mul(0.7548776662), fi.mul(0.5698402910)).add(jitter).fract().sub(0.5);
          const target = mix(p.sub(normal.mul(height)), center, u.shaftConvergence)
            .add(axisU.mul(spread.x).add(axisV.mul(spread.y)).mul(u.shaftSoftness.mul(height))).toVar();
          const q = target.sub(p0);
          const uv = vec2(dot(q, v1).mul(invV1), dot(q, v2).mul(invV2)).toVar();
          const edge = smoothstep(0, 0.02, uv.x).mul(smoothstep(0, 0.02, uv.x.oneMinus()))
            .mul(smoothstep(0, 0.02, uv.y)).mul(smoothstep(0, 0.02, uv.y.oneMinus())).toVar();

          If(edge.greaterThan(0), () => {
            // Quad coordinates are Y-up, while render-target rows are Y-down.
            const lightUV = vec2(uv.x, uv.y.oneMinus()).clamp(0, 1);
            const emission = mix(
              light.blurredLightNode.sample(lightUV).level(0).rgb,
              light.lightTextureNode.sample(lightUV).level(0).rgb,
              u.shaftDetail,
            );
            const toSample = p.sub(target);
            const lightDirection = toSample.div(toSample.length().max(1e-4));
            const cosTheta = dot(lightDirection, direction.negate());
            const phase = g2.oneMinus().div(g2.add(1).sub(g.mul(2).mul(cosTheta)).max(1e-4).pow(1.5));
            const falloffHeight = height.div(u.shaftFalloff);
            const falloff = float(1).div(falloffHeight.mul(falloffHeight).add(1));
            const occlusion = offsets ? tileOcclusion(p, target) : float(1);
            result.addAssign(emission.mul(edge.mul(occlusion).mul(falloff).mul(phase).mul(transmittance)));
          });
          transmittance.mulAssign(stepTransmittance);
        });
        result.mulAssign(stepTransmittance.oneMinus());
      });
      return result.mul(light.color).mul(u.shaftIntensity)
        .mul(this.visibility).mul(this.transitionIntensity);
    });

    return createMarchMaterial("ScreenShafts", shafts());
  }

  _disposeVariants() {
    for (const material of this._variants.values()) material.dispose();
    this._variants.clear();
  }

  dispose() {
    this._disposeVariants();
    this.pass.dispose();
  }
}
