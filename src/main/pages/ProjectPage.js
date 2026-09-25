import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import PageScroll from '@/main/utils/PageScroll';
import SplitTextAnimation from '@/main/utils/SplitTextAnimation';
import { formatMonoLabels } from '@/main/utils/monoLabels';
import { projectLayout } from '@/shared/projectLayout';
import { PROJECTS } from '@/shared/projects';
import { CUSTOM_EASE } from '@/offscreen/lib/customEases';

gsap.registerPlugin(ScrollTrigger);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => String(value).padStart(2, '0');

export default class ProjectPage {
  constructor(api, project, dispatcher, navigate) {
    this.api = api;
    this.project = project;
    this.dispatcher = dispatcher;
    this.splits = [];
    this.triggers = [];
    this.rules = [];
    this.events = new AbortController();
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.element = document.createElement('main');
    this.element.className = 'project-page';
    this.element.style.visibility = 'hidden';
    const next = PROJECTS[(PROJECTS.indexOf(project) + 1) % PROJECTS.length];
    const stills = project.media.filter(media => media.type === 'image');
    this.element.innerHTML = `
      <section class="project-hero" aria-labelledby="project-title">
        <h1 id="project-title" class="project-title" data-reveal>${escape(project.name)}</h1>
        <div class="project-gallery" role="region" aria-roledescription="carousel" aria-label="${escape(project.name)} gallery" tabindex="0">
          <button class="project-preview project-preview-prev" type="button" aria-label="Previous image" data-step="-1"></button>
          <div class="project-media-frame" role="img" aria-label="${escape(project.media[0].alt)}"></div>
          <button class="project-preview project-preview-next" type="button" aria-label="Next image" data-step="1"></button>
        </div>
        <div class="project-hero-caption">
          <dl class="project-metadata">
            ${[['Client', project.client], ['Agency', project.agency], ['Year', project.year]].map(([label, value]) => `<div><dt data-mono data-reveal>${label}</dt><dd data-reveal>${escape(value)}</dd></div>`).join('')}
          </dl>
          <div class="project-pagination" aria-label="Choose a slide">
            ${project.media.map((media, index) => `<button type="button" data-index="${index}" data-mono aria-label="Show slide ${index + 1}: ${escape(media.alt)}" ${index === 0 ? 'aria-current="true"' : ''}>${number(index + 1)}</button>`).join('')}
            <span class="project-media-type" data-mono>${project.media[0].type === 'video' ? 'Film' : 'Still'}</span>
          </div>
          <p class="sr-only project-slide-status" aria-live="polite" aria-atomic="true"></p>
        </div>
      </section>
      <div class="project-details">
        <section class="about-section" aria-labelledby="project-overview">
          <div class="section-rule" aria-hidden="true"></div>
          <h2 class="section-label" id="project-overview"><span class="section-index">01</span><span data-reveal>Overview</span></h2>
          <p class="section-copy" data-reveal>${escape(project.description)}</p>
        </section>
        <section class="about-section" aria-labelledby="project-contribution">
          <div class="section-rule" aria-hidden="true"></div>
          <h2 class="section-label" id="project-contribution"><span class="section-index">02</span><span data-reveal>Contribution</span></h2>
          <div class="project-contribution"><p class="section-copy" data-reveal>${escape(project.role)}</p><p class="project-body-copy" data-reveal>${escape(project.approach)}</p></div>
        </section>
        <div class="project-stills">
          ${stills.slice(0, 2).map((media, index) => `<figure><img src="/${escape(media.src)}" alt="${escape(media.alt)}" loading="lazy" width="1280" height="720"><figcaption data-mono data-reveal>Detail ${number(index + 1)}</figcaption></figure>`).join('')}
        </div>
        <footer class="project-footer">
          <div class="section-rule" aria-hidden="true"></div>
          <a href="/" data-mono>All projects</a>
          <a class="project-next" href="/project/${next.slug}"><span data-mono>Next project</span><span data-reveal>${escape(next.name)}</span></a>
        </footer>
      </div>`;
    formatMonoLabels(this.element);
    document.querySelector('#app').appendChild(this.element);
    document.body.classList.add('is-project');
    this.resize = this.resize.bind(this);
    this.resize();
    this.scroll = new PageScroll(api);
    window.addEventListener('resize', this.resize, { signal: this.events.signal });
    this.gallery = this.element.querySelector('.project-gallery');
    this.onSlide = async data => {
      const slug = await data.slug;
      const index = await data.index;
      const busy = await data.busy;
      if (this.destroyed || slug !== project.slug) return;
      this.gallery.setAttribute('aria-busy', String(busy));
      if (busy) return;
      for (const button of this.element.querySelectorAll('[data-index]')) {
        if (Number(button.dataset.index) === index) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      }
      const media = project.media[index];
      this.element.querySelector('.project-media-frame').setAttribute('aria-label', media.alt);
      this.element.querySelector('.project-media-type').textContent = media.type === 'video' ? '[ FILM ]' : '[ STILL ]';
      this.element.querySelector('.project-slide-status').textContent = `Slide ${index + 1} of ${project.media.length}. ${media.alt}`;
    };
    dispatcher.on('projectSlideChanged', this.onSlide);
    this.element.addEventListener('click', event => {
      if (this.leaving || this.suppressClickUntil > performance.now()) return;
      const target = event.target.closest('button, a');
      if (!target) return;
      if (target.matches('[data-step]')) this.change({ step: Number(target.dataset.step) });
      if (target.matches('[data-index]')) this.change({ index: Number(target.dataset.index) });
      if (target.tagName === 'A' && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        navigate(target.getAttribute('href'));
      }
    }, { signal: this.events.signal });
    this.gallery.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') this.change({ index: 0 });
      else if (event.key === 'End') this.change({ index: project.media.length - 1 });
      else this.change({ step: event.key === 'ArrowRight' ? 1 : -1 });
    }, { signal: this.events.signal });
    this.gallery.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      event.target.setPointerCapture(event.pointerId);
    }, { signal: this.events.signal });
    this.gallery.addEventListener('pointerup', event => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      this.pointer = null;
      if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        this.suppressClickUntil = performance.now() + 350;
        this.change({ step: dx < 0 ? 1 : -1 });
      }
    }, { signal: this.events.signal });
    this.gallery.addEventListener('pointercancel', () => { this.pointer = null; }, { signal: this.events.signal });
    api.trigger({ name: 'projectGallery' }, { slug: project.slug, activate: true });
    this.ready = this.initAnimations();
  }

  change(request) {
    if (this.leaving) return;
    this.api.trigger({ name: 'projectGallery' }, { slug: this.project.slug, ...request, immediate: this.reducedMotion });
  }

  resize() {
    const layout = projectLayout(window.innerWidth, window.innerHeight);
    for (const key of ['heroHeight', 'mediaWidth', 'mediaHeight', 'gap', 'top', 'left']) {
      this.element.style.setProperty(`--project-${key}`, `${layout[key]}px`);
    }
    this.scroll?.resize();
  }

  async initAnimations() {
    await document.fonts.ready;
    if (this.destroyed || this.leaving) return;
    for (const element of this.element.querySelectorAll('[data-reveal]')) {
      const split = new SplitTextAnimation(element);
      this.splits.push(split);
      if (element.closest('.project-hero')) split.in({ delay: element.tagName === 'H1' ? 0.05 : 0.18, duration: 1.1 });
      else this.triggers.push(ScrollTrigger.create({ trigger: element, start: 'top 92%', once: true, onEnter: () => split.in() }));
    }
    for (const element of this.element.querySelectorAll('.section-rule')) {
      this.rules.push(gsap.fromTo(element, { scaleX: 0 }, { scaleX: 1, duration: this.reducedMotion ? 0 : 1.3, ease: CUSTOM_EASE,
        scrollTrigger: { trigger: element, start: 'top 94%', once: true } }));
    }
    this.element.style.visibility = '';
    this.scroll.resize();
  }

  async out() {
    this.leaving = true;
    this.scroll.stop();
    this.triggers.forEach(trigger => trigger.kill());
    this.rules.forEach(tween => { tween.scrollTrigger?.kill(); tween.kill(); });
    this.fade = gsap.to(this.element, { opacity: 0, duration: this.reducedMotion ? 0 : 0.45, ease: CUSTOM_EASE });
    await Promise.all(this.splits.filter(split => split.visible).map(split => split.out()));
  }

  destroy() {
    this.destroyed = true;
    this.events.abort();
    this.dispatcher.off('projectSlideChanged', this.onSlide);
    this.triggers.forEach(trigger => trigger.kill());
    this.rules.forEach(tween => { tween.scrollTrigger?.kill(); tween.kill(); });
    this.fade?.kill();
    this.splits.forEach(split => split.destroy());
    this.scroll.destroy();
    this.element.remove();
    document.body.classList.remove('is-project');
  }
}
