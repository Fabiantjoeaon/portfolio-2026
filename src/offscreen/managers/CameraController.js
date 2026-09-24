import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { inOutQuad } from "../lib/easing.js";
import { HoverControls } from "./HoverControls.js";
import { lerp } from "../lib/math.js";

/**
 * Manages a shared camera instance with state interpolation.
 * Handles smooth transitions between scene-specific camera states.
 * Optionally enables OrbitControls in debug mode.
 */
export class CameraController {
  constructor(renderer, debug = false) {
    // Create the shared camera instance
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 5);

    this.debug = debug;
    this.controls = null;
    this.renderer = renderer;

    this.v0 = new THREE.Vector3();

    this.fromState = {
      position: new THREE.Vector3().copy(this.camera.position),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: this.camera.fov,
      hoverPos: new THREE.Vector3(1, 1, 0),
      hoverRate: 0.05,
    };

    this.toState = {
      position: new THREE.Vector3().copy(this.camera.position),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: this.camera.fov,
      hoverPos: new THREE.Vector3(1, 1, 0),
      hoverRate: 0.05,
    };

    this.hoverControls = new HoverControls({
      pos: this.fromState.hoverPos.clone(),
      rot: new THREE.Vector3(0, 0, 0),
      rate: this.fromState.hoverRate,
    });
  }

  _copyHover(target, state) {
    if (state?.hoverPos) target.hoverPos.copy(state.hoverPos);
    else target.hoverPos.set(1, 1, 0);
    target.hoverRate = state?.hoverRate ?? 0.05;
  }

  /**
   * Initialize OrbitControls with a DOM element
   * Called after renderer is available
   */
  initOrbitControls(domElement) {
    if (this.debug && domElement) {
      this.controls = new OrbitControls(this.camera, domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.target.copy(this.fromState.lookAt);
    }
  }

  /**
   * Set up the transition between two camera states
   * @param {Object} fromState - Starting camera state { position, lookAt, fov }
   * @param {Object} toState - Ending camera state { position, lookAt, fov }
   */
  setTransitionStates(fromState, toState) {
    if (fromState) {
      if (fromState.position) this.fromState.position.copy(fromState.position);
      if (fromState.lookAt) this.fromState.lookAt.copy(fromState.lookAt);
      if (fromState.fov !== undefined) this.fromState.fov = fromState.fov;
      this._copyHover(this.fromState, fromState);
    }

    if (toState) {
      if (toState.position) this.toState.position.copy(toState.position);
      if (toState.lookAt) this.toState.lookAt.copy(toState.lookAt);
      if (toState.fov !== undefined) this.toState.fov = toState.fov;
      this._copyHover(this.toState, toState);
    }
  }

  /**
   * Snap camera to a state immediately (no interpolation)
   * @param {Object} state - { position: Vector3, lookAt: Vector3, fov: number }
   */
  snapToState(state) {
    if (state.position) {
      this.fromState.position.copy(state.position);
      this.toState.position.copy(state.position);
      this.camera.position.copy(state.position);
    }

    if (state.lookAt) {
      this.fromState.lookAt.copy(state.lookAt);
      this.toState.lookAt.copy(state.lookAt);
      this.camera.lookAt(state.lookAt);
    }

    if (state.fov !== undefined) {
      this.fromState.fov = state.fov;
      this.toState.fov = state.fov;
      this.camera.fov = state.fov;
    }

    this._copyHover(this.fromState, state);
    this._copyHover(this.toState, state);
    if (state.hoverPos) this.hoverControls.pos.copy(state.hoverPos);
    if (state.hoverRate != null) this.hoverControls.rate = state.hoverRate;

    this.camera.updateProjectionMatrix();

    if (this.controls) {
      this.controls.target.copy(this.fromState.lookAt);
      this.controls.update();
    }
  }

  /**
   * Update camera state with interpolation between fromState and toState
   * @param {number} transitionProgress - 0 to 1, where 0 is fromState and 1 is toState
   * @param {number} delta - Time delta in seconds
   */
  update(transitionProgress = 0, delta = 0) {
    // If orbit controls are enabled and active, let them control the camera
    if (this.controls && this.debug) {
      this.controls.update();
      // Update from state to match controls (for when we exit debug mode)
      this.fromState.position.copy(this.camera.position);
      this.fromState.lookAt.copy(this.controls.target);
      return;
    }

    // Interpolate between from and to state using fixed reference points
    const t = THREE.MathUtils.clamp(transitionProgress, 0, 1);

    // Smooth interpolation using easing
    const eased = inOutQuad(t);

    // Interpolate position (from fixed fromState to fixed toState)
    this.camera.position.lerpVectors(
      this.fromState.position,
      this.toState.position,
      eased
    );

    // Update hover controls
    if (!this.debug || !this.controls) {
      this.hoverControls.pos.lerpVectors(
        this.fromState.hoverPos,
        this.toState.hoverPos,
        eased,
      );
      this.hoverControls.rate = lerp(
        this.fromState.hoverRate,
        this.toState.hoverRate,
        eased,
      );
      this.hoverControls.update(delta);
      // Apply position sway BEFORE lookAt - creates parallax effect
      this.camera.position.add(this.hoverControls.currentPosOffset);
    }

    // Interpolate lookAt target
    this.v0.lerpVectors(this.fromState.lookAt, this.toState.lookAt, eased);

    // Always look at the target - this keeps the camera locked to world center
    this.camera.lookAt(this.v0);

    // Interpolate FOV
    this.camera.fov = lerp(this.fromState.fov, this.toState.fov, eased);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Update camera aspect ratio
   */
  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this.controls) {
      this.controls.dispose();
    }
  }
}

