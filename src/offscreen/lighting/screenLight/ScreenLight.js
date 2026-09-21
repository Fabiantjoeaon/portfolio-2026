/**
 * Textured LTC area-light descriptor driven by the persistent screen plane.
 *
 * Owns the world-space quad corner uniforms, the LTC LUTs, and a stable
 * texture node pointing at the screen's render target (whose underlying
 * texture is swapped on resize via `setTexture`). Materials opt in through
 * `applyTo`, which adds an additive diffuse+specular contribution to their
 * `emissiveNode` — the same approach onimo uses for its hall PBR materials.
 */

import * as THREE from "three/webgpu";
import { RectAreaLightTexturesLib } from "three/addons/lights/RectAreaLightTexturesLib.js";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import { float, mix, texture as textureNode, uniform, vec3 } from "three/tsl";
import { screenLightNode } from "./screenLightNode.js";

let _ltcCache = null;

function ensureLTC() {
  if (_ltcCache) return _ltcCache;
  RectAreaLightTexturesLib.init();
  if (
    THREE.RectAreaLightNode &&
    typeof THREE.RectAreaLightNode.setLTC === "function"
  ) {
    THREE.RectAreaLightNode.setLTC(RectAreaLightTexturesLib);
  }
  _ltcCache = {
    ltcTex1: RectAreaLightTexturesLib.LTC_HALF_1,
    ltcTex2: RectAreaLightTexturesLib.LTC_HALF_2,
  };
  return _ltcCache;
}

const _corner = new THREE.Vector3();

export class ScreenLight {
  /**
   * @param {object} options
   * @param {THREE.Texture} options.lightTexture - Screen render target texture
   * @param {string|number} [options.color]
   * @param {number} [options.intensity]
   * @param {number} [options.blur] - [0..4], 0 = sharp lookup, 4 = fully pre-blurred
   * @param {boolean} [options.flipWinding] - Flip the quad's front face
   */
  constructor({
    lightTexture,
    color = "#ffffff",
    intensity = 1.0,
    blur = 0,
    flipWinding = false,
  } = {}) {
    const { ltcTex1, ltcTex2 } = ensureLTC();
    this.ltcTex1 = ltcTex1;
    this.ltcTex2 = ltcTex2;
    this.flipWinding = flipWinding;

    this.corners = {
      p0: uniform(new THREE.Vector3()),
      p1: uniform(new THREE.Vector3()),
      p2: uniform(new THREE.Vector3()),
      p3: uniform(new THREE.Vector3()),
    };

    this.intensity = uniform(intensity);
    this.color = uniform(new THREE.Color(color));
    this.blur = uniform(blur);

    // Stable node identity: the screen target is recreated on resize, so
    // materials sample through this node and we swap `.value` instead.
    this.lightTextureNode = textureNode(lightTexture);

    // Pre-filter the screen content into a small blurred render target once
    // per frame. The sharp/blurred mix happens in `screenLightNode` driven by
    // the `blur` uniform.
    this.blurredLightNode = gaussianBlur(this.lightTextureNode, null, 8, {
      resolutionScale: 0.0625,
    }).getTextureNode();
  }

  /**
   * Swap the sampled screen texture (called when the screen render target is
   * recreated on resize).
   * @param {THREE.Texture} texture
   */
  setTexture(texture) {
    if (texture) this.lightTextureNode.value = texture;
  }

  /**
   * Sync the light quad corners to the screen plane's world transform.
   * The screen is a PlaneGeometry(1,1): corners at (±0.5, ±0.5, 0).
   * @param {THREE.Mesh} mesh
   */
  updateFromMesh(mesh) {
    if (!mesh) return;
    mesh.updateMatrixWorld();
    const m = mesh.matrixWorld;
    const { p0, p1, p2, p3 } = this.corners;

    p0.value.copy(_corner.set(-0.5, -0.5, 0)).applyMatrix4(m);
    if (this.flipWinding) {
      p1.value.copy(_corner.set(-0.5, 0.5, 0)).applyMatrix4(m);
      p2.value.copy(_corner.set(0.5, 0.5, 0)).applyMatrix4(m);
      p3.value.copy(_corner.set(0.5, -0.5, 0)).applyMatrix4(m);
    } else {
      p1.value.copy(_corner.set(0.5, -0.5, 0)).applyMatrix4(m);
      p2.value.copy(_corner.set(0.5, 0.5, 0)).applyMatrix4(m);
      p3.value.copy(_corner.set(-0.5, 0.5, 0)).applyMatrix4(m);
    }
  }

  /**
   * Build the additive light contribution for a material and chain it onto
   * its emissiveNode.
   * @param {THREE.NodeMaterial} material
   * @param {object} [options]
   * @param {*} [options.baseColor] - vec3 node (defaults to white)
   * @param {*} [options.metalness] - float node or number (default 0)
   * @param {*} [options.roughness] - float node or number (default 0.5)
   * @param {*} [options.normalNode] - world-space normal override
   * @param {number} [options.intensityScale]
   */
  applyTo(
    material,
    {
      baseColor = null,
      metalness = 0,
      roughness = 0.5,
      normalNode = null,
      intensityScale = 1,
    } = {},
  ) {
    const base = baseColor ?? vec3(1.0);
    const metal = typeof metalness === "number" ? float(metalness) : metalness;
    const rough = typeof roughness === "number" ? float(roughness) : roughness;

    const diffuseColor = base.mul(metal.oneMinus());
    const F0 = mix(vec3(0.04), base, metal);

    let contribution = screenLightNode({
      corners: this.corners,
      ltcTex1: this.ltcTex1,
      ltcTex2: this.ltcTex2,
      lightTextureNode: this.lightTextureNode,
      blurredLightNode: this.blurredLightNode,
      intensity: this.intensity,
      color: this.color,
      blur: this.blur,
      diffuseColor,
      F0,
      roughness: rough,
      normalNode,
    });

    if (intensityScale !== 1) {
      contribution = contribution.mul(float(intensityScale));
    }

    material.emissiveNode = material.emissiveNode
      ? material.emissiveNode.add(contribution)
      : contribution;
    return contribution;
  }
}
