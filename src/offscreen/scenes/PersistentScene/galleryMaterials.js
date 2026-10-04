import * as THREE from 'three/webgpu';
import {
  Fn, If, uv, vec2, vec3, vec4, float, floor, fract, mix, min, max, abs, clamp, length, dot, normalize, sign,
  smoothstep, step, hash, screenCoordinate, screenUV, screenSize, positionLocal, positionViewDirection,
  attribute, transformNormalToView, cos, sin, atan, exp,
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

/** The border's cyclic three-color gradient at `flow` (one cycle per unit). */
const gradientAt = (flow, s) => {
  const phase = cos(vec3(flow.mul(TAU)).sub(vec3(0, TAU / 3, TAU * 2 / 3))).mul(0.5).add(0.5);
  const weights = phase.mul(phase);
  return s.frameColorA.mul(weights.x).add(s.frameColorB.mul(weights.y)).add(s.frameColorC.mul(weights.z))
    .div(weights.x.add(weights.y).add(weights.z).max(1e-3));
};

/**
 * The glitchy gradient ring both styles draw around a card. `frame` draws it
 * clockwise from the top-left corner; `p`, `half` and `width` are in pixels.
 */
const frameRing = (p, half, radius, width, frame, seed, s, time) => {
  const tick = floor(time.mul(s.frameGlitchRate));
  // Rare bursts at rest, constant while the border draws on or off.
  const burst = step(0.86, hash(tick.add(seed)));
  const drawing = frame.mul(float(1).sub(frame)).mul(4);
  const glitch = s.frameGlitch.mul(max(burst, drawing));
  const band = floor(p.y.div(half.y.mul(2)).add(0.5).mul(32));
  const torn = step(0.7, hash(band.mul(3.7).add(tick).add(seed)));
  const jitter = hash(band.add(tick.mul(7.13)).add(seed)).sub(0.5).mul(glitch).mul(torn).mul(width.mul(8).add(6));
  const q = p.add(vec2(jitter, 0));
  const ringHalf = half.sub(width.mul(0.5));
  const ring = o => clamp(width.mul(0.5).sub(abs(roundedBox(o, ringHalf, radius))).add(0.5), 0, 1);
  const split = vec2(glitch.mul(2.5).add(s.frameAberration), 0);
  const mask = vec3(ring(q.add(split)), ring(q), ring(q.sub(split)));
  const coverage = max(mask.x, max(mask.y, mask.z));

  const turn = atan(q.y.div(half.y), q.x.div(half.x)).div(TAU).add(0.5);
  const along = fract(float(0.875).sub(turn));
  const head = frame.mul(1.1);
  const drawn = float(1).sub(smoothstep(head.sub(0.1), head, along));
  const spark = exp(abs(along.sub(head.sub(0.05))).mul(-60)).mul(drawing).mul(coverage);

  const st = p.div(half.mul(2));
  const flow = along.add(time.mul(s.frameSpeed)).add(sin(st.x.mul(5).add(st.y.mul(3)).add(time.mul(0.7))).mul(0.06));
  const gradient = gradientAt(flow, s);
  const tint = mix(vec3(1), mask.div(coverage.max(1e-3)), step(1e-3, coverage));
  return {
    color: gradient.mul(tint).mul(s.frameIntensity).add(spark),
    gradient,
    coverage,
    spark,
    distance: abs(roundedBox(q, ringHalf, radius)).sub(width.mul(0.5)).max(0),
    visible: drawn.mul(smoothstep(0, 0.12, frame)),
  };
};

/**
 * Glitchy animated gradient border at the card's outer edge. `u.frame` draws
 * it while the image shrinks inside it.
 */
export function createFrameMaterial(u, s, time) {
  const material = cardMaterial();
  material.positionNode = cardPosition(vec2(1, 1), u.bend);
  material.colorNode = Fn(() => {
    const half = u.cardSize.mul(0.5);
    const p = uv().sub(0.5).mul(u.cardSize);
    const ring = frameRing(p, half, s.frameRadius, s.frameWidth, u.frame, u.seed.mul(91.7), s, time);
    // Soft light thrown inward across the gap; the image covers the rest.
    const inner = roundedBox(p, half.sub(s.frameWidth), max(s.frameRadius.sub(s.frameWidth), 0));
    const glow = exp(inner.div(s.frameGlowWidth.max(0.5))).mul(step(inner, 0)).mul(s.frameGlow);
    const alpha = clamp(ring.coverage.add(glow.mul(0.6)).add(ring.spark), 0, 1).mul(ring.visible).mul(u.opacity);
    return vec4(inverseACESFilmic(ring.color), alpha);
  })();
  return material;
}

// The shared slab geometry is a unit RoundedBoxGeometry with this radius.
export const SLAB_RADIUS = 0.25;

/**
 * Reshape the unit rounded box into a `cardSize` x `u.depth` pixel slab with
 * true pixel corner radii. Returns its pixel position and normal.
 */
const slab = (u, s) => {
  const normal = attribute('normal', 'vec3');
  const corner = sign(attribute('position', 'vec3').sub(normal.mul(SLAB_RADIUS)));
  const half = vec3(u.cardSize.mul(0.5), u.depth.mul(0.5).max(0.01));
  const radius = min(s.glassRadius, min(half.z, min(half.x, half.y)));
  const px = corner.mul(half.sub(radius)).add(normal.mul(radius));
  return { px, normal, radius };
};

/**
 * Digital reveal of the glass: pixel cells switch on from the image outward,
 * flickering at the front while slices of the card slip sideways.
 * `edge` is the flickering front, for a glow.
 */
const revealMask = (p, half, u, s, time) => {
  const reveal = u.reveal;
  const seed = u.seed.mul(37.3);
  const cell = s.glassRevealCell.max(1);
  const tick = floor(time.mul(30));
  const active = reveal.mul(float(1).sub(reveal)).mul(4);
  const band = floor(p.y.div(cell.mul(2)));
  const torn = step(0.72, hash(band.mul(1.7).add(tick).add(seed)));
  const slip = hash(band.add(tick.mul(3.1)).add(seed)).sub(0.5).mul(torn).mul(active).mul(cell.mul(6));
  const q = p.xy.add(vec2(slip, 0));
  const id = floor(q.div(cell));
  const noise = hash(id.x.add(id.y.mul(57.1)).add(seed));
  const outward = clamp(roundedBox(q, half.sub(s.glassPadding), 0).div(s.glassPadding.max(1)), 0, 1);
  const order = mix(noise, outward, 0.6);
  const front = reveal.mul(1.3).sub(0.15);
  const lit = step(order, front.sub(0.12));
  const edge = step(order, front).sub(lit);
  const flicker = step(0.45, hash(id.x.mul(3.3).add(id.y.mul(1.9)).add(tick.mul(0.73)).add(seed)));
  return {
    mask: max(lit, edge.mul(flicker)),
    edge: edge.mul(flicker),
    glow: gradientAt(noise.add(time.mul(s.frameSpeed)), s),
  };
};

/**
 * Both glass passes share the slab. Group-local space is pixels on z and
 * card fractions on x and y, so the group's scale keeps the slab undistorted.
 */
const glassMaterial = (u, s, shade) => {
  const material = cardMaterial();
  const { px, normal, radius } = slab(u, s);
  material.positionNode = Fn(() => {
    const local = px.div(vec3(u.cardSize, 1));
    return vec3(local.x.add(cos(local.y.mul(Math.PI)).mul(u.bend)), local.y, local.z);
  })();
  const p = px.toVarying('v_slabPx');
  const n = normal.toVarying('v_slabNormal').normalize();
  const view = transformNormalToView(n.mul(vec3(u.cardSize, 1))).normalize();
  material.colorNode = Fn(() => {
    const half = u.cardSize.mul(0.5);
    return shade({
      p, n, view, half, radius,
      facing: abs(dot(view, positionViewDirection)).clamp(0, 1),
      window: roundedBox(p.xy, half.sub(u.padding), max(radius.sub(u.padding), 0)),
    });
  })();
  return material;
};

/**
 * The slab itself: the scene behind it and the image's own blur, refracted
 * through the bevel and frosted in the padding. Drawn first; the image sits
 * on its back face, so any gap around it shows the blur, never the scene.
 */
export function createGlassMaterial(u, s, backdrop, blurMap, time) {
  return glassMaterial(u, s, ({ p, n, view, half, window }) => {
    const clear = clamp(float(0.5).sub(window), 0, 1);
    const pixel = vec2(1).div(screenSize);
    const bevel = float(1).sub(n.z.abs()).pow(0.5);
    const bend = view.xy.mul(s.glassRefraction).mul(bevel.mul(0.7).add(0.3));
    const offset = bend.mul(vec2(-1, 1)).mul(pixel);
    const base = screenUV.add(offset);
    const frost = s.glassFrostRadius.mul(float(1).sub(clear.mul(0.75))).mul(pixel);
    const tap = (x, y) => backdrop.sample(base.add(frost.mul(vec2(x, y))).clamp(0.001, 0.999)).level(0).rgb;
    const blurred = tap(0, 0).add(tap(1, 0)).add(tap(-1, 0)).add(tap(0.5, 0.87)).add(tap(-0.5, 0.87))
      .add(tap(0.5, -0.87)).add(tap(-0.5, -0.87)).div(7);
    const shift = offset.mul(s.glassDispersion).add(pixel.mul(s.glassDispersion.mul(2)));
    const center = tap(0, 0);
    const spread = vec3(
      backdrop.sample(base.add(shift).clamp(0.001, 0.999)).level(0).r.sub(center.r),
      0,
      backdrop.sample(base.sub(shift).clamp(0.001, 0.999)).level(0).b.sub(center.b),
    );
    const grain = hash(screenCoordinate.x.add(screenCoordinate.y.mul(4099))).sub(0.5).mul(0.02);
    const side = bevel.mul(0.35);
    const behind = blurred.add(spread).mul(s.glassFrost).max(0);

    // The image's blur stretched over the whole card, so its colors run on
    // into the padding past the image's edges.
    const size = u.cardSize;
    const aspect = size.x.div(size.y);
    const coverScale = vec2(min(aspect.div(u.aspect), 1), min(u.aspect.div(aspect), 1));
    const st = p.xy.add(bend).div(size).mul(coverScale).add(0.5).clamp(0.001, 0.999);
    const glow = blurMap.sample(vec2(st.x, float(1).sub(st.y))).level(0).rgb;
    const own = inverseACESFilmic(glow.mul(s.glassImageBrightness)).mul(u.brightness);
    const frosted = mix(behind, own, s.glassImageBlur).mul(float(1).sub(side));

    const tint = inverseACESFilmic(vec3(s.glassTint));
    const reveal = revealMask(p, half, u, s, time);
    const color = frosted.add(tint.mul(float(1).sub(clear.mul(0.6)))).add(grain)
      .add(reveal.glow.mul(reveal.edge).mul(s.glassRevealGlow));
    return vec4(color, reveal.mask.mul(u.opacity));
  });
}

/**
 * The slab's front surface, over the image: specular light, sheen, an inner
 * shadow where the image meets the padding, and the gradient border, whose
 * colors also tint the fresnel and the bevel. It only adds light, so the
 * image keeps its colors.
 */
export function createGlassSurfaceMaterial(u, s, time) {
  return glassMaterial(u, s, ({ p, n, view, half, radius, facing, window }) => {
    const front = smoothstep(0.6, 0.95, n.z);
    const shadow = exp(window.div(s.glassShadowWidth.max(0.5))).mul(step(window, 0)).mul(s.glassShadow).mul(front);
    const lit = normalize(vec3(-0.45, 0.75, 0.6));
    const specular = max(dot(view, normalize(lit.add(positionViewDirection))), 0).pow(40).mul(s.glassSpecular);
    const st = p.xy.div(half.mul(2));
    const band = st.x.mul(0.7).add(st.y.mul(0.5)).add(u.shine).mul(6);
    const sheen = exp(band.mul(band).negate()).mul(s.glassSheen).mul(front);

    const outline = half.sub(s.glassBorderInset);
    const ring = frameRing(p.xy, outline, max(radius.sub(s.glassBorderInset), 0), s.glassBorderWidth,
      u.frame, u.seed.mul(91.7), s, time);
    const drawn = ring.visible;
    const border = clamp(ring.coverage.add(ring.spark), 0, 1).mul(drawn).mul(s.glassBorder);
    const halo = exp(ring.distance.div(s.glassBorderGlowWidth.max(0.5)).negate()).mul(drawn).mul(s.glassBorderGlow);
    const rim = float(1).sub(facing).pow(3).mul(s.glassRim).add(float(1).sub(front).mul(s.glassBorderFresnel).mul(drawn));
    const tinted = mix(vec3(1), ring.gradient, s.glassBorderFresnel.clamp(0, 1));
    const white = clamp(specular.add(sheen), 0, 1);
    const colored = clamp(rim.add(halo), 0, 1);

    const reveal = revealMask(p, half, u, s, time);
    const alpha = clamp(white.add(colored).add(border).add(shadow), 0, 1);
    // Light stays linear: blended in HDR, an inverse tone mapped white would blow out the image.
    const color = vec3(white).add(tinted.mul(colored)).add(inverseACESFilmic(ring.color).mul(border))
      .div(alpha.max(1e-3));
    return vec4(color, alpha.mul(reveal.mask).mul(u.opacity));
  });
}
