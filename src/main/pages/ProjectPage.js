import PageScroll from '@/main/utils/PageScroll';

/** Scroll surface for the existing canvas project presentation. */
export default class ProjectPage {
  constructor(api) {
    this.element = document.createElement('div');
    this.element.className = 'project-scroll-surface';
    this.element.setAttribute('aria-hidden', 'true');
    document.querySelector('#app').appendChild(this.element);
    this.scroll = new PageScroll(api);
  }

  out() { this.scroll.stop(); }

  destroy() {
    this.scroll.destroy();
    this.element.remove();
  }
}
