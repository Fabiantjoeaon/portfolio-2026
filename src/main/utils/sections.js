import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { timings } from '@/shared/timings';

gsap.registerPlugin(ScrollTrigger);

export const sectionHead = ({ id, index, label, detail }) => `
  <header class="section-head">
    <i class="section-rule" aria-hidden="true"></i>
    <span class="section-index" data-mono aria-hidden="true">${index}</span>
    <div class="section-title">
      <h2 id="${id}" data-mono aria-label="${label}">${label}</h2>
      ${detail ? `<span class="section-detail" data-mono aria-hidden="true">${detail}</span>` : ''}
    </div>
  </header>`;

/** Hairlines draw in from the left as they scroll into view. */
export function revealRules(root, reducedMotion) {
  return [...root.querySelectorAll('.section-rule')].map(rule => ScrollTrigger.create({
    trigger: rule,
    start: 'top 92%',
    once: true,
    onEnter: () => gsap.to(rule, { scaleX: 1, duration: reducedMotion ? 0 : timings.text.projectIn, ease: timings.text.heroEase }),
  }));
}
