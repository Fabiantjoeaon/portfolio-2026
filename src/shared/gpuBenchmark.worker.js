const WORKGROUP_SIZE = 64;
const WORKGROUPS = 4096;
const ITERATIONS = 2048;
const FLOP_PER_DISPATCH = WORKGROUP_SIZE * WORKGROUPS * ITERATIONS * 4 * 4 * 2;
// Apple GPUs start at idle clocks and only ramp under continuous load.
const WARMUP_MS = 400;
const WARMUP_BATCH_MS = 50;
const MEASURE_MS = 40;
const MAX_RUNS = 8;

const SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> result: array<f32>;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3u) {
  let s = f32(id.x) * 1e-6;
  var a = vec4f(s, s + 1.0, s + 2.0, s + 3.0);
  var b = a + 4.0;
  var c = a + 8.0;
  var d = a + 12.0;
  let m = vec4f(0.9999);
  let k = vec4f(1e-4);
  for (var i = 0u; i < ${ITERATIONS}u; i++) {
    a = fma(a, m, k);
    b = fma(b, m, k);
    c = fma(c, m, k);
    d = fma(d, m, k);
  }
  result[id.x] = dot(a + b + c + d, vec4f(1.0));
}`;

async function measure() {
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return null;
  // Safari exposes timestamp-query but writes zeros, so wall-clock time in
  // this otherwise idle worker is the fallback.
  const timestamps = adapter.features.has("timestamp-query");
  const device = await adapter.requestDevice({
    requiredFeatures: timestamps ? ["timestamp-query"] : [],
  });
  try {
    const pipeline = await device.createComputePipelineAsync({
      layout: "auto",
      compute: { module: device.createShaderModule({ code: SHADER }) },
    });
    const buffer = device.createBuffer({
      size: WORKGROUP_SIZE * WORKGROUPS * 4,
      usage: GPUBufferUsage.STORAGE,
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer } }],
    });
    const querySet = timestamps ? device.createQuerySet({ type: "timestamp", count: 2 }) : null;
    const resolve = timestamps
      ? device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC })
      : null;
    const readback = timestamps
      ? device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
      : null;

    const run = async (dispatches) => {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass(
        timestamps
          ? { timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } }
          : undefined,
      );
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      for (let i = 0; i < dispatches; i++) pass.dispatchWorkgroups(WORKGROUPS);
      pass.end();
      if (timestamps) {
        encoder.resolveQuerySet(querySet, 0, 2, resolve, 0);
        encoder.copyBufferToBuffer(resolve, 0, readback, 0, 16);
      }
      const start = performance.now();
      device.queue.submit([encoder.finish()]);
      if (!timestamps) {
        await device.queue.onSubmittedWorkDone();
        return performance.now() - start;
      }
      await readback.mapAsync(GPUMapMode.READ);
      const [begin, end] = new BigInt64Array(readback.getMappedRange());
      readback.unmap();
      const gpuMs = Number(end - begin) / 1e6;
      return gpuMs > 0 ? gpuMs : performance.now() - start;
    };

    let perDispatch = await run(1);
    const warmupStart = performance.now();
    while (performance.now() - warmupStart < WARMUP_MS) {
      const dispatches = Math.max(1, Math.ceil(WARMUP_BATCH_MS / perDispatch));
      perDispatch = (await run(dispatches)) / dispatches;
    }

    // Clocks may still be climbing: measure until throughput stops improving.
    const dispatches = Math.max(1, Math.ceil(MEASURE_MS / perDispatch));
    let best = Infinity;
    for (let i = 0, stale = 0; i < MAX_RUNS && stale < 2; i++) {
      const ms = await run(dispatches);
      stale = ms < best * 0.97 ? 0 : stale + 1;
      best = Math.min(best, ms);
    }
    return Math.round((FLOP_PER_DISPATCH * dispatches) / best / 1e6);
  } finally {
    device.destroy();
  }
}

self.onmessage = async () => {
  let score = null;
  try {
    score = await measure();
  } catch (error) {
    console.warn("[tiers] GPU benchmark failed:", error);
  }
  self.postMessage(score);
};
