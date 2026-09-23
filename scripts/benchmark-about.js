// Run from DevTools on /about?debug while the page is fully open:
// await (await import('/scripts/benchmark-about.js')).benchmarkAbout()
import dispatcher from "../src/shared/dispatcher.js";

export async function benchmarkAbout({ batches = 40, framesPerBatch = 8, warmup = 10 } = {}) {
  const site = dispatcher.instances.find(instance => instance.aboutScene?._batch?.geometry.instanceCount);
  const manager = site?.sceneManager;
  if (!manager || manager.isTransitioning || manager.activePrevId !== site.aboutSceneId) {
    throw new Error("Open /about?debug and wait for the page transition to finish.");
  }
  const renderer = manager.renderer;
  const device = renderer.backend.device;
  if (!device) throw new Error("This benchmark requires WebGPU.");
  const loop = renderer.getAnimationLoop();
  const autoReset = renderer.info.autoReset;
  const trackTimestamp = renderer.backend.trackTimestamp;
  const samples = [];
  let elapsed = 0;
  try {
    await renderer.setAnimationLoop(null);
    await device.queue.onSubmittedWorkDone();
    renderer.backend.trackTimestamp = false;
    renderer.info.autoReset = false;
    for (let batch = 0; batch < batches + warmup; batch++) {
      const start = performance.now();
      for (let frame = 0; frame < framesPerBatch; frame++) {
        renderer.info.reset();
        manager.render(elapsed, 1 / 120);
        elapsed += 1000 / 120;
      }
      // Amortize the GPU fence; do not insert a readback stall per frame.
      await device.queue.onSubmittedWorkDone();
      if (batch >= warmup) samples.push((performance.now() - start) / framesPerBatch);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length * 0.5)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    return {
      canvas: [renderer.domElement.width, renderer.domElement.height],
      dpr: renderer.getPixelRatio(),
      frames: batches * framesPerBatch,
      medianMs: median,
      p95Ms: p95,
      budgetMs: 1000 / 120,
      within120FpsBudget: p95 <= 1000 / 120,
      renderCalls: renderer.info.render.frameCalls,
      drawCalls: renderer.info.render.drawCalls,
      glyphs: site.aboutScene._batch.geometry.instanceCount,
    };
  } finally {
    renderer.info.autoReset = autoReset;
    renderer.backend.trackTimestamp = trackTimestamp;
    await renderer.setAnimationLoop(loop);
  }
}
