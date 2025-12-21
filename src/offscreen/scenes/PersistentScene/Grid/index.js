import * as THREE from "three/webgpu";
import { useViewportStore } from "../../../store.js";
import { createTileGeometry, createTileMaterial } from "./GridTile.js";
import { GridCompute } from "./GridCompute.js";

/**
 * Grid - A responsive grid of GPU-driven instanced tiles
 * Uses compute shaders to control per-tile properties
 */
export class Grid extends THREE.Group {
  /**
   * @param {Object} config - Grid configuration
   * @param {number} config.size - Target number of columns (rows auto-calculated from aspect ratio)
   * @param {number} config.tileSize - Size of each tile in world units (auto-calculated if size is set)
   * @param {number} config.gap - Gap between tiles in world units
   * @param {number} config.cornerRadius - Corner radius for rounded rectangles
   * @param {number} config.depth - Tile depth/thickness (z-axis)
   * @param {Object} config.bevel - Bevel options { enabled, thickness, size, segments }
   * @param {THREE.Vector3} config.position - Initial position of the grid
   * @param {number} config.color - Base color for tiles
   * @param {number} config.opacity - Base opacity for tiles
   * @param {THREE.WebGPURenderer} config.renderer - WebGPU renderer for compute
   */
  constructor(config = {}) {
    super();

    this.config = {
      size: config.size ?? null, // If set, controls number of columns
      tileSize: config.tileSize ?? 1.0,
      gap: config.gap ?? 0.1,
      cornerRadius: config.cornerRadius ?? 0.1,
      depth: config.depth ?? 0.15,
      color: config.color ?? 0xffffff,
      opacity: config.opacity ?? 1.0,
      bevel: {
        enabled: config.bevel?.enabled ?? true,
        thickness: config.bevel?.thickness ?? undefined,
        size: config.bevel?.size ?? undefined,
        segments: config.bevel?.segments ?? 2,
      },
      ...config,
    };

    this.renderer = config.renderer;

    // Grid state
    this.cols = 0;
    this.rows = 0;
    this.count = 0;

    // Components
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.compute = null;

    // Position buffer for base grid positions
    this.positionBuffer = null;

    // Subscribe to viewport changes
    this._unsubscribe = useViewportStore.subscribe((state) => {
      this._onViewportChange(state.viewport);
    });

    // Initial build with current viewport
    const { viewport } = useViewportStore.getState();
    this._onViewportChange(viewport);

    // Set initial position if provided
    if (config.position) {
      this.position.copy(config.position);
    }
  }

  /**
   * Handle viewport changes
   * @param {Object} viewport - { width, height, devicePixelRatio }
   */
  _onViewportChange(viewport) {
    const { size, gap } = this.config;

    // Convert viewport to world units (rough conversion)
    const worldWidth = viewport.width * 0.01;
    const worldHeight = viewport.height * 0.01;
    const aspectRatio = worldWidth / worldHeight;

    let newCols, newRows, effectiveTileSize;

    if (size !== null && size > 0) {
      // Use fixed column count, calculate rows from aspect ratio
      newCols = size;
      newRows = Math.max(1, Math.round(size / aspectRatio));

      // Calculate tile size to fill the viewport
      // cellSize * cols = worldWidth, so tileSize = (worldWidth / cols) - gap
      const cellSizeX = worldWidth / newCols;
      const cellSizeY = worldHeight / newRows;
      const cellSize = Math.min(cellSizeX, cellSizeY);
      effectiveTileSize = Math.max(0.1, cellSize - gap);

      // Update the computed tile size for other methods
      this._computedTileSize = effectiveTileSize;
    } else {
      // Original behavior: calculate from tileSize
      const tileSize = this.config.tileSize;
      const cellSize = tileSize + gap;
      effectiveTileSize = tileSize;
      this._computedTileSize = tileSize;

      newCols = Math.floor(worldWidth / cellSize);
      newRows = Math.floor(worldHeight / cellSize);
    }

    const newCount = newCols * newRows;

    // Only rebuild if count changed
    if (newCount !== this.count || !this.mesh) {
      this.cols = newCols;
      this.rows = newRows;
      this.count = newCount;
      this._rebuild();
    } else {
      // Just update positions if viewport changed but count didn't
      this._updatePositions();
    }
  }

  /**
   * Rebuild the entire grid mesh and compute
   */
  _rebuild() {
    // Clean up existing
    if (this.mesh) {
      this.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }

    if (this.count <= 0) {
      this.mesh = null;
      return;
    }

    const { cornerRadius, depth, bevel, color, opacity } = this.config;
    // Use computed tile size (from size mode) or config tile size
    const tileSize = this._computedTileSize ?? this.config.tileSize;

    // Create geometry and material
    this.geometry = createTileGeometry(tileSize, cornerRadius, depth, 4, bevel);
    this.material = createTileMaterial({ color, opacity });

    // Create instanced mesh
    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      this.count
    );

