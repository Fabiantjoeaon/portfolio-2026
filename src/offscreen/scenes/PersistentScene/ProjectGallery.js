import * as THREE from 'three/webgpu';
import { Fn, If, uniform, texture, uv, vec2, vec4, float, floor, mix, smoothstep, fract, min } from 'three/tsl';
import { PAGE_EASE } from '@/offscreen/lib/customEases';
import { resolvePublicPath } from '@/offscreen/utils/publicPath';
import dispatcher from '@/shared/dispatcher';

const wrap = (index, count) => ((index % count) + count) % count;

/** Three reusable image windows; texture indices wrap in both directions. */
export default class ProjectGallery extends THREE.Group {
  constructor(project, videoNode, fallback, videoBrightness) {
    super();
    this.project = project;
    this.videoNode = videoNode;
    this.fallback = fallback;
    this.videoBrightness = videoBrightness;
    this.index = this.target = 0;
    this.progress = 1;
    this.direction = 1;
    this.requested = false;
    this.loaded = false;
    this.visible = false;
    this.age = 0;
    this.opacity = 1;
    this._abort = new AbortController();
    this.textures = new Map();
    this.aspects = new Map();
    this.slots = [-1, 0, 1].map(offset => this.createSlot(offset));
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
      this.bindSlots();
      if (this.requested) this.announce();
    });
  }

  createSlot(offset) {
    const u = { progress: uniform(1), direction: uniform(1), opacity: uniform(1),
      fromAspect: uniform(16 / 9), toAspect: uniform(16 / 9),
      fromVideo: uniform(0), toVideo: uniform(0) };
    const from = texture(this.fallback);
    const to = texture(this.fallback);
    const cover = (st, aspect) => st.sub(0.5).mul(vec2(min(float(16 / 9).div(aspect), 1), min(aspect.div(16 / 9), 1))).add(0.5);
    const material = new THREE.NodeMaterial({ transparent: true });
    material.colorNode = Fn(() => {
      const st = uv();
      const sample = (map, coords, aspect, video) => {
        const fitted = cover(fract(coords), aspect);
        // Both stills and streamed video use unflipped ImageBitmaps.
        const oriented = vec2(fitted.x, float(1).sub(fitted.y));
        return map.sample(oriented).rgb.mul(mix(1, this.videoBrightness, video));
      };
      const color = vec4(0).toVar();
      If(u.progress.lessThanEqual(0), () => {
        color.assign(vec4(sample(from, st, u.fromAspect, u.fromVideo), 1));
      }).ElseIf(u.progress.greaterThanEqual(1), () => {
        color.assign(vec4(sample(to, st, u.toAspect, u.toVideo), 1));
      }).Else(() => {
        // ProjectImage.js: ten vertical bands, 20% directional stagger,
        // horizontal texture motion and incoming scale from 0.8 to 1.
        const axis = u.direction.greaterThan(0).select(st.x, float(1).sub(st.x));
        const band = floor(axis.mul(10)).min(9);
        const p = u.progress.sub(band.div(9).mul(0.2)).div(0.8).clamp(0, 1);
        const scale = mix(0.8, 1, smoothstep(0.5, 1, p));
        const arriving = st.sub(0.5).div(scale).add(0.5).add(vec2(u.direction.mul(float(1).sub(p)), 0));
        const leaving = st.add(vec2(u.direction.mul(p), 0));
        color.assign(vec4(mix(sample(from, leaving, u.fromAspect, u.fromVideo),
          sample(to, arriving, u.toAspect, u.toVideo), smoothstep(0, 1, p)), 1));
      });
      return vec4(color.rgb.mul(offset === 0 ? 1 : 0.38), u.opacity);
    })();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    this.add(mesh);
    return { offset, mesh, u, from, to };
  }

  bindSlots() {
    for (const slot of this.slots) {
      for (const [key, current] of [['from', this.index], ['to', this.target]]) {
        const i = wrap(current + slot.offset, this.project.media.length);
        const video = this.project.media[i].type === 'video';
        slot[key].value = video ? this.videoNode.value : this.textures.get(i) ?? this.fallback;
        slot.u[`${key}Video`].value = video ? 1 : 0;
        slot.u[`${key}Aspect`].value = video ? this.videoAspect ?? 16 / 9 : this.aspects.get(i) ?? 16 / 9;
      }
    }
  }

  activate() {
    this.requested = true;
    if (this.loaded) this.announce();
  }

  announce(busy = false) {
    dispatcher.trigger({ name: 'projectSlideChanged' }, {
      slug: this.project.slug, index: this.index, total: this.project.media.length, busy,
    });
  }

  change({ step, index, immediate = false }) {
    if (!this.requested || !this.loaded || this.departing) return;
    const base = this.pending?.index ?? this.target;
    const target = wrap(index ?? base + step, this.project.media.length);
    const forward = wrap(target - base, this.project.media.length);
    const direction = step ? Math.sign(step) : forward <= this.project.media.length / 2 ? 1 : -1;
    if (this.progress < 1) { this.pending = { index: target, direction, immediate }; return; }
    this.begin(target, direction, immediate);
  }

  begin(target, direction, immediate = false) {
    if (target === this.index) return;
    this.target = target;
    this.direction = direction;
    this.progress = immediate ? 1 : 0;
    this.bindSlots();
    if (immediate) { this.index = target; this.bindSlots(); this.announce(); }
    else this.announce(true);
  }

  update(delta, videoAspect) {
    if (!this.loaded || !this.requested) return;
    this.visible = true;
    this.videoAspect = videoAspect;
    this.age += delta;
    if (this.departing) this.opacity = Math.max(0, this.opacity - delta / 0.75);
    if (this.progress < 1) {
      this.progress = Math.min(1, this.progress + delta / 1.35);
      if (this.progress === 1) {
        this.index = this.target;
        this.announce();
        if (this.pending) {
          const pending = this.pending;
          this.pending = null;
          this.begin(pending.index, pending.direction, pending.immediate);
        }
      }
    }
    this.bindSlots();
    for (const slot of this.slots) {
      slot.u.progress.value = PAGE_EASE(this.progress);
      slot.u.direction.value = this.direction;
      slot.u.opacity.value = this.opacity * (slot.offset === 0 ? 1 : PAGE_EASE(Math.min(1, this.age / 0.9)));
    }
  }

  fit(screen, layout) {
    this.position.copy(screen.position);
    this.quaternion.copy(screen.quaternion);
    // A tiny forward offset keeps the gallery above the original screen on exit.
    this.translateZ(0.01);
    for (const slot of this.slots) {
      slot.mesh.scale.copy(screen.scale);
      slot.mesh.position.x = slot.offset * screen.scale.x * (1 + layout.gap / layout.mediaWidth);
    }
  }

  dispose() {
    this.disposed = true;
    this._abort.abort();
    for (const map of this.textures.values()) { map.image.close?.(); map.dispose(); }
    for (const slot of this.slots) { slot.mesh.geometry.dispose(); slot.mesh.material.dispose(); }
    this.removeFromParent();
  }
}
