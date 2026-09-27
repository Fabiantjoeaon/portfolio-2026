// Spend some of the pixels saved at low DPR on cleaner ray integration.
// Keep authored quality as a floor and avoid unbounded work at tiny DPRs.
export function fogSamples(steps, pixelRatio) {
  const base = Math.max(8, Math.min(64, Math.round(steps)));
  const boost = Math.max(0, Math.min(1, (1.5 - pixelRatio) / 0.5));
  return Math.round(base + (Math.max(base, 32) - base) * boost);
}
