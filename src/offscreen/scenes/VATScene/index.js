import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { WorldPositionTransition } from "../../transitions/WorldPositionTransition.js";
// AnimationBakeMixer is no longer part of the public three-blocks API
// (superseded by Baked Motion / vertex-animation-video); aliased to the shipped dist file in vite.config.js
import { AnimationBakeMixer } from "three-blocks-internal/animation-bake-mixer";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

/**
 * VATScene - A scene showcasing the Vertex Animation Texture (VAT) flower
 * Uses Three.js Blocks AnimationBakeMixer and animationTexturePosition
 */
export default class VATScene extends BaseScene {
  constructor(config = {}) {
    super(config);
    this.name = config.name || "VATScene";
    this.scene = new THREE.Scene();

    this.transition = new WorldPositionTransition();

    this.cameraState = {
      position: new THREE.Vector3(0, 1.5, 3),
      lookAt: new THREE.Vector3(0, 0.5, 0),
      fov: 50,
    };

    // References
    this.mixer = null;
    this.flower = null;
    this._initialized = false;

    // Background color
    this.scene.background = new THREE.Color(0x1a1f2e);

    // Add basic lighting
    this._setupLighting();
  }

  _setupLighting() {
    const directionalLight = new THREE.DirectionalLight(0xffeedd, 2);
    directionalLight.position.set(3, 5, 2);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.5);
    fillLight.position.set(-2, 3, -1);
    this.scene.add(fillLight);

    const ambientLight = new THREE.AmbientLight(0x404060, 0.4);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3d5c3d, 0.3);
    this.scene.add(hemiLight);
  }

  async _loadEXR(url) {
    return new Promise((resolve, reject) => {
      const loader = new EXRLoader();
      loader.load(
        url,
        (tex) => {
          tex.minFilter = THREE.NearestFilter;
          tex.magFilter = THREE.NearestFilter;
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.colorSpace = THREE.NoColorSpace;
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,
        reject
      );
    });
  }

  async _loadJSON(url) {
    const response = await fetch(url);
    return response.json();
  }

  async _loadGLTF(url) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(url, resolve, undefined, reject);
    });
  }

  async _setupFlower() {
    try {
      const basePath = "/assets/scenes/meadow/flowers/GNRoseV4_vat/GNRoseV4";

      // Load all assets in parallel
      const [gltf, vatTexture, remapInfo] = await Promise.all([
        this._loadGLTF(`${basePath}.glb`),
        this._loadEXR(`${basePath}_vat.exr`),
        this._loadJSON(`${basePath}-remap_info.json`),
      ]);

      // Find the mesh geometry
      let geometry = null;
      gltf.scene.traverse((child) => {
        if (child.isMesh && !geometry) {
          geometry = child.geometry;
          console.log(
            `VAT: Found mesh "${child.name}" with ${geometry.attributes.position.count} vertices`
          );
        }
      });

      if (!geometry) {
        throw new Error("No mesh found in GLTF");
      }

      // Parse OpenVAT metadata
      const osRemap = remapInfo["os-remap"];
      const framesCount = osRemap.Frames;
      const vertexCount = vatTexture.image.width;

      console.log(`VAT: ${vertexCount} vertices, ${framesCount} frames`);
      console.log(
        `VAT: Texture ${vatTexture.image.width}x${vatTexture.image.height}`
      );

      // Create AnimationBakeMixer with the loaded texture
      this.mixer = new AnimationBakeMixer(vatTexture, {
        mode: "vertex",
        framesCount: framesCount,
        fps: 30,
        loop: true,
        play: true,
      });

      // Initialize with metadata
      this.mixer.init({
        mode: "vertex",
        framesOut: framesCount,
        vertexCount: vertexCount,
        width: vatTexture.image.width,
        height: vatTexture.image.height,
      });

      // Create material
      const material = new THREE.MeshStandardNodeMaterial({
        color: 0xe85a71,
        roughness: 0.5,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });

      // Register material with mixer - this sets up positionNode using animationTexturePosition
      this.mixer.registerMaterial(material, {
        mode: "vertex",
        geometry: geometry,
      });

      // Create mesh
      this.flower = new THREE.Mesh(geometry, material);
      this.flower.castShadow = true;
      this.flower.receiveShadow = true;

      this.scene.add(this.flower);

      // Start playback
      this.mixer.play();

      console.log(`VAT: Flower added to scene, animation playing`);
    } catch (error) {
      console.error("Failed to load VAT flower:", error);
    }
  }

  async _lazyInit() {
    if (this._initialized) return;
    this._initialized = true;

    await this._setupFlower();
  }

  update(time, delta) {
    if (!this._initialized) {
      this._lazyInit();
    }

    // Update VAT animation mixer
    if (this.mixer) {
      this.mixer.update(delta);
    }
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stop();
      this.mixer = null;
    }

    if (this.flower) {
      this.flower.geometry.dispose();
      this.flower.material.dispose();
      this.scene.remove(this.flower);
      this.flower = null;
    }

    this._initialized = false;
  }
}
