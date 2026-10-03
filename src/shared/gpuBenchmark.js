const TIMEOUT_MS = 4000;

/**
 * Sustained FP32 compute throughput in GFLOPS, or null when it can't be
 * measured. Separates GPUs that report identical adapter info (M1 vs M3 Max).
 * Runs in its own worker: the booting main thread delays GPU completion
 * callbacks and would make the GPU look several times slower.
 */
export function benchmarkGPU() {
  return new Promise((resolve) => {
    let worker;
    const finish = (score) => {
      clearTimeout(timer);
      worker?.terminate();
      resolve(score);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    try {
      worker = new Worker(new URL("./gpuBenchmark.worker.js", import.meta.url), { type: "module" });
    } catch (error) {
      console.warn("[tiers] GPU benchmark failed:", error);
      finish(null);
      return;
    }
    worker.onmessage = (event) => finish(event.data);
    worker.onerror = () => finish(null);
    worker.postMessage(null);
  });
}
