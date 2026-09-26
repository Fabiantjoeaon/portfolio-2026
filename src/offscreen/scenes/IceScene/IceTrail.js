import { Vector2, Vector3 } from "three/webgpu";
import { PointerRaycaster } from "../../input/PointerRaycaster.js";
import { PointerFeedbackMap } from "../../effects/PointerFeedbackMap.js";

export const TRAIL_ATLAS_SCALE_X = 0.46;
export const TRAIL_GROUND_OFFSET_X = 0.01;
export const TRAIL_WALL_OFFSET_X = 0.53;

/**
 * Low-resolution feedback texture painted by the shared mouse raycaster.
 * This is the WebGPU/TSL equivalent of the supplied ice-trails ping-pong pass.
 */
export class IceTrail {
  constructor(settings) {
    this.enabled = settings.trailEnabled;
    this.resolution = settings.trailResolution;
    this.updateInterval = settings.trailUpdateInterval;
    this.projector = new PointerRaycaster();
    this._pointerTarget = new Vector2();
    this._rawPointer = new Vector2();
    this._pickUv = new Vector2();
    this._pick = { surface: null, uv: this._pickUv, point: new Vector3() };
    this._pickTargets = [];
    this._surface = null;
    this._frame = 0;
    this._elapsed = 0;
    this._hasPointer = false;
    this.interactionEnabled = true;

    this.map = new PointerFeedbackMap({
      width: this.resolution * 2,
      height: this.resolution,
      radius: settings.trailRadius,
      fade: settings.trailFade,
      diffusion: settings.trailDiffusion,
      noise: settings.trailNoise,
      brushScale: new Vector2(TRAIL_ATLAS_SCALE_X, 1),
    });
    this.controls = this.map.controls;
  }

  get texture() {
    return this.map.texture;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.map.reset();
      this._hasPointer = false;
      this._surface = null;
    }
  }

  setInteractionEnabled(enabled) {
    if (this.interactionEnabled === enabled) return;
    this.interactionEnabled = enabled;
    this.projector.consumeMovement();
    if (!enabled) {
      this.map.setPointer(null);
      this._hasPointer = false;
      this._surface = null;
    }
  }

  setResolution(resolution) {
    const next = Math.max(64, Math.round(resolution));
    this.resolution = next;
    this.map.setResolution(next * 2, next);
  }

  /**
   * Surface under the pointer: `floor` (ground) or `wall` (cave), with its
   * trail-surface uv and world point. Result object is reused.
   */
  pick(camera, ground, cave) {
    const pick = this._pick;
    pick.surface = null;
    const targets = this._pickTargets;
    targets.length = 0;
    if (ground) targets.push(ground);
    if (cave) targets.push(cave);
    const intersections = this.projector.intersectObjects(camera, targets);
    for (const hit of intersections) {
      if (hit.object === ground && hit.uv) {
        pick.surface = "floor";
        pick.uv.copy(hit.uv);
        pick.point.copy(hit.point);
        return pick;
      }
      if (cave?.trailUvFromIntersection(hit, pick.uv)) {
        pick.surface = "wall";
        pick.point.copy(hit.point);
        return pick;
      }
    }
    return pick;
  }

  _updatePointer(camera, ground, cave, delta) {
    if (!this.interactionEnabled) {
      this.projector.consumeMovement();
      this.map.setPointer(null);
      return;
    }
    if (!this.projector.consumeMovement()) {
      this.map.setPointer(null);
      return;
    }

    const { surface, uv: surfaceUv } = this.pick(camera, ground, cave);
    if (!surface) {
      this.map.setPointer(null);
      this._hasPointer = false;
      this._surface = null;
      return;
    }

    const offset = surface === "floor"
      ? TRAIL_GROUND_OFFSET_X
      : TRAIL_WALL_OFFSET_X;
    const x = offset + surfaceUv.x * TRAIL_ATLAS_SCALE_X;
    const y = surfaceUv.y;
    if (!this._hasPointer || surface !== this._surface) {
      this._pointerTarget.set(x, y);
      this._hasPointer = true;
    } else {
      const smoothing = 1 - Math.exp(-Math.max(delta, 0) * 16);
      this._pointerTarget.copy(this.controls.pointer.value)
        .lerp(this._rawPointer.set(x, y), smoothing);
    }
    this._surface = surface;
    this.map.setPointer(this._pointerTarget);
  }

  render(renderer, camera, ground, cave, timeMs, delta) {
    if (!this.enabled) return false;
    this._elapsed += Math.max(delta, 0);
    this._frame++;
    if (this._frame % Math.max(1, Math.round(this.updateInterval)) !== 0)
      return false;

    this._updatePointer(camera, ground, cave, this._elapsed);
    this.map.render(renderer, timeMs * 0.001, this._elapsed);
    this._elapsed = 0;
    return true;
  }

  dispose() {
    this.map.dispose();
  }
}
