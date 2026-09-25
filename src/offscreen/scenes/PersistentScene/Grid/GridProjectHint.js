import * as THREE from "three/webgpu";
import { BatchedMSDFText } from "three-blocks/msdf-text";
import { loadMSDFFont } from "@/offscreen/utils/msdfFont";
import { installMSDFScramble } from "@/offscreen/utils/msdfScramble";
import { timingEase } from "@/offscreen/lib/customEases";
import { timings } from '@/shared/timings';

const IDLE = "[ SELECT A PROJECT TILE TO VISIT ]";

/** A separate grid child: project hover hides callouts, but keeps this hint. */
export default class GridProjectHint extends THREE.Group {
  constructor(projects) {
    super();
    this.name = "GridProjectHint";
    this.label = IDLE;
    this.progress = 1;
    this.ready = loadMSDFFont({
      jsonPath: "assets/fonts/msdf/SpaceMono/hint/SpaceMono-Regular.json",
      atlasPath: "assets/fonts/msdf/SpaceMono/hint/SpaceMono-Regular.png",
    }).then(({ font, map }) => {
      if (this.disposed) return;
      const capacity = Math.max(
        IDLE.length,
        ...projects.map((p) => p.name.length + 24),
      );
      this.batch = new BatchedMSDFText({
        font,
        map,
        maxTextCount: 1,
        maxGlyphCount: capacity,
      });
      this.batch.frustumCulled = false;
      this.batch.renderOrder = 12;
      this.batch.material.depthTest = false;
      this.slot = this.batch.addText({
        text: this.label,
        anchorX: "right",
        anchorY: "bottom",
        color: 0xa3a6a7,
      });
      this.scramble = installMSDFScramble(this.batch, font);
      this.scramble.stagger.value = 0;
      this.add(this.batch);
      if (this.layout) this.build(this.layout);
    });
  }

  build(layout) {
    this.layout = layout;
    if (!this.batch) return;
    const { originX, originY, cols, rows, cellSize, tileSize, tileDepth } =
      layout;
    const width = (cols - 1) * cellSize + tileSize;
    // Same local plane and right edge as the tile faces, including on resize.
    this.position.set(
      originX + (cols - 1) * cellSize + tileSize / 2,
      originY + (rows - 1) * cellSize + tileSize / 2 + cellSize * 0.8,
      tileDepth / 2,
    );
    const fontSize = Math.min(
      cellSize * 0.4,
      width / (this.label.length * 0.65),
    );
    this.batch.setLayoutAt(this.slot, { fontSize });
  }

  setProject(project) {
    const label = project
      ? `CLICK TO GO TO PROJECT [ ${project.name.toUpperCase()} ]`
      : IDLE;
    if (label === this.label) return;
    this.label = label;
    this.progress = 0;
    if (this.batch) {
      this.batch.setTextAt(this.slot, label);
      this.scramble.progress.value = 0;
      this.build(this.layout);
    }
  }

  update(delta) {
    this.progress = Math.min(1, this.progress + (delta || 1 / 60) / Math.max(timings.gridLabels.hintDuration, 1e-3));
    if (this.scramble)
      this.scramble.progress.value = timingEase(timings.gridLabels.hintEase)(this.progress);
  }

  dispose() {
    this.disposed = true;
    this.batch?.geometry.dispose();
    this.batch?.material.dispose();
    this.removeFromParent();
  }
}
