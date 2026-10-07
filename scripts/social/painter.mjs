import { execFileSync } from 'node:child_process';

// Mirrors src/main/loaderGrid.js and the .entry-loader vignette in loader.css.
const BASE = 0.075;
const SETTLED = 0.14;
const FLASH = 0.85;
const FLICKER_CHANCE = 0.22;
const FLICKER_DIM = 0.08;
const SETTLE_RATE = 3.2;
const RIPPLE_SPEED = 0.028;

export const rgb = hex => {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

export const createRandom = seed => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const noise = (x, y) => {
  let hash = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296 - 0.5;
};

const vignette = (x, y, width, height, strength) => {
  const distance = Math.hypot((2 * x + 1) / width - 1, (2 * y + 1) / height - 1) / Math.SQRT2;
  return strength * Math.min(1, Math.max(0, (distance - 0.35) / 0.65));
};

export const writeImage = (pixels, width, height, format, target) => execFileSync('ffmpeg', [
  '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', format, '-s', `${width}x${height}`, '-i', '-',
  '-frames:v', '1', target,
], { input: Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength) });

export class LoaderGrid {
  constructor(width, height, { color, ink, scale, cell, fill, vignette: strength, dither, seed, animate }) {
    this.width = width;
    this.height = height;
    this.scale = scale;
    this.dither = dither;
    this.flickerRate = animate ? animate.flicker : 0;
    this.random = createRandom(seed);
    this.color = rgb(color);
    this.ink = rgb(ink);

    const cssWidth = width / scale;
    const cssHeight = height / scale;
    const size = cell ?? (cssWidth < 700 ? 44 : Math.round(Math.min(76, Math.max(56, cssWidth / 28))));
    this.size = size;
    this.columns = Math.ceil(cssWidth / size) + 1;
    this.rows = Math.ceil(cssHeight / size) + 1;
    this.offsetX = Math.round((cssWidth - this.columns * size) / 2);
    this.offsetY = Math.round((cssHeight - this.rows * size) / 2);
    this.inset = Math.round(size * 0.2);
    this.arm = Math.max(3, Math.round(size * 0.1));
    this.plus = Math.max(2, Math.round(size * 0.06));

    this.shade = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) this.shade[y * width + x] = 1 - vignette(x, y, width, height, strength);
    }
    this.pixels = new Uint8ClampedArray(width * height * 3);
    this.frame = Buffer.from(this.pixels.buffer);

    const count = this.columns * this.rows;
    this.level = new Float32Array(count);
    this.rest = new Float32Array(count);
    this.delay = new Float32Array(count).fill(-1);
    this.flicker = new Float32Array(count);
    this.hold = new Float32Array(count);
    this.gate = new Float32Array(count).fill(1);
    this.dirty = new Uint8Array(count).fill(1);
    this.order = this.createOrder(count);
    this.filled = 0;
    this.fill(animate?.intro ? 0 : fill, { flash: false });
    this.clear(0, 0, width, height);
  }

  createOrder(count) {
    const centerX = (this.columns - 1) / 2;
    const centerY = (this.rows - 1) / 2;
    const keys = new Float32Array(count);
    const order = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      const dx = (i % this.columns) - centerX;
      const dy = Math.floor(i / this.columns) - centerY;
      keys[i] = Math.hypot(dx, dy * 1.4) + this.random() * 6;
      order[i] = i;
    }
    return order.sort((a, b) => keys[a] - keys[b]);
  }

  startFlicker(i) {
    this.flicker[i] = 0.35 + this.random() * 0.45;
    this.hold[i] = 0;
    this.gate[i] = 1;
  }

  fill(progress, { flash = true } = {}) {
    const target = Math.floor(progress * this.order.length);
    for (; this.filled < target; this.filled++) {
      const i = this.order[this.filled];
      this.rest[i] = SETTLED;
      this.level[i] = flash ? FLASH : SETTLED;
      this.dirty[i] = 1;
      if (flash && this.random() < FLICKER_CHANCE) this.startFlicker(i);
    }
  }

  ripple(x, y, strength) {
    const column = (x / this.scale - this.offsetX) / this.size;
    const row = (y / this.scale - this.offsetY) / this.size;
    for (let i = 0; i < this.level.length; i++) {
      const distance = Math.hypot((i % this.columns) + 0.5 - column, Math.floor(i / this.columns) + 0.5 - row);
      this.delay[i] = distance * RIPPLE_SPEED;
    }
    this.rippleStrength = strength;
  }

  update(dt) {
    const ease = 1 - Math.exp(-dt * SETTLE_RATE);
    const ambient = this.flickerRate * dt;
    for (let i = 0; i < this.level.length; i++) {
      if (ambient && this.flicker[i] <= 0 && this.random() < ambient) {
        this.level[i] = Math.max(this.level[i], 0.3 + this.random() * 0.4);
        if (this.random() < 0.5) this.startFlicker(i);
        this.dirty[i] = 1;
      }
      if (this.delay[i] >= 0) {
        this.delay[i] -= dt;
        if (this.delay[i] < 0) this.level[i] = Math.max(this.level[i], this.rippleStrength);
      }
      if (this.flicker[i] > 0) {
        this.flicker[i] -= dt;
        this.hold[i] -= dt;
        if (this.flicker[i] <= 0) this.gate[i] = 1;
        else if (this.hold[i] <= 0) {
          this.gate[i] = this.gate[i] === 1 ? FLICKER_DIM : 1;
          this.hold[i] = this.gate[i] === 1 ? 0.02 + this.random() * 0.07 : 0.04 + this.random() * 0.12;
        }
        this.dirty[i] = 1;
        continue;
      }
      const difference = this.rest[i] - this.level[i];
      if (difference === 0) continue;
      this.level[i] = Math.abs(difference) < 0.002 ? this.rest[i] : this.level[i] + difference * ease;
      this.dirty[i] = 1;
    }
  }

  paint() {
    for (let i = 0; i < this.dirty.length; i++) {
      if (!this.dirty[i]) continue;
      this.dirty[i] = 0;
      this.drawCell(i);
    }
    return this.frame;
  }

  bounds(x, y, w, h) {
    const { scale } = this;
    return [
      Math.max(0, Math.round(x * scale)), Math.max(0, Math.round(y * scale)),
      Math.min(this.width, Math.round((x + w) * scale)), Math.min(this.height, Math.round((y + h) * scale)),
    ];
  }

  clear(x0, y0, x1, y1) {
    const { width, pixels, shade, color, dither } = this;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = y * width + x;
        const offset = dither ? noise(x, y) : 0;
        pixels[p * 3] = color[0] * shade[p] + offset;
        pixels[p * 3 + 1] = color[1] * shade[p] + offset;
        pixels[p * 3 + 2] = color[2] * shade[p] + offset;
      }
    }
  }

  rect(x, y, w, h, alpha) {
    const { width, pixels, shade, ink, dither } = this;
    const [x0, y0, x1, y1] = this.bounds(x, y, w, h);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const p = py * width + px;
        const offset = dither ? noise(px, py) : 0;
        for (let c = 0; c < 3; c++) {
          const o = p * 3 + c;
          pixels[o] = pixels[o] + (ink[c] * shade[p] - pixels[o]) * alpha + offset;
        }
      }
    }
  }

  drawCell(i) {
    const { size, inset, arm, plus } = this;
    const x = this.offsetX + (i % this.columns) * size;
    const y = this.offsetY + Math.floor(i / this.columns) * size;
    const level = this.level[i] * this.gate[i];
    const left = x + inset;
    const top = y + inset;
    const right = x + size - inset - 1;
    const bottom = y + size - inset - 1;
    const [x0, y0, x1, y1] = this.bounds(x, y, size, size);
    this.clear(x0, y0, x1, y1);

    const corner = BASE + level * 0.6;
    this.rect(left, top, arm, 1, corner);
    this.rect(left, top, 1, arm, corner);
    this.rect(right - arm + 1, top, arm, 1, corner);
    this.rect(right, top, 1, arm, corner);
    this.rect(left, bottom, arm, 1, corner);
    this.rect(left, bottom - arm + 1, 1, arm, corner);
    this.rect(right - arm + 1, bottom, arm, 1, corner);
    this.rect(right, bottom - arm + 1, 1, arm, corner);

    const centerX = x + Math.floor(size / 2);
    const centerY = y + Math.floor(size / 2);
    const center = BASE * 1.5 + level * 0.8;
    this.rect(centerX - plus, centerY, plus * 2 + 1, 1, center);
    this.rect(centerX, centerY - plus, 1, plus * 2 + 1, center);
  }
}

