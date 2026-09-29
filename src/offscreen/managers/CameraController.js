import { cameraFov } from "@/shared/cameraFraming";
import { mobileSettings } from "@/shared/mobileSettings";
import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EASE_CUSTOM_3, timingEase } from "../lib/customEases.js";
import { HoverControls } from "./HoverControls.js";
import { lerp } from "../lib/math.js";
import { getFlag } from '@/offscreen/lib/query';
import { timings } from '@/shared/timings';

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
    this.touch = getFlag('touchExperience');

    this.v0 = new THREE.Vector3();

    // Home <-> page wipes render the incoming scene through its own camera,
    // so both scenes zoom the same way. direction: 1 forwards, -1 back, 0 off.
    this.nextCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    this.zoom = { progress: 0, direction: 0 };

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

  _updateFov() {
    const from = this._fromCameraState ?? this.fromState;
    const to = this._toCameraState ?? this.toState;
    this.camera.fov = lerp(cameraFov(from, this.camera.aspect, this.touch),
      cameraFov(to, this.camera.aspect, this.touch), this._fovMix ?? 0);
    this.camera.updateProjectionMatrix();
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
      this._fromCameraState = fromState;
      if (fromState.position) this.fromState.position.copy(fromState.position);
      if (fromState.lookAt) this.fromState.lookAt.copy(fromState.lookAt);
      if (fromState.fov !== undefined) this.fromState.fov = fromState.fov;
      this._copyHover(this.fromState, fromState);
    }

    if (toState) {
      this._toCameraState = toState;
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
    this._fromCameraState = this._toCameraState = state;
    this._fovMix = 0;
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
      this._updateFov();
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
  update(transitionProgress = 0, delta = 0, ease = EASE_CUSTOM_3) {
    this._fovMix = ease(THREE.MathUtils.clamp(transitionProgress, 0, 1));
    this._updateFov();
    // If orbit controls are enabled and active, let them control the camera
    if (this.controls?.enabled && this.debug) {
      this.controls.update();
      // Update from state to match controls (for when we exit debug mode)
      this.fromState.position.copy(this.camera.position);
      this.fromState.lookAt.copy(this.controls.target);
      return;
    }

    if (this.zoom.direction) {
      this._updateZoom(delta);
      return;
    }

    // Interpolate between from and to state using fixed reference points
    const t = THREE.MathUtils.clamp(transitionProgress, 0, 1);

    // Smooth interpolation using easing
    const eased = ease(t);

    // Interpolate position (from fixed fromState to fixed toState)
    this.camera.position.lerpVectors(
      this.fromState.position,
      this.toState.position,
      eased
    );

    // Apply position sway BEFORE lookAt - creates parallax effect
    this._updateHover(eased, delta);
    this.camera.position.add(this.hoverControls.currentPosOffset);

    // Interpolate lookAt target
    this.v0.lerpVectors(this.fromState.lookAt, this.toState.lookAt, eased);

    // Always look at the target - this keeps the camera locked to world center
    this.camera.lookAt(this.v0);
  }

  _updateHover(eased, delta) {
    if (this.debug && this.controls) return;
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
    this.hoverControls.multiplier = this.touch ? mobileSettings.hoverStrength : 1;
    this.hoverControls.update(delta);
  }

  /**
   * Each scene keeps its own pose; only its distance to the target scales.
   * Exponential scaling gives both cameras the same zoom speed, so the wipe
   * front reads as one continuous move instead of two cameras meeting.
   */
  _updateZoom(delta) {
    const { zoomFactor, ease, startAt, endAt } = timings.cameraZoom;
    const progress = this.zoom.progress >= endAt ? 1 :
      (this.zoom.progress - startAt) / Math.max(endAt - startAt, 1e-3);
    const t = timingEase(ease)(THREE.MathUtils.clamp(progress, 0, 1));
    const k = zoomFactor * this.zoom.direction;
    this._updateHover(t, delta);
    this._placeZoomed(this.camera, this.fromState, this._fromCameraState, Math.exp(-k * t));
    this._placeZoomed(this.nextCamera, this.toState, this._toCameraState, Math.exp(k * (1 - t)));
  }

  /** Loader -> home: the current scene's camera eases in to its resting distance. */
  updateIntro(progress, delta) {
    if (this.controls?.enabled && this.debug) return;
    const { zoomFrom, zoomEase } = timings.startup;
    const t = timingEase(zoomEase)(THREE.MathUtils.clamp(progress, 0, 1));
    this._updateHover(0, delta);
    this._placeZoomed(this.camera, this.fromState, this._fromCameraState, lerp(zoomFrom, 1, t));
  }

  _placeZoomed(camera, state, cameraState, scale) {
    camera.position.subVectors(state.position, state.lookAt).multiplyScalar(scale).add(state.lookAt);
    camera.position.add(this.hoverControls.currentPosOffset);
    camera.lookAt(state.lookAt);
    camera.fov = cameraFov(cameraState ?? state, camera.aspect, this.touch);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /**
   * Update camera aspect ratio
   */
  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.nextCamera.aspect = aspect;
    this._updateFov();
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
