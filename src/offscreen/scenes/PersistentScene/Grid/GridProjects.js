import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";
import {
  Fn,
  attribute,
  uniform,
  uv,
  float,
  vec2,
  vec3,
  vec4,
  dot,
  hash,
  instanceIndex,
  length,
  clamp,
  mix,
  max,
  smoothstep,
} from "three/tsl";
import { BatchedMSDFText } from "three-blocks/msdf-text";
import { loadMSDFFont } from "@/offscreen/utils/msdfFont";
import { installMSDFScramble } from "@/offscreen/utils/msdfScramble";

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
  material.depthTest = true;
  material.side = THREE.DoubleSide;

  const u = options.uniforms ?? {
    alpha: uniform(options.alpha ?? 1.0),
    reveal: uniform(options.reveal ?? 1.0),
    intro: options.intro ?? uniform(0.0),
    stagger: options.stagger ?? uniform(0.55),
    quadSize: uniform(options.quadSize ?? 3.0),
    overlayZ: uniform(options.overlayZ ?? 2.4),
    startZ: uniform(options.startZ ?? 0.13),
    startUV: uniform(options.startUV ?? 0.14),
    kinkUV: uniform(options.kinkUV ?? 0.3),
    color: uniform(new THREE.Color(options.color ?? 0xffffff)),
  };

  const origin = attribute("lineOrigin", "vec3");
  const dir = attribute("lineDir", "float");
  const st = uv();

  // Diagonal climbs from the tile face to overlayZ; the horizontal stays there.
  const along = smoothstep(u.startUV, u.kinkUV, max(st.x, st.y));
  const local = vec3(
    st.x.mul(u.quadSize).mul(dir),
    st.y.mul(u.quadSize),
    mix(u.startZ, u.overlayZ, along)
  );
  material.positionNode = local.add(origin);

  material.colorNode = Fn(() => {
    const p = uv().toVar();
    const th = float(0.006);
    const soft = float(0.006);
    const start = u.startUV;
    const kink = u.kinkUV;
    const delay = hash(instanceIndex).mul(u.stagger);
    const span = float(1).sub(u.stagger).max(0.001);
    const reveal = smoothstep(delay, delay.add(span), u.reveal.mul(u.intro));

    const diagEnd = mix(
      start,
      kink,
      clamp(reveal.mul(4.0), 0.0, 1.0)
    );
    const horEnd = mix(
      kink.add(0.002),
      float(0.85),
      clamp(reveal.sub(0.25).div(0.75), 0.0, 1.0)
    );

    const diag = sdLine(p, vec2(start, start), vec2(diagEnd, diagEnd));
    const hor = sdLine(p, vec2(kink, kink), vec2(horEnd, kink));

    const line = float(1.0).sub(smoothstep(th, th.add(soft), diag.min(hor)));
    return vec4(vec3(u.color), line.mul(u.alpha).mul(reveal));
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
  constructor(projects = [], options = {}) {
    super();
    this.name = "GridProjects";
    this.projects = projects;
    this._options = {
      overlayZ: options.overlayZ ?? 2.4,
      startZ: options.startZ ?? 0.13,
      labelSize: options.labelSize ?? 0.5,
      lineAlpha: options.lineAlpha ?? 1.0,
      reveal: options.reveal ?? 1.0,
      color: options.color ?? 0xffffff,
    };

    this.lineMesh = null;
    this._introU = uniform(0);
    this._staggerU = uniform(0.55);
    this._intro = 0;
    this._introDuration = 1.4;
    this.lineMaterial = createCalloutMaterial({
      overlayZ: this._options.overlayZ,
      startZ: this._options.startZ,
      alpha: this._options.lineAlpha,
      reveal: this._options.reveal,
      intro: this._introU,
      stagger: this._staggerU,
      color: this._options.color,
    });
    this.batch = null;
    this.scramble = null;
    this._layout = null;
    this._slots = [];
    this._tmpMatrix = new THREE.Matrix4();

    loadMSDFFont().then(({ font, map }) => {
      this.batch = new BatchedMSDFText({
        font,
        map,
        maxTextCount: Math.max(8, projects.length),
        maxGlyphCount: 1024,
      });
      this.batch.renderOrder = 11;
      this.batch.frustumCulled = false;
      this.scramble = installMSDFScramble(this.batch, font, {
        intro: this._introU,
        stagger: this._staggerU,
      });
      this.add(this.batch);
      if (this._layout) this._buildLabels(this._layout);
    });
  }

  update(delta) {
    if (this._intro >= 1) return;
    this._intro = Math.min(1, this._intro + (delta || 1 / 60) / this._introDuration);
    this._introU.value = this._intro;
  }

  playIn() {
    this._intro = 0;
    this._introU.value = 0;
  }

  finishIntro() {
    this._intro = 1;
    this._introU.value = 1;
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

    const { cellSize, tileSize = cellSize * 0.9, tileDepth = 0.2 } = layout;
    const quadSize = cellSize * 3;
    const startUV = (tileSize * 0.5) / quadSize;
    const kinkUV = 0.3;

    const origins = new Float32Array(this.projects.length * 3);
    const dirs = new Float32Array(this.projects.length);

    this.projects.forEach((project, i) => {
      const { x, y, dir } = this._projectPlacement(project, layout);
      origins[i * 3] = x;
      origins[i * 3 + 1] = y;
      origins[i * 3 + 2] = 0;
      dirs[i] = dir;
    });

    const geometry = new THREE.PlaneGeometry(1, 1, 16, 16);
    geometry.setAttribute(
      "lineOrigin",
      new THREE.InstancedBufferAttribute(origins, 3)
    );
    geometry.setAttribute("lineDir", new THREE.InstancedBufferAttribute(dirs, 1));

    const u = this.lineUniforms;
    u.quadSize.value = quadSize;
    u.startUV.value = startUV;
    u.kinkUV.value = kinkUV;
    u.startZ.value = this._options.startZ ?? tileDepth * 0.5 + 0.02;

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
    const { cellSize } = layout;
    const quadSize = cellSize * 3;
    const kink = this.lineUniforms.kinkUV.value;
    const z = this._options.overlayZ + 0.02;

    for (let slot = 0; slot < this.batch.maxTextCount; slot++) {
      if (this.batch.hasText(slot)) this.batch.removeText(slot);
    }
    this._slots.length = 0;

    for (const project of this.projects) {
      const { x, y, dir } = this._projectPlacement(project, layout);
      const px = x + dir * (kink + 0.08) * quadSize;
      const py = y + kink * quadSize;
      const slot = this.batch.addText({
        text: project.name.toUpperCase(),
        position: { x: px, y: py, z },
        fontSize: cellSize * this._options.labelSize,
        anchorX: dir > 0 ? "left" : "right",
        anchorY: "bottom",
        color: 0xffffff,
      });
      this._slots.push({ slot, x: px, y: py });
    }
  }

  applyParams(options = {}) {
    Object.assign(this._options, options);
    const u = this.lineUniforms;
    if (options.overlayZ != null) u.overlayZ.value = options.overlayZ;
    if (options.startZ != null) u.startZ.value = options.startZ;
    if (options.lineAlpha != null) u.alpha.value = options.lineAlpha;
    if (options.reveal != null) u.reveal.value = options.reveal;
    if (options.color != null) u.color.value.set(options.color);

    if (this.batch && this._slots.length > 0) {
      const z = this._options.overlayZ + 0.04;
      for (const member of this._slots) {
        this.batch.setColorAt(member.slot, 0xffffff);
        this.batch.setMatrixAt(
          member.slot,
          this._tmpMatrix.makeTranslation(member.x, member.y, z)
        );
        if (this._layout && options.labelSize != null) {
          this.batch.setLayoutAt(member.slot, {
            fontSize: this._layout.cellSize * this._options.labelSize,
          });
        }
      }
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
    this.scramble = null;
  }
}
