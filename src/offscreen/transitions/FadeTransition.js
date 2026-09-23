import { BaseTransition } from "./BaseTransition.js";
import { texture, uv, mix } from "three/tsl";

export class FadeTransition extends BaseTransition {
  buildColorNode({ prevTex, nextTex, uvNode, mixNode, prevColor, nextColor }) {
    const st = uvNode ?? uv();
    const prevSample = texture(prevTex, st);
    const nextSample = texture(nextTex, st);
    return mix(prevColor ?? prevSample.rgb, nextColor ?? nextSample.rgb, mixNode);
  }
}
