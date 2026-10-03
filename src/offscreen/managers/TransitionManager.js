import { timingEase } from "../lib/customEases.js";
import { timings } from "@/shared/timings";
import { transitionDebug } from "../transitions/WorldPositionTransition.js";
import { pinnedFade } from "../transitions/FadeTransition.js";
import { getFlag } from "../lib/query.js";
import { audio } from "@/audio/audio.js";

// A saved debug Pause must never freeze the live site.
const paused = () => transitionDebug.pause && getFlag("debug");

export class TransitionManager {
  constructor(
    sceneManager,
    {
      idleMs = timings.world.idle * 1000,
      transitionMs = timings.world.duration * 1000,
      autoAdvance = true,
    } = {},
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
    this.lastTransitionEnd = -Infinity;

    // Pinned scene: a scene outside the auto-cycle (e.g. ProjectScene) the
    // manager transitions to and holds until exitPinned()
    this.pinnedId = null;
    this._pinnedTarget = null;
    this._transitionKind = null; // null | "enterPinned" | "exitPinned"
    this._scrubbing = false;
    this._wipeSoundAt = null;
  }

  /** The wipe one-shot, at the moment the wipe becomes visible. */
  _queueWipeSound(delayMs = 0) {
    if (delayMs > 0) {
      this._wipeSoundAt = this.lastNow + delayMs;
      return;
    }
    this._wipeSoundAt = null;
    audio.trigger("ui", { type: "transition" });
  }

  setSequence(sceneIds, sceneInstances) {
    this.sceneIds = sceneIds ?? [];
    this.sceneInstances = sceneInstances ?? [];
  }

  /**
   * Scene that owns pointer input. During a regular wipe the outgoing scene
   * keeps input until its cutoff, followed by an optional quiet interval,
   * then the incoming scene takes over at `interactionResumeAt`.
   */
  get interactionSceneId() {
    const { outgoingInteractionUntil, interactionResumeAt, interactionDelay } =
      timings.world;
    if (this.phase === "transition" && !this._transitionKind) {
      const outgoingUntil = Math.min(
        outgoingInteractionUntil,
        interactionResumeAt,
      );
      if (this.transitionProgress < outgoingUntil)
        return this.sceneIds[this.prevIdx] ?? null;
      if (
        interactionResumeAt < 1 &&
        this.transitionProgress >= interactionResumeAt
      )
        return this.sceneIds[this.nextIdx] ?? null;
      return null;
    }
    if (
      this.phase !== "idle" ||
      this.lastNow - this.lastTransitionEnd < interactionDelay * 1000
    )
      return null;
    return this.sceneIds[this.prevIdx] ?? null;
  }

  get canInteract() {
    return this.interactionSceneId !== null;
  }

  /** Page entries wait for a running world wipe to finish at its own pace. */
  preparePageEntry() {
    if (this.phase === "transition") return false;
    // Only guard the final 180ms before an automatic wipe starts.
    if (
      this.phase === "idle" &&
      this.autoAdvance &&
      this.sceneIds.length > 1 &&
      !paused() &&
      timings.world.idle * 1000 - (this.lastNow - this.t0) <= 180
    )
      return false;
    return true;
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
    this._queueWipeSound();
  }

  next() {
    this.transitionTo(this.prevIdx + 1);
  }

  /**
   * Transition to a scene outside the sequence and hold there (no
   * auto-advance) until exitPinned(). `immediate` snaps straight to it.
   * @returns {boolean} - False when a transition is already running
   */
  enterPinned(
    sceneId,
    instance,
    {
      immediate = false,
      delay = 0,
      duration = timings.pages.projectWipeDuration,
    } = {},
  ) {
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
    this._pinnedTiming = {
      delay: delay * 1000,
      duration: duration * 1000,
      zoom: 1,
      wipeEnd: timings.world.pageWipeEnd,
    };
    this.sceneManager.setActivePair(this.sceneIds[this.prevIdx], sceneId);
    this._applyTransitionFor(instance);
    this.sceneManager.setTransitioning(true);
    this._transitionKind = "enterPinned";
    this.phase = "transition";
    this.t0 = this.lastNow;
    this._queueWipeSound(delay * 1000);
    return true;
  }

  /**
   * Transition from the pinned scene back to the sequence scene it left.
   * @returns {boolean} - False when not pinned or mid-transition
   */
  exitPinned({
    immediate = false,
    duration = timings.homeReturn.wipeDuration,
    ease = timings.homeReturn.wipeEase,
  } = {}) {
    if (this.phase === "transition" || this.pinnedId === null) return false;

    this.sceneManager.setActivePair(this.pinnedId, this.sceneIds[this.prevIdx]);
    this._applyTransitionFor(this.sceneInstances[this.prevIdx]);
    this.sceneManager.setTransitioning(true);
    this._transitionKind = "exitPinned";
    this._pinnedTiming = {
      delay: 0,
      duration: duration * 1000,
      ease,
      zoom: -1,
      wipeEnd: timings.world.pageWipeEnd,
    };
    this.transitionProgress = 0;
    this.phase = "transition";
    this.t0 = this.lastNow;
    if (immediate) this.onTransitionComplete();
    else this._queueWipeSound();
    return true;
  }

