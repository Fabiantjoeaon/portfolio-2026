import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { useViewportStore } from "../../../store.js";
import { mouse } from "../../../input/MouseTracker.js";
import { createTileGeometry, createTileMaterial } from "./GridTile.js";
import { GridCompute } from "./GridCompute.js";
import { GridInterface } from "./GridInterface.js";
import { GridProjects } from "./GridProjects.js";

/**
 * Grid - A responsive grid of GPU-driven instanced tiles
 * Uses compute shaders to control per-tile properties
 */
export class Grid extends THREE.Group {
  /**
   * @param {Object} config - Grid configuration
   * @param {number} config.size - Target number of columns (rows auto-calculated from aspect ratio)
   * @param {number} config.tileSize - Size of each tile in world units (auto-calculated if size is set)
   * @param {number} config.gap - Gap between tiles as a fraction of the cell (when size is set), world units otherwise
   * @param {number} config.cornerRadius - Corner radius as a fraction of tile size
   * @param {number} config.depth - Tile depth/thickness as a fraction of tile size
   * @param {Array<[number,number]>} config.activeTiles - Normalized [x, y] grid positions of interactive tiles
   * @param {THREE.Vector3} config.position - Initial position of the grid
   * @param {number} config.color - Base color for tiles
   * @param {number} config.opacity - Base opacity for tiles
   * @param {THREE.WebGPURenderer} config.renderer - WebGPU renderer for compute
   */
  constructor(config = {}) {
    super();

    this.config = {
      cols: config.cols ?? null,
      rows: config.rows ?? null,
      size: config.size ?? null, // If set, controls number of columns
      tileSize: config.tileSize ?? 1.0,
      gap: config.gap ?? 0.1,
      cornerRadius: config.cornerRadius ?? 0.1,
      depth: config.depth ?? 0.2,
      color: config.color ?? 0xffffff,
      opacity: config.opacity ?? 1.0,
      mouseSize: config.mouseSize ?? 0.2,
      idleAmplitude: config.idleAmplitude ?? 0.5,
      idleSpeed: config.idleSpeed ?? 1.8,
      chromaticAberration: config.chromaticAberration ?? 0.15,
      // Projects: { pos: [nx, ny], name, color } — their tiles become active
      projects: config.projects ?? [],
      activeTiles:
        config.activeTiles ??
        (config.projects ?? []).map((project) => project.pos),
      ...config,
    };

    this.renderer = config.renderer;

    this.tileUniforms = {
      displacement: uniform(this.config.displacement ?? 0.22),
      refractStrength: uniform(this.config.refractStrength ?? 0.15),
      fresnelIntensity: uniform(this.config.fresnelIntensity ?? 0.1),
      fresnelIdle: uniform(this.config.fresnelIdle ?? 1.0),
      activeTileColor: uniform(
        new THREE.Color(this.config.activeTileColor ?? 0x6a9cbf)
      ),
      activeTileColorAmount: uniform(
        this.config.activeTileColorAmount ?? 0.45
      ),
      innerRefract: uniform(this.config.innerRefract ?? 0.6),
      boxHalf: uniform(new THREE.Vector3(0.5, 0.5, 0.1)),
    };

    const iface = this.config.interface ?? {};
    this.interfaceUniforms = {
      alpha: uniform(iface.alpha ?? 1.0),
      density: uniform(iface.density ?? 0.22),
      quadScale: uniform(iface.quadScale ?? 1.0),
      tileSize: uniform(this.config.tileSize ?? 1.0),
      zLift: uniform(0),
      ringSpeed: uniform(iface.ringSpeed ?? 0.2),
      ringAlpha: uniform(iface.ringAlpha ?? 1.0),
      bracketAlpha: uniform(iface.bracketAlpha ?? 0.06),
      idleBracket: uniform(iface.idleBracket ?? 0.4),
      crossAlpha: uniform(iface.crossAlpha ?? 0.6),
      plusAlpha: uniform(iface.plusAlpha ?? 0.85),
      color: uniform(new THREE.Color(iface.color ?? 0xffffff)),
      activeColor: uniform(new THREE.Color(iface.activeColor ?? 0xffffff)),
      whooshInterval: uniform(iface.whooshInterval ?? 5),
      whooshSpeed: uniform(iface.whooshSpeed ?? 0.45),
      whooshWidth: uniform(iface.whooshWidth ?? 0.18),
      whooshSmooth: uniform(iface.whooshSmooth ?? 0.7),
      whooshAlpha: uniform(iface.whooshAlpha ?? 1),
      whooshFlicker: uniform(iface.whooshFlicker ?? 1),
      whooshFlickerSpeed: uniform(iface.whooshFlickerSpeed ?? 18),
      cols: uniform(this.config.cols ?? 1),
      rows: uniform(this.config.rows ?? 1),
    };

    this.overlayOptions = {
      overlayZ: this.config.overlayZ ?? 2.4,
      startZ: 0,
      labelSize: this.config.labelSize ?? 0.5,
      lineAlpha: this.config.lineAlpha ?? 1.0,
      reveal: this.config.reveal ?? 1.0,
    };
    this._syncFaceZ();

    // Interactive ("project") tiles - only these react to hover pull/spin
    this._activeIndices = new Set();
    this._projectByIdx = new Map();
    this._hoveredProject = null;
    // Pointer tracking on/off (disabled while a project is open)
    this.interactive = true;
    // Optional callback: onProjectHover(project|null) fired on change
    this.onProjectHover = null;

    // Grid state
    this.cols = 0;
    this.rows = 0;
    this.count = 0;

    // Components
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.compute = null;
    this.interface = null;
    this.projectsOverlay = null;

    // Position buffer for base grid positions
    this.positionBuffer = null;

    // Mouse follow state (preallocated, updated per frame)
    this._raycaster = new THREE.Raycaster();
    this._gridPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._liftPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._pointerNdc = new THREE.Vector2();
    this._hitPoint = new THREE.Vector3();
    this._liftPoint = new THREE.Vector3();
    this._gridWorldPos = new THREE.Vector3();
    this._mouse = new THREE.Vector2();
    this._mouseTarget = new THREE.Vector2();
    this._mouseLifted = new THREE.Vector2();
    this._mouseLiftedTarget = new THREE.Vector2();

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
    const { cols, rows, size, gap } = this.config;

    // Convert viewport to world units (rough conversion)
    const worldWidth = viewport.width * 0.01;
    const worldHeight = viewport.height * 0.01;
    const aspectRatio = worldWidth / worldHeight;

    let newCols, newRows, effectiveTileSize;

    if (cols > 0 && rows > 0) {
      // Fixed old-portfolio layout: world-unit tiles, not viewport-fitted
      newCols = cols;
      newRows = rows;
      effectiveTileSize = this.config.tileSize;
      this._computedTileSize = effectiveTileSize;
      this._cellSize = effectiveTileSize + gap;
    } else if (size !== null && size > 0) {
      // Use fixed column count, calculate rows from aspect ratio
      newCols = size;
      newRows = Math.max(1, Math.round(size / aspectRatio));

      // Calculate tile size to fill the viewport; gap is a fraction of the
      // cell so the gap:tile ratio stays constant across viewports
      const cellSizeX = worldWidth / newCols;
      const cellSizeY = worldHeight / newRows;
      const cellSize = Math.min(cellSizeX, cellSizeY);
      effectiveTileSize = Math.max(0.02, cellSize * (1 - gap));

      // Update the computed metrics for other methods
      this._computedTileSize = effectiveTileSize;
      this._cellSize = cellSize;
    } else {
      // Original behavior: calculate from tileSize, gap in world units
      const tileSize = this.config.tileSize;
      const cellSize = tileSize + gap;
      effectiveTileSize = tileSize;
      this._computedTileSize = tileSize;
      this._cellSize = cellSize;

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

    if (this.interface) {
      this.remove(this.interface);
      this.interface.dispose();
      this.interface = null;
    }

    if (this.count <= 0) {
      this.mesh = null;
      return;
    }

    const { cornerRadius, depth, color, opacity } = this.config;
    const tileSize = this._computedTileSize ?? this.config.tileSize;

    // Same RoundedBox as the old Wall: size × size × 0.2size, 1 segment, radius 0.1size
    this.geometry = createTileGeometry(
      tileSize,
      cornerRadius * tileSize,
      depth * tileSize,
      1
    );
    this.interfaceUniforms.tileSize.value = tileSize;
    this.interfaceUniforms.cols.value = this.cols;
    this.interfaceUniforms.rows.value = this.rows;
    this.tileUniforms.boxHalf.value.set(
      tileSize * 0.5,
      tileSize * 0.5,
      depth * tileSize * 0.5
    );
    this._syncFaceZ();

    this.material = this._createMaterial(color, opacity);

    // Create instanced mesh
    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      this.count
    );

    // Disable frustum culling - instance positions are computed dynamically
    // and the bounding box might not correctly represent all instances
    this.mesh.frustumCulled = false;

    // Initialize instance matrices to identity
    // This is required for InstancedMesh to render correctly
    // Even when using custom positionNode, the matrices need to be set
    const identityMatrix = new THREE.Matrix4();
    for (let i = 0; i < this.count; i++) {
      this.mesh.setMatrixAt(i, identityMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // Resolve active (interactive) tiles from normalized positions
    const activeFlags = this._resolveActiveTiles();

    // Create or rebuild compute
    const layout = this._getLayout();
    if (this.compute) {
      this.compute.rebuild(this.count, this.cols, this.rows, layout, activeFlags);
    } else {
      this.compute = new GridCompute(
        this.count,
        this.cols,
        this.rows,
        layout,
        activeFlags
      );
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
    this.geometry.setAttribute("instanceRotation", buffers.instanceRotation);
    this.geometry.setAttribute("instanceInfluence", buffers.instanceInfluence);

    this.add(this.mesh);

    // SDF HUD overlay: one instanced quad per cell, sharing the same
    // storage buffers so it follows tile motion with zero extra compute
    this.interface = new GridInterface({
      count: this.count,
      tileSize,
      tileDepth: depth * tileSize,
      positionBuffer: this.positionBuffer,
      buffers,
      options: { uniforms: this.interfaceUniforms },
    });
    this.add(this.interface);

    // Project callout lines + MSDF labels over the active tiles
    if (this.config.projects.length > 0) {
      if (!this.projectsOverlay) {
        this.projectsOverlay = new GridProjects(
          this.config.projects,
          this.overlayOptions
        );
        this.add(this.projectsOverlay);
      }

      this._syncFaceZ();

      const layout = this._getLayout();
      this.projectsOverlay.build({
        cols: this.cols,
        rows: this.rows,
        cellSize: layout.cellSize,
        originX: layout.originX,
        originY: layout.originY,
        tileDepth: depth * tileSize,
        tileSize,
      });
    }

    // Call rebuild callback if set
    if (this._onRebuildCallback) {
      this._onRebuildCallback(this.getDimensions());
    }
  }

  /**
   * Resolve normalized activeTiles positions into instance indices and flags.
   * Only these tiles react to hover (pull toward mouse, spin, scale pop),
   * like the project tiles in the old portfolio.
   * @returns {Float32Array} - Per-instance 0/1 active flags
   */
  _resolveActiveTiles() {
    const activeFlags = new Float32Array(this.count);
    this._activeIndices.clear();
    this._projectByIdx.clear();

    this.config.activeTiles.forEach(([nx, ny], i) => {
      const col = Math.round(nx * (this.cols - 1));
      const row = Math.round(ny * (this.rows - 1));
      const idx = row * this.cols + col;
      if (idx >= 0 && idx < this.count) {
        this._activeIndices.add(idx);
        activeFlags[idx] = 1;
        // activeTiles defaults to the projects' positions, so indices align
        const project = this.config.projects[i];
        if (project) this._projectByIdx.set(idx, project);
      }
    });

    return activeFlags;
  }

  _setHoveredProject(project) {
    if (project === this._hoveredProject) return;
    this._hoveredProject = project;
    this.onProjectHover?.(project);
  }

  /**
   * Cell size in world units (tile + gap)
   */
  _getCellSize() {
    return (
      this._cellSize ??
      (this._computedTileSize ?? this.config.tileSize) + this.config.gap
    );
  }

  /**
   * Update base grid positions (centering the grid)
   */
  _updatePositions() {
    if (!this.positionBuffer || this.count <= 0) return;

    const tileSize = this._computedTileSize ?? this.config.tileSize;
    const cellSize = this._getCellSize();
    const gap = cellSize - tileSize;

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
   * Update the grid - tracks the pointer and runs the compute shader
   * @param {number} time - Time in milliseconds
   * @param {number} delta - Time delta in seconds
   * @param {THREE.Camera} camera - Camera used to project the pointer onto the grid
   */
  update(time, delta, camera = null) {
    if (!this.compute || !this.renderer || this.count <= 0) return;

    // Skip compute if device is not valid
    if (this.renderer.isDeviceValid === false) return;

    if (camera && this.interactive) {
      this._updatePointer(camera, delta);
    }

    // Update compute uniforms
    this.compute.update(time * 0.001, delta); // Convert to seconds

    // Run compute shader using safe wrapper if available
    if (this.renderer.safeCompute) {
      this.renderer.safeCompute(this.compute.getComputeNode());
    } else {
      this.renderer.compute(this.compute.getComputeNode());
    }

    this.projectsOverlay?.update(delta);
  }

  /**
   * Project the pointer onto the grid plane and update mouse-follow uniforms.
   * Intersects the camera ray with the exact grid plane in world space, so the
   * mouse position matches the tiles precisely (fixes the old grid's offset).
   */
  _updatePointer(camera, delta) {
    const u = this.compute.uniforms;
    const { width, height } = this.getDimensions();
    const cellSize = this._getCellSize();

    this.getWorldPosition(this._gridWorldPos);
    this._gridPlane.constant = -this._gridWorldPos.z;

    this._pointerNdc.set(mouse.x, mouse.y);
    this._raycaster.setFromCamera(this._pointerNdc, camera);
    const hit = this._raycaster.ray.intersectPlane(
      this._gridPlane,
      this._hitPoint
    );

    // Second intersection at the hover pop height: a tile lifted toward the
    // camera must be pulled to this point to appear exactly under the cursor
    const hoverLift = this.config.hoverLift ?? 2.0;
    this._liftPlane.constant = -(this._gridWorldPos.z + hoverLift);
    const liftHit = this._raycaster.ray.intersectPlane(
      this._liftPlane,
      this._liftPoint
    );
    if (liftHit) {
      this._mouseLiftedTarget.set(
        this._liftPoint.x - this._gridWorldPos.x,
        this._liftPoint.y - this._gridWorldPos.y
      );
    }

    if (hit) {
      const localX = this._hitPoint.x - this._gridWorldPos.x;
      const localY = this._hitPoint.y - this._gridWorldPos.y;
      this._mouseTarget.set(localX, localY);

      const inBounds =
        Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2;
      u.hasHover.value = inBounds ? 1 : 0;
      if (!inBounds) {
        u.pointerTile.value.set(-1, -1);
        this._setHoveredProject(null);
      }

      if (inBounds) {
        const col = Math.min(
          this.cols - 1,
          Math.max(0, Math.floor((localX + width / 2) / cellSize))
        );
        const row = Math.min(
          this.rows - 1,
          Math.max(0, Math.floor((localY + height / 2) / cellSize))
        );

        const idx = row * this.cols + col;
        u.pointerTile.value.set(col, row);
        // Only active ("project") tiles pop / spin
        if (this._activeIndices.has(idx)) {
          u.hoveredTile.value.set(col, row);
          this._setHoveredProject(this._projectByIdx.get(idx) ?? null);
        } else {
          u.hoveredTile.value.set(-1, -1);
          this._setHoveredProject(null);
        }
      }
    } else {
      u.hasHover.value = 0;
      u.pointerTile.value.set(-1, -1);
      this._setHoveredProject(null);
    }

    // Damped mouse follow, same feel as the old CPU lerp (alpha 0.1 at 60fps)
    const k = 1 - Math.pow(0.9, (delta || 1 / 60) * 60);
    this._mouse.lerp(this._mouseTarget, k);
    u.mousePos.value.copy(this._mouse);
    this._mouseLifted.lerp(this._mouseLiftedTarget, k);
    u.mouseLifted.value.copy(this._mouseLifted);
  }

  /**
   * Layout parameters shared with the compute shader
   */
  _getLayout() {
    const tileSize = this._computedTileSize ?? this.config.tileSize;
    const cellSize = this._getCellSize();
    const gap = cellSize - tileSize;
    const gridWidth = this.cols * cellSize - gap;
    const gridHeight = this.rows * cellSize - gap;

    return {
      cellSize,
      originX: -gridWidth / 2 + tileSize / 2,
      originY: -gridHeight / 2 + tileSize / 2,
      // Old grid: uMouseSize (0.2) was normalized against grid height
      mouseRadius: (this.config.mouseSize ?? 0.2) * gridHeight,
      pushStrength: this.config.pushStrength,
      pushZ: this.config.pushZ,
      hoverLift: this.config.hoverLift,
      rotationStrength: this.config.rotationStrength,
      idleAmplitude: this.config.idleAmplitude,
      idleSpeed: this.config.idleSpeed,
      hideSpread: this.config.hideSpread,
      halfDiag: Math.hypot(gridWidth, gridHeight) * 0.5,
    };
  }

  /**
   * Drive the project-mode scale-out wave (0 = tiles visible, 1 = gone)
   */
  setHideProgress(progress) {
    if (this.compute) this.compute.uniforms.hideProgress.value = progress;
  }

  /**
   * Toggle pointer tracking. When disabled, hover state is cleared so tiles
   * settle back to rest while they scale out.
   */
  setInteractive(interactive) {
    this.interactive = interactive;
    if (!interactive && this.compute) {
      const u = this.compute.uniforms;
      u.hasHover.value = 0;
      u.hoveredTile.value.set(-1, -1);
      u.pointerTile.value.set(-1, -1);
      this._setHoveredProject(null);
    }
  }

  /**
   * Set the scene texture for glass effect sampling
   * @param {THREE.Texture} texture - The active scene's albedo texture
   */
  setSceneTexture(texture) {
    if (this.material?._sceneTextureUniform && texture) {
      this.material._sceneTextureUniform.value = texture;
    }
  }

  /**
   * Set the screen texture for glass effect sampling
   * @param {THREE.Texture} texture - The screen plane texture
   */
  setScreenTexture(texture) {
    if (this.material?._screenTextureUniform && texture) {
      this.material._screenTextureUniform.value = texture;
    }
  }

  /**
   * Set the scene depth texture for depth-based compositing
   * @param {THREE.Texture} texture - The scene depth texture
   */
  setSceneDepth(texture) {
    // Depth textures removed for simplicity - not using depth compositing
  }

  /**
   * Set the screen depth texture for depth-based compositing
   * @param {THREE.Texture} texture - The screen depth texture
   */
  setScreenDepth(texture) {
    // Depth textures removed for simplicity - not using depth compositing
  }

  /**
   * Get grid dimensions in world units
   * @returns {{ width: number, height: number }}
   */
  getDimensions() {
    const tileSize = this._computedTileSize ?? this.config.tileSize;
    const cellSize = this._getCellSize();
    const gap = cellSize - tileSize;
    const width = this.cols * cellSize - gap;
    const height = this.rows * cellSize - gap;
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
   * Recreate the tile material (used when compile-time flags like inner
   * refract change — a uniform zero still leaves the march in the graph).
   */
  rebuildMaterial() {
    const prev = this.material;
    this.material = this._createMaterial(
      this.config.color,
      this.config.opacity,
    );
    if (this.mesh) this.mesh.material = this.material;
    prev?.dispose();
  }

  _createMaterial(color, opacity) {
    return createTileMaterial({
      color,
      opacity,
      displacementUniform: this.tileUniforms.displacement,
      refractStrengthUniform: this.tileUniforms.refractStrength,
      fresnelIntensityUniform: this.tileUniforms.fresnelIntensity,
      fresnelIdleUniform: this.tileUniforms.fresnelIdle,
      activeTileColorUniform: this.tileUniforms.activeTileColor,
      activeTileColorAmountUniform: this.tileUniforms.activeTileColorAmount,
      innerRefractUniform: this.tileUniforms.innerRefract,
      innerRefractEnabled: this.config.innerRefractEnabled ?? false,
      boxHalfUniform: this.tileUniforms.boxHalf,
      chromaticAberration: this.config.chromaticAberration ?? 0.15,
    });
  }

  /**
   * Rebuild geometry after layout knobs change (cols/rows/size/gap/radius).
   */
  rebuildLayout() {
    if (this.config.cols > 0 && this.config.rows > 0) {
      this._computedTileSize = this.config.tileSize;
      this._cellSize = this.config.tileSize + this.config.gap;
    }
    this._rebuild();
  }

  _tileFaceZ() {
    const tileSize = this._computedTileSize ?? this.config.tileSize;
    return (this.config.depth ?? 0.2) * tileSize * 0.5;
  }

  _syncFaceZ() {
    const face = this._tileFaceZ();
    const ifacePad = this.config.interfaceZLift ?? 0.02;
    this.interfaceUniforms.zLift.value = face + ifacePad;

    const linePad = this.config.lineStartZ ?? ifacePad;
    const startZ = face + linePad;
    this.overlayOptions.startZ = startZ;
    this.projectsOverlay?.applyParams({ startZ });
  }

  applyParams(p = {}) {
    const u = this.compute?.uniforms;
    if (u) {
      if (p.pushStrength != null) u.pushStrength.value = p.pushStrength;
      if (p.pushZ != null) u.pushZ.value = p.pushZ;
      if (p.hoverLift != null) u.hoverLift.value = p.hoverLift;
      if (p.rotationStrength != null)
        u.rotationStrength.value = p.rotationStrength;
      if (p.idleAmplitude != null) u.idleAmplitude.value = p.idleAmplitude;
      if (p.idleSpeed != null) u.idleSpeed.value = p.idleSpeed;
      if (p.mouseSize != null) {
        this.config.mouseSize = p.mouseSize;
        u.mouseRadius.value = p.mouseSize * this.getDimensions().height;
      }
    }

    if (p.displacement != null)
      this.tileUniforms.displacement.value = p.displacement;
    if (p.refractStrength != null)
      this.tileUniforms.refractStrength.value = p.refractStrength;
    if (p.fresnelIntensity != null)
      this.tileUniforms.fresnelIntensity.value = p.fresnelIntensity;
    if (p.fresnelIdle != null)
      this.tileUniforms.fresnelIdle.value = p.fresnelIdle;
    if (p.activeTileColor != null)
      this.tileUniforms.activeTileColor.value.set(p.activeTileColor);
    if (p.activeTileColorAmount != null)
      this.tileUniforms.activeTileColorAmount.value = p.activeTileColorAmount;
    if (p.innerRefract != null)
      this.tileUniforms.innerRefract.value = p.innerRefract;
    if (p.innerRefractEnabled != null) {
      this.config.innerRefractEnabled = p.innerRefractEnabled;
      this.rebuildMaterial();
    }
    if (p.chromaticAberration != null && this.material) {
      this.config.chromaticAberration = p.chromaticAberration;
      this.material.chromaticAberration = p.chromaticAberration;
    }

    const iu = this.interfaceUniforms;
    if (p.interfaceAlpha != null) iu.alpha.value = p.interfaceAlpha;
    if (p.interfaceDensity != null) iu.density.value = p.interfaceDensity;
    if (p.interfaceQuadScale != null) iu.quadScale.value = p.interfaceQuadScale;
    if (p.interfaceZLift != null) {
      this.config.interfaceZLift = p.interfaceZLift;
      this._syncFaceZ();
    }
    if (p.ringSpeed != null) iu.ringSpeed.value = p.ringSpeed;
    if (p.ringAlpha != null) iu.ringAlpha.value = p.ringAlpha;
    if (p.bracketAlpha != null) iu.bracketAlpha.value = p.bracketAlpha;
    if (p.idleBracket != null) iu.idleBracket.value = p.idleBracket;
    if (p.whooshInterval != null) iu.whooshInterval.value = p.whooshInterval;
    if (p.whooshSpeed != null) iu.whooshSpeed.value = p.whooshSpeed;
    if (p.whooshWidth != null) iu.whooshWidth.value = p.whooshWidth;
    if (p.whooshSmooth != null) iu.whooshSmooth.value = p.whooshSmooth;
    if (p.whooshAlpha != null) iu.whooshAlpha.value = p.whooshAlpha;
    if (p.whooshFlicker != null) iu.whooshFlicker.value = p.whooshFlicker;
    if (p.whooshFlickerSpeed != null)
      iu.whooshFlickerSpeed.value = p.whooshFlickerSpeed;
    if (p.crossAlpha != null) iu.crossAlpha.value = p.crossAlpha;
    if (p.plusAlpha != null) iu.plusAlpha.value = p.plusAlpha;
    if (p.interfaceColor != null) iu.color.value.set(p.interfaceColor);

    if (p.gridX != null) this.position.x = p.gridX;
    if (p.gridY != null) this.position.y = p.gridY;
    if (p.gridZ != null) this.position.z = p.gridZ;

    const overlay = {};
    if (p.overlayZ != null) overlay.overlayZ = p.overlayZ;
    if (p.lineStartZ != null) {
      this.config.lineStartZ = p.lineStartZ;
      this._syncFaceZ();
    }
    if (p.labelSize != null) overlay.labelSize = p.labelSize;
    if (p.lineAlpha != null) overlay.lineAlpha = p.lineAlpha;
    if (p.lineReveal != null) overlay.reveal = p.lineReveal;
    if (Object.keys(overlay).length) {
      Object.assign(this.overlayOptions, overlay);
      this.projectsOverlay?.applyParams(overlay);
    }
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

    if (this.interface) {
      this.remove(this.interface);
      this.interface.dispose();
    }

    if (this.projectsOverlay) {
      this.remove(this.projectsOverlay);
      this.projectsOverlay.dispose();
    }

    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.compute = null;
    this.interface = null;
    this.projectsOverlay = null;
    this.positionBuffer = null;
  }
}
