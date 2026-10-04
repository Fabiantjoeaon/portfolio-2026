import * as THREE from 'three/webgpu';
import {
  Fn, uv, vec2, vec3, vec4, float, floor, fract, mix, min, max, abs, clamp, length, dot, normalize, sign,
  smoothstep, step, hash, screenCoordinate, screenUV, screenSize, positionLocal, positionViewDirection,
  attribute, transformNormalToView, cos, sin, atan, exp, fwidth,
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

/**
 * The image itself on the glass's back face: cover/contain fit and rounded
 * corners. Contained images leave their margins clear for the glass.
 */
export function createMediaMaterial(u, map) {
  const material = cardMaterial();
  material.positionNode = cardPosition(u.inset, u.bend);
  material.colorNode = Fn(() => {
    const centered = uv().sub(0.5);
    const coords = centered.mul(float(1).sub(dot(centered, centered).mul(4).mul(u.lens))).mul(u.zoom)
      .add(0.5).add(vec2(u.parallax, 0));
    // Images that cover would crop past `fillBelow` are shown whole;
    // easing between the two avoids a pop.
    const visible = min(u.frameAspect.div(u.aspect), u.aspect.div(u.frameAspect));
    const fill = u.portrait.mul(mix(smoothstep(u.fillBelow.add(0.05), u.fillBelow.sub(0.1), visible), float(1), u.contain));
    const coverScale = vec2(min(u.frameAspect.div(u.aspect), 1), min(u.aspect.div(u.frameAspect), 1));
    const containScale = vec2(max(u.frameAspect.div(u.aspect), 1), max(u.aspect.div(u.frameAspect), 1));
    const fit = coords.sub(0.5).mul(mix(coverScale, containScale, fill)).add(0.5);
    const fitted = fit.clamp(0.0001, 0.9999);
    const sampled = map.sample(vec2(fitted.x, float(1).sub(fitted.y))).rgb;
    const edge = min(fit, float(1).sub(fit)).div(fwidth(fit).max(1e-5));
    const shown = mix(1, clamp(min(edge.x, edge.y).add(0.5), 0, 1), step(1e-4, fill));
    const color = inverseACESFilmic(sampled.mul(u.brightness));
    const corner = clamp(float(0.5).sub(roundedBox(centered.mul(u.size), u.size.mul(0.5), u.radius)), 0, 1);
    return vec4(color, u.opacity.mul(corner).mul(shown));
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

// Fraction of the perimeter the drawn border fades over, at both ends.
const DRAW_FEATHER = 0.08;

/**
 * The glitchy gradient ring around a card. `frame` draws it clockwise from
 * the top-left corner; `p`, `half` and `width` are in pixels.
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
  // The head overshoots both ends so a nearly full ring already closes; the
  // start fades in too, until the head comes round to meet it.
  const head = frame.mul(1 + 2 * DRAW_FEATHER).sub(DRAW_FEATHER);
  const tail = mix(smoothstep(0, DRAW_FEATHER, along), float(1), smoothstep(0.85, 1, frame));
  const drawn = float(1).sub(smoothstep(head.sub(DRAW_FEATHER), head, along)).mul(tail);
  const spark = exp(abs(along.sub(head.sub(DRAW_FEATHER / 2))).mul(-60)).mul(drawing).mul(coverage);

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
 * The slab itself: the scene behind it, refracted through the bevel and
 * frosted. Drawn first; the image sits on its back face, and wherever a
 * contained image leaves its margins clear, the same frost shows through.
 * `blurMap`, when given, is the image's blur, tinting the glass its colors.
 */
export function createGlassMaterial(u, s, backdrop, blurMap, time) {
  return glassMaterial(u, s, ({ p, n, view, half }) => {
    const pixel = vec2(1).div(screenSize);
    const bevel = float(1).sub(n.z.abs()).pow(0.5);
    const bend = view.xy.mul(s.glassRefraction).mul(bevel.mul(0.7).add(0.3));
    const offset = bend.mul(vec2(-1, 1)).mul(pixel);
    const base = screenUV.add(offset);
    const frost = s.glassFrostRadius.mul(pixel);
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
    let frosted = blurred.add(spread).mul(s.glassFrost).max(0).mul(float(1).sub(side));
    if (blurMap) {
      const aspect = u.cardSize.x.div(u.cardSize.y);
      const coverScale = vec2(min(aspect.div(u.aspect), 1), min(u.aspect.div(aspect), 1));
      const st = p.xy.div(u.cardSize).mul(coverScale).add(0.5).clamp(0.001, 0.999);
      const glow = blurMap.sample(vec2(st.x, float(1).sub(st.y))).level(0).rgb;
      // The blur's hue at constant brightness colors the frost; its light adds a glow.
      const hue = glow.div(dot(glow, vec3(0.2126, 0.7152, 0.0722)).max(0.02)).min(4);
      frosted = mix(frosted, frosted.mul(hue), s.glassImageTintAmount.mul(u.tint))
        .add(inverseACESFilmic(glow).mul(s.glassImageTintGlow).mul(u.tint).mul(u.brightness));
    }

    const tint = inverseACESFilmic(vec3(s.glassTint));
    const reveal = revealMask(p, half, u, s, time);
    const color = frosted.add(tint).add(grain)
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
