// DevTools on /?manual&debug after loading:
// await (await import('/scripts/benchmark-transitions.js')).benchmarkTransitions()
// Also callable in the rendering worker's DevTools execution context.
import dispatcher from '../src/shared/dispatcher.js';
import { transitionDebug } from '../src/offscreen/transitions/WorldPositionTransition.js';
import { PROJECTS } from '../src/shared/projects.js';
import { timings } from '../src/shared/timings.js';

export async function benchmarkTransitions() {
  const site = dispatcher.instances.find(instance => instance._ready && instance.sceneManager);
  const manager = site?.sceneManager;
  const transition = site?.transitionManager;
  if (!manager || transition.phase !== 'idle' || transitionDebug.pause) {
    throw new Error('Wait for loading and return to the main scenes with transition scrubbing disabled.');
  }
  const renderer = manager.renderer;
  const device = renderer.backend.device;
  if (!device) throw new Error('GPU completion timing requires WebGPU.');
  const loop = renderer.getAnimationLoop();
  const timestamps = renderer.backend.trackTimestamp;
  const autoAdvance = transition.autoAdvance;
  const initialIndex = transition.prevIdx;
  const initialTime = transition.lastNow;
  const wallStart = performance.now();
  const variants = manager.post.material._variants.size;
  const animation = renderer._animation;
  const nodeFrame = renderer._nodes.nodeFrame;
  const results = [];
  const frameCount = Math.ceil(Math.max(timings.world.duration + 0.5, 3) * 60);
  const frame = () => {
    nodeFrame.frameId++;
    nodeFrame.time = transition.lastNow / 1000;
    nodeFrame.deltaTime = 1 / 60;
    renderer.info.frame = nodeFrame.frameId;
    transition.update(transition.lastNow + 1000 / 60, 1 / 60);
    if (manager.persistent._homeReturn && manager.persistent.updateHomeReturn(1 / 60) && transition.phase === 'returning') {
      manager.persistent.finishHomeReturn();
      transition.finishHomeReturn();
    }
    manager.render(transition.lastNow, 1 / 60);
    if (manager.post.quad.parent !== manager.post.scene) throw new Error('Composite leaked into reflections.');
  };
  const advance = async (measure = false) => {
    const samples = [];
    for (let i = 0; i < frameCount; i++) {
      const start = performance.now();
      frame();
      await device.queue.onSubmittedWorkDone();
      if (measure) samples.push(performance.now() - start);
    }
    if (manager.post.material._variants.size !== variants) {
      throw new Error(`Cold composite variant: ${variants} → ${manager.post.material._variants.size}`);
    }
    return samples;
  };
  try {
    await renderer.setAnimationLoop(null);
    animation.stop();
    renderer.backend.trackTimestamp = false;
    transition.autoAdvance = false;
    await device.queue.onSubmittedWorkDone();
    for (let index = 0; index < site.sceneIds.length; index++) {
      transition.transitionTo(index);
      await advance();
      for (const kind of ['about', 'project']) {
        const id = kind === 'about' ? site.aboutSceneId : site.projectSceneId;
        const scene = kind === 'about' ? site.aboutScene : site.projectScene;
        for (const direction of ['enter', 'exit']) {
          if (direction === 'enter') {
            if (!transition.enterPinned(id, scene)) throw new Error('Page entry rejected.');
            if (kind === 'about') {
              manager.persistent.enterAbout();
              site.aboutScene.startReveal();
            } else manager.persistent.enterProject(PROJECTS[0]);
          } else {
            if (!transition.exitPinned()) throw new Error('Page exit rejected.');
            // Measure the GPU wipe/reveal after the content-exit barrier.
            manager.persistent.prepareHomeReturn();
            manager.persistent.startHomeReturn();
          }
          const samples = await advance(true);
          const expected = direction === 'enter' ? id : site.sceneIds[index];
          if (manager.activePrevId !== expected || manager.isTransitioning) throw new Error('Incorrect transition endpoint.');
          if (kind === 'about' && manager.persistent.isFullyHidden !== (direction === 'enter')) {
            throw new Error('Persistent layer did not hide/restore.');
          }
          const sorted = [...samples].sort((a, b) => a - b);
          results.push({ scene: site.sceneInstances[index].name, kind, direction,
            firstMs: samples[0], medianMs: sorted[Math.floor(sorted.length * 0.5)],
            p95Ms: sorted[Math.floor(sorted.length * 0.95)], maxMs: sorted.at(-1),
            over33ms: samples.filter(value => value > 1000 / 30).length });
        }
      }
    }
    transition.transitionTo(initialIndex);
    await advance();
    return { canvas: [renderer.domElement.width, renderer.domElement.height],
      preparedVariants: variants, coldVariants: 0, results };
  } finally {
    // Resume the real clock instead of leaving the synthetic test time ahead.
    transition.lastNow = initialTime + performance.now() - wallStart;
    transition.t0 = transition.lastNow;
    nodeFrame.time = transition.lastNow / 1000;
    nodeFrame.lastTime = performance.now();
    transition.autoAdvance = autoAdvance;
    renderer.backend.trackTimestamp = timestamps;
    await renderer.setAnimationLoop(loop);
    animation.start();
  }
}
