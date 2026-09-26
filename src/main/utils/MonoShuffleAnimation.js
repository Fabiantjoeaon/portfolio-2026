import txtShuffle from 'txt-shuffle';
import { timings } from '@/shared/timings';

const { shuffle } = txtShuffle;
const GLYPHS = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ[]@.-×';

/** Interruptible txt-shuffle lifecycle for one mono DOM label. */
export default class MonoShuffleAnimation {
  constructor(element) {
    this.element = element;
    this.target = element.textContent;
    this.visible = true;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.output = document.createElement('span');
    this.output.className = 'mono-shuffle-output';
    this.measure = document.createElement('span');
    this.measure.className = 'mono-shuffle-measure';
    this.measure.setAttribute('aria-hidden', 'true');
    this.measure.textContent = this.target;

    this.shell = document.createElement('span');
    this.shell.className = 'mono-shuffle-shell';
    this.shell.append(this.output, this.measure);
    this.element.replaceChildren(this.shell);
    this.output.textContent = this.target;

    // Keep interactive labels stable to assistive technology while their visible
    // characters change. Existing, more descriptive aria-labels take priority.
    this.ownsAriaLabel = this.element.matches('a, button') && !this.element.hasAttribute('aria-label');
    if (this.ownsAriaLabel) {
      this.element.setAttribute('aria-label', this.target);
      this.output.setAttribute('aria-hidden', 'true');
    }
  }

  cancel() {
    this.revision = (this.revision || 0) + 1;
    this.resolve?.();
    this.resolve = null;
  }

  animate(visible, {
    delay = 0,
    duration = visible ? timings.mono.inDuration : timings.mono.outDuration,
    delayResolve = timings.mono.delayResolve,
    fps = timings.mono.fps,
    direction = 'right',
    animation = visible ? 'show' : 'hide',
  } = {}) {
    this.cancel();
    this.visible = visible;
    const revision = this.revision;

    if (this.reducedMotion || duration <= 0) {
      this.output.textContent = visible ? this.target : '';
      return Promise.resolve();
    }

    return new Promise(resolve => {
      this.resolve = resolve;
      shuffle({
        text: this.target,
        duration,
        delay: Math.max(0, delay / Math.max(duration, 0.001)),
        delayResolve: Math.min(Math.max(delayResolve, 0), 0.95),
        fps,
        glyphs: GLYPHS,
        animation,
        direction,
        onUpdate: value => {
          if (revision === this.revision) this.output.textContent = value;
        },
        onComplete: value => {
          if (revision !== this.revision) return;
          this.output.textContent = value;
          this.resolve = null;
          resolve();
        },
      });
    });
  }

  in(options) { return this.animate(true, options); }
  out(options) { return this.animate(false, options); }

  to(text, options = {}) {
    this.cancel();
    this.target = text;
    this.measure.textContent = text;
    if (this.ownsAriaLabel) {
      this.element.setAttribute('aria-label', text);
    }
    return this.animate(true, { ...options, animation: 'stay' });
  }

  reset() {
    this.cancel();
    this.visible = false;
    this.output.textContent = '';
  }

  destroy() {
    this.cancel();
    this.element.replaceChildren(document.createTextNode(this.target));
  }
}
