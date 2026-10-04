import * as THREE from 'three/webgpu';
import {
  Fn, If, uv, vec2, vec3, vec4, float, floor, fract, mix, min, max, abs, clamp, length, dot, normalize,
  smoothstep, step, hash, screenCoordinate, positionLocal, cos, sin, atan, exp,
} from 'three/tsl';
import { inverseACESFilmic } from '@/offscreen/utils/inverseToneMapping';

const TAU = Math.PI * 2;

/** Signed distance to a rounded box of half extents `half`; negative inside. */
export const roundedBox = (p, half, radius) => {
  const r = min(radius, min(half.x, half.y));
  const q = abs(p).sub(half).add(r);
  return length(max(q, 0)).add(min(max(q.x, q.y), 0)).sub(r);
};

/**
 * Every card layer shares one card space: `inset` shrinks a layer inside it,
 * and `bend` bows the card sideways with the slider's speed, like smooothy.
 */
const cardPosition = (inset, bend) => Fn(() => {
  const xy = positionLocal.xy.mul(inset);
  return vec3(xy.x.add(cos(xy.y.mul(Math.PI)).mul(bend)), xy.y, positionLocal.z);
})();

const cardMaterial = () => {
  // Base NodeMaterial ignores constructor options. Set transparency explicitly
  // so its shader preserves the animated alpha instead of forcing it to 1.
  const material = new THREE.NodeMaterial();
  material.transparent = true;
  // Nothing else in the screen scene overlaps a card; draw order is renderOrder.
  // Depth is still written for the post compositor.
  material.depthTest = false;
  return material;
};

/** The image itself: banded slide transitions and entrance, cover/contain fit, rounded corners. */
export function createMediaMaterial(u, map, blurMap) {
  const coverScale = aspect => vec2(min(u.frameAspect.div(aspect), 1), min(aspect.div(u.frameAspect), 1));
  const cover = (st, aspect) => st.sub(0.5).mul(coverScale(aspect)).add(0.5);
  const material = cardMaterial();
  material.positionNode = cardPosition(u.inset, u.bend);
  material.colorNode = Fn(() => {
    const st = uv();
    // Columns staggered left to right, or rows staggered top to bottom.
    const axis = mix(st.x, float(1).sub(st.y), u.rows);
    const band = floor(axis.mul(u.bars)).min(u.bars.sub(1));
    const order = band.div(u.bars.sub(1));
    const progressOf = (amount, rank, stagger) => float(1).sub(amount).sub(rank.mul(stagger))
      .div(float(1).sub(stagger)).clamp(0, 1);
    const remaining = (amount, rank) => float(1).sub(smoothstep(0, 1, progressOf(amount, rank, u.stagger))).mul(u.effect);
    // Entrance: each band slides one band width back along the stagger axis
    // inside its own mask, like a line of text rising into place.
    const enter = float(1).sub(progressOf(u.page, order, u.inStagger)).pow(3).mul(u.effect);
    const shift = enter.div(u.bars);
    const revealed = step(shift, axis.sub(band.div(u.bars)));
    const centered = st.sub(0.5);
    const lensed = centered.mul(float(1).sub(dot(centered, centered).mul(4).mul(u.lens))).add(0.5);
    const entering = lensed.add(mix(vec2(shift.negate(), 0), vec2(0, shift), u.rows));
    const reverse = float(1).sub(order);
    const right = remaining(u.right, order);
    const left = remaining(u.left, reverse);
    const offset = right.mul(u.offset.add(order.mul(u.spread)))
      .sub(left.mul(u.offset.add(reverse.mul(u.spread))));
    const amount = max(right.mul(order.mul(0.65).add(0.35)), left.mul(reverse.mul(0.65).add(0.35)));
    // Fixed bands transform only their texture; overscan keeps translated
    // samples inside the image, with no geometry gaps or repeated edges.
    const scale = float(1).add(offset.abs().mul(2)).add(amount.mul(u.scale));
    const coords = entering.sub(0.5).sub(mix(vec2(offset, 0), vec2(0, offset.negate()), u.rows)).div(scale)
      .mul(u.zoom).add(0.5).add(vec2(u.parallax, 0));
    // Images that cover would crop past `fillBelow` are shown whole
    // over a dark blur of themselves; easing between the two avoids a pop.
    const visible = min(u.frameAspect.div(u.aspect), u.aspect.div(u.frameAspect));
    const fill = u.portrait.mul(mix(smoothstep(u.fillBelow.add(0.05), u.fillBelow.sub(0.1), visible), float(1), u.contain));
    const containScale = vec2(max(u.frameAspect.div(u.aspect), 1), max(u.aspect.div(u.frameAspect), 1));
    const fit = coords.sub(0.5).mul(mix(coverScale(u.aspect), containScale, fill)).add(0.5);
    const fitted = fit.clamp(0.0001, 0.9999);
    const sampled = map.sample(vec2(fitted.x, float(1).sub(fitted.y))).rgb.toVar();
    If(fill.greaterThan(0), () => {
      const inside = step(0, fit.x).mul(step(fit.x, 1)).mul(step(0, fit.y)).mul(step(fit.y, 1));
      const back = cover(coords, u.aspect).clamp(0.0001, 0.9999);
      const blurred = blurMap.sample(vec2(back.x, float(1).sub(back.y))).level(0).rgb;
      const tinted = mix(vec3(blurred.dot(vec3(0.2126, 0.7152, 0.0722))), blurred, u.blurSaturation).max(0);
      // Frosted glass: a soft top-lit sheen, and grain so the gradient never bands.
      const sheen = smoothstep(0.35, 1, st.y).mul(u.blurSheen);
      const grain = hash(screenCoordinate.x.add(screenCoordinate.y.mul(4099))).sub(0.5).mul(u.blurGrain);
      const glass = tinted.mul(u.blurBrightness).add(sheen).add(grain).max(0);
      sampled.assign(mix(glass, sampled, inside));
    });
    // Darken RGB rather than alpha: the last displaced band can become
    // genuinely black without revealing the background through the image.
    const darkness = max(amount, enter).pow(u.darknessPower).mul(u.fade).clamp(0, 1);
    const color = inverseACESFilmic(sampled.mul(u.brightness).mul(float(1).sub(darkness)));
    const corner = clamp(float(0.5).sub(roundedBox(centered.mul(u.size), u.size.mul(0.5), u.radius)), 0, 1);
    return vec4(color, u.opacity.mul(revealed).mul(float(1).sub(enter)).mul(corner));
  })();
  return material;
}

