import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { glitchExpression } from './glitch.mjs';
import { layoutJob } from './layouts.mjs';
import { LoaderGrid, NoiseGlow, paintRoundedMask, paintVignette, rgb, writeImage } from './painter.mjs';

const SRGB_PROFILE = '/System/Library/ColorSync/Profiles/sRGB Profile.icc';
const GRID_EDGE = 0.2;
const TO_VIDEO = 'out_color_matrix=bt709:out_range=tv';

const fixed = value => value.toFixed(4);
const digest = value => createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 12);

class Graph {
  constructor() {
    this.inputs = [];
    this.filters = [];
    this.count = 0;
  }

  input(args) {
    this.inputs.push(args.map(String));
    return `${this.inputs.length - 1}:v`;
  }

  chain(from, filters, to = `v${this.count++}`) {
    const sources = [].concat(from).map(name => `[${name}]`).join('');
    this.filters.push(`${sources}${[].concat(filters).filter(Boolean).join(',')}[${to}]`);
    return to;
  }

  split(from, labels) {
    if (labels.length === 1) this.chain(from, 'null', labels[0]);
    else this.filters.push(`[${from}]split=${labels.length}${labels.map(label => `[${label}]`).join('')}`);
  }

  args() {
    return [...this.inputs.flat(), '-filter_complex', this.filters.join(';')];
  }
}

/** Screenshots carry a display profile ffmpeg ignores, so they are converted to sRGB once. */
function prepareImage(source, cache) {
  const { mtimeMs, size } = statSync(source.path);
  const target = join(cache, `${source.name}-${digest([source.path, mtimeMs, size])}.png`);
  if (existsSync(target)) return target;
  const profile = existsSync(SRGB_PROFILE) ? ['-profile', SRGB_PROFILE] : ['-colorspace', 'sRGB'];
  execFileSync('magick', [source.path, ...profile, '-alpha', 'off', '-strip', `PNG24:${target}.tmp`]);
  renameSync(`${target}.tmp`, target);
  return target;
}

const loopedImage = (ctx, path) => ctx.video ? ['-loop', '1', '-framerate', ctx.fps, '-i', path] : ['-i', path];

function fit(ctx, clip, w, h) {
  const { source } = clip;
  const zoom = Math.max(1, clip.zoom ?? 1);
  const [focusX, focusY] = clip.focus ?? [0.5, 0.5];
  const scale = Math.max(w / source.width, h / source.height) * zoom;
  const cropW = Math.min(source.width, Math.round(w / scale));
  const cropH = Math.min(source.height, Math.round(h / scale));
  const flags = ctx.preview ? 'bilinear' : 'lanczos+accurate_rnd+full_chroma_int';
  const sharpen = ctx.video ? ctx.job.output.video.sharpen : ctx.job.output.image.sharpen;
  return [
    `crop=${cropW}:${cropH}:${Math.round((source.width - cropW) * focusX)}:${Math.round((source.height - cropH) * focusY)}`,
    `scale=${w}:${h}:flags=${flags}${ctx.video && source.type === 'image' ? `:${TO_VIDEO}` : ''}`,
    sharpen > 0 && `unsharp=5:5:${sharpen}:5:5:0`,
    'setsar=1',
    ctx.video ? 'format=yuv420p' : 'format=rgb24',
  ];
}

/** One clip fitted to w×h; in videos exactly `frames` long, looping the source when `loop`. */
function clipStream(ctx, clip, w, h, frames, loop = false) {
  const { graph, fps } = ctx;
  const { source } = clip;
  const length = fixed(frames / fps + 2 / fps);
  let input;
  if (source.type === 'video') {
    input = graph.input([
      ...(loop ? ['-stream_loop', '-1'] : []),
      '-ss', fixed(clip.from),
      ...(ctx.video && !loop ? ['-t', length] : []),
      '-i', source.path,
    ]);
  } else {
    const path = prepareImage(source, ctx.cache);
    input = graph.input(ctx.video ? ['-loop', '1', '-framerate', fps, '-t', length, '-i', path] : ['-i', path]);
  }
  // setpts drops the link's frame rate, which xfade needs, so fps runs again after it.
  const timing = ctx.video
    ? [`fps=${fps}`, !loop && `tpad=stop_mode=clone:stop=${fps}`, `trim=end_frame=${frames}`, 'setpts=PTS-STARTPTS', `fps=${fps}`]
    : [];
  return graph.chain(input, [...timing, ...fit(ctx, clip, w, h)]);
}