    // Create or rebuild compute
    if (this.compute) {
      this.compute.rebuild(this.count, this.cols, this.rows);
    } else {
      this.compute = new GridCompute(this.count, this.cols, this.rows);
    }

    // Get compute buffers
    const buffers = this.compute.getBuffers();

    // Create position buffer for base grid positions
    this.positionBuffer = new THREE.InstancedBufferAttribute(
      new Float32Array(this.count * 3),
      3
    );

    // Set base positions
    this._updatePositions();

    // Attach all instance attributes to geometry
    this.geometry.setAttribute("instancePosition", this.positionBuffer);
    this.geometry.setAttribute("instanceOffset", buffers.instanceOffset);
    this.geometry.setAttribute("instanceScale", buffers.instanceScale);
    this.geometry.setAttribute("instanceColor", buffers.instanceColor);

    this.add(this.mesh);

    // Call rebuild callback if set
    if (this._onRebuildCallback) {
      this._onRebuildCallback(this.getDimensions());
    }
  }

  /**
   * Update base grid positions (centering the grid)
   */
  _updatePositions() {
    if (!this.positionBuffer || this.count <= 0) return;

    const { gap } = this.config;
    const tileSize = this._computedTileSize ?? this.config.tileSize;
    const cellSize = tileSize + gap;

    // Calculate grid dimensions
    const gridWidth = this.cols * cellSize - gap;
    const gridHeight = this.rows * cellSize - gap;

    // Offset to center the grid
    const offsetX = -gridWidth / 2 + tileSize / 2;
    const offsetY = -gridHeight / 2 + tileSize / 2;

    for (let i = 0; i < this.count; i++) {
      const col = i % this.cols;
      const row = Math.floor(i / this.cols);

      const x = col * cellSize + offsetX;
      const y = row * cellSize + offsetY;
      const z = 0;

      this.positionBuffer.array[i * 3] = x;
      this.positionBuffer.array[i * 3 + 1] = y;
      this.positionBuffer.array[i * 3 + 2] = z;
    }

    this.positionBuffer.needsUpdate = true;
  }

  /**
   * Update the grid - runs compute shader
   * @param {number} time - Time in milliseconds
   * @param {number} delta - Time delta in seconds
   */
  update(time, delta) {
    if (!this.compute || !this.renderer || this.count <= 0) return;

    // Skip compute if device is not valid
    if (this.renderer.isDeviceValid === false) return;

    // Update compute uniforms
    this.compute.update(time * 0.001, delta); // Convert to seconds

    // Run compute shader using safe wrapper if available
    if (this.renderer.safeCompute) {
      this.renderer.safeCompute(this.compute.getComputeNode());
    } else {
      this.renderer.compute(this.compute.getComputeNode());
    }
  }

  /**
   * Set the scene texture for glass effect sampling
   * @param {THREE.Texture} texture - The active scene's albedo texture
   */
  setSceneTexture(texture) {
    if (this.material?._sceneTextureNode && texture) {
      this.material._sceneTextureNode.value = texture;
    }
  }

  /**
   * Set the screen texture for glass effect sampling
   * @param {THREE.Texture} texture - The screen plane texture
   */
  setScreenTexture(texture) {
    if (this.material?._screenTextureNode && texture) {
      this.material._screenTextureNode.value = texture;
    }
  }

  /**
   * Set the scene depth texture for depth-based compositing
   * @param {THREE.Texture} texture - The scene depth texture
   */
  setSceneDepth(texture) {
    if (this.material?._sceneDepthNode && texture) {
      this.material._sceneDepthNode.value = texture;
    }
  }

  /**
   * Set the screen depth texture for depth-based compositing
   * @param {THREE.Texture} texture - The screen depth texture
   */
  setScreenDepth(texture) {
    if (this.material?._screenDepthNode && texture) {
      this.material._screenDepthNode.value = texture;
    }
  }

  /**
   * Get grid dimensions in world units
   * @returns {{ width: number, height: number }}
   */
  getDimensions() {
    const tileSize = this._computedTileSize ?? this.config.tileSize;
    const cellSize = tileSize + this.config.gap;
    const width = this.cols * cellSize - this.config.gap;
    const height = this.rows * cellSize - this.config.gap;
    return { width, height };
  }

  /**
   * Set callback for when grid rebuilds (useful for syncing other elements)
   * @param {Function} callback - Function to call after rebuild
   */
  onRebuild(callback) {
    this._onRebuildCallback = callback;
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    // Unsubscribe from viewport store
    if (this._unsubscribe) {
      this._unsubscribe();
    }

    // Clean up mesh
    if (this.mesh) {
      this.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }

    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.compute = null;
    this.positionBuffer = null;
  }
}


