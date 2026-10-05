import * as THREE from 'three/webgpu';
import { uniform, texture } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { timingEase } from '@/offscreen/lib/customEases';
import { timings } from '@/shared/timings';
import { resolvePublicPath } from '@/offscreen/utils/publicPath';
import dispatcher from '@/shared/dispatcher';
import { getFlag } from '@/offscreen/lib/query';
import { mediaSrc, mobilePath } from '@/shared/projects';
import GalleryMotion, { damp } from './GalleryMotion';
import GalleryLabels from './GalleryLabels';
import { SLAB_RADIUS, createGlassMaterial, createGlassSurfaceMaterial, createMediaMaterial } from './galleryMaterials';
import { BLUR_WIDTH, bakedBlurSource, blurHeight, blurInto, createBlurSource } from './gaussianBlur';
import { blurPath } from '@/shared/bakedTextures';
import { ENABLE_BAKED_GALLERY_BLURS } from '@/shared/flags';
import { afterFrame } from '@/offscreen/utils/frameJobs';

const wrap = (index, count) => ((index % count) + count) % count;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pad = value => String(value).padStart(2, '0');
const _point = new THREE.Vector3();
const _up = new THREE.Vector3();
const _labelPosition = new THREE.Vector3();
const _labelScale = new THREE.Vector3();
const _labelLocal = new THREE.Matrix4();
const _labelMatrix = new THREE.Matrix4();
const _identity = new THREE.Quaternion();
const _blurPlaceholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
_blurPlaceholder.needsUpdate = true;
const disposeBlur = source => { source.texture.image.close?.(); source.texture.dispose(); };

const SLOTS = 5;
// Card visuals read straight from settings into one shared set of uniforms.
const STYLE_KEYS = [
  'frameGlitch', 'frameGlitchRate', 'frameAberration', 'frameSpeed', 'frameIntensity',
  'glassPadding', 'glassRadius', 'glassRefraction', 'glassDispersion', 'glassFrost', 'glassFrostRadius',
  'glassImageTintAmount', 'glassImageTintGlow', 'glassTint', 'glassRim', 'glassSheen', 'glassSpecular', 'glassShadow',
  'glassShadowWidth', 'glassBorder', 'glassBorderWidth', 'glassBorderInset', 'glassBorderGlow', 'glassBorderGlowWidth',
  'glassBorderFresnel', 'glassRevealCell', 'glassRevealGlow',
];
const COLOR_KEYS = ['frameColorA', 'frameColorB', 'frameColorC'];
const LABEL = { idle: 0, wait: 1, in: 2, hold: 3, out: 4, done: 5 };

/** Resolved URL of a project video path, in this device's rendition. */
export const videoUrl = path => path
  ? resolvePublicPath(getFlag('touchExperience') ? mobilePath(path) : path) : null;

/**
 * A continuous track: recycle only offscreen cards, never the visible image.
 * Each card is a group of the image, its glass slab and a mono label, posed
 * by the slider's position and speed.
 * Video slides show their poster until the screen stream plays them; detail
 * items that are videos stream on their own channel once revealed.
 * `backdrop` is the scene behind the screen, for the glass to refract.
 */
