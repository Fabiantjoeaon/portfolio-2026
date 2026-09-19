import { texture, getNormalFromDepth } from "three/tsl";
import { ssao } from "three/addons/tsl/display/SSAONode.js";

/**
 * Official three.js TSL SSAO (`SSAONode`), adapted to this repo's
 * (colorNode, context) post chain. Normals are reconstructed with
 * `getNormalFromDepth` because the scene GBuffer has depth only.
 *
 * @param {Object} [options]
 * @param {number} [options.intensity=1.25]
 * @param {number} [options.radius=4]
 * @param {number} [options.bias=0.025]
 * @param {number} [options.samples=16]
 * @returns {Function} (colorNode, context) => Node
 */
export function createSSAO({
  intensity = 1.25,
  radius = 4,
  bias = 0.025,
  samples = 16,
} = {}) {
  let pass = null;
  let depthNode = null;
  let cameraRef = null;

  const apply = (colorNode, context) => {
    const depthTex = context.prevDepth;
    const camera = context.camera;
    if (!depthTex || !camera) return colorNode;

    if (!pass || cameraRef !== camera) {
      cameraRef = camera;
      depthNode = texture(depthTex);
      pass = ssao(depthNode, texture(depthTex), camera);
      pass.normalNode.sample = (uvNode) =>
        getNormalFromDepth(
          uvNode,
          depthNode.value,
          pass._cameraProjectionMatrixInverse
        );
    } else {
      depthNode.value = depthTex;
    }

    pass.intensity.value = intensity;
    pass.radius.value = radius;
    pass.bias.value = bias;
    pass.samples.value = samples;

    return colorNode.mul(pass.getTextureNode().r);
  };

  apply.dispose = () => {
    pass?.dispose();
    pass = null;
    depthNode = null;
    cameraRef = null;
  };

  return apply;
}
