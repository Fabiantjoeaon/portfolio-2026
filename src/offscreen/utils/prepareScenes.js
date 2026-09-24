import { compileScene } from "./compileScene.js";

// Run inside the rendering worker, before the loader is dismissed. Rendering
// also prepares Three Blocks' batched glyph uploads, shared transmission
// snapshot, compute nodes, reflections, and lazy scene targets.
export async function prepareScenes(manager, sequenceIds, pinnedIds) {
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
  const drain = async () => {
    if (renderer.backend.device) await renderer.backend.device.queue.onSubmittedWorkDone();
    // Yield on both worker and main-thread fallback while loading.
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  try {
    for (const [id, entry] of manager.scenes) {
      manager.setActivePair(id, id);
      manager.cameraController.snapToState(entry.cameraState);
      apply(id);
      manager.setTransitioning(false);
      manager.setMix(0);
      renderer.setRenderTarget(entry.gbuffer.target);
      await compileScene(renderer, entry.scene, manager.camera);
      manager.render(0, 0);
      await drain();
    }

    const pairs = [];
    for (const from of sequenceIds) {
      for (const to of [...sequenceIds, ...pinnedIds]) {
        if (from !== to) pairs.push([from, to]);
      }
      for (const pinned of pinnedIds) pairs.push([pinned, from]);
    }
    for (const [from, to] of pairs) {
      manager.setActivePair(from, to);
      apply(to);
      manager.setTransitioning(true);
      manager.setMix(0.5);
      manager.updateCameraTransition(0.5, 0);
      manager.render(0, 0);
      await drain();
      // About removes the persistent layer before its scene wipe finishes.
      if (manager.scenes.get(from).sceneObj.combineOutputPass ||
          manager.scenes.get(to).sceneObj.combineOutputPass) {
        manager.hidePersistentScene = true;
        manager.render(0, 0);
        await drain();
        manager.hidePersistentScene = hidden;
      }
    }

    for (const id of pinnedIds) {
      manager.setActivePair(id, id);
      apply(id);
      manager.setMix(0);
      manager.setTransitioning(false);
      manager.cameraController.snapToState(manager.scenes.get(id).cameraState);
      manager.hidePersistentScene = true;
      manager.render(0, 0);
      await drain();
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