export default class ProjectGallery extends THREE.Group {
  constructor(project, videoNode, detailVideos, fallback, settings, upload, backdrop) {
    super();
    this.project = project;
    this.backdrop = backdrop;
    this.videoNode = videoNode;
    this.detailVideos = detailVideos;
    this.fallback = fallback;
    this.settings = settings;
    this.imageTint = Boolean(settings.glassImageTint);
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
    this._delta = 0;
    this._stillTilt = 0;
    this._scrollAlong = null;
    this.textures = new Map();
    this.blurSources = new Map();
    this.blurRadius = settings.galleryBlurRadius;
    const renditions = project.media.map(media => mediaSrc(media, getFlag('touchExperience')));
    this.aspects = renditions.map(media => media.width / media.height);
    this.details = new Set(project.details);
    this.urls = renditions.map(media => media.type === 'video' ? resolvePublicPath(media.src) : null);
    this.thumbUrl = videoUrl(project.video);
    this.screenUrl = null;
    this.activeMedia = null;
    this.videoFrameUrl = null;
    this.time = uniform(0);
    this.geometry = new THREE.PlaneGeometry(1, 1, 1, 24);
    this.slabGeometry = new RoundedBoxGeometry(1, 1, 1, 4, SLAB_RADIUS);
    this.styleUniforms = Object.fromEntries([
      ...STYLE_KEYS.map(key => [key, uniform(0)]),
      ...COLOR_KEYS.map(key => [key, uniform(new THREE.Color())]),
    ]);
    this.labels = new GalleryLabels(SLOTS + project.details.length);
    this.syncStyle();
    this.labels.ready.then(() => { if (!this.disposed && this.labels.batch) this.add(this.labels.batch); });
    this.slots = Array.from({ length: SLOTS }, (_, member) => this.createCard(member));
    this.stills = [];
    const images = renditions.map(media => media.type === 'video' ? media.poster : media.src);
    const blobs = images.map(async src => {
      const response = await fetch(resolvePublicPath(src), { signal: this._abort.signal });
      if (!response.ok) throw new Error(`Gallery image: ${response.status}`);
      return response.blob();
    });
    for (const blob of blobs) blob.catch(() => {});
    // Blurs only feed the glass's image tint. ?debug blurs at runtime so the radius stays tweakable.
    const bakedBlurs = images.map(async src => {
      if (!this.imageTint || !ENABLE_BAKED_GALLERY_BLURS || getFlag('debug')) return null;
      const response = await fetch(resolvePublicPath(blurPath(src, this.blurRadius)), { signal: this._abort.signal });
      return response.ok ? response.blob() : null;
    });
    for (const blob of bakedBlurs) blob.catch(() => {});
    // Downloads run in parallel, but only one image is decoded at a time and
    // its bitmap is freed once uploaded: a whole gallery of decoded bitmaps
    // at once spikes iOS past the memory it allows a tab.
    this.ready = (async () => {
      for (const [index, blob] of blobs.entries()) {
        if (this.disposed) return;
        try {
          const bitmap = await createImageBitmap(await blob);
          if (this.disposed) { bitmap.close(); return; }
          const map = new THREE.Texture(bitmap);
          map.flipY = false;
          map.colorSpace = THREE.SRGBColorSpace;
          map.needsUpdate = true;
          this.textures.set(index, map);
          if (this.imageTint) {
            const source = await this.loadBlur(bitmap, bakedBlurs[index]);
            if (this.disposed) { disposeBlur(source); return; }
            this.blurSources.set(index, source);
          }
          await afterFrame(() => { if (!this.disposed) upload(map); });
        } catch (error) {
          if (error.name !== 'AbortError') console.warn(error.message);
        }
      }
    })().then(() => {
      if (this.disposed) return;
      this.loaded = true;
      this.updateSlots(0);
      if (this.requested) this.announce();
    });
  }

