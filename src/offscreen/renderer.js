import * as THREE from "three/webgpu";
import { component } from "@/offscreen/dispatcher";
import { camera, scene } from "@/offscreen/main";
import dispatcher from "@/shared/dispatcher";

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
    this._isDeviceLost = false;
    this._isRecovering = false;
    this._canvas = canvas;
    this._isWebGPU = isWebGPU;

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

    // Set up device lost handler
    this._setupDeviceLostHandler();
  }

  /**
   * Set up handler for WebGPU device lost events
   */
  _setupDeviceLostHandler() {
    // The WebGPURenderer emits device lost through its internal backend
    // We can intercept by checking the backend's device
    const checkDevice = () => {
      const backend = this.backend;
      if (backend?.device?.lost) {
        backend.device.lost.then((info) => {
          this._handleDeviceLost(info);
        });
      }
    };

    // Check after init completes
    const originalInit = this.init.bind(this);
    this.init = async () => {
      const result = await originalInit();
      checkDevice();
      return result;
    };
  }

  /**
   * Handle WebGPU device lost event
   */
  async _handleDeviceLost(info) {
    if (this._isRecovering) return;

    this._isDeviceLost = true;
    console.warn("WebGPU device lost:", info?.message || "Unknown reason");

    // Notify the application
    dispatcher.trigger(
      { name: "deviceLost" },
      { reason: info?.reason, message: info?.message }
    );

    // Attempt recovery after a short delay
    if (info?.reason !== "destroyed") {
      this._isRecovering = true;
      console.log("Attempting WebGPU device recovery...");

      // Wait a bit before attempting recovery
      await new Promise((resolve) => setTimeout(resolve, 100));

      try {
        // Re-initialize the renderer
        await this.init();
        this._isDeviceLost = false;
        this._isRecovering = false;
        console.log("WebGPU device recovered successfully");

        // Notify successful recovery
        dispatcher.trigger({ name: "deviceRestored" }, {});
      } catch (error) {
        console.error("Failed to recover WebGPU device:", error);
        this._isRecovering = false;
      }
    }
  }

  /**
   * Check if the device is currently valid for rendering
   */
  get isDeviceValid() {
    return !this._isDeviceLost && !this._isRecovering;
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

    if (!this.sceneCompiled || !this.isDeviceValid) {
      return;
    }

    // Render is now handled by SceneManager
    // this.render( scene, camera );
  }

  /**
   * Safe wrapper for compute shader dispatch
   * Returns false if the device is not valid
   */
  safeCompute(computeNode) {
    if (!this.isDeviceValid) {
      return false;
    }

    try {
      this.compute(computeNode);
      return true;
    } catch (error) {
      // Check if this is a device lost error
      if (
        error.message?.includes("Instance") ||
        error.message?.includes("device") ||
        error.name === "OperationError"
      ) {
        console.warn(
          "Compute shader failed due to device state:",
          error.message
        );
        return false;
      }
      throw error;
    }
  }

  /**
   * Safe wrapper for render calls
   * Returns false if the device is not valid
   */
  safeRender(scene, camera) {
    if (!this.isDeviceValid) {
      return false;
    }

    try {
      this.render(scene, camera);
      return true;
    } catch (error) {
      // Check if this is a device lost error
      if (
        error.message?.includes("Instance") ||
        error.message?.includes("device") ||
        error.name === "OperationError"
      ) {
        console.warn("Render failed due to device state:", error.message);
        return false;
      }
      throw error;
    }
  }
}

export default RendererImpl;
