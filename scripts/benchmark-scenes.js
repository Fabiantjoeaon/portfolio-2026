// DevTools on /?scene=ice&manual&debug (also supports cube and About):
// await (await import('/scripts/benchmark-scenes.js')).benchmarkScene()
import dispatcher from "../src/shared/dispatcher.js";

export async function benchmarkScene({ batches = 40, framesPerBatch = 8, warmup = 10 } = {}) {
  if (![batches, framesPerBatch].every(n => Number.isInteger(n) && n > 0)
    || !Number.isInteger(warmup) || warmup < 0) {
    throw new Error("Use positive integer batch/frame counts and nonnegative warmup.");
  }
  const site = dispatcher.instances.find(instance => instance.sceneManager?.persistent);
  const manager = site?.sceneManager;
  if (!manager || manager.isTransitioning) {
    throw new Error("Open a scene with ?manual&debug and wait for its transition to finish.");
  }
  const renderer = manager.renderer;
  const device = renderer.backend.device;
  if (!device) throw new Error("This benchmark requires WebGPU.");
  const loop = renderer.getAnimationLoop();
  const autoReset = renderer.info.autoReset;
  const trackTimestamp = renderer.backend.trackTimestamp;
  // Three r186 advances FRAME nodes in its internal animation callback,
  // independently of the application's callback. Drive that lifecycle once
  // per submitted frame so animated textures and Gaussian blur are included.
  const animation = renderer._animation;
  const nodeFrame = renderer._nodes.nodeFrame;
  const initialTime = nodeFrame.time;
  const startTime = performance.now();
  const samples = [];
  let elapsed = 0, renderCalls = 0, drawCalls = 0;
  try {
    await renderer.setAnimationLoop(null);
    animation.stop();
    await device.queue.onSubmittedWorkDone();
    renderer.backend.trackTimestamp = false;
    renderer.info.autoReset = false;
    for (let batch = 0; batch < batches + warmup; batch++) {
      const start = performance.now();
      for (let frame = 0; frame < framesPerBatch; frame++) {
        nodeFrame.frameId++;
        nodeFrame.time = initialTime + elapsed / 1000;
        nodeFrame.deltaTime = 1 / 120;
        renderer.info.frame = nodeFrame.frameId;
        renderer.info.reset();
        manager.render(startTime + elapsed, 1 / 120);
        elapsed += 1000 / 120;
        if (batch >= warmup) {
          renderCalls += renderer.info.render.frameCalls;
          drawCalls += renderer.info.render.drawCalls;
        }
      }
      // Amortize completion synchronization rather than stalling each frame.
      await device.queue.onSubmittedWorkDone();
      if (batch >= warmup) samples.push((performance.now() - start) / framesPerBatch);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length * 0.5)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    const entry = manager.scenes.get(manager.activePrevId);
    const frames = batches * framesPerBatch;
    return {
      scene: entry.sceneObj.name,
      canvas: [renderer.domElement.width, renderer.domElement.height],
      dpr: renderer.getPixelRatio(),
      sceneSamples: entry.gbuffer.target.samples,
      frames,
      medianMs: median,
      p95Ms: p95,
      budgetMs: 1000 / 120,
      within120FpsBudget: p95 <= 1000 / 120,
      renderCalls: renderCalls / frames,
      drawCalls: drawCalls / frames,
    };
  } finally {
    nodeFrame.time = initialTime + (performance.now() - startTime) / 1000;
    nodeFrame.lastTime = performance.now();
    renderer.info.autoReset = autoReset;
    renderer.backend.trackTimestamp = trackTimestamp;
    await renderer.setAnimationLoop(loop);
    animation.start();
  }
}