  async loadBlur(bitmap, bakedBlob) {
    const blob = await bakedBlob.catch(() => null);
    if (blob) {
      const baked = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }).catch(() => null);
      if (baked?.width === BLUR_WIDTH && baked.height === blurHeight(bitmap.width, bitmap.height)) return bakedBlurSource(baked);
      baked?.close();
    }
    const source = createBlurSource(bitmap);
    blurInto(source, this.blurRadius);
    return source;
  }

  syncStyle() {
    const u = this.styleUniforms;
    for (const key of STYLE_KEYS) u[key].value = this.settings[key];
    for (const key of COLOR_KEYS) u[key].value.set(this.settings[key]);
    this.labels.opacity.value = this.settings.cardLabelOpacity;
    this.labels.aberration.value = this.settings.cardLabelAberration;
  }

  /** `member` is the card's label slot in the shared text batch. */
  createCard(member) {
    const u = { opacity: uniform(1), frameAspect: uniform(16 / 9), aspect: uniform(16 / 9),
      brightness: uniform(0.38), contain: uniform(0),
      inset: uniform(new THREE.Vector2(1, 1)), size: uniform(new THREE.Vector2(1, 1)), cardSize: uniform(new THREE.Vector2(1, 1)),
      radius: uniform(0), bend: uniform(0), parallax: uniform(0), zoom: uniform(1), lens: uniform(0), frame: uniform(0), shine: uniform(0),
      depth: uniform(0), padding: uniform(0), reveal: uniform(1), tint: uniform(0), seed: uniform(Math.random()) };
    // Texture bindings are shared by texture uuid at compile time, so starting
    // on `map`'s texture would bind both to one slot and sample the sharp image.
    const map = texture(this.fallback);
    const blurMap = texture(_blurPlaceholder);
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    const s = this.styleUniforms;
    const media = new THREE.Mesh(this.geometry, createMediaMaterial(u, s, map));
    media.renderOrder = 10;
    // The slab refracting the scene, the image on its back face, then the slab's lit surface.
    const layers = [
      new THREE.Mesh(this.slabGeometry, createGlassMaterial(u, s, this.backdrop, this.imageTint ? blurMap : null, this.time)),
      new THREE.Mesh(this.slabGeometry, createGlassSurfaceMaterial(u, s, this.time)),
    ];
    layers[0].renderOrder = 9;
    layers[1].renderOrder = 11;
    for (const mesh of [media, ...layers]) {
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    this.add(group);
    return { group, media, layers, u, map, blurMap, member, logical: null, relative: 0,
      yaw: null, frame: 0, intro: 1, entrance: 0, reveal: 1, label: { phase: LABEL.idle, time: 0, value: 0 } };
  }

  updateSlots(delta) {
    const ease = timingEase(timings.gallery.ease);
    const inEase = timingEase(timings.gallery.inEase);
    const calm = this.reducedMotion;
    const settled = this.motion.settled;
    const active = Math.round(this.motion.targetX);
    const base = Math.floor(this.motion.x);
    for (let offset = -2; offset <= 2; offset++) {
      const logical = base + offset;
      const slot = this.slots[wrap(logical, this.slots.length)];
      const relative = logical - this.motion.x;
      const focus = Math.max(0, 1 - Math.abs(relative));
      const i = wrap(logical, this.slideCount);
      if (slot.logical !== logical) {
        slot.logical = logical;
        slot.frame = 0;
        slot.yaw = null;
        slot.label.phase = LABEL.idle;
        slot.label.value = 0;
        this.labels.setText(slot.member, `${pad(i + 1)} / ${pad(this.slideCount)}`);
      }
      slot.relative = relative;
      const live = this.videoNode.value !== this.fallback && this.streams(i, this.videoFrameUrl);
      const held = !live && this.heldVideo?.texture && this.streams(i, this.heldVideo.url);
      slot.map.value = live ? this.videoNode.value : held ? this.heldVideo.texture : this.textures.get(i) ?? this.fallback;
      slot.u.aspect.value = live ? this.videoAspect ?? this.aspects[i] : held ? this.heldVideo.aspect : this.aspects[i];
      const rank = Math.abs(logical) * 2 + (logical < 0 ? -2 : -1);
      const delay = logical === 0 ? 0
        : this.settings.galleryNeighborDelay + Math.max(0, rank) * this.settings.galleryNeighborStagger;
      const entrance = this._entryImmediate || this._introComplete || Math.abs(logical) > 2 || (logical === 0 && !this._animateCenter) ? 1
        : Math.max(0, Math.min(1, (this._introTime - delay) / this.settings.galleryInDuration));
      slot.entrance = entrance;
      slot.intro = calm ? 1 : inEase(entrance);
      // The center card takes over from the hero screen whole; its glass then grows in behind it.
      slot.reveal = calm || this._entryImmediate || Math.abs(logical) > 2 ? 1
        : clamp((this._introTime - this.settings.glassRevealDelay - Math.abs(logical) * this.settings.glassRevealStagger)
          / this.settings.glassRevealDuration, 0, 1);
      slot.u.reveal.value = slot.reveal;
      this.setFit(slot, i, false);
      slot.u.brightness.value = 0.38 + 0.62 * ease(focus);
      slot.u.opacity.value = this.opacity * slot.intro;
      const ready = entrance >= 0.6;
      const frameTarget = ready && settled ? focus : 0;
      slot.frame = calm ? frameTarget : damp(slot.frame, frameTarget, this.settings.frameLerp, delta);
      if (Math.abs(slot.frame - frameTarget) < 0.0005) slot.frame = frameTarget;
      slot.u.frame.value = slot.frame;
      // The label starts as soon as the card becomes the target, so it is
      // already on its way out by the time the slider snaps.
      this.stepLabel(slot, logical === active && entrance >= 1, delta);
    }
  }

  /** Scramble in once a card becomes active, hold briefly, scramble out. */
  stepLabel(card, active, delta) {
    const label = card.label;
    const s = this.settings;
    const go = phase => { label.phase = phase; label.time = 0; };
    if (!active && (label.phase === LABEL.wait || label.phase === LABEL.done)) go(LABEL.idle);
    if (!active && (label.phase === LABEL.in || label.phase === LABEL.hold)) go(LABEL.out);
    if (active && label.phase === LABEL.idle) go(LABEL.wait);
    label.time += delta;
    if (label.phase === LABEL.wait && label.time >= s.galleryLabelDelay) go(LABEL.in);
    else if (label.phase === LABEL.in) {
      label.value = Math.min(1, label.value + delta / Math.max(s.galleryLabelIn, 1e-3));
      if (label.value === 1) go(LABEL.hold);
    } else if (label.phase === LABEL.hold && label.time >= s.galleryLabelHold) go(LABEL.out);
    else if (label.phase === LABEL.out) {
      label.value = Math.max(0, label.value - delta / Math.max(s.galleryLabelOut, 1e-3));
      if (label.value === 0) go(active ? LABEL.done : LABEL.idle);
    }
    this.labels.setProgress(card.member, label.value);
  }

  /** Whether frames from `url` belong on slide `index`; the thumbnail stands in for its film. */
  streams(index, url) {
    const own = this.urls[index];
    return own !== null && url !== null && (url === own || (this.project.media[index].thumbSource && url === this.thumbUrl));
  }

  setFit(slot, index, still) {
    const blur = this.blurSources.get(index)?.texture;
    // Every card shows its media whole. Slides start covered, like the hero
    // screen they take over from, and settle into contain as the glass reveals.
    slot.u.contain.value = still ? 1 : slot.reveal;
    slot.blurMap.value = blur ?? _blurPlaceholder;
    slot.u.tint.value = blur ? 1 : 0;
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
      const still = this.createStill(this.stills.length);
      still.group.visible = false;
      this.stills.push(still);
    }
  }

  createStill(index) {
    const still = { ...this.createCard(SLOTS + index), time: 0, revealed: false };
    this.labels.setText(still.member, `${pad(index + 1)} / ${pad(this.project.details.length)}`);
    return still;
  }

  /** Page stills: pixel boxes relative to the hero frame center. */
  setStills(layouts) {
    layouts.forEach((layout, index) => {
      const still = this.stills[index] ??= this.createStill(index);
      Object.assign(still, layout);
      still.group.visible = still.revealed;
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

  updateStills(delta) {
    const inEase = timingEase(timings.gallery.inEase);
    const calm = this.reducedMotion;
    for (let index = 0; index < this.stills.length; index++) {
      const still = this.stills[index];
      if (!still.revealed) continue;
      still.time += delta;
      const entrance = calm ? 1 : Math.min(1, still.time / this.settings.galleryInDuration);
      const u = still.u;
      const url = this.urls[still.mediaIndex];
      const channel = url && this.detailVideos[index];
      const live = channel && channel.frameUrl === url && channel.texture;
      if (channel?.url === url) channel.hold(!this.nearView(still));
      still.group.visible = true;
      still.map.value = live ? channel.texture : this.textures.get(still.mediaIndex) ?? this.fallback;
      u.aspect.value = this.aspects[still.mediaIndex] ?? 16 / 9;
      this.setFit(still, still.mediaIndex, true);
      u.brightness.value = 1;
      still.entrance = entrance;
      still.intro = calm ? 1 : inEase(entrance);
      still.reveal = calm ? 1
        : clamp((still.time - this.settings.glassRevealDelay) / this.settings.glassRevealDuration, 0, 1);
      u.reveal.value = still.reveal;
      u.opacity.value = this.opacity * still.intro;
      const frameTarget = entrance >= 0.6 ? 1 : 0;
      still.frame = calm ? frameTarget : damp(still.frame, frameTarget, this.settings.frameLerp, delta);
      if (Math.abs(still.frame - frameTarget) < 0.0005) still.frame = frameTarget;
      u.frame.value = still.frame;
      this.stepLabel(still, entrance >= 0.5, delta);
    }
  }

  /** Whether a still is within half a viewport of the screen, as of the last `fit`. */
  nearView(still) {
    const { position, scale } = still.group;
    const top = _point.set(position.x, position.y + scale.y / 2, 0).applyMatrix4(this._clipMatrix).y;
    const bottom = _point.set(position.x, position.y - scale.y / 2, 0).applyMatrix4(this._clipMatrix).y;
    return Math.max(top, bottom) > -2 && Math.min(top, bottom) < 2;
  }

  revealPage(immediate = false, { center = true } = {}) {
    this._animateCenter = center;
    this._entryImmediate = immediate;
    this.entryReady = center || immediate;
    this._introTime = 0;
    this._introComplete = false;
    this._uiAnnounced = false;
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
    this._delta = delta;
    this.time.value = this.age;
    if (this._exitAnimation) {
      const animation = this._exitAnimation;
      animation.elapsed += delta;
      const progress = Math.min(1, animation.elapsed / animation.duration);
      this.opacity = 1 - timingEase(timings.gallery.outEase)(progress);
      if (this.labels.batch) this.labels.batch.opacity = this.opacity;
      for (const slot of this.slots) slot.u.opacity.value = slot.exitOpacity * this.opacity;
      for (const still of this.stills) still.u.opacity.value = (still.exitOpacity ?? 0) * this.opacity;
      if (progress === 1) { this._exitAnimation = null; animation.resolve(); }
      return;
    }
    if (this.departing) return;
    this.syncStyle();
    if (this._entryDelay > 0) this._entryDelay -= delta;
    else if (this.entryReady && !this.entryHeld) this._introTime += delta;
    const introSpan = this.settings.galleryInDuration
      + this.settings.galleryNeighborDelay + 3 * this.settings.galleryNeighborStagger;
    this._introComplete = this._introTime >= introSpan;
    if (!this._uiAnnounced && (this._entryImmediate || this._introTime >= this.settings.galleryUiAt * introSpan)) {
      this._uiAnnounced = true;
      dispatcher.trigger({ name: 'projectGalleryEntered' }, { slug: this.project.slug });
    }
    this.pageProgress = this._entryImmediate || !this._animateCenter ? 1 : Math.min(1, this._introTime / this.settings.galleryInDuration);
    this.motion.update(delta, this.reducedMotion);
    this.index = this.motion.index;
    this.activeMedia = this.project.media[this.index];
    this.screenUrl = this.urls[this.index];
    this.updateSlots(delta);
    this.updateStills(delta);
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
    // The live quad size, not the layout's: mid-flight it still matches the
    // hero screen's crop, so taking over from it never shifts the image.
    const pixel = screen.scale.y / layout.mediaHeight;
    const pitch = screen.scale.x * (1 + layout.gap / layout.mediaWidth);
    const speed = this.reducedMotion ? 0 : this.motion.speed;
    for (const slot of this.slots) {
      this.poseCard(slot, screen.scale.x, screen.scale.y, pixel, slot.relative * pitch, 0, slot.relative, speed, 0);
    }
    if (!this.stills.length) return;
    // Page scroll moves the screen along its own up axis; its speed tilts the stills.
    const along = screen.position.dot(_up.set(0, 1, 0).applyQuaternion(screen.quaternion));
    if (this._scrollAlong !== null && this._delta > 0) {
      const pixelsPerSecond = (along - this._scrollAlong) / pixel / this._delta;
      const max = this.settings.stillTiltMax;
      const target = this.reducedMotion ? 0 : clamp(-pixelsPerSecond * this.settings.stillScrollTilt, -max, max);
      this._stillTilt = damp(this._stillTilt, target, this.settings.stillTiltLerp, this._delta);
    }
    this._scrollAlong = along;
    for (const still of this.stills) {
      if (!still.width) continue;
      this.poseCard(still, still.width * pixel, still.height * pixel, pixel, still.x * pixel, -still.y * pixel, 0, 0, this._stillTilt);
    }
  }

  /**
   * Pose a card group and size its layers. Its outer extent is always the
   * original image box; the image shrinks inside the glass.
   */
  poseCard(card, width, height, pixel, x, y, relative, speed, tiltX) {
    const s = this.settings;
    const u = card.u;
    const intro = card.intro;
    const distance = Math.min(1, Math.abs(relative));
    const reach = clamp(relative, -1.5, 1.5);
    const scale = (1 - distance * s.cardScaleFalloff - Math.min(s.cardSpeedScaleMax, Math.abs(speed) * s.cardSpeedScale))
      * (s.glassInScale + (1 - s.glassInScale) * intro);
    const yaw = reach * s.cardTilt + clamp(speed * s.cardSpeedTilt, -s.cardSpeedTiltMax, s.cardSpeedTiltMax);
    card.yaw = card.yaw === null || this.reducedMotion ? yaw : damp(card.yaw, yaw, s.cardTiltLerp, this._delta);
    const group = card.group;
    group.position.set(x, y - (1 - intro) * s.glassInRise * height, -distance * s.cardDepth * height);
    group.rotation.set(tiltX + (1 - intro) * s.glassInTilt, card.yaw, 0);
    // Local z is in pixels, so the slab and label depth keep their size.
    group.scale.set(width * scale, height * scale, pixel * scale);
    group.updateMatrix();
    const grown = timingEase(timings.gallery.inEase)(card.reveal);
    const depth = s.glassDepth * grown;
    const padding = s.glassPadding * grown;
    u.depth.value = depth;
    u.padding.value = padding;
    card.media.position.z = -depth / 2;

    const bend = clamp(speed * s.cardBend, -s.cardBendMax, s.cardBendMax);
    u.bend.value = bend;
    const slide = card.member < SLOTS;
    u.parallax.value = slide ? clamp(relative, -1, 1) * s.cardParallax : 0;
    // Zoom only as far as the parallax shift needs, so the centered card shows its whole image.
    u.zoom.value = slide ? 1 - 2 * Math.abs(u.parallax.value) : 1;
    u.shine.value = reach * 0.35 + speed * 0.04 + tiltX;
    u.lens.value = s.glassLens;

    const sizeX = width / pixel;
    const sizeY = height / pixel;
    const radius = Math.max(0, Math.min(s.glassRadius, depth / 2) - padding);
    const sx = Math.max(0.05, 1 - 2 * padding / sizeX);
    const sy = Math.max(0.05, 1 - 2 * padding / sizeY);
    u.inset.value.set(sx, sy);
    u.size.value.set(sizeX * sx, sizeY * sy);
    u.cardSize.value.set(sizeX, sizeY);
    u.radius.value = radius;
    u.frameAspect.value = (sizeX * sx) / (sizeY * sy);

    // Centered label floating in front of the card, bowed with its layers.
    _labelPosition.set(bend, 0, depth / 2 + s.cardLabelDepth);
    _labelScale.set(s.cardLabelSize / sizeX, s.cardLabelSize / sizeY, 1);
    _labelLocal.compose(_labelPosition, _identity, _labelScale);
    this.labels.setMatrix(card.member, _labelMatrix.multiplyMatrices(group.matrix, _labelLocal));
  }

  dispose() {
    this._exitAnimation?.resolve?.();
    this._exitAnimation = null;
    this.disposed = true;
    this.releaseDetailVideos();
    this._abort.abort();
    for (const map of this.textures.values()) { map.image.close?.(); map.dispose(); }
    for (const source of this.blurSources.values()) disposeBlur(source);
    // A disposed gallery stays referenced somewhere; drop its buffers regardless.
    this.textures.clear();
    this.blurSources.clear();
    for (const card of [...this.slots, ...this.stills]) {
      for (const mesh of [card.media, ...card.layers]) mesh.material.dispose();
    }
    this.geometry.dispose();
    this.slabGeometry.dispose();
    this.labels.dispose();
    this.removeFromParent();
  }
}
