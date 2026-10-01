import * as THREE from 'three/webgpu';
import dispatcher from '@/shared/dispatcher';

/** Upload a streamed frame, reusing `texture` unless its size or kind changed. */
export function writeVideoFrame(texture, image, isFrame, width, height) {
  if (texture && Boolean(texture.isVideoFrameTexture) === isFrame &&
    texture.userData.width === width && texture.userData.height === height) {
    const old = texture.image;
    texture.image = image;
    texture.needsUpdate = true;
    if (old !== image) old?.close?.();
    return texture;
  }
  const next = isFrame ? new THREE.VideoFrameTexture() : new THREE.Texture();
  next.image = image;
  next.userData.width = width;
  next.userData.height = height;
  next.colorSpace = THREE.SRGBColorSpace;
  next.flipY = false;
  next.generateMipmaps = false;
  next.minFilter = THREE.LinearFilter;
  next.magFilter = THREE.LinearFilter;
  next.wrapS = THREE.ClampToEdgeWrapping;
  next.wrapT = THREE.ClampToEdgeWrapping;
  next.needsUpdate = true;
  texture?.image?.close?.();
  texture?.dispose();
  return next;
}

/** A main-thread video stream other than the screen, e.g. a project detail item. */
export default class VideoChannel {
  constructor(name) {
    this.name = name;
    this.url = null;
    this.frameUrl = null;
    this.texture = null;
  }

  request(url) {
    if (url === this.url) return;
    this.url = url;
    if (!url) this.frameUrl = null;
    dispatcher.trigger({ name: 'projectVideoRequest' }, { channel: this.name, url });
  }

  setFrame({ frame, bitmap, width, height, url }) {
    const image = frame ?? bitmap;
    if (url !== this.url) {
      image.close?.();
      return;
    }
    this.texture = writeVideoFrame(this.texture, image, Boolean(frame), width || 1, height || 1);
    this.frameUrl = url;
  }

  dispose() {
    this.texture?.image?.close?.();
    this.texture?.dispose();
    this.texture = null;
  }
}
