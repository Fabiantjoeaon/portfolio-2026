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
import { component, updateComponentRegistry } from "@/offscreen/dispatcher";
import { scene } from "@/offscreen/main";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { store } from "@/offscreen/store";

export class Demo extends component(THREE.Object3D, {
  raf: {
    renderPriority: 1,
    fps: Number.Infinity,
  },
}) {
  init() {
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

    scene.add(this);
    // ---------- Environment Setup ----------
    this.setupEnvironment();

    // Store material for debug
    this.material = material;
  }

  setupEnvironment() {
    const environment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(store.gl);

    scene.environment = pmremGenerator.fromScene(environment).texture;
    scene.environmentIntensity = 0.5;
    pmremGenerator.dispose();
    scene.background = new THREE.Color(0x121212);
  }

  onDebug({ gui }) {
    this.sph.attachGUI(gui);
    this.material.attachGUI(gui);
  }

  onRaf({ gl, camera, pointer, delta }) {
    this.sph.step(gl);

    this.raycaster.setFromCamera(pointer, camera);
    this.sph.ubos.rayOrigin.value.copy(this.raycaster.ray.origin);
    this.sph.ubos.rayDirection.value
      .copy(this.raycaster.ray.direction)
      .normalize();

    // Animate container mesh
    this.mesh.rotation.x += delta * 0.4;
    this.mesh.rotation.y += delta * 0.4;
  }

  onResize() {}

  dispose() {
    this.sph.dispose();
    super.dispose();
  }
}

// Minimal HMR setup
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    updateComponentRegistry("Demo", newModule);
  });
}
