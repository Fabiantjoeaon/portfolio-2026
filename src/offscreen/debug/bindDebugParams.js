/**
 * Bind three.js Inspector folders (createParameters) to live values.
 *
 * Specs:
 *   {
 *     name, folder?,
 *     uniform?,              // TSL UniformNode — binds `.value`
 *     object?, property?,    // plain object property
 *     type?: 'color' | 'boolean' | 'vector' | 'select' | 'button' | 'image',
 *     min?, max?, step?, options?,
 *     onChange?,
 *   }
 *
 * Number sliders and color pickers write through on `input`, so TSL
 * uniforms and THREE.Color values update before the next frame.
 */

import { isDebugParam, isParamLeaf } from "@/offscreen/params";

const boundParams = new Map();

export function clearBoundParams() {
  boundParams.clear();
}

export function getBoundParams() {
  return boundParams;
}

export function readBoundValue(target) {
  const resolved = resolveTarget(target);
  if (!resolved) return undefined;
  return resolved.object?.[resolved.property];
}

function isColorValue(value) {
  return Boolean(value?.isColor);
}

function isVectorValue(value) {
  return Boolean(value?.isVector2 || value?.isVector3 || value?.isVector4);
}

function vectorAxes(value) {
  if (value?.isVector2) return ["x", "y"];
  if (value?.isVector4) return ["x", "y", "z", "w"];
  return ["x", "y", "z"];
}

function resolveTarget(spec) {
  if (spec.uniform) {
    return { object: spec.uniform, property: "value" };
  }
  if (spec.object != null && spec.property) {
    return { object: spec.object, property: spec.property };
  }
  if (spec.object != null) {
    return { object: spec, property: "object" };
  }
  return null;
}

/**
 * Get or create a nested Inspector folder. Folders are cached on `gui`
 * so separate bind calls (scene + mesh, multiple specs) share them.
 *
 * @param {object} gui - Inspector ParametersGroup
 * @param {string} [path] - `"Lighting"` or `"Glow/Noise"`
 */
function tagDebugFolder(folder, depth) {
  const el = folder?.paramList?.domElement;
  if (!el) return;
  el.classList.remove("debug-folder-root", "debug-folder-main", "debug-folder-sub", "debug-folder-nested");
  el.classList.add(
    "debug-folder",
    depth <= 0
      ? "debug-folder-root"
      : depth === 1
        ? "debug-folder-main"
        : depth === 2
          ? "debug-folder-sub"
          : "debug-folder-nested",
  );
}

export function getDebugFolder(gui, path) {
  if (!gui) return null;
  if (!gui._debugRootTagged) {
    tagDebugFolder(gui, 0);
    gui._debugRootTagged = true;
  }
  if (!path) return gui;

  const cache = (gui._debugFolders ??= new Map());
  let pane = gui;
  let acc = "";

  for (const part of String(path).split("/").filter(Boolean)) {
    acc = acc ? `${acc}/${part}` : part;
    if (!cache.has(acc)) {
      const folder = pane.addFolder(part);
      tagDebugFolder(folder, acc.split("/").length);
      cache.set(acc, folder);
    }
    pane = cache.get(acc);
  }

  return pane;
}

export function sceneDebugLabel(scene) {
  return scene.debugLabel || scene.name;
}

/**
 * Bind a params.js group. Nested objects become folders under `folderPrefix`.
 *
 * @param {object} gui
 * @param {object} group
 * @param {(key: string, spec: object) => object|null} resolve
 * @param {string} [folderPrefix]
 */
