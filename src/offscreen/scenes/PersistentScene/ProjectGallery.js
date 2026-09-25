import * as THREE from 'three/webgpu';
import { Fn, uniform, texture, uv, vec2, vec4, float, floor, mix, min, max } from 'three/tsl';
import { timingEase } from '@/offscreen/lib/customEases';
import { timings } from '@/shared/timings';
import { resolvePublicPath } from '@/offscreen/utils/publicPath';
import dispatcher from '@/shared/dispatcher';
import GalleryMotion, { galleryLerpAlpha } from './GalleryMotion';

const wrap = (index, count) => ((index % count) + count) % count;

/** A continuous track: recycle only offscreen panels, never the visible image. */
export default class ProjectGallery extends THREE.Group {
  constructor(project, videoNode, fallback, videoBrightness, settings) {
    super();
    this.project = project;
    this.videoNode = videoNode;
    this.fallback = fallback;
    this.videoBrightness = videoBrightness;
    this.settings = settings;
    this.barCount = Math.max(2, Math.round(settings.galleryBars));
    this.motion = new GalleryMotion(project.media.length, settings);
    this.index = 0;
    this.requested = false;
    this.loaded = false;
    this.visible = false;
    this.age = 0;
    this.opacity = 1;
    this.pageProgress = 1;
    this.entryReady = false;
    this._introTime = 0;
    this._animateCenter = false;
    this._clipMatrix = new THREE.Matrix4();
    this._exitMatrix = new THREE.Matrix4();
    this._abort = new AbortController();
    this.textures = new Map();
    this.aspects = new Map();
    this.slots = Array.from({ length: 5 }, () => this.createSlot());
    this.ready = Promise.all(project.media.map(async (media, index) => {
      if (media.type === 'video') return;
      try {
        const response = await fetch(resolvePublicPath(media.src), { signal: this._abort.signal });
        if (!response.ok) throw new Error(`Gallery image: ${response.status}`);
        const bitmap = await createImageBitmap(await response.blob());
        if (this.disposed) { bitmap.close(); return; }
        const map = new THREE.Texture(bitmap);
        map.flipY = false;
        map.colorSpace = THREE.SRGBColorSpace;
        map.needsUpdate = true;
        this.textures.set(index, map);
        this.aspects.set(index, bitmap.width / bitmap.height);
      } catch (error) {
        if (error.name !== 'AbortError') console.warn(error.message);
      }
    })).then(() => {
      if (this.disposed) return;
      this.loaded = true;
      this.updateSlots(0);
      if (this.requested) this.announce();
    });
  }

  createSlot() {
    const u = { left: uniform(0), right: uniform(0), opacity: uniform(1),
      offset: uniform(this.settings.galleryOffset), spread: uniform(this.settings.gallerySpread), stagger: uniform(this.settings.galleryStagger),
      bars: uniform(this.barCount), scale: uniform(this.settings.galleryScale), fade: uniform(this.settings.galleryFade), darknessPower: uniform(this.settings.galleryDarknessPower), page: uniform(0),
      aspect: uniform(16 / 9), video: uniform(0), brightness: uniform(0.38), effect: uniform(1) };
    const map = texture(this.fallback);
    const cover = (st, aspect) => st.sub(0.5).mul(vec2(min(float(16 / 9).div(aspect), 1), min(aspect.div(16 / 9), 1))).add(0.5);
    // Base NodeMaterial ignores constructor options. Set transparency explicitly
    // so its shader preserves the animated alpha instead of forcing it to 1.
    const material = new THREE.NodeMaterial();
    material.transparent = true;
    material.colorNode = Fn(() => {
      const st = uv();
      const order = floor(st.x.mul(u.bars)).min(u.bars.sub(1)).div(u.bars.sub(1));
      const remaining = (amount, rank) => {
        const progress = float(1).sub(amount).sub(rank.mul(u.stagger))
          .div(float(1).sub(u.stagger)).clamp(0, 1);
        return float(1).sub(progress).mul(u.effect);
      };
      const reverse = float(1).sub(order);
      const right = remaining(max(u.right, u.page), order);
      const left = remaining(u.left, reverse);
      const offset = right.mul(u.offset.add(order.mul(u.spread)))
        .sub(left.mul(u.offset.add(reverse.mul(u.spread))));
      const amount = max(right.mul(order.mul(0.65).add(0.35)), left.mul(reverse.mul(0.65).add(0.35)));
      // Fixed bands transform only their texture; overscan keeps translated
      // samples inside the image, with no geometry gaps or repeated edges.
      const scale = float(1).add(offset.abs().mul(2)).add(amount.mul(u.scale));
      const coords = st.sub(0.5).sub(vec2(offset, 0)).div(scale).add(0.5);
      const fitted = cover(coords, u.aspect).clamp(0.0001, 0.9999);
      const color = map.sample(vec2(fitted.x, float(1).sub(fitted.y))).rgb
        .mul(mix(1, this.videoBrightness, u.video)).mul(u.brightness);
      // Darken RGB rather than alpha: the last displaced band can become
      // genuinely black without revealing the background through the image.
      const darkness = amount.pow(u.darknessPower).mul(u.fade).clamp(0, 1);
      return vec4(color.mul(float(1).sub(darkness)), u.opacity);
    })();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    this.add(mesh);
    return { mesh, u, map, logical: null, left: 0, right: 0, relative: 0 };
  }

