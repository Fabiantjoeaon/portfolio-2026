import {
  texture,
  Fn,
  If,
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
    this.startupProgress = uniform(1);
    this.startupTransition = null;

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
    this.transitionActive = true;
    this.postprocessingChain = null;
    this.prevSceneChain = null;
    this.nextSceneChain = null;
    this.camera = null;
    this.outputToneMapping = null;
    this.outputColorSpace = null;
    this._variants = new Map();
    this._objectIds = new WeakMap();
    this._nextObjectId = 1;
    this._knownEffects = new WeakSet();
    // One base node per input. Variants sample through these, so swapping
    // pooled gbuffers only rebinds textures instead of compiling a new graph.
    this._textureNodes = {};

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
  _input(key) {
    const value = this[key];
    if (!value) return null;
    let node = this._textureNodes[key];
    if (!node) node = this._textureNodes[key] = texture(value);
    else node.value = value;
    return node;
  }

  _syncInputs() {
    for (const [key, node] of Object.entries(this._textureNodes)) {
      if (this[key]) node.value = this[key];
    }
  }

  _createWorldSpace(depthKey) {
    const depthTexture = this._input(depthKey);
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
      this.material.colorNode = this._input("prevTex").sample(this.uvNode).rgb;
      this.material.needsUpdate = true;
      return;
    }

    // If we have prev and next textures with a transition, use full blend
    // Otherwise fall back to just prev texture
    const hasFullBlend = this.transitionActive && this.prevTex && this.nextTex && this.transition;

    if (hasFullBlend || this.prevTex) {
      // Per-scene world-space bundles (lazy — zero cost when unused)
      const prevWorld = this._createWorldSpace("prevDepth");
      const nextWorld = this.nextDepth === this.prevDepth
        ? prevWorld
        : this._createWorldSpace("nextDepth");

      const applySceneEffects = (key, world, chain) => {
        let result = this._input(key).sample(this.uvNode).rgb;
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
      const sameScene = this.nextTex === this.prevTex && this.nextSceneChain === this.prevSceneChain;
      const prevColorFn = (world) => applySceneEffects("prevTex", world, this.prevSceneChain);
      const nextColorFn = sameScene
        ? prevColorFn
        : (world) => applySceneEffects("nextTex", world, this.nextSceneChain);
      const prevColor = prevColorFn(prevWorld);
      const nextColor = hasFullBlend && !sameScene ? nextColorFn(nextWorld) : prevColor;

      // Get the active scene blend (prev/next transition) or just prev if no blend
      const sceneColorNode = hasFullBlend
        ? this.transition.buildColorNode({
            uvNode: this.uvNode,
            mixNode: this.mixNode,
            prevTex: this._input("prevTex"),
            prevNormal: this.prevNormal,
            prevDepth: this._input("prevDepth"),
            nextTex: this._input("nextTex"),
            nextNormal: this.nextNormal,
            nextDepth: this._input("nextDepth"),
            prevWorld,
            nextWorld,
            prevColor,
            nextColor,
            prevColorFn,
            nextColorFn,
          })
        : prevColor;

      // Start with scene color as base
      let colorNode = sceneColorNode;
      // Compiled during preparation, then driven only by a uniform on entry.
      // Reuse the first scene's actual depth/world positions for the black wipe.
      if (this.startupTransition) {
        colorNode = this.startupTransition.buildColorNode({
          uvNode: this.uvNode, mixNode: this.startupProgress,
          prevWorld, nextWorld: prevWorld, prevColor: vec3(0), nextColor: sceneColorNode,
        });
      }

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
        ? this._input("persistentDepth").sample(this.uvNode).x
        : float(1.0);
      const screenDepth = this.screenDepthTex
        ? this._input("screenDepthTex").sample(this.uvNode).x
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
        ? this._input("screenTex").sample(this.uvNode)
        : null;
      const persistentSample = this.persistentTex
        ? this._input("persistentTex").sample(this.uvNode)
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

        const sceneColor = colorNode;
        colorNode = Fn(() => {
          const coverage = persistentCloserThanScene.mul(persistentAlpha).toVar();
          const result = vec3(persistentColor).toVar();
          // Fully opaque screen pixels completely hide scene effects.
          // Avoid marching Ice's fog there; partial coverage still uses
          // exactly the same scene color, depth and alpha blend.
          If(coverage.lessThan(1), () => {
            result.assign(mix(sceneColor, persistentColor, coverage));
          });
          return result;
        })();
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
      if (this.startupTransition) {
        const revealed = colorNode;
        colorNode = Fn(() => {
          const result = vec3(0).toVar();
          If(this.startupProgress.greaterThan(0), () => {
            result.assign(revealed);
          });
          return result;
        })();
      }

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
    for (const [key, value] of Object.entries({ prevNormal, prevDepth, nextNormal, nextDepth, persistentDepth })) {
      if (value !== undefined && value !== this[key]) {
        this[key] = value;
        graphDirty = true;
      }
    }

    // Rebuild only when textures change OR when transition was updated
    if (graphDirty || this._needsRebuild) {
      this._selectVariant();
      this._needsRebuild = false;
    }
  }

  _selectVariant() {
    const id = (value) => {
      if (value == null || typeof value !== "object") return String(value);
      if (!this._objectIds.has(value)) this._objectIds.set(value, this._nextObjectId++);
      return this._objectIds.get(value);
    };
    // Structure only: texture identities are bound through _textureNodes.
    // MSAA depth compiles to texture_depth_multisampled_2d, so it can't share
    // a variant with single-sample depth.
    const depth = (value) => (value ? (value.renderTarget?.samples > 1 ? "ms" : "ss") : "");
    const key = [
      !!this.prevTex, !!this.nextTex, this.prevTex === this.nextTex,
      !!this.prevNormal, !!this.nextNormal,
      depth(this.prevDepth), depth(this.nextDepth), this.prevDepth === this.nextDepth,
      !!this.persistentTex, depth(this.persistentDepth),
      !!this.screenTex, depth(this.screenDepthTex), this.transitionActive,
      this.transitionActive ? this.transition : Boolean(this.transition),
      this.prevSceneChain, this.nextSceneChain, this.postprocessingChain,
      this.outputToneMapping, this.outputColorSpace,
    ].map(id).join("|");
    let material = this._variants.get(key);
    if (!material) {
      // Retain complete materials: reassigning colorNode on a single material
      // invalidates Three's render objects, even for previously seen graphs.
      this.material = this.material.clone();
      this.rebuildGraph();
      material = this.material;
      this._variants.set(key, material);
    }
    this.material = material;
    this._syncInputs();
  }

  clearVariants() {
    for (const material of this._variants.values()) material.dispose();
    this._variants.clear();
    this._needsRebuild = true;
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

  _trackEffects(chain, seen) {
    let changed = false;
    if (!chain) return changed;
    for (const effect of chain) {
      if (seen?.includes(effect)) continue;
      if (this._knownEffects.has(effect) && effect.needsRebuild?.()) changed = true;
      this._knownEffects.add(effect);
    }
    return changed;
  }

  setScenePostprocessing(prevChain, nextChain, transitionActive = true) {
    const effectsChanged = this._trackEffects(prevChain, null)
      | this._trackEffects(nextChain, prevChain);
    if (effectsChanged) this.clearVariants();
    if (this.prevSceneChain !== prevChain || this.nextSceneChain !== nextChain
      || this.transitionActive !== transitionActive
      || effectsChanged) {
      this.prevSceneChain = prevChain;
      this.nextSceneChain = nextChain;
      this.transitionActive = transitionActive;
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
