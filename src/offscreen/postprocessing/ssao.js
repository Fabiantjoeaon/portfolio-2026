import { texture } from "three/tsl";
import * as THREE from "three/webgpu";
import { N8AONode } from "n8ao-webgpu";

/**
 * N8AO (WebGPU/TSL) as a (colorNode, context) post chain stage.
 * Runs as its own multi-pass TempNode; the chain only samples the AO.
 *
 * @param {Object} [options]
 * @param {THREE.Object3D} [options.scene]
 * @param {number} [options.aoRadius=5]
 * @param {number} [options.radius] - alias for aoRadius
 * @param {number} [options.distanceFalloff=1]
 * @param {number} [options.intensity=5]
 * @param {"Performance"|"Low"|"Medium"|"High"|"Ultra"} [options.quality="Medium"]
 * @param {boolean} [options.halfRes=false]
 * @param {THREE.Color} [options.color]
 * @returns {Function} (colorNode, context) => Node
 */
export function createSSAO({
  scene,
  aoRadius,
  radius,
  distanceFalloff = 1,
  intensity = 5,
  quality = "Medium",
  halfRes = false,
  color,
} = {}) {
  const fallbackScene = scene ?? new THREE.Scene();
  const radiusValue = aoRadius ?? radius ?? 5;

  let pass = null;
  let beautyNode = null;
  let depthNode = null;
  let cameraRef = null;
  let beautyTexRef = null;
  let depthTexRef = null;

  const applyConfig = (node) => {
    node.configuration.gammaCorrection = false;
    // Assigning this key disables N8AO's auto-detect, which would otherwise
    // re-render the scene into extra targets during the post pass.
    node.configuration.transparencyAware = true;
    node.configuration.transparencyAware = false;
    node.configuration.halfRes = halfRes;
    node.setQualityMode(quality);
    node.configuration.aoRadius = radiusValue;
    node.configuration.distanceFalloff = distanceFalloff;
    node.configuration.intensity = intensity;
    if (color) node.configuration.color.copy(color);
    node.setDisplayMode("AO");
  };

  const apply = (colorNode, context) => {
    const depthTex = context.prevDepth;
    const beautyTex = context.prevTex;
    const camera = context.camera;
    if (!depthTex || !beautyTex || !camera) return colorNode;

    if (
      !pass ||
      cameraRef !== camera ||
      beautyTexRef !== beautyTex ||
      depthTexRef !== depthTex
    ) {
      pass?.dispose();
      cameraRef = camera;
      beautyTexRef = beautyTex;
      depthTexRef = depthTex;
      beautyNode = texture(beautyTex);
      depthNode = texture(depthTex);
      pass = new N8AONode({
        beautyNode,
        beautyTexture: beautyTex,
        depthNode,
        depthTexture: depthTex,
        normalNode: null,
        normalTexture: null,
        scenePassNode: null,
        scene: fallbackScene,
        camera,
      });
      applyConfig(pass);
    }

    return colorNode.mul(pass.getTextureNode().rgb);
  };

  apply.dispose = () => {
    pass?.dispose();
    pass = null;
    beautyNode = null;
    depthNode = null;
    cameraRef = null;
    beautyTexRef = null;
    depthTexRef = null;
  };

  return apply;
}
