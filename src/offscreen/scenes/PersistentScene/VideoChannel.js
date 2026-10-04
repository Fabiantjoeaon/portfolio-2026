import * as THREE from 'three/webgpu';
import dispatcher from '@/shared/dispatcher';

/**
 * Upload a streamed frame, reusing `texture` unless its size or kind changed.
 * @param {import('./FrameImporter').default|null} [importer] - Draws VideoFrames on the GPU once calibrated.
 */
export function writeVideoFrame(texture, image, isFrame, width, height, importer = null) {
  const imported = isFrame && importer?.accepts(image, width, height) === true;
  const kind = imported ? 'imported' : isFrame ? 'frame' : 'bitmap';
  if (texture && texture.userData.kind === kind &&
    texture.userData.width === width && texture.userData.height === height) {
    if (imported && !importer.write(texture, image)) return writeVideoFrame(texture, image, isFrame, width, height);
    const old = texture.image;
    texture.image = image;
    // three throws when an initialised ExternalTexture is flagged for upload.
    if (!imported) texture.needsUpdate = true;
    if (old !== image) old?.close?.();
    return texture;
  }
  const next = imported ? importer.createTexture(width, height) : isFrame ? new THREE.VideoFrameTexture() : new THREE.Texture();
  if (imported && !importer.write(next, image)) {
    next.dispose();
    return writeVideoFrame(texture, image, isFrame, width, height);
  }
  next.image = image;
  next.userData.kind = kind;
  next.userData.width = width;
  next.userData.height = height;
  next.colorSpace = THREE.SRGBColorSpace;
  next.flipY = false;
  next.generateMipmaps = false;
  next.minFilter = THREE.LinearFilter;
  next.magFilter = THREE.LinearFilter;
  next.wrapS = THREE.ClampToEdgeWrapping;
  next.wrapT = THREE.ClampToEdgeWrapping;
  if (!imported) next.needsUpdate = true;
  texture?.image?.close?.();
  texture?.dispose();
  return next;
}

/** A main-thread video stream other than the screen, e.g. a project detail item. */
export default class VideoChannel {
  constructor(name, importer = null) {
    this.name = name;
    this.importer = importer;
    this.url = null;
    this.frameUrl = null;
    this.texture = null;
    this.held = false;
  }

  request(url) {
    if (url === this.url) return;
    this.url = url;
    this.held = false;
    if (!url) this.frameUrl = null;
    dispatcher.trigger({ name: 'projectVideoRequest' }, { channel: this.name, url });
  }

  /** Pauses the stream while its surface is out of view; the last frame stays on the texture. */
  hold(held) {
    if (held === this.held || !this.url) return;
    this.held = held;
    dispatcher.trigger({ name: 'projectVideoHold' }, { channel: this.name, held });
  }

  setFrame({ frame, bitmap, width, height, url }) {
    const image = frame ?? bitmap;
    if (url !== this.url) {
      image.close?.();
      return;
    }
    this.texture = writeVideoFrame(this.texture, image, Boolean(frame), width || 1, height || 1, this.importer);
    this.frameUrl = url;
  }

  dispose() {
    this.texture?.image?.close?.();
    this.texture?.dispose();
    this.texture = null;
  }
}
