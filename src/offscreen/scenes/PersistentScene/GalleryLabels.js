import { Fn, attribute, clamp, float, fwidth, int, max, mix, step, uniform, uniformArray, vec2, vec3, vec4 } from 'three/tsl';
import { BatchedMSDFText } from 'three-blocks/msdf-text';
import { loadMSDFFont } from '@/offscreen/utils/msdfFont';
import { SCRAMBLE_LENGTH, msdfCoverage, msdfGlyphUv, pickScrambleRects } from '@/offscreen/utils/msdfScramble';
import { inverseACESFilmic } from '@/offscreen/utils/inverseToneMapping';

/**
 * One mono label per gallery card in a single batched draw. Each member
 * scrambles in and out on its own progress and rides its card's matrix.
 */
export default class GalleryLabels {
  constructor(count) {
    this.texts = Array(count).fill('');
    this.opacity = uniform(0.7);
    this.aberration = uniform(1.5);
    this.progress = uniformArray(Array(count).fill(0), 'float');
    this.ready = loadMSDFFont().then(({ font, map }) => {
      if (this.disposed) return;
      const batch = this.batch = new BatchedMSDFText({ font, map, maxTextCount: count, maxGlyphCount: count * 12 });
      batch.frustumCulled = false;
      batch.renderOrder = 12;
      batch.material.depthTest = false;
      batch.material.depthWrite = false;
      this.members = this.texts.map(text => batch.addText({ text, fontSize: 1, anchorX: 'left', anchorY: 'top', color: 0xffffff }));
      this.install(batch, font);
    });
  }

  install(batch, font) {
    const material = batch.material;
    const scramble = uniformArray(pickScrambleRects(font), 'vec4');
    const originalUv = attribute('msdfUvRect', 'vec4');
    const letter = attribute('msdfLetter', 'float');
    const member = attribute('msdfMember', 'float');
    const baseColor = material.colorNode;
    material.colorNode = Fn(() => {
      const base = vec4(baseColor);
      const progress = this.progress.element(int(member.add(0.5)));
      const t = clamp(progress.mul(float(1).sub(letter).mul(3).add(1)), 0, 1);
      const index = int(clamp(t.mul(SCRAMBLE_LENGTH), 0, SCRAMBLE_LENGTH - 1));
      const glyphUv = msdfGlyphUv(mix(scramble.element(index), originalUv, step(0.95, t)));
      // Channels split a little at rest and more while the glyphs are scrambling.
      const shift = vec2(fwidth(glyphUv).x.mul(this.aberration).mul(float(1).add(float(1).sub(t).mul(3))), 0);
      const coverage = uv => msdfCoverage(material._atlasNode, uv, material.distanceRangeUniform, material.weightBiasUniform);
      const split = vec3(coverage(glyphUv.add(shift)), coverage(glyphUv), coverage(glyphUv.sub(shift)));
      const alpha = max(split.x, max(split.y, split.z));
      const color = base.rgb.mul(split.div(alpha.max(1e-3)));
      return vec4(inverseACESFilmic(color.mul(0.95)), alpha.mul(t).mul(this.opacity).mul(material.opacityUniform));
    })();
    material.needsUpdate = true;
  }

  setText(index, text) {
    if (this.texts[index] === text) return;
    this.texts[index] = text;
    if (this.batch) this.batch.setTextAt(this.members[index], text);
  }

  setMatrix(index, matrix) {
    this.batch?.setMatrixAt(this.members[index], matrix);
  }

  setProgress(index, value) {
    this.progress.array[index] = value;
  }

  dispose() {
    this.disposed = true;
    this.batch?.dispose();
    this.batch?.removeFromParent();
  }
}