const yuv = hex => {
  const [r, g, b] = rgb(hex);
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [16 + 219 * y / 255, 128 + 224 * (b - y) / (1.8556 * 255), 128 + 224 * (r - y) / (1.5748 * 255)].map(value => value.toFixed(1));
};

// The loader's fill: tiles switch from the center out with jitter, each flashing in the ink as it lands.
// xfade evaluates this on several slice threads sharing one st()/ld() store, so nothing is stored.
function gridExpression({ cell, jitter, flash }, rect, ink) {
  const columns = Math.max(1, Math.round(rect.w / cell));
  const rows = Math.max(1, Math.round(rect.h / cell));
  const centerX = (columns - 1) / 2;
  const centerY = (rows - 1) / 2;
  const reach = Math.hypot(centerX, centerY * 1.4) || 1;
  const [y, u, v] = yuv(ink);
  const column = `floor(X*${columns}/W)`;
  const row = `floor(Y*${rows}/H)`;
  const order = `(${1 - jitter}*hypot(${column}-${centerX},(${row}-${centerY})*1.4)/${fixed(reach)}`
    + `+${jitter}*abs(mod(sin(${column}*12.9898+${row}*78.233)*43758.5453,1)))`;
  const lag = `((1-P)*(1-P)*(1+2*P)*${1 + GRID_EDGE}-${order})`;
  const ink3 = `if(eq(PLANE,0),${y},if(eq(PLANE,1),${u},${v}))`;
  return `if(lt(${lag},0),A,B+(${ink3}-B)*${flash}*max(0,1-${lag}/${GRID_EDGE}))`;
}

// Half a frame early, so a rounded offset never lands past its frame and starts a frame late.
function xfade(ctx, transition, frames, offset, rect) {
  const base = `xfade=duration=${fixed(frames / ctx.fps)}:offset=${fixed((offset - 0.5) / ctx.fps)}`;
  if (transition.type === 'glitch') {
    const { style, expr } = glitchExpression(transition.glitch, { frames, rect, index: ctx.glitches.length });
    ctx.glitches.push({ style, time: (offset + frames / 2) / ctx.fps });
    return `${base}:transition=custom:expr='${expr}'`;
  }
  if (transition.type !== 'grid') return `${base}:transition=${transition.type}`;
  return `${base}:transition=custom:expr='${gridExpression(transition.grid, rect, transition.ink ?? ctx.job.background.ink)}'`;
}