// Mirrors createNoiseGlowShader in src/offscreen/scenes/PersistentScene/screenShaders.js.
const OSCILLATION = 0.7;
const SUBSAMPLES = new Float32Array([0.25, 0.25, 0.75, 0.25, 0.25, 0.75, 0.75, 0.75]);
const toSrgb = value => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

/** The site's noise-glow screen shader at `resolution` of the frame, as 16-bit RGB with the vignette applied. */
export class NoiseGlow {
  constructor(width, height, { resolution, intensity, speed, tint, vignette: strength }) {
    this.width = Math.max(2, Math.round(width * resolution));
    this.height = Math.max(2, Math.round(height * resolution));
    this.intensity = intensity;
    this.speed = speed;
    this.tint = tint;
    this.shade = new Float32Array(this.width * this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) this.shade[y * this.width + x] = 1 - vignette(x, y, this.width, this.height, strength);
    }
    this.pixels = new Uint16Array(this.width * this.height * 3);
    this.frame = Buffer.from(this.pixels.buffer);
  }

  glow(u, v, t) {
    let x = u * 4;
    let y = v * 4;
    for (let octave = 1; octave <= 4; octave++) {
      x += (OSCILLATION / octave) * Math.cos(2.5 * octave * y + t);
      y += (OSCILLATION / octave) * Math.cos(1.5 * octave * x + t);
    }
    return Math.min(0.8, (0.1 / Math.max(Math.abs(Math.sin(t - y - x)), 0.001)) * this.intensity);
  }

  // The glow lines are 1/|sin| spikes, so each pixel averages four samples to keep them from shimmering.
  paint(time) {
    const { width, height, pixels, shade, tint } = this;
    const t = time * this.speed;
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        let sum = 0;
        for (let s = 0; s < SUBSAMPLES.length; s += 2) {
          sum += this.glow((px + SUBSAMPLES[s]) / width, 1 - (py + SUBSAMPLES[s + 1]) / height, t);
        }
        const p = py * width + px;
        const glow = sum / (SUBSAMPLES.length / 2);
        for (let c = 0; c < 3; c++) pixels[p * 3 + c] = Math.round(Math.min(1, toSrgb(glow * tint[c]) * shade[p]) * 65535);
      }
    }
    return this.frame;
  }
}

/** Gray alpha mask of a w×h rounded rectangle, antialiased by pixel coverage. */
export function paintRoundedMask(width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const dy = Math.max(r - (y + 0.5), y + 0.5 - (height - r), 0);
    for (let x = 0; x < width; x++) {
      const dx = Math.max(r - (x + 0.5), x + 0.5 - (width - r), 0);
      pixels[y * width + x] = Math.round(255 * Math.min(1, Math.max(0, r + 0.5 - Math.hypot(dx, dy))));
    }
  }
  return pixels;
}

/** RGBA black layer that darkens towards the edges, the loader's vignette on its own. */
export function paintVignette(width, height, strength) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) pixels[(y * width + x) * 4 + 3] = 255 * vignette(x, y, width, height, strength) + noise(x, y);
  }
  return pixels;
}
