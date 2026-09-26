import { getBoundParams, readBoundValue } from "./bindDebugParams";

export function collectParamUpdates() {
  const updates = {};

  for (const [path, { node, target }] of getBoundParams()) {
    const raw = readBoundValue(target);
    const serialized = serializeValue(raw, node);
    if (!serialized) continue;
    if (sameValue(serialized, node.value)) continue;
    updates[path] = serialized;
  }

  return updates;
}

const saveSources = new Map();

/**
 * Extra files written alongside params.js. `collect` returns
 * `{ content, count }` or null when there is nothing to save.
 * The name must be allowlisted in vite/saveParamsPlugin.js.
 */
export function registerSaveSource(name, collect) {
  saveSources.set(name, collect);
}

export async function saveParamsToFile() {
  const updates = collectParamUpdates();
  const files = {};
  let count = Object.keys(updates).length;
  for (const [name, collect] of saveSources) {
    const file = collect();
    if (!file) continue;
    files[name] = file.content;
    count += file.count;
  }
  const res = await fetch("/__save-params", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates, files }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `save failed (${res.status})`);
  }
  return { ...data, count };
}

export function attachSaveParamsButton(gui) {
  if (!gui || gui._saveParamsBound || !import.meta.env.DEV) return;
  gui._saveParamsBound = true;

  const actions = {
    "Save to params.js": async () => {
      const control = actions._control;
      try {
        const result = await saveParamsToFile();
        const label = result.count
          ? `Saved ${result.count}`
          : "No changes";
        control?.name(label);
        console.log(`[params] ${label.toLowerCase()} → params.js`);
      } catch (error) {
        control?.name("Save failed");
        console.error("[params] save failed", error);
      }
      window.setTimeout(() => control?.name("Save to params.js"), 1600);
    },
  };

  const control = gui.add(actions, "Save to params.js");
  actions._control = control;
}

function serializeValue(raw, node) {
  if (raw === undefined) return null;
  if (node.type === "image") return null;

  if (node.type === "color" || raw?.isColor) {
    return { type: "color", value: colorToHex(raw) };
  }
  if (typeof raw === "boolean" || node.type === "boolean") {
    return { type: "boolean", value: Boolean(raw) };
  }
  if (typeof raw === "string" || node.options) {
    return { type: "string", value: String(raw) };
  }
  if (typeof raw === "number") {
    return { type: "number", value: raw, step: node.step };
  }
  if (Array.isArray(raw)) {
    return { type: "array", value: raw };
  }
  if (raw?.isVector2) return { type: "array", value: [raw.x, raw.y] };
  if (raw?.isVector3) return { type: "array", value: [raw.x, raw.y, raw.z] };
  if (raw?.isVector4) {
    return { type: "array", value: [raw.x, raw.y, raw.z, raw.w] };
  }
  return null;
}

function colorToHex(raw) {
  if (raw?.isColor) return raw.getHex();
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const hex = raw.startsWith("#")
      ? raw.slice(1)
      : raw.startsWith("0x")
        ? raw.slice(2)
        : raw;
    return parseInt(hex, 16);
  }
  return 0;
}

function sameValue(serialized, original) {
  if (serialized.type === "color") {
    return (serialized.value >>> 0) === (Number(original) >>> 0);
  }
  if (serialized.type === "number") {
    return Math.abs(serialized.value - Number(original)) < 1e-6;
  }
  if (serialized.type === "array") {
    return JSON.stringify(serialized.value) === JSON.stringify(original);
  }
  return serialized.value === original;
}
