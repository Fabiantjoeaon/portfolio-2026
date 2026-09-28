import { getFlag } from "@/offscreen/lib/query";
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import PageScroll from '@/main/utils/PageScroll';
import { viewportHeight } from '@/main/utils/viewport';
import SplitTextAnimation from '@/main/utils/SplitTextAnimation';
import MonoShuffleAnimation from '@/main/utils/MonoShuffleAnimation';
import { formatMonoLabel, formatMonoLabels } from '@/main/utils/monoLabels';
import { projectLayout } from '@/shared/projectLayout';
import { PROJECTS, PAGE_STILLS } from '@/shared/projects';
import '@/offscreen/lib/customEases';
import { timings } from '@/shared/timings';

gsap.registerPlugin(ScrollTrigger);
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => String(value).padStart(2, '0');

export default class ProjectPage {
  constructor(api, project, dispatcher, navigate) {
    this.api = api;
    this.project = project;
    this.dispatcher = dispatcher;
    this.splits = [];
    this.monos = [];
    this.monoByElement = new Map();
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
            <i class="project-pagination-bar" aria-hidden="true"></i>
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
          ${stills.slice(0, PAGE_STILLS).map((media, index) => `<figure><div class="project-still-image" role="img" aria-label="${escape(media.alt)}" data-media="${project.media.indexOf(media)}"></div><figcaption data-mono data-reveal>Detail ${number(index + 1)}</figcaption></figure>`).join('')}
        </div>
        <footer class="project-footer">
          <div class="section-rule" aria-hidden="true"></div>
          <a href="/" data-mono>All projects</a>
          <a class="project-next" href="/project/${next.slug}"><span data-mono>Next project</span><span data-reveal>${escape(next.name)}</span></a>
        </footer>
      </div>`;
    formatMonoLabels(this.element);
    document.querySelector('#app').appendChild(this.element);
    this.resize = this.resize.bind(this);
    this.layout();
    this.gallery = this.element.querySelector('.project-gallery');
    this.pageButtons = [...this.element.querySelectorAll('.project-pagination [data-index]')];
    for (const button of this.pageButtons) button.dataset.label = button.textContent;
    this.bar = this.element.querySelector('.project-pagination-bar');
    this.slideIndex = 0;
    this.onSlide = async data => {
      const slug = await data.slug;
      const index = await data.index;
      const busy = await data.busy;
      if (this.destroyed || slug !== project.slug) return;
      this.gallery.setAttribute('aria-busy', String(busy));
      if (index !== this.slideIndex) {
        for (const button of this.pageButtons) {
          const current = Number(button.dataset.index) === index;
          if (current) button.setAttribute('aria-current', 'true');
          else button.removeAttribute('aria-current');
          if (current || Number(button.dataset.index) === this.slideIndex)
            this.monoByElement.get(button)?.to(button.dataset.label);
        }
        this.slideIndex = index;
        this.moveBar();
      }
      const media = project.media[index];
      this.element.querySelector('.project-media-frame').setAttribute('aria-label', media.alt);
      const mediaType = this.element.querySelector('.project-media-type');
      const mediaTypeText = formatMonoLabel(media.type === 'video' ? 'Film' : 'Still');
      const shuffle = this.monoByElement.get(mediaType);
      if (shuffle) shuffle.to(mediaTypeText);
      else mediaType.textContent = mediaTypeText;
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
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
        lastX: event.clientX, time: performance.now(), velocity: 0, axis: null };
      event.target.setPointerCapture(event.pointerId);
    }, { signal: this.events.signal });
    this.gallery.addEventListener('pointermove', event => {
      const pointer = this.pointer;
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (!pointer.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 6) {
        pointer.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
        if (pointer.axis === 'x') {
          this.change({ phase: 'grab' });
          this.gallery.classList.add('is-dragging');
        }
      }
      if (pointer.axis !== 'x') return;
      const now = performance.now();
      const velocity = (pointer.lastX - event.clientX) / this.pitch / Math.max((now - pointer.time) / 1000, 0.008);
      pointer.velocity = pointer.velocity * 0.4 + velocity * 0.6;
      pointer.lastX = event.clientX;
      pointer.time = now;
      this.pendingDrag = -dx / this.pitch;
      if (!this.dragFrame) this.dragFrame = requestAnimationFrame(() => {
        this.dragFrame = null;
        this.change({ phase: 'drag', distance: this.pendingDrag });
      });
    }, { signal: this.events.signal });
    const endPointer = (event, cancelled = false) => {
      const pointer = this.pointer;
      if (!pointer || pointer.id !== event.pointerId) return;
      this.pointer = null;
      cancelAnimationFrame(this.dragFrame);
      this.dragFrame = null;
      this.gallery.classList.remove('is-dragging');
      if (pointer.axis !== 'x') return;
      this.suppressClickUntil = performance.now() + 350;
      this.change({ phase: 'drag', distance: cancelled ? this.pendingDrag : (pointer.x - event.clientX) / this.pitch });
      this.change({ phase: 'release', velocity: cancelled || performance.now() - pointer.time > 100 ? 0 : pointer.velocity });
    };
    this.gallery.addEventListener('pointerup', event => endPointer(event), { signal: this.events.signal });
    this.gallery.addEventListener('pointercancel', event => endPointer(event, true), { signal: this.events.signal });
    this.gallery.addEventListener('lostpointercapture', event => endPointer(event, true), { signal: this.events.signal });
    this.gallery.addEventListener('wheel', event => {
      if (event.ctrlKey || this.pointer?.axis === 'x') return;
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!horizontal && !event.shiftKey) return;
      const delta = horizontal ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerWidth : 1;
      this.change({ phase: 'wheel', distance: delta * units / this.pitch });
    }, { passive: false, signal: this.events.signal });
    this.prepared = this.prepare();
  }

  /** Split and hide every label ahead of the page transition; animations start in open(). */
  async prepare() {
    await document.fonts.ready;
    if (this.destroyed) return;
    for (const element of this.element.querySelectorAll('[data-mono]')) {
      const mono = new MonoShuffleAnimation(element);
      this.monos.push(mono);
      this.monoByElement.set(element, mono);
      mono.reset();
    }
    for (const element of this.element.querySelectorAll('[data-reveal]')) {
      if (element.matches('[data-mono]')) continue;
      this.splits.push(new SplitTextAnimation(element, { fade: Boolean(element.closest('.project-hero')) }));
    }
  }

  open() {
    document.body.classList.add('is-project');
    this.scroll = new PageScroll(this.api);
    window.addEventListener('resize', this.resize, { signal: this.events.signal });
    this.resize();
    this.api.trigger({ name: 'projectGallery' }, { slug: this.project.slug, activate: true, immediate: this.reducedMotion });
    this.ready = this.prepared.then(() => this.initAnimations());
  }

  moveBar(immediate = false) {
    const button = this.pageButtons?.[this.slideIndex];
    if (!button) return;
    const inset = 8;
    gsap.to(this.bar, {
      x: button.offsetLeft + inset,
      scaleX: Math.max(1, button.offsetWidth - inset * 2),
      duration: immediate || this.reducedMotion ? 0 : timings.pagination.barDuration,
      ease: timings.pagination.barEase,
      overwrite: true,
    });
  }

  change(request) {
    if (this.leaving) return;
    this.api.trigger({ name: 'projectGallery' }, { slug: this.project.slug, ...request, immediate: this.reducedMotion });
  }

  layout() {
    const layout = projectLayout(window.innerWidth, viewportHeight(), getFlag("touchExperience") || window.innerWidth <= 700);
    this.pitch = layout.mediaWidth + layout.gap;
    for (const key of ['heroHeight', 'mediaWidth', 'mediaHeight', 'gap', 'top', 'left']) {
      this.element.style.setProperty(`--project-${key}`, `${layout[key]}px`);
    }
  }

  resize() {
    const size = `${window.innerWidth}x${viewportHeight()}`;
    if (size === this.size) return;
    this.size = size;
    if (this.pointer?.axis === 'x') {
      cancelAnimationFrame(this.dragFrame);
      this.dragFrame = null;
      this.change({ phase: 'release' });
      this.pointer = null;
      this.gallery.classList.remove('is-dragging');
    }
    this.layout();
    this.scroll?.resize();
    this.measureStills();
    this.moveBar(true);
  }

  measureStills() {
    const frame = this.element.querySelector('.project-media-frame').getBoundingClientRect();
    const stills = [...this.element.querySelectorAll('.project-still-image')].map(element => {
      const rect = element.getBoundingClientRect();
      return {
        mediaIndex: Number(element.dataset.media),
        x: rect.left + rect.width / 2 - (frame.left + frame.width / 2),
        y: rect.top + rect.height / 2 - (frame.top + frame.height / 2),
        width: rect.width,
        height: rect.height,
      };
    });
    this.api.trigger({ name: 'projectGallery' }, { slug: this.project.slug, stills });
  }

  initAnimations() {
    if (this.destroyed || this.leaving) return;
    let heroOrder = 0;
    for (const mono of this.monos) {
      if (mono.element.closest('.project-hero')) {
        mono.in({ delay: timings.text.projectDelay + heroOrder++ * timings.text.projectElementStagger });
      } else {
        this.triggers.push(ScrollTrigger.create({ trigger: mono.element, start: 'top 92%', once: true, onEnter: () => mono.in() }));
      }
    }
    for (const split of this.splits) {
      const element = split.element;
      if (element.closest('.project-hero')) split.in({ delay: timings.text.projectDelay + heroOrder++ * timings.text.projectElementStagger, duration: timings.text.projectIn, stagger: timings.text.heroLineStagger, ease: timings.text.heroEase });
      else this.triggers.push(ScrollTrigger.create({ trigger: element, start: 'top 92%', once: true, onEnter: () => split.in() }));
    }
    for (const element of this.element.querySelectorAll('.section-rule')) {
      this.rules.push(gsap.fromTo(element, { scaleX: 0 }, { scaleX: 1, duration: this.reducedMotion ? 0 : timings.text.projectRuleIn, ease: timings.text.ruleEase,
        scrollTrigger: { trigger: element, start: 'top 94%', once: true } }));
    }
    this.element.style.visibility = '';
    this.measureStills();
    this.moveBar(true);
    this.element.querySelectorAll('.project-still-image').forEach((element, revealStill) => {
      this.triggers.push(ScrollTrigger.create({ trigger: element, start: 'top 92%', once: true,
        onEnter: () => this.change({ revealStill }) }));
    });
    this.paginationReveal = gsap.from(this.element.querySelector('.project-pagination'), {
      opacity: 0, y: 10, delay: this.reducedMotion ? 0 : timings.text.paginationDelay,
      duration: this.reducedMotion ? 0 : timings.text.paginationDuration, ease: timings.text.heroEase,
    });
    this.scroll.resize();
  }

  out() { return this.exitPromise ??= this.animateOut(); }

  async animateOut() {
    this.leaving = true;
    cancelAnimationFrame(this.dragFrame);
    this.scroll?.stop();
    this.triggers.forEach(trigger => trigger.kill());
    this.rules.forEach(tween => { tween.scrollTrigger?.kill(); tween.kill(); });
    this.paginationReveal?.kill();
    this.fade?.kill();
    this.fade = gsap.to(this.element, { opacity: 0, duration: this.reducedMotion ? 0 : timings.text.exitFade, ease: timings.text.exitEase });
    await Promise.all([
      this.fade,
      ...this.monos.filter(mono => mono.visible).map(mono => mono.out()),
    ]);
  }

  destroy() {
    this.destroyed = true;
    this.events.abort();
    cancelAnimationFrame(this.dragFrame);
    this.dispatcher.off('projectSlideChanged', this.onSlide);
    this.triggers.forEach(trigger => trigger.kill());
    this.rules.forEach(tween => { tween.scrollTrigger?.kill(); tween.kill(); });
    this.fade?.kill();
    this.paginationReveal?.kill();
    gsap.killTweensOf(this.bar);
    this.splits.forEach(split => split.destroy());
    this.monos.forEach(mono => mono.destroy());
    this.monoByElement.clear();
    this.scroll?.destroy();
    this.element.remove();
    if (this.scroll) document.body.classList.remove('is-project');
  }
}
