import * as THREE from 'three/webgpu';
import { Fn, If, uniform, texture, uv, vec2, vec3, vec4, float, floor, mix, min, max, smoothstep, step, hash, screenCoordinate } from 'three/tsl';
import { timingEase } from '@/offscreen/lib/customEases';
import { timings } from '@/shared/timings';
import { resolvePublicPath } from '@/offscreen/utils/publicPath';
import dispatcher from '@/shared/dispatcher';
import { getFlag } from '@/offscreen/lib/query';
import { mediaSrc, mobilePath } from '@/shared/projects';
import GalleryMotion, { galleryLerpAlpha } from './GalleryMotion';
import { gradeVideo } from './gradeVideo';
import { blurInto, createBlurSource } from './gaussianBlur';

const wrap = (index, count) => ((index % count) + count) % count;

/** Resolved URL of a project video path, in this device's rendition. */
export const videoUrl = path => path
  ? resolvePublicPath(getFlag('touchExperience') ? mobilePath(path) : path) : null;

/**
 * A continuous track: recycle only offscreen panels, never the visible image.
 * Video slides show their poster until the screen stream plays them; detail
 * items that are videos stream on their own channel once revealed.
 */
export default class ProjectGallery extends THREE.Group {
  constructor(project, videoNode, detailVideos, fallback, videoGrade, settings) {
    super();
    this.project = project;
    this.videoNode = videoNode;
    this.detailVideos = detailVideos;
    this.fallback = fallback;
    this.videoGrade = videoGrade;
    this.settings = settings;
    this.barCount = Math.max(2, Math.round(settings.galleryBars));
    this.slideCount = project.slideCount || project.media.length;
    this.motion = new GalleryMotion(this.slideCount, settings);
    this.index = 0;
    this.requested = false;
    this.loaded = false;
    this.visible = false;
    this.age = 0;
    this.opacity = 1;
    this.pageProgress = 1;
    this.entryReady = false;
    this.entryHeld = false;
    this._introTime = 0;
    this._animateCenter = false;
    this._clipMatrix = new THREE.Matrix4();
    this._exitMatrix = new THREE.Matrix4();
    this._abort = new AbortController();
    this.textures = new Map();
    this.blurSources = new Map();
    this.blurRadius = settings.galleryBlurRadius;
    const renditions = project.media.map(media => mediaSrc(media, getFlag('touchExperience')));
    this.aspects = renditions.map(media => media.width / media.height);
    // Videos blur their poster; the home thumb never gets the fill.
    this.portraits = renditions.map(media => !media.thumbSource && media.height > media.width);
    // Desktop also shows landscape images whole once cover would crop them noticeably.
    const touch = getFlag('touchExperience');
    this.containable = renditions.map((media, index) => this.portraits[index] || (!touch && !media.thumbSource && media.type === 'image'));
    this.details = new Set(project.details);
    this.urls = renditions.map(media => media.type === 'video' ? resolvePublicPath(media.src) : null);
    this.thumbUrl = videoUrl(project.video);
    this.screenUrl = null;
    this.activeMedia = null;
    this.videoFrameUrl = null;
    this.slots = Array.from({ length: 5 }, () => this.createSlot());
    this.stills = [];
    this.ready = Promise.all(renditions.map(async (media, index) => {
      try {
        const src = media.type === 'video' ? media.poster : media.src;
        const response = await fetch(resolvePublicPath(src), { signal: this._abort.signal });
        if (!response.ok) throw new Error(`Gallery image: ${response.status}`);
        const bitmap = await createImageBitmap(await response.blob());
        if (this.disposed) { bitmap.close(); return; }
        const map = new THREE.Texture(bitmap);
        map.flipY = false;
        map.colorSpace = THREE.SRGBColorSpace;
        map.needsUpdate = true;
        this.textures.set(index, map);
        if (this.containable[index] || this.details.has(index)) {
          const source = createBlurSource(bitmap);
          blurInto(source, this.blurRadius);
          this.blurSources.set(index, source);
        }
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
      frameAspect: uniform(16 / 9), aspect: uniform(16 / 9), video: uniform(0), portrait: uniform(0), brightness: uniform(0.38), effect: uniform(1),
      fillBelow: uniform(0.55), contain: uniform(0), rows: uniform(0), blurBrightness: uniform(0.45), blurSaturation: uniform(1.2), blurSheen: uniform(0.06), blurGrain: uniform(0.025) };
    const map = texture(this.fallback);
    const blurMap = texture(this.fallback);
    const coverScale = aspect => vec2(min(u.frameAspect.div(aspect), 1), min(aspect.div(u.frameAspect), 1));
    const cover = (st, aspect) => st.sub(0.5).mul(coverScale(aspect)).add(0.5);
    // Base NodeMaterial ignores constructor options. Set transparency explicitly
    // so its shader preserves the animated alpha instead of forcing it to 1.
    const material = new THREE.NodeMaterial();
    material.transparent = true;
    material.colorNode = Fn(() => {
      const st = uv();
      // Columns staggered left to right, or rows staggered top to bottom.
      const axis = mix(st.x, float(1).sub(st.y), u.rows);
      const order = floor(axis.mul(u.bars)).min(u.bars.sub(1)).div(u.bars.sub(1));
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
      // Images that cover would crop past `fillBelow` are shown whole
      // over a dark blur of themselves; easing between the two avoids a pop.
      const visible = min(u.frameAspect.div(u.aspect), u.aspect.div(u.frameAspect));
      const fill = u.portrait.mul(mix(smoothstep(u.fillBelow.add(0.05), u.fillBelow.sub(0.1), visible), float(1), u.contain));
      const containScale = vec2(max(u.frameAspect.div(u.aspect), 1), max(u.aspect.div(u.frameAspect), 1));
      const fit = coords.sub(0.5).mul(mix(coverScale(u.aspect), containScale, fill)).add(0.5);
      const fitted = fit.clamp(0.0001, 0.9999);
      const sampled = map.sample(vec2(fitted.x, float(1).sub(fitted.y))).rgb.toVar();
      If(fill.greaterThan(0), () => {
        const inside = step(0, fit.x).mul(step(fit.x, 1)).mul(step(0, fit.y)).mul(step(fit.y, 1));
        const back = cover(coords, u.aspect).clamp(0.0001, 0.9999);
        const blurred = blurMap.sample(vec2(back.x, float(1).sub(back.y))).level(0).rgb;
        const tinted = mix(vec3(blurred.dot(vec3(0.2126, 0.7152, 0.0722))), blurred, u.blurSaturation).max(0);
        // Frosted glass: a soft top-lit sheen, and grain so the gradient never bands.
        const sheen = smoothstep(0.35, 1, st.y).mul(u.blurSheen);
        const grain = hash(screenCoordinate.x.add(screenCoordinate.y.mul(4099))).sub(0.5).mul(u.blurGrain);
        const glass = tinted.mul(u.blurBrightness).add(sheen).add(grain).max(0);
        sampled.assign(mix(glass, sampled, inside));
      });
      const color = mix(sampled, gradeVideo(sampled, this.videoGrade), u.video).mul(u.brightness);
      // Darken RGB rather than alpha: the last displaced band can become
      // genuinely black without revealing the background through the image.
      const darkness = amount.pow(u.darknessPower).mul(u.fade).clamp(0, 1);
      return vec4(color.mul(float(1).sub(darkness)), u.opacity);
    })();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    this.add(mesh);
    return { mesh, u, map, blurMap, logical: null, left: 0, right: 0, relative: 0 };
  }

  updateSlots(delta) {
    const ease = timingEase(timings.gallery.ease);
    const inEase = timingEase(timings.gallery.inEase);
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
      const i = wrap(logical, this.slideCount);
      const url = this.urls[i];
      const live = this.videoNode.value !== this.fallback && this.streams(i, this.videoFrameUrl);
      const held = !live && this.heldVideo?.texture && this.streams(i, this.heldVideo.url);
      slot.map.value = live ? this.videoNode.value : held ? this.heldVideo.texture : this.textures.get(i) ?? this.fallback;
      slot.u.video.value = url ? 1 : 0;
      slot.u.aspect.value = live ? this.videoAspect ?? this.aspects[i] : held ? this.heldVideo.aspect : this.aspects[i];
      this.setPortrait(slot, i, false);
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
      const delay = logical === 0 ? 0
        : this.settings.galleryNeighborDelay + Math.max(0, rank) * this.settings.galleryNeighborStagger;
      const entrance = this._entryImmediate || this._introComplete || Math.abs(logical) > 2 || (logical === 0 && !this._animateCenter) ? 1
        : Math.max(0, Math.min(1, (this._introTime - delay) / this.settings.galleryInDuration));
      slot.u.page.value = 1 - inEase(entrance);
      slot.u.effect.value = this.reducedMotion ? 0 : 1;
      slot.u.brightness.value = 0.38 + 0.62 * ease(focus);
      slot.u.opacity.value = this.opacity * inEase(entrance);
    }
  }

  /** Whether frames from `url` belong on slide `index`; the thumbnail stands in for its film. */
  streams(index, url) {
    const own = this.urls[index];
    return own !== null && url !== null && (url === own || (this.project.media[index].thumbSource && url === this.thumbUrl));
  }

  /** `exact`: the still's frame already has the media's aspect, so plain cover shows it whole. */
  setPortrait(slot, index, still, exact = false) {
    const blur = this.blurSources.get(index)?.texture;
    const { u } = slot;
    // Stills always sit whole in their frame. Gallery slides only once cover would crop them past `fillBelow`.
    u.portrait.value = !exact && blur && (still || this.containable[index]) ? 1 : 0;
    u.contain.value = still && !exact ? 1 : 0;
    slot.blurMap.value = blur ?? this.fallback;
    const touch = getFlag('touchExperience');
    u.fillBelow.value = this.settings[this.portraits[index] ? 'galleryFillBelow' : 'galleryContainBelow'];
    u.blurBrightness.value = this.settings[touch ? 'galleryBlurBrightnessMobile' : 'galleryBlurBrightness'];
    u.blurSaturation.value = this.settings.galleryBlurSaturation;
    u.blurSheen.value = this.settings.galleryBlurSheen;
    u.blurGrain.value = this.settings[touch ? 'galleryBlurGrainMobile' : 'galleryBlurGrain'];
  }

  /** `delay` is the gallery's slot in the page's diagonal reveal, counted from activation. */
  activate(immediate = false, delay = 0) {
    this.requested = true;
    this.reducedMotion = immediate;
    this._entryDelay = immediate ? 0 : Math.max(0, delay || 0);
    if (immediate) this._entryImmediate = true;
    if (this.loaded) this.announce();
  }

  announce(busy = false) {
    this._announcedIndex = this.index;
    this._announcedBusy = busy;
    dispatcher.trigger({ name: 'projectSlideChanged' }, {
      slug: this.project.slug, index: this.index, total: this.slideCount, busy,
    });
  }

  /** Build every still's material up front so they compile before the page opens. */
  createStills() {
    while (this.stills.length < this.project.details.length) {
      const still = this.createStill();
      still.mesh.visible = false;
      this.stills.push(still);
    }
  }

  createStill() {
    const still = { ...this.createSlot(), time: 0, revealed: false };
    still.u.rows.value = 1;
    return still;
  }

  /** Page stills: pixel boxes relative to the hero frame center. */
  setStills(layouts) {
    layouts.forEach((layout, index) => {
      const still = this.stills[index] ??= this.createStill();
      Object.assign(still, layout);
      still.mesh.visible = still.revealed;
    });
  }

  revealStill(index, immediate = false) {
    const still = this.stills[index];
    if (!still || still.revealed) return;
    still.revealed = true;
    still.time = immediate ? Infinity : 0;
    const url = this.urls[still.mediaIndex];
    if (url) this.detailVideos[index]?.request(url);
  }

  releaseDetailVideos() {
    this.stills.forEach((still, index) => {
      const channel = this.detailVideos[index];
      if (channel && channel.url && channel.url === this.urls[still.mediaIndex]) channel.request(null);
    });
  }

  updateStills(delta, ease) {
    for (let index = 0; index < this.stills.length; index++) {
      const still = this.stills[index];
      if (!still.revealed) continue;
      still.time += delta;
      const entrance = this.reducedMotion ? 1 : Math.min(1, still.time / this.settings.galleryInDuration);
      const u = still.u;
      const url = this.urls[still.mediaIndex];
      const channel = url && this.detailVideos[index];
      const live = channel && channel.frameUrl === url && channel.texture;
      still.mesh.visible = true;
      still.map.value = live ? channel.texture : this.textures.get(still.mediaIndex) ?? this.fallback;
      u.video.value = url ? 1 : 0;
      u.aspect.value = this.aspects[still.mediaIndex] ?? 16 / 9;
      this.setPortrait(still, still.mediaIndex, true, still.exact);
      u.brightness.value = 1;
      u.offset.value = this.settings.galleryOffset;
      u.spread.value = this.settings.gallerySpread;
      u.stagger.value = this.settings.galleryStagger;
      u.bars.value = this.barCount;
      u.scale.value = this.settings.galleryScale;
      u.fade.value = this.settings.galleryFade;
      u.darknessPower.value = this.settings.galleryDarknessPower;
      u.effect.value = this.reducedMotion ? 0 : 1;
      u.page.value = 1 - ease(entrance);
      u.opacity.value = this.opacity * ease(entrance);
    }
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
    this.releaseDetailVideos();
    // update() is gated on loading, so an unloaded gallery could never finish an exit.
    if (immediate || !this.requested || !this.loaded) { this.opacity = 0; this.visible = false; return Promise.resolve(); }
    for (const slot of [...this.slots, ...this.stills]) slot.exitOpacity = slot.u.opacity.value;
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

  update(delta, videoAspect, videoFrameUrl, heldVideo) {
    if (!this.loaded || !this.requested) return;
    this.visible = true;
    if (this.settings.galleryBlurRadius !== this.blurRadius) {
      this.blurRadius = this.settings.galleryBlurRadius;
      for (const source of this.blurSources.values()) blurInto(source, this.blurRadius);
    }
    this.videoAspect = videoAspect;
    this.videoFrameUrl = videoFrameUrl;
    this.heldVideo = heldVideo;
    this.age += delta;
    if (this._exitAnimation) {
      const animation = this._exitAnimation;
      animation.elapsed += delta;
      const progress = Math.min(1, animation.elapsed / animation.duration);
      this.opacity = 1 - timingEase(timings.gallery.outEase)(progress);
      for (const slot of this.slots) slot.u.opacity.value = slot.exitOpacity * this.opacity;
      for (const still of this.stills) still.u.opacity.value = (still.exitOpacity ?? 0) * this.opacity;
      if (progress === 1) { this._exitAnimation = null; animation.resolve(); }
      return;
    }
    if (this.departing) return;
    if (this._entryDelay > 0) this._entryDelay -= delta;
    else if (this.entryReady && !this.entryHeld) this._introTime += delta;
    this._introComplete = this._introTime >= this.settings.galleryInDuration
      + this.settings.galleryNeighborDelay + 3 * this.settings.galleryNeighborStagger;
    this.pageProgress = this._entryImmediate || !this._animateCenter ? 1 : Math.min(1, this._introTime / this.settings.galleryInDuration);
    this.motion.update(delta, this.reducedMotion);
    this.index = this.motion.index;
    this.activeMedia = this.project.media[this.index];
    this.screenUrl = this.urls[this.index];
    this.updateSlots(delta);
    this.updateStills(delta, timingEase(timings.gallery.ease));
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
    // The original screen is hidden while the gallery is visible. Keep its
    // exact depth so perspective does not magnify the page's scroll offset.
    this.updateMatrix();
    this._clipMatrix.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse).multiply(this.matrix);
    // The live quad aspect, not the layout's: mid-flight it still matches the
    // hero screen's crop, so taking over from it never shifts the image.
    const frameAspect = screen.scale.x / screen.scale.y;
    for (const slot of this.slots) {
      slot.u.frameAspect.value = frameAspect;
      slot.mesh.scale.copy(screen.scale);
      slot.mesh.position.x = slot.relative * screen.scale.x * (1 + layout.gap / layout.mediaWidth);
    }
    const pixel = screen.scale.y / layout.mediaHeight;
    for (const still of this.stills) {
      still.u.frameAspect.value = still.width / still.height;
      still.mesh.scale.set(still.width * pixel, still.height * pixel, 1);
      still.mesh.position.set(still.x * pixel, -still.y * pixel, 0);
    }
  }

  dispose() {
    this._exitAnimation?.resolve?.();
    this._exitAnimation = null;
    this.disposed = true;
    this.releaseDetailVideos();
    this._abort.abort();
    for (const map of this.textures.values()) { map.image.close?.(); map.dispose(); }
    for (const source of this.blurSources.values()) source.texture.dispose();
    for (const slot of [...this.slots, ...this.stills]) { slot.mesh.geometry.dispose(); slot.mesh.material.dispose(); }
    this.removeFromParent();
  }
}
