const BASE = 0.075;
const SETTLED = 0.14;
const FLASH = 0.85;

export default class LoaderGrid {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.reducedMotion = reducedMotion;
    this.progress = 0;
    this.filled = 0;
    this.pointerX = 0;
    this.pointerY = 0;
    this.pointerMoved = false;
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = width < 700 ? 44 : Math.round(Math.min(76, Math.max(56, width / 28)));
    this.size = size;
    this.columns = Math.ceil(width / size) + 1;
    this.rows = Math.ceil(height / size) + 1;
    this.offsetX = Math.round((width - this.columns * size) / 2);
    this.offsetY = Math.round((height - this.rows * size) / 2);
    this.inset = Math.round(size * 0.2);
    this.arm = Math.max(3, Math.round(size * 0.1));
    this.plus = Math.max(2, Math.round(size * 0.06));
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.context.fillStyle = '#dcedef';

    const count = this.columns * this.rows;
    this.level = new Float32Array(count);
    this.rest = new Float32Array(count);
    this.delay = new Float32Array(count).fill(-1);
    this.order = this.createOrder(count);
    this.filled = 0;
    this.fill(this.progress, { flash: false });
    this.context.clearRect(0, 0, width, height);
    for (let i = 0; i < count; i++) this.drawCell(i);
  }

  createOrder(count) {
    const centerX = (this.columns - 1) / 2;
    const centerY = (this.rows - 1) / 2;
    const keys = new Float32Array(count);
    const order = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      const dx = (i % this.columns) - centerX;
      const dy = Math.floor(i / this.columns) - centerY;
      keys[i] = Math.hypot(dx, dy * 1.4) + Math.random() * 6;
      order[i] = i;
    }
    return order.sort((a, b) => keys[a] - keys[b]);
  }

  fill(progress, { flash = !this.reducedMotion } = {}) {
    this.progress = progress;
    const target = Math.floor(progress * this.order.length);
    for (; this.filled < target; this.filled++) {
      const i = this.order[this.filled];
      this.rest[i] = SETTLED;
      this.level[i] = flash ? FLASH : SETTLED;
    }
  }

  ripple(x, y, { speed = 0.028, strength = 0.7 } = {}) {
    if (this.reducedMotion) return;
    const column = (x - this.offsetX) / this.size;
    const row = (y - this.offsetY) / this.size;
    for (let i = 0; i < this.level.length; i++) {
      const distance = Math.hypot((i % this.columns) + 0.5 - column, Math.floor(i / this.columns) + 0.5 - row);
      this.delay[i] = distance * speed;
    }
    this.rippleStrength = strength;
  }

  pointer(x, y) {
    this.pointerX = x;
    this.pointerY = y;
    this.pointerMoved = !this.reducedMotion;
  }

  update(dt) {
    if (this.pointerMoved) {
      this.pointerMoved = false;
      const column = (this.pointerX - this.offsetX) / this.size;
      const row = (this.pointerY - this.offsetY) / this.size;
      const minColumn = Math.max(0, Math.floor(column) - 2);
      const maxColumn = Math.min(this.columns - 1, Math.floor(column) + 2);
      const minRow = Math.max(0, Math.floor(row) - 2);
      const maxRow = Math.min(this.rows - 1, Math.floor(row) + 2);
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minColumn; c <= maxColumn; c++) {
          const falloff = 1 - Math.hypot(c + 0.5 - column, r + 0.5 - row) / 2.4;
          const i = r * this.columns + c;
          if (falloff > 0) this.level[i] = Math.max(this.level[i], falloff * 0.6);
        }
      }
    }

    const ease = 1 - Math.exp(-dt * 3.2);
    for (let i = 0; i < this.level.length; i++) {
      if (this.delay[i] >= 0) {
        this.delay[i] -= dt;
        if (this.delay[i] < 0) this.level[i] = Math.max(this.level[i], this.rippleStrength);
      }
      const difference = this.rest[i] - this.level[i];
      if (difference === 0) continue;
      this.level[i] = Math.abs(difference) < 0.002 ? this.rest[i] : this.level[i] + difference * ease;
      this.drawCell(i);
    }
  }

  drawCell(i) {
    const { context, size, inset, arm, plus } = this;
    const x = this.offsetX + (i % this.columns) * size;
    const y = this.offsetY + Math.floor(i / this.columns) * size;
    const level = this.level[i];
    const left = x + inset;
    const top = y + inset;
    const right = x + size - inset - 1;
    const bottom = y + size - inset - 1;
    context.clearRect(x, y, size, size);

    context.globalAlpha = BASE + level * 0.6;
    context.fillRect(left, top, arm, 1);
    context.fillRect(left, top, 1, arm);
    context.fillRect(right - arm + 1, top, arm, 1);
    context.fillRect(right, top, 1, arm);
    context.fillRect(left, bottom, arm, 1);
    context.fillRect(left, bottom - arm + 1, 1, arm);
    context.fillRect(right - arm + 1, bottom, arm, 1);
    context.fillRect(right, bottom - arm + 1, 1, arm);

    const centerX = x + Math.floor(size / 2);
    const centerY = y + Math.floor(size / 2);
    context.globalAlpha = BASE * 1.5 + level * 0.8;
    context.fillRect(centerX - plus, centerY, plus * 2 + 1, 1);
    context.fillRect(centerX, centerY - plus, 1, plus * 2 + 1);
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
  }
}