/** A slot's clips joined by their transitions; records each transition's midpoint for the background. */
function sequence(ctx, slot, rect, events) {
  let label = null;
  let length = 0;
  let previous = 0;
  for (const clip of slot.clips) {
    const frames = Math.max(1, Math.round((clip.to - clip.from) * ctx.fps));
    const stream = clipStream(ctx, clip, rect.w, rect.h, frames);
    if (label === null) {
      [label, length, previous] = [stream, frames, frames];
      continue;
    }
    const { transition } = clip;
    const overlap = transition.type === 'cut' ? 0
      : Math.min(Math.round(transition.duration * ctx.fps), Math.floor(previous / 2), Math.floor(frames / 2));
    if (overlap < 1) {
      label = ctx.graph.chain([label, stream], 'concat=n=2:v=1:a=0');
    } else {
      label = ctx.graph.chain([label, stream], xfade(ctx, transition, overlap, length - overlap, rect));
      events.push({ time: (length - overlap / 2) / ctx.fps, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
    }
    length += frames - overlap;
    previous = frames;
  }
  return { label, length };
}

/** Rounded-corner alpha masks: one looped input per size, split to every stream that uses it. */
class Masks {
  constructor(ctx) {
    this.ctx = ctx;
    this.uses = new Map();
  }

  use(w, h, radius) {
    const key = digest([w, h, radius]);
    const entry = this.uses.get(key) ?? { w, h, radius, labels: [] };
    const label = `mask_${key}_${entry.labels.length}`;
    entry.labels.push(label);
    this.uses.set(key, entry);
    return label;
  }

  finish() {
    const { ctx } = this;
    for (const [key, { w, h, radius, labels }] of this.uses) {
      const path = join(ctx.cache, `mask-${key}.png`);
      if (!existsSync(path)) writeImage(paintRoundedMask(w, h, radius), w, h, 'gray', path);
      ctx.graph.split(ctx.graph.input(loopedImage(ctx, path)), labels);
    }
  }
}

/** Rounds the corners of a fitted stream, dims and rotates it; returns where it goes. */
function decorate(ctx, label, rect, radius) {
  const { graph, video } = ctx;
  const { dim } = rect;
  const darken = dim < 1 && (video
    ? `lutyuv=y=16+(val-16)*${dim}:u=128+(val-128)*${dim}:v=128+(val-128)*${dim}`
    : `colorchannelmixer=rr=${dim}:gg=${dim}:bb=${dim}`);
  if (!(radius > 0) && !rect.rotation) return { label: darken ? graph.chain(label, darken) : label, x: rect.x, y: rect.y };

  let out = graph.chain(label, `format=${video ? 'yuva420p' : 'rgba'}`);
  if (radius > 0) out = graph.chain([out, ctx.masks.use(rect.w, rect.h, radius)], 'alphamerge');
  const angle = fixed(rect.rotation * Math.PI / 180);
  if (darken || rect.rotation) out = graph.chain(out, [darken, rect.rotation && `rotate=${angle}:ow=rotw(${angle}):oh=roth(${angle}):c=none`]);
  if (!rect.rotation) return { label: out, x: rect.x, y: rect.y };
  return { label: out, x: `${rect.x + rect.w / 2}-w/2`, y: `${rect.y + rect.h / 2}-h/2` };
}

const overlay = (ctx, base, { label, x, y }) => ctx.graph.chain([base, label],
  `overlay=x=${x}:y=${y}:format=${ctx.video ? 'yuv420:shortest=1' : 'rgb'}`);

const backgroundFormat = ctx => (ctx.video ? [`scale=${TO_VIDEO}`, 'format=yuv420p'] : ['format=rgb24']);

/** Writes `paint(frame)` for every frame, reusing its buffer once the previous write has flushed. */
const streamFrames = (count, paint) => async stdin => {
  const write = buffer => new Promise((resolve, reject) => stdin.write(buffer, error => (error ? reject(error) : resolve())));
  for (let frame = 0; frame < count; frame++) await write(paint(frame));
  stdin.end();
};

/** The loader grid; when animated it flickers, fills from the center and ripples at each transition. */
function gridBackground(ctx) {
  const { job, graph, fps } = ctx;
  const { width, height } = job.output;
  const options = { ...job.background.grid, ink: job.background.ink, vignette: job.background.vignette };
  if (!options.animate) {
    const path = join(ctx.cache, `background-${digest([width, height, options])}.png`);
    if (!existsSync(path)) writeImage(new LoaderGrid(width, height, options).paint(), width, height, 'rgb24', path);
    return graph.chain(graph.input(loopedImage(ctx, path)), backgroundFormat(ctx));
  }
  const { intro, ripple } = options.animate;
  ctx.feed = (frames, events) => {
    const grid = new LoaderGrid(width, height, options);
    const queue = ripple > 0 ? events.toSorted((a, b) => a.time - b.time) : [];
    return streamFrames(frames, frame => {
      const time = frame / fps;
      if (intro > 0) grid.fill(Math.min(1, time / intro) * options.fill);
      while (queue.length && queue[0].time <= time) {
        const { x, y } = queue.shift();
        grid.ripple(x, y, ripple);
      }
      if (frame) grid.update(1 / fps);
      return grid.paint();
    });
  };
  const input = graph.input(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`, '-framerate', fps, '-i', 'pipe:0']);
  return graph.chain(input, backgroundFormat(ctx));
}

/**
 * The site's noise-glow screen shader, painted small in 16-bit and blurred up to size.
 * In videos it drifts at `speed`, painted at `glow.fps` and blended up to the output rate.
 */
function glowBackground(ctx) {
  const { job, graph, fps } = ctx;
  const { width, height } = job.output;
  const options = { ...job.background.glow, vignette: job.background.vignette };
  const glow = new NoiseGlow(width, height, options);
  const blur = [`gblur=sigma=${fixed(options.blur * options.resolution)}`, `scale=${width}:${height}:flags=bicubic`];
  if (!ctx.video || !(options.speed > 0)) {
    const path = join(ctx.cache, `glow-${digest([width, height, options])}.png`);
    if (!existsSync(path)) {
      // ffmpeg truncates 16-bit RGB to 8-bit without dithering, which bands the dark gradients.
      const [small, deep] = [`${path}.small.png`, `${path}.deep.png`];
      writeImage(glow.paint(options.time), glow.width, glow.height, 'rgb48le', small);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', small, '-vf', [...blur, 'format=rgb48be'].join(','), '-frames:v', '1', '-update', '1', deep]);
      execFileSync('magick', [deep, '-ordered-dither', 'o8x8,256', '-depth', '8', `PNG24:${path}`]);
      rmSync(small);
      rmSync(deep);
    }
    return graph.chain(graph.input(loopedImage(ctx, path)), backgroundFormat(ctx));
  }
  const rate = Math.min(fps, options.fps);
  ctx.feed = frames => streamFrames(Math.ceil((frames * rate) / fps) + 2, frame => glow.paint(options.time + frame / rate));
  const input = graph.input(['-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', `${glow.width}x${glow.height}`, '-framerate', rate, '-i', 'pipe:0']);
  // framerate only takes YUV; converting here keeps ffmpeg from picking BT.601 on its own.
  return graph.chain(input, [
    `scale=${TO_VIDEO}`,
    'format=yuv444p16le',
    rate < fps && `framerate=fps=${fps}:interp_start=0:interp_end=255:scene=100`,
    ...blur,
    'format=yuv420p',
  ]);
}

const background = ctx => (ctx.job.background.type === 'grid' ? gridBackground : glowBackground)(ctx);

function composeSlots(ctx, base, layout, events) {
  const { job, graph } = ctx;
  const streams = job.slots.map((slot, index) => {
    const rect = layout.rects[index];
    if (!ctx.video) return { rect, slot, label: clipStream(ctx, slot.clips[0], rect.w, rect.h, 1), length: 1 };
    return { rect, slot, ...sequence(ctx, slot, rect, events) };
  });
  const lengths = streams.map(stream => stream.length);
  const frames = job.options.length === 'longest' ? Math.max(...lengths) : Math.min(...lengths);
  for (const stream of streams) {
    if (stream.length === frames) continue;
    stream.label = graph.chain(stream.label, stream.length < frames
      ? `tpad=stop_mode=clone:stop=${frames - stream.length}`
      : `trim=end_frame=${frames}`);
  }
  for (const { rect, slot, label } of streams.sort((a, b) => a.rect.z - b.rect.z)) {
    base = overlay(ctx, base, decorate(ctx, label, rect, slot.frame.radius));
  }
  return { base, frames };
}

function composeMosaic(ctx, base, layout) {
  const { job, graph, fps } = ctx;
  const { width, height } = job.output;
  const frames = ctx.video ? Math.round(job.options.duration * fps) : 1;
  let canvas = graph.chain([], [
    `color=c=black@0:s=${layout.canvas.width}x${layout.canvas.height}:r=${fps}${ctx.video ? `:d=${fixed(frames / fps)}` : ''}`,
    `format=${ctx.video ? 'yuva420p' : 'rgba'}`,
  ]);

  const shared = new Map();
  if (!ctx.video) {
    const [{ w, h }] = layout.cards;
    for (const source of new Set(layout.cards.map(card => card.source))) {
      const labels = layout.cards.filter(card => card.source === source).map(() => `v${graph.count++}`);
      graph.split(clipStream(ctx, job.pool[source], w, h, 1), labels);
      shared.set(source, labels);
    }
  }
  for (const card of layout.cards) {
    const clip = job.pool[card.source];
    const label = ctx.video
      ? clipStream(ctx, { ...clip, from: clip.from + card.phase * Math.max(0, clip.to - clip.from - 1) }, card.w, card.h, frames, true)
      : shared.get(card.source).pop();
    canvas = overlay(ctx, canvas, decorate(ctx, label, card, job.frame.radius));
  }

  const angle = fixed(layout.rotation * Math.PI / 180);
  const wall = graph.chain(canvas, `rotate=${angle}:ow=${width}:oh=${height}:c=none`);
  base = overlay(ctx, base, { label: wall, x: 0, y: 0 });
  if (job.options.vignette > 0) {
    const path = join(ctx.cache, `vignette-${digest([width, height, job.options.vignette])}.png`);
    if (!existsSync(path)) writeImage(paintVignette(width, height, job.options.vignette), width, height, 'rgba', path);
    base = overlay(ctx, base, { label: graph.input(loopedImage(ctx, path)), x: 0, y: 0 });
  }
  return { base, frames };
}

function finish(ctx, base) {
  const { job } = ctx;
  const { width, height, video } = job.output;
  ctx.graph.chain(base, [
    ctx.video && video.grain > 0 && `noise=c0s=${video.grain}:c0f=t`,
    ctx.preview && `scale=${width / 2}:${height / 2}:flags=bilinear`,
    ctx.video ? 'format=yuv420p' : 'format=rgb24',
    ctx.video && 'setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
  ], 'out');
}

function encoderArgs({ fps, video }, preview) {
  return [
    '-c:v', 'libx264', '-preset', preview ? 'ultrafast' : video.preset, '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-crf', String(preview ? 26 : video.crf), '-maxrate', `${video.maxrate}k`, '-bufsize', `${video.maxrate * 2}k`,
    '-g', String(fps * 2), '-movflags', '+faststart', '-an',
  ];
}

export function encodeImage(png, target, { format, quality }) {
  const options = format === 'png' ? []
    : format === 'webp' ? ['-quality', String(quality), '-define', 'webp:method=6']
      : ['-sampling-factor', '4:4:4', '-quality', String(quality), '-interlace', 'Plane'];
  execFileSync('magick', [png, '-strip', ...options, target]);
}

const IGNORED_PIPE_ERRORS = new Set(['EPIPE', 'ERR_STREAM_DESTROYED']);

function run(args, feed) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: [feed ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    let failure = null;
    child.on('error', reject);
    child.on('close', code => (code === 0 && !failure ? resolve() : reject(failure ?? new Error(`ffmpeg exited with code ${code}`))));
    if (!feed) return;
    child.stdin.on('error', () => {});
    feed(child.stdin).catch(error => {
      if (IGNORED_PIPE_ERRORS.has(error.code)) return;
      failure = error;
      child.kill();
    });
  });
}

/** Renders `job` to `target` (and its cover to `coverTarget`); returns the frame count and the glitch styles used. */
export async function render(job, { cache, preview = false, target, coverTarget }) {
  const ctx = { job, graph: new Graph(), fps: job.output.fps, video: job.kind === 'video', cache, preview, glitches: [] };
  ctx.masks = new Masks(ctx);
  const events = [];
  const layout = layoutJob(job);
  const base = background(ctx);
  const { base: composed, frames } = job.pool ? composeMosaic(ctx, base, layout) : composeSlots(ctx, base, layout, events);
  ctx.masks.finish();
  finish(ctx, composed);

  const head = ['-v', 'error', '-y', ...ctx.graph.args(), '-map', '[out]'];
  if (!ctx.video) {
    const png = join(cache, `frame-${digest(job.name)}.png`);
    await run([...head, '-frames:v', '1', '-update', '1', png]);
    encodeImage(png, target, job.output.image);
    rmSync(png);
    return { frames };
  }
  const feed = ctx.feed?.(frames, events) ?? null;
  await run([...head, '-stats', '-frames:v', String(frames), ...encoderArgs(job.output, preview), target], feed);
  if (coverTarget) {
    const png = join(cache, `cover-${digest(job.name)}.png`);
    const time = Math.min(job.output.video.cover ?? 0, (frames - 1) / ctx.fps);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', fixed(time), '-i', target, '-frames:v', '1', '-update', '1', png]);
    encodeImage(png, coverTarget, { format: 'jpg', quality: job.output.image.quality });
    rmSync(png);
  }
  return { frames, glitches: ctx.glitches };
}
