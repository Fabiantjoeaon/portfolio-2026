import { createRandom } from './painter.mjs';

const even = value => Math.round(value / 2) * 2;
const size = value => Math.max(2, even(value));
const snap = ({ x, y, w, h, ...rest }) => ({
  x: even(x),
  y: even(y),
  w: Math.max(2, even(x + w) - even(x)),
  h: Math.max(2, even(y + h) - even(y)),
  rotation: 0,
  dim: 1,
  z: 0,
  ...rest,
});

const area = ({ width, height, frame }) => ({
  x: frame.padding,
  y: frame.padding,
  w: width - 2 * frame.padding,
  h: height - 2 * frame.padding,
});

const contain = (box, aspect, fit) => {
  if (fit === 'cover') return box;
  const w = Math.min(box.w, box.h * aspect);
  const h = w / aspect;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
};

const center = context => [contain(area(context), context.aspects[0], context.frame.fit)];

function stack(context) {
  const { aspects, frame } = context;
  const box = area(context);
  const count = aspects.length;
  const cell = (box.h - (count - 1) * frame.gap) / count;
  const sizes = aspects.map(aspect => {
    if (frame.fit === 'cover') return { w: box.w, h: cell };
    const w = Math.min(box.w, aspect * cell);
    return { w, h: w / aspect };
  });
  let y = box.y + (box.h - sizes.reduce((sum, { h }) => sum + h, 0) - (count - 1) * frame.gap) / 2;
  return sizes.map(({ w, h }) => {
    const rect = { x: box.x + (box.w - w) / 2, y, w, h };
    y += h + frame.gap;
    return rect;
  });
}

// One wide frame on top, two sharing a row below; both rows span the same width.
function hero(context) {
  const { aspects: [top, left, right], frame: { gap } } = context;
  const box = area(context);
  const row = left + right;
  const w = Math.min(box.w, (box.h - gap + gap / row) / (1 / top + 1 / row));
  const h = w / top;
  const lower = (w - gap) / row;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - (h + gap + lower)) / 2;
  return [
    { x, y, w, h },
    { x, y: y + h + gap, w: left * lower, h: lower },
    { x: x + left * lower + gap, y: y + h + gap, w: right * lower, h: lower },
  ];
}

// Cards step `offset` px along `direction` per depth; the first slot is the front.
function cascade(context) {
  const { aspects, options } = context;
  const box = area(context);
  const count = aspects.length;
  const [dx, dy] = options.direction;
  const spanX = (count - 1) * options.offset * Math.abs(dx);
  const spanY = (count - 1) * options.offset * Math.abs(dy);
  const w = Math.min(box.w - spanX, (box.h - spanY) * aspects[0]);
  const h = w / aspects[0];
  const left = box.x + (box.w - w - spanX) / 2 + (dx < 0 ? spanX : 0);
  const top = box.y + (box.h - h - spanY) / 2 + (dy < 0 ? spanY : 0);
  return aspects.map((_, depth) => ({
    x: left + depth * options.offset * dx,
    y: top + depth * options.offset * dy,
    w,
    h,
    rotation: depth * options.spread,
    dim: options.dim ** depth,
    z: count - depth,
  }));
}

/**
 * A wall of cards on a canvas that covers the frame once rotated by `angle`,
 * so the cards run off every edge. Cards outside the frame are dropped.
 */
function mosaic({ width, height, frame, options, aspects, count }) {
  const angle = options.angle * Math.PI / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const canvas = { width: size(width * cos + height * sin), height: size(width * sin + height * cos) };
  const w = size(options.cardWidth * width);
  const h = size(w / aspects[0]);
  const pitchX = w + frame.gap;
  const pitchY = h + frame.gap;
  const columns = options.columns ?? Math.ceil(canvas.width / pitchX) + 1;
  const rows = Math.ceil(canvas.height / pitchY / 2) + 1;
  const random = createRandom(options.seed);
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const visible = (x, y) => {
    const corners = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => {
      const rx = px - canvas.width / 2;
      const ry = py - canvas.height / 2;
      return [rx * Math.cos(angle) - ry * Math.sin(angle) + width / 2, rx * Math.sin(angle) + ry * Math.cos(angle) + height / 2];
    });
    const xs = corners.map(([px]) => px);
    const ys = corners.map(([, py]) => py);
    return Math.max(...xs) > 0 && Math.min(...xs) < width && Math.max(...ys) > 0 && Math.min(...ys) < height;
  };

  const cards = [];
  const placed = new Map();
  let next = 0;
  for (let column = 0; column < columns; column++) {
    const x = canvas.width / 2 + (column - (columns - 1) / 2) * pitchX - w / 2;
    const shift = ((column * options.stagger) % 1) * pitchY;
    for (let row = -rows; row <= rows; row++) {
      const y = canvas.height / 2 + row * pitchY + shift - h / 2;
      if (!visible(x, y)) continue;
      const neighbours = [placed.get(`${column - 1}:${row}`), placed.get(`${column}:${row - 1}`)];
      let source = order[next++ % count];
      for (let tries = 0; count > 2 && tries < count && neighbours.includes(source); tries++) source = order[next++ % count];
      placed.set(`${column}:${row}`, source);
      cards.push({ ...snap({ x, y, w, h }), source, phase: random() });
    }
  }
  return { canvas, rotation: options.angle, cards };
}

export const TEMPLATES = {
  center: { slots: [1, 1], defaults: {}, layout: center },
  stack: { slots: [1, 6], defaults: {}, layout: stack },
  trio: {
    slots: [3, 3],
    defaults: { layout: 'hero' },
    layout: context => (context.options.layout === 'column' ? stack : hero)(context),
  },
  cascade: {
    slots: [2, 4],
    defaults: { offset: 110, direction: [1, -1], spread: 0, dim: 0.55 },
    layout: cascade,
  },
  mosaic: {
    pool: true,
    defaults: { angle: -14, cardWidth: 0.42, columns: null, stagger: 0.42, seed: 3, duration: 10, vignette: 0.6 },
    frame: { gap: 28 },
    layout: mosaic,
  },
};

/** Slot rects (or mosaic cards) in output pixels, snapped to even values for 4:2:0 video. */
export function layoutJob(job) {
  const template = TEMPLATES[job.template];
  const aspect = clip => clip.source.width / clip.source.height;
  const context = { width: job.output.width, height: job.output.height, frame: job.frame, options: job.options };
  if (template.pool) return template.layout({ ...context, aspects: [aspect(job.pool[0])], count: job.pool.length });
  const rects = template.layout({ ...context, aspects: job.slots.map(slot => aspect(slot.clips[0])) });
  return { rects: rects.map(snap) };
}
