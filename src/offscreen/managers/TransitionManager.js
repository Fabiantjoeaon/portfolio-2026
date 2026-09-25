import { EASE_CUSTOM_3, PAGE_EASE } from "../lib/customEases.js";
import { transitionDebug } from "../transitions/WorldPositionTransition.js";

export class TransitionManager {
  constructor(
    sceneManager,
    { idleMs = 4000, transitionMs = 1000, autoAdvance = true } = {},
  ) {
    this.sceneManager = sceneManager;
    this.idleMs = idleMs;
    this.transitionMs = transitionMs;
    this.autoAdvance = autoAdvance;
    this.sceneIds = [];
    this.sceneInstances = [];
    this.prevIdx = 0;
    this.nextIdx = 0;
    this.t0 = 0;
    this.lastNow = 0;
    this.phase = "idle"; // "idle" | "transition" | "pinned"
    this.transitionProgress = 0;

    // Pinned scene: a scene outside the auto-cycle (e.g. ProjectScene) the
    // manager transitions to and holds until exitPinned()
    this.pinnedId = null;
    this._pinnedTarget = null;
    this._transitionKind = null; // null | "enterPinned" | "exitPinned"
    this._scrubbing = false;
  }

  setSequence(sceneIds, sceneInstances) {
    this.sceneIds = sceneIds ?? [];
    this.sceneInstances = sceneInstances ?? [];
  }

  start(nowMs) {
    if (!this.sceneIds.length) return;
    this.prevIdx = 0;
    this.nextIdx = this.sceneIds.length > 1 ? 1 : 0;
    this.sceneManager.setActivePair(
      this.sceneIds[this.prevIdx],
      this.sceneIds[this.nextIdx],
    );
    // Begin in idle phase showing prev fully (mix = 0)
    this._applyTransitionFor(this.sceneInstances[this.prevIdx]);
    this.sceneManager.setMix(0);
    this.phase = "idle";
    this.t0 = nowMs ?? performance.now();
  }

  _applyNextTransition() {
    this._applyTransitionFor(this.sceneInstances[this.nextIdx]);
  }

  _applyTransitionFor(instance) {
    const transition = instance?.transition;
    const postprocessingChain = instance?.postprocessingChain;

    transition?.setOriginBelowGrid?.(this.sceneManager.persistent?.grid);

    if (this.sceneManager.post.material) {
      if (this.sceneManager.post.material.setTransition) {
        this.sceneManager.post.material.setTransition(transition);
      }

      if (this.sceneManager.post.material.setPostprocessingChain) {
        this.sceneManager.post.material.setPostprocessingChain(
          postprocessingChain,
        );
      }
    }
  }

  /**
   * Immediately start a transition to the scene at the given sequence index.
   * Ignored while a transition is already running.
   */
  transitionTo(targetIdx) {
    const len = this.sceneIds.length;
    if (!len || this.phase !== "idle") return;

    const idx = ((targetIdx % len) + len) % len;
    if (idx === this.prevIdx) return;

    this.nextIdx = idx;
    this.sceneManager.setActivePair(
      this.sceneIds[this.prevIdx],
      this.sceneIds[this.nextIdx],
    );
    this._applyNextTransition();
    this.sceneManager.setTransitioning(true);
    this.phase = "transition";
    this.t0 = this.lastNow;
  }

  next() {
    this.transitionTo(this.prevIdx + 1);
  }

  finishCycleSoon() {
    if (this.phase !== "transition" || this._transitionKind || this._cycleFinish) return;
    this._cycleFinish = {
      progress: Math.min(1, Math.max(0, (this.lastNow - this.t0) / this.transitionMs)),
      start: this.lastNow,
    };
  }

  /**
   * Transition to a scene outside the sequence and hold there (no
   * auto-advance) until exitPinned(). `immediate` snaps straight to it.
   * @returns {boolean} - False when a transition is already running
   */
  enterPinned(sceneId, instance, { immediate = false, delay = 0, duration = 0.75 } = {}) {
    if (this.phase === "transition" || this.pinnedId !== null) return false;
    this._scrubbing = false;

    if (immediate) {
      this.transitionProgress = 1;
      this._applyTransitionFor(instance);
      this.pinnedId = sceneId;
      this.sceneManager.setActivePair(sceneId, sceneId);
      if (instance?.cameraState) {
        this.sceneManager.cameraController.snapToState(instance.cameraState);
      }
      this.sceneManager.setMix(0);
      this.sceneManager.setTransitioning(false);
      this.phase = "pinned";
      return true;
    }

    this._pinnedTarget = { id: sceneId, instance };
    this.transitionProgress = 0;
    this._pinnedTiming = { delay: delay * 1000, duration: duration * 1000 };
    this.sceneManager.setActivePair(this.sceneIds[this.prevIdx], sceneId);
    this._applyTransitionFor(instance);
    this.sceneManager.setTransitioning(true);
    this._transitionKind = "enterPinned";
    this.phase = "transition";
    this.t0 = this.lastNow;
    return true;
  }

  /**
   * Transition from the pinned scene back to the sequence scene it left.
   * @returns {boolean} - False when not pinned or mid-transition
   */
  exitPinned() {
    if (this.phase === "transition" || this.pinnedId === null) return false;

    this.sceneManager.setActivePair(
      this.pinnedId,
      this.sceneIds[this.prevIdx],
    );
    this._applyTransitionFor(this.sceneInstances[this.prevIdx]);
    this.sceneManager.setTransitioning(true);
    this._transitionKind = "exitPinned";
    this._pinnedTiming = { delay: 0, duration: 1100 };
    this.phase = "transition";
    this.t0 = this.lastNow;
    return true;
  }