  finishHomeReturn() {
    if (this.phase !== "returning") return;
    this.phase = "idle";
    this.t0 = this.lastNow;
    this.lastTransitionEnd = this.lastNow;
  }

  /** Change pinned destinations without touching the saved home sequence. */
  switchPinned(
    sceneId,
    instance,
    { immediate = false, duration = timings.pages.directDuration } = {},
  ) {
    if (this.phase !== "pinned" || this.pinnedId === null) return false;
    if (sceneId === this.pinnedId) return true;
    const previous = this.pinnedId;
    this._pinnedTarget = { id: sceneId, instance };
    this.sceneManager.setActivePair(previous, sceneId);
    this.sceneManager.post.material.setTransition(pinnedFade);
    this.sceneManager.setTransitioning(true);
    this._transitionKind = "enterPinned";
    this._pinnedTiming = { delay: 0, duration: duration * 1000 };
    this.transitionProgress = 0;
    this.phase = "transition";
    this.t0 = this.lastNow;
    if (immediate) this.onTransitionComplete();
    return true;
  }

  onTransitionComplete() {
    this.sceneManager.cameraController.zoom.direction = 0;
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
      this.phase = "returning";
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
    if (timings.world.interactionResumeAt >= 1)
      this.lastTransitionEnd = this.lastNow;
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
    if (this._wipeSoundAt !== null && nowMs >= this._wipeSoundAt) this._queueWipeSound();
    const durationMs = timings.world.duration * 1000;
    if (durationMs > 0) this.transitionMs = durationMs;

    const canScrub =
      this.phase === "idle" ||
      (this.phase === "transition" && !this._transitionKind);

    if (paused() && canScrub) {
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
      this.lastTransitionEnd = nowMs;
    }

    const elapsed = nowMs - this.t0;

    if (this.phase === "transition") {
      // Transition phase: 0 -> 1 over transitionMs
      const timing = this._transitionKind ? this._pinnedTiming : null;
      const end = timing
        ? 1
        : Math.min(Math.max(timings.world.visibleEnd, 0.001), 1);
      const mix = Math.min(
        Math.max(
          (elapsed - (timing?.delay ?? 0)) /
            Math.max(timing?.duration ?? this.transitionMs, 1),
          0,
        ),
        end,
      );
      this.transitionProgress = mix;
      // if (!this._transitionKind) console.log(`[wipe] ${mix.toFixed(3)}`);

      const ease = timingEase(
        timing?.ease ?? (timing ? timings.pages.ease : timings.world.ease),
      );
      const zoom = this.sceneManager.cameraController.zoom;
      zoom.direction = timing?.zoom ?? 0;
      zoom.progress = mix;
      // The world field is fully revealed at visibleEnd; page wipes spend
      // their whole ease on that span instead of cutting it mid-curve.
      const wipeEnd = transitionDebug.mode === "black-wipe"
        ? 1
        : Math.min(Math.max(timing?.wipeEnd ?? 1, 0.001), 1);
      this.sceneManager.setMix(ease(mix) * wipeEnd);
      // The camera applies the same curve once, over the visible span, so it
      // lands on the next scene's state exactly when the wipe ends.
      const cameraDelay = timing
        ? 0
        : Math.min(timings.world.cameraDelay, 0.99);
      const cameraProgress = Math.max(
        0,
        (mix / end - cameraDelay) / (1 - cameraDelay),
      );
      this.sceneManager.updateCameraTransition(cameraProgress, delta, ease);

      if (mix >= end) {
        this.onTransitionComplete();
        this.t0 = nowMs;
      }
      return;
    }

    // "idle" and "pinned": hold current scene fully visible at mix=0.
    // Camera still updates (orbit controls in debug, hover sway).
    this.sceneManager.cameraController.zoom.direction = 0;
    this.sceneManager.updateCameraTransition(0, delta);
    this.transitionProgress = 0;

    if (
      this.phase === "idle" &&
      this.autoAdvance &&
      !paused() &&
      this.sceneIds.length > 1 &&
      elapsed >= timings.world.idle * 1000
    ) {
      // Start transition - apply the transition NOW after textures have been
      // rendered. This will mark the shader for rebuild on next render
      this._applyNextTransition();

      // Notify SceneManager that we're starting a transition
      this.sceneManager.setTransitioning(true);

      this.phase = "transition";
      this.t0 = nowMs;
      this._queueWipeSound();
    }
  }
}
