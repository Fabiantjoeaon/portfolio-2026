import * as THREE from "three/webgpu";
import { positionGeometry, screenCoordinate, screenUV, texture, uniform, vec2, vec4 } from "three/tsl";
import { fsTriangle } from "../utils/fullscreenTriangle.js";
import { fogSamples } from "../../shared/fogSamples.js";
import { store } from "@/offscreen/store";

/**
 * Shared pieces of every ray-marched volume (scene fog, screen shafts, cube
 * shafts): one static jitter, one DPR-aware sample budget and one
 * reduced-resolution march target with its additive composite.
 */

/** Static interleaved-gradient offset; no history buffer, so no shimmer. */
export const marchJitter = () =>
  screenCoordinate.xy.dot(vec2(0.06711056, 0.00583715)).fract().mul(52.9829189).fract();

/** Live sample count for an authored step count at the current pixel ratio. */
export const marchSamples = (steps, pixelRatio = store.viewport.devicePixelRatio, min = 8) =>
  fogSamples(steps, pixelRatio, min);

export function createMarchMaterial(name, colorNode) {
  const material = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, fog: false });
  material.name = name;
  material.vertexNode = vec4(positionGeometry.xy, 0, 1);
  material.colorNode = colorNode;
  return material;
}

export class VolumetricPass {
  /**
   * @param {string} name
   * @param {UniformNode<int>} authoredSteps - Inspector-bound step count
   */
  constructor(name, authoredSteps) {
    this.authoredSteps = authoredSteps;
    this.steps = uniform(authoredSteps.value, "int");
    this.target = new THREE.RenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this._march = new THREE.Mesh(fsTriangle, null);
    this._march.frustumCulled = false;
    this._scene = new THREE.Scene();
    this._scene.add(this._march);

    const composite = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    composite.name = `${name}Composite`;
    composite.vertexNode = vec4(positionGeometry.xy, 0, 1);
    composite.colorNode = texture(this.target.texture, screenUV).rgb;
    this.mesh = new THREE.Mesh(fsTriangle, composite);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = Infinity;
  }

  set material(material) {
    this._march.material = material;
  }

  render(renderer, camera, width, height) {
    this.steps.value = marchSamples(this.authoredSteps.value, undefined, 4);
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this._scene, camera);
    renderer.setRenderTarget(previousTarget);
  }

  dispose() {
    this.target.dispose();
    this.mesh.material.dispose();
  }
}
