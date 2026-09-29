import { getFlag } from "@/offscreen/lib/query";

export const REQUIRED_LIMITS = {
  maxStorageBuffersPerShaderStage: 10,
};

const TIMEOUT_MS = 4000;

const withTimeout = (promise, reason) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(reason)), TIMEOUT_MS)),
  ]);

export async function detectWebGPU() {
  if (getFlag("noWebGPU")) return { supported: false, reason: "forced" };
  if (typeof navigator === "undefined" || !navigator.gpu) {
    return { supported: false, reason: "unsupported" };
  }

  try {
    const adapter = await withTimeout(
      navigator.gpu.requestAdapter({ powerPreference: "high-performance" }),
      "adapter-timeout",
    );
    if (!adapter) return { supported: false, reason: "no-adapter" };

    for (const [name, value] of Object.entries(REQUIRED_LIMITS)) {
      if ((adapter.limits[name] ?? 0) < value) {
        return { supported: false, reason: "limits" };
      }
    }

    const device = await withTimeout(
      adapter.requestDevice({ requiredLimits: REQUIRED_LIMITS }),
      "device-timeout",
    );
    device.destroy();
    return { supported: true };
  } catch (error) {
    console.warn("WebGPU check failed:", error);
    return { supported: false, reason: "device" };
  }
}
