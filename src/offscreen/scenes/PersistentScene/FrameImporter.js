import * as THREE from 'three/webgpu';
import { isIOS, isSafari } from '@/shared/devices';

const SHADER = /* wgsl */ `
@group(0) @binding(0) var frame: texture_external;
@group(0) @binding(1) var bilinear: sampler;
@group(0) @binding(2) var<uniform> correction: array<vec4f, 3>;
@group(0) @binding(3) var<uniform> region: vec4f;

struct Varyings {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn vertex(@builtin(vertex_index) index: u32) -> Varyings {
  let uv = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return Varyings(vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0), uv);
}

@fragment fn fragment(in: Varyings) -> @location(0) vec4f {
  let color = vec4f(textureSampleBaseClampToEdge(frame, bilinear, in.uv).rgb, 1.0);
  let corrected = vec3f(dot(correction[0], color), dot(correction[1], color), dot(correction[2], color));
  // The target encodes to sRGB on write, so this stores the corrected values themselves.
  let srgb = clamp(corrected, vec3f(0.0), vec3f(1.0));
  return vec4f(select(pow((srgb + 0.055) / 1.055, vec3f(2.4)), srgb / 12.92, srgb <= vec3f(0.04045)), 1.0);
}

@fragment fn sample(in: Varyings) -> @location(0) vec4f {
  return vec4f(textureSampleBaseClampToEdge(frame, bilinear, (in.position.xy + region.xy) * region.zw).rgb, 1.0);
}`;

const CALIBRATION_SIZE = 512;
const CALIBRATION_STRIDE = 3;
const CALIBRATION_RETRY_FRAMES = 30;
const CALIBRATION_ATTEMPTS = 5;

