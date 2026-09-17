import { FileLoader, ImageBitmapLoader } from "three/webgpu";
import * as THREE from "three/webgpu";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

import dispatcher from "@/shared/dispatcher";

import { RESOURCES } from "./resources/common_resources";
import { store } from "@/offscreen/store";
import { resolvePublicPath } from "@/offscreen/utils/publicPath";
// GLTFCurveExtension is no longer part of the public three-blocks API
// (replaced by the defineAssets pipeline); aliased to the shipped dist file in vite.config.js
import { GLTFCurveExtension } from "three-blocks-internal/gltf-curve-extension";

let textureLoader;
const isOffscreen = typeof window === "undefined";

if (isOffscreen) {
  textureLoader = new ImageBitmapLoader();
  textureLoader.setOptions({ imageOrientation: "flipY" });
} else {
  textureLoader = new THREE.TextureLoader();
}

function convertBitmapToTexture(bitmap) {
  const texture = new THREE.Texture(bitmap);
  texture.needsUpdate = true;
  texture.flipY = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Configure and create Draco decoder.
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(resolvePublicPath("draco/"));
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
gltfLoader.register((parser) => new GLTFCurveExtension(parser));

const ktxLoader = new KTX2Loader().setTranscoderPath(
  resolvePublicPath("basis/")
);
// Define a mapping from file extensions to Three.js loaders
const loadersMap = {
  ".png": textureLoader, // 'png' extension will use TextureLoader internally
  ".jpg": textureLoader,
  ".jpeg": textureLoader,
  ".webp": textureLoader,
  ".glb": gltfLoader,
  ".gltf": gltfLoader,
  ".hdr": HDRLoader,
  ".exr": EXRLoader,
  ".bin": FileLoader,
  ".ktx2": KTX2Loader,
  // ... add other mappings as needed
};
const DESKTOP_ONLY_FILE = "_desktop";
const MOBILE_ONLY_FILE = "_mobile";

class Loader {
  constructor() {}

  initResources() {
    const { isIOS, isSafari, isMobileOrTablet } = store;
    const ios = isIOS;
    // define here the assets that are desktop only (add android check if needed)
    this.deviceSpecificResources = !ios ? DESKTOP_ONLY_FILE : MOBILE_ONLY_FILE;
    this.doNotSupportOpusFiles = ios || isSafari;
    this.shouldLoadFontFile = !isMobileOrTablet;

    // console.log(
    //   'Loading resources with extension for device:',
    //   this.deviceSpecificResources
    // );

    this.resources = {};
    this.totalImagesForCubeTexture = 6;
    this.defaultFileSize = 1024; // 128KB in bytes
    this.totalBytes = 0;
    this.loadedBytes = 0;
    this.currentProgress = 0;

    for (const res of RESOURCES) {
      const formattedResource = this.formatResourcesForLoader(res);
      if (formattedResource) {
        this.resources[res.name] = formattedResource;
        this.totalBytes += this.resources[res.name].total;
      }
    }
  }

  formatResourcesForLoader(res) {
    const resFiltered = this.filterDeviceSpecificResources(
      this.filterAudioResources(res)
    );

    if (!resFiltered || (!this.shouldLoadFontFile && resFiltered.isFont)) {
      return null;
    }

    return {
      name: resFiltered.name,
      url: resFiltered.url,
      asset: null,
      loaded: 0,
      total: resFiltered.fileSize,
      isCubeTexture: Array.isArray(resFiltered.url),
      cubeTextureProgress: Array.isArray(resFiltered.url)
        ? Array(this.totalImagesForCubeTexture).fill(0)
        : null,
      // Initialize an empty promise object, resolve and reject will be assigned later
      loading: { promise: null, resolve: null, reject: null },
    };
  }

  filterDeviceSpecificResources(res) {
    if (!res) {
      return false;
    }

    const resName = res.name;
    const isDesktopOnlyFile = resName.endsWith(DESKTOP_ONLY_FILE);
    const isMobileOnlyFile = resName.endsWith(MOBILE_ONLY_FILE);

    if (resName.includes(this.deviceSpecificResources)) {
      res.name = resName.replace(this.deviceSpecificResources, "");
      return res;
    } else if (isDesktopOnlyFile || isMobileOnlyFile) {
      return false;
    }

    return res;
  }

  filterAudioResources(res) {
    const isMp3 = res.url.includes(".mp3");
    const isOpus = res.url.includes(".opus");

    if (!isMp3 && !isOpus) {
      return res;
    }

    if (
      (isOpus && this.doNotSupportOpusFiles) ||
      (isMp3 && !this.doNotSupportOpusFiles)
    ) {
      return false;
    }

    const name = res.name.replace(isOpus ? "_opus" : "_mp3", "");
    if (this.resources[name]) {
      // check if the resource already exists after the name has been modified
      return false;
    }

    res.name = name;
    return res;
  }

  load() {
    this.initResources();

    dispatcher.trigger({ name: "loadStart" });
    const loadPromises = Object.values(this.resources).map((resource) => {
      // Create the loading promise for each resource
      resource.loading.promise = new Promise((resolve, reject) => {
        resource.loading.resolve = resolve;
        resource.loading.reject = reject;
      });

      return this.loadResource(resource);
    });

    return Promise.allSettled(loadPromises).then((results) => {
      this.finish(results);
    });
  }

  loadResource(res) {
    return new Promise(async (resolve, reject) => {
      if (Array.isArray(res.url)) {
        const imagePromises = res.url.map((url, index) => {
          return this.fetchImage(url, res.name, index);
        });

        Promise.all(imagePromises)
          .then((images) => {
            // Convert ImageBitmaps to textures if in offscreen context
            const processedImages = isOffscreen
              ? images.map((img) => convertBitmapToTexture(img))
              : images;

            const convertedAsset = new THREE.CubeTexture(processedImages);
            convertedAsset.needsUpdate = true;
            this.resources[res.name].asset = convertedAsset;
            this.resources[res.name].loading.resolve(convertedAsset);
            resolve(convertedAsset);
          })
          .catch(reject);

        return;
      }

      const extension = res.url.substring(res.url.lastIndexOf("."));
      let loader = loadersMap[extension] || FileLoader;

      if (extension === ".json") {
        loader = new FileLoader();
        loader.setResponseType("json");
      }

      if (typeof loader === "function") {
        loader = new loader();
      }

      // Handle texture loading differently in offscreen context
      const isTextureFile = [".png", ".jpg", ".jpeg", ".webp"].includes(
        extension
      );

      if (isOffscreen && isTextureFile) {
        loader.load(
          res.url,
          (bitmap) => {
            const texture = convertBitmapToTexture(bitmap);
            this.resources[res.name].asset = texture;
            this.resources[res.name].loading.resolve(texture);
            resolve(texture);
          },
          (progressEvent) => {
            this.onProgress(res.name, progressEvent);
          },
          reject
        );
        return;
      }

      if (extension === ".glb") {
        const { gl } = store;

        ktxLoader.detectSupportAsync(gl).then(() => {
          gltfLoader.setKTX2Loader(ktxLoader);

          loader.load(
            res.url,
            (asset) => {
              const convertedAsset = asset;

              const resource = this.resources[res.name];
              resource.asset = convertedAsset;
              resource.loading.resolve(convertedAsset);
              resource.loaded = resource.total;
              this.updateOverallProgress();

              resolve(convertedAsset); // Resolve the promise here
            },
            (progressEvent) => {
              this.onProgress(res.name, progressEvent);
            },
            (error) => {
              console.error("Error loading asset:", error);
              reject(error); // Reject the promise here
            }
          );
        });

        return;
      }

      if (extension === ".bin") {
        loader.setResponseType("arraybuffer");
      }

      if (extension === ".ktx2") {
        const { gl } = store;
        loader = ktxLoader;
        await loader.detectSupportAsync(gl);
      }

      loader.load(
        res.url,
        (asset) => {
          const convertedAsset = asset;

          this.resources[res.name].asset = convertedAsset;
          this.resources[res.name].loaded = this.resources[res.name].total;
          this.resources[res.name].loading.resolve(convertedAsset);
          this.updateOverallProgress();

          resolve(convertedAsset); // Resolve the promise here
        },
        (progressEvent) => {
          this.onProgress(res.name, progressEvent);
        },
        (error) => {
          console.error("Error loading asset:", error);
          reject(error); // Reject the promise here
        }
      );
    });
  }

  async fetchImage(url, resourceName, imageIndex) {
    try {
      const response = await fetch(url);
      const contentLength = response.headers.get("Content-Length");
      const totalSize = contentLength
        ? Number.parseInt(contentLength, 10)
        : this.defaultFileSize;

      this.resources[resourceName].cubeTextureProgress[imageIndex] = totalSize;
      this.updateResourceTotal(resourceName);

      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      this.resources[resourceName].loaded +=
        this.resources[resourceName].cubeTextureProgress[imageIndex];
      this.updateOverallProgress();

      return bitmap;
    } catch (error) {
      this.resources[resourceName].reject(error);
      throw error;
    }
  }

  updateResourceTotal(resourceName) {
    const resource = this.resources[resourceName];
    if (resource.isCubeTexture) {
      resource.total = resource.cubeTextureProgress.reduce(
        (acc, val) => acc + val,
        0
      );

      // Adjust the total bytes for all resources
      this.totalBytes = Object.values(this.resources).reduce(
        (acc, res) => acc + res.total,
        0
      );
    }
  }

  onCubeTextureProgress(resourceName, imageIndex, response) {
    const resource = this.resources[resourceName];
    if (resource.isCubeTexture) {
      let fileSize;
      if (response.headers.get("Content-Length")) {
        fileSize = parseInt(response.headers.get("Content-Length"), 10);
      } else {
        // If length is not computable, use a default size
        fileSize = this.defaultFileSize;
      }

      // Update progress for the current image
      resource.cubeTextureProgress[imageIndex] = fileSize;

      // Update total size once
      if (resource.total === 0) {
        resource.total = resource.cubeTextureProgress.reduce(
          (acc, val) => acc + val,
          0
        );
      }

      // Incrementally update loaded size
      resource.loaded += fileSize;

      // Update overall progress
      this.updateOverallProgress();
    }
  }

  onProgress(resourceName, progressEvent) {
    const resource = this.resources[resourceName];

    if (progressEvent.lengthComputable) {
      // When length is computable, use the standard progress calculation
      resource.loaded = progressEvent.loaded;
      resource.total = progressEvent.total;
    } else {
      // Fallback for when length is not computable
      const defaultFileSize = 1024; // 128KB in bytes
      resource.total = defaultFileSize;
      resource.loaded = defaultFileSize;
    }

    this.updateOverallProgress();
  }

  updateOverallProgress() {
    const totalBytes = Object.values(this.resources).reduce(
      (acc, res) => acc + res.total,
      0
    );
    const loadedBytes = Object.values(this.resources).reduce(
      (acc, res) => acc + res.loaded,
      0
    );

    const progress = Math.round(
      totalBytes > 0 ? (loadedBytes / totalBytes) * 100 : 0
    );

    if (this.currentProgress === progress) {
      return;
    }

    this.currentProgress = progress;
    dispatcher.trigger({ name: "loadProgress" }, { progress });
  }

  finish() {
    dispatcher.trigger({ name: "loadEnd", fireAtStart: true }, {});
  }
}

export default new Loader();
