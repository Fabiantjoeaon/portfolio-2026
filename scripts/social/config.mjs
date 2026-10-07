import { existsSync, readdirSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, probe } from '../lib/media.mjs';
import { TEMPLATES } from './layouts.mjs';

const FRAME_KEYS = ['padding', 'gap', 'fit', 'zoom', 'focus', 'radius'];
const OUTPUT_KEYS = ['width', 'height', 'fps'];
const CONTENT_KEYS = ['clips', 'slots', 'images', 'videos', 'each', 'kind', 'background', 'transition', 'video', 'image', ...FRAME_KEYS, ...OUTPUT_KEYS];
const ANIMATE = { flicker: 0.02, ripple: 0.55, intro: 0.8 };
const STILL_DURATION = 3;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export const merge = (...layers) => layers.reduce((out, layer) => {
  if (!isObject(layer)) return out;
  for (const [key, value] of Object.entries(layer)) {
    if (value === undefined) continue;
    out[key] = isObject(value) && isObject(out[key]) ? merge(out[key], value) : value;
  }
  return out;
}, {});

const pick = (object, keys) => Object.fromEntries(keys.filter(key => object?.[key] !== undefined).map(key => [key, object[key]]));
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));

const catalog = (dir, extensions) => {
  const files = existsSync(dir) ? readdirSync(dir).filter(file => !file.startsWith('.') && extensions.has(extname(file).toLowerCase())).sort() : [];
  return new Map(files.map(file => [basename(file, extname(file)), join(dir, file)]));
};

function createResolver(sources, root) {
  const dirs = { video: resolve(root, sources.videos), image: resolve(root, sources.images) };
  const maps = { video: catalog(dirs.video, VIDEO_EXTENSIONS), image: catalog(dirs.image, IMAGE_EXTENSIONS) };
  const probed = new Map();
  const find = (name, prefer) => {
    const ext = extname(name);
    const key = ext ? basename(name, ext) : name;
    for (const type of prefer === 'image' ? ['image', 'video'] : ['video', 'image']) {
      const path = maps[type].get(key);
      if (path && (!ext || extname(path).toLowerCase() === ext.toLowerCase())) return { path, type };
    }
    return null;
  };
  return {
    dirs,
    files: [...maps.video.values(), ...maps.image.values()],
    expand: (list, prefer) => [].concat(list).flatMap(item => item === '*' ? [...maps[prefer].keys()] : [item]),
    source(name, prefer, context) {
      const found = find(String(name), prefer);
      if (!found) {
        const known = [...new Set([...maps.video.keys(), ...maps.image.keys()])].join(', ');
        throw new Error(`${context}: no source "${name}" (known: ${known})`);
      }
      if (!probed.has(found.path)) {
        const info = probe(found.path);
        probed.set(found.path, {
          name: basename(found.path, extname(found.path)),
          path: found.path,
          type: found.type,
          width: info.width,
          height: info.height,
          duration: found.type === 'video' ? info.duration : 0,
        });
      }
      return probed.get(found.path);
    },
  };
}

const clipSpec = entry => typeof entry === 'string' ? { src: entry }
  : Array.isArray(entry) ? { src: entry[0], from: entry[1], to: entry[2] }
    : entry;

function parseClip(entry, prefer, resolver, context) {
  const spec = clipSpec(entry);
  if (!spec?.src) throw new Error(`${context}: every clip needs a source name`);
  const source = resolver.source(spec.src, prefer, context);
  let from = spec.from ?? 0;
  let to = spec.to ?? null;
  if (source.type === 'video') {
    if (to === null || to > source.duration) {
      if (to !== null) console.warn(`  ! ${context}: ${source.name} ends at ${source.duration.toFixed(2)}s, cut to ${to}s clamped`);
      to = source.duration;
    }
    if (!(from >= 0 && to > from)) throw new Error(`${context}: ${source.name} cut [${spec.from}, ${spec.to}] is empty`);
  } else {
    from = 0;
    to = spec.duration ?? STILL_DURATION;
  }
  return { source, from, to, ...pick(spec, ['zoom', 'focus', 'transition']) };
}

