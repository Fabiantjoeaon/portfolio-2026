import { compileScene } from "./compileScene.js";

// Run inside the rendering worker, before the loader is dismissed. Rendering
// also prepares Three Blocks' batched glyph uploads, shared transmission
// snapshot, compute nodes, reflections, and lazy scene targets.
export async function prepareScenes(manager, sequenceIds, pinnedIds, onProgress = () => {}) {
  const renderer = manager.renderer;
  const hidden = manager.hidePersistentScene;
  const target = renderer.getRenderTarget();
  const initialCameraState = manager.scenes.get(manager.activePrevId)?.cameraState;
  const grid = manager.persistent?.grid;
  const interactive = grid?.interactive;
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

  const steps = [];
  for (const [id, entry] of manager.scenes) {
    steps.push(() => {
      manager.setActivePair(id, id);
      manager.cameraController.snapToState(entry.cameraState);
      apply(id);
      manager.setTransitioning(false);
      manager.setMix(0);
      renderer.setRenderTarget(entry.gbuffer.target);
      manager.render(0, 0);
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
    steps.push(() => {
      manager.setActivePair(id, id);
      apply(id);
      manager.setMix(0);
      manager.setTransitioning(false);
      manager.cameraController.snapToState(manager.scenes.get(id).cameraState);
      manager.hidePersistentScene = true;
      manager.render(0, 0);
    });
  }

  try {
    // compileAsync captures its render target synchronously, so every scene
    // compiles at once and the driver builds their pipelines in parallel.
    const compiles = [];
    for (const [id, entry] of manager.scenes) {
      manager.setActivePair(id, id);
      manager.cameraController.snapToState(entry.cameraState);
      renderer.setRenderTarget(entry.gbuffer.target);
      compiles.push(compileScene(renderer, entry.scene, manager.camera));
    }
    await Promise.all(compiles);
    onProgress(0.3);

    // Plain renders create pipelines synchronously, one after another. Record
    // every remaining pipeline asynchronously first (objects without a ready
    // pipeline skip their draw), so the driver compiles them in parallel.
    const pipelines = renderer._pipelines;
    const pending = [];
    pipelines.updateForRender = (renderObject) => pipelines.getForRender(renderObject, pending);
    try {
      for (let i = 0; i < steps.length; i++) {
        steps[i]();
        await tick();
        onProgress(0.3 + 0.25 * ((i + 1) / steps.length));
      }
    } finally {
      delete pipelines.updateForRender;
      manager.hidePersistentScene = hidden;
    }
    let settled = 0;
    await Promise.all(pending.map((promise) => promise.then(() => {
      onProgress(0.55 + 0.35 * (++settled / pending.length));
    })));

    for (let i = 0; i < steps.length; i++) {
      steps[i]();
      await drain();
      onProgress(0.9 + 0.1 * ((i + 1) / steps.length));
    }
  } finally {
    manager.hidePersistentScene = hidden;
    manager.setTransitioning(false);
    manager.setMix(0);
    renderer.setRenderTarget(target);
    if (initialCameraState) manager.cameraController.snapToState(initialCameraState);
    grid?.setInteractive(interactive);
    grid?.projectsOverlay?.playIn();
  }
}
