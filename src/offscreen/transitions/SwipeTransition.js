import { BaseTransition } from "./BaseTransition.js";
import {
  texture,
  uv,
  smoothstep,
  sub,
  add,
  mul,
  clamp,
  mix,
  uniform,
} from "three/tsl";

export class SwipeTransition extends BaseTransition {
  constructor(config = {}) {
    super(config);
    this._feather = uniform(
      typeof config.feather === "number" ? config.feather : 0.0
    );
  }

  buildColorNode({ prevTex, nextTex, uvNode, mixNode }) {
    const st = uvNode ?? uv();
    const prevSample = texture(prevTex, st);
    const nextSample = texture(nextTex, st);
    // UV.x on fullscreen triangle spans ~0..2, rescale to 0..1
    const u01 = clamp(mul(st.x, 0.5), 0.0, 1.0);
    const edge0 = sub(mixNode, this._feather);
    const edge1 = add(mixNode, this._feather);
    // Invert mask so mix=0 => show previous, mix=1 => show next
    const swipe = sub(1.0, smoothstep(edge0, edge1, u01));
    return mix(prevSample.rgb, nextSample.rgb, swipe);
  }
}
