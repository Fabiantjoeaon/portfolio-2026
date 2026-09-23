import {
  texture,
  uv,
  uniform,
  vec2,
  vec3,
  vec4,
  renderOutput,
  mix,
  step,
  float,
  min,
  screenCoordinate,
} from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import * as THREE from "three/webgpu";
import { createWorldSpaceNodes } from "../utils/WorldSpaceNodes.js";

/**
 * Fullscreen post material that blends scenes with proper depth compositing.
 * Uses a unified depth approach: min(screenDepth, persistentDepth) creates
 * a single "persistent layer depth" that's compared against scene depth.
 *
 * Compositing order (back to front):
 * 1. Screen (persistent scene gradient plane)
 * 2. Active scene (prev/next blended)
 * 3. Persistent scene foreground (glass tiles)
 */
export class PostProcessingMaterial {
  constructor() {
    this.material = new MeshBasicNodeMaterial();

    // Uniform mix factor (0..1)
    this.mixNode = uniform(0.0);

    // Inputs
    this.prevTex = null;
    this.nextTex = null;
    this.prevNormal = null;
    this.prevDepth = null;
    this.nextNormal = null;
    this.nextDepth = null;
    this.persistentTex = null;
    this.persistentDepth = null;
    this.screenTex = null;
    this.screenDepthTex = null;

    this.transition = null;
    this.postprocessingChain = null;
    this.prevSceneChain = null;
    this.nextSceneChain = null;
    this.camera = null;
    this.outputToneMapping = null;
    this.outputColorSpace = null;

    // Camera uniforms for volumetric effects
    this.cameraNear = uniform(0.1);
    this.cameraFar = uniform(1000);
    this.cameraProjectionMatrix = uniform(new THREE.Matrix4());
    this.cameraProjectionMatrixInverse = uniform(new THREE.Matrix4());
    this.cameraMatrixWorld = uniform(new THREE.Matrix4());

    this.uvNode = uv();

    this.rebuildGraph();
  }

  /**
   * Lazy per-scene world-space bundle (depth / worldPosition / worldNormal)
   * reconstructed from the scene's depth texture. Shared by transitions and
   * the postprocessing chain — nodes are only built when actually used.
   */
  _createWorldSpace(depthTexture) {
    if (!depthTexture) return null;
    return createWorldSpaceNodes({
      depthTexture,
      uvNode: this.uvNode,
      projectionMatrixInverse: this.cameraProjectionMatrixInverse,
      matrixWorld: this.cameraMatrixWorld,
    });
  }

  /**
   * Update camera uniforms for effects that need depth reconstruction.
   * Call this before rendering when camera changes.
   */
  setCameraData(camera) {
    if (!camera) return;

    this.camera = camera;
    this.cameraNear.value = camera.near;
    this.cameraFar.value = camera.far;

    // Copy projection matrix
    this.cameraProjectionMatrix.value.copy(camera.projectionMatrix);

    // Compute inverse projection matrix
    this.cameraProjectionMatrixInverse.value
      .copy(camera.projectionMatrix)
      .invert();

    // Copy camera world matrix (inverse view matrix)
    this.cameraMatrixWorld.value.copy(camera.matrixWorld);
  }

