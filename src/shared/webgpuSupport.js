import { getFlag, getNumber } from "@/offscreen/lib/query";

// Firefox caps maxStorageBuffersPerShaderStage at 9.
const LIMITS = {
  maxStorageBuffersPerShaderStage: { preferred: 10, minimum: 8 },
};

const TIMEOUT_MS = 4000;

const withTimeout = (promise, reason) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(reason)), TIMEOUT_MS)),
  ]);

/** Limits the device is created with: what `detectWebGPU` negotiated, forwarded via the query string. */
export function requiredLimits() {
  return Object.fromEntries(
    Object.entries(LIMITS).map(([name, { preferred }]) => [name, getNumber(name, preferred)]),
  );
}

export async function detectWebGPU() {
  if (getFlag("noWebGPU")) return { supported: false, reason: "forced" };
  if (!self.isSecureContext) return { supported: false, reason: "insecure" };
  if (typeof navigator === "undefined" || !navigator.gpu) {
    return { supported: false, reason: "unsupported" };
  }

  try {
    const adapter = await withTimeout(
      navigator.gpu.requestAdapter({ powerPreference: "high-performance" }),
      "adapter-timeout",
    );
    if (!adapter) return { supported: false, reason: "no-adapter" };

    const limits = {};
    for (const [name, { preferred, minimum }] of Object.entries(LIMITS)) {
      const available = adapter.limits[name] ?? 0;
      if (available < minimum) return { supported: false, reason: "limits" };
      limits[name] = Math.min(preferred, available);
    }

    const device = await withTimeout(
      adapter.requestDevice({ requiredLimits: limits }),
      "device-timeout",
    );
    device.destroy();
    return { supported: true, limits };
  } catch (error) {
    console.warn("WebGPU check failed:", error);
    return { supported: false, reason: "device" };
  }
}
