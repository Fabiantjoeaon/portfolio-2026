import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";
import {
  Fn,
  attribute,
  uniform,
  uv,
  positionLocal,
  float,
  vec2,
  vec3,
  vec4,
  dot,
  length,
  clamp,
  mix,
  smoothstep,
} from "three/tsl";
import { BatchedMSDFText, parseMSDFFont } from "three-blocks/msdf-text";
import { resolvePublicPath } from "@/offscreen/utils/publicPath";

const FONT_JSON = "assets/fonts/msdf/KHTeka/KHTekaTRIAL-Medium-msdf.json";
const FONT_ATLAS = "assets/fonts/msdf/KHTeka/KHTekaTRIAL-Medium.png";

let fontPromise = null;

async function loadAtlas(url) {
  if (typeof window === "undefined") {
    // The WebGPU backend honors texture.flipY when uploading ImageBitmaps,
    // so keep the bitmap unflipped to match TextureLoader semantics
    const bitmap = await new THREE.ImageBitmapLoader().loadAsync(url);
    const texture = new THREE.Texture(bitmap);
    texture.flipY = true;
    texture.needsUpdate = true;
    return texture;
  }
  return new THREE.TextureLoader().loadAsync(url);
}

function loadFont() {
  if (!fontPromise) {
    fontPromise = Promise.all([
      fetch(resolvePublicPath(FONT_JSON)).then((r) => r.json()),
      loadAtlas(resolvePublicPath(FONT_ATLAS)),
    ]).then(([json, map]) => {
      const font = parseMSDFFont(json, { flipY: true });
      // The KHTeka atlas has no space glyph; without it the layout falls
      // back to '?'. A zero-area glyph with an advance renders as a gap.
      if (!font.has(32)) {
        font.glyphs.set(32, {
          advance: 0.28,
          planeBounds: [0, 0, 0, 0],
          uvRect: [0, 0, 0, 0],
        });
      }
      return { font, map };
    });
  }
  return fontPromise;
}

const sdLine = (p, a, b) => {
  const ba = b.sub(a);
  const pa = p.sub(a);
  const h = clamp(dot(pa, ba).div(dot(ba, ba)), 0.0, 1.0);
  return length(pa.sub(ba.mul(h)));
};

/**
 * Callout line material (port of the old WallOverlay lineFragmentShader):
 * a diagonal from the tile corner that kinks into a horizontal underline for
 * the label. Drawn in quad uv space where (0,0) is the tile center; mirrored
 * tiles flip geometrically via the per-instance direction, so one shader
 * covers both sides. `reveal` (0..1) draws the line in and can be animated.
 */
function createCalloutMaterial(options = {}) {
  const material = new NodeMaterial();
  material.name = "GridProjectCallout";
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;

  const u = {
    alpha: uniform(options.alpha ?? 1.0),
    reveal: uniform(options.reveal ?? 1.0),
    quadSize: uniform(options.quadSize ?? 3.0),
    color: uniform(new THREE.Color(options.color ?? 0xffffff)),
  };

  const origin = attribute("lineOrigin", "vec3");
  const dir = attribute("lineDir", "float");

  // uv (0,0) maps to the tile center; dir=-1 mirrors the quad in x
  const local = vec3(
    positionLocal.x.add(0.5).mul(u.quadSize).mul(dir),
    positionLocal.y.add(0.5).mul(u.quadSize),
    0.0
  );
  material.positionNode = local.add(origin);

  material.colorNode = Fn(() => {
    const p = uv().toVar();
    const th = float(0.006);
    const soft = float(0.006);

    // Diagonal draws over the first quarter of reveal, horizontal over the rest
    const diagEnd = mix(
      float(0.1),
      float(0.3),
      clamp(u.reveal.mul(4.0), 0.0, 1.0)
    );
    const horEnd = mix(
      float(0.302),
      float(0.85),
      clamp(u.reveal.sub(0.25).div(0.75), 0.0, 1.0)
    );

    const diag = sdLine(p, vec2(0.1, 0.1), vec2(diagEnd, diagEnd));
    const hor = sdLine(p, vec2(0.3, 0.3), vec2(horEnd, 0.3));

    const line = float(1.0).sub(smoothstep(th, th.add(soft), diag.min(hor)));
    return vec4(vec3(u.color), line.mul(u.alpha));
  })();

  material.uniforms = u;
  return material;
}

/**
 * GridProjects - the old-portfolio project overlay for active tiles:
 * an instanced SDF callout line per project (one draw call) plus all project
 * names in a single BatchedMSDFText (one draw call, one atlas bind).
 */