/** Solves a 4x4 linear system by Gauss-Jordan elimination with partial pivoting. */
function solve(matrix, vector) {
  const rows = matrix.map((row, i) => [...row, vector[i]]);
  for (let i = 0; i < 4; i++) {
    let pivot = i;
    for (let k = i + 1; k < 4; k++) if (Math.abs(rows[k][i]) > Math.abs(rows[pivot][i])) pivot = k;
    [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
    if (Math.abs(rows[i][i]) < 1e-9) return null;
    for (let k = 0; k < 4; k++) {
      if (k === i) continue;
      const factor = rows[k][i] / rows[i][i];
      for (let j = i; j < 5; j++) rows[k][j] -= factor * rows[i][j];
    }
  }
  return rows.map((row, i) => row[4] / row[i]);
}

/**
 * Draws streamed VideoFrames into textures through importExternalTexture.
 * Shipping Safari reads every copyExternalImageToTexture video frame back
 * through the CPU; an imported frame is sampled from the decoder's surface.
 *
 * Safari's import conversion is a little off its copy path (its BT.709 matrix
 * is scaled by 256/255), so one frame goes through both first and a fitted
 * correction keeps imported frames on the copy path's colours.
 */
export default class FrameImporter {
  static create(renderer) {
    const device = renderer?.backend?.device;
    if (!(isSafari() || isIOS()) || typeof device?.importExternalTexture !== 'function') return null;
    return new FrameImporter(device);
  }

  constructor(device) {
    this.device = device;
    this.ready = false;
    this.calibrating = false;
    this.attempts = 0;
    this.retryIn = 0;
    this.views = new WeakMap();

    const module = device.createShaderModule({ code: SHADER });
    const pipeline = (entryPoint, format) => device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertex' },
      fragment: { module, entryPoint, targets: [{ format }] },
    });
    this.pipeline = pipeline('fragment', 'rgba8unorm-srgb');
    this.samplePipeline = pipeline('sample', 'rgba32float');
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.correction = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.region = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.bindGroup = {
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: null },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: this.correction } },
      ],
    };
    this.sampleBindGroup = {
      layout: this.samplePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: null },
        { binding: 1, resource: sampler },
        { binding: 3, resource: { buffer: this.region } },
      ],
    };
    this.attachment = { view: null, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] };
    this.passDescriptor = { colorAttachments: [this.attachment] };
  }

  /** Whether `frame` can be imported; until then frames also feed the calibration. */
  accepts(frame, width, height) {
    if (!this.ready) this._calibrate(frame, width, height);
    return this.ready;
  }

  createTexture(width, height) {
    const target = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm-srgb',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const texture = new THREE.ExternalTexture(target);
    this.views.set(texture, target.createView());
    texture.addEventListener('dispose', () => target.destroy());
    return texture;
  }

  /** @returns {boolean} false if the import failed; imports stay off from then on. */
  write(texture, frame) {
    try {
      this._draw(this.pipeline, this.bindGroup, this.views.get(texture), frame);
      return true;
    } catch (error) {
      console.warn('FrameImporter: import failed, uploading frames instead.', error);
      this.ready = false;
      this.attempts = CALIBRATION_ATTEMPTS;
      return false;
    }
  }

  dispose() {
    this.ready = false;
    this.attempts = CALIBRATION_ATTEMPTS;
    this.correction.destroy();
    this.region.destroy();
  }

  _draw(pipeline, bindGroup, view, frame) {
    const { device } = this;
    bindGroup.entries[0].resource = device.importExternalTexture({ source: frame });
    this.attachment.view = view;
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass(this.passDescriptor);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, device.createBindGroup(bindGroup));
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    bindGroup.entries[0].resource = null;
    this.attachment.view = null;
  }

  /**
   * Converts a crop of `frame` both ways — the copy path the textures used to
   * take, and an unclamped float import — then fits the affine colour map
   * between them.
   */
  _calibrate(frame, width, height) {
    if (this.calibrating || this.attempts >= CALIBRATION_ATTEMPTS || this.retryIn-- > 0) return;
    const size = Math.min(CALIBRATION_SIZE, width, height);
    if (size < 16) return;
    const { device } = this;
    const x = Math.floor((width - size) / 2);
    const y = Math.floor((height - size) / 2);
    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC;
    const copied = device.createTexture({ size: [size, size], format: 'rgba8unorm', usage: usage | GPUTextureUsage.COPY_DST });
    const sampled = device.createTexture({ size: [size, size], format: 'rgba32float', usage });
    const copiedRow = Math.ceil((size * 4) / 256) * 256;
    const sampledRow = size * 16;
    const readUsage = GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ;
    const copiedBuffer = device.createBuffer({ size: copiedRow * size, usage: readUsage });
    const sampledBuffer = device.createBuffer({ size: sampledRow * size, usage: readUsage });
    const release = () => {
      copied.destroy();
      sampled.destroy();
      copiedBuffer.destroy();
      sampledBuffer.destroy();
      this.calibrating = false;
    };

    this.calibrating = true;
    this.attempts++;
    try {
      device.queue.copyExternalImageToTexture({ source: frame, origin: [x, y] }, { texture: copied }, [size, size]);
      device.queue.writeBuffer(this.region, 0, new Float32Array([x, y, 1 / width, 1 / height]));
      this._draw(this.samplePipeline, this.sampleBindGroup, sampled.createView(), frame);
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: copied }, { buffer: copiedBuffer, bytesPerRow: copiedRow }, [size, size]);
      encoder.copyTextureToBuffer({ texture: sampled }, { buffer: sampledBuffer, bytesPerRow: sampledRow }, [size, size]);
      device.queue.submit([encoder.finish()]);
    } catch (error) {
      console.warn('FrameImporter: calibration failed, uploading frames instead.', error);
      this.attempts = CALIBRATION_ATTEMPTS;
      release();
      return;
    }

    Promise.all([copiedBuffer.mapAsync(GPUMapMode.READ), sampledBuffer.mapAsync(GPUMapMode.READ)]).then(() => {
      const fit = this._fit(new Uint8Array(copiedBuffer.getMappedRange()), new Float32Array(sampledBuffer.getMappedRange()), size, copiedRow);
      if (fit) {
        device.queue.writeBuffer(this.correction, 0, fit);
        this.ready = true;
      } else {
        this.retryIn = CALIBRATION_RETRY_FRAMES;
      }
    }).catch(() => {
      this.retryIn = CALIBRATION_RETRY_FRAMES;
    }).finally(release);
  }

  /** @returns {Float32Array|null} Three vec4 rows mapping imported rgb1 to copied rgb, or null if this crop can't tell. */
  _fit(copied, sampled, size, copiedRow) {
    const normal = Array.from({ length: 4 }, () => new Float64Array(4));
    const targets = Array.from({ length: 3 }, () => new Float64Array(4));
    const input = new Float64Array(4);
    input[3] = 1;
    let count = 0;
    for (let y = 0; y < size; y += CALIBRATION_STRIDE) {
      for (let x = 0; x < size; x += CALIBRATION_STRIDE) {
        const c = y * copiedRow + x * 4;
        // Clipped channels say nothing about the conversion's slope.
        if (copied[c] % 255 === 0 || copied[c + 1] % 255 === 0 || copied[c + 2] % 255 === 0) continue;
        const s = (y * size + x) * 4;
        input[0] = sampled[s];
        input[1] = sampled[s + 1];
        input[2] = sampled[s + 2];
        for (let m = 0; m < 4; m++) {
          for (let n = 0; n < 4; n++) normal[m][n] += input[m] * input[n];
          for (let channel = 0; channel < 3; channel++) targets[channel][m] += input[m] * (copied[c + channel] / 255);
        }
        count++;
      }
    }
    if (count < 2000) return null;
    const rows = targets.map(target => solve(normal, target));
    if (rows.some(row => !row)) return null;
    // Anything beyond a small correction means the crop didn't constrain the fit.
    for (let channel = 0; channel < 3; channel++) {
      for (let m = 0; m < 4; m++) {
        const expected = m === channel ? 1 : 0;
        if (!(Math.abs(rows[channel][m] - expected) < 0.03)) return null;
      }
    }
    return new Float32Array(rows.flat());
  }
}
