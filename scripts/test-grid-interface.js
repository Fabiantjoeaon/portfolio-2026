// DevTools on /?scene=meadow&manual&debug after loading:
// await (await import('/scripts/test-grid-interface.js')).testGridInterface()
import dispatcher from '../src/shared/dispatcher.js';
import { getBoundParams, readBoundValue } from '../src/offscreen/debug/bindDebugParams.js';
import { collectParamUpdates } from '../src/offscreen/debug/saveParams.js';

export async function testGridInterface() {
  const manager = dispatcher.instances.find(instance => instance.sceneManager?.persistent)?.sceneManager;
  if (!manager) throw new Error('Wait for the debug scene to load.');
  const scene = manager.persistent;
  const renderer = manager.renderer;
  const loop = renderer.getAnimationLoop();
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await renderer.setAnimationLoop(null);
  renderer._animation.stop();
  await renderer.backend.device.queue.onSubmittedWorkDone();
  const saved = {
    out: { ...scene._overlayOut },
    alpha: scene.grid.interfaceUniforms.alpha.value,
    reveal: scene.grid.projectsOverlay.lineUniforms.reveal.value,
    scramble: scene.grid.projectsOverlay.scramble?.progress.value,
    visible: scene.grid.projectsOverlay.visible,
  };
  try {
    scene._overlayOut.bases = null;
    scene._overlayOut.introIn = false;
    scene.grid.interfaceUniforms.alpha.value = 1;
    scene.grid.projectsOverlay.lineUniforms.reveal.value = 1;
    scene._pinOverlayOut({ immediate: true });
    assert(scene.grid.interfaceUniforms.alpha.value === 0, 'Interface must fade visually.');
    assert(scene.grid.projectsOverlay.lineUniforms.reveal.value === 0, 'Lines must fade visually.');
    const bindings = [...getBoundParams()].filter(([path]) =>
      path === 'PersistentScene.Interface.interfaceAlpha' || path.endsWith('.lineReveal'));
    assert(bindings.length === 2, 'Both visibility controls must be bound.');
    for (const [path, { node, target }] of bindings) {
      assert(readBoundValue(target) === 1, `${path}: Inspector must retain configured visibility.`);
      const updates = collectParamUpdates();
      assert((updates[path]?.value ?? node.value) === 1, `${path}: Save must exclude the temporary fade.`);
      target.object[target.property] = 0.6;
      assert(collectParamUpdates()[path]?.value === 0.6, `${path}: intentional edits must still save.`);
    }
    scene._restoreOverlay();
    assert(scene.grid.interfaceUniforms.alpha.value === 0.6, 'Interface edit must survive fading back in.');
    assert(scene.grid.projectsOverlay.lineUniforms.reveal.value === 0.6, 'Line edit must survive fading back in.');
    return { passed: true, checks: ['hidden-state saving', 'intentional edits', 'fade restoration'] };
  } finally {
    Object.assign(scene._overlayOut, saved.out);
    scene.grid.interfaceUniforms.alpha.value = saved.alpha;
    scene.grid.projectsOverlay.lineUniforms.reveal.value = saved.reveal;
    if (scene.grid.projectsOverlay.scramble) scene.grid.projectsOverlay.scramble.progress.value = saved.scramble;
    scene.grid.projectsOverlay.visible = saved.visible;
    await renderer.setAnimationLoop(loop);
    renderer._animation.start();
  }
}
