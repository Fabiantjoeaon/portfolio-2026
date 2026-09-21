/**
 * Screen Transition Registry (idle shader -> project video)
 *
 * Each transition factory follows the gl-transitions contract and receives:
 *   getFromColor(uvNode) -> vec4   idle screen shader, sampleable at any uv
 *   getToColor(uvNode)   -> vec4   project video (cover-fit), same
 *   progress             -> float  0 = idle shader, 1 = video
 *   ratio                -> float  screen aspect (width / height)
 * and returns a vec4 color node. Swap transitions via the
 * PersistentScene "screenTransition" param.
 */

import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  sin,
  dot,
  fract,
  floor,
  abs,
  mix,
  clamp,
  max,
  pow,
  step,
  smoothstep,
  Fn,
} from "three/tsl";

const hash1 = (n) => fract(sin(float(n)).mul(43758.5453123));
const hash2 = (p) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123));
const sat = (v) => clamp(v, 0.0, 1.0);
const safeUv = (u) => clamp(u, vec2(0.0), vec2(1.0));

// ============================================================================
// STRIP DATAMOSH GLITCH
// TSL port of gl-transitions "StripDatamoshGlitch" (author: bread, MIT):
// https://gl-transitions.com/editor/StripDatamoshGlitch
// Horizontal scan-band tearing, vertical slit drag, chroma splitting and
// broadcast-style noise/strobe that peaks mid-transition.
// ============================================================================
export function createStripDatamoshGlitchTransition(
  { getFromColor, getToColor, progress, ratio },
  {
    strength = 1.0,
    horizontalBars = 42.0,
    verticalSlits = 18.0,
    tear = 0.18,
    chroma = 0.032,
    residue = 0.62,
    noiseAmount = 0.16,
    scanAmount = 0.13,
    flashAmount = 0.2,
  } = {},
) {
  const stripeY = (u, density, seed, minWidth, maxWidth) => {
    const y = u.y.mul(density).add(seed.mul(0.137));
    const id = floor(y);
    const f = fract(y);
    const c = hash2(vec2(id, seed));
    const w = mix(
      float(minWidth),
      float(maxWidth),
      hash2(vec2(id.add(9.17), seed.add(2.31))),
    );
    return smoothstep(w, w.add(0.018), abs(f.sub(c))).oneMinus();
  };

  const stripeX = (u, density, seed, minWidth, maxWidth) => {
    const x = u.x.mul(density).add(seed.mul(0.091));
    const id = floor(x);
    const f = fract(x);
    const c = hash2(vec2(id, seed.add(41.0)));
    const w = mix(
      float(minWidth),
      float(maxWidth),
      hash2(vec2(id.add(4.7), seed.add(8.9))),
    );
    return smoothstep(w, w.add(0.012), abs(f.sub(c))).oneMinus();
  };

  const brokenGate = (u, row, rnd, frame) => {
    const segs = mix(float(1.0), float(9.0), hash2(vec2(row, frame.add(44.0))));
    const seg = floor(u.x.mul(segs));
    return step(0.16, hash2(vec2(seg, row.add(frame.mul(3.0)).add(rnd))));
  };

  const horizontalMask = (u, frame) => {
    const r1 = floor(
      u.y.add(hash1(frame).mul(0.031)).mul(horizontalBars * 0.38),
    );
    const r2 = floor(
      u.y.add(hash1(frame.add(2.0)).mul(0.013)).mul(horizontalBars),
    );
    const r3 = floor(
      u.y.add(hash1(frame.add(7.0)).mul(0.006)).mul(horizontalBars * 3.4),
    );

    const thick = stripeY(u, horizontalBars * 0.38, frame.add(1.0), 0.035, 0.22)
      .mul(step(0.42, hash2(vec2(r1, frame.add(10.0)))))
      .mul(brokenGate(u, r1, hash2(vec2(r1, frame)), frame));
    const mid = stripeY(u, horizontalBars, frame.add(4.0), 0.014, 0.11)
      .mul(step(0.48, hash2(vec2(r2, frame.add(20.0)))))
      .mul(brokenGate(u, r2, hash2(vec2(r2, frame)), frame.add(3.0)));
    const hair = stripeY(u, horizontalBars * 3.4, frame.add(9.0), 0.004, 0.035)
      .mul(step(0.62, hash2(vec2(r3, frame.add(30.0)))));

    return sat(max(thick, max(mid, hair)));
  };

  const verticalMask = (u, frame) => {
    const col = floor(
      u.x.add(hash1(frame.add(12.0)).mul(0.017)).mul(verticalSlits),
    );
    return sat(
      stripeX(u, verticalSlits, frame.add(13.0), 0.01, 0.075).mul(
        step(0.66, hash2(vec2(col, frame.add(19.0)))),
      ),
    );
  };

  const distortUv = (u, dir, b, h, v, frame) => {
    const row = floor(u.y.mul(horizontalBars));
    const col = floor(u.x.mul(verticalSlits));
    const rowRnd = hash2(vec2(row, frame));
    const colRnd = hash2(vec2(col, frame.add(27.0)));

    const xTear = rowRnd
      .sub(0.5)
      .mul(2.0 * tear)
      .mul(b)
      .mul(h)
      .add(sin(u.y.mul(120.0).add(progress.mul(95.0))).mul(0.006).mul(b));
    const yDrag = colRnd.sub(0.5).mul(0.13).mul(b).mul(v);
    const micro = hash2(vec2(row, col.add(frame)))
      .sub(0.5)
      .mul(0.018)
      .mul(b)
      .mul(max(h, v));

    return u.add(vec2(xTear.mul(dir).add(micro), yDrag));
  };

  const chromaFrom = (u, s) => {
    const c = safeUv(u);
    return vec3(
      getFromColor(safeUv(c.add(s))).r,
      getFromColor(c).g,
      getFromColor(safeUv(c.sub(s))).b,
    );
  };

  const chromaTo = (u, s) => {
    const c = safeUv(u);
    return vec3(
      getToColor(safeUv(c.sub(s))).r,
      getToColor(c).g,
      getToColor(safeUv(c.add(s))).b,
    );
  };

  return Fn(() => {
    const uvCoord = uv().toVar();
    const b = pow(max(sin(progress.mul(Math.PI)), 0.0), 0.42)
      .mul(strength)
      .toVar();
    const frame = floor(progress.mul(30.0)).toVar();

    const h = horizontalMask(uvCoord, frame).toVar();
    const v = verticalMask(uvCoord, frame).toVar();
    const glitch = sat(max(h, v.mul(0.75))).toVar();

    const row = floor(uvCoord.y.mul(horizontalBars)).toVar();
    const rowRnd = hash2(vec2(row, frame.add(5.0))).toVar();

    const bandDelay = rowRnd.sub(0.5).mul(0.3).mul(h);
    const reveal = smoothstep(0.18, 0.84, progress.add(bandDelay));

    const split = vec2(
      float(chroma).mul(b).mul(glitch.mul(1.7).add(1.0)),
      float(chroma * 0.22).mul(b).mul(v),
    ).toVar();

    const fromUv = distortUv(uvCoord, 1.0, b, h, v, frame);
    const toUv = distortUv(uvCoord, -1.0, b, h, v, frame);

    const color = mix(
      chromaFrom(fromUv, split),
      chromaTo(toUv, split),
      reveal,
    ).toVar();

    // Horizontal time-slice residue: old/new frames dragged through scan bands
    const smearUv = vec2(
      uvCoord.x.add(rowRnd.sub(0.5).mul(0.46).mul(b).mul(h)),
      uvCoord.y.add(
        hash2(vec2(row, frame.add(31.0))).sub(0.5).mul(0.045).mul(b).mul(h),
      ),
    ).toVar();
    const sliceReveal = smoothstep(
      0.28,
      0.78,
      progress.add(rowRnd.sub(0.5).mul(0.22)),
    );
    const sliceColor = mix(
      chromaFrom(smearUv, split.mul(1.65)),
      chromaTo(
        smearUv.sub(vec2(rowRnd.sub(0.5).mul(0.18).mul(b), 0.0)),
        split.mul(1.65),
      ),
      sliceReveal,
    );
    color.assign(mix(color, sliceColor, h.mul(b).mul(residue)));

    // Thin scan sparks / broken white lines
    const hairLine = stripeY(uvCoord, 190.0, frame.add(55.0), 0.002, 0.012).mul(
      step(0.7, hash2(vec2(floor(uvCoord.y.mul(190.0)), frame.add(56.0)))),
    );
    color.addAssign(vec3(0.72, 0.9, 1.0).mul(hairLine).mul(b).mul(0.28));

    const scan = sin(uvCoord.y.mul(980.0).add(progress.mul(130.0)))
      .mul(0.5)
      .add(0.5);
    color.mulAssign(float(scanAmount).mul(b).mul(scan).oneMinus());

    const nCell = floor(uvCoord.mul(vec2(ratio.mul(360.0), float(210.0))));
    const n = hash2(nCell.add(vec2(frame.mul(7.0), frame.mul(13.0))));
    color.addAssign(
      vec3(n.sub(0.5).mul(noiseAmount).mul(b).mul(glitch.add(0.55))),
    );

    // Slight desaturation during the damage peak
    const luma = dot(color, vec3(0.299, 0.587, 0.114));
    color.assign(mix(color, vec3(luma), b.mul(glitch).mul(0.18)));

    const strobe = step(0.78, hash2(vec2(frame, 3.14))).mul(pow(b, 1.65));
    color.addAssign(vec3(strobe.mul(flashAmount)));

    return vec4(clamp(color, vec3(0.0), vec3(1.0)), float(1.0));
  })();
}

// ============================================================================
// NOISE WIPE
// The original screen transition (port of the old portfolio's Screen shader):
// a smoothstep keyed off the idle shader's own red/green channels wipes the
// video in organically.
// ============================================================================
export function createNoiseWipeTransition({ getFromColor, getToColor, progress }) {
  return Fn(() => {
    const uvCoord = uv();
    const idle = getFromColor(uvCoord).toVar();

    const e0 = max(idle.r.sub(0.7), 0.0);
    const e1 = max(idle.g, e0.add(0.001));
    const tr = smoothstep(e0, e1, progress);

    return mix(vec4(idle.rgb, float(1.0)), getToColor(uvCoord), tr);
  })();
}

// ============================================================================
// TRANSITION REGISTRY
// ============================================================================
export const SCREEN_TRANSITIONS = {
  "strip-datamosh": createStripDatamoshGlitchTransition,
  "noise-wipe": createNoiseWipeTransition,
};

export function getAvailableTransitions() {
  return Object.keys(SCREEN_TRANSITIONS);
}
