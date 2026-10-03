const WORKGROUP_SIZE = 64;
const WORKGROUPS = 4096;
const ITERATIONS = 2048;
const FLOP_PER_DISPATCH = WORKGROUP_SIZE * WORKGROUPS * ITERATIONS * 4 * 4 * 2;
// Apple GPUs need ~350ms of load to leave their idle clocks.
const WARMUP_MS = 300;
const MEASURE_MS = 25;
const MEASURE_RUNS = 3;
const TIMEOUT_MS = 4000;

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

async function measure(adapter) {
  // Wall-clock timing runs on a main thread that is busy booting the app and
  // reads several times too slow, so GPU timestamps are preferred.
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
    const querySet = timestamps
      ? device.createQuerySet({ type: "timestamp", count: 2 })
      : null;
    const resolve = timestamps
      ? device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        })
      : null;
    const readback = timestamps
      ? device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        })
      : null;

    const run = async (dispatches, timed = false) => {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass(
        timed && timestamps
          ? {
              timestampWrites: {
                querySet,
                beginningOfPassWriteIndex: 0,
                endOfPassWriteIndex: 1,
              },
            }
          : undefined,
      );
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      for (let i = 0; i < dispatches; i++) pass.dispatchWorkgroups(WORKGROUPS);
      pass.end();
      if (timed && timestamps) {
        encoder.resolveQuerySet(querySet, 0, 2, resolve, 0);
        encoder.copyBufferToBuffer(resolve, 0, readback, 0, 16);
      }
      const start = performance.now();
      device.queue.submit([encoder.finish()]);
      if (!(timed && timestamps)) {
        await device.queue.onSubmittedWorkDone();
        return performance.now() - start;
      }
      await readback.mapAsync(GPUMapMode.READ);
      const [begin, end] = new BigInt64Array(readback.getMappedRange());
      readback.unmap();
      return Number(end - begin) / 1e6;
    };

    let last = await run(1);
    for (let spent = last; spent < WARMUP_MS; spent += last) last = await run(1);

    const dispatches = Math.max(1, Math.ceil(MEASURE_MS / last));
    let best = Infinity;
    for (let i = 0; i < MEASURE_RUNS; i++) {
      const ms = await run(dispatches, true);
      if (ms > 0) best = Math.min(best, ms);
    }
    if (best === Infinity) return null;
    return Math.round((FLOP_PER_DISPATCH * dispatches) / best / 1e6);
  } finally {
    device.destroy();
  }
}

/**
 * Sustained FP32 compute throughput in GFLOPS, or null when it can't be
 * measured. Separates GPUs that report identical adapter info (M1 vs M3 Max).
 * Consumes the adapter: it can't create another device afterwards.
 */
export async function benchmarkGPU(adapter) {
  try {
    return await Promise.race([
      measure(adapter),
      new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
  } catch (error) {
    console.warn("[tiers] GPU benchmark failed:", error);
    return null;
  }
}