export function bindParamGroup(gui, group, resolve, folderPrefix = "") {
  if (!gui || !group) return [];

  const controls = [];

  for (const [key, node] of Object.entries(group)) {
    const path = folderPrefix ? `${folderPrefix}/${key}` : key;

    if (isParamLeaf(node)) {
      if (!isDebugParam(node)) continue;
      const target = resolve?.(key, node);
      if (!target) continue;
      boundParams.set(path.replaceAll("/", "."), { node, target });
      controls.push(
        ...bindDebugParams(gui, [
          {
            ...node,
            ...target,
            folder: folderPrefix,
            name: node.name || key,
          },
        ]),
      );
      continue;
    }

    if (node && typeof node === "object") {
      controls.push(...bindParamGroup(gui, node, resolve, path));
    }
  }

  return controls;
}

/**
 * Create a scene folder once and bind its specs. Safe to call again.
 *
 * @returns {object|null} the scene folder
 */
export function attachSceneDebug(gui, scene, items) {
  if (!gui || !scene) return null;

  const folder = getDebugFolder(gui, sceneDebugLabel(scene));
  if (!folder) return null;
  if (folder._debugBound) return folder;

  folder._debugBound = true;
  if (items?.length) bindDebugParams(folder, items);
  return folder;
}

/**
 * @param {object} uniforms - map of UniformNodes
 * @param {Array<{ key: string } & object>} specs
 */
export function uniformDebugItems(uniforms, specs) {
  return specs.map(({ key, ...rest }) => ({
    ...rest,
    uniform: uniforms[key],
  }));
}

export function bindUniformDebug(gui, uniforms, specs) {
  return bindDebugParams(gui, uniformDebugItems(uniforms, specs));
}

export function bindDebugParams(gui, items) {
  if (!gui || !items?.length) return [];

  const controls = [];

  for (const spec of items) {
    const pane = getDebugFolder(gui, spec.folder);
    if (!pane) continue;

    if (spec.type === "button") {
      const control = addControl(pane, spec, spec, spec.name, "button");
      if (control) controls.push(control);
      continue;
    }

    const target = resolveTarget(spec);
    if (!target) continue;

    const { object, property } = target;
    const value = object?.[property];
    if (value === undefined && spec.type !== "image") {
      console.warn(`[debug] skipped "${spec.name || property}": missing value`);
      continue;
    }

    const type =
      spec.type ||
      (isColorValue(value)
        ? "color"
        : isVectorValue(value)
          ? "vector"
          : typeof value === "boolean"
            ? "boolean"
            : spec.options
              ? "select"
              : "number");

    if (type === "vector") {
      const axes = vectorAxes(value);
      for (const axis of axes) {
        const control = addControl(pane, {
          ...spec,
          name: spec.name ? `${spec.name} ${axis.toUpperCase()}` : axis,
          type: "number",
        }, value, axis);
        if (control) controls.push(control);
      }
      continue;
    }

    const control = addControl(pane, spec, object, property, type);
    if (control) controls.push(control);
  }

  return controls;
}

function addControl(pane, spec, object, property, type = spec.type) {
  let control = null;

  if (type === "color") {
    control = pane.addColor(object, property);
  } else if (type === "boolean") {
    control = pane.addBoolean(object, property);
  } else if (type === "select" || spec.options) {
    control = pane.add(object, property, spec.options);
  } else if (type === "button") {
    const actions = { [spec.name || property]: spec.onChange || object[property] };
    control = pane.add(actions, spec.name || property);
    if (spec.name) control.name(spec.name);
    return control;
  } else if (type === "image") {
    return addImageControl(pane, spec);
  } else if (spec.min != null && spec.max != null) {
    control = pane.add(object, property, spec.min, spec.max, spec.step ?? 0.01);
  } else {
    control = pane.add(object, property);
  }

  if (!control) return null;
  if (spec.name) control.name(spec.name);
  if (spec.onChange) control.onChange(spec.onChange);
  return control;
}

function addImageControl(pane, spec) {
  if (typeof document === "undefined") return null;

  const label = spec.name || "Image";
  const actions = {
    [label]: () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp,image/gif";
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file) spec.onChange?.(file);
      });
      input.click();
    },
  };
  const control = pane.add(actions, label);
  control.name(label);
  return control;
}