  rebuildGraph() {
    // DEBUG: Set to true to visualize screen texture directly
    const debugShowScreen = false;

    if (debugShowScreen && this.screenTex) {
      this.material.colorNode = texture(this.screenTex, this.uvNode);
      this.material.needsUpdate = true;
      return;
    }

    // Need at least prev texture to render anything
    if (!this.prevTex) {
      // Nothing to render yet
      this.material.colorNode = vec3(0, 0, 0);
      this.material.needsUpdate = true;
      return;
    }

    // Fallback: if no transition, just show prev texture directly
    if (!this.transition && !this.prevSceneChain?.length) {
      this.material.colorNode = texture(this.prevTex, this.uvNode).rgb;
      this.material.needsUpdate = true;
      return;
    }

    // If we have prev and next textures with a transition, use full blend
    // Otherwise fall back to just prev texture
    const hasFullBlend = this.prevTex && this.nextTex && this.transition;

    if (hasFullBlend || this.prevTex) {
      // Per-scene world-space bundles (lazy — zero cost when unused)
      const prevWorld = this._createWorldSpace(this.prevDepth);
      const nextWorld = this.nextDepth === this.prevDepth
        ? prevWorld
        : this._createWorldSpace(this.nextDepth);

      const applySceneEffects = (tex, world, chain) => {
        let result = texture(tex, this.uvNode).rgb;
        for (const effect of chain ?? []) {
          result = effect(result, {
            uvNode: this.uvNode,
            world,
            cameraMatrixWorld: this.cameraMatrixWorld,
            cameraProjectionMatrixInverse: this.cameraProjectionMatrixInverse,
          });
        }
        return result;
      };
      const prevColor = applySceneEffects(this.prevTex, prevWorld, this.prevSceneChain);
      const sameScene = this.nextTex === this.prevTex && this.nextSceneChain === this.prevSceneChain;
      const nextColor = hasFullBlend && !sameScene
        ? applySceneEffects(this.nextTex, nextWorld, this.nextSceneChain)
        : prevColor;

      // Get the active scene blend (prev/next transition) or just prev if no blend
      const sceneColorNode = hasFullBlend
        ? this.transition.buildColorNode({
            uvNode: this.uvNode,
            mixNode: this.mixNode,
            prevTex: this.prevTex,
            prevNormal: this.prevNormal,
            prevDepth: this.prevDepth,
            nextTex: this.nextTex,
            nextNormal: this.nextNormal,
            nextDepth: this.nextDepth,
            prevWorld,
            nextWorld,
            prevColor,
            nextColor,
          })
        : prevColor;

      // Start with scene color as base
      let colorNode = sceneColorNode;

      // ═══════════════════════════════════════════════════════════════════
      // UNIFIED DEPTH APPROACH
      // Combine background depth + persistent (tiles) depth into one
      // Compare unified persistent depth against scene depth
      // ═══════════════════════════════════════════════════════════════════

      // Get blended scene depth (active scene) — shares the bundles' depth
      // reads with the transition instead of duplicating texture samples
      const prevDepthSample = prevWorld ? prevWorld.depth : float(1.0);
      const blendedSceneDepth = nextWorld
        ? mix(prevDepthSample, nextWorld.depth, this.mixNode)
        : prevDepthSample;

      // Get persistent layer depths
      const tilesDepth = this.persistentDepth
        ? texture(this.persistentDepth, this.uvNode).x
        : float(1.0);
      const screenDepth = this.screenDepthTex
        ? texture(this.screenDepthTex, this.uvNode).x
        : float(1.0);

      // Combined persistent depth = min(screen, tiles)
      // This creates a single depth value for the entire persistent layer
      const unifiedPersistentDepth = min(tilesDepth, screenDepth);

      // ═══════════════════════════════════════════════════════════════════
      // COMPOSITING WITH UNIFIED DEPTH
      // Persistent layer (screen + tiles) vs Active scene
      // ═══════════════════════════════════════════════════════════════════

      // Depth test: is persistent layer closer than scene?
      // step(a, b) returns 1 if b >= a
      const persistentCloserThanScene = step(
        unifiedPersistentDepth,
        blendedSceneDepth
      );

      // Sample textures
      const screenSample = this.screenTex
        ? texture(this.screenTex, this.uvNode)
        : null;
      const persistentSample = this.persistentTex
        ? texture(this.persistentTex, this.uvNode)
        : null;

      // Build the persistent layer color:
      // - Start with screen where it exists (alpha > 0)
      // - Layer tiles on top where they exist (tiles are always in front of screen)
      if (screenSample) {
        // Build persistent layer: screen first, then tiles on top
        let persistentColor = screenSample.rgb;

        if (persistentSample) {
          // Tiles render on top of screen based on tile alpha
          persistentColor = mix(
            persistentColor,
            persistentSample.rgb,
            persistentSample.a
          );
        }

        // Composite persistent layer over scene using depth test
        // Also use screen alpha to handle transparent areas
        const persistentAlpha = screenSample.a.max(
          persistentSample ? persistentSample.a : float(0.0)
        );

        colorNode = mix(
          colorNode,
          persistentColor,
          persistentCloserThanScene.mul(persistentAlpha)
        );
      } else if (persistentSample) {
        // No screen, just tiles
        colorNode = mix(
          colorNode,
          persistentSample.rgb,
          persistentCloserThanScene.mul(persistentSample.a)
        );
      }

      // Apply optional postprocessing chain after compositing persistent layer
      if (
        Array.isArray(this.postprocessingChain) &&
        this.postprocessingChain.length > 0
      ) {
        const context = {
          uvNode: this.uvNode,
          mixNode: this.mixNode,
          prevTex: this.prevTex,
          prevNormal: this.prevNormal,
          prevDepth: this.prevDepth,
          nextTex: this.nextTex,
          nextNormal: this.nextNormal,
          nextDepth: this.nextDepth,
          // Per-scene world-space bundles (depth / worldPosition / worldNormal)
          prevWorld,
          nextWorld,
          // Camera uniforms for volumetric effects (world position reconstruction)
          camera: this.camera,
          cameraNear: this.cameraNear,
          cameraFar: this.cameraFar,
          cameraProjectionMatrix: this.cameraProjectionMatrix,
          cameraProjectionMatrixInverse: this.cameraProjectionMatrixInverse,
          cameraMatrixWorld: this.cameraMatrixWorld,
        };

        for (const fx of this.postprocessingChain) {
          colorNode = fx(colorNode, context);
        }

        if (!this.camera) this._needsRebuild = true;
      }

      // Interleaved gradient noise dither: the gbuffers are half-float, so
      // banding only appears when this pass quantizes smooth dark gradients
      // to the 8-bit swapchain. ±1 LSB of noise breaks the bands invisibly.
      const ign = screenCoordinate.xy
        .dot(vec2(0.06711056, 0.00583715))
        .fract()
        .mul(52.9829189)
        .fract();
      colorNode = colorNode.add(ign.sub(0.5).mul(2 / 255));

      this.material.colorNode = this.outputToneMapping !== null
        ? renderOutput(vec4(vec3(colorNode), 1), this.outputToneMapping, this.outputColorSpace)
        : colorNode;

      // Force material to recognize the shader node change
      this.material.needsUpdate = true;
    }
  }