  onTransitionComplete() {
    this._cycleFinish = null;
    if (this._transitionKind === "enterPinned") {
      this._transitionKind = null;
      this.pinnedId = this._pinnedTarget.id;
      this._pinnedTarget = null;
      // Hold the pinned scene; camera rests at its state (from === to)
      this.sceneManager.setActivePair(this.pinnedId, this.pinnedId);
      this.sceneManager.setMix(0);
      this.sceneManager.updateCameraTransition(0, 0);
      this.sceneManager.setTransitioning(false);
      this.phase = "pinned";
      return;
    }

    if (this._transitionKind === "exitPinned") {
      this._transitionKind = null;
      this.pinnedId = null;
      // Restore the sequence pair we left when entering the pinned scene
      this.sceneManager.setActivePair(
        this.sceneIds[this.prevIdx],
        this.sceneIds[this.nextIdx],
      );
      this.sceneManager.setMix(0);
      this.sceneManager.updateCameraTransition(0, 0);
      this.sceneManager.setTransitioning(false);
      this.phase = "idle";
      return;
    }

    // The scene we just transitioned TO (at nextIdx) becomes the new prevIdx
    this.prevIdx = this.nextIdx;
    // Calculate what the next scene will be (for the upcoming transition)
    this.nextIdx = (this.prevIdx + 1) % this.sceneIds.length;

    // Update the active pair to reflect the new prev/next
    // This sets up camera transition: fromState = current scene, toState = next scene
    this.sceneManager.setActivePair(
      this.sceneIds[this.prevIdx],
      this.sceneIds[this.nextIdx],
    );

    // DON'T apply the next transition yet - textures haven't been updated!
    // We'll apply it when starting the next transition

    // Reset mix to 0 to display prev (the scene we just transitioned to)
    this.sceneManager.setMix(0);

    // Camera is at fromState (progress=0), which is the scene we just arrived at
    this.sceneManager.updateCameraTransition(0, 0); // delta 0 on instant snap

    // Notify SceneManager that we're no longer transitioning
    this.sceneManager.setTransitioning(false);

    this.phase = "idle";
  }

  _applyScrub(progress, delta) {
    if (!this._scrubbing) {
      this._scrubbing = true;
      if (this.phase !== "transition") {
        this._applyNextTransition();
        this.sceneManager.setTransitioning(true);
      }
    }

    const mix = Math.min(Math.max(progress, 0), 1);
    this.sceneManager.setMix(mix);
    this.sceneManager.updateCameraTransition(mix, delta);
  }

  update(nowMs, delta = 0) {
    if (!this.sceneIds.length) return;

    this.lastNow = nowMs;
    const durationMs = transitionDebug.duration * 1000;
    if (durationMs > 0) this.transitionMs = durationMs;

    const canScrub =
      !this._cycleFinish && (this.phase === "idle" ||
      (this.phase === "transition" && !this._transitionKind));

    if (transitionDebug.pause && canScrub) {
      this._applyScrub(transitionDebug.progress, delta);
      return;
    }

    if (this._scrubbing) {
      this._scrubbing = false;
      this.sceneManager.setMix(0);
      this.sceneManager.updateCameraTransition(0, 0);
      this.sceneManager.setTransitioning(false);
      this.phase = "idle";
      this.t0 = nowMs;
    }

    const elapsed = nowMs - this.t0;

    if (this.phase === "transition") {
      // Transition phase: 0 -> 1 over transitionMs
      const timing = this._transitionKind ? this._pinnedTiming : null;
      let mix = Math.min(Math.max((elapsed - (timing?.delay ?? 0)) / Math.max(timing?.duration ?? this.transitionMs, 1), 0), 1);
      if (this._cycleFinish) {
        const { progress, start } = this._cycleFinish;
        mix = progress + (1 - progress) * Math.min(1, (nowMs - start) / 180);
      }
      this.transitionProgress = mix;

      const ease = timing ? PAGE_EASE : EASE_CUSTOM_3;
      this.sceneManager.setMix(ease(mix));
      // Camera applies the same curve once to the raw timeline progress.
      // Update camera interpolation based on transition progress
      this.sceneManager.updateCameraTransition(mix, delta, ease);

      if (mix >= 1) {
        this.onTransitionComplete();
        this.t0 = nowMs;
      }
      return;
    }

    // "idle" and "pinned": hold current scene fully visible at mix=0.
    // Camera still updates (orbit controls in debug, hover sway).
    this.sceneManager.updateCameraTransition(0, delta);
    this.transitionProgress = 0;

    if (
      this.phase === "idle" &&
      this.autoAdvance &&
      !transitionDebug.pause &&
      this.sceneIds.length > 1 &&
      elapsed >= this.idleMs
    ) {
      // Start transition - apply the transition NOW after textures have been
      // rendered. This will mark the shader for rebuild on next render
      this._applyNextTransition();

      // Notify SceneManager that we're starting a transition
      this.sceneManager.setTransitioning(true);

      this.phase = "transition";
      this.t0 = nowMs;
    }
  }
}
