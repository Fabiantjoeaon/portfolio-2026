import { Mesh, MeshBasicNodeMaterial, DoubleSide } from 'three/webgpu';
import { Fn, If, Discard, texture, screenUV, vec4 } from 'three/tsl';

/** Seed scene depth only where the compositor's screen is fully opaque.
 * Hidden surfaces then fail early depth testing, before their lighting runs.
 * Partial screen coverage remains untouched, including all antialiased edges.
 * Use only for the main view, outside transitions that need original depth.
 */
export class ScreenDepthMask extends Mesh {
  constructor(screen, screenDepth, screenMesh) {
    const material = new MeshBasicNodeMaterial({ colorWrite: false, side: DoubleSide });
    super(screenMesh.geometry, material);
    this.name = 'Opaque screen depth';
    this.frustumCulled = false;
    this.renderOrder = -Infinity;
    this.matrixAutoUpdate = false;
    this.screen = texture(screen, screenUV);
    this.screenDepth = texture(screenDepth, screenUV);
    material.depthNode = this.screenDepth.r;
    material.colorNode = Fn(() => {
      If(this.screen.a.lessThan(1), () => { Discard(); });
      return vec4(0);
    })();
  }

  update(screen, screenDepth, screenMesh) {
    this.screen.value = screen;
    this.screenDepth.value = screenDepth;
    this.geometry = screenMesh.geometry;
    this.matrix.copy(screenMesh.matrixWorld);
    this.matrixWorldNeedsUpdate = true;
  }

  dispose() { this.material.dispose(); }
}
