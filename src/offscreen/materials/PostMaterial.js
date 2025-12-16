import { texture, uv, uniform, vec3, mix, step, float, min } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import * as THREE from "three/webgpu";

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

    // Camera uniforms for volumetric effects
    this.cameraNear = uniform(0.1);
    this.cameraFar = uniform(1000);
    this.cameraProjectionMatrix = uniform(new THREE.Matrix4());
    this.cameraProjectionMatrixInverse = uniform(new THREE.Matrix4());
    this.cameraMatrixWorld = uniform(new THREE.Matrix4());

    this.rebuildGraph();

    this.uvNode = uv();
  }

  /**
   * Update camera uniforms for effects that need depth reconstruction.
   * Call this before rendering when camera changes.
   */
  setCameraData(camera) {
    if (!camera) return;

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

    if (this.prevTex && this.nextTex && this.transition) {
      // Get the active scene blend (prev/next transition)
      const sceneColorNode = this.transition.buildColorNode({
        uvNode: this.uvNode,
        mixNode: this.mixNode,
        prevTex: this.prevTex,
        prevNormal: this.prevNormal,
        prevDepth: this.prevDepth,
        nextTex: this.nextTex,
        nextNormal: this.nextNormal,
        nextDepth: this.nextDepth,
      });

      // Start with scene color as base
      let colorNode = sceneColorNode;

      // ═══════════════════════════════════════════════════════════════════
      // UNIFIED DEPTH APPROACH
      // Combine background depth + persistent (tiles) depth into one
      // Compare unified persistent depth against scene depth
      // ═══════════════════════════════════════════════════════════════════

      // Get blended scene depth (active scene)
      const prevDepthSample = this.prevDepth
        ? texture(this.prevDepth, this.uvNode).x
        : float(1.0);
      const blendedSceneDepth = this.nextDepth
        ? mix(
            prevDepthSample,
            texture(this.nextDepth, this.uvNode).x,
            this.mixNode
          )
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
          // Camera uniforms for volumetric effects (world position reconstruction)
          cameraNear: this.cameraNear,
          cameraFar: this.cameraFar,
          cameraProjectionMatrix: this.cameraProjectionMatrix,
          cameraProjectionMatrixInverse: this.cameraProjectionMatrixInverse,
          cameraMatrixWorld: this.cameraMatrixWorld,
        };

        for (const fx of this.postprocessingChain) {
          colorNode = fx(colorNode, context);
        }
      }

      this.material.colorNode = colorNode;

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