  updateSlots(delta) {
    const ease = timingEase(timings.gallery.ease);
    this.barCount = Math.max(2, Math.round(this.settings.galleryBars));
    const base = Math.floor(this.motion.x);
    for (let offset = -2; offset <= 2; offset++) {
      const logical = base + offset;
      const slot = this.slots[wrap(logical, this.slots.length)];
      const relative = logical - this.motion.x;
      const focus = Math.max(0, 1 - Math.abs(relative));
      const distance = relative / this.settings.galleryRevealDistance;
      const left = Math.min(1, Math.max(0, -distance));
      const right = Math.min(1, Math.max(0, distance));
      if (slot.logical !== logical) {
        slot.logical = logical;
        slot.left = left;
        slot.right = right;
      }
      slot.relative = relative;
      const i = wrap(logical, this.project.media.length);
      const video = this.project.media[i].type === 'video';
      slot.map.value = video ? (this.videoNode.value === this.fallback ? this.textures.values().next().value ?? this.fallback : this.videoNode.value) : this.textures.get(i) ?? this.fallback;
      slot.u.video.value = video ? 1 : 0;
      slot.u.aspect.value = video ? this.videoAspect ?? 16 / 9 : this.aspects.get(i) ?? 16 / 9;
      const alpha = this.reducedMotion ? 1 : galleryLerpAlpha(this.settings.galleryShaderLerp, delta);
      for (const [key, target] of [['left', left], ['right', right]]) {
        slot[key] += (target - slot[key]) * alpha;
        if (Math.abs(target - slot[key]) < 0.0001) slot[key] = target;
        slot.u[key].value = 1 - ease(1 - slot[key]);
      }
      slot.u.offset.value = this.settings.galleryOffset;
      slot.u.spread.value = this.settings.gallerySpread;
      slot.u.stagger.value = this.settings.galleryStagger;
      slot.u.bars.value = this.barCount;
      slot.u.scale.value = this.settings.galleryScale;
      slot.u.fade.value = this.settings.galleryFade;
      slot.u.darknessPower.value = this.settings.galleryDarknessPower;
      const rank = Math.abs(logical) * 2 + (logical < 0 ? -2 : -1);
      const delay = logical === 0 ? 0 : (this._animateCenter ? this.settings.galleryInDuration : 0)
        + this.settings.galleryNeighborDelay + Math.max(0, rank) * this.settings.galleryNeighborStagger;
      const entrance = this._entryImmediate || this._introComplete || Math.abs(logical) > 2 || (logical === 0 && !this._animateCenter) ? 1
        : Math.max(0, Math.min(1, (this._introTime - delay) / this.settings.galleryInDuration));
      slot.u.page.value = 1 - ease(entrance);
      slot.u.effect.value = this.reducedMotion ? 0 : 1;
      slot.u.brightness.value = 0.38 + 0.62 * ease(focus);
      slot.u.opacity.value = this.opacity * ease(entrance);
    }
  }

  activate(immediate = false) {
    this.requested = true;
    this.reducedMotion = immediate;
    if (immediate) this._entryImmediate = true;
    if (this.loaded) this.announce();
  }

