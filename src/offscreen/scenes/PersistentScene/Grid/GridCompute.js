import { StorageInstancedBufferAttribute } from "three/webgpu";
import {
  Fn,
  instanceIndex,
  storage,
  uniform,
  float,
  vec3,
  vec4,
  sin,
  mul,
  add,
  div,
  mod,
  floor,
} from "three/tsl";

/**
 * GridCompute - Manages compute shader and storage buffers for grid tiles
 * Controls per-tile properties: offset, scale, color
 */
export class GridCompute {
  /**
   * @param {number} count - Number of tile instances
   * @param {number} cols - Number of columns in grid
   * @param {number} rows - Number of rows in grid
   */
  constructor(count, cols, rows) {
    this.count = count;
    this.cols = cols;
    this.rows = rows;

    // Uniforms for compute shader
    this.uniforms = {
      time: uniform(0.0),
      cols: uniform(cols),
      rows: uniform(rows),
      waveAmplitude: uniform(0.1),
      waveFrequency: uniform(2.0),
      waveSpeed: uniform(1.0),
    };

    // Create storage buffers
    this._createBuffers(count);

    // Create compute shader
    this._createComputeShader();
  }

  /**
   * Create storage buffers for instance attributes
   * @param {number} count - Number of instances
   */
  _createBuffers(count) {
    // Offset buffer: vec3 per instance (x, y, z offset)
    this.offsetBuffer = new StorageInstancedBufferAttribute(
      new Float32Array(count * 3),
      3
    );

    // Scale buffer: float per instance
    this.scaleBuffer = new StorageInstancedBufferAttribute(
      new Float32Array(count),
      1
    );

    // Color buffer: vec4 per instance (r, g, b, a)
    this.colorBuffer = new StorageInstancedBufferAttribute(
      new Float32Array(count * 4),
      4
    );

    // Initialize default values
    for (let i = 0; i < count; i++) {
      // Default offset: 0, 0, 0
      this.offsetBuffer.array[i * 3] = 0;
      this.offsetBuffer.array[i * 3 + 1] = 0;
      this.offsetBuffer.array[i * 3 + 2] = 0;

      // Default scale: 1.0
      this.scaleBuffer.array[i] = 1.0;

      // Default color: white, full opacity
      this.colorBuffer.array[i * 4] = 1.0;
      this.colorBuffer.array[i * 4 + 1] = 1.0;
      this.colorBuffer.array[i * 4 + 2] = 1.0;
      this.colorBuffer.array[i * 4 + 3] = 1.0;
    }
  }

  /**
   * Create the TSL compute shader
   */
  _createComputeShader() {
    const { time, cols, waveAmplitude, waveFrequency, waveSpeed } =
      this.uniforms;

    // Storage references for writing
    const offsetStorage = storage(this.offsetBuffer, "vec3", this.count);
    const scaleStorage = storage(this.scaleBuffer, "float", this.count);
    const colorStorage = storage(this.colorBuffer, "vec4", this.count);

    // Compute shader function
    this.computeFn = Fn(() => {
      const index = instanceIndex;

      // Calculate grid position from linear index
      const col = mod(float(index), cols);
      const row = floor(div(float(index), cols));

      // Normalized position (0-1)
      const normX = div(col, cols);
      const normY = div(row, float(this.uniforms.rows));

      // Wave effect based on position and time
      const phase = add(
        mul(add(normX, normY), waveFrequency),
        mul(time, waveSpeed)
      );
      const wave = sin(phase);

      // Offset: z-axis wave
      const offset = vec3(0.0, 0.0, mul(wave, waveAmplitude));
      offsetStorage.element(index).assign(offset);

      // Scale: subtle pulsing based on wave
      const scaleVal = add(1.0, mul(wave, 0.1));
      scaleStorage.element(index).assign(scaleVal);

      // Color: slight variation based on position
      const r = add(0.8, mul(normX, 0.2));
      const g = add(0.8, mul(normY, 0.2));
      const b = float(0.9);
      const a = float(1.0);
      colorStorage.element(index).assign(vec4(r, g, b, a));
    });

    // Calculate workgroup size - aim for 64-256 threads per workgroup
    // Use 8x8 = 64 as a balanced default
    const workgroupSize = 64;
    const workgroupCount = Math.ceil(this.count / workgroupSize);

    this.computeNode = this.computeFn().compute(workgroupCount * workgroupSize);
  }

  /**
   * Update uniforms and prepare for compute dispatch
   * @param {number} time - Current time in seconds
   * @param {number} delta - Time delta in seconds
   */
  update(time, delta) {
    this.uniforms.time.value = time;
  }

  /**
   * Get the compute node for renderer.computeAsync
   * @returns {Node}
   */
  getComputeNode() {
    return this.computeNode;
  }

  /**
   * Rebuild buffers for new instance count
   * @param {number} count - New instance count
   * @param {number} cols - New column count
   * @param {number} rows - New row count
   */
  rebuild(count, cols, rows) {
    this.count = count;
    this.cols = cols;
    this.rows = rows;

    this.uniforms.cols.value = cols;
    this.uniforms.rows.value = rows;

    this._createBuffers(count);
    this._createComputeShader();
  }

  /**
   * Set wave parameters
   * @param {Object} params - { amplitude, frequency, speed }
   */
  setWaveParams(params = {}) {
    if (params.amplitude !== undefined) {
      this.uniforms.waveAmplitude.value = params.amplitude;
    }

    if (params.frequency !== undefined) {
      this.uniforms.waveFrequency.value = params.frequency;
    }

    if (params.speed !== undefined) {
      this.uniforms.waveSpeed.value = params.speed;
    }
  }

  /**
   * Get storage buffers for binding to geometry
   * @returns {Object}
   */
  getBuffers() {
    return {
      instanceOffset: this.offsetBuffer,
      instanceScale: this.scaleBuffer,
      instanceColor: this.colorBuffer,
    };
  }
}

