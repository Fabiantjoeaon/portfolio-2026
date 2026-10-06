import { compileScene } from "./compileScene.js";
import { pinnedFade } from "../transitions/FadeTransition.js";

// Run inside the rendering worker, before the loader is dismissed. Rendering
// also prepares Three Blocks' batched glyph uploads, shared transmission
// snapshot, compute nodes, reflections, and lazy scene targets.
// Paths reachable from the initial scene are prepared first, then the rest.
export async function prepareScenes(
  manager,
  sequenceIds,
  pinnedIds,
  { onProgress = () => {} } = {},
) {
  const renderer = manager.renderer;
  const hidden = manager.hidePersistentScene;
  const target = renderer.getRenderTarget();
  const initialId = manager.activePrevId;
  const initialCameraState = manager.scenes.get(initialId)?.cameraState;
  const grid = manager.persistent?.grid;
  const interactive = grid?.interactive;
  // Both the intro and the regular output passes must be ready before entry.
  const introProgress = manager.introProgress;
  manager.introProgress = null;
  grid?.setInteractive(false);
  const apply = (id) => {
    const instance = manager.scenes.get(id).sceneObj;
    instance.transition?.setOriginBelowGrid?.(manager.persistent?.grid);
    manager.post.material.setTransition(instance.transition);
    manager.post.material.setPostprocessingChain(instance.postprocessingChain);
  };
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const drain = async () => {
    if (renderer.backend.device) await renderer.backend.device.queue.onSubmittedWorkDone();
    // Yield on both worker and main-thread fallback while loading.
    await tick();
  };

  const critical = [];
  const deferred = [];
  for (const [id, entry] of manager.scenes) {
    critical.push(() => {
      manager.setActivePair(id, id);
      manager.cameraController.snapToState(entry.cameraState);
      apply(id);
      manager.setTransitioning(false);
      manager.setMix(0);
      renderer.setRenderTarget(entry.gbuffer.target);
      manager.render(0, 0);
    });
  }
  if (introProgress && manager.scenes.has(initialId)) {
    critical.push(() => {
      manager.setActivePair(initialId, initialId);
      manager.cameraController.snapToState(initialCameraState);
      apply(initialId);
      manager.setTransitioning(false);
      manager.setMix(0);
      manager.introProgress = introProgress;
      try {
        manager.render(0, 0);
      } finally {
        manager.introProgress = null;
      }
    });
  }
  const pairs = [];
  for (const from of sequenceIds) {
    for (const to of [...sequenceIds, ...pinnedIds]) {
      if (from !== to) pairs.push([from, to]);
    }
    for (const pinned of pinnedIds) pairs.push([pinned, from]);
  }
  for (const [from, to] of pairs) {
    const steps = from === initialId || (to === initialId && pinnedIds.includes(from))
      ? critical
      : deferred;
    steps.push(() => {
      manager.setActivePair(from, to);
      apply(to);
      manager.setTransitioning(true);
      manager.setMix(0.5);
      manager.updateCameraTransition(0.5, 0);
      manager.hidePersistentScene = hidden;
      manager.render(0, 0);
    });
    // About removes the persistent layer before its scene wipe finishes.
    if (manager.scenes.get(from).sceneObj.combineOutputPass ||
        manager.scenes.get(to).sceneObj.combineOutputPass) {
      steps.push(() => {
        manager.hidePersistentScene = true;
        manager.render(0, 0);
        manager.hidePersistentScene = hidden;
      });
    }
  }
  for (const id of pinnedIds) {
    critical.push(() => {
      manager.setActivePair(id, id);
      apply(id);
      manager.setMix(0);
      manager.setTransitioning(false);
      manager.cameraController.snapToState(manager.scenes.get(id).cameraState);
      manager.hidePersistentScene = true;
      manager.render(0, 0);
    });
  }
  // Page-to-page switches fade with the outgoing page's output chain.
  for (const from of pinnedIds) {
    for (const to of pinnedIds) {
      if (from === to) continue;
      for (const hidePersistent of new Set([hidden, true])) {
        deferred.push(() => {
          manager.setActivePair(from, to);
          manager.post.material.setTransition(pinnedFade);
          manager.post.material.setPostprocessingChain(manager.scenes.get(from).sceneObj.postprocessingChain);
          manager.setTransitioning(true);
          manager.setMix(0.5);
          manager.updateCameraTransition(0.5, 0);
          manager.hidePersistentScene = hidePersistent;
          manager.render(0, 0);
          manager.hidePersistentScene = hidden;
        });
      }
    }
  }

  // Plain renders create pipelines synchronously, one after another. Record
  // every pipeline of a stage asynchronously first (objects without a ready
  // pipeline skip their draw), so the driver compiles them in parallel.
  const pipelines = renderer._pipelines;
  const run = async (steps, report) => {
    const pending = [];
    pipelines.updateForRender = (renderObject) => pipelines.getForRender(renderObject, pending);
    try {
      for (let i = 0; i < steps.length; i++) {
        steps[i]();
        await tick();
        report(0.75 * ((i + 1) / steps.length));
      }
    } finally {
      delete pipelines.updateForRender;
      manager.hidePersistentScene = hidden;
    }
    let settled = 0;
    await Promise.all(pending.map((promise) => promise.then(() => {
      report(0.75 + 0.2 * (++settled / pending.length));
    })));
    for (let i = 0; i < steps.length; i++) {
      steps[i]();
      await drain();
      report(0.95 + 0.05 * ((i + 1) / steps.length));
    }
  };

  try {
    // Precompiled shader keys are build-order ordinals. compileAsync yields in
    // time slices, so concurrent scenes would interleave differently per
    // machine; each scene still creates its own pipelines in parallel.
    let compiled = 0;
    for (const [id, entry] of manager.scenes) {
      manager.setActivePair(id, id);
      manager.cameraController.snapToState(entry.cameraState);
      renderer.setRenderTarget(entry.gbuffer.target);
      await compileScene(renderer, entry.scene, manager.camera);
      onProgress(0.15 * (++compiled / manager.scenes.size));
    }
    await run(critical, (progress) => onProgress(0.15 + 0.4 * progress));
    await run(deferred, (progress) => onProgress(0.55 + 0.45 * progress));
  } finally {
    manager.introProgress = introProgress;
    manager.hidePersistentScene = hidden;
    manager.setTransitioning(false);
    manager.setMix(0);
    renderer.setRenderTarget(target);
    if (initialCameraState) manager.cameraController.snapToState(initialCameraState);
    grid?.setInteractive(interactive);
    grid?.projectsOverlay?.playIn();
  }
}
