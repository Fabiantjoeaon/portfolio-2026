import * as THREE from "three/webgpu";
import {
  transformNormalToView,
  transformNormal,
  positionLocal,
  normalLocal,
  color,
  materialColor,
  instanceIndex,
} from "three/tsl";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SPH } from "three-blocks/sph";
import { GridPristine } from "three-blocks/grid-pristine";
import { MeshTransmissionNodeMaterial } from "three-blocks/transmission";
import { store } from "@/offscreen/store";

/**
 * Demo - SPH fluid simulation with transmission material container
 * Simplified version for use within a scene (no component wrapper)
 */
export class Demo extends THREE.Object3D {
  constructor({ scene }) {
    super();

    this.targetScene = scene;

    // ---------- Container Mesh with Transmission Material ----------
    const geometry = new RoundedBoxGeometry(10, 10, 10);
    const material = new MeshTransmissionNodeMaterial({
      ditherStrength: 0,
    });
    material.name = "MeshTransmission";
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 0;
    this.add(this.mesh);

    this.raycaster = new THREE.Raycaster();

    // ---------- SPH Setup ----------
    const size = 20;
    const count = 4096 * 1;
    const simulationScale = 2;

    this.sph = new SPH({
      count,
      is3D: true,
      domainDimensions: new THREE.Vector3(size, size, size),
      mass: 1.0,
      h: 1.0,
      viscosityMu: 0.8,
      restDensity: 1.0,
      scaleKernelWithDomain: false,
      useDirection: true,
      useSpatialGrid: true,
    });

    this.sph.ubos.timeScale.value = 1.35;
    this.sph.setDomainFromObject(this.mesh, { padding: 0.0, simulationScale });

    // ---------- SPH Particle Instances ----------
    const geometrySPH = new THREE.SphereGeometry(0.2, 8, 4);
    const materialSPH = new THREE.MeshPhysicalNodeMaterial({
      color: 0x888888,
      side: THREE.DoubleSide,
      metalness: 0.5,
      roughness: 0.3,
    });

    materialSPH.positionNode = this.sph.instanceMatrix().mul(positionLocal).xyz;

    materialSPH.normalNode = transformNormalToView(
      transformNormal(normalLocal, this.sph.instanceMatrix())
    )
      .toVarying("v_normalViewGeometry")
      .normalize();

    materialSPH.colorNode = this.sph.buffers.directions
      .element(instanceIndex)
      .xyz.length()
      .smoothstep(4, 14)
      .mix(
        materialColor,
        this.sph.buffers.directions
          .element(instanceIndex)
          .xyz.length()
          .smoothstep(7, 14)
          .mul(1)
          .mix(color(0x0000ff), color(0x0044ff).mul(1.5))
      );

    this.meshSPH = new THREE.InstancedMesh(geometrySPH, materialSPH, count);
    this.meshSPH.frustumCulled = false;
    this.meshSPH.scale.setScalar(0.9);
    this.mesh.add(this.meshSPH);

    // ---------- Lighting ----------
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(-1, 1, 1);
    this.add(light);

    // ---------- Grid ----------
    this.grid = new GridPristine();
    this.grid.position.y = -1.5;
    this.add(this.grid);

    // Add to target scene
    this.targetScene.add(this);

    // Store material for debug
    this.material = material;
  }

  /**
   * Update called from scene's update method
   */
  updateScene(time, delta) {
    const gl = store.gl;
    // store.camera is the Camera instance that extends PerspectiveCamera
    const camera = store.camera;
    const pointer = store.pointer || { x: 0, y: 0 };

    if (!gl || !camera) return;

    // Step SPH simulation
    this.sph.step(gl);

    // Update raycaster for mouse interaction
    this.raycaster.setFromCamera(pointer, camera);
    this.sph.ubos.rayOrigin.value.copy(this.raycaster.ray.origin);
    this.sph.ubos.rayDirection.value
      .copy(this.raycaster.ray.direction)
      .normalize();

    // Animate container mesh
    const deltaSeconds = delta || 0.016;
    this.mesh.rotation.x += deltaSeconds * 0.4;
    this.mesh.rotation.y += deltaSeconds * 0.4;
  }

  dispose() {
    this.sph.dispose();

    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }

    if (this.meshSPH) {
      this.meshSPH.geometry.dispose();
      this.meshSPH.material.dispose();
    }

    if (this.grid) {
      this.grid.geometry?.dispose();
      this.grid.material?.dispose();
    }

    if (this.targetScene) {
      this.targetScene.remove(this);
    }
  }
}