export class GridProjects extends THREE.Group {
  /**
   * @param {Array<{ pos: [number, number], name: string, color?: number }>} projects
   */
  constructor(projects = []) {
    super();
    this.name = "GridProjects";
    this.projects = projects;

    this.lineMesh = null;
    this.lineMaterial = createCalloutMaterial();
    this.batch = null;
    this._layout = null;

    loadFont().then(({ font, map }) => {
      this.batch = new BatchedMSDFText({
        font,
        map,
        maxTextCount: Math.max(8, projects.length),
        maxGlyphCount: 1024,
      });
      this.batch.renderOrder = 11;
      this.batch.frustumCulled = false;
      this.add(this.batch);
      if (this._layout) this._buildLabels(this._layout);
    });
  }

  get lineUniforms() {
    return this.lineMaterial.uniforms;
  }

  /**
   * Resolve a project's tile into grid-local coordinates.
   * Mirrors Grid._resolveActiveTiles / _updatePositions math.
   */
  _projectPlacement(project, layout) {
    const { cols, rows, cellSize, originX, originY } = layout;
    const col = Math.round(project.pos[0] * (cols - 1));
    const row = Math.round(project.pos[1] * (rows - 1));
    return {
      x: originX + col * cellSize,
      y: originY + row * cellSize,
      dir: col < cols / 2 ? 1 : -1,
    };
  }

  /**
   * (Re)build callout lines and labels for a new grid layout.
   * @param {Object} layout - { cols, rows, cellSize, originX, originY, tileDepth }
   */
  build(layout) {
    this._layout = layout;
    this._buildLines(layout);
    if (this.batch) this._buildLabels(layout);
  }

  _buildLines(layout) {
    if (this.lineMesh) {
      this.remove(this.lineMesh);
      this.lineMesh.geometry.dispose();
    }
    if (this.projects.length === 0) return;

    const { cellSize, tileDepth } = layout;
    const zLift = tileDepth * 0.5 + 0.03;

    const origins = new Float32Array(this.projects.length * 3);
    const dirs = new Float32Array(this.projects.length);

    this.projects.forEach((project, i) => {
      const { x, y, dir } = this._projectPlacement(project, layout);
      origins[i * 3] = x;
      origins[i * 3 + 1] = y;
      origins[i * 3 + 2] = zLift;
      dirs[i] = dir;
    });

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute(
      "lineOrigin",
      new THREE.InstancedBufferAttribute(origins, 3)
    );
    geometry.setAttribute("lineDir", new THREE.InstancedBufferAttribute(dirs, 1));

    this.lineUniforms.quadSize.value = cellSize * 3;

    this.lineMesh = new THREE.InstancedMesh(
      geometry,
      this.lineMaterial,
      this.projects.length
    );
    this.lineMesh.frustumCulled = false;
    this.lineMesh.renderOrder = 11;

    const identity = new THREE.Matrix4();
    for (let i = 0; i < this.projects.length; i++) {
      this.lineMesh.setMatrixAt(i, identity);
    }
    this.lineMesh.instanceMatrix.needsUpdate = true;

    this.add(this.lineMesh);
  }

  _buildLabels(layout) {
    const { cellSize, tileDepth } = layout;
    const zLift = tileDepth * 0.5 + 0.04;

    // Free existing members before re-adding at the new layout
    for (let slot = 0; slot < this.batch.maxTextCount; slot++) {
      if (this.batch.hasText(slot)) this.batch.removeText(slot);
    }

    for (const project of this.projects) {
      const { x, y, dir } = this._projectPlacement(project, layout);
      // Label sits above the horizontal callout segment (line kinks at 0.9c,
      // runs to 2.55c; the quad is 3 cells wide)
      this.batch.addText({
        text: project.name.toUpperCase(),
        position: {
          x: x + dir * cellSize * 0.95,
          y: y + cellSize * 1.0,
          z: zLift,
        },
        fontSize: cellSize * 0.5,
        anchorX: dir > 0 ? "left" : "right",
        anchorY: "bottom",
        color: project.color ?? 0xffffff,
      });
    }
  }

  dispose() {
    if (this.lineMesh) {
      this.remove(this.lineMesh);
      this.lineMesh.geometry.dispose();
      this.lineMesh = null;
    }
    this.lineMaterial.dispose();

    if (this.batch) {
      this.remove(this.batch);
      this.batch.geometry.dispose();
      this.batch.material.dispose();
      this.batch = null;
    }
  }
}
