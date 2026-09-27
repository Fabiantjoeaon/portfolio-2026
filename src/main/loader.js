import { isMobileOrTablet } from '@/shared/devices';
import { gsap } from 'gsap';
import { initLoader as initLegacyLoader } from './legacyLoader';
import '@/offscreen/lib/customEases';
import './styles/loader.css';

export function initLoader(dispatcher, { skipLoader = false } = {}) {
  if (skipLoader) { initLegacyLoader(dispatcher); return { connect() {} }; }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dom = document.createElement('div');
  dom.id = 'loader-overlay';
  dom.className = 'entry-loader';
  dom.setAttribute('aria-label', 'Loading portfolio');
  dom.innerHTML = `<div class="loader-row">
    <div class="loader-mask loader-name"><span>Fabian Tjoe-A-On</span></div>
    <div class="loader-mask loader-count" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span>0</span></div>
    <div class="loader-mask loader-role"><span>Creative Developer</span></div>
  </div><div class="loader-enter-mask" hidden>
    <p class="loader-description">An audiovisual experience<br>with generative audio.</p>
    <div class="loader-choices"><button class="loader-enter" data-sound="true" type="button" disabled>Enter with sound <span>↗</span></button>
    <button class="loader-enter" data-sound="false" type="button" disabled>Enter without sound <span>↗</span></button></div>
  </div>${isMobileOrTablet() || matchMedia('(pointer: coarse)').matches ? '<p class="loader-desktop-note">For the full experience,<br>best viewed on desktop.</p>' : ''}`;
  document.body.classList.add('is-loading');
  document.body.appendChild(dom);
  const app = document.querySelector('#app');
  if (app) app.inert = true;
  const number = dom.querySelector('.loader-count span');
  const counter = number.parentElement;
  const items = dom.querySelectorAll('.loader-mask > span');
  const buttons = [...dom.querySelectorAll('button')];
  const entry = dom.querySelector('.loader-enter-mask');
  let api, unlockMedia, compiled = false, completing = false, entering = false;
  let target = 0, shown = 0, lastNumber = -1, lastTime = performance.now();
  const duration = value => reducedMotion ? 0 : value;
  const incoming = gsap.fromTo(items, { yPercent: 110 }, {
    yPercent: 0, duration: duration(0.9), stagger: reducedMotion ? 0 : 0.1, ease: 'pageEase',
  });
  const progress = async data => {
    const value = Number(await data.progress);
    if (Number.isFinite(value)) target = Math.max(target, Math.min(95, value * 0.95));
  };
  const complete = async () => {
    if (completing || !compiled || !api || shown < 99.95) return;
    completing = true;
    gsap.ticker.remove(tick);
    number.textContent = '100';
    counter.setAttribute('aria-valuenow', '100');
    await incoming;
    await gsap.to(items, { yPercent: -115, duration: duration(0.75),
      delay: duration(0.25), stagger: reducedMotion ? 0 : 0.14, ease: 'pageEase' });
    dom.querySelector('.loader-row').hidden = true;
    entry.hidden = false;
    buttons.forEach(button => { button.disabled = false; });
    await gsap.fromTo(entry.children, { yPercent: 115, opacity: 0 }, {
      yPercent: 0, opacity: 1, duration: duration(0.85), ease: 'pageEase',
    });
  };
  const tick = () => {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    shown += (target - shown) * (1 - Math.exp(-dt * 5));
    const value = Math.floor(shown);
    if (value !== lastNumber) {
      lastNumber = value;
      number.textContent = String(value);
      counter.setAttribute('aria-valuenow', String(value));
    }
    complete();
  };
  const ready = () => { compiled = true; target = 100; };
  dispatcher.on('loadProgress', progress);
  dispatcher.on('compileEnd', ready);
  gsap.ticker.add(tick);
  buttons.forEach(button => button.addEventListener('click', async () => {
    if (entering || button.disabled) return;
    entering = true;
    buttons.forEach(choice => { choice.disabled = true; });
    // Keep these calls inside the trusted gesture, before any await.
    window.audio?.setMuted(button.dataset.sound !== 'true');
    window.audio?.start().catch(console.warn);
    unlockMedia?.();
    await gsap.to(entry.children, { yPercent: -115, opacity: 0, duration: duration(0.55), ease: 'pageEase' });
    dispatcher.off('loadProgress', progress);
    dispatcher.off('compileEnd', ready);
    dom.remove();
    document.body.classList.remove('is-loading');
    if (app) app.inert = false;
    api.trigger({ name: 'enterSite' }, { immediate: reducedMotion });
    dispatcher.trigger({ name: 'siteEntered', fireAtStart: true });
  }));
  return { connect(nextApi, unlock) { api = nextApi; unlockMedia = unlock; } };
}
