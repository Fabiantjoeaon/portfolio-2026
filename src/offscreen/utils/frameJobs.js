// One-off heavy work, such as texture uploads, run between frames: at most one
// job right after each frame, so uploads never land mid-frame (frames await
// their components) or pile into the same frame. A timer covers stretches
// without frames, e.g. a hidden tab.
const FALLBACK_MS = 250;
const jobs = [];
let lastRun = 0;
let fallback = null;

function runNext() {
  const { job, resolve, reject } = jobs.shift();
  lastRun = performance.now();
  if (!jobs.length) {
    clearInterval(fallback);
    fallback = null;
  }
  try {
    resolve(job());
  } catch (error) {
    reject(error);
  }
}

/** Runs `job` after the next frame; resolves with its result. */
export function afterFrame(job) {
  return new Promise((resolve, reject) => {
    if (!jobs.length) {
      lastRun = performance.now();
      fallback = setInterval(() => {
        if (performance.now() - lastRun > FALLBACK_MS) runNext();
      }, FALLBACK_MS);
    }
    jobs.push({ job, resolve, reject });
  });
}

/** Called by the render loop once a frame's work is submitted. */
export function runFrameJob() {
  if (jobs.length) runNext();
}