/**
 * Glitchy animated gradient border at the card's outer edge. `u.frame` draws
 * it clockwise from the top-left corner while the image shrinks inside it.
 */
export function createFrameMaterial(u, s, time) {
  const material = cardMaterial();
  material.positionNode = cardPosition(vec2(1, 1), u.bend);
  material.colorNode = Fn(() => {
    const st = uv();
    const half = u.cardSize.mul(0.5);
    const width = s.frameWidth;
    const seed = u.seed.mul(91.7);
    const tick = floor(time.mul(s.frameGlitchRate));
    // Rare bursts at rest, constant while the border draws on or off.
    const burst = step(0.86, hash(tick.add(seed)));
    const drawing = u.frame.mul(float(1).sub(u.frame)).mul(4);
    const glitch = s.frameGlitch.mul(max(burst, drawing));
    const band = floor(st.y.mul(32));
    const torn = step(0.7, hash(band.mul(3.7).add(tick).add(seed)));
    const jitter = hash(band.add(tick.mul(7.13)).add(seed)).sub(0.5).mul(glitch).mul(torn).mul(width.mul(8).add(6));
    const p = st.sub(0.5).mul(u.cardSize).add(vec2(jitter, 0));
    const ringHalf = half.sub(width.mul(0.5));
    const ring = q => clamp(width.mul(0.5).sub(abs(roundedBox(q, ringHalf, s.frameRadius))).add(0.5), 0, 1);
    const split = vec2(glitch.mul(2.5).add(s.frameAberration), 0);
    const mask = vec3(ring(p.add(split)), ring(p), ring(p.sub(split)));
    const coverage = max(mask.x, max(mask.y, mask.z));

    const turn = atan(p.y.div(half.y), p.x.div(half.x)).div(TAU).add(0.5);
    const along = fract(float(0.875).sub(turn));
    const head = u.frame.mul(1.1);
    const drawn = float(1).sub(smoothstep(head.sub(0.1), head, along));
    const spark = exp(abs(along.sub(head.sub(0.05))).mul(-60)).mul(drawing).mul(coverage);

    const flow = along.add(time.mul(s.frameSpeed)).add(sin(st.x.mul(5).add(st.y.mul(3)).add(time.mul(0.7))).mul(0.06));
    const phase = cos(vec3(flow.mul(TAU)).sub(vec3(0, TAU / 3, TAU * 2 / 3))).mul(0.5).add(0.5);
    const weights = phase.mul(phase);
    const gradient = s.frameColorA.mul(weights.x).add(s.frameColorB.mul(weights.y)).add(s.frameColorC.mul(weights.z))
      .div(weights.x.add(weights.y).add(weights.z).max(1e-3));

    // Soft light thrown inward across the gap; the image covers the rest.
    const inner = roundedBox(p, half.sub(width), max(s.frameRadius.sub(width), 0));
    const glow = exp(inner.div(s.frameGlowWidth.max(0.5))).mul(step(inner, 0)).mul(s.frameGlow);
    const tint = mix(vec3(1), mask.div(coverage.max(1e-3)), step(1e-3, coverage));
    const color = gradient.mul(tint).mul(s.frameIntensity).add(spark);
    const alpha = clamp(coverage.add(glow.mul(0.6)).add(spark), 0, 1)
      .mul(drawn).mul(smoothstep(0, 0.12, u.frame)).mul(u.opacity);
    return vec4(inverseACESFilmic(color), alpha);
  })();
  return material;
}

