// DevTools on /?scene=meadow&manual&debug, after loading finishes:
// await (await import('/scripts/benchmark-meadow.js')).benchmarkMeadow({ roses: 64 })
// Use roses: 0 for idle. Rendering quality and DPR are never changed.
import dispatcher from '../src/shared/dispatcher.js';
import { benchmarkScene } from './benchmark-scenes.js';

export async function benchmarkMeadow({ roses = 64, ...options } = {}) {
  const manager = dispatcher.instances.find(instance => instance.sceneManager?.persistent)?.sceneManager;
  const scene = manager?.scenes.get(manager.activePrevId)?.sceneObj;
  if (!scene?.roseTrail || manager.isTransitioning) throw new Error('Open Meadow and wait for loading/transition to finish.');
  if (!Number.isInteger(roses) || roses < 0 || roses > 64) throw new Error('Use 0–64 roses.');
  // Pause before changing the pool: an in-flight application RAF can otherwise
  // retire the synthetic roses while benchmarkScene is stopping its loop.
  const renderer = manager.renderer;
  const device = renderer.backend.device;
  if (!device) throw new Error('This benchmark requires WebGPU.');
  const loop = renderer.getAnimationLoop();
  await renderer.setAnimationLoop(null);
  renderer._animation.stop();
  await device.queue.onSubmittedWorkDone();
  const trail = scene.roseTrail;
  const attributes = Object.values(trail.attributes);
  const saved = {
    arrays: attributes.map(attribute => attribute.array.slice()),
    active: trail._activeCount, instances: trail.roses.geometry.instanceCount,
    lifetime: trail.controls.lifetime.value,
    impacts: trail.impactEvents.map(event => event.clone()),
    impactCursor: trail._impactCursor,
    consumeMovement: trail.projector.consumeMovement,
  };
  try {
    trail._activeCount = 0;
    trail.roses.geometry.instanceCount = 0;
    trail.controls.lifetime.value = 120;
    trail.projector.consumeMovement = () => false;
    for (const event of trail.impactEvents) event.z = -1e6;
    // Fixed variations make runs comparable without changing global Math.random.
    for (let i = 0; i < roses; i++) {
      trail.attributes.offset.setXY(i, (i % 8 - 3.5) * 3, 22 + Math.floor(i / 8) * 2);
      trail.attributes.birth.setX(i, performance.now() / 1000 - 4);
      trail.attributes.variation.setXYZW(i, i * 2.399963, 0.5 + (i % 8) * 0.67, Math.sin(i) * 0.3, Math.cos(i) * 0.3);
    }
    trail._activeCount = trail.roses.geometry.instanceCount = roses;
    for (const attribute of attributes) attribute.needsUpdate = true;
    const result = await benchmarkScene({
      ...options,
      beforeFrame(timeMs) {
        if (trail.roses.geometry.instanceCount !== roses) {
          throw new Error('The rose pool changed during the benchmark; rerun after scene updates settle.');
        }
        if (roses === 0) return;
        // Keep the full visible pool and all eight emergence ripples active
        // throughout warmup and measurement, including slow device runs.
        trail.attributes.birth.array.fill(timeMs / 1000 - 4, 0, roses);
        trail.attributes.birth.needsUpdate = true;
        trail.impactEvents.forEach((event, i) => {
          const index = i % roses;
          event.set(trail.attributes.offset.getX(index), trail.attributes.offset.getY(index),
            timeMs / 1000 - 0.12 - i * 0.1, 1);
        });
      },
    });
    return { ...result, roses, activeRoseRipples: roses ? trail.impactEvents.length : 0 };
  } finally {
    attributes.forEach((attribute, i) => { attribute.array.set(saved.arrays[i]); attribute.needsUpdate = true; });
    trail._activeCount = saved.active;
    trail.roses.geometry.instanceCount = saved.instances;
    trail.controls.lifetime.value = saved.lifetime;
    trail.impactEvents.forEach((event, i) => event.copy(saved.impacts[i]));
    trail._impactCursor = saved.impactCursor;
    trail.projector.consumeMovement = saved.consumeMovement;
    await renderer.setAnimationLoop(loop);
    renderer._animation.start();
  }
}
