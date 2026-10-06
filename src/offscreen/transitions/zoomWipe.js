import { Fn, float, length, mix, screenSize, smoothstep, texture, uv, vec2, vec3, vec4 } from "three/tsl";

const ZOOM = 1.5;
const SOFTNESS = 0.45;
const BLUR = 0.12;
const TAPS = 6;

// Screen-space iris from black. The frame opens from the centre while it zooms
// out to rest; a radial blur trails the front and resolves with it.
export function zoomWipe(map, progress) {
  return Fn(() => {
    const p = float(progress).clamp(0, 1).toVar();
    const st = uv().sub(0.5).toVar();
    const aspect = vec2(screenSize.x.div(screenSize.y), 1);
    const r = length(st.mul(aspect)).div(length(aspect.mul(0.5))).toVar();
    const front = p.mul(1 + SOFTNESS);
    const mask = smoothstep(front.sub(SOFTNESS), front, r).oneMinus().toVar();
    const edge = mask.mul(mask.oneMinus()).mul(4).toVar();
    const scale = mix(float(ZOOM), float(1), p).add(edge.mul(0.08)).toVar();
    const blur = p.oneMinus().mul(edge.add(0.25)).mul(BLUR).toVar();
    const color = vec3(0).toVar();
    for (let i = 0; i < TAPS; i++) {
      const s = scale.mul(blur.mul(i / (TAPS - 1)).add(1));
      color.addAssign(texture(map, st.div(s).add(0.5)).rgb);
    }
    return vec4(color.mul(mask.mul(edge.mul(0.15).add(1)).div(TAPS)), 1);
  })();
}