/**
 * Frosted glass card in front of the image: a refracting bevel and padding of
 * the image's own blur, clear over the image but for a tint and highlights.
 */
export function createGlassMaterial(u, s, blurMap) {
  const material = cardMaterial();
  material.positionNode = cardPosition(vec2(1, 1), u.bend);
  material.colorNode = Fn(() => {
    const st = uv();
    const size = u.cardSize;
    const half = size.mul(0.5);
    const p = st.sub(0.5).mul(size);
    const radius = s.glassRadius;
    const d = roundedBox(p, half, radius);
    const shape = clamp(float(0.5).sub(d), 0, 1);
    const inner = roundedBox(p, half.sub(s.glassPadding), max(radius.sub(s.glassPadding), 0));
    const clear = clamp(float(0.5).sub(inner), 0, 1);

    const normal = normalize(vec2(
      roundedBox(p.add(vec2(1, 0)), half, radius).sub(d),
      roundedBox(p.add(vec2(0, 1)), half, radius).sub(d),
    ).add(1e-5));
    const depth = clamp(d.negate().div(s.glassBevel.max(1)), 0, 1);
    const slope = float(1).sub(depth).pow(2);
    const refract = normal.mul(slope).mul(s.glassRefraction);
    const aspect = size.x.div(size.y);
    const coverScale = vec2(min(aspect.div(u.aspect), 1), min(u.aspect.div(aspect), 1));
    const frost = offset => {
      const q = p.sub(offset).div(size).mul(coverScale).add(0.5).clamp(0.0001, 0.9999);
      return blurMap.sample(vec2(q.x, float(1).sub(q.y))).level(0).rgb;
    };
    const behind = vec3(
      frost(refract.mul(float(1).add(s.glassDispersion))).x,
      frost(refract).y,
      frost(refract.mul(float(1).sub(s.glassDispersion))).z,
    );

    const grain = hash(screenCoordinate.x.add(screenCoordinate.y.mul(4099))).sub(0.5).mul(0.03);
    const lip = exp(max(inner, 0).div(5).negate()).mul(0.45).mul(float(1).sub(clear));
    const light = dot(normal, vec2(-0.55, 0.83)).mul(0.5).add(0.5);
    const rim = float(1).sub(smoothstep(0, 1.6, d.negate())).mul(s.glassRim).mul(light.mul(0.8).add(0.2));
    const fresnel = slope.pow(1.5).mul(s.glassRim).mul(0.35).mul(light);
    const band = st.x.mul(0.7).add(st.y.mul(0.5)).add(u.shine).sub(0.6).mul(6);
    const sheen = exp(band.mul(band).negate()).mul(s.glassSheen);
    const highlight = rim.add(fresnel).add(sheen).clamp(0, 1);

    const frosted = behind.mul(s.glassFrost).mul(float(1).sub(lip)).add(grain).max(0);
    const color = mix(mix(frosted, vec3(1), highlight), vec3(1), clear);
    const alpha = mix(float(1), s.glassTint.add(highlight), clear).clamp(0, 1).mul(shape).mul(u.opacity);
    return vec4(inverseACESFilmic(color), alpha);
  })();
  return material;
}
