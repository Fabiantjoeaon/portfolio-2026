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

    // Pinned scene: a scene outside the auto-cycle (e.g. ProjectScene) the
    // manager transitions to and holds until exitPinned()
    this.pinnedId = null;
    this._pinnedTarget = null;
    this._transitionKind = null; // null | "enterPinned" | "exitPinned"
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
    this._applyNextTransition();
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

  /**
   * Transition to a scene outside the sequence and hold there (no
   * auto-advance) until exitPinned(). `immediate` snaps straight to it.
   * @returns {boolean} - False when a transition is already running
   */
  enterPinned(sceneId, instance, { immediate = false } = {}) {
    if (this.phase === "transition" || this.pinnedId !== null) return false;

    if (immediate) {
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
    this.phase = "transition";
    this.t0 = this.lastNow;
    return true;
  }

  onTransitionComplete() {
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

  update(nowMs, delta = 0) {
    if (!this.sceneIds.length) return;

    this.lastNow = nowMs;
    const elapsed = nowMs - this.t0;

    if (this.phase === "transition") {
      // Transition phase: 0 -> 1 over transitionMs
      const mix = Math.min(Math.max(elapsed / this.transitionMs, 0), 1);

      this.sceneManager.setMix(mix);
      // Update camera interpolation based on transition progress
      this.sceneManager.updateCameraTransition(mix, delta);

      if (mix >= 1) {
        this.onTransitionComplete();
        this.t0 = nowMs;
      }
      return;
    }

    // "idle" and "pinned": hold current scene fully visible at mix=0.
    // Camera still updates (orbit controls in debug, hover sway).
    this.sceneManager.updateCameraTransition(0, delta);

    if (
      this.phase === "idle" &&
      this.autoAdvance &&
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