function resolveAsset(name, asset, config, resolver, outDir) {
  const template = TEMPLATES[asset.template];
  const context = `assets.${name}`;
  const { kind } = asset;
  const output = merge(config.output, pick(asset, OUTPUT_KEYS), pick(asset, ['video', 'image']));
  const background = merge(config.background, asset.background);
  if (!['glow', 'grid'].includes(background.type)) throw new Error(`${context}: background.type must be 'glow' or 'grid'`);
  const animate = kind === 'video' && background.grid?.animate;
  background.grid = { ...background.grid, animate: animate ? merge(ANIMATE, animate === true ? {} : animate) : false };
  const frame = merge(config.frame, template.frame, pick(asset, FRAME_KEYS));
  const transition = merge(config.transition, asset.transition);
  const options = merge({ length: 'shortest' }, template.defaults, omit(asset, CONTENT_KEYS));
  const withFrame = (clip, slotFrame, slotTransition) => ({
    ...clip,
    zoom: clip.zoom ?? slotFrame.zoom,
    focus: clip.focus ?? slotFrame.focus,
    transition: merge(slotTransition, clip.transition),
  });

  let slots = [];
  let pool = null;
  if (template.pool) {
    const list = kind === 'video' ? asset.videos ?? asset.clips : asset.images;
    if (!list) throw new Error(`${context}: ${asset.template} needs ${kind === 'video' ? 'videos' : 'images'}`);
    pool = resolver.expand(list, kind).map(entry => withFrame(parseClip(entry, kind, resolver, context), frame, transition));
  } else {
    const specs = asset.slots
      ?? (asset.clips ? [{ clips: asset.clips }] : asset.images ? resolver.expand(asset.images, 'image').map(image => ({ clips: [image] })) : []);
    slots = specs.map(spec => {
      const slot = Array.isArray(spec) || typeof spec === 'string' ? { clips: [].concat(spec) } : spec;
      const slotFrame = merge(frame, pick(slot, FRAME_KEYS));
      const slotTransition = merge(transition, slot.transition);
      const clips = resolver.expand(slot.clips ?? [], kind).map(entry => withFrame(parseClip(entry, kind, resolver, context), slotFrame, slotTransition));
      if (!clips.length) throw new Error(`${context}: a slot has no clips`);
      if (kind === 'image' && clips.length > 1) console.warn(`  ! ${context}: image slots show one source, extra clips ignored`);
      return { frame: slotFrame, clips: kind === 'image' ? clips.slice(0, 1) : clips };
    });
    const [min, max] = template.slots;
    if (slots.length < min || slots.length > max) {
      throw new Error(`${context}: ${asset.template} takes ${min === max ? min : `${min}-${max}`} slots, got ${slots.length}`);
    }
  }

  const ext = kind === 'video' ? 'mp4' : output.image.format;
  return {
    name,
    template: asset.template,
    kind,
    out: join(outDir, `${name}.${ext}`),
    cover: kind === 'video' ? join(outDir, `${name}.cover.jpg`) : null,
    output,
    background,
    frame,
    options,
    slots,
    pool,
  };
}

export function resolveConfig(config, root = process.cwd()) {
  const resolver = createResolver(config.sources, root);
  const outDir = resolve(root, config.output.dir);
  const jobs = [];
  for (const [name, asset] of Object.entries(config.assets ?? {})) {
    if (!TEMPLATES[asset.template]) {
      throw new Error(`assets.${name}: unknown template "${asset.template}" (${Object.keys(TEMPLATES).join(', ')})`);
    }
    const kind = asset.kind ?? (asset.clips || asset.slots || asset.videos ? 'video' : 'image');
    if (!asset.each) {
      jobs.push(resolveAsset(name, { ...asset, kind }, config, resolver, outDir));
      continue;
    }
    for (const entry of resolver.expand(asset.each, kind)) {
      const spec = clipSpec(entry);
      const source = resolver.source(spec.src, kind, `assets.${name}`);
      const single = { ...omit(asset, ['each']), kind, [kind === 'video' ? 'clips' : 'images']: [entry] };
      jobs.push(resolveAsset(`${name}/${source.name}`, single, config, resolver, outDir));
    }
  }
  return { jobs, outDir, sourceDirs: Object.values(resolver.dirs), sourceFiles: resolver.files };
}
