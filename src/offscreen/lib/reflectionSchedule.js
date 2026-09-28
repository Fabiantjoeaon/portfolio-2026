import { store } from "@/offscreen/store";

/**
 * Planar reflections re-render the tile grid. During a transition two scenes
 * reflect at once, so each takes its own frame phase instead of both landing
 * on the same frame. A reflection that fell behind (its scene was hidden)
 * renders immediately so it never shows a stale image.
 *
 * @param {{ last: number }} state - per-reflection bookkeeping
 * @param {number} interval - render every `interval` frames
 * @param {number} phase - frame offset within the interval
 */
export function reflectionDue(state, interval, phase = 0) {
  const frame = store.renderFrame;
  const every = Math.max(1, Math.round(interval));
  const due = (frame + phase) % every === 0 || frame - state.last > every;
  if (due) state.last = frame;
  return due;
}
