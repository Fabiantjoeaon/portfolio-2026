import { compileScene } from "./compileScene.js";
import { pinnedFade } from "../transitions/FadeTransition.js";

// Run inside the rendering worker, before the loader is dismissed. Rendering
// also prepares Three Blocks' batched glyph uploads, shared transmission
// snapshot, compute nodes, reflections, and lazy scene targets.
// `record` can run once per batch of added scenes, so early scenes are
// recorded while later ones still download; each batch prepares the paths
// reachable from the initial scene first, then the rest. `finish` waits for
// every pipeline, draws each path once more and restores the manager.
export function prepareScenes(manager, pinnedIds) {
  const renderer = manager.renderer;
  const hidden = manager.hidePersistentScene;
  const target = renderer.getRenderTarget();
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

  // Plain renders create pipelines synchronously, one after another, and
  // compileAsync waits for each object's pipeline before building the next
  // one's shaders. Both hand their pipelines to `pending` instead (objects
  // without a ready pipeline skip their draw), so the driver compiles them in
  // parallel while the remaining shaders build.
  const pipelines = renderer._pipelines;
  const getForRender = pipelines.getForRender;
  const pending = [];
  pipelines.getForRender = (renderObject, promises = null) =>
    getForRender.call(pipelines, renderObject, promises && pending);

  const compiled = new Set();
  const recorded = new Set();
  const critical = [];
  const deferred = [];

  const collect = (sequenceIds, initialId) => {
    const steps = { critical: [], deferred: [] };
    const add = (list, key, step) => {
      if (recorded.has(key)) return;
      recorded.add(key);
      list.push(step);
    };
    for (const [id, entry] of manager.scenes) {
      add(steps.critical, `scene ${id}`, () => {
        manager.setActivePair(id, id);
        manager.cameraController.snapToState(entry.cameraState);
        apply(id);
        manager.setTransitioning(false);
        manager.setMix(0);
        manager.hidePersistentScene = hidden;
        renderer.setRenderTarget(entry.gbuffer.target);
        manager.render(0, 0);
      });
    }
    if (introProgress && manager.scenes.has(initialId)) {
      add(steps.critical, "intro", () => {
        manager.setActivePair(initialId, initialId);
        manager.cameraController.snapToState(manager.scenes.get(initialId).cameraState);
        apply(initialId);
        manager.setTransitioning(false);
        manager.setMix(0);
        manager.hidePersistentScene = hidden;
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
      const list = from === initialId || (to === initialId && pinnedIds.includes(from))
        ? steps.critical
        : steps.deferred;
      add(list, `pair ${from} ${to}`, () => {
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
        add(list, `pair ${from} ${to} without persistent`, () => {
          manager.hidePersistentScene = true;
          manager.render(0, 0);
          manager.hidePersistentScene = hidden;
        });
      }
    }
    for (const id of pinnedIds) {
      add(steps.critical, `pinned ${id}`, () => {
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
          add(steps.deferred, `fade ${from} ${to} ${hidePersistent}`, () => {
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
    return steps;
  };

  // Builds the shaders of the scenes added since the last call, and the
  // paths between every scene added so far.
  const record = async (sequenceIds, { initialId = null, onProgress = () => {} } = {}) => {
    const scenes = [...manager.scenes].filter(([id]) => !compiled.has(id));
    const steps = collect(sequenceIds, initialId);
    const ordered = [...steps.critical, ...steps.deferred];
    const total = scenes.length + ordered.length;
    let done = 0;
    // Precompiled shader keys are build-order ordinals. compileAsync yields in
    // time slices, so concurrent scenes would interleave differently per
    // machine; scenes build one after another while their pipelines compile.
    for (const [id, entry] of scenes) {
      compiled.add(id);
      manager.setActivePair(id, id);
      manager.cameraController.snapToState(entry.cameraState);
      renderer.setRenderTarget(entry.gbuffer.target);
      await compileScene(renderer, entry.scene, manager.camera);
      onProgress(++done / total);
    }
    pipelines.updateForRender = (renderObject) => pipelines.getForRender(renderObject, pending);
    try {
      for (const step of ordered) {
        step();
        await tick();
        onProgress(++done / total);
      }
    } finally {
      delete pipelines.updateForRender;
      manager.hidePersistentScene = hidden;
    }
    critical.push(...steps.critical);
    deferred.push(...steps.deferred);
  };

  let restored = false;
  const restore = (initialId) => {
    if (restored) return;
    restored = true;
    delete pipelines.getForRender;
    manager.introProgress = introProgress;
    manager.hidePersistentScene = hidden;
    manager.setTransitioning(false);
    manager.setMix(0);
    renderer.setRenderTarget(target);
    const initialCameraState = manager.scenes.get(initialId)?.cameraState;
    if (initialCameraState) manager.cameraController.snapToState(initialCameraState);
    grid?.setInteractive(interactive);
    grid?.projectsOverlay?.playIn();
  };

  // Draws with every pipeline ready; these renders build no new shaders.
  const finish = async (initialId, { onProgress = () => {} } = {}) => {
    try {
      let settled = 0;
      await Promise.all(pending.map((promise) => promise.then(() => {
        onProgress(0.9 * (++settled / pending.length));
      })));
      const steps = [...critical, ...deferred];
      for (let i = 0; i < steps.length; i++) {
        steps[i]();
        await drain();
        onProgress(0.9 + 0.1 * ((i + 1) / steps.length));
      }
    } finally {
      restore(initialId);
    }
  };

  return { record, finish, restore };
}
