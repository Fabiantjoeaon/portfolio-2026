import * as THREE from "three/webgpu";

/**
 * High-contrast overcast studio for PMREM. A dark ground vs a bright sky
 * is what makes ice normals read; a few large softboxes add glossy
 * reflections that travel across the cracks instead of one window spec
 * (RoomEnvironment) or a flat milky sheen (an even gray dome).
 */
export function createOvercastEnvironment() {
  const scene = new THREE.Scene();

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(24, 48, 24),
    new THREE.MeshBasicMaterial({
      color: 0x020810,
      side: THREE.BackSide,
    }),
  );
  scene.add(shell);

  const skyGeo = new THREE.SphereGeometry(22, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const pos = skyGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    const elev = Math.max(0, n.y);
    // Dim, even dome: mood comes from darkness, relief from the softboxes
    const gain = 0.18 + elev * elev * 1.1;
    const cloud =
      0.85 +
      0.15 * Math.sin(n.x * 3.4 + n.z * 2.2) * Math.sin(n.y * 2.6 + n.x);
    colors[i * 3] = 0.78 * gain * cloud;
    colors[i * 3 + 1] = 0.84 * gain * cloud;
    colors[i * 3 + 2] = 0.92 * gain * cloud;
  }

  skyGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  scene.add(
    new THREE.Mesh(
      skyGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
      }),
    ),
  );

  const addSoftbox = (x, y, z, w, h, hex, gain) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(hex).multiplyScalar(gain),
      }),
    );
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 1, 0);
    scene.add(mesh);
  };

  // Bright but small: mostly specular contribution, little diffuse wash,
  // so the highlights rake across the bump without lifting the whole floor
  addSoftbox(0, 18, 2, 12, 8, 0x63b9da, 3.4);
  addSoftbox(-11, 13, 8, 6, 4, 0x9cdbed, 4.4);
  addSoftbox(10, 12, 7, 5, 3.5, 0x247fa9, 3.6);
  addSoftbox(3, 11, -10, 7, 3.5, 0x258fb6, 2.8);

  return scene;
}