  setInputs(inputs) {
    const {
      prev,
      next,
      prevNormal,
      prevDepth,
      nextNormal,
      nextDepth,
      persistent,
      persistentDepth,
      screen,
      screenDepth,
    } = inputs;
    let graphDirty = false;

    // Update textures and check for changes
    if (prev && prev !== this.prevTex) {
      this.prevTex = prev;
      graphDirty = true;
    }

    if (next && next !== this.nextTex) {
      this.nextTex = next;
      graphDirty = true;
    }

    if (persistent !== undefined && persistent !== this.persistentTex) {
      this.persistentTex = persistent;
      graphDirty = true;
    }

    if (screen !== undefined && screen !== this.screenTex) {
      this.screenTex = screen;
      graphDirty = true;
    }

    if (screenDepth !== undefined && screenDepth !== this.screenDepthTex) {
      this.screenDepthTex = screenDepth;
      graphDirty = true;
    }

    // Update optional attachments (sticky: keep existing if undefined)
    if (prevNormal !== undefined) this.prevNormal = prevNormal;
    if (prevDepth !== undefined) this.prevDepth = prevDepth;
    if (nextNormal !== undefined) this.nextNormal = nextNormal;
    if (nextDepth !== undefined) this.nextDepth = nextDepth;
    if (persistentDepth !== undefined) this.persistentDepth = persistentDepth;

    // Rebuild only when textures change OR when transition was updated
    if (graphDirty || this._needsRebuild) {
      this.rebuildGraph();
      this._needsRebuild = false;
    }
  }

  setMix(value) {
    this.mixNode.value = value;
  }

  setOutputTransform(toneMapping, colorSpace) {
    if (this.outputToneMapping === toneMapping && this.outputColorSpace === colorSpace) return;
    this.outputToneMapping = toneMapping;
    this.outputColorSpace = colorSpace;
    this._needsRebuild = true;
  }

  setScenePostprocessing(prevChain, nextChain) {
    if (this.prevSceneChain !== prevChain || this.nextSceneChain !== nextChain) {
      this.prevSceneChain = prevChain;
      this.nextSceneChain = nextChain;
      this._needsRebuild = true;
    }
  }

  setTransition(transition) {
    const changed = transition !== this.transition;
    this.transition = transition ?? null;
    // Mark that we need to rebuild on next setInputs call
    if (changed) {
      this._needsRebuild = true;
    }
  }

  /**
   * Set a chain of postprocessing functions to be applied after the transition blend.
   * Each function receives (colorNode, context) and should return a new node.
   * This is intended to be updated on scene/transition changes, not per-frame.
   */
  setPostprocessingChain(chain) {
    const nextChain = Array.isArray(chain) ? chain : null;
    const changed = nextChain !== this.postprocessingChain;
    this.postprocessingChain = nextChain;
    if (changed) {
      this._needsRebuild = true;
    }
  }
}
