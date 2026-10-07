import { createRandom } from './painter.mjs';

// xfade custom expressions run on several slice threads sharing one st()/ld() store, so every
// value is inlined. X, Y, W, H are per plane; P runs from 1 to 0.
const hash = value => `mod(sin(${value})*43758.5453,1)`;
const round = value => Number(value.toFixed(4));

// Each style says where A and B are sampled (x, dx, dy), how they mix per region and how the luma is shaded.
const STYLES = {
  // Horizontal bands tear sideways, some already showing the next clip; thin lines jitter on top.
  slices: ({ env, mix, step, strength }) => {
    const band = 'floor(Y/H*22)';
    const line = 'floor(Y/H*90)';
    const active = `gt(${hash(`${band}*12.9898+${step}*78.233`)},1-0.6*${env})`;
    const offset = `${active}*(${hash(`${band}*39.3468+${step}*11.135`)}-0.5)*${round(0.24 * strength)}`;
    const jitter = `gt(${hash(`${line}*12.9898+${step}*41.31`)},1-0.35*${env})*(${hash(`${line}*7.77+${step}*3.3`)}-0.5)*${round(0.05 * strength)}`;
    return {
      dx: `(${offset}+${jitter})*W*${env}`,
      mix: `if(${active},gt(${mix}+(${hash(`${band}*73.156+${step}*52.235`)}-0.5)*0.8,0.5),${mix})`,
    };
  },

  // Corrupted blocks: shifted by whole blocks, some pixelated, switching between the clips out of order.
  blocks: ({ env, mix, step, strength, rect }) => {
    const columns = 14;
    const rows = Math.max(1, Math.round((columns * rect.h) / rect.w));
    const key = `(floor(X/W*${columns})*12.9898+floor(Y/H*${rows})*78.233+${step}*37.719)`;
    const active = `gt(${hash(key)},1-${round(0.45 * strength)}*${env})`;
    const pixel = 1 / (columns * 6);
    return {
      x: `if(${active}*gt(${hash(`${key}*1.37`)},0.5),floor(X/W/${round(pixel)})*${round(pixel)}*W,X)`,
      dx: `${active}*floor((${hash(`${key}*1.618`)}-0.5)*5)*W/${columns}`,
      dy: `${active}*floor((${hash(`${key}*2.17`)}-0.5)*3)*H/${rows}`,
      mix: `if(${active},gt(${mix},${hash(`${key}*3.11`)}),${mix})`,
    };
  },

  // The whole frame jumps sideways with a wide color split, a wave and scanlines.
  shift: ({ env, mix, step, strength }) => ({
    dx: `((${hash(`${step}*12.9898`)}-0.5)*${round(0.12 * strength)}+sin(Y/H*23+${step}*2.1)*${round(0.012 * strength)})*W*${env}`,
    split: 3,
    shade: `1-0.35*${env}*mod(floor(Y/2),2)`,
    mix,
  }),

  // Tape tracking: the frame rolls and wraps, tearing sideways around a moving line.
  tear: ({ env, mix, step, strength }) => {
    const near = `exp(-abs(Y/H-${hash(`${step}*3.77+1.3`)})*14)`;
    return {
      dx: `((${hash(`${step}*5.13`)}-0.5)*${round(0.24 * strength)}*${near}+(${hash(`Y*1.31+${step}*7.7`)}-0.5)*${round(0.012 * strength)})*W*${env}`,
      dy: `0-(0.05+0.25*${hash(`${step}*9.17`)})*H*pow(${env},1.5)*${round(strength)}`,
      wrap: true,
      shade: `1-0.45*${env}*${near}`,
      mix,
    };
  },
};

/** The style of the `index`th glitch in a job: a seeded shuffle of `styles`, cycled, so neighbours differ. */
function pickStyle(styles, seed, index) {
  const random = createRandom(seed);
  const order = [...styles];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[index % order.length];
}

/**
 * A smooth crossfade where A pushes in as B settles, with a glitch that builds to the midpoint
 * and clears by the end; the glitch pattern changes every `hold` frames.
 */
export function glitchExpression(options, { frames, rect, index }) {
  const styles = [].concat(options.styles);
  const unknown = styles.find(style => !STYLES[style]);
  if (unknown || !styles.length) {
    throw new Error(`transition.glitch.styles: ${unknown ? `unknown style "${unknown}"` : 'empty'} (have ${Object.keys(STYLES).join(', ')})`);
  }
  const style = pickStyle(styles, options.seed, index);
  const { strength, split, zoom, softness, hold, flash } = options;

  const steps = Math.max(1, Math.round(frames / hold));
  const env = 'pow(sin(PI*P),2)';
  const mix = `(0.5-0.5*cos(PI*clip((0.5-P)*${round(1 / softness)}+0.5,0,1)))`;
  const step = `(floor(${steps}-P*${steps})+${round(options.seed * 3.17 + index * 7.31)})`;
  const parts = STYLES[style]({ env, mix, step, strength, rect });

  const chroma = `(eq(PLANE,1)-eq(PLANE,2))*${round(split * (parts.split ?? 1) * strength)}*W*${env}`;
  const x = scale => `clip(W/2+(${parts.x ?? 'X'}+${parts.dx ?? 0}+${chroma}-W/2)/${scale},0,W-1)`;
  const y = scale => {
    const value = `H/2+(Y+${parts.dy ?? 0}-H/2)/${scale}`;
    return parts.wrap ? `mod(${value},H)` : `clip(${value},0,H-1)`;
  };
  const sample = (source, scale) => {
    const at = `${x(scale)},${y(scale)}`;
    return `if(eq(PLANE,0),${source}0(${at}),if(eq(PLANE,1),${source}1(${at}),${source}2(${at})))`;
  };
  let value = `lerp(${sample('a', `(1+${zoom}*${mix})`)},${sample('b', `(1+${zoom}*(1-${mix}))`)},${parts.mix})`;
  if (parts.shade) value = `lerp(16,${value},1-eq(PLANE,0)*(1-(${parts.shade})))`;
  if (flash > 0) value = `lerp(${value},235,eq(PLANE,0)*${flash}*pow(${env},3))`;
  return { style, expr: value };
}
