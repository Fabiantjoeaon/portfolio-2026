import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { mainTimings as timings } from '@/shared/timings';

gsap.registerPlugin(ScrollTrigger);

const SCROLL_STAGGER = 0.07;
const SECTIONS = '.footer-bar, .page-section, .project-stills, .page-footer';

export const sectionHead = ({ id, index, label, detail }) => `
  <header class="section-head">
    <i class="section-rule" aria-hidden="true"></i>
    <span class="section-index" data-mono aria-hidden="true">${index}</span>
    <div class="section-title">
      <h2 id="${id}" data-mono aria-label="${label}">${label}</h2>
      ${detail ? `<span class="section-detail" data-mono aria-hidden="true">${detail}</span>` : ''}
    </div>
  </header>`;

/** Top-left to bottom-right: ordered along the diagonal of each element's corner. */
export function diagonalOrder(elements) {
  return elements
    .map(element => {
      const rect = element.getBoundingClientRect();
      return { element, key: rect.left + rect.top };
    })
    .sort((a, b) => a.key - b.key)
    .map(({ element }) => element);
}

/**
 * Scroll reveals per section. Items entering together play one after another
 * along the diagonal; `reveals` maps each element to `delay => play`.
 * Section hairlines are included and draw in from the left.
 */
export function revealSections(root, reveals, reducedMotion) {
  for (const rule of root.querySelectorAll('.section-rule')) {
    reveals.set(rule, delay => gsap.to(rule, {
      scaleX: 1, delay: reducedMotion ? 0 : delay,
      duration: reducedMotion ? 0 : timings.text.projectIn, ease: timings.text.heroEase,
    }));
  }
  const groups = new Map();
  for (const element of reveals.keys()) {
    const section = element.closest(SECTIONS) ?? root;
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(element);
  }
  return [...groups].flatMap(([section, elements]) => ScrollTrigger.batch(elements, {
    // The footer bar sits at the very end of the page and may never reach 92%.
    start: section.matches('.footer-bar') ? 'top bottom' : 'top 92%',
    once: true,
    onEnter: batch => diagonalOrder(batch).forEach((element, index) => reveals.get(element)(index * SCROLL_STAGGER)),
  }));
}
