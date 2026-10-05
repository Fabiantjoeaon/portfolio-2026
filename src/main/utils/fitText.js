// Shrinks `el` from its CSS font size until its right edge stays inside `box`.
// Glyph widths aren't quite linear at small sizes, so the scale is refined a few passes.
export default function fitText(el, box, passes = 3) {
  el.style.removeProperty("font-size");
  const { left, right } = el.getBoundingClientRect();
  const target = box.getBoundingClientRect().right - left;
  if (right - left <= target) return;
  let size = parseFloat(getComputedStyle(el).fontSize);
  for (let i = 0; i < passes; i++) {
    const width = el.getBoundingClientRect().width;
    if (Math.abs(width - target) < 0.5 && width <= target) break;
    size = Math.floor(size * target / width * 100) / 100;
    el.style.fontSize = `${size}px`;
  }
  if (el.getBoundingClientRect().width > target) el.style.fontSize = `${size - 0.05}px`;
}
