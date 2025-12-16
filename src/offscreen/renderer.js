import * as THREE from "three/webgpu";
import { component } from "@/offscreen/dispatcher";
import { camera, scene } from "@/offscreen/main";

import {
  pass,
  mrt,
  output,
  transformedNormalView,
  renderOutput,
} from "three/tsl";

import { afterImage } from "three/addons/tsl/display/AfterImageNode.js";

class RendererImpl extends component(THREE.WebGPURenderer, {
  raf: {
    renderPriority: Infinity,
  },
}) {
  constructor({ canvas, isWebGPU }) {
    super({
      canvas,
      antialias: true,
      alpha: true,
      // pixelRatio: 1,
      powerPreference: "high-performance",
      forceWebGL: !isWebGPU,
      requiredLimits: {
        maxStorageBuffersPerShaderStage: 10,
        // maxTextureDimension2D: 16384,
      },
    });

    this.countRenderBeforeStart = 0;
    this._compiled = false;

    this.shadowMap.enabled = true;
    this.shadowMap.type = THREE.BasicShadowMap;
    this.pass = pass(scene, camera);

    this.pass.setMRT(
      mrt({
        output: output,
        normal: transformedNormalView,
      })
    );

    const scenePassColor = this.pass.getTextureNode("output");

    const outputPass = renderOutput(
      scenePassColor,
      THREE.ACESFilmicToneMapping
    );

    this.postProcessing = new THREE.PostProcessing(this);

    this.postProcessing.outputColorTransform = false;
    this.postProcessing.outputNode = afterImage(outputPass);

    this.toneMapping = THREE.ACESFilmicToneMapping;
  }

  onResize({ width, height, dpr }) {
    this.setDrawingBufferSize(width, height, dpr);
  }
  onLoadEnd() {
    this.assetsLoaded = true;
  }
  onCompileEnd() {
    this.sceneCompiled = true;
  }

  onDebug() {}

  onThrottle() {}
  onRaf({ camera }) {
    // NOTE: Rendering is now handled by SceneManager for multi-pass GBuffer pipeline
    // This render loop is disabled to prevent double rendering
    // The SceneManager.render() is called from Site.onRaf()

    if (!this.sceneCompiled) {
      return;
    }

    // Render is now handled by SceneManager
    // this.render( scene, camera );
  }
}

export default RendererImpl;