  announce(busy = false) {
    this._announcedIndex = this.index;
    this._announcedBusy = busy;
    dispatcher.trigger({ name: 'projectSlideChanged' }, {
      slug: this.project.slug, index: this.index, total: this.project.media.length, busy,
    });
  }

  revealPage(immediate = false, { center = true } = {}) {
    this._animateCenter = center;
    this._entryImmediate = immediate;
    this.entryReady = center || immediate;
    this._introTime = 0;
    this._introComplete = false;
    this.pageProgress = immediate || !center ? 1 : 0;
  }

  hidePage(immediate = false) {
    if (this._exitPromise) return this._exitPromise;
    this.departing = true;
    if (immediate || !this.requested) { this.opacity = 0; this.visible = false; return Promise.resolve(); }
    for (const slot of this.slots) slot.exitOpacity = slot.u.opacity.value;
    // Freeze the image's pose, texture transforms and entrance state. Exit is
    // only opacity, even when interrupted during an entrance or drag.
    this._exitPromise = new Promise(resolve => {
      this._exitAnimation = { elapsed: 0, duration: this.settings.galleryOutDuration, resolve };
    });
    return this._exitPromise;
  }

  change({ step, index, immediate = false, phase, distance = 0, velocity = 0 }) {
    if (!this.requested || !this.loaded || this.departing) return;
    if (phase === 'grab') this.motion.grab();
    else if (phase === 'drag') this.motion.drag(distance);
    else if (phase === 'release') this.motion.release(velocity);
    else if (phase === 'wheel') this.motion.wheel(distance);
    else this.motion.select({ step, index, immediate });
  }

  update(delta, videoAspect) {
    if (!this.loaded || !this.requested) return;
    this.visible = true;
    this.videoAspect = videoAspect;
    this.age += delta;
    if (this._exitAnimation) {
      const animation = this._exitAnimation;
      animation.elapsed += delta;
      const progress = Math.min(1, animation.elapsed / animation.duration);
      this.opacity = 1 - timingEase(timings.gallery.ease)(progress);
      for (const slot of this.slots) slot.u.opacity.value = slot.exitOpacity * this.opacity;
      if (progress === 1) { this._exitAnimation = null; animation.resolve(); }
      return;
    }
    if (this.departing) return;
    if (this.entryReady) this._introTime += delta;
    this._introComplete = this._introTime >= (this._animateCenter ? 2 : 1) * this.settings.galleryInDuration
      + this.settings.galleryNeighborDelay + 3 * this.settings.galleryNeighborStagger;
    this.pageProgress = this._entryImmediate || !this._animateCenter ? 1 : Math.min(1, this._introTime / this.settings.galleryInDuration);
    this.motion.update(delta, this.reducedMotion);
    this.index = this.motion.index;
    this.updateSlots(delta);
    if (this.index !== this._announcedIndex || this.motion.busy !== this._announcedBusy) this.announce(this.motion.busy);
  }

  fit(screen, layout, camera) {
    if (this.departing) {
      // Keep the last rendered pose in screen space while the home camera
      // moves behind it. Only opacity changes until this gallery is gone.
      this._exitMatrix.copy(camera.matrixWorld).multiply(camera.projectionMatrixInverse).multiply(this._clipMatrix);
      this._exitMatrix.decompose(this.position, this.quaternion, this.scale);
      return;
    }
    this.position.copy(screen.position);
    this.quaternion.copy(screen.quaternion);
    // A tiny forward offset keeps the gallery above the original screen on exit.
    this.translateZ(0.01);
    this.updateMatrix();
    this._clipMatrix.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse).multiply(this.matrix);
    for (const slot of this.slots) {
      slot.mesh.scale.copy(screen.scale);
      slot.mesh.position.x = slot.relative * screen.scale.x * (1 + layout.gap / layout.mediaWidth);
    }
  }

  dispose() {
    this._exitAnimation?.resolve?.();
    this._exitAnimation = null;
    this.disposed = true;
    this._abort.abort();
    for (const map of this.textures.values()) { map.image.close?.(); map.dispose(); }
    for (const slot of this.slots) { slot.mesh.geometry.dispose(); slot.mesh.material.dispose(); }
    this.removeFromParent();
  }
}
